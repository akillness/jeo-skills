#!/usr/bin/env python3
"""Turn a run-in-place clip on a flat background into a keyed, looping image sequence for Blender.

The clip is an image-to-video result: the hero runs like on a treadmill, centered, on a flat color (magenta).
Every frame is keyed to alpha, then the loop is the window [s, s+P) whose seam (frame s against frame s+P) is
smallest compared with the mean frame-to-frame motion inside it; every start s in the search range and every
period P in --periods is tried. The kept frames are cropped to their common bounds plus --pad px (no scaling:
Blender sizes them from config.json) and written as <out>/run_001.png, run_002.png, ...

Keys:
  magenta  a soft magenta key with despill; pink or purple parts enclosed by the figure (inner ears) are kept.
           Needs prep_assets.py in the same folder.
  border   each frame is keyed against its own border color (the median of an 8 px border). Use it when the
           clip's background drifts (one reference clip went from magenta through red and yellow to green), and
           search only the frames whose background is far from the character's colors (--from/--to).
--clean tightens the alpha edge by 1 px and pulls a 3 px edge band toward gray, except strongly red pixels
(a red scarf or hat), to remove a colored fringe.

Prints the numbers config.json needs: run_n (frames), run_fig_px (mean figure height) and run_pad_px.
Existing frames are kept unless --force is given.

Examples:
  python3 run_loop.py clips/hero_run.mp4 game/hero_run
  python3 run_loop.py clips/hero_run.mp4 game/hero_run --key border --from 60 --to 124 --skip 0 --periods 8:16 --clean

Needs Python 3 with Pillow, NumPy and SciPy, and ffmpeg on the PATH.
"""
import argparse
import os
import subprocess
import sys
import tempfile

try:
    import numpy as np
    from PIL import Image, ImageFilter
    from scipy import ndimage
except ImportError:
    sys.exit('This script needs Pillow, NumPy and SciPy: python3 -m pip install pillow numpy scipy')


def small(rgba, s=120):
    im = Image.fromarray(rgba).resize((s, s), Image.BOX)
    a = np.array(im).astype(np.float32)
    return a[..., :3] * (a[..., 3:] / 255), a[..., 3] / 255


def dist(a, b):
    return float(np.abs(a[0] - b[0]).mean() + 80 * np.abs(a[1] - b[1]).mean())


def key_border(rgb):
    a = rgb.astype(float)
    b = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(b, 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    al = np.clip((d - 45) / (110 - 45), 0, 1)
    # keep only the figure (largest blob), drop specks
    lab, n = ndimage.label(al > 0.5)
    if n > 1:
        sz = ndimage.sum(al > 0.5, lab, range(1, n + 1))
        keep = lab == (np.argmax(sz) + 1)
        keep = ndimage.binary_dilation(keep, iterations=3)
        al = al * keep
    # unmix the background out of soft edges
    aa = np.maximum(al, 1e-3)[..., None]
    fg = np.clip((a - (1 - aa) * bg) / aa, 0, 255)
    return np.dstack([np.where(al[..., None] > 0, fg, 0), al * 255]).astype(np.uint8)


def clean(im):
    a = np.asarray(im).astype(float)
    al = np.asarray(im.getchannel('A').filter(ImageFilter.MinFilter(3))).astype(float)   # 1 px tighter edge
    solid = al > 250
    band = ~ndimage.binary_erosion(solid, iterations=3) & (al > 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > g + 50) & (r > b + 50)
    lum = 0.3 * r + 0.55 * g + 0.15 * b
    fix = band & ~red
    for c in range(3):
        a[..., c] = np.where(fix, np.minimum(a[..., c], lum) * 0.92, a[..., c])
    a[..., 3] = al
    return Image.fromarray(a.astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('clip', help='the run clip (mp4)')
    parser.add_argument('out', help='output folder for run_NNN.png (created if missing)')
    parser.add_argument('--key', choices=('magenta', 'border'), default='magenta', help='how to key the background (default magenta)')
    parser.add_argument('--periods', default='7:15', help='loop lengths to try, MIN:MAX frames (default 7:15)')
    parser.add_argument('--from', dest='first', type=int, default=0, help='first frame of the search range, 0-based (default 0)')
    parser.add_argument('--to', dest='last', type=int, default=None, help='end of the search range, exclusive (default: the last frame)')
    parser.add_argument('--skip', type=int, default=6, help='earliest loop start inside the range (default 6: the clip settles first)')
    parser.add_argument('--pad', type=int, default=8, help='empty px kept around the figure (default 8; this is run_pad_px)')
    parser.add_argument('--clean', action='store_true', help='tighten the edge by 1 px and remove a colored fringe (keeps red)')
    parser.add_argument('--force', action='store_true', help='replace existing run frames in the output folder')
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)
    args = parser.parse_args()

    if not os.path.isfile(args.clip):
        sys.exit(f'error: {args.clip} not found')
    pmin, pmax = (int(v) for v in args.periods.split(':'))
    old = [f for f in os.listdir(args.out) if f.startswith('run_') and f.endswith('.png')] if os.path.isdir(args.out) else []
    if old and not args.force:
        sys.exit(f'error: {args.out} already holds {len(old)} run frames (pass --force to replace them)')

    if args.key == 'magenta':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            from prep_assets import key_rgb
        except ImportError:
            sys.exit('error: --key magenta needs prep_assets.py next to this script')
        key = key_rgb
    else:
        key = key_border

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', args.clip, os.path.join(tmp, 'f_%04d.png')], check=True)
        files = sorted(os.listdir(tmp))[args.first:args.last]
        rgba = [key(np.asarray(Image.open(os.path.join(tmp, f)).convert('RGB'))) for f in files]
    sm = [small(a) for a in rgba]
    best = None
    for period in range(pmin, pmax + 1):
        for s in range(args.skip, len(sm) - period):
            step = np.mean([dist(sm[i], sm[i + 1]) for i in range(s, s + period)])
            seam = dist(sm[s], sm[s + period])
            score = seam / step
            if best is None or score < best[0]:
                best = (score, s, period, seam, step)
    if best is None:
        sys.exit('error: the search range is shorter than the shortest period')
    score, s, period, seam, step = best
    print(f'loop score {score:.3f} (seam / motion, lower is better; the reference loops scored 0.10 to 0.27) start {args.first + s} period {period}')
    win = rgba[s:s + period]
    al = np.stack([w[..., 3] for w in win]).max(0) > 20
    ys, xs = np.where(al)
    y0, y1, x0, x1 = ys.min() - args.pad, ys.max() + args.pad, xs.min() - args.pad, xs.max() + args.pad
    y0, x0 = max(0, y0), max(0, x0)
    os.makedirs(args.out, exist_ok=True)
    for f in old:
        os.remove(os.path.join(args.out, f))
    for i, w in enumerate(win):
        im = Image.fromarray(w[y0:y1, x0:x1])
        if args.clean:
            im = clean(im.convert('RGBA'))
        im.save(os.path.join(args.out, f'run_{i + 1:03d}.png'))
    figs = [int(np.ptp(np.where((w[..., 3] > 128).any(1))[0])) for w in win]
    print(f'wrote {period} frames of {x1 - x0}x{y1 - y0} px to {args.out}')
    print(f'config.json: "run_n": {period}, "run_fig_px": {round(sum(figs) / len(figs))}, "run_pad_px": {args.pad}, '
          f'"run_canvas_px": {rgba[0].shape[0]}')


if __name__ == '__main__':
    main()
