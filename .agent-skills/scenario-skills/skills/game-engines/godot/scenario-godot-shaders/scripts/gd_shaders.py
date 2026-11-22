#!/usr/bin/env python3
"""gd_shaders: shader work for an agent driving Godot 4.7.2 (scenario-godot-shaders 0.1).

System python3, standard library (Pillow optional, through gd_review). Builds on the scenario-godot-expert
toolkit (gd_env, gd_run, gd_review, gd_stat), found next to this skill or through GODOT_EXPERT_SCRIPTS.

    install(project, templates=True, overwrite=False) -> dict
    lint(target, renderers=RENDERERS, project=None, mobile=False) -> list[dict]       offline, no Godot
    uniform_bytes(code) -> dict
    shader_globals(project) -> dict;  register_global(project, name, gtype, value_literal) -> None
    compile_matrix(project, files=None, root="res://", renderers=RENDERERS) -> dict    headless, ~0.2 s each
    draw_check(project, files=None, renderers=RENDERERS) -> dict                       windowed backend compile
    param_sweep(project, scene, shots=None, node=None, param=None, values=None, kind="shader",
                size=(640, 360), frames=6, camera=None, out="captures/sweep/shot", renderer=None,
                driver=None, time_scale=1.0, sheet=True, cols=None) -> dict              windowed captures
    renderer_captures(project, scene, renderers=RENDERERS, size=(640, 360), out="captures/renderers",
                      camera=None, frames=10) -> dict
    cost_compare(project, scenes, size=(1920, 1080), seconds=3.0, driver="vulkan") -> dict  GPU ms per scene

Every function that runs Godot goes through gd_run (GD_MAX slots, one process per project, no GUI
editor on the project, wall-clock timeout).
"""
from __future__ import annotations

__version__ = "0.1"

import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE / "agentkit" / "shaders"
_EXPERT = Path(os.environ.get("GODOT_EXPERT_SCRIPTS", HERE.parents[1] / "scenario-godot-expert" / "scripts"))
if str(_EXPERT) not in sys.path:
    sys.path.insert(0, str(_EXPERT))
import gd_review  # noqa: E402
import gd_run  # noqa: E402

RENDERERS = ("forward_plus", "mobile", "gl_compatibility")
TOOLS = "res://addons/agentkit/shaders/shader_tools.gd"


# ---------------------------------------------------------------- install

def install(project, templates: bool = True, overwrite: bool = False) -> dict:
    """Copy the shader AgentKit (*.gd) to addons/agentkit/shaders/ (always refreshed) and the shader
    templates (*.gdshader, *.gdshaderinc) to res://shaders/ (kept if present unless overwrite)."""
    project = Path(project)
    tools = project / "addons" / "agentkit" / "shaders"
    tools.mkdir(parents=True, exist_ok=True)
    copied = []
    for f in sorted(KIT.glob("*.gd")):
        shutil.copy2(f, tools / f.name)
        copied.append(str(tools / f.name))
    if templates:
        dest = project / "shaders"
        dest.mkdir(parents=True, exist_ok=True)
        for f in sorted(list(KIT.glob("*.gdshader")) + list(KIT.glob("*.gdshaderinc"))):
            t = dest / f.name
            if t.exists() and not overwrite:
                continue
            shutil.copy2(f, t)
            copied.append(str(t))
    return {"ok": True, "copied": copied}


# ---------------------------------------------------------------- offline lint

