"""
zb_sculpt: turn the experts' stroke work into agent actions in ZBrush 2026 (agent side).

Runs on the agent side only (system python3 with numpy and PIL). It never runs inside ZBrush:
it plans strokes from model-space forms, aims them through the view transform, and sends short
code to ZBrush through zb_launch, where the scenario-zbrush-expert toolkit (zb_ops, zb_stroke) does the
work. Import it next to the lead toolkit:

    import sys
    sys.path[:0] = ["<skills/scenario-zbrush-expert/scripts>", "<skills/scenario-zbrush-sculpting/scripts>"]
    import zb_sculpt as zs
    sc = zs.Scene.capture("/abs/out/s1", view="front")          # OBJ + transform + canvas mask
    brow = zs.Form("brow", [(-0.45, 0.35, 0.8), (0.45, 0.35, 0.8)], width=0.18)
    for spec in zs.clay_pass(sc, [brow], stage="S1"):            # ClayBuildup across the brow
        print(zs.pass_report(zs.apply_pass(spec), expect_sign=+1))

What it holds:
  * STAGES and BRUSHES: the stage ladder and brush settings the experts show, with sources.
  * Resolution helpers: DynaMesh square law, Divide x4, projection density rule.
  * Scene: one view of the active SubTool (transform, pivot, vertices, normals, canvas mask)
    and the projection of model points to canvas pixels (vectorised zb_stroke.Camera).
  * Stroke-set generators in canvas pixels: hatch_across (T1), two_direction (T2),
    descent (T3), move_drags (T4), crease (T5), fill_between (T6).
  * IntensityModel: per-stroke volume calibration for constant-pressure scripted strokes.
  * Pass specs and execution: pass_spec, pass_code, apply_pass, pass_report.
  * Review metrics on canvas PNGs: silhouette masks, IoU, shape IoU, mirror asymmetry, band
    energies; stage_gate.
  * Code builders for ZSphere armatures, Adaptive Skin, appended primitives, checkpoints
    (the Morph dial refuses a lost target), a checked re-DynaMesh (remesh_code), subdivision
    level discipline (level_for, set_level_code) and a perspective look render
    (persp_snapshot_code); eye_rotation for Costa's outward eye angle.
  * PERSP_PATHS: perspective lives at Draw:Perspective in 2026.2.1 [xml].

Evidence tags as in scenario-zbrush-expert: [v01]..[v03] ran through the bridge on 2026-09-24,
[obj] measured offline on tests/code/zbrush-expert/fixtures/v03_sphere.obj, [doc] Maxon docs or
SDK examples, [macro] a shipped 2026 macro path, [verify] not confirmed (the live test that
settles it is named), [added] this module's own default. Expert numbers carry name + timestamp.

NOT YET RUN IN ZBRUSH: every function that talks to ZBrush (Scene.capture, apply_pass,
run_calibration, the code builders) is covered by tests/code/zbrush-sculpting/live_s0*.py.
The pure functions are covered offline by tests/code/zbrush-sculpting/test_zb_sculpt.py.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import glob
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
if os.path.isdir(LEAD_SCRIPTS) and LEAD_SCRIPTS not in sys.path:
    sys.path.insert(0, LEAD_SCRIPTS)
import zb_stroke  # noqa: E402  (lead toolkit: stroke strings, Camera, views)

try:
    import numpy as np
except ImportError:  # the image and mesh helpers need numpy; the planners do not
    np = None

CALIBRATION_FILE = os.path.join(HERE, "sculpt_calibration.json")
DEFAULT_PORT = 7788

# --------------------------------------------------------------------------------------------
# Expert tables
# --------------------------------------------------------------------------------------------

# Henning Sanden blocks with ClayBuildup at the default Z 20 and "maybe 30% of the actual
# pressure" (0PaYUUvgwYM 00:04:58). A synthesized stroke has no pen pressure (zb_stroke:
# PRESSURE_TOKEN unknown [verify live_02]), so the constant-pressure equivalent of an expert
# value is z * 0.3 when pressure scales intensity linearly [inference, sculpting digest 5.1].
PRESSURE_EQUIV = 0.30


def constant_pressure_z(z_hand, pressure=PRESSURE_EQUIV, z_min=1, z_max=100):
    """Z Intensity for a scripted stroke that imitates an expert's Z at light pen pressure."""
    return int(max(z_min, min(z_max, round(z_hand * pressure))))


# Brush settings read from the experts' screens. z_hand is the Z Intensity on screen, used with
# pen pressure. z is the start value for a scripted (constant-pressure) stroke: the pressure
# equivalent for the clay brushes, the displayed value for the others until calibrated
# (no expert gives their pressure). size = brush diameter as a fraction of the head (model)
# width in the current view, measured on the video frames (approximate).
BRUSHES = {
    "clay_block": dict(brush="ClayBuildup", stroke_type="FreeHand", alpha="Alpha 06", focal=-56,
                       z_hand=20, z=constant_pressure_z(20), size=(0.15, 0.35), direction="across",
                       src="Henning, 0PaYUUvgwYM frame 00:00:45, 00:04:58; TpS0QdlfHWU 00:07:20"),
    "clay_refine": dict(brush="ClayBuildup", stroke_type="FreeHand", alpha="Alpha 06", focal=-56,
                        z_hand=6, z=constant_pressure_z(6), size=(0.03, 0.08), direction="across",
                        src="Henning Z 5 'or even 2', 0PaYUUvgwYM 00:08:51, frames 00:09:45 to "
                            "00:15:38; z 2 = digest T3 derivation"),
    "clay_finish": dict(brush="ClayBuildup", stroke_type="FreeHand", alpha="Alpha Off", focal=-56,
                        z_hand=7, z=constant_pressure_z(7), size=(0.03, 0.04), direction="across",
                        src="Morten, 0PaYUUvgwYM 00:31:28, frames 00:31:35 (Z 7), 00:33:05 (Z 3)"),
    "clay_secondary": dict(brush="ClayBuildup", stroke_type="FreeHand", alpha="Alpha 06", focal=-56,
                           z_hand=23, z=constant_pressure_z(23), size=(0.10, 0.15), direction="across",
                           src="Henning, TpS0QdlfHWU frames 00:19:39, 00:20:51; 0PaYUUvgwYM "
                               "frame 00:18:04"),
    "move": dict(brush="Move", stroke_type="Dots", alpha="Alpha Off", focal=0, z_hand=51, z=51,
                 size=(0.6, 0.9), direction="drag",
                 src="Henning, TpS0QdlfHWU frames 00:02:15, 00:17:15 (design moves)"),
    "move_local": dict(brush="Move", stroke_type="Dots", alpha="Alpha Off", focal=0, z_hand=51,
                       z=51, size=(0.1, 0.15), direction="drag",
                       src="Henning, TpS0QdlfHWU frame 00:18:00 (eye shaping, about 0.12 of the face)"),
    "dam": dict(brush="DamStandard", stroke_type="Dots", alpha=None, focal=-14, z_hand=15, z=15,
                zsub=True, size=(0.03, 0.07), direction="along",
                src="Henning 'ten points below where it starts', 0PaYUUvgwYM 00:18:42, frame "
                    "00:19:34; Z 33 in TpS0QdlfHWU frame 00:05:54 for big cuts"),
    "standard": dict(brush="Standard", stroke_type="Dots", alpha="Alpha Off", focal=0, z_hand=25,
                     z=25, size=(0.01, 0.02), direction="along",
                     src="Henning, 0PaYUUvgwYM frames 00:27:33 to 00:30:32 (Z 25, 21, 11)"),
    "trim": dict(brush="TrimDynamic", stroke_type="FreeHand", alpha="Alpha Off", focal=-56,
                 z_hand=43, z=30, zsub=True, sign_mode="fixed", size=(0.08, 0.20),
                 direction="across",
                 src="Henning, TpS0QdlfHWU frame 00:15:45 (Z 43, 'lower the intensity' "
                     "00:15:51); z 30 [added]; size about a form's width, TpS0QdlfHWU frames"),
}

# The stage ladder (sculpting digests, section 1 of _digest_sculpting_workflow_visual.md).
# points: (low, high) point counts at the stage, per kind of subject. A head is a bust sketched
# from a sphere (Henning 2018 and 2020); a creature is Pablo's ZSphere-based full creature.
STAGES = {
    "S0": dict(name="base", goal="proportions and silhouette",
               points={"head": (40e3, 100e3), "creature": (5e3, 7e3)},
               how={"head": "Sphere3D, Make PolyMesh3D, DynaMesh 128 (43,401 points, TpS0QdlfHWU "
                            "frame 00:09:40; 43,480 on this install [obj])",
                    "creature": "ZSpheres, Adaptive Skin Density 2, DynaMesh Resolution 0 (5,994 "
                                "points, tbQqC6tyDBQ frame 00:01:58)"},
               brushes=(), symmetry=True, sdiv="none",
               gate="limb lengths and silhouette read (Flat Color, front and side)"),
    "S1": dict(name="primary blockout", goal="big forms and every landmark present",
               points={"head": (40e3, 100e3), "creature": (28e3, 43e3)},
               how={"head": "Move then DynaMesh loop (TpS0QdlfHWU 00:02:34); ClayBuildup across; "
                            "blocking end 96,222 points (TpS0QdlfHWU frame 00:14:16)",
                    "creature": "big Move plus Smooth (tbQqC6tyDBQ 00:02:29); primitives as "
                                "SubTools; DynaMesh 64 to 128 per piece (frames 00:05:55 to 00:10:25)"},
               brushes=("move", "clay_block", "trim"), symmetry=True, sdiv="lowest",
               gate="silhouette and proportions right, every element present (G2o6fdoACIQ 00:02:50)"),
    "S2": dict(name="primary refinement", goal="clean shapes, no junk bumps",
               points={"head": (400e3, 830e3), "creature": (300e3, 400e3)},
               how={"head": "DynaMesh 376 = 825,837 points (TpS0QdlfHWU frame 00:18:45) or Divide "
                            "to 399,028 (0PaYUUvgwYM frame 00:07:30)",
                    "creature": "merge pieces, DynaMesh 256 = 366,728 points (tbQqC6tyDBQ frame "
                                "00:11:55)"},
               brushes=("clay_refine", "trim", "move_local"), symmetry=True, sdiv="lowest",
               gate="no ambiguous bumps, stroke marks falling (TpS0QdlfHWU 00:15:51)"),
    "S3": dict(name="secondary (mid frequency)", goal="shapes within shapes, broken symmetry",
               points={"head": (400e3, 2.5e6), "creature": (3e6, 4e6)},
               how={"head": "Divide to about 400k (0PaYUUvgwYM) or DynaMesh 648 = 2.457M "
                            "(TpS0QdlfHWU frame 00:21:27)",
                    "creature": "ZRemesher, Divide to SDiv 4 or 5 (3.819M on the body, tbQqC6tyDBQ "
                                "frame 00:12:38), project the sketch back"},
               brushes=("clay_secondary", "clay_refine"), symmetry=False, sdiv="2 to 3",
               gate="reads strongly at thumbnail size without detail (tbQqC6tyDBQ 00:14:05)"),
    "S4": dict(name="contrast", goal="sharp where reality is sharp, soft next to it",
               points={"head": (1.5e6, 1.7e6), "creature": (3e6, 4e6)},
               how={"head": "Divide to 1.596M (0PaYUUvgwYM frame 00:18:49)",
                    "creature": "stay at SDiv 5 (tbQqC6tyDBQ)"},
               brushes=("dam", "clay_refine"), symmetry=False, sdiv="top",
               gate="creases sharp and varied in weight (0PaYUUvgwYM 00:20:55)"),
    "S5": dict(name="tertiary", goal="specificity; hand off skin detail",
               points={"head": (1.5e6, 11e6), "creature": (3e6, 11e6)},
               how={"head": "top level; film troll at SDiv 7, 10.9M points (TpS0QdlfHWU frame 00:00:45)",
                    "creature": "top level"},
               brushes=("standard",), symmetry=False, sdiv="top",
               gate="details sit on mid forms; silhouette unchanged (tbQqC6tyDBQ 00:13:27)"),
    "S6": dict(name="integration and finish", goal="no brush strokes on skin, clear focus areas",
               points={"head": (1.5e6, 11e6), "creature": (3e6, 11e6)},
               how={"head": "ClayBuildup Alpha Off at low Z, one small light smooth (TpS0QdlfHWU "
                            "00:22:58)", "creature": "same"},
               brushes=("clay_finish",), symmetry=False, sdiv="top",
               gate="skin reads as skin, not clay (TpS0QdlfHWU 00:21:53)"),
}

# Constant-pressure refinement ladder (digest T3, derived from Henning's 23, 13, 3, 1 and 6, 2
# at pen pressure, TpS0QdlfHWU frames 00:21:27 to 00:24:09; 0PaYUUvgwYM 00:08:51).
DESCENT_Z = (6, 3, 2, 1)


