"""Verify A/V sync of a rendered mp4.
1) audio offset: cross-correlate the mp4's decoded audio with the master (expects 0 ms)
2) visual accents vs beats: visual change energy (frame diff) vs kick/snare/downbeat train from audio.json; best lag (expects ~0..+1 frame)
usage: python tools/av_sync_check.py out.mp4 [start_sec_of_mp4_in_song=0]"""
import sys, json, numpy as np, librosa, cv2


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


if len(sys.argv) < 2: sys.exit(__doc__)
mp4 = sys.argv[1]; t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
sr = 8000
a, _ = librosa.load(mp4, sr=sr, mono=True)
MASTER = load_json('engine/data/audio.json')['master']
m, _ = librosa.load(MASTER, sr=sr, mono=True, offset=t0, duration=len(a)/sr)
n = min(len(a), len(m), sr*30); A = a[:n] - a[:n].mean(); M = m[:n] - m[:n].mean()
lags = range(-400, 401, 4); best = max(lags, key=lambda L: np.dot(A[1000+max(0,L):n-1000+min(0,L)], M[1000-min(0,L):n-1000-max(0,L)]))
# refine
fine = range(best-4, best+5); best = max(fine, key=lambda L: np.dot(A[1000+max(0,L):n-1000+min(0,L)], M[1000-min(0,L):n-1000-max(0,L)]))
print(f"audio offset vs master: {best/sr*1000:+.1f} ms (+ = mp4 audio late)")
cap = cv2.VideoCapture(mp4); fps = cap.get(cv2.CAP_PROP_FPS); prev = None; D = []
while True:
    ok, f = cap.read()
    if not ok: break
    g = cv2.cvtColor(cv2.resize(f, (192, 108)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    D.append(0 if prev is None else np.abs(g - prev).mean() + abs(g.mean() - prev.mean()) * 3); prev = g
D = np.array(D); J = load_json('engine/data/audio.json')
ev = [x - t0 for x in J['kicks'] + J['snares'] + J['downbeats'] if t0 <= x < t0 + len(D)/fps]
tr = np.zeros(len(D))
for e in ev:
    i = int(round(e*fps))
    if 0 <= i < len(D): tr[i] = 1
z = lambda x: (x - x.mean())/(x.std() + 1e-9); vz = z(np.maximum(0, np.diff(D, prepend=D[0]))); tz = z(tr)
L = range(-6, 7); cs = [np.corrcoef(np.roll(vz, -l), tz)[0, 1] for l in L]
b = list(L)[int(np.argmax(cs))]
print(f"visual accents vs audio events: best lag {b:+d} frames ({b/fps*1000:+.0f} ms, + = picture late), corr@0={cs[6]:.3f} corr@best={max(cs):.3f}")
print("per-lag:", " ".join(f"{l:+d}:{c:.2f}" for l, c in zip(L, cs)))
