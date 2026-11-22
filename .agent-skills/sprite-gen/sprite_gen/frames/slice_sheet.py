# SPDX-License-Identifier: Apache-2.0
"""Slice a multi-figure grid sheet into per-cell standing cuts (tachi-e).

One generated image contains a COLSxROWS grid of the same character in
different expressions/poses on a flat chroma background. This module turns
that sheet into per-cell RGBA cuts on a fixed canvas with a shared feet
baseline and a normalized subject height.

Alpha truth is `sprite_gen.frames.extract.remove_chroma_background` (the 4-pass
chain: hard key cut -> key-depth in-band unmix -> soft-alpha unmix ->
trapped-spill despill); a sheet that is already transparent (chroma key
``none``) keeps its own alpha. ``alpha_floor`` then clears faint alpha haze
(`sprite_gen.frames.alpha_floor.clear_haze`) before parts are measured. This
module owns only cell geometry:

- whole-sheet connected components assigned to grid cells by centroid, so a
  figure's own cape/prop keeps its overflow past the cell border while a
  neighbour's overflow stays with the neighbour;
- components wider/taller than ~1.5 cells (figures fused through touching
  props) are split at cell borders and re-labelled *inside* each cell, so a
  neighbour's overhang does not stay fused to the cell's main figure;
- small split fragments touching the cell border are dropped as neighbour
  debris, while detached effects (hearts, sparkles, ZZZ) survive because
  they sit inside the cell;
- every cell's main figure is scaled so its height equals ``target_height``
  (per-cell normalization — generators routinely draw rows at different
  sizes) and its feet rest on ``baseline_y`` of the output canvas;
- ``scale="sheet"`` instead takes one factor for the whole sheet (the tallest
  main subject reaches ``target_height``), so props drawn at different sizes
  keep them; ``fit="contain"`` lowers the factor until every cut fits its
  canvas, so a wide subject is never cut. The report
  (``<prefix>slice-sheet.json``) states each cell's factor, size, box on the
  canvas, the main subject's base point and the pixels the canvas cut.

Field lessons baked in here (a cut-in overhaul, 2026-07-09):
sheet-wide max-height scaling preserves the generator's size jitter, grid
cropping without component logic imports neighbour fragments, and skipping
the in-cell re-label leaves a neighbour's hair fused to the figure.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.frames.alpha_floor import clear_haze
from sprite_gen.frames.cutout import KEY_TARGETS
from sprite_gen.frames.extract import remove_chroma_background
from sprite_gen.spec.runio import atomic_write_text
from sprite_gen.util.hexcolor import parse_hex
from sprite_gen.util.resample import resize_cell
from sprite_gen.util.console import utf8_streams

DEFAULT_KEY_THRESHOLD = 96.0
DEFAULT_FRINGE_KEY_THRESHOLD = 180.0
DEFAULT_FRINGE_DELTA = 18.0
DEFAULT_NOISE_MIN = 60
DEFAULT_DEBRIS_FRACTION = 0.30
MERGED_SPAN_FACTOR = 1.5
CHROMA_KEY_HELP = "magenta, green, #RRGGBB, or none for a sheet that is already transparent"
ALPHA_FLOOR_HELP = ("clear faint alpha haze below this alpha (1..255) before cutting, and write "
                    "<prefix>alpha-cleanup.json; 0 (default) leaves the alpha as it is")
ALPHA_EDGE_HELP = "with --alpha-floor: faint pixels this close to a solid pixel are its edge and are kept"
SCALES = ("cell", "sheet")
FITS = ("none", "contain")
SCALE_HELP = ("cell (default): each cell's main subject reaches --target-height; sheet: one factor for the whole "
              "sheet, the tallest main subject reaching --target-height, so every subject keeps its drawn size")
FIT_HELP = ("none (default): the canvas cuts whatever the factor puts past its edge; contain: the factor is lowered "
            "until the whole cut fits the canvas, the main subject still centred with its base on --baseline-y")
REPORT_KIND = "sprite-gen-slice-sheet"


def parse_chroma_key(value: str) -> tuple[int, int, int] | None:
    """A key colour, or None for ``none``: the sheet is already transparent and keeps its own alpha."""
    name = value.strip().lower()
    if name == "none":
        return None
    if name in KEY_TARGETS:
        return KEY_TARGETS[name]
    try:
        return parse_hex(name)
    except ValueError:
        raise ValueError(f"unsupported chroma key {value!r}; use magenta, green, #RRGGBB or none") from None


def _components(alpha: bytearray, width: int, height: int) -> list[list[int]]:
    label = bytearray(width * height)
    comps: list[list[int]] = []
    for start in range(width * height):
        if not alpha[start] or label[start]:
            continue
        queue = deque([start])
        label[start] = 1
        pixels: list[int] = []
        while queue:
            index = queue.popleft()
            pixels.append(index)
            x, y = index % width, index // width
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    other = ny * width + nx
                    if alpha[other] and not label[other]:
                        label[other] = 1
                        queue.append(other)
        comps.append(pixels)
    return comps


def _relabel_within_cell(part: list[int], width: int) -> list[list[int]]:
    """Re-run connectivity inside one cell's pixel set.

    After a merged component is split at cell borders, the cell's figure and
    a neighbour's overhang are disconnected *within* the cell even though
    they were one component sheet-wide.
    """
    part_set = set(part)
    seen: set[int] = set()
    subs: list[list[int]] = []
    for start in part:
        if start in seen:
            continue
        queue = deque([start])
        seen.add(start)
        sub: list[int] = []
        while queue:
            index = queue.popleft()
            sub.append(index)
            x, y = index % width, index // width
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                other = (y + dy) * width + (x + dx)
                if other in part_set and other not in seen:
                    seen.add(other)
                    queue.append(other)
        subs.append(sub)
    return subs


def _contain_factor(name: str, cut: dict, canvas: tuple[int, int], baseline_y: float) -> float:
    """The largest factor at which the whole cut fits the canvas, placed as `slice_sheet` places it:
    the main subject centred, its base on the baseline, every other part where it was drawn."""
    mx0, mx1, _my0, my1 = cut["main"]
    x0, x1, y0, y1 = cut["box"]
    center = (mx0 + mx1) / 2
    limits = [canvas[0] / 2 / max(center - x0, x1 + 1 - center), baseline_y / (my1 + 1 - y0)]
    if y1 > my1:
        room = canvas[1] - baseline_y
        if room <= 0:
            raise ValueError(f"{name}: a part below the main subject's base needs room under --baseline-y "
                             f"{baseline_y:g} on the {canvas[1]} px canvas")
        limits.append(room / (y1 - my1))
    return min(limits)


def slice_sheet(
    sheet: Path,
    out_dir: Path,
    chroma_key: tuple[int, int, int] | None,
    *,
    grid: tuple[int, int] = (3, 2),
    names: list[str] | None = None,
    prefix: str = "",
    canvas: tuple[int, int] = (512, 768),
    baseline_y: float = 725.0,
    target_height: float = 645.0,
    key_threshold: float = DEFAULT_KEY_THRESHOLD,
    fringe_key_threshold: float = DEFAULT_FRINGE_KEY_THRESHOLD,
    fringe_delta: float = DEFAULT_FRINGE_DELTA,
    unmix_reach: int = 4,
    spill_max_fraction: float = 0.005,
    noise_min: int = DEFAULT_NOISE_MIN,
    debris_fraction: float = DEFAULT_DEBRIS_FRACTION,
    alpha_floor: int = 0,
    alpha_edge: int = 2,
    scale: str = "cell",
    fit: str = "none",
) -> list[Path]:
    cols, rows = grid
    cell_count = cols * rows
    if names is not None and len(names) != cell_count:
        raise ValueError(f"--names needs exactly {cell_count} entries for grid {cols}x{rows}")
    if target_height > baseline_y:
        raise ValueError("target height must fit above the feet baseline")
    if scale not in SCALES:
        raise ValueError(f"scale must be one of {', '.join(SCALES)}, not {scale!r}")
    if fit not in FITS:
        raise ValueError(f"fit must be one of {', '.join(FITS)}, not {fit!r}")
    if fit == "contain" and not 0 < baseline_y <= canvas[1]:
        raise ValueError(f"--fit contain needs --baseline-y inside the {canvas[1]} px canvas")
    names = names or [f"cell-{cell}" for cell in range(cell_count)]

    rgba = Image.open(sheet).convert("RGBA")
    if chroma_key is not None:
        rgba = remove_chroma_background(
            rgba,
            chroma_key,
            key_threshold,
            fringe_key_threshold,
            fringe_delta,
            unmix_reach=unmix_reach,
            spill_max_fraction=spill_max_fraction,
        )
    cleanup = None
    if alpha_floor:
        rgba, cleanup = clear_haze(rgba, floor=alpha_floor, edge=alpha_edge)
    width, height = rgba.size
    pixels = rgba.load()
    cell_w, cell_h = width / cols, height / rows

    alpha = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:
                alpha[y * width + x] = 1

    def cell_of(index: int) -> int:
        return min(int((index // width) // cell_h), rows - 1) * cols + min(int((index % width) // cell_w), cols - 1)

    buckets: dict[int, list[list[int]]] = {i: [] for i in range(cell_count)}
    for comp in _components(alpha, width, height):
        if len(comp) < noise_min:
            continue
        xs = [i % width for i in comp]
        ys = [i // width for i in comp]
        if (max(xs) - min(xs)) > cell_w * MERGED_SPAN_FACTOR or (max(ys) - min(ys)) > cell_h * MERGED_SPAN_FACTOR:
            parts: dict[int, list[int]] = {}
            for index in comp:
                parts.setdefault(cell_of(index), []).append(index)
            for cell, part in parts.items():
                if len(part) < noise_min:
                    continue
                for sub in _relabel_within_cell(part, width):
                    if len(sub) >= noise_min:
                        buckets[cell].append(sub)
            continue
        centroid = min(int((sum(ys) / len(ys)) // cell_h), rows - 1) * cols + min(
            int((sum(xs) / len(xs)) // cell_w), cols - 1
        )
        buckets[centroid].append(comp)

    # Neighbour-debris rule: fragments touching the cell border and much
    # smaller than the cell's main figure are overhang from a neighbour.
    for cell, comps_in in buckets.items():
        if len(comps_in) < 2:
            continue
        main_size = max(len(c) for c in comps_in)
        row, col = divmod(cell, cols)
        bx0, bx1 = col * cell_w, (col + 1) * cell_w
        by0, by1 = row * cell_h, (row + 1) * cell_h
        kept = []
        for comp in comps_in:
            if len(comp) < main_size * debris_fraction:
                touches = any(
                    abs(i % width - bx0) < 2
                    or abs(i % width - bx1) < 2
                    or abs(i // width - by0) < 2
                    or abs(i // width - by1) < 2
                    for i in comp
                )
                if touches:
                    continue
            kept.append(comp)
        buckets[cell] = kept

    out_dir.mkdir(parents=True, exist_ok=True)
    if cleanup is not None:
        atomic_write_text(out_dir / f"{prefix}alpha-cleanup.json", json.dumps(cleanup, indent=2) + "\n")
        print(f"{sheet.name} alpha haze {cleanup['haze_fraction_before']:.2%} -> "
              f"{cleanup['haze_fraction_after']:.2%} (floor {alpha_floor}, cleared {cleanup['cleared_pixels']} px)")
    # Every cell is measured before any is written: the sheet factor needs them all, and an empty
    # cell fails the sheet before a single cut lands.
    cuts = []
    for cell in range(cell_count):
        comps_in = buckets[cell]
        if not comps_in:
            raise SystemExit(f"{sheet}: cell {cell} has no subject after extraction")
        main = max(comps_in, key=len)
        main_xs = [i % width for i in main]
        main_ys = [i // width for i in main]
        all_pixels = {i for comp in comps_in for i in comp}
        xs = [i % width for i in all_pixels]
        ys = [i // width for i in all_pixels]
        cuts.append({"name": names[cell], "parts": comps_in, "pixels": all_pixels,
                     "main": (min(main_xs), max(main_xs), min(main_ys), max(main_ys)),
                     "box": (min(xs), max(xs), min(ys), max(ys))})

    # The factor: the height rule (each main subject reaches the target, or with `sheet` the tallest
    # does and the rest keep their drawn size), lowered by `contain` until the cut fits its canvas.
    def main_height(cut: dict) -> int:
        return cut["main"][3] - cut["main"][2] + 1

    for cut in cuts:
        cut["factor"], cut["factor_from"] = target_height / main_height(cut), "target_height"
        cut["fits"] = _contain_factor(cut["name"], cut, canvas, baseline_y) if fit == "contain" else None
    sheet_factor = sheet_from = None
    if scale == "sheet":
        tallest = max(cuts, key=main_height)
        sheet_factor, sheet_from = target_height / main_height(tallest), {"rule": "target_height", "cell": tallest["name"]}
        for cut in cuts:
            if cut["fits"] is not None and cut["fits"] < sheet_factor:
                sheet_factor, sheet_from = cut["fits"], {"rule": "fit", "cell": cut["name"]}
        for cut in cuts:
            cut["factor"], cut["factor_from"] = sheet_factor, sheet_from["rule"]
    else:
        for cut in cuts:
            if cut["fits"] is not None and cut["fits"] < cut["factor"]:
                cut["factor"], cut["factor_from"] = cut["fits"], "fit"

    written: list[Path] = []
    records = []
    for cell, cut in enumerate(cuts):
        factor = cut["factor"]
        mx0, mx1, main_top, main_bottom = cut["main"]
        x0, x1, y0, y1 = cut["box"]
        piece = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
        piece_px = piece.load()
        for index in cut["pixels"]:
            x, y = index % width, index // width
            piece_px[x - x0, y - y0] = pixels[x, y]
        new_size = (max(1, round(piece.size[0] * factor)), max(1, round(piece.size[1] * factor)))
        piece = resize_cell(piece, new_size)

        main_center_x = (mx0 + mx1) / 2
        out = Image.new("RGBA", canvas, (0, 0, 0, 0))
        offset_x = round(canvas[0] / 2 - (main_center_x - x0) * factor)
        offset_y = round(baseline_y - (main_bottom - y0 + 1) * factor)
        if fit == "contain":
            # the factor fits the cut; rounding may leave it a pixel over an edge, so it moves back in
            offset_x = min(max(offset_x, 0), canvas[0] - new_size[0])
            offset_y = min(max(offset_y, 0), canvas[1] - new_size[1])
        else:
            offset_x, offset_y = max(0, offset_x), max(0, offset_y)
        out.alpha_composite(piece, (offset_x, offset_y))
        coverage = np.asarray(piece.getchannel("A"))
        clipped = int(np.count_nonzero(coverage)) - int(np.count_nonzero(
            coverage[:max(0, canvas[1] - offset_y), :max(0, canvas[0] - offset_x)]))

        path = out_dir / f"{prefix}{cut['name']}.png"
        out.save(path)
        written.append(path)
        main_w, main_h = mx1 - mx0 + 1, main_bottom - main_top + 1
        print(
            f"{sheet.name} cell{cell} -> {path.name} "
            f"main_h {main_h} -> {round(main_h * factor)} "
            f"comps {len(cut['parts'])}"
        )
        if clipped:
            print(f"{sheet.name} cell{cell}: the canvas cut {clipped} px of {path.name} (--fit contain keeps it whole)")
        records.append({
            "name": cut["name"],
            "file": path.name,
            "factor": factor,
            "factor_from": cut["factor_from"],
            "subject": {"sheet": {"w": main_w, "h": main_h},
                        "canvas": {"w": round(main_w * factor), "h": round(main_h * factor)}},
            "box": {"x": offset_x, "y": offset_y, "w": new_size[0], "h": new_size[1]},
            # the main subject's base centre where it landed: the point it stands on
            "anchor": [round(offset_x + ((mx0 + mx1 + 1) / 2 - x0) * new_size[0] / (x1 - x0 + 1), 3),
                       round(offset_y + (main_bottom + 1 - y0) * new_size[1] / (y1 - y0 + 1), 3)],
            "clipped_px": clipped,
            "parts": len(cut["parts"]),
        })

    report = {
        "kind": REPORT_KIND,
        "version": 1,
        "sheet": sheet.name,
        "grid": [cols, rows],
        "canvas": {"w": canvas[0], "h": canvas[1]},
        "baseline_y": baseline_y,
        "target_height": target_height,
        "scale": scale,
        "fit": fit,
        "factor": sheet_factor,
        "factor_from": sheet_from,
        "alpha_cleanup": f"{prefix}alpha-cleanup.json" if cleanup is not None else None,
        "cells": records,
    }
    report_path = out_dir / f"{prefix}slice-sheet.json"
    atomic_write_text(report_path, json.dumps(report, indent=2, allow_nan=False) + "\n")
    factor_text = f" factor {sheet_factor:.4f} ({sheet_from['rule']}, {sheet_from['cell']})" if sheet_factor else ""
    print(f"{sheet.name}: scale {scale}, fit {fit}{factor_text}; report {report_path.name}")
    return written


def run(
    *,
    sheet: Path,
    out_dir: Path,
    chroma_key: str,
    grid: tuple[int, int] = (3, 2),
    names: str | None = None,
    prefix: str = "",
    cell_width: int = 512,
    cell_height: int = 768,
    baseline_y: float = 725.0,
    target_height: float = 645.0,
    key_threshold: float = DEFAULT_KEY_THRESHOLD,
    fringe_key_threshold: float = DEFAULT_FRINGE_KEY_THRESHOLD,
    fringe_delta: float = DEFAULT_FRINGE_DELTA,
    fringe_unmix_reach: int = 4,
    spill_max_fraction: float = 0.005,
    noise_min: int = DEFAULT_NOISE_MIN,
    debris_fraction: float = DEFAULT_DEBRIS_FRACTION,
    alpha_floor: int = 0,
    alpha_edge: int = 2,
    scale: str = "cell",
    fit: str = "none",
) -> int:
    name_list = [part.strip() for part in names.split(",") if part.strip()] if names else None
    slice_sheet(
        sheet,
        out_dir,
        parse_chroma_key(chroma_key),
        grid=grid,
        names=name_list,
        prefix=prefix,
        canvas=(cell_width, cell_height),
        baseline_y=baseline_y,
        target_height=target_height,
        key_threshold=key_threshold,
        fringe_key_threshold=fringe_key_threshold,
        fringe_delta=fringe_delta,
        unmix_reach=fringe_unmix_reach,
        spill_max_fraction=spill_max_fraction,
        noise_min=noise_min,
        debris_fraction=debris_fraction,
        alpha_floor=alpha_floor,
        alpha_edge=alpha_edge,
        scale=scale,
        fit=fit,
    )
    return 0


def _parse_grid(value: str) -> tuple[int, int]:
    cols, rows = value.lower().split("x")
    return int(cols), int(rows)


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sheet", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--chroma-key", required=True, help=CHROMA_KEY_HELP)
    parser.add_argument("--grid", type=_parse_grid, default=(3, 2), help="COLSxROWS, default 3x2")
    parser.add_argument("--names", help="comma-separated output names, one per cell in reading order")
    parser.add_argument("--prefix", default="")
    parser.add_argument("--cell-width", type=int, default=512)
    parser.add_argument("--cell-height", type=int, default=768)
    parser.add_argument("--baseline-y", type=float, default=725.0)
    parser.add_argument("--target-height", type=float, default=645.0)
    parser.add_argument("--key-threshold", type=float, default=DEFAULT_KEY_THRESHOLD)
    parser.add_argument("--fringe-key-threshold", type=float, default=DEFAULT_FRINGE_KEY_THRESHOLD)
    parser.add_argument("--fringe-delta", type=float, default=DEFAULT_FRINGE_DELTA)
    parser.add_argument("--fringe-unmix-reach", type=int, default=4)
    parser.add_argument("--spill-max-fraction", type=float, default=0.005)
    parser.add_argument("--noise-min", type=int, default=DEFAULT_NOISE_MIN)
    parser.add_argument("--debris-fraction", type=float, default=DEFAULT_DEBRIS_FRACTION)
    parser.add_argument("--alpha-floor", type=int, default=0, help=ALPHA_FLOOR_HELP)
    parser.add_argument("--alpha-edge", type=int, default=2, help=ALPHA_EDGE_HELP)
    parser.add_argument("--scale", choices=SCALES, default="cell", help=SCALE_HELP)
    parser.add_argument("--fit", choices=FITS, default="none", help=FIT_HELP)
    args = parser.parse_args(argv)
    return run(**vars(args))


if __name__ == "__main__":
    raise SystemExit(main())
