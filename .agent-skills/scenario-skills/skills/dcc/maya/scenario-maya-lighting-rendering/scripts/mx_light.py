"""
mx_light: the lighter's toolkit for Maya 2027 + Arnold (MtoA 5.6.x). Light rigs keyed to a face
or product axis, light groups and AOVs, render settings and budgets, the noise diagnosis loop,
a pure EXR reader, and the lighting supervisor's frame critique turned into numbers.

STATUS (2026-09-24): the Maya layer is NOT YET RUN IN MAYA (Maya 2027 not installed). The pure
layer (vector and rig math, exposure and grade math, sampling and budget math, EXR read/write,
frame metrics and critique, noise diagnosis and its loop, light-group contract and sums, the
Render command builder) ran offline with python3 3.14, numpy 2.4 and PIL 12:
tests/code/maya-lighting-rendering/test_mx_light_offline.py. The Maya layer's Python logic ran
against a fake maya.cmds (test_jobs_fakemaya.py): that proves no typos or broken control flow,
nothing about Maya or MtoA. Every MtoA node, attribute and plug name goes through candidate
tables and fails loudly when none exists; job_00_probe_lighting.py dumps the real 2027 names.

Two halves:
  agent side (system python3 + numpy, no Maya): plan_character_rig, plan_product_rig,
      exposure_for_target, grade_to_light, rays_per_pixel, settings_lint, extrapolate_time,
      sequence_budget, read_exr, write_exr, analyze_frame, critique, write_report,
      light_group_sheet, exposure_bracket, noise_pair, next_step, noise_loop, check_sums,
      group_contract, comp_recipe, render_cmd, project_points, dof_plan, dof_zone,
      view_depth_range, dome_resolution_check, image_width, licence_check_cmd
  Maya side (mayapy through scenario-maya-expert's mx_run, or the GUI bridge): ensure_arnold, set_options,
      apply_rig, set_light_groups, setup_aovs, add_mask_aov, setup_exr_driver, set_denoiser,
      render_shot, render_seed_pair, grey_shading, scene_checks, render_settings_report,
      cm_state, cm_audit_scene, make_layer, export_render_setup, probe

  import sys; sys.path.insert(0, "<skills>/scenario-maya-lighting-rendering/scripts"); import mx_light as L
  plan = L.plan_product_rig("watch", bb_min, bb_max, cam_pos)          # pure: where, how big, stops
  made = L.apply_rig(plan)                                              # Maya: lights, groups, tags
  r = L.render_shot("/abs/out/v001", camera="hero_CAM", masks={"subject": ["watch_GRP"]})
  rep = L.analyze_frame(png=r["png"], exr=r["exr"], brief=L.default_brief("product"))
  L.write_report(rep, "/abs/out/v001")         # critique.md, critique.json, annotated.png, squint.png
  pair = L.render_seed_pair("/abs/out/noise", camera="hero_CAM")        # Maya: two seeds, same frame
  L.noise_pair(pair["a"], pair["b"])["ranking"]                          # which AOV, which sampler

Headless through mx_run (scenario-maya-expert), then analysis in the agent's python3:
  python3 mx_run.py --plugins mtoa --scene shot_v003.ma mx_light.py -- render --camera hero_CAM --out /abs/out
  python3 mx_light.py analyze --png /abs/out/shot.png --exr /abs/out/shot.exr --kind product --out /abs/out
  python3 mx_light.py noise --a /abs/out/a.exr --b /abs/out/b.exr

Citations (references/sources.md): TZ-C Tanzillo critique 5X4-uavfVgA; KT Katatikarn and
Tanzillo SIGGRAPH iYTjebUHX9o; BR Brejon Night Bar PHskvc6WYWI; BR-B Brejon book ch6, ch8,
ch8.5; BRJ-CM Brejon book ch1, ch1.5, ch9; ARV-L Arvid 2SDDFiQQH5g; ARV-T Arvid XZfsqJ0_9go;
ARV-C Arvid car cpMBRIWwghg; SARK _jGC7_fRlfw; MLC FODVxXOIrvM; JHILL mpk6IurOWbs; SMP, AOV,
LGT Arnold docs; CM Maya 2027 colour management and Render Setup help. [added] marks this
toolkit's own formulas and starting values: calibrate them on an approved frame.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import difflib
import glob
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import zlib

_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(_EXPERT_SCRIPTS) and _EXPERT_SCRIPTS not in sys.path:
    sys.path.append(_EXPERT_SCRIPTS)
# Arnold 7.3+ batch renders abort on a licence failure by default (abort_on_license_fail true);
# WN25 names ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL as the override ("0" = watermark instead is our
# reading [verify]). Tests and previews may watermark; finals use render_env(final=True).
os.environ.setdefault("ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL", "0")


def _mxr():
    """scenario-maya-expert's mx_review: PNG IO, text, contact sheets, aim math. Shared, not duplicated."""
    import mx_review
    return mx_review


def _np():
    import numpy as np
    return np


# =========================================================================== constants
REC709_Y = (0.2126, 0.7152, 0.0722)
AP1_Y = (0.2722287168, 0.6740817658, 0.0536895174)        # ACEScg luminance weights [added]
# ACEScg (AP1) to linear Rec.709, the inverse of the matrix scenario-maya-lookdev uses [added]
AP1_TO_REC709 = ((1.7050509927, -0.6217921207, -0.0832588720),
                 (-0.1302564175, 1.1408047366, -0.0105483191),
                 (-0.0240033568, -0.1289689761, 1.1529723329))
UP_Y = (0.0, 1.0, 0.0)
MAX_LIGHT_GROUPS = 16                                      # AOV § Light Group Example
QUAD_UNIT = 2.0          # a Maya/Arnold quad area light is 2 x 2 units at scale 1 [verify]
DISK_UNIT = 1.0          # disk radius at scale 1 [verify]

# Starting thresholds for the frame checks. Every value is [added]: the rule comes from the
# cited expert, the number is ours; calibrate on an approved frame of the project.
THRESHOLDS = {
    "clip_L": 99.0, "crush_L": 2.0,
    "subject_clip_share": 0.005,       # KT 00:29:59 brightening the subject until it clips
    "frame_crush_share": 0.05,         # ARV-C 00:52:51 "in CG it's always just too black"
    "separation_dprime": 0.8,          # BR 00:40:02 never dark on dark
    "saliency_concentration": 1.3,     # TZ-C 00:11:53 squint: where does the eye go
    "top_band": 0.33,
    "value_clarity": 2.0,              # notan clarity, TZ-C 00:08:38, BR 00:09:19
    "dominance_gap": 0.15,             # BR-B ch6 Balance: one light stands above
    "rim_key_stops": 0.5,              # BR-B ch6 Balance: rim equal to key
    "face_ratio_tol_stops": 0.5,
    "symmetry": 0.10,                  # BR-B ch6 Planet 51
    "face_black_floor": 0.02, "face_black_share": 0.05,   # BR-B ch8.5 no black areas
    "chroma_sat": 20.0, "isolated_hue_share": 0.03, "isolated_hue_min_share": 0.001,
    "isolated_hue_angle": 60.0,        # TZ-C 00:14:39 the only red element
    "vignette_margin": 5.0,            # BR-B ch6 Vignetting
    "sum_rel_tol": 0.01,               # BR 00:59:41 layers sum to beauty (half floats)
}
MOOD_RATIO_STOPS = {"soft": 1.0, "happy": 1.0, "natural": 1.5, "standard": 2.0, "drama": 2.0,
                    "dread": 3.0, "noir": 3.0}          # [added] lit vs shadow side of a face, in stops


# =========================================================================== vector math
def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def v_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def v_len(a):
    return math.sqrt(v_dot(a, a))


def v_norm(a):
    n = v_len(a)
    if n < 1e-12:
        raise ValueError("zero-length vector")
    return (a[0] / n, a[1] / n, a[2] / n)


def v_angle(a, b):
    """Angle in degrees between two vectors."""
    c = v_dot(v_norm(a), v_norm(b))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def horizontal(v, up=UP_Y):
    """v with its component along up removed, normalized."""
    u = v_norm(up)
    return v_norm(v_sub(v, v_mul(u, v_dot(v, u))))


def light_dir(axis, azimuth_deg, elevation_deg, up=UP_Y):
    """Unit direction from the subject toward a light: rotate the horizontal `axis` about `up`
    by azimuth (positive = toward screen right when axis points at the camera), then raise it
    by elevation. Digest P2 of lighting_studio_principles, rewritten without OpenMaya."""
    u = v_norm(up)
    h = horizontal(axis, u)
    a, e = math.radians(azimuth_deg), math.radians(elevation_deg)
    ha = v_add(v_mul(h, math.cos(a)), v_mul(v_cross(u, h), math.sin(a)))
    return v_norm(v_add(v_mul(ha, math.cos(e)), v_mul(u, math.sin(e))))


def upstage_sign(face_fwd, to_cam, azimuth_deg=45.0, up=UP_Y):
    """+1 or -1: the side a key rotated azimuth degrees from the FACE's forward axis must take
    to land on the far side of the face from the camera (BR-B ch8.5 Lighting upstage and
    downstage; the cross-product sign test is the book note's [added] formalization).
    Measuring the key from the camera axis is the classic bug: a turned face gets a frontal key."""
    u = v_norm(up)
    f, c = horizontal(face_fwd, u), horizontal(to_cam, u)
    cam_side = v_dot(v_cross(f, c), u)
    if abs(cam_side) < 1e-3:
        return 1                         # face looks straight into the lens: either side is upstage
    for s in (1, -1):
        k = light_dir(f, s * azimuth_deg, 0.0, u)
        if cam_side * v_dot(v_cross(f, k), u) < 0:
            return s
    return 1


def is_upstage(face_fwd, to_cam, to_key, up=UP_Y):
    """True when the key lies on the other side of the face's forward axis than the camera."""
    u = v_norm(up)
    f = horizontal(face_fwd, u)
    cs = v_dot(v_cross(f, horizontal(to_cam, u)), u)
    ks = v_dot(v_cross(f, horizontal(to_key, u)), u)
    if abs(cs) < 1e-3:
        return True
    return cs * ks < 0


def screen_side(direction, to_cam, up=UP_Y):
    """'right', 'left' or 'center' for a light direction, as seen from the camera."""
    fwd = v_mul(horizontal(to_cam, up), -1.0)
    right = v_cross(fwd, v_norm(up))
    d = v_dot(direction, right)
    return "center" if abs(d) < 1e-3 else ("right" if d > 0 else "left")


def reflect(v, n):
    """Reflect direction v about unit normal n."""
    n = v_norm(n)
    return v_sub(v, v_mul(n, 2.0 * v_dot(v, n)))


def reflection_placement(point, normal, cam_pos, distance):
    """Where a light must sit to be SEEN in a mirror-like surface at `point` with `normal`
    from the camera: along the reflected view ray (angle of incidence equals angle of
    reflection) [added geometry; the reason is ARV-C 00:36:21 and the lookdev digest: for
    polished metal the reflections are the product]. Returns (position, direction from the
    point to the light) or (None, None) when the surface faces away from the camera."""
    v = v_norm(v_sub(point, cam_pos))
    n = v_norm(normal)
    if v_dot(v, n) >= 0:
        return None, None
    r = v_norm(reflect(v, n))
    return v_add(point, v_mul(r, distance)), r


# =========================================================================== exposure and grades
def exposure_for_target(distance, target=1.0, intensity=1.0):
    """Starting exposure (stops) for a normalized area light at `distance` (scene units) so a
    white Lambert facing it reads about `target` in scene-linear [added: from LGT § Exposure
    (color * intensity * 2^exposure), LGT § Normalize (size changes softness, not energy) and
    inverse-square falloff: 2^E = pi d^2 target / intensity]. It lands on the 15 to 20 range
    Arvid types in cm scenes at about 1 to 2 m (ARV-L 00:03:58) and J Hill's 16 (JHILL 00:08:58).
    Always correct it with exposure_correction() after one grey-card render."""
    if distance <= 0 or target <= 0 or intensity <= 0:
        raise ValueError("distance, target and intensity must be > 0")
    return math.log2(math.pi * distance * distance * target / intensity)


def exposure_correction(measured, target):
    """Stops to add so a measured scene-linear value becomes the target."""
    if measured <= 0 or target <= 0:
        raise ValueError("measured and target must be > 0")
    return math.log2(target / float(measured))


def grade_to_light(gain, color=(1.0, 1.0, 1.0), exposure=0.0, mode="split", weights=REC709_Y):
    """Carry a comp grade on a light group back into the light (BR 01:02:57, BR-B ch8 Final
    result: 'I ALWAYS copy back the values'). gain: scalar or (r, g, b) multiplier.
    mode 'multiply': color *= gain, exposure unchanged (Brejon's literal method: warm
    0.6 0.42 0.13 times 0.2 0.5 2 gives teal 0.12 0.21 0.26).
    mode 'split' [added]: the neutral part goes to exposure (log2 of the gain's luminance), the
    tint to color, so shot deltas stay readable in stops. Returns {'color', 'exposure', ...}."""
    g = (float(gain),) * 3 if isinstance(gain, (int, float)) else tuple(float(x) for x in gain)
    if min(g) <= 0:
        raise ValueError("gains must be > 0")
    if mode == "multiply":
        return {"color": tuple(c * k for c, k in zip(color, g)), "exposure": exposure, "mode": mode}
    k = sum(w * x for w, x in zip(weights, g))
    tint = tuple(x / k for x in g)
    return {"color": tuple(c * t for c, t in zip(color, tint)), "exposure": exposure + math.log2(k),
            "neutral_stops": math.log2(k), "mode": "split"}


# =========================================================================== camera: depth of field (pure)
# Arnold's thin-lens camera: aiApertureSize is the RADIUS of the aperture in world units, and
# aiFocusDistance the distance in perfect focus (LGT § Aperture Size, § Focus Distance). The
# sharpness limit is [added]: a circle of confusion of 1/1200 of the frame width (0.03 mm on a
# 36 mm back, the usual full-frame convention); tighten it for 4K hero stills.
COC_FRACTION = 1.0 / 1200.0
MAX_F_NUMBER = 22.0          # [added] past this a real lens does not stop down (and diffracts)


def frame_width_at(distance, focal_mm, film_width_mm=36.0):
    """Width of the framed plane at `distance` (scene units) for a pinhole camera."""
    return distance * film_width_mm / float(focal_mm)


def view_depth_range(points, cam_pos, view_dir):
    """(nearest, farthest) distance ALONG the view axis (planar, what focus distance means) of
    points, for example the 8 corners of a bounding box."""
    d = v_norm(view_dir)
    zs = [v_dot(v_sub(p, cam_pos), d) for p in points]
    return min(zs), max(zs)


def bbox_corners(bb_min, bb_max):
    return [(x, y, z) for x in (bb_min[0], bb_max[0]) for y in (bb_min[1], bb_max[1]) for z in (bb_min[2], bb_max[2])]


def dof_zone(focus, aperture_radius, frame_width, coc_frac=COC_FRACTION):
    """Near and far limits of acceptable sharpness for `focus` distance and Arnold aperture
    radius (scene units). Object-space geometry of the thin lens [added]: a point at distance z
    blurs into D |z - d| / z on the focus plane (D = 2 x radius); it stays sharp while that is
    under c = frame_width x coc_frac. Depth ~ 2 c d / D."""
    D = 2.0 * aperture_radius
    c = frame_width * coc_frac
    if D <= 0:
        return {"near": 0.0, "far": float("inf"), "depth": float("inf"), "coc": c}
    near = D * focus / (D + c)
    far = D * focus / (D - c) if D > c else float("inf")
    return {"near": near, "far": far, "depth": far - near, "coc": c}


def dof_plan(near, far, focal_mm, film_width_mm=36.0, coc_frac=COC_FRACTION, units_per_mm=0.1,
             max_f_number=MAX_F_NUMBER):
    """Focus distance and aperture radius that hold [near, far] sharp (distances along the view
    axis in scene units: view_depth_range of what MUST be sharp). With c = k d and
    k = film_width / focal x coc_frac, dof_zone gives 1/near = 1/d + k/D and 1/far = 1/d - k/D,
    so d = 2 near far / (near + far) and D = 2k / (1/near - 1/far) [added algebra].
    f-number = focal (scene units, units_per_mm 0.1 in a cm scene) / D. For the same framing a
    longer lens from further away gives the same depth [added optics]: what adds depth is less
    subject depth along the axis (turn the camera toward perpendicular to the plane that must be
    sharp), a wider frame, or a smaller aperture."""
    if not (0 < near < far):
        raise ValueError("need 0 < near < far")
    k = film_width_mm / float(focal_mm) * coc_frac
    d = 2.0 * near * far / (near + far)
    D = 2.0 * k / (1.0 / near - 1.0 / far)
    n = focal_mm * units_per_mm / D
    rep = {"focus_distance": d, "aperture_size": D / 2.0, "f_number": n, "depth_needed": far - near,
           "frame_width_at_focus": frame_width_at(d, focal_mm, film_width_mm), "holdable": n <= max_f_number,
           "cite": "LGT § Aperture Size (radius, world units); CoC 1/1200 frame width [added]"}
    if not rep["holdable"]:
        rep["note"] = ("needs f/%.0f, past f/%.0f: choose what must be sharp (the logo, the dial), turn the camera "
                       "toward perpendicular to it, or frame wider; a longer lens at the same framing does not help"
                       % (n, max_f_number))
    return rep


def f_number_to_aperture(f_number, focal_mm, units_per_mm=0.1):
    """Arnold aiApertureSize (radius, scene units) for a photographic f-number."""
    return focal_mm * units_per_mm / float(f_number) / 2.0


def dome_resolution_check(resolution, hdri_width=None, reflected=False):
    """Skydome resolution against the HDRI (LGT § Resolution: match the HDRI width for accurate
    reflections, lower is often fine, higher costs importance-table precompute; ARV-T 00:07:54:
    1k is enough for lighting, 4k max, 8k for very reflective scenes). Decider [added]:
    reflected = something mirror-like sees the dome (chrome, glass, a polished product)."""
    out = []
    if resolution is None:
        return out
    if reflected and hdri_width and resolution < min(hdri_width, 8192):
        out.append(_f("dome_resolution_reflected", "warn",
                      "dome resolution %d under the HDRI width %d while polished surfaces reflect it" % (resolution, hdri_width),
                      "LGT § Resolution: match the HDRI for accurate reflections; ARV-T 00:07:54 8k for very reflective scenes",
                      "resolution %d" % min(hdri_width, 8192), resolution, hdri_width))
    elif not reflected and resolution > 4096:
        out.append(_f("dome_resolution", "warn", "dome resolution %d for lighting only" % resolution,
                      "ARV-T 00:07:54 1k usually, 4k max", "1024 for lighting; keep the plate sharp separately", resolution, 4096))
    return out


