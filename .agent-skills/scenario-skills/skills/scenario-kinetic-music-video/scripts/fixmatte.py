"""Union a hue-based chroma key with the Vision matte for flat colour-cyc clips (keeps floor shadows as background).
usage: python tools/fixmatte.py <clip> ; backs up originals to m_vision/"""
import sys, os, glob, numpy as np, cv2
if len(sys.argv) < 2: sys.exit(__doc__)
clip = sys.argv[1]; WHITE = '--white' in sys.argv; d = f'assets/video/{clip}'; os.makedirs(f'{d}/m_vision', exist_ok=True)
fs = sorted(glob.glob(f'{d}/f_*.jpg'))
im0 = cv2.imread(fs[0]).astype(np.float32) / 255
h, w = im0.shape[:2]
border = np.concatenate([im0[:h//8, :].reshape(-1, 3), im0[:, :w//12].reshape(-1, 3), im0[:, -w//12:].reshape(-1, 3)])
bg = np.median(border, 0); bgc = bg - bg.mean(); bgc /= np.linalg.norm(bgc) + 1e-6
for f in fs:
    im = cv2.imread(f).astype(np.float32) / 255
    c = im - im.mean(2, keepdims=True); n = np.linalg.norm(c, axis=2) + 1e-6
    cos = (c @ bgc) / n; sat = im.max(2) - im.min(2)
    bgness = np.clip((cos - 0.80) / 0.12, 0, 1) * np.clip((sat - 0.10) / 0.12, 0, 1)
    if WHITE: bgness = np.clip((im.min(2) - 0.80) / 0.10, 0, 1) * np.clip((0.12 - sat) / 0.08, 0, 1)
    fg = (1 - bgness)
    fg = cv2.GaussianBlur(fg, (0, 0), 1.2)
    mp = f.replace('/f_', '/m_').replace('.jpg', '.png'); bk = f'{d}/m_vision/' + os.path.basename(mp)
    if not os.path.exists(bk): os.rename(mp, bk)
    v = cv2.imread(bk, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    if v.shape != fg.shape: v = cv2.resize(v, (w, h))
    m = np.maximum(v, fg) if not WHITE else np.where(fg > 0.5, np.maximum(v, fg), np.minimum(v, fg))
    cv2.imwrite(mp, (m * 255).astype(np.uint8))
print(clip, 'bg', np.round(bg * 255).astype(int), len(fs))
