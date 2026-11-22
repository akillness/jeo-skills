# Contact strips: pick frames of one filmed cast, crop round the caster and targets, lay them out in a grid.
# usage: python3 strips.py <frames dir> <out dir> [ids...]   env: N (frames, 12), COLS (4), W (tile width, 400)
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]; ids = sys.argv[3:] or sorted(os.listdir(src))
N, COLS, W = int(os.environ.get('N', 12)), int(os.environ.get('COLS', 4)), int(os.environ.get('W', 400))
os.makedirs(out, exist_ok=True)
try: FOCUS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'focus.json')))
except Exception: FOCUS = {}
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
except Exception: font = ImageFont.load_default()
for sid in ids:
    d = os.path.join(src, sid)
    if not os.path.exists(os.path.join(d, 'meta.json')): continue
    meta = json.load(open(os.path.join(d, 'meta.json')))
    frames = sorted(f for f in os.listdir(d) if f.endswith('.jpg') and f != '000-before.jpg')
    focus = FOCUS.get(sid)
    pts = [v for k, v in meta['where'].items() if (focus is None or k.startswith('p') or int(k) in focus) and 0 < v['x'] < 1600 and 0 < v['y'] < 900]
    if not pts: pts = [{'x': 800, 'y': 450}]
    xs, ys = [p['x'] for p in pts], [p['y'] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2 + 90, (min(ys) + max(ys)) / 2 - 60
    w = max(700, max(xs) - min(xs) + 560); h = w * 0.62
    box = [int(max(0, cx - w / 2)), int(max(0, cy - h / 2)), 0, 0]; box[2] = int(min(1600, box[0] + w)); box[3] = int(min(900, box[1] + h))
    acts = meta.get('actions', [])
    busy = [f for i, f in enumerate(frames) if i < len(acts) and acts[i][2]] or frames
    last = busy[-1]; after = [f for f in frames if f > last]
    TAIL = int(os.environ.get('TAIL', 1))
    tail = [after[round(i * (len(after) - 1) / max(1, TAIL - 1))] for i in range(TAIL)] if TAIL > 1 and len(after) >= TAIL else (after[1:2] or after[:1])
    k = N - 1 - len(tail)
    pick = ([busy[round(i * (len(busy) - 1) / max(1, k - 1))] for i in range(k)] if len(busy) >= k else busy) + tail
    pick = ['000-before.jpg'] + pick
    tw, th = W, int(W * (box[3] - box[1]) / (box[2] - box[0]))
    rows = (len(pick) + COLS - 1) // COLS
    sheet = Image.new('RGB', (tw * COLS, th * rows + 28), (20, 18, 16))
    dr = ImageDraw.Draw(sheet); dr.text((8, 6), f"{sid}  ·  {json.dumps(meta['cmd'])}  ·  pace {meta['pace']}", fill=(235, 225, 200), font=font)
    times = meta.get('times', [])
    for i, f in enumerate(pick):
        im = Image.open(os.path.join(d, f)).crop(box).resize((tw, th), Image.LANCZOS)
        x, y = (i % COLS) * tw, (i // COLS) * th + 28
        sheet.paste(im, (x, y))
        n = 0 if f.startswith('000') else int(f[:3])
        acts = meta.get('actions', [])
        label = 'before' if n == 0 else (f"#{n} {acts[n-1][0] or '-'} {acts[n-1][1]:.2f}s" if n - 1 < len(acts) else f'#{n}')
        dr.rectangle([x, y, x + 150, y + 20], fill=(0, 0, 0)); dr.text((x + 4, y + 2), label, fill=(255, 230, 160), font=font)
    sheet.save(os.path.join(out, f'{sid}.jpg'), quality=85)
    print('wrote', sid, len(pick))
