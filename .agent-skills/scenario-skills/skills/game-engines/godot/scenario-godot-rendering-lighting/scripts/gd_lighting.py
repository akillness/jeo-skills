#!/usr/bin/env python3
"""gd_lighting: scenario-godot-rendering-lighting 0.1 runner-side helpers (Godot 4.7.2, system python3).

Builds on the scenario-godot-expert toolkit (gd_env, gd_run, gd_review). Import:

    import sys
    sys.path.insert(0, "<skills>/scenario-godot-expert/scripts"); sys.path.insert(0, "<skills>/scenario-godot-rendering-lighting/scripts")
    import gd_lighting as gl
    gl.install(P)                                   # copies agentkit/rendering/*.gd into P/addons/agentkit/rendering/

See references/procedures.md for every function with its live test.
"""
from __future__ import annotations

__version__ = "0.1"

import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parent.parent / "scenario-godot-expert" / "scripts"
if str(LEAD) not in sys.path:
    sys.path.insert(0, str(LEAD))

import gd_run  # noqa: E402
import gd_review  # noqa: E402

KIT_SRC = HERE / "agentkit" / "rendering"
KIT_RES = "res://addons/agentkit/rendering"


def install(project, overwrite: bool = True) -> Path:
    """Copy agentkit/rendering/* (gd, glsl) into <project>/addons/agentkit/rendering/."""
    project = Path(project)
    dest = project / "addons" / "agentkit" / "rendering"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT_SRC.rglob("*")):
        if f.is_file() and f.suffix in (".gd", ".glsl", ".gdshader", ".txt"):
            rel = f.relative_to(KIT_SRC)
            t = dest / rel
            t.parent.mkdir(parents=True, exist_ok=True)
            if overwrite or not t.exists():
                shutil.copy2(f, t)
    return dest


def kit(method: str) -> str:
    """'lookdev.gd:build' -> 'res://addons/agentkit/rendering/lookdev.gd:build'."""
    return f"{KIT_RES}/{method}"


# ---------------------------------------------------------------- facts checked in 4.7.2 (procedures P1, P8)

TONEMAPPERS = {"linear": 0, "reinhard": 1, "filmic": 2, "aces": 3, "agx": 4}

# Project settings stored as ENUM INDICES in project.godot (class reference + RenderingServer enums, 4.7.2).
# Writing the visible number (for example "30" frames) into project.godot is wrong.
SETTING_ENUMS = {
    "rendering/global_illumination/sdfgi/probe_ray_count": [4, 8, 16, 32, 64, 96, 128],        # default index 1 = 8 rays
    "rendering/global_illumination/sdfgi/frames_to_converge": [5, 10, 15, 20, 25, 30],        # default index 5 = 30 frames
    "rendering/global_illumination/sdfgi/frames_to_update_lights": [1, 2, 4, 8, 16],          # default index 2 = 4 frames
    "rendering/lights_and_shadows/directional_shadow/soft_shadow_filter_quality": ["hard", "soft_very_low", "soft_low", "soft_medium", "soft_high", "soft_ultra"],
    "rendering/lights_and_shadows/positional_shadow/soft_shadow_filter_quality": ["hard", "soft_very_low", "soft_low", "soft_medium", "soft_high", "soft_ultra"],
    "rendering/anti_aliasing/quality/msaa_3d": ["off", "2x", "4x", "8x"],
    "rendering/anti_aliasing/quality/screen_space_aa": ["off", "fxaa", "smaa"],
    "rendering/scaling_3d/mode": ["bilinear", "fsr", "fsr2", "metalfx_spatial", "metalfx_temporal"],
}


def setting_index(key: str, wanted) -> int:
    """Enum index to write into project.godot for a visible value: setting_index('.../frames_to_converge', 30) -> 5."""
    opts = SETTING_ENUMS[key]
    if wanted not in opts:
        raise ValueError(f"{wanted!r} not in {opts} for {key}")
    return opts.index(wanted)


