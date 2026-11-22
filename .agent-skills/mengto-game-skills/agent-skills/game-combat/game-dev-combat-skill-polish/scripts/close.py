# Close-up sheet: chosen frames of one film cropped to a box, laid out in a grid with their times.
# usage: python3 close.py <frames dir> <out.jpg> <x0,y0,x1,y1> <frame numbers...>   env: COLS (4), W (tile width, 480)
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
d, out, box = sys.argv[1], sys.argv[2], [int(v) for v in sys.argv[3].split(',')]
nums = [int(n) for n in sys.argv[4:]]
COLS, W = int(os.environ.get('COLS', 4)), int(os.environ.get('W', 480))
meta = json.load(open(os.path.join(d, 'meta.json'))); acts = meta.get('actions', [])
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
except Exception: font = ImageFont.load_default()
tw = W; th = int(W * (box[3] - box[1]) / (box[2] - box[0])); rows = (len(nums) + COLS - 1) // COLS
sheet = Image.new('RGB', (tw * COLS, th * rows), (20, 18, 16)); dr = ImageDraw.Draw(sheet)
for i, n in enumerate(nums):
    f = '000-before.jpg' if n == 0 else f'{n:03d}.jpg'
    im = Image.open(os.path.join(d, f)).crop(box).resize((tw, th), Image.LANCZOS)
    x, y = (i % COLS) * tw, (i // COLS) * th; sheet.paste(im, (x, y))
    label = 'before' if n == 0 else f"#{n} {acts[n-1][0] or '-'} {acts[n-1][1]:.2f}s" if n - 1 < len(acts) else f'#{n}'
    dr.rectangle([x, y, x + 150, y + 20], fill=(0, 0, 0)); dr.text((x + 4, y + 2), label, fill=(255, 230, 160), font=font)
sheet.save(out, quality=88); print('wrote', out)
