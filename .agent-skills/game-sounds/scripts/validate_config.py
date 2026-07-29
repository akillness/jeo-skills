#!/usr/bin/env python3
"""Validate the game-sounds JSON configuration without modifying it."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

EVENTS = ("session-start", "task-acknowledge", "task-complete", "error", "permission")
PACK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def validate(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("root must be an object")
    required = {"volume", "active_pack", "pack_rotation", "enabled_events"}
    missing = sorted(required - value.keys())
    if missing:
        raise ValueError("missing fields: " + ", ".join(missing))
    volume = value["volume"]
    if isinstance(volume, bool) or not isinstance(volume, (int, float)) or not 0 <= volume <= 1:
        raise ValueError("volume must be a number in [0, 1]")
    active = value["active_pack"]
    if not isinstance(active, str) or not PACK.fullmatch(active):
        raise ValueError("active_pack must be a safe pack name")
    rotation = value["pack_rotation"]
    if not isinstance(rotation, list) or any(not isinstance(item, str) or not PACK.fullmatch(item) for item in rotation):
        raise ValueError("pack_rotation must contain only safe pack names")
    if len(rotation) != len(set(rotation)):
        raise ValueError("pack_rotation must not contain duplicates")
    events = value["enabled_events"]
    if not isinstance(events, dict) or set(events) != set(EVENTS):
        raise ValueError("enabled_events must contain exactly: " + ", ".join(EVENTS))
    if any(type(enabled) is not bool for enabled in events.values()):
        raise ValueError("enabled_events values must be booleans")
    return {"volume": volume, "active_pack": active, "rotation": len(rotation), "events": events}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    try:
        with args.config.open(encoding="utf-8") as handle:
            result = validate(json.load(handle))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"invalid: {exc}", file=sys.stderr)
        return 2
    if args.as_json:
        print(json.dumps({"valid": True, **result}, sort_keys=True))
    else:
        print(f"valid: active_pack={result['active']} rotation={result['rotation']} volume={result['volume']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
