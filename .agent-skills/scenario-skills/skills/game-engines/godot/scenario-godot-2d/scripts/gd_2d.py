#!/usr/bin/env python3
"""gd_2d: runner-side helpers for the scenario-godot-2d skill (Godot 4.7.2).

System python3. Pillow is used for image work (installed on this Mac; ImageMagick is the fallback
the lead's gd_review uses for contact sheets). Pure-math helpers need nothing.

Public API
    install_kit(project) -> Path                      copy scripts/agentkit/2d/* to res://addons/agentkit/2d/
    pixel_art_settings(project, base=(320, 180), mode="viewport", aspect="keep", window_scale=4,
                       snap=True, interpolation=True, ticks=60) -> dict    write the pixel-art keys
    jump_params(height, t_apex, t_fall=None, tile=None) -> dict          gravity and jump velocity
    integer_scales(base, sizes) -> list[dict]                           expected integer factor and bars
    pixel_grid_check(png, scale, box=None) -> dict                      uniform scale x scale blocks
    detect_pixel_scale(png) -> dict                                     art pixel size of an upscaled image
    snap_to_grid(src, dst, scale=None, offset=None) -> dict             nearest downscale to native pixels
    alpha_key_report(png, key=(255, 0, 255)) -> dict                    key colour hiding under alpha 0
    key_fringe(png, key=(255, 0, 255), box=None) -> dict                visible pixels tinted toward the key
    ground_line(png, frame_w, frame_h, frame=0) -> int                  ink bottom of one frame (feet)
    audit_imports(project, pixel_art=True) -> dict                      .import files against 2D rules
    set_import_params(project, pattern, params) -> list[str]            edit [params] of matching .import
    blob47_masks() -> list[int]; make_blob47_atlas(out, tile=16, cols=8) -> dict
    make_dual_grid_atlas(out, tile=16) -> dict; make_sprite_strip(out, frames=6, frame=(24, 24), scale=4, key=...)
    motion_stats(xs) -> dict                                            per-frame steps: mean, std, zero and reverse counts
    luma_at(png, points, radius=0) -> list[float]                       sampled luminance (0 to 255)
"""
from __future__ import annotations

__version__ = "0.1"

import json
import math
import os
import shutil
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE / "agentkit" / "2d"

try:
    from PIL import Image
except Exception:  # pragma: no cover
    Image = None


def _need_pil():
    if Image is None:
        raise RuntimeError("Pillow is required for image helpers (python3 -m pip install pillow)")


# ---------------------------------------------------------------- project side

def install_kit(project) -> Path:
    """Copy the scenario-godot-2d AgentKit scripts into <project>/addons/agentkit/2d/ (overwrites)."""
    dest = Path(project) / "addons" / "agentkit" / "2d"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT.iterdir()):
        if f.suffix in (".gd", ".gdshader", ".tres") and f.is_file():
            shutil.copy2(f, dest / f.name)
    (dest / "VERSION").write_text("scenario-godot-2d 0.1\n")
    return dest


