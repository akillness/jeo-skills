"""
ut_2d: runner-side helpers of the scenario-unity-2d skill (2D developer / artist persona).

Imports the shared toolkit of scenario-unity-expert (ut_env, ut_run, ut_review); never copies it.
System python3 (3.9+). Pillow and numpy are optional: the generators write PNGs with the
toolkit's pure encoder, the pixel checks use numpy when present.

    import sys; sys.path.insert(0, "<skills>/scenario-unity-2d/scripts")
    import ut_2d
    P = ut_2d.project("<repo>/tests/projects/unity-2d")        # APFS clone of Base2D_URP + both AgentKits + runtime
    ut_2d.make_demo_art(P)                                       # generated pixel art in Assets/Art/Pixel
    ut_2d.ppu_for(2160, 5)            -> 216                     # HD sprite PPU (2D e-book p. 21)
    ut_2d.integer_scales((320, 180))  -> scale and bars per screen size
    ut_2d.jump_profile(ut_2d.TARODEV) -> apex, rise time, airtime, tap height (continuous and 50 Hz)
    ut_2d.pixel_block_check(png, 6)   -> share of 6x6 blocks that are one flat colour (pixel perfect)
    ut_2d.shimmer_check(pngs, ...)    -> does a camera pan move the frame rigidly by whole pixels? (shimmer)
    ut_2d.air_drift(stats)            -> horizontal drift after releasing the stick mid-air (air friction)
    ut_2d.bounds_hide_secrets(b, s)   -> camera bounds never reveal a secret room

Run in Unity 6000.3.21f1 on 2026-09-24 through tests/code/unity-2d/ (see references/procedures.md).
"""

__version__ = "0.1"   # 2026-09-24 refactor: shimmer, air drift, jump-cut modes, secrets, reskin art

import json
import math
import os
import shutil
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL)
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)

import ut_env  # noqa: E402
import ut_run  # noqa: E402
import ut_review  # noqa: E402

try:
    import numpy as _np
except ImportError:  # pragma: no cover
    _np = None

AGENTKIT_2D = os.path.join(HERE, "AgentKit")          # editor jobs -> Assets/Editor/AgentKit/TwoD/
RUNTIME_2D = os.path.join(HERE, "Runtime")            # runtime components + asmdef -> Assets/AgentKit2D/

# Tarodev Ultimate 2D Controller, ScriptableStats.cs defaults (MIT repo, units = world units, s)
TARODEV = {
    "MaxSpeed": 14.0, "Acceleration": 120.0, "GroundDeceleration": 60.0, "AirDeceleration": 30.0,
    "GroundingForce": -1.5, "GrounderDistance": 0.05, "JumpPower": 36.0, "MaxFallSpeed": 40.0,
    "FallAcceleration": 110.0, "JumpEndEarlyGravityModifier": 3.0, "CoyoteTime": 0.15, "JumpBuffer": 0.2,
    "HorizontalDeadZoneThreshold": 0.1, "VerticalDeadZoneThreshold": 0.3,
}


# ============================================================================ project setup
def install(project):
    """Copy the core AgentKit (scenario-unity-expert), this skill's editor jobs (Assets/Editor/AgentKit/TwoD)
    and the runtime components with their asmdef (Assets/AgentKit2D/Runtime). Returns written files."""
    root = ut_env.find_project(project)["root"]
    written = list(ut_env.install_agentkit(root))
    written += ut_env.install_agentkit(root, src=AGENTKIT_2D)
    dst = os.path.join(root, "Assets", "AgentKit2D")
    for dirpath, _dirs, files in os.walk(RUNTIME_2D):
        rel = os.path.relpath(dirpath, RUNTIME_2D)
        for fn in files:
            if not fn.endswith((".cs", ".asmdef")):
                continue
            s = os.path.join(dirpath, fn)
            d = os.path.normpath(os.path.join(dst, rel, fn))
            if os.path.isfile(d) and Path(s).read_bytes() == Path(d).read_bytes():
                continue
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copyfile(s, d)
            written.append(os.path.relpath(d, root))
    return written


def project(dest):
    """ut_env.base_project("2d", dest) (APFS clone of tests/projects/Base2D_URP) + install()."""
    p = ut_env.base_project("2d", dest)
    install(p)
    return p


def run(project, method, args=None, **kw):
    """ut_run.run_method with a readable failure: raises RuntimeError when the envelope is not ok."""
    r = ut_run.run_method(project, method, args or {}, **kw)
    if not r.get("ok"):
        raise RuntimeError("%s failed: %s | compile: %s | exc: %s | log: %s" % (
            method, r.get("error"), r.get("compile_errors", [])[:3], r.get("exceptions", [])[:3], r.get("log")))
    return r


