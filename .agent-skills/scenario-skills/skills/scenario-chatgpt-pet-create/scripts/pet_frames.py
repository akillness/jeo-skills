#!/usr/bin/env python3
"""Cut generated pet strips into frames, or split an existing pet sheet for an update.

  extract  generated/<job>.png -> frames/<job>/NN.png at source resolution, plus review.json
  split    an existing sheet -> per-row frames, enlarged row strips, an identity reference, summary.json
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


def box_distance(a, b) -> float:
    dx = max(b[0] - a[2], a[0] - b[2], 0)
    dy = max(b[1] - a[3], a[1] - b[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def group_poses(arr: np.ndarray, frames: int):
    """Connected shapes grouped into `frames` poses, ordered left to right."""
    labels, comps = pc.components(pc.visible(arr))
    if not comps:
        raise pc.PetError("no sprite pixels left after removing the background")
    by_area = sorted(comps, key=lambda c: c["area"], reverse=True)
    largest = by_area[0]["area"]
    seeds = [c for c in by_area if c["area"] >= max(120, 0.2 * largest)]
    if len(seeds) < frames:
        seeds = by_area[:frames]
    if len(seeds) < frames:
        raise pc.PetError(f"expected {frames} poses, found {len(seeds)} separate shapes")
    if len(seeds) > frames:
        if seeds[frames]["area"] >= 0.5 * np.median([c["area"] for c in seeds[:frames]]):
            raise pc.PetError(f"expected {frames} poses, found at least {frames + 1}")
        seeds = seeds[:frames]
    noise = max(12, 0.002 * largest)
    groups = {seed["id"]: [seed["id"]] for seed in seeds}
    for comp in comps:
        if comp["id"] in groups or comp["area"] < noise:
            continue
        nearest = min(seeds, key=lambda seed: box_distance(comp["box"], seed["box"]))
        groups[nearest["id"]].append(comp["id"])
    ordered = sorted(seeds, key=lambda seed: seed["box"][0] + seed["box"][2])
    return labels, [groups[seed["id"]] for seed in ordered]


def fit_preview(frames: list, path: Path) -> None:
    """Frames scaled into pet cells side by side on gray, numbered: a quick visual check."""
    sheet = Image.new("RGB", (pc.CELL_W * len(frames), pc.CELL_H + 18), (200, 200, 200))
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        image = Image.fromarray(frame)
        image.thumbnail((pc.CELL_W - 2 * pc.MARGIN, pc.CELL_H - 2 * pc.MARGIN), Image.Resampling.LANCZOS)
        x = index * pc.CELL_W + (pc.CELL_W - image.width) // 2
        sheet.paste(image, (x, 18 + pc.CELL_H - pc.MARGIN - image.height), image)
        draw.text((index * pc.CELL_W + 4, 3), str(index), fill=(0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def cmd_extract(args) -> int:
    run = Path(args.run)
    req = pc.read_json(run / "request.json")
    jobs = {job["id"]: job for job in pc.read_json(run / "jobs.json")["jobs"]}
    if args.job not in jobs:
        pc.fail(f"no job {args.job!r} in jobs.json")
    job = jobs[args.job]
    key = pc.parse_key(req["chroma_key"]["hex"])
    source = run / job["output"]
    if not source.is_file():
        pc.fail(f"{source} not found: download the generated image there first")
    arr = pc.remove_key(pc.load_rgba(source), key, args.threshold)
    out_dir = run / "frames" / args.job
    report_path = out_dir / "review.json"
    try:
        labels, groups = group_poses(arr, job["frames"])
    except pc.PetError as error:
        (out_dir / "preview.png").unlink(missing_ok=True)
        report = {"ok": False, "job": args.job, "errors": [str(error)], "warnings": []}
        pc.write_json(report_path, report)
        print(json.dumps(report))
        return 1
    for old in out_dir.glob("[0-9][0-9].png"):
        old.unlink()
    distance = pc.key_distance(arr, key)
    # Edge pixels blend with the background on every pet; only pixels inside the pet that look
    # like the key mean the key is a poor choice.
    inside = ~pc.dilate(~pc.visible(arr), 2)
    height, width = arr.shape[:2]
    frames, crops, errors, warnings = [], [], [], []
    for index, ids in enumerate(groups):
        mask = np.isin(labels, ids)
        x0, y0, x1, y1 = pc.bbox(mask)
        crop = arr[y0:y1, x0:x1].copy()
        crop[~mask[y0:y1, x0:x1]] = 0
        name = f"{index:02d}.png"
        pc.save_png(crop, out_dir / name)
        crops.append(crop)
        touches = bool(mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any())
        near_key = int(((distance <= 150) & mask & inside).sum())
        frames.append(
            {
                "index": index,
                "file": name,
                "box": [x0, y0, x1, y1],
                "area": int(mask.sum()),
                "anchor_x": round(pc.anchor_x(mask), 2),
                "near_key_pixels": near_key,
            }
        )
        if touches:
            errors.append(f"pose {index} touches the image edge, so it is cut off")
        if near_key > 800:
            warnings.append(f"pose {index}: {near_key} pixels inside the pet are close to the key color")
    areas = [frame["area"] for frame in frames]
    median = float(np.median(areas))
    for frame in frames:
        if frame["area"] < 0.35 * median or frame["area"] > 2.75 * median:
            warnings.append(f"pose {frame['index']} is {frame['area'] / median:.0%} of the median pose area")
    if args.job == "base":
        share = frames[0]["near_key_pixels"] / max(1, frames[0]["area"])
        if share > 0.02:
            warnings.append(f"{share:.0%} of the pet is close to the key color; re-run init with another --chroma-key")
        crop = crops[0]
        pc.save_png(pc.on_key(crop, key, pad=max(16, crop.shape[0] // 8)), run / "references" / "base.png")
    report = {
        "ok": not errors,
        "job": args.job,
        "source": str(source),
        "strip_size": [width, height],
        "row_ground": max(frame["box"][3] for frame in frames),
        "frames": frames,
        "errors": errors,
        "warnings": warnings,
    }
    pc.write_json(report_path, report)
    fit_preview(crops, out_dir / "preview.png")
    print(json.dumps({key_: report[key_] for key_ in ("ok", "job", "errors", "warnings")}))
    return 0 if report["ok"] else 1


def pixel_grid(arr: np.ndarray, version: int):
    """Grid size when every used cell is made of uniform k x k blocks with on/off alpha (1: on/off alpha only)."""
    if not np.isin(arr[..., 3], (0, 255)).all():
        return None
    for k in (8, 4, 2):
        uniform = True
        for row, (_, frames, _) in enumerate(pc.rows_for(version)):
            for col in range(frames):
                blocks = pc.cell(arr, row, col).reshape(pc.CELL_H // k, k, pc.CELL_W // k, k, 4)
                if not (blocks == blocks[:, :1, :, :1]).all():
                    uniform = False
                    break
            if not uniform:
                break
        if uniform:
            return k
    return 1


def enlarge(arr: np.ndarray, factor: float, nearest: bool) -> np.ndarray:
    if nearest:
        k = max(1, int(factor))
        return np.repeat(np.repeat(arr, k, axis=0), k, axis=1)
    size = (max(1, round(arr.shape[1] * factor)), max(1, round(arr.shape[0] * factor)))
    return np.array(Image.fromarray(np.ascontiguousarray(arr)).resize(size, Image.Resampling.LANCZOS))


def cmd_split(args) -> int:
    sheet = Path(args.sheet).resolve()
    out = Path(args.out)
    arr = pc.load_rgba(sheet)
    height, width = arr.shape[:2]
    version = pc.version_for_size(width, height)
    if version is None:
        report = {
            "ok": False,
            "sheet": str(sheet),
            "size": [width, height],
            "error": "not a pet sheet (1536x1872 or 1536x2288); use it as reference art with a new pet instead",
        }
        pc.write_json(out / "summary.json", report)
        print(json.dumps(report))
        return 1
    if args.chroma_key:
        rgb = pc.parse_key(args.chroma_key)
        key = {"name": pc.key_hex(rgb), "hex": pc.key_hex(rgb), "selection": "manual"}
    else:
        name, rgb, score = pc.choose_key(pc.sample_pixels(arr, side=512))
        key = {"name": name, "hex": pc.key_hex(rgb), "selection": "sheet", "score": score}
    grid = pixel_grid(arr, version)
    rows = []
    for row, (job, frames, _) in enumerate(pc.rows_for(version)):
        cells = [pc.cell(arr, row, col) for col in range(frames)]
        for col, cell_arr in enumerate(cells):
            pc.save_png(cell_arr, out / "frames" / job / f"{col:02d}.png")
        strip = pc.on_key(np.concatenate(cells, axis=1), rgb)
        pc.save_png(enlarge(strip, 2, bool(grid)), out / "strips" / f"{job}.png")
        empty = [col for col, cell_arr in enumerate(cells) if pc.bbox(pc.visible(cell_arr)) is None]
        rows.append({"job": job, "frames": frames, "empty_frames": empty})
    idle = pc.cell(arr, 0, 0)
    box = pc.bbox(pc.visible(idle))
    if box is None:
        pc.fail("the first idle frame is empty, so there is no identity to keep")
    pet = idle[box[1] : box[3], box[0] : box[2]]
    factor = 512 / pet.shape[0]
    big = enlarge(pet, factor, bool(grid))
    pc.save_png(pc.on_key(big, rgb, pad=big.shape[0] // 8), out / "identity.png")
    solid = pc.visible(arr)
    colors = np.unique(arr[solid][:, :3], axis=0) if grid else np.empty((0, 3))
    summary = {
        "ok": True,
        "sheet": str(sheet),
        "version": version,
        "size": [width, height],
        "chroma_key": key,
        "pixel_grid": grid,
        "palette": [pc.key_hex(c) for c in colors] if grid and len(colors) <= 256 else None,
        "rows": rows,
    }
    if grid and summary["palette"] is None:
        summary["pixel_grid"] = None
    pc.write_json(out / "summary.json", summary)
    print(json.dumps({k: summary[k] for k in ("ok", "version", "chroma_key", "pixel_grid")}))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract", help="cut one generated strip into frames")
    extract.add_argument("run")
    extract.add_argument("--job", required=True)
    extract.add_argument("--threshold", type=float, default=96.0, help="key distance treated as background")
    extract.set_defaults(func=cmd_extract)
    split = sub.add_parser("split", help="read an existing pet sheet for an update")
    split.add_argument("sheet")
    split.add_argument("--out", required=True, help="folder for frames, strips, identity.png and summary.json")
    split.add_argument("--chroma-key", help="#RRGGBB background for strips and identity; chosen when omitted")
    split.set_defaults(func=cmd_split)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
