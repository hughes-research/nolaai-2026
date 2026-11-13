#!/usr/bin/env python3
"""
tools/score/lib/spectro.py: spectrogram pictures for people who cannot hear.

    python3 spectro.py file.wav out.png t0 t1 [title]

A plain short-time Fourier transform (Hann, 8192 points, 5.9 Hz a bin), frequency on a log
scale from 30 Hz to 16 kHz with a labelled line at every octave of 50 Hz, time with a line at
every bar (2 s) and the three HARD hits marked, level as colour over 90 dB.

Why it exists: ffmpeg's showspectrumpic with a log frequency scale and start/stop (ffmpeg 6.1)
draws the picture mirrored about a line near 520 Hz, so pitch could not be read from the kit's
first pictures. Written by the composer of the "minimal" score, who found the fault. Needs numpy
and Pillow.
"""
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
F_LO, F_HI = 30.0, 16000.0
W, H = 1500, 620            # the plot itself
ML, MT, MR, MB = 64, 26, 14, 30
HARD = [8.0, 17.0, 37.0]


def read_wav(path):
    with open(path, 'rb') as fh:
        b = fh.read()
    assert b[:4] == b'RIFF' and b[8:12] == b'WAVE', path + ' is not a WAV file'
    p, fmt, data = 12, None, None
    while p + 8 <= len(b):
        cid, size = b[p:p + 4], struct.unpack('<I', b[p + 4:p + 8])[0]
        if cid == b'fmt ':
            tag, ch, sr, _, _, bits = struct.unpack('<HHIIHH', b[p + 8:p + 24])
            fmt = (tag, ch, sr, bits)
        elif cid == b'data':
            data = b[p + 8:p + 8 + size]
            break
        p += 8 + size + (size & 1)
    tag, ch, sr, bits = fmt
    assert sr == SR, 'expected 48 kHz'
    if bits == 24:
        raw = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        x = (raw[:, 0] | (raw[:, 1] << 8) | (raw[:, 2] << 16))
        x = np.where(x >= 1 << 23, x - (1 << 24), x).astype(np.float64) / (1 << 23)
    elif bits == 16:
        x = np.frombuffer(data, dtype='<i2').astype(np.float64) / 32768
    elif bits == 32 and tag == 3:
        x = np.frombuffer(data, dtype='<f4').astype(np.float64)
    else:
        raise ValueError('unsupported WAV: %r' % (fmt,))
    return x.reshape(-1, ch).mean(axis=1)


def colour(v):
    """v in 0..1 -> RGB: black, deep blue, teal, green, yellow, white."""
    stops = np.array([[0, 0, 0], [20, 20, 90], [20, 110, 130], [60, 170, 80], [240, 220, 60], [255, 255, 255]], dtype=np.float64)
    pos = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.minimum(pos.astype(int), len(stops) - 2)
    f = (pos - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


def picture(wav, out, t0, t1, title, floor=-100.0, top=-10.0):
    x = read_wav(wav)
    nfft = 8192
    win = np.hanning(nfft)
    centres = t0 + (np.arange(W) + 0.5) * (t1 - t0) / W
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    rows_f = F_LO * (F_HI / F_LO) ** (np.arange(H + 1) / H)          # row edges, low to high
    img = np.zeros((H, W), dtype=np.float64)
    pad = np.concatenate([np.zeros(nfft), x, np.zeros(nfft)])
    for c, tc in enumerate(centres):
        s = int(round(tc * SR)) + nfft - nfft // 2
        seg = pad[s:s + nfft] * win
        mag = np.abs(np.fft.rfft(seg)) / (win.sum() / 2)              # a full-scale sine reads 0 dB
        db = 20 * np.log10(mag + 1e-12)
        # each row takes the loudest bin inside it; rows narrower than a bin interpolate
        lo = np.searchsorted(freqs, rows_f[:-1]); hi = np.searchsorted(freqs, rows_f[1:])
        col = np.interp(np.sqrt(rows_f[:-1] * rows_f[1:]), freqs, db)
        wide = hi > lo
        if wide.any():
            mx = np.maximum.reduceat(db, np.minimum(lo[wide], len(db) - 1))
            # reduceat runs to the next start: recompute exactly for the wide rows
            idx = np.where(wide)[0]
            for k, r in enumerate(idx):
                mx[k] = db[lo[r]:hi[r]].max()
            col[wide] = mx
        img[:, c] = col
    v = (img - floor) / (top - floor)
    rgb = colour(v)[::-1]                                             # high frequencies at the top
    canvas = Image.new('RGB', (ML + W + MR, MT + H + MB), (18, 18, 18))
    canvas.paste(Image.fromarray(rgb, 'RGB'), (ML, MT))
    d = ImageDraw.Draw(canvas)
    y_of = lambda f: MT + H - H * np.log(f / F_LO) / np.log(F_HI / F_LO)
    x_of = lambda t: ML + W * (t - t0) / (t1 - t0)
    for f in [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800]:
        y = int(round(y_of(f)))
        d.line([(ML - 4, y), (ML, y)], fill=(230, 230, 230))
        for xx in range(ML, ML + W, 12):
            d.point((xx, y), fill=(120, 120, 120))
        d.text((6, y - 6), ('%d Hz' % f) if f < 1000 else ('%.1fk' % (f / 1000)), fill=(230, 230, 230))
    t = np.ceil(t0 / 2) * 2
    while t <= t1 + 1e-9:
        xx = int(round(x_of(t)))
        for yy in range(MT, MT + H, 6):
            d.point((xx, yy), fill=(110, 110, 110))
        d.text((xx - 8, MT + H + 4), '%g' % t, fill=(230, 230, 230))
        t += 2
    if t1 - t0 <= 16:                                                 # beats, as ticks along the bottom
        t = np.ceil(t0 * 2) / 2
        while t <= t1 + 1e-9:
            xx = int(round(x_of(t)))
            d.line([(xx, MT + H), (xx, MT + H + 3)], fill=(200, 200, 200))
            t += 0.5
    for t in HARD:
        if t0 <= t <= t1:
            xx = int(round(x_of(t)))
            d.line([(xx, MT - 8), (xx, MT - 1)], fill=(255, 90, 60), width=2)
    d.text((ML, 6), '%s   %g to %g s   bars every 2 s, red ticks = HARD hits, colour %g to %g dBFS (a full-scale sine = 0)' % (title, t0, t1, floor, top), fill=(240, 240, 240))
    canvas.save(out)


def main():
    if len(sys.argv) < 5:
        sys.stderr.write('usage: python3 spectro.py file.wav out.png t0 t1 [title]\n')
        sys.exit(2)
    picture(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5] if len(sys.argv) > 5 else os.path.basename(sys.argv[1]))


if __name__ == '__main__':
    main()
