import sys
from PIL import Image, ImageDraw, ImageFont
f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
name, n, title = sys.argv[1], int(sys.argv[2]), sys.argv[3]
cols = 10; rows = (n + cols - 1) // cols; tw, th = 216, 240
w = Image.new('RGB', (cols * tw, 28 + rows * th), (20, 20, 22)); d = ImageDraw.Draw(w)
d.text((6, 5), f'{title} - in play, every frame at 30 fps (frame 0 = the action starts)', fill=(240, 240, 240), font=f)
for i in range(n):
    im = Image.open(f'{name}-{i:04d}.png').convert('RGB').resize((tw, th)); x, y = tw * (i % cols), 28 + th * (i // cols)
    w.paste(im, (x, y)); d.text((x + 4, y + 4), str(i), fill=(255, 255, 0), font=f)
w.save(f'judge-{name}.png'); print(name, w.size)
