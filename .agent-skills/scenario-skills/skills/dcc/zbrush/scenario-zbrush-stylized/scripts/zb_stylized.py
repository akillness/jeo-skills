"""
zb_stylized: measurable shape language, stylized proportions, hair strand planning and the
ZBrush-side hair operations of the scenario-zbrush-stylized skill.

Two halves, like zb_review:

  agent side (system python3 with numpy and PIL; numpy does not exist inside ZBrush)
    proportions and splits ...... head_landmarks, head_checks, body_checks, summarize,
                                  split_fraction, fifty_fifty, split_check
    silhouettes ................. silhouette_mask, largest_component, outer_contour,
                                  shape_language, annotate_shape, band_breaks,
                                  head_taper, silhouette_iou, lineup, squint, value_check
    open curves (hair, straps) .. classify_polyline
    hair planning on an OBJ ..... Surface, roots_along, directions_away, march_strand,
                                  bend_path, plan_strands, crevice_path, strand_report,
                                  project_paths, best_view, overlay_paths, shells,
                                  strand_mesh_report, tube_radius_profile
    toy and print ............... toy_scale, mm_per_unit, feature_check
    DynaMesh .................... dynamesh_edge, dynamesh_resolution
    bridge ...................... call(func, *args, **kw) runs a ZBrush-side function

  inside ZBrush (reached through call(); zb_launch.call only imports scenario-zbrush-expert modules)
    probe_paths, subtool_boxes, lay_strands, stroke_from_view, scalp_shell, finish_hair,
    rebalance, crease_planes, load_curve_convention

It builds on the scenario-zbrush-expert toolkit (zb_ops, zb_stroke, zb_review, zb_audit, zb_launch)
and does not re-implement it. Coordinates: hair paths live in the space of an OBJ exported
with zb_ops.export_obj (+Y up, +Z toward the front camera, measured on the v03 sphere); the
SDK curve API takes tool space, and the mapping between the two is curve_convention.json
(default identity, [verify] live_01).

Evidence: the ZBrush half has NOT run in ZBrush yet (tests/code/zbrush-stylized/live_*).
The agent half runs offline in tests/code/zbrush-stylized/test_zb_stylized.py. Thresholds
tagged [added] are this module's defaults, to calibrate; expert numbers carry their source.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import importlib
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
CURVE_CONVENTION_FILE = os.path.join(HERE, "curve_convention.json")

_ADDED = EXPERT_SCRIPTS not in sys.path
if _ADDED:
    sys.path.insert(0, EXPERT_SCRIPTS)
try:
    import zb_ops  # noqa: E402  checked palette wrappers (zbc is None outside ZBrush)
    import zb_stroke  # noqa: E402  stroke strings and model-to-canvas projection
finally:
    if _ADDED:
        sys.path.remove(EXPERT_SCRIPTS)


class ZBStylizedError(RuntimeError):
    pass


def _expert(name):
    """Import a scenario-zbrush-expert module on demand (zb_audit, zb_review, zb_launch)."""
    if name in sys.modules:
        return sys.modules[name]
    added = EXPERT_SCRIPTS not in sys.path
    if added:
        sys.path.insert(0, EXPERT_SCRIPTS)
    try:
        return importlib.import_module(name)
    finally:
        if added:
            sys.path.remove(EXPERT_SCRIPTS)


def _np():
    import numpy as np  # agent side only
    return np


def _jsonable(o):
    if hasattr(o, "tolist"):
        return o.tolist()
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    return o


# ============================================================================================
# Proportions: real baseline, deliberate breaks, 70/30 splits
# ============================================================================================

# value = the real-anatomy number the ratio is compared with (None: the source gives none).
BASELINES = {
    "eye_line": (0.5, "Anatomy For Sculptors: eyes at mid-head (character digest, delta 28); "
                      "(eye y - chin y) / head height"),
    "split_at_eye_line": (0.0, "Shane Olson: cranium and jaw split at the eye line "
                               "[t_gg7MIGSDM 02:04:29]; (jaw top y - eye y) / head height"),
    "jaw_corner_depth": (0.5, "Shane Olson: the jaw corner ends under the ear, around the "
                              "middle of the head front to back [02:05:53]; (jaw corner z - "
                              "head back z) / head depth"),
    "jaw_under_ear": (0.0, "Shane Olson [02:05:53]; (jaw corner z - ear z) / head depth"),
    "canthus_recess": (0.10, "Shane Olson: seen from the top the outer eye corner sits well "
                             "behind the inner [02:06:27]; 0.10 of head depth is the stylized "
                             "digest's starting threshold [added]; one-sided (at least)"),
    "face_thirds": (0.0, "Anatomy For Sculptors: hairline-brow, brow-nose base, nose base-chin "
                         "equal within about 5 percent of head height (character digest; "
                         "tolerance added); largest deviation of a third from their mean"),
    "nose_third": (1.0, "Anatomy For Sculptors: the middle third runs brow to nose base; a big "
                        "stylized nose is this ratio above 1 (character digest P4) [added]"),
    "femur_tibia": (1.0, "Shane Olson: the knee halves the leg in real anatomy [00:25:08]"),
    "hand_drop": (0.0, "Shane Olson: real hands land at mid-thigh [00:26:01]; (mid-thigh y - "
                       "fingertip y) / leg length, positive = lower"),
    "humerus_forearm": (None, "Shane Olson names it a knob (his design: upper arm slightly "
                              "shorter than the forearm [00:26:01]); no real value given"),
    "hand_face": (1.0, "Anatomy For Sculptors: adult hand length equals chin to hairline "
                       "(character digest)"),
}

# Default tolerances [added]: how far a measurement may sit from its target and still pass.
TOLERANCES = {"eye_line": 0.05, "split_at_eye_line": 0.05, "jaw_corner_depth": 0.10,
              "jaw_under_ear": 0.10, "face_thirds": 0.05, "nose_third": 0.10,
              "femur_tibia": 0.10, "hand_drop": 0.05, "humerus_forearm": 0.10,
              "hand_face": 0.10}
ONE_SIDED = {"canthus_recess"}          # measured >= target passes

FIFTY_BAND = (0.45, 0.55)  # Rakan Khamash: 70/30, never 50/50 [FRZtVXpAokc 00:16:37];
                           # band from the character digest [threshold added]


def _box(b):
    """(min3, max3) from a subtool_boxes() row, a 6-list (-x,-y,-z,+x,+y,+z) or a pair."""
    if isinstance(b, dict):
        b = b["bbox"]
    if len(b) == 2:
        return tuple(b[0]), tuple(b[1])
    return (b[0], b[1], b[2]), (b[3], b[4], b[5])


def _center(b):
    lo, hi = _box(b)
    return tuple((lo[i] + hi[i]) / 2.0 for i in range(3))


def head_landmarks(boxes, points=None):
    """Scalar landmarks (OBJ space, +Y up, +Z front) from primitive boxes and point markers.

    boxes: {role: bbox} for roles cranium (required), jaw, nose, brow, ear (one side), eye
      (one eyeball). Values are subtool_boxes() rows or 6-lists.
    points: optional {name: (x, y, z)}: hairline, brow, nose_base, chin, crown, jaw_corner,
      ear, eye, canthus_inner, canthus_outer. Points override values derived from boxes.
    Shane Olson's head block: cranium plus jaw split at the eye line, jaw corner under the ear
    at mid depth [t_gg7MIGSDM 02:04:29-02:05:53].
    """
    points = points or {}
    lm = {}
    clo, chi = _box(boxes["cranium"])
    lm.update(crown_y=chi[1], back_z=clo[2], front_z=chi[2], chin_y=clo[1])
    if "jaw" in boxes:
        jlo, jhi = _box(boxes["jaw"])
        lm.update(chin_y=jlo[1], split_y=jhi[1], jaw_corner_z=jlo[2], jaw_corner_y=jlo[1])
    if "nose" in boxes:
        nlo, nhi = _box(boxes["nose"])
        lm.update(nose_base_y=nlo[1], nose_root_y=nhi[1], nose_tip_z=nhi[2])
    if "brow" in boxes:
        lm["brow_y"] = _center(boxes["brow"])[1]
    if "ear" in boxes:
        c = _center(boxes["ear"])
        lm.update(ear_y=c[1], ear_z=c[2])
    if "eye" in boxes:
        lm["eye_y"] = _center(boxes["eye"])[1]
    for name in ("hairline", "brow", "nose_base", "chin", "crown", "eye"):
        if name in points:
            lm[name + "_y"] = float(points[name][1])
    for name in ("jaw_corner", "ear"):
        if name in points:
            lm[name + "_y"] = float(points[name][1])
            lm[name + "_z"] = float(points[name][2])
    for name in ("canthus_inner", "canthus_outer"):
        if name in points:
            lm[name + "_z"] = float(points[name][2])
    lm["H"] = lm["crown_y"] - lm["chin_y"]
    lm["D"] = lm["front_z"] - lm["back_z"]
    if lm["H"] <= 0 or lm["D"] <= 0:
        raise ValueError("head height or depth <= 0: check the boxes and axes (+Y up, +Z front)")
    return lm


def _row(name, measured, targets, tol):
    base, src = BASELINES[name]
    target = targets.get(name, base)
    t = tol.get(name, TOLERANCES.get(name, 0.1))
    if target is None:
        ok = None
    elif name in ONE_SIDED:
        ok = measured >= target - 1e-12
    else:
        ok = abs(measured - target) <= t + 1e-12
    return {"name": name, "measured": round(float(measured), 4), "target": target,
            "baseline": base, "tol": None if name in ONE_SIDED else t, "ok": ok,
            "deliberate": base is not None and target is not None and abs(target - base) > 1e-9,
            "source": src}


def head_checks(lm, targets=None, tol=None):
    """Rows for every ratio the landmarks allow. targets: deliberate breaks, e.g.
    {"nose_third": 1.5} for a big nose; each break is recorded against the real baseline
    (Shane Olson: move the knobs on purpose and carefully [00:25:43])."""
    targets, tol = targets or {}, tol or {}
    H, D = lm["H"], lm["D"]
    rows = []
    if "eye_y" in lm:
        rows.append(_row("eye_line", (lm["eye_y"] - lm["chin_y"]) / H, targets, tol))
        if "split_y" in lm:
            rows.append(_row("split_at_eye_line", (lm["split_y"] - lm["eye_y"]) / H, targets, tol))
    if "jaw_corner_z" in lm:
        rows.append(_row("jaw_corner_depth", (lm["jaw_corner_z"] - lm["back_z"]) / D, targets, tol))
        if "ear_z" in lm:
            rows.append(_row("jaw_under_ear", (lm["jaw_corner_z"] - lm["ear_z"]) / D, targets, tol))
    if "canthus_inner_z" in lm and "canthus_outer_z" in lm:
        rows.append(_row("canthus_recess", (lm["canthus_inner_z"] - lm["canthus_outer_z"]) / D,
                         targets, tol))
    if all(k in lm for k in ("hairline_y", "brow_y", "nose_base_y")):
        thirds = [(lm["hairline_y"] - lm["brow_y"]) / H, (lm["brow_y"] - lm["nose_base_y"]) / H,
                  (lm["nose_base_y"] - lm["chin_y"]) / H]
        mean = sum(thirds) / 3.0
        r = _row("face_thirds", max(abs(t - mean) for t in thirds), targets, tol)
        r["thirds"] = [round(t, 4) for t in thirds]
        if "face_thirds" not in targets:
            r["ok"] = r["measured"] <= r["tol"] + 1e-12
        rows.append(r)
        face = lm["hairline_y"] - lm["chin_y"]
        rows.append(_row("nose_third", (lm["brow_y"] - lm["nose_base_y"]) / (face / 3.0),
                         targets, tol))
    return rows


def body_checks(points, targets=None, tol=None):
    """Limb ratios from point markers {hip, knee, ankle, shoulder, elbow, wrist, fingertip,
    hand_base, hairline, chin} (any subset). Shane Olson's stylization knobs: leg split, arm
    split, where the hands land [t_gg7MIGSDM 00:25:08-00:26:35]."""
    targets, tol = targets or {}, tol or {}
    P = {k: tuple(float(c) for c in v) for k, v in points.items()}
    rows = []
    if all(k in P for k in ("hip", "knee", "ankle")):
        femur, tibia = math.dist(P["hip"], P["knee"]), math.dist(P["knee"], P["ankle"])
        rows.append(_row("femur_tibia", femur / tibia, targets, tol))
        if "fingertip" in P:
            mid = (P["hip"][1] + P["knee"][1]) / 2.0
            rows.append(_row("hand_drop", (mid - P["fingertip"][1]) / (femur + tibia),
                             targets, tol))
    if all(k in P for k in ("shoulder", "elbow", "wrist")):
        rows.append(_row("humerus_forearm", math.dist(P["shoulder"], P["elbow"]) /
                         math.dist(P["elbow"], P["wrist"]), targets, tol))
    if all(k in P for k in ("hand_base", "fingertip", "hairline", "chin")):
        rows.append(_row("hand_face", math.dist(P["hand_base"], P["fingertip"]) /
                         math.dist(P["hairline"], P["chin"]), targets, tol))
    return rows


def summarize(rows):
    fails = [r["name"] for r in rows if r["ok"] is False]
    return {"ok": not fails, "fails": fails,
            "breaks": {r["name"]: {"target": r["target"], "baseline": r["baseline"],
                                   "measured": r["measured"]} for r in rows if r["deliberate"]},
            "unjudged": [r["name"] for r in rows if r["ok"] is None]}


def split_fraction(a, b, at):
    """Where `at` sits between a and b (0 at a, 1 at b)."""
    if b == a:
        raise ValueError("empty span")
    return (at - a) / (b - a)


def fifty_fifty(frac, band=FIFTY_BAND):
    """True when a break sits in the 50/50 band (Rakan's rule says push it toward 70/30)."""
    return band[0] <= frac <= band[1]


def split_check(name, a, b, at, band=FIFTY_BAND):
    f = split_fraction(a, b, at)
    return {"name": name, "fraction": round(f, 4), "fifty_fifty": fifty_fifty(f, band),
            "rule": "70/30, not 50/50 (Rakan Khamash, FRZtVXpAokc 00:16:37)"}


# ============================================================================================
# Silhouettes and contours (canvas PNG from zb_ops.export_canvas or zb_review)
# ============================================================================================

def silhouette_mask(png_path, threshold=28, edge=4, largest=True):
    """Model pixels against ZBrush's gradient background: the background model of
    zb_review.silhouette_bbox (per-row median of the outer columns), which returns only the
    bbox. largest=True keeps the biggest 4-connected blob."""
    np = _np()
    from PIL import Image
    with Image.open(png_path) as src:
        im = np.asarray(src.convert("RGB")).astype(np.int16)
    ref = np.median(np.concatenate([im[:, :edge], im[:, -edge:]], axis=1), axis=1)
    mask = np.abs(im - ref[:, None, :]).max(axis=2) > threshold
    mask[:, :edge] = False
    mask[:, -edge:] = False
    return largest_component(mask) if largest else mask


def largest_component(mask):
    """Biggest 4-connected blob (label propagation of zb_audit._shells over pixels)."""
    np = _np()
    mask = np.asarray(mask, dtype=bool)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return mask.copy()
    idx = -np.ones(mask.shape, dtype=np.int64)
    idx[ys, xs] = np.arange(len(ys))
    ry, rx = np.nonzero(mask[:, :-1] & mask[:, 1:])
    dy, dx = np.nonzero(mask[:-1, :] & mask[1:, :])
    a = np.concatenate([idx[ry, rx], idx[dy, dx]])
    b = np.concatenate([idx[ry, rx + 1], idx[dy + 1, dx]])
    lab = _expert("zb_audit")._shells(len(ys), a, b)
    vals, counts = np.unique(lab, return_counts=True)
    keep = lab == vals[int(np.argmax(counts))]
    out = np.zeros_like(mask)
    out[ys[keep], xs[keep]] = True
    return out


_DIRS8 = ((-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1))  # x, y


def outer_contour(mask):
    """Ordered outer boundary pixels [(x, y), ...] of the blob that holds the top-left-most
    pixel (Moore neighbour tracing, Jacob's stop). Run largest_component first."""
    np = _np()
    mask = np.asarray(mask, dtype=bool)
    hgt, wid = mask.shape
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return []
    y0 = int(ys.min())
    x0 = int(xs[ys == y0].min())

    def on(x, y):
        return 0 <= x < wid and 0 <= y < hgt and mask[y, x]

    start = (x0, y0)
    p, b = start, (x0 - 1, y0)
    out = [start]
    for _ in range(4 * int(mask.sum()) + 16):
        k = _DIRS8.index((b[0] - p[0], b[1] - p[1]))
        nxt = None
        for i in range(1, 9):
            dx, dy = _DIRS8[(k + i) % 8]
            c = (p[0] + dx, p[1] + dy)
            if on(*c):
                pdx, pdy = _DIRS8[(k + i - 1) % 8]
                b, nxt = (p[0] + pdx, p[1] + pdy), c
                break
        if nxt is None:        # isolated pixel
            return out
        if p == start and len(out) > 1 and nxt == out[1]:
            out.pop()          # back at the start, about to repeat the first move
            break
        p = nxt
        out.append(p)
    return out


def _resample(pts, spacing, closed):
    np = _np()
    P = np.asarray(pts, dtype=float)
    if closed:
        P = np.vstack([P, P[:1]])
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = float(cum[-1])
    if total <= 0:
        return P[:1], 0.0
    n = max(8, int(round(total / spacing)))
    t = np.linspace(0.0, total, n, endpoint=not closed)
    out = np.stack([np.interp(t, cum, P[:, j]) for j in range(P.shape[1])], axis=1)
    return out, total


def _smooth(P, w, closed):
    np = _np()
    if w <= 1 or len(P) < 3:
        return P
    k = np.ones(w) / w
    if closed:
        ext = np.vstack([P[-w:], P, P[:w]])
        return np.stack([np.convolve(ext[:, j], k, mode="same")[w:-w] for j in range(P.shape[1])],
                        axis=1)
    out = P.copy()
    h = w // 2
    for i in range(h, len(P) - h):
        out[i] = P[i - h:i + h + 1].mean(axis=0)
    return out


def _wrap_deg(a):
    return (a + 180.0) % 360.0 - 180.0


def _turns(P, k, closed):
    """Signed turn in degrees over a 2k window at each sample (y down: + is clockwise)."""
    np = _np()
    n = len(P)
    idx = np.arange(n)
    if closed:
        f = P[(idx + k) % n] - P
        b = P - P[(idx - k) % n]
    else:
        f = P[np.minimum(idx + k, n - 1)] - P
        b = P - P[np.maximum(idx - k, 0)]
    af = np.degrees(np.arctan2(f[:, 1], f[:, 0]))
    ab = np.degrees(np.arctan2(b[:, 1], b[:, 0]))
    t = _wrap_deg(af - ab)
    if not closed:
        t[:1] = 0.0
        t[-1:] = 0.0
    return t


def _runs(signs, closed):
    n = len(signs)
    if n == 0:
        return []
    if closed and all(s == signs[0] for s in signs):
        return [(int(signs[0]), 0, n)]
    start = 0
    if closed:
        start = next(i for i in range(n) if signs[i] != signs[i - 1])
    runs, i = [], 0
    while i < n:
        s = signs[(start + i) % n]
        j = i
        while j < n and signs[(start + j) % n] == s:
            j += 1
        runs.append((int(s), (start + i) % n, j - i))
        i = j
    return runs


def _run_points(P, i0, cnt):
    np = _np()
    return P[(np.arange(i0, i0 + cnt)) % len(P)]


def _segment(P, i0, cnt, spacing):
    np = _np()
    Q = _run_points(P, i0, cnt)
    c = Q.mean(axis=0)
    _, _, vt = np.linalg.svd(Q - c, full_matrices=False)
    u = vt[0]
    s = (Q - c) @ u
    return {"length_px": round(cnt * spacing, 1), "angle_deg": round(float(np.degrees(
        math.atan2(u[1], u[0])) % 180.0), 2), "mid": c.tolist(), "dir": u.tolist(),
        "p0": (c + u * s.min()).tolist(), "p1": (c + u * s.max()).tolist(), "i0": int(i0),
        "count": int(cnt)}


def _parallel(segs, tol_deg, min_overlap, min_gap):
    np = _np()
    out = []
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            a, b = segs[i], segs[j]
            d = abs(a["angle_deg"] - b["angle_deg"]) % 180.0
            d = min(d, 180.0 - d)
            if d > tol_deg:
                continue
            u = np.asarray(a["dir"])
            nrm = np.array([-u[1], u[0]])
            gap = abs(float((np.asarray(b["mid"]) - np.asarray(a["mid"])) @ nrm))
            if gap < min_gap:
                continue
            pa = sorted([float(np.asarray(a["p0"]) @ u), float(np.asarray(a["p1"]) @ u)])
            pb = sorted([float(np.asarray(b["p0"]) @ u), float(np.asarray(b["p1"]) @ u)])
            short = max(1e-9, min(pa[1] - pa[0], pb[1] - pb[0]))
            ov = max(0.0, min(pa[1], pb[1]) - max(pa[0], pb[0])) / short
            if ov >= min_overlap:
                out.append({"a": i, "b": j, "angle_diff_deg": round(d, 2),
                            "gap_px": round(gap, 1), "overlap": round(ov, 2)})
    return out


def shape_language(src, spacing=2.0, scale_frac=0.05, straight_deg=3.0,
                   min_straight_frac=0.06, min_curve_frac=0.03, parallel_tol_deg=5.0,
                   ignore_bottom_frac=0.0, border_px=6, keep_samples=False,
                   max_straight_fraction=0.25, max_noise_per_1000px=4.0):
    """Rakan Khamash's shape rules measured on a silhouette (FRZtVXpAokc 00:06:07-00:08:53):
    S and C curves, no long straight runs, no parallel lines, no noisy curves.

    src: canvas PNG path or boolean mask. The outer contour is resampled every `spacing` px
    and smoothed; each sample's turn over a window of scale_frac x bbox diagonal is straight
    (|turn| < straight_deg), convex or concave. Runs of equal class give:
      straight_runs (>= min_straight_frac of the perimeter), their parallel pairs (direction
      within parallel_tol_deg, facing each other, overlapping by half),
      c_runs (curved runs >= min_curve_frac), s_pairs (adjacent long runs of opposite
      sign), noise_flips (sign changes involving a short curved run).
    ignore_bottom_frac: skip the bottom part of the bbox (the cut base of a bust).
    All thresholds are [added] defaults: calibrate them on reference silhouettes.
    """
    np = _np()
    mask = silhouette_mask(src) if isinstance(src, str) else largest_component(src)
    hgt, wid = mask.shape
    raw = outer_contour(mask)
    if len(raw) < 16:
        raise ValueError("silhouette too small for contour analysis")
    ys, xs = np.nonzero(mask)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    diag = math.hypot(bbox[2] - bbox[0], bbox[3] - bbox[1])
    P, perim = _resample(raw, spacing, True)
    P = _smooth(P, 5, True)
    k = max(1, int(round(scale_frac * diag / spacing / 2.0)))
    t = _smooth(_turns(P, k, True)[:, None], 2 * k + 1, True)[:, 0]  # kills pixel staircase
    signs = [0 if abs(v) < straight_deg else (1 if v > 0 else -1) for v in t]
    y_cut = bbox[3] - ignore_bottom_frac * (bbox[3] - bbox[1])
    ignore = [(p[1] > y_cut and ignore_bottom_frac > 0) or p[0] < border_px or
              p[1] < border_px or p[0] > wid - 1 - border_px or p[1] > hgt - 1 - border_px
              for p in P]
    runs = _runs(signs, True)
    min_s, min_c = min_straight_frac * perim, min_curve_frac * perim
    straight, curved = [], []
    for s, i0, cnt in runs:
        pts_ign = sum(ignore[(i0 + q) % len(P)] for q in range(cnt))
        if pts_ign > cnt / 2:
            continue
        L = cnt * spacing
        if s == 0 and L >= min_s:
            straight.append(_segment(P, i0, cnt, spacing))
        elif s != 0:
            curved.append((s, i0, cnt, L))
    long_c = [c for c in curved if c[3] >= min_c]
    seq = [c for c in curved]
    noise = s_pairs = 0
    for a, b in zip(seq, seq[1:] + seq[:1] if len(seq) > 1 else []):
        if a[0] != b[0]:
            if a[3] < min_c or b[3] < min_c:
                noise += 1
            else:
                s_pairs += 1
    straight_len = sum(sg["length_px"] for sg in straight)
    pairs = _parallel(straight, parallel_tol_deg, 0.5, 3 * spacing)
    rep = {"perimeter_px": round(perim, 1), "bbox": bbox, "diag_px": round(diag, 1),
           "straight_fraction": round(straight_len / perim, 4),
           "curved_fraction": round(sum(c[3] for c in long_c) / perim, 4),
           "c_runs": len(long_c), "s_pairs": s_pairs, "noise_flips": noise,
           "noise_per_1000px": round(1000.0 * noise / perim, 3),
           "straight_runs": straight, "parallel_pairs": pairs}
    flags = []
    if rep["straight_fraction"] > max_straight_fraction:
        flags.append("long straight runs (boring): flare or taper them")
    if pairs:
        flags.append(f"{len(pairs)} parallel pair(s): break one line (flare top, taper bottom)")
    if rep["noise_per_1000px"] > max_noise_per_1000px:
        flags.append("noisy contour: simplify to fewer, cleaner curves")
    if not long_c:
        flags.append("no readable C or S curve")
    rep["flags"] = flags
    if keep_samples:
        rep["samples"] = [[round(float(p[0]), 1), round(float(p[1]), 1), int(s)]
                          for p, s in zip(P, signs)]
    return rep


def annotate_shape(png_path, report, out_path):
    """Draw the contour classes (needs keep_samples=True): straight red, convex green,
    concave cyan; parallel pairs linked in yellow. For the agent to look at."""
    from PIL import Image, ImageDraw
    col = {0: (230, 60, 60), 1: (60, 220, 90), -1: (60, 200, 230)}
    with Image.open(png_path) as src:
        im = src.convert("RGB")
    d = ImageDraw.Draw(im)
    for x, y, s in report.get("samples", []):
        d.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=col[s])
    segs = report["straight_runs"]
    for pr in report["parallel_pairs"]:
        a, b = segs[pr["a"]]["mid"], segs[pr["b"]]["mid"]
        d.line([tuple(a), tuple(b)], fill=(250, 220, 40), width=3)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    im.save(out_path)
    return out_path


