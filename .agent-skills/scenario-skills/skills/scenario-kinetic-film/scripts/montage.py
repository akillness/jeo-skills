"""Build a labeled contact sheet: tiles of the same width, each labeled with its file name.

usage: montage.py <out.jpg> <cols> <width> <image> [<image> ...]

Labels drop the t_ prefix and .png suffix that snap.mjs gives its stills. Tiles of other aspect ratios
are padded to the tallest tile.
"""

import argparse
import os
import sys

import cv2
import numpy as np

BORDER = (0, 0, 200)


def tile(path, width):
    im = cv2.imread(path)
    if im is None:
        sys.exit(f"could not read {path} as an image")
    h = int(im.shape[0] * width / im.shape[1])
    im = cv2.resize(im, (width, h), interpolation=cv2.INTER_AREA)
    label = os.path.basename(path).replace("t_", "").replace(".png", "")
    cv2.putText(im, label, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    return im


def sheet(tiles, cols):
    h = max(t.shape[0] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(0, 0, 0)) for t in tiles]
    rows = []
    for i in range(0, len(tiles), cols):
        row = tiles[i : i + cols]
        row += [np.zeros_like(tiles[0])] * (cols - len(row))
        bordered = [cv2.copyMakeBorder(x, 0, 0, 0, 4, cv2.BORDER_CONSTANT, value=BORDER) for x in row]
        rows.append(cv2.copyMakeBorder(np.hstack(bordered), 0, 4, 0, 0, cv2.BORDER_CONSTANT, value=BORDER))
    return np.vstack(rows)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("out")
    ap.add_argument("cols", type=int)
    ap.add_argument("width", type=int, help="tile width in px")
    ap.add_argument("images", nargs="+")
    a = ap.parse_args(argv)
    if a.cols < 1 or a.width < 16:
        sys.exit("cols must be 1 or more and width 16 px or more")
    out = os.path.abspath(a.out)
    if any(os.path.abspath(p) == out for p in a.images):
        sys.exit(f"{a.out} is also an input: write the sheet somewhere else")
    if not cv2.imwrite(a.out, sheet([tile(p, a.width) for p in a.images], a.cols), [cv2.IMWRITE_JPEG_QUALITY, 88]):
        sys.exit(f"could not write {a.out}")
    print(a.out)


if __name__ == "__main__":
    main()
