#!/usr/bin/env python3
"""
tools/score/modelled/lab.py: measure single notes and hits, because nobody here can hear.

    python3 lab.py harm  notes.wav --keys 33,38,43,50 --vels 3 [--start 0.5 --step 3.0 --len 1.6]
    python3 lab.py perc  hits.wav  --count 9 [--start 0.5 --step 3.0 --len 1.5]
    python3 lab.py corr  hits.wav  --count 9 [--start 0.5 --step 0.75 --len 0.6]
    python3 lab.py ir    impulse-response.wav

harm: for every note, partial by partial (heterodyne at the measured partial frequency): level,
      early and late decay rate, how far the decay departs from a straight line (beating), the
      inharmonicity, the pitch of the first partials over time (the settle), the centroid over time.
perc: for every hit, third-octave band levels in the first 60 ms and how long each band takes to
      fall 20 dB, the attack time, and how tonal the spectrum is (isolated peaks over the median).
corr: the largest normalised cross-correlation between every pair of hits after alignment.
ir:   decay time by octave band (Schroeder), echo density, and isolated peaks in the tail spectrum.

`lab.js` renders the notes of this candidate's instruments in the same layout.
"""
import sys

import numpy as np

SR = 48000


def read_wav(path):
    from analyze import read_wav as rw
    sr, x, _ = rw(path)
    if sr != SR:
        raise ValueError('expected 48 kHz')
    return x


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-30))