def band_breaks(src, top_k=3, jump_frac=0.03, min_sep_frac=0.08, end_frac=0.06,
                min_jump_frac=0.08, band=FIFTY_BAND):
    """Main width changes down the silhouette (chin, neck to shoulders, scarf band) and where
    they sit as a fraction of the height from the top; a break in the 50/50 band is flagged
    (Rakan's 70/30 rule [threshold added]). A break is a width jump across +-jump_frac of
    the height of at least min_jump_frac of the widest row; the top and bottom end_frac are
    skipped (every silhouette narrows at its ends). Defaults [added]."""
    np = _np()
    mask = silhouette_mask(src) if isinstance(src, str) else np.asarray(src, dtype=bool)
    rows = np.nonzero(mask.any(axis=1))[0]
    y0, y1 = int(rows.min()), int(rows.max())
    h = y1 - y0 + 1
    w = np.zeros(h)
    for i, y in enumerate(range(y0, y1 + 1)):
        xs = np.nonzero(mask[y])[0]
        w[i] = xs.max() - xs.min() + 1 if len(xs) else 0
    d = max(1, int(jump_frac * h))
    g = np.zeros(h)
    lo_i, hi_i = max(d, int(end_frac * h)), min(h - d, int((1 - end_frac) * h))
    for i in range(lo_i, hi_i):
        g[i] = abs(w[i + d] - w[i - d])
    picked = []
    for i in np.argsort(-g):
        if len(picked) >= top_k or g[i] < min_jump_frac * w.max():
            break
        if all(abs(int(i) - j) >= min_sep_frac * h for j in picked):
            picked.append(int(i))
    out = []
    for i in sorted(picked):
        f = i / float(h)
        out.append({"y": y0 + i, "fraction": round(f, 4), "fifty_fifty": fifty_fifty(f, band),
                    "width_above_px": float(w[i - d]), "width_below_px": float(w[i + d])})
    return {"height_px": h, "breaks": out}