# ---------------------------------------------------------------- runner wrappers

def build_lookdev(project, out="res://lookdev/lookdev.tscn", room=True) -> dict:
    install(project)
    return gd_run.run_script(project, kit("lookdev.gd:build"), {"out": out, "room": room}, timeout=120)


def audit(project, scene, targets=None) -> dict:
    """Renderer-aware lighting audit (headless). targets e.g. ["forward_plus", "mobile"]."""
    install(project)
    a = {"scene": scene}
    if targets:
        a["targets"] = list(targets)
    return gd_run.run_script(project, kit("light_audit.gd:audit"), a, timeout=300)


def sweep(project, scene, variants, camera=None, size=(640, 360), frames=12, measure=0, out_dir="captures/sweep",
          focus=None, renderer=None, driver=None, extra_args=None, sheet=True, cols=None, timeout=600, camera_look=None) -> dict:
    """One windowed run, one PNG per variant (see sweep.gd), image checks and a labelled contact sheet."""
    install(project)
    xa = list(extra_args or [])
    if renderer:
        xa += ["--rendering-method", renderer]
    if driver:
        xa += ["--rendering-driver", driver]
    a = {"scene": scene, "variants": variants, "camera": camera or "", "size": list(size), "frames": frames,
         "measure": measure, "out_dir": out_dir, "focus": focus or ""}
    if camera_look:
        a["camera_look"] = [list(camera_look[0]), list(camera_look[1])]
    r = gd_run.run_script(project, kit("sweep.gd:sweep"), a, timeout=timeout, headless=False, extra_args=xa or None)
    rows = (r.get("result") or {}).get("variants") or []
    for row in rows:
        if Path(row["image"]).exists():
            row["checks"] = look_checks(row["image"], row.get("focus_rect"))
    if sheet and rows:
        p = Path(rows[0]["image"]).parent / "sheet.png"
        r["contact_sheet"] = gd_review.contact_sheet([x["image"] for x in rows], p, cols=cols or min(4, len(rows)), thumb=400)
    return r


def tonemap_variants(exposure=1.0, white=None) -> list:
    """The five 4.7.2 tonemappers as sweep variants (WorldEnvironment at the scene root)."""
    out = []
    for name, mode in TONEMAPPERS.items():
        s = [["WorldEnvironment", "environment:tonemap_mode", mode], ["WorldEnvironment", "environment:tonemap_exposure", exposure]]
        if white is not None:
            s.append(["WorldEnvironment", "environment:tonemap_white", white])
        out.append({"label": name, "set": s})
    return out


def capture_renderers(project, scene, camera=None, size=(480, 270), frames=40, out_prefix="captures/renderer",
                      methods=("forward_plus", "mobile", "gl_compatibility")) -> dict:
    """Same view in each renderer (one windowed run each); returns images, checks, the WARNING lines each
    renderer printed (features it ignores) and a contact sheet."""
    rows = []
    for m in methods:
        r = gd_run.capture_scene(project, scene, out=f"{out_prefix}_{m}.png", size=size, camera=camera, frames=frames,
                                 extra_args=["--rendering-method", m])
        img = ((r.get("result") or {}).get("images") or [None])[0]
        rows.append({"renderer": m, "ok": r["ok"], "image": img, "error": r["error"],
                     "warnings": [w["message"] for w in r["warnings"]],
                     "checks": look_checks(img) if img else None})
    imgs = [x["image"] for x in rows if x["image"]]
    sheet = gd_review.contact_sheet(imgs, Path(imgs[0]).parent / (Path(out_prefix).name + "_sheet.png"), cols=len(imgs)) if imgs else None
    diffs = {x["renderer"]: gd_review.compare(imgs[0], x["image"]) for x in rows[1:] if x["image"] and imgs}
    return {"ok": all(x["ok"] for x in rows), "rows": rows, "contact_sheet": sheet, "vs_first": diffs}


