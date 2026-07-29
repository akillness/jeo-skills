#!/usr/bin/env python3
"""Validate a small, engine-neutral VFX handoff contract."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


class ValidationError(Exception):
    pass


def finite_number(value: Any, path: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"{path} must be a number")
    number = float(value)
    if not math.isfinite(number) or (positive and number <= 0):
        requirement = "finite and > 0" if positive else "finite"
        raise ValidationError(f"{path} must be {requirement}")
    return number


def required_string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{path} must be a non-empty string")
    return value


def validate(spec: Any) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValidationError("root must be an object")
    required_string(spec.get("name"), "name")
    finite_number(spec.get("duration_ms"), "duration_ms", positive=True)

    phases = spec.get("phases")
    if not isinstance(phases, list) or not phases:
        raise ValidationError("phases must be a non-empty array")
    phase_ids: set[str] = set()
    previous_end = 0.0
    for index, phase in enumerate(phases):
        path = f"phases[{index}]"
        if not isinstance(phase, dict):
            raise ValidationError(f"{path} must be an object")
        phase_id = required_string(phase.get("id"), f"{path}.id")
        if phase_id in phase_ids:
            raise ValidationError(f"duplicate phase id: {phase_id}")
        phase_ids.add(phase_id)
        start = finite_number(phase.get("start_ms"), f"{path}.start_ms")
        end = finite_number(phase.get("end_ms"), f"{path}.end_ms", positive=True)
        if start < 0 or end <= start or start < previous_end:
            raise ValidationError(f"{path} timings must be ordered, non-overlapping, and positive")
        previous_end = end

    layers = spec.get("layers")
    if not isinstance(layers, list) or not layers:
        raise ValidationError("layers must be a non-empty array")
    layer_ids: set[str] = set()
    for index, layer in enumerate(layers):
        path = f"layers[{index}]"
        if not isinstance(layer, dict):
            raise ValidationError(f"{path} must be an object")
        layer_id = required_string(layer.get("id"), f"{path}.id")
        if layer_id in layer_ids:
            raise ValidationError(f"duplicate layer id: {layer_id}")
        layer_ids.add(layer_id)
        required_string(layer.get("type"), f"{path}.type")
        if "max_particles" in layer:
            count = finite_number(layer["max_particles"], f"{path}.max_particles")
            if count < 0 or count != int(count):
                raise ValidationError(f"{path}.max_particles must be a non-negative integer")
        if "draw_calls" in layer:
            finite_number(layer["draw_calls"], f"{path}.draw_calls", positive=True)

    budgets = spec.get("budgets")
    if not isinstance(budgets, dict):
        raise ValidationError("budgets must be an object")
    for key in ("max_particles", "max_draw_calls", "max_overdraw", "max_blur_radius"):
        finite_number(budgets.get(key), f"budgets.{key}")
        if budgets[key] < 0:
            raise ValidationError(f"budgets.{key} must be non-negative")
    particles = sum(int(layer.get("max_particles", 0)) for layer in layers)
    draw_calls = sum(float(layer.get("draw_calls", 0)) for layer in layers)
    if particles > budgets["max_particles"]:
        raise ValidationError(f"layer particles ({particles}) exceed budgets.max_particles")
    if draw_calls > budgets["max_draw_calls"]:
        raise ValidationError(f"layer draw calls ({draw_calls:g}) exceed budgets.max_draw_calls")

    fallback = spec.get("reduced_motion")
    if not isinstance(fallback, dict):
        raise ValidationError("reduced_motion must be an object")
    if fallback.get("enabled") is not True:
        raise ValidationError("reduced_motion.enabled must be true")
    required_string(fallback.get("behavior"), "reduced_motion.behavior")
    return {"particles": particles, "draw_calls": draw_calls}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("spec", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    try:
        with args.spec.open(encoding="utf-8") as handle:
            result = validate(json.load(handle))
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(f"invalid: {exc}", file=sys.stderr)
        return 2
    if args.as_json:
        print(json.dumps({"valid": True, **result}, sort_keys=True))
    else:
        print(f"valid: particles={result['particles']} draw_calls={result['draw_calls']:g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
