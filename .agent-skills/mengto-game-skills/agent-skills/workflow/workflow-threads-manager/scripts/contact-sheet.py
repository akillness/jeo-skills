#!/usr/bin/env python3
"""A contact sheet of the newest changelog versions' pictures, read straight from origin/main (no checkout needed).

  contact-sheet.py <out.jpg> [--count 12] [--repo PATH] [--changelog src/changelog.js] [--pictures <dir>/]

Big versions show their three pictures (start, key moment, result), small ones their one. Send the sheet with
SendUserFile so the user sees what shipped.
"""
import argparse, io, re, subprocess as sp
from PIL import Image, ImageDraw

ENTRY = re.compile(r"v\('([\d.]+)', '([\d-]+)', '([^']*)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', (true|false)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--count', type=int, default=12)
    ap.add_argument('--repo', default='.')
    ap.add_argument('--changelog', default='src/changelog.js')
    ap.add_argument('--pictures', default=None)
    a = ap.parse_args()
    git = lambda *args, text=True: sp.run(['git', '-C', a.repo, *args], capture_output=True, text=text).stdout
    entries = ENTRY.findall(git('show', f'origin/main:{a.changelog}'))[:a.count]
    listing = git('ls-tree', '-r', '--name-only', 'origin/main').split()
    if a.pictures:
        pics = a.pictures
    else:
        counts = {}
        for f in listing:
            if '/changelog/' in f and re.search(r'\.(webp|jpe?g|png)$', f):
                counts[f.rsplit('/', 1)[0] + '/'] = counts.get(f.rsplit('/', 1)[0] + '/', 0) + 1
        pics = max(counts, key=counts.get) if counts else 'public/changelog/'
    files = [f for f in listing if f.startswith(pics)]
    W, H, pad = 400, 225, 26
    sheet = Image.new('RGB', (3 * W, len(entries) * (H + pad)), '#111')
    draw = ImageDraw.Draw(sheet)
    for r, (version, date, pid, title, note, big) in enumerate(entries):
        y = r * (H + pad)
        draw.text((6, y + 7), f"v{version}  {title.replace(chr(92) + chr(39), chr(39))}  ({date})", fill='#f0d8a0')
        names = [pid] + ([f'{pid}-2', f'{pid}-3'] if big == 'true' else [])
        for k, n in enumerate(names):
            path = next((f for f in files if f.rsplit('/', 1)[-1].rsplit('.', 1)[0] == n), None)
            if not path:
                draw.text((k * W + 10, y + pad + 10), f'missing: {n}', fill='#e07070'); continue
            im = Image.open(io.BytesIO(git('show', f'origin/main:{path}', text=False))).convert('RGB')
            im.thumbnail((W - 4, H))
            sheet.paste(im, (k * W + 2, y + pad))
    sheet.save(a.out, quality=85)
    print(f'{a.out}: {len(entries)} versions, {sheet.size[0]}x{sheet.size[1]}')


if __name__ == '__main__':
    main()