_G3 = [
    (r":\s*hint_(albedo|color)\b", "Godot 3 hint", "source_color"),
    (r"\bhint_white\b", "Godot 3 hint", "hint_default_white"),
    (r"\bhint_black\b", "Godot 3 hint", "hint_default_black"),
    (r"\bhint_aniso\b", "Godot 3 hint", "hint_anisotropy"),
    (r"\bSCREEN_TEXTURE\b", "removed built-in", "uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;"),
    (r"\bDEPTH_TEXTURE\b", "removed built-in", "uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;"),
    (r"\bWORLD_MATRIX\b", "removed built-in", "MODEL_MATRIX"),
    (r"\bINV_CAMERA_MATRIX\b", "removed built-in", "VIEW_MATRIX"),
    (r"\bCAMERA_MATRIX\b", "removed built-in", "INV_VIEW_MATRIX"),
    (r"\bNORMALMAP\b", "removed built-in", "NORMAL_MAP"),
    (r"\bTRANSMISSION\b", "removed built-in", "BACKLIGHT"),
    (r"\bALPHA_SCISSOR\b(?!_)", "removed built-in", "ALPHA_SCISSOR_THRESHOLD"),
    (r"\bdepth_draw_alpha_prepass\b", "renamed render mode", "depth_prepass_alpha"),
    (r"\bLIGHT_VEC\b", "removed built-in", "LIGHT_DIRECTION"),
]
_COLORISH = re.compile(r"(colou?r|tint|albedo|diffuse|base_col|emission_col)", re.I)
_NONCOLOR = re.compile(r"(normal|rough|metal|height|depth|mask|noise|ao\b|orm|bump|flow)", re.I)
_TYPE_BYTES = {"bool": 4, "int": 4, "uint": 4, "float": 4, "vec2": 16, "vec3": 16, "vec4": 16, "ivec2": 16,
               "ivec3": 16, "ivec4": 16, "uvec2": 16, "uvec3": 16, "uvec4": 16, "bvec2": 16, "bvec3": 16,
               "bvec4": 16, "mat2": 32, "mat3": 48, "mat4": 64}
_UNIFORM = re.compile(r"^\s*(?P<scope>global\s+|instance\s+)?uniform\s+(?:(?:lowp|mediump|highp)\s+)?(?P<type>\w+)\s+(?P<name>\w+)\s*(?:\[(?P<arr>\d+)\])?\s*(?::(?P<hints>[^=;]*))?(?:=(?P<default>[^;]*))?;", re.M)


def _strip_comments(code: str) -> str:
    code = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), code, flags=re.S)
    return re.sub(r"//[^\n]*", "", code)


def uniforms(code: str) -> list[dict]:
    """Declared uniforms: name, type, array size, scope (material/global/instance), hints, line."""
    c = _strip_comments(code)
    out = []
    for m in _UNIFORM.finditer(c):
        out.append({"name": m.group("name"), "type": m.group("type"), "array": int(m.group("arr") or 0),
                    "scope": (m.group("scope") or "material").strip(), "hints": (m.group("hints") or "").strip(),
                    "default": (m.group("default") or "").strip(), "line": c.count("\n", 0, m.start()) + 1})
    return out


def uniform_bytes(code: str) -> dict:
    """Material uniform buffer estimate per the 4.7 docs: vec2/vec3 padded to vec4, scalars 4 bytes,
    arrays count every element, samplers and global/instance uniforms excluded. Budget: 65,536 bytes
    on most desktop GPUs, 16,384 typical on mobile."""
    total = 0
    for u in uniforms(code):
        if u["scope"] != "material" or u["type"].startswith(("sampler", "isampler", "usampler")):
            continue
        total += _TYPE_BYTES.get(u["type"], 16) * max(1, u["array"])
    return {"bytes": total, "mobile_ok": total <= 16384, "desktop_ok": total <= 65536}


def _line_of(code: str, idx: int) -> int:
    return code.count("\n", 0, idx) + 1


def _project_root(start: Path) -> Path | None:
    for d in [start, *start.parents]:
        if (d / "project.godot").exists():
            return d
    return None


def _inline_includes(path: Path, depth: int = 0) -> str:
    """File text with `#include "x.gdshaderinc"` replaced by the included text (relative or res://),
    so lint sees the whole shader. Unresolvable includes stay as they are."""
    txt = path.read_text()
    if depth > 25:
        return txt

    def rep(m):
        inc = m.group(1)
        if not inc.endswith(".gdshaderinc"):
            return m.group(0)
        if inc.startswith("res://"):
            root = _project_root(path.parent)
            f = (root / inc[6:]) if root else None
        else:
            f = path.parent / inc
        if f is None or not f.exists():
            return m.group(0)
        return _inline_includes(f, depth + 1)
    return re.sub(r'#include\s+"([^"]+)"', rep, txt)


