#!/usr/bin/env python3
"""gd_vfx: runner-side helpers for the scenario-godot-vfx skill (Godot 4.7.2, system python3, Pillow optional).

Uses the scenario-godot-expert toolkit (gd_env, gd_run, gd_review). Import:
    sys.path.insert(0, "<skills>/scenario-godot-expert/scripts"); sys.path.insert(0, "<skills>/scenario-godot-vfx/scripts")
    import gd_vfx

    install(project)                         copy the VFX kit: tooling to res://addons/agentkit/vfx/,
                                             shaders to res://vfx/shaders/, runtime scripts to res://vfx/runtime/
    build(project, tier)                     build and save the fireball kit for a tier (high, mobile, low)
    audit(project, scene, tier)              static checks on every emitter of a scene (vfx_audit.gd)
    timeline(project, scene, times, ...)     windowed, fixed-fps capture at exact times after a restart
    overdraw(project, scene, times, ...)     the same with Viewport.DEBUG_DRAW_OVERDRAW, plus layer statistics
    to_cpu(project, scene, out)              CPUParticles3D twin of a scene, with what it loses
    fit_aabb(project, scene, write)          measured visibility_aabb per emitter (editor's Generate AABB)
    layers_from_overdraw(base_png, fx_png, renderer)     offline overdraw maths (calibrated per renderer)
    tunnel_step(v_max, fixed_fps), subemitter_cap(...), travel(v0, g, t)   offline numbers
"""
from __future__ import annotations

__version__ = "0.1"

import json
import math
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-godot-expert" / "scripts"
if str(LEAD) not in sys.path:
    sys.path.insert(0, str(LEAD))
import gd_review  # noqa: E402
import gd_run  # noqa: E402

KIT = HERE / "agentkit" / "vfx"
RENDERERS = ("forward_plus", "mobile", "gl_compatibility")


def install(project) -> dict:
    """Copy the kit into a project. Tooling is agent-only (addons/agentkit/vfx); shaders and runtime
    scripts are game assets (res://vfx/...), so an export ships them and not the tooling."""
    project = Path(project).resolve()
    dst_tool = project / "addons" / "agentkit" / "vfx"
    dst_sh = project / "vfx" / "shaders"
    dst_rt = project / "vfx" / "runtime"
    copied = []
    for d in (dst_tool, dst_sh, dst_rt):
        d.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT.glob("*.gd")):
        shutil.copy2(f, dst_tool / f.name)
        copied.append(f"addons/agentkit/vfx/{f.name}")
    for f in sorted((KIT / "shaders").glob("*")):
        if f.suffix in (".gdshader", ".gdshaderinc"):
            shutil.copy2(f, dst_sh / f.name)
            copied.append(f"vfx/shaders/{f.name}")
    for f in sorted((KIT / "runtime").glob("*.gd")):
        shutil.copy2(f, dst_rt / f.name)
        copied.append(f"vfx/runtime/{f.name}")
    return {"ok": True, "copied": copied}


def build(project, tier: str = "high", timeout: float = 180) -> dict:
    return gd_run.run_script(project, "res://addons/agentkit/vfx/vfx_jobs.gd:build", args={"tier": tier}, timeout=timeout)


def audit(project, scene: str, tier: str = "high", level: str = "", timeout: float = 120) -> dict:
    """Static audit of every emitter in `scene`. `level` is an optional scene whose particle colliders count
    (an effect scene alone has none)."""
    return gd_run.run_script(project, "res://addons/agentkit/vfx/vfx_audit.gd:audit",
                             args={"scene": scene, "tier": tier, "level": level}, timeout=timeout)


