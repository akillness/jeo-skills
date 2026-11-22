#!/usr/bin/env python3
"""Split a two-pose still into two square first frames with headroom.

The still holds one character twice on a flat magenta (#FF00FF) field, in
side profile facing right: the rest pose on the left half, the jump (hero) or
attack wind-up (enemy) on the right half. Each pose is cut out, scaled so the
figure is a fixed share of the frame height, and pasted centered on a fresh
magenta square with its feet on a fixed baseline. The empty space above the
head leaves room for a raised weapon or a jump in the animated clip.

Writes <out>/<name>_rest.png (the left pose, first frame of every ground clip)
and <out>/<name>_action.png (the right pose). Existing files are kept unless
--force is given.

Examples:
  python3 reframe_stills.py hero_two_pose.png --name hero --out frames
  python3 reframe_stills.py hero.png --name hero --out frames --figure 0.55 --baseline 0.84

Needs Python 3 with Pillow and NumPy.
"""
import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow and NumPy: python3 -m pip install pillow numpy')


def magenta_mask(rgb, tolerance):
    """True where a pixel belongs to the flat magenta field."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 255 - tolerance) & (b > 255 - tolerance) & (g < tolerance + 25)


def figure_box(keep, min_pixels):
    """Bounding box of the figure, ignoring rows and columns with only a few stray pixels."""
    rows = np.where(keep.sum(1) >= min_pixels)[0]
    cols = np.where(keep.sum(0) >= min_pixels)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return cols.min(), rows.min(), cols.max() + 1, rows.max() + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('still', type=Path,
                        help='two-pose image: rest pose on the left half, jump or attack wind-up on the right half')
    parser.add_argument('--name', required=True, help='character name used in the output file names')
    parser.add_argument('--out', type=Path, required=True, help='output folder (created if missing)')
    parser.add_argument('--size', type=int, default=960, help='side of the square first frame in px (default 960)')
    parser.add_argument('--figure', type=float, default=0.58, help='figure height as a share of the frame (default 0.58)')
    parser.add_argument('--baseline', type=float, default=0.82, help='feet line as a share of the frame from the top (default 0.82)')
    parser.add_argument('--tolerance', type=int, default=85, help='how far from pure magenta still counts as background (default 85)')
    parser.add_argument('--force', action='store_true', help='overwrite existing first frames')
    args = parser.parse_args()

    if not args.still.is_file():
        sys.exit(f'error: {args.still} not found')
    if not 0.2 <= args.figure <= 0.9 or not args.figure < args.baseline <= 0.98:
        sys.exit('error: need 0.2 <= --figure <= 0.9 and --figure < --baseline <= 0.98')
    targets = {p: args.out / f'{args.name}_{p}.png' for p in ('rest', 'action')}
    existing = [str(p) for p in targets.values() if p.exists()]
    if existing and not args.force:
        sys.exit('error: would overwrite ' + ', '.join(existing) + ' (pass --force to replace)')

    im = Image.open(args.still).convert('RGB')
    rgb = np.array(im).astype(int)
    keep = ~magenta_mask(rgb, args.tolerance)
    width = im.width
    size = args.size
    fig_h = int(size * args.figure)
    base = int(size * args.baseline)
    args.out.mkdir(parents=True, exist_ok=True)
    for pose, x0, x1 in (('rest', 0, width // 2), ('action', width // 2, width)):
        box = figure_box(keep[:, x0:x1], min_pixels=3)
        if box is None:
            sys.exit(f'error: no figure found in the {pose} half; is the background flat magenta?')
        bx0, by0, bx1, by1 = box[0] + x0, box[1], box[2] + x0, box[3]
        if bx0 == x0 or bx1 == x1:
            print(f'warning: the {pose} figure touches the middle or the edge of the image; '
                  'check that the two poses do not overlap', file=sys.stderr)
        fig = im.crop((bx0, by0, bx1, by1))
        scale = fig_h / fig.height
        new_w = round(fig.width * scale)
        if new_w > size:
            sys.exit(f'error: the {pose} figure is wider than the frame at --figure {args.figure}; lower it')
        fig = fig.resize((new_w, fig_h), Image.LANCZOS)
        alpha = Image.fromarray((keep[by0:by1, bx0:bx1] * 255).astype('uint8')).resize(fig.size, Image.LANCZOS)
        out = Image.new('RGB', (size, size), (255, 0, 255))
        out.paste(fig, ((size - new_w) // 2, base - fig_h), alpha)
        out.save(targets[pose])
        print(f'wrote {targets[pose]} (figure {new_w}x{fig_h}, feet at y={base})')


if __name__ == '__main__':
    main()
