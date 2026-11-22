"""Verify lip sync of a clip against its reference vocal slice.
Measures mouth openness per frame (MediaPipe FaceMesh inner-lip distance / face height), correlates with the vocal RMS envelope,
searches the best lag in +-400ms. Prints corr at lag 0, best lag, and writes a plot.
usage: python tools/lipsync_check.py clip.mp4 vocal_slice.wav out.png"""
import os, sys, numpy as np, cv2, librosa, mediapipe as mp, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
if len(sys.argv) < 4: sys.exit(__doc__)
vid, wav, png = sys.argv[1:4]
if os.path.abspath(png) in (os.path.abspath(vid), os.path.abspath(wav)): sys.exit('out.png must not be one of the inputs')
cap = cv2.VideoCapture(vid); fps = cap.get(cv2.CAP_PROP_FPS); fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1)
M = []
while True:
    ok, fr = cap.read()
    if not ok: break
    r = fm.process(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
    if r.multi_face_landmarks:
        L = r.multi_face_landmarks[0].landmark; op = abs(L[13].y - L[14].y); fh = abs(L[10].y - L[152].y) + 1e-6; M.append(op / fh)
    else: M.append(np.nan)
M = np.array(M); t = np.arange(len(M)) / fps
y, sr = librosa.load(wav, sr=16000); hop = int(sr / fps)
env = librosa.feature.rms(y=y, frame_length=hop*2, hop_length=hop)[0][:len(M)]
env = np.pad(env, (0, max(0, len(M)-len(env))))
m = np.nan_to_num(M, nan=np.nanmean(M)); z = lambda x: (x - x.mean()) / (x.std() + 1e-9)
mz, ez = z(m), z(env)
lags = range(-int(0.4*fps), int(0.4*fps)+1); cs = [np.corrcoef(np.roll(mz, -L), ez)[0,1] for L in lags]
best = list(lags)[int(np.argmax(cs))]
print(f"frames={len(M)} fps={fps:.2f} face_found={np.mean(~np.isnan(M)):.2f} corr@0={cs[len(cs)//2]:.3f} best_lag={best/fps*1000:+.0f}ms corr@best={max(cs):.3f}")
fig, ax = plt.subplots(2,1, figsize=(14,5)); ax[0].plot(t, mz, label='mouth'); ax[0].plot(t, ez, label='vocal rms', alpha=.7); ax[0].legend(); ax[1].plot([l/fps*1000 for l in lags], cs); ax[1].set_xlabel('lag ms (+ = mouth late)'); plt.tight_layout(); plt.savefig(png, dpi=70)