def pixel_art_settings(project, base=(320, 180), mode: str = "viewport", aspect: str = "keep", window_scale: int = 4,
                       snap: bool = False, interpolation: bool = True, ticks: int = 60, filter_nearest: bool = True) -> dict:
    """Write the pixel-art project keys explicitly (a hand-written project.godot has stretch disabled).

    mode "viewport": the whole canvas renders at `base` and is scaled by an integer (locked pixel grid,
    lights and rotations pixelated). mode "canvas_items": 2D draws at window resolution (sub-pixel
    motion and smooth rotation; snap keeps sprites on whole pixels). Returns the keys written.
    """
    import sys
    sys.path.insert(0, str(HERE.parents[1] / "scenario-godot-expert" / "scripts"))
    import gd_env  # noqa: E402
    keys = {
        "display/window/size/viewport_width": str(int(base[0])),
        "display/window/size/viewport_height": str(int(base[1])),
        "display/window/size/window_width_override": str(int(base[0] * window_scale)),
        "display/window/size/window_height_override": str(int(base[1] * window_scale)),
        "display/window/stretch/mode": f'"{mode}"',
        "display/window/stretch/aspect": f'"{aspect}"',
        "display/window/stretch/scale_mode": '"integer"',
        "physics/common/physics_ticks_per_second": str(int(ticks)),
        "physics/common/physics_interpolation": "true" if interpolation else "false",
        # Written either way: new_project(pixel_art=True) turns snap on, and snap plus interpolation jitters the camera.
        "rendering/2d/snap/snap_2d_transforms_to_pixel": "true" if snap else "false",
    }
    if filter_nearest:
        keys["rendering/textures/canvas_textures/default_texture_filter"] = "0"
    for k, v in keys.items():
        gd_env.set_project_setting(project, k, v)
    return keys


def _parse_import(path: Path) -> dict:
    sec, out = "", {}
    for line in path.read_text().splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            sec = s[1:-1]
            continue
        if "=" in s and sec == "params":
            k, _, v = s.partition("=")
            out[k] = v
        if s.startswith("importer=") and sec == "remap":
            out["_importer"] = s.split("=", 1)[1].strip('"')
    return out


def audit_imports(project, pixel_art: bool = True, root: str = ".") -> dict:
    """Check every texture .import under the project against the 2D rules.

    Flags: lossy or VRAM compression on a 2D sprite (compress/mode != 0), mipmaps on (blur and memory
    for 2D at 1:1), fix_alpha_border off (key colour fringes under linear filtering), and for pixel
    art detect_3d/compress_to != 0 (first use in 3D silently reimports it VRAM compressed).
    Defaults in 4.7.2 are already compress/mode=0, mipmaps off, fix_alpha_border on, detect_3d 1.
    """
    project = Path(project)
    rows, flags = [], []
    for imp in sorted((project / root).rglob("*.import")):
        if ".godot" in imp.parts or "addons" in imp.parts:
            continue
        p = _parse_import(imp)
        if p.get("_importer") != "texture":
            continue
        src = str(imp.relative_to(project))[: -len(".import")]
        f = []
        if p.get("compress/mode", "0") != "0":
            f.append(f"compress/mode={p['compress/mode']} (2D sprites want 0 Lossless)")
        if p.get("mipmaps/generate", "false") == "true":
            f.append("mipmaps on")
        if p.get("process/fix_alpha_border", "true") != "true":
            f.append("fix_alpha_border off: transparent pixels keep their key colour")
        if pixel_art and p.get("detect_3d/compress_to", "1") != "0":
            f.append("detect_3d/compress_to != 0: a 3D use reimports it VRAM compressed")
        if p.get("process/size_limit", "0") not in ("0", ""):
            f.append(f"size_limit={p['process/size_limit']}")
        rows.append({"file": src, "flags": f})
        flags += [f"{src}: {x}" for x in f]
    return {"textures": len(rows), "flags": flags, "rows": rows, "ok": not [x for x in flags if "detect_3d" not in x]}


