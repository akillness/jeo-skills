"""Beat-warp a dance clip: time-remap so its motion accents land on the song's kicks/snares.
usage: python tools/beatwarp.py clipname slot_start   (clip already prepped in assets/video/<clip>)
Adds meta.warp = [[song_local_t, clip_t], ...] (monotonic, slope clamped 0.75..1.33)."""
import sys, json, numpy as np


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


from PIL import Image
if len(sys.argv) < 3: sys.exit(__doc__)
clip, slot = sys.argv[1], float(sys.argv[2]); d = f'assets/video/{clip}'; M = load_json(f'{d}/meta.json')
fps, n = M['fps'], M['n']; prev = None; D = []
for i in range(1, n+1):
    g = np.asarray(Image.open(f'{d}/f_{i:05d}.jpg').convert('L').resize((160, 90)), dtype=np.float32)
    D.append(0 if prev is None else np.abs(g-prev).mean()); prev = g
D = np.array(D); acc = np.maximum(0, np.diff(D, prepend=D[0])); acc = np.convolve(acc, [0.25, 0.5, 0.25], 'same')
from scipy.signal import find_peaks

pk, _ = find_peaks(acc, distance=int(0.25*fps), prominence=np.percentile(acc, 75))
peaks = pk / fps
A = load_json('engine/data/audio.json')
ev = np.array(sorted(set([round(x-slot, 3) for x in A['kicks'] + A['snares'] + A['beats'] if slot <= x < slot + n/fps])))
pairs = []
for p in peaks:
    j = np.argmin(np.abs(ev - p))
    if abs(ev[j]-p) < 0.16: pairs.append((ev[j], p))
pairs = sorted(set(pairs)); anchors = [(0.0, 0.0)]
for s, c in pairs:
    ls, lc = anchors[-1]
    if s - ls < 0.2: continue
    slope = (c-lc)/(s-ls)
    if 0.75 <= slope <= 1.33: anchors.append((s, c))
end = n/fps; ls, lc = anchors[-1]; anchors.append((ls + (end-lc), end))
M['warp'] = [[round(a, 4), round(b, 4)] for a, b in anchors]; save_json(M, f'{d}/meta.json', indent=1)
shift = [round((c - s)*1000) for s, c in anchors[1:-1]]
print(f'{clip}: {len(peaks)} motion peaks, {len(pairs)} matched, {len(anchors)-2} anchors, shifts ms: {shift}')
