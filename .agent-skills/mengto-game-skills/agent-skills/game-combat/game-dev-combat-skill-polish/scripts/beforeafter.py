# Before/after sheet: one row of frames from the old build, one from the new, same crop, labelled.
# usage: python3 beforeafter.py <out.jpg> <before dir> "<frames>" <after dir> "<frames>" [box]
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
out, bdir, bf, adir, af = sys.argv[1:6]
box = [int(v) for v in (sys.argv[6] if len(sys.argv) > 6 else '470,120,1150,660').split(',')]
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 17)
except Exception: font = ImageFont.load_default()
W = 400; H = int(W * (box[3] - box[1]) / (box[2] - box[0]))
rows = [(bdir, bf.split(), 'before'), (adir, af.split(), 'after')]
cols = max(len(r[1]) for r in rows)
sheet = Image.new('RGB', (W * cols, H * 2), (20, 18, 16)); dr = ImageDraw.Draw(sheet)
for y, (d, frames, tag) in enumerate(rows):
    acts = json.load(open(os.path.join(d, 'meta.json'))).get('actions', [])
    for x, n in enumerate(frames):
        n = int(n); im = Image.open(os.path.join(d, f'{n:03d}.jpg')).crop(box).resize((W, H), Image.LANCZOS)
        sheet.paste(im, (x * W, y * H))
        a = acts[n - 1] if n - 1 < len(acts) else ['-', 0]
        label = f"{tag} · {a[0]} {a[1]:.2f}s"
        dr.rectangle([x * W, y * H, x * W + 200, y * H + 24], fill=(0, 0, 0)); dr.text((x * W + 5, y * H + 3), label, fill=(255, 230, 160), font=font)
sheet.save(out, quality=86); print('wrote', out, sheet.size)