HEAD_TAPER_MAX = 0.95      # narrow / wide width, above this the sides read parallel [added]
HEAD_SIDE_ARC_MIN = 0.01   # side sag / head depth, below this the side is a flat plane [added]


def head_taper(src, fracs=(0.2, 0.8), face=None, max_taper=HEAD_TAPER_MAX,
               min_arc=HEAD_SIDE_ARC_MIN):
    """Shane Olson's head sides on a TOP view of the cranium alone (solo it): clip the sides
    so the head planes taper, because the side of the head is not straight front to back
    (t_gg7MIGSDM 02:00:26 to 02:00:59), and keep each side an arc, not a flat plane
    (02:11:58). Depth runs along the image rows. Measures the width at fracs of the depth
    (taper = narrow / wide) and each side's sag from its chord between those rows (/ depth,
    positive = bulging out). face: "top" or "bottom", the image side the face is on in this
    view (zb_stroke convention [verify live_04]); when given, a head narrowing toward the
    back is flagged. A plain sphere fails the taper and passes the arc; a hard clip passes
    the taper and fails the arc. Thresholds [added]: calibrate on reference heads."""
    np = _np()
    mask = silhouette_mask(src) if isinstance(src, str) else np.asarray(src, dtype=bool)
    rows = np.nonzero(mask.any(axis=1))[0]
    if len(rows) < 10:
        raise ZBStylizedError("no silhouette to measure")
    y0, y1 = int(rows.min()), int(rows.max())
    depth = y1 - y0 + 1

    def edges(y):
        xs = np.nonzero(mask[y])[0]
        return (int(xs.min()), int(xs.max())) if len(xs) else (None, None)

    ya, yb = (y0 + int(round(f * (depth - 1))) for f in fracs)
    (la, ra), (lb, rb) = edges(ya), edges(yb)
    wa, wb = ra - la + 1, rb - lb + 1
    taper = min(wa, wb) / float(max(wa, wb))
    narrow = "top" if wa < wb else "bottom" if wb < wa else None
    sags = {"left": 0.0, "right": 0.0}
    for y in range(ya + 1, yb):
        l, r = edges(y)
        if l is None:
            continue
        t = (y - ya) / float(yb - ya)
        sags["left"] = max(sags["left"], (la + t * (lb - la)) - l)      # bulge to the left
        sags["right"] = max(sags["right"], r - (ra + t * (rb - ra)))    # bulge to the right
    arc = {k: round(v / depth, 4) for k, v in sags.items()}
    flags = []
    if taper > max_taper:
        flags.append(f"sides parallel from the top (taper {taper:.2f}): clip the cranium "
                     "sides so the head narrows toward the face (Shane 02:00:26)")
    for k, v in arc.items():
        if v < min_arc:
            flags.append(f"{k} side is a flat plane (sag {v:.3f} of depth): keep an arc "
                         "(Shane 02:11:58)")
    if face and narrow and narrow != face and taper <= max_taper:
        flags.append(f"the head narrows toward the back ({narrow}), not the face ({face})")
    return {"depth_px": depth, "rows": [ya, yb], "widths_px": [wa, wb],
            "taper": round(taper, 4), "narrow_end": narrow, "arc": arc,
            "ok": not flags, "flags": flags}