def timeline(project, scene: str, times=(0.05, 0.15, 0.3, 0.6, 1.0, 1.5), out_dir: str = "vfx/timeline",
             size=(640, 360), fps: int = 60, renderer: str | None = None, driver: str | None = None,
             trigger: str = "restart", overdraw: bool = False, cam_pos=None, cam_look=None, warm: int = 8,
             sheet: bool = True, timeout: float = 240, extra: dict | None = None) -> dict:
    """Windowed capture at exact game times: --fixed-fps makes every frame 1/fps s, so frame k is t = k/fps.
    trigger: "restart" restarts every emitter after `warm` frames (t = 0 then); "none" lets the scene play.
    renderer: None (project setting) or one of RENDERERS, through --rendering-method."""
    xa = ["--fixed-fps", str(int(fps))]
    if renderer:
        if renderer not in RENDERERS:
            raise ValueError(f"renderer must be one of {RENDERERS}")
        xa += ["--rendering-method", renderer]
    if driver:
        xa += ["--rendering-driver", driver]
    a = {"scene": scene, "times": list(times), "out_dir": out_dir, "size": list(size), "fps": fps, "trigger": trigger,
         "overdraw": overdraw, "warm": warm}
    if cam_pos is not None:
        a["cam_pos"] = list(cam_pos)
        a["cam_look"] = list(cam_look if cam_look is not None else (0, 0, 0))
    if extra:
        a.update(extra)
    r = gd_run.run_script(project, "res://addons/agentkit/vfx/vfx_capture.gd:timeline", args=a, timeout=timeout,
                          headless=False, extra_args=xa)
    imgs = (r.get("result") or {}).get("images") or []
    r["checks"] = {p: gd_review.image_checks(p) for p in imgs if Path(p).exists()}
    if sheet and imgs:
        r["contact_sheet"] = gd_review.contact_sheet(imgs, str(Path(imgs[0]).parent / "contact_sheet.png"),
                                                     cols=min(4, len(imgs)), thumb=400)
    return r


def overdraw(project, scene: str, times=(0.1, 0.3, 0.6), out_dir: str = "vfx/overdraw", **kw) -> dict:
    """Timeline in Viewport.DEBUG_DRAW_OVERDRAW mode, plus a frame of the same view before the trigger
    (the scene without the effect) as the baseline, and layer statistics per time."""
    kw.setdefault("extra", {})
    kw["extra"]["baseline"] = True
    r = timeline(project, scene, times=times, out_dir=out_dir, overdraw=True, **kw)
    res = r.get("result") or {}
    base = res.get("baseline_image")
    stats = {}
    if base and Path(base).exists():
        for p in res.get("images", []):
            stats[p] = layers_from_overdraw(base, p, renderer=res.get("renderer") or "forward_plus")
    r["overdraw"] = stats
    return r


def fit_aabb(project, scene: str, write: bool = False, out: str | None = None, margin: float = 0.1,
             seconds: float | None = None, fps: int = 60, renderer: str | None = None, node: str = "",
             play_method: str = "", timeout: float = 180) -> dict:
    """Agent version of the editor's Generate Visibility AABB: windowed, fixed-fps run that unions
    capture_aabb() over the effect's life and optionally writes the fitted boxes into the scene."""
    a = {"scene": scene, "write": write, "margin": margin, "fps": fps, "node": node, "play_method": play_method}
    if out:
        a["out"] = out
    if seconds:
        a["seconds"] = seconds
    xa = ["--fixed-fps", str(int(fps))] + (["--rendering-method", renderer] if renderer else [])
    return gd_run.run_script(project, "res://addons/agentkit/vfx/vfx_capture.gd:fit_aabb", args=a, timeout=timeout,
                             headless=False, extra_args=xa)


def to_cpu(project, scene: str, out: str, timeout: float = 120) -> dict:
    return gd_run.run_script(project, "res://addons/agentkit/vfx/vfx_jobs.gd:to_cpu", args={"scene": scene, "out": out},
                             timeout=timeout)


# ---------------------------------------------------------------- offline maths

def _luma_grid(path):
    from PIL import Image  # type: ignore
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    return w, h, [[0.2126 * px[x, y][0] + 0.7152 * px[x, y][1] + 0.0722 * px[x, y][2] for x in range(w)] for y in range(h)]


# Overdraw calibration measured 2026-10-02 (procedures P7, vfx_selftest.overdraw_calibrate): N stacked alpha quads
# in DEBUG_DRAW_OVERDRAW. Forward+ and Mobile (Metal): the PNG is sRGB-encoded and each layer adds 0.0700 of LINEAR
# luma (1 layer reads 74.9/255, 8 layers 197/255). Compatibility (OpenGL): each layer adds 36.6 of raw 8-bit luma,
# linear in the PNG, and the image saturates past 6 layers (7 read 231, 8 read 236).
OVERDRAW_CAL = {"rd": {"per_layer": 0.0700, "linearize": True, "saturates_at": None},
                "compat": {"per_layer": 36.6 / 255.0, "linearize": False, "saturates_at": 6}}


