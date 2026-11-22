#!/usr/bin/env python3
"""Side-by-side review video frames: the Characters page (left) and the game (right) at the same
moment, each move at real speed and then at quarter speed, labelled.

    python3 vidcompose.py <out-name> "<title>|<characters prefix>|<play prefix>" ...
    swift encode.swift vid/<out-name> f- 30 vid/<out-name>.mp4

Both inputs must be sampled at 30 fps on the move's own clock: the Characters page with __seqT and
times i/30 (seconds, not fractions), the game with __play (dt 1/30, frame 0 = the action starts).
Characters frames are 1480 x 1800 crops ([700, 0, 1480, 1800]); play frames 720 x 800.
"""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont

name, segments = sys.argv[1], [s.split('|') for s in sys.argv[2:]]
big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26); small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
W, H, TOP = 1380, 860, 60
out = f'vid/{name}'; os.makedirs(out, exist_ok=True)
for f in glob.glob(f'{out}/f-*.png'): os.remove(f)
n = 0
def emit(img, times=1):
    global n
    for _ in range(times): img.save(f'{out}/f-{n:05d}.png'); n += 1
for title, chars, play in segments:
    left = sorted(f for f in glob.glob(f'{chars}-0*.png')); right = sorted(f for f in glob.glob(f'{play}-0*.png'))
    frames = max(len(left), len(right))
    def frame(i, speed):
        c = Image.new('RGB', (W, H), (16, 17, 19)); d = ImageDraw.Draw(c)
        c.paste(Image.open(left[min(i, len(left) - 1)]).convert('RGB').resize((658, 800)), (0, TOP))
        c.paste(Image.open(right[min(i, len(right) - 1)]).convert('RGB').resize((720, 800)), (660, TOP))
        d.text((14, 14), title, fill=(240, 236, 228), font=big)
        d.text((W - 14, 18), f'{speed}   {i / 30:.2f} s', fill=(214, 180, 96), font=small, anchor='ra')
        for x, label in ((0, 'Characters page'), (660, 'In play')):
            box = d.textbbox((x + 14, H - 32), label, font=small); d.rectangle((box[0] - 8, box[1] - 6, box[2] + 8, box[3] + 6), fill=(16, 17, 19))
            d.text((x + 14, H - 32), label, fill=(230, 230, 230), font=small)
        return c
    for i in range(frames): emit(frame(i, 'real speed'))
    emit(frame(frames - 1, 'real speed'), 12)
    for i in range(frames): emit(frame(i, '1/4 speed'), 4)
    emit(frame(frames - 1, '1/4 speed'), 18)
print(name, n, 'frames', f'{n / 30:.1f} s')
