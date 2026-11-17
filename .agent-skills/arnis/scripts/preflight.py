#!/usr/bin/env python3
"""Offline inventory, bounding-box validation, and palette inspection helper for Arnis; never makes network calls or spawns processes."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path, PurePosixPath
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_file: bool = False, must_dir: bool = False) -> Path:
    if not raw_path:
        raise PreflightError("empty path argument", exit_code=2)
    path = Path(raw_path)
    if not path.is_absolute():
        raise PreflightError("path must be absolute", exit_code=2)
    posix = PurePosixPath(path.as_posix())
    for part in posix.parts:
        lower = part.lower()
        if lower in BLOCKED_PARTS or lower in SENSITIVE_STEMS or lower.startswith(".env"):
            raise PreflightError(f"sensitive path component not allowed: {part}", exit_code=2)
    if must_exist and not path.exists():
        raise PreflightError(f"target path not found: {path}", exit_code=2)
    if must_file and not path.is_file():
        raise PreflightError(f"target path is not a regular file: {path}", exit_code=2)
    if must_dir and not path.is_dir():
        raise PreflightError(f"target path is not a directory: {path}", exit_code=2)
    return path


def find_scoped_binary(name: str) -> str | None:
    which_path = shutil.which(name)
    if which_path:
        return which_path

    home = Path.home()
    candidates = [
        home / ".cargo" / "bin" / name,
        home / ".local" / "bin" / name,
        home / "bin" / name,
        Path("/usr/local/bin") / name,
        Path("/opt/homebrew/bin") / name,
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def parse_and_validate_bbox(bbox_str: str) -> dict:
    parts = [p.strip() for p in bbox_str.split(",")]
    if len(parts) != 4:
        raise PreflightError("bbox must contain exactly 4 comma-separated values: min_lon,min_lat,max_lon,max_lat", exit_code=1)

    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError as err:
        raise PreflightError(f"invalid coordinate value in bbox: {err}", exit_code=1)

    if not (-180.0 <= min_lon <= 180.0) or not (-180.0 <= max_lon <= 180.0):
        raise PreflightError(f"longitude out of range [-180, 180]: min={min_lon}, max={max_lon}", exit_code=1)
    if not (-90.0 <= min_lat <= 90.0) or not (-90.0 <= max_lat <= 90.0):
        raise PreflightError(f"latitude out of range [-90, 90]: min={min_lat}, max={max_lat}", exit_code=1)

    if min_lon >= max_lon:
        raise PreflightError(f"min_lon ({min_lon}) must be less than max_lon ({max_lon})", exit_code=1)
    if min_lat >= max_lat:
        raise PreflightError(f"min_lat ({min_lat}) must be less than max_lat ({max_lat})", exit_code=1)

    # Approximate metric distances:
    mid_lat = (min_lat + max_lat) / 2.0
    lat_deg_len = 111.32  # km per degree lat
    lon_deg_len = 111.32 * math.cos(math.radians(mid_lat))

    width_km = abs(max_lon - min_lon) * lon_deg_len
    height_km = abs(max_lat - min_lat) * lat_deg_len

    # Minecraft blocks (1 meter = 1 block)
    width_blocks = int(width_km * 1000)
    height_blocks = int(height_km * 1000)

    # Minecraft chunks (16x16 blocks)
    chunks_x = math.ceil(width_blocks / 16.0) if width_blocks > 0 else 1
    chunks_z = math.ceil(height_blocks / 16.0) if height_blocks > 0 else 1
    total_chunks = chunks_x * chunks_z

    return {
        "valid": True,
        "coordinates": {
            "min_lon": min_lon,
            "min_lat": min_lat,
            "max_lon": max_lon,
            "max_lat": max_lat,
        },
        "dimensions_metric": {
            "width_km": round(width_km, 3),
            "height_km": round(height_km, 3),
            "area_sq_km": round(width_km * height_km, 3),
        },
        "estimated_minecraft_footprint": {
            "width_blocks": width_blocks,
            "height_blocks": height_blocks,
            "chunks_x": chunks_x,
            "chunks_z": chunks_z,
            "total_chunks": total_chunks,
        },
    }


def validate_palette_file(palette_path: Path) -> dict:
    try:
        with open(palette_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as err:
        raise PreflightError(f"invalid JSON palette file: {err}", exit_code=1)

    if not isinstance(data, dict):
        raise PreflightError("palette root must be a JSON object", exit_code=1)

    materials = data.get("materials")
    if not materials or not isinstance(materials, dict):
        raise PreflightError("palette must define a 'materials' mapping object", exit_code=1)

    invalid_blocks = []
    for mat_name, block_id in materials.items():
        if not isinstance(block_id, str) or not (":" in block_id):
            invalid_blocks.append(f"{mat_name}={block_id}")

    if invalid_blocks:
        raise PreflightError(f"invalid namespaced block IDs in palette: {', '.join(invalid_blocks[:3])}", exit_code=1)

    return {
        "valid": True,
        "name": data.get("name", "custom_palette"),
        "total_material_mappings": len(materials),
        "rules_count": len(data.get("rules", [])),
    }


def inspect_world_directory(world_dir: Path) -> dict:
    level_dat = world_dir / "level.dat"
    region_dir = world_dir / "region"

    mca_files = []
    if region_dir.is_dir():
        mca_files = [f.name for f in region_dir.glob("*.mca")]

    is_valid_world = level_dat.is_file() or len(mca_files) > 0

    return {
        "has_level_dat": level_dat.is_file(),
        "has_region_dir": region_dir.is_dir(),
        "mca_region_files_count": len(mca_files),
        "valid_minecraft_world": is_valid_world,
    }


def run_preflight(bbox_arg: str | None = None, palette_arg: str | None = None, world_arg: str | None = None) -> dict:
    arnis_bin = find_scoped_binary("arnis")
    cargo_bin = find_scoped_binary("cargo")

    bbox_info = None
    if bbox_arg:
        bbox_info = parse_and_validate_bbox(bbox_arg)

    palette_info = None
    if palette_arg:
        pal_path = validate_safe_path(palette_arg, must_exist=True, must_file=True)
        palette_info = validate_palette_file(pal_path)

    world_info = None
    if world_arg:
        w_path = validate_safe_path(world_arg, must_exist=True, must_dir=True)
        world_info = inspect_world_directory(w_path)

    ready = arnis_bin is not None or (bbox_info is not None and bbox_info["valid"]) or (palette_info is not None and palette_info["valid"])

    return {
        "status": "ready" if ready else "missing_tooling",
        "cli": {
            "arnis": arnis_bin,
            "cargo": cargo_bin,
            "python_executable": sys.executable,
        },
        "bbox_analysis": bbox_info,
        "palette_analysis": palette_info,
        "world_analysis": world_info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", help="Optional bounding box to validate: min_lon,min_lat,max_lon,max_lat")
    parser.add_argument("--palette", help="Optional absolute path to an Arnis JSON palette file to validate")
    parser.add_argument("--world-dir", help="Optional absolute path to an existing Minecraft world folder to inspect")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    try:
        data = run_preflight(args.bbox, args.palette, args.world_dir)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": exc.message}))
        else:
            print(f"Error: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": str(exc)}))
        else:
            print(f"Unexpected error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"Arnis Preflight Status: {data['status']}")
        print(f"  CLI arnis: {data['cli']['arnis'] or 'not found in PATH'}")
        print(f"  Rust cargo: {data['cli']['cargo'] or 'not found'}")
        if data["bbox_analysis"]:
            dim = data["bbox_analysis"]["dimensions_metric"]
            fp = data["bbox_analysis"]["estimated_minecraft_footprint"]
            print(f"  BBox Bounds: {dim['width_km']}km x {dim['height_km']}km ({dim['area_sq_km']} sq km)")
            print(f"  Estimated Voxel Size: {fp['width_blocks']:,} x {fp['height_blocks']:,} blocks ({fp['total_chunks']:,} chunks)")
        if data["palette_analysis"]:
            print(f"  Palette: {data['palette_analysis']['name']} ({data['palette_analysis']['total_material_mappings']} materials)")
        if data["world_analysis"]:
            print(f"  World save: {data['world_analysis']['mca_region_files_count']} region (.mca) files detected")

    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
