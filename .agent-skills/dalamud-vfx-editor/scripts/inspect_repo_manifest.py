#!/usr/bin/env python3
"""Inspect a Dalamud repository manifest without downloading binaries."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def inspect(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("manifest root must be an object")
    result = {}
    for key in ("InternalName", "AssemblyVersion", "DalamudApiLevel", "RepoUrl", "DownloadLinkInstall", "DownloadLinkUpdate"):
        if key in value:
            result[key] = value[key]
    if not result:
        raise ValueError("manifest has no recognized repository fields")
    for key in ("InternalName", "AssemblyVersion", "DalamudApiLevel"):
        if key in result and not isinstance(result[key], (str, int)):
            raise ValueError(f"{key} must be a string or integer")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    try:
        result = inspect(json.loads(args.manifest.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"invalid: {exc}", file=sys.stderr)
        return 2
    if args.as_json:
        print(json.dumps({"valid": True, **result}, sort_keys=True))
    else:
        for key, value in result.items():
            print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
