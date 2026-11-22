"""Contact sheet with time labels. usage: python tools/sheet.py out.jpg cols img1 img2 ... [--force]
Refuses to replace an existing out.jpg unless --force is given, and never writes over one of its inputs."""
import os, sys, re
from PIL import Image, ImageDraw, ImageFont
force = '--force' in sys.argv; argv = [a for a in sys.argv[1:] if a != '--force']
if len(argv) < 3: sys.exit(__doc__)
out, cols, files = argv[0], int(argv[1]), argv[2:]
if os.path.abspath(out) in {os.path.abspath(f) for f in files}: sys.exit(f'{out} is also an input; choose another output path')
if os.path.exists(out) and not force: sys.exit(f'{out} exists; pass --force to replace it')
ims = [Image.open(f).convert('RGB') for f in files]; w, h = ims[0].size; rows = (len(ims)+cols-1)//cols
S = Image.new('RGB', (w*cols, h*rows)); d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('assets/fonts/JetBrainsMono-VF.ttf', max(14, h//18))
except OSError: font = None
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols)*w, (i//cols)*h; S.paste(im, (x, y)); m = re.search(r't_0*([\d.]+)\.png', f)
    lab = m.group(1) if m else f.split('/')[-1]; d.rectangle([x, y, x+len(lab)*h//28+16, y+h//14], fill=(0,0,0)); d.text((x+6, y+2), lab, fill=(255,200,80), font=font)
S.save(out, quality=88); print(out)