def _norm_sil(mask, height):
    np = _np()
    from PIL import Image
    m = np.asarray(mask, dtype=bool)
    ys, xs = np.nonzero(m)
    crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape
    nw = max(1, int(round(w * height / float(h))))
    near = getattr(Image, "Resampling", Image).NEAREST
    im = Image.fromarray((crop * 255).astype(np.uint8)).resize((nw, height), near)
    return np.asarray(im) > 127


def silhouette_iou(a, b, height=96):
    """IoU of two silhouettes scaled to the same height and centred: the thumbnail read
    Rakan calls talking to the back of the room [FRZtVXpAokc 00:05:00]; 64 to 128 px tall
    per the Overwatch note [added]."""
    np = _np()
    A = _norm_sil(silhouette_mask(a) if isinstance(a, str) else a, height)
    B = _norm_sil(silhouette_mask(b) if isinstance(b, str) else b, height)
    W = max(A.shape[1], B.shape[1])

    def pad(M):
        left = (W - M.shape[1]) // 2
        return np.pad(M, ((0, 0), (left, W - M.shape[1] - left)))

    A, B = pad(A), pad(B)
    union = np.logical_or(A, B).sum()
    return float(np.logical_and(A, B).sum() / union) if union else 1.0


def lineup(srcs, labels=None, height=96, too_similar=0.85):
    """Pairwise silhouette IoU for a lineup (Cedric Seaut: lineups force distinct
    silhouettes [UthCuDB1IEQ 00:08:31]); pairs above too_similar [added] are flagged."""
    labels = labels or [str(i) for i in range(len(srcs))]
    masks = [silhouette_mask(s) if isinstance(s, str) else s for s in srcs]
    n = len(masks)
    mat = [[1.0] * n for _ in range(n)]
    flagged = []
    for i in range(n):
        for j in range(i + 1, n):
            v = round(silhouette_iou(masks[i], masks[j], height), 4)
            mat[i][j] = mat[j][i] = v
            if v > too_similar:
                flagged.append((labels[i], labels[j], v))
    return {"labels": labels, "iou": mat, "too_similar": flagged}


def squint(png_path, out_dir, heights=(128, 64), blur=1.5, view_h=384, sheet=True):
    """The agent's squint (Pablo Munoz Gomez squints to find hair chunks [WFqyj6lKgik
    00:15:56]): thumbnails at each height, blurred, blown back up for viewing, tiled with
    zb_review.contact_sheet. Look at the result: do the big chunks and the silhouette read?"""
    from PIL import Image, ImageFilter
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(png_path))[0]
    paths, labels = [], []
    with Image.open(png_path) as src:
        im = src.convert("RGB")
    for h in heights:
        w = max(1, int(round(im.width * h / float(im.height))))
        small = im.resize((w, h), getattr(Image, "Resampling", Image).LANCZOS)
        if blur:
            small = small.filter(ImageFilter.GaussianBlur(blur))
        big = small.resize((int(round(w * view_h / float(h))), view_h),
                           getattr(Image, "Resampling", Image).NEAREST)
        p = os.path.join(out_dir, f"{base}_squint_{h}px.png")
        big.save(p)
        paths.append(p)
        labels.append(f"{h} px tall, blur {blur}")
    out = {"thumbnails": paths}
    if sheet:
        out["sheet"] = _expert("zb_review").contact_sheet(
            paths, labels, os.path.join(out_dir, f"{base}_squint_sheet.png"), cols=len(paths),
            title="squint: chunks and silhouette must still read")
    return out


def value_check(png_path, mask=None, focus_box=None, grid=6):
    """Guillaume Tiberghien's grayscale read [UthCuDB1IEQ 00:58:45-00:59:53]: no pure black
    or white, the strongest contrast where attention should go (usually the face).
    focus_box: [x0, y0, x1, y1] canvas px. Returns fractions and the highest-contrast cell."""
    np = _np()
    from PIL import Image
    with Image.open(png_path) as src:
        rgb = np.asarray(src.convert("RGB")).astype(float)
    L = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    m = silhouette_mask(png_path) if mask is None else np.asarray(mask, dtype=bool)
    vals = L[m]
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    best = None
    for gy in range(grid):
        for gx in range(grid):
            cx0 = x0 + (x1 - x0) * gx // grid
            cx1 = x0 + (x1 - x0) * (gx + 1) // grid
            cy0 = y0 + (y1 - y0) * gy // grid
            cy1 = y0 + (y1 - y0) * (gy + 1) // grid
            cm = m[cy0:cy1, cx0:cx1]
            if cm.size == 0 or cm.mean() < 0.5:
                continue
            sd = float(L[cy0:cy1, cx0:cx1][cm].std())
            if best is None or sd > best[0]:
                best = (sd, [int(cx0), int(cy0), int(cx1), int(cy1)])
    out = {"pure_black_frac": round(float((vals <= 3).mean()), 4),
           "pure_white_frac": round(float((vals >= 252).mean()), 4),
           "mean": round(float(vals.mean()), 2),
           "max_contrast_cell": best[1] if best else None,
           "max_contrast_std": round(best[0], 2) if best else None}
    if focus_box and best:
        c = ((best[1][0] + best[1][2]) / 2.0, (best[1][1] + best[1][3]) / 2.0)
        out["contrast_in_focus"] = bool(focus_box[0] <= c[0] <= focus_box[2] and
                                        focus_box[1] <= c[1] <= focus_box[3])
    return out


# ============================================================================================
# Open curves: hair clumps, strands, straps, scarf tails
# ============================================================================================

def _plane2d(points):
    np = _np()
    P = np.asarray(points, dtype=float)
    if P.shape[1] == 2:
        return P
    c = P.mean(axis=0)
    _, _, vt = np.linalg.svd(P - c, full_matrices=False)
    return np.stack([(P - c) @ vt[0], (P - c) @ vt[1]], axis=1)


def _dev_changes(dev, hyst=0.15):
    """Sign changes of a deviation profile, ignoring wiggles under hyst x max |dev|."""
    np = _np()
    thr = hyst * float(np.abs(dev).max())
    state, changes = 0, 0
    for v in dev:
        s = 1 if v > thr else (-1 if v < -thr else 0)
        if s and state and s != state:
            changes += 1
        if s:
            state = s
    return changes


def classify_polyline(points, samples=96, scale_frac=0.08, straight_deg=2.0,
                      min_run_frac=0.12, straight_dev=0.02):
    """straight, C, S, multi or noisy for an open curve (2D canvas px, or 3D projected on its
    best-fit plane). Rakan: a good curve is clean, a C or a mild S mix; avoid straight and
    noisy lines [FRZtVXpAokc 00:06:07]. The kind comes from the sign changes of the sideways
    deviation from the chord (0: C, 1: S, 2+: multi); noisy = two or more turn flips shorter
    than min_run_frac of the curve (kinks, stitched strokes: Pablo [WFqyj6lKgik 00:26:10]);
    straight = deviation under straight_dev of the chord. A curly design reads as multi or
    noisy by construction: judge it against the design. Thresholds [added]."""
    np = _np()
    Q = _plane2d(points)
    P, total = _resample(Q, 1.0, False)
    if total <= 0:
        return {"kind": "point", "length": 0.0}
    P, _ = _resample(Q, total / float(samples), False)
    P = _smooth(P, 5, False)
    k = max(1, int(round(scale_frac * len(P) / 2.0)))
    t = _smooth(_turns(P, k, False)[:, None], 2 * k + 1, False)[:, 0]
    signs = [0 if abs(v) < straight_deg else (1 if v > 0 else -1) for v in t]
    min_n = min_run_frac * len(P)
    nz = [(s, n) for s, _, n in _runs(signs, False) if s != 0]
    long_nz = [(s, n) for s, n in nz if n >= min_n]
    short_flips = sum(1 for a, b in zip(nz, nz[1:]) if a[0] != b[0] and (a[1] < min_n or b[1] < min_n))
    chord = P[-1] - P[0]
    cl = float(np.linalg.norm(chord)) or 1e-12
    nrm = np.array([-chord[1], chord[0]]) / cl
    dev = (P - P[0]) @ nrm
    dev_ratio = float(np.abs(dev).max()) / cl
    changes = _dev_changes(dev)
    if short_flips >= 2 and 2 * short_flips >= changes:
        kind = "noisy"
    elif dev_ratio < straight_dev and not long_nz:
        kind = "straight"
    else:
        kind = {0: "C", 1: "S"}.get(changes, "multi")
    return {"kind": kind, "length": round(total, 4), "sign_changes": changes,
            "short_flips": short_flips, "max_dev_ratio": round(dev_ratio, 4)}


# ============================================================================================
# Hair planning on an exported mass (OBJ space)
# ============================================================================================

class Surface:
    """Nearest-vertex surface for strand planning on an OBJ export (zb_ops.export_obj).
    Vertex normals are area weighted and oriented outward by the signed volume. `limit`
    subsamples the query vertices of very dense meshes (normals use the full mesh)."""

    def __init__(self, verts, flat, sizes, limit=150000):
        np = _np()
        V = np.asarray(verts, dtype=float).reshape(-1, 3)
        flat = np.asarray(flat, dtype=np.int64)
        sizes = np.asarray(sizes, dtype=np.int64)
        starts = np.concatenate([[0], np.cumsum(sizes)[:-1]]) if len(sizes) else sizes
        ntri = np.maximum(sizes - 2, 0)
        fi = np.repeat(np.arange(len(sizes)), ntri)
        local = np.arange(int(ntri.sum())) - np.repeat(np.cumsum(ntri) - ntri, ntri)
        a = flat[starts[fi]]
        b = flat[starts[fi] + local + 1]
        c = flat[starts[fi] + local + 2]
        cr = np.cross(V[b] - V[a], V[c] - V[a])
        vol = float(np.einsum("ij,ij->i", V[a], np.cross(V[b], V[c])).sum()) / 6.0
        N = np.zeros_like(V)
        for idx in (a, b, c):
            np.add.at(N, idx, cr)
        ln = np.linalg.norm(N, axis=1)
        ln[ln == 0] = 1.0
        N = N / ln[:, None] * (1.0 if vol >= 0 else -1.0)
        step = max(1, int(math.ceil(len(V) / float(limit))))
        self.V, self.N = V, N
        self.Q, self.QN = V[::step], N[::step]
        self._q2 = (self.Q ** 2).sum(axis=1)
        self.volume = vol
        self.bbox = (V.min(axis=0).tolist(), V.max(axis=0).tolist())
        self.center = ((V.min(axis=0) + V.max(axis=0)) / 2.0).tolist()
        self.diag = float(np.linalg.norm(V.max(axis=0) - V.min(axis=0)))

    @classmethod
    def from_obj(cls, path, limit=150000):
        m = _expert("zb_audit").load_obj(path)
        return cls(m.verts, m.flat, m.sizes, limit)

    def closest(self, p):
        np = _np()
        p = np.asarray(p, dtype=float)
        i = int(np.argmin(self._q2 - 2.0 * (self.Q @ p)))
        return self.Q[i], self.QN[i]

    def project(self, p, lift=0.0):
        """Point on the tangent plane of the nearest vertex, lifted along its normal."""
        np = _np()
        p = np.asarray(p, dtype=float)
        v, n = self.closest(p)
        return p - float((p - v) @ n) * n + lift * n, n

    def distance(self, p):
        np = _np()
        v, n = self.closest(p)
        return float((np.asarray(p, dtype=float) - v) @ n)