def brush_preset(key, **override):
    """Copy of a BRUSHES entry with overrides (the source string is kept)."""
    if key not in BRUSHES:
        raise KeyError(f"unknown preset {key!r}; one of {sorted(BRUSHES)}")
    d = dict(BRUSHES[key])
    d.update(override)
    return d


# --------------------------------------------------------------------------------------------
# Resolution and budgets
# --------------------------------------------------------------------------------------------

# DynaMesh face size. On this install a radius-1 sphere at Resolution 128 gave 44,020 faces for
# an area of 12.63 and a longest side of 2.04 [obj], i.e. sqrt(area / faces) = K * longest / res
# with K = 1.063. One sample: treat as a first guess and re-measure on the agent's own mesh
# (dynamesh_k_from). Henning's sphere gave 43,401 points at 128 (TpS0QdlfHWU frame 00:09:40),
# which matches the 43,480 points measured here.
DYNAMESH_K = 1.063


def next_dynamesh_resolution(res_now, points_now, points_target):
    """Points scale with Resolution squared (Henning's bust: 128, 376, 648 gave 96,222, 825,837,
    2.457M; TpS0QdlfHWU frames 00:14:16, 00:18:45, 00:21:27), so res_next = res_now *
    sqrt(target / now) [derived in the sculpting digest]."""
    if points_now <= 0 or points_target <= 0:
        raise ValueError("point counts must be positive")
    return int(round(res_now * math.sqrt(points_target / points_now)))


def dynamesh_faces_estimate(resolution, area, longest, k=DYNAMESH_K):
    """Faces a DynaMesh at `resolution` should produce on a surface of `area` whose bounding box
    longest side is `longest` (same units, from zb_ops.stats or zb_audit)."""
    edge = k * longest / float(resolution)
    return int(round(area / (edge * edge)))


def dynamesh_resolution_for(faces_target, area, longest, k=DYNAMESH_K):
    """Inverse of dynamesh_faces_estimate: the Resolution that should give `faces_target`."""
    return int(round(k * longest * math.sqrt(faces_target / float(area))))


def dynamesh_k_from(resolution, area, longest, faces):
    """Measure K on the agent's own mesh right after a DynaMesh (for the next estimate)."""
    return math.sqrt(area / float(faces)) * resolution / float(longest)


def divides_needed(points_now, points_target):
    """Divide multiplies points by about 4 (98,787 to 399,028 to 1.596M, 0PaYUUvgwYM frames;
    Pablo 390k to 1.5M to 6M, rArw79xEpvE 00:10:18). Smallest n reaching the target."""
    n = 0
    p = float(points_now)
    while p * 1.02 < points_target:     # "about 4": 4.04 on Henning's head, 3.85 on Pablo's body
        p *= 4
        n += 1
        if n > 12:
            raise ValueError("more than 12 divides: check the target")
    return n


def projection_ready(source_points, target_points):
    """Pablo: the target's top level needs at least the sketch's point count ('more or slightly
    more', 745,000 against about 400,000; VRisbJQAaZw 00:17:24)."""
    return target_points >= source_points


def remesh_due(edge_cv_now, edge_cv_after_remesh, factor=1.5):
    """Re-DynaMesh when polygons stretch (DynaMesh doc, Methods). Measurable proxy [added]: the
    edge-length coefficient of variation from zb_audit has grown by `factor` since the last
    remesh (v03 sphere right after a remesh: 0.19 [obj])."""
    return edge_cv_now > factor * edge_cv_after_remesh


def stage_budget(stage, kind="head"):
    s = STAGES[stage]
    return s["points"].get(kind)


# --------------------------------------------------------------------------------------------
# Projection helpers (numpy versions of zb_stroke.Camera, same convention object)
# --------------------------------------------------------------------------------------------

def _need_np():
    if np is None:
        raise RuntimeError("numpy is required for this helper (agent side)")
    return np


def _cam_parts(cam):
    c = cam.conv
    r = np.asarray(cam.r, dtype=float)
    axes = np.asarray(c.axes, dtype=float)
    pivot = np.asarray(cam.pivot, dtype=float)
    return c, r, axes, pivot


def project_np(cam, verts):
    """(N, 3) model points (OBJ export space) to (N, 3) = canvas x, canvas y, depth (larger =
    closer to the camera). Same result as zb_stroke.Camera.project, vectorised."""
    _need_np()
    v = np.asarray(verts, dtype=float).reshape(-1, 3)
    c, r, axes, pivot = _cam_parts(cam)
    view = ((v - pivot) * axes) @ r.T
    g = c.k * cam.s
    out = np.empty_like(view)
    out[:, 0] = cam.pos[0] + g * c.fx * view[:, 0]
    out[:, 1] = cam.pos[1] + g * c.fy * view[:, 1]
    out[:, 2] = c.fz * view[:, 2]
    return out


def facing_np(cam, normals):
    """> 0 where model-space normals point toward the camera (cosine of the view angle)."""
    _need_np()
    n = np.asarray(normals, dtype=float).reshape(-1, 3)
    c, r, axes, _ = _cam_parts(cam)
    return c.fz * ((n * axes) @ r.T)[:, 2]


def vertex_normals(mesh):
    """Area-weighted vertex normals of a zb_audit.Mesh (first triangle of each face)."""
    _need_np()
    v = mesh.verts
    st = mesh.starts
    i0 = mesh.flat[st]
    i1 = mesh.flat[st + 1]
    i2 = mesh.flat[st + 2]
    fn = np.cross(v[i1] - v[i0], v[i2] - v[i0])
    if mesh.sizes.max(initial=3) > 3:        # add the second triangle of quads
        q = mesh.sizes >= 4
        j0, j2, j3 = mesh.flat[st[q]], mesh.flat[st[q] + 2], mesh.flat[st[q] + 3]
        fn[q] += np.cross(v[j2] - v[j0], v[j3] - v[j0])
    n = np.zeros_like(v)
    for idx in (i0, i1, i2):
        np.add.at(n, idx, fn)
    q = mesh.sizes >= 4
    if q.any():
        np.add.at(n, mesh.flat[st[q] + 3], fn[q])
    ln = np.linalg.norm(n, axis=1)
    ln[ln == 0] = 1.0
    return n / ln[:, None]


def frame_on(point, ppu, rotation, doc_w, doc_h, pivot, convention=None):
    """9-value transform that puts model `point` at the canvas centre at `ppu` canvas pixels per
    model unit, for a view `rotation` (degrees). Uses the same convention as zb_stroke.Camera,
    so it inherits its [verify live_03/live_04] status for views other than front."""
    conv = convention or zb_stroke.DEFAULT_CONVENTION
    s = ppu / conv.k
    r = zb_stroke.rotation_matrix(rotation[0], rotation[1], rotation[2], conv.perm, conv.order,
                                  conv.signs)
    pv = pivot if conv.use_pivot else (0.0, 0.0, 0.0)
    q = [(point[i] - pv[i]) * conv.axes[i] for i in range(3)]
    v = [sum(r[i][j] * q[j] for j in range(3)) for i in range(3)]
    px = doc_w / 2.0 - conv.k * s * conv.fx * v[0]
    py = doc_h / 2.0 - conv.k * s * conv.fy * v[1]
    return [px, py, 0.0, s, s, s, float(rotation[0]), float(rotation[1]), float(rotation[2])]


def best_view(normal, views=None, convention=None, allowed=None):
    """The canonical view (zb_stroke.VIEWS) whose camera faces `normal` most: strokes land
    best on surfaces seen head-on. Returns (name, facing cosine). allowed: names to consider
    (only the views live_04 has verified, once it ran)."""
    views = views or zb_stroke.VIEWS
    best = None
    for name, rot in views.items():
        if allowed and name not in allowed:
            continue
        cam = zb_stroke.Camera([0, 0, 0, 1, 1, 1, rot[0], rot[1], rot[2]], (0, 0, 0), convention)
        f = cam.facing(normal)
        if best is None or f > best[1] + 1e-9:
            best = (name, f)
    return best


def screen_plane_fraction(cam, direction):
    """How much of a model-space displacement lies in the screen plane (1 = fully). The Move
    brush moves in the screen plane (brushes doc, Move), so a move is aimed from a view where
    this is near 1."""
    d = [float(x) for x in direction]
    ln = math.sqrt(sum(x * x for x in d)) or 1.0
    f = cam.facing([x / ln for x in d])
    return math.sqrt(max(0.0, 1.0 - f * f))


# --------------------------------------------------------------------------------------------
# Canvas masks (what is model and what is background on the exported canvas PNG)
# --------------------------------------------------------------------------------------------

def _bg_distance(rgb, edge=4):
    """Per-pixel distance to the row background. ZBrush's canvas background is a vertical
    gradient; each row's background is the median of its outer `edge` columns (the same model
    as zb_review.silhouette_bbox)."""
    im = rgb.astype(np.int16)
    ref = np.median(np.concatenate([im[:, :edge], im[:, -edge:]], axis=1), axis=1)
    return np.abs(im - ref[:, None, :]).max(axis=2)


def _flood_exterior(bg, max_iter=2000):
    """Background pixels connected to the image border (so dark cavities inside the model that
    look like background are not treated as holes). Straight runs from the four borders first,
    then 4-neighbour growth into concave pockets."""
    left = np.cumprod(bg, axis=1).astype(bool)
    right = np.cumprod(bg[:, ::-1], axis=1)[:, ::-1].astype(bool)
    top = np.cumprod(bg, axis=0).astype(bool)
    bottom = np.cumprod(bg[::-1, :], axis=0)[::-1, :].astype(bool)
    ext = left | right | top | bottom
    for _ in range(max_iter):
        grown = ext.copy()
        grown[1:, :] |= ext[:-1, :]
        grown[:-1, :] |= ext[1:, :]
        grown[:, 1:] |= ext[:, :-1]
        grown[:, :-1] |= ext[:, 1:]
        grown &= bg
        if np.array_equal(grown, ext):
            break
        ext = grown
    return ext


def silhouette_mask(png_or_array, threshold=28, edge=4, fill_holes=True):
    """Boolean model mask of a canvas PNG (True = model)."""
    _need_np()
    if isinstance(png_or_array, str):
        from PIL import Image
        with Image.open(png_or_array) as im:
            rgb = np.asarray(im.convert("RGB"))
    else:
        rgb = np.asarray(png_or_array)
        if rgb.ndim == 2:
            rgb = np.stack([rgb] * 3, axis=2)
    bg = _bg_distance(rgb, edge) <= threshold
    bg[:, :edge] = True
    bg[:, -edge:] = True
    if fill_holes:
        return ~_flood_exterior(bg)
    return ~bg


def erode(mask, radius):
    """Square erosion by `radius` pixels (integral image, numpy only)."""
    _need_np()
    r = int(radius)
    if r <= 0:
        return mask.copy()
    m = mask.astype(np.int64)
    h, w = m.shape
    ii = np.zeros((h + 1, w + 1), dtype=np.int64)
    ii[1:, 1:] = m.cumsum(0).cumsum(1)
    y0 = np.clip(np.arange(h) - r, 0, h)
    y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(w) - r, 0, w)
    x1 = np.clip(np.arange(w) + r + 1, 0, w)
    s = (ii[np.ix_(y1, x1)] - ii[np.ix_(y0, x1)] - ii[np.ix_(y1, x0)] + ii[np.ix_(y0, x0)])
    area = (y1 - y0)[:, None] * (x1 - x0)[None, :]
    return s == area


def footprint_from_points(proj_xy, width, height, splat_px=2):
    """Model mask from projected vertices (when no canvas PNG is at hand): each vertex marks a
    (2*splat+1)^2 block. Coarse; the canvas PNG mask is exact."""
    _need_np()
    m = np.zeros((int(height), int(width)), dtype=bool)
    xy = np.round(np.asarray(proj_xy, dtype=float)[:, :2]).astype(int)
    ok = (xy[:, 0] >= 0) & (xy[:, 0] < width) & (xy[:, 1] >= 0) & (xy[:, 1] < height)
    xy = xy[ok]
    for dy in range(-splat_px, splat_px + 1):
        for dx in range(-splat_px, splat_px + 1):
            x = np.clip(xy[:, 0] + dx, 0, width - 1)
            y = np.clip(xy[:, 1] + dy, 0, height - 1)
            m[y, x] = True
    return m


def clip_runs(points, inside, min_len_px=0.0, min_points=2):
    """Split a stroke into the runs of consecutive points for which inside(x, y) is True; keep
    runs of at least `min_points` points and `min_len_px` length. Scripted strokes should start
    and stay on the model (a stroke that starts off the mesh may turn the view [verify live_02])."""
    runs, cur = [], []
    for p in points:
        if inside(p[0], p[1]):
            cur.append(p)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= min_points and zb_stroke.path_length(r) >= min_len_px]


# --------------------------------------------------------------------------------------------
# Paths in canvas space
# --------------------------------------------------------------------------------------------

