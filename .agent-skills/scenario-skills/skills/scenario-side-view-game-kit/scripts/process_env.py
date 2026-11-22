#!/usr/bin/env python3
"""Turn generated environment renders into game-ready WebP layers for a side-scroller.

One layer set per level, read from --env with these names (N = level number):
  bg<N>.png     opaque background painting      -> env_bg<N>.webp (as is, lossy)
  mid<N>.png    transparent parallax midground  -> env_mid<N>.webp (as is, lossy, alpha kept)
  tex<N>.png    wall and floor texture          -> env_tex<N>.webp (made seamless, resized)
  ledge<N>.png  transparent platform strip      -> env_ledge<N>.webp (trimmed, fixed height)
  props<N>.png  transparent sheet of props      -> env_prop<N>_<k>.webp (one file per prop)
A missing file is skipped with a note. Explicit files can be given instead with
--file KIND=PATH (output named after the file stem, e.g. env_tex_stone_wall.webp).

Seamless texture: image models asked for a "seamless tileable" texture do not
reliably tile, so the opposite edges are cross-faded: the first --fade share of
each axis becomes a blend of the tail and the head, and the tail is cut off,
so the result wraps on both axes (it is slightly smaller before the resize).
Ledge: trimmed to its opaque bounding box and scaled to --ledge-height; draw
it in the game as left cap + repeated middle + right cap so runs of any
length keep the carved ends. Props: split by connected components (8-neighbor
on a 1/4 mask), the --props largest kept, ordered left to right, each scaled
to --prop-height.

Existing outputs are kept unless --force is given; --dry-run lists what would
be written.

Examples:
  python3 process_env.py --env env --out assets --levels 5
  python3 process_env.py --env env --out assets --levels 2,4 --tex-size 512 --force
  python3 process_env.py --out assets --file tex=renders/stone_wall.png --file props=renders/crypt_props.png --props 4

Needs Python 3 with Pillow and NumPy.
"""
import argparse
import sys
from collections import deque
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow and NumPy: python3 -m pip install pillow numpy')

KINDS = ('bg', 'mid', 'tex', 'ledge', 'props')


