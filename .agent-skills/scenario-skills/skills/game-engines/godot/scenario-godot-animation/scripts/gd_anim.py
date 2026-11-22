"""scenario-godot-animation runner-side helpers (0.1, Godot 4.7.2, system python3, standard library only).

Uses the lead's toolkit (scenario-godot-expert/scripts: gd_env, gd_run, gd_review). Add both folders to sys.path:

    sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-animation/scripts"]
    import gd_anim
    gd_anim.install_animkit(P)                       # copies agentkit/animation/*.gd to res://addons/agentkit/animation/
    gd_anim.build_rig(P, naming="mixamo", glb="res://assets/hero_mixamo.glb")
"""
from __future__ import annotations

__version__ = "0.1"

import json
import math
import re
import shutil
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_SRC = HERE / "agentkit" / "animation"
LEAD = HERE.parent.parent / "scenario-godot-expert" / "scripts"
if str(LEAD) not in sys.path:
    sys.path.insert(0, str(LEAD))

import gd_run  # noqa: E402

KIT_RES = "res://addons/agentkit/animation"


# ---------------------------------------------------------------- install and run

def install_animkit(project) -> Path:
    """Copy this skill's GDScript kit into <project>/addons/agentkit/animation/ (AgentKit must be there)."""
    project = Path(project)
    if not (project / "addons" / "agentkit" / "agent_job.gd").exists():
        import gd_env
        gd_env.install_agentkit(project)
    dest = project / "addons" / "agentkit" / "animation"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT_SRC.glob("*.gd")):
        shutil.copy2(f, dest / f.name)
    (dest / "VERSION").write_text("animkit 0.1 (scenario-godot-animation)\n")
    return dest


def kit(module: str, method: str) -> str:
    """'anim_rig', 'build' -> 'res://addons/agentkit/animation/anim_rig.gd:build' (a run_script target)."""
    return f"{KIT_RES}/{module}.gd:{method}"


def run_kit(project, module: str, method: str, args: dict | None = None, **kw) -> dict:
    return gd_run.run_script(project, kit(module, method), args=args or {}, **kw)


def build_rig(project, naming: str = "profile", scene: str = "res://anim/hero.tscn", glb: str = "",
              with_root: bool | None = None, clips: bool = True, scale: float = 1.0, timeout: float = 120) -> dict:
    """Procedural humanoid (anim_rig.gd): T-pose skeleton, skinned box mesh, clips; optional GLB export.

    clips=False makes a character-only file (like a Mixamo "With Skin" T-pose download); scale changes
    every bone offset (a taller or shorter body for retarget tests)."""
    a = {"naming": naming, "scene": scene, "glb": glb, "clips": clips, "scale": scale}
    if with_root is not None:
        a["with_root"] = with_root
    return run_kit(project, "anim_rig", "build", a, timeout=timeout)


def pose_sheet(project, scene: str, anim: str = "", times=(0.0,), views=("front",), size=(360, 360), out_dir: str | None = None,
               sheet: str | None = None, cols: int | None = None, driver: str = "player", params: dict | None = None,
               bones=(), stage: bool = True, extra: dict | None = None, timeout: float = 300) -> dict:
    """Windowed capture of exact animation times (anim_capture.gd:poses) plus a contact sheet you then OPEN.

    driver="player" seeks the AnimationPlayer; driver="tree" advances the AnimationTree in fixed steps.
    views: bookmark views framed on the rest bounds, or ["scene"] to use the scene's current camera.
    Returns the run dict with result.images, result.samples (bone world positions per time), checks, sheet.
    """
    import gd_review
    out_dir = out_dir or f"captures/{(anim or 'scene')}"
    a = {"scene": scene, "anim": anim, "times": list(times), "views": list(views), "size": list(size),
         "out_dir": out_dir, "driver": driver, "params": params or {}, "bones": list(bones), "stage": stage}
    if extra:
        a.update(extra)
    r = run_kit(project, "anim_capture", "poses", a, headless=False, timeout=timeout)
    imgs = (r.get("result") or {}).get("images") or []
    r["checks"] = {p: gd_review.image_checks(p) for p in imgs if Path(p).exists()}
    if imgs:
        sheet = sheet or str(Path(imgs[0]).parent / "contact_sheet.png")
        r["sheet"] = gd_review.contact_sheet(imgs, sheet, cols=cols or max(1, len(views)) * min(len(times), 4 if len(views) == 1 else 2),
                                             thumb=min(400, int(1600 / max(1, cols or 4))))
    return r


def audit(project, scene: str, expect_loops=(), in_place=(), root_motion_bone: str = "", timeout: float = 120) -> dict:
    """anim_audit.gd:scene on a .tscn or an imported .glb/.fbx (headless). result.flags lists what to fix."""
    return run_kit(project, "anim_audit", "scene", {"scene": scene, "expect_loops": list(expect_loops),
                                                     "in_place": list(in_place), "root_motion_bone": root_motion_bone},
                   timeout=timeout)


# ---------------------------------------------------------------- GLB JSON (offline)

