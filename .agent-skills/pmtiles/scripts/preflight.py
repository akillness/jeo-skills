#!/usr/bin/env python3
"""Offline inventory and binary header inspection for PMTiles v3 archives; never makes network calls or spawns processes."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import struct
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}
MAGIC_BYTES = b"PMTiles"
HEADER_LEN = 127

COMPRESSION_NAMES = {0: "Unknown", 1: "None", 2: "Gzip", 3: "Brotli", 4: "Zstandard"}
TILE_TYPE_NAMES = {0: "Unknown", 1: "MVT", 2: "PNG", 3: "JPEG", 4: "WEBP", 5: "AVIF"}


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_file: bool = False) -> Path:
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
    return path


def find_scoped_binary(name: str) -> str | None:
    which_path = shutil.which(name)
    if which_path:
        return which_path

    home = Path.home()
    candidates = [
        home / ".local" / "bin" / name,
        home / "bin" / name,
        Path("/usr/local/bin") / name,
        Path("/opt/homebrew/bin") / name,
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def parse_pmtiles_header(file_path: Path) -> dict:
    size = file_path.stat().st_size
    if size < HEADER_LEN:
        raise PreflightError(f"file size {size} is smaller than PMTiles v3 header ({HEADER_LEN} bytes)", exit_code=1)

    with open(file_path, "rb") as f:
        header = f.read(HEADER_LEN)

    if header[:7] != MAGIC_BYTES:
        raise PreflightError("invalid PMTiles magic bytes (expected 'PMTiles')", exit_code=1)

    version = header[7]
    if version != 3:
        raise PreflightError(f"unsupported PMTiles version {version} (expected version 3)", exit_code=1)

    # Header fields from byte 8 to 127
    (
        root_dir_offset,
        root_dir_length,
        json_meta_offset,
        json_meta_length,
        leaf_dirs_offset,
        leaf_dirs_length,
        tile_data_offset,
        tile_data_length,
        addressed_tiles_count,
        tile_entries_count,
        tile_contents_count,
        clustered,
        internal_comp,
        tile_comp,
        tile_type,
        min_zoom,
        max_zoom,
        min_lon,
        min_lat,
        max_lon,
        max_lat,
        center_zoom,
        center_lon,
        center_lat,
    ) = struct.unpack("<QQQQQQQQQQQBBBBBBiiiiBii", header[8:127])

    return {
        "valid": True,
        "spec_version": version,
        "tile_type": TILE_TYPE_NAMES.get(tile_type, f"Custom({tile_type})"),
        "tile_compression": COMPRESSION_NAMES.get(tile_comp, f"Custom({tile_comp})"),
        "internal_compression": COMPRESSION_NAMES.get(internal_comp, f"Custom({internal_comp})"),
        "clustered": bool(clustered),
        "zoom": {"min": min_zoom, "max": max_zoom, "center": center_zoom},
        "bounds": {
            "min_lon": min_lon / 10000000.0,
            "min_lat": min_lat / 10000000.0,
            "max_lon": max_lon / 10000000.0,
            "max_lat": max_lat / 10000000.0,
        },
        "center": {
            "lon": center_lon / 10000000.0,
            "lat": center_lat / 10000000.0,
        },
        "counts": {
            "addressed_tiles": addressed_tiles_count,
            "tile_entries": tile_entries_count,
            "tile_contents": tile_contents_count,
        },
        "offsets": {
            "root_dir_offset": root_dir_offset,
            "root_dir_length": root_dir_length,
            "tile_data_offset": tile_data_offset,
            "tile_data_length": tile_data_length,
        },
    }


def run_preflight(archive_arg: str | None = None) -> dict:
    pmtiles_bin = find_scoped_binary("pmtiles")
    go_bin = find_scoped_binary("go")

    python_has_pmtiles = False
    try:
        spec = importlib.util.find_spec("pmtiles")
        python_has_pmtiles = spec is not None
    except (ImportError, AttributeError, ValueError):
        python_has_pmtiles = False

    archive_info = None
    if archive_arg:
        archive_path = validate_safe_path(archive_arg, must_exist=True, must_file=True)
        archive_info = parse_pmtiles_header(archive_path)

    ready = pmtiles_bin is not None or python_has_pmtiles or (archive_info is not None and archive_info["valid"])

    return {
        "status": "ready" if ready else "missing_tooling",
        "cli": {
            "pmtiles": pmtiles_bin,
            "go": go_bin,
            "python_executable": sys.executable,
        },
        "python_modules": {
            "pmtiles": python_has_pmtiles,
        },
        "archive": archive_info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", help="Optional absolute path to a local .pmtiles archive to validate")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    try:
        data = run_preflight(args.archive)
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
        print(f"PMTiles Preflight Status: {data['status']}")
        print(f"  CLI pmtiles: {data['cli']['pmtiles'] or 'not found in PATH'}")
        print(f"  Python pmtiles module: {'available' if data['python_modules']['pmtiles'] else 'not installed'}")
        if data["archive"]:
            arch = data["archive"]
            print(f"  Archive Header: Version {arch['spec_version']} ({arch['tile_type']}, {arch['tile_compression']})")
            print(f"  Zoom: {arch['zoom']['min']} to {arch['zoom']['max']} (center {arch['zoom']['center']})")
            print(f"  Bounds: [{arch['bounds']['min_lon']}, {arch['bounds']['min_lat']}] to [{arch['bounds']['max_lon']}, {arch['bounds']['max_lat']}]")
            print(f"  Tiles Count: {arch['counts']['addressed_tiles']} addressed ({arch['counts']['tile_contents']} unique blobs)")

    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