def _cumlen(path):
    out = [0.0]
    for a, b in zip(path, path[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def _point_at(path, cum, s):
    s = max(0.0, min(cum[-1], s))
    for i in range(len(path) - 1):
        if cum[i + 1] >= s or i == len(path) - 2:
            seg = cum[i + 1] - cum[i]
            t = 0.0 if seg <= 0 else (s - cum[i]) / seg
            a, b = path[i], path[i + 1]
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    return tuple(path[-1])


def _tangent_at(path, cum, s, half_window):
    a = _point_at(path, cum, s - half_window)
    b = _point_at(path, cum, s + half_window)
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy)
    if ln < 1e-9:
        return (1.0, 0.0)
    return (dx / ln, dy / ln)


def sub_path(path, s0, s1, spacing):
    """The part of a polyline between arc lengths s0 and s1, resampled at `spacing`."""
    cum = _cumlen(path)
    s0, s1 = max(0.0, s0), min(cum[-1], s1)
    if s1 <= s0:
        return [_point_at(path, cum, s0)]
    n = max(1, int(math.ceil((s1 - s0) / spacing)))
    return [_point_at(path, cum, s0 + (s1 - s0) * i / n) for i in range(n + 1)]


def point_spacing(diam_px, frac=0.1, lo=2.0, hi=16.0):
    """Distance between synthesized stroke points: 0.1 D or less (digest 7.3 [added]), kept
    between 2 px and 16 px (the proven v02 stroke used 20 px steps) [added]."""
    return max(lo, min(hi, frac * diam_px))


def _rot(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def _round_pts(pts):
    return [(float(round(x)), float(round(y))) for x, y in pts]


# --------------------------------------------------------------------------------------------
# Stroke-set generators (canvas pixels)
# --------------------------------------------------------------------------------------------

def hatch_across(path_px, width_px, diam_px, station=0.4, overhang=0.55, spacing=None,
                 jitter_deg=12.0, len_jitter=0.1, alternate=True, phase=0.0, seed=0):
    """T1, across the form (Henning: strokes perpendicular to the form so the peak lands on its
    centre and fades to the edges, 0PaYUUvgwYM 00:02:13 to 00:02:45; 'stroke stroke stroke',
    TpS0QdlfHWU 00:08:04).

    Stations every station*D along the centre line (digest 0.3 to 0.5 D [added]); each stroke
    spans -overhang*W to +overhang*W around the centre line; angle jitter and length jitter and
    alternating start side imitate a hand so marks do not line up [added]. phase shifts the
    stations by a fraction of a station (0.5 = in the valleys of the previous pass, 'fill in
    the gaps', 0PaYUUvgwYM 00:06:04). Returns a list of point lists."""
    if len(path_px) < 2:
        raise ValueError("path needs 2 or more points")
    rnd = random.Random(seed)
    sp = spacing or point_spacing(diam_px)
    cum = _cumlen(path_px)
    total = cum[-1]
    step = max(1.0, station * diam_px)
    out = []
    i = 0
    s = phase * step
    while s <= total + 1e-6:
        p = _point_at(path_px, cum, s)
        t = _tangent_at(path_px, cum, s, max(1.0, min(diam_px / 2.0, total / 4.0)))
        n = (-t[1], t[0])
        if jitter_deg:
            n = _rot(n, rnd.uniform(-jitter_deg, jitter_deg))
        half = overhang * width_px * (1.0 + (rnd.uniform(-len_jitter, len_jitter) if len_jitter else 0.0))
        a = (p[0] - n[0] * half, p[1] - n[1] * half)
        b = (p[0] + n[0] * half, p[1] + n[1] * half)
        if alternate and i % 2:
            a, b = b, a
        out.append(_round_pts(zb_stroke.line(a, b, sp)))
        i += 1
        s += step
    return out


def strokes_along(path_px, width_px, diam_px, count=3, spread=0.4, spacing=None, seed=0,
                  jitter_px=None):
    """T2 pass A (Pablo: 'from left to right multiple times, with multiple separate strokes',
    tbQqC6tyDBQ 00:05:59): `count` copies of the centre line offset across it by spread*D steps,
    clipped to the form width."""
    rnd = random.Random(seed)
    sp = spacing or point_spacing(diam_px)
    base = zb_stroke.resample(path_px, sp)
    cum = _cumlen(path_px)
    out = []
    offs = [(k - (count - 1) / 2.0) * spread * diam_px for k in range(count)]
    lim = width_px / 2.0
    jit = diam_px * 0.05 if jitter_px is None else jitter_px
    for o in offs:
        o = max(-lim, min(lim, o))
        pts = []
        for j, p in enumerate(base):
            s = cum[-1] * j / max(1, len(base) - 1)
            t = _tangent_at(path_px, cum, s, max(1.0, diam_px / 2.0))
            n = (-t[1], t[0])
            e = rnd.uniform(-jit, jit) if jit else 0.0
            pts.append((p[0] + n[0] * (o + e), p[1] + n[1] * (o + e)))
        out.append(_round_pts(pts))
    return out


def two_direction(path_px, width_px, diam_px, count=3, spread=0.4, across_scale=0.6, seed=0):
    """T2 (Pablo, tbQqC6tyDBQ 00:05:59 to 00:06:32: several strokes in one direction, then
    smaller strokes perpendicular to them; never a muscle in one stroke). Returns two passes:
    [("along", strokes, D), ("across", strokes, 0.6 D)]."""
    a = strokes_along(path_px, width_px, diam_px, count, spread, seed=seed)
    d2 = diam_px * across_scale
    b = hatch_across(path_px, width_px, d2, seed=seed + 1)
    return [("along", a, diam_px), ("across", b, d2)]


def descent(diam0_px, z_ladder=DESCENT_Z, shrink=0.75, zoom=1.3, alpha_off_last=2):
    """T3 intensity descent (Henning: 'set the intensity lower and lower and lower; every time
    you decrease the intensity you can zoom in a little bit more', TpS0QdlfHWU 00:21:53 to
    00:22:26; Alpha Off for the last passes, 0PaYUUvgwYM 00:31:28). zoom and shrink per
    iteration are [added] (digest 7.3). Each pass shifts stations by half a station. Returns
    per-pass parameters: zoom is cumulative (frame the next Scene at base ppu * zoom);
    diam_px is the brush size in base-view pixels, so the on-screen diameter in the zoomed
    view is diam_px * zoom (the brush shrinks on the model by `shrink` per pass)."""
    out = []
    for i, z in enumerate(z_ladder):
        out.append({"iteration": i, "z": int(z), "diam_px": diam0_px * shrink ** i,
                    "zoom": zoom ** i, "phase": 0.5 * (i % 2),
                    "alpha": "Alpha Off" if i >= len(z_ladder) - alpha_off_last else "Alpha 06"})
    return out


def move_drags(grab_px, target_px, diam_px, max_step_frac=0.5, points=6):
    """T4 big Move (Henning: Move then DynaMesh, TpS0QdlfHWU 00:02:34; Pablo: big Move then
    Smooth, tbQqC6tyDBQ 00:02:29). A displacement longer than max_step*D is split into several
    drags, each grabbing where the previous one ended, to limit stretching [added, digest T4]."""
    dist = math.dist(grab_px, target_px)
    if dist < 1e-9:
        return []
    n = max(1, int(math.ceil(dist / (max_step_frac * diam_px) - 1e-9)))
    out = []
    for k in range(n):
        a = (grab_px[0] + (target_px[0] - grab_px[0]) * k / n,
             grab_px[1] + (target_px[1] - grab_px[1]) * k / n)
        b = (grab_px[0] + (target_px[0] - grab_px[0]) * (k + 1) / n,
             grab_px[1] + (target_px[1] - grab_px[1]) * (k + 1) / n)
        seg = [(a[0] + (b[0] - a[0]) * j / (points - 1), a[1] + (b[1] - a[1]) * j / (points - 1))
               for j in range(points)]
        out.append(_round_pts(seg))
    return out


def crease(path_px, diam_px, fractions=(1.0, 0.6, 0.35), wobble=0.1, spacing=None, seed=0):
    """T5 Dam_Standard along the crease (Henning: not one line of constant weight, 'soft, then
    harder, then softer, then harder again, with small overlaps', 0PaYUUvgwYM 00:20:55 to
    00:21:29; along the form, never across, 00:22:34). Without pen pressure the depth
    variation comes from overlapping sub-strokes: the full path, then shorter ones of
    `fractions` of its length placed at random along it, each with a lateral wobble of up to
    wobble*D [added numbers, digest T5]. If zb_stroke.PRESSURE_TOKEN becomes known (live_02),
    a pressure profile can replace the sub-strokes."""
    rnd = random.Random(seed)
    sp = spacing or point_spacing(diam_px)
    cum = _cumlen(path_px)
    total = cum[-1]
    out = []
    for f in fractions:
        f = max(0.05, min(1.0, f))
        s0 = 0.0 if f >= 1.0 else rnd.uniform(0.0, (1.0 - f) * total)
        pts = sub_path(path_px, s0, s0 + f * total, sp)
        amp = rnd.uniform(0.3, 1.0) * wobble * diam_px
        ph = rnd.uniform(0, 2 * math.pi)
        wav = max(2.0, diam_px * 4.0)
        wob = []
        cum_s = _cumlen(pts)
        for p, s in zip(pts, cum_s):
            t = _tangent_at(path_px, cum, s0 + s, max(1.0, diam_px / 2.0))
            n = (-t[1], t[0])
            o = amp * math.sin(ph + 2 * math.pi * s / wav)
            wob.append((p[0] + n[0] * o, p[1] + n[1] * o))
        out.append(_round_pts(wob))
    return out


def fill_between(path_a, path_b, diam_px, station=0.4, inset=0.15, spacing=None):
    """T6 'coloring inside the lines' (Henning, 0PaYUUvgwYM 00:26:22): after two cuts, short
    clay strokes across the gap between them. Strokes stop `inset` of the gap short of each cut
    so they do not fill the cuts [added]."""
    sp = spacing or point_spacing(diam_px)
    ca, cb = _cumlen(path_a), _cumlen(path_b)
    n = max(2, int(max(ca[-1], cb[-1]) / max(1.0, station * diam_px)) + 1)
    out = []
    for i in range(n):
        t = i / (n - 1)
        a = _point_at(path_a, ca, t * ca[-1])
        b = _point_at(path_b, cb, t * cb[-1])
        a2 = (a[0] + (b[0] - a[0]) * inset, a[1] + (b[1] - a[1]) * inset)
        b2 = (b[0] + (a[0] - b[0]) * inset, b[1] + (a[1] - b[1]) * inset)
        out.append(_round_pts(zb_stroke.line(a2, b2, sp)))
    return out


# --------------------------------------------------------------------------------------------
# Forms (model space) and the Scene they are aimed through
# --------------------------------------------------------------------------------------------

class Form:
    """A form the agent intends to sculpt, in model space (the space of zb_ops.export_obj).

    path: centre line, 2 or more points (use Form.blob for a round mass).
    width: model units across the form. sign: +1 build (Zadd), -1 carve (Zsub).
    kind: "mass" (clay across), "crease" (Dam_Standard along), "plane" (TrimDynamic across)."""

    def __init__(self, name, path, width, sign=+1, kind="mass", note=""):
        pts = [tuple(float(c) for c in p) for p in path]
        if len(pts) < 2:
            raise ValueError("a Form path needs 2 or more points (Form.blob for a round mass)")
        if any(len(p) != 3 for p in pts):
            raise ValueError("Form points are 3D model-space points")
        self.name, self.path, self.width = name, pts, float(width)
        self.sign, self.kind, self.note = (1 if sign >= 0 else -1), kind, note

    @classmethod
    def crease(cls, name, path, width, sign=-1, note=""):
        """A crease for crease_pass: sign -1 cuts (Dam_Standard's default Zsub), +1 raises a
        sharp ridge (Alt, TpS0QdlfHWU 00:06:18)."""
        return cls(name, path, width, sign, "crease", note)

    @classmethod
    def blob(cls, name, center, radius, axis=(1.0, 0.0, 0.0), sign=+1, kind="mass", note=""):
        ln = math.sqrt(sum(a * a for a in axis)) or 1.0
        u = [a / ln * radius * 0.8 for a in axis]
        return cls(name, [[c - d for c, d in zip(center, u)], [c + d for c, d in zip(center, u)]],
                   2.0 * radius, sign, kind, note)

    def half(self, side=+1, axis=0):
        """The part of the path on one side of the symmetry plane (model x = 0 by default).
        With symmetry on, a stroke that crosses the plane is mirrored onto itself and doubles
        at the centre [added]; plan one side only."""
        keep = []
        pts = self.path
        for a, b in zip(pts, pts[1:]):
            ina, inb = a[axis] * side >= 0, b[axis] * side >= 0
            if ina:
                keep.append(a)
            if ina != inb:
                t = a[axis] / (a[axis] - b[axis])
                keep.append(tuple(a[i] + (b[i] - a[i]) * t for i in range(3)))
        if pts[-1][axis] * side >= 0:
            keep.append(pts[-1])
        dedup = [keep[0]] if keep else []
        for p in keep[1:]:
            if math.dist(p, dedup[-1]) > 1e-9:
                dedup.append(p)
        if len(dedup) < 2:
            return None
        return Form(self.name + ("_R" if side > 0 else "_L"), dedup, self.width, self.sign,
                    self.kind, self.note)

    def resampled(self, step):
        """Model-space path resampled every `step` units (for surface snapping)."""
        out = [self.path[0]]
        for a, b in zip(self.path, self.path[1:]):
            n = max(1, int(math.ceil(math.dist(a, b) / step)))
            out += [tuple(a[i] + (b[i] - a[i]) * k / n for i in range(3)) for k in range(1, n + 1)]
        return out

    def to_dict(self):
        return {"name": self.name, "path": self.path, "width": self.width, "sign": self.sign,
                "kind": self.kind, "note": self.note}


class Scene:
    """One view of the active SubTool, everything a stroke plan needs.

    transform: the 9 floats of zbc.get_transform() read back after framing; pivot: centre of
    query_mesh3d(2, 3) (the full bbox, as zb_stroke.Camera.from_zbrush); verts/normals: numpy
    arrays from the OBJ export; mask: model mask of the canvas PNG (None when not exported);
    doc: (width, height). Strokes planned here are valid for this transform only: every
    pass_spec carries it and pass_code restores it before stroking."""

    def __init__(self, transform, pivot, doc, verts=None, normals=None, mask=None, obj=None,
                 png=None, stats=None, convention=None):
        self.transform = [float(v) for v in transform]
        self.pivot = tuple(float(v) for v in pivot)
        self.doc = (int(doc[0]), int(doc[1]))
        self.cam = zb_stroke.Camera(self.transform, self.pivot, convention)
        self.verts, self.normals, self.mask = verts, normals, mask
        self.obj, self.png, self.stats = obj, png, stats or {}
        self._proj = None
        self._eroded = {}

    # construction ---------------------------------------------------------------------------
    @classmethod
    def from_files(cls, obj_path, transform, pivot, doc, png=None, convention=None, stats=None):
        """Scene from an OBJ export, a transform and a pivot (offline, no ZBrush)."""
        import zb_audit
        m = zb_audit.load_obj(obj_path)
        mask = silhouette_mask(png) if png else None
        return cls(transform, pivot, doc, m.verts, vertex_normals(m), mask, obj_path, png, stats,
                   convention)

    @classmethod
    def capture(cls, out_dir, view=None, ppu=None, center=None, margin=0.75, obj=True, png=True,
                port=DEFAULT_PORT, timeout=180, tag=None, convention=None):
        """Frame the view in ZBrush, export the OBJ and the canvas PNG, read the transform back.
        view: a zb_stroke.VIEWS name or a rotation triple (None keeps the current view).
        ppu: canvas pixels per model unit (None: Maxon's framing rule, the model's longest side
        spans `margin` of the short canvas side). center: model point to put at the canvas
        centre (zoomed work on one region). NOT YET RUN IN ZBRUSH (live_s02)."""
        import zb_launch
        out_dir = os.path.abspath(out_dir)
        os.makedirs(out_dir, exist_ok=True)
        info = zb_launch.run(
            "zb_ops.ensure_edit()\n"
            "result = {'doc': [zbc.get('Document:Width'), zbc.get('Document:Height')],"
            " 't': [float(v) for v in zbc.get_transform()],"
            " 'bbox': [float(v) for v in zbc.query_mesh3d(2, 3)]}",
            modules=("zb_ops",), port=port, timeout=timeout)
        w, h = info["doc"]
        b = info["bbox"]
        pivot = ((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)
        conv = convention or zb_stroke.DEFAULT_CONVENTION
        t = None
        if view is not None or ppu is not None or center is not None:
            rot = (zb_stroke.VIEWS[view] if isinstance(view, str) else
                   tuple(view) if view is not None else tuple(info["t"][6:9]))
            if ppu is None and center is None:
                t = zb_stroke.frame_transform(b, w, h, rot, margin, conv)
            else:
                cur_ppu = conv.k * info["t"][3]
                t = frame_on(center or pivot, ppu or cur_ppu, rot, w, h, pivot, conv)
        n = len(glob.glob(os.path.join(out_dir, "scene_*.json")))
        tag = tag or f"scene_{n:03d}"
        objp = os.path.join(out_dir, tag + ".obj") if obj else None
        pngp = os.path.join(out_dir, tag + ".png") if png else None
        code = (
            "zb_ops.ensure_edit()\n"
            f"t = {t!r}\n"
            "if t:\n"
            "    zbc.set_transform(*t)\n"
            "    zbc.update(redraw_ui=True)\n"
            "p = zb_ops.resolve('persp', required=False)\n"
            "if p and zbc.get(p) >= 0.5:\n"
            "    zbc.set(p, 0)\n"
            "    zbc.update(redraw_ui=True)\n"
            "r = {'t': [float(v) for v in zbc.get_transform()], 'stats': zb_ops.stats(3)}\n"
            f"if {objp!r}:\n"
            f"    r['obj'] = zb_ops.export_obj({objp!r}, overwrite=True)\n"
            f"if {pngp!r}:\n"
            f"    r['png'] = zb_ops.export_canvas({pngp!r}, overwrite=True)\n"
            "result = r\n")
        r = zb_launch.run(code, modules=("zb_ops",), port=port, timeout=timeout)
        meta = {"view": view, "ppu": ppu, "center": center, "transform_set": t,
                "transform_read": r["t"], "pivot": pivot, "doc": [w, h], "stats": r["stats"],
                "obj": objp, "png": pngp}
        with open(os.path.join(out_dir, tag + ".json"), "w") as fh:
            json.dump(meta, fh, indent=1, default=repr)
        if objp:
            sc = cls.from_files(objp, r["t"], pivot, (w, h), pngp, conv, r["stats"])
        else:
            sc = cls(r["t"], pivot, (w, h), mask=silhouette_mask(pngp) if pngp else None,
                     png=pngp, stats=r["stats"], convention=conv)
        return sc

    # geometry -------------------------------------------------------------------------------
    @property
    def ppu(self):
        return self.cam.pixels_per_unit()

    @property
    def proj(self):
        if self._proj is None and self.verts is not None:
            self._proj = project_np(self.cam, self.verts)
        return self._proj

    def model_width_px(self):
        """Width of the model in this view (projected vertices, else the mask)."""
        if self.proj is not None:
            return float(self.proj[:, 0].max() - self.proj[:, 0].min())
        if self.mask is not None and self.mask.any():
            xs = np.nonzero(self.mask.any(axis=0))[0]
            return float(xs.max() - xs.min())
        raise ValueError("no vertices and no mask in this Scene")

    def snap(self, points):
        """Nearest surface vertex to each model point: (positions, indices)."""
        _need_np()
        p = np.asarray(points, dtype=float).reshape(-1, 3)
        idx = []
        for q in p:
            idx.append(int(np.argmin(((self.verts - q) ** 2).sum(axis=1))))
        idx = np.asarray(idx)
        return self.verts[idx], idx

    def visible(self, points, cell_px=2.0, eps=None):
        """Which model points are the front-most surface at their pixel (vertex z-buffer)."""
        _need_np()
        pr = self.proj
        keys = np.floor(pr[:, :2] / cell_px).astype(np.int64)
        kx, ky = keys[:, 0] - keys[:, 0].min() + 1, keys[:, 1] - keys[:, 1].min() + 1
        buf = np.full((kx.max() + 2, ky.max() + 2), -np.inf)
        np.maximum.at(buf, (kx, ky), pr[:, 2])
        if eps is None:
            eps = 0.01 * float(pr[:, 2].max() - pr[:, 2].min() + 1e-12)
        q = project_np(self.cam, points)
        qk = np.floor(q[:, :2] / cell_px).astype(np.int64)
        qx = qk[:, 0] - keys[:, 0].min() + 1
        qy = qk[:, 1] - keys[:, 1].min() + 1
        out = []
        for x, y, d in zip(qx, qy, q[:, 2]):
            if x < 1 or y < 1 or x >= buf.shape[0] - 1 or y >= buf.shape[1] - 1:
                out.append(False)
                continue
            out.append(bool(d >= buf[x - 1:x + 2, y - 1:y + 2].max() - eps))
        return out

    def inside_fn(self, margin_px=0):
        """inside(x, y): the pixel is model in the canvas mask eroded by margin_px (falls back to
        a splat of projected vertices when no PNG was exported)."""
        m = int(round(margin_px))
        if m not in self._eroded:
            base = self.mask if self.mask is not None else footprint_from_points(
                self.proj, self.doc[0], self.doc[1])
            self._eroded[m] = erode(base, m)
        em = self._eroded[m]
        hgt, wid = em.shape

        def inside(x, y):
            xi, yi = int(round(x)), int(round(y))
            return 0 <= xi < wid and 0 <= yi < hgt and bool(em[yi, xi])
        return inside

    def form_to_canvas(self, form, snap=True, step=None):
        """Centre line in canvas pixels, width in pixels, and the facing cosines along it.
        snap=True moves the path onto the surface first (nearest vertex)."""
        step = step or max(form.width / 4.0, 1e-4)
        pts = form.resampled(step)
        facing = None
        vis = None
        if snap and self.verts is not None:
            spts, idx = self.snap(pts)
            pts = [tuple(p) for p in spts]
            if self.normals is not None:
                facing = facing_np(self.cam, self.normals[idx]).tolist()
            v = self.visible(pts)
            vis = sum(v) / float(len(v))
        pr = project_np(self.cam, pts) if np is not None else [self.cam.project(p) for p in pts]
        path = [(float(p[0]), float(p[1])) for p in pr]
        clean = [path[0]]
        for p in path[1:]:
            if math.dist(p, clean[-1]) > 0.5:
                clean.append(p)
        if len(clean) < 2:
            clean = [path[0], path[-1]]
        return {"path": clean, "width_px": form.width * self.ppu, "facing": facing,
                "min_facing": min(facing) if facing else None, "visible_frac": vis}

    def symmetry_axis_px(self):
        """Canvas x of the model plane x = 0 at mid height (front and back views)."""
        c = self.cam.project((0.0, self.pivot[1], self.pivot[2]))
        return c[0]


# --------------------------------------------------------------------------------------------
# Brush size and intensity calibration
# --------------------------------------------------------------------------------------------

# Draw Size is in canvas pixels (brushes doc, Draw Size; Dynamic mode must stay off). Whether it
# is the brush radius or the diameter is [verify live_s01]: the live test measures the footprint
# of a stroke and writes radius_per_draw_size into sculpt_calibration.json.
RADIUS_PER_DRAW_SIZE = 1.0


def draw_size_for(diam_px, radius_per_draw_size=None):
    """Draw Size that gives a brush of diameter diam_px on the canvas."""
    k = radius_per_draw_size or current_calibration().get("radius_per_draw_size", RADIUS_PER_DRAW_SIZE)
    return int(max(1, min(1000, round(diam_px / 2.0 / k))))


class IntensityModel:
    """Volume change of one scripted stroke (constant pressure) as a function of Z Intensity.

        dV = c * Z * R^2 * 2 L        (R brush radius, L stroke length, model units) [added]

    so the mean raise over the stroke footprint is c * Z * R. Fit c per brush from measured
    strokes (live_s01): each sample is {z, draw_size, ppu, length_px, dv}. First-order model:
    check the residuals the fit reports before trusting z_for_raise far from the samples."""

    def __init__(self, brush, c, radius_per_draw_size=RADIUS_PER_DRAW_SIZE, samples=(), rms_rel=None,
                 source=""):
        self.brush, self.c = brush, float(c)
        self.radius_per_draw_size = float(radius_per_draw_size)
        self.samples, self.rms_rel, self.source = list(samples), rms_rel, source

    @staticmethod
    def _x(sample, k):
        r = sample["draw_size"] * k / sample["ppu"]
        length = sample["length_px"] / sample["ppu"]
        return sample["z"] * r * r * 2.0 * length

    @classmethod
    def fit(cls, brush, samples, radius_per_draw_size=RADIUS_PER_DRAW_SIZE, source="fit"):
        xs = [cls._x(s, radius_per_draw_size) for s in samples]
        ys = [abs(float(s["dv"])) for s in samples]
        den = sum(x * x for x in xs)
        if den <= 0:
            raise ValueError("no usable samples")
        c = sum(x * y for x, y in zip(xs, ys)) / den
        rel = [((c * x) - y) / y for x, y in zip(xs, ys) if y > 0]
        rms = math.sqrt(sum(e * e for e in rel) / len(rel)) if rel else None
        return cls(brush, c, radius_per_draw_size, samples, rms, source)

    def radius(self, draw_size, ppu):
        return draw_size * self.radius_per_draw_size / ppu

    def mean_raise(self, z, radius):
        return self.c * z * radius

    def predict_dv(self, z, draw_size, ppu, length_px):
        return self.c * self._x({"z": z, "draw_size": draw_size, "ppu": ppu,
                                 "length_px": length_px}, self.radius_per_draw_size)

    def z_for_raise(self, target_raise, radius, z_min=1, z_max=100):
        """(Z, passes) for a mean raise of `target_raise` model units with brush radius `radius`
        (model units). Above z_max the raise is split into passes; below z_min the answer is
        z_min with a note that one pass overshoots."""
        if target_raise <= 0 or radius <= 0:
            raise ValueError("target_raise and radius must be positive")
        z = target_raise / (self.c * radius)
        if z > z_max:
            passes = int(math.ceil(z / z_max))
            return int(round(z / passes)), passes
        return int(max(z_min, round(z))), 1

    def to_dict(self):
        return {"brush": self.brush, "c": self.c, "radius_per_draw_size": self.radius_per_draw_size,
                "rms_rel": self.rms_rel, "source": self.source, "samples": self.samples}

    @classmethod
    def from_dict(cls, d):
        return cls(d["brush"], d["c"], d.get("radius_per_draw_size", RADIUS_PER_DRAW_SIZE),
                   d.get("samples", ()), d.get("rms_rel"), d.get("source", ""))


# Prior from the proven v02 stroke (ClayBuildup, Draw Size 64, Z 20 as read in v01, 11 points,
# 207.4 px on the front of a radius-1 sphere at 207 px per unit, volume 4.189 -> 4.193, three
# decimals) [v02]. The v01 replay ran mostly off the sphere and is not used. Radius hypothesis
# [verify live_s01]. c = 0.00104; one sample, rounding alone is +-12 %.
PRIOR_SAMPLES = {"ClayBuildup": [{"z": 20, "draw_size": 64, "ppu": 207.0, "length_px": 207.39,
                                  "dv": 0.004, "evidence": "v02"}]}


def prior_model(brush="ClayBuildup"):
    return IntensityModel.fit(brush, PRIOR_SAMPLES[brush], RADIUS_PER_DRAW_SIZE,
                              source="prior: v02 stroke, radius hypothesis [verify live_s01]")


def current_calibration(path=CALIBRATION_FILE):
    if path and os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return {}


def intensity_model(brush="ClayBuildup", path=CALIBRATION_FILE):
    """The installed calibration for `brush` (live_s01 --install), else the v02 prior for
    ClayBuildup, else None."""
    cal = current_calibration(path)
    d = cal.get("models", {}).get(brush)
    if d:
        return IntensityModel.from_dict(d)
    if brush in PRIOR_SAMPLES:
        return prior_model(brush)
    return None


def calibration_strokes(doc_w, doc_h, ppu, zs=(2, 4, 6, 10, 20), length_frac=0.45, reps=1):
    """Horizontal strokes for the intensity calibration on the front of a framed DynaMesh
    sphere (radius 1, centred): one row per Z, rows spread over the front where the surface
    faces the camera (|y| <= 0.45 of the radius) [added]. Returns [(z, points)]."""
    cx, cy = doc_w / 2.0, doc_h / 2.0
    half = length_frac * ppu
    rows = []
    n = len(zs) * reps
    for i in range(n):
        y = cy + (i - (n - 1) / 2.0) * (0.9 * ppu / max(1, n))
        rows.append((zs[i % len(zs)], _round_pts(zb_stroke.line((cx - half, y), (cx + half, y), 6.0))))
    return rows


def footprint_radius_px(disp, cam, stroke_pts, before_verts):
    """Brush radius seen on the mesh: the largest distance, in canvas pixels, between a displaced
    vertex (zb_audit.displaced indices) and the stroke polyline."""
    _need_np()
    idx = np.asarray(disp["indices"], dtype=int)
    if idx.size == 0:
        return 0.0
    pr = project_np(cam, before_verts[idx])[:, :2]
    best = np.full(len(pr), np.inf)
    for a, b in zip(stroke_pts, stroke_pts[1:]):
        a, b = np.asarray(a, float), np.asarray(b, float)
        ab = b - a
        L2 = float(ab @ ab) or 1e-12
        t = np.clip(((pr - a) @ ab) / L2, 0, 1)
        d = np.linalg.norm(pr - (a + t[:, None] * ab), axis=1)
        best = np.minimum(best, d)
    return float(np.percentile(best, 98))


def run_calibration(out_dir, brush="ClayBuildup", zs=(2, 4, 6, 10, 20), draw_size=24, port=DEFAULT_PORT,
                    install=False, focal=None, alpha=None, stroke_type=None):
    """Measure dV per stroke and the footprint radius on a fresh DynaMesh sphere (128) framed
    front at 0.6 margin (rows about 45 px apart, so Draw Size 24 keeps footprints apart under
    either radius hypothesis) [added]. Writes calibration.json in out_dir; install=True also writes
    sculpt_calibration.json next to this module. NOT YET RUN IN ZBRUSH (live_s01)."""
    import zb_audit
    import zb_launch
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    zb_launch.run("r = zb_ops.new_sphere(resolution=128)\nzb_ops.set_symmetry(False)\nresult = r",
                  modules=("zb_ops",), port=port, timeout=180)
    sc = Scene.capture(out_dir, view="front", margin=0.6, port=port, tag="cal_base")
    rows = calibration_strokes(sc.doc[0], sc.doc[1], sc.ppu, zs)
    samples, radii = [], []
    prev = sc.obj
    for i, (z, pts) in enumerate(rows):
        objp = os.path.join(out_dir, f"cal_{i:02d}_z{z}.obj")
        spec = pass_spec(f"cal z{z}", brush, [pts], draw_size, z, focal=focal, alpha=alpha,
                         stroke_type=stroke_type, symmetry=False, transform=sc.transform)
        res = apply_pass(spec, port=port)
        zb_launch.run(f"result = zb_ops.export_obj({objp!r}, overwrite=True)", modules=("zb_ops",),
                      port=port)
        disp = zb_audit.displaced(prev, objp)
        before = zb_audit.load_obj(prev).verts
        rpx = footprint_radius_px(disp, sc.cam, pts, before)
        dv = res["volume_after"] - res["volume_before"]
        samples.append({"z": z, "draw_size": draw_size, "ppu": sc.ppu,
                        "length_px": zb_stroke.path_length(pts), "dv": dv,
                        "displaced": disp["count"], "max_disp": disp["max_disp"],
                        "footprint_radius_px": rpx})
        if rpx > 0:
            radii.append(rpx / draw_size)
        prev = objp
    k = sorted(radii)[len(radii) // 2] if radii else RADIUS_PER_DRAW_SIZE
    model = IntensityModel.fit(brush, [s for s in samples if abs(s["dv"]) > 0], k,
                               source=f"run_calibration {out_dir}")
    cal = {"radius_per_draw_size": k, "models": {brush: model.to_dict()}, "samples": samples,
           "ppu": sc.ppu, "draw_size": draw_size}
    with open(os.path.join(out_dir, "calibration.json"), "w") as fh:
        json.dump(cal, fh, indent=1)
    if install:
        old = current_calibration()
        old.setdefault("models", {}).update(cal["models"])
        old["radius_per_draw_size"] = k
        old.setdefault("history", []).append({"dir": out_dir, "brush": brush, "c": model.c,
                                              "rms_rel": model.rms_rel, "k": k})
        with open(CALIBRATION_FILE, "w") as fh:
            json.dump(old, fh, indent=1)
    return cal


# --------------------------------------------------------------------------------------------
# Pass specs and execution
# --------------------------------------------------------------------------------------------

# Perspective is a Draw palette switch: the installed ZData/ZLang/zcommands/commands.xml lists
# Draw:Perspective and no Transform:Persp [xml] (Z1 grade, 2026-09-24). The lead toolkit's v1
# PATHS["persp"] only tried Transform:Persp; its round 1 version has the same list as here. This
# module keeps its own copy so its perspective handling does not depend on the toolkit version.
PERSP_PATHS = ["Draw:Perspective", "Draw:Persp", "Transform:Persp"]


def pass_spec(label, brush, strokes, draw_size, z, zsub=False, focal=None, stroke_type=None,
              alpha=None, lazymouse=False, symmetry=None, sym_axis="x", transform=None,
              measure="stroke", note="", source=""):
    """One pass: one brush setting, a list of strokes in canvas pixels, the view they were
    planned in. JSON-able; validated here so ZBrush never gets a bad stroke.

    lazymouse defaults to False: LazyMouse (on at radius 1 on Standard and ClayBuildup)
    swallows taps and the start of a stroke, and a synthesized path is already smooth
    (Pavlovich AdkZe1yKFTU 00:03:31; sculpting digest P1 step 4). None leaves it as it is."""
    good = []
    for s in strokes:
        pts = [(float(p[0]), float(p[1])) for p in s]
        if not pts:
            continue
        if min(min(p) for p in pts) < 0:
            raise ValueError(f"{label}: negative canvas coordinate; clip strokes first")
        good.append(pts)
    if not good:
        raise ValueError(f"{label}: no strokes")
    z = int(round(z))
    if not 0 <= z <= 100:
        raise ValueError(f"{label}: Z Intensity {z} outside 0..100")
    ds = int(round(draw_size))
    if not 1 <= ds <= 1000:
        raise ValueError(f"{label}: Draw Size {ds} outside 1..1000")
    if transform is not None and len(transform) != 9:
        raise ValueError("transform must have 9 values")
    return {"label": label, "brush": brush, "strokes": good, "draw_size": ds, "z": z,
            "zsub": bool(zsub), "focal": focal, "stroke_type": stroke_type, "alpha": alpha,
            "lazymouse": lazymouse, "symmetry": symmetry, "sym_axis": sym_axis,
            "transform": [float(t) for t in transform] if transform else None,
            "measure": measure, "note": note, "source": source}


_PASS_CODE = r'''
import json as _zs_json
spec = _zs_json.loads(__SPEC__)
out = {"label": spec["label"], "missing": [], "set": {}, "strokes": []}
zb_ops.ensure_edit()
def _press_opt(path):
    if zbc.exists(path):
        zbc.press(path)
        out["set"][path] = True
        return True
    out["missing"].append(path)
    return False
_p = zb_ops.resolve(__PERSP__, required=False)
if _p and zbc.get(_p) >= 0.5:
    zbc.set(_p, 0)
    out["persp_turned_off"] = True
elif _p is None:
    out["missing"].append("perspective switch")
if spec.get("symmetry") is not None:
    out["symmetry"] = zb_ops.set_symmetry(bool(spec["symmetry"]), spec.get("sym_axis") or "x")
out["brush"] = zb_ops.select_brush(spec["brush"])
if spec.get("stroke_type"):
    _press_opt("Stroke:" + spec["stroke_type"])
if spec.get("alpha"):
    _press_opt("Alpha:" + spec["alpha"])
if spec.get("lazymouse") is not None:
    _lm = zb_ops.resolve(["Stroke:Lazy Mouse:LazyMouse", "Stroke:LazyMouse"], required=False)
    if _lm:
        zbc.set(_lm, 1 if spec["lazymouse"] else 0)
        out["lazymouse"] = zbc.get(_lm)
    else:
        out["missing"].append("LazyMouse")
out["draw"] = zb_ops.set_draw(size=spec["draw_size"], z_intensity=spec["z"], focal=spec.get("focal"),
                              zadd=not spec["zsub"], zsub=spec["zsub"])
if spec.get("transform"):
    zbc.set_transform(*spec["transform"])
    zbc.update(redraw_ui=True)
out["transform_before"] = [float(v) for v in zbc.get_transform()]
out["bbox_before"] = [float(v) for v in zbc.query_mesh3d(2, 3)]
v_start = float(zbc.get_polymesh3d_volume())
v = v_start
per_stroke = spec.get("measure", "stroke") == "stroke"
for pts in spec["strokes"]:
    ok = bool(zbc.canvas_stroke(zbc.Stroke(zb_stroke.encode(pts))))
    if per_stroke:
        zbc.update()
        v2 = float(zbc.get_polymesh3d_volume())
        out["strokes"].append([ok, v2 - v])
        v = v2
    else:
        out["strokes"].append([ok, None])
zbc.update(redraw_ui=True)
out["volume_before"] = v_start
out["volume_after"] = float(zbc.get_polymesh3d_volume())
out["transform_after"] = [float(t) for t in zbc.get_transform()]
out["bbox_after"] = [float(v) for v in zbc.query_mesh3d(2, 3)]
result = out
'''


def pass_code(spec):
    """ZBrush-side code for one pass (needs the prelude modules zb_ops and zb_stroke)."""
    return (_PASS_CODE.replace("__PERSP__", repr(PERSP_PATHS))
            .replace("__SPEC__", repr(json.dumps(spec))))


def apply_pass(spec, port=DEFAULT_PORT, timeout=None):
    """Run one pass through the bridge; returns the per-stroke volume deltas and the state it
    set. NOT YET RUN IN ZBRUSH (live_s02)."""
    import zb_launch
    t = timeout or max(60, 10 + 2 * len(spec["strokes"]))
    return zb_launch.run(pass_code(spec), modules=("zb_ops", "zb_stroke"), port=port, timeout=t)


def pass_report(res, expect_sign=None, dead_frac_max=0.1, pivot_shift_px_max=2.0, ppu=None,
                dead_abs=1e-7):
    """Judge a pass result: strokes with no volume change (missed the mesh or swallowed),
    wrong sign (Zadd that lowered the volume), view drift, pivot shift, settings that did not
    resolve. Thresholds are [added]."""
    rows = res.get("strokes", [])
    dvs = [r[1] for r in rows if r[1] is not None]
    dead = sum(1 for d in dvs if abs(d) <= dead_abs)
    flags = []
    n = len(rows)
    total = res.get("volume_after", 0.0) - res.get("volume_before", 0.0)
    if n and dvs and dead / len(dvs) > dead_frac_max:
        flags.append(f"{dead} of {len(dvs)} strokes changed nothing: aim, footprint clip, "
                     "Edit mode or LazyMouse radius")
    if expect_sign and total * expect_sign <= 0:
        flags.append(f"total volume change {total:+.6g} has the wrong sign for this pass")
    if not all(r[0] for r in rows):
        flags.append("canvas_stroke returned False for some strokes")
    tb, ta = res.get("transform_before"), res.get("transform_after")
    drift = max(abs(a - b) for a, b in zip(tb, ta)) if tb and ta else 0.0
    if drift > 1e-4:
        flags.append(f"view changed during the pass (max {drift:.4g}): a stroke started off "
                     "the model? Re-capture the Scene")
    bb0, bb1 = res.get("bbox_before"), res.get("bbox_after")
    shift_px = None
    if bb0 and bb1 and ppu:
        c0 = [(bb0[i] + bb0[i + 3]) / 2 for i in range(3)]
        c1 = [(bb1[i] + bb1[i + 3]) / 2 for i in range(3)]
        shift_px = math.dist(c0, c1) * ppu
        if shift_px > pivot_shift_px_max:
            flags.append(f"bbox centre moved {shift_px:.1f} px: the pivot moved, later strokes of "
                         "the same plan are off target; re-capture the Scene")
    if res.get("missing"):
        flags.append(f"settings not found: {res['missing']} (check gui-paths / live_s02)")
    mean = sum(dvs) / len(dvs) if dvs else None
    cv = None
    if dvs and mean and len(dvs) > 1:
        sd = math.sqrt(sum((d - mean) ** 2 for d in dvs) / (len(dvs) - 1))
        cv = abs(sd / mean)
    return {"label": res.get("label"), "strokes": n, "dead": dead, "sum_dv": total,
            "mean_dv": mean, "cv": cv, "view_drift": drift, "pivot_shift_px": shift_px,
            "ok": not flags, "flags": flags}


def _diam_from(scene, size_frac, ref_width=None):
    ref_px = ref_width * scene.ppu if ref_width else scene.model_width_px()
    return size_frac * ref_px


def form_diameter(stage_diam_px, form_width_px, pattern, lo=0.5, hi=1.0):
    """Brush diameter for one form: the stage size (fraction of the head width, measured on the
    experts' frames) kept between 0.5 and 1.0 of the form's width for strokes across it (digest
    T1: D about 0.5 to 1.0 W [added, consistent with the frames]); creases keep the stage size."""
    if pattern == "along" or form_width_px <= 0:
        return stage_diam_px
    return max(lo * form_width_px, min(hi * form_width_px, stage_diam_px))


def _plan_forms(scene, forms, stage_diam, pattern, seed, margin_frac, symmetry, min_len_frac,
                fit_to_form=True):
    """Strokes per (sign, Draw Size) group, clipped to the model mask."""
    groups = {}
    warnings = []
    for i, f in enumerate(forms):
        parts = [f]
        if symmetry:
            h = f.half(+1)
            parts = [h] if h else []
            if not parts:
                warnings.append(f"{f.name}: nothing on the +x side with symmetry on")
        for part in parts:
            fc = scene.form_to_canvas(part)
            if fc["min_facing"] is not None and fc["min_facing"] < 0.3:
                warnings.append(f"{part.name}: surface faces away (cos {fc['min_facing']:.2f}); "
                                "use best_view() [added threshold 0.3]")
            if fc["visible_frac"] is not None and fc["visible_frac"] < 0.8:
                warnings.append(f"{part.name}: only {fc['visible_frac']:.0%} of the path is the "
                                "front-most surface in this view (hidden behind another form) "
                                "[added threshold 0.8]")
            diam = form_diameter(stage_diam, fc["width_px"], pattern) if fit_to_form else stage_diam
            inside = scene.inside_fn(margin_frac * diam / 2.0)
            if pattern == "across":
                strokes = hatch_across(fc["path"], fc["width_px"], diam, seed=seed + i)
            elif pattern == "along":
                strokes = crease(fc["path"], diam, seed=seed + i)
            elif pattern == "two_direction":
                strokes = [s for _, ss, _ in two_direction(fc["path"], fc["width_px"], diam,
                                                           seed=seed + i) for s in ss]
            elif pattern == "center":
                strokes = [_round_pts(zb_stroke.resample(fc["path"], point_spacing(diam)))]
            else:
                raise ValueError("pattern: across, along, two_direction or center")
            kept = []
            for s in strokes:
                full = zb_stroke.path_length(s)
                kept += clip_runs(s, inside, min_len_px=min_len_frac * full)
            if not kept:
                warnings.append(f"{part.name}: every stroke fell outside the model mask")
                continue
            ds = draw_size_for(diam)
            g = groups.setdefault((part.sign, ds), {"strokes": [], "diam": diam, "forms": []})
            g["strokes"].extend(kept)
            g["forms"].append(part.name)
    return groups, warnings


def clay_pass(scene, forms, stage="S1", preset=None, size_frac=None, z=None, ref_width=None,
              pattern=None, seed=0, margin_frac=0.25, symmetry=None, target_raise=None,
              model=None, min_len_frac=0.5, label=None, fit_to_form=True):
    """Plan a clay (or trim) pass for model-space forms in one Scene: aim, size, intensity.

    preset: a BRUSHES key (default: the stage's first clay preset). size_frac: brush diameter
    as a fraction of ref_width (model units, e.g. the head width) or of the model's width in
    this view; with fit_to_form the diameter is then kept within 0.5 to 1.0 of each form's
    width (form_diameter). z: explicit Z; else from target_raise with the intensity model, else
    the preset. Strokes are clipped to the model mask eroded by margin_frac of the brush radius
    and runs shorter than min_len_frac of their planned length are dropped [added]. Returns one
    pass spec per (build or carve, Draw Size) group, each with 'warnings' and 'plan'."""
    st = STAGES[stage]
    key = preset or next((b for b in st["brushes"] if b.startswith("clay") or b == "trim"),
                         "clay_block")
    pre = brush_preset(key)
    frac = size_frac if size_frac is not None else sum(pre["size"]) / 2.0
    stage_diam = _diam_from(scene, frac, ref_width)
    sym = st["symmetry"] if symmetry is None else symmetry
    pat = pattern or ("across" if pre["direction"] == "across" else "along")
    groups, warnings = _plan_forms(scene, forms, stage_diam, pat, seed, margin_frac, sym,
                                   min_len_frac, fit_to_form)
    specs = []
    for (sign, ds), g in sorted(groups.items(), key=lambda kv: (-kv[0][0], -kv[0][1])):
        zz, passes, note = (z, 1, "") if z is not None else (pre["z"], 1, "")
        if z is None and target_raise:
            m = model or intensity_model(pre["brush"])
            if m:
                zz, passes = m.z_for_raise(target_raise, m.radius(ds, scene.ppu))
                note = f"z from {m.source} for mean raise {target_raise:g}; passes {passes}"
        # the form's sign decides Zadd or Zsub, except for brushes whose mode is fixed
        # (TrimDynamic trims with Zsub lit, TpS0QdlfHWU frame 00:15:45)
        zsub = bool(pre.get("zsub", False)) if pre.get("sign_mode") == "fixed" else sign < 0
        lab = label or f"{stage} {key} {'build' if sign > 0 else 'carve'} D{ds}"
        for k in range(passes):
            sp = pass_spec(lab + (f" {k + 1}/{passes}" if passes > 1 else ""), pre["brush"],
                           g["strokes"], ds, zz, zsub=zsub, focal=pre.get("focal"),
                           stroke_type=pre.get("stroke_type"), alpha=pre.get("alpha"),
                           symmetry=sym, transform=scene.transform, note=note, source=pre["src"])
            sp["warnings"] = warnings
            sp["plan"] = {"diam_px": g["diam"], "stage_diam_px": stage_diam, "size_frac": frac,
                          "pattern": pat, "stage": stage, "preset": key, "forms": g["forms"],
                          "expect_sign": -1 if zsub else +1}
            specs.append(sp)
    if not specs:
        raise ValueError(f"no strokes planned: {warnings}")
    return specs


def crease_pass(scene, forms, stage="S4", preset="dam", size_frac=None, ref_width=None, z=None,
                seed=0, symmetry=None, margin_frac=0.25):
    """Dam_Standard (T5) along each form's centre line. Forms with sign +1 get Zadd (Alt:
    a raised ridge, TpS0QdlfHWU 00:06:18), sign -1 the default Zsub cut."""
    return clay_pass(scene, forms, stage, preset=preset, size_frac=size_frac, z=z, ref_width=ref_width,
                     pattern="along", seed=seed, symmetry=symmetry, margin_frac=margin_frac)


def move_pass(scene, moves, stage="S1", preset="move", size_frac=None, ref_width=None,
              max_step_frac=0.5, symmetry=None, min_plane_frac=0.8):
    """Plan Move drags for model-space displacements [(point, vector), ...]. Each move is split
    into drags of at most max_step*D; a displacement that does not lie in the screen plane
    (fraction below min_plane_frac [added]) is refused with a pointer to a better view."""
    pre = brush_preset(preset)
    frac = size_frac if size_frac is not None else sum(pre["size"]) / 2.0
    diam = _diam_from(scene, frac, ref_width)
    strokes, warnings = [], []
    inside = scene.inside_fn(0)
    for p, d in moves:
        sp, _ = scene.snap([p]) if scene.verts is not None else ([p], None)
        p0 = tuple(sp[0])
        pf = screen_plane_fraction(scene.cam, d)
        if pf < min_plane_frac:
            warnings.append(f"move at {p0}: only {pf:.2f} of it lies in the screen plane; choose "
                            "a view that looks across the displacement")
            continue
        a = scene.cam.project(p0)
        b = scene.cam.project(tuple(p0[i] + d[i] for i in range(3)))
        if not inside(a[0], a[1]):
            warnings.append(f"move at {p0}: grab point is not on the model in this view")
            continue
        strokes += move_drags((a[0], a[1]), (b[0], b[1]), diam, max_step_frac)
    if not strokes:
        raise ValueError(f"no move planned: {warnings}")
    st = STAGES[stage]
    spec = pass_spec(f"{stage} {preset}", pre["brush"], strokes, draw_size_for(diam), pre["z"],
                     focal=pre.get("focal"), stroke_type=pre.get("stroke_type"),
                     alpha=pre.get("alpha"), symmetry=st["symmetry"] if symmetry is None else symmetry,
                     transform=scene.transform, source=pre["src"],
                     note="one pass per Move set; re-capture the Scene after it (pivot moves)")
    spec["warnings"] = warnings
    spec["plan"] = {"diam_px": diam, "size_frac": frac, "stage": stage, "preset": preset,
                    "expect_sign": None}
    return [spec]


# --------------------------------------------------------------------------------------------
# Review metrics on canvas PNGs (agent side)
# --------------------------------------------------------------------------------------------

def iou(a, b):
    _need_np()
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 1.0


def _crop_norm(mask, size=256):
    from PIL import Image
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return np.zeros((size, size), dtype=bool)
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    s = max(h, w)
    pad = np.zeros((s, s), dtype=np.uint8)
    pad[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = m * 255
    return np.asarray(Image.fromarray(pad).resize((size, size))) > 127


def shape_iou(a, b, size=256):
    """IoU after cropping both masks to their bounding boxes and scaling them to one size: the
    change of the silhouette's shape, not of its framing. Henning: the less the silhouette
    changes between later stages, the more solid the design (G2o6fdoACIQ 00:17:27)."""
    _need_np()
    return iou(_crop_norm(a, size), _crop_norm(b, size))


def mirror_asymmetry(mask, axis_x=None):
    """1 - IoU of a front-view mask with its mirror about axis_x (default: bbox centre).
    Expected near 0 before S3 and above 0 after the asymmetry pass (G2o6fdoACIQ 00:06:19)."""
    _need_np()
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return 0.0
    ax = (xs.min() + xs.max()) / 2.0 if axis_x is None else float(axis_x)
    h, w = mask.shape
    xx = np.arange(w)
    src = np.round(2 * ax - xx).astype(int)
    ok = (src >= 0) & (src < w)
    mir = np.zeros_like(mask)
    mir[:, ok] = mask[:, src[ok]]
    return 1.0 - iou(mask, mir)


def band_energy(png, mask=None, model_width_px=None, bands=None):
    """Difference-of-Gaussians energy of the grey render inside the (eroded) model mask, in
    bands relative to the model width: large 2 to 4 %, mid 0.5 to 1.5 %, fine 0.1 to 0.3 %
    (digest M2 [added]). Normalised by the mean grey. Compare stages in the same view and
    material: mid should rise at S3, fine should not dominate mid (0PaYUUvgwYM 00:11:04)."""
    _need_np()
    from PIL import Image, ImageFilter
    with Image.open(png) as im:
        g = im.convert("L")
    m = mask if mask is not None else silhouette_mask(png)
    if model_width_px is None:
        xs = np.nonzero(m.any(axis=0))[0]
        model_width_px = float(xs.max() - xs.min()) if len(xs) else float(g.width)
    bands = bands or {"large": (0.02, 0.04), "mid": (0.005, 0.015), "fine": (0.001, 0.003)}
    big = max(b[1] for b in bands.values()) * model_width_px
    inner = erode(m, int(2 * big) + 1)
    if not inner.any():
        inner = m
    base = np.asarray(g, dtype=float)
    norm = float(base[inner].mean()) or 1.0
    out = {}
    for name, (s1, s2) in bands.items():
        a = np.asarray(g.filter(ImageFilter.GaussianBlur(max(0.3, s1 * model_width_px))), float)
        b = np.asarray(g.filter(ImageFilter.GaussianBlur(max(0.6, s2 * model_width_px))), float)
        out[name] = round(float(np.abs(a - b)[inner].mean() / norm), 6)
    return out


def _view_files(review_dir):
    out = {}
    for p in sorted(glob.glob(os.path.join(review_dir, "*.png"))):
        base = os.path.basename(p)
        if base.startswith("review_sheet"):
            continue
        label = os.path.splitext(base)[0].split("_", 2)[-1]
        out[label] = p
    return out


def compare_reviews(prev_dir, cur_dir):
    """Per view: raw IoU, shape IoU, mirror asymmetry (front), band energies, between two
    zb_review.review() output folders of the same views. Masks use zb_review's background
    model; with MatCap Gray the lower silhouette can blend into the grey end of the canvas
    gradient, so check silhouette_mask on one image of a new material first [added]."""
    a, b = _view_files(prev_dir), _view_files(cur_dir)
    rows = {}
    for label in sorted(set(a) & set(b)):
        ma, mb = silhouette_mask(a[label]), silhouette_mask(b[label])
        row = {"iou": round(iou(ma, mb), 4), "shape_iou": round(shape_iou(ma, mb), 4),
               "bands_prev": band_energy(a[label], ma), "bands": band_energy(b[label], mb)}
        if label.startswith("front"):
            row["asym_prev"] = round(mirror_asymmetry(ma), 4)
            row["asym"] = round(mirror_asymmetry(mb), 4)
        rows[label] = row
    return rows


def stage_gate(stage, kind="head", stats=None, reports=(), review_cmp=None, sdiv=None,
               big_move=False):
    """Measurable part of a stage gate. Returns {"ok", "fails", "warnings"}; the visual part
    (critique.md) is judged on the review sheet. Thresholds marked [added] are defaults."""
    fails, warns = [], []
    st = STAGES[stage]
    if stats and stats.get("points"):
        lo, hi = st["points"].get(kind, (0, float("inf")))
        p = stats["points"]
        if p > hi * 1.5:
            warns.append(f"{p} points, above the {stage} budget {hi:.0f} (lumpy early mesh, "
                         "tbQqC6tyDBQ 00:04:38)")
        if p < lo * 0.5:
            warns.append(f"{p} points, well below the {stage} range from {lo:.0f}")
    for r in reports:
        if not r.get("ok"):
            fails.append(f"pass {r.get('label')}: {r.get('flags')}")
    if big_move and sdiv and sdiv > 1:
        fails.append("big Move at SDiv > 1: step down to SDiv 1 (rArw79xEpvE 00:12:28)")
    if review_cmp:
        late = stage in ("S4", "S5", "S6")
        for label, row in review_cmp.items():
            if late and row["shape_iou"] < 0.98:
                fails.append(f"{label}: silhouette changed (shape IoU {row['shape_iou']}) during "
                             "detail stages; details never change the outline (tbQqC6tyDBQ "
                             "00:13:27) [0.98 added]")
            if stage == "S3" and label.startswith("front") and row.get("asym", 1) < 0.002:
                warns.append("front view still mirror-symmetric after the secondary pass: the "
                             "asymmetry pass is missing (G2o6fdoACIQ 00:06:19) [0.002 added]")
            b = row.get("bands", {})
            if stage in ("S3", "S4") and b and b.get("fine", 0) > 1.5 * b.get("mid", 1):
                warns.append(f"{label}: fine band dominates mid band: detail before mid "
                             "frequency? (0PaYUUvgwYM 00:11:04) [1.5 added]")
    return {"stage": stage, "ok": not fails, "fails": fails, "warnings": warns}


# --------------------------------------------------------------------------------------------
# Code builders for deterministic blockout and checkpoints (ZBrush side, run with zb_launch)
# --------------------------------------------------------------------------------------------

ZSPHERE_BUILD = r'''
import json as _zs_json
spheres = _zs_json.loads(__SPHERES__)
out = {"created": None, "added": []}
zbc.press("Tool:ZSphere")
if zbc.get("Transform:Edit") < 0.5:
    if zbc.exists("Layer:Clear"):
        zbc.press("Layer:Clear")
    w, h = zbc.get("Document:Width"), zbc.get("Document:Height")
    zbc.canvas_click(w * 0.5, h * 0.5, w * 0.5, h * 0.6)
    zbc.set("Transform:Edit", 1)
out["created"] = zbc.get_active_tool_path()
out["count_before"] = int(zbc.get_zsphere(0, 0, 0))
def _build():
    for s in spheres:
        parent = 0 if s["parent"] < 0 else out["added"][s["parent"]]
        out["added"].append(int(zbc.add_zsphere(s["x"], s["y"], s["z"], s["r"], parent)))
zbc.edit_zsphere(_build, True)
zbc.update(redraw_ui=True)
out["count_after"] = int(zbc.get_zsphere(0, 0, 0))
out["root"] = [zbc.get_zsphere(p, 0, 0) for p in (1, 2, 3, 4)]
result = out
'''


def zsphere_code(spheres):
    """ZBrush code that creates a ZSphere tool and adds `spheres` (dicts x, y, z, r, parent).
    parent -1 = the root sphere; parent i = the i-th sphere of this list (indices are offset by
    the spheres that exist). Coordinates are the ZSphere tool's own space [verify live_s05];
    the SDK example adds children at 0.5 unit steps with radius 0.25 [doc]."""
    for i, s in enumerate(spheres):
        for k in ("x", "y", "z", "r", "parent"):
            if k not in s:
                raise ValueError(f"sphere {s} lacks {k}")
        if s["parent"] >= i:
            raise ValueError(f"sphere {i}: parent {s['parent']} must come earlier in the list")
        if s["r"] <= 0:
            raise ValueError(f"sphere {i}: radius must be positive")
    return ZSPHERE_BUILD.replace("__SPHERES__", repr(json.dumps(list(spheres))))


def chain(start, end, r0, r1, n, parent=-1, first_index=0):
    """n spheres from start to end (start excluded), radii from r0 to r1. parent: list index of
    the sphere this chain hangs from (-1 = root); first_index: list index the first new sphere
    will have in the final list. Returns (spheres, list index of the last one) [added helper]."""
    out = []
    p = parent
    for i in range(1, n + 1):
        t = i / float(n)
        out.append({"x": start[0] + (end[0] - start[0]) * t, "y": start[1] + (end[1] - start[1]) * t,
                    "z": start[2] + (end[2] - start[2]) * t, "r": r0 + (r1 - r0) * t, "parent": p})
        p = first_index + len(out) - 1
    return out, p


ADAPTIVE_SKIN = r'''
out = {"set": {}, "missing": []}
for path, val in (("Tool:Adaptive Skin:Density", __DENSITY__),
                  ("Tool:Adaptive Skin:DynaMesh Resolution", __DYNRES__)):
    if zbc.exists(path):
        zbc.set(path, val)
        out["set"][path] = zbc.get(path)
    else:
        out["missing"].append(path)
n0 = zbc.get_tool_count()
mk = "Tool:Adaptive Skin:Make Adaptive Skin"
if not zbc.exists(mk):
    raise RuntimeError(mk + " not found")
zbc.press(mk)
zbc.update(redraw_ui=True)
n1 = zbc.get_tool_count()
out["tools_before"], out["tools_after"] = n0, n1
if n1 > n0:
    zbc.select_tool(n1 - 1)
    zbc.update(redraw_ui=True)
out["active"] = zbc.get_active_tool_path()
out["stats"] = zb_ops.stats()
result = out
'''


def adaptive_skin_code(density=2, dynamesh_resolution=0):
    """Pablo: Adaptive Skin with DynaMesh Resolution 0 keeps the skin a light mesh (Density 1
    in Logic Part 3, gitoJ7B8FmY 00:17:35; Density 2 on screen, tbQqC6tyDBQ frame 00:01:58);
    Make Adaptive Skin creates a new tool, selected here [paths verify live_s05]."""
    return (ADAPTIVE_SKIN.replace("__DENSITY__", repr(float(density)))
            .replace("__DYNRES__", repr(float(dynamesh_resolution))))


APPEND_PRIMITIVE = r'''
out = {}
zb_ops.ensure_edit()
n0 = zbc.get_subtool_count()
zbc.press(zb_ops.resolve("append"))
pp = "PopUp:" + __PRIM__
if not zbc.exists(pp):
    raise RuntimeError(pp + " not found after Append (pop-up item names [verify live_s05])")
zbc.press(pp)
zbc.update(redraw_ui=True)
out["subtools"] = [n0, zbc.get_subtool_count()]
zbc.select_subtool(zbc.get_subtool_count() - 1)
for key, val in (("x_pos", __X__), ("y_pos", __Y__), ("z_pos", __Z__), ("xyz_size", __SIZE__)):
    if val is not None:
        p = zb_ops.resolve(key)
        zbc.set(p, val)
        out[key] = zbc.get(p)
zbc.update(redraw_ui=True)
out["bbox"] = [float(v) for v in zbc.query_mesh3d(2, 1)]
result = out
'''


def append_primitive_code(primitive="Sphere3D", position=None, size=None):
    """Append a primitive as a new SubTool (Tool:SubTool:Append then PopUp:<name>, the shipped
    macros' pattern [macro]) and place it with Tool > Geometry X/Y/Z Position and XYZ Size
    (Pablo's brush-free blockout, gitoJ7B8FmY 00:05:26; absolute and restorable, Deformation
    doc). Units and axes of the Position sliders [verify live_06, live_s05]."""
    x, y, z = position if position is not None else (None, None, None)
    return (APPEND_PRIMITIVE.replace("__PRIM__", repr(primitive)).replace("__X__", repr(x))
            .replace("__Y__", repr(y)).replace("__Z__", repr(z)).replace("__SIZE__", repr(size)))


CHECKPOINT = r'''
out = {"kind": __KIND__}
if __KIND__ == "morph":
    p = zb_ops.resolve("store_mt")
    zbc.press(p)
    out["pressed"] = p
elif __KIND__ == "layer":
    p = zb_ops.resolve(["Tool:Layers:New"])
    zbc.press(p)
    out["pressed"] = p
out["stats"] = zb_ops.stats()
result = out
'''

DIAL = r'''
out = {"kind": __KIND__, "value": __VALUE__}
cands = __CANDS__
p = zb_ops.resolve(cands, required=False)
if p is None:
    raise RuntimeError("none of %r exists [verify live_s04]" % (cands,))
_expect = __EXPECT__
if _expect is not None:
    _pts = zb_ops.stats().get("points")
    out["points"] = _pts
    if _pts != _expect:
        raise RuntimeError("Morph Target lost: %r points now, %r at StoreMT. A re-DynaMesh, "
                           "ZRemesher or Divide since StoreMT destroyed it; reload the versioned "
                           "ZTL instead of dialling" % (_pts, _expect))
v0 = float(zbc.get_polymesh3d_volume())
zbc.set(p, __VALUE__)
zbc.update(redraw_ui=True)
out.update(path=p, read=zbc.get(p), volume_before=v0, volume_after=float(zbc.get_polymesh3d_volume()))
result = out
'''

DIAL_PATHS = {
    # Drust: the Morph slider blends back toward the stored target; partial values soften a
    # pass, negative values exaggerate it (B_wKwXwjcZs 00:00:59, 00:05:20); installed id [xml]
    "morph": ["Tool:Morph Target:Morph"],
    # Layers doc: intensity 1 = as sculpted, above 1 exaggerates, negative inverts. The
    # installed id is Tool:Layers:Intensity [xml]; which layer it acts on is [verify live_s04]
    "layer": ["Tool:Layers:Intensity", "Tool:Layers:Layer Intensity"],
}


def checkpoint_code(kind="morph"):
    """Before a stroke pass: StoreMT on DynaMesh stages, a new Layer on subdivision stages
    (create at the top level, doc). Then dial_code turns the pass up or down after the review.
    A Morph Target lives only while the point count stays the same (Morph Targets doc; fundamentals
    digest procedure I step 4): dial it BEFORE any re-DynaMesh, ZRemesher or Divide, and pass
    the returned stats["points"] to dial_code(expect_points=...) so a lost target fails loudly."""
    if kind not in ("morph", "layer"):
        raise ValueError("kind: morph or layer")
    return CHECKPOINT.replace("__KIND__", repr(kind))


def dial_code(kind, value, expect_points=None):
    """Set the Morph slider or the layer intensity after a checkpointed pass. expect_points:
    the point count at StoreMT; the code refuses to dial when it has changed."""
    if kind not in DIAL_PATHS:
        raise ValueError("kind: morph or layer")
    exp = None if expect_points is None else int(expect_points)
    return (DIAL.replace("__KIND__", repr(kind)).replace("__VALUE__", repr(float(value)))
            .replace("__CANDS__", repr(DIAL_PATHS[kind])).replace("__EXPECT__", repr(exp)))


# Safe re-DynaMesh. DynaMesh doc (Manual Update): the update works only in Draw mode, not in
# Move, Scale or Rotate, and only with the mask cleared; Pablo: with a faint mask the gesture
# only clears the mask (FrqUnna1jns 00:07:28). DynaMesh doc (PolyGroups, Important): with
# polypaint on, DynaMesh keeps the polypaint INSTEAD of the polygroups; turn the SubTool's
# polypaint off to keep groups (Pavlovich 8kWFv1cZlCE 00:20:06: without Colorize the paint is
# lost). zb_ops.dynamesh toggles DynaMesh off and on [verify live_06]; this code also checks
# the result, because pressing the lit button may only switch DynaMesh off (fundamentals note
# FrqUnna1jns, agent translation). Paths: Transform:Draw Pointer and Tool:Polypaint:Colorize
# are installed ids [xml]; that Colorize is the SubTool list's brush icon is [verify live_s08].
REMESH = r'''
out = {"resolution": __RES__, "keep": __KEEP__, "steps": [], "missing": []}
zb_ops.ensure_edit()
_dp = zb_ops.resolve(["Transform:Draw Pointer", "Transform:Draw"], required=False)
if _dp:
    if zbc.get(_dp) < 0.5:
        zbc.press(_dp)
        out["steps"].append("draw mode")
else:
    out["missing"].append("Draw mode button")
zb_ops.mask("clear")
out["steps"].append("mask cleared")
_cz = zb_ops.resolve(["Tool:Polypaint:Colorize"], required=False)
if __KEEP__ in ("groups", "polypaint"):
    if _cz:
        _want = 0 if __KEEP__ == "groups" else 1
        if (zbc.get(_cz) >= 0.5) != bool(_want):
            zbc.press(_cz)
            zbc.update(redraw_ui=True)
            out["steps"].append("polypaint " + ("off" if _want == 0 else "on"))
        out["colorize"] = zbc.get(_cz)
        if (out["colorize"] >= 0.5) != bool(_want):
            raise RuntimeError("Colorize did not switch; DynaMesh would keep the wrong data")
    else:
        out["missing"].append("Tool:Polypaint:Colorize")
_r = zb_ops.dynamesh(__RES__, blur=__BLUR__, project=__PROJECT__, groups=__GROUPS__)
_btn = zb_ops.resolve("dyn_button")
if zbc.get(_btn) < 0.5:
    zbc.press(_btn)
    zbc.update(redraw_ui=True)
    out["steps"].append("DynaMesh was left off by the toggle: pressed again")
    _r["state_after"] = zbc.get(_btn)
    _r["faces_after"] = zb_ops.stats().get("faces")
    _r["remeshed"] = _r["faces_after"] != _r["faces_before"]
out["dynamesh"] = _r
out["ok"] = bool(_r.get("remeshed")) and zbc.get(_btn) >= 0.5
out["stats"] = zb_ops.stats()
result = out
'''


def remesh_code(resolution, keep="groups", groups=None, blur=None, project=None):
    """ZBrush code for a checked re-DynaMesh: Edit and Draw mode, mask cleared, polypaint set
    for what must survive (keep "groups": Colorize off; "polypaint": on; None: untouched),
    zb_ops.dynamesh, then proof that it remeshed (result["ok"]). groups=True keeps separate
    polygroups as separate shells (Pablo FrqUnna1jns 00:16:16); blur and project as in the
    DynaMesh palette. Needs the zb_ops prelude. NOT YET RUN IN ZBRUSH (live_s08)."""
    if keep not in ("groups", "polypaint", None):
        raise ValueError("keep: 'groups', 'polypaint' or None")
    res = int(resolution)
    if not 8 <= res <= 2048:
        raise ValueError("DynaMesh resolution between 8 (Pablo's minimum) and 2048 (doc cap)")
    return (REMESH.replace("__RES__", repr(res)).replace("__KEEP__", repr(keep))
            .replace("__GROUPS__", repr(groups)).replace("__BLUR__", repr(blur))
            .replace("__PROJECT__", repr(project)))


# Level discipline (Pablo, Logic Part 7, rArw79xEpvE 00:12:28 to 00:14:16; Dos and Don'ts
# tbQqC6tyDBQ 00:12:26): big moves and proportion changes at SDiv 1, secondary forms blocked at
# SDiv 2 or 3 and refined upward level by level, tertiary and layers at the top, never all the
# work at the top. The docs add that smoothing acts at the scale of the current level.
LEVEL_OPS = ("big", "smooth_big", "secondary", "refine", "detail", "layer", "project")


def level_for(op, sdiv_max, current=None):
    """SDiv for an operation on a stack with sdiv_max levels. 'refine' is the next level up
    from `current` (default: the secondary level). Secondary picks 3 on stacks of 4 or more
    levels, else 2 [added choice inside Pablo's '2 or 3']."""
    if op not in LEVEL_OPS:
        raise ValueError(f"op must be one of {LEVEL_OPS}")
    mx = max(1, int(round(sdiv_max or 1)))
    if op in ("big", "smooth_big"):
        return 1
    sec = min(mx, 3 if mx >= 4 else 2)
    if op == "secondary":
        return sec
    if op == "refine":
        return min(mx, (int(current) if current else sec) + 1)
    return mx                                 # detail, layer (created at the top), project


SET_LEVEL = r'''
_p = zb_ops.resolve("sdiv", required=False)
if _p is None:
    result = {"level": None, "max": None, "note": "no subdivision levels on this SubTool"}
else:
    _mx = zbc.get_max(_p)
    _lv = max(1, min(int(__LEVEL__), int(round(_mx))))
    zbc.set(_p, _lv)
    zbc.update(redraw_ui=True)
    result = {"level": zbc.get(_p), "max": _mx, "asked": __LEVEL__}
'''


def set_level_code(level):
    """ZBrush code that sets the SDiv slider (clamped to the stack) and reads it back."""
    return SET_LEVEL.replace("__LEVEL__", repr(int(level)))


# A perspective review render. The review toolkit (zb_review.capture_views) switches
# perspective OFF for measurable sheets, and aimed strokes need it off too; but Henning shapes
# the eyes with perspective ON (TpS0QdlfHWU 00:17:28) and Shane judges appeal and the eye
# sockets in a three-quarter perspective view (t_gg7MIGSDM 01:41:03 to 01:45:50). This render
# is for looking only: nothing is measured or aimed on it.
PERSP_SHOT = r'''
out = {}
zb_ops.ensure_edit()
_pp = zb_ops.resolve(__PERSP__, required=False)
if _pp is None:
    raise RuntimeError("no perspective switch among %r" % (__PERSP__,))
_t0 = [float(v) for v in zbc.get_transform()]
_was = zbc.get(_pp)
_w, _h = zbc.get("Document:Width"), zbc.get("Document:Height")
_bb = [float(v) for v in zbc.query_mesh3d(2, 3)]
_rot = zb_stroke.VIEWS[__VIEW__] if isinstance(__VIEW__, str) else tuple(__VIEW__)
try:
    zbc.set_transform(*zb_stroke.frame_transform(_bb, _w, _h, _rot, __MARGIN__))
    zbc.set(_pp, 1)
    zbc.update(redraw_ui=True)
    out["perspective"] = zbc.get(_pp)
    out.update(zb_ops.export_canvas(__PATH__, overwrite=True))
finally:
    zbc.set(_pp, _was)
    zbc.set_transform(*_t0)
    zbc.update(redraw_ui=True)
out["perspective_restored"] = zbc.get(_pp)
result = out
'''


def persp_snapshot_code(path, view="threequarter", margin=0.75):
    """ZBrush code: one canvas PNG with perspective on (eye placement, appeal), then the
    perspective switch and the view are restored. Needs the zb_ops and zb_stroke prelude.
    NOT YET RUN IN ZBRUSH (live_s08)."""
    if not os.path.isabs(path):
        raise ValueError("absolute path only (relative paths land in the app folder)")
    if isinstance(view, str) and view not in zb_stroke.VIEWS:
        raise ValueError(f"view: one of {sorted(zb_stroke.VIEWS)} or a rotation triple")
    v = view if isinstance(view, str) else [float(a) for a in view]
    return (PERSP_SHOT.replace("__PERSP__", repr(PERSP_PATHS)).replace("__VIEW__", repr(v))
            .replace("__MARGIN__", repr(float(margin))).replace("__PATH__", repr(path)))


# Eyes (Henning TpS0QdlfHWU 00:17:28 to 00:18:33: eyelids forced in with Dam_Standard, then
# moved out so they conform to an eyeball; Costa j5XLtLMN0P8 00:29:10 to 00:30:16: eyes placed
# straight ahead look cross-eyed, rotate each 3 to 7 degrees outward, about 5 on average; his
# measurement slide gives 3 to 10, more for a wall-eyed look).
EYE_OUTWARD_DEG = (3.0, 5.0, 10.0)


def eye_rotation(side, degrees=EYE_OUTWARD_DEG[1]):
    """Signed Y rotation (degrees) that turns an eye on `side` (+1 = +X) outward, away from
    the centre line. The sign convention of Tool:Deformation:Rotate is [verify live_s08]."""
    if side not in (1, -1):
        raise ValueError("side: +1 or -1")
    lo, hi = EYE_OUTWARD_DEG[0], EYE_OUTWARD_DEG[2]
    if not lo <= abs(degrees) <= hi:
        raise ValueError(f"Costa's range is {lo:g} to {hi:g} degrees outward")
    return side * abs(float(degrees))


# --------------------------------------------------------------------------------------------
# Small conveniences
# --------------------------------------------------------------------------------------------

def preview_plan(scene, specs, out_png, show_mask=False):
    """Draw the planned strokes over the Scene's canvas PNG (build green, carve red, other
    blue; brush radius as a circle at each stroke start) so the agent looks at the plan before
    sending it. Returns out_png."""
    from PIL import Image, ImageDraw
    if scene.png and os.path.exists(scene.png):
        im = Image.open(scene.png).convert("RGB")
    else:
        im = Image.new("RGB", scene.doc, (48, 48, 48))
    if show_mask and scene.mask is not None:
        ov = Image.fromarray((scene.mask * 60).astype("uint8"), "L")
        im = Image.composite(Image.new("RGB", im.size, (60, 60, 160)), im, ov)
    d = ImageDraw.Draw(im)
    for sp in specs:
        col = (60, 220, 90) if sp.get("plan", {}).get("expect_sign") == 1 else \
            (230, 70, 60) if sp.get("plan", {}).get("expect_sign") == -1 else (80, 150, 255)
        r = sp.get("plan", {}).get("diam_px", 2 * sp["draw_size"]) / 2.0
        for s in sp["strokes"]:
            d.line([tuple(p) for p in s], fill=col, width=2)
            x, y = s[0]
            d.ellipse([x - r, y - r, x + r, y + r], outline=col)
        d.text((10, 10 + 16 * specs.index(sp)), sp["label"], fill=col)
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    im.save(out_png)
    return out_png


def plan_summary(specs):
    """One line per pass spec (for the agent's log)."""
    lines = []
    for s in specs:
        lines.append(f"{s['label']}: {s['brush']} Draw {s['draw_size']} Z {s['z']} "
                     f"{'Zsub' if s['zsub'] else 'Zadd'} strokes {len(s['strokes'])} "
                     f"sym {s['symmetry']} warnings {len(s.get('warnings', []))}")
    return "\n".join(lines)


def run_plan(specs, port=DEFAULT_PORT, stop_on_flag=True, ppu=None):
    """apply_pass + pass_report for each spec; stops at the first flagged pass by default so the
    agent looks before stroking on. NOT YET RUN IN ZBRUSH."""
    reports = []
    for s in specs:
        res = apply_pass(s, port=port)
        rep = pass_report(res, expect_sign=s.get("plan", {}).get("expect_sign"), ppu=ppu)
        rep["result"] = res
        reports.append(rep)
        if stop_on_flag and not rep["ok"]:
            break
    return reports