def lint(target, renderers=RENDERERS, project=None, mobile: bool = False) -> list[dict]:
    """Static checks for a .gdshader / .gdshaderinc path or code string. Each finding:
    {rule, severity (error|warn|info), line, message, fix}. Errors are things 4.7.2 rejects or that
    render wrong without an error; warn is a likely bug; info explains a cost or a pipeline change.
    project: also check that every `global uniform` is registered in project.godot."""
    p = Path(target) if isinstance(target, (str, Path)) and len(str(target)) < 1024 and Path(str(target)).exists() else None
    raw = _inline_includes(p) if p else str(target)
    code = _strip_comments(raw)
    out: list[dict] = []

    def add(rule, sev, idx, msg, fix=""):
        out.append({"rule": rule, "severity": sev, "line": _line_of(code, idx) if idx is not None else None,
                    "message": msg, "fix": fix})

    st = re.search(r"\bshader_type\s+(\w+)", code)
    stype = st.group(1) if st else None
    for pat, what, fix in _G3:
        for m in re.finditer(pat, code):
            add("godot3", "error", m.start(), f"{what}: {m.group(0).strip()}", fix)
    if stype == "particles" and re.search(r"\bvoid\s+vertex\s*\(", code):
        add("godot3", "error", None, "particles shaders use start() and process(), not vertex()", "void start() / void process()")
    us = uniforms(raw)
    for u in us:
        h = u["hints"]
        is_sampler = u["type"].startswith("sampler")
        if (u["type"] in ("vec3", "vec4") or is_sampler) and _COLORISH.search(u["name"]) and not _NONCOLOR.search(u["name"]) \
                and "source_color" not in h and "hint_screen_texture" not in h:
            add("source_color", "warn", None, f"line {u['line']}: colour uniform {u['name']} without source_color "
                "(sRGB data reads washed out in Forward+/Mobile; no colour picker for vec3/vec4)", "add : source_color")
        if is_sampler and _NONCOLOR.search(u["name"]) and "source_color" in h:
            add("source_color", "warn", None, f"line {u['line']}: {u['name']} is data (normal/roughness/mask) but has source_color", "drop source_color; hint_normal for normal maps")
        if u["array"] and u["default"]:
            add("array_default", "error", None, f"line {u['line']}: uniform arrays cannot have a default value", "remove the default")
        if u["scope"] == "instance" and (is_sampler or u["array"]):
            add("instance_uniform", "error", None, f"line {u['line']}: instance uniforms cannot be samplers or arrays", "uniform texture array + instance int index")
        if "hint_screen_texture" in h and "mipmap" not in h and re.search(rf"textureLod\s*\(\s*{u['name']}\s*,[^;]*,\s*(?!0\.0\s*\))[^;]*\)", code):
            add("screen_lod", "warn", None, f"{u['name']}: textureLod with LOD > 0 needs a *_mipmap filter hint, otherwise the blur is silently sharp", "filter_linear_mipmap")
        if "hint_normal_roughness_texture" in h:
            bad = [r for r in renderers if r != "forward_plus"]
            if bad:
                add("renderer", "error", None, f"{u['name']}: hint_normal_roughness_texture is Forward+ only (compile error on {', '.join(bad)})", "#if CURRENT_RENDERER == RENDERER_FORWARD_PLUS")
    inst = [u for u in us if u["scope"] == "instance"]
    if len(inst) > 16:
        add("instance_uniform", "error", None, f"{len(inst)} instance uniforms: the practical limit is 16 per shader", "pack values into vec4")
    ub = uniform_bytes(raw)
    if not ub["desktop_ok"]:
        add("uniform_budget", "error", None, f"material uniforms {ub['bytes']} bytes > 65,536", "move big arrays to a texture")
    elif mobile and not ub["mobile_ok"]:
        add("uniform_budget", "warn", None, f"material uniforms {ub['bytes']} bytes > 16,384 (typical mobile limit)", "move big arrays to a texture")
    reads_screen = any("hint_screen_texture" in u["hints"] for u in us)
    reads_depth = any("hint_depth_texture" in u["hints"] for u in us)
    writes_alpha = re.search(r"\bALPHA\s*=", code)
    scissor = re.search(r"\bALPHA_(SCISSOR_THRESHOLD|HASH_SCALE)\s*=", code)
    if stype == "spatial" and (writes_alpha and not scissor or reads_screen):
        why = "writes ALPHA" if writes_alpha and not scissor else "reads hint_screen_texture"
        add("transparent", "info", writes_alpha.start() if writes_alpha else None,
            f"{why}: the material draws in the transparent pass (no shadow casting, sorted per object, absent "
            "from other materials' screen and depth textures)", "ALPHA_SCISSOR_THRESHOLD or depth_prepass_alpha when it should stay opaque")
    if (reads_screen or reads_depth) and (mobile or "mobile" in renderers):
        add("mobile_cost", "info", None, "screen or depth texture read: each forces a full-screen copy, the costliest choice on tiled mobile GPUs", "offer a LITE variant (#define) without it")
    if stype == "fog" and "gl_compatibility" in renderers:
        add("renderer", "error", None, "fog shaders do not run in Compatibility ('shader type fog not supported in OpenGL renderer', observed 4.7.2)", "Forward+ only (volumetric fog)")
    if re.search(r"POSITION\s*=\s*vec4\s*\(\s*VERTEX\s*,\s*1\.0\s*\)", code):
        add("reversed_z", "error", None, "full-screen quad written for pre-4.3 depth: under reversed-z (Forward+, Mobile) z = 0 is the far plane, so the effect only shows over the sky; Compatibility still covers the screen, which hides the bug there (observed 4.7.2)", "POSITION = vec4(VERTEX.xy, 1.0, 1.0);")
    if stype == "canvas_item" and re.search(r"texture\s*\(\s*TEXTURE\s*,\s*UV\s*\)\s*\*\s*COLOR\b|\bCOLOR\s*\*\s*texture\s*\(\s*TEXTURE\s*,\s*UV\s*\)", code):
        add("canvas_color", "warn", None, "in canvas_item fragment(), COLOR already holds texture * modulate: multiplying by texture(TEXTURE, UV) again squares the colour (observed 4.7.2: 54 -> 11 on a 0-255 channel)", "vec4 c = COLOR;")
    for m in re.finditer(r"#include\s+\"([^\"]+)\"", raw):
        if not m.group(1).endswith(".gdshaderinc"):
            add("include", "error", None, f"#include \"{m.group(1)}\": only .gdshaderinc files can be included (4.7.2 reports a misleading 'Unknown character #35')", "rename to .gdshaderinc")
    sm = re.search(r"\bstencil_mode\s+([^;]+);", code)
    if sm and "read" in sm.group(1) and not writes_alpha and not re.search(r"depth_draw_never|depth_test_disabled", code):
        add("stencil", "error", sm.start(), "stencil read in the opaque pass: 4.7.2 logs 'reads stencil but is not in the alpha queue' and the test does not apply", "write ALPHA (transparent pass) and give the reader a higher render_priority than the writer")
    if re.search(r"\bdiscard\b", code) and stype == "spatial" and not writes_alpha:
        add("discard", "info", re.search(r"\bdiscard\b", code).start(), "discard in an opaque shader: the depth prepass no longer culls it well; keep it out of hot, full-screen materials", "swap the material in only while the effect plays")
    if stype in ("spatial", "canvas_item") and re.search(r"\bvoid\s+light\s*\(", code):
        add("light", "info", None, "a light() function (even empty) replaces built-in lighting; it does not run with vertex_lighting or Force Vertex Shading (mobile default)", "use unshaded to opt out of lighting instead of an empty light()")
        if re.search(r"\b(DIFFUSE_LIGHT|SPECULAR_LIGHT)\s*=(?!=)", code):
            add("light", "warn", None, "DIFFUSE_LIGHT/SPECULAR_LIGHT assigned with '=': only the last light survives", "use +=")
    for m in re.finditer(r"(?:^|[;{])\s*(float|int|uint|vec[234]|ivec[234])\s+\w+\s*=\s*-?\d+\s*;", code, re.M):
        if m.group(1) in ("float", "vec2", "vec3", "vec4"):
            add("int_literal", "error", m.start(), f"int literal assigned to {m.group(1)} (no implicit casts)", "write 2.0")
    for m in re.finditer(r"(?:^|[;{])\s*(float|vec[234]|int)\s+(\w+)\s*;", code, re.M):
        add("uninitialised", "warn", m.start(), f"local {m.group(2)} declared without a value: locals are not zero-initialised", "initialise it")
    globs = [u["name"] for u in us if u["scope"] == "global"]
    if globs and project:
        reg = shader_globals(project)
        for g in globs:
            if g not in reg:
                add("global_uniform", "error", None, f"global uniform {g} is not in project.godot [shader_globals]: 4.7.2 compiles it anyway and it reads 0 (observed)", "gd_shaders.register_global(...)")
    return out