def db20(x):
    return 20 * np.log10(np.maximum(x, 1e-15))


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def smooth(v, n):
    n = max(1, int(n))
    c = np.cumsum(np.concatenate([[0], v]))
    out = (c[n:] - c[:-n]) / n
    pad = len(v) - len(out)
    return np.concatenate([np.full(pad // 2, out[0]), out, np.full(pad - pad // 2, out[-1])])


def partial_freq(seg, guess, width):
    """Refine a partial's frequency: the peak of a zero-padded spectrum near the guess."""
    n = len(seg)
    nfft = 1 << int(np.ceil(np.log2(n * 4)))
    X = np.abs(np.fft.rfft(seg * np.hanning(n), nfft))
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    m = (f > guess - width) & (f < guess + width)
    if not np.any(m):
        return guess, 0.0
    i = np.argmax(X[m]) + np.where(m)[0][0]
    if 0 < i < len(X) - 1:
        a, b, c = np.log(X[i - 1] + 1e-20), np.log(X[i] + 1e-20), np.log(X[i + 1] + 1e-20)
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
    else:
        d = 0
    return (i + d) * SR / nfft, X[i]


def heterodyne(seg, f, f0):
    """The envelope and instantaneous frequency of one partial: shift it to 0 Hz, average over 3 periods of f0, twice."""
    t = np.arange(len(seg)) / SR
    z = seg * np.exp(-2j * np.pi * f * t)
    n = int(3 * SR / f0)
    zr = smooth(smooth(z.real, n), n)
    zi = smooth(smooth(z.imag, n), n)
    amp = 2 * np.sqrt(zr * zr + zi * zi)
    ph = np.unwrap(np.arctan2(zi, zr))
    finst = f + np.gradient(ph) * SR / (2 * np.pi)
    return amp, finst


def centroid(seg):
    X = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1.0 / SR)
    return float(np.sum(f * X) / max(np.sum(X), 1e-30))


def harm(path, keys, nvel, start, step, length, nharm=12):
    x = read_wav(path)
    m = 0.5 * (x[:, 0] + x[:, 1]) if x.shape[1] == 2 else x[:, 0]
    k = 0
    for key in keys:
        for v in range(nvel):
            t0 = start + k * step
            k += 1
            seg = m[int(t0 * SR):int((t0 + length) * SR)]
            if len(seg) < SR // 4:
                continue
            env = smooth(np.abs(seg), 96)
            pk = np.max(env)
            on = int(np.argmax(env > 0.1 * pk))
            a10, a90 = int(np.argmax(env > 0.1 * pk)), int(np.argmax(env > 0.9 * pk))
            seg = seg[max(0, on - 48):]
            f0 = hz(key)
            anal = seg[int(0.03 * SR):int(0.53 * SR)]
            f1, _ = partial_freq(anal, f0, f0 * 0.06)
            print('\nkey %d (%.1f Hz nominal, %.2f measured, %+.1f cents)  velocity step %d  peak %.1f dBFS  attack 10-90%% %.1f ms' %
                  (key, f0, f1, 1200 * np.log2(f1 / f0), v, db20(pk), 1000 * (a90 - a10) / SR))
            cs = [centroid(seg[int(a * SR):int(b * SR)]) for a, b in ((0, 0.02), (0.02, 0.06), (0.1, 0.2), (0.4, 0.6), (0.9, 1.2)) if int(b * SR) <= len(seg)]
            print('  centroid Hz at 0-20, 20-60, 100-200, 400-600, 900-1200 ms: ' + ', '.join('%.0f' % c for c in cs))
            rows, ref = [], None
            for n in range(1, nharm + 1):
                fn, _ = partial_freq(anal, n * f1, f1 * 0.35)
                if fn > 9000:
                    break
                amp, finst = heterodyne(seg, fn, f1)
                a = db20(amp)
                ipk = int(np.argmax(amp[:int(0.3 * SR)]))
                lvl = a[ipk]
                ref = lvl if ref is None else max(ref, lvl)

                def rate(ta, tb):
                    i0, i1 = int(ta * SR), int(tb * SR)
                    if i1 > len(a) - int(0.05 * SR):
                        return float('nan'), float('nan')
                    tt = np.arange(i0, i1) / SR
                    p = np.polyfit(tt, a[i0:i1], 1)
                    return p[0], float(np.std(a[i0:i1] - np.polyval(p, tt)))
                e, _ = rate(0.06, 0.35)
                l, dev = rate(0.35, 1.2)
                cents = [1200 * np.log2(max(1e-9, np.median(finst[int(ta * SR):int(tb * SR)])) / fn) for ta, tb in ((0.015, 0.03), (0.03, 0.06), (0.06, 0.12), (0.2, 0.3), (0.6, 0.9))
                         if int(tb * SR) < len(finst)]
                rows.append((n, fn, 1200 * np.log2(fn / (n * f1)), lvl, 1000 * ipk / SR, e, l, dev, cents))
            print('   n      Hz  cents-off  level dB  peak ms  early dB/s  late dB/s  wobble dB   pitch cents at 15-30, 30-60, 60-120, 200-300, 600-900 ms')
            for n, fn, off, lvl, tp, e, l, dev, cents in rows:
                print('  %2d %7.1f  %+8.1f  %8.1f  %7.0f  %10.1f  %9.1f  %9.2f   %s' % (n, fn, off, lvl - ref, tp, e, l, dev, ' '.join('%+6.1f' % c for c in cents)))


def third_octaves(seg, lo=100, hi=10000):
    X = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1.0 / SR)
    out, c = [], lo
    while c <= hi:
        m = (f >= c * 2 ** (-1 / 6.0)) & (f < c * 2 ** (1 / 6.0))
        out.append((c, float(np.sum(X[m]))))
        c *= 2 ** (1 / 3.0)
    return out


def band_env(seg, lo, hi, win=0.004):
    X = np.fft.rfft(seg)
    f = np.fft.rfftfreq(len(seg), 1.0 / SR)
    X[(f < lo) | (f >= hi)] = 0
    y = np.fft.irfft(X, len(seg))
    return np.sqrt(smooth(y * y, int(win * SR)))


def perc(path, count, start, step, length):
    x = read_wav(path)
    m = 0.5 * (x[:, 0] + x[:, 1]) if x.shape[1] == 2 else x[:, 0]
    for k in range(count):
        t0 = start + k * step
        seg = m[int((t0 - 0.02) * SR):int((t0 + length) * SR)]
        if len(seg) < 4800 or np.max(np.abs(seg)) < 1e-5:
            print('\nhit %d at %.2f s: silent' % (k, t0))
            continue
        env = np.sqrt(smooth(seg * seg, 48))
        pk = np.max(env)
        a10, a90 = int(np.argmax(env > 0.1 * pk)), int(np.argmax(env > 0.9 * pk))
        ipk = int(np.argmax(env))
        below = np.where(env[ipk:] < pk * 0.1)[0]
        t20 = below[0] / SR if len(below) else float('nan')
        below = np.where(env[ipk:] < pk * 0.01)[0]
        t40 = below[0] / SR if len(below) else float('nan')
        early = seg[a10:a10 + int(0.06 * SR)]
        late = seg[a10 + int(0.15 * SR):a10 + int(0.45 * SR)]
        print('\nhit %d at %.2f s: peak %.1f dBFS, attack 10-90%% %.1f ms, -20 dB after %.0f ms, -40 dB after %.0f ms, centroid first 60 ms %.0f Hz, 150-450 ms %.0f Hz' %
              (k, t0, db20(pk), 1000 * (a90 - a10) / SR, 1000 * t20, 1000 * t40, centroid(early), centroid(late) if len(late) > 100 else float('nan')))
        to = third_octaves(early)
        tot = sum(v for _, v in to)
        print('  third-octave levels, first 60 ms (dB re the sum): ' + ' '.join('%d:%.0f' % (c, db(v / tot)) for c, v in to))
        decs = []
        for lo, hi in ((100, 300), (300, 800), (800, 2000), (2000, 4000), (4000, 7000), (7000, 12000)):
            e = band_env(seg, lo, hi)
            i = int(np.argmax(e))
            b = np.where(e[i:] < e[i] * 0.1)[0]
            decs.append('%d-%d: %s' % (lo, hi, ('%.0f ms' % (1000 * b[0] / SR)) if len(b) else '>%d ms' % (1000 * (len(e) - i) / SR)))
        print('  time for each band to fall 20 dB: ' + ', '.join(decs))
        # how tonal: in 300 ms after the attack, the strongest bins over the median, per octave
        body = seg[a10 + int(0.03 * SR):a10 + int(0.03 * SR) + 16384]
        if len(body) == 16384:
            X = np.abs(np.fft.rfft(body * np.hanning(16384))) ** 2
            f = np.fft.rfftfreq(16384, 1.0 / SR)
            parts = []
            for lo, hi in ((300, 600), (600, 1200), (1200, 2400), (2400, 4800), (4800, 9600)):
                mm = (f >= lo) & (f < hi)
                sel = X[mm]
                med = np.median(sel)
                peaks = int(np.sum((sel[1:-1] > sel[:-2]) & (sel[1:-1] > sel[2:]) & (sel[1:-1] > 8 * med)))
                parts.append('%d-%d: max/median %.0f dB, %d peaks >9 dB over median' % (lo, hi, db(np.max(sel) / med), peaks))
            print('  tonality: ' + '; '.join(parts))


def corr(path, count, start, step, length):
    x = read_wav(path)
    m = 0.5 * (x[:, 0] + x[:, 1]) if x.shape[1] == 2 else x[:, 0]
    segs = []
    for k in range(count):
        t0 = start + k * step
        s = m[int((t0 - 0.01) * SR):int((t0 + length) * SR)].copy()
        if np.max(np.abs(s)) < 1e-6:
            continue
        segs.append(s / np.sqrt(np.sum(s * s)))
    worst, identical = 0.0, 0
    n = len(segs[0])
    F = [np.fft.rfft(s, 2 * n) for s in segs]
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            c = np.fft.irfft(F[i] * np.conj(F[j]), 2 * n)
            lag = 240
            best = float(np.max(np.abs(np.concatenate([c[:lag], c[-lag:]]))))
            worst = max(worst, best)
            if np.array_equal(segs[i], segs[j]):
                identical += 1
    print('%s: %d hits, largest correlation between any two after alignment (+/-5 ms) %.4f, bit-identical pairs %d' % (path, len(segs), worst, identical))
    return worst, identical


def ir(path):
    x = read_wav(path)
    for c in range(x.shape[1]):
        h = x[:, c]
        i0 = int(np.argmax(np.abs(h) > 0.001 * np.max(np.abs(h))))
        h = h[i0:]
        print('channel %d: starts at %.1f ms' % (c, 1000 * i0 / SR))
        for lo, hi in ((125, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000)):
            X = np.fft.rfft(h)
            f = np.fft.rfftfreq(len(h), 1.0 / SR)
            X[(f < lo) | (f >= hi)] = 0
            y = np.fft.irfft(X, len(h))
            e = np.cumsum((y * y)[::-1])[::-1]
            e = db(e / e[0])
            i5, i25, i35 = int(np.argmax(e < -5)), int(np.argmax(e < -25)), int(np.argmax(e < -35))
            print('  %5d-%5d Hz: T20 %.2f s, T30 %.2f s, band energy %.1f dB' % (lo, hi, 3 * (i25 - i5) / SR, 2 * (i35 - i5) / SR, db(np.sum(y * y))))
        # echo density: the share of samples outside one standard deviation in 20 ms windows (0.317 is Gaussian)
        prof = []
        for t in (0.01, 0.02, 0.04, 0.08, 0.16, 0.3):
            w = h[int(t * SR):int(t * SR) + 960]
            sd = np.std(w)
            prof.append('%d ms: %.2f' % (1000 * t, np.mean(np.abs(w) > sd) / 0.3173 if sd > 0 else 0))
        print('  echo density (1.00 is fully diffuse): ' + ', '.join(prof))
        # ringing: isolated peaks in the spectrum of the tail from 100 ms on
        tail = h[int(0.1 * SR):int(0.1 * SR) + 32768]
        if len(tail) == 32768:
            X = np.abs(np.fft.rfft(tail * np.hanning(32768))) ** 2
            f = np.fft.rfftfreq(32768, 1.0 / SR)
            for lo, hi in ((150, 400), (400, 1000), (1000, 2500), (2500, 6000)):
                mm = (f >= lo) & (f < hi)
                sel = X[mm]
                print('  tail spectrum %5d-%5d Hz: strongest bin %.1f dB over the mean (a diffuse tail gives 8 to 11)' % (lo, hi, db(np.max(sel) / np.mean(sel))))


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.stderr.write(__doc__)
        sys.exit(2)
    mode, path = a[0], a[1]
    opt = {'start': 0.5, 'step': 3.0, 'len': 1.6, 'count': 9, 'vels': 3, 'keys': '38', 'nharm': 12}
    i = 2
    while i < len(a):
        opt[a[i][2:]] = a[i + 1]
        i += 2
    start, step, length = float(opt['start']), float(opt['step']), float(opt['len'])
    if mode == 'harm':
        harm(path, [int(k) for k in str(opt['keys']).split(',')], int(opt['vels']), start, step, length, int(opt['nharm']))
    elif mode == 'perc':
        perc(path, int(opt['count']), start, step, length)
    elif mode == 'corr':
        corr(path, int(opt['count']), start, step, length)
    elif mode == 'ir':
        ir(path)
    else:
        sys.stderr.write(__doc__)
        sys.exit(2)


if __name__ == '__main__':
    main()
