"""Compose the per-camera layout the image model repaints: background plate plus clay and shadow.

Reads bg_<key>.png and clay_<key>.png written by render_grounded.py and writes
layout_<key>.jpg next to them, ready for upload.

  python3 compose_layout.py renders/            # every key found in the folder
  python3 compose_layout.py renders/ 00 high_04  # only these keys
"""
import sys
from pathlib import Path

from PIL import Image


def compose(bg_path, clay_path):
    """Alpha-composite the transparent clay pass over the background plate, as RGB."""
    bg = Image.open(bg_path).convert("RGBA")
    clay = Image.open(clay_path).convert("RGBA")
    if clay.size != bg.size:
        clay = clay.resize(bg.size, Image.LANCZOS)
    bg.alpha_composite(clay)
    return bg.convert("RGB")


def keys_in(folder):
    """Camera keys that have both a bg_ and a clay_ render."""
    folder = Path(folder)
    bgs = {p.stem[3:] for p in folder.glob("bg_*.png")}
    clays = {p.stem[5:] for p in folder.glob("clay_*.png")}
    return sorted(bgs & clays)


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    folder = Path(argv[0])
    keys = argv[1:] or keys_in(folder)
    if not keys:
        raise SystemExit(f"no bg_<key>.png + clay_<key>.png pairs in {folder}")
    for key in keys:
        out = folder / f"layout_{key}.jpg"
        compose(folder / f"bg_{key}.png", folder / f"clay_{key}.png").save(out, quality=90)
    print(f"wrote {len(keys)} layouts in {folder}")


if __name__ == "__main__":
    main(sys.argv[1:])
