#!/usr/bin/env python3
"""Validate and summarize an Underworld Overseer map save without editing it."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def validate(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("root must be an object")
    cells = value.get("Map")
    if not isinstance(cells, list):
        raise ValueError("Map must be a list")
    coordinates: set[tuple[int, int]] = set()
    duplicates: list[tuple[int, int]] = []
    descriptors: Counter[str] = Counter()
    xs: list[int] = []
    ys: list[int] = []
    for index, cell in enumerate(cells):
        path = f"Map[{index}]"
        if not isinstance(cell, dict):
            raise ValueError(f"{path} must be an object")
        x, y = cell.get("X"), cell.get("Y")
        if type(x) is not int or type(y) is not int:
            raise ValueError(f"{path}.X and .Y must be integers")
        descriptor = cell.get("DescriptorID")
        if not isinstance(descriptor, str) or not descriptor.strip():
            raise ValueError(f"{path}.DescriptorID must be a non-empty string")
        coordinate = (x, y)
        if coordinate in coordinates:
            duplicates.append(coordinate)
        coordinates.add(coordinate)
        descriptors[descriptor] += 1
        xs.append(x)
        ys.append(y)
    return {
        "cells": len(cells),
        "unique_coordinates": len(coordinates),
        "duplicates": [list(item) for item in sorted(set(duplicates))],
        "bounds": {"min_x": min(xs) if xs else None, "max_x": max(xs) if xs else None, "min_y": min(ys) if ys else None, "max_y": max(ys) if ys else None},
        "descriptors": dict(sorted(descriptors.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("save", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    try:
        raw = args.save.read_bytes()
        result = validate(json.loads(raw))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"invalid: {exc}", file=sys.stderr)
        return 2
    result["sha256"] = hashlib.sha256(raw).hexdigest()
    if args.as_json:
        print(json.dumps({"valid": True, **result}, sort_keys=True))
    else:
        print(f"valid: cells={result['cells']} unique={result['unique_coordinates']} sha256={result['sha256']}")
        if result["duplicates"]:
            print(f"warning: duplicate coordinates={result['duplicates']}")
        print(f"bounds: {result['bounds']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