# ---------------------------------------------------------------- global uniforms

def shader_globals(project) -> dict:
    """[shader_globals] entries of project.godot: name -> raw text of the value."""
    txt = (Path(project) / "project.godot").read_text()
    m = re.search(r"^\[shader_globals\]\s*$(.*?)(?=^\[|\Z)", txt, re.M | re.S)
    if not m:
        return {}
    body = m.group(1)
    out = {}
    for mm in re.finditer(r"^(\w+)=(\{.*?\})\s*$", body, re.M | re.S):
        out[mm.group(1)] = mm.group(2)
    return out


def register_global(project, name: str, gtype: str, value_literal: str) -> None:
    """Add or replace a global shader uniform in project.godot, as the editor's Shader Globals tab
    writes it (verified 4.7.2: ProjectSettings.save() writes the same block). gtype: bool, int, float,
    vec2, vec3, vec4, color, mat4, sampler2D, ... value_literal is Godot text, for example
    'Color(1, 0.5, 0.25, 1)', '0.7', 'Vector3(0, 1, 0)', or '"res://noise.tres"' for a sampler.
    Close any GUI editor on the project first. Live values change only through
    RenderingServer.global_shader_parameter_set(); editing this file does not touch a running game."""
    p = Path(project) / "project.godot"
    txt = p.read_text()
    block = f'{name}={{\n"type": "{gtype}",\n"value": {value_literal}\n}}'
    sec = re.search(r"^\[shader_globals\]\s*$", txt, re.M)
    if not sec:
        txt = txt.rstrip("\n") + "\n\n[shader_globals]\n\n" + block + "\n"
    else:
        start = sec.end()
        nxt = re.search(r"^\[", txt[start:], re.M)
        end = start + nxt.start() if nxt else len(txt)
        body = txt[start:end]
        body2, n = re.subn(rf"^{re.escape(name)}=\{{.*?\n\}}", block, body, flags=re.M | re.S)
        if n == 0:
            body2 = body.rstrip("\n") + "\n" + block + "\n" + ("\n" if nxt else "")
        txt = txt[:start] + body2 + txt[end:]
    p.write_text(txt)


