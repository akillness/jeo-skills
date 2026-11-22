#!/usr/bin/env python3
"""gd_world: level and environment work in Godot 4.7.2 from an agent (scenario-godot-3d-world 0.1).

Runner side of the scenario-godot-3d-world skill. System python3, standard library only. Builds on the
scenario-godot-expert toolkit (gd_env, gd_run, gd_review); every Godot call goes through gd_run, so the
GD_MAX slots, the per-project lock and the GUI-editor refusal apply.

    import sys; sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-3d-world/scripts"]
    import gd_world
    gd_world.install_world(P)                       # copies agentkit/world/ to res://addons/agentkit/world/
    gd_world.physics_gate(P)                        # engine setting AND the engine actually running
    gd_world.glb_stats("drop/crate.glb")            # offline: triangles, size, pivot, materials, images
    gd_world.ingest_glbs(P, "drop/", manifest)      # copy, write .import + manifest, import, audit

Offline helpers (no Godot): glb_stats, glb_flags, write_import_file, godot_literal, read_import_params,
validate_layout. Everything else runs a job in the project through gd_run.run_script.
"""
from __future__ import annotations

__version__ = "0.1"

import json
import math
import re  # noqa: F401
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
WORLD_KIT = HERE / "agentkit" / "world"
EXPERT_SCRIPTS = SKILL.parent / "scenario-godot-expert" / "scripts"
for _p in (str(EXPERT_SCRIPTS), str(HERE)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

WORLD_RES = "res://addons/agentkit/world"

# Triangle budgets per prop category for the import gate [added: starting points, set them per project].
DEFAULT_BUDGETS = {"small_prop": 3_000, "prop": 10_000, "large_prop": 30_000, "building": 60_000,
                   "character": 40_000, "hero": 80_000}


# ---------------------------------------------------------------- install


def install_world(project, overwrite: bool = True) -> Path:
    """Copy scripts/agentkit/world/ (jobs, post-import script, runtime scripts) into the project."""
    import gd_env
    project = Path(project).resolve()
    if not (project / "addons" / "agentkit" / "agent_job.gd").exists():
        gd_env.install_agentkit(project)
    dest = project / "addons" / "agentkit" / "world"
    for src in WORLD_KIT.rglob("*.gd"):
        rel = src.relative_to(WORLD_KIT)
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if overwrite or not out.exists():
            shutil.copy2(src, out)
    return dest


def _job(project, method: str, args: dict | None = None, timeout: float = 600, headless: bool = True,
         extra_args: list[str] | None = None, editor: bool = False, fast: bool = True) -> dict:
    """Run world_<module>.gd:<method>. fast=True adds --fixed-fps 60 to headless runs: physics steps at a
    fixed 1/60 s without waiting for real time (controller suite 34.1 s -> 1.5 s, same numbers, 2026-10-02)."""
    import gd_run
    install_world(project)
    mod, _, name = method.partition(":")
    extra = list(extra_args or [])
    if fast and headless and "--fixed-fps" not in extra:
        extra += ["--fixed-fps", "60"]
    return gd_run.run_script(project, f"{WORLD_RES}/{mod}:{name}", args=args or {}, timeout=timeout,
                             headless=headless, extra_args=extra, editor=editor)


# ---------------------------------------------------------------- project and physics


def physics_gate(project, timeout: float = 120) -> dict:
    """Read the 3D physics settings and prove which engine runs (Jolt face_index probe)."""
    return _job(project, "world_project.gd:gate", timeout=timeout)


def set_layer_names(project, names: dict[int, str]) -> None:
    """Write layer_names/3d_physics/layer_N into project.godot (text edit through gd_env)."""
    import gd_env
    for n, label in names.items():
        gd_env.set_project_setting(project, f"layer_names/3d_physics/layer_{int(n)}", json.dumps(label))


# ---------------------------------------------------------------- level jobs (thin wrappers)
# Each returns the gd_run result dict; the job's own numbers are in r["result"].


def compile_world(project) -> dict:
    """Compile every world kit script (agent_audit.gd:scripts skips addons/agentkit/)."""
    return _job(project, "world_project.gd:compile")


def build_player(project, **args) -> dict:
    """res://world/player/player.tscn: CharacterBody3D + capsule + Skin + CameraPivot/SpringArm3D/Camera3D,
    plus the InputMap actions move_*, look_*, jump (only those missing)."""
    return _job(project, "world_player.gd:build_player", args)


def controller_suite(project, **args) -> dict:
    """Gym in memory: flat run, look-down run, jump apex, stair lanes (module on and off), descent,
    ledge, 40 and 50 degree ramps, spring arm against a wall."""
    return _job(project, "world_player.gd:controller_suite", args)


def build_village(project, layout: dict, **args) -> dict:
    """CSG village from a layout (see validate_layout), baked copy, load timings."""
    return _job(project, "world_blockout.gd:build_village", dict(args, layout=layout))


def door_test(project, layout: dict, **args) -> dict:
    return _job(project, "world_blockout.gd:door_test", dict(args, layout=layout))


def build_kit(project, **args) -> dict:
    return _job(project, "world_kit.gd:build_kit", args)


def build_grid(project, **args) -> dict:
    return _job(project, "world_kit.gd:build_grid", args)


def build_island(project, **args) -> dict:
    """Noise heightmap, chunked ArrayMesh, HeightMapShape3D, water, sun, camera; heights.exr next to it."""
    return _job(project, "world_terrain.gd:build_island", args)


def scatter(project, **args) -> dict:
    """MultiMesh scatter. Always windowed: headless runs lose every MultiMesh transform."""
    return _job(project, "world_scatter.gd:scatter", args, headless=False)


def terrain3d(project, **args) -> dict:
    """Terrain3D 1.0.2 from code (the add-on must be in addons/terrain_3d and imported once)."""
    return _job(project, "world_terrain3d.gd:build", args)


def audit_level(project, scenes: list[str]) -> dict:
    return _job(project, "world_audit.gd:level", {"scenes": scenes})


def lod_probe(project, scene: str, distances=(3, 10, 30, 100, 300), size=(1920, 1080)) -> dict:
    """Primitives drawn at each distance with LODs on and off, in a SubViewport (windowed run)."""
    return _job(project, "world_import.gd:lod_probe", {"scene": scene, "distances": list(distances), "size": list(size)}, headless=False)


# ---------------------------------------------------------------- GLB inspection (offline)

_COMPONENTS = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def _read_glb(path) -> tuple[dict, bytes]:
    b = Path(path).read_bytes()
    if b[:4] == b"glTF":
        clen, _ctype = struct.unpack("<II", b[12:20])
        j = json.loads(b[20:20 + clen])
        rest = b[20 + clen:]
        binary = b""
        if len(rest) >= 8:
            blen, _btype = struct.unpack("<II", rest[:8])
            binary = rest[8:8 + blen]
        return j, binary
    return json.loads(b.decode("utf-8")), b""  # .gltf (external buffers not read)


def _mat4_from_node(n: dict) -> list[float]:
    if "matrix" in n:
        m = n["matrix"]  # column-major
        return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]
    tx, ty, tz = n.get("translation", [0, 0, 0])
    qx, qy, qz, qw = n.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = n.get("scale", [1, 1, 1])
    r = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
         2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
         2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]
    return [r[0] * sx, r[1] * sy, r[2] * sz, tx, r[3] * sx, r[4] * sy, r[5] * sz, ty,
            r[6] * sx, r[7] * sy, r[8] * sz, tz, 0, 0, 0, 1]