# ---------------------------------------------------------------- offline image checks for lighting (Pillow optional)

def _pixels(path, sample=256):
    w, h, gw, gh, px = gd_review._samples(path, sample)
    return gw, gh, px


def _sat(p) -> float:
    mx, mn = max(p[:3]), min(p[:3])
    return 0.0 if mx <= 1e-6 else (mx - mn) / mx


def look_checks(path, focus_rect=None, sample=256) -> dict:
    """Lighting numbers on one capture (0..1 luma): percentiles, tonal thirds, clipping, saturation,
    warm/cool split (R-B of the brightest 20% minus R-B of the darkest 20% above near-black: > 0 means warm
    lights and cool shadows), greyscale flag, and focal contrast when focus_rect=[x0, y0, x1, y1] is given."""
    gw, gh, px = _pixels(path, sample)
    lum = [gd_review._luma(p) for p in px]
    order = sorted(range(len(lum)), key=lambda i: lum[i])
    n = len(lum)

    def pct(q):
        return lum[order[min(n - 1, int(q * (n - 1)))]]
    lit = [i for i in order if lum[i] > 0.02]
    k = max(1, len(lit) // 5)
    dark, bright = lit[:k], lit[-k:]

    def rb(ix):
        return sum(px[i][0] - px[i][2] for i in ix) / max(1, len(ix))
    out = {
        "path": str(path), "p05": round(pct(0.05), 4), "p50": round(pct(0.5), 4), "p95": round(pct(0.95), 4),
        "range_p95_p05": round(pct(0.95) - pct(0.05), 4),
        "shadows": round(sum(1 for v in lum if v < 0.25) / n, 4), "mids": round(sum(1 for v in lum if 0.25 <= v <= 0.75) / n, 4),
        "highlights": round(sum(1 for v in lum if v > 0.75) / n, 4),
        "clipped": round(sum(1 for v in lum if v > 0.98) / n, 4), "crushed": round(sum(1 for v in lum if v < 0.02) / n, 4),
        "saturation_mean": round(sum(_sat(p) for p in px) / n, 4),
        "warm_cool_split": round(rb(bright) - rb(dark), 4) if lit else 0.0,
        "greyscale": all(max(p[:3]) - min(p[:3]) < 0.03 for p in px),
    }
    if focus_rect:
        x0, y0, x1, y1 = focus_rect
        inside, outside = [], []
        for y in range(gh):
            for x in range(gw):
                u, v = (x + 0.5) / gw, (y + 0.5) / gh
                (inside if (x0 <= u <= x1 and y0 <= v <= y1) else outside).append(lum[y * gw + x])
        if inside and outside:
            mi, mo = sum(inside) / len(inside), sum(outside) / len(outside)
            out["focus_luma"], out["surround_luma"] = round(mi, 4), round(mo, 4)
            out["focal_contrast"] = round(abs(mi - mo), 4)
    flags = []
    if out["clipped"] > 0.05:
        flags.append("highlights_clipped")
    if out["crushed"] > 0.3:
        flags.append("shadows_crushed")
    if out["range_p95_p05"] < 0.25:
        flags.append("flat_values")
    if focus_rect and out.get("focal_contrast", 1.0) < 0.05:
        flags.append("subject_does_not_separate")
    out["flags"] = flags
    return out


def squint(path, out=None, size=160) -> str:
    """The squint test as a file: greyscale, blurred, small. Open it and judge the value pattern
    (one clear focal value, readable silhouette). Needs Pillow."""
    from PIL import Image, ImageFilter  # type: ignore
    im = Image.open(path).convert("L")
    s = size / max(im.size)
    im = im.resize((max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))), Image.BILINEAR)
    im = im.filter(ImageFilter.GaussianBlur(radius=max(1, size // 80)))
    out = out or str(Path(path).with_name(Path(path).stem + "_squint.png"))
    im.save(out)
    return out
