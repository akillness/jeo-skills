#!/usr/bin/env python3
"""Verify that a GLB/glTF file actually carries a rig (skins, joints, skinned meshes).

Stdlib only: no torch, no Blender, no trimesh. Use it right after `rig.sh` to prove the
merge produced a deformable rig instead of a bare armature.

Usage:
    python3 inspect_glb.py results/model_rigged.glb
    python3 inspect_glb.py results/model_rigged.glb --json

Exit codes:
    0  the asset has at least one skin and at least one skinned mesh primitive
    1  the asset parsed but has no rig (the classic "merged the skeleton file" mistake)
    2  the file could not be read or parsed
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Any

GLB_MAGIC = 0x46546C67  # 'glTF'
CHUNK_JSON = 0x4E4F534A  # 'JSON'


class InspectError(Exception):
    """Raised when the file cannot be read as GLB or glTF JSON."""


def load_gltf(path: Path) -> dict[str, Any]:
    """Return the glTF JSON document from a .glb container or a .gltf text file."""
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise InspectError(f"cannot read {path}: {error}") from error

    if raw[:4] == b"glTF":
        if len(raw) < 12:
            raise InspectError(f"{path}: truncated GLB header")
        magic, version, total = struct.unpack_from("<III", raw, 0)
        if magic != GLB_MAGIC:
            raise InspectError(f"{path}: not a GLB container")
        if version != 2:
            raise InspectError(f"{path}: unsupported GLB version {version}")
        if total > len(raw):
            raise InspectError(f"{path}: declared length {total} exceeds file size {len(raw)}")
        offset = 12
        while offset + 8 <= len(raw):
            chunk_len, chunk_type = struct.unpack_from("<II", raw, offset)
            offset += 8
            chunk = raw[offset : offset + chunk_len]
            offset += chunk_len
            if chunk_type == CHUNK_JSON:
                try:
                    return json.loads(chunk.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise InspectError(f"{path}: JSON chunk is not valid glTF JSON: {error}") from error
        raise InspectError(f"{path}: no JSON chunk found in the GLB container")

    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InspectError(f"{path}: neither a GLB container nor glTF JSON ({error})") from error


def summarize(doc: dict[str, Any]) -> dict[str, Any]:
    """Collect the rig-relevant facts from a glTF document."""
    meshes = doc.get("meshes") or []
    skins = doc.get("skins") or []
    animations = doc.get("animations") or []

    joint_counts = [len(skin.get("joints") or []) for skin in skins]
    skinned_nodes = [node for node in (doc.get("nodes") or []) if "skin" in node]

    skinned_primitives = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives") or []:
            attributes = primitive.get("attributes") or {}
            if "JOINTS_0" in attributes and "WEIGHTS_0" in attributes:
                skinned_primitives += 1

    return {
        "generator": (doc.get("asset") or {}).get("generator", ""),
        "gltf_version": (doc.get("asset") or {}).get("version", ""),
        "nodes": len(doc.get("nodes") or []),
        "meshes": len(meshes),
        "materials": len(doc.get("materials") or []),
        "images": len(doc.get("images") or []),
        "skins": len(skins),
        "joints": sum(joint_counts),
        "joints_per_skin": joint_counts,
        "skinned_nodes": len(skinned_nodes),
        "skinned_primitives": skinned_primitives,
        "animations": len(animations),
        "rigged": bool(skins) and skinned_primitives > 0,
    }


def report(path: Path, summary: dict[str, Any]) -> None:
    print(f"file: {path}")
    if summary["generator"]:
        print(f"generator: {summary['generator']} (glTF {summary['gltf_version']})")
    print(f"nodes: {summary['nodes']}  meshes: {summary['meshes']}  materials: {summary['materials']}  images: {summary['images']}")
    print(f"skins: {summary['skins']}  joints: {summary['joints']}  joints/skin: {summary['joints_per_skin']}")
    print(f"skinned nodes: {summary['skinned_nodes']}  skinned primitives: {summary['skinned_primitives']}")
    print(f"animations: {summary['animations']}")
    if summary["rigged"]:
        print("RESULT: rigged — skins present and mesh primitives carry JOINTS_0/WEIGHTS_0")
        return
    print("RESULT: NOT rigged")
    if summary["skins"] and not summary["skinned_primitives"]:
        print("  skins exist but no mesh primitive has JOINTS_0/WEIGHTS_0 — the mesh is not bound to the armature")
    else:
        print("  no skins — a common cause is merging the *_skeleton.fbx instead of the *_skin.fbx")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify rig data inside a GLB/glTF file.")
    parser.add_argument("path", type=Path, help="path to a .glb or .gltf file")
    parser.add_argument("--json", action="store_true", help="emit the summary as JSON")
    args = parser.parse_args(argv)

    try:
        doc = load_gltf(args.path)
    except InspectError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    summary = summarize(doc)
    if args.json:
        print(json.dumps({"file": str(args.path), **summary}, indent=2))
    else:
        report(args.path, summary)
    return 0 if summary["rigged"] else 1


if __name__ == "__main__":
    sys.exit(main())