def _mul(a: list[float], b: list[float]) -> list[float]:
    return [sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4)) for r in range(4) for c in range(4)]


def _xf_point(m: list[float], p) -> tuple[float, float, float]:
    x, y, z = p
    return (m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11])


def _image_size(data: bytes) -> tuple[int, int] | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            seg = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return None
    return None


def glb_stats(path) -> dict:
    """Offline facts about a .glb/.gltf: generator, nodes, meshes, triangles, scene-space size and pivot,
    materials (doubleSided, metallic), embedded images and their pixel sizes, extensions.

    The scene-space AABB applies node transforms (TRS or matrix) to each primitive's POSITION min/max box
    corners, so a normalised mesh under a scaled node reads its real exported size.
    """
    path = Path(path)
    j, binary = _read_glb(path)
    acc = j.get("accessors", [])
    nodes = j.get("nodes", [])
    meshes = j.get("meshes", [])
    tris = verts = prims = 0
    for m in meshes:
        for p in m.get("primitives", []):
            prims += 1
            mode = p.get("mode", 4)
            vcount = acc[p["attributes"]["POSITION"]]["count"]
            icount = acc[p["indices"]]["count"] if "indices" in p else vcount
            verts += vcount
            if mode == 4:
                tris += icount // 3
            elif mode in (5, 6):
                tris += max(icount - 2, 0)
    # scene-space bounds
    scenes = j.get("scenes", [{"nodes": list(range(len(nodes)))}])
    roots = scenes[j.get("scene", 0)].get("nodes", []) if scenes else []
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    mesh_nodes = 0
    stack = [(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) for r in roots]
    while stack:
        idx, parent = stack.pop()
        n = nodes[idx]
        m = _mul(parent, _mat4_from_node(n))
        if "mesh" in n:
            mesh_nodes += 1
            for p in meshes[n["mesh"]].get("primitives", []):
                a = acc[p["attributes"]["POSITION"]]
                if "min" in a and "max" in a:
                    mn, mx = a["min"], a["max"]
                    for cx in (mn[0], mx[0]):
                        for cy in (mn[1], mx[1]):
                            for cz in (mn[2], mx[2]):
                                q = _xf_point(m, (cx, cy, cz))
                                for k in range(3):
                                    lo[k] = min(lo[k], q[k])
                                    hi[k] = max(hi[k], q[k])
        for c in n.get("children", []):
            stack.append((c, m))
    size = [hi[k] - lo[k] for k in range(3)] if lo[0] != math.inf else [0, 0, 0]
    centre = [(hi[k] + lo[k]) / 2 for k in range(3)] if lo[0] != math.inf else [0, 0, 0]
    images = []
    views = j.get("bufferViews", [])
    for im in j.get("images", []):
        info = {"name": im.get("name"), "mime": im.get("mimeType"), "uri": im.get("uri")}
        if "bufferView" in im and binary:
            bv = views[im["bufferView"]]
            data = binary[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
            info["bytes"] = len(data)
            wh = _image_size(data)
            if wh:
                info["width"], info["height"] = wh
        images.append(info)
    mats = []
    for mt in j.get("materials", []):
        pbr = mt.get("pbrMetallicRoughness", {})
        mats.append({"name": mt.get("name"), "double_sided": bool(mt.get("doubleSided", False)),
                     "alpha_mode": mt.get("alphaMode", "OPAQUE"),
                     "metallic": pbr.get("metallicFactor", 1.0 if "metallicRoughnessTexture" in pbr else pbr.get("metallicFactor", 1.0)),
                     "roughness": pbr.get("roughnessFactor", 1.0),
                     "base_color_texture": "baseColorTexture" in pbr, "mr_texture": "metallicRoughnessTexture" in pbr,
                     "normal_texture": "normalTexture" in mt, "occlusion_texture": "occlusionTexture" in mt,
                     "emissive_texture": "emissiveTexture" in mt})
    return {"file": str(path), "bytes": path.stat().st_size, "generator": j.get("asset", {}).get("generator", ""),
            "nodes": len(nodes), "mesh_nodes": mesh_nodes, "meshes": len(meshes), "primitives": prims,
            "triangles": tris, "vertices": verts, "size": size, "centre": centre, "min": lo if lo[0] != math.inf else None,
            "max": hi if hi[0] != math.inf else None, "materials": mats, "images": images,
            "skins": len(j.get("skins", [])), "animations": len(j.get("animations", [])),
            "extensions_used": j.get("extensionsUsed", []), "root_node_names": [nodes[r].get("name", "") for r in roots]}


def glb_flags(stats: dict, budget_tris: int | None = None, max_texture: int = 2048) -> list[str]:
    """Import-gate flags from glb_stats. The patterns come from six Scenario-delivered GLBs measured on
    2026-10-02 (Tripo P2, Meshy T2, Meshy 7 retexture, Hitem3D 3.0): normalised unit box, centred pivot,
    doubleSided materials, metallic 1.0 with a metallic-roughness texture, 4K textures, 15k to 1M triangles."""
    flags = []
    size = stats["size"]
    longest = max(size) if size else 0
    if 0.95 <= longest <= 1.05 or 1.95 <= longest <= 2.05:
        flags.append(f"normalised size: longest axis {longest:.3f} m. The real size must come from the manifest (height_m)")
    if stats["min"] is not None and size[1] > 0:
        base_off = stats["min"][1]
        if abs(stats["centre"][1]) < 0.05 * size[1] and abs(base_off) > 0.25 * size[1]:
            flags.append(f"pivot at the bounding-box centre (base at y={base_off:.3f}): props sink half into the floor")
    if any(m["double_sided"] for m in stats["materials"]):
        flags.append("doubleSided material: imports with cull_mode disabled (both faces drawn, backfaces lit wrong)")
    if any(m["metallic"] >= 0.99 and m["mr_texture"] for m in stats["materials"]):
        flags.append("metallicFactor 1.0 with a metallic-roughness texture: metalness comes entirely from the texture's blue channel; check it on non-metal props")
    if not stats["materials"]:
        flags.append("no material: geometry only (needs a texture pass or a project material)")
    big = [im for im in stats["images"] if im.get("width", 0) > max_texture]
    if big:
        flags.append(f"{len(big)} texture(s) above {max_texture} px ({big[0].get('width')} px): set process/size_limit on the extracted textures")
    if budget_tris and stats["triangles"] > budget_tris:
        flags.append(f"{stats['triangles']} triangles, budget {budget_tris}: decimate before import (Godot LODs never reduce LOD0)")
    if stats["skins"] == 0 and stats["animations"] == 0 and stats["mesh_nodes"] > 1 and stats["triangles"] > 0:
        pass
    return flags


# ---------------------------------------------------------------- .import files (offline)


def godot_literal(v) -> str:
    """Python value to Godot ConfigFile/Variant text (bool, int, float, str, None, list, dict)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        r = repr(v)
        return r if ("." in r or "e" in r or "inf" in r or "nan" in r) else r + ".0"
    if isinstance(v, str):
        return json.dumps(v)
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(godot_literal(x) for x in v) + "]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "{\n" + ",\n".join(f"{json.dumps(str(k))}: {godot_literal(x)}" for k, x in v.items()) + "\n}"
    raise TypeError(f"no Godot literal for {type(v)}")


def write_import_file(asset_path, params: dict, importer: str = "scene", subresources: dict | None = None) -> Path:
    """Write a minimal <asset>.import before the first import. Godot 4.7.2 keeps these [params] and
    fills in the rest (uid, dest files, defaults) on `--import` (observed 2026-10-02)."""
    p = Path(str(asset_path) + ".import")
    lines = ["[remap]", "", f'importer="{importer}"', "", "[params]", ""]
    for k, v in params.items():
        lines.append(f"{k}={godot_literal(v)}")
    if subresources is not None:
        lines.append(f"_subresources={godot_literal(subresources)}")
    p.write_text("\n".join(lines) + "\n")
    return p


def read_import_params(import_file) -> dict:
    """[params] of a .import file as raw literal strings (multi-line values such as _subresources joined)."""
    out: dict[str, str] = {}
    sect = None
    key = None
    buf: list[str] = []
    depth = 0
    for line in Path(import_file).read_text().splitlines():
        if depth > 0 and key:
            buf.append(line)
            depth += line.count("{") + line.count("[") - line.count("}") - line.count("]")
            if depth <= 0:
                out[key] = "\n".join(buf)
                key = None
            continue
        s = line.strip()
        if s.startswith("[") and s.endswith("]") and "=" not in s:
            sect = s[1:-1]
            continue
        if sect == "params" and "=" in s:
            k, _, v = s.partition("=")
            d = v.count("{") + v.count("[") - v.count("}") - v.count("]")
            if d > 0:
                key, buf, depth = k, [v], d
            else:
                out[k] = v
    return out


def set_import_params(import_file, params: dict) -> None:
    """Edit keys in [params] of an existing .import (keeps everything else). An edited .import is
    re-imported by the next `--import` (observed 4.7.2: the .scn was rewritten, textures untouched)."""
    p = Path(import_file)
    lines = p.read_text().splitlines()
    try:
        start = lines.index("[params]")
    except ValueError:
        lines += ["", "[params]", ""]
        start = len(lines) - 2
    end = len(lines)
    for i in range(start + 1, len(lines)):
        s = lines[i].strip()
        if s.startswith("[") and s.endswith("]") and "=" not in s:
            end = i
            break
    # key -> (first line, last line) inside [params], multi-line values tracked by bracket depth
    spans: dict[str, tuple[int, int]] = {}
    i = start + 1
    while i < end:
        s = lines[i]
        if "=" in s and not s.startswith((" ", "\t", "\"", "}")):
            k = s.split("=", 1)[0]
            v = s.split("=", 1)[1]
            depth = v.count("{") + v.count("[") - v.count("}") - v.count("]")
            j = i
            while depth > 0 and j + 1 < end:
                j += 1
                depth += lines[j].count("{") + lines[j].count("[") - lines[j].count("}") - lines[j].count("]")
            spans[k] = (i, j)
            i = j + 1
        else:
            i += 1
    body = lines[start + 1:end]
    replace: dict[int, list[str]] = {}
    drop: set[int] = set()
    new_keys = []
    for k, v in params.items():
        new = f"{k}={godot_literal(v)}".split("\n")
        if k in spans:
            a, b = spans[k]
            replace[a] = new
            drop.update(range(a + 1, b + 1))
        else:
            new_keys.extend(new)
    out = lines[:start + 1]
    for idx in range(start + 1, end):
        if idx in replace:
            out.extend(replace[idx])
        elif idx not in drop:
            out.append(lines[idx])
    while out and out[-1] == "" and end < len(lines):
        out.pop()
    out.extend(new_keys)
    if end < len(lines):
        out.append("")
        out.extend(lines[end:])
    del body
    p.write_text("\n".join(out) + "\n")


# Scene import keys of 4.7.2, read from a .import written by `--import` on 2026-10-02 (defaults shown).
SCENE_IMPORT_DEFAULTS = {
    "nodes/root_type": "", "nodes/root_name": "", "nodes/root_script": None,
    "mesh_library/use_node_names_as_mesh_names": False, "array_mesh/deduplicate_surfaces": True,
    "nodes/apply_root_scale": True, "nodes/root_scale": 1.0, "nodes/import_as_skeleton_bones": False,
    "nodes/use_name_suffixes": True, "nodes/use_node_type_suffixes": True,
    "meshes/ensure_tangents": True, "meshes/generate_lods": True, "meshes/create_shadow_meshes": True,
    "meshes/light_baking": 1, "meshes/lightmap_texel_size": 0.2, "meshes/force_disable_compression": False,
    "skins/use_named_skins": True, "animation/import": True, "animation/fps": 30, "animation/trimming": False,
    "animation/remove_immutable_tracks": True, "animation/import_rest_as_RESET": False, "import_script/path": "",
    "materials/extract": 0, "materials/extract_format": 0, "materials/extract_path": "",
    "gltf/naming_version": 2, "gltf/embedded_image_handling": 1, "gltf/texture_map_mode": 1,
}

# Texture params for extracted PBR maps. Headless --import leaves them lossless (compress/mode=0,
# vram_texture false) because 3D-use detection never fires there (observed): set them explicitly.
TEXTURE_PARAMS_3D = {"compress/mode": 2, "mipmaps/generate": True, "process/size_limit": 2048, "detect_3d/compress_to": 0}
NORMAL_MAP_EXTRA = {"compress/normal_map": 1}


# ---------------------------------------------------------------- GLB ingest pipeline


def ingest_glbs(project, src_dir, manifest: dict, dest_res: str = "res://props", post_import: bool = True,
                extra_params: dict | None = None, do_import: bool = True, timeout: float = 3600) -> dict:
    """Copy each <name>.glb of src_dir listed in manifest["props"] into <dest_res>/<category>/<name>.glb,
    write its .import before the first import (post-import script, LODs, light baking), write the
    manifest the post-import script reads, run `--import`, then retune the extracted textures and import
    again. Returns per-file offline stats and flags, import durations and the texture edits.

    manifest = {"defaults": {...}, "props": {"crate": {"category": "prop", "height_m": 0.8, ...}}}
    """
    import gd_run
    project = Path(project).resolve()
    src_dir = Path(src_dir)
    install_world(project)
    dest_root = project / dest_res.replace("res://", "")
    dest_root.mkdir(parents=True, exist_ok=True)
    report: dict = {"files": {}, "imports": []}
    params = {"nodes/root_type": "Node3D", "meshes/generate_lods": True, "meshes/create_shadow_meshes": True,
              "meshes/light_baking": 1, "gltf/embedded_image_handling": 1}
    if post_import:
        params["import_script/path"] = f"{WORLD_RES}/post_import_prop.gd"
    params.update(extra_params or {})
    for name, spec in manifest.get("props", {}).items():
        src = src_dir / f"{name}.glb"
        if not src.exists():
            report["files"][name] = {"error": f"missing {src}"}
            continue
        cat = spec.get("category", "prop")
        out = dest_root / cat / f"{name}.glb"
        out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists():
            try:
                subprocess.run(["cp", "-c", str(src), str(out)], check=True, capture_output=True)  # APFS clone
            except Exception:
                shutil.copy2(src, out)
        if not Path(str(out) + ".import").exists():
            write_import_file(out, params)
        st = glb_stats(out)
        budget = spec.get("budget_tris") or DEFAULT_BUDGETS.get(cat)
        report["files"][name] = {"res": f"{dest_res}/{cat}/{name}.glb", "stats": st, "flags": glb_flags(st, budget), "budget_tris": budget}
    (dest_root / "props_manifest.json").write_text(json.dumps(manifest, indent=1))
    if dest_res != "res://props":
        import gd_env
        gd_env.set_project_setting(project, "world/props/manifest", json.dumps(f"{dest_res}/props_manifest.json"))
    if not do_import:
        return report
    t0 = time.time()
    r1 = gd_run.import_project(project, timeout=timeout)
    report["imports"].append({"pass": "scenes", "ok": r1["ok"], "duration_s": r1["duration_s"],
                              "errors": [e["message"] for e in r1["engine_errors"] + r1["script_errors"]][:20],
                              "warnings": [w["message"] for w in r1["warnings"]][:20]})
    edits = retune_textures(project, dest_res)
    report["texture_edits"] = edits
    if edits:
        r2 = gd_run.import_project(project, timeout=timeout)
        report["imports"].append({"pass": "textures", "ok": r2["ok"], "duration_s": r2["duration_s"],
                                  "errors": [e["message"] for e in r2["engine_errors"] + r2["script_errors"]][:20]})
    report["import_total_s"] = round(time.time() - t0, 2)
    report["ok"] = all(i["ok"] and not i["errors"] for i in report["imports"])
    return report


def retune_textures(project, dest_res: str = "res://props", params: dict | None = None,
                    normal_patterns=("normal", "nrm", "_n.", "normalgl")) -> list[dict]:
    """Set VRAM compression, mipmaps and a size limit on every texture .import under dest_res; add
    compress/normal_map=1 on files whose name looks like a normal map. Returns the edited files."""
    project = Path(project).resolve()
    root = project / dest_res.replace("res://", "")
    edits = []
    base = dict(TEXTURE_PARAMS_3D)
    base.update(params or {})
    for imp in sorted(root.rglob("*.import")):
        txt = imp.read_text()
        if 'importer="texture"' not in txt:
            continue
        want = dict(base)
        if any(p in imp.name.lower() for p in normal_patterns):
            want.update(NORMAL_MAP_EXTRA)
        cur = read_import_params(imp)
        changed = {k: v for k, v in want.items() if cur.get(k) != godot_literal(v)}
        if changed:
            set_import_params(imp, changed)
            edits.append({"file": str(imp.relative_to(project)), "set": changed})
    return edits


def audit_props(project, scenes: list[str], budgets: dict | None = None, timeout: float = 600) -> dict:
    """Load each imported prop scene headless and check name, pivot, size, triangles, collision, layers,
    materials (world_import.gd:audit)."""
    return _job(project, "world_import.gd:audit", {"scenes": scenes, "budgets": budgets or DEFAULT_BUDGETS}, timeout=timeout)


def imported_sizes(project, dest_res: str = "res://props") -> dict:
    """Bytes of .godot/imported/* per source file under dest_res (what the import costs on disk)."""
    project = Path(project).resolve()
    imp = project / ".godot" / "imported"
    out: dict[str, int] = {}
    root = project / dest_res.replace("res://", "")
    for f in root.rglob("*.import"):
        src = f.name[:-len(".import")]
        for d in imp.glob(src + "-*"):
            if d.suffix in (".ctex", ".scn", ".res", ".mesh"):
                out[src] = out.get(src, 0) + d.stat().st_size
    return out


# ---------------------------------------------------------------- level layout (offline)


def validate_layout(layout: dict, capsule_radius: float = 0.35, capsule_height: float = 1.8,
                    camera_clearance: float = 2.6) -> list[str]:
    """Metric checks on a village layout before building it: doors wide and tall enough for the
    character, streets wide enough, houses not overlapping. Returns problems (empty = pass)."""
    probs = []
    min_door = 2 * capsule_radius + 0.3
    houses = layout.get("houses", [])
    for h in houses:
        d = h.get("door", {})
        if d and float(d.get("width", 0)) < min_door:
            probs.append(f"{h['name']}: door {d.get('width')} m < {min_door:.2f} m (capsule {capsule_radius} m + 0.15 m each side)")
        if d and float(d.get("height", 0)) < capsule_height + 0.2:
            probs.append(f"{h['name']}: door height {d.get('height')} m < {capsule_height + 0.2:.2f} m")
        if float(h["size"][2]) < camera_clearance:
            probs.append(f"{h['name']}: storey {h['size'][2]} m < {camera_clearance} m camera clearance")
    for i, a in enumerate(houses):
        for b in houses[i + 1:]:
            ax, az = a["pos"]
            bx, bz = b["pos"]
            gap_x = abs(ax - bx) - (a["size"][0] + b["size"][0]) / 2
            gap_z = abs(az - bz) - (a["size"][1] + b["size"][1]) / 2
            if gap_x < 0 and gap_z < 0:
                probs.append(f"{a['name']} overlaps {b['name']}")
            elif max(gap_x, gap_z) < layout.get("min_street", 3.0) and max(gap_x, gap_z) >= 0:
                probs.append(f"{a['name']} to {b['name']}: street {max(gap_x, gap_z):.2f} m < {layout.get('min_street', 3.0)} m")
    return probs


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-godot-3d-world helpers")
    ap.add_argument("cmd", choices=["glb-stats"])
    ap.add_argument("paths", nargs="+")
    ns = ap.parse_args()
    if ns.cmd == "glb-stats":
        for p in ns.paths:
            s = glb_stats(p)
            s["flags"] = glb_flags(s)
            print(json.dumps(s, indent=1))
