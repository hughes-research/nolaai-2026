#!/usr/bin/env python3
"""
tools/score/modelled/analyze.py: numbers and pictures for final.wav and its stems.

    python3 analyze.py [final.wav] [--out analysis] [--stems stems] [--ref ../ref/old.wav] [--no-pics]

It is deliberately independent of build.js: it reads the files from disk and
measures them again with numpy (and draws with ffmpeg), so a mistake in the
builder's own self-checks cannot hide here. Nobody on this team can hear, so
this is how the mix is judged: every target of BRIEF.md section 4.3 is a row.

Writes <out>/numbers.json, <out>/numbers.md and the PNGs (log-frequency
spectrograms of the whole piece and of three windows, a waveform, one
spectrogram per stem).
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
N = 2208000
HARD = [(8.0, 'NO 1'), (17.0, 'NO 2'), (37.0, 'the slab')]
BREATH = (20.3, 22.0)
TRIO = (30.0, 36.0)
BANDS = [('sub <60', 0, 60), ('bass 60-250', 60, 250), ('low-mid 250-500', 250, 500), ('mid 500-2k', 500, 2000),
         ('presence 2-5k', 2000, 5000), ('brilliance 5-8k', 5000, 8000), ('air >8k', 8000, 24001)]


def read_wav(path):
    """PCM 16/24/32 and 32-bit float WAV -> (sr, float64 array [frames, channels], bits)."""
    with open(path, 'rb') as f:
        b = f.read()
    if b[:4] != b'RIFF' or b[8:12] != b'WAVE':
        raise ValueError(path + ': not a WAV file')
    pos, fmt, data = 12, None, None
    while pos + 8 <= len(b):
        cid = b[pos:pos + 4]
        size = int.from_bytes(b[pos + 4:pos + 8], 'little')
        body = b[pos + 8:pos + 8 + size]
        if cid == b'fmt ':
            fmt = body
        elif cid == b'data':
            data = body
        pos += 8 + size + (size & 1)
    tag = int.from_bytes(fmt[0:2], 'little')
    ch = int.from_bytes(fmt[2:4], 'little')
    sr = int.from_bytes(fmt[4:8], 'little')
    bits = int.from_bytes(fmt[14:16], 'little')
    if tag == 0xFFFE:
        tag = int.from_bytes(fmt[24:26], 'little')
    if tag == 3 and bits == 32:
        x = np.frombuffer(data, dtype='<f4').astype(np.float64)
    elif tag == 1 and bits == 16:
        x = np.frombuffer(data, dtype='<i2').astype(np.float64) / 32768.0
    elif tag == 1 and bits == 24:
        raw = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = raw[:, 0] | (raw[:, 1] << 8) | (raw[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float64) / 8388608.0
    elif tag == 1 and bits == 32:
        x = np.frombuffer(data, dtype='<i4').astype(np.float64) / 2147483648.0
    else:
        raise ValueError('%s: unsupported WAV format (tag %d, %d bits)' % (path, tag, bits))
    return sr, x.reshape(-1, ch), bits


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-30))


def db20(x):
    return 20 * np.log10(np.maximum(x, 1e-15))


def freq_filter(x, gain_of_f):
    """Zero-phase filtering in the frequency domain; gain_of_f(f) -> complex or real gain."""
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1.0 / SR)
    g = gain_of_f(f)
    return np.fft.irfft(X * (g[:, None] if x.ndim == 2 else g), n=x.shape[0], axis=0)


def biquad_response(b, a, f):
    z = np.exp(-2j * np.pi * f / SR)
    return (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)


def kweight(x):
    """BS.1770 K-weighting at 48 kHz (the two biquads of the standard), applied as a frequency response."""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    return freq_filter(x, lambda f: biquad_response(b1, a1, f) * biquad_response(b2, a2, f))


def block_powers(k, win, hop):
    p = np.sum(k * k, axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - win + 1, hop)
    return (c[starts + win] - c[starts]) / win


def loudness(x):
    """Integrated loudness (BS.1770-4, gated) and loudness range (EBU Tech 3342)."""
    k = kweight(x)
    z = block_powers(k, int(0.4 * SR), int(0.1 * SR))
    lz = -0.691 + db(z)
    a = z[lz > -70]
    rel = -0.691 + db(np.mean(a)) - 10
    g = a[(-0.691 + db(a)) > rel]
    integrated = float(-0.691 + db(np.mean(g)))
    s = block_powers(k, 3 * SR, int(0.1 * SR))
    ls = -0.691 + db(s)
    a = s[ls > -70]
    rel = -0.691 + db(np.mean(a)) - 20
    g = np.sort(-0.691 + db(a[(-0.691 + db(a)) > rel]))
    lra = float(np.percentile(g, 95) - np.percentile(g, 10)) if len(g) else 0.0
    momentary_max = float(np.max(lz))
    return integrated, lra, momentary_max, ls


def true_peak_db(x):
    """4x oversampled peak by exact band-limited (FFT) interpolation."""
    peak = 0.0
    for c in range(x.shape[1]):
        X = np.fft.rfft(x[:, c])
        n = x.shape[0]
        Y = np.zeros(4 * n // 2 + 1, dtype=complex)
        Y[:len(X)] = X
        y = np.fft.irfft(Y, n=4 * n) * 4
        peak = max(peak, float(np.max(np.abs(y))))
    return float(db20(peak))


def welch(x, nfft=16384):
    """Long-term power spectrum (mean of the channels), Hann windows, half overlap."""
    w = np.hanning(nfft)
    hop = nfft // 2
    acc = np.zeros(nfft // 2 + 1)
    count = 0
    for c in range(x.shape[1]):
        for s in range(0, x.shape[0] - nfft + 1, hop):
            seg = x[s:s + nfft, c] * w
            acc += np.abs(np.fft.rfft(seg)) ** 2
            count += 1
    return np.fft.rfftfreq(nfft, 1.0 / SR), acc / max(1, count)


def band_table(f, p):
    total = np.sum(p)
    return {name: float(db(np.sum(p[(f >= lo) & (f < hi)]) / total)) for name, lo, hi in BANDS}


def slopes(f, p):
    """The tilt from 200 Hz to 8 kHz, two ways.
    density: a straight line through the power spectral DENSITY (dB per Hz) on third-octave centres.
    bands:   a straight line through third-octave BAND levels (3 dB per octave shallower by construction)."""
    centres = 200 * 2 ** (np.arange(0, 17) / 3.0)          # 200 Hz .. 8 kHz
    dens, band = [], []
    for c in centres:
        lo, hi = c * 2 ** (-1 / 6.0), c * 2 ** (1 / 6.0)
        m = (f >= lo) & (f < hi)
        dens.append(db(np.mean(p[m])))
        band.append(db(np.sum(p[m])))
    x = np.log2(centres)
    return float(np.polyfit(x, dens, 1)[0]), float(np.polyfit(x, band, 1)[0]), [float(c) for c in centres], [float(b) for b in band]


def rms_db(x, t0, t1):
    seg = x[int(round(t0 * SR)):int(round(t1 * SR))]
    return float(db(np.mean(seg * seg))) if len(seg) else -300.0


def butter_hp_mag(f, fc, order=4):
    return np.sqrt(1.0 / (1.0 + (fc / np.maximum(f, 1e-9)) ** (2 * order)))


def mono_loss(x):
    mid = 0.5 * (x[:, 0] + x[:, 1])
    return float(db(np.mean(mid * mid)) - db(0.5 * (np.mean(x[:, 0] ** 2) + np.mean(x[:, 1] ** 2))))


def band_mono_loss(x):
    """The same, band by band, so a cancellation in one band cannot hide in the total."""
    nfft, out = 16384, {}
    w = np.hanning(nfft)
    hop = nfft // 2
    pm = np.zeros(nfft // 2 + 1)
    ps = np.zeros(nfft // 2 + 1)
    for s in range(0, x.shape[0] - nfft + 1, hop):
        L = np.fft.rfft(x[s:s + nfft, 0] * w)
        R = np.fft.rfft(x[s:s + nfft, 1] * w)
        pm += np.abs(0.5 * (L + R)) ** 2
        ps += 0.5 * (np.abs(L) ** 2 + np.abs(R) ** 2)
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    for name, lo, hi in BANDS:
        m = (f >= lo) & (f < hi)
        out[name] = float(db(np.sum(pm[m])) - db(np.sum(ps[m])))
    return out


def find_clicks(x):
    """Isolated discontinuities. A click is a sample the three before it do not predict (third
    difference), far above what follows and precedes it within 2 ms. A steep note attack is not a
    click: its high-frequency energy carries on after the first sample, so the ratio stays small."""
    found = []
    for c in range(x.shape[1]):
        v = x[:, c]
        e = np.abs(v[3:] - 3 * v[2:-1] + 3 * v[1:-2] - v[:-3])
        cand = np.where(e > 0.006)[0]
        last = -10000
        for i in cand:
            if i - last < 96:
                continue
            a0, a1 = max(0, i - 96), max(0, i - 6)
            b0, b1 = i + 6, min(len(e), i + 96)
            around = np.sqrt(0.5 * (np.mean(e[a0:a1] ** 2) + np.mean(e[b0:b1] ** 2))) if a1 > a0 and b1 > b0 else 0
            peak = np.max(e[max(0, i - 2):i + 3])
            if peak > 12 * max(around, 1e-9):
                found.append({'t': round((i + 3) / SR, 5), 'channel': c, 'size': round(float(peak), 5), 'ratio': round(float(peak / max(around, 1e-9)), 1)})
                last = i
    return found


def onset(x, t):
    """When the hit at t starts to sound: 2 ms RMS frames every 0.25 ms on the mono sum; the first
    frame, from 40 ms before, that is 20 dB above the level just before the hit or has reached a
    tenth (-20 dB) of the peak of the next 80 ms, whichever comes later. Returns ms relative to t."""
    m = 0.5 * (x[:, 0] + x[:, 1])
    hop, win = 12, 96
    s0 = int(round((t - 0.06) * SR))
    frames = [(s0 + k * hop, np.sqrt(np.mean(m[s0 + k * hop:s0 + k * hop + win] ** 2))) for k in range(int(0.16 * SR / hop))]
    pre = max([v for s, v in frames if s + win <= int(round((t - 0.012) * SR))] + [1e-9])
    peak = max(v for s, v in frames if s >= int(round((t - 0.01) * SR)))
    thr = max(pre * 2.0, peak * 0.1)
    for s, v in frames:
        if s + win <= int(round((t - 0.04) * SR)):
            continue
        if v > thr:
            return round((s + win - t * SR) / SR * 1000, 2), round(float(db20(pre)), 1), round(float(db20(peak)), 1)
    return None, round(float(db20(pre)), 1), round(float(db20(peak)), 1)


def measure(path, stems_dir=None):
    sr, x, bits = read_wav(path)
    out = {'file': path, 'sample_rate': sr, 'channels': x.shape[1], 'bits': bits, 'frames': x.shape[0]}
    integrated, lra, mmax, short = loudness(x)
    out['lufs'] = round(integrated, 2)
    out['lra'] = round(lra, 2)
    out['momentary_max'] = round(mmax, 2)
    out['true_peak_db'] = round(true_peak_db(x), 2)
    out['sample_peak_db'] = round(float(db20(np.max(np.abs(x)))), 2)
    out['rms_db'] = round(float(db(np.mean(x * x))), 2)
    out['crest_db'] = round(out['sample_peak_db'] - out['rms_db'], 2)
    out['clipped_samples'] = int(np.sum(np.abs(x) >= 0.999999))
    out['dc'] = [float(np.mean(x[:, c])) for c in range(x.shape[1])]
    f, p = welch(x)
    out['bands_db'] = {k: round(v, 2) for k, v in band_table(f, p).items()}
    sd, sb, centres, tob = slopes(f, p)
    out['slope_density_db_per_oct'] = round(sd, 2)
    out['slope_third_octave_bands_db_per_oct'] = round(sb, 2)
    out['third_octave_centres'] = [round(c, 1) for c in centres]
    out['third_octave_db'] = [round(b - max(tob), 2) for b in tob]
    out['above_8k_db'] = out['bands_db']['air >8k']
    out['presence_2_5k_db'] = out['bands_db']['presence 2-5k']
    out['below_50_db'] = round(float(db(np.sum(p[f < 50]) / np.sum(p))), 2)
    if x.shape[1] == 2:
        out['correlation'] = round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 3)
        out['mono_loss_db'] = round(mono_loss(x), 2)
        out['mono_loss_by_band_db'] = {k: round(v, 2) for k, v in band_mono_loss(x).items()}
        lo = freq_filter(x, lambda fr: (fr < 150).astype(float))
        out['low_end_correlation_below_150'] = round(float(np.corrcoef(lo[:, 0], lo[:, 1])[0, 1]), 3)
    hp = freq_filter(x, lambda fr: butter_hp_mag(fr, 150, 4))
    out['after_150hz_highpass_db'] = round(float(db(np.mean(hp * hp)) - db(np.mean(x * x))), 2)
    out['breath_rms_db'] = round(rms_db(x, *BREATH), 2)
    out['breath_peak_db'] = round(float(db20(np.max(np.abs(x[int(BREATH[0] * SR):int(BREATH[1] * SR)])))), 2)
    out['breath_zero_samples'] = int(np.sum(x[int(BREATH[0] * SR):int(BREATH[1] * SR)] == 0))
    out['tail_rms_db'] = {'45.0-45.7': round(rms_db(x, 45.0, 45.7), 2), '45.7-45.9': round(rms_db(x, 45.7, 45.9), 2), '45.9-46.0': round(rms_db(x, 45.9, 46.0), 2)}
    out['head_rms_db'] = {'0-0.25': round(rms_db(x, 0, 0.25), 2), '0.25-0.5': round(rms_db(x, 0.25, 0.5), 2)}
    clicks = find_clicks(x)
    out['clicks'] = len(clicks)
    out['click_list'] = clicks[:20]
    out['sync'] = []
    for t, name in HARD:
        ms, pre, peak = onset(x, t)
        out['sync'].append({'t': t, 'what': name, 'onset_ms': ms, 'level_before_db': pre, 'peak_after_db': peak})
    out['short_term_lufs'] = {'min': round(float(np.min(short)), 1), 'max': round(float(np.max(short)), 1)}
    sec = {}
    for a, b, name in [(0, 4, 'dock'), (4, 8, 'idea 1'), (8, 10, 'NO 1 tail'), (10, 12, 'thin'), (12, 17, 'idea 2'), (17, 20, 'NO 2 tail'),
                       (20.3, 22, 'breath'), (22, 24.5, 'idea 3: bass'), (24.5, 26.5, '+1'), (26.5, 28.5, '+2'), (28.5, 30, '+3'),
                       (30, 32, 'winner'), (32, 37, 'title build'), (37, 38, 'slab'), (38, 42, 'tag'), (42, 46, 'ring-out')]:
        sec['%g-%g %s' % (a, b, name)] = round(rms_db(x, a, b), 1)
    out['section_rms_db'] = sec
    if stems_dir and os.path.isdir(stems_dir):
        stems = {}
        for name in ['bass', 'keys', 'drums', 'fx']:
            fp = os.path.join(stems_dir, name + '.wav')
            if not os.path.isfile(fp):
                continue
            _, s, sbits = read_wav(fp)
            fs_, ps_ = welch(s)
            stems[name] = {
                'frames': s.shape[0], 'bits': sbits,
                'rms_trio_db': round(rms_db(s, *TRIO), 2),
                'rms_whole_db': round(float(db(np.mean(s * s))), 2),
                'peak_db': round(float(db20(np.max(np.abs(s)))), 2),
                'energy_above_150hz': round(float(np.sum(ps_[fs_ >= 150]) / np.sum(ps_)), 3),
                'energy_below_50hz': round(float(np.sum(ps_[fs_ < 50]) / np.sum(ps_)), 4),
                'correlation': round(float(np.corrcoef(s[:, 0], s[:, 1])[0, 1]), 3),
                'mono_loss_db': round(mono_loss(s), 2),
                'pan_db_right_minus_left': round(float(db(np.mean(s[:, 1] ** 2)) - db(np.mean(s[:, 0] ** 2))), 2),
                'bands_db': {k: round(v, 2) for k, v in band_table(fs_, ps_).items()},
            }
        if 'bass' in stems:
            for name in stems:
                stems[name]['trio_rel_bass_db'] = round(stems[name]['rms_trio_db'] - stems['bass']['rms_trio_db'], 2)
        out['stems'] = stems
    return out


def pictures(path, out_dir, stems_dir):
    def run(args):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args, check=True)
    spec = 'showspectrumpic=s=1500x700:legend=1:fscale=log:scale=log:color=magma:drange=90:win_func=hann'
    run(['-i', path, '-lavfi', 'aformat=channel_layouts=mono,' + spec, os.path.join(out_dir, 'spectrogram-whole.png')])
    for a, b in [(0, 12), (20, 32), (30, 46)]:
        run(['-ss', str(a), '-t', str(b - a), '-i', path, '-lavfi', 'aformat=channel_layouts=mono,' + spec, os.path.join(out_dir, 'spectrogram-%02d-%02d.png' % (a, b))])
    run(['-i', path, '-lavfi', 'showwavespic=s=1500x400:split_channels=1:colors=0x2a6fdb|0xdb5a2a', os.path.join(out_dir, 'waveform.png')])
    run(['-i', path, '-lavfi', 'aformat=channel_layouts=mono,compand=attacks=0:points=-80/-80|0/0,volume=30dB,showwavespic=s=1500x300:colors=0x2a6fdb', os.path.join(out_dir, 'waveform-x30.png')])
    if stems_dir and os.path.isdir(stems_dir):
        for name in ['bass', 'keys', 'drums', 'fx']:
            fp = os.path.join(stems_dir, name + '.wav')
            if os.path.isfile(fp):
                run(['-i', fp, '-lavfi', 'aformat=channel_layouts=mono,' + spec, os.path.join(out_dir, 'spectrogram-stem-%s.png' % name)])


def row(name, value, target, ok):
    return '| %s | %s | %s | %s |' % (name, value, target, 'ok' if ok else '**MISS**')


def markdown(n, ref=None):
    L = ['# Measurements of `%s`' % os.path.basename(n['file']), '',
         'Measured from the file on disk by `analyze.py` (numpy; independent of the builder).', '',
         '| what | measured | target (BRIEF 4.3) | |', '|---|---|---|---|']
    L.append(row('format', '%d Hz, %d ch, %d-bit, %d frames' % (n['sample_rate'], n['channels'], n['bits'], n['frames']), '48000 Hz, 2 ch, 24-bit, 2208000',
                 n['sample_rate'] == 48000 and n['channels'] == 2 and n['bits'] == 24 and n['frames'] == N))
    L.append(row('integrated loudness', '%.2f LUFS' % n['lufs'], '-16.0 +/- 0.5', abs(n['lufs'] + 16) <= 0.5))
    L.append(row('true peak', '%.2f dBTP' % n['true_peak_db'], '<= -2.0', n['true_peak_db'] <= -1.95))
    L.append(row('loudness range', '%.2f LU' % n['lra'], '5 to 12', 5 <= n['lra'] <= 12))
    L.append(row('tilt 200 Hz-8 kHz (third-octave band levels)', '%.2f dB/oct' % n['slope_third_octave_bands_db_per_oct'], '-4.5 to -6.5', -6.5 <= n['slope_third_octave_bands_db_per_oct'] <= -4.5))
    L.append(row('the same tilt read as spectral density (per Hz)', '%.2f dB/oct' % n['slope_density_db_per_oct'], '(information: 3 dB/oct steeper by construction)', True))
    L.append(row('energy above 8 kHz', '%.1f dB re total' % n['above_8k_db'], '<= -30', n['above_8k_db'] <= -30))
    L.append(row('2-5 kHz band', '%.1f dB re total' % n['presence_2_5k_db'], '<= -14', n['presence_2_5k_db'] <= -14))
    L.append(row('mono fold-down loss', '%.2f dB' % n['mono_loss_db'], '< 1.5 dB lost', n['mono_loss_db'] > -1.5))
    worst = min(n['mono_loss_by_band_db'].items(), key=lambda kv: kv[1])
    L.append(row('worst band in mono', '%s: %.2f dB' % worst, 'nothing cancels (> -3)', worst[1] > -3.01))
    L.append(row('low end centred (correlation below 150 Hz)', '%.3f' % n['low_end_correlation_below_150'], '> 0.9', n['low_end_correlation_below_150'] > 0.9))
    L.append(row('left after a 150 Hz high-pass', '%.2f dB' % n['after_150hz_highpass_db'], '(information)', True))
    L.append(row('energy below 50 Hz', '%.1f dB re total' % n['below_50_db'], 'nothing vital (<= -10)', n['below_50_db'] <= -10))
    L.append(row('clicks (isolated discontinuities)', str(n['clicks']), '0', n['clicks'] == 0))
    L.append(row('DC', 'L %.1e, R %.1e' % tuple(n['dc']), '< 1e-4', max(abs(v) for v in n['dc']) < 1e-4))
    L.append(row('clipped samples', str(n['clipped_samples']), '0', n['clipped_samples'] == 0))
    L.append(row('held breath 20.3-22.0 s', '%.1f dBFS RMS, %d zero samples' % (n['breath_rms_db'], n['breath_zero_samples']), '< -60 dBFS, not digital zero',
                 n['breath_rms_db'] < -60 and n['breath_rms_db'] > -80))
    L.append(row('tail 45.9-46.0 s', '%.1f dBFS RMS' % n['tail_rms_db']['45.9-46.0'], 'inaudible (< -60)', n['tail_rms_db']['45.9-46.0'] < -60))
    L.append(row('first 0.25 s', '%.1f dBFS RMS' % n['head_rms_db']['0-0.25'], 'nothing important (< -50)', n['head_rms_db']['0-0.25'] < -50))
    for s in n['sync']:
        L.append(row('onset of %s (%.3f s)' % (s['what'], s['t']), ('%+.2f ms' % s['onset_ms']) if s['onset_ms'] is not None else 'not found',
                     'within +/- 10 ms', s['onset_ms'] is not None and abs(s['onset_ms']) <= 10))
    if 'stems' in n and 'bass' in n['stems']:
        st = n['stems']
        if 'keys' in st:
            L.append(row('keys in the trio (30-36 s), re bass', '%.1f dB' % st['keys']['trio_rel_bass_db'], '-3 to -10', -10 <= st['keys']['trio_rel_bass_db'] <= -3))
        if 'drums' in st:
            L.append(row('drums in the trio (30-36 s), re bass', '%.1f dB' % st['drums']['trio_rel_bass_db'], '-8 to -16', -16 <= st['drums']['trio_rel_bass_db'] <= -8))
        L.append(row('bass stem energy above 150 Hz', '%.0f %%' % (100 * st['bass']['energy_above_150hz']), '>= 25 %', st['bass']['energy_above_150hz'] >= 0.25))
    L += ['', '## Band energies (dB relative to the total)', '', '| band | ' + os.path.basename(n['file']) + (' | reference |' if ref else ' |'), '|---|---|' + ('---|' if ref else '')]
    for name, _, _ in BANDS:
        L.append('| %s | %.1f |' % (name, n['bands_db'][name]) + (' %.1f |' % ref['bands_db'][name] if ref else ''))
    L += ['', '## Third-octave levels, 200 Hz to 8 kHz (dB relative to the strongest)', '', '| Hz | ' + ' | '.join('%d' % c for c in n['third_octave_centres']) + ' |',
          '|---|' + '---|' * len(n['third_octave_centres']), '| dB | ' + ' | '.join('%.1f' % v for v in n['third_octave_db']) + ' |']
    L += ['', '## Section levels (dBFS RMS)', '', '| section | level |', '|---|---|']
    for k, v in n['section_rms_db'].items():
        L.append('| %s | %.1f |' % (k, v))
    if 'stems' in n:
        L += ['', '## Stems (before the master bus)', '', '| stem | RMS 30-36 s | re bass | whole | peak | above 150 Hz | L/R correlation | mono loss | R minus L |', '|---|---|---|---|---|---|---|---|---|']
        for name, s in n['stems'].items():
            L.append('| %s | %.1f | %s | %.1f | %.1f | %.0f %% | %.2f | %.2f dB | %+.1f dB |' % (name, s['rms_trio_db'], ('%+.1f' % s['trio_rel_bass_db']) if 'trio_rel_bass_db' in s else '', s['rms_whole_db'],
                                                                                      s['peak_db'], 100 * s['energy_above_150hz'], s['correlation'], s['mono_loss_db'], s['pan_db_right_minus_left']))
    if ref:
        L += ['', '## Against the reference `%s`' % os.path.basename(ref['file']), '', '| | this | reference |', '|---|---|---|']
        for key, label in [('lufs', 'LUFS'), ('true_peak_db', 'true peak dBTP'), ('lra', 'LRA'), ('crest_db', 'crest dB'), ('slope_density_db_per_oct', 'tilt dB/oct (density)'),
                           ('above_8k_db', 'above 8 kHz'), ('presence_2_5k_db', '2-5 kHz'), ('mono_loss_db', 'mono loss dB'), ('clicks', 'clicks'), ('breath_rms_db', 'breath dBFS')]:
            L.append('| %s | %s | %s |' % (label, n[key], ref[key]))
    return '\n'.join(L) + '\n'


def main():
    a = sys.argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    path, out_dir, stems_dir, ref, pics = os.path.join(here, 'final.wav'), None, None, None, True
    i = 0
    while i < len(a):
        if a[i] == '--out':
            out_dir = a[i + 1]; i += 2
        elif a[i] == '--stems':
            stems_dir = a[i + 1]; i += 2
        elif a[i] == '--ref':
            ref = a[i + 1]; i += 2
        elif a[i] == '--no-pics':
            pics = False; i += 1
        else:
            path = a[i]; i += 1
    n = measure(path, stems_dir)
    r = measure(ref) if ref else None
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'numbers.json'), 'w') as f:
            json.dump({'final': n, 'reference': r}, f, indent=1)
        with open(os.path.join(out_dir, 'numbers.md'), 'w') as f:
            f.write(markdown(n, r))
        if pics:
            pictures(path, out_dir, stems_dir)
    sys.stdout.write(markdown(n, r))


if __name__ == '__main__':
    main()
