"""Find camera zero: the sweep camera whose clay silhouette best matches the source picture.

Masks are cropped to their bounding box and scaled to a common height before the
intersection-over-union is taken, so framing differences do not matter. The source
must sit on a plain background (its color is estimated from the image border).

  python3 match_view.py source.png search/cameras.json [--top 6]

Prints the best (iou, azimuth, elevation) rows. Pass the best azimuth and elevation
to render_grounded.py as --az0 and --elev, then confirm by eye: a symmetric subject
can score almost the same from the front and the back.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def normalise(mask, size=160):
    """Crop a boolean mask to its bounding box, scale to 80% of `size` tall, centre on a 2:1 canvas."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return np.zeros((size, size * 2), bool)
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    k = (size * 0.8) / h
    nw, nh = max(1, int(w * k)), max(1, int(h * k))
    a = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR)) > 127
    a = a[:, : size * 2]
    canvas = np.zeros((size, size * 2), bool)
    oy, ox = (size - a.shape[0]) // 2, max(0, (size * 2 - a.shape[1]) // 2)
    canvas[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a
    return canvas


def iou(a, b):
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 0.0


def source_mask(path, threshold=28):
    """Foreground mask of a subject on a plain background, holes filled."""
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3),
                             im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    dist = np.linalg.norm(im - np.median(border, axis=0), axis=2)
    fg = Image.fromarray(((dist > threshold) * 255).astype(np.uint8))
    fg = fg.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))  # opening: drop specks
    # fill holes: flood the background from a padded corner, everything not reached is subject
    pad = Image.new("L", (fg.width + 2, fg.height + 2), 0)
    pad.paste(fg, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return np.asarray(pad)[1:-1, 1:-1] != 128


def rank(source_path, manifest_path):
    manifest = Path(manifest_path)
    src = normalise(source_mask(source_path))
    rows = []
    for view in json.loads(manifest.read_text())["views"]:
        path = Path(view["file"])
        if not path.is_absolute() and not path.exists():
            path = manifest.parent / path.name
        alpha = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 127
        rows.append((iou(src, normalise(alpha)), view["az"], view["el"]))
    return sorted(rows, reverse=True)


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 6
    for score, az, el in rank(argv[0], argv[1])[:top]:
        print(f"iou {score:.3f}  az {az:+.0f}  el {el:.0f}")


if __name__ == "__main__":
    main(sys.argv[1:])