# ============================================================================ resolution math
def ppu_for(target_height, ortho_size):
    """HD sprite PPU = max vertical resolution / (orthographic size x 2), at the closest zoom
    (Unity 2D e-book 6.3, p. 21): 2160 px at Size 5 -> 216; zoomed to Size 3 -> 360."""
    return target_height / (2.0 * ortho_size)


def ortho_size_for(ref_height, ppu):
    """Orthographic size that shows ref_height art pixels at `ppu`: 180 / (2 x 16) = 5.625 units."""
    return ref_height / (2.0 * ppu)


def integer_scales(ref=(320, 180), screens=None):
    """Pixel Perfect Camera zoom per screen: zoom = min(H // refH, W // refW) (URP 17.3
    PixelPerfectCameraInternal.CalculateCameraProperties). Returns rows with the zoom, the art
    pixels actually shown (Upscale Render Texture shows W//zoom x H//zoom, even-rounded) and the
    black border if Crop Frame is Windowbox."""
    screens = screens or [(1280, 720), (1366, 768), (1920, 1080), (2560, 1440), (3840, 2160),
                          (2560, 1080), (1280, 800), (2400, 1080)]
    rw, rh = ref
    out = []
    for w, h in screens:
        z = max(1, min(h // rh, w // rw))
        shown = (w // z // 2 * 2, h // z // 2 * 2)
        out.append({"screen": [w, h], "zoom": z, "art_pixels_shown": list(shown),
                    "windowbox_border_px": [w - z * rw, h - z * rh], "exact": w % rw == 0 and h % rh == 0 and w // rw == h // rh})
    return out


# ============================================================================ controller feel math
def jump_profile(stats=None, dt=0.02, hold_steps=None, apex=None, mode="GravityMultiplier", cut=0.5, sustain=0.2):
    """Jump numbers for a Tarodev-style controller (velocity written every FixedUpdate).
    Continuous: rise = v/g, apex = v^2 / 2g, tap apex = v^2 / (2 g m) with the early-release
    multiplier m. Discrete: replays the controller's per-step order (jump sets vy, gravity
    MoveTowards in the same step, then position += vy*dt) at the physics step dt (0.02 s default).
    hold_steps: steps the button stays held (None = held to the apex). apex: optional dict
    {"threshold", "multiplier"} for the apex-hang modifier while held.
    mode: the variable-height METHOD (PlatformerStats.JumpCut): "GravityMultiplier" (gravity x m after
    release, Tarodev), "VelocityCut" (vy x cut on release, Super Meat Boy 0.5 per Dawnosaur),
    "Sustain" (vy held at the jump speed while held, up to `sustain` s, Celeste)."""
    s = dict(TARODEV, **(stats or {}))
    v, g, m = s["JumpPower"], s["FallAcceleration"], s["JumpEndEarlyGravityModifier"]
    cont = {"rise_s": v / g, "apex": v * v / (2 * g), "tap_apex": v * v / (2 * g * m),
            "airtime_flat_s": 2 * v / g, "top_speed_s": s["MaxSpeed"] / s["Acceleration"],
            "ground_stop_s": s["MaxSpeed"] / s["GroundDeceleration"], "air_stop_s": s["MaxSpeed"] / s["AirDeceleration"]}
    cont["run_distance_during_airtime"] = cont["airtime_flat_s"] * s["MaxSpeed"]
    y, vy, step, apex_y, apex_step, ended = 0.0, 0.0, 0, 0.0, 0, False
    land_step = None
    sustain_left = 0.0
    while step < 2000:
        step += 1
        held = hold_steps is None or step <= hold_steps
        if step == 1:
            vy = v
            sustain_left = sustain if mode == "Sustain" else 0.0
        if step > 1 and not held and vy > 0 and not ended:
            ended = True
            sustain_left = 0.0
            if mode == "VelocityCut":
                vy *= cut
        if sustain_left > 0 and held and vy > 0:
            sustain_left -= dt
            vy = max(vy, v)
            y += vy * dt
            if y > apex_y:
                apex_y, apex_step = y, step
            continue
        gg = g
        if ended and vy > 0:
            gg *= m if mode == "GravityMultiplier" else 1.0
        elif apex and held and abs(vy) < apex["threshold"]:
            gg *= apex["multiplier"]
        vy = max(vy - gg * dt, -s["MaxFallSpeed"])      # Mathf.MoveTowards(vy, -MaxFallSpeed, g * dt)
        y += vy * dt
        if y > apex_y:
            apex_y, apex_step = y, step
        if step > 1 and y <= 0:
            land_step = step
            break
    disc = {"apex": apex_y, "apex_step": apex_step, "rise_s": apex_step * dt,
            "airtime_s": (land_step or 0) * dt, "top_speed_steps": int(math.ceil(s["MaxSpeed"] / (s["Acceleration"] * dt) - 1e-9)),
            "coyote_steps": s["CoyoteTime"] / dt, "buffer_steps": s["JumpBuffer"] / dt}
    return {"continuous": cont, "discrete_%dHz" % round(1 / dt): disc, "dt": dt, "stats": s, "mode": mode}


def air_drift(stats=None, dt=0.02, body_width=0.55):
    """Horizontal drift after releasing the stick in the air at top speed: MoveTowards(vx, 0, AirDecel*dt)
    per step. This is the AIR FRICTION CHOICE (GMTK yorTG9at90g [00:04:14]: Celeste's "massive air
    friction" drops the character almost straight down; Tarodev's AirDeceleration 30 keeps momentum).
    Returns steps, seconds and distance to stop, and the distance in body widths."""
    s = dict(TARODEV, **(stats or {}))
    vx, x, steps = s["MaxSpeed"], 0.0, 0
    while vx > 1e-6 and steps < 10000:
        vx = max(0.0, vx - s["AirDeceleration"] * dt)
        x += vx * dt
        steps += 1
    return {"steps": steps, "seconds": round(steps * dt, 4), "distance": round(x, 4),
            "body_widths": round(x / body_width, 2), "continuous_distance": round(s["MaxSpeed"] ** 2 / (2 * s["AirDeceleration"]), 4)}


def stats_for(apex_height, time_to_apex, max_speed=None, time_to_top_speed=None):
    """Derive JumpPower and FallAcceleration from a designed apex height and rise time:
    g = 2h / t^2, v = 2h / t [added: standard kinematics]. Optional horizontal: accel = speed / t."""
    g = 2.0 * apex_height / (time_to_apex ** 2)
    out = {"FallAcceleration": g, "JumpPower": 2.0 * apex_height / time_to_apex}
    if max_speed and time_to_top_speed:
        out.update({"MaxSpeed": max_speed, "Acceleration": max_speed / time_to_top_speed})
    return out


# ============================================================================ pixel-perfect checks
def _load_rgb(path):
    w, h, rgb, _a, _m = ut_review.load_image(path)
    return w, h, rgb


def pixel_block_check(path, scale, tolerance=0, region=None):
    """Is the frame made of scale x scale blocks of ONE colour (art pixels upscaled by an integer)?
    Tries every grid offset and keeps the best. Returns uniform_block_fraction (1.0 = perfectly
    pixel perfect), offset, blocks, distinct_colors, and the worst block's colour spread.
    region: (x0, y0, x1, y1) to ignore borders or UI. Needs numpy for full-HD frames."""
    w, h, rgb = _load_rgb(path)
    if _np is None:
        raise RuntimeError("pixel_block_check needs numpy")
    a = _np.frombuffer(bytes(rgb), dtype=_np.uint8).reshape(h, w, 3).astype(_np.int16)
    if region:
        x0, y0, x1, y1 = region
        a = a[y0:y1, x0:x1]
    hh, ww = a.shape[:2]
    best = None
    for oy in range(scale):
        for ox in range(scale):
            bh, bw = (hh - oy) // scale, (ww - ox) // scale
            if bh < 1 or bw < 1:
                continue
            b = a[oy:oy + bh * scale, ox:ox + bw * scale].reshape(bh, scale, bw, scale, 3)
            spread = (b.max(axis=(1, 3)) - b.min(axis=(1, 3))).max(axis=-1)   # per block, worst channel
            frac = float((spread <= tolerance).mean())
            if best is None or frac > best["uniform_block_fraction"]:
                best = {"uniform_block_fraction": round(frac, 5), "offset": [ox, oy], "blocks": int(bh * bw),
                        "max_spread": int(spread.max()), "p99_spread": int(_np.percentile(spread, 99))}
    flat = a.reshape(-1, 3).astype(_np.int32)
    best["distinct_colors"] = int(len(_np.unique(flat[:, 0] * 65536 + flat[:, 1] * 256 + flat[:, 2])))
    best["scale"] = scale
    best["path"] = path
    best["size"] = [w, h]
    return best


def void_columns(path, bg=None, tol=2, scale=1):
    """Columns at the left and right edges that are entirely the camera's clear colour: the camera
    shows past the end of the level (test 21:9, 2D e-book p. 18; fix with a confiner or wider bounds).
    bg defaults to the top-left pixel. Returns counts in screen pixels and in art pixels (/scale)."""
    w, h, rgb = _load_rgb(path)
    if _np is None:
        raise RuntimeError("void_columns needs numpy")
    a = _np.frombuffer(bytes(rgb), dtype=_np.uint8).reshape(h, w, 3).astype(_np.int16)
    ref = _np.array(bg if bg is not None else a[0, 0], dtype=_np.int16)
    # clear colour, or the black border the Pixel Perfect Camera leaves when W is not a multiple of zoom
    is_void = (_np.abs(a - ref).max(axis=-1) <= tol) | (a.max(axis=-1) <= tol)
    col_void = is_void.all(axis=0)
    left = int(_np.argmin(col_void)) if not col_void.all() else w
    right = int(_np.argmin(col_void[::-1])) if not col_void.all() else w
    return {"left_px": left, "right_px": right, "left_art_px": left // max(1, scale), "right_art_px": right // max(1, scale),
            "bg": [int(x) for x in ref], "shows_void": left // max(1, scale) > 0 or right // max(1, scale) > 0}


def pan_shots(prefix, start, step_units, frames, width, height, **settings):
    """Shots for CameraJobs.CapturePixelPerfect that pan the camera horizontally by step_units per frame
    (pick a step that is NOT a multiple of 1/PPU, e.g. 0.37 art pixel, to expose sub-pixel motion).
    settings: grid_snapping, crop, filter, ppc (False = component off), ortho."""
    out = []
    for i in range(frames):
        d = {"name": "%s_%02d" % (prefix, i), "width": width, "height": height,
             "position": [round(start[0] + i * step_units, 6), start[1]]}
        d.update(settings)
        out.append(d)
    return out


def shimmer_check(paths, max_shift=40, tol=6, margin=None, region=None):
    """Pixel shimmer over a camera pan (docs digest checklist: "shimmer in a motion sequence"; Manual:
    Retro AA "prevents sprites shimmering when they move, but can make pixels look blurry").
    For each consecutive pair, find the integer horizontal shift s that best maps frame i onto frame i+1
    (pan = rigid translation when the renderer is grid locked) and score what does NOT match:
      rigid_fraction   share of overlapping pixels within `tol` levels after the best shift (1.0 = rigid)
      residual         mean absolute difference (0..255) after the best shift
      shifts           best shift per pair, in screen pixels
    Shimmer = art pixels changing width or colour while the scene slides, so rigid_fraction < 1.
    Returns per-pair rows plus the mean rigid fraction and the worst pair. region = (x0, y0, x1, y1)."""
    if _np is None:
        raise RuntimeError("shimmer_check needs numpy")
    frames = []
    for p in paths:
        w, h, rgb = _load_rgb(p)
        a = _np.frombuffer(bytes(rgb), dtype=_np.uint8).reshape(h, w, 3).astype(_np.int16)
        if region:
            x0, y0, x1, y1 = region
            a = a[y0:y1, x0:x1]
        frames.append(a)
    m = margin if margin is not None else max_shift
    rows = []
    for i in range(len(frames) - 1):
        A, B = frames[i], frames[i + 1]
        hh, ww = A.shape[:2]
        best = None
        for sft in range(-max_shift, max_shift + 1):
            # scene content moves left when the camera pans right: B[x] ~ A[x + sft]
            a = A[:, m + sft: ww - m + sft]
            b = B[:, m: ww - m]
            d = _np.abs(a - b).max(axis=-1)
            res = float(d.mean())
            if best is None or res < best[1]:
                best = (sft, res, float((d <= tol).mean()))
        rows.append({"pair": [i, i + 1], "shift_px": best[0], "residual": round(best[1], 3), "rigid_fraction": round(best[2], 5)})
    rf = [r["rigid_fraction"] for r in rows] or [1.0]
    return {"pairs": rows, "mean_rigid_fraction": round(sum(rf) / len(rf), 5), "min_rigid_fraction": round(min(rf), 5),
            "mean_residual": round(sum(r["residual"] for r in rows) / max(1, len(rows)), 3),
            "shifts": [r["shift_px"] for r in rows], "frames": len(frames)}


def bounds_hide_secrets(bounds, secrets):
    """A Confiner 2D keeps the whole VIEW inside its bounds, so a secret room stays hidden only if the
    bounds never overlap it: "end the bounds exactly at a secret room's border" (Sasquatch 9dzBrLUIF8g
    [00:02:10], [00:16:52]). Rects are (xmin, ymin, xmax, ymax); touching edges are fine. Returns the
    secrets the bounds would reveal (empty list = pass) with the overlap area."""
    bx0, by0, bx1, by1 = bounds
    leaks = []
    for i, (sx0, sy0, sx1, sy1) in enumerate(secrets):
        ox = min(bx1, sx1) - max(bx0, sx0)
        oy = min(by1, sy1) - max(by0, sy0)
        if ox > 1e-6 and oy > 1e-6:
            leaks.append({"secret": i, "overlap": [round(ox, 4), round(oy, 4)], "area": round(ox * oy, 4)})
    return {"ok": not leaks, "leaks": leaks}


def softness(path):
    """Share of horizontally adjacent pixel pairs with a small but non-zero step (1..23 levels):
    bilinear upscaling and blur raise it, crisp point-sampled pixel art keeps it low."""
    w, h, rgb = _load_rgb(path)
    if _np is None:
        raise RuntimeError("softness needs numpy")
    a = _np.frombuffer(bytes(rgb), dtype=_np.uint8).reshape(h, w, 3).astype(_np.int16)
    d = _np.abs(_np.diff(a, axis=1)).max(axis=-1)
    nz = d > 0
    soft = (d > 0) & (d < 24)
    return {"soft_pair_fraction": round(float(soft.mean()), 5),
            "soft_share_of_changes": round(float(soft.sum()) / max(1, int(nz.sum())), 4)}


# ============================================================================ generated pixel art
# Palettes [added]: a small ramp per material, dark to light, so the art reads at 1x.
PAL = {
    "dirt": [(94, 51, 35), (133, 76, 48), (163, 102, 64)],
    "grass": [(37, 131, 72), (56, 183, 100), (133, 220, 110)],
    "outline": (44, 30, 30),
    "stone": [(40, 38, 54), (58, 56, 78), (76, 74, 100)],
    "wood": [(110, 70, 40), (160, 110, 60), (205, 155, 95)],
    "skin": (240, 190, 150), "shirt": (220, 60, 60), "pants": (50, 60, 120), "hair": (70, 40, 30),
}


class Canvas:
    """RGBA pixel canvas (row 0 = top, like PNG). put() ignores out-of-range pixels."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.rgb = bytearray(w * h * 3)
        self.a = bytearray(w * h)

    def put(self, x, y, c, alpha=255):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = y * self.w + x
            self.rgb[3 * i:3 * i + 3] = bytes(c)
            self.a[i] = alpha

    def get(self, x, y):
        i = y * self.w + x
        return tuple(self.rgb[3 * i:3 * i + 3]), self.a[i]

    def rect(self, x0, y0, x1, y1, c, alpha=255):
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.put(x, y, c, alpha)

    def blit(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                c, al = other.get(x, y)
                if al:
                    self.put(ox + x, oy + y, c, al)

    def save(self, path):
        return ut_review.write_png(path, self.w, self.h, self.rgb, self.a)


def _hash(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 0xFF


N, E, S, W = 1, 2, 4, 8   # neighbour bits of the cardinal 16-tile set (bit set = same tile present)


def ground_tile(mask, t=16):
    """One 16 x 16 ground tile for a cardinal neighbour mask: grass cap where no tile is above,
    outlines on open sides, rounded open corners, speckled dirt that tiles seamlessly."""
    c = Canvas(t, t)
    d0, d1, d2 = PAL["dirt"]
    for y in range(t):
        for x in range(t):
            h = _hash(x, y, 7)
            c.put(x, y, d2 if h < 18 else d0 if h > 236 else d1)
    if not mask & N:
        g0, g1, g2 = PAL["grass"]
        for x in range(t):
            c.put(x, 0, g2)
            c.put(x, 1, g1)
            c.put(x, 2, g1)
            c.put(x, 3, g0)
            if x % 4 == 1:
                c.put(x, 4, g0)
    o = PAL["outline"]
    if not mask & W:
        for y in range(t):
            c.put(0, y, o)
            if c.get(1, y)[0] in PAL["dirt"]:
                c.put(1, y, d0)
    if not mask & E:
        for y in range(t):
            c.put(t - 1, y, o)
            if c.get(t - 2, y)[0] in PAL["dirt"]:
                c.put(t - 2, y, d0)
    if not mask & S:
        for x in range(t):
            c.put(x, t - 1, o)
    if not mask & N:
        for x in range(t):
            if c.get(x, 0)[0] == PAL["grass"][2] and (x == 0 and not mask & W or x == t - 1 and not mask & E):
                c.put(x, 0, (0, 0, 0), 0)
    return c


def ground_normal(mask, t=16):
    """Tangent-space normal map for ground_tile(mask): flat (128, 128, 255) inside, bevelled
    toward open sides (R encodes left-right, G down-up: 2D e-book p. 103)."""
    c = Canvas(t, t)
    for y in range(t):
        for x in range(t):
            nx, ny = 0.0, 0.0
            if not mask & W and x < 2:
                nx -= 0.7
            if not mask & E and x > t - 3:
                nx += 0.7
            if not mask & N and y < 3:
                ny += 0.8      # facing up (G high): image y grows downward
            if not mask & S and y > t - 2:
                ny -= 0.7
            if (_hash(x, y, 7) < 18):
                ny += 0.3      # speckles catch the light a little
            nz = math.sqrt(max(0.05, 1 - min(0.95, nx * nx + ny * ny)))
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            c.put(x, y, (int(128 + 127 * nx / ln), int(128 + 127 * ny / ln), int(128 + 127 * nz / ln)))
    return c


def tileset_sheet(t=16, normal=False):
    """4 x 4 sheet of the 16 cardinal ground tiles; tile for mask m at column m % 4, row m // 4
    from the TOP of the image (sprite names tile_m00 .. tile_m15)."""
    sheet = Canvas(4 * t, 4 * t)
    for m in range(16):
        tile = ground_normal(m, t) if normal else ground_tile(m, t)
        sheet.blit(tile, (m % 4) * t, (m // 4) * t)
    return sheet


def wall_tile(t=16):
    """Background stone brick (the BG tilemap)."""
    c = Canvas(t, t)
    s0, s1, s2 = PAL["stone"]
    for y in range(t):
        for x in range(t):
            row = y // 4
            off = 4 if row % 2 else 0
            mortar = y % 4 == 3 or (x + off) % 8 == 7
            c.put(x, y, s0 if mortar else (s2 if _hash(x, y, 3) < 20 else s1))
    return c


def player_sheet():
    """8 frames of a 16 x 16 hero: idle0 idle1 run0 run1 run2 run3 jump fall (left to right)."""
    frames = []
    legs = {
        "idle0": [(5, 6), (9, 10)], "idle1": [(5, 6), (9, 10)],
        "run0": [(4, 5), (10, 11)], "run1": [(6, 7), (8, 9)], "run2": [(3, 4), (10, 12)], "run3": [(6, 7), (8, 9)],
        "jump": [(5, 6), (10, 11)], "fall": [(4, 5), (10, 11)],
    }
    o = PAL["outline"]
    for name in ["idle0", "idle1", "run0", "run1", "run2", "run3", "jump", "fall"]:
        c = Canvas(16, 16)
        bob = 1 if name in ("idle1", "run1", "run3") else 0
        top = 2 + bob
        c.rect(5, top, 11, top + 6, o)                        # head outline
        c.rect(6, top + 1, 10, top + 5, PAL["skin"])
        c.rect(6, top + 1, 10, top + 2, PAL["hair"])
        c.put(8, top + 3, o)
        c.put(9, top + 3, o)                                  # eyes (facing right)
        c.rect(5, top + 6, 11, top + 10, o)                   # body outline
        c.rect(6, top + 6, 10, top + 9, PAL["shirt"])
        if name == "jump":
            c.rect(3, top + 5, 5, top + 7, PAL["skin"])       # arms up
            c.rect(11, top + 5, 13, top + 7, PAL["skin"])
        elif name == "fall":
            c.rect(3, top + 8, 5, top + 9, PAL["skin"])
            c.rect(11, top + 8, 13, top + 9, PAL["skin"])
        else:
            c.rect(4, top + 7, 5, top + 9, PAL["skin"])
            c.rect(11, top + 7, 12, top + 9, PAL["skin"])
        for (x0, x1) in legs[name]:
            c.rect(x0, top + 10, x1 + 1, 16 - (0 if name not in ("jump",) else 1), PAL["pants"])
        frames.append(c)
    sheet = Canvas(16 * len(frames), 16)
    for i, f in enumerate(frames):
        sheet.blit(f, 16 * i, 0)
    return sheet


def crate(t=16):
    c = Canvas(t, t)
    w0, w1, w2 = PAL["wood"]
    o = PAL["outline"]
    c.rect(0, 0, t, t, o)
    c.rect(1, 1, t - 1, t - 1, w1)
    c.rect(1, 1, t - 1, 3, w2)
    c.rect(1, t - 3, t - 1, t - 1, w0)
    for i in range(2, t - 2):
        c.put(i, i, w0)
        c.put(t - 1 - i, i, w0)
    return c


def crate_normal(t=16):
    c = Canvas(t, t)
    for y in range(t):
        for x in range(t):
            nx = -0.6 if x < 2 else 0.6 if x > t - 3 else 0.0
            ny = 0.6 if y < 3 else -0.6 if y > t - 4 else 0.0
            nz = math.sqrt(max(0.1, 1 - nx * nx - ny * ny))
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            c.put(x, y, (int(128 + 127 * nx / ln), int(128 + 127 * ny / ln), int(128 + 127 * nz / ln)))
    return c


def torch(t=16):
    c = Canvas(t, t)
    c.rect(7, 8, 9, 16, PAL["wood"][0])
    for y, (x0, x1, col) in enumerate([(7, 9, (255, 240, 160)), (6, 10, (255, 200, 80)), (6, 10, (255, 160, 40)),
                                         (5, 11, (240, 110, 30)), (6, 10, (200, 70, 20))]):
        c.rect(x0, 3 + y, x1, 4 + y, col)
    return c


def light_shaft(w=16, h=32):
    """Sprite-light cookie: a slanted shaft in 4 hard alpha steps (pixel art, no smooth ramp)."""
    c = Canvas(w, h)
    for y in range(h):
        cx = 4 + y * 8 // h
        for x in range(w):
            d = abs(x - cx - 2)
            level = 255 if d <= 1 else 170 if d <= 2 else 90 if d <= 3 else 0
            level = level * (h - y) // h
            level = (level // 64) * 64
            if level:
                c.put(x, y, (255, 255, 255), min(255, level))
    return c


def spikes(t=16, h=8):
    """Floor spikes: 16 x 8 px, four teeth (pivot at the bottom centre). The hitbox is inset from this art
    (Hazard2D, Celeste small spike hitboxes)."""
    c = Canvas(t, h)
    s0, s1, s2 = PAL["stone"]
    o = PAL["outline"]
    for k in range(4):
        x0 = 4 * k
        for y in range(h):
            w = 1 + (y * 3) // (h - 1)       # 1 px at the tip row, 4 px at the base: triangular teeth
            left = x0 + (4 - w) // 2
            for x in range(left, left + w):
                edge = w > 2 and x in (left, left + w - 1)
                c.put(x, y, o if edge else (s2 if x < x0 + 2 else s1))
    c.rect(0, h - 1, t, h, s0)
    return c


def platform_oneway(t=16, h=6):
    """One-way wooden plank (tiled by the SpriteRenderer, pivot at the top centre)."""
    c = Canvas(t, h)
    w0, w1, w2 = PAL["wood"]
    o = PAL["outline"]
    c.rect(0, 0, t, h, o)
    c.rect(0, 1, t, 3, w2)
    c.rect(0, 3, t, 4, w1)
    for x in (3, 11):
        c.rect(x, 4, x + 2, h, w0)
    return c


def crenel_tile(t=16):
    """A 16 x 16 tile with a crenellated (deeply concave) top: its generated physics outline is concave, so a
    Tilemap Collider 2D in Sprite mode must decompose it into several convex shapes (the Use Delaunay Mesh case)."""
    c = Canvas(t, t)
    s0, s1, s2 = PAL["stone"]
    o = PAL["outline"]
    for y in range(t):
        for x in range(t):
            if y < t // 2 and (x % 5) in (3, 4):
                continue                                   # notches, 2 px wide, 8 px deep
            c.put(x, y, s2 if _hash(x, y, 5) < 30 else s1)
    for x in range(t):
        c.put(x, t - 1, o)
    return c


SNOW = {"dirt": [(92, 96, 120), (122, 128, 152), (150, 156, 180)], "grass": [(200, 214, 230), (228, 238, 248), (255, 255, 255)]}


def tileset_sheet_reskin(t=16, pal=None):
    """The same 16-tile cardinal layout and sprite names in another palette (snow by default): the input
    of a Rule Override Tile reskin (same rules, different sprites)."""
    pal = pal or SNOW
    keep = {k: PAL[k] for k in pal}
    try:
        PAL.update(pal)
        return tileset_sheet(t)
    finally:
        PAL.update(keep)


def icon(i, t=16):
    """Atlas-bench icon i: a coloured diamond on transparency (distinct colour per index)."""
    c = Canvas(t, t)
    hue = (i * 37) % 360
    r, g, b = _hsv(hue, 0.7, 0.95)
    for y in range(t):
        for x in range(t):
            if abs(x - 7.5) + abs(y - 7.5) <= 7:
                c.put(x, y, (r, g, b) if abs(x - 7.5) + abs(y - 7.5) <= 5.5 else PAL["outline"])
    return c


def _hsv(h, s, v):
    c = v * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = v - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return int((r + m) * 255), int((g + m) * 255), int((b + m) * 255)


def hd_disc(size=512):
    """Smooth anti-aliased disc for the HD import path (not pixel art)."""
    c = Canvas(size, size)
    r0 = size * 0.45
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5)
            a = max(0.0, min(1.0, r0 - d + 0.5))
            if a > 0:
                t = d / r0
                c.put(x, y, (int(80 + 150 * (1 - t)), int(140 + 100 * (1 - t)), 230), int(a * 255))
    return c


def make_demo_art(project, bench=20):
    """Write the generated art the procedures use (idempotent: identical bytes are not rewritten,
    so Unity does not reimport). Returns {name: asset path}."""
    root = ut_env.find_project(project)["root"]
    out = {}

    def save(canvas, rel):
        path = os.path.join(root, rel)
        data = ut_review.encode_png(canvas.w, canvas.h, canvas.rgb, canvas.a)
        if not (os.path.isfile(path) and Path(path).read_bytes() == data):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
        out[os.path.splitext(os.path.basename(rel))[0]] = rel
        return rel

    save(tileset_sheet(), "Assets/Art/Pixel/tiles_ground.png")
    save(tileset_sheet(normal=True), "Assets/Art/Pixel/Normals/tiles_ground_n.png")
    save(wall_tile(), "Assets/Art/Pixel/tile_wall.png")
    save(player_sheet(), "Assets/Art/Pixel/player.png")
    save(crate(), "Assets/Art/Pixel/crate.png")
    save(crate_normal(), "Assets/Art/Pixel/Normals/crate_n.png")
    save(torch(), "Assets/Art/Pixel/torch.png")
    save(light_shaft(), "Assets/Art/Pixel/Lights/light_shaft.png")
    save(spikes(), "Assets/Art/Pixel/spikes.png")
    save(platform_oneway(), "Assets/Art/Pixel/platform_oneway.png")
    save(crenel_tile(), "Assets/Art/Pixel/crenel_tile.png")
    save(tileset_sheet_reskin(), "Assets/Art/Pixel/Reskin/tiles_snow.png")
    save(hd_disc(), "Assets/Art/HD/hd_disc.png")
    for i in range(bench):
        save(icon(i), "Assets/Art/AtlasBench/Loose/loose_%02d.png" % i)
        save(icon(i), "Assets/Art/AtlasBench/Packed/packed_%02d.png" % i)
    return out


def expected_mask(rows, x, y, solid="#"):
    """Cardinal neighbour mask of cell (x, y) in a text map (row 0 = top line = highest y)."""
    H = len(rows)

    def at(cx, cy):
        r = H - 1 - cy
        return 0 <= r < H and 0 <= cx < len(rows[r]) and rows[r][cx] == solid
    return (N if at(x, y + 1) else 0) | (E if at(x + 1, y) else 0) | (S if at(x, y - 1) else 0) | (W if at(x - 1, y) else 0)


DEMO_LEVEL = [
    "B" * 40,
    "B" * 40,
    "B" * 40,
    "B" * 40,
    "BBBBBBBBBBBBBB####BBBBBBBBBBBBBBBBBBBBBB",
    "BBBBBBBBBBBBBBBBBBBBBBBBBBB#####BBBBBBBB",
    "BBBBBBBT#####BBBBBBBTBBBBBBBBBBBBBBBBBBB",
    "B" * 40,
    "BBBPBBBBBBBBBBBBBBBBCBBBBBBBBBBBBBBBCBBB",
    "#######BBBBB#####################B######",
    "#######BBBBB#####################B######",
    "#######BBBBB############################",
    "#" * 40,
    "#" * 40,
]


# ============================================================================ log metrics
def metrics_from_nunit(result):
    """Collect the AGENT_METRIC {json} lines the PlayMode tests print (TestContext output)."""
    out = {}
    for c in result.get("cases", []):
        for line in (c.get("output") or "").splitlines():
            if line.startswith("AGENT_METRIC "):
                try:
                    d = json.loads(line[len("AGENT_METRIC "):])
                    if d not in out.setdefault(c["name"], []):   # TestContext + Debug.Log both land in the output
                        out[c["name"]].append(d)
                except ValueError:
                    pass
    return out


def metrics_from_log(log_path):
    """Same, read from the Unity log (Debug.Log lines), for runs whose XML drops output."""
    out = []
    try:
        with open(log_path, errors="replace") as f:
            for line in f:
                i = line.find("AGENT_METRIC ")
                if i >= 0:
                    try:
                        out.append(json.loads(line[i + len("AGENT_METRIC "):].strip()))
                    except ValueError:
                        pass
    except OSError:
        pass
    return out