def _unit(v):
    np = _np()
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else v * 0.0


def roots_along(surface, polyline, n, lift=0.0):
    """n roots evenly spaced along a 3D polyline (a parting line or hairline), on the surface."""
    np = _np()
    P, _ = _resample(np.asarray(polyline, dtype=float), 1e-3 * surface.diag, False)
    cum = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    ts = np.linspace(0.0, cum[-1], n) if n > 1 else np.array([cum[-1] / 2.0])
    pts = np.stack([np.interp(ts, cum, P[:, j]) for j in range(3)], axis=1)
    return [surface.project(p, lift)[0] for p in pts]


def directions_away(surface, roots, line, bias=(0.0, -1.0, 0.0), bias_weight=0.3):
    """Tangent directions pointing away from a parting line, pulled toward `bias` (down by
    default): hair flows from the part [added, stylized digest P4]."""
    np = _np()
    L, _ = _resample(np.asarray(line, dtype=float), 1e-3 * surface.diag, False)
    bias = _unit(np.asarray(bias, dtype=float))
    out = []
    for r in roots:
        r = np.asarray(r, dtype=float)
        _, n = surface.closest(r)
        q = L[int(np.argmin(((L - r) ** 2).sum(axis=1)))]
        d = (r - q) - float((r - q) @ n) * n        # in the tangent plane: ignore the lift
        d = _unit(d) if float(np.linalg.norm(d)) > 1e-3 * surface.diag else bias
        d = _unit(d + bias_weight * bias)
        t = _unit(d - float(d @ n) * n)
        out.append(t if float(np.linalg.norm(t)) > 0 else _unit(bias - float(bias @ n) * n))
    return out


def march_strand(surface, root, direction, length, step=None, lift=0.0, gravity=0.15,
                 down=(0.0, -1.0, 0.0), max_steps=600):
    """A strand path that walks along the mass from `root`, tangent to it, bending toward
    `down` by `gravity` per step (0: none, 1: straight down): Dan Eder's strands laid over a
    temporary mass [VJ2nMJRtIwQ 00:12:57]; the flow-field march is the stylized digest's
    agent method [added]. Stops early when the direction turns into the surface normal."""
    np = _np()
    step = step or length / 40.0
    down = _unit(np.asarray(down, dtype=float))
    p, n = surface.project(root, lift)
    d = np.asarray(direction, dtype=float)
    d = _unit(d - float(d @ n) * n)
    if float(np.linalg.norm(d)) < 1e-9:
        d = _unit(down - float(down @ n) * n)
    path, done = [p], 0.0
    for _ in range(max_steps):
        if done >= length - 1e-9:
            break
        d = _unit((1.0 - gravity) * d + gravity * down)
        t = d - float(d @ n) * n
        if float(np.linalg.norm(t)) < 1e-6:
            break
        t = _unit(t)
        q, n2 = surface.project(p + min(step, length - done) * t, lift)
        seg = float(np.linalg.norm(q - p))
        if seg < 1e-12:
            break
        done += seg
        d, p, n = _unit(q - p), q, n2
        path.append(q)
    return np.asarray(path)


def bend_path(surface, path, kind="C", amount=0.08, lift=0.0, side=1.0):
    """Sideways bend inside the surface's tangent plane so a strand reads as a C (sin pi s),
    an S (sin 2 pi s) or a sweep (s squared, the tip travels). amount: peak offset as a
    fraction of the strand length. Rakan: S and C curves, never straight [FRZtVXpAokc
    00:06:07]; the parametrization is [added]."""
    np = _np()
    P = np.asarray(path, dtype=float)
    if len(P) < 3 or kind in (None, "none", "straight"):
        return P.copy()
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    L = float(cum[-1])
    s = cum / L
    f = {"C": np.sin(np.pi * s), "S": np.sin(2.0 * np.pi * s), "sweep": s ** 2}[kind]
    out = []
    for i, p in enumerate(P):
        t = _unit(P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)])
        _, n = surface.closest(p)
        b = _unit(np.cross(n, t))
        q = p + side * amount * L * float(f[i]) * b
        out.append(surface.project(q, lift)[0] if i else p)
    return np.asarray(out)


def plan_strands(surface, roots, directions, lengths, kinds=None, amounts=None, sides=None,
                 lift=0.0, gravity=0.15, step=None):
    """One path per root: march, then bend. Returns [{root, path, kind, target_length}]."""
    n = len(roots)
    kinds = kinds or ["C"] * n
    amounts = amounts or [0.08] * n
    sides = sides or [1.0] * n
    lengths = lengths if hasattr(lengths, "__len__") else [lengths] * n
    lifts = lift if hasattr(lift, "__len__") else [lift] * n
    out = []
    for i in range(n):
        p = march_strand(surface, roots[i], directions[i], lengths[i], step, lifts[i], gravity)
        p = bend_path(surface, p, kinds[i], amounts[i], lifts[i], sides[i])
        out.append({"root": [float(c) for c in p[0]], "path": p.tolist(), "kind": kinds[i],
                    "target_length": float(lengths[i])})
    return out


def vary(n, base, spread=0.3, seed=0):
    """n values around `base` (+- spread), deterministic: breaks equal lengths and bends
    (Dan Eder: placement first, variation later [VJ2nMJRtIwQ 00:13:29]). Own Random
    instance: never touch the shared interpreter's random.seed."""
    rng = random.Random(seed)
    return [base * (1.0 + spread * (2.0 * rng.random() - 1.0)) for _ in range(n)]


def crevice_path(path_a, path_b, surface=None, lift=0.0, samples=32):
    """Midline between two neighbouring clump paths: where Pablo recuts the crevice with
    Standard Refiner (Dam_Standard as the shipped substitute) [WFqyj6lKgik 00:28:21]."""
    np = _np()
    A, _ = _resample(np.asarray(path_a, dtype=float), 1.0, False)
    B, _ = _resample(np.asarray(path_b, dtype=float), 1.0, False)
    la = float(np.linalg.norm(np.diff(A, axis=0), axis=1).sum())
    lb = float(np.linalg.norm(np.diff(B, axis=0), axis=1).sum())
    A, _ = _resample(A, la / samples, False)
    B, _ = _resample(B, lb / samples, False)
    m = min(len(A), len(B))
    M = (A[:m] + B[:m]) / 2.0
    if surface is not None:
        M = np.asarray([surface.project(p, lift)[0] for p in M])
    return M


def strand_report(paths, cameras=None, parallel_tol_deg=8.0, spacing_cv=0.15,
                  length_band=(0.85, 1.18), surface=None):
    """Numbers for a set of strand or clump paths: lengths, kinds (C, S, straight, noisy),
    parallel neighbours (Rakan: no parallel lines [FRZtVXpAokc 00:06:07]; thresholds
    [added]), lift above the surface. cameras: {view: zb_stroke.Camera} to classify each
    path as that view sees it."""
    np = _np()
    Ps = [np.asarray(p["path"] if isinstance(p, dict) else p, dtype=float) for p in paths]
    rows = []
    for i, P in enumerate(Ps):
        r = {"index": i, "length": round(float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()), 5),
             "kind": classify_polyline(P)["kind"]}
        if cameras:
            r["views"] = {v: classify_polyline([c.project(q)[:2] for q in P])["kind"]
                          for v, c in cameras.items()}
        if surface is not None:
            r["mean_lift"] = round(float(np.mean([surface.distance(q) for q in P])), 5)
        rows.append(r)
    pairs = []
    R = [P[0] for P in Ps]
    for i, P in enumerate(Ps):
        if len(Ps) < 2:
            break
        d = [float(np.linalg.norm(R[i] - R[j])) if j != i else 1e30 for j in range(len(Ps))]
        j = int(np.argmin(d))
        if any(pp["a"] == min(i, j) and pp["b"] == max(i, j) for pp in pairs):
            continue
        A, _ = _resample(P, rows[i]["length"] / 16.0, False)
        B, _ = _resample(Ps[j], rows[j]["length"] / 16.0, False)
        m = min(len(A), len(B))
        ta, tb = np.diff(A[:m], axis=0), np.diff(B[:m], axis=0)
        cos = np.einsum("ij,ij->i", ta, tb) / (np.linalg.norm(ta, axis=1) *
                                               np.linalg.norm(tb, axis=1) + 1e-12)
        ang = float(np.degrees(np.arccos(np.clip(cos, -1, 1))).mean())
        gap = np.linalg.norm(A[:m] - B[:m], axis=1)
        cv = float(gap.std() / (gap.mean() + 1e-12))
        lr = rows[i]["length"] / max(rows[j]["length"], 1e-12)
        if ang < parallel_tol_deg and cv < spacing_cv and length_band[0] <= lr <= length_band[1]:
            pairs.append({"a": min(i, j), "b": max(i, j), "mean_angle_deg": round(ang, 2),
                          "spacing_cv": round(cv, 3), "length_ratio": round(lr, 3)})
    lens = [r["length"] for r in rows]
    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    return {"count": len(rows), "rows": rows, "kinds": kinds, "parallel_pairs": pairs,
            "length_min": min(lens) if lens else None, "length_max": max(lens) if lens else None,
            "length_ratio_max_min": round(max(lens) / max(min(lens), 1e-12), 3) if lens else None}


def project_paths(paths, transform, pivot, verts=None, cell_px=2.0):
    """Canvas pixels of 3D paths for one view (the 9 floats of get_transform, e.g. a shot's
    transform_read from zb_review.capture_views, and pivot = centre of its bbox). With verts
    (the mass OBJ vertices) each path also gets the fraction of its points that are the
    front-most surface (zb_stroke.visible_mask)."""
    cam = zb_stroke.Camera(transform, pivot)
    out = []
    for p in paths:
        P = p["path"] if isinstance(p, dict) else p
        P = [tuple(float(c) for c in q) for q in P]
        proj = cam.project_many(P)
        r = {"px": [[round(float(x), 2), round(float(y), 2)] for x, y, _ in proj],
             "mean_depth": float(sum(d for _, _, d in proj)) / max(1, len(proj))}
        if verts is not None:
            vis = zb_stroke.visible_mask(cam, [tuple(v) for v in verts], P, cell_px)
            r["visible"] = round(sum(vis) / float(len(vis)), 3)
        out.append(r)
    return out