# ---------------------------------------------------------------- Godot runs

def compile_matrix(project, files=None, root: str = "res://", renderers=RENDERERS, timeout: float = 180) -> dict:
    """Compile every shader (or `files`) once per renderer, headless. Catches language errors and the
    renderer-gated ones (hint_normal_roughness_texture outside Forward+), not backend-only failures
    (use draw_check). Returns {ok, by_renderer: {r: {ok, failed, files}}, failed: {file: [renderers]}}."""
    by = {}
    failed: dict[str, list] = {}
    for r in renderers:
        res = gd_run.run_script(project, f"{TOOLS}:compile", args={"files": list(files or []), "root": root},
                                timeout=timeout, extra_args=["--rendering-method", r])
        rr = res.get("result") or {}
        by[r] = {"ok": bool(rr.get("ok")) and res["exit_code"] in (0, 1), "failed": rr.get("failed", []),
                 "files": rr.get("files", {}), "duration_s": res["duration_s"], "error": rr.get("error", res.get("error"))}
        for f in rr.get("failed", []):
            failed.setdefault(f, []).append(r)
    return {"ok": all(v["ok"] for v in by.values()) and not failed, "by_renderer": by, "failed": failed}


def draw_check(project, files=None, root: str = "res://", renderers=RENDERERS, timeout: float = 240) -> dict:
    """Windowed: put each shader on a drawn mesh, canvas item, sky, particle system or fog volume for
    3 frames per renderer, so backend-only errors show (stencil read outside the alpha queue, fog
    shaders on OpenGL). Costs a few seconds per renderer (first Metal run compiles pipelines)."""
    by = {}
    failed: dict[str, list] = {}
    for r in renderers:
        res = gd_run.run_script(project, f"{TOOLS}:compile", args={"files": list(files or []), "root": root, "draw": True},
                                timeout=timeout, headless=False, extra_args=["--rendering-method", r])
        rr = res.get("result") or {}
        by[r] = {"ok": bool(rr.get("ok")), "failed": rr.get("failed", []), "files": rr.get("files", {}),
                 "drawn": rr.get("drawn"), "duration_s": res["duration_s"], "error": rr.get("error", res.get("error"))}
        for f in rr.get("failed", []):
            failed.setdefault(f, []).append(r)
    return {"ok": all(v["ok"] for v in by.values()) and not failed, "by_renderer": by, "failed": failed}


