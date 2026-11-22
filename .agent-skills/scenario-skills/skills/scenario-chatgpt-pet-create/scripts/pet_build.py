#!/usr/bin/env python3
"""Assemble a ChatGPT pet sheet with one pet size, ground line and anchor across every row.

Each row is scaled so the pet's height matches the idle row (the rows' prompts keep the
idle stance in the frame that sets the height), each frame keeps its own lift above the
row's ground (so a jump stays a jump), and each frame's planted lower body sits on the
same x. With --base-sheet, rows not rebuilt are copied byte for byte and new rows are
fitted to that sheet's idle row.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_common as pc  # noqa: E402


def frames_from_run(run: Path, job: str) -> list:
    folder = run / "frames" / job
    if not (folder / "review.json").exists():
        pc.fail(f"{job}: no frames yet; run pet_frames.py extract --job {job}")
    review = pc.read_json(folder / "review.json")
    if not review["ok"]:
        pc.fail(f"{job}: its extraction report has errors ({'; '.join(review['errors'])}); fix that row first")
    ground = review["row_ground"]
    frames = []
    for record in review["frames"]:
        x0, y0, x1, y1 = record["box"]
        anchor = record["anchor_x"]
        frames.append(
            {
                "crop": pc.load_rgba(folder / record["file"]),
                "left": anchor - x0,
                "right": x1 - anchor,
                "height": y1 - y0,
                "lift": ground - y1,
            }
        )
    return frames


def frames_from_cells(sheet: np.ndarray, job: str) -> list:
    row = pc.row_index(job)
    cells = [pc.cell(sheet, row, col) for col in range(pc.frame_count(job))]
    boxes = [pc.bbox(pc.visible(c)) for c in cells]
    if any(box is None for box in boxes):
        pc.fail(f"{job}: the base sheet has an empty frame in this row, so it cannot be re-placed")
    ground = max(box[3] for box in boxes)
    frames = []
    for c, (x0, y0, x1, y1) in zip(cells, boxes):
        anchor = pc.anchor_x(pc.visible(c))
        crop = c[y0:y1, x0:x1].copy()
        crop[crop[..., 3] <= pc.VISIBLE] = 0
        frames.append({"crop": crop, "left": anchor - x0, "right": x1 - anchor, "height": y1 - y0, "lift": ground - y1})
    return frames


def mirrored(frames: list) -> list:
    return [
        {"crop": f["crop"][:, ::-1].copy(), "left": f["right"], "right": f["left"], "height": f["height"], "lift": f["lift"]}
        for f in frames
    ]


def idle_geometry(sheet: np.ndarray):
    """Pet height, ground line and anchor x of a sheet's idle row, in cell pixels."""
    heights, bottoms, anchors = [], [], []
    for col in range(pc.frame_count("idle")):
        mask = pc.visible(pc.cell(sheet, 0, col))
        box = pc.bbox(mask)
        if box is None:
            pc.fail("the base sheet's idle row has an empty frame; it sets the pet's size, so rebuild idle too")
        heights.append(box[3] - box[1])
        bottoms.append(box[3])
        anchors.append(pc.anchor_x(mask))
    return pc.reference_height("idle", heights), float(np.median(bottoms)), float(np.median(anchors))


def fit_limit(frames: list, ref: float, anchor: float, ground: float) -> float:
    """Largest pet height (in cell pixels) at which every frame of the row stays inside the margins."""
    limits = []
    for f in frames:
        if f["left"] > 0:
            limits.append((anchor - pc.MARGIN) * ref / f["left"])
        if f["right"] > 0:
            limits.append((pc.CELL_W - pc.MARGIN - anchor) * ref / f["right"])
        limits.append((ground - pc.MARGIN) * ref / (f["lift"] + f["height"]))
    return min(limits)


def place(f: dict, scale: float, anchor: float, ground: float) -> tuple:
    crop = f["crop"]
    width = max(1, round(crop.shape[1] * scale))
    height = max(1, round(crop.shape[0] * scale))
    image = np.array(Image.fromarray(np.ascontiguousarray(crop)).resize((width, height), Image.Resampling.LANCZOS))
    left = min(max(round(anchor - f["left"] * scale), 0), pc.CELL_W - width)
    top = min(max(round(ground - f["lift"] * scale) - height, 0), pc.CELL_H - height)
    return image, left, top