def image_width(path):
    """Pixel width of an EXR, Radiance HDR or PNG from its header; other formats through PIL
    when present; None when unknown (for example a tiled .tx without PIL support)."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(65536)
    except OSError:
        return None
    if head[:4] == EXR_MAGIC:
        try:
            dw = parse_exr_header(head)["attrs"].get("dataWindow")
            return int(dw[1][2] - dw[1][0] + 1) if dw else None
        except Exception:
            return None
    if head[:2] == b"#?":
        m = re.search(rb"[-+]Y\s+(\d+)\s+[-+]X\s+(\d+)", head)
        return int(m.group(2)) if m else None
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">I", head[16:20])[0]
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size[0]
    except Exception:
        return None


# =========================================================================== rig planning (pure)
# (axis, azimuth, elevation, distance in head sizes, size in head sizes, stops vs key, shape)
# axis 'face' = measured from the face's forward direction on the upstage side, 'camera' = from
# the lens axis. Cited where a source gives the fact; every number without a cite is an
# [added] starting point from digest P2, tuned by render and measurement.
CHARACTER_ROLES = {
    "key": dict(axis="face", az=45.0, el=30.0, dist=8.0, size=1.0, stops=0.0, shape="quad",
                cite="Rembrandt about 45 deg, slightly above KT 00:11:15; upstage BR-B ch8.5; small source BR 00:27:59"),
    "wrap": dict(axis="face", az=15.0, el=10.0, dist=8.0, size=2.0, stops=-2.0, shape="quad",
                 cite="front-ish, lower, more saturated, twice the key's size BR 00:26:54 00:27:59; never from the lens axis BR 00:13:46"),
    "rim": dict(axis="camera", az=160.0, el=35.0, dist=8.0, size=0.7, stops=-0.5, shape="quad",
                cite="outlines the face, faces camera, camera dependent BR 00:27:59 BR 00:30:11; not equal to key BR-B ch6 Balance"),
    "top": dict(axis="camera", az=0.0, el=80.0, dist=6.0, size=3.0, stops=-1.5, shape="disk", optional=True,
                cite="soft support from above BR 00:30:43; environment support, drop for low-key looks BR-B ch8.5 Top light"),
}


def plan_character_rig(char, head_center, head_size, cam_pos, face_forward, roles=None, key_exposure=None,
                       up=UP_Y, target=1.0, include_top=True, lens_axis_min_deg=30.0):
    """Dramatic lights for one character, keyed to the FACE axis (Brejon's upstage key).
    Returns {'kind', 'name', 'target', 'upstage_side', 'lights': [...], 'checks': {...}}; each
    light has name, role, shape, position, direction (subject to light), size (w, h),
    exposure, light_group, angle_from_lens, screen_side, cite. Nothing touches Maya."""
    roles = dict(roles or CHARACTER_ROLES)
    if not include_top:
        roles.pop("top", None)
    to_cam = horizontal(v_sub(cam_pos, head_center), up)
    f = horizontal(face_forward, up)
    side = upstage_sign(f, to_cam, roles["key"]["az"], up)
    lights = []
    key_exp = None
    for role in ("key", "wrap", "rim", "top"):
        if role not in roles:
            continue
        r = roles[role]
        ref = f if r["axis"] == "face" else to_cam
        sgn = -side if role == "rim" else side
        az = r["az"]
        d = light_dir(ref, az * sgn, r["el"], up)
        steps = 0
        while role == "wrap" and v_angle(d, to_cam) < lens_axis_min_deg and steps < 40:
            steps += 1                     # no fill from the lens axis (BR 00:13:46): push to the key side
            d = light_dir(ref, (az + 5.0 * steps) * sgn, r["el"], up)
        dist = r["dist"] * head_size
        if role == "key":
            key_exp = key_exposure if key_exposure is not None else exposure_for_target(dist, target)
        size = r["size"] * head_size
        lights.append({
            "name": "lgt_%s_%s_01" % (role, char), "role": role, "shape": r["shape"],
            "position": v_add(head_center, v_mul(d, dist)), "direction": d, "distance": dist,
            "size": (size, size), "exposure": (key_exp if key_exp is not None else 0.0) + r["stops"],
            "light_group": "%s_%s" % (char, role), "angle_from_lens": v_angle(d, to_cam),
            "screen_side": screen_side(d, to_cam, up), "cite": r.get("cite", ""),
        })
    key = lights[0]
    checks = {"key_upstage": is_upstage(f, to_cam, key["direction"], up),
              "wrap_off_lens_axis": all(l["angle_from_lens"] >= lens_axis_min_deg - 1e-6
                                        for l in lights if l["role"] == "wrap"),
              "wrap_area_ratio": None}
    wraps = [l for l in lights if l["role"] == "wrap"]
    if wraps:
        checks["wrap_area_ratio"] = (wraps[0]["size"][0] * wraps[0]["size"][1]) / (key["size"][0] * key["size"][1])
    return {"kind": "character", "name": char, "target": tuple(head_center), "head_size": head_size,
            "camera": tuple(cam_pos), "face_forward": f, "upstage_side": side, "lights": lights,
            "checks": checks, "flags": []}


# Product roles: target normals in the product frame (F toward camera, U up, R screen right).
# A softbox is placed along the reflected view ray of a surface with that normal, so it appears
# IN the polished metal where the role says (ARV-C 00:36:21; JHILL 00:08:26 soft means large;
# JHILL 00:13:47 rims small and hot). Every coefficient and stop value is [added].
PRODUCT_ROLES = {
    "key": dict(normal=(0.45, 0.80, -0.40), dist=3.0, size=(2.0, 1.4), stops=0.0, shape="quad",
                cite="large soft source whose reflection shapes the upper planes; soft means large JHILL 00:08:26"),
    "strip_left": dict(normal=(0.35, 0.15, -1.0), dist=2.5, size=(0.35, 2.5), stops=-1.5, shape="quad",
                       cite="edge definition by softbox reflections (lookdev digest P9, ARV-C product lessons)"),
    "strip_right": dict(normal=(0.35, 0.15, 1.0), dist=2.5, size=(0.35, 2.5), stops=-1.9, shape="quad",
                        cite="asymmetric on purpose: symmetry only when the art direction is symmetric BR-B ch6 Planet 51"),
    "rim": dict(axis_az=155.0, el=25.0, dist=3.0, size=(0.6, 0.4), stops=-0.5, shape="quad",
                cite="separation from the background; small and hot JHILL 00:13:47; not equal to key BR-B ch6 Balance"),
    "grazer": dict(axis_az=-100.0, el=8.0, dist=6.0, size=(2.5, 0.8), stops=-2.0, shape="quad", optional=True,
                   cite="shape the set: no constant tone KT 00:10:11, large surfaces need variation BR-B ch8 Let's keep it simple"),
    "top": dict(normal=(0.0, 1.0, 0.0), dist=3.0, size=(2.5, 2.5), stops=-1.5, shape="disk", optional=True,
                cite="overhead soft support BR 00:30:43"),
}
PRODUCT_FLAGS = {
    "flag_upper_right": dict(normal=(0.5, 0.55, 0.65), dist=2.0, size=(1.2, 0.8),
                             cite="[added] black card reflected between the key and the right strip: polished steel reads as "
                                  "metal only with dark bands (photographic practice; experts: dark environment for contrast, "
                                  "lookdev digest P9)"),
}
FLOOR_CLEARANCE = 0.25        # sources and flags stay this many product sizes above the floor [added]


def _floor_level(bbox_min, bbox_max, up):
    """The product rests on the floor: the lowest bbox corner along up."""
    u = v_norm(up)
    return min(v_dot((x, y, z), u) for x in (bbox_min[0], bbox_max[0]) for y in (bbox_min[1], bbox_max[1])
               for z in (bbox_min[2], bbox_max[2]))


def _reflect_above_floor(center, radius, coeffs, frame, cam_pos, dist, floor, clearance):
    """Reflection placement for a target normal given in the product frame; when the source
    would sit under the floor (a camera looking down sees the floor in near-vertical planes),
    tilt the target normal up in 0.1 steps until it clears [added]. Returns (pos, d, point, n,
    boost) or None."""
    F, U, R = frame
    a, b, c = coeffs
    for k in range(0, 31):
        boost = 0.1 * k
        n = v_norm(v_add(v_add(v_mul(F, a), v_mul(U, b + boost)), v_mul(R, c)))
        point = v_add(center, v_mul(n, radius))
        pos, d = reflection_placement(point, n, cam_pos, dist)
        if pos is not None and v_dot(pos, U) >= floor + clearance:
            return pos, d, point, n, boost
    return None


def product_frame(cam_pos, center, front=None, up=UP_Y):
    """(F, U, R): F horizontal toward the camera (or `front`), U up, R screen right."""
    u = v_norm(up)
    f = horizontal(front if front is not None else v_sub(cam_pos, center), u)
    r = v_cross(u, f)
    return f, u, r


def plan_product_rig(name, bbox_min, bbox_max, cam_pos, front=None, up=UP_Y, roles=None, flags=None,
                     key_exposure=None, target=1.0, style="dark", include=("key", "strip_left", "strip_right", "rim")):
    """Studio rig for a product hero still, keyed to the PRODUCT axis: softboxes placed by
    reflection geometry so their highlights land on chosen planes, a small rim for separation,
    optional set grazer and top, black flags for the 'dark' style, and a dome at low exposure
    invisible to camera (JHILL 00:53:38 camera 0 for a black background; ARV-L 00:11:53 a low
    ambient only to avoid pure blacks). Sizes and distances scale with the product size. The
    floor is the lowest bbox corner: a source whose reflected position would put any part of it
    under the floor gets its target plane tilted up until it clears (plan['notes'] says so).
    Returns the same structure as plan_character_rig."""
    roles = dict(roles or PRODUCT_ROLES)
    flags = dict(PRODUCT_FLAGS if flags is None else flags)
    center = tuple((bbox_min[i] + bbox_max[i]) / 2.0 for i in range(3))
    size = max(bbox_max[i] - bbox_min[i] for i in range(3))
    radius = 0.5 * math.sqrt(sum((bbox_max[i] - bbox_min[i]) ** 2 for i in range(3)))
    F, U, R = product_frame(cam_pos, center, front, up)
    to_cam = F
    floor = _floor_level(bbox_min, bbox_max, U)
    clear = FLOOR_CLEARANCE * size
    lights, notes = [], []
    key_exp = None
    for role in include:
        if role not in roles:
            continue
        r = roles[role]
        dist = r["dist"] * size
        if "normal" in r:
            # the whole source clears the floor: its center at least half its height above it [added]
            role_clear = max(clear, 0.5 * r["size"][1] * size)
            hit = _reflect_above_floor(center, radius, r["normal"], (F, U, R), cam_pos, dist, floor, role_clear)
            if hit is None:
                notes.append("%s: no target plane in reach reflects a source above the floor; placed above along the normal" % role)
                n = v_norm(v_add(v_add(v_mul(F, r["normal"][0]), v_mul(U, r["normal"][1] + 1.0)), v_mul(R, r["normal"][2])))
                point = v_add(center, v_mul(n, radius))
                pos = v_add(point, v_mul(n, dist))
            else:
                pos, d, point, n, boost = hit
                if boost > 0:
                    notes.append("%s: target normal tilted up by %.1f so the source clears the floor" % (role, boost))
            aim_at = point
        else:
            d = light_dir(F, r["axis_az"], r["el"], U)
            pos = v_add(center, v_mul(d, dist))
            aim_at = center
        if key_exp is None:
            key_exp = key_exposure if key_exposure is not None else exposure_for_target(dist, target)
        w, h = r["size"]
        lights.append({"name": "lgt_%s_%s_01" % (role, name), "role": role, "shape": r["shape"],
                       "position": pos, "direction": v_norm(v_sub(pos, aim_at)), "aim_at": aim_at,
                       "distance": v_len(v_sub(pos, aim_at)), "size": (w * size, h * size),
                       "exposure": key_exp + r["stops"], "light_group": "%s_%s" % (name, role),
                       "angle_from_lens": v_angle(v_sub(pos, center), to_cam),
                       "screen_side": screen_side(v_sub(pos, center), to_cam, U), "cite": r.get("cite", "")})
    lights.append({"name": "lgt_dome_%s_01" % name, "role": "dome", "shape": "dome", "position": center,
                   "direction": U, "size": (0.0, 0.0), "exposure": math.log2(target) - 6.0,
                   "light_group": "%s_dome" % name, "camera_visibility": 0.0, "resolution": 1024,
                   "cite": "low fill, invisible to camera JHILL 00:53:38; HDRI 1k is enough for lighting ARV-T 00:07:54 [added level]"})
    fl = []
    if style == "dark":
        for fname, spec in flags.items():
            hit = _reflect_above_floor(center, radius, spec["normal"], (F, U, R), cam_pos, spec["dist"] * size, floor, clear)
            if hit is None:
                notes.append("%s: no placement above the floor; skipped" % fname)
                continue
            pos, d, point, n, boost = hit
            # flags are camera-invisible and cast no shadow (make_flag), so they may sit behind the
            # product in frame; they only exist in reflections
            fl.append({"name": "%s_%s" % (fname, name), "position": pos, "facing": v_mul(d, -1.0),
                       "size": (spec["size"][0] * size, spec["size"][1] * size), "cite": spec["cite"]})
    groups = sorted(set(l["light_group"] for l in lights))
    return {"kind": "product", "name": name, "target": center, "size": size, "camera": tuple(cam_pos),
            "frame": {"F": F, "U": U, "R": R}, "lights": lights, "flags": fl, "notes": notes,
            "checks": {"light_groups": len(groups), "groups_ok": len(groups) <= MAX_LIGHT_GROUPS}}


def rig_plan_checks(plan):
    """Findings on a plan (pure): the rules a lead would apply before any render."""
    out = []
    lights = plan.get("lights", [])
    roles = [l["role"] for l in lights]
    if plan.get("kind") == "character":
        out.append(_f("key_upstage", "pass" if plan["checks"]["key_upstage"] else "fail",
                      "key on the far side of the face from the camera" if plan["checks"]["key_upstage"]
                      else "key is downstage (near side of the face)", "BR-B ch8.5 Lighting upstage and downstage",
                      "rotate the key to the other side of the face axis"))
        out.append(_f("wrap_lens_axis", "pass" if plan["checks"]["wrap_off_lens_axis"] else "fail",
                      "wrap within 30 deg of the lens axis" if not plan["checks"]["wrap_off_lens_axis"]
                      else "no fill from the lens axis", "BR 00:13:46", "push the wrap toward the key side"))
        ratio = plan["checks"].get("wrap_area_ratio")
        if ratio is not None:
            out.append(_f("wrap_size", "pass" if ratio >= 1.9 else "warn", "wrap/key area %.2f" % ratio,
                          "BR 00:27:59 wrap twice bigger than the key", "enlarge the wrap"))
    if roles.count("key") != 1:
        out.append(_f("one_key", "fail", "%d key lights in the plan" % roles.count("key"),
                      "BR-B ch6 Balance: one light stands above", "keep one key per subject"))
    groups = set(l["light_group"] for l in lights)
    out.append(_f("group_count", "pass" if len(groups) <= MAX_LIGHT_GROUPS else "fail",
                  "%d light groups" % len(groups), "AOV § Light Group Example: at most 16", "bundle lights by role"))
    return out


# =========================================================================== sampling and budget
IPR_DEFAULTS = dict(AASamples=3, GIDiffuseSamples=2, GISpecularSamples=2, GITransmissionSamples=2, GISssSamples=2)
PRESETS = {
    # SMP § Using AOVs to Identify Noise (IPR defaults); adaptive off in previews (SMP § Adaptive/Progressive and IPR)
    "preview": dict(AASamples=3, GIDiffuseSamples=2, GISpecularSamples=2, GITransmissionSamples=2, GISssSamples=2,
                    enableAdaptiveSampling=0, GIDiffuseDepth=1, GISpecularDepth=1),
    # blocking pass: Sarkamari tests at half resolution with low samples (SARK 00:07:52) [added values]
    "block": dict(AASamples=2, GIDiffuseSamples=1, GISpecularSamples=1, GITransmissionSamples=1, GISssSamples=1,
                  enableAdaptiveSampling=0, GIDiffuseDepth=1, GISpecularDepth=1),
    # a final starting point: adaptive with Max AA 20, threshold 0.015 (SMP § Adaptive Sampling) [added mix]
    "final": dict(AASamples=4, enableAdaptiveSampling=1, AASamplesMax=20, AAAdaptiveThreshold=0.015,
                  GIDiffuseSamples=2, GISpecularSamples=2, GITransmissionSamples=3, GISssSamples=2),
    # motion blur or DOF over the whole frame: Arvid's fixed-AA route (ARV-T 00:20:29)
    "blur_fixed": dict(AASamples=12, enableAdaptiveSampling=0, GIDiffuseSamples=1, GISpecularSamples=1,
                       GITransmissionSamples=1, GISssSamples=1),
    # interiors (SMP § Denoising a Room Interior; ARV-T 00:05:59)
    "interior_depth": dict(GIDiffuseDepth=4, GISpecularDepth=2),
    # Sarkamari's toy product final (SARK 00:08:27)
    "product_sarkamari": dict(AASamples=8, GIDiffuseSamples=2, GISpecularSamples=2, GIDiffuseDepth=2),
}
SAMPLERS = (("diffuse", "GIDiffuseSamples"), ("specular", "GISpecularSamples"),
            ("transmission", "GITransmissionSamples"), ("sss", "GISssSamples"), ("volume", "GIVolumeSamples"))


def rays_per_pixel(settings, light_samples=None):
    """Rays per pixel at the first hit for each sampler: AA^2 x samples^2 (SMP § Camera (AA):
    AA 6 with specular 6 = 1296). Global Light Sampling: one count per camera sample; whether
    it is squared is not documented, so the light figure is AA^2 x L, flagged approximate."""
    aa = int(settings.get("AASamples", IPR_DEFAULTS["AASamples"]))
    out = {"camera": aa * aa}
    for key, attr in SAMPLERS:
        n = settings.get(attr)
        if n is None:
            n = IPR_DEFAULTS.get(attr, 0)
        out[key] = aa * aa * int(n) * int(n)
    if light_samples is not None:
        out["light_gls_approx"] = aa * aa * int(light_samples)
    out["total_secondary"] = sum(v for k, v in out.items() if k in dict(SAMPLERS))
    return out


def settings_lint(s, scene="product", glass_interfaces=0, metal_interreflection=False, motion_blur=False,
                  dof=False, cpu=True, preview=False, light_samples=None, denoise=True, pixel_filter=None,
                  region=False, platform=None):
    """Render-settings findings from the sources (pure; `s` holds defaultArnoldRenderOptions
    values by attribute name or logical key: autotx, use_existing_tx, device). scene: product |
    exterior | interior | character. pixel_filter: the filter type; region: a render region is
    set; platform: sys.platform by default (GPU check)."""
    out = []
    aa = s.get("AASamples", 3)
    secondaries = {a: s.get(a) for _, a in SAMPLERS if s.get(a) is not None}
    if aa >= 6 and any(v >= 3 for v in secondaries.values()):
        out.append(_f("aa_times_secondary", "warn", "AA %s with secondary samples %s" % (aa, secondaries),
                      "samples are squared and multiplied by AA^2 (SMP § Camera (AA)); drop them when AA rises ARV-T 00:07:12",
                      "lower the secondary samples or AA; rays per pixel: %s" % rays_per_pixel(s)))
    ad = s.get("enableAdaptiveSampling")
    if ad:
        if aa < 2 or s.get("AASamplesMax", 20) <= aa:
            out.append(_f("adaptive_inert", "warn", "adaptive on with AA %s, Max AA %s" % (aa, s.get("AASamplesMax")),
                          "adaptive needs AA >= 2 and Max AA > AA (SMP § Max. Camera (AA))", "raise Max AA or AA"))
        if preview:
            out.append(_f("adaptive_preview", "warn", "adaptive on in a preview", "SMP § Adaptive/Progressive and IPR",
                          "turn adaptive off for low-AA passes"))
    if (motion_blur or dof) and aa < 8 and not ad:
        out.append(_f("blur_needs_aa", "warn", "motion blur or DOF at AA %s without adaptive" % aa,
                      "blur and DOF noise is camera-ray noise: only AA or adaptive fixes it (SMP § Motion Blur and DOF; ARV-T 00:19:56)",
                      "AA about 12 (motion blur) to 20 (strong DOF) with secondaries at 1, or adaptive"))
    if light_samples is not None:
        if light_samples == 0:
            out.append(_f("gls_off", "info", "global light samples 0", "SMP § Best setting: 0 or 1 when a skydome or distant light dominates",
                          "confirm the scene is dome or distant dominated"))
        elif cpu and light_samples > 4:
            out.append(_f("gls_high", "warn", "global light samples %s on CPU" % light_samples,
                          "SMP § Best setting for light samples: 4 or fewer on CPU", "back to 4; fix residual noise with AA or adaptive"))
    dd, sd = s.get("GIDiffuseDepth"), s.get("GISpecularDepth")
    if dd is not None:
        if scene in ("product", "exterior", "character") and dd > 2:
            out.append(_f("diffuse_depth", "info", "diffuse depth %s in a %s scene" % (dd, scene),
                          "exterior or product 1 to 2, interiors 3 to 4; A/B the next value up (ARV-T 00:05:59; SARK 00:08:27)",
                          "render depth-1 A/B and keep the lower if equal"))
        if scene == "interior" and dd < 3:
            out.append(_f("diffuse_depth_interior", "warn", "interior with diffuse depth %s" % dd,
                          "SMP § Denoising a Room Interior (final depth 4)", "raise to 3 or 4"))
    if sd is not None and sd > 2 and not (glass_interfaces or metal_interreflection):
        out.append(_f("specular_depth", "warn", "specular depth %s without glass or inter-reflecting metal" % sd,
                      "never above 2 unless glass panes or inter-reflecting metal ARV-T 00:05:59", "lower to 2"))
    td = s.get("GITransmissionDepth")
    if glass_interfaces and td is not None and td < glass_interfaces:
        out.append(_f("transmission_depth", "fail", "transmission depth %s < %s interfaces" % (td, glass_interfaces),
                      "count the interfaces a camera ray crosses in the hero area (SMP § Ray Depth)",
                      "raise transmission depth to at least %d" % glass_interfaces))
    if s.get("use_sample_clamp") and s.get("AASampleClamp") is not None and s["AASampleClamp"] < 10:
        out.append(_f("pixel_clamp_low", "warn", "AA clamp %s" % s["AASampleClamp"],
                      "low clamps remove dynamic range and desaturate blooms (SMP § Clamping; BRJ-CM Ch.9); studios clamp at 30 to 50 BRJ-CM Ch.1 Range",
                      "fix fireflies at the source first"))
    if s.get("indirectSampleClamp") is not None and 0 < s["indirectSampleClamp"] < 10:
        out.append(_f("indirect_clamp_low", "warn", "indirect clamp %s" % s["indirectSampleClamp"],
                      "Brejon never went below 10 (BRJ-CM Ch.1 Range)", "raise to 10 or more"))
    if denoise and pixel_filter and "box" not in str(pixel_filter).lower():
        out.append(_f("denoiser_box_filter", "info", "pixel filter %s with a denoiser on: the denoiser forces a box filter" % pixel_filter,
                      "AOV § Imager Denoiser OIDN, Note (box filter, full frames)",
                      "judge filter softness with the denoiser off; render the detail_loss reference with a box filter too"))
    if denoise and region:
        out.append(_f("denoiser_region", "warn", "render region set with a denoiser on",
                      "AOV § Imager Denoiser OIDN, Note: denoisers work on full frames, not buckets",
                      "judge denoised detail on crops cut from a full denoised frame [added]"))
    if not preview:
        if s.get("autotx"):
            out.append(_f("autotx_on", "info", "auto-convert to TX on: every machine converts textures at the first render",
                          "ARV-T 00:14:13 00:14:44; RAYC 00:13:04", "pre-bake with TX Manager or maketx, then auto-TX off"))
        if s.get("use_existing_tx") is not None and not s["use_existing_tx"]:
            out.append(_f("use_existing_tx_off", "warn", "Use Existing TX off: pre-baked .tx files are ignored",
                          "ARV-T 00:14:44 (texture_use_existing_tx)", "use_existing_tx 1 for batch"))
    dev = s.get("device")
    if (platform or sys.platform) == "darwin" and dev not in (None, 0, "CPU", "cpu"):
        out.append(_f("gpu_on_macos", "fail", "render device %s on macOS" % dev,
                      "LGT § Can I use Arnold GPU on macOS? (no: OptiX and NVIDIA drivers); OptiX denoiser neither",
                      "render device CPU; OIDN for denoising"))
    return out


def extrapolate_time(test_seconds, test_size, target_size, test_aa=None, target_aa=None, adaptive=False):
    """Predicted seconds for the target from a test render [added rule of thumb from the
    Arnold digest: fixed sampling grows with pixels x AA^2; adaptive and GLS break it, so re-time
    one full frame before launching a sequence]."""
    px = (target_size[0] * target_size[1]) / float(test_size[0] * test_size[1])
    t = test_seconds * px
    note = "pixels x%.2f" % px
    if test_aa and target_aa and not adaptive:
        f = (target_aa / float(test_aa)) ** 2
        t *= f
        note += ", AA^2 x%.2f" % f
    elif adaptive:
        note += "; adaptive: AA factor unknown, re-time one full frame"
    return {"seconds": t, "note": note}


def sequence_budget(seconds_per_frame, frames, machines=1, hours_available=None, overhead=1.1):
    """Farm arithmetic for a sequence; overhead covers scene load and TX [added factor]."""
    total_h = seconds_per_frame * frames * overhead / 3600.0
    wall_h = total_h / max(1, machines)
    rep = {"frames": frames, "machine_hours": round(total_h, 3), "wall_hours": round(wall_h, 3)}
    if hours_available is not None:
        rep["fits"] = wall_h <= hours_available
        rep["max_seconds_per_frame"] = round(hours_available * 3600.0 * max(1, machines) / (frames * overhead), 1)
    return rep


TIME_SINKS = ("emissive geometry used as a light (LGT § Mesh Light vs Emission: 5:36 vs 0:09)",
              "HDRI above 4k for lighting (ARV-T 00:07:54)", "missing .tx or auto-TX on a farm (ARV-T 00:14:13)",
              "ray depth above what the A/B shows (ARV-T 00:05:59)", "mesh lights where an area light fits (ARV-T 00:10:51)",
              "atmosphere volume step size too small (SMP § Step Size)", "adaptive left on in previews (SMP)",
              "textures and caches on a slow drive (ARV-T 00:09:42)")


# =========================================================================== EXR IO (pure numpy)
EXR_MAGIC = b"\x76\x2f\x31\x01"
EXR_COMPRESSION = {0: "none", 1: "rle", 2: "zips", 3: "zip", 4: "piz", 5: "pxr24", 6: "b44", 7: "b44a",
                   8: "dwaa", 9: "dwab"}
_COMP_BY_NAME = {v: k for k, v in EXR_COMPRESSION.items()}
_LINES_PER_BLOCK = {0: 1, 1: 1, 2: 1, 3: 16, 4: 32, 5: 16, 6: 32, 7: 32, 8: 32, 9: 256}
_PIXEL = {0: ("<u4", 4), 1: ("<f2", 2), 2: ("<f4", 4)}
_COMP_ORDER = {"R": 0, "G": 1, "B": 2, "A": 3, "X": 0, "Y": 1, "Z": 2, "U": 0, "V": 1}


class ExrError(RuntimeError):
    pass


class ExrImage(object):
    """Channels of a single-part EXR as float32 HxW arrays, top row first."""

    def __init__(self, channels, header, path=None, reader="pure"):
        self.channels = channels
        self.header = header
        self.path = path
        self.reader = reader
        any_ch = next(iter(channels.values())) if channels else None
        self.height, self.width = (any_ch.shape if any_ch is not None else (0, 0))

    def layers(self):
        """{layer: [channel names in component order]}. Beauty R G B A is layer 'RGBA'; when the
        file also has RGBA.R-style channels (an explicit RGBA AOV), the bare ones become 'beauty'."""
        out = {}
        dotted_rgba = any(ch.startswith("RGBA.") for ch in self.channels)
        for ch in self.channels:
            lay, _, comp = ch.rpartition(".")
            if not lay:
                lay = ("beauty" if dotted_rgba else "RGBA") if ch in ("R", "G", "B", "A") else ch
            out.setdefault(lay, []).append(ch)
        for lay, chs in out.items():
            chs.sort(key=lambda c: _COMP_ORDER.get(c.rpartition(".")[2], 9))
        return out

    def has(self, layer):
        return layer in self.layers()

    def layer(self, name, rgb=False):
        """HxWxC (or HxW for one channel). rgb=True returns HxWx3 (gray replicated, alpha dropped)."""
        np = _np()
        chs = self.layers().get(name)
        if not chs:
            raise KeyError("no layer %r in %s (layers: %s)" % (name, self.path, sorted(self.layers())))
        arrs = [self.channels[c] for c in chs]
        if rgb:
            if len(arrs) == 1:
                return np.stack([arrs[0]] * 3, axis=-1)
            return np.stack(arrs[:3], axis=-1)
        return arrs[0] if len(arrs) == 1 else np.stack(arrs, axis=-1)

    def alpha(self):
        lay = self.layers().get("RGBA", [])
        a = [c for c in lay if c.rpartition(".")[2] == "A"]
        return self.channels[a[0]] if a else None


def _cstr(buf, pos):
    end = buf.index(b"\0", pos)
    return buf[pos:end].decode("latin-1"), end + 1


def _parse_attr(atype, val):
    if atype == "chlist":
        chans, p = [], 0
        while p < len(val) and val[p:p + 1] != b"\0":
            name, p = _cstr(val, p)
            ptype, plin = struct.unpack("<iB", val[p:p + 5])
            xs, ys = struct.unpack("<ii", val[p + 8:p + 16])
            chans.append((name, ptype, plin, xs, ys))
            p += 16
        return chans
    if atype == "box2i":
        return struct.unpack("<iiii", val[:16])
    if atype in ("compression", "lineOrder", "envmap", "deepImageState"):
        return val[0]
    if atype == "float":
        return struct.unpack("<f", val[:4])[0]
    if atype == "double":
        return struct.unpack("<d", val[:8])[0]
    if atype == "int":
        return struct.unpack("<i", val[:4])[0]
    if atype == "v2f":
        return struct.unpack("<ff", val[:8])
    if atype == "v2i":
        return struct.unpack("<ii", val[:8])
    if atype == "string":
        return val.decode("latin-1", "replace")
    if atype == "tiledesc":
        return struct.unpack("<IIB", val[:9])
    return val


def parse_exr_header(buf):
    """Header of a single-part EXR: flags, attributes, the byte offset where it ends."""
    if buf[:4] != EXR_MAGIC:
        raise ExrError("not an OpenEXR file")
    version = struct.unpack("<I", buf[4:8])[0]
    hdr = {"version": version & 0xFF, "tiled": bool(version & 0x200), "long_names": bool(version & 0x400),
           "deep": bool(version & 0x800), "multipart": bool(version & 0x1000), "attrs": {}}
    if hdr["multipart"] or hdr["deep"]:
        hdr["header_end"] = None
        return hdr
    pos = 8
    while True:
        name, pos = _cstr(buf, pos)
        if not name:
            break
        atype, pos = _cstr(buf, pos)
        size = struct.unpack("<i", buf[pos:pos + 4])[0]
        pos += 4
        hdr["attrs"][name] = (atype, _parse_attr(atype, buf[pos:pos + size]))
        pos += size
    hdr["header_end"] = pos
    return hdr


def _unpredict(data):
    """OpenEXR ZIP/RLE post-process: undo the delta predictor, then the byte interleave."""
    np = _np()
    t = np.frombuffer(data, np.uint8).astype(np.int64)
    if t.size == 0:
        return b""
    t[1:] -= 128
    t = np.cumsum(t) & 0xFF
    n = t.size
    h = (n + 1) // 2
    out = np.empty(n, np.uint8)
    out[0::2] = t[:h]
    out[1::2] = t[h:]
    return out.tobytes()


def _predict(raw):
    np = _np()
    a = np.frombuffer(raw, np.uint8)
    n = a.size
    if n == 0:
        return b""
    h = (n + 1) // 2
    t = np.empty(n, np.uint8)
    t[:h] = a[0::2]
    t[h:] = a[1::2]
    d = t.astype(np.int64)
    out = d.copy()
    out[1:] = (d[1:] - d[:-1] + 384) & 0xFF
    return out.astype(np.uint8).tobytes()


def _rle_decode(data, expected):
    out = bytearray()
    i, n = 0, len(data)
    while i < n:
        c = struct.unpack("b", data[i:i + 1])[0]
        i += 1
        if c < 0:
            out += data[i:i - c]
            i += -c
        else:
            out += data[i:i + 1] * (c + 1)
            i += 1
    if len(out) != expected:
        raise ExrError("RLE block decoded to %d bytes, expected %d" % (len(out), expected))
    return bytes(out)


def _rle_encode(data):
    out = bytearray()
    i, n = 0, len(data)
    while i < n:
        j = i
        while j + 1 < n and data[j + 1] == data[i] and j + 1 - i < 127:
            j += 1
        run = j - i + 1
        if run >= 3:
            out += struct.pack("b", run - 1) + data[i:i + 1]
            i = j + 1
            continue
        k = i
        while k < n and k - i < 127:
            if k + 2 < n and data[k] == data[k + 1] == data[k + 2]:
                break
            k += 1
        k = max(k, i + 1)
        out += struct.pack("b", -(k - i)) + data[i:k]
        i = k
    return bytes(out)


def _decompress(data, comp, expected):
    if comp == 0 or len(data) == expected:        # blocks that did not shrink are stored raw
        return data
    if comp == 1:
        return _unpredict(_rle_decode(data, expected))
    if comp in (2, 3):
        raw = zlib.decompress(data)
        if len(raw) != expected:
            raise ExrError("ZIP block decoded to %d bytes, expected %d" % (len(raw), expected))
        return _unpredict(raw)
    raise ExrError("compression %s not supported by the pure reader" % EXR_COMPRESSION.get(comp, comp))


def _compress(raw, comp):
    if comp == 0:
        return raw
    pre = _predict(raw)
    if comp == 1:
        packed = _rle_encode(pre)
    elif comp in (2, 3):
        packed = zlib.compress(pre, 6)
    else:
        raise ExrError("writer supports none, rle, zips, zip")
    return packed if len(packed) < len(raw) else raw


def read_exr(path, channels=None):
    """Read a single-part scanline or one-level tiled EXR (none, rle, zips, zip; half, float,
    uint) into an ExrImage. Other compressions go through OpenImageIO when importable, else the
    error says to set the Arnold driver to zip (setup_exr_driver does). Multipart EXRs are
    refused: noice refuses them too (AOV § Multipart)."""
    np = _np()
    with open(path, "rb") as f:
        buf = f.read()
    hdr = parse_exr_header(buf)
    if hdr["multipart"] or hdr["deep"]:
        return _read_exr_oiio(path, "multipart or deep EXR")
    a = dict((k, v[1]) for k, v in hdr["attrs"].items())
    comp = a.get("compression", 0)
    if comp not in (0, 1, 2, 3):
        return _read_exr_oiio(path, "compression %s" % EXR_COMPRESSION.get(comp, comp))
    chl = a["channels"]
    xmin, ymin, xmax, ymax = a["dataWindow"]
    w, h = xmax - xmin + 1, ymax - ymin + 1
    for (name, pt, _, xs, ys) in chl:
        if xs != 1 or ys != 1:
            raise ExrError("subsampled channel %s not supported" % name)
    bpp_line = sum(_PIXEL[c[1]][1] for c in chl)
    out = dict((c[0], np.zeros((h, w), np.float32)) for c in chl)
    pos = hdr["header_end"]
    if hdr["tiled"]:
        tx, ty, mode = a["tiles"]
        if mode & 0x0F != 0:
            raise ExrError("mipmapped or ripmapped EXR (a texture?) not supported")
        ntx, nty = (w + tx - 1) // tx, (h + ty - 1) // ty
        offsets = struct.unpack("<%dQ" % (ntx * nty), buf[pos:pos + 8 * ntx * nty])
        for off in offsets:
            ix, iy, lx, ly, size = struct.unpack("<iiiii", buf[off:off + 20])
            x0, y0 = ix * tx, iy * ty
            tw, th = min(tx, w - x0), min(ty, h - y0)
            raw = _decompress(buf[off + 20:off + 20 + size], comp, th * tw * bpp_line)
            p = 0
            for li in range(th):
                for (name, pt, _, _, _) in chl:
                    dt, bpp = _PIXEL[pt]
                    out[name][y0 + li, x0:x0 + tw] = np.frombuffer(raw, dt, count=tw, offset=p)
                    p += tw * bpp
    else:
        lpb = _LINES_PER_BLOCK[comp]
        nb = (h + lpb - 1) // lpb
        offsets = struct.unpack("<%dQ" % nb, buf[pos:pos + 8 * nb])
        for off in offsets:
            y, size = struct.unpack("<ii", buf[off:off + 8])
            nl = min(lpb, ymax - y + 1)
            raw = _decompress(buf[off + 8:off + 8 + size], comp, nl * w * bpp_line)
            p = 0
            for li in range(nl):
                row = y - ymin + li
                for (name, pt, _, _, _) in chl:
                    dt, bpp = _PIXEL[pt]
                    out[name][row] = np.frombuffer(raw, dt, count=w, offset=p)
                    p += w * bpp
    if channels:
        out = dict((k, v) for k, v in out.items() if k in channels or k.rpartition(".")[0] in channels)
    hdr["compression_name"] = EXR_COMPRESSION.get(comp, comp)
    hdr["pixel_types"] = sorted(set({0: "uint", 1: "half", 2: "float"}[c[1]] for c in chl))
    return ExrImage(out, hdr, path, "pure")


def _read_exr_oiio(path, why):
    np = _np()
    try:
        import OpenImageIO as oiio
    except ImportError:
        raise ExrError("%s: %s is not readable by the pure reader and OpenImageIO is not importable; "
                       "render with setup_exr_driver(compression='zip', multipart=False)" % (path, why))
    inp = oiio.ImageInput.open(path)
    if not inp:
        raise ExrError("OpenImageIO cannot open %s" % path)
    spec = inp.spec()
    px = inp.read_image(format="float")
    inp.close()
    chans = dict((name, np.asarray(px[..., i], np.float32)) for i, name in enumerate(spec.channelnames))
    return ExrImage(chans, {"reader": "oiio", "why": why}, path, "oiio")


def _channel_names(layer, ncomp):
    if layer == "RGBA":
        return ["R", "G", "B", "A"][:ncomp] if ncomp > 1 else ["Y"]
    if ncomp == 1:
        return [layer]
    comps = ("X", "Y", "Z") if layer in ("N", "P", "Pref", "motionvector") else ("R", "G", "B", "A")
    return ["%s.%s" % (layer, c) for c in comps[:ncomp]]


def write_exr(path, layers, compression="zip", half=True, float_layers=("Z", "P", "N"), tile=None):
    """Write layers ({name: HxW or HxWxC array}) to a single-part EXR. 'RGBA' becomes R G B A;
    other layers name.R/G/B/A (N and P use X Y Z); one-channel layers keep their name. Half by
    default, float for Z, P, N (BRJ-CM Ch.1 Format). Used by the tests and for comp-ready
    rebuilds; compression none, rle, zips or zip; tile=(tx, ty) writes a one-level tiled file."""
    np = _np()
    comp = _COMP_BY_NAME[compression] if isinstance(compression, str) else int(compression)
    chans = []
    shape = None
    for lay, arr in layers.items():
        arr = np.asarray(arr, np.float32)
        if arr.ndim == 2:
            arr = arr[..., None]
        shape = shape or arr.shape[:2]
        if arr.shape[:2] != shape:
            raise ValueError("layer %s has shape %s, expected %s" % (lay, arr.shape[:2], shape))
        pt = 2 if (not half or lay in float_layers) else 1
        for i, nm in enumerate(_channel_names(lay, arr.shape[2])):
            chans.append((nm, pt, arr[..., i]))
    chans.sort(key=lambda c: c[0])
    h, w = shape

    def attr(name, atype, payload):
        return name.encode() + b"\0" + atype.encode() + b"\0" + struct.pack("<i", len(payload)) + payload

    chl = b"".join(nm.encode() + b"\0" + struct.pack("<iB3xii", pt, 0, 1, 1) for nm, pt, _ in chans) + b"\0"
    head = EXR_MAGIC + struct.pack("<I", 2 | (0x200 if tile else 0))
    head += attr("channels", "chlist", chl)
    head += attr("compression", "compression", bytes([comp]))
    head += attr("dataWindow", "box2i", struct.pack("<iiii", 0, 0, w - 1, h - 1))
    head += attr("displayWindow", "box2i", struct.pack("<iiii", 0, 0, w - 1, h - 1))
    head += attr("lineOrder", "lineOrder", b"\0")
    head += attr("pixelAspectRatio", "float", struct.pack("<f", 1.0))
    head += attr("screenWindowCenter", "v2f", struct.pack("<ff", 0.0, 0.0))
    head += attr("screenWindowWidth", "float", struct.pack("<f", 1.0))
    if tile:
        head += attr("tiles", "tiledesc", struct.pack("<IIB", tile[0], tile[1], 0))
    head += b"\0"
    typed = [(nm, arr.astype("<f2" if pt == 1 else "<f4")) for nm, pt, arr in chans]
    blocks = []
    if tile:
        tx, ty = tile
        for iy in range(0, h, ty):
            for ix in range(0, w, tx):
                parts = []
                for y in range(iy, min(iy + ty, h)):
                    for _, arr in typed:
                        parts.append(arr[y, ix:min(ix + tx, w)].tobytes())
                data = _compress(b"".join(parts), comp)
                blocks.append(struct.pack("<iiiii", ix // tx, iy // ty, 0, 0, len(data)) + data)
    else:
        lpb = _LINES_PER_BLOCK[comp]
        for y0 in range(0, h, lpb):
            parts = []
            for y in range(y0, min(y0 + lpb, h)):
                for _, arr in typed:
                    parts.append(arr[y].tobytes())
            data = _compress(b"".join(parts), comp)
            blocks.append(struct.pack("<ii", y0, len(data)) + data)
    table_len = 8 * len(blocks)
    offsets, pos = [], len(head) + table_len
    for b in blocks:
        offsets.append(pos)
        pos += len(b)
    with open(path, "wb") as f:
        f.write(head + struct.pack("<%dQ" % len(blocks), *offsets) + b"".join(blocks))
    return path


def exr_info(path):
    """Header summary: size, compression, tiled, layers, pixel types."""
    with open(path, "rb") as f:
        head = f.read(1 << 20)
    hdr = parse_exr_header(head)
    a = dict((k, v[1]) for k, v in hdr["attrs"].items())
    info = {"multipart": hdr["multipart"], "deep": hdr["deep"], "tiled": hdr["tiled"]}
    if "dataWindow" in a:
        x0, y0, x1, y1 = a["dataWindow"]
        info.update(width=x1 - x0 + 1, height=y1 - y0 + 1)
    if "compression" in a:
        info["compression"] = EXR_COMPRESSION.get(a["compression"], a["compression"])
    if "channels" in a:
        names = [c[0] for c in a["channels"]]
        info["channels"] = names
        info["pixel_types"] = sorted(set({0: "uint", 1: "half", 2: "float"}.get(c[1], c[1]) for c in a["channels"]))
        lays = {}
        for n in names:
            lay = n.rpartition(".")[0] or ("RGBA" if n in ("R", "G", "B", "A") else n)
            lays.setdefault(lay, 0)
            lays[lay] += 1
        info["layers"] = lays
    return info


# =========================================================================== image helpers (numpy)
def load_display(path):
    """(rgb HxWx3 in 0..1, alpha HxW) from an 8-bit PNG/JPG/TIF: display-referred pixels."""
    np = _np()
    try:
        from PIL import Image
        with Image.open(path) as im:
            a = np.asarray(im.convert("RGBA"), dtype=np.float32) / 255.0
    except ImportError:
        w, h, d = _mxr().read_rgba(path)
        a = np.frombuffer(d, np.uint8).reshape(h, w, 4).astype(np.float32) / 255.0
    return a[..., :3], a[..., 3]


def save_display(path, rgb, alpha=None):
    """Write an 8-bit PNG from display values in 0..1 (mx_review's pure writer)."""
    np = _np()
    x = (np.clip(rgb, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    h, w = x.shape[:2]
    if alpha is not None:
        al = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
        x = np.concatenate([x, al[..., None]], axis=-1)
        return _mxr().write_png(path, w, h, x.tobytes(), channels=4)
    return _mxr().write_png(path, w, h, x.tobytes(), channels=3)


def srgb_decode(c):
    np = _np()
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb_encode(c):
    np = _np()
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, None)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


_M_XYZ = ((0.4124, 0.3576, 0.1805), (0.2126, 0.7152, 0.0722), (0.0193, 0.1192, 0.9505))
_WHITE = (0.95047, 1.0, 1.08883)


def to_lab(rgb_display):
    """Display-referred sRGB (0..1) to CIE L*, a*, b* (D65). What the viewer sees."""
    np = _np()
    lin = srgb_decode(rgb_display)
    xyz = lin @ np.asarray(_M_XYZ).T / np.asarray(_WHITE)
    d = 6.0 / 29.0
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4.0 / 29.0)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def luminance(rgb, space="ACEScg"):
    """Scene-linear luminance with the rendering space's weights (AP1 for ACEScg)."""
    w = AP1_Y if "aces" in (space or "").lower() else REC709_Y
    return rgb[..., 0] * w[0] + rgb[..., 1] * w[1] + rgb[..., 2] * w[2]


def ap1_to_rec709(rgb):
    np = _np()
    return rgb @ np.asarray(AP1_TO_REC709).T


def display_approx(linear, exposure=0.0, space="ACEScg"):
    """APPROXIMATE display transform for when neither Arnold's view-transformed PNG nor OCIO
    is available [added]: an ACES-like filmic fit (Narkowicz 2015) on linear Rec.709, then the
    sRGB curve. It maps 1.0 to about 0.84 and 16 to 1.0, close to the Maya Learning Channel's
    0.81 and 'a bit more than 16' (MLC 00:02:13). Screening only, never a delivery transform."""
    np = _np()
    x = np.asarray(linear, dtype=np.float64) * (2.0 ** exposure)
    if x.ndim == 3 and "aces" in (space or "").lower():
        x = ap1_to_rec709(x)
    x = np.clip(x, 0.0, None) * 0.6
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    return np.clip(srgb_encode(np.clip(y, 0.0, 1.0)), 0.0, 1.0)


def ocio_display(linear, config_path=None, src=None, display=None, view=None):
    """Display values through OCIO (PyOpenColorIO, exposed in Maya since 2026.1 per the version
    deltas [verify in mayapy]). Returns None when OCIO or the names are unavailable."""
    np = _np()
    try:
        import PyOpenColorIO as OCIO
    except ImportError:
        return None
    try:
        cfg = OCIO.Config.CreateFromFile(config_path) if config_path else OCIO.GetCurrentConfig()
        display = display or cfg.getDefaultDisplay()
        view = view or cfg.getDefaultView(display)
        src = src or "ACEScg"
        t = OCIO.DisplayViewTransform()
        t.setSrc(src)
        t.setDisplay(display)
        t.setView(view)
        cpu = cfg.getProcessor(t).getDefaultCPUProcessor()
        arr = np.ascontiguousarray(np.asarray(linear, np.float32).reshape(-1, 3))
        cpu.applyRGB(arr)
        return np.clip(arr.reshape(np.shape(linear)), 0.0, 1.0)
    except Exception:
        return None


def to_display(linear, exposure=0.0, space="ACEScg", cm=None):
    """(display rgb, method): OCIO when available, else display_approx."""
    cm = cm or {}
    np = _np()
    x = np.asarray(linear, np.float32) * (2.0 ** exposure)
    out = ocio_display(x, cm.get("config"), cm.get("rendering_space") or space, cm.get("display"), cm.get("view"))
    if out is not None:
        return out, "ocio"
    return display_approx(x, 0.0, space), "approx"


def blur(x, passes=1):
    """Binomial [1 2 1] blur, separable, edge padded."""
    np = _np()
    y = np.asarray(x, np.float64)
    for _ in range(passes):
        p = np.pad(y, [(1, 1), (1, 1)] + [(0, 0)] * (y.ndim - 2), mode="edge")
        y = (p[:-2] + 2 * p[1:-1] + p[2:]) / 4.0
        y = (y[:, :-2] + 2 * y[:, 1:-1] + y[:, 2:]) / 4.0
    return y


def downsample(x, k):
    """Block mean: the squint."""
    if k <= 1:
        return x
    h, w = x.shape[:2]
    x = x[:h // k * k, :w // k * k]
    return x.reshape(h // k, k, w // k, k, *x.shape[2:]).mean(axis=(1, 3))


def resize_nearest(x, h, w):
    np = _np()
    if x.shape[:2] == (h, w):
        return x
    ys = np.minimum((np.arange(h) + 0.5) * x.shape[0] / h, x.shape[0] - 1).astype(int)
    xs = np.minimum((np.arange(w) + 0.5) * x.shape[1] / w, x.shape[1] - 1).astype(int)
    return x[ys][:, xs]


def dilate(mask, r):
    m = mask.copy()
    for _ in range(int(r)):
        n = m.copy()
        n[1:] |= m[:-1]
        n[:-1] |= m[1:]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    return m


def erode(mask, r):
    return ~dilate(~mask, r)


def sphere_mask(shape, center_px, radius_px):
    """Screen-space disc mask (from a projected bounding sphere, see project_points)."""
    np = _np()
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    return (xx + 0.5 - center_px[0]) ** 2 + (yy + 0.5 - center_px[1]) ** 2 <= radius_px ** 2


def project_points(world_inverse, focal_mm, h_aperture_in, v_aperture_in, width, height, points,
                   film_fit="horizontal", pixel_aspect=1.0):
    """World points to pixel coordinates (x right, y down) through a Maya camera [added].
    world_inverse: the camera's worldInverseMatrix as 16 floats (Maya row-vector convention,
    p_cam = p_world * M). Film offsets and lens squeeze are ignored. Points behind the camera
    return None. film_fit: horizontal | vertical | fill | overscan (Maya filmFit names)."""
    m = list(world_inverse)
    img_aspect = width / float(height) * pixel_aspect
    film_aspect = h_aperture_in / float(v_aperture_in)
    fit = film_fit.lower()
    if fit == "fill":
        fit = "horizontal" if img_aspect >= film_aspect else "vertical"
    elif fit == "overscan":
        fit = "vertical" if img_aspect >= film_aspect else "horizontal"
    if fit == "horizontal":
        sx = focal_mm / (h_aperture_in * 25.4 / 2.0)
        sy = sx * img_aspect
    else:
        sy = focal_mm / (v_aperture_in * 25.4 / 2.0)
        sx = sy / img_aspect
    out = []
    for p in points:
        x = p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12]
        y = p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13]
        z = p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]
        if z >= -1e-9:
            out.append(None)
            continue
        nx, ny = sx * x / -z, sy * y / -z
        out.append(((nx * 0.5 + 0.5) * width, (0.5 - ny * 0.5) * height))
    return out


# =========================================================================== frame metrics
def _f(fid, status, message, cite, fix=None, value=None, threshold=None, stage=None, triage="lighting"):
    return {"id": fid, "status": status, "message": message, "cite": cite, "fix": fix, "value": value,
            "threshold": threshold, "stage": stage, "triage": triage}


def histogram_stats(L, mask=None, rgb=None):
    np = _np()
    x = L[mask] if mask is not None else L.ravel()
    t = THRESHOLDS
    rep = {"p1": float(np.percentile(x, 1)), "p5": float(np.percentile(x, 5)), "p50": float(np.percentile(x, 50)),
           "p95": float(np.percentile(x, 95)), "p99": float(np.percentile(x, 99)),
           "clipped_share": float(np.mean(x > t["clip_L"])), "crushed_share": float(np.mean(x < t["crush_L"]))}
    if rgb is not None:
        sel = rgb[mask] if mask is not None else rgb.reshape(-1, 3)
        rep["channel_clipped_share"] = float(np.mean(np.max(sel, axis=-1) >= 254.0 / 255.0))
    return rep


def value_groups(L, k=3, iters=25):
    """Notan: 1D k-means on L*. clarity = smallest gap between group centers / mean spread
    inside groups (low = muddy value plan) [added metric for TZ-C 00:08:38 and BR 00:09:19]."""
    np = _np()
    x = L.ravel().astype(np.float64)
    c = np.percentile(x, np.linspace(15, 85, k))
    lab = np.zeros(x.size, int)
    for _ in range(iters):
        lab = np.argmin(np.abs(x[:, None] - c[None, :]), axis=1)
        c = np.array([x[lab == i].mean() if np.any(lab == i) else c[i] for i in range(k)])
    order = np.argsort(c)
    c = c[order]
    lab = np.argsort(order)[lab]
    spread = np.mean([x[lab == i].std() for i in range(k) if np.any(lab == i)])
    return {"centers": [float(v) for v in c], "shares": [float(v) for v in np.bincount(lab, minlength=k) / x.size],
            "clarity": float(np.min(np.diff(c)) / (spread + 1e-9))}


def separation(L, mask, r=None):
    """Subject vs a surrounding ring: median delta L* and d-prime (BR 00:40:02; KT 00:30:31)."""
    np = _np()
    r = r or max(2, int(0.03 * max(L.shape)))
    ring = dilate(mask, r) & ~mask
    if not mask.any() or not ring.any():
        return None
    s, b = L[mask], L[ring]
    return {"median_delta": float(np.median(s) - np.median(b)),
            "dprime": float((s.mean() - b.mean()) / (np.sqrt((s.var() + b.var()) / 2.0) + 1e-9)),
            "subject_median": float(np.median(s)), "ring_median": float(np.median(b)), "ring_px": int(r)}


def saliency(L, a, b, k=None):
    """Frequency-tuned saliency (Achanta 2009 [added method]) on the squinted frame."""
    np = _np()
    k = k or max(1, min(L.shape) // 128)
    lab = np.stack([L, a, b], axis=-1)
    sm = blur(downsample(lab, k), 2)
    mean = sm.reshape(-1, 3).mean(axis=0)
    s = np.sqrt(((sm - mean) ** 2).sum(axis=-1))
    return s / (s.max() + 1e-9), k


def focus_check(sal, mask_small=None):
    np = _np()
    peak = np.unravel_index(int(np.argmax(sal)), sal.shape)
    out = {"peak_xy": (float((peak[1] + 0.5) / sal.shape[1]), float((peak[0] + 0.5) / sal.shape[0])),
           "peak_height": float((peak[0] + 0.5) / sal.shape[0])}
    if mask_small is not None and mask_small.any():
        share = float(sal[mask_small].sum() / (sal.sum() + 1e-9))
        out.update(peak_in_subject=bool(mask_small[peak]), subject_share=share,
                   concentration=float(share / (mask_small.mean() + 1e-9)))
    return out


def warm_cool(L, bstar, mask=None):
    """b* of lit minus shadow pixels (positive: warm light, cool shadows) and subject minus
    background (KT 00:13:22 warm over cool; ARV-L 00:07:24 key and rim temperature contrast)."""
    np = _np()
    sel = mask if mask is not None and mask.any() else np.ones(L.shape, bool)
    Ls, bs = L[sel], bstar[sel]
    lit, shade = Ls > np.percentile(Ls, 65), Ls < np.percentile(Ls, 35)
    out = {"lit_minus_shadow_b": float(bs[lit].mean() - bs[shade].mean()) if lit.any() and shade.any() else 0.0}
    if mask is not None and mask.any() and (~mask).any():
        out["subject_minus_background_b"] = float(bstar[mask].mean() - bstar[~mask].mean())
    return out


def depth_structure(L, Z, exclude=None):
    """Back-to-front value structure from a Z AOV: far blacks lifted and low contrast, near
    blacks darkest and most contrasty (TZ-C 00:08:38; BR-B ch6 Negative space) [added metric].
    `exclude` (the subject mask) keeps the lit subject out: the rule is about the set's planes."""
    np = _np()
    v = np.isfinite(Z) & (Z > 0) & (Z < 1e20)
    if exclude is not None:
        v &= ~exclude
    if v.sum() < 30:
        return None
    q1, q2 = np.percentile(Z[v], [33.3, 66.6])
    bins = {"near": v & (Z <= q1), "mid": v & (Z > q1) & (Z <= q2), "far": v & (Z > q2)}
    if not all(m.any() for m in bins.values()):
        return None
    blk = dict((k, float(np.percentile(L[m], 2))) for k, m in bins.items())
    con = dict((k, float(np.percentile(L[m], 95) - np.percentile(L[m], 5))) for k, m in bins.items())
    mean = dict((k, float(L[m].mean())) for k, m in bins.items())
    return {"blacks": blk, "contrast": con, "mean": mean,
            "blacks_rise_far": blk["far"] >= blk["mid"] >= blk["near"],
            "contrast_falls_far": con["far"] <= con["mid"] <= con["near"]}


def isolated_hues(L, astar, bstar, mask=None):
    """Small saturated hue clusters far from the dominant hue, outside the subject: eye magnets
    (TZ-C 00:14:39) [added thresholds]."""
    np = _np()
    t = THRESHOLDS
    C = np.sqrt(astar ** 2 + bstar ** 2)
    sat = C > t["chroma_sat"]
    if sat.sum() < 10:
        return []
    hue = np.degrees(np.arctan2(bstar, astar)) % 360.0
    tinted = (C > 5.0) & ~sat                   # the scene's overall cast, from the unsaturated pixels
    if tinted.mean() < 0.05:
        tinted = C > 5.0
    dom = None
    if tinted.mean() >= 0.05:
        wts = C[tinted]
        ang = np.radians(hue[tinted])
        dom = float(np.degrees(np.arctan2((np.sin(ang) * wts).sum(), (np.cos(ang) * wts).sum())) % 360.0)
    hist, edges = np.histogram(hue[sat], bins=36, range=(0, 360))
    out = []
    total = float(L.size)
    for i, n in enumerate(hist):
        share = n / total
        centre = (edges[i] + edges[i + 1]) / 2.0
        dist = 180.0 if dom is None else abs((centre - dom + 180.0) % 360.0 - 180.0)   # neutral scene: any lone hue
        if t["isolated_hue_min_share"] <= share <= t["isolated_hue_share"] and dist >= t["isolated_hue_angle"]:
            sel = sat & (hue >= edges[i]) & (hue < edges[i + 1])
            in_subject = float(mask[sel].mean()) if mask is not None and sel.any() else 0.0
            if in_subject < 0.5:
                ys, xs = np.nonzero(sel)
                out.append({"hue": float(centre), "share": float(share), "angle_from_dominant": float(dist),
                            "in_subject": in_subject, "centroid_xy": (float(xs.mean() / L.shape[1]), float(ys.mean() / L.shape[0]))})
    return out


def vignette(L, border=0.1):
    """Edge band vs center mean L* (BR-B ch6 Vignetting: vignette the lighting) [added metric]."""
    np = _np()
    h, w = L.shape
    bh, bw = max(1, int(h * border)), max(1, int(w * border))
    edge = np.concatenate([L[:bh].ravel(), L[-bh:].ravel(), L[:, :bw].ravel(), L[:, -bw:].ravel()])
    center = L[h // 4:3 * h // 4, w // 4:3 * w // 4]
    return {"edge_mean": float(edge.mean()), "center_mean": float(center.mean()),
            "edge_minus_center": float(edge.mean() - center.mean())}


def group_levels(groups, mask, space="ACEScg"):
    """Per light group mean luminance on a mask, ranked: the dominance test that turns
    'one light stands above the others' (BR-B ch6 Balance) and 'the key is the strongest'
    (ARV-L 00:06:51) into numbers. groups: {name: HxWx3 scene-linear}."""
    _np()
    if mask is None or not mask.any():
        return None
    lv = sorted(((float(luminance(v, space)[mask].mean()), k) for k, v in groups.items()), reverse=True)
    total = sum(max(0.0, x) for x, _ in lv) or 1e-9
    ranking = [{"group": k, "mean": x, "share": max(0.0, x) / total} for x, k in lv]
    gap = (lv[0][0] - lv[1][0]) / (lv[0][0] + 1e-9) if len(lv) > 1 else 1.0
    stops = math.log2((lv[0][0] + 1e-9) / (lv[1][0] + 1e-9)) if len(lv) > 1 and lv[1][0] > 0 else None
    return {"ranking": ranking, "top": lv[0][1], "gap": float(gap), "top_over_second_stops": stops}


def face_ratio_stops(Y_face):
    """Lit vs shadow side of a face in stops: log2(p90 / p10) of scene-linear luminance."""
    np = _np()
    return float(np.log2((np.percentile(Y_face, 90) + 1e-6) / (np.percentile(Y_face, 10) + 1e-6)))


def half_balance(Y, mask):
    """Screen left vs right half of a mask: (left mean, right mean, relative difference)."""
    np = _np()
    ys, xs = np.nonzero(mask)
    if xs.size < 20:
        return None
    mid = (xs.min() + xs.max()) / 2.0
    left = Y[ys[xs < mid], xs[xs < mid]]
    right = Y[ys[xs >= mid], xs[xs >= mid]]
    if not left.size or not right.size:
        return None
    lm, rm = float(left.mean()), float(right.mean())
    return {"left": lm, "right": rm, "rel_diff": abs(lm - rm) / (max(lm, rm) + 1e-9)}


def exr_sanity(img, space="ACEScg"):
    np = _np()
    rgb = img.layer("RGBA", rgb=True)
    Y = luminance(rgb, space)
    finite = np.isfinite(rgb)
    iy, ix = np.unravel_index(int(np.nanargmax(np.where(np.isfinite(Y), Y, -1))), Y.shape)
    out = {"nan_inf": int((~finite).sum()), "negative": int((rgb < -1e-4).sum()),
           "max_luminance": float(np.nanmax(np.where(np.isfinite(Y), Y, 0))),
           "max_at_xy": (int(ix), int(iy)), "share_above_1": float(np.mean(Y > 1.0)),
           "mean_luminance": float(np.nanmean(np.where(np.isfinite(Y), Y, 0)))}
    a = img.alpha()
    if a is not None:
        out["alpha_coverage"] = float(np.mean(a > 0.5))
    return out


# =========================================================================== briefs
def default_brief(kind="product"):
    """The shot brief every gate reads (digest P1): story and focal target first (KT 00:16:50).
    Defaults when the user is silent [added]; write them down in the report."""
    base = {"kind": kind, "story": "", "target": "subject", "mood": "drama", "art_direction": "natural", "references": [],
            "scheme": None, "face_ratio_stops": None, "eyes_dead_or_defeated": False, "denoise": True,
            "contract": {"continuity": "conservative",
                         "allowed_shot_tweaks": ["aiExposure", "exposure", "translate", "rotate", "visibility"]},
            "rendering_space": "ACEScg", "scene": kind if kind in ("product", "interior", "exterior") else "character"}
    if kind == "product":
        base.update(story="the product is the hero: premium, readable edges, dark surroundings",
                    mood="drama", scheme={"key": "neutral", "background": "dark"})
    elif kind == "character":
        base.update(target="face", mood="standard", face_ratio_stops=MOOD_RATIO_STOPS["standard"])
    return base


def _mask_from(spec, img, shape):
    """A mask from an array, a PNG path (white = in), or 'exr:<layer>'."""
    np = _np()
    if spec is None:
        return None
    if isinstance(spec, str):
        if spec.startswith("exr:"):
            if img is None:
                return None
            m = img.layer(spec[4:])
            m = m if m.ndim == 2 else m[..., 0]
        else:
            rgb, _ = load_display(spec)
            m = rgb.mean(axis=-1)
    else:
        m = np.asarray(spec)
        if m.dtype == bool:
            return resize_nearest(m, *shape)
        m = m if m.ndim == 2 else m[..., 0]
    return resize_nearest(m > 0.5, *shape)


def analyze_frame(png=None, exr=None, brief=None, masks=None, groups=None, depth="Z", cm=None,
                  space=None, thresholds=None):
    """Measure a rendered frame the way a lighting lead reads it. png: display-referred beauty
    (Arnold's 8-bit output gets the view transform: AOV § Color Management); exr: scene-linear
    EXR (path or ExrImage) with optional light groups RGBA_<g>, Z and mask_<name> layers.
    masks: {'subject': array | png path | 'exr:mask_subject', 'face': ...}; defaults to the
    EXR's mask_* layers. Returns {'metrics', 'findings', 'notes', 'inputs'} with findings in
    the supervisor's order (story and eye path first, polish last)."""
    np = _np()
    t = dict(THRESHOLDS)
    t.update(thresholds or {})
    brief = dict(default_brief((brief or {}).get("kind", "product")), **(brief or {}))
    space = space or brief.get("rendering_space") or "ACEScg"
    notes, metrics = [], {}
    img = read_exr(exr) if isinstance(exr, str) else exr
    if png:
        rgb, _alpha = load_display(png)
        display_method = "png"
    elif img is not None:
        rgb, display_method = to_display(img.layer("RGBA", rgb=True), space=space, cm=cm)
        notes.append("no display PNG: display values from %s (screening only)" % display_method)
    else:
        raise ValueError("analyze_frame needs a PNG or an EXR")
    shape = rgb.shape[:2]
    L, A, B = to_lab(rgb)
    mk = {}
    specs = dict(masks or {})
    if img is not None:
        for lay in img.layers():
            if lay.startswith("mask_") and lay[5:] not in specs:
                specs[lay[5:]] = "exr:" + lay
    for name, spec in specs.items():
        m = _mask_from(spec, img, shape)
        if m is not None and m.any():
            mk[name] = m
    subj = mk.get(brief.get("target") if brief.get("target") in mk else "subject")
    face = mk.get("face")
    if subj is None:
        notes.append("no subject mask: subject checks skipped (add_mask_aov or masks={'subject': ...})")
    metrics["histogram"] = histogram_stats(L, None, rgb)
    if subj is not None:
        metrics["histogram_subject"] = histogram_stats(L, subj, rgb)
        metrics["separation"] = separation(L, subj)
    sal, k = saliency(L, A, B)
    small = downsample(subj.astype(float), k)[:sal.shape[0], :sal.shape[1]] > 0.5 if subj is not None else None
    metrics["focus"] = focus_check(sal, small)
    metrics["value_groups"] = value_groups(downsample(L, max(1, min(shape) // 256)))
    metrics["warm_cool"] = warm_cool(L, B, subj)
    metrics["isolated_hues"] = isolated_hues(L, A, B, subj)
    metrics["vignette"] = vignette(L)
    Y = None
    if img is not None:
        metrics["exr"] = exr_sanity(img, space)
        beauty = img.layer("RGBA", rgb=True)
        Y = resize_nearest(luminance(beauty, space), *shape)
        if depth and img.has(depth):
            Z = img.layer(depth)
            Z = resize_nearest(Z if Z.ndim == 2 else Z[..., 0], *shape)
            metrics["depth"] = depth_structure(L, Z, subj)
            if subj is not None and metrics["depth"]:
                zs = Z[subj & np.isfinite(Z) & (Z > 0) & (Z < 1e20)]
                if zs.size:
                    near = np.isfinite(Z) & (Z > 0) & (Z < np.percentile(zs, 5)) & ~subj
                    if near.sum() > 50:
                        metrics["foreground"] = {"near_mean_L": float(L[near].mean()), "subject_mean_L": float(L[subj].mean())}
        else:
            notes.append("no %s layer: back-to-front value structure not measured" % depth)
        gl = groups
        if gl is None:
            gl = dict((lay[5:], img.layer(lay, rgb=True)) for lay in img.layers() if lay.startswith("RGBA_")
                      and not lay.endswith("_denoised"))
        if gl:
            gl = dict((k2, resize_nearest(v, *shape)) for k2, v in gl.items())
            tgt = face if (brief.get("kind") == "character" and face is not None) else subj
            metrics["dominance"] = group_levels(gl, tgt, space)
            metrics["sums"] = check_sums(img, space=space)
        if face is not None:
            metrics["face_ratio_stops"] = face_ratio_stops(Y[face])
            metrics["face_halves"] = half_balance(Y, face)
            fm = float(Y[face].mean())
            metrics["face_black_share"] = float(np.mean(Y[face] < t["face_black_floor"] * fm))
    refs = [r for r in (brief.get("references") or []) if isinstance(r, str) and os.path.isfile(r)]
    if refs:
        ref = analyze_frame(png=refs[0], brief={"kind": brief.get("kind", "product"), "references": []})
        metrics["reference"] = {"path": refs[0], "L_emd": _l_emd(ref["_arrays"]["L"], L),
                                "value_centers_ref": ref["metrics"]["value_groups"]["centers"],
                                "value_centers": metrics["value_groups"]["centers"]}
    rep = {"metrics": metrics, "notes": notes, "brief": brief, "thresholds": t,
           "inputs": {"png": png, "exr": getattr(img, "path", None), "display": display_method,
                      "masks": sorted(mk), "shape": list(shape), "space": space}}
    rep["findings"] = critique(rep)
    rep["_arrays"] = {"L": L, "sal": sal, "sal_k": k, "subject": subj, "rgb": rgb}
    return rep


STAGES = ("1 story read", "2 same world", "3 eye path", "4 value structure", "5 separation", "6 balance",
          "7 mood and color", "8 face", "9 shaping", "10 motivation", "11 technical", "12 polish")


def critique(rep):
    """Findings in the supervisor's order (digest: Tanzillo's live critique, KT's three goals,
    Brejon's review order). Code screens; the story read and 'same world' need eyes."""
    m, t, b = rep["metrics"], rep["thresholds"], rep["brief"]
    out = [_f("story", "info", "state the story and the focal target, then check the frame says it in the shot's duration",
              "KT 00:16:50; BR-B ch6 Silhouette", "write the one-line story in the brief", stage=STAGES[0], triage="eyes")]
    rf = m.get("reference")
    if not b.get("references"):
        out.append(_f("reference", "warn", "no reference in the brief",
                      "ARV-C 00:02:44 00:36:21 (rebuild the reference's lights before judging materials); BR 00:08:13 (two days "
                      "lost without one); TZ-C 00:02:20; ARV-L 00:01:11",
                      "collect real photographs of the same subject and situation into brief['references'], read where their "
                      "key, rims and dark bands sit, rebuild that placement", stage=STAGES[0], triage="eyes"))
    elif rf:
        out.append(_f("reference", "info", "vs %s: L* histogram distance %.1f; value groups ref %s, ours %s" % (
            os.path.basename(rf["path"]), rf["L_emd"], [round(c) for c in rf["value_centers_ref"]],
            [round(c) for c in rf["value_centers"]]), "BR 00:09:19 posterize the reference into zones; ARV-C 00:36:21",
            "open both side by side: light placement first, then values", rf["L_emd"], stage=STAGES[0], triage="eyes"))
    fo = m.get("focus", {})
    if "peak_in_subject" in fo:
        ok = fo["peak_in_subject"] and fo["concentration"] >= t["saliency_concentration"]
        st = "pass" if ok else "warn"
        msg = "saliency peak %s the subject, concentration %.2f" % ("inside" if fo["peak_in_subject"] else "OUTSIDE",
                                                                     fo["concentration"])
        fix = None if ok else "darken what competes (a bright area, a lone hue, a lamp away from the focus); pool light at the subject"
        if not fo["peak_in_subject"] and fo["peak_height"] < t["top_band"]:
            msg += "; the eye is pulled UP (peak at %.0f%% of frame height)" % (100 * fo["peak_height"])
            fix = "leading lines down, a bigger pool of light at the subject, darker windows or highlights high in frame (TZ-C 00:12:27 00:13:00)"
        out.append(_f("eye_path", st, msg, "TZ-C 00:11:53 squint; BR-B ch6 Contrast", fix, fo.get("concentration"),
                      t["saliency_concentration"], STAGES[2]))
    for hue in m.get("isolated_hues", []):
        out.append(_f("isolated_hue", "warn", "isolated hue %.0f deg covers %.1f%% outside the subject" % (hue["hue"], 100 * hue["share"]),
                      "TZ-C 00:14:39 a lone hue is an eye magnet", "use it on the payoff or remove it", hue["share"],
                      t["isolated_hue_share"], STAGES[2]))
    d = m.get("depth")
    if d:
        ok = d["blacks_rise_far"] and d["contrast_falls_far"]
        out.append(_f("back_to_front", "pass" if ok else "warn",
                      "blacks near/mid/far %.1f %.1f %.1f, contrast %.1f %.1f %.1f" % (
                          d["blacks"]["near"], d["blacks"]["mid"], d["blacks"]["far"],
                          d["contrast"]["near"], d["contrast"]["mid"], d["contrast"]["far"]),
                      "TZ-C 00:08:38 lifted far blacks, darkest contrasty foreground; BR-B ch6 Negative space",
                      None if ok else "adjust the black points: lift and flatten the far planes (haze, lower background light), darken the foreground",
                      stage=STAGES[3]))
    fg = m.get("foreground")
    if fg and fg["near_mean_L"] > fg["subject_mean_L"]:
        out.append(_f("foreground_bright", "warn", "foreground mean L* %.1f above the subject's %.1f" % (fg["near_mean_L"], fg["subject_mean_L"]),
                      "BR 00:29:06 foreground dark and contrasty; the Hugo trick BR-B ch8 Medium shot",
                      "take the foreground out of the light, keep only a rim", stage=STAGES[3]))
    vg = m.get("value_groups")
    if vg:
        out.append(_f("value_plan", "pass" if vg["clarity"] >= t["value_clarity"] else "warn",
                      "3 value groups at L* %s, clarity %.2f" % ([round(c) for c in vg["centers"]], vg["clarity"]),
                      "TZ-C 00:08:38; BR 00:09:19 posterize the frame into zones", None if vg["clarity"] >= t["value_clarity"]
                      else "separate the value groups: darker shadows or brighter key zone, fewer mid-grey areas",
                      vg["clarity"], t["value_clarity"], STAGES[3]))
    vn = m.get("vignette")
    if vn and vn["edge_minus_center"] > t["vignette_margin"]:
        out.append(_f("vignette", "warn", "frame edges %.1f L* brighter than the center" % vn["edge_minus_center"],
                      "BR-B ch6 Vignetting: fade lights at the periphery with blockers", "light blockers or spread to fade the edges",
                      stage=STAGES[3]))
    sp = m.get("separation")
    if sp:
        ok = abs(sp["dprime"]) >= t["separation_dprime"]
        out.append(_f("separation", "pass" if ok else "warn",
                      "subject vs surround median delta %.1f L*, d' %.2f" % (sp["median_delta"], sp["dprime"]),
                      "BR 00:38:56 counterchange; BR 00:40:02 never dark on dark; KT 00:30:31",
                      None if ok else ("darken what is around the subject rather than pushing the subject (KT 00:30:31); "
                                       "counterchange: light behind shadow; a rim or haze where values merge"),
                      sp["dprime"], t["separation_dprime"], STAGES[4]))
    dom = m.get("dominance")
    if dom:
        ok = dom["gap"] >= t["dominance_gap"]
        rk = dom["ranking"]
        msg = "top light group %s at %.0f%% of the subject's light; gap to #2 %.0f%%" % (rk[0]["group"], 100 * rk[0]["share"], 100 * dom["gap"])
        out.append(_f("balance", "pass" if ok else "warn", msg, "BR-B ch6 Balance (Freckelton: too many lights at the same intensity); ARV-L 00:06:51",
                      None if ok else "pick the shaping light and lower its competitors", dom["gap"], t["dominance_gap"], STAGES[5]))
        keys = [r for r in rk if "key" in r["group"].lower()]
        rims = [r for r in rk if "rim" in r["group"].lower()]
        if keys and rims and keys[0]["mean"] > 0 and rims[0]["mean"] > 0:
            st = math.log2(rims[0]["mean"] / keys[0]["mean"])     # signed: a rim ABOVE the key fails too
            if st > -t["rim_key_stops"]:
                out.append(_f("rim_equals_key", "warn", "rim %+.2f stop against the key on the subject" % st,
                              "BR-B ch6 Balance: a rim as strong as the key is the most common failure; 'small and hot' "
                              "(JHILL 00:13:47) is radiance on a small source, not more energy than the key",
                              "lower the rim to at least %.1f stop under the key" % t["rim_key_stops"], st,
                              -t["rim_key_stops"], STAGES[5]))
        if keys and rk[0]["group"] != keys[0]["group"]:
            out.append(_f("key_not_top", "info", "%s outranks the key on the subject" % rk[0]["group"],
                          "decider: the key is the main SHAPING light, not always the strongest (BR 00:23:36); in a single-subject still it usually is (ARV-L 00:06:51)",
                          "confirm the shaping light is the intended one", stage=STAGES[5]))
    wc = m.get("warm_cool")
    if wc:
        out.append(_f("warm_cool", "info", "lit minus shadow b* %.1f (positive = warm light, cool shadows)%s" % (
            wc["lit_minus_shadow_b"], "; subject minus background b* %.1f" % wc["subject_minus_background_b"]
            if "subject_minus_background_b" in wc else ""),
            "KT 00:13:22 warm over cool; BR-B ch8 Final result: one hue per direction so they do not cancel", stage=STAGES[6]))
    fr = m.get("face_ratio_stops")
    tgt = b.get("face_ratio_stops")
    if fr is not None and tgt:
        ok = abs(fr - tgt) <= t["face_ratio_tol_stops"]
        out.append(_f("face_ratio", "pass" if ok else "warn", "face lit/shadow %.2f stops vs %.2f target" % (fr, tgt),
                      "mood contrast KT 00:06:14; the stop targets are [added]",
                      None if ok else "move the wrap in 0.5-stop steps toward the target", fr, tgt, STAGES[7]))
    fh = m.get("face_halves")
    if fh and b.get("art_direction") == "natural" and fh["rel_diff"] < t["symmetry"]:
        out.append(_f("symmetric_face", "warn", "face halves within %.0f%%" % (100 * fh["rel_diff"]),
                      "BR-B ch6 Planet 51: symmetric lighting only for symmetric art direction", "lower one side",
                      fh["rel_diff"], t["symmetry"], STAGES[7]))
    if m.get("face_black_share") is not None and m["face_black_share"] > t["face_black_share"]:
        out.append(_f("face_black", "warn", "%.0f%% of the face is nearly black" % (100 * m["face_black_share"]),
                      "BR-B ch8.5 Introduction: no black areas, don't scare the children", "lift the wrap or add a bounce",
                      m["face_black_share"], t["face_black_share"], STAGES[7]))
    hs = m.get("histogram_subject")
    if hs:
        clip = hs.get("channel_clipped_share", hs["clipped_share"])
        out.append(_f("subject_clipping", "fail" if clip > t["subject_clip_share"] else "pass",
                      "%.2f%% of the subject clipped" % (100 * clip),
                      "KT 00:29:59: brightening the subject makes it clip; darken the surround instead",
                      "lower the key or darken the surround" if clip > t["subject_clip_share"] else None, clip,
                      t["subject_clip_share"], STAGES[10]))
    h = m.get("histogram")
    if h and h["crushed_share"] > t["frame_crush_share"]:
        out.append(_f("crushed_blacks", "warn", "%.0f%% of the frame below L* %.0f" % (100 * h["crushed_share"], t["crush_L"]),
                      "ARV-C 00:52:51 'in CG it's always just too black'; BR-B ch8.5 no black areas",
                      "lift with a low environment or bounce (ARV-L 00:11:53), or a subtle shadows lift in comp",
                      h["crushed_share"], t["frame_crush_share"], STAGES[10], "comp"))
    ex = m.get("exr")
    if ex:
        if ex["nan_inf"]:
            out.append(_f("nan_inf", "fail", "%d NaN or Inf values in the beauty" % ex["nan_inf"], "technical cleanliness",
                          "find the shader or light producing them", stage=STAGES[10]))
        out.append(_f("brightest_pixel", "info", "max scene-linear luminance %.2f at %s; %.2f%% above 1.0" % (
            ex["max_luminance"], ex["max_at_xy"], 100 * ex["share_above_1"]), "BRJ-CM Ch.9: know the brightest pixel",
            stage=STAGES[10]))
    su = m.get("sums")
    if su and su.get("light_groups"):
        lg = su["light_groups"]
        out.append(_f("layers_sum", "pass" if lg["ok"] else "fail",
                      "light groups sum to beauty within %.2f%% (max abs %.4f)%s" % (100 * lg["rel_error"], lg["max_abs"],
                                                                               "" if lg["ok"] else ": " + lg.get("hint", "")),
                      "BR 00:59:41 it's mathematic; AOV § Light Group Example; emission excluded from per-group indirect since Arnold 7.3",
                      None if lg["ok"] else "check group names (a typo gives an empty pass, SARK 00:07:19), RGBA_default and emission",
                      lg["rel_error"], t["sum_rel_tol"], STAGES[10]))
    out.append(_f("same_world", "info", "play the frame with its neighbours or master; each light group solo per shot",
                  "KT 00:18:56; BR 00:25:14", "light_group_sheet() per shot, then compare_frames()", stage=STAGES[1], triage="eyes"))
    out.sort(key=lambda f: STAGES.index(f["stage"]) if f.get("stage") in STAGES else 99)
    return out


def verdict(rep):
    fails = [f for f in rep["findings"] if f["status"] == "fail"]
    warns = [f for f in rep["findings"] if f["status"] == "warn"]
    return {"pass": not fails, "fail": [f["id"] for f in fails], "warn": [f["id"] for f in warns]}


def _l_emd(La, Lb):
    """Earth mover's distance between two L* histograms (50 bins of 2 L*)."""
    np = _np()
    ha, _ = np.histogram(La, bins=50, range=(0, 100))
    hb, _ = np.histogram(Lb, bins=50, range=(0, 100))
    ca, cb = np.cumsum(ha / max(1, ha.sum())), np.cumsum(hb / max(1, hb.sum()))
    return float(np.abs(ca - cb).sum() * 2.0)


def compare_frames(rep_a, rep_b):
    """Continuity between a shot and its master or neighbour [added metrics for KT 00:18:56 and
    BR-B ch6 Hugo]: L* histogram distance, a*/b* mean shift, per-group energy change in stops."""
    np = _np()
    La, Lb = rep_a["_arrays"]["L"], rep_b["_arrays"]["L"]
    ha, _ = np.histogram(La, bins=50, range=(0, 100))
    hb, _ = np.histogram(Lb, bins=50, range=(0, 100))
    ca, cb = np.cumsum(ha / ha.sum()), np.cumsum(hb / hb.sum())
    emd = float(np.abs(ca - cb).sum() * 2.0)          # bin width 2 L*
    out = {"L_emd": emd}
    da, db = rep_a["metrics"].get("dominance"), rep_b["metrics"].get("dominance")
    if da and db:
        ma = dict((r["group"], r["mean"]) for r in da["ranking"])
        mb = dict((r["group"], r["mean"]) for r in db["ranking"])
        out["group_stops"] = dict((g, math.log2((mb[g] + 1e-9) / (ma[g] + 1e-9))) for g in ma if g in mb)
        out["missing_groups"] = sorted(set(ma) ^ set(mb))
    return out


# =========================================================================== reports
def _rgb8(x):
    np = _np()
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)


def annotate(rep, out_png):
    """Overlay for the report: subject outline green, clipped pixels red, crushed blue, the
    saliency peak as a cross, and the headline numbers (the paint-over substitute, TZ-C 00:16:27)."""
    _np()
    arr = rep["_arrays"]
    img = _rgb8(arr["rgb"]).copy()
    L = arr["L"]
    img[L > rep["thresholds"]["clip_L"]] = (255, 0, 0)
    img[L < rep["thresholds"]["crush_L"]] = (0, 80, 255)
    if arr["subject"] is not None:
        edge = arr["subject"] & ~erode(arr["subject"], 2)
        img[edge] = (0, 255, 0)
    h, w = L.shape
    px, py = rep["metrics"]["focus"]["peak_xy"]
    cx, cy = int(px * w), int(py * h)
    r = max(6, min(h, w) // 40)
    img[max(0, cy - 1):cy + 2, max(0, cx - r):cx + r] = (255, 255, 0)
    img[max(0, cy - r):cy + r, max(0, cx - 1):cx + 2] = (255, 255, 0)
    buf = bytearray(img.tobytes())
    v = verdict(rep)
    line = "FAIL %s" % ",".join(v["fail"]) if v["fail"] else ("WARN %s" % ",".join(v["warn"]) if v["warn"] else "PASS")
    _mxr().draw_text(buf, w, 6, 6, line[: max(1, w // 12 - 1)], scale=2, color=(255, 255, 255))
    _mxr().write_png(out_png, w, h, bytes(buf), channels=3)
    return out_png


def squint_png(rep, out_png, k=None):
    """What a squinting lead sees: the frame block-averaged and blurred, then scaled back up."""
    _np()
    rgb = rep["_arrays"]["rgb"]
    k = k or max(4, min(rgb.shape[:2]) // 48)
    small = blur(downsample(rgb, k), 1)
    save_display(out_png, resize_nearest(small, *rgb.shape[:2]))
    return out_png


def write_report(rep, out_dir, name="critique"):
    """critique.json (numbers and findings), critique.md (ordered notes a lead would give),
    annotated.png and squint.png. Returns the paths."""
    os.makedirs(out_dir, exist_ok=True)
    clean = dict((k, v) for k, v in rep.items() if not k.startswith("_"))
    jp = os.path.join(out_dir, name + ".json")
    with open(jp, "w") as f:
        json.dump(clean, f, indent=1, default=str)
    v = verdict(rep)
    lines = ["# Frame critique (%s)" % time.strftime("%Y-%m-%d %H:%M"), "",
             "Inputs: %s" % json.dumps(rep["inputs"], default=str), "",
             "Brief: %s" % (rep["brief"].get("story") or "(no story written: write it before the next pass)"), "",
             "Verdict: %s" % ("PASS" if v["pass"] else "FAIL " + ", ".join(v["fail"])) +
             ("; warnings: " + ", ".join(v["warn"]) if v["warn"] else ""), "",
             "| # | stage | check | status | finding | fix | triage | rule |", "|---|---|---|---|---|---|---|---|"]
    for i, fnd in enumerate(rep["findings"], 1):
        lines.append("| %d | %s | %s | %s | %s | %s | %s | %s |" % (
            i, fnd.get("stage") or "", fnd["id"], fnd["status"], fnd["message"], fnd.get("fix") or "",
            fnd.get("triage") or "", fnd.get("cite") or ""))
    if rep["notes"]:
        lines += ["", "Notes:"] + ["- " + n for n in rep["notes"]]
    lines += ["", "Look at annotated.png and squint.png before accepting any number above: the metrics screen, the eye decides "
                  "(story read, same world, motivation)."]
    mp = os.path.join(out_dir, name + ".md")
    with open(mp, "w") as f:
        f.write("\n".join(lines) + "\n")
    ap = annotate(rep, os.path.join(out_dir, "annotated.png"))
    sq = squint_png(rep, os.path.join(out_dir, "squint.png"))
    return {"json": jp, "md": mp, "annotated": ap, "squint": sq}


def light_group_sheet(exr, out_png, groups=None, tile=320, exposure=0.0, space="ACEScg", cm=None, title=None):
    """Beauty plus each light group solo at the SAME exposure, one labelled contact sheet: the
    'each light alone, then together' check (BR 00:25:14, BR-B ch8 Key lights), and the
    Light Manager solo substitute (SARK 00:02:33)."""
    _np()
    img = read_exr(exr) if isinstance(exr, str) else exr
    names = groups or [lay for lay in sorted(img.layers()) if lay.startswith("RGBA_") and not lay.endswith("_denoised")]
    cells, method = [], None
    beauty = img.layer("RGBA", rgb=True)
    Yb = luminance(beauty, space)
    tot = float(Yb.mean()) or 1e-9
    th = max(1, int(round(tile * img.height / float(img.width))))
    for lay in ["RGBA"] + names:
        lin = img.layer(lay, rgb=True)
        disp, method = to_display(lin, exposure, space, cm)
        small = resize_nearest(disp, th, tile)
        share = float(luminance(lin, space).mean()) / tot
        label = "BEAUTY" if lay == "RGBA" else "%s %d%%" % (lay[5:], round(100 * share))
        cells.append((label, _rgb8(small).tobytes()))
    cols = min(4, len(cells))
    _mxr().contact_sheet(cells, cols, tile, th, out_png, title=title or ("LIGHT GROUPS SOLO (%s VIEW)" % method.upper()))
    return {"sheet": out_png, "view": method, "groups": names}


def exposure_bracket(exr, out_png, stops=(-5.0, -2.5, 0.0, 2.5, 5.0), tile=320, space="ACEScg", cm=None):
    """The beauty at -5 to +5 stops through the view (BRJ-CM Ch.9 exposure QC), with clipped
    and crushed shares per stop: does the image hold its range?"""
    np = _np()
    img = read_exr(exr) if isinstance(exr, str) else exr
    lin = img.layer("RGBA", rgb=True)
    th = max(1, int(round(tile * img.height / float(img.width))))
    cells, rows = [], []
    method = None
    for s in stops:
        disp, method = to_display(lin, s, space, cm)
        L, _, _ = to_lab(disp)
        rows.append({"stops": s, "clipped": float(np.mean(L > THRESHOLDS["clip_L"])),
                     "crushed": float(np.mean(L < THRESHOLDS["crush_L"]))})
        cells.append(("%+.1f" % s, _rgb8(resize_nearest(disp, th, tile)).tobytes()))
    _mxr().contact_sheet(cells, len(cells), tile, th, out_png, title="EXPOSURE BRACKET (%s VIEW)" % method.upper())
    return {"sheet": out_png, "rows": rows, "view": method}


# =========================================================================== noise diagnosis
ADDITIVE = ("diffuse_direct", "diffuse_indirect", "specular_direct", "specular_indirect", "coat", "transmission",
            "sss", "volume", "emission", "background")
AOV_TO_FIX = {   # SMP § Clean Renders table, § Removing Noise; ARV-T 00:03:38; LGT § Samples
    "A": ("AASamples", "camera rays: motion blur, DOF, aliasing; raise AA or use adaptive (SMP § Motion Blur and DOF)"),
    "diffuse_indirect": ("GIDiffuseSamples", "indirect diffuse; or fake the bounce with a light (SMP § Other Considerations), or denoise"),
    "diffuse_direct": ("light_samples", "shadow noise: global light samples (4 on CPU), local sampling mode on the light, or a bigger dimmer light"),
    "specular_direct": ("light_samples", "direct specular: global light samples, or a larger light with lower intensity; roughness on thin geometry"),
    "specular_indirect": ("GISpecularSamples", "glossy reflections; if it persists, AA (diffuse seen in reflections, SMP § Diffuse Surfaces Through Reflections)"),
    "coat": ("GISpecularSamples", "coat is a specular lobe"),
    "transmission": ("GITransmissionSamples", "rough refraction; check transmission depth"),
    "sss": ("GISssSamples", "subsurface: raise SSS samples, not AA (SMP § Camera (AA) Sampling)"),
    "volume": ("GIVolumeSamples", "volume: step size first, then light volume samples, then volume indirect (SMP § Volumes)"),
    "emission": (None, "emission is the noisiest light: replace emissive geometry with an area or mesh light (LGT § Mesh Light vs Emission)"),
}
SAMPLER_LIMITS = {"AASamples": 10, "GIDiffuseSamples": 6, "GISpecularSamples": 6, "GITransmissionSamples": 8,
                  "GISssSamples": 6, "GIVolumeSamples": 4, "light_samples": 4}      # [added]; GLS 4 on CPU: SMP


def _img(x):
    return read_exr(x) if isinstance(x, str) else x


def noise_single(x):
    """Immerkaer (1996) single-image noise sigma per channel [added method]: biased upward by
    texture; prefer noise_pair when two seeds are available."""
    np = _np()
    x = np.asarray(x, np.float64)
    if x.ndim == 2:
        x = x[..., None]
    k = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float64)
    h, w = x.shape[:2]
    out = []
    for c in range(x.shape[2]):
        a = x[..., c]
        conv = sum(k[i, j] * a[i:h - 2 + i, j:w - 2 + j] for i in range(3) for j in range(3))
        out.append(float(math.sqrt(math.pi / 2.0) * np.abs(conv).sum() / (6.0 * (w - 2) * (h - 2))))
    return out


def fireflies(x, k=10.0, floor=None):
    """Isolated pixels far above their 3x3 median (SMP § Fireflies): (count, share)."""
    np = _np()
    Y = np.asarray(x, np.float64)
    if Y.ndim == 3:
        Y = Y[..., :3].mean(axis=-1)
    p = np.pad(Y, 1, mode="edge")
    stack = np.stack([p[i:i + Y.shape[0], j:j + Y.shape[1]] for i in range(3) for j in range(3)])
    med = np.median(stack, axis=0)
    floor = floor if floor is not None else max(1e-4, float(np.percentile(Y, 50)))
    ff = (Y > k * np.maximum(med, 1e-6)) & (Y > floor)
    return int(ff.sum()), float(ff.mean())


def noise_pair(a, b, aovs=None, mask=None, space="ACEScg"):
    """Per-AOV noise from two renders of the same frame with different sampling seeds [added
    method: they differ only by noise, and the beauty is the sum of the additive AOVs, so its
    noise variance is roughly the sum of theirs]. Returns {'ranking': [{aov, share, sigma,
    rel_sigma, fireflies, attr, fix}], 'beauty': {...}, 'top'}: raise the top item first
    (SMP § Removing Noise: raising the wrong rays costs time without removing noise)."""
    np = _np()
    A, B = _img(a), _img(b)
    la, lb = A.layers(), B.layers()
    names = list(aovs or [x for x in ADDITIVE if x in la and x in lb])
    rows, var = [], {}
    sel = mask if mask is not None else None

    def stats(xa, xb):
        d = (xa - xb)
        if sel is not None:
            d, xa2 = d[sel], xa[sel]
        else:
            xa2 = xa
        v = float(np.var(d) / 2.0)
        mean = float(np.mean(np.abs(xa2))) + 1e-9
        return v, math.sqrt(v), math.sqrt(v) / mean
    for n in names:
        xa, xb = luminance(A.layer(n, rgb=True), space), luminance(B.layer(n, rgb=True), space)
        v, s, rs = stats(xa, xb)
        var[n] = v
        ffc, ffs = fireflies(A.layer(n, rgb=True))
        attr, fix = AOV_TO_FIX.get(n, (None, ""))
        rows.append({"aov": n, "variance": v, "sigma": s, "rel_sigma": rs, "fireflies": ffc, "firefly_share": ffs,
                     "attr": attr, "fix": fix})
    aa, ab = A.alpha(), B.alpha()
    if aa is not None and ab is not None and (aovs is None or "A" in aovs):
        v, s, rs = stats(aa, ab)
        var["A"] = v
        rows.append({"aov": "A", "variance": v, "sigma": s, "rel_sigma": rs, "fireflies": 0, "firefly_share": 0.0,
                     "attr": AOV_TO_FIX["A"][0], "fix": AOV_TO_FIX["A"][1]})
    total = sum(r["variance"] for r in rows) or 1e-18
    for r in rows:
        r["share"] = r["variance"] / total
    rows.sort(key=lambda r: -r["variance"])
    bv, bs, brs = stats(luminance(A.layer("RGBA", rgb=True), space), luminance(B.layer("RGBA", rgb=True), space))
    return {"ranking": rows, "top": rows[0]["aov"] if rows else None,
            "beauty": {"variance": bv, "sigma": bs, "rel_sigma": brs, "sum_of_aov_variance": total}}


def next_step(rep, settings, target=0.02, limits=None, gls_attr="light_samples", firefly_share=0.001):
    """One decision of the diagnosis loop: stop, fix fireflies, or raise ONE sampler one step.
    Settings use defaultArnoldRenderOptions names (plus 'light_samples' for the GLS count)."""
    lim = dict(SAMPLER_LIMITS, **(limits or {}))
    b = rep["beauty"]
    if b["rel_sigma"] <= target:
        return {"action": "stop", "why": "beauty noise %.4f <= target %.4f" % (b["rel_sigma"], target)}
    if not rep["ranking"]:
        return {"action": "stop", "why": "no AOVs to diagnose: render the diagnose AOV preset"}
    top = rep["ranking"][0]
    if top["firefly_share"] > firefly_share:
        return {"action": "fireflies", "aov": top["aov"], "why": "isolated hot pixels are not a sampling problem",
                "playbook": FIREFLY_PLAYBOOK}
    attr = top["attr"]
    if attr is None:
        return {"action": "scene_fix", "aov": top["aov"], "why": top["fix"]}
    if attr == "light_samples":
        attr = gls_attr
    cur = settings.get(attr)
    if cur is None:
        cur = {"AASamples": 3, gls_attr: 4}.get(attr, IPR_DEFAULTS.get(attr, 2))
    if attr == "GISpecularSamples" and cur >= 4 and top["aov"] == "specular_indirect":
        attr, cur = "AASamples", settings.get("AASamples", 3)
        top = dict(top, fix="specular samples already 4: diffuse seen in reflections only cleans with AA (SMP)")
    if attr == gls_attr and cur >= lim["light_samples"]:
        if not settings.get("enableAdaptiveSampling"):
            return {"action": "raise", "attr": "enableAdaptiveSampling", "from": 0, "to": 1,
                    "also": {"AASamplesMax": max(20, settings.get("AASamplesMax", 20)), "AAAdaptiveThreshold": 0.015},
                    "aov": top["aov"], "why": "GLS at its CPU optimum (4, SMP); adaptive AA for the residual", "cost_factor": None}
        attr, cur = "AASamples", settings.get("AASamples", 3)
    if cur >= lim.get(attr, 99):
        return {"action": "denoise", "aov": top["aov"], "why": "%s at its limit %s: hand the residual to the denoiser (ARV-T 00:26:04)" % (attr, cur)}
    new = int(cur) + 1
    cost = (new / float(cur)) ** 2 if cur else None
    return {"action": "raise", "attr": attr, "from": cur, "to": new, "aov": top["aov"], "share": top["share"],
            "why": top["fix"], "cost_factor": cost}


FIREFLY_PLAYBOOK = (  # SMP § Fireflies - Boat Scene, § Volumes - UFO scene, § Light Decay Filter
    "raise the roughness of the surface that reflects the hot source",
    "ray switch: a zero-specular copy of the shader on diffuse and specular reflection rays",
    "turn off visible in diffuse or specular on the emitter",
    "move a mesh light off its mesh or disable that mesh's shadows",
    "light decay filter with a tiny near start for lights touching fixtures",
    "clamp per shader (a clamp node, or into the ray switch glossy slot)",
    "global clamp last: indirect clamp no lower than 10 (BRJ-CM Ch.1 Range)",
)


def noise_loop(render_pair, settings, max_steps=6, target=0.02, min_gain=0.15, limits=None, log_path=None,
               gls_attr="light_samples"):
    """The diagnosis loop: render two seeds, rank AOV noise, raise the top sampler one step,
    re-measure; stop at the target, at a sampler limit (denoise), on fireflies (playbook), or
    when a step bought less than min_gain of that AOV's variance (reverted) [added stopping
    rule]. render_pair(settings) returns {'a': exr, 'b': exr, 'seconds': s}. Returns
    {'settings', 'history', 'stop'}."""
    cur = dict(settings)
    hist = []
    prev = None
    stop = None
    for step in range(max_steps + 1):
        res = render_pair(dict(cur))
        rep = noise_pair(res["a"], res["b"])
        entry = {"step": step, "settings": dict(cur), "beauty_rel_sigma": rep["beauty"]["rel_sigma"],
                 "top": rep["top"], "ranking": [(r["aov"], round(r["share"], 3)) for r in rep["ranking"]],
                 "seconds": res.get("seconds")}
        if prev is not None and prev["decision"].get("action") == "raise":
            aov = prev["decision"]["aov"]
            v0 = dict((r["aov"], r["variance"]) for r in prev["_rep"]["ranking"]).get(aov)
            v1 = dict((r["aov"], r["variance"]) for r in rep["ranking"]).get(aov)
            if v0 and v1 is not None:
                entry["gain"] = 1.0 - v1 / v0
                if entry["gain"] < min_gain:
                    cur = dict(prev["settings"])
                    entry["reverted"] = True
                    stop = {"action": "diminishing_returns", "why": "%s bought %.0f%% of %s's variance; reverted, hand the rest to the denoiser"
                            % (prev["decision"]["attr"], 100 * entry["gain"], aov)}
                    entry["decision"] = stop
                    hist.append(entry)
                    break
        dec = next_step(rep, cur, target, limits, gls_attr)
        entry["decision"] = dec
        entry["_rep"] = rep
        hist.append(entry)
        prev = entry
        if dec["action"] != "raise" or step == max_steps:
            stop = dec if dec["action"] != "raise" else {"action": "max_steps", "why": "loop budget used"}
            break
        cur[dec["attr"]] = dec["to"]
        cur.update(dec.get("also") or {})
    for e in hist:
        e.pop("_rep", None)
    out = {"settings": cur, "history": hist, "stop": stop}
    if log_path:
        with open(log_path, "w") as f:
            json.dump(out, f, indent=1, default=str)
    return out


def detail_loss(denoised, reference, mask=None):
    """High-frequency energy of the denoised crop over a high-sample reference (Arnold digest
    P3 detail gate [added]): below about 0.8 the denoiser ate brushing, flakes or pores
    (ARV-C 00:54:27 'don't get rid of all your little flakes')."""
    np = _np()
    d = np.asarray(denoised, np.float64)
    r = np.asarray(reference, np.float64)
    hd = d - blur(d, 2)
    hr = r - blur(r, 2)
    if mask is not None:
        hd, hr = hd[mask], hr[mask]
    return float(np.sqrt((hd ** 2).mean()) / (np.sqrt((hr ** 2).mean()) + 1e-12))


# =========================================================================== light groups, sums, comp
def near_duplicates(names, ratio=0.85):
    """Pairs of names that are probably one name mistyped (case, one letter): the empty-pass
    trap (SARK 00:07:19: a typo renders an empty AOV with no error)."""
    names = sorted(set(n for n in names if n))
    out = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if a.lower() == b.lower() or difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() >= ratio:
                out.append((a, b))
    return out


def group_contract(light_groups, aov_groups=None, all_light_groups=True):
    """light_groups: {light: group string ('' = default)}; aov_groups: groups selected on the
    RGBA AOV (ignored when All Light Groups is on). Returns findings (AOV § Light Groups)."""
    out = []
    groups = set(g for g in light_groups.values() if g)
    if len(groups) > MAX_LIGHT_GROUPS:
        out.append(_f("group_limit", "fail", "%d light groups" % len(groups), "AOV § Light Group Example: at most 16",
                      "bundle lights by role or category (BR 01:12:25: 30 lights, 9 groups)"))
    ungrouped = sorted(l for l, g in light_groups.items() if not g)
    if ungrouped:
        out.append(_f("ungrouped", "warn", "%d lights in no group (they land in RGBA_default): %s" % (len(ungrouped), ungrouped[:8]),
                      "AOV § Light Groups", "give every light a group so comp notes can be answered (SARK 00:11:28)"))
    for a, b in near_duplicates(groups):
        out.append(_f("group_typo", "fail", "light groups %r and %r look like one name" % (a, b), "SARK 00:07:19",
                      "use one dict for names; exact string match"))
    if aov_groups is not None and not all_light_groups:
        missing = sorted(set(aov_groups) - groups)
        unused = sorted(groups - set(aov_groups))
        if missing:
            out.append(_f("aov_group_no_light", "fail", "AOV groups with no light (empty passes): %s" % missing, "SARK 00:07:19",
                          "fix the name on the light or the AOV"))
        if unused:
            out.append(_f("group_not_output", "warn", "light groups not written: %s" % unused, "AOV § All Light Groups",
                          "select them or turn All Light Groups on"))
    if not out:
        out.append(_f("group_contract", "pass", "%d groups, names consistent" % len(groups), "AOV § Light Groups"))
    return out


def check_sums(img, groups=None, additive=ADDITIVE, space="ACEScg", tol=None):
    """Do the passes rebuild the beauty? Light groups: sum(RGBA_<g>) (+ RGBA_default) vs RGBA;
    additive set: sum of present ADDITIVE layers vs RGBA (AOV § Composing the Beauty AOV; BR
    00:59:41). RGB only, not alpha (BR 01:00:14: merge plus on RGB, or alpha accumulates)."""
    np = _np()
    img = _img(img)
    tol = THRESHOLDS["sum_rel_tol"] if tol is None else tol
    lays = img.layers()
    beauty = img.layer("RGBA", rgb=True)
    scale = float(np.percentile(np.abs(beauty), 99)) or 1e-6
    out = {}
    names = groups or [l for l in lays if l.startswith("RGBA_") and not l.endswith("_denoised")]
    if names:
        s = sum(img.layer(n, rgb=True) for n in names)
        err = np.abs(s - beauty)
        rel = float(err.max() / scale)
        rep = {"layers": names, "max_abs": float(err.max()), "rel_error": rel, "ok": rel <= tol,
               "has_default": "RGBA_default" in names}
        if not rep["ok"]:
            short = float((beauty - s).mean())
            if "emission" in lays:
                em = float(img.layer("emission", rgb=True).mean())
                if abs(short - em) < 0.25 * abs(short) + 1e-6:
                    rep["hint"] = "the missing part matches the emission AOV (per-group indirect excludes emission since Arnold 7.3)"
            if "hint" not in rep:
                rep["hint"] = "missing RGBA_default or a group" if not rep["has_default"] else "a group name typo or a light outside every group"
        out["light_groups"] = rep
    present = [a for a in additive if a in lays]
    if present:
        s = sum(img.layer(n, rgb=True) for n in present)
        err = np.abs(s - beauty)
        rel = float(err.max() / scale)
        out["additive"] = {"layers": present, "max_abs": float(err.max()), "rel_error": rel, "ok": rel <= tol}
    empty = [l for l in lays if l != "RGBA" and not l.startswith("mask_") and float(np.abs(img.layer(l)).max()) == 0.0]
    out["empty_layers"] = empty
    return out


def comp_recipe(img, rendering_space="ACEScg", groups=None):
    """The handoff to comp as data, not a Nuke script [added]: what the file is, how to rebuild
    the beauty, what to grade, and the rule that grades come back to the lights."""
    img = _img(img)
    lays = sorted(img.layers())
    gl = groups or [l for l in lays if l.startswith("RGBA_") and not l.endswith("_denoised")]
    return {
        "file": img.path, "color": "%s scene-linear, output transform OFF (CM § Render color-managed scenes)" % rendering_space,
        "precision": img.header.get("pixel_types"), "compression": img.header.get("compression_name"),
        "rebuild": {"light_groups": {"layers": gl, "operation": "plus", "channels": "rgb",
                                     "note": "sum RGB only, not alpha (BR 01:00:14)"},
                    "additive": [l for l in ADDITIVE if l in lays]},
        "utility": [l for l in lays if l in ("Z", "N", "P", "diffuse_albedo", "motionvector") or l.startswith("crypto")],
        "masks": [l for l in lays if l.startswith("mask_")],
        "grading_rule": "light-group gains are explored in comp, then copied back into the lights "
                        "(grade_to_light; BR-B ch8 Final result); key direction notes go back to lighting (KT 00:47:19)",
        "denoised": [l for l in lays if l.endswith("_denoised")],
    }


# =========================================================================== render command line (pure)
MAYA_BIN_CANDIDATES = ("/Applications/Autodesk/maya2027/Maya.app/Contents/bin",)


def maya_bin():
    loc = os.environ.get("MAYA_LOCATION")
    cands = ([os.path.join(loc, "bin")] if loc else []) + list(MAYA_BIN_CANDIDATES)
    cands += sorted(glob.glob("/Applications/Autodesk/maya20*/Maya.app/Contents/bin"), reverse=True)
    for c in cands:
        if os.path.isfile(os.path.join(c, "Render")):
            return c
    return cands[0] if cands else None


def render_cmd(scene, camera, start, end, out_dir, width=None, height=None, layer=None, template=None,
               project=None, image_name=None, renderer="arnold", extra=(), bin_dir=None, step=1):
    """The Render command line (Maya 2027 help: `maya -render` is obsolete, `Render -r <renderer>`).
    Arnold overrides go in `extra` as '-ai:<flag>' pairs [verify spelling with Render -help -r arnold]."""
    b = bin_dir or maya_bin() or ""
    cmd = [os.path.join(b, "Render"), "-r", renderer, "-s", str(start), "-e", str(end), "-b", str(step),
           "-cam", camera, "-rd", out_dir]
    if width and height:
        cmd += ["-x", str(int(width)), "-y", str(int(height))]
    if image_name:
        cmd += ["-im", image_name]
    if project:
        cmd += ["-proj", project]
    if layer:
        cmd += ["-rl", layer]
    if template:
        cmd += ["-rst", template]
    return cmd + [str(x) for x in extra] + [scene]


def render_env(extra=None, final=False):
    """Environment for batch renders: no analytics, the OCIO / policy variables passed through so
    batch matches the session (CM § Configure color management: policy > OCIO env > scene).
    Licence (WN25 § Arnold for Maya 5.4.0; LGT § Useful Commands): final=True forces the abort,
    so an unlicensed sequence fails loudly instead of shipping watermarked frames; final=False
    lets tests render with a watermark, which skews analyze_frame (clipping, saliency). The
    variable's values are [verify]; licence_check_cmd() before any long batch."""
    env = dict(os.environ)
    env.setdefault("MAYA_DISABLE_ADP", "1")
    env["ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL"] = "1" if final else env.get("ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL", "0")
    env.update(extra or {})
    return env


def licence_check_cmd(kick=None):
    """kick -licensecheck (LGT § Useful Commands): run it before a long batch."""
    return [kick or find_arnold_tool("kick") or "kick", "-licensecheck"]


def find_arnold_tool(name, mtoa_path=None):
    """kick, noice, maketx or oiiotool from the MtoA install [verify the macOS layout]."""
    cands = []
    for var in ("MTOA_BIN", "ARNOLD_BIN"):
        if os.environ.get(var):
            cands.append(os.path.join(os.environ[var], name))
    if mtoa_path:
        root = os.path.dirname(os.path.dirname(mtoa_path))
        cands.append(os.path.join(root, "bin", name))
    cands += sorted(glob.glob("/Applications/Autodesk/Arnold/mtoa/*/bin/" + name), reverse=True)
    cands += sorted(glob.glob("/Applications/Autodesk/maya20*/Maya.app/Contents/bin/" + name), reverse=True)
    w = shutil.which(name)
    if w:
        cands.append(w)
    for c in cands:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def kick_cmd(ass, out=None, seed=None, sets=None, verbose=2, kick=None, extra=(), final=False):
    """kick for debugging and seed control (LGT § Useful Commands): -dw -dp no window and no
    progressive, -set node.param value overrides, -it -il -is -imb -isd -idisp -isss disable
    textures, lights, shaders, motion blur, subdivision, displacement, SSS. final=True adds
    -set options.abort_on_license_fail true (abort instead of a watermark)."""
    cmd = [kick or find_arnold_tool("kick") or "kick", "-i", ass, "-dw", "-dp", "-v", str(verbose)]
    if out:
        cmd += ["-o", out]
    if final:
        cmd += ["-set", "options.abort_on_license_fail", "true"]
    if seed is not None:
        cmd += ["-set", "options.AA_seed", str(int(seed))]
    for k, v in (sets or {}).items():
        cmd += ["-set", k, str(v)]
    return cmd + list(extra)


def noice_cmd(first_exr, out_exr, frames=1, extra_frames=2, strength=0.45, light_aovs=(), noice=None):
    """noice for sequences or co-denoised light groups (AOV § Arnold Denoiser): variance layers,
    N, Z, denoise albedo, Preserve Layer Name, not multipart; strength 0.45 (0.2 keeps texture,
    0.8 for GI and SSS); -ef up to 2; never -t on macOS."""
    cmd = [noice or find_arnold_tool("noice") or "noice", "-i", first_exr, "-o", out_exr, "-f", str(frames),
           "-ef", str(extra_frames), "-k", str(strength)]
    for l in light_aovs:
        cmd += ["-l", l]
    return cmd


# =========================================================================== MAYA LAYER
# (below: needs maya.cmds; not yet run in Maya)
def _cmds():
    import maya.cmds as cmds
    return cmds


def _mel():
    import maya.mel as mel
    return mel


RO = "defaultArnoldRenderOptions"
DRIVER = "defaultArnoldDriver"
FILTER = "defaultArnoldFilter"
# Logical keys to candidate MtoA names [verify all with job_00_probe_lighting.py]. Real
# attribute names (AASamples, GIDiffuseSamples...) are accepted as they are.
OPTION_ALIASES = {
    "light_samples": ("GILightSamples", "lightSamples", "GIGlobalLightSamples", "globalLightSamples", "light_samples"),
    "lock_seed": ("lock_sampling_noise", "lockSamplingNoise"),
    "abort_license": ("abortOnLicenseFail", "abort_on_license_fail"),
    "device": ("renderDevice",), "threads_auto": ("threads_autodetect",), "threads": ("threads",),
    "clamp_on": ("use_sample_clamp",), "clamp": ("AASampleClamp",), "clamp_aovs": ("use_sample_clamp_AOVs",),
    "indirect_clamp": ("indirectSampleClamp",), "ignore_shadows": ("ignoreShadows",),
    "ignore_textures": ("ignoreTextures",), "ignore_sss": ("ignoreSss",), "ignore_subdiv": ("ignoreSubdivision",),
    "ignore_displacement": ("ignoreDisplacement",), "ignore_motion_blur": ("ignoreMotionBlur",),
    "ignore_dof": ("ignoreDof",), "motion_blur": ("motion_blur_enable",), "autotx": ("autotx",),
    "use_existing_tx": ("use_existing_tiled_textures",), "log_file": ("log_filename",),
    "log_to_file": ("log_to_file",), "log_verbosity": ("log_verbosity",), "aov_mode": ("aovMode",),
}
REPORT_OPTIONS = ("AASamples", "GIDiffuseSamples", "GISpecularSamples", "GITransmissionSamples", "GISssSamples",
                  "GIVolumeSamples", "GITotalDepth", "GIDiffuseDepth", "GISpecularDepth", "GITransmissionDepth",
                  "GIVolumeDepth", "autoTransparencyDepth", "enableAdaptiveSampling", "AASamplesMax",
                  "AAAdaptiveThreshold", "light_samples", "use_sample_clamp", "AASampleClamp", "indirectSampleClamp",
                  "lock_seed", "device", "motion_blur", "autotx", "use_existing_tx")
LIGHT_ATTRS = {
    "exposure": ("aiExposure", "exposure"), "intensity": ("intensity",), "color": ("color",),
    "normalize": ("aiNormalize", "normalize"), "spread": ("aiSpread", "spread"),
    "roundness": ("aiRoundness", "roundness"), "soft_edge": ("aiSoftEdge", "softEdge", "soft_edge"),
    "samples": ("aiSamples", "samples"), "sampling_mode": ("aiSamplingMode", "aiSampling_mode", "samplingMode"),
    "cast_shadows": ("aiCastShadows", "castShadows"), "camera": ("aiCamera", "camera"),
    "transmission": ("aiTransmission", "transmission"), "diffuse": ("aiDiffuse", "diffuse"),
    "specular": ("aiSpecular", "specular"), "sss": ("aiSss", "sss"), "indirect": ("aiIndirect", "indirect"),
    "volume": ("aiVolume", "volume"), "max_bounces": ("aiMaxBounces", "maxBounces"), "aov": ("aiAov", "aov"),
    "use_temperature": ("aiUseColorTemperature", "useColorTemperature"),
    "temperature": ("aiColorTemperature", "colorTemperature"), "resolution": ("resolution", "aiResolution"),
    "format": ("format", "aiFormat"), "portal_mode": ("portal_mode", "aiPortalMode", "portalMode"),
    "shape": ("aiTranslator",), "volume_samples": ("aiVolumeSamples", "volumeSamples"), "decay": ("decayRate",),
}
DRIVER_ATTRS = {
    "translator": ("ai_translator", "aiTranslator"), "compression": ("exrCompression", "compression"),
    "half": ("halfPrecision", "half_precision"), "tiled": ("tiled",), "preserve": ("preserveLayerName", "preserve_layer_name"),
    "merge": ("mergeAOVs", "merge_aovs"), "multipart": ("multipart",), "autocrop": ("autocrop",),
    "prefix": ("prefix", "aiPrefix", "overridePathPrefix"),
}
AOV_ATTRS = {"name": ("name", "aovName"), "type": ("type", "aovType"), "enabled": ("enabled",),
             "light_groups": ("lightGroups", "allLightGroups"), "light_groups_list": ("lightGroupsList",),
             "shader": ("defaultValue", "shader"), "lpe": ("lightPathExpression",), "global": ("globalAov",)}
LIGHT_NODE_TYPES = ("aiAreaLight", "aiSkyDomeLight", "aiPhotometricLight", "aiMeshLight", "aiLightPortal",
                    "areaLight", "spotLight", "pointLight", "directionalLight", "ambientLight", "volumeLight")
AOV_PRESETS = {
    "lighting": ["RGBA", "Z"],
    "diagnose": ["RGBA"] + list(ADDITIVE) + ["Z"],
    "comp": ["RGBA"] + list(ADDITIVE) + ["diffuse_albedo", "Z", "N", "P", "crypto_object", "crypto_material"],
    "denoise": ["RGBA", "diffuse_albedo", "N", "Z"],
}
AOV_TYPE_HINT = {"Z": "float", "A": "float", "N": "vector", "P": "vector", "diffuse_albedo": "rgb"}
_NODE_TYPES = {}


def _types():
    if not _NODE_TYPES:
        _NODE_TYPES["all"] = set(_cmds().allNodeTypes() or [])
    return _NODE_TYPES["all"]


def ensure_arnold():
    """Load MtoA, make the Arnold option nodes exist, return the MtoA version."""
    cmds = _cmds()
    if not cmds.pluginInfo("mtoa", q=True, loaded=True):
        cmds.loadPlugin("mtoa", quiet=True)
        _NODE_TYPES.clear()
    if not cmds.objExists(RO):
        try:
            import mtoa.core
            mtoa.core.createOptions()                      # [verify] creates the option nodes
        except Exception:
            pass
    if not cmds.objExists(RO):
        raise RuntimeError("%s missing after loading mtoa" % RO)
    try:
        if cmds.getAttr("defaultRenderGlobals.currentRenderer") != "arnold":
            cmds.setAttr("defaultRenderGlobals.currentRenderer", "arnold", type="string")
    except Exception:
        pass
    return cmds.pluginInfo("mtoa", q=True, version=True)


def _attr(node, key, table, required=True):
    cmds = _cmds()
    for c in table.get(key, (key,)):
        if cmds.attributeQuery(c, node=node, exists=True):
            return c
    if required:
        raise AttributeError("%s (%s) has none of %s: run job_00_probe_lighting.py and fix the table in mx_light"
                             % (node, cmds.nodeType(node), list(table.get(key, (key,)))))
    return None


def _enum_labels(plug):
    cmds = _cmds()
    node, attr = plug.split(".", 1)
    try:
        raw = (cmds.attributeQuery(attr, node=node, listEnum=True) or [""])[0]
    except Exception:
        return {}
    out = {}
    for i, item in enumerate(raw.split(":")):
        if not item:
            continue
        lab, _, idx = item.partition("=")
        out[lab.lower()] = int(idx) if idx else i
    return out


def _set_smart(plug, value):
    """setAttr that follows the plug's type: strings, enums by label, 3-vectors, numbers."""
    cmds = _cmds()
    kind = cmds.getAttr(plug, type=True)
    if kind == "string":
        cmds.setAttr(plug, "" if value is None else str(value), type="string")
    elif kind == "enum" and isinstance(value, str):
        labels = _enum_labels(plug)
        if value.lower() not in labels:
            raise ValueError("%s has no enum %r (has %s)" % (plug, value, sorted(labels)))
        cmds.setAttr(plug, labels[value.lower()])
    elif isinstance(value, (list, tuple)):
        if len(value) == 3:
            cmds.setAttr(plug, float(value[0]), float(value[1]), float(value[2]), type="double3")
        else:
            cmds.setAttr(plug, *value)
    elif isinstance(value, bool):
        cmds.setAttr(plug, int(value))
    else:
        cmds.setAttr(plug, value)


def resolve_option(key):
    """Real defaultArnoldRenderOptions attribute for a logical key or a real name, or None.
    The Global Light Sampling count has no documented MtoA name: search by pattern too."""
    cmds = _cmds()
    for c in OPTION_ALIASES.get(key, (key,)):
        if cmds.attributeQuery(c, node=RO, exists=True):
            return c
    if key == "light_samples":
        for a in cmds.listAttr(RO) or []:
            low = a.lower()
            if "light" in low and "sample" in low and not any(x in low for x in ("low", "volume", "shadow", "threshold")):
                return a
    return None


def set_options(values, strict=True):
    """Set render options by real name or logical key. Returns {'set': {attr: v}, 'missing': [...]}."""
    ensure_arnold()
    done, missing = {}, []
    for k, v in values.items():
        a = resolve_option(k)
        if a is None:
            missing.append(k)
            continue
        _set_smart(RO + "." + a, v)
        done[a] = v
    if missing and strict:
        raise AttributeError("render options not found on this MtoA: %s (run job_00_probe_lighting.py)" % missing)
    return {"set": done, "missing": missing}


def get_options(keys=REPORT_OPTIONS):
    cmds = _cmds()
    out = {}
    for k in keys:
        a = resolve_option(k)
        if a:
            out[k if k in OPTION_ALIASES else a] = cmds.getAttr(RO + "." + a)
    return out


def apply_preset(name, strict=False):
    return set_options(PRESETS[name], strict=strict)


# --------------------------------------------------------------------------- lights
def shape_and_xform(node):
    cmds = _cmds()
    node = (cmds.ls(node, long=True) or [node])[0]
    if cmds.nodeType(node) == "transform":
        sh = cmds.listRelatives(node, shapes=True, fullPath=True, noIntermediate=True) or [node]
        return sh[0], node
    return node, (cmds.listRelatives(node, parent=True, fullPath=True) or [node])[0]


def scene_lights(include_ambient=True):
    cmds = _cmds()
    types = [t for t in LIGHT_NODE_TYPES if t in _types() and (include_ambient or t != "ambientLight")]
    return sorted(set(cmds.ls(type=types, long=True) or []))


def create_light(name, kind="aiAreaLight", parent=None):
    """Get-or-create a light by name; returns (transform, shape) long names."""
    cmds = _cmds()
    found = [n for n in (cmds.ls(name, long=True) or []) if cmds.nodeType(n) == "transform"]
    if found:
        sh, xf = shape_and_xform(found[0])
        if cmds.nodeType(sh) != kind:
            raise RuntimeError("%s exists as a %s, not a %s" % (name, cmds.nodeType(sh), kind))
    else:
        try:
            made = cmds.shadingNode(kind, asLight=True, name=name)    # [verify] returns the transform
        except Exception:
            from mtoa.utils import createLocator                      # [verify] MtoA's own creator
            made = createLocator(kind, asLight=True)
            made = made[1] if isinstance(made, (list, tuple)) else made
        sh, xf = shape_and_xform(made)
        if xf.split("|")[-1] != name:
            xf = cmds.ls(cmds.rename(xf, name), long=True)[0]
            sh, xf = shape_and_xform(xf)
    if parent:
        if not cmds.objExists(parent):
            cmds.createNode("transform", name=parent)
        cur = cmds.listRelatives(xf, parent=True, fullPath=True) or []
        if not cur or cur[0].split("|")[-1] != parent.split("|")[-1]:
            xf = cmds.ls(cmds.parent(xf, parent)[0], long=True)[0]
        sh, xf = shape_and_xform(xf)
    return xf, sh


def set_light(node, strict=False, **values):
    """Set light attributes by logical key (LIGHT_ATTRS). Returns the keys not found."""
    sh, _ = shape_and_xform(node)
    missing = []
    for k, v in values.items():
        if v is None:
            continue
        a = _attr(sh, k, LIGHT_ATTRS, required=strict)
        if a is None:
            missing.append(k)
            continue
        _set_smart(sh + "." + a, v)
    return missing


def get_light(node, keys=("exposure", "intensity", "color", "normalize", "spread", "samples", "aov", "indirect",
                          "camera", "resolution", "decay", "diffuse", "specular", "volume")):
    cmds = _cmds()
    sh, _ = shape_and_xform(node)
    out = {}
    for k in keys:
        a = _attr(sh, k, LIGHT_ATTRS, required=False)
        if a:
            v = cmds.getAttr(sh + "." + a)
            out[k] = v[0] if isinstance(v, list) and len(v) == 1 and isinstance(v[0], tuple) else v
    return out


def _deg(values):
    cmds = _cmds()
    if cmds.currentUnit(q=True, angle=True) == "rad":
        return tuple(math.radians(v) for v in values)
    return tuple(values)


def place_light(xform, position, direction):
    """Put a light at `position` looking back along -direction (Maya lights emit down -Z)."""
    cmds = _cmds()
    up = cmds.upAxis(q=True, axis=True)
    rot = _deg(_mxr().aim_rotation(tuple(direction), up))
    cmds.setAttr(xform + ".rotateOrder", 0)
    cmds.xform(xform, worldSpace=True, translation=tuple(position))
    cmds.xform(xform, worldSpace=True, rotation=rot)


def size_light(xform, shape, w, h):
    cmds = _cmds()
    if shape == "disk":
        r = max(w, h) / 2.0 / DISK_UNIT
        cmds.setAttr(xform + ".scale", r, r, 1.0, type="double3")
    elif shape == "quad":
        cmds.setAttr(xform + ".scale", w / QUAD_UNIT, h / QUAD_UNIT, 1.0, type="double3")


def _tag(node, rig, role):
    cmds = _cmds()
    for attr, val in (("mxLightRig", rig), ("mxLightRole", role)):
        if not cmds.attributeQuery(attr, node=node, exists=True):
            cmds.addAttr(node, longName=attr, dataType="string")
        cmds.setAttr(node + "." + attr, val, type="string")


def make_flag(spec, parent=None, rig=""):
    """Black card (camera-invisible, casts no shadow) that shows as a dark band in reflections."""
    cmds = _cmds()
    name = spec["name"]
    if cmds.objExists(name):
        xf = cmds.ls(name, long=True)[0]
    else:
        xf = cmds.polyPlane(name=name, width=spec["size"][0], height=spec["size"][1],
                            subdivisionsX=1, subdivisionsY=1)[0]
        xf = cmds.ls(xf, long=True)[0]
        sh_name = "mxFlag_black_MTL"
        if not cmds.objExists(sh_name):
            sh_node = cmds.shadingNode("lambert", asShader=True, name=sh_name)
            cmds.setAttr(sh_node + ".color", 0.0, 0.0, 0.0, type="double3")
            cmds.setAttr(sh_node + ".diffuse", 0.0)
            sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name=sh_name + "SG")
            cmds.connectAttr(sh_node + ".outColor", sg + ".surfaceShader", force=True)
        cmds.sets(xf, e=True, forceElement=sh_name + "SG")
        if parent:
            if not cmds.objExists(parent):
                cmds.createNode("transform", name=parent)
            xf = cmds.ls(cmds.parent(xf, parent)[0], long=True)[0]
    y = v_norm(spec["facing"])
    up = UP_Y if abs(v_dot(y, UP_Y)) < 0.95 else (0.0, 0.0, 1.0)
    x = v_norm(v_cross(up, y))
    z = v_cross(x, y)
    rot = _deg(_mxr().euler_xyz_from_axes(x, y, z))
    cmds.setAttr(xf + ".rotateOrder", 0)
    cmds.xform(xf, worldSpace=True, translation=tuple(spec["position"]))
    cmds.xform(xf, worldSpace=True, rotation=rot)
    for sh in cmds.listRelatives(xf, shapes=True, fullPath=True) or []:
        for a, v in (("primaryVisibility", 0), ("castsShadows", 0)):
            if cmds.attributeQuery(a, node=sh, exists=True):
                cmds.setAttr(sh + "." + a, v)
    _tag(xf, rig, "flag")
    return xf


def apply_rig(plan, group=None):
    """Build a plan from plan_character_rig / plan_product_rig in Maya: named lights under
    one group, placed and sized, exposure in stops with intensity 1 and normalize on (LGT §
    Exposure, § Normalize), one light group per role, tagged mxLightRig / mxLightRole so later
    passes find them. Idempotent by name. Returns {'group', 'lights', 'flags', 'missing'}."""
    cmds = _cmds()
    ensure_arnold()
    grp = group or "lgt_%s_GRP" % plan["name"]
    if not cmds.objExists(grp):
        cmds.createNode("transform", name=grp)
    made, missing = {}, {}
    for L in plan["lights"]:
        if L["role"] == "dome":
            xf, sh = create_light(L["name"], "aiSkyDomeLight", grp)
            missing[L["name"]] = set_light(sh, strict=False, exposure=L["exposure"], intensity=1.0,
                                           camera=L.get("camera_visibility"), resolution=L.get("resolution"),
                                           aov=L["light_group"])
        else:
            xf, sh = create_light(L["name"], "aiAreaLight", grp)
            miss = set_light(sh, strict=False, shape=L["shape"], color=(1.0, 1.0, 1.0))
            place_light(xf, L["position"], L["direction"])
            size_light(xf, L["shape"], L["size"][0], L["size"][1])
            set_light(sh, strict=True, exposure=L["exposure"], intensity=1.0, aov=L["light_group"])
            miss += set_light(sh, strict=False, normalize=1)
            missing[L["name"]] = miss
        _tag(xf, plan["name"], L["role"])
        made[L["name"]] = {"xform": xf, "shape": sh, "role": L["role"], "light_group": L["light_group"]}
    flags = [make_flag(f, grp, plan["name"]) for f in plan.get("flags", [])]
    return {"group": cmds.ls(grp, long=True)[0], "lights": made, "flags": flags,
            "missing": dict((k, v) for k, v in missing.items() if v)}


def rig_lights(rig=None, role=None):
    """Lights tagged by apply_rig: {transform: {'rig', 'role', 'shape'}}."""
    cmds = _cmds()
    out = {}
    for sh in scene_lights():
        _, xf = shape_and_xform(sh)
        if not cmds.attributeQuery("mxLightRole", node=xf, exists=True):
            continue
        r, ro = cmds.getAttr(xf + ".mxLightRig"), cmds.getAttr(xf + ".mxLightRole")
        if (rig is None or r == rig) and (role is None or ro == role):
            out[xf] = {"rig": r, "role": ro, "shape": sh}
    return out


def set_light_groups(mapping):
    """{light: group}: the AOV Light Group string (aiAov) on each light shape, from ONE dict so
    names cannot drift (SARK 00:07:19)."""
    groups = set(g for g in mapping.values() if g)
    if len(groups) > MAX_LIGHT_GROUPS:
        raise ValueError("Arnold supports at most 16 light AOVs (AOV § Light Group Example)")
    for light, g in mapping.items():
        set_light(light, strict=True, aov=g or "")
    return sorted(groups)


def scene_light_groups():
    cmds = _cmds()
    out = {}
    for sh in scene_lights(include_ambient=False):
        a = _attr(sh, "aov", LIGHT_ATTRS, required=False)
        out[sh] = (cmds.getAttr(sh + "." + a) or "") if a else ""
    return out


# --------------------------------------------------------------------------- AOVs, driver, imagers
def aov_nodes():
    cmds = _cmds()
    out = {}
    for n in cmds.ls(type="aiAOV") or []:
        a = _attr(n, "name", AOV_ATTRS, required=False)
        if a:
            out[cmds.getAttr(n + "." + a)] = n
    return out


def add_aov(name, aov_type=None):
    """Get-or-create an Arnold AOV. MtoA's AOVInterface first [verify API], then a manual
    aiAOV wired to the options' aovList and the default driver and filter [verify plugs]."""
    cmds = _cmds()
    ensure_arnold()
    have = aov_nodes()
    if name in have:
        return have[name]
    aov_type = aov_type or AOV_TYPE_HINT.get(name)
    try:
        import mtoa.aovs as aovs
        iface = aovs.AOVInterface()
        res = iface.addAOV(name, aovType=aov_type) if aov_type else iface.addAOV(name)
        node = getattr(res, "node", None) or (res if isinstance(res, str) else None)
        if node and cmds.objExists(str(node)):
            return str(node)
        found = aov_nodes().get(name)
        if found:
            return found
    except Exception:
        pass
    node = cmds.createNode("aiAOV", name="aiAOV_" + name, skipSelect=True)
    _set_smart(node + "." + _attr(node, "name", AOV_ATTRS), name)
    if aov_type:
        try:
            _set_smart(node + "." + _attr(node, "type", AOV_ATTRS), aov_type)
        except Exception:
            pass
    cmds.connectAttr(node + ".message", RO + ".aovList", nextAvailable=True)
    cmds.connectAttr(DRIVER + ".message", node + ".outputs[0].driver", force=True)
    cmds.connectAttr(FILTER + ".message", node + ".outputs[0].filter", force=True)
    return node


def remove_aov(name):
    cmds = _cmds()
    n = aov_nodes().get(name)
    if n:
        try:
            import mtoa.aovs as aovs
            aovs.AOVInterface().removeAOV(name)          # [verify]
        except Exception:
            cmds.delete(n)
    return n


def light_groups_on_aov(aov_node, groups=None):
    """All light groups (groups=None) or a selection on an AOV (AOV § All Light Groups)."""
    if groups is None:
        _set_smart(aov_node + "." + _attr(aov_node, "light_groups", AOV_ATTRS), 1)
    else:
        _set_smart(aov_node + "." + _attr(aov_node, "light_groups_list", AOV_ATTRS), " ".join(groups))


def setup_aovs(preset="lighting", light_groups=True, extra=()):
    """Create the AOVs of a preset (AOV_PRESETS) plus extras; light groups on RGBA. Ask the
    compositor which AOVs they need first (AOV § AOVs for Image Compositing)."""
    names = list(AOV_PRESETS[preset] if isinstance(preset, str) else preset) + list(extra)
    made = {}
    for n in dict.fromkeys(names):
        made[n] = add_aov(n)
    if light_groups and "RGBA" in made:
        light_groups_on_aov(made["RGBA"])
    return made


def _shapes_of(members):
    cmds = _cmds()
    out = []
    for m in members:
        for n in cmds.ls(m, long=True) or []:
            if cmds.nodeType(n) == "transform":
                out += cmds.listRelatives(n, allDescendents=True, fullPath=True, noIntermediate=True, type="mesh") or []
                out += cmds.listRelatives(n, allDescendents=True, fullPath=True, noIntermediate=True, type="nurbsSurface") or []
            else:
                out.append(n)
    return sorted(set(out))


def add_mask_aov(name, members, value=1.0):
    """A float AOV 'mask_<name>' that is 1 on `members` and 0 elsewhere: per-shape user data
    (mtoa_constant_mx_<name>, the MtoA user-data prefix ARV-C 00:23:04 uses [verify in 5.6])
    read by aiUserDataFloat in a custom AOV's shader slot (AOV § Custom AOV > Shader)."""
    cmds = _cmds()
    attr = "mtoa_constant_mx_%s" % name
    shapes = _shapes_of(members)
    for s in shapes:
        if not cmds.attributeQuery(attr, node=s, exists=True):
            cmds.addAttr(s, longName=attr, attributeType="float", defaultValue=0.0)
        cmds.setAttr(s + "." + attr, value)
    udf = "mxMask_%s_UDF" % name
    if not cmds.objExists(udf):
        udf = cmds.shadingNode("aiUserDataFloat", asUtility=True, name=udf)         # [verify type]
    _set_smart(udf + "." + _attr(udf, "attribute", {"attribute": ("attribute", "attributeName")}), "mx_%s" % name)
    aov = add_aov("mask_%s" % name, "float")
    plug = aov + "." + _attr(aov, "shader", AOV_ATTRS)
    kind = "float"
    try:
        if not cmds.isConnected(udf + ".outValue", plug):
            cmds.connectAttr(udf + ".outValue", plug, force=True)
    except Exception:
        # the AOV's shader slot may be a colour [verify]: a colour user attribute read by aiUserDataColor
        cattr = attr + "_rgb"
        for s_ in shapes:
            if not cmds.attributeQuery(cattr, node=s_, exists=True):
                cmds.addAttr(s_, longName=cattr, attributeType="float3", usedAsColor=True)
                for c in "RGB":
                    cmds.addAttr(s_, longName=cattr + c, attributeType="float", parent=cattr)
            cmds.setAttr(s_ + "." + cattr, value, value, value, type="float3")
        udc = "mxMask_%s_UDC" % name
        if not cmds.objExists(udc):
            udc = cmds.shadingNode("aiUserDataColor", asUtility=True, name=udc)     # [verify type]
        _set_smart(udc + "." + _attr(udc, "attribute", {"attribute": ("attribute", "attributeName")}), "mx_%s_rgb" % name)
        try:
            _set_smart(aov + "." + _attr(aov, "type", AOV_ATTRS), "rgb")
        except Exception:
            pass
        cmds.connectAttr(udc + ".outColor", plug, force=True)
        udf, kind = udc, "rgb"
    return {"aov": aov, "shader": udf, "shapes": shapes, "attr": attr, "kind": kind}


def setup_exr_driver(half=True, merge=True, compression="zip", tiled=False, preserve_layer_name=True,
                     multipart=False, driver=DRIVER, saved=None):
    """The comp-ready EXR (AOV § EXR; BRJ-CM Ch.1 Format): half for colour passes, merged
    single-part (noice refuses multipart), Preserve Layer Name on, scanline for Nuke, zip so the
    pure reader and every comp package read it. `saved` (a _Saved) records old values."""
    put = saved.set if saved is not None else (lambda plug, v: _set_smart(plug, v) or True)
    vals = (("translator", "exr"), ("compression", compression), ("half", int(half)), ("tiled", int(tiled)),
            ("preserve", int(preserve_layer_name)), ("merge", int(merge)), ("multipart", int(multipart)))
    missing = []
    for key, v in vals:
        a = _attr(driver, key, DRIVER_ATTRS, required=False)
        if a is None and key == "merge":
            a2 = _attr(RO, key, DRIVER_ATTRS, required=False)
            if a2:
                put(RO + "." + a2, v)
                continue
        if a is None:
            missing.append(key)
            continue
        put(driver + "." + a, v)
    return missing


def imager_holder():
    cmds = _cmds()
    for holder in (DRIVER, RO):
        if cmds.attributeQuery("imagers", node=holder, exists=True):
            return holder
    return None


def imager_chain():
    """[(index, source node)] of the imager chain [verify the plug lives on the driver]."""
    cmds = _cmds()
    holder = imager_holder()
    if not holder:
        return None, []
    out = []
    for i in cmds.getAttr(holder + ".imagers", multiIndices=True) or []:
        src = cmds.listConnections("%s.imagers[%d]" % (holder, i), source=True, destination=False) or []
        if src:
            out.append((i, src[0]))
    return holder, out


def set_denoiser(enabled=True, first=True, output_suffix=None, create=True, saved=None):
    """OIDN on macOS (AOV § Imager Denoiser OIDN: Apple GPUs, must be first in the chain, box
    filter, full frames; OptiX and Arnold GPU do not exist on macOS). enabled=False for noise
    diagnosis renders: you cannot measure noise through a denoiser [added]. output_suffix
    '_denoised' keeps the noisy RGBA next to RGBA_denoised (multi-layer drivers only)."""
    cmds = _cmds()
    t = "aiImagerDenoiserOidn"
    if t not in _types():
        return {"available": False}
    nodes = cmds.ls(type=t) or []
    holder, chain = imager_chain()
    if not nodes and enabled and create and holder:
        n = cmds.createNode(t, name="mxLight_oidn")
        idx = (max(i for i, _ in chain) + 1) if chain else 0
        cmds.connectAttr(n + ".message", "%s.imagers[%d]" % (holder, idx), force=True)
        nodes = [n]
        holder, chain = imager_chain()
    put = saved.set if saved is not None else (lambda plug, v: _set_smart(plug, v) or True)
    for n in nodes:
        a = _attr(n, "enable", {"enable": ("enable", "enabled")}, required=False)
        if a:
            put(n + "." + a, int(enabled))
        if output_suffix is not None:
            s = _attr(n, "suffix", {"suffix": ("outputSuffix", "output_suffix")}, required=False)
            if s:
                put(n + "." + s, output_suffix)
    if first and nodes and holder and chain and chain[0][1] not in nodes:
        order = [c for c in chain if c[1] in nodes] + [c for c in chain if c[1] not in nodes]
        for i, src in chain:
            cmds.disconnectAttr(src + ".message", "%s.imagers[%d]" % (holder, i))
        for j, (_, src) in enumerate(order):
            cmds.connectAttr(src + ".message", "%s.imagers[%d]" % (holder, j), force=True)
        holder, chain = imager_chain()
    return {"available": True, "nodes": nodes, "chain": [c[1] for c in chain], "enabled": enabled,
            "first": bool(chain) and chain[0][1] in nodes}


# --------------------------------------------------------------------------- render
class _Saved(object):
    """Every change to the user's nodes, undone in reverse; nodes we create, deleted."""

    def __init__(self):
        self.ops, self.created, self.notes = [], [], []

    def set(self, plug, value):
        cmds = _cmds()
        node, attr = plug.split(".", 1)
        if not cmds.objExists(node) or not cmds.attributeQuery(attr.split("[")[0].split(".")[0], node=node, exists=True):
            self.notes.append("missing " + plug)
            return False
        if cmds.listConnections(plug, source=True, destination=False):
            self.notes.append("connected, left alone: " + plug)
            return False
        kind = cmds.getAttr(plug, type=True)
        old = cmds.getAttr(plug)
        if isinstance(old, list) and len(old) == 1 and isinstance(old[0], tuple):
            old = old[0]
        self.ops.append((plug, old, kind))
        _set_smart(plug, value)
        return True

    def restore(self):
        cmds = _cmds()
        for plug, old, kind in reversed(self.ops):
            try:
                if kind == "string":
                    cmds.setAttr(plug, old or "", type="string")
                elif isinstance(old, tuple):
                    cmds.setAttr(plug, *old, type="double3")
                else:
                    cmds.setAttr(plug, old)
            except Exception as exc:
                self.notes.append("restore %s: %s" % (plug, exc))
        self.ops = []
        for n in reversed(self.created):
            if cmds.objExists(n):
                try:
                    cmds.delete(n)
                except Exception as exc:
                    self.notes.append("delete %s: %s" % (n, exc))
        self.created = []


def _newest(patterns, t0):
    found = []
    for pat in patterns:
        found += [p for p in glob.glob(pat, recursive=True) if os.path.getmtime(p) >= t0 - 1]
    return sorted(set(found), key=os.path.getmtime)[-1] if found else None


def _add_preview_driver(prefix, saved):
    """Extra 8-bit PNG driver on the beauty: 8-bit outputs get the view transform by default
    (AOV § Arnold Driver Advanced Output > Color Management) while the EXR stays linear
    [verify the drivers plug and the prefix attribute]."""
    cmds = _cmds()
    if "aiAOVDriver" not in _types() or not cmds.attributeQuery("drivers", node=RO, exists=True):
        return None
    drv = cmds.createNode("aiAOVDriver", name="mxLight_previewDRV", skipSelect=True)
    saved.created.append(drv)
    _set_smart(drv + "." + _attr(drv, "translator", DRIVER_ATTRS), "png")
    p = _attr(drv, "prefix", DRIVER_ATTRS, required=False)
    if p:
        _set_smart(drv + "." + p, prefix + "_preview")
    cmds.connectAttr(drv + ".message", RO + ".drivers", nextAvailable=True)
    return drv


def preview_from_exr(exr, out_png, cm=None, exposure=0.0):
    """Display PNG from the EXR beauty: OCIO when importable, else the approximate curve."""
    img = read_exr(exr) if isinstance(exr, str) else exr
    disp, method = to_display(img.layer("RGBA", rgb=True), exposure, (cm or {}).get("rendering_space") or "ACEScg", cm)
    save_display(out_png, disp)
    return out_png, method


def _cam_shape(camera):
    cmds = _cmds()
    sh, xf = shape_and_xform(camera)
    if cmds.nodeType(sh) != "camera":
        raise ValueError("%s is not a camera" % camera)
    return sh, xf


def render_shot(out_dir, camera, frame=None, width=None, height=None, name="shot", aovs="lighting",
                light_groups=True, masks=None, samples=None, preview=True, denoise=None, half=True,
                keep_setup=False, cm=None):
    """Render one frame through `camera` WITH THE SCENE'S OWN LIGHTS (mx_review's clay setup is
    for models) to a merged, half, zip EXR (scene-linear, output transform off: CM § Render
    color-managed scenes) plus a display PNG for eyes and L* metrics. aovs: preset name or list;
    masks: {'subject': [nodes]} become mask_<name> AOVs; denoise None = leave the scene's
    imagers, False = OIDN off (noise diagnosis), True = OIDN on and first. Everything it
    changes is restored unless keep_setup. Returns {'exr', 'png', 'png_method', 'seconds', ...}."""
    cmds = _cmds()
    ensure_arnold()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(os.path.join(out_dir, "_raw"), exist_ok=True)
    cam_sh, cam_xf = _cam_shape(camera)
    S = _Saved()
    frame = cmds.currentTime(q=True) if frame is None else frame
    prefix = os.path.join(out_dir, "_raw", name)
    cm_old = None
    rec = {"camera": cam_xf, "frame": frame, "notes": S.notes}
    t0 = time.time()
    now = cmds.currentTime(q=True)
    try:
        for c in cmds.ls(type="camera", long=True) or []:
            S.set(c + ".renderable", 1 if c == cam_sh else 0)
        S.set("defaultRenderGlobals.animation", 0)
        S.set("defaultRenderGlobals.imageFilePrefix", prefix)
        if width and height:
            S.set("defaultResolution.width", int(width))
            S.set("defaultResolution.height", int(height))
            S.set("defaultResolution.deviceAspectRatio", float(width) / float(height))
        rec["driver_missing"] = setup_exr_driver(half=half, saved=S)
        if samples:
            for k, v in samples.items():
                a = resolve_option(k)
                if a:
                    S.set(RO + "." + a, v)
                else:
                    S.notes.append("sample option %s not found" % k)
        try:
            cm_old = (cmds.colorManagementPrefs(q=True, outputTarget="renderer", outputTransformEnabled=True),)
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=False)
        except Exception as exc:
            S.notes.append("output transform state unknown (%s)" % exc)
        before = set(aov_nodes())
        names = list(AOV_PRESETS[aovs] if isinstance(aovs, str) else (aovs or []))
        made = dict((n, add_aov(n)) for n in dict.fromkeys(names))
        if light_groups and "RGBA" in made:
            try:
                light_groups_on_aov(made["RGBA"])
            except Exception as exc:
                S.notes.append("light groups on RGBA not set: %s" % exc)
        mask_info = {}
        for mname, members in (masks or {}).items():
            mask_info[mname] = add_mask_aov(mname, members)
        if not keep_setup:
            for n, node in aov_nodes().items():
                if n not in before:
                    S.created.append(node)
            for mi in mask_info.values():
                S.created.append(mi["shader"])
        if denoise is not None:
            rec["denoiser"] = set_denoiser(enabled=bool(denoise), first=True, saved=S)
        drv = _add_preview_driver(prefix, S) if preview else None
        cmds.currentTime(frame)
        t1 = time.time()
        _mel().eval("arnoldRender -b;")                          # [verify] batch render to file
        rec["seconds"] = round(time.time() - t1, 2)
        ws = cmds.workspace(q=True, rootDirectory=True)
        rec["exr"] = _newest([prefix + "*.exr", os.path.join(ws, "images", "**", name + "*.exr")], t1)
        rec["png"] = _newest([prefix + "_preview*.png", prefix + "*.png"], t1) if drv else None
        rec["png_method"] = "arnold_view" if rec["png"] else None
        rec["rays_per_pixel"] = rays_per_pixel(get_options())
        rec["masks"] = dict((k, v["shapes"]) for k, v in mask_info.items())
    finally:
        S.restore()
        if cm_old is not None:
            try:
                cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=cm_old[0])
            except Exception as exc:
                S.notes.append("could not restore output transform: %s" % exc)
        cmds.currentTime(now)
    if not rec.get("exr"):
        raise RuntimeError("Arnold wrote no EXR for %s (check the Arnold log and the driver): %s" % (name, S.notes))
    if preview and not rec.get("png"):
        try:
            rec["png"], rec["png_method"] = preview_from_exr(rec["exr"], prefix + "_preview.png", cm)
            S.notes.append("PNG preview built from the EXR with %s view" % rec["png_method"])
        except Exception as exc:
            S.notes.append("no PNG preview: %s (run `python3 mx_light.py preview` agent-side)" % exc)
    rec["seconds_total"] = round(time.time() - t0, 2)
    return rec


def _scene_snapshot():
    cmds = _cmds()
    geo = cmds.ls(geometry=True, long=True, noIntermediate=True) or []
    snap = []
    for g in geo[:400]:
        try:
            snap.append(tuple(round(v, 5) for v in cmds.exactWorldBoundingBox(g)))
        except Exception:
            pass
    for c in (cmds.ls(type="camera", long=True) or [])[:50] + scene_lights():
        _, xf = shape_and_xform(c)
        snap.append(tuple(round(v, 5) for v in cmds.xform(xf, q=True, worldSpace=True, matrix=True)))
    return snap


def scene_static(f0, f1):
    """True when geometry bounds, cameras and lights are identical at f0 and f1."""
    cmds = _cmds()
    now = cmds.currentTime(q=True)
    try:
        cmds.currentTime(f0)
        a = _scene_snapshot()
        cmds.currentTime(f1)
        b = _scene_snapshot()
    finally:
        cmds.currentTime(now)
    return a == b


def render_seed_pair(out_dir, camera, frame=None, route="auto", **kw):
    """Two renders that differ only by sampling noise, for noise_pair(). Route 'offset': the
    AA seed follows the frame number unless Lock Sampling Pattern is on (SMP § Lock Sampling
    Pattern), so a STATIC scene rendered at frame and frame+1 with the lock off gives two
    seeds. Route 'kick': export .ass and kick twice with -set options.AA_seed [verify]. The
    denoiser is off for both (noise must be measured raw) and the diagnose AOVs are on."""
    cmds = _cmds()
    ensure_arnold()
    frame = cmds.currentTime(q=True) if frame is None else frame
    kw.setdefault("aovs", "diagnose")
    kw["denoise"] = False
    kw.setdefault("preview", False)
    notes = []
    if route in ("auto", "offset"):
        if scene_static(frame, frame + 1):
            lock = resolve_option("lock_seed")
            S = _Saved()
            try:
                if lock:
                    S.set(RO + "." + lock, 0)
                a = render_shot(os.path.join(out_dir, "seed_a"), camera, frame=frame, name="seedA", **kw)
                b = render_shot(os.path.join(out_dir, "seed_b"), camera, frame=frame + 1, name="seedB", **kw)
            finally:
                S.restore()
            return {"a": a["exr"], "b": b["exr"], "route": "offset", "seconds": a.get("seconds"),
                    "notes": notes + a["notes"] + b["notes"]}
        notes.append("scene not static between %s and %s: offset route refused" % (frame, frame + 1))
        if route == "offset":
            raise RuntimeError(notes[-1])
    kick = find_arnold_tool("kick", cmds.pluginInfo("mtoa", q=True, path=True))
    if not kick:
        raise RuntimeError("no kick found and the scene moves: render a still frame, or set MTOA_BIN (%s)" % notes)
    outs = []
    for tag, seed in (("a", 1), ("b", 2)):
        d = os.path.join(out_dir, "seed_" + tag)
        os.makedirs(d, exist_ok=True)
        ass = os.path.join(d, "shot.ass")
        cmds.currentTime(frame)
        cmds.arnoldExportAss(filename=ass, cam=_cam_shape(camera)[0])            # [verify flags]
        exr = os.path.join(d, "seed_%s.exr" % tag)
        p = subprocess.run(kick_cmd(ass, out=exr, seed=seed, kick=kick), capture_output=True, text=True, env=render_env())
        if p.returncode != 0 or not os.path.isfile(exr):
            raise RuntimeError("kick failed (%s): %s" % (p.returncode, (p.stderr or p.stdout)[-800:]))
        outs.append(exr)
    return {"a": outs[0], "b": outs[1], "route": "kick", "notes": notes}


class grey_shading(object):
    """Test shading (BR 00:04:21, BR-B ch8 Night Bar tutorial): every mesh on a linear 0.18 grey
    with a little specular while blocking lights; the original assignments come back on exit.
    Headless alternative to a Render Setup shader override [added]."""

    def __init__(self, value=0.18, specular=0.2, roughness=0.5):
        self.value, self.spec, self.rough = value, specular, roughness
        self.members, self.nodes = {}, []

    def __enter__(self):
        cmds = _cmds()
        for sg in cmds.ls(type="shadingEngine") or []:
            m = cmds.sets(sg, q=True) or []
            if m:
                self.members[sg] = m
        t = "openPBRSurface" if "openPBRSurface" in _types() else ("aiStandardSurface" if "aiStandardSurface" in _types() else "lambert")
        sh = cmds.shadingNode(t, asShader=True, name="mxLight_grey018")
        col = "baseColor" if t != "lambert" else "color"
        cmds.setAttr(sh + "." + col, self.value, self.value, self.value, type="double3")
        for a, v in (("specularWeight", self.spec), ("specular", self.spec), ("specularRoughness", self.rough)):
            if t != "lambert" and cmds.attributeQuery(a, node=sh, exists=True):
                cmds.setAttr(sh + "." + a, v)
        sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name="mxLight_grey018SG")
        cmds.connectAttr(sh + ".outColor", sg + ".surfaceShader", force=True)
        self.nodes = [sh, sg]
        meshes = [m for m in cmds.ls(type="mesh", long=True, noIntermediate=True) or []
                  if not cmds.attributeQuery("mxLightRole", node=(cmds.listRelatives(m, parent=True, fullPath=True) or [m])[0], exists=True)]
        if meshes:
            cmds.sets(meshes, e=True, forceElement=sg)
        return self

    def __exit__(self, *exc):
        cmds = _cmds()
        for sg, m in self.members.items():
            live = [x for x in m if cmds.objExists(x.split(".")[0])]
            if live and cmds.objExists(sg):
                cmds.sets(live, e=True, forceElement=sg)
        for n in self.nodes:
            if cmds.objExists(n):
                cmds.delete(n)
        return False


def solo_light_renders(out_dir, camera, lights=None, **kw):
    """Each light alone at its own exposure, one render per light, then a contact sheet: the
    check Brejon runs on every shot (BR 00:25:14). Light groups give the same information in one
    render (light_group_sheet); use this when groups are shared or missing."""
    cmds = _cmds()
    lights = lights or [l for l in scene_lights(include_ambient=False) if cmds.nodeType(l) != "aiLightPortal"]
    out = {}
    S = _Saved()
    try:
        for l in lights:
            S.set(shape_and_xform(l)[1] + ".visibility", 0)
        for l in lights:
            xf = shape_and_xform(l)[1]
            cmds.setAttr(xf + ".visibility", 1)
            r = render_shot(os.path.join(out_dir, "solo"), camera, name="solo_" + xf.split("|")[-1], light_groups=False, **kw)
            out[xf] = r
            cmds.setAttr(xf + ".visibility", 0)
    finally:
        S.restore()
    return out


# --------------------------------------------------------------------------- checks in the scene
def camera_projection(camera, width=None, height=None):
    cmds = _cmds()
    sh, xf = _cam_shape(camera)
    w = width or cmds.getAttr("defaultResolution.width")
    h = height or cmds.getAttr("defaultResolution.height")
    labels = ["fill", "horizontal", "vertical", "overscan"]
    fit = cmds.getAttr(sh + ".filmFit")
    return {"world_inverse": cmds.getAttr(xf + ".worldInverseMatrix"), "focal_mm": cmds.getAttr(sh + ".focalLength"),
            "h_ap": cmds.getAttr(sh + ".horizontalFilmAperture"), "v_ap": cmds.getAttr(sh + ".verticalFilmAperture"),
            "width": w, "height": h, "fit": labels[fit] if isinstance(fit, int) and fit < 4 else "horizontal",
            "position": tuple(cmds.xform(xf, q=True, worldSpace=True, translation=True))}


def subject_sphere_px(camera, nodes, width=None, height=None):
    """Projected bounding sphere of nodes: (center_px, radius_px) for sphere_mask()."""
    cmds = _cmds()
    bb = cmds.exactWorldBoundingBox(nodes)
    c = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
    r = 0.5 * math.sqrt((bb[3] - bb[0]) ** 2 + (bb[4] - bb[1]) ** 2 + (bb[5] - bb[2]) ** 2)
    p = camera_projection(camera, width, height)
    to_cam = v_norm(v_sub(p["position"], c))
    side = v_norm(v_cross(to_cam, UP_Y if abs(v_dot(to_cam, UP_Y)) < 0.95 else (1.0, 0.0, 0.0)))
    pts = project_points(p["world_inverse"], p["focal_mm"], p["h_ap"], p["v_ap"], p["width"], p["height"],
                         [c, v_add(c, v_mul(side, r))], p["fit"])
    if pts[0] is None or pts[1] is None:
        return None
    return pts[0], math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])


def scene_checks(camera=None, brief=None, characters=None):
    """What a lead checks in the scene file before rendering (Maya side). characters:
    [{'name': 'mary', 'head': 'mary_head_geo', 'face_forward': (0, 0, 1)}] enables the upstage
    and lens-axis tests on lights tagged by apply_rig."""
    cmds = _cmds()
    ensure_arnold()
    brief = brief or {}
    out = []
    lights = scene_lights()
    amb = [l for l in lights if cmds.nodeType(l) == "ambientLight"]
    if amb:
        out.append(_f("ambient", "fail", "ambient lights: %s" % amb, "BR-B ch8.5 Ambient lighting; Arnold does not support them (LGT)",
                      "delete them; use real sources with shadows"))
    for l in lights:
        t = cmds.nodeType(l)
        if t in ("ambientLight", "aiLightPortal"):
            continue
        v = get_light(l)
        if v.get("samples") == 0:
            out.append(_f("samples_zero", "warn", "%s has Samples 0: the light is disabled" % l, "LGT § Samples, Note",
                          "use 1 or more, or turn the light off explicitly"))
        if v.get("indirect") is not None and v["indirect"] > 1.0:
            out.append(_f("indirect_gt1", "warn", "%s Indirect %.2f" % (l, v["indirect"]), "LGT § Indirect: above 1 GI cannot converge",
                          "keep 1"))
        if t in ("pointLight", "spotLight") and v.get("decay") == 0:
            out.append(_f("no_decay", "warn", "%s has no decay (constant decay is unsupported in Arnold)" % l, "LGT § Lights (MtoA)",
                          "quadratic decay; flat falloff via spread, spot lens radius or a distant light"))
        if t == "aiSkyDomeLight" and v.get("resolution"):
            width = None
            for f in cmds.listConnections(l + ".color", source=True, destination=False, type="file") or []:
                path = (cmds.getAttr(f + ".fileTextureName") or "") if cmds.attributeQuery("fileTextureName", node=f, exists=True) else ""
                width = image_width(path) if path and os.path.isfile(path) else None
            reflected = brief.get("reflective", brief.get("kind", brief.get("scene")) == "product")
            for fd in dome_resolution_check(v["resolution"], width, reflected):
                fd["message"] = "%s: %s" % (l, fd["message"])
                out.append(fd)
        if v.get("normalize") == 0:
            out.append(_f("normalize_off", "info", "%s normalize off: resizing changes energy" % l, "LGT § Normalize"))
        if t == "aiSkyDomeLight":
            for f in cmds.listConnections(l + ".color", source=True, destination=False, type="file") or []:
                cs = cmds.getAttr(f + ".colorSpace") if cmds.attributeQuery("colorSpace", node=f, exists=True) else ""
                rs = (cm_state().get("rendering_space") or "")
                if cs.lower() in ("raw", "utility - raw") and "acescg" in rs.lower():
                    out.append(_f("hdri_raw", "warn", "HDRI %s tagged Raw under ACEScg: read as ACEScg" % f,
                                  "CM § ACES Workflow calls it incorrect; BRJ-CM Ch.1.5 IDT", "set the linear Rec.709 (sRGB) input space"))
    groups = scene_light_groups()
    aovs = aov_nodes()
    sel = None
    rgba = aovs.get("RGBA")
    all_on = True
    if rgba:
        a = _attr(rgba, "light_groups", AOV_ATTRS, required=False)
        all_on = bool(cmds.getAttr(rgba + "." + a)) if a else True
        b = _attr(rgba, "light_groups_list", AOV_ATTRS, required=False)
        sel = (cmds.getAttr(rgba + "." + b) or "").split() if b else None
    out += group_contract(groups, sel, all_on)
    unnamed = [shape_and_xform(l)[1].split("|")[-1] for l in lights if not shape_and_xform(l)[1].split("|")[-1].startswith("lgt_")]
    if unnamed:
        out.append(_f("light_names", "info", "lights not named lgt_<role>_<target>_NN: %s" % unnamed[:10],
                      "BR-B ch8.5 Natural Lighting vocabulary; ARV-L 00:06:16", "practicals by what they are, dramatic lights by what they do"))
    emissive = []
    for t, a in (("openPBRSurface", "emissionLuminance"), ("aiStandardSurface", "emission"), ("standardSurface", "emission")):
        if t in _types():
            for n in cmds.ls(type=t) or []:
                if cmds.attributeQuery(a, node=n, exists=True) and (cmds.getAttr(n + "." + a) or 0) > 0:
                    emissive.append(n)
    if emissive:
        out.append(_f("emission_as_light", "info", "emissive shaders: %s (in no light group: emission is O, not L, in LPEs)" % emissive[:10],
                      "LGT § Mesh Light vs Emission: emission is the noisiest light; AOV § Syntax (O object emission)",
                      "light with area or mesh lights (aiAov gives them a group); keep emission for the visible glow, "
                      "its pass is the emission AOV or an LPE C.*O; a bounce card is lit by a light and lands in that light's group"))
    if brief.get("scene") == "interior" and any(cmds.nodeType(l) == "aiSkyDomeLight" for l in lights):
        if not cmds.ls(type="aiLightPortal"):
            out.append(_f("portals", "warn", "interior lit by a skydome without portals", "LGT § Light Portal; SMP § Denoising a Room Interior",
                          "portals over every opening, Portal Mode Interior Only"))
    for ch in characters or []:
        head = ch["head"]
        bb = cmds.exactWorldBoundingBox(head)
        hc = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
        cam_pos = camera_projection(camera)["position"]
        to_cam = v_sub(cam_pos, hc)
        tagged = rig_lights(ch["name"])
        keys = [x for x, i in tagged.items() if i["role"] == "key"]
        if len(keys) != 1:
            out.append(_f("one_key", "warn", "%s has %d tagged keys" % (ch["name"], len(keys)), "BR-B ch6 Balance", "one key per character"))
        for k in keys:
            to_key = v_sub(tuple(cmds.xform(k, q=True, worldSpace=True, translation=True)), hc)
            ok = is_upstage(ch["face_forward"], to_cam, to_key)
            out.append(_f("key_upstage", "pass" if ok else "fail", "%s key %s" % (ch["name"], "upstage" if ok else "DOWNSTAGE"),
                          "BR-B ch8.5 Lighting upstage and downstage", None if ok else "rotate the key to the far side of the face"))
        for w in [x for x, i in tagged.items() if i["role"] in ("wrap", "fill")]:
            to_w = v_sub(tuple(cmds.xform(w, q=True, worldSpace=True, translation=True)), hc)
            ang = v_angle(to_w, horizontal(to_cam))
            if ang < 30.0:
                out.append(_f("fill_lens_axis", "warn", "%s is %.0f deg from the lens axis" % (w, ang), "BR 00:13:46 no fill from the camera side",
                              "move it toward the key side"))
    return out


def _safe(plug, default=None):
    """getAttr that returns `default` when the node or attribute does not exist."""
    cmds = _cmds()
    try:
        node, attr = plug.split(".", 1)
        if not cmds.objExists(node) or not cmds.attributeQuery(attr.split("[")[0], node=node, exists=True):
            return default
        return cmds.getAttr(plug)
    except Exception:
        return default


def render_settings_report(scene="product", glass_interfaces=0, metal_interreflection=False, preview=False):
    """Options, driver, denoiser and colour state plus settings_lint findings."""
    cmds = _cmds()
    ensure_arnold()
    opts = get_options()
    try:
        mb = bool(opts.get("motion_blur"))
    except Exception:
        mb = False
    dof = False
    for cam in cmds.ls(type="camera", long=True) or []:
        if cmds.getAttr(cam + ".renderable") and cmds.attributeQuery("aiEnableDOF", node=cam, exists=True):
            dof = dof or bool(cmds.getAttr(cam + ".aiEnableDOF"))
    drv = {}
    for k in DRIVER_ATTRS:
        a = _attr(DRIVER, k, DRIVER_ATTRS, required=False)
        if a:
            drv[k] = cmds.getAttr(DRIVER + "." + a)
    holder, chain = imager_chain()
    oidn = [n for _, n in chain if cmds.nodeType(n) == "aiImagerDenoiserOidn"]
    oidn_on = any(bool(_safe(n + ".enable", 1)) for n in oidn)
    pfilter = _safe(FILTER + ".aiTranslator") if cmds.objExists(FILTER) else None      # [verify] filter type plug
    region = bool(_safe("defaultRenderGlobals.useRenderRegion", 0))                     # [verify]
    fnd = settings_lint(opts, scene, glass_interfaces, metal_interreflection, mb, dof, True, preview,
                        opts.get("light_samples"), denoise=oidn_on, pixel_filter=pfilter, region=region)
    if chain and oidn and chain[0][1] not in oidn:
        fnd.append(_f("denoiser_first", "fail", "OIDN is not first in the imager chain %s" % [c[1] for c in chain],
                      "AOV § Imager Denoiser OIDN: denoisers before any other imager", "set_denoiser(first=True)"))
    if drv.get("translator") == "exr" and drv.get("multipart"):
        fnd.append(_f("multipart", "warn", "multipart EXR", "AOV § Multipart: noice refuses multipart", "merged single-part"))
    return {"options": opts, "rays_per_pixel": rays_per_pixel(opts, opts.get("light_samples")), "driver": drv,
            "imagers": [c[1] for c in chain], "motion_blur": mb, "dof": dof, "findings": fnd}


# --------------------------------------------------------------------------- colour management
def cm_state():
    """Colour state of this session [verify every flag in help(cmds.colorManagementPrefs)]."""
    cmds = _cmds()
    q = lambda **kw: cmds.colorManagementPrefs(q=True, **kw)
    st = {}
    for key, kw in (("enabled", {"cmEnabled": True}), ("config", {"configFilePath": True}),
                    ("rendering_space", {"renderingSpaceName": True}), ("display", {"displayName": True}),
                    ("view", {"viewTransformName": True}), ("inputs", {"inputSpaceNames": True}),
                    ("rendering_spaces", {"renderingSpaceNames": True}), ("views", {"viewNames": True}),
                    ("output_renderer", {"outputTarget": "renderer", "outputTransformEnabled": True})):
        try:
            st[key] = q(**kw)
        except Exception as exc:
            st[key] = None
            st.setdefault("errors", []).append("%s: %s" % (key, exc))
    st["env_OCIO"] = os.environ.get("OCIO")
    st["env_policy"] = os.environ.get("MAYA_COLOR_MANAGEMENT_POLICY_FILE")
    st["maya"] = cmds.about(version=True)
    return st


TONEMAP_HINTS = ("aces", "sdr", "filmic", "agx", "video", "rec.709", "rec709", "srgb")
NOT_JUDGMENT_VIEWS = ("raw", "un-tone-mapped", "untone", "log", "linear")


def cm_audit(st, delivering_exr=True):
    """Render-side colour findings (pure: `st` from cm_state()). Texture spaces belong to
    scenario-maya-lookdev's lint; the dome HDRI is checked in scene_checks."""
    out = []
    if st.get("enabled") is False:
        out.append(_f("cm_off", "fail", "colour management is off", "BRJ-CM Ch.1: the first project decision; CM",
                      "enable it (Preferences > Color Management)"))
    rs = (st.get("rendering_space") or "").lower()
    if rs and not ("acescg" in rs or "linear" in rs or "scene-linear" in rs):
        out.append(_f("rendering_space", "fail", "rendering space %r is not scene-linear" % st.get("rendering_space"),
                      "CM § Choose a rendering space: render in a linear space; never ACES2065-1 (BRJ-CM Ch.1.5)", "ACEScg"))
    view = (st.get("view") or "").lower()
    if view and any(x in view for x in NOT_JUDGMENT_VIEWS) and not any(x in view for x in ("aces", "sdr")):
        out.append(_f("view", "warn", "view %r does not tone map: lights will be judged too dark and over-rigged" % st.get("view"),
                      "BRJ-CM Ch.1 A simple visual example; MLC 00:01:43", "the ACES view of the config (query viewNames)"))
    if delivering_exr and st.get("output_renderer"):
        out.append(_f("output_transform", "fail", "Apply Output Transform to Renderer is ON while delivering EXR",
                      "CM § Render color-managed scenes: off for EXR and comp", "turn it off; PNG previews get the view from the 8-bit driver"))
    if st.get("env_policy"):
        out.append(_f("policy", "info", "policy file %s overrides scene and OCIO settings" % st["env_policy"], "CM § Configure color management"))
    if st.get("env_OCIO"):
        out.append(_f("ocio_env", "info", "OCIO=%s overrides the scene config" % st["env_OCIO"], "CM § Configure color management"))
    if not out:
        out.append(_f("cm", "pass", "scene-linear %s, view %s" % (st.get("rendering_space"), st.get("view")), "CM"))
    return out


def cm_audit_scene(delivering_exr=True):
    """cm_audit on this session, plus scenario-maya-lookdev's texture lint when that skill is present."""
    st = cm_state()
    out = cm_audit(st, delivering_exr)
    ld = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-maya-lookdev", "scripts"))
    if os.path.isdir(ld):
        if ld not in sys.path:
            sys.path.append(ld)
        try:
            import mx_shade
            v = mx_shade.verdict(mx_shade.lint_scene())
            ok = bool(v.get("pass")) if isinstance(v, dict) else bool(v)
            out.append(_f("texture_contract", "pass" if ok else "fail", "scenario-maya-lookdev lint: %s" % (
                json.dumps(v, default=str)[:400]), "scenario-maya-lookdev (colour space, plug, destination per map)",
                None if ok else "hand back to scenario-maya-lookdev"))
        except Exception as exc:
            out.append(_f("texture_contract", "info", "scenario-maya-lookdev lint not run: %s" % exc, "scenario-maya-lookdev"))
    return {"state": st, "findings": out}


def classify_view(linear, display):
    """Which transform turned a grey card's scene-linear value into its PNG value: 'raw'
    (no transform), 'srgb' (display curve without tone map) or 'aces_like' (tone mapped) [added:
    the calibration test of the Arnold digest P5]."""
    cands = {"raw": linear, "srgb": float(srgb_encode(min(1.0, linear))),
             "aces_like": float(display_approx(linear, 0.0, "rec709"))}
    best = min(cands, key=lambda k: abs(cands[k] - display))
    return {"view": best, "expected": cands, "measured": display, "error": abs(cands[best] - display)}


# --------------------------------------------------------------------------- render setup
def _rs():
    import maya.app.renderSetup.model.renderSetup as renderSetup
    return renderSetup


def make_layer(name, patterns=("*",), overrides=(), renderable=True):
    """Render Setup layer with one collection per pattern ('chr::*' for namespaced assets: CM §
    Troubleshoot the members I added via expression) and absolute overrides (node, attr, value);
    time, distance and angle values in internal units (CM § Troubleshoot overrides) [verify API]."""
    rs = _rs().instance()
    lyr = None
    for l in rs.getRenderLayers():
        if l.name() == name:
            lyr = l
    lyr = lyr or rs.createRenderLayer(name)
    cols = []
    for i, pat in enumerate(patterns):
        col = lyr.createCollection("%s_col%d" % (name, i))
        col.getSelector().setPattern(pat)
        cols.append(col)
        for node, attr, value in overrides:
            ov = col.createAbsoluteOverride(node, attr)
            ov.setAttrValue(value)
    lyr.setRenderable(renderable)
    return lyr


def export_render_setup(path):
    """Render Setup as a JSON template (Render Setup nodes are dropped on import or reference,
    so templates are how setups travel: CM § Render setup best practices) [verify encode]."""
    data = _rs().instance().encode(None)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    return path


def import_render_setup(path):
    rsm = _rs()
    with open(path) as f:
        rsm.instance().decode(json.load(f), rsm.DECODE_AND_OVERWRITE, None)       # [verify]
    return path


# --------------------------------------------------------------------------- probe
def probe(out_path=None):
    """Dump the names this module guesses: option, driver, light, AOV and camera attributes,
    node types, colour names, bundled Python modules and Arnold tools. Run once per install."""
    cmds = _cmds()
    rep = {"maya": cmds.about(version=True), "mtoa": ensure_arnold(), "python": sys.version.split()[0]}
    types = _types()
    rep["types"] = dict((t, t in types) for t in LIGHT_NODE_TYPES + (
        "aiAOV", "aiAOVDriver", "aiAOVFilter", "aiImagerDenoiserOidn", "aiImagerDenoiserNoice", "aiImagerLightMixer",
        "aiLightBlocker", "aiBarndoor", "aiGobo", "aiLightDecay", "aiUserDataFloat", "aiAtmosphereVolume",
        "openPBRSurface", "aiStandardSurface"))
    rep["options_attrs"] = sorted(cmds.listAttr(RO) or [])
    rep["driver_attrs"] = sorted(cmds.listAttr(DRIVER) or [])
    rep["resolved_options"] = dict((k, resolve_option(k)) for k in list(OPTION_ALIASES) + list(REPORT_OPTIONS))
    made, errors = [], {}

    def attempt(key, fn):
        try:
            rep[key] = fn()
        except Exception as exc:
            errors[key] = "%s: %s" % (type(exc).__name__, exc)

    def light_probe(t):
        xf, sh = create_light("mxProbe_" + t, t)
        made.append(xf)
        info = {"attrs": sorted(cmds.listAttr(sh) or []),
                "resolved": dict((k, _attr(sh, k, LIGHT_ATTRS, required=False)) for k in LIGHT_ATTRS),
                "created_as": [xf, sh], "node_type": cmds.nodeType(sh)}
        tr = _attr(sh, "shape", LIGHT_ATTRS, required=False)
        if tr:
            info["shape_value"] = cmds.getAttr(sh + "." + tr)
            info["shape_type"] = cmds.getAttr(sh + "." + tr, type=True)
        return info

    def camera_probe():
        cam = cmds.camera(name="mxProbe_cam")
        made.append(cam[0])
        return sorted(a for a in (cmds.listAttr(cam[1]) or []) if a.startswith("ai"))

    def aov_probe():
        aov = add_aov("mxProbeAOV", "float")
        made.append(aov)
        return {"node": aov, "attrs": sorted(cmds.listAttr(aov) or [])}

    try:
        for t in ("aiAreaLight", "aiSkyDomeLight"):
            if t in types:
                attempt("light_" + t, lambda t=t: light_probe(t))
        attempt("camera_ai_attrs", camera_probe)
        attempt("aov", aov_probe)
    finally:
        for n in made:
            if cmds.objExists(n):
                cmds.delete(n)
    attempt("imagers", lambda: imager_chain()[1])
    attempt("cm", cm_state)
    rep["errors"] = errors
    mods = {}
    for m in ("numpy", "PIL", "OpenImageIO", "PyOpenColorIO", "mtoa.aovs", "mtoa.core", "mtoa.utils",
              "maya.app.renderSetup.model.renderSetup"):
        try:
            __import__(m)
            mods[m] = True
        except Exception as exc:
            mods[m] = "no: %s" % exc
    rep["modules"] = mods
    mp = cmds.pluginInfo("mtoa", q=True, path=True)
    rep["tools"] = dict((t, find_arnold_tool(t, mp)) for t in ("kick", "noice", "maketx", "oiiotool"))
    if out_path:
        with open(out_path, "w") as f:
            json.dump(rep, f, indent=1, default=str)
    return rep


# =========================================================================== CLI
def _jsonable(x):
    return json.loads(json.dumps(x, default=str))


def main(argv):
    """Subcommands. In mayapy (through mx_run): probe, render, render-pair, rig-product,
    rig-character, checks. In any python3 with numpy: analyze, noise, sums, sheet, bracket,
    preview, exr-info, budget, dof."""
    import argparse
    ap = argparse.ArgumentParser(prog="mx_light")
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("probe"); p.add_argument("--out")
    p = sub.add_parser("render"); p.add_argument("--camera", required=True); p.add_argument("--out", required=True)
    p.add_argument("--frame", type=float); p.add_argument("--width", type=int); p.add_argument("--height", type=int)
    p.add_argument("--aovs", default="lighting"); p.add_argument("--mask", action="append", default=[],
                                                                   help="name=node1,node2")
    p.add_argument("--denoise", choices=("keep", "on", "off"), default="keep"); p.add_argument("--name", default="shot")
    p = sub.add_parser("render-pair"); p.add_argument("--camera", required=True); p.add_argument("--out", required=True)
    p.add_argument("--frame", type=float); p.add_argument("--width", type=int); p.add_argument("--height", type=int)
    p.add_argument("--settings", help="JSON dict of render options for both renders")
    for n in ("rig-product", "rig-character"):
        p = sub.add_parser(n); p.add_argument("--name", required=True); p.add_argument("--camera", required=True)
        p.add_argument("--target", required=True, help="product root or head node")
        p.add_argument("--face-forward", default="0,0,1")
    p = sub.add_parser("checks"); p.add_argument("--camera"); p.add_argument("--scene-kind", default="product")
    p.add_argument("--glass-interfaces", type=int, default=0)
    p = sub.add_parser("analyze"); p.add_argument("--png"); p.add_argument("--exr"); p.add_argument("--out", required=True)
    p.add_argument("--kind", default="product"); p.add_argument("--brief"); p.add_argument("--mask", action="append", default=[],
                                                                                           help="name=path.png or name=exr:layer")
    p = sub.add_parser("noise"); p.add_argument("--a", required=True); p.add_argument("--b", required=True)
    p = sub.add_parser("sums"); p.add_argument("--exr", required=True)
    p = sub.add_parser("sheet"); p.add_argument("--exr", required=True); p.add_argument("--out", required=True)
    p = sub.add_parser("bracket"); p.add_argument("--exr", required=True); p.add_argument("--out", required=True)
    p = sub.add_parser("preview"); p.add_argument("--exr", required=True); p.add_argument("--out", required=True)
    p = sub.add_parser("exr-info"); p.add_argument("--exr", required=True)
    p = sub.add_parser("dof"); p.add_argument("--near", type=float, required=True); p.add_argument("--far", type=float, required=True)
    p.add_argument("--focal", type=float, required=True); p.add_argument("--film", type=float, default=36.0)
    p.add_argument("--units-per-mm", type=float, default=0.1)
    p = sub.add_parser("budget"); p.add_argument("--seconds", type=float, required=True)
    p.add_argument("--test-size", default="960x540"); p.add_argument("--size", default="1920x1080")
    p.add_argument("--test-aa", type=int); p.add_argument("--aa", type=int); p.add_argument("--frames", type=int, default=1)
    p.add_argument("--machines", type=int, default=1); p.add_argument("--hours", type=float)
    a = ap.parse_args(argv)
    if a.cmd == "probe":
        return _jsonable(probe(a.out))
    if a.cmd == "render":
        masks = dict((m.split("=", 1)[0], m.split("=", 1)[1].split(",")) for m in a.mask)
        dn = {"keep": None, "on": True, "off": False}[a.denoise]
        return _jsonable(render_shot(a.out, a.camera, a.frame, a.width, a.height, a.name, a.aovs, masks=masks, denoise=dn))
    if a.cmd == "render-pair":
        kw = {"width": a.width, "height": a.height}
        if a.settings:
            kw["samples"] = json.loads(a.settings)
        return _jsonable(render_seed_pair(a.out, a.camera, a.frame, **kw))
    if a.cmd in ("rig-product", "rig-character"):
        cmds = _cmds()
        bb = cmds.exactWorldBoundingBox(a.target)
        cam = camera_projection(a.camera)["position"]
        if a.cmd == "rig-product":
            plan = plan_product_rig(a.name, bb[:3], bb[3:], cam)
        else:
            c = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
            plan = plan_character_rig(a.name, c, max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]), cam,
                                      tuple(float(x) for x in a.face_forward.split(",")))
        return _jsonable({"plan": plan, "checks": rig_plan_checks(plan), "made": apply_rig(plan)})
    if a.cmd == "checks":
        return _jsonable({"scene": scene_checks(a.camera, {"scene": a.scene_kind}),
                          "settings": render_settings_report(a.scene_kind, a.glass_interfaces), "color": cm_audit_scene()})
    if a.cmd == "analyze":
        brief = default_brief(a.kind)
        if a.brief:
            with open(a.brief) as f:
                brief.update(json.load(f))
        masks = dict(m.split("=", 1) for m in a.mask)
        rep = analyze_frame(a.png, a.exr, brief, masks or None)
        paths = write_report(rep, a.out)
        if a.exr:
            try:
                paths["light_groups"] = light_group_sheet(a.exr, os.path.join(a.out, "light_groups.png"))["sheet"]
                paths["bracket"] = exposure_bracket(a.exr, os.path.join(a.out, "bracket.png"))["sheet"]
            except Exception as exc:
                paths["sheet_error"] = str(exc)
        return _jsonable({"verdict": verdict(rep), "paths": paths, "findings": rep["findings"]})
    if a.cmd == "noise":
        return _jsonable(noise_pair(a.a, a.b))
    if a.cmd == "sums":
        return _jsonable(check_sums(a.exr))
    if a.cmd == "sheet":
        return _jsonable(light_group_sheet(a.exr, a.out))
    if a.cmd == "bracket":
        return _jsonable(exposure_bracket(a.exr, a.out))
    if a.cmd == "preview":
        return _jsonable(preview_from_exr(a.exr, a.out))
    if a.cmd == "exr-info":
        return _jsonable(exr_info(a.exr))
    if a.cmd == "dof":
        return _jsonable(dof_plan(a.near, a.far, a.focal, a.film, units_per_mm=a.units_per_mm))
    if a.cmd == "budget":
        ts = tuple(int(x) for x in a.test_size.lower().split("x"))
        tg = tuple(int(x) for x in a.size.lower().split("x"))
        e = extrapolate_time(a.seconds, ts, tg, a.test_aa, a.aa)
        return _jsonable({"per_frame": e, "sequence": sequence_budget(e["seconds"], a.frames, a.machines, a.hours)})
    ap.print_help()
    return None


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1:]), indent=1, default=str))