def param_sweep(project, scene: str, shots=None, node=None, param=None, values=None, kind: str = "shader",
                size=(640, 360), frames: int = 6, camera=None, out: str = "captures/sweep/shot", renderer=None,
                driver=None, time_scale: float = 1.0, sheet: bool = True, cols=None, timeout: float = 300) -> dict:
    """Render `scene` once per shot in a windowed run and review the PNGs.

    shots: [{"label": "a0", "set": [[node_path, kind, name, value], ...]}]; kind is shader | instance |
    global | prop. Short form: node + param + values (+ kind). Arrays of 2/3/4 numbers become
    Vector2/Vector3/Color. Adds checks (gd_review.image_checks per PNG), contact_sheet, and
    pairwise `changes` (compare of each shot with the first)."""
    a = {"scene": scene, "size": list(size), "frames": frames, "camera": camera or "", "out": out,
         "time_scale": time_scale, "kind": kind}
    if shots:
        a["shots"] = shots
    else:
        a.update({"node": node or "", "param": param or "", "values": list(values or [])})
    xa = []
    if renderer:
        xa += ["--rendering-method", renderer]
    if driver:
        xa += ["--rendering-driver", driver]
    r = gd_run.run_script(project, f"{TOOLS}:sweep", args=a, timeout=timeout, headless=False, extra_args=xa or None)
    imgs = (r.get("result") or {}).get("images") or []
    if imgs:
        r["checks"] = {p: gd_review.image_checks(p) for p in imgs}
        r["changes"] = [gd_review.compare(imgs[0], p)["changed_fraction"] for p in imgs]
        if sheet:
            sp = str(Path(imgs[0]).parent / (Path(out).name + "_sheet.png"))
            r["contact_sheet"] = gd_review.contact_sheet(imgs, sp, cols=cols or min(len(imgs), 3))
    return r


def renderer_captures(project, scene: str, renderers=RENDERERS, size=(640, 360), out: str = "captures/renderers",
                      camera=None, frames: int = 10, sheet: bool = True) -> dict:
    """The same scene under each renderer (one windowed run each), with image checks and a sheet."""
    images, runs = [], {}
    for rm in renderers:
        r = gd_run.capture_scene(project, scene, out=f"{out}/{rm}.png", size=size, camera=camera, frames=frames,
                                 extra_args=["--rendering-method", rm])
        runs[rm] = {"ok": r["ok"], "error": r["error"], "images": (r.get("result") or {}).get("images", []),
                    "checks": r.get("checks", {}), "shader_errors": r["shader_errors"], "duration_s": r["duration_s"]}
        images += runs[rm]["images"]
    res = {"ok": all(v["ok"] for v in runs.values()), "runs": runs, "images": images}
    if sheet and images:
        res["contact_sheet"] = gd_review.contact_sheet(images, str(Path(images[0]).parent / "renderers_sheet.png"), cols=len(images))
    return res


def cost_compare(project, scenes: dict, size=(1920, 1080), seconds: float = 3.0, driver: str = "vulkan", warmup: int = 60) -> dict:
    """GPU time per scene (label -> res:// scene) on this machine, windowed at `size` through a
    SubViewport. Metal reports gpu_ms 0 in 4.7.2, so the default driver is Vulkan (MoltenVK).
    Relative numbers only: a phone is the judge for mobile budgets."""
    out = {}
    for label, sc in scenes.items():
        r = gd_run.profile_scene(project, sc, seconds=seconds, warmup=warmup, size=size, driver=driver,
                                 csv=f"profile/{label}.csv")
        gb = r.get("gpu_budget") or {}
        st = gb.get("stats") or {}
        out[label] = {"ok": r["ok"], "gpu_p50_ms": st.get("p50_ms"), "gpu_p95_ms": st.get("p95_ms"), "frames": st.get("n"),
                      "error": r["error"]}
    return out


if __name__ == "__main__":
    import json
    if len(sys.argv) >= 3 and sys.argv[1] == "lint":
        print(json.dumps(lint(sys.argv[2]), indent=2))
    else:
        print(__doc__)
