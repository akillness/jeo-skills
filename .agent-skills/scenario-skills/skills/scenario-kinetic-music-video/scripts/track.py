"""Per-frame tracking for a prepped clip -> assets/video/<clip>/track.json and meta.track=true.
Each frame: {"pose": [[x,y,vis]*33] | null (MediaPipe, video UV, y down), "box": [x0,y0,x1,y1] matte bbox (UV), "c": [cx,cy] matte centroid, "a": matte area 0..1, "top": [x,y] highest matte point}
usage: python tools/track.py <clip>"""
import sys, os, json, numpy as np, cv2


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


if len(sys.argv) < 2: sys.exit(__doc__)
clip = sys.argv[1]; d = f'assets/video/{clip}'; meta = load_json(f'{d}/meta.json')
import mediapipe as mp

pose = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=1, min_detection_confidence=0.4)
out = []
for i in range(1, meta['n'] + 1):
    im = cv2.imread(f'{d}/f_{i:05d}.jpg'); h, w = im.shape[:2]
    r = pose.process(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
    fr = {'pose': [[round(l.x, 4), round(l.y, 4), round(l.visibility, 2)] for l in r.pose_landmarks.landmark] if r.pose_landmarks else None}
    mp_ = f'{d}/m_{i:05d}.png'
    if os.path.exists(mp_):
        m = cv2.imread(mp_, cv2.IMREAD_GRAYSCALE); m = cv2.resize(m, (w // 4, h // 4)) > 127
        ys, xs = np.nonzero(m)
        if len(xs):
            W4, H4 = m.shape[1], m.shape[0]
            fr['box'] = [round(xs.min() / W4, 4), round(ys.min() / H4, 4), round(xs.max() / W4, 4), round(ys.max() / H4, 4)]
            fr['c'] = [round(xs.mean() / W4, 4), round(ys.mean() / H4, 4)]; fr['a'] = round(len(xs) / m.size, 4)
            k = ys.argmin(); fr['top'] = [round(xs[k] / W4, 4), round(ys[k] / H4, 4)]
    out.append(fr)
save_json(out, f'{d}/track.json')
meta['track'] = True; save_json(meta, f'{d}/meta.json', indent=1)
print(clip, 'tracked', len(out), 'pose frames', sum(1 for f in out if f['pose']))