def best_view(path, surface, bbox, doc_wh, views=("front", "right", "left", "back",
                                                  "threequarter", "top"), margin=0.75):
    """The canonical view that faces a clump path best, with its transform and pixels:
    Pablo's "find a nice angle and do a single motion" [WFqyj6lKgik 00:26:40]. Transforms
    come from zb_stroke.frame_transform, the same framing as zb_review "math". Non-front
    views follow zb_stroke's convention (front proven; others [verify live_04])."""
    np = _np()
    P = np.asarray(path["path"] if isinstance(path, dict) else path, dtype=float)
    normals = [surface.closest(q)[1] for q in P]
    pivot = _center(bbox)
    best = None
    for v in views:
        t = zb_stroke.frame_transform(bbox, doc_wh[0], doc_wh[1], zb_stroke.VIEWS[v], margin)
        cam = zb_stroke.Camera(t, pivot)
        face = float(np.mean([cam.facing(tuple(n)) for n in normals]))
        px = [cam.project(tuple(q))[:2] for q in P]
        inside = sum(1 for x, y in px if 0 <= x < doc_wh[0] and 0 <= y < doc_wh[1]) / float(len(px))
        score = face * inside
        if best is None or score > best["score"]:
            best = {"view": v, "score": round(score, 4), "facing": round(face, 4),
                    "transform": [float(c) for c in t],
                    "px": [[round(float(x), 2), round(float(y), 2)] for x, y in px]}
    return best


def overlay_paths(png_path, px_paths, out_path, width=3, labels=None):
    """Draw planned paths on a canvas render: the agent's chunk map (Pablo polypaints chunks,
    Dan paints sections on the concept, before sculpting [WFqyj6lKgik 00:17:46;
    VJ2nMJRtIwQ 00:01:26]). Look at it before laying anything."""
    from PIL import Image, ImageDraw
    pal = [(230, 70, 70), (70, 170, 240), (90, 210, 90), (240, 180, 40), (200, 90, 220),
           (40, 210, 200), (250, 120, 30), (160, 160, 250)]
    with Image.open(png_path) as src:
        im = src.convert("RGB")
    d = ImageDraw.Draw(im)
    for i, pts in enumerate(px_paths):
        pts = pts["px"] if isinstance(pts, dict) else pts
        c = pal[i % len(pal)]
        d.line([tuple(p) for p in pts], fill=c, width=width)
        x, y = pts[0]
        d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=c, width=2)
        if labels:
            d.text((x + 6, y - 6), str(labels[i]), fill=c)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    im.save(out_path)
    return out_path


def shells(mesh):
    """Vertex index arrays per connected shell, largest first (zb_audit's labelling)."""
    np = _np()
    za = _expert("zb_audit")
    m = za.load_obj(mesh) if isinstance(mesh, str) else mesh
    a, b = za._edges(m)
    lab = za._shells(len(m.verts), a, b)
    used = np.zeros(len(m.verts), dtype=bool)
    used[m.flat] = True
    groups = {}
    for i in np.nonzero(used)[0]:
        groups.setdefault(int(lab[i]), []).append(int(i))
    return sorted((np.asarray(g) for g in groups.values()), key=len, reverse=True)


