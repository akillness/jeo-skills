"""Blender-side renderer for one pass of the comparison film. film.py launches it.

    blender --factory-startup --background <scene.blend> --python-exit-code 1 \
        --python scripts/worker.py -- <mode> <frames.json> <run_dir> <pilot|run> [config.json]

<mode> is "original" or "patina". The config path falls back to $PATINA_CONFIG so a manual
invocation still works. Frames already on disk are skipped, which is what makes a run
resumable. Any failure exits 1 with a one-line message, with or without --python-exit-code.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import dump, read_config, script_args  # noqa: E402
from scene import setup  # noqa: E402


def contract_path(run_dir: Path, mode: str) -> Path:
    return run_dir / f"{mode}_contract.json"


def native_scene_path(run_dir: Path, mode: str) -> Path:
    return run_dir / f"{mode.title()} Camera Animation.blend"


def flatten(data, prefix: str = "") -> dict:
    """Dotted leaf paths, so a mismatch names settings.engine rather than settings."""
    if isinstance(data, dict):
        items = data.items()
    elif isinstance(data, list):
        items = enumerate(data)
    else:
        return {prefix.rstrip("."): data}
    out = {}
    for key, value in items:
        out.update(flatten(value, f"{prefix}{key}."))
    return out


def record_contract(run_dir: Path, mode: str, contract: dict) -> None:
    """First worker writes the contract; every later one must reproduce it exactly.

    The Blender version is recorded and reported but not compared: a release that renders
    the rig identically may resume, and one that does not shows up in the other keys.
    """
    path = contract_path(run_dir, mode)
    if not path.exists():
        path.write_text(json.dumps(contract, indent=2))
        return
    stored = json.loads(path.read_text())
    before, now = flatten(stored), flatten(contract)
    differing = sorted(
        key
        for key in set(before) | set(now)
        if key != "blender" and before.get(key) != now.get(key)
    )
    if differing:
        detail = ", ".join(f"{k}: {before.get(k)!r} on disk, {now.get(k)!r} now" for k in differing)
        raise RuntimeError(
            f"{path}: contract mismatch ({detail}); Blender {stored.get('blender')} on disk,"
            f" {contract.get('blender')} now. The folder's frames were rendered under other"
            " settings: another Blender release renames the engine and look, another scene"
            " or rig changes the hashes and lights."
        )


def render_frames(scene, frames: list[int], folder: Path, mode: str) -> int:
    import bpy

    folder.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    rendered = 0
    for frame in frames:
        target = folder / f"{frame:04d}.png"
        if target.exists():
            continue
        scene.frame_set(frame)
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        rendered += 1
        elapsed = round(time.monotonic() - started, 2)
        print(dump({"pass": mode, "frame": frame, "elapsed": elapsed}), flush=True)
    return rendered


def main(argv: list[str]) -> dict:
    if len(argv) not in (4, 5):
        raise SystemExit(
            "usage: ... --python worker.py -- <mode> <frames.json> <run_dir> <pilot|run> [config]"
        )
    mode, frame_file, run_dir, kind = argv[:4]
    config_path = argv[4] if len(argv) == 5 else os.environ.get("PATINA_CONFIG")
    config, _ = read_config(config_path)
    run = Path(run_dir)
    run.mkdir(parents=True, exist_ok=True)
    scene, _, contract = setup(config, mode, preview=kind == "pilot")
    record_contract(run, mode, contract)
    native = native_scene_path(run, mode)
    if kind != "pilot" and not native.exists():
        import bpy

        scene.render.resolution_percentage = 100
        bpy.ops.wm.save_as_mainfile(filepath=str(native))
    frames = json.loads(Path(frame_file).read_text())
    folder = run / ("pilot" if kind == "pilot" else "frames") / mode
    rendered = render_frames(scene, frames, folder, mode)
    return {"pass": mode, "kind": kind, "requested": len(frames), "rendered": rendered}


def run() -> None:
    """Blender only propagates an exception to its exit status under --python-exit-code."""
    try:
        print(dump(main(script_args())), flush=True)
    except Exception as error:
        traceback.print_exc()
        raise SystemExit(f"worker.py failed: {type(error).__name__}: {error}") from None


if __name__ == "__main__":
    run()
