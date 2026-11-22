"""Fallback subject matte without Apple Vision: MediaPipe selfie segmentation -> assets/video/<clip>/m_#####.png (white = subject).
usage: python tools/matte_fallback.py <clip> [<clip> ...]   (sets meta.mask=true)"""
import sys, glob, json, numpy as np, cv2
import mediapipe as mp
if len(sys.argv) < 2: sys.exit(__doc__)
seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0)
for clip in sys.argv[1:]:
    d = f'assets/video/{clip}'
    fs = sorted(glob.glob(f'{d}/f_*.jpg'))
    prev = None
    for f in fs:
        im = cv2.imread(f); rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
        m = seg.process(rgb).segmentation_mask.astype(np.float32)
        m = np.clip((m - 0.35) / 0.4, 0, 1)
        m = cv2.GaussianBlur(m, (0, 0), 1.5)
        if prev is not None: m = 0.75 * m + 0.25 * prev
        prev = m
        cv2.imwrite(f.replace('/f_', '/m_').replace('.jpg', '.png'), (m * 255).astype(np.uint8))
    p = f'{d}/meta.json'
    with open(p) as fh: meta = json.load(fh)
    meta['mask'] = True
    with open(p, 'w') as fh: json.dump(meta, fh, indent=1)
    print(clip, len(fs))
