#!/usr/bin/env python3
"""
process_assets.py — trim transparent edges off RGBA PNGs so the visible
object fills its canvas.

The user removes the background by hand (their preferred quality bar).
This script's only job is then to:

  1. Open the source PNG (must already be RGBA with a real alpha channel).
  2. Find the bounding box of all pixels with alpha > THRESHOLD.
  3. Crop to that box (with a tiny safety pad).
  4. Write the result to assets/<name>.png.

That's it. No checker-keying, no recoloring, no downscaling. The pixels
that ship to the game are exactly the pixels you saw in the source — just
re-cropped tight.

Sources are read from   assets/raw/        (originals you've cleaned)
                  or    assets/raw_pending/ (newly generated, awaiting cleanup)
Outputs are written to  assets/

Usage:
    python3 tools/process_assets.py                 # process everything in raw/
    python3 tools/process_assets.py --pending       # process raw_pending/ instead
    python3 tools/process_assets.py house.png ...   # process specific filenames
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
RAW = ASSETS / "raw"
PENDING = ASSETS / "raw_pending"

ALPHA_THRESHOLD = 8     # alpha values <= this are treated as fully transparent
SAFETY_PAD = 2          # px of empty space kept around the trimmed object


def trim_one(src: Path, dest: Path) -> tuple[int, tuple[int, int], tuple[int, int]]:
    """Crop transparent borders off `src`, write to `dest`.
    Returns (output_bytes, src_size, dest_size)."""
    img = Image.open(src)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    src_size = img.size
    alpha = img.split()[-1]

    # PIL's getbbox honors any nonzero alpha. Apply our threshold first so
    # very-near-transparent fringe pixels don't keep the box too large.
    if ALPHA_THRESHOLD > 0:
        alpha = alpha.point(lambda v: 255 if v > ALPHA_THRESHOLD else 0)

    bbox = alpha.getbbox()
    if bbox is None:
        # Fully transparent input — pass through untouched rather than 0x0.
        img.save(dest, format="PNG", optimize=True)
        return dest.stat().st_size, src_size, src_size

    x0, y0, x1, y1 = bbox
    w, h = img.size
    x0 = max(0, x0 - SAFETY_PAD)
    y0 = max(0, y0 - SAFETY_PAD)
    x1 = min(w, x1 + SAFETY_PAD)
    y1 = min(h, y1 + SAFETY_PAD)

    cropped = img.crop((x0, y0, x1, y1))
    cropped.save(dest, format="PNG", optimize=True)
    return dest.stat().st_size, src_size, cropped.size


def list_targets(source_dir: Path, specific: list[str]) -> list[Path]:
    if specific:
        return [source_dir / name for name in specific]
    return sorted(source_dir.glob("*.png"))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="specific filenames to process")
    parser.add_argument(
        "--pending", action="store_true",
        help="read from assets/raw_pending/ instead of assets/raw/",
    )
    parser.add_argument(
        "--source", type=Path, default=None,
        help="explicit source directory (overrides --pending)",
    )
    args = parser.parse_args(argv)

    source = args.source if args.source else (PENDING if args.pending else RAW)
    if not source.exists():
        print(f"error: source dir {source} does not exist.", file=sys.stderr)
        return 2

    targets = list_targets(source, args.files)
    if not targets:
        print(f"nothing to process in {source}.")
        return 0

    ASSETS.mkdir(parents=True, exist_ok=True)

    print(f"trimming {len(targets)} asset(s)  {source} -> {ASSETS}")
    total_before = total_after = 0
    for src in targets:
        if not src.exists():
            print(f"  ! {src.name}: not found, skipping")
            continue
        before = src.stat().st_size
        out_path = ASSETS / src.name
        size, src_dim, out_dim = trim_one(src, out_path)
        total_before += before
        total_after += size
        print(
            f"  ok {src.name:24s} "
            f"{before/1024:7.1f} KB -> {size/1024:6.1f} KB  "
            f"{src_dim[0]}x{src_dim[1]} -> {out_dim[0]}x{out_dim[1]}"
        )

    print(f"done. {total_before/1024/1024:.2f} MB -> {total_after/1024/1024:.2f} MB")
    return 0


def stage_existing_to_raw() -> int:
    """One-time helper: move loose PNGs in assets/ into assets/raw/."""
    RAW.mkdir(parents=True, exist_ok=True)
    moved = 0
    for png in ASSETS.glob("*.png"):
        dest = RAW / png.name
        if dest.exists():
            continue
        shutil.move(str(png), str(dest))
        moved += 1
    return moved


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--stage":
        n = stage_existing_to_raw()
        print(f"moved {n} loose PNGs into assets/raw/")
        sys.exit(0)
    sys.exit(main(sys.argv[1:]))
