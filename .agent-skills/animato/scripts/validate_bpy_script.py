#!/usr/bin/env python3
"""Gate an LLM-produced bpy animation script before it is executed by Animato's /api/run.

Animato executes model-written Python with `bpy` in a child process; that endpoint is a
remote-code-execution surface by design and it overwrites the uploaded model in place.
This validator is the cheap static gate that runs between "the model answered" and
"the server executes it".

Usage:
  python3 validate_bpy_script.py script.py [--model-path public/upload/X-Bot.fbx] [--json]

Exit codes: 0 = no errors (warnings allowed), 1 = errors found, 2 = bad invocation.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

FENCE_RE = re.compile(r"^\s*```[a-zA-Z]*\s*\n(.*?)\n\s*```\s*$", re.S)
CONST_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\"'])(.*?)\2\s*(?:#.*)?$", re.M)

# Calls that were removed from Blender's Python API before 5.x. The upstream prompt ships a
# bpy 5.x cheat-sheet precisely because models keep emitting these.
REMOVED_APIS = [
    ("bpy.context.scene.objects.link(", "removed in 2.80 — use bpy.context.collection.objects.link()"),
    ("bpy.context.scene.objects.active", "removed in 2.80 — use bpy.context.view_layer.objects.active"),
    ("bpy.context.scene.update(", "removed in 2.80 — use bpy.context.view_layer.update()"),
    ("bpy.data.lamps", "removed in 2.80 — use bpy.data.lights"),
    ("bpy.ops.import_scene.obj(", "removed in 4.0 — use bpy.ops.wm.obj_import()"),
    ("bpy.ops.export_scene.obj(", "removed in 4.0 — use bpy.ops.wm.obj_export()"),
    ("use_auto_smooth", "removed in 4.1 — use the Smooth by Angle modifier"),
]

# Host-side capabilities an animation script never needs.
DANGEROUS = [
    ("import subprocess", "spawns processes"),
    ("subprocess.", "spawns processes"),
    ("os.system(", "runs shell commands"),
    ("os.popen(", "runs shell commands"),
    ("os.remove(", "deletes files outside the export path"),
    ("os.unlink(", "deletes files outside the export path"),
    ("shutil.rmtree(", "deletes directory trees"),
    ("import socket", "opens network connections"),
    ("import requests", "opens network connections"),
    ("urllib.request", "opens network connections"),
    ("__import__(", "dynamic import / obfuscated execution"),
    ("eval(", "dynamic execution"),
    ("exec(", "dynamic execution"),
]

IMPORT_OPS = ("bpy.ops.import_scene.gltf(", "bpy.ops.import_scene.fbx(", "bpy.ops.wm.obj_import(")
EXPORT_GLTF = "bpy.ops.export_scene.gltf("
EXPORT_FBX = "bpy.ops.export_scene.fbx("


def strip_fences(text: str) -> str:
    match = FENCE_RE.match(text.strip())
    return match.group(1) if match else text


def call_args(source: str, call: str) -> list[str]:
    """Return the argument text of every `call` occurrence, balanced on parentheses."""
    chunks: list[str] = []
    start = 0
    while True:
        idx = source.find(call, start)
        if idx == -1:
            return chunks
        cursor = idx + len(call)
        depth = 1
        while cursor < len(source) and depth:
            if source[cursor] == "(":
                depth += 1
            elif source[cursor] == ")":
                depth -= 1
            cursor += 1
        chunks.append(source[idx + len(call) : cursor - 1])
        start = cursor


def string_constants(code: str) -> dict[str, str]:
    """Module-level `NAME = "literal"` bindings, so `filepath=MODEL` can be resolved."""
    return {m.group(1): m.group(3) for m in CONST_RE.finditer(code)}


def references(arg_text: str, target: str, constants: dict[str, str]) -> bool:
    """True when an argument list names `target` directly or through a string constant."""
    if target in arg_text:
        return True
    return any(
        value == target and re.search(rf"\b{re.escape(name)}\b", arg_text)
        for name, value in constants.items()
    )



def validate(source: str, model_path: str | None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    code = strip_fences(source)
    constants = string_constants(code)

    if not code.strip():
        return ["script is empty"], warnings
    if "import bpy" not in code:
        errors.append("no `import bpy` — this is not a Blender script")

    for needle, reason in DANGEROUS:
        if needle in code:
            errors.append(f"forbidden call `{needle}` ({reason})")
    for needle, reason in REMOVED_APIS:
        if needle in code:
            errors.append(f"stale Blender API `{needle}` ({reason})")

    if not any(op in code for op in IMPORT_OPS):
        errors.append("no model import (expected bpy.ops.import_scene.gltf/fbx or bpy.ops.wm.obj_import)")

    if "keyframe_insert(" not in code:
        errors.append("no keyframe_insert() call — the script would export a static model")

    if "frame_start" not in code or "frame_end" not in code:
        errors.append("frame range not set (scene.frame_start / scene.frame_end)")

    gltf_args = call_args(code, EXPORT_GLTF)
    fbx_args = call_args(code, EXPORT_FBX)
    if not gltf_args and not fbx_args:
        errors.append("no export call — the animation would never be written back to the file")
    for args in gltf_args:
        if "export_animations=True" not in args.replace(" ", ""):
            errors.append("glTF export is missing export_animations=True — animation would be dropped")
    for args in fbx_args:
        if "bake_anim=True" not in args.replace(" ", ""):
            errors.append("FBX export is missing bake_anim=True — animation would be dropped")

    if model_path:
        if model_path not in code:
            errors.append(f"script never references the target model path `{model_path}`")
        else:
            exported = [a for a in gltf_args + fbx_args if references(a, model_path, constants)]
            if not exported:
                warnings.append(
                    f"`{model_path}` appears in the script but not in an export call — "
                    "confirm the export overwrites the uploaded file in place"
                )
        suffix = Path(model_path).suffix.lower()
        if suffix in (".gltf", ".glb") and fbx_args and not gltf_args:
            errors.append(f"target is {suffix} but the script exports FBX")
        if suffix == ".fbx" and gltf_args and not fbx_args:
            errors.append("target is .fbx but the script exports glTF")
        if suffix == ".obj":
            errors.append(".obj has no skeleton and cannot carry an animation — re-upload a rigged .fbx/.gltf")

    if "render.fps" not in code:
        warnings.append("scene.render.fps is never set — playback speed depends on the scene default")
    if "read_factory_settings" not in code and "bpy.ops.wm.read_homefile" not in code:
        warnings.append("scene is not reset (bpy.ops.wm.read_factory_settings(use_empty=True)) before import")
    if "bpy.ops.wm.save_mainfile(" in code:
        warnings.append("script saves a .blend file — Animato only needs the exported model")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("script", help="path to the generated script, or - for stdin")
    parser.add_argument("--model-path", help="path the script must import/export, e.g. public/upload/X-Bot.fbx")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    if args.script == "-":
        source = sys.stdin.read()
    else:
        path = Path(args.script)
        if not path.is_file():
            print(f"error: no such script: {path}", file=sys.stderr)
            return 2
        source = path.read_text(encoding="utf-8")

    errors, warnings = validate(source, args.model_path)

    if args.json:
        print(json.dumps({"ok": not errors, "errors": errors, "warnings": warnings}, indent=2))
    else:
        for item in errors:
            print(f"[error] {item}")
        for item in warnings:
            print(f"[warn]  {item}")
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        if not errors:
            print("script passed the static gate — safe to POST to /api/run on a trusted local server")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