def strand_mesh_report(mesh, dummy_max_faces=12, min_faces=8):
    """Strand hair exported as OBJ: one shell per strand (Dan Eder: one polygroup or SubTool
    per strand [VJ2nMJRtIwQ 00:12:57]). Shells of dummy_max_faces or fewer faces are the
    dummy QCube (Pablo hides a tiny cube inside the hair so curve strands land in their own
    SubTool [WFqyj6lKgik 00:36:19]). Faces per strand feed the game budget."""
    np = _np()
    za = _expert("zb_audit")
    m = za.load_obj(mesh) if isinstance(mesh, str) else mesh
    a, b = za._edges(m)
    lab = za._shells(len(m.verts), a, b)
    used = np.zeros(len(m.verts), dtype=bool)
    used[m.flat] = True
    face_lab = lab[m.flat[m.starts]]
    ids, fcount = np.unique(face_lab, return_counts=True)
    rows = []
    for sid, fc in zip(ids.tolist(), fcount.tolist()):
        V = m.verts[np.nonzero((lab == sid) & used)[0]]
        rows.append({"faces": int(fc), "points": int(len(V)), "bbox_min": V.min(axis=0).tolist(),
                     "bbox_max": V.max(axis=0).tolist(),
                     "dummy": fc <= dummy_max_faces})
    strands = [r for r in rows if not r["dummy"]]
    fc = sorted(r["faces"] for r in strands)
    tris = int(np.maximum(m.sizes - 2, 0).sum())
    return {"shells": len(rows), "strands": len(strands),
            "dummies": sum(1 for r in rows if r["dummy"]),
            "faces_per_strand": {"min": fc[0], "median": fc[len(fc) // 2], "max": fc[-1]} if fc else None,
            "thin_strands": sum(1 for f in fc if f < min_faces), "faces": int(len(m.sizes)),
            "tris_equiv": tris, "rows": rows}


def tube_radius_profile(verts, path, bins=8):
    """Median distance of tube vertices to their path, per stretch of the path: tells which
    end is thick (Dan: root and tip come out inverted, fix the width falloff [VJ2nMJRtIwQ
    00:03:23]; point order is the scripted lever) and how wide Draw Size made the tube."""
    np = _np()
    V = np.asarray(verts, dtype=float)
    P = np.asarray(path, dtype=float)
    A, B = P[:-1], P[1:]
    AB = B - A
    L2 = (AB ** 2).sum(axis=1) + 1e-18
    seg_len = np.sqrt(L2)
    cum = np.concatenate([[0.0], np.cumsum(seg_len)])
    best_d = np.full(len(V), np.inf)
    best_t = np.zeros(len(V))
    for i in range(len(A)):
        u = np.clip(((V - A[i]) @ AB[i]) / L2[i], 0.0, 1.0)
        q = A[i] + u[:, None] * AB[i]
        d = np.linalg.norm(V - q, axis=1)
        better = d < best_d
        best_d[better] = d[better]
        best_t[better] = (cum[i] + u[better] * seg_len[i]) / cum[-1]
    edges = np.linspace(0.0, 1.0, bins + 1)
    rad = []
    for i in range(bins):
        sel = (best_t >= edges[i]) & (best_t <= edges[i + 1])
        rad.append(float(np.median(best_d[sel])) if sel.any() else None)
    r0 = next((r for r in rad if r), None)
    r1 = next((r for r in reversed(rad) if r), None)
    return {"t": [round((edges[i] + edges[i + 1]) / 2.0, 3) for i in range(bins)],
            "radius": rad, "start_over_end": round(r0 / r1, 3) if r0 and r1 else None,
            "median_radius": float(np.median(best_d))}


# ============================================================================================
# Toys and collectibles (design-side numbers; engineering belongs to scenario-zbrush-pose-print)
# ============================================================================================

HASBRO = {"min_wall_mm": 1.0, "violation_example_mm": 0.85, "min_edge_mm": 0.5,
          "floats_away_mm": 0.2, "fit_offset_mm": 0.12, "shrink_pct_6in": 4.0,
          "elbow_rom_target_deg": 115, "elbow_rom_min_deg": 90,
          "source": "Paul Bennett, Hasbro Star Wars Black Series, ZBrush Summit 2019 "
                    "[P08kuTIRziE 00:10:57-01:06:02]"}


def toy_scale(real_height_mm, line="6in"):
    """Hasbro: a 6 in figure is the actor's height / 12, then +4 percent (the 104 percent
    file) for PVC shrink; a 3.75 in figure is height / 18 [P08kuTIRziE 00:12:54, 00:17:51,
    00:57:52]. No shrink figure is given for the 3.75 in line. Say which scale a file is at:
    partners work at 100 percent."""
    if line in ("6in", "6", 6):
        design = real_height_mm / 12.0
        return {"line": "6in", "design_mm": round(design, 3),
                "file_mm": round(design * (1 + HASBRO["shrink_pct_6in"] / 100.0), 3),
                "file_scale_pct": 100 + HASBRO["shrink_pct_6in"]}
    if line in ("3.75in", "3.75", 3.75):
        return {"line": "3.75in", "design_mm": round(real_height_mm / 18.0, 3),
                "file_mm": None, "file_scale_pct": None,
                "note": "no shrink compensation stated for this line"}
    raise ValueError("line must be 6in or 3.75in (the two Hasbro rules)")


def mm_per_unit(model_height_units, print_height_mm):
    if model_height_units <= 0:
        raise ValueError("model height must be positive")
    return print_height_mm / float(model_height_units)


def feature_check(features, mmpu, min_wall_mm=HASBRO["min_wall_mm"],
                  min_edge_mm=HASBRO["min_edge_mm"]):
    """features: {name: (width_in_units, "wall" | "edge")}. Hasbro: never below 1 mm of
    wall (0.85 mm was flagged), trimmed edges at least 0.5 mm [P08kuTIRziE 00:10:57,
    00:16:46, 00:48:28]. Flyaway hair strands fail this first: fuse them to the head."""
    rows = []
    for name, (w, kind) in features.items():
        mm = w * mmpu
        lim = min_wall_mm if kind == "wall" else min_edge_mm
        rows.append({"name": name, "mm": round(mm, 3), "min_mm": lim, "ok": mm >= lim})
    return {"ok": all(r["ok"] for r in rows), "rows": rows}


# ============================================================================================
# DynaMesh resolution from the finest feature (the Resolution Picker is a drag)
# ============================================================================================

# Mean edge length = factor * longest bbox side / resolution. One sample: the v03 sphere,
# DynaMesh 128, longest side 2.0401, mean edge 0.017266 (tests/code/zbrush-expert/fixtures/
# v03_sphere.obj through zb_audit) -> 1.083. Recalibrate with live_03 at 256.
DYNAMESH_EDGE_FACTOR = 1.083


def dynamesh_edge(longest_side, resolution, factor=DYNAMESH_EDGE_FACTOR):
    return factor * longest_side / float(resolution)


def dynamesh_resolution(longest_side, finest_feature, edges_across=4, factor=DYNAMESH_EDGE_FACTOR,
                        lo=8, hi=4096):
    """Resolution that puts `edges_across` [added] edges across the finest crevice or strand
    width, in the same units as longest_side. Pablo picks with the Resolution Picker and
    goes "a little bit higher" [WFqyj6lKgik 00:33:52]; DynaMesh resolution is relative to
    the object's size (Pablo, Logic Part 5)."""
    r = int(math.ceil(factor * longest_side * edges_across / float(finest_feature)))
    return max(lo, min(hi, r))


# ============================================================================================
# Bridge: run a ZBrush-side function of this module (agent side)
# ============================================================================================

_CALL_PRELUDE = """
_zs_dirs = __DIRS__
_zs_added = [d for d in _zs_dirs if d not in _zb_sys.path]
_zs_before = set(_zb_sys.modules)
for _zs_d in reversed(_zs_added):
    _zb_sys.path.insert(0, _zs_d)
try:
    zb_stylized = _zb_il.import_module("zb_stylized")
finally:
    for _zs_d in _zs_added:
        if _zs_d in _zb_sys.path:
            _zb_sys.path.remove(_zs_d)
    for _zs_k in set(_zb_sys.modules) - _zs_before:
        if _zs_k.startswith("zb_"):
            _zb_sys.modules.pop(_zs_k, None)
"""


def build_call(func, *args, **kwargs):
    """Source that zb_launch.run sends: import this module and the expert toolkit by path
    without leaving them on sys.path or in sys.modules, then call func."""
    if not func.isidentifier():
        raise ValueError(f"bad function name {func!r}")
    a = json.dumps(_jsonable(list(args)))
    k = json.dumps(_jsonable(kwargs))
    return (_CALL_PRELUDE.replace("__DIRS__", repr([HERE, EXPERT_SCRIPTS])) +
            f"result = zb_stylized.{func}(*_zb_json.loads({a!r}), **_zb_json.loads({k!r}))\n")


def call(func, *args, port=7788, timeout=240, **kwargs):
    """zb_stylized.func(*args, **kwargs) inside ZBrush through the proven bridge."""
    zl = _expert("zb_launch")
    return zl.run(build_call(func, *args, **kwargs), (), port, timeout)


# ============================================================================================
# Inside ZBrush
# ============================================================================================

# Candidate item paths. Tags: [xml] command id listed in the installed
# ZData/ZLang/zcommands/commands.xml (2026.2.1; the ids have no section levels, and
# perspective is Draw:Perspective, not Transform:Persp: Z1 grade 2026-09-24), tried first;
# [strings] label present in ZData/ZLang/english (location not proven); [doc] Maxon help
# pages; [note] expert note. Whether exists() accepts each form stays [verify] until live_01.
PATHS = {
    "curve_step": ["Stroke:CurveStep", "Stroke:Curve:CurveStep", "Stroke:Curve:Curve Step"],  # [xml]
    "curve_mode": ["Stroke:Curve Mode", "Stroke:Curve:Curve Mode", "Stroke:Curve:CurveMode"],  # [xml]
    "lock_start": ["Stroke:Lock Start", "Stroke:Curve:Lock Start"],            # [xml]
    "curve_snap": ["Stroke:Snap", "Stroke:Curve:Snap"],                        # [xml] Pavlovich
    "curve_delete": ["Stroke:Delete", "Stroke:Curve Functions:Delete"],        # [xml] Plouffe
    "frame_mesh": ["Stroke:Frame Mesh", "Stroke:Curve Functions:Frame Mesh"],  # [xml]
    "frame_polygroups": ["Stroke:Polygroups", "Stroke:Curve Functions:Polygroups"],  # [xml]
    "frame_creased": ["Stroke:Creased edges", "Stroke:Curve Functions:Creased"],  # [xml] Dan
    "frame_border": ["Stroke:Border", "Stroke:Curve Functions:Border"],        # [xml]
    "cm_size": ["Stroke:Size", "Stroke:Curve Modifiers:Size"],                 # [xml] Dan
    "brush_modifier": ["Brush:Modifiers:Brush Modifier"],                      # [doc] IMM curves
    "curve_res": ["Brush:Modifiers:Curve Res", "Brush:Modifiers:Curve Resolution"],  # [strings]
    "imbed": ["Brush:Depth:Imbed"],                                            # [strings] Dan
    "sculptris": ["Stroke:SculptrisPro", "Stroke:Sculptris Pro:Sculptris Pro", "Stroke:Sculptris Pro"],  # [xml]
    "claypolish": ["Tool:Geometry:ClayPolish", "Tool:Geometry:ClayPolish:ClayPolish"],  # [xml]
    "cp_max": ["Tool:Geometry:Max", "Tool:Geometry:ClayPolish:Max"],           # [xml]
    "cp_sharp": ["Tool:Geometry:Sharp", "Tool:Geometry:ClayPolish:Sharp"],     # [xml]
    "cp_soft": ["Tool:Geometry:Soft", "Tool:Geometry:ClayPolish:Soft"],        # [xml]
    "cp_rsharp": ["Tool:Geometry:RSharp", "Tool:Geometry:ClayPolish:RSharp"],  # [xml]
    "cp_rsoft": ["Tool:Geometry:RSoft", "Tool:Geometry:ClayPolish:RSoft"],     # [xml]
    "del_hidden": ["Tool:Geometry:Del Hidden", "Tool:Geometry:Modify Topology:Del Hidden"],  # [xml]
    "persp": ["Draw:Perspective", "Draw:Persp", "Transform:Persp"],            # [xml] Shane
    "angle_of_view": ["Draw:Angle Of View", "Draw:Angle of View"],             # [xml] Shane
    "matcap_metal": ["Material:MatCap Metal01"],                               # file exists
    "skinshade": ["Material:SkinShade4"],                                      # file exists
    # planes kept through subdivision (Guillaume, UthCuDB1IEQ 00:46:42 to 00:47:50)
    "groups_by_normals": ["Tool:Polygroups:Groups By Normals", "Tool:Polygroups:GroupsByNormals"],  # [xml]
    "normals_max_angle": ["Tool:Polygroups:MaxAngle"],                         # [xml]
    "crease_pg": ["Tool:Geometry:Crease PG"],                                  # [xml] [doc]
    "uncrease_all": ["Tool:Geometry:UnCreaseAll"],                              # [xml] [doc]
    "crease_lvl": ["Tool:Geometry:CreaseLvl"],                                  # [xml] [doc]
}


def _z():
    return zb_ops._z()


def probe_paths():
    """exists() for every candidate in PATHS: the path oracle the live tests record."""
    z = _z()
    return {k: {c: bool(z.exists(c)) for c in cands} for k, cands in PATHS.items()}


def load_curve_convention(path=None):
    """How OBJ-space points become curve points, and how curves get applied. Written by
    tests/code/zbrush-stylized/live_01_curves.py --install. Default = hypothesis."""
    path = path or CURVE_CONVENTION_FILE
    d = {"axes": [1, 1, 1], "apply": "nudge", "batch": True,
         "source": "default: tool space = OBJ export space, Maxon's 'move a curve a tiny bit' "
                   "to apply [verify live_01]"}
    if path and os.path.exists(path):
        with open(path) as fh:
            d.update(json.load(fh))
    return d


def subtool_boxes(indices=None, mode=1):
    """[{index, id, bbox, center, size}] per SubTool (query_mesh3d(2, 1) = full bbox of the
    selected SubTool). Landmark boxes for head_landmarks; the active SubTool is restored."""
    z = _z()
    n = int(z.get_subtool_count())
    cur = int(z.get_active_subtool_index())
    out = []
    try:
        for i in (range(n) if indices is None else indices):
            z.select_subtool(int(i))
            b = [float(v) for v in z.query_mesh3d(2, mode)]
            out.append({"index": int(i), "id": int(z.get_subtool_id(-1, int(i))), "bbox": b,
                        "center": [(b[k] + b[k + 3]) / 2.0 for k in range(3)],
                        "size": [b[k + 3] - b[k] for k in range(3)]})
    finally:
        z.select_subtool(cur)
    return out


def _points(z):
    return int(z.query_mesh3d(0)[0])


def _tap_pixel(z, paths):
    """Pixel of the path point nearest the camera in the current view (zb_stroke camera)."""
    cam = zb_stroke.Camera.from_zbrush(z)
    best = None
    for path in paths:
        inner = path[1:-1] if len(path) > 2 else path
        for p in inner:
            x, y, d = cam.project(tuple(float(c) for c in p))
            if best is None or d > best[2]:
                best = (x, y, d)
    return [round(best[0], 1), round(best[1], 1)]


def _apply_curves(z, grp, apply, tap_px, mesh_name, mesh_thickness):
    ev = {}
    if apply in ("tap", "nudge"):
        px = tap_px or _tap_pixel(z, grp)
        pts = zb_stroke.dab(px) if apply == "tap" else [
            (px[0], px[1]), (px[0] + 1.0, px[1]), (px[0] + 2.0, px[1])]
        t0 = [float(v) for v in z.get_transform()]
        ok = z.canvas_stroke(z.Stroke(zb_stroke.encode(pts)))
        z.update(redraw_ui=True)
        t1 = [float(v) for v in z.get_transform()]
        drift = max(abs(a - b) for a, b in zip(t0, t1))
        if drift > 1e-3:  # the stroke missed the curve and turned the view: undo the turn
            z.set_transform(*t0)
            z.update(redraw_ui=True)
        ev.update(tap_px=px, stroke_ok=bool(ok), view_moved=drift > 1e-3)
    elif apply == "mesh":
        ev["mesh_points"] = int(z.create_mesh_from_curves(mesh_name or "Strands", 1,
                                                          float(mesh_thickness)))
    elif apply != "none":
        raise ValueError("apply must be nudge, tap, mesh or none")
    return ev


def lay_strands(paths, brush="CurveTube", size=None, sides=None, curve_res=None,
                curve_step=None, taper=None, apply=None, tap_px=None, batch=None,
                delete_curves=True, clear_mask=True, subtool=None, mesh_name=None,
                mesh_thickness=0.0, axes=None):
    """Tube strands along computed paths with the SDK curve API (new_curves, add_new_curve,
    add_curve_point, curves_to_ui: Maxon's lightning example with Brush:CurveTube).

    paths: lists of OBJ-space points (plan_strands). axes: sign flips from OBJ to tool space
      (curve_convention.json). size: Draw Size, the tube width. sides: Brush Modifier (20
      default, 4 square, 0 flat: IMM doc, Pavlovich goZavCi515k). curve_res: spans along.
      curve_step: set before the first strand (Dan Eder [VJ2nMJRtIwQ 00:03:23]).
      taper: Stroke > Curve Modifiers > Size on or off (Dan's width falloff).
    apply: Maxon's example says the brush shows only after a curve is moved "a tiny bit":
      "nudge" drags 2 px from a curve point, "tap" clicks it (IMM doc: click an active curve
      to re-apply), "mesh" calls create_mesh_from_curves into a new SubTool, "none" leaves
      the live curves. batch: all paths in one curves list (one apply) or one by one.
    After applying: Curve Functions > Delete (Plouffe's way to drop leftover curves) and
    Masking Clear (an insert masks the support mesh, IMM doc). NOT YET RUN IN ZBRUSH."""
    z = _z()
    conv = load_curve_convention()
    apply = apply or conv.get("apply", "nudge")
    batch = conv.get("batch", True) if batch is None else batch
    axes = list(axes or conv.get("axes", [1, 1, 1]))
    if subtool is not None:
        z.select_subtool(int(subtool))
    zb_ops.ensure_edit()
    out = {"apply": apply, "batch": batch, "axes": axes, "brush": zb_ops.select_brush(brush)}
    settings = {}
    if size is not None:
        settings.update(zb_ops.set_draw(size=size))
    for key, val, tol in (("brush_modifier", sides, 0.5), ("curve_res", curve_res, 0.5),
                          ("curve_step", curve_step, 0.01)):
        if val is not None:
            settings[key] = zb_ops.set_checked(PATHS[key], val, tol=tol)
    if taper is not None:
        settings["curve_size_modifier"] = zb_ops.set_checked(PATHS["cm_size"], 1 if taper else 0,
                                                             tol=0.5)
    out["settings"] = settings
    n_sub0, p0 = int(z.get_subtool_count()), _points(z)
    events = []
    for grp in ([list(paths)] if batch else [[p] for p in paths]):
        z.new_curves()
        npts = 0
        for path in grp:
            cid = int(z.add_new_curve())
            if cid < 0:  # 0 is a valid index (Maxon's fragment tests `not cid`: a bug)
                raise ZBStylizedError("add_new_curve failed")
            for p in path:
                q = [float(p[i]) * axes[i] for i in range(3)]
                if int(z.add_curve_point(cid, q[0], q[1], q[2])) < 0:
                    raise ZBStylizedError(f"add_curve_point failed on curve {cid}")
                npts += 1
        ev = {"curves": len(grp), "curve_points": npts, "curves_to_ui": int(z.curves_to_ui())}
        z.update(redraw_ui=True)
        ev["points_after_ui"] = _points(z)
        ev.update(_apply_curves(z, grp, apply, tap_px, mesh_name, mesh_thickness))
        ev["points_after_apply"] = _points(z)
        if delete_curves:
            dp = zb_ops.resolve(PATHS["curve_delete"], required=False)
            if dp:
                z.press(dp)
                ev["deleted_with"] = dp
        events.append(ev)
    if clear_mask:
        zb_ops.mask("clear")
    out.update(events=events, subtools_before=n_sub0, subtools_after=int(z.get_subtool_count()),
               points_before=p0, points_after=_points(z), stats=zb_ops.stats())
    out["created_geometry"] = out["points_after"] > p0 or out["subtools_after"] > n_sub0
    return out


def stroke_from_view(points_px, transform=None, brush="ClayBuildup", size=None,
                     z_intensity=None, focal=None, zsub=False, sculptris=None, spacing=4.0,
                     restore_view=False):
    """One long synthesized stroke seen from one fixed view: Pablo's clump stroke ("find a
    nice angle and do a single motion" [WFqyj6lKgik 00:26:40]). transform: the 9 floats
    best_view() returned. sculptris: Stroke > Sculptris Pro on or off (Pablo blocks and
    refines with it on). Returns volume and point counts before and after as evidence."""
    z = _z()
    zb_ops.ensure_edit()
    t0 = [float(v) for v in z.get_transform()]
    drift = None
    if transform is not None:
        z.set_transform(*[float(v) for v in transform])
        z.update(redraw_ui=True)
        drift = max(abs(a - float(b)) for a, b in zip(z.get_transform(), transform))
    if sculptris is not None:
        zb_ops.set_checked(PATHS["sculptris"], 1 if sculptris else 0, tol=0.5)
    if focal is not None:
        zb_ops.set_draw(focal=focal)
    w, h = z.get("Document:Width"), z.get("Document:Height")
    pts = zb_stroke.resample(zb_stroke.clip_to_canvas(points_px, w, h, 2.0), spacing)
    if len(pts) < 2:
        raise ZBStylizedError("stroke has fewer than 2 points on the canvas")
    p0 = _points(z)
    res = zb_ops.sculpt_stroke(pts, brush=brush, size=size, z_intensity=z_intensity, zsub=zsub)
    res.update(points_before=p0, points_after=_points(z), transform_drift=drift,
               canvas_points=len(pts))
    if restore_view:
        z.set_transform(*t0)
        z.update(redraw_ui=True)
    return res


def _bbox(z, mode=1):
    return [float(v) for v in z.query_mesh3d(2, mode)]


def scalp_shell(source=None, gap_frac=0.01, inflate_step=1.0, max_iter=8, resolution=128):
    """Pablo's scalp shell, agent version: duplicate the head (or the cranium primitive),
    grow it with Deformation Inflate in small steps (he types 1, then 3 [WFqyj6lKgik
    00:09:43]) until its bbox clears the source by gap_frac of the longest side [added],
    DynaMesh 128 [00:08:40], one polygroup (Group Visible). His lasso isolation and
    Dynamic Subdiv Thickness with Offset -100 need a selection the SDK cannot make: the face
    side is cut afterwards (a Move stroke from the side view, Pablo [00:10:15]).
    NOT YET RUN IN ZBRUSH."""
    z = _z()
    if source is not None:
        z.select_subtool(int(source))
    zb_ops.ensure_edit()
    b0 = _bbox(z)
    n0 = int(z.get_subtool_count())
    a0 = int(z.get_active_subtool_index())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    out = {"source_bbox": b0, "subtools_before": n0, "subtools_after": int(z.get_subtool_count()),
           "active_after_duplicate": int(z.get_active_subtool_index())}
    if out["subtools_after"] != n0 + 1:
        raise ZBStylizedError(f"Duplicate did not add a SubTool ({n0} -> {out['subtools_after']})")
    if out["active_after_duplicate"] == a0:
        # which one is selected after Duplicate is [verify]: never inflate the source
        z.select_subtool(a0 + 1)
        out["selected_copy"] = a0 + 1
    st = zb_ops.stats()
    if st.get("sdiv_max", 1) > 1:
        zb_ops.set_checked("sdiv", 1, tol=0.5)
        out["del_levels"] = zb_ops.del_levels()
    L = max(b0[3] - b0[0], b0[4] - b0[1], b0[5] - b0[2])
    gap, it = 0.0, 0
    while it < max_iter:
        zb_ops.deform("Inflate", inflate_step)
        it += 1
        b = _bbox(z)
        gap = min(min(b[k + 3] - b0[k + 3], b0[k] - b[k]) for k in range(3))
        if gap >= gap_frac * L:
            break
    out.update(inflate_steps=it, gap=gap, gap_frac=gap / L if L else None,
               cleared=gap >= gap_frac * L)
    out["dynamesh"] = zb_ops.dynamesh(resolution)
    out["group"] = zb_ops.polygroups("visible")
    out["stats"] = zb_ops.stats()
    return out


def finish_hair(resolution, polish=2, claypolish=True, cp=None, clear_mask=True):
    """Pablo's finishing stack for sculpted stylized hair [WFqyj6lKgik 00:33:52-00:35:33]:
    DynaMesh a little above the picker's value (compute it with dynamesh_resolution),
    Deformation Polish 2, Geometry ClayPolish (his panel: Max 25, Min 0, Sharp 0, Soft 0,
    RSharp and RSoft about 5; pass cp={"max": 25, ...} to set them), then clear the mask
    ClayPolish leaves (mask data cannot be read, so clear unconditionally).
    "80% there". NOT YET RUN IN ZBRUSH."""
    z = _z()
    zb_ops.ensure_edit()
    out = {"dynamesh": zb_ops.dynamesh(resolution)}
    if polish:
        out["polish"] = zb_ops.polish(polish)
    if claypolish:
        if cp:
            out["claypolish_settings"] = {k: zb_ops.set_checked(PATHS["cp_" + k], v, tol=0.51)
                                          for k, v in cp.items()}
        v0 = float(z.get_polymesh3d_volume())
        out["claypolish_path"] = zb_ops.press(PATHS["claypolish"])
        z.update(redraw_ui=True)
        out["claypolish_volume"] = [v0, float(z.get_polymesh3d_volume())]
    if clear_mask:
        out["mask_clear"] = zb_ops.mask("clear")
    out["stats"] = zb_ops.stats()
    return out


def rebalance(budget_points=2400000, resolution=None):
    """Re-DynaMesh when Sculptris Pro strokes have grown the mesh past the budget (Pablo:
    about 2.4M to 2.6M points on his machine [WFqyj6lKgik 00:28:56]; an agent can use a
    lower budget for speed). resolution None keeps the current slider value."""
    st = zb_ops.stats()
    if st.get("points", 0) <= budget_points:
        return {"remeshed": False, "points": st.get("points")}
    res = resolution or zb_ops.get("dyn_res")
    return {"remeshed": True, "points_before": st.get("points"),
            "dynamesh": zb_ops.dynamesh(res)}


def crease_planes(max_angle=None, crease_lvl=None, regroup=True, uncrease_first=True):
    """Guillaume Tiberghien keeps stylized plane changes through subdivision: parts DynaMeshed
    together, ZRemesher for a sculptable topology, and "I creased my edges to make sure that
    when I'll subdivide those things will remain straight" (UthCuDB1IEQ 00:46:42 to 00:47:50).
    Agent version on the active SubTool (run it after ZRemesher, before Divide, on the lowest
    level): Groups By Normals (MaxAngle = max_angle when given) gives one polygroup per plane
    [added route], UnCreaseAll, Crease PG creases every polygroup border (doc), CreaseLvl =
    how many subdivision levels the creases stay hard (doc; None keeps the slider). Crease
    tags live on edges, so any later DynaMesh or ZRemesher needs this again [added].
    NOT YET RUN IN ZBRUSH (live_04)."""
    z = _z()
    zb_ops.ensure_edit()
    out = {"pressed": [], "set": {}}
    st = zb_ops.stats()
    if st.get("sdiv_max", 1) > 1:
        out["set"]["sdiv"] = zb_ops.set_checked("sdiv", 1, tol=0.5)   # crease the base cage
    if regroup:
        if max_angle is not None:
            out["set"]["max_angle"] = zb_ops.set_checked(PATHS["normals_max_angle"], max_angle,
                                                         tol=0.51)
        out["pressed"].append(zb_ops.press(PATHS["groups_by_normals"]))
        z.update(redraw_ui=True)
    if uncrease_first:
        out["pressed"].append(zb_ops.press(PATHS["uncrease_all"]))
    out["pressed"].append(zb_ops.press(PATHS["crease_pg"]))
    z.update(redraw_ui=True)
    if crease_lvl is not None:
        out["set"]["crease_lvl"] = zb_ops.set_checked(PATHS["crease_lvl"], crease_lvl, tol=0.51)
    out["stats"] = zb_ops.stats()
    return out
