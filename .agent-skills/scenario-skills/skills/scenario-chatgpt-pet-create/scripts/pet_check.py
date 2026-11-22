#!/usr/bin/env python3
"""Validate the exact ChatGPT pet sheet file that will be delivered.

Structure: size and version, PNG or WebP matching its extension, at most 20 MiB, alpha,
every used cell drawn, unused cells empty, no color under transparent pixels, no key
color left. Quality (skipped with --structure-only): the pet keeps one height on every
row, the jump leaves the ground and lands back, the look rows stay planted and
continuous, the direction verdicts are complete, and pixel mode stays on its grid.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_common as pc  # noqa: E402

FORMATS = {".png": "PNG", ".webp": "WEBP"}


def normalize_label(value) -> str:
    text = str(value).strip().rstrip("°")
    try:
        number = float(text)
    except ValueError:
        return text
    return f"{int(number):03d}" if number.is_integer() else f"{number:05.1f}"


def check_structure(path: Path, key, errors: list, report: dict):
    data = path.read_bytes()
    report.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    if len(data) > pc.MAX_BYTES:
        errors.append(f"file is {len(data) / 2**20:.1f} MiB; the limit is 20 MiB")
    with Image.open(path) as image:
        fmt, mode, info = image.format, image.mode, dict(image.info)
        width, height = image.size
    report.update(format=fmt, size=[width, height])
    if fmt not in FORMATS.values():
        errors.append(f"format is {fmt}; deliver PNG or WebP")
    elif FORMATS.get(path.suffix.lower()) != fmt:
        errors.append(f"extension {path.suffix} does not match the {fmt} contents")
    if "A" not in mode and "transparency" not in info:
        errors.append(f"no alpha channel (mode {mode}); the sheet must be transparent")
    version = pc.version_for_size(width, height)
    report["version"] = version
    if version is None:
        errors.append(f"size {width}x{height}; a pet sheet is 1536x1872 (v1) or 1536x2288 (v2)")
        return None, None
    arr = pc.load_rgba(path)
    residue = int(((arr[..., 3] == 0) & arr[..., :3].any(-1)).sum())
    if residue:
        errors.append(f"{residue} transparent pixels still carry color; rebuild or run pet_build.py --clean")
    for row, (job, frames, _) in enumerate(pc.rows_for(version)):
        for col in range(pc.COLUMNS):
            c = pc.cell(arr, row, col)
            alpha = c[..., 3]
            where = f"row {row} ({job}) frame {col}"
            if col >= frames:
                if alpha.any():
                    errors.append(f"{where}: must be empty, found {int((alpha > 0).sum())} pixels")
                continue
            drawn = int((alpha > 0).sum())
            if drawn < 50:
                errors.append(f"{where}: empty")
            elif drawn > 0.95 * pc.CELL_W * pc.CELL_H:
                errors.append(f"{where}: the cell is filled, so the background was not removed")
            if key is not None:
                distance = pc.key_distance(c, key)
                leak = int(((alpha > pc.VISIBLE) & (distance <= 36)).sum())
                if leak > 400:
                    errors.append(f"{where}: {leak} pixels of the key color remain")
                fringe = (alpha >= 16) & (distance <= 96) & pc.dilate(alpha == 0, 2)
                if fringe.any():
                    errors.append(f"{where}: {int(fringe.sum())} key-colored edge pixels")
    return arr, version


def measure(arr: np.ndarray, version: int) -> dict:
    rows = {}
    for row, (job, frames, _) in enumerate(pc.rows_for(version)):
        cells = []
        for col in range(frames):
            mask = pc.visible(pc.cell(arr, row, col))
            box = pc.bbox(mask)
            cells.append(None if box is None else {"box": box, "area": int(mask.sum()), "anchor": pc.anchor_x(mask), "mask": mask})
        rows[job] = cells
    return rows


def hole_rows(mask: np.ndarray) -> list:
    """Rows where a wide span of the sprite is transparent although the rows above and below are solid."""
    found = []
    for y in range(1, mask.shape[0] - 1):
        above, below = np.flatnonzero(mask[y - 1]), np.flatnonzero(mask[y + 1])
        if not len(above) or not len(below):
            continue
        lo, hi = max(above[0], below[0]), min(above[-1], below[-1])
        if hi - lo < 64:
            continue
        gap = int((~mask[y, lo : hi + 1]).sum())
        if gap > max(32, (hi - lo + 1) // 4):
            found.append(y)
    return found


def check_quality(arr, version, errors, warnings, metrics):
    rows = measure(arr, version)
    if any(c is None for cells in rows.values() for c in cells):
        return  # empty frames are already structural errors
    idle = rows["idle"]
    idle_ref = pc.reference_height("idle", [c["box"][3] - c["box"][1] for c in idle])
    idle_ground = float(np.median([c["box"][3] for c in idle]))
    idle_anchor = float(np.median([c["anchor"] for c in idle]))
    sizes = {}
    for job, cells in rows.items():
        ratio = pc.reference_height(job, [c["box"][3] - c["box"][1] for c in cells]) / idle_ref
        sizes[job] = round(ratio, 3)
        if abs(1 - ratio) > 0.15:
            errors.append(f"{job}: the pet is {ratio:.0%} of its idle height; rebuild the row (or regenerate it)")
        elif abs(1 - ratio) > 0.08:
            warnings.append(f"{job}: the pet is {ratio:.0%} of its idle height")
    metrics["height_vs_idle"] = sizes

    bottoms = [c["box"][3] for c in rows["jumping"]]
    lift, landing = max(bottoms) - min(bottoms), abs(bottoms[-1] - idle_ground)
    metrics["jump"] = {"lift": lift, "landing_offset": landing}
    if lift < 8:
        errors.append(f"jumping: the pet rises {lift} px; a jump has to leave the ground (8 px or more)")
    if landing > 12:
        errors.append(f"jumping: the last frame lands {landing:.0f} px off the idle ground line")

    if version != 2:
        return
    looks = rows["look-9"] + rows["look-10"]
    drift = max(abs(c["anchor"] - idle_anchor) for c in looks)
    widths = [c["box"][2] - c["box"][0] for c in looks]
    width_ratio = max(widths) / max(1, min(widths))
    metrics["look"] = {"anchor_drift": round(drift, 1), "width_ratio": round(width_ratio, 2)}
    if drift > 26:
        errors.append(f"look rows: the planted lower body drifts {drift:.0f} px from idle (26 max)")
    if width_ratio > 1.5:
        errors.append(f"look rows: widths vary {width_ratio:.2f}x (1.5 max)")
    for i, label in enumerate(pc.LOOK_LABELS):
        a, b = looks[i], looks[(i + 1) % 16]
        nxt = pc.LOOK_LABELS[(i + 1) % 16]
        ca = np.array([(a["box"][0] + a["box"][2]) / 2, (a["box"][1] + a["box"][3]) / 2])
        cb = np.array([(b["box"][0] + b["box"][2]) / 2, (b["box"][1] + b["box"][3]) / 2])
        delta = float(np.linalg.norm(ca - cb))
        area = max(a["area"], b["area"]) / max(1, min(a["area"], b["area"]))
        if delta > 26 or area > 1.5:
            errors.append(f"look {label} -> {nxt}: jumps {delta:.0f} px or changes size {area:.2f}x")
        elif delta > 8 or area > 1.15:
            warnings.append(f"look {label} -> {nxt}: moves {delta:.0f} px, size {area:.2f}x; check the loop")
        holes = hole_rows(a["mask"])
        if holes:
            top, bottom = a["box"][1], a["box"][3]
            body = [y for y in holes if top + 0.12 * (bottom - top) <= y <= top + 0.78 * (bottom - top)]
            if any(y2 - y1 <= 1 for y1, y2 in zip(body, body[1:])):
                errors.append(f"look {label}: a transparent gap cuts through the body (rows {body[:4]})")
            else:
                warnings.append(f"look {label}: thin transparent rows at {holes[:4]}")


def check_semantics(path: Path, errors, warnings):
    data = pc.read_json(path)
    records = data.get("directions") if isinstance(data, dict) else data
    if not isinstance(records, list):
        errors.append(f"{path.name}: expected a 'directions' list")
        return
    by_label = {normalize_label(r.get("label", "")): r for r in records if isinstance(r, dict)}
    for label in pc.LOOK_LABELS:
        record = by_label.get(label)
        if record is None:
            errors.append(f"direction {label}: no verdict recorded")
            continue
        expected = str(record.get("expected", "")).lower().replace("screen-", "")
        verdict = str(record.get("verdict", "")).lower()
        if expected != pc.EXPECTED[label]:
            errors.append(f"direction {label}: expected must be '{pc.EXPECTED[label]}', found '{expected}'")
        if verdict not in ("pass", "warning"):
            errors.append(f"direction {label}: verdict '{verdict}'; regenerate the whole look row")
        elif verdict == "warning":
            (errors if label in pc.CARDINALS else warnings).append(
                f"direction {label}: {'a cardinal must pass outright' if label in pc.CARDINALS else 'marked warning'}"
            )
        if not str(record.get("observed", "")).strip() or not str(record.get("evidence", "")).strip():
            errors.append(f"direction {label}: 'observed' and 'evidence' must describe what is visible")


def check_pixel(arr, version, pixel, errors, metrics):
    grid = pixel["grid"]
    binary = bool(np.isin(arr[..., 3], (0, 255)).all())
    if not binary:
        errors.append("pixel mode: partially transparent pixels found")
    off_grid = 0
    for row, (job, frames, _) in enumerate(pc.rows_for(version)):
        for col in range(frames):
            blocks = pc.cell(arr, row, col).reshape(pc.CELL_H // grid, grid, pc.CELL_W // grid, grid, 4)
            if not (blocks == blocks[:, :1, :, :1]).all():
                off_grid += 1
                errors.append(f"pixel mode: {job} frame {col} is off the {grid} px grid")
    used = {pc.key_hex(c) for c in np.unique(arr[arr[..., 3] > 0][:, :3], axis=0)}
    extra = used - {c.upper() for c in pixel.get("palette") or []} if pixel.get("palette") else set()
    if extra:
        errors.append(f"pixel mode: {len(extra)} colors outside the palette")
    metrics["pixel"] = {"grid": grid, "binary_alpha": binary, "frames_off_grid": off_grid, "colors": len(used), "outside_palette": len(extra)}


def check(path, key=None, require_v2=False, structure_only=False, semantics=None, pixel=None, require_semantics=False) -> dict:
    path = Path(path).resolve()
    errors, warnings, metrics = [], [], {}
    report = {"file": str(path)}
    arr, version = check_structure(path, key, errors, report)
    if version == 1 and require_v2:
        errors.append("this is a v1 sheet (9 rows); a v2 sheet with the 16 look directions was required")
    if key is None:
        warnings.append("no key color given, so leftover background was not checked")
    if arr is not None and not structure_only:
        check_quality(arr, version, errors, warnings, metrics)
        if version == 2:
            if semantics:
                check_semantics(Path(semantics), errors, warnings)
            elif require_semantics:
                errors.append("look rows were rebuilt in this run but no direction verdicts exist; write qa/direction-semantics.json")
            else:
                warnings.append("no direction verdicts given; the look rows were not reviewed")
        if pixel:
            check_pixel(arr, version, pixel, errors, metrics)
    report.update(ok=not errors, errors=errors, warnings=warnings, metrics=metrics)
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sheet", help="the exact PNG or WebP file to deliver")
    parser.add_argument("--run", help="run folder: reads the key, pixel settings and default paths from it")
    parser.add_argument("--key", help="#RRGGBB background key the sheet was cut from")
    parser.add_argument("--require-v2", action="store_true")
    parser.add_argument("--structure-only", action="store_true", help="for sheets made elsewhere")
    parser.add_argument("--semantics", help="direction verdicts JSON (default <run>/qa/direction-semantics.json if present)")
    parser.add_argument("--json-out", help="report path (default <run>/qa/check.json)")
    args = parser.parse_args(argv)

    run = Path(args.run) if args.run else None
    req = pc.read_json(run / "request.json") if run else {}
    key_text = args.key or (req.get("chroma_key") or {}).get("hex")
    key = pc.parse_key(key_text) if key_text else None
    semantics = args.semantics
    if not semantics and run and (run / "qa" / "direction-semantics.json").exists():
        semantics = run / "qa" / "direction-semantics.json"
    pixel = pc.read_json(run / "pixel.json") if run and req.get("pixel") and (run / "pixel.json").exists() else None
    build = run / "qa" / "build.json" if run else None
    rebuilt_looks = bool(build and build.exists() and any(r["job"].startswith("look-") for r in pc.read_json(build)["rows"]))
    report = check(args.sheet, key, args.require_v2, args.structure_only, semantics, pixel, rebuilt_looks)
    out = args.json_out or (run / "qa" / "check.json" if run else None)
    if out:
        pc.write_json(out, report)
    print(json.dumps({k: report[k] for k in ("ok", "version", "errors", "warnings")}, indent=1))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
