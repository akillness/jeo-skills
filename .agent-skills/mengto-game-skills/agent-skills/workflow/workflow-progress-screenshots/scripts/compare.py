#!/usr/bin/env python3
"""Put screenshots side by side with labels: a before/after pair, or a start → key moment → result strip.

  compare.py <out.jpg> <image> <label> [<image> <label> ...] [--width 800] [--cols N]

Same framing for every image makes the change obvious; the labels say what each panel is. Requires Pillow.
"""
import argparse
from PIL import Image, ImageDraw, ImageFont


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('pairs', nargs='+', help='image label image label ...')
    ap.add_argument('--width', type=int, default=800, help='width of each panel')
    ap.add_argument('--cols', type=int, default=0, help='panels per row (default: all in one row, max 3)')
    a = ap.parse_args()
    if len(a.pairs) % 2:
        ap.error('give an even number of arguments: image label image label ...')
    items = [(a.pairs[i], a.pairs[i + 1]) for i in range(0, len(a.pairs), 2)]
    cols = a.cols or min(len(items), 3)
    rows = (len(items) + cols - 1) // cols
    panels = []
    for path, label in items:
        im = Image.open(path).convert('RGB')
        im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
        panels.append((im, label))
    bar = 34
    ph = max(p.height for p, _ in panels)
    sheet = Image.new('RGB', (cols * a.width + (cols - 1) * 8, rows * (ph + bar) + (rows - 1) * 8), '#111')
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
    except Exception:
        font = ImageFont.load_default()
    for i, (im, label) in enumerate(panels):
        x, y = (i % cols) * (a.width + 8), (i // cols) * (ph + bar + 8)
        draw.text((x + 10, y + 7), label, fill='#f2e2b8', font=font)
        sheet.paste(im, (x, y + bar))
    sheet.save(a.out, quality=88)
    print(f'{a.out}: {len(panels)} panels, {sheet.width}x{sheet.height}')


if __name__ == '__main__':
    main()
