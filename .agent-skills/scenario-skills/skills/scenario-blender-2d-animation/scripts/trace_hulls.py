#!/usr/bin/env python3
"""Trace each prop sprite's outline into shapes.json, the collision shapes build_scene.py reads.

For every physics prop: the opaque pixels (alpha > 128), every 7th one fed to a convex hull, the hull thinned to
about 20 points and normalized (u 0..1 from left to right, v 0..1 from bottom to top). For the tree and the
pedestal only the size and the opaque bounds are written: build_scene.py uses the tree's bounds to plant its trunk
on the ground when the image has empty rows under it.

Writes <game_dir>/shapes.json. An existing file is kept unless --force is given.

Examples:
  python3 trace_hulls.py jungle/game
  python3 trace_hulls.py snow/game --props jar,pot_round,amphora,idol,coconut --bounds palm,pedestal --force

Needs Python 3 with Pillow, NumPy and SciPy.
"""
import argparse
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
    from scipy.spatial import ConvexHull
except ImportError:
    sys.exit('This script needs Pillow, NumPy and SciPy: python3 -m pip install pillow numpy scipy')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('game_dir', help='folder holding the sprites (<name>.png)')
    parser.add_argument('--props', default='jar,pot_round,amphora,idol,coconut', help='sprites that get a hull (comma-separated)')
    parser.add_argument('--bounds', default='palm,pedestal', help='sprites that get only size and bounds')
    parser.add_argument('--force', action='store_true', help='replace an existing shapes.json')
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)
    args = parser.parse_args()

    target = os.path.join(args.game_dir, 'shapes.json')
    if os.path.exists(target) and not args.force:
        sys.exit(f'error: {target} exists (pass --force to replace it)')
    props = [n for n in args.props.split(',') if n]
    bounds = [n for n in args.bounds.split(',') if n]
    out = {}
    for name in props + bounds:
        path = os.path.join(args.game_dir, name + '.png')
        if not os.path.isfile(path):
            sys.exit(f'error: {path} not found')
        a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128
        H, W = a.shape
        ys, xs = np.where(a)
        entry = {'w': W, 'h': H, 'bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]}
        if name in props:
            pts = np.stack([xs, ys], 1)[::7]
            hp = pts[ConvexHull(pts).vertices]
            # simplify to about 20 points, normalized: u in 0..1 left->right, v in 0..1 bottom->top
            step = max(1, len(hp) // 20)
            hp = hp[::step]
            entry['hull'] = [[float(x) / W, 1 - float(y) / H] for x, y in hp]
        out[name] = entry
        print(name, entry['bbox'], (W, H), len(entry.get('hull', [])), 'hull points')
    with open(target, 'w') as f:
        json.dump(out, f)
    print('wrote', target)


if __name__ == '__main__':
    main()
