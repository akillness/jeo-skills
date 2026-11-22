"""Synthesize an original percussion guide track from the extracted beat/kick/snare timings (no song audio).
usage: python tools/synth_beat.py start dur out.wav [--force]   (refuses to replace an existing out.wav without --force)"""
import os, sys, json, numpy as np, soundfile as sf


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


force = '--force' in sys.argv; argv = [a for a in sys.argv[1:] if a != '--force']
if len(argv) < 3: sys.exit(__doc__)
t0, dur, out = float(argv[0]), float(argv[1]), argv[2]
if os.path.exists(out) and not force: sys.exit(f'{out} exists; pass --force to replace it')
A = load_json('engine/data/audio.json'); sr = 44100; n = int(dur*sr); y = np.zeros(n)
def add(sig, t):
    i = int((t - t0)*sr)
    if 0 <= i < n: m = min(len(sig), n-i); y[i:i+m] += sig[:m]
tt = np.arange(int(0.25*sr))/sr
kick = np.sin(2*np.pi*(50 + 90*np.exp(-tt*35))*tt) * np.exp(-tt*14)
rng = np.random.default_rng(0); sn = rng.standard_normal(int(0.18*sr)); ts = np.arange(len(sn))/sr
snare = (sn*0.6 + np.sin(2*np.pi*190*ts)*0.5) * np.exp(-ts*22)
hat = rng.standard_normal(int(0.04*sr)); hat = np.diff(np.concatenate([[0],hat])) * np.exp(-np.arange(len(hat))/sr*120) * 0.25
bl = np.arange(int(0.06*sr))/sr; blip = np.sin(2*np.pi*1760*bl)*np.exp(-bl*60)*0.35
for b in A['beats']: add(hat, b)
for b in A['downbeats']: add(blip, b)
kicks = [k for k in A['kicks'] if t0-0.1 < k < t0+dur]; snares = [s for s in A['snares'] if t0-0.1 < s < t0+dur]
# keep only strong, beat-aligned hits (within 60ms of a beat or half-beat) to avoid noise
bs = np.array(A['beats']); half = np.sort(np.concatenate([bs, (bs[:-1]+bs[1:])/2]))
near = lambda x: np.min(np.abs(half - x)) < 0.06
for k in kicks:
    if near(k): add(kick*0.9, k)
for s in snares:
    if near(s): add(snare*0.5, s)
y = y / (np.abs(y).max() + 1e-9) * 0.9
sf.write(out, y.astype(np.float32), sr, subtype='PCM_16'); print(out, len(kicks), len(snares))