def seamless(img, frac):
    """Cross-fade opposite edges so the texture wraps: out[i] = tail*(1-t) + head*t over the first k px."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    for axis in (1, 0):
        n = a.shape[axis]
        k = int(n * frac)
        if k < 1:
            continue
        head = np.take(a, range(0, k), axis=axis)
        tail = np.take(a, range(n - k, n), axis=axis)
        t = np.linspace(0, 1, k, dtype=np.float32)
        t = t[None, :, None] if axis == 1 else t[:, None, None]
        blend = tail * (1 - t) + head * t
        body = np.take(a, range(k, n - k), axis=axis)
        a = np.concatenate([blend, body], axis=axis)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def components(img, count, thr, f=4):
    """The `count` largest connected opaque regions, left to right, each with its own alpha."""
    rgba = np.asarray(img.convert('RGBA'))
    full = rgba[..., 3] > thr
    h, w = full.shape[0] // f, full.shape[1] // f
    m = full[:h * f, :w * f].reshape(h, f, w, f).any(axis=(1, 3))
    lab = np.zeros((h, w), np.int32)
    comps, n = [], 0
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)])
                lab[y, x] = n
                size = 0
                while q:
                    cy, cx = q.popleft()
                    size += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n
                                q.append((ny, nx))
                comps.append((size, n))
    if len(comps) < count:
        print(f'warning: found {len(comps)} prop(s), expected {count}; props touching each other merge into one',
              file=sys.stderr)
    keep = [c[1] for c in sorted(comps, reverse=True)[:count]]
    out = []
    for k in keep:
        mk = np.kron(lab == k, np.ones((f, f), bool))
        mk = np.pad(mk, ((0, full.shape[0] - mk.shape[0]), (0, full.shape[1] - mk.shape[1])))
        ys, xs = np.where(mk & full)
        sub = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        sub[..., 3] = np.where(mk[ys.min():ys.max() + 1, xs.min():xs.max() + 1], sub[..., 3], 0)
        out.append((xs.min(), Image.fromarray(sub)))
    return [im for _, im in sorted(out, key=lambda t: t[0])]


def fit_h(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def parse_levels(spec):
    if spec.isdigit():
        return list(range(1, int(spec) + 1))
    try:
        return sorted({int(v) for v in spec.split(',') if v.strip()})
    except ValueError:
        raise SystemExit(f'error: --levels {spec!r}; use a count (5) or a list (2,4)')


def jobs(args):
    """(kind, source, output stem) for every input to process."""
    out = []
    if args.file:
        for item in args.file:
            kind, sep, path = item.partition('=')
            if not sep or kind not in KINDS:
                raise SystemExit(f'error: --file {item!r}; use KIND=PATH with KIND one of {", ".join(KINDS)}')
            src = Path(path)
            if not src.is_file():
                raise SystemExit(f'error: {src} not found')
            out.append((kind, src, src.stem))
        return out
    if args.env is None:
        raise SystemExit('error: give --env (with --levels) or one or more --file KIND=PATH')
    for level in parse_levels(args.levels):
        for kind in KINDS:
            src = args.env / f'{kind}{level}.png'
            if src.is_file():
                out.append((kind, src, str(level)))
            else:
                print(f'skip (missing) {src}')
    return out


def outputs(kind, stem, count):
    sep = '' if stem.isdigit() else '_'   # env_tex3.webp for level 3, env_tex_stone_wall.webp for a file
    if kind == 'props':
        return [f'env_prop{sep}{stem}_{k}.webp' for k in range(count)]
    return [f'env_{kind}{sep}{stem}.webp']


def process(kind, src, names, args):
    """Write the outputs for one input; returns the names actually written."""
    im = Image.open(src)
    if kind == 'bg':
        im.convert('RGB').save(args.out / names[0], quality=args.bg_quality, method=6)
    elif kind == 'mid':
        im.convert('RGBA').save(args.out / names[0], quality=args.mid_quality, method=6)
    elif kind == 'tex':
        tex = seamless(im, args.fade).resize((args.tex_size, args.tex_size), Image.LANCZOS)
        tex.save(args.out / names[0], quality=args.detail_quality, method=6)
    elif kind == 'ledge':
        le = im.convert('RGBA')
        box = le.split()[3].point(lambda v: 255 if v > args.alpha_threshold else 0).getbbox()
        if box is None:
            raise SystemExit(f'error: {src} is fully transparent')
        fit_h(le.crop(box), args.ledge_height).save(args.out / names[0], quality=args.detail_quality, method=6)
    else:
        props = components(im, args.props, args.alpha_threshold)
        for name, pr in zip(names, props):
            fit_h(pr, args.prop_height).save(args.out / name, quality=args.detail_quality, method=6)
        missing = names[len(props):]
        if missing:
            print(f'warning: {src} held {len(props)} of {args.props} props; not written: ' + ', '.join(missing))
            stale = [n for n in missing if (args.out / n).exists()]
            if stale:
                print('warning: left from an earlier run, delete them or re-render the sheet: '
                      + ', '.join(str(args.out / n) for n in stale))
        return names[:len(props)]
    return names[:1]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--env', type=Path, help='folder holding bg<N>.png, mid<N>.png, tex<N>.png, ledge<N>.png, props<N>.png')
    parser.add_argument('--out', type=Path, required=True, help='output folder for the WebP files (created if missing)')
    parser.add_argument('--levels', default='5', help='level count (5 = levels 1 to 5) or a list (2,4; "2," for level 2 alone); default 5')
    parser.add_argument('--file', action='append', metavar='KIND=PATH',
                        help=f'process one explicit file instead of --env/--levels (repeatable); KIND is one of {", ".join(KINDS)}')
    parser.add_argument('--tex-size', type=int, default=384, help='side of the seamless texture in px (default 384)')
    parser.add_argument('--fade', type=float, default=0.12, help='share of each axis cross-faded for the seamless texture (default 0.12)')
    parser.add_argument('--ledge-height', type=int, default=120, help='height of the trimmed ledge strip in px (default 120)')
    parser.add_argument('--props', type=int, default=3, help='props per sheet (default 3)')
    parser.add_argument('--prop-height', type=int, default=180, help='height of each cut prop in px (default 180)')
    parser.add_argument('--alpha-threshold', type=int, default=24, help='alpha above which a pixel counts as opaque when trimming and splitting (default 24)')
    parser.add_argument('--bg-quality', type=int, default=86, help='WebP quality for backgrounds (default 86)')
    parser.add_argument('--mid-quality', type=int, default=86, help='WebP quality for midgrounds (default 86)')
    parser.add_argument('--detail-quality', type=int, default=90, help='WebP quality for textures, ledges and props (default 90)')
    parser.add_argument('--dry-run', action='store_true', help='list the outputs, write nothing')
    parser.add_argument('--force', action='store_true', help='overwrite existing outputs')
    args = parser.parse_args()

    if not 0 < args.fade < 0.5:
        sys.exit('error: need 0 < --fade < 0.5')
    if min(args.tex_size, args.ledge_height, args.prop_height, args.props) < 1:
        sys.exit('error: sizes and --props must be positive')
    todo = [(kind, src, outputs(kind, stem, args.props)) for kind, src, stem in jobs(args)]
    if not todo:
        sys.exit('error: nothing to process')
    existing = [str(args.out / n) for _, _, names in todo for n in names if (args.out / n).exists()]
    if existing and not args.force and not args.dry_run:
        sys.exit('error: would overwrite ' + ', '.join(existing) + ' (pass --force to replace)')
    if args.dry_run:
        for kind, src, names in todo:
            print(f'{src} ({kind}) -> ' + ', '.join(str(args.out / n) for n in names))
        return
    args.out.mkdir(parents=True, exist_ok=True)
    for kind, src, names in todo:
        written = process(kind, src, names, args)
        print(f'{src} ({kind}) -> ' + ', '.join(written))


if __name__ == '__main__':
    main()
