#!/usr/bin/env python3
"""Render review sheets and animated GIFs from a finished ChatGPT pet sheet.

  contact  every row labeled, cells on a checkerboard
  looks    the neutral idle frame, the 16 look directions labeled, and enlarged head crops
  gif      one GIF per state, the all-states result as pet.gif (soft background) and
           pet-transparent.gif, an idle-jump-idle loop, and the look-around loop (v2)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_common as pc  # noqa: E402

SOFT = "#F3F0EB"
LABEL_H = 20


def load_sheet(path):
    arr = pc.load_rgba(path)
    version = pc.version_for_size(arr.shape[1], arr.shape[0])
    if version is None:
        pc.fail(f"{path} is {arr.shape[1]}x{arr.shape[0]}, not a pet sheet")
    return arr, version


def checker(width: int, height: int, size: int = 8) -> Image.Image:
    yy, xx = np.mgrid[0:height, 0:width]
    light = ((yy // size + xx // size) % 2 == 0)[..., None]
    return Image.fromarray(np.where(light, 255, 226).astype(np.uint8).repeat(3, axis=2))


def contact(arr, version, scale=0.5) -> Image.Image:
    cw, ch = round(pc.CELL_W * scale), round(pc.CELL_H * scale)
    rows = pc.rows_for(version)
    sheet = Image.new("RGB", (cw * pc.COLUMNS, len(rows) * (ch + LABEL_H)), (247, 247, 247))
    draw = ImageDraw.Draw(sheet)
    background = checker(cw, ch)
    for row, (job, frames, _) in enumerate(rows):
        y = row * (ch + LABEL_H)
        draw.rectangle([0, y, sheet.width, y + LABEL_H - 1], fill=(17, 17, 17))
        draw.text((6, y + 4), f"row {row}: {job} ({frames} frames)", fill=(255, 255, 255))
        for col in range(pc.COLUMNS):
            tile = background.copy()
            image = Image.fromarray(np.ascontiguousarray(pc.cell(arr, row, col))).resize((cw, ch), Image.Resampling.LANCZOS)
            tile.paste(image, (0, 0), image)
            sheet.paste(tile, (col * cw, y + LABEL_H))
            outline = (24, 160, 88) if col < frames else (204, 51, 68)
            draw.rectangle([col * cw, y + LABEL_H, (col + 1) * cw - 1, y + LABEL_H + ch - 1], outline=outline)
    return sheet


def looks(arr) -> Image.Image:
    band = pc.CELL_H + LABEL_H
    sheet = Image.new("RGB", (pc.CELL_W * 8, band * 5), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)

    def put(image, label, index, line):
        x, y = index * pc.CELL_W, line * band
        tile = Image.new("RGB", (pc.CELL_W, pc.CELL_H), (242, 242, 242))
        tile.paste(image, ((pc.CELL_W - image.width) // 2, (pc.CELL_H - image.height) // 2), image)
        sheet.paste(tile, (x, y + LABEL_H))
        draw.text((x + 6, y + 4), label, fill=(0, 0, 0))

    put(Image.fromarray(np.ascontiguousarray(pc.cell(arr, 0, 0))), "neutral (idle)", 0, 0)
    for i, label in enumerate(pc.LOOK_LABELS):
        c = pc.cell(arr, 9 + i // 8, i % 8)
        caption = f"{label} {pc.EXPECTED[label]}"
        put(Image.fromarray(np.ascontiguousarray(c)), caption, i % 8, 1 + i // 8)
        box = pc.bbox(pc.visible(c))
        if box is None:
            continue
        x0, y0, x1, y1 = box
        head = c[max(0, y0 - 6) : y0 + int(0.52 * (y1 - y0)), max(0, x0 - 6) : min(pc.CELL_W, x1 + 6)]
        zoom = Image.fromarray(np.ascontiguousarray(head))
        factor = min((pc.CELL_W - 8) / zoom.width, (pc.CELL_H - 8) / zoom.height)
        zoom = zoom.resize((max(1, int(zoom.width * factor)), max(1, int(zoom.height * factor))), Image.Resampling.LANCZOS)
        put(zoom, f"zoom {caption}", i % 8, 3 + i // 8)
    return sheet


def sequence(arr, jobs, repeat=1) -> list:
    frames = []
    for job in jobs:
        row = pc.row_index(job)
        _, count, durations = pc.ROWS[row]
        for _ in range(repeat):
            frames += [(pc.cell(arr, row, col).copy(), durations[col]) for col in range(count)]
    return frames


def write_gif(frames: list, path: Path, background, transparent: bool, scale: int = 1) -> None:
    """One shared palette for every frame; soft edges are matted onto the background color.

    Index 254 is the exact background and 255 the transparent index, so median cut
    never shifts the background color.
    """
    color = np.asarray(background, np.float32)
    flats, alphas = [], []
    for rgba, _ in frames:
        if scale > 1:
            rgba = np.repeat(np.repeat(rgba, scale, axis=0), scale, axis=1)
        alpha = rgba[..., 3:4].astype(np.float32) / 255
        flats.append((rgba[..., :3] * alpha + color * (1 - alpha)).round().astype(np.uint8))
        alphas.append(rgba[..., 3])
    stacked = Image.fromarray(np.concatenate(flats, axis=0))
    palette = stacked.quantize(254, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    entries = (palette.getpalette() + [0] * 768)[: 254 * 3]
    palette.putpalette(entries + [int(c) for c in background] + [0, 0, 0])
    images = []
    for flat, alpha in zip(flats, alphas):
        image = Image.fromarray(flat).quantize(palette=palette, dither=Image.Dither.NONE)
        box = (0, 0, image.width, image.height)
        image.paste(254, box, Image.fromarray(((alpha == 0) * 255).astype(np.uint8)))
        if transparent:
            image.paste(255, box, Image.fromarray(((alpha < 128) * 255).astype(np.uint8)))
        images.append(image)
    options = {"save_all": True, "append_images": images[1:], "duration": [d for _, d in frames], "loop": 0, "disposal": 2, "optimize": False}
    if transparent:
        options["transparency"] = 255
    path.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(path, **options)


def cmd_gif(args) -> int:
    arr, version = load_sheet(args.sheet)
    out = Path(args.out_dir)
    background = pc.parse_key(args.background)
    written = []

    def emit(name, frames, transparent=False):
        write_gif(frames, out / name, background, transparent, args.scale)
        written.append(name)

    standard = [job for job, _, _ in pc.rows_for(version) if not job.startswith("look-")]
    for job in standard:
        emit(f"{job}.gif", sequence(arr, [job], repeat=2))
    everything = sequence(arr, standard, repeat=2)
    if version == 2:
        everything += sequence(arr, ["look-9", "look-10"])
        emit("look-loop.gif", sequence(arr, ["look-9", "look-10"], repeat=2))
    emit("pet.gif", everything)
    emit("pet-transparent.gif", everything, transparent=True)
    emit("idle-jump-idle.gif", sequence(arr, ["idle"]) + sequence(arr, ["jumping"]) + sequence(arr, ["idle"]))
    print(json.dumps({"ok": True, "out_dir": str(out), "gifs": written}))
    return 0


def cmd_contact(args) -> int:
    arr, version = load_sheet(args.sheet)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    contact(arr, version, args.scale).save(args.out)
    print(json.dumps({"ok": True, "out": args.out}))
    return 0


def cmd_looks(args) -> int:
    arr, version = load_sheet(args.sheet)
    if version != 2:
        pc.fail("look directions exist only on a v2 sheet (1536x2288)")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    looks(arr).save(args.out)
    print(json.dumps({"ok": True, "out": args.out}))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("contact", help="labeled contact sheet of every row")
    c.add_argument("sheet")
    c.add_argument("--out", required=True)
    c.add_argument("--scale", type=float, default=0.5)
    c.set_defaults(func=cmd_contact)
    lk = sub.add_parser("looks", help="labeled sheet of the 16 look directions")
    lk.add_argument("sheet")
    lk.add_argument("--out", required=True)
    lk.set_defaults(func=cmd_looks)
    g = sub.add_parser("gif", help="animated GIFs")
    g.add_argument("sheet")
    g.add_argument("--out-dir", required=True)
    g.add_argument("--background", default=SOFT, help=f"#RRGGBB soft background and edge matte (default {SOFT})")
    g.add_argument("--scale", type=int, default=1, help="whole-number enlargement")
    g.set_defaults(func=cmd_gif)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