def glb_read(path) -> tuple[dict, bytes]:
    """Return (gltf JSON, BIN chunk bytes) of a .glb file."""
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"not a glTF 2 binary: {path}")
    off = 12
    js, bin_ = None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b"JSON":
            js = json.loads(chunk.decode("utf-8").rstrip(" \x00"))
        elif ctype == b"BIN\x00":
            bin_ = chunk
        off += 8 + clen
    return js, bin_


def glb_write(path, js: dict, bin_: bytes) -> None:
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = bin_ + b"\x00" * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(jb), b"JSON") + jb
    if bb:
        out += struct.pack("<I4s", len(bb), b"BIN\x00") + bb
    Path(path).write_bytes(out)


def glb_rename(path, node_sub: tuple[str, str] | None = None, anim_names: dict | None = None, out=None) -> dict:
    """Rename glTF nodes (regex sub on every node name) and animations (old -> new) in a .glb.

    Used to make Mixamo-style test files: node_sub=("^mixamorig_", "mixamorig:") gives real Mixamo bone
    names, which Godot sanitises back to mixamorig_ on import (':' is illegal in 4.7.2 bone names).
    """
    js, bin_ = glb_read(path)
    n_nodes = 0
    if node_sub:
        for n in js.get("nodes", []):
            if "name" in n:
                new = re.sub(node_sub[0], node_sub[1], n["name"])
                if new != n["name"]:
                    n["name"] = new
                    n_nodes += 1
    n_anims = 0
    for a in js.get("animations", []):
        if anim_names and a.get("name") in anim_names:
            a["name"] = anim_names[a["name"]]
            n_anims += 1
    glb_write(out or path, js, bin_)
    return {"nodes_renamed": n_nodes, "animations_renamed": n_anims,
            "animations": [a.get("name") for a in js.get("animations", [])]}


def glb_summary(path) -> dict:
    js, bin_ = glb_read(path)
    skins = js.get("skins", [])
    return {"nodes": len(js.get("nodes", [])), "skins": len(skins), "joints": len(skins[0]["joints"]) if skins else 0,
            "animations": [a.get("name") for a in js.get("animations", [])], "meshes": len(js.get("meshes", [])),
            "bin_bytes": len(bin_), "first_joint_names": [js["nodes"][j].get("name") for j in (skins[0]["joints"][:4] if skins else [])]}


# ---------------------------------------------------------------- .import files

def read_import(path) -> dict:
    """Parse a .import file into {section: {key: raw literal}} (values stay Godot text)."""
    out, sec = {}, None
    key = None
    for line in Path(path).read_text().splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]") and "=" not in s:
            sec = s[1:-1]
            out[sec] = {}
            key = None
        elif "=" in line and sec is not None and not line.startswith((" ", "\t")) and re.match(r"^[A-Za-z_][\w/]*=", line):
            key, val = line.split("=", 1)
            out[sec][key] = val
        elif sec is not None and key is not None:
            out[sec][key] += "\n" + line
    return out


def set_import_options(project, files, params: dict | None = None, subresources: dict | None = None, importer: str = "",
                       reimport: bool = True, timeout: float = 300) -> dict:
    """Edit .import options through ConfigFile in Godot (anim_import.gd:set_options), then reimport.

    params: [params] keys, e.g. {"animation/fps": 30, "animation/remove_immutable_tracks": False}.
    subresources: merged into _subresources, e.g.
        {"animations": {"walk": {"settings/loop_mode": 1, "save_to_file/enabled": True, "save_to_file/path": "res://anim/walk.res"}},
         "nodes": {"PATH:Armature/Skeleton3D": {"retarget/bone_map": "res://anim/mixamo_bonemap.tres"}}}
      A string value "res://...tres" for a key ending in bone_map is loaded as a resource.
    importer: "" (keep), "scene" or "animation_library" (Import As: Animation Library).
    reimport=True runs a headless editor job (EditorFileSystem.reimport_files), which is what applies them.
    """
    files = [files] if isinstance(files, str) else list(files)
    r = run_kit(project, "anim_import", "set_options", {"files": files, "params": params or {}, "subresources": subresources or {},
                                                         "importer": importer}, timeout=timeout)
    if not r["ok"] or not reimport:
        return r
    r2 = run_kit(project, "anim_import", "reimport", {"files": files}, editor=True, timeout=timeout)
    r["reimport"] = {k: r2.get(k) for k in ("ok", "error", "duration_s", "result")}
    r["ok"] = r["ok"] and r2["ok"]
    if not r2["ok"]:
        r["error"] = "reimport: " + r2["error"]
    return r


def sample_bones(project, scene: str, anim: str, times, bones=("Hips", "LeftFoot", "RightFoot"), frames: int = 1,
                 modifiers: bool = True, timeout: float = 120) -> dict:
    """World positions of bones at exact clip times (headless). result.bones[name] = [[x, y, z], ...]."""
    return run_kit(project, "anim_audit", "sample", {"scene": scene, "anim": anim, "times": list(times), "bones": list(bones),
                                                      "frames": frames, "modifiers": modifiers}, timeout=timeout)


def max_deviation(a: dict, b: dict) -> dict:
    """Max distance per bone between two sample_bones results (same times). Offline."""
    out = {}
    for name, pa in a["bones"].items():
        pb = b["bones"].get(name)
        if not pb:
            continue
        out[name] = max(math.dist(x, y) for x, y in zip(pa, pb))
    return out
