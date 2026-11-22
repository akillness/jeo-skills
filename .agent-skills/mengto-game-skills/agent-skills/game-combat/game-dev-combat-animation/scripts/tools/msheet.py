import sys
from PIL import Image, ImageDraw, ImageFont
prefix, title = sys.argv[1], sys.argv[2]; f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
# 25 frames evenly across the move (crop 780x1800 of the 2880x1800 Characters-page render)
w = Image.new('RGB', (13 * 150, 30 + 2 * 346 + 30 + 420), (20, 20, 22)); d = ImageDraw.Draw(w)
d.text((8, 6), title + ' - 25 frames evenly across the whole move, left to right, top row then bottom row', fill=(240, 240, 240), font=f)
for i in range(25):
    im = Image.open(f'{prefix}-{i:04d}.png').convert('RGB').crop((340, 0, 1140, 1846)).resize((150, 346)); x, y = 150 * (i % 13), 30 + 346 * (i // 13)
    w.paste(im, (x, y)); d.text((x + 4, y + 326), f'{i}/24', fill=(255, 255, 0), font=f)
y = 30 + 2 * 346; d.text((8, y + 6), 'close-ups of the upper body at frames 6, 10, 14, 18', fill=(240, 240, 240), font=f); y += 30
for k, i in enumerate([6, 10, 14, 18]):
    im = Image.open(f'{prefix}-{i:04d}.png').convert('RGB').crop((390, 150, 1090, 1000)).resize((346, 420)); w.paste(im, (486 * k, y)); d.text((486 * k + 4, y + 4), f'{i}/24', fill=(255, 255, 0), font=f)
w.save(f'judge-{prefix}.png'); print(w.size)