def paste(image: np.ndarray, left: int, top: int) -> np.ndarray:
    canvas = np.zeros((pc.CELL_H, pc.CELL_W, 4), np.uint8)
    left = min(max(left, 0), pc.CELL_W - image.shape[1])
    top = min(max(top, 0), pc.CELL_H - image.shape[0])
    canvas[top : top + image.shape[0], left : left + image.shape[1]] = image
    return canvas


def snap(image: np.ndarray, left: int, top: int, grid: int, palette: np.ndarray) -> np.ndarray:
    """Put a placed frame on the sheet's pixel grid: best sub-grid offset, block average, palette, on/off alpha."""
    best = None
    for dy in range(grid):
        for dx in range(grid):
            canvas = paste(image, left + dx, top + dy)
            blocks = canvas.reshape(pc.CELL_H // grid, grid, pc.CELL_W // grid, grid, 4).astype(np.float32)
            score = float(blocks.var(axis=(1, 3)).sum())
            if best is None or score < best[0]:
                best = (score, blocks)
    blocks = best[1]
    weight = blocks[..., 3:4]
    alpha = weight.mean(axis=(1, 3))[..., 0]
    rgb = (blocks[..., :3] * weight).sum(axis=(1, 3)) / np.maximum(weight.sum(axis=(1, 3)), 1e-6)
    opaque = alpha >= 127.5
    nearest = ((rgb[..., None, :] - palette) ** 2).sum(-1).argmin(-1)
    small = np.zeros(alpha.shape + (4,), np.uint8)
    small[opaque, :3] = palette[nearest[opaque]].round().astype(np.uint8)
    small[opaque, 3] = 255
    return np.repeat(np.repeat(small, grid, axis=0), grid, axis=1)


def despill(cell_arr: np.ndarray, key, radius: int = 5, tolerance: float = 0.15, min_saturation: float = 0.1) -> np.ndarray:
    """Recolor edge pixels that carry the key color (or are semi-transparent) from their solid neighbors."""
    alpha = cell_arr[..., 3]
    band = (alpha > 0) & pc.dilate(alpha == 0, radius)
    if not band.any():
        return cell_arr
    lin = pc.to_linear(cell_arr[..., :3].astype(np.float64) / 255)
    pending = band & ((alpha < 250) | pc.key_like(cell_arr[..., :3], key, tolerance, min_saturation))
    filled = (alpha > 0) & ~pending
    changed = np.zeros_like(pending)
    for _ in range(2 * radius + 1):
        if not pending.any():
            break
        total = np.zeros_like(lin)
        count = np.zeros(alpha.shape)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    neighbor = pc.shift(filled, dy, dx)
                    total += pc.shift(lin, dy, dx) * neighbor[..., None]
                    count += neighbor
        update = pending & (count > 0)
        if not update.any():
            break
        lin[update] = total[update] / count[update][:, None]
        pending &= ~update
        filled |= update
        changed |= update
    if pending.any():
        lin[pending] = lin[pending].mean(-1, keepdims=True)
        changed |= pending
    out = cell_arr.copy()
    out[changed, :3] = (pc.to_srgb(lin[changed]) * 255).round().astype(np.uint8)
    out[alpha == 0] = 0
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", help="run folder made by pet_prepare.py init")
    parser.add_argument("--rows", help="comma list of rows to build from frames/ (default: every extracted row)")
    parser.add_argument("--base-sheet", help="existing sheet: rows not rebuilt are copied unchanged; sets the pet size")
    parser.add_argument("--mirror-left", action="store_true", help="build running-left from mirrored running-right frames")
    parser.add_argument("--reregister", help="comma list of base-sheet rows to re-place on the shared size and ground")
    parser.add_argument("--clean", action="store_true", help="empty unused cells and clear color under transparent pixels")
    parser.add_argument("--version", type=int, choices=(1, 2), help="sheet version (default: the run's)")
    parser.add_argument("--out", help="output path without extension (default <run>/final/spritesheet)")
    args = parser.parse_args(argv)

    run = Path(args.run)
    req = pc.read_json(run / "request.json")
    key = pc.parse_key(req["chroma_key"]["hex"])
    if req.get("pixel") and not (run / "pixel.json").exists():
        pc.fail("pixel mode needs pixel.json: run pet_prepare.py pixel first")
    pixel = pc.read_json(run / "pixel.json") if req.get("pixel") else None
    base_path = args.base_sheet or req.get("base_sheet")
    base = pc.load_rgba(base_path) if base_path else None
    base_version = pc.version_for_size(base.shape[1], base.shape[0]) if base is not None else None
    if base is not None and base_version is None:
        pc.fail("the base sheet is not 1536x1872 or 1536x2288")
    version = args.version or req.get("version") or base_version or 2
    if base_version and base_version > version:
        pc.fail("the base sheet is v2; build v2 (the package step cuts the v1 copy)")
    layout = [job for job, _, _ in pc.rows_for(version)]

    if args.rows:
        rebuild = [part.strip() for part in args.rows.split(",") if part.strip()]
    else:
        rebuild = [job for job in layout if (run / "frames" / job / "review.json").exists()]
        if args.mirror_left and "running-right" in rebuild and "running-left" not in rebuild:
            rebuild.append("running-left")
    reregister = [part.strip() for part in (args.reregister or "").split(",") if part.strip()]
    unknown = [job for job in rebuild + reregister if job not in layout]
    if unknown:
        pc.fail(f"not rows of a v{version} sheet: {', '.join(unknown)}")
    if reregister and base is None:
        pc.fail("--reregister needs --base-sheet")

    sources = {}
    for job in rebuild:
        if job == "running-left" and args.mirror_left:
            sources[job] = mirrored(frames_from_run(run, "running-right"))
        else:
            sources[job] = frames_from_run(run, job)
    for job in reregister:
        sources[job] = frames_from_cells(base, job)
    for job, frames in sources.items():
        if len(frames) != pc.frame_count(job):
            pc.fail(f"{job}: {len(frames)} frames, the row needs {pc.frame_count(job)}")

    if base is not None:
        pet_height, ground, anchor = idle_geometry(base)
    elif "idle" in sources:
        pet_height, ground, anchor = None, float(pc.CELL_H - pc.MARGIN), pc.CELL_W / 2
    else:
        pc.fail("the idle row sets the pet's size: extract it, or pass --base-sheet")
    refs = {job: pc.reference_height(job, [f["height"] for f in frames]) for job, frames in sources.items()}
    limits = {job: fit_limit(frames, refs[job], anchor, ground) for job, frames in sources.items()}
    if pet_height is None:
        pet_height = min(limits.values())

    width, height = pc.SHEET_SIZES[version]
    sheet = np.zeros((height, width, 4), np.uint8)
    if base is not None:
        sheet[: base.shape[0]] = base
    for row, (job, frames, _) in enumerate(pc.rows_for(version)):
        if args.clean and job not in sources:
            for col in range(frames, pc.COLUMNS):
                pc.cell(sheet, row, col)[:] = 0
            block = sheet[row * pc.CELL_H : (row + 1) * pc.CELL_H]
            block[block[..., 3] == 0] = 0

    palette = None
    if pixel:
        palette = np.array([pc.parse_key(c) for c in pixel["palette"]], np.float32)
    rows_report, warnings = [], []
    for job, frames in sources.items():
        target = min(pet_height, limits[job])
        if limits[job] < pet_height - 0.5:
            warnings.append(f"{job}: shrunk to {limits[job] / pet_height:.0%} of the pet's size to fit the cell")
        scale = target / refs[job]
        row = pc.row_index(job)
        sheet[row * pc.CELL_H : (row + 1) * pc.CELL_H] = 0
        for col, f in enumerate(frames):
            image, left, top = place(f, scale, anchor, ground)
            if pixel:
                cell_arr = snap(image, left, top, pixel["grid"], palette)
            else:
                cell_arr = despill(paste(image, left, top), key)
            pc.cell(sheet, row, col)[:] = pc.clear_transparent_rgb(cell_arr)
        rows_report.append({"job": job, "scale": round(scale, 4), "reference_height": refs[job], "frames": len(frames)})
    for row, (job, _, _) in enumerate(pc.rows_for(version)):
        if pc.bbox(pc.visible(pc.cell(sheet, row, 0))) is None:
            warnings.append(f"{job}: row is empty")

    prefix = Path(args.out) if args.out else run / "final" / "spritesheet"
    png, webp = prefix.with_suffix(".png"), prefix.with_suffix(".webp")
    pc.save_png(sheet, png)
    pc.save_webp(sheet, webp)
    report = {
        "ok": True,
        "version": version,
        "png": str(png),
        "webp": str(webp),
        "pet_height": round(pet_height, 2),
        "ground": ground,
        "anchor_x": round(anchor, 2),
        "base_sheet": str(base_path) if base_path else None,
        "pixel_grid": pixel["grid"] if pixel else None,
        "rows": rows_report,
        "warnings": warnings,
    }
    pc.write_json(run / "qa" / "build.json", report)
    print(json.dumps({k: report[k] for k in ("ok", "version", "png", "webp", "warnings")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