def _gd_value(v) -> str:
    """Python value to Godot config text (bools are lowercase; strings quoted)."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str) and not v.startswith(("Vector", "Color", "\"", "PackedStringArray", "[", "{")):
        return json.dumps(v)
    return str(v)


def set_import_params(project, pattern: str, params: dict) -> list:
    """Set keys in the [params] section of every .import whose source matches the glob `pattern`
    (relative to the project, e.g. "art/**/*.png"). Run gd_run.import_project afterwards.
    Bools are written lowercase: Python's `False` written as text was silently read as the default."""
    project = Path(project)
    changed = []
    for src in sorted(project.glob(pattern)):
        imp = src.with_name(src.name + ".import")
        if not imp.exists():
            continue
        lines = imp.read_text().splitlines()
        sec, seen = "", set()
        for i, line in enumerate(lines):
            s = line.strip()
            if s.startswith("[") and s.endswith("]"):
                sec = s[1:-1]
                continue
            if sec == "params" and "=" in s:
                k = s.split("=", 1)[0]
                if k in params:
                    lines[i] = f"{k}={_gd_value(params[k])}"
                    seen.add(k)
        missing = [k for k in params if k not in seen]
        if missing:
            idx = next((i for i, l in enumerate(lines) if l.strip() == "[params]"), None)
            if idx is None:
                lines += ["", "[params]"]
                idx = len(lines) - 1
            for k in missing:
                lines.insert(idx + 1, f"{k}={_gd_value(params[k])}")
        old_m = imp.stat().st_mtime
        imp.write_text("\n".join(lines) + "\n")
        # Godot's file cache keeps whole-second mtimes: an edit in the same second as the last import
        # was skipped on the next --import (measured in 4.7.2). Push the mtime at least 2 s forward.
        new_m = max(time.time(), old_m + 2)
        os.utime(imp, (new_m, new_m))
        changed.append(str(src.relative_to(project)))
    return changed


# ---------------------------------------------------------------- numbers

def jump_params(height: float, t_apex: float, t_fall: float | None = None, tile: float | None = None) -> dict:
    """Jump from design numbers (Bsy8pknHc0M: solve gravity from height and time to apex).

    height in px (or in tiles when `tile` is given); t_apex and t_fall in seconds.
    gravity_up = 2h / t_apex^2, jump_velocity = -2h / t_apex (2D y is down), gravity_down = 2h / t_fall^2.
    """
    h = height * tile if tile else height
    t_fall = t_fall or t_apex
    g_up = 2.0 * h / (t_apex ** 2)
    g_down = 2.0 * h / (t_fall ** 2)
    v = -2.0 * h / t_apex
    # move_and_slide integrates semi-implicitly: the apex lands v*dt/2 short (53.5 px for 56 px at 60
    # ticks, measured in 4.7.2); g_up*dt/2 more take-off speed puts it back on 56.25 px.
    return {"height_px": h, "gravity_up": g_up, "gravity_down": g_down, "jump_velocity": v,
            "jump_velocity_compensated_60": v - g_up * 0.5 / 60.0,
            "fall_multiplier": g_down / g_up, "airtime_s": t_apex + t_fall,
            "ticks_to_apex_60": t_apex * 60.0}