def _srgb_to_linear(v: float) -> float:
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def layers_from_overdraw(base_png, fx_png, renderer: str = "forward_plus", step: int = 2) -> dict:
    """Extra transparent layers per pixel added by an effect, from two DEBUG_DRAW_OVERDRAW frames of the same
    view (without and with the effect), using the calibration above. Compatibility saturates past 6 layers."""
    cal = OVERDRAW_CAL["compat" if renderer == "gl_compatibility" else "rd"]
    w, h, a = _luma_grid(base_png)
    w2, h2, b = _luma_grid(fx_png)
    if (w, h) != (w2, h2):
        raise ValueError("images differ in size")
    f = (lambda v: _srgb_to_linear(v / 255.0)) if cal["linearize"] else (lambda v: v / 255.0)
    vals = []
    for y in range(0, h, step):
        for x in range(0, w, step):
            vals.append(max(0.0, f(b[y][x]) - f(a[y][x])) / cal["per_layer"])
    vals.sort()
    n = len(vals)
    covered = [v for v in vals if v >= 0.5]
    return {
        "mean_layers_screen": round(sum(vals) / n, 3),
        "covered_fraction": round(len(covered) / n, 4),
        "mean_layers_covered": round(sum(covered) / len(covered), 2) if covered else 0.0,
        "p95_layers": round(vals[int(0.95 * (n - 1))], 2),
        "p99_layers": round(vals[int(0.99 * (n - 1))], 2),
        "max_layers": round(vals[-1], 2),
        "saturates_at": cal["saturates_at"],
        "renderer": renderer,
    }


def count_blobs(png, threshold: int = 80) -> dict:
    """Bright connected blobs in an image (4-neighbour flood fill on luma > threshold): dot counts for the
    sub_emitter_frequency test. Returns count and centroid x positions (px), sorted."""
    w, h, g = _luma_grid(png)
    seen = [[False] * w for _ in range(h)]
    xs = []
    for y in range(h):
        for x in range(w):
            if g[y][x] > threshold and not seen[y][x]:
                stack = [(x, y)]
                seen[y][x] = True
                sx = n = 0
                while stack:
                    cx, cy = stack.pop()
                    sx += cx
                    n += 1
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and g[ny][nx] > threshold:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if n >= 3:
                    xs.append(sx / n)
    xs.sort()
    return {"count": len(xs), "x": [round(v, 1) for v in xs]}


def tunnel_step(v_max: float, fixed_fps: int) -> float:
    """Distance a particle moves per simulation step (Godotneers cZ5Ang_Ji8E 00:47:17: step = speed / fps)."""
    return v_max / max(1, fixed_fps)


def travel(v0: float, g: float, t: float) -> dict:
    """Worst-case reach of a particle: launched at v0 for t seconds under gravity g (no damping)."""
    up = (v0 * v0) / (2 * g) if g > 0 else v0 * t
    fall_speed = math.sqrt(v0 * v0 + 2 * g * up) if g > 0 else v0
    return {"horizontal": v0 * t, "max_height": up, "max_speed": max(v0, min(fall_speed, v0 + g * t))}


def subemitter_cap(parent_amount: int, mode: str, per_event: int = 1, frequency_hz: float = 0.0,
                   child_lifetime: float = 1.0, parent_lifetime: float = 1.0) -> int:
    """Child `amount` needed so no sub-emission is skipped (the child's amount is a global cap:
    Godotneers yKoGuBGZatY 00:44:48, Brackeys htRjt505sPg 00:40:00, Bonkahe BUa-mKHEPUM 00:21:49)."""
    if mode == "constant":
        return int(math.ceil(parent_amount * frequency_hz * child_lifetime))
    return int(parent_amount * per_event)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-godot-vfx helpers")
    ap.add_argument("cmd", choices=["install", "build", "audit"])
    ap.add_argument("project")
    ap.add_argument("--tier", default="high")
    ap.add_argument("--scene", default="")
    ns = ap.parse_args()
    if ns.cmd == "install":
        print(json.dumps(install(ns.project), indent=2))
    elif ns.cmd == "build":
        r = build(ns.project, ns.tier)
        r.pop("log", None)
        print(json.dumps(r, indent=2, default=str))
    else:
        r = audit(ns.project, ns.scene, ns.tier)
        r.pop("log", None)
        print(json.dumps(r.get("result"), indent=2, default=str))
