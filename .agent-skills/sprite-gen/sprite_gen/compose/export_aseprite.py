# SPDX-License-Identifier: Apache-2.0
"""Export a composed run as Aseprite-compatible atlas metadata.

The exporter re-describes the existing atlas. It never re-encodes the image,
and it reads only the composed ``manifest.json`` contract, so curated frame
selection, order, transforms, edits, clones, and generated breathe cells are
already baked before this stage runs.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any

from sprite_gen.spec.runio import acquire_run_dir_lock, atomic_write_set, atomic_write_text, read_guard
from sprite_gen.util.console import utf8_streams

DEFAULT_OUTPUT = Path("exports/aseprite.json")
DEFAULT_SPLIT_DIR = Path("exports/aseprite")


def _package_version() -> str:
    try:
        return package_version("sprite-gen")
    except PackageNotFoundError:  # pragma: no cover - bare checkout
        return "unknown"


def _validated_rows(manifest: dict[str, Any]) -> dict[str, Any]:
    layout_rows = manifest["frame_layout"]["rows"]
    animation_rows = manifest["animation"]["rows"]
    if set(layout_rows) != set(animation_rows):
        raise ValueError(
            "manifest rows disagree: "
            f"frame_layout has {sorted(layout_rows)}, animation has {sorted(animation_rows)}"
        )
    return layout_rows


def _state_durations(state: str, animation: dict[str, Any], count: int) -> list[int]:
    durations = animation.get("durations_ms")
    if not durations:
        fps = float(animation.get("fps", 6)) or 6.0
        durations = [max(1, round(1000.0 / fps))] * count
    if len(durations) != count:
        raise ValueError(
            f"{state}: {count} layout rects but {len(durations)} durations_ms entries"
        )
    return [int(duration) for duration in durations]


def _frame_entry(rect: dict[str, Any], duration: int, filename: str) -> dict[str, Any]:
    size = {"w": rect["w"], "h": rect["h"]}
    return {
        "filename": filename,
        "frame": {key: rect[key] for key in ("x", "y", "w", "h")},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, **size},
        "sourceSize": size,
        "duration": duration,
    }


def _meta(manifest: dict[str, Any], tags: list[dict[str, Any]]) -> dict[str, Any]:
    layout = manifest["frame_layout"]
    return {
        "app": "sprite-gen",
        "version": _package_version(),
        "image": manifest["game_input"],
        "format": "RGBA8888",
        "size": {"w": layout["sheetWidth"], "h": layout["sheetHeight"]},
        "scale": "1",
        "frameTags": tags,
    }


def _hashed(frames: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        frame["filename"]: {key: value for key, value in frame.items() if key != "filename"}
        for frame in frames
    }


def aseprite_json(manifest: dict[str, Any], *, fmt: str = "json-array") -> dict[str, Any]:
    """Map one runtime manifest to Aseprite ``json-array`` or ``json-hash``."""
    if fmt not in {"json-array", "json-hash"}:
        raise ValueError(f"unknown format: {fmt!r} (expected json-array or json-hash)")
    layout_rows = _validated_rows(manifest)
    animation_rows = manifest["animation"]["rows"]
    frames: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []
    for state, rects in layout_rows.items():
        durations = _state_durations(state, animation_rows[state], len(rects))
        start = len(frames)
        for rect, duration in zip(rects, durations):
            frames.append(_frame_entry(rect, duration, str(len(frames))))
        tags.append({"name": state, "from": start, "to": len(frames) - 1, "direction": "forward"})
    return {"frames": _hashed(frames) if fmt == "json-hash" else frames, "meta": _meta(manifest, tags)}


def split_state_jsons(
    manifest: dict[str, Any], *, fmt: str = "json-hash"
) -> dict[str, dict[str, Any]]:
    """Return one locally indexed Aseprite document per animation state."""
    if fmt not in {"json-array", "json-hash"}:
        raise ValueError(f"unknown format: {fmt!r} (expected json-array or json-hash)")
    layout_rows = _validated_rows(manifest)
    animation_rows = manifest["animation"]["rows"]
    documents: dict[str, dict[str, Any]] = {}
    for state, rects in layout_rows.items():
        durations = _state_durations(state, animation_rows[state], len(rects))
        frames = [
            _frame_entry(rect, duration, str(index))
            for index, (rect, duration) in enumerate(zip(rects, durations))
        ]
        tags = [{"name": state, "from": 0, "to": len(frames) - 1, "direction": "forward"}]
        documents[state] = {
            "frames": _hashed(frames) if fmt == "json-hash" else frames,
            "meta": _meta(manifest, tags),
        }
    return documents


def _run_relative(run_dir: Path, value: str | Path, *, label: str) -> Path:
    relative = Path(value)
    if relative.is_absolute():
        raise ValueError(f"{label} must be relative to the run dir: {value}")
    target = (run_dir / relative).resolve()
    try:
        target.relative_to(run_dir)
    except ValueError as exc:
        raise ValueError(f"{label} escapes the run dir: {value}") from exc
    return target


def _export_target(run_dir: Path, value: str | Path, *, split_states: bool) -> Path:
    """Resolve an export target without allowing canonical run files to be replaced."""
    target = _run_relative(run_dir, value, label="output")
    exports_root = (run_dir / "exports").resolve()
    try:
        relative = target.relative_to(exports_root)
    except ValueError as exc:
        raise ValueError(f"output must stay under the run's exports/ directory: {value}") from exc
    if not relative.parts:
        raise ValueError("output cannot replace the exports/ directory itself")
    if not split_states and target.suffix.lower() != ".json":
        raise ValueError(f"single-file output must be a .json file under exports/: {value}")
    return target


def _publish_split(output_dir: Path, documents: dict[str, dict[str, Any]]) -> None:
    """Replace the split export directory as one rollback-capable generation."""
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.staging-", dir=output_dir.parent))
    backup = output_dir.with_name(f".{output_dir.name}.backup")
    try:
        payloads = {
            staging / f"{state}.json": json.dumps(document, ensure_ascii=False, indent=2) + "\n"
            for state, document in documents.items()
        }
        atomic_write_set(payloads)
        if backup.exists():
            shutil.rmtree(backup)
        if output_dir.exists():
            output_dir.rename(backup)
        try:
            staging.rename(output_dir)
        except BaseException:
            if backup.exists():
                backup.rename(output_dir)
            raise
        shutil.rmtree(backup, ignore_errors=True)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--manifest", default="manifest.json")
    parser.add_argument("--output", help="run-relative file or split directory")
    parser.add_argument("--format", dest="fmt", choices=("json-array", "json-hash"), default="json-array")
    parser.add_argument("--split-states", action="store_true")


def run(
    run_dir: Path,
    manifest: str = "manifest.json",
    output: str | None = None,
    fmt: str = "json-array",
    split_states: bool = False,
) -> int:
    run_dir = run_dir.expanduser().resolve()
    try:
        acquire_run_dir_lock(run_dir, "export-aseprite")
        manifest_path = _run_relative(run_dir, manifest, label="manifest")
        output_path = _export_target(
            run_dir,
            output or (DEFAULT_SPLIT_DIR if split_states else DEFAULT_OUTPUT),
            split_states=split_states,
        )
        with read_guard(run_dir):
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if split_states:
                documents = split_state_jsons(data, fmt=fmt)
                _publish_split(output_path, documents)
                report = {
                    "ok": True,
                    "output": str(output_path),
                    "image": data["game_input"],
                    "format": fmt,
                    "states": list(documents),
                }
            else:
                exported = aseprite_json(data, fmt=fmt)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                atomic_write_text(output_path, json.dumps(exported, ensure_ascii=False, indent=2) + "\n")
                report = {
                    "ok": True,
                    "output": str(output_path),
                    "image": exported["meta"]["image"],
                    "format": fmt,
                    "frames": len(exported["frames"]),
                    "frameTags": [tag["name"] for tag in exported["meta"]["frameTags"]],
                }
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    parser = argparse.ArgumentParser(description=__doc__)
    add_arguments(parser)
    return run(**vars(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