def integer_scales(base, sizes) -> list:
    """Expected integer stretch factor and letterbox bars for each window size (matches 4.7.2:
    1366x768 at base 320x180 gives 4x with 43 px and 24 px bars, measured)."""
    out = []
    bw, bh = base
    for w, h in sizes:
        s = max(1, min(w // bw, h // bh))
        out.append({"window": [w, h], "scale": s, "bars": [(w - bw * s) // 2, (h - bh * s) // 2],
                    "fractional": round(min(w / bw, h / bh), 3)})
    return out


# ---------------------------------------------------------------- image checks

def _open(png):
    _need_pil()
    im = Image.open(png)
    return im.convert("RGBA")


def pixel_grid_check(png, scale: int, box=None) -> dict:
    """Fraction of scale x scale blocks (aligned on the image origin, or on `box` (x, y, w, h)) whose
    pixels are all identical. 1.0 means a clean integer upscale of a native image (viewport stretch);
    a smooth gradient or a sub-pixel position lowers it. Also tests the 3 other alignments and
    reports the best phase, since a letterbox bar shifts the grid."""
    im = _open(png)
    if box:
        x0, y0, w, h = box
        im = im.crop((x0, y0, x0 + w, y0 + h))
    W, H = im.size
    px = im.load()
    best = None
    for ox in range(scale):
        for oy in range(scale):
            tot = uni = 0
            for by in range(oy, H - scale + 1, scale):
                for bx in range(ox, W - scale + 1, scale):
                    c0 = px[bx, by]
                    same = True
                    for yy in range(by, by + scale):
                        for xx in range(bx, bx + scale):
                            if px[xx, yy] != c0:
                                same = False
                                break
                        if not same:
                            break
                    tot += 1
                    uni += same
            frac = uni / tot if tot else 0.0
            if best is None or frac > best["uniform_fraction"]:
                best = {"uniform_fraction": round(frac, 4), "blocks": tot, "phase": [ox, oy]}
            if scale > 4 and ox == 0 and oy == 0 and frac > 0.999:
                return {**best, "scale": scale}
    return {**best, "scale": scale}


def _runs(seq):
    runs, n, prev = [], 0, None
    for v in seq:
        if v == prev:
            n += 1
        else:
            if prev is not None:
                runs.append(n)
            n, prev = 1, v
    if prev is not None:
        runs.append(n)
    return runs


def detect_pixel_scale(png, max_scale: int = 32) -> dict:
    """Estimate the art pixel size of an upscaled pixel-art image (an AI 'pixel art' render is often
    a 1024 px image of a 64 px sprite). Uses run lengths of identical colours along rows and columns:
    the most common short run that divides most runs. Returns {scale, confidence, runs_checked}.
    confidence below about 0.8 means off-grid pixels (run a pixel snapper before import)."""
    im = _open(png)
    W, H = im.size
    px = im.load()
    runs = []
    for y in range(0, H, max(1, H // 48)):
        runs += _runs([px[x, y] for x in range(W)])[1:-1]
    for x in range(0, W, max(1, W // 48)):
        runs += _runs([px[x, y] for y in range(H)])[1:-1]
    runs = [r for r in runs if r <= 8 * max_scale]
    if not runs:
        return {"scale": 1, "confidence": 0.0, "runs_checked": 0}
    best, best_score = 1, 0.0
    for s in range(max_scale, 0, -1):
        ok = sum(1 for r in runs if r % s == 0)
        score = ok / len(runs)
        if score >= 0.85 and s > best:
            best, best_score = s, score
            break
    if best == 1:
        best_score = 1.0
    return {"scale": best, "confidence": round(best_score, 3), "runs_checked": len(runs)}


def snap_to_grid(src, dst, scale: int | None = None, offset=None) -> dict:
    """Downscale an upscaled pixel-art image to native pixels by sampling each block centre
    (nearest, no averaging, so no new colours and no key-colour bleed). scale from
    detect_pixel_scale when omitted."""
    im = _open(src)
    if scale is None:
        scale = detect_pixel_scale(src)["scale"]
    ox, oy = offset or (0, 0)
    W, H = im.size
    w, h = (W - ox) // scale, (H - oy) // scale
    out = Image.new("RGBA", (w, h))
    sp, dp = im.load(), out.load()
    c = scale // 2
    for y in range(h):
        for x in range(w):
            dp[x, y] = sp[ox + x * scale + c, oy + y * scale + c]
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    return {"src_size": [W, H], "scale": scale, "size": [w, h], "out": str(dst)}


def alpha_key_report(png, key=(255, 0, 255), tol: int = 60) -> dict:
    """How many fully transparent pixels still carry the key colour in RGB (what a keyer leaves
    behind; scenario-sprite-pipeline measured up to (255, 194, 255)). These bleed back under linear
    filtering unless the importer's fix_alpha_border is on."""
    im = _open(png)
    n0 = nk = 0
    for r, g, b, a in im.getdata():
        if a == 0:
            n0 += 1
            if abs(r - key[0]) + abs(g - key[1]) + abs(b - key[2]) <= tol:
                nk += 1
    return {"transparent": n0, "transparent_with_key_rgb": nk}


def key_fringe(png, key=(255, 0, 255), box=None, min_alpha: int = 8) -> dict:
    """Visible pixels tinted toward the key colour (magenta: red and blue both above green by a
    margin) inside `box`. Use on a capture of a sprite drawn over a neutral background."""
    im = _open(png)
    if box:
        x0, y0, w, h = box
        im = im.crop((x0, y0, x0 + w, y0 + h))
    tinted = 0
    worst = 0
    for r, g, b, a in im.getdata():
        if a < min_alpha:
            continue
        if key == (255, 0, 255):
            m = min(r, b) - g
        else:
            m = -abs(r - key[0]) - abs(g - key[1]) - abs(b - key[2]) + 128
        if m > 40:
            tinted += 1
        worst = max(worst, m)
    return {"tinted_pixels": tinted, "max_tint": worst}


def ground_line(png, frame_w: int, frame_h: int, frame: int = 0, cols: int | None = None, alpha_min: int = 16) -> int:
    """Lowest opaque row (ink bottom) of one frame: the feet line used to register frames
    (scenario-sprite-pipeline: measure ground from frame 0's ink bottom)."""
    im = _open(png)
    cols = cols or max(1, im.size[0] // frame_w)
    fx, fy = (frame % cols) * frame_w, (frame // cols) * frame_h
    px = im.load()
    for y in range(fy + frame_h - 1, fy - 1, -1):
        for x in range(fx, fx + frame_w):
            if px[x, y][3] >= alpha_min:
                return y - fy
    return frame_h - 1


def luma_at(png, points, radius: int = 0) -> list:
    """Mean luminance (Rec. 601, 0 to 255) around each (x, y)."""
    im = _open(png)
    px = im.load()
    W, H = im.size
    out = []
    for x, y in points:
        acc = n = 0
        for yy in range(max(0, y - radius), min(H, y + radius + 1)):
            for xx in range(max(0, x - radius), min(W, x + radius + 1)):
                r, g, b, _ = px[xx, yy]
                acc += 0.299 * r + 0.587 * g + 0.114 * b
                n += 1
        out.append(round(acc / max(n, 1), 2))
    return out


def find_color_x(png, color, tol: int = 24, row: int | None = None) -> float | None:
    """Leftmost x of pixels close to `color` (on one row, or anywhere). For motion measurements."""
    im = _open(png)
    px = im.load()
    W, H = im.size
    rows = [row] if row is not None else range(H)
    best = None
    for y in rows:
        for x in range(W):
            r, g, b, _ = px[x, y]
            if abs(r - color[0]) + abs(g - color[1]) + abs(b - color[2]) <= tol:
                if best is None or x < best:
                    best = x
                break
    return best


def motion_stats(xs) -> dict:
    """Per-frame steps of a 1D position series: mean, std, zero steps, reversals (sign flips)."""
    xs = [x for x in xs if x is not None]
    steps = [b - a for a, b in zip(xs, xs[1:])]
    if not steps:
        return {"n": len(xs)}
    m = sum(steps) / len(steps)
    sd = math.sqrt(sum((s - m) ** 2 for s in steps) / len(steps))
    sign = 1 if m >= 0 else -1
    return {"n": len(xs), "mean_step": round(m, 4), "std_step": round(sd, 4), "zero_steps": sum(1 for s in steps if s == 0),
            "reversals": sum(1 for s in steps if s * sign < 0), "min_step": min(steps), "max_step": max(steps),
            "unique_steps": sorted(set(round(s, 3) for s in steps))[:12]}


# ---------------------------------------------------------------- placeholder art (greybox and tests)

# Bits: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128 (screen y down: N is up).
N, NE, E, SE, S, SW, W, NW = 1, 2, 4, 8, 16, 32, 64, 128


def blob_reduce(mask: int) -> int:
    """Drop a corner bit unless both of its sides are set (the 47-tile blob rule)."""
    m = mask
    if not (m & N and m & E):
        m &= ~NE
    if not (m & S and m & E):
        m &= ~SE
    if not (m & S and m & W):
        m &= ~SW
    if not (m & N and m & W):
        m &= ~NW
    return m


def blob47_masks() -> list:
    return sorted({blob_reduce(m) for m in range(256)})


def _draw_blob_tile(px, ox, oy, t, mask, fill, edge):
    q = max(1, t // 4)  # border band width
    def rect(x0, y0, x1, y1):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[ox + x, oy + y] = fill
    rect(q, q, t - q, t - q)
    if mask & N: rect(q, 0, t - q, q)
    if mask & S: rect(q, t - q, t - q, t)
    if mask & W: rect(0, q, q, t - q)
    if mask & E: rect(t - q, q, t, t - q)
    if mask & NW: rect(0, 0, q, q)
    if mask & NE: rect(t - q, 0, t, q)
    if mask & SW: rect(0, t - q, q, t)
    if mask & SE: rect(t - q, t - q, t, t)
    # 1 px darker outline where terrain meets empty, so seams and wrong picks are visible
    for y in range(t):
        for x in range(t):
            if px[ox + x, oy + y][3] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < t and 0 <= yy < t and px[ox + xx, oy + yy][3] == 0:
                    px[ox + x, oy + y] = edge
                    break


def make_blob47_atlas(out, tile: int = 16, cols: int = 8, fill=(86, 160, 72, 255), edge=(40, 88, 40, 255)) -> dict:
    """Write a 47-tile blob atlas whose art encodes its own peering bits: terrain reaches a side when
    that side connects, a corner only when the corner connects. Returns {masks: {"x,y": mask}}."""
    _need_pil()
    masks = blob47_masks()
    rows = math.ceil(len(masks) / cols)
    im = Image.new("RGBA", (cols * tile, rows * tile), (0, 0, 0, 0))
    px = im.load()
    table = {}
    for i, m in enumerate(masks):
        cx, cy = i % cols, i // cols
        _draw_blob_tile(px, cx * tile, cy * tile, tile, m, fill, edge)
        table[f"{cx},{cy}"] = m
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return {"out": str(out), "tiles": len(masks), "size": list(im.size), "masks": table}


def make_sides16_atlas(out, tile: int = 16, fill=(86, 160, 72, 255), edge=(40, 88, 40, 255)) -> dict:
    """16-tile set (every N/E/S/W combination, the '3x3 block + strips + single' family such as the
    Tiny Swords flat ground): corners are drawn filled when both sides connect, so there are no inner
    corner tiles. Pair it with TERRAIN_MODE_MATCH_SIDES."""
    _need_pil()
    combos = []
    for m in range(16):
        side = (N if m & 1 else 0) | (E if m & 2 else 0) | (S if m & 4 else 0) | (W if m & 8 else 0)
        combos.append(blob_reduce(side | NE | SE | SW | NW))
    im = Image.new("RGBA", (4 * tile, 4 * tile), (0, 0, 0, 0))
    px = im.load()
    table = {}
    for i, m in enumerate(combos):
        cx, cy = i % 4, i // 4
        _draw_blob_tile(px, cx * tile, cy * tile, tile, m, fill, edge)
        table[f"{cx},{cy}"] = m
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return {"out": str(out), "tiles": 16, "size": list(im.size), "masks": table}


def make_dual_grid_atlas(out, tile: int = 16, fill=(214, 180, 98, 255), edge=(120, 90, 40, 255)) -> dict:
    """16-tile dual-grid atlas (jEWFSv3ivTg): tile index = TL*1 + TR*2 + BL*4 + BR*8, laid out 4x4 in
    index order. Each display tile draws the quarters whose world cell is terrain, with rounded joins."""
    _need_pil()
    im = Image.new("RGBA", (4 * tile, 4 * tile), (0, 0, 0, 0))
    px = im.load()
    h = tile // 2
    r2 = (h + 0.5) ** 2
    for idx in range(16):
        ox, oy = (idx % 4) * tile, (idx // 4) * tile
        q = {"TL": idx & 1, "TR": idx & 2, "BL": idx & 4, "BR": idx & 8}
        for y in range(tile):
            for x in range(tile):
                left, top = x < h, y < h
                key = ("T" if top else "B") + ("L" if left else "R")
                if not q[key]:
                    continue
                # An isolated quarter is the convex corner of its world cell, and that corner is the
                # display tile's centre: round it there, keep the quarter flush with the tile's outer
                # edges where the neighbouring display tiles continue the shape.
                hx = ("T" if top else "B") + ("R" if left else "L")   # same row, other column
                vy = ("B" if top else "T") + ("L" if left else "R")   # other row, same column
                if not q[hx] and not q[vy]:
                    cx = 0 if left else tile - 1
                    cy = 0 if top else tile - 1
                    if (x - cx) ** 2 + (y - cy) ** 2 > r2:
                        continue
                px[ox + x, oy + y] = fill
        for y in range(tile):
            for x in range(tile):
                if px[ox + x, oy + y][3] == 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < tile and 0 <= yy < tile and px[ox + xx, oy + yy][3] == 0:
                        px[ox + x, oy + y] = edge
                        break
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return {"out": str(out), "tiles": 16, "size": list(im.size)}


def make_sprite_strip(out, frames: int = 6, frame=(24, 24), scale: int = 4, key=(255, 0, 255),
                      body=(70, 110, 200, 255), feet_gap: int = 2, bob: bool = True) -> dict:
    """A stand-in for a generated, keyed animation strip (scenario-sprite-pipeline output): `frames`
    cells of `frame` native pixels upscaled `scale` times by nearest, transparent pixels left carrying
    the key RGB (alpha 0), feet `feet_gap` native px above the cell bottom, a 1 px head bob."""
    _need_pil()
    fw, fh = frame
    im = Image.new("RGBA", (fw * frames, fh), (key[0], key[1], key[2], 0))
    px = im.load()
    for f in range(frames):
        ox = f * fw
        dy = (1 if (bob and f % 2) else 0)
        top = 4 + dy
        bottom = fh - 1 - feet_gap
        for y in range(top, bottom + 1):
            for x in range(ox + fw // 2 - 4, ox + fw // 2 + 4):
                px[x, y] = body
        for x in range(ox + fw // 2 - 2, ox + fw // 2 + 2):   # eyes row, a darker band
            px[x, top + 2] = (20, 20, 40, 255)
        leg = f % 3
        for y in range(bottom - 2, bottom + 1):                   # alternating legs
            px[ox + fw // 2 - 4 + leg, y] = (30, 50, 120, 255)
    big = im.resize((fw * frames * scale, fh * scale), Image.NEAREST)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    big.save(out)
    return {"out": str(out), "frames": frames, "frame_native": [fw, fh], "scale": scale,
            "frame_px": [fw * scale, fh * scale], "feet_native_y": fh - 1 - feet_gap}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-godot-2d helpers")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("jump"); a.add_argument("height", type=float); a.add_argument("t_apex", type=float)
    a.add_argument("--t-fall", type=float); a.add_argument("--tile", type=float)
    b = sub.add_parser("scale"); b.add_argument("png")
    c = sub.add_parser("grid"); c.add_argument("png"); c.add_argument("scale", type=int)
    d = sub.add_parser("imports"); d.add_argument("project")
    ns = ap.parse_args()
    if ns.cmd == "jump":
        print(json.dumps(jump_params(ns.height, ns.t_apex, ns.t_fall, ns.tile), indent=2))
    elif ns.cmd == "scale":
        print(json.dumps(detect_pixel_scale(ns.png)))
    elif ns.cmd == "grid":
        print(json.dumps(pixel_grid_check(ns.png, ns.scale)))
    elif ns.cmd == "imports":
        print(json.dumps(audit_imports(ns.project), indent=2))
