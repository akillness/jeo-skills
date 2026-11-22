"""Measure a track's tempo, downbeats and drops, so the film's beat grid lands every cut on the music.

usage: beat_grid.py <music file> [--bpm 172] [--start S] [--window S]

Prints JSON: bpm, offset (seconds of the first strong downbeat, where the film can start), the first
16 downbeats, drop candidates (in film beats from that offset, with how much louder the music gets),
grid_strength (how clearly the track keeps time, 0 to 1), duration and film_beats_available.
Give --bpm the tempo the music was generated at: without it the fit can lock to half the tempo.
"""

import argparse
import json
import subprocess
import sys

import numpy as np

SR, HOP, NF = 22050, 128, 2048
FR = SR / HOP  # onset frames per second
MIN_SECONDS = 3.0


def decode(path):
    """Mono float32 samples at SR, or None when ffmpeg cannot read the file."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
            capture_output=True,
        )
    except FileNotFoundError:
        sys.exit("ffmpeg was not found: install ffmpeg")
    if result.returncode != 0 or not result.stdout:
        return None
    return np.frombuffer(result.stdout, np.float32)


def onset_envelopes(x):
    """Spectral flux of the whole mix, flux of the kick band (under 150 Hz), and RMS, per onset frame."""
    win = np.hanning(NF).astype(np.float32)
    nfr = 1 + (len(x) - NF) // HOP
    frames = np.stack([x[i * HOP : i * HOP + NF] * win for i in range(nfr)])
    spec = np.abs(np.fft.rfft(frames, axis=1))
    log = np.log1p(10 * spec)
    flux = np.concatenate([[0], np.maximum(0, np.diff(log, axis=0)).sum(1)])
    kick_bins = int(150 / (SR / NF))
    low = np.concatenate([[0], np.maximum(0, np.diff(log[:, :kick_bins], axis=0)).sum(1)])
    rms = np.sqrt((spec**2).mean(1))
    return flux, low, rms


def above_trend(v):
    """v minus its one-second moving average, floored at 0: onsets stand out from the loudness."""
    n = int(FR)
    v = v - np.convolve(v, np.ones(n) / n, "same")
    return np.maximum(v, 0)


def estimate_tempo(e, k0, hint):
    """Beat period in onset frames: autocorrelation over 60-200 BPM, softly preferring the hinted tempo."""
    ac = np.correlate(e[k0:], e[k0:], "full")[len(e) - k0 - 1 :]
    lags = np.arange(len(ac))
    bpms = 60 * FR / np.maximum(lags, 1)
    ok = (bpms >= 60) & (bpms <= 200)
    prior = np.exp(-0.5 * (np.log2(bpms / (hint or 120)) / (0.25 if hint else 0.9)) ** 2)
    score = np.where(ok, ac * prior, 0)
    lag = int(np.argmax(score))
    if not 1 <= lag < len(ac) - 1:
        return lag
    y0, y1, y2 = score[lag - 1], score[lag], score[lag + 1]
    return lag + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-9)  # parabolic refinement


def comb(e, k0, period, phases):
    """Mean onset energy at every beat of a grid, for each phase."""
    n = int((len(e) - k0) / period) - 1
    pos = k0 + phases[:, None] + period * np.arange(n)[None, :]
    i = np.clip(pos.astype(int), 0, len(e) - 2)
    frac = pos - i
    return (e[i] * (1 - frac) + e[i + 1] * frac).mean(1)


def fit_grid(e, k0, period, hint):
    """Tempo and phase fitted together: within 8% of the hint, or 1.5% of the estimate without one."""
    rough_bpm = 60 * FR / period
    lo, hi = (hint * 0.92, hint * 1.08) if hint else (rough_bpm * 0.985, rough_bpm * 1.015)
    best, best_period, best_phase = -1, period, 0
    for b in np.arange(lo, hi, 0.01):
        p = 60 * FR / b
        phases = np.linspace(0, p, 96, endpoint=False)
        scores = comb(e, k0, p, phases)
        j = int(np.argmax(scores))
        if scores[j] > best:
            best, best_period, best_phase = scores[j], p, phases[j]
    return best_period, best_phase


def drop_rises(rms, down, bpm):
    """(downbeat, rise) pairs: how much louder the bar after each downbeat is than the bar before.

    A wider look-ahead scored the downbeat a bar early as high as the drop itself.
    """
    bar_s = 4 * 60 / bpm
    end_s = len(rms) / FR

    def level(a, b):
        return float(rms[int(a * FR) : int(b * FR)].mean())

    return [(t, level(t, t + bar_s) / (level(t - bar_s, t) + 1e-9)) for t in down if bar_s < t <= end_s - bar_s]


def analyze(x, hint=None, start=0.0, window=0.0):
    flux, low, rms = onset_envelopes(x)
    k0 = int(start * FR)
    k1 = int((start + window) * FR) if window else len(flux)
    e = above_trend(flux)[:k1]
    low = low[:k1]
    period = estimate_tempo(e, k0, hint)
    # score the grid on a smoothed mix of all onsets and the kick band, so off-beat accents do not pull it
    g = np.exp(-0.5 * (np.arange(-12, 13) / (0.015 * FR)) ** 2)
    g /= g.sum()
    kick = above_trend(low)
    e = np.convolve(e / (e.max() + 1e-9) + 1.5 * kick / (kick.max() + 1e-9), g, "same")
    period, phase = fit_grid(e, k0, period, hint)
    bpm = 60 * FR / period
    n = int((len(e) - k0) / period) - 1
    beats = k0 + phase + period * np.arange(n)
    # the downbeat is the beat of the bar with the most kick
    bar = [kick[beats[i::4].astype(int)].sum() for i in range(4)]
    down = beats[int(np.argmax(bar)) :: 4] / FR
    if not len(down):
        return None
    strength = min(1, float(e[beats.astype(int)].mean() / (e.mean() + 1e-9) / 4))
    drops = sorted(drop_rises(rms, down, bpm), key=lambda q: -q[1])[:3]
    offset = float(down[0])
    return {
        "bpm": round(bpm, 2),
        "offset": round(offset, 3),
        "downbeats": [round(float(t), 3) for t in down[:16]],
        "drops": [
            {
                "music_s": round(float(t), 2),
                "film_beat": round((t - offset) * bpm / 60, 1),
                "rise": round(float(r), 2),
            }
            for t, r in sorted(drops)
        ],
        "grid_strength": round(strength, 2),
        "duration": round(len(x) / SR, 2),
        "film_beats_available": int((len(x) / SR - offset) * bpm / 60),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("music")
    ap.add_argument("--bpm", type=float, help="expected tempo (from the music prompt)")
    ap.add_argument("--start", type=float, default=0, help="fit from this second (skip silence or an unused intro)")
    ap.add_argument(
        "--window",
        type=float,
        default=0,
        help="fit only this many seconds from --start: the stretch the film plays over (generated music can drift)",
    )
    a = ap.parse_args(argv)
    x = decode(a.music)
    if x is None:
        sys.exit(f"could not decode {a.music}: is it an audio file ffmpeg can read?")
    span = (a.window or len(x) / SR - a.start) if a.start < len(x) / SR else 0
    if len(x) / SR < MIN_SECONDS or span < MIN_SECONDS:
        sys.exit(f"{a.music} is too short to fit a beat grid: give it at least {MIN_SECONDS:.0f} s to fit over")
    result = analyze(x, a.bpm, a.start, a.window)
    if result is None:
        sys.exit(f"no downbeat found in {a.music}: try --bpm, or a longer --window")
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
