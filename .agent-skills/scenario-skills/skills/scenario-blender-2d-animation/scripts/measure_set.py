#!/usr/bin/env python3
"""Measure the per-look numbers build_scene.py needs from the processed pictures, and print them for config.json.

  sea_horizon      the far layer's horizon: first row where alpha covers more than 90% of the width, as a share
                   of the height (sea_tile.png)
  ground_top       the ground strip's walkable line: its 90% row as a share of the height, moved down by
                   --sink meters (default 0.1) so the feet sit in the lip rather than on the grass tips
  island_top_px    first row where alpha covers more than 60% of island.png's width
  pedestal_top_px  first row where alpha covers more than 80% of pedestal.png's width
  jump_base_px     the feet row of hero_jump.png (lowest opaque row); reframe_stills.py also prints the feet line
                   it placed ("feet at y=..."), which is an equally good value

The layer heights in meters (sea_h, jungle_h, ground_h and their offsets), the fruit positions (nuts) and the hero
height (hero_h) were set by eye on review renders in the reference shot: start from the example config and adjust.
The run numbers (run_n, run_fig_px, run_pad_px) come from run_loop.py. Prints a JSON fragment; writes nothing.

Example:
  python3 measure_set.py jungle/game --ground-h 4.3

Needs Python 3 with Pillow and NumPy.
"""
import argparse
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow and NumPy: python3 -m pip install pillow numpy')


def opaque(path):
    if not os.path.isfile(path):
        sys.exit(f'error: {path} not found')
    return np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128


def first_row(a, cover, name):
    rows = a.mean(1) > cover
    if not rows.any():   # argmax of all-False is 0, which would read as a line at the very top
        sys.exit(f'error: no row of {name} is more than {cover:.0%} opaque; check its transparency and cut')
    return int(np.argmax(rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('game_dir', help='folder holding sea_tile.png, ground_tile.png, island.png, pedestal.png, hero_jump.png')
    parser.add_argument('--ground-h', type=float, default=4.3, help='height of the ground strip in the scene, meters (default 4.3, the script default)')
    parser.add_argument('--sink', type=float, default=0.1, help='how far the feet sink below the 90%% line, meters (default 0.1)')
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)
    args = parser.parse_args()
    g = args.game_dir

    sea = opaque(os.path.join(g, 'sea_tile.png'))
    ground = opaque(os.path.join(g, 'ground_tile.png'))
    island = opaque(os.path.join(g, 'island.png'))
    pedestal = opaque(os.path.join(g, 'pedestal.png'))
    jump = opaque(os.path.join(g, 'hero_jump.png'))
    ground90 = first_row(ground, 0.9, 'ground_tile.png') / ground.shape[0]
    values = {
        'sea_horizon': round(first_row(sea, 0.9, 'sea_tile.png') / sea.shape[0], 3),
        'ground_h': args.ground_h,
        'ground_top': round(ground90 + args.sink / args.ground_h, 3),
        'island_top_px': first_row(island, 0.6, 'island.png'),
        'pedestal_top_px': first_row(pedestal, 0.8, 'pedestal.png'),
        'jump_base_px': int(np.where(jump.any(1))[0].max()),
    }
    print(json.dumps(values, indent=1))


if __name__ == '__main__':
    main()
