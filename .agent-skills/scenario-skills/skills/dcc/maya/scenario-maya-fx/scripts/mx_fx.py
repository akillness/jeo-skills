"""
mx_fx: FX TD helpers for Maya 2027 (Nucleus / nCloth, Bifrost, MASH, caches and handoff).
Part of the scenario-maya-fx skill; builds on the scenario-maya-expert toolkit (mx_audit, mx_review, mx_run).

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed). The pure-Python
layer (units, pre-roll plan, MPM firmness, mesh graph math, stretch / motion / convergence
metrics, verdicts, start-frame and restart rules, emitter modes and voxel estimate, nCache
limits, constraint members, solve timing, MASH cache rules, overlap test, sprite framing,
file-sequence report) ran offline with python3: tests/code/maya-fx/test_fx_offline.py. Every function that touches
maya.cmds, OpenMaya, MEL procedures, the VNN commands, MASH.api or pxr is unverified and the
names it relies on are marked [verify]; tests/code/maya-fx/job_00_fx_probe.py records the
real names on the installed Maya.

  import sys; sys.path.insert(0, "<skills>/scenario-maya-fx/scripts"); import mx_fx
  mx_fx.solver_scale("cm")                          # 0.01: Nucleus spaceScale, Bifrost scene_units_in_meters
  mx_fx.preroll_plan(1)                             # nucleus start 49 frames before the action
  rig = mx_fx.build_cloth_rig("cape_GEO", "body_GEO", action_start=1, preset="heavy_denim")
  rep = mx_fx.sim_report(rig["cloth_out"], rig["collider_mesh"], rig["start"], 60, action_start=1)
  mx_fx.sim_verdict(rep, budget_spf=brief_spf)      # [] when clean, else "error: ..." lines
  mx_fx.ncache_verdict(4000, -49, 60, fmt="mcx")     # mcc caps at 2 GB; positions only
  mx_fx.alembic_export([rig["cloth_out"]], "/abs/cache/cape_v001.abc", rig["start"], 60)
  mx_fx.sim_range_verdict(1, 1, 1, shot_end=120, source_starts=[40], cache_range=(1, 125))
  mx_fx.aero_source_verdict("Solid", "Absolute", emitter_open=True, extent=60, detail_size=0.05)

Sources behind every rule are in references/expert-notes.md; [added] marks this module's own
defaults. Distances are centimeters (OpenMaya internal unit) unless stated.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import glob
import json
import math
import os
import re
import shutil
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))

# --------------------------------------------------------------------------- units and physics
UNIT_TO_M = {"mm": 0.001, "cm": 0.01, "m": 1.0, "km": 1000.0,
             "in": 0.0254, "ft": 0.3048, "yd": 0.9144, "mi": 1609.344}
_UNIT_ALIASES = {"millimeter": "mm", "centimeter": "cm", "meter": "m", "kilometer": "km",
                 "inch": "in", "foot": "ft", "yard": "yd", "mile": "mi"}


def meters_per_unit(linear_unit):
    """Meters in one Maya linear unit ("cm" -> 0.01)."""
    u = str(linear_unit).strip().lower()
    u = _UNIT_ALIASES.get(u, u)
    if u not in UNIT_TO_M:
        raise ValueError("unknown linear unit %r" % linear_unit)
    return UNIT_TO_M[u]


def solver_scale(linear_unit):
    """Value for Nucleus Space Scale and Bifrost scene_units_in_meters so the solvers see real
    size. Both compute in meters whatever Maya's unit: 0.01 for a cm scene (Maya 2027 Help,
    Nucleus Space Scale; Bifrost sim guide; Stamatelos U_CqI5R3Ibw [00:30:21]). Other units
    are the same conversion [added]."""
    return meters_per_unit(linear_unit)


def scale_verdict(size_units, linear_unit, scale_value, expected_size_m=None, art_choice=False,
                  tol=0.1):
    """Compare what the solver sees (size_units * scale_value meters) with the real size
    (size_units * meters per unit). SARKAMARI: a 182 cm character is 182 m to Nucleus until
    Space Scale is set (RhAxSgPpZww [00:29:22]). expected_size_m: the physical size the object
    should have (Julan: rig at real-world size, 5LH76F48Jpk [00:02:02]). art_choice=True
    records a deliberate non-physical scale (SARKAMARI's 0.25) instead of failing it."""
    real_m = size_units * meters_per_unit(linear_unit)
    solver_m = size_units * scale_value
    out = {"real_m": real_m, "solver_m": solver_m, "ratio": solver_m / real_m if real_m else None,
           "problems": []}
    if real_m and abs(solver_m / real_m - 1.0) > tol:
        msg = "solver sees %.3g m for a %.3g m object (scale %.4g, unit %s, expected %.4g)" % (
            solver_m, real_m, scale_value, linear_unit, solver_scale(linear_unit))
        out["problems"].append(("info: art choice recorded: " if art_choice else "error: ") + msg)
    if expected_size_m and real_m and abs(real_m / expected_size_m - 1.0) > tol:
        out["problems"].append("error: model is %.3g m, expected about %.3g m: fix the asset scale, "
                               "not the solver" % (real_m, expected_size_m))
    return out


def preroll_plan(action_start, hold=25, blend=25):
    """SARKAMARI's two-phase pre-roll: the character holds still for `hold` frames, blends into
    the first pose over `blend` frames, the action starts at action_start, and the Nucleus
    start frame is the first held frame (RhAxSgPpZww [00:05:26], [00:18:59]). Cloth needs 25
    to 50 frames to settle. Julan uses one 24-frame transition from an A-pose (5LH76F48Jpk
    [00:03:05])."""
    if hold < 0 or blend < 0:
        raise ValueError("hold and blend must be >= 0")
    start = action_start - hold - blend
    plan = {"nucleus_start": start, "hold": (start, start + hold),
            "blend": (start + hold, action_start), "action_start": action_start,
            "preroll_frames": hold + blend, "warnings": []}
    if hold + blend < 25:
        plan["warnings"].append("pre-roll of %d frames: SARKAMARI needs 25 to 50 to settle" % (hold + blend))
    return plan


def mpm_initial_firmness(impact_speed=None, drop_height=None, g=9.81):
    """Gast (GGnyd4zD5pY [00:56:53], [00:57:24]): initial_firmness about the square of the
    impact speed (10 m/s -> 100); for a drop, height times gravity estimates v squared. A
    guideline, then tune cohesion. Kinematics gives v^2 = 2 g h [added]. Units: solver
    meters and m/s (after scene_units_in_meters)."""
    if impact_speed is not None:
        v2 = float(impact_speed) ** 2
        return {"initial_firmness": v2, "v_squared": v2, "basis": "Gast: firmness ~ v^2"}
    if drop_height is not None:
        return {"initial_firmness": g * drop_height, "v_squared": 2 * g * drop_height,
                "basis": "Gast: height x gravity; kinematic v^2 = 2gh is twice that [added]"}
    raise ValueError("give impact_speed or drop_height")


# --------------------------------------------------------------------------- mesh graph math
def edges_from_faces(counts, connects):
    """Unique undirected edges (a, b), a < b, from face vertex counts and the flat vertex list
    (MFnMesh.getVertices layout)."""
    edges = set()
    i = 0
    for c in counts:
        f = connects[i:i + c]
        i += c
        for k in range(c):
            a, b = f[k], f[(k + 1) % c]
            if a != b:
                edges.add((a, b) if a < b else (b, a))
    return sorted(edges)


def neighbors(n_points, edges):
    nb = [set() for _ in range(n_points)]
    for a, b in edges:
        nb[a].add(b)
        nb[b].add(a)
    return nb


def _dist(p, q):
    return math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)


def graph_distance(points, edges, sources):
    """Shortest distance along mesh edges from any source vertex (Dijkstra). Used to build
    painted-map substitutes: attract falling off from a collar, rest length near a seam."""
    import heapq
    nb = [[] for _ in range(len(points))]
    for a, b in edges:
        d = _dist(points[a], points[b])
        nb[a].append((b, d))
        nb[b].append((a, d))
    dist = [float("inf")] * len(points)
    heap = []
    for s in sources:
        dist[s] = 0.0
        heap.append((0.0, s))
    heapq.heapify(heap)
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for w, l in nb[v]:
            nd = d + l
            if nd < dist[w]:
                dist[w] = nd
                heapq.heappush(heap, (nd, w))
    return dist


def remap(x, a, b, va, vb):
    """Linear remap of x from [a, b] to [va, vb], clamped."""
    if b == a:
        return vb if x >= b else va
    t = min(1.0, max(0.0, (x - a) / float(b - a)))
    return va + (vb - va) * t


def falloff_values(distances, d0, d1, v0=1.0, v1=0.0):
    """Per-vertex values: v0 up to distance d0, ramp to v1 at d1 and beyond (unreachable = v1)."""
    return [v1 if d == float("inf") else remap(d, d0, d1, v0, v1) for d in distances]


def smooth_values(values, nbrs, iterations=2, weight=0.5, locked=()):
    """Programmatic Smooth + Flood for per-vertex maps: SARKAMARI always smooths painted maps to
    avoid seams in behavior (RhAxSgPpZww [00:28:14]). Laplacian average toward the neighbor
    mean; `locked` vertices keep their value (e.g. a collar row locked at 1)."""
    v = [float(x) for x in values]
    locked = set(locked)
    for _ in range(max(0, int(iterations))):
        nv = v[:]
        for i, nb in enumerate(nbrs):
            if i in locked or not nb:
                continue
            m = sum(v[j] for j in nb) / len(nb)
            nv[i] = (1 - weight) * v[i] + weight * m
        v = nv
    return v


def shells(counts, connects, n_points):
    """Connected vertex sets (one per piece: a Repro mesh has one shell per instance)."""
    parent = list(range(n_points))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    i = 0
    used = set()
    for c in counts:
        f = connects[i:i + c]
        i += c
        used.update(f)
        for k in range(1, c):
            ra, rb = find(f[0]), find(f[k])
            if ra != rb:
                parent[rb] = ra
    groups = {}
    for v in sorted(used):
        groups.setdefault(find(v), []).append(v)
    return sorted(groups.values(), key=lambda g: g[0])


def shell_spheres(points, shell_list):
    """(center, radius) per shell: centroid and max distance to it (a bounding sphere)."""
    out = []
    for s in shell_list:
        c = tuple(sum(points[v][k] for v in s) / len(s) for k in range(3))
        out.append((c, max(_dist(points[v], c) for v in s)))
    return out


# --------------------------------------------------------------------------- simulation metrics
def _pct(sorted_vals, q):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * q
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def _finite(points):
    return all(math.isfinite(c) for p in points for c in p)


def stretch_stats(rest_points, points, edges, limit=1.10, compress_limit=0.90, worst=10):
    """Edge length ratio current / rest. limit and compress_limit are [added] defaults (woven
    fabric barely stretches: the experts judge "no rubber" visually, hmS [00:04:57], RhA
    [00:24:16]). Returns max, min, p99, mean, counts over the limits and the worst edges."""
    ratios = []
    for a, b in edges:
        r0 = _dist(rest_points[a], rest_points[b])
        if r0 > 1e-9:
            ratios.append((_dist(points[a], points[b]) / r0, (a, b)))
    if not ratios:
        return {"edges": 0}
    vals = sorted(r for r, _ in ratios)
    ratios.sort(key=lambda x: -x[0])
    return {"edges": len(vals), "max": vals[-1], "min": vals[0], "p99": _pct(vals, 0.99),
            "mean": sum(vals) / len(vals), "over": sum(1 for v in vals if v > limit),
            "under": sum(1 for v in vals if v < compress_limit), "limit": limit,
            "compress_limit": compress_limit, "worst": [(round(r, 4), e) for r, e in ratios[:worst]]}


def motion_stats(frames_points, spike_factor=4.0):
    """Per-frame vertex speeds (units per frame) from {frame: points}. Flags non-finite frames
    (exploded solve), frames whose max speed exceeds spike_factor x the median of per-frame
    maxima (pops, [added] threshold), and the bounding-box size per frame."""
    fr = sorted(frames_points)
    out = {"frames": fr, "nan_frames": [], "max_speed": {}, "p95_speed": {}, "spikes": [],
           "bbox_diag": {}}
    for f in fr:
        pts = frames_points[f]
        if not _finite(pts):
            out["nan_frames"].append(f)
            continue
        lo = [min(p[k] for p in pts) for k in range(3)]
        hi = [max(p[k] for p in pts) for k in range(3)]
        out["bbox_diag"][f] = _dist(lo, hi)
    for f0, f1 in zip(fr, fr[1:]):
        a, b = frames_points[f0], frames_points[f1]
        if f0 in out["nan_frames"] or f1 in out["nan_frames"] or len(a) != len(b):
            continue
        dt = float(f1 - f0) or 1.0
        sp = sorted(_dist(p, q) / dt for p, q in zip(a, b))
        out["max_speed"][f1] = sp[-1] if sp else 0.0
        out["p95_speed"][f1] = _pct(sp, 0.95)
    maxima = sorted(out["max_speed"].values())
    med = _pct(maxima, 0.5) if maxima else None
    out["median_max_speed"] = med
    if med:
        out["spikes"] = [f for f, v in sorted(out["max_speed"].items()) if v > spike_factor * med]
    return out


def settle_stats(frames_points, frames, reference_speed=None):
    """Mean vertex speed over consecutive `frames` (the end of the hold): SARKAMARI lets cloth
    settle 25 to 50 frames before the action. reference_speed: the character's speed, to
    express the residual motion as a fraction [added]."""
    fr = sorted(f for f in frames if f in frames_points)
    speeds = []
    for f0, f1 in zip(fr, fr[1:]):
        a, b = frames_points[f0], frames_points[f1]
        speeds += [_dist(p, q) / float(f1 - f0) for p, q in zip(a, b)]
    mean = sum(speeds) / len(speeds) if speeds else None
    return {"frames": fr, "mean_speed": mean,
            "fraction_of_reference": (mean / reference_speed) if (mean is not None and reference_speed) else None}


def compare_runs(run_a, run_b, size=None):
    """Deviation between two runs of the same sim ({frame: points} each), for the substep
    convergence test [added]: per-frame max and mean vertex distance, normalized by `size`
    (default: bounding-box diagonal of run_a at its first frame)."""
    common = sorted(set(run_a) & set(run_b))
    if not common:
        return {"frames": [], "max": None}
    if size is None:
        pts = run_a[common[0]]
        lo = [min(p[k] for p in pts) for k in range(3)]
        hi = [max(p[k] for p in pts) for k in range(3)]
        size = _dist(lo, hi) or 1.0
    per = {}
    for f in common:
        d = [_dist(p, q) for p, q in zip(run_a[f], run_b[f])]
        per[f] = (max(d) if d else 0.0, sum(d) / len(d) if d else 0.0)
    worst = max(per.items(), key=lambda kv: kv[1][0])
    return {"frames": common, "size": size, "max": worst[1][0], "max_frame": worst[0],
            "max_rel": worst[1][0] / size, "mean_rel": sum(v[1] for v in per.values()) / len(per) / size,
            "per_frame_max": {f: v[0] for f, v in per.items()}}


# --------------------------------------------------------------------------- verdicts
def cloth_topology_verdict(audit_report, expected_border_loops=None, max_tri_pct=5.0):
    """Gate a garment before nCloth from an mx_audit.audit() report. SARKAMARI: evenly spaced
    quads (a few triangles under the armpit are fine), single-sided, no non-manifold geometry,
    every hole sealed (RhAxSgPpZww [00:03:05] to [00:04:53]); cross links exist only on quads
    (Maya 2027 Help, nCloth overview). expected_border_loops: the openings the garment should
    have (cape 1, trousers 3, shirt 4) [added]; max_tri_pct is an [added] default."""
    r = audit_report
    out = []
    faces = r.get("faces") or 0
    if r.get("ngons"):
        out.append("error: %d n-gons: convert to quads (Multi-Cut) before nCloth" % r["ngons"])
    if r.get("non_manifold_edges") or r.get("non_manifold_verts"):
        out.append("error: non-manifold geometry (%s edges, %s verts)" % (
            r.get("non_manifold_edges"), r.get("non_manifold_verts")))
    if r.get("lamina_faces"):
        out.append("error: %d lamina faces" % r["lamina_faces"])
    if r.get("zero_area_faces"):
        out.append("warn: %d zero-area faces" % r["zero_area_faces"])
    tri_pct = 100.0 * (r.get("tris") or 0) / faces if faces else 0.0
    if tri_pct > max_tri_pct:
        out.append("warn: %.1f%% triangles: cross links need quads, many triangles deform oddly" % tri_pct)
    if expected_border_loops is not None and r.get("holes") != expected_border_loops:
        out.append("error: %s open borders %s, expected %d: seal pockets and holes, or the mesh is "
                   "double-sided" % (r.get("holes"), r.get("border_loops"), expected_border_loops))
    if (r.get("edge_len_cv") or 0) > 0.5:
        out.append("warn: edge length CV %.2f: nCloth wants evenly spaced quads" % r["edge_len_cv"])
    return out


def nucleus_verdict(settings, linear_unit, action_start=None, size_units=None, art_choice=False,
                    playback_speed=None):
    """settings: {"substeps", "maxCollisionIterations", "spaceScale", "startFrame"}.
    Doc rules: collision iterations below the substep count do nothing; presets assume
    substeps 3, iterations 4; Space Scale 0.01 for cm (Maya 2027 Help, Tips, Nucleus node).
    SARKAMARI: 10 and 12 for a first pass, 30 and 35 final; start 50 frames before the action;
    play every frame (RhAxSgPpZww [00:18:26], [00:29:57], [00:06:00])."""
    out = []
    ss, it = settings.get("substeps"), settings.get("maxCollisionIterations")
    if ss is not None and it is not None and it <= ss:
        out.append("error: maxCollisionIterations %s <= substeps %s: iterations below the substep "
                   "count do nothing, set them above" % (it, ss))
    if ss is not None and ss <= 3:
        out.append("warn: substeps %s is the preset assumption; character cloth needs 10 (first "
                   "pass) to 30 (final)" % ss)
    sc = settings.get("spaceScale")
    if sc is not None and size_units:
        out += scale_verdict(size_units, linear_unit, sc, art_choice=art_choice)["problems"]
    elif sc is not None and not art_choice and abs(sc - solver_scale(linear_unit)) > 1e-9:
        out.append("error: spaceScale %s but a %s scene needs %s (or record an art choice)" % (
            sc, linear_unit, solver_scale(linear_unit)))
    st = settings.get("startFrame")
    if st is not None and action_start is not None:
        pre = action_start - st
        if pre < 25:
            out.append("error: only %s frames of pre-roll before the action (need 25 to 50)" % pre)
        elif pre < 50:
            out.append("info: %s frames of pre-roll (SARKAMARI uses 50)" % pre)
    if playback_speed not in (None, 0, 0.0):
        out.append("warn: playbackSpeed %s: set Play every frame (0) before playing a sim" % playback_speed)
    return out


def sim_verdict(report, stretch_limit=None, max_penetrating=0, conv_tol=0.05, settle_tol=0.05,
                budget_spf=None):
    """Problems in an mx_fx.sim_report() (plus optional "convergence") as "error:", "warn:",
    "info:" strings, [] when clean. Pass bars are [added] defaults: zero penetrating vertices
    after the action starts, stretch under the report's limit, no non-finite frame, no speed
    spike, residual speed at the end of the hold under settle_tol of the character's speed.
    SARKAMARI accepts small artifacts that motion blur hides in camera (RhAxSgPpZww
    [00:37:46]): record such an exception, do not raise the bar silently. budget_spf: seconds
    per frame the brief allows; the report's timings go through timing_verdict (the doc's
    Timing Output gate)."""
    out = []
    if report.get("seconds_per_frame"):
        out += timing_verdict(report["seconds_per_frame"], budget_spf)["problems"]
    mo = report.get("motion") or {}
    if mo.get("nan_frames"):
        out.append("error: non-finite points on frames %s (the solve exploded)" % mo["nan_frames"][:10])
    if mo.get("spikes"):
        out.append("error: speed spikes (pops) on frames %s" % mo["spikes"][:10])
    pen = report.get("penetration") or {}
    am = pen.get("action_max")
    if am is not None and am > max_penetrating:
        out.append("error: up to %d cloth vertices inside the collider after the action starts "
                   "(frames %s)" % (am, pen.get("action_frames_with", [])[:10]))
    elif pen.get("preroll_max"):
        out.append("info: %d vertices inside during the pre-roll (settling)" % pen["preroll_max"])
    st = report.get("stretch") or {}
    lim = stretch_limit or st.get("limit")
    if st.get("max") is not None and lim and st["max"] > lim:
        out.append("error: edge stretch up to %.3f x rest (limit %.2f) on frame %s: raise substeps "
                   "before stiffness" % (st["max"], lim, st.get("max_frame")))
    se = report.get("settle") or {}
    if se.get("fraction_of_reference") is not None and se["fraction_of_reference"] > settle_tol:
        out.append("warn: cloth still moving at the end of the hold (%.1f%% of the character speed): "
                   "lengthen the pre-roll" % (100 * se["fraction_of_reference"]))
    th, so = report.get("thickness"), report.get("standoff")
    if th and so is not None and so > 2.0 * th:
        out.append("warn: cloth stands %.3g off the body (thickness %.3g): thickness too large or "
                   "collider inflated" % (so, th))
    cv = report.get("convergence")
    if cv and cv.get("max_rel") is not None:
        if cv["max_rel"] > conv_tol:
            out.append("warn: result moves %.1f%% of its size when substeps double (frame %s): the "
                       "coarse run is under-stepped if its metrics are worse" % (100 * cv["max_rel"],
                                                                              cv.get("max_frame")))
        else:
            out.append("info: doubling substeps changes the result by %.2f%%: keep the cheaper "
                       "setting" % (100 * cv["max_rel"]))
    return out


def timing_verdict(seconds_per_frame, budget_spf=None, slow_factor=3.0):
    """The performance gate. The nucleus Timing Output (Frame or Subframe) prints the solve time
    per frame or substep to the Script Editor and is the doc's measurable gate (2027 Help,
    Nucleus node, Timing Output); sim_report, run_sim and step_frames time every frame in Python
    the same way, for any solver. {frame: seconds} in; returns median, max, total, slow frames
    (over slow_factor x the median: collision-heavy moments, [added] factor) and problems. A
    median over budget_spf (from the brief; no source gives a number) is an error that names
    the doc's cheaper levers first."""
    vals = sorted((f, float(s)) for f, s in seconds_per_frame.items() if s is not None)
    rep = {"frames": len(vals), "median": None, "max": None, "max_frame": None, "total": 0.0,
           "slow_frames": [], "problems": []}
    if not vals:
        return rep
    secs = sorted(s for _, s in vals)
    med = _pct(secs, 0.5)
    mf, mx = max(vals, key=lambda kv: kv[1])
    rep.update(median=med, max=mx, max_frame=mf, total=round(sum(secs), 3))
    if med and med > 0:
        rep["slow_frames"] = [f for f, s in vals if s > slow_factor * med]
    rep["problems"].append("info: solve %.3g s/frame median, %.3g s max (frame %s), %.3g s total"
                           % (med, mx, mf, rep["total"]))
    if rep["slow_frames"]:
        rep["problems"].append("info: frames %s solve over %.0f x the median: look for trapped or "
                               "heavy collisions there" % (rep["slow_frames"][:10], slow_factor))
    if budget_spf and med > budget_spf:
        rep["problems"].append(
            "error: median solve %.3g s/frame is over the budget %.3g: before cutting quality, check "
            "that the extra substeps buy something (convergence_test), use rigidity or deform "
            "resistance instead of a huge bend resistance, lock input-attract vertices of 1 (2027 "
            "Help, Tips); Bifrost: coarser detail, adaptivity bounds" % (med, budget_spf))
    return rep


# --------------------------------------------------------------------------- frames, restarts, sources, caches (pure)
BIFROST_RESTART_CHANGES = {
    "geo_detail_size": "geo_detail_size cannot change during playback: go back to the start frame "
                       "and play forward (sim guide, Considerations)",
    "time_step_size": "time_step_size cannot change during playback: go back to the start frame "
                      "and play forward (sim guide, Considerations)",
    "compound": "creating or exploding a compound that holds a feedback port resets its caches: "
                "re-simulate from the start frame (sim guide, Considerations)",
}


def sim_range_verdict(solver_start, timeline_start, first_evaluated, shot_end=None, source_starts=(),
                      cache_range=None, review_frames=(), master_start_frame=False, changed=(),
                      default_start=1):
    """Start frame, evaluation order, restarts and coverage of any solve (Bifrost, Nucleus), as
    "error:", "warn:", "info:" strings ([] when clean).
    solver_start: the sim's own start frame; None = never set, and every Bifrost sim then starts
    at 1 (sim guide, Considerations). Rules: the start frame must exist in the timeline
    (Nordenstam rUY9pO7UCjs [00:56:23]: his sim did nothing from frame 0); evaluate in order from
    the start frame, since a sim steps only when the frame is the last solved one + 1 (graph doc,
    Custom sims; Nucleus Frame Jump Limit); a source that starts before the solver emits nothing
    earlier [added]; the master start frame also moves colliders, so it is off after debugging
    (Stamatelos U_CqI5R3Ibw [00:24:44] [00:37:04]); `changed` lists edits since the last run from
    the start frame (keys of BIFROST_RESTART_CHANGES, or any other name); the cache and the
    review reach the shot end [added]."""
    out = []
    st = solver_start
    if st is None:
        st = default_start
        out.append("warn: solver start frame never set: every Bifrost sim defaults to %s (sim guide); "
                   "set it to the frame the sim should start on" % default_start)
    if timeline_start is not None and st < timeline_start:
        out.append("error: start frame %s is outside the timeline (it starts at %s): the sim never "
                   "initializes (Nordenstam: from frame 0 his sim did nothing); move the start frame "
                   "or extend the timeline" % (st, timeline_start))
    if first_evaluated is not None and first_evaluated > st:
        out.append("error: evaluation begins at %s, after the start frame %s: a sim steps only from "
                   "its start, in order; evaluate from %s, or set the start frame to the first "
                   "evaluated frame" % (first_evaluated, st, st))
    early = sorted(s for s in source_starts if s is not None and s < st)
    if early:
        out.append("warn: sources start at %s, before the solver start %s: nothing is emitted before "
                   "the solver starts [added]" % (early, st))
    if master_start_frame:
        out.append("warn: master start frame is on: it overrides every source and collider start "
                   "(Stamatelos [00:24:44] [00:37:04]); turn it off after debugging")
    for c in changed or ():
        msg = BIFROST_RESTART_CHANGES.get(c)
        out.append("error: " + msg if msg else
                   "info: %s changed mid-sim: the feedback cache continues from the current frame, "
                   "so re-run from the start frame before judging (sim guide, Considerations)" % c)
    if shot_end is not None and cache_range is not None and cache_range[1] < shot_end:
        out.append("error: cache ends at %s, the shot at %s: the tail is never simulated or judged"
                   % (cache_range[1], shot_end))
    if shot_end is not None and review_frames and max(review_frames) < shot_end:
        out.append("warn: last reviewed frame %s, shot ends at %s: look at the tail (pops, vanishing "
                   "voxels, effect leaving frame)" % (max(review_frames), shot_end))
    return out


def voxel_estimate(extent, detail_size):
    """Voxels covering a box of `extent` (one size or (x, y, z)) at `detail_size`, same units:
    the product of ceil(extent / detail) per axis [added arithmetic]. Halving the detail size
    multiplies the count by 8. A lower bound for a smoke domain, which grows as the smoke spreads."""
    if not detail_size or detail_size <= 0:
        raise ValueError("detail_size must be > 0")
    ext = tuple(extent) if isinstance(extent, (list, tuple)) else (extent,) * 3
    n = 1
    for e in ext:
        n *= max(1, int(math.ceil(float(e) / detail_size - 1e-9)))
    return n


def aero_source_verdict(volume_mode=None, resolution_mode=None, emitter_open=None, extent=None,
                        detail_size=None, voxel_budget=None, baseline_detail=None):
    """Checks on one source_air (source_liquid converts meshes the same way) before simulating.
    Volume mode: Solid (default) for closed meshes, Shell for open meshes, planes, pipes with no
    thickness, anything with holes (Stamatelos U_CqI5R3Ibw [00:10:40]; Jason cd3HgvM8sXg
    [00:03:42]); a mesh with no thickness or not watertight needs Shell or it may not emit (sim
    guide, Troubleshoot liquid). emitter_open: the mesh has open borders (emitter_facts).
    Resolution mode: Relative (default) keeps the voxel count about constant whatever the emitter
    size; Absolute is in world units, so a big emitter or a small detail size explodes the count
    and can hang Maya (Stamatelos [00:11:08] [00:12:48]; sim guide, Increase detail). extent and
    detail_size in the same units; in a cm scene estimate in scene units first, the worst case,
    until the probe shows whether scene_units_in_meters rescales Absolute detail [verify].
    voxel_budget: from the brief's memory and time budget (no source gives a number).
    baseline_detail: the last detail size that ran. Port names: Stamatelos and the liquid page
    call the Solid / Shell switch geo_volume_mode, the 2027 Increase detail page gives that name
    to Absolute / Relative: read BifrostGraph.ports("/source_air") [verify]."""
    out = []
    vm = str(volume_mode or "").strip().lower()
    if emitter_open and vm in ("", "solid"):
        out.append("error: open or flat emitter in %s mode: set the volume mode to Shell (Solid is for "
                   "closed meshes; an open mesh in Solid may emit nothing)" % (volume_mode or "the default Solid"))
    rm = str(resolution_mode or "").strip().lower()
    if rm == "absolute" and extent is not None and detail_size:
        n = voxel_estimate(extent, detail_size)
        line = "Absolute mode: about {:,} voxels for the emitter box alone at detail {}".format(n, detail_size)
        if voxel_budget and n > voxel_budget:
            out.append("error: {}, over the budget of {:,}: raise the detail size, go back to Relative, "
                       "or add detail only where it shows (2027 sharpening, adaptivity bounds, "
                       "post_refine_aero)".format(line, voxel_budget))
        else:
            out.append("info: " + line + ("" if voxel_budget else " (no budget given: set one from the brief)"))
        if baseline_detail and detail_size < baseline_detail:
            ratio = (float(baseline_detail) / detail_size) ** 3
            out.append("%s: detail %s -> %s multiplies the voxels by about %.0f" % (
                "warn" if ratio >= 8 else "info", baseline_detail, detail_size, ratio))
    return out


MCC_LIMIT_BYTES = 2 ** 31      # "mcc ... cannot exceed 2 GB" (2027 Help, nCache Options); read as 2 GiB [added]


def ncache_estimate_bytes(n_vertices, n_samples, bytes_per_value=8):
    """Positions only (x, y, z per vertex per sample): an nCloth cache stores nothing else (2027
    Help, nCache Options). bytes_per_value 8 (double, the worst case) or 4 (float) [added: header
    and per-channel overhead ignored]."""
    return int(n_vertices) * 3 * int(bytes_per_value) * int(n_samples)


def ncache_verdict(n_vertices, start, end, fmt="mcx", one_file=True, evaluate_every=1.0,
                   bytes_per_value=8, transform_animated=False):
    """nCache limits before caching (2027 Help, nCache Options): mcc uses 32-bit indices and cannot
    exceed 2 GB, mcx can; nCloth caches store vertex XYZ positions only, not the transform of the
    pMesh node. evaluate_every: the Evaluate every N frames option (0.5 = two samples a frame).
    The size limit applies to the largest file: the whole range with One file, one frame with One
    file per frame [added reading]. transform_animated: the cloth's transform is keyed,
    constrained or parented to something that moves."""
    samples = int(math.floor((end - start) / float(evaluate_every) + 1e-9)) + 1
    per_file = samples if one_file else max(1, int(math.ceil(1.0 / float(evaluate_every) - 1e-9)))
    biggest = ncache_estimate_bytes(n_vertices, per_file, bytes_per_value)
    out = ["info: about %.3g GB in the largest file (%d vertices, %d samples, positions only)"
           % (biggest / 1e9, n_vertices, per_file)]
    if str(fmt).lower() == "mcc" and biggest > MCC_LIMIT_BYTES:
        out.append("error: mcc cannot exceed 2 GB and this cache needs about %.3g GB per file: use mcx, "
                   "or one file per frame" % (biggest / 1e9))
    if transform_animated:
        out.append("warn: the cloth transform moves, but an nCloth cache stores vertex positions only: "
                   "keep the transform static, or deliver world-space points (alembic_export)")
    return out


def constraint_members_verdict(member_shapes, input_shape, output_shape):
    """Constraint sets belong on the input mesh, otherwise they risk a Dependency Graph loop (2027
    Help, Tips). member_shapes: the shape of each constraint member (cmds.ls(comp,
    objectsOnly=True)). A vertex written on the transform ("cape_SIM.vtx[3]") resolves to the
    visible shape, which after createNCloth is the output mesh [verify]."""
    def short(n):
        return str(n).split("|")[-1]
    bad = sorted({short(m) for m in member_shapes if short(m) == short(output_shape)})
    if bad:
        return ["error: constraint members on the output mesh %s: build them on the input mesh %s "
                "(Dependency Graph loop otherwise)" % (bad[0], short(input_shape))]
    return []


def vtx_indices(components):
    """Vertex indices from component strings ("m.vtx[3]", "m.vtx[5:7]") [added helper]."""
    out = []
    for c in components:
        for a, b in re.findall(r"\.vtx\[(\d+)(?::(\d+))?\]", str(c)):
            out += list(range(int(a), int(b or a) + 1))
    return out


def match_port(ports, *candidates):
    """First candidate found in a port listing (entries like "geo_volume_mode" or
    "/source_air.geo_volume_mode"), exact then case-insensitive; None if absent. Used where the
    docs disagree on a name [added helper]."""
    names = [str(p).split(".")[-1] for p in (ports or [])]
    for c in candidates:
        if c in names:
            return c
    low = {n.lower(): n for n in names}
    for c in candidates:
        if c.lower() in low:
            return low[c.lower()]
    return None


# --------------------------------------------------------------------------- MASH rules (pure)
MASH_SIM_TYPES = {"MASH_Dynamics": "Dynamics (Bullet) is a simulation (Waters Jv_rgrcd3C0)",
                  "MASH_Flight": "Flight is a simulation node (Maya 2027 Help, Caching)",
                  "MASH_Spring": "Spring is a simulation node (Maya 2027 Help, Caching)",
                  "MASH_Trails": "Trails is a simulation node (Maya 2027 Help, Caching)"}


def mash_cache_reasons(inventory):
    """Why a MASH network must be cached before render, from mash_inventory() rows
    ({"name", "type", "attrs"}). Rules: Flight, Spring, Trails, velocity-based effects (Color,
    Time, Python), any Falloff in Add mode (Maya 2027 Help, Caching MASH networks); Dynamics
    (Waters Jv_rgrcd3C0); Time with Simulated Time (Waters xeSxL472d8Q [00:03:44]); a Python
    node that stores state in attributes (Waters ij5ke9ftyH8 [00:06:39], [added] reading).
    Also warns about a keyed Time Scale without Simulated Time (the catch-up burst,
    xeSxL472d8Q [00:03:25])."""
    reasons, warnings = [], []
    for row in inventory:
        t, a, n = row.get("type", ""), row.get("attrs") or {}, row.get("name")
        if t in MASH_SIM_TYPES:
            reasons.append("%s: %s" % (n, MASH_SIM_TYPES[t]))
        if t == "MASH_Time":
            if a.get("simulatedTime"):
                reasons.append("%s: Simulated Time accumulates, bake it" % n)
            if a.get("useVelocity"):
                reasons.append("%s: velocity-based time" % n)
            if a.get("timeScale_keyed") and not a.get("simulatedTime"):
                warnings.append("%s: Time Scale is keyed without Simulated Time: animation catches "
                                "up in a burst" % n)
        if t == "MASH_Color" and a.get("useVelocity"):
            reasons.append("%s: velocity-based color" % n)
        if t == "MASH_Falloff" and str(a.get("mode_label", "")).lower() == "add":
            reasons.append("%s: Falloff in Add mode remembers the past" % n)
        if t == "MASH_Python" and (a.get("state_attrs") or a.get("uses_velocity")):
            reasons.append("%s: Python node with state or velocity" % n)
    return {"needs_cache": bool(reasons), "reasons": reasons, "warnings": warnings}


def overlaps(centers, radii, tolerance=0.0, max_listed=20):
    """Pairs of spheres that intersect (distance < r_i + r_j - tolerance), via a uniform grid.
    Mirrors the Placer's Strict mode (a simple spherical collision per point, Waters
    Qb2ZGa0JBns [00:04:13]) and the World node's model size (wloCNbLRetQ [00:16:06])."""
    if not centers:
        return {"pairs": 0, "sample": [], "min_gap": None}
    cell = max(2.0 * max(radii), 1e-6)
    grid = {}
    for i, c in enumerate(centers):
        grid.setdefault(tuple(int(math.floor(c[k] / cell)) for k in range(3)), []).append(i)
    pairs, sample, min_gap = 0, [], None
    for key, idx in grid.items():
        cand = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    cand += grid.get((key[0] + dx, key[1] + dy, key[2] + dz), [])
        for i in idx:
            for j in cand:
                if j <= i:
                    continue
                gap = _dist(centers[i], centers[j]) - radii[i] - radii[j]
                min_gap = gap if min_gap is None else min(min_gap, gap)
                if gap < -tolerance:
                    pairs += 1
                    if len(sample) < max_listed:
                        sample.append((i, j, round(gap, 4)))
    return {"pairs": pairs, "sample": sample, "min_gap": min_gap}


# --------------------------------------------------------------------------- caches on disk (pure)
def expand_pattern(pattern, frame):
    """Frame path from a pattern: '#' runs (Bifrost: one # per digit), '@' (one frame number,
    unpadded), '%04d' printf style [added: '@' as unpadded]."""
    if "%" in pattern and re.search(r"%0?\d*d", pattern):
        return pattern % frame
    out = re.sub(r"#+", lambda m: str(int(frame)).zfill(len(m.group(0))), pattern)
    return out.replace("@", str(int(frame)))


def file_sequence_report(pattern, start, end, growth_factor=3.0):
    """Every frame present? Sizes and runaway growth (escaping particles grow the voxelized
    domain, Bifrost sim guide, Troubleshoot liquid). growth_factor is an [added] threshold on
    frame-to-frame size ratio."""
    missing, sizes = [], {}
    for f in range(int(start), int(end) + 1):
        p = expand_pattern(pattern, f)
        if os.path.isfile(p):
            sizes[f] = os.path.getsize(p)
        else:
            missing.append(f)
    jumps = []
    fr = sorted(sizes)
    for a, b in zip(fr, fr[1:]):
        if sizes[a] > 0 and sizes[b] / float(sizes[a]) > growth_factor:
            jumps.append((b, round(sizes[b] / float(sizes[a]), 2)))
    return {"pattern": pattern, "frames": len(sizes), "missing": missing, "sizes": sizes,
            "total_bytes": sum(sizes.values()), "growth_jumps": jumps,
            "ok": not missing and bool(sizes)}


# --------------------------------------------------------------------------- sprites (pure + mx_review)
def sprite_layout(n_frames=64, cell=512):
    """Jason Brown's flipbook: 64 frames of 512 px in an 8 x 8, 4096 px sheet (bp9ydYUCmx8
    [00:09:32], [00:10:04])."""
    cols = int(math.ceil(math.sqrt(n_frames)))
    rows = int(math.ceil(n_frames / float(cols)))
    return {"cols": cols, "rows": rows, "cell": cell, "sheet": (cols * cell, rows * cell)}


def alpha_bbox(w, h, rgba, threshold=0):
    """(x0, y0, x1, y1) of pixels with alpha > threshold, top row first; None if empty."""
    alpha = bytes(rgba[3::4])
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = alpha[y * w:(y + 1) * w]
        if not row or max(row) <= threshold:
            continue
        first = next(i for i, v in enumerate(row) if v > threshold)
        last = w - 1 - next(i for i, v in enumerate(reversed(row)) if v > threshold)
        y0, y1 = min(y0, y), y
        x0, x1 = min(x0, first), max(x1, last)
    return None if x1 < 0 else (x0, y0, x1, y1)


def sprite_framing(frames, margin=2, threshold=0, allow_edges=()):
    """frames: list of (name, w, h, rgba). Jason: the effect must never leave the cell; check
    the first visible and the last frames, not only the peak (bp9ydYUCmx8 [00:18:02],
    [00:18:34]). Flags frames whose alpha touches an edge (within margin px); allow_edges
    ("bottom",) accepts a ground-anchored effect cut by the floor [added]."""
    rep = {"frames": [], "touching": [], "empty": [], "first_visible": None}
    for i, (name, w, h, d) in enumerate(frames):
        bb = alpha_bbox(w, h, d, threshold)
        edges = []
        if bb is None:
            rep["empty"].append(name)
        else:
            if rep["first_visible"] is None:
                rep["first_visible"] = name
            if bb[1] <= margin:
                edges.append("top")
            if bb[3] >= h - 1 - margin:
                edges.append("bottom")
            if bb[0] <= margin:
                edges.append("left")
            if bb[2] >= w - 1 - margin:
                edges.append("right")
            edges = [e for e in edges if e not in allow_edges]
            if edges:
                rep["touching"].append((name, edges))
        rep["frames"].append({"name": name, "bbox": bb, "edges": edges})
    rep["ok"] = not rep["touching"]
    return rep


def _review():
    import sys
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.insert(0, EXPERT_SCRIPTS)
    import mx_review
    return mx_review


def sprite_sheet(pngs, out_path, cols=None, margin=2, allow_edges=()):
    """Read frame PNGs (mx_review.read_rgba), run sprite_framing, and tile them into one RGBA
    sheet with no labels (a game atlas, [added]). Frames must share one size."""
    mr = _review()
    frames = []
    for p in pngs:
        w, h, d = mr.read_rgba(p)
        frames.append((os.path.basename(p), w, h, d))
    if not frames:
        raise ValueError("no frames")
    w, h = frames[0][1], frames[0][2]
    if any(f[1] != w or f[2] != h for f in frames):
        raise ValueError("frames differ in size")
    cols = cols or sprite_layout(len(frames), w)["cols"]
    rows = int(math.ceil(len(frames) / float(cols)))
    W, H = cols * w, rows * h
    buf = bytearray(W * H * 4)
    for i, (_, _, _, d) in enumerate(frames):
        r, c = divmod(i, cols)
        for y in range(h):
            o = ((r * h + y) * W + c * w) * 4
            buf[o:o + w * 4] = d[y * w * 4:(y + 1) * w * 4]
    mr.write_png(out_path, W, H, bytes(buf), channels=4)
    rep = sprite_framing(frames, margin, allow_edges=allow_edges)
    rep.update(sheet=out_path, sheet_size=(W, H), cols=cols, rows=rows)
    return rep


# =========================================================================== Maya side
# Everything below needs Maya (mayapy or the GUI through mx_bridge). NOT YET RUN IN MAYA.

def _cmds():
    import maya.cmds as cmds
    return cmds


def _mel():
    import maya.mel as mel
    return mel


def _om():
    import maya.api.OpenMaya as om
    return om


def _audit():
    import sys
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.insert(0, EXPERT_SCRIPTS)
    import mx_audit
    return mx_audit


def ensure_plugin(name):
    """Load a plug-in by exact name (bifrostGraph, MASH, AbcExport, AbcImport, mayaUsdPlugin,
    mtoa) [verify names with job_00_fx_probe]. Returns its version."""
    cmds = _cmds()
    if not cmds.pluginInfo(name, q=True, loaded=True):
        cmds.loadPlugin(name, quiet=True)
    return cmds.pluginInfo(name, q=True, version=True)


class _Selection(object):
    """MEL menu procedures (createNCloth, makeCollideNCloth, createNConstraint, MASH.api) work
    on the selection: select what they need, restore the user's selection afterwards."""

    def __init__(self, items):
        self.items = items

    def __enter__(self):
        cmds = _cmds()
        self.prev = cmds.ls(selection=True, long=True) or []
        cmds.select(self.items, replace=True)
        return self

    def __exit__(self, *a):
        cmds = _cmds()
        keep = [s for s in self.prev if cmds.objExists(s.split(".")[0])]
        if keep:
            cmds.select(keep, replace=True)
        else:
            cmds.select(clear=True)
        return False


# ---- attribute names: resolve, never assume ------------------------------------------------
NUCLEUS_ATTRS = {"substeps": ("subSteps", "substeps"), "maxCollisionIterations": ("maxCollisionIterations",),
                 "spaceScale": ("spaceScale",), "startFrame": ("startFrame",), "timeScale": ("timeScale",),
                 "gravity": ("gravity",), "gravityDirection": ("gravityDirection",),
                 "airDensity": ("airDensity",), "windSpeed": ("windSpeed",), "windNoise": ("windNoise",),
                 "windDirection": ("windDirection",), "frameJumpLimit": ("frameJumpLimit",),
                 "timingOutput": ("timingOutput",), "enable": ("enable",), "usePlane": ("usePlane",)}
CLOTH_ATTRS = {"pointMass": ("pointMass", "mass"),
               "maxSelfCollisionIterations": ("maxSelfCollisionIterations", "maxSelfCollideIterations"),
               "inputAttractMethod": ("inputAttractMethod", "inputMeshAttractMethod")}
# Every other nClothShape name is the camelCase UI label (thickness, selfCollideWidthScale,
# friction, stretchResistance, compressionResistance, bendResistance, bendAngleDropoff, damp,
# lift, drag, tangentialDrag, inputMeshAttract, inputMotionDrag, restLengthScale,
# collideLastThreshold, trappedCheck, pushOut, pushOutRadius, crossoverPush, selfCollide,
# isDynamic, bendSolver, evaluationOrder, scalingRelation) [verify with the probe].


def resolve_attr(node, *names):
    """First of `names` that exists on node (then a case-insensitive match), else None."""
    cmds = _cmds()
    for n in names:
        if cmds.attributeQuery(n, node=node, exists=True):
            return n
    low = {a.lower(): a for a in (cmds.listAttr(node) or [])}
    for n in names:
        if n.lower() in low:
            return low[n.lower()]
    return None


def enum_index(node, attr, label):
    """Index of an enum label (case, spaces and hyphens ignored), read from the node itself:
    never hardcode enum ints (MASH digest; [added])."""
    cmds = _cmds()
    items = (cmds.attributeQuery(attr, node=node, listEnum=True) or [""])[0].split(":")
    return _enum_lookup(items, label, "%s.%s" % (node, attr))


def _enum_lookup(items, label, where="enum"):
    """items as attributeQuery(listEnum) splits them ("None", "Per-vertex" or "Off=0", "On=3");
    exact match first, then prefix ("lock" -> "Lock values of 1.0 or greater")."""
    key = re.sub(r"[\s\-_]", "", str(label).lower())
    parsed = []
    for i, it in enumerate(items):
        name, _, val = it.partition("=")
        parsed.append((re.sub(r"[\s\-_]", "", name.lower()), int(val) if val else i))
    for norm, val in parsed:
        if norm == key:
            return val
    for norm, val in parsed:
        if norm.startswith(key):
            return val
    raise ValueError("%s has no enum %r (%s)" % (where, label, items))


def set_attrs(node, values, table=None):
    """Set {canonical_name: value}; names are resolved through `table` aliases, strings on
    enum attributes are labels. Returns {"set": {name: [attr, value]}, "missing": [...],
    "errors": {...}} so a caller can log exactly what changed (one change per run, Jason
    cd3HgvM8sXg [00:21:43])."""
    cmds = _cmds()
    log = {"node": node, "set": {}, "missing": [], "errors": {}}
    for key, val in values.items():
        attr = resolve_attr(node, *((table or {}).get(key, ()) + (key,)))
        if not attr:
            log["missing"].append(key)
            continue
        try:
            kind = cmds.getAttr(node + "." + attr, type=True)
            if kind == "enum" and isinstance(val, str):
                val = enum_index(node, attr, val)
            if isinstance(val, (list, tuple)):
                cmds.setAttr(node + "." + attr, *val)
            else:
                cmds.setAttr(node + "." + attr, val)
            log["set"][key] = [attr, val]
        except Exception as exc:
            log["errors"][key] = "%s: %s" % (type(exc).__name__, exc)
    return log


def get_attrs(node, keys, table=None):
    cmds = _cmds()
    out = {}
    for k in keys:
        a = resolve_attr(node, *((table or {}).get(k, ()) + (k,)))
        out[k] = cmds.getAttr(node + "." + a) if a else None
    return out


# ---- presets (values only; deterministic instead of applyPresetToNode) ----------------------
CLOTH_PRESETS = {   # Maya 2027 Help, nCloth attribute presets (clothing). All: Scaling Relation Object.
    "silk":          dict(friction=0.05, stretchResistance=60, compressionResistance=10, bendResistance=0.05, bendAngleDropoff=0.3, pointMass=0.05, damp=0.2, pushOutRadius=0.108),
    "chiffon":       dict(friction=0.9, stretchResistance=40, compressionResistance=20, bendResistance=0.2, bendAngleDropoff=0.6, pointMass=0.15, damp=2.0, pushOutRadius=0.108),
    "tshirt":        dict(friction=0.3, stretchResistance=35, compressionResistance=10, bendResistance=0.1, bendAngleDropoff=0.4, pointMass=0.6, damp=0.8, pushOutRadius=10),
    "thick_knit":    dict(friction=1.0, stretchResistance=30, compressionResistance=5, bendResistance=0.5, bendAngleDropoff=0.603, pointMass=0.8, damp=1.0, pushOutRadius=0.108),
    "heavy_denim":   dict(friction=0.8, stretchResistance=50, compressionResistance=20, bendResistance=0.4, bendAngleDropoff=0.603, pointMass=2.0, damp=0.8, pushOutRadius=0.108),
    "burlap":        dict(friction=2.0, stretchResistance=40, compressionResistance=40, bendResistance=3.0, bendAngleDropoff=0.603, pointMass=1.5, damp=4.0, pushOutRadius=10),
    "thick_leather": dict(friction=0.6, stretchResistance=50, compressionResistance=50, bendResistance=10, bendAngleDropoff=0.727, pointMass=3.0, damp=8.0, pushOutRadius=10),
    "chain_mail":    dict(friction=0.3, stretchResistance=50, compressionResistance=2, bendResistance=0.01, bendAngleDropoff=0.818, pointMass=10, damp=0.05, pushOutRadius=10),
}
# SARKAMARI's first values on a mocap character (RhAxSgPpZww [00:24:16] to [00:36:05]);
# pushOut 0.01 and the 12 iterations are caption readings [?].
SARKAMARI_START = {
    "trousers": dict(friction=0.1, stretchResistance=80, compressionResistance=20, damp=0.4, pointMass=0.8,
                     maxSelfCollisionIterations=8, trappedCheck=1, pushOut=0.01),
    "loose_shirt": dict(stretchResistance=40, compressionResistance=15, pointMass=0.2, damp=0.3),
}
NUCLEUS_PASSES = {"preset": dict(substeps=3, maxCollisionIterations=4),       # what presets assume
                  "first": dict(substeps=10, maxCollisionIterations=12),      # SARKAMARI [00:18:26]
                  "final": dict(substeps=30, maxCollisionIterations=35)}      # SARKAMARI [00:29:57]


# ---- geometry access ------------------------------------------------------------------------
def _dag(name):
    om = _om()
    sl = om.MSelectionList()
    sl.add(name)
    return sl.getDagPath(0)


def mesh_shape(mesh):
    return _audit().resolve_mesh(mesh)[0]


def get_points(mesh, world=True):
    """World-space points in centimeters (OpenMaya internal unit)."""
    om = _om()
    fn = om.MFnMesh(_dag(mesh_shape(mesh)))
    return [(p.x, p.y, p.z) for p in fn.getPoints(om.MSpace.kWorld if world else om.MSpace.kObject)]


def get_topology(mesh):
    om = _om()
    counts, connects = om.MFnMesh(_dag(mesh_shape(mesh))).getVertices()
    return list(counts), list(connects)


def bbox_cm(meshes):
    pts = [p for m in meshes for p in get_points(m)]
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    return lo, hi


def scale_report(meshes, scale_value=None, expected_size_m=None, art_choice=False):
    """The scale gate: linear unit, height of the meshes along the up axis, what the solvers
    will see. scale_value defaults to solver_scale(unit)."""
    cmds = _cmds()
    unit = cmds.currentUnit(q=True, linear=True)
    up = 1 if cmds.upAxis(q=True, axis=True) == "y" else 2
    lo, hi = bbox_cm(meshes)
    size_units = (hi[up] - lo[up]) / 100.0 / meters_per_unit(unit)     # cm -> UI units
    sc = solver_scale(unit) if scale_value is None else scale_value
    rep = scale_verdict(size_units, unit, sc, expected_size_m, art_choice)
    rep.update(unit=unit, size_units=size_units, recommended_scale=solver_scale(unit))
    return rep


# ---- character inputs ------------------------------------------------------------------------
def sim_duplicate(mesh, name=None, parent=None):
    """SARKAMARI's clean sim input: duplicate the (skinned) mesh, unlock its transforms, and
    drive the duplicate with a blend shape from the original at weight 1; the original group
    stays untouched and hidden (RhAxSgPpZww [00:09:28] to [00:13:08]). Returns names."""
    cmds = _cmds()
    shape, xf = _audit().resolve_mesh(mesh)
    short = xf.split("|")[-1].split(":")[-1]
    dup = cmds.duplicate(xf, name=name or short + "_SIM", returnRootsOnly=True)[0]
    dup = cmds.ls(dup, long=True)[0]
    for s in cmds.listRelatives(dup, shapes=True, fullPath=True) or []:
        if cmds.getAttr(s + ".intermediateObject"):
            cmds.delete(s)                                  # the duplicated ...ShapeOrig
    for a in ("t", "r", "s"):
        for ax in "xyz":
            cmds.setAttr("%s.%s%s" % (dup, a, ax), lock=False)
    if parent:
        dup = cmds.parent(dup, parent)[0]
    elif cmds.listRelatives(dup, parent=True):
        dup = cmds.parent(dup, world=True)[0]
    dup = cmds.ls(dup, long=True)[0]
    bs = cmds.blendShape(xf, dup, name=dup.split("|")[-1] + "_BS", weight=[(0, 1.0)])[0]
    return {"sim": dup, "blendShape": bs, "source": xf}


def add_preroll(nodes, action_start, hold=25, blend=25, rest="defaults", tangent="flat"):
    """Key SARKAMARI's pre-roll on every animated keyable attribute of `nodes`: the rest pose
    at the hold start and hold end, the existing first pose at action_start (RhAxSgPpZww
    [00:05:26]). rest: "defaults" (attribute defaults: right for zeroed control rigs),
    "first_pose" (hold the first pose: settling only), or {plug_or_attr: value} (e.g. a bind
    pose captured with get_pose()). Attributes already keyed before action_start are skipped
    and reported. Sets the playback start to the nucleus start."""
    cmds = _cmds()
    plan = preroll_plan(action_start, hold, blend)
    s, he = plan["hold"]
    keyed, skipped = [], []
    for n in nodes:
        for a in cmds.listAttr(n, keyable=True, unlocked=True, scalar=True) or []:
            plug = "%s.%s" % (n, a)
            curves = cmds.listConnections(plug, source=True, destination=False, type="animCurve") or []
            if not curves:
                continue
            times = cmds.keyframe(curves[0], q=True, timeChange=True) or []
            if times and min(times) < action_start:
                skipped.append(plug)
                continue
            v_first = cmds.getAttr(plug, time=action_start)
            if rest == "first_pose":
                v_rest = v_first
            elif isinstance(rest, dict):
                v_rest = rest.get(plug, rest.get(a, v_first))
            else:
                d = cmds.attributeQuery(a, node=n, listDefault=True)
                v_rest = d[0] if d else v_first
            if not cmds.keyframe(curves[0], q=True, time=(action_start, action_start), timeChange=True):
                cmds.setKeyframe(n, attribute=a, time=action_start, value=v_first)
            for t in (s, he):
                cmds.setKeyframe(n, attribute=a, time=t, value=v_rest,
                                 inTangentType=tangent, outTangentType=tangent)
            keyed.append(plug)
    cmds.playbackOptions(minTime=s, animationStartTime=s)
    plan.update(keyed=len(keyed), skipped=skipped)
    return plan


def get_pose(nodes, time=None):
    """{plug: value} of every keyable scalar attribute (a bind or rest pose for add_preroll)."""
    cmds = _cmds()
    pose = {}
    for n in nodes:
        for a in cmds.listAttr(n, keyable=True, scalar=True) or []:
            plug = "%s.%s" % (n, a)
            pose[plug] = cmds.getAttr(plug, time=time) if time is not None else cmds.getAttr(plug)
    return pose


# ---- Nucleus objects (MEL menu procedures, [verify] every name) --------------------------------
def _set_active_nucleus(nucleus):
    try:
        _mel().eval('setActiveNucleusNode "%s";' % nucleus)                 # [verify]
        return True
    except Exception:
        return False


def make_ncloth(mesh, nucleus=None, name=None):
    """FX > nCloth > Create nCloth on `mesh` (MEL createNCloth 0 = local space [verify]).
    Returns {"cloth", "cloth_xform", "nucleus", "cloth_out", "input"}."""
    cmds, mel = _cmds(), _mel()
    shape, xf = _audit().resolve_mesh(mesh)
    with _Selection([xf]):
        if nucleus:
            _set_active_nucleus(nucleus)
        res = mel.eval("createNCloth 0;") or []                              # [verify]
    cloth = cmds.ls(res, dag=True, type="nCloth", long=True) or []
    if not cloth:
        cloth = [c for c in (cmds.ls(cmds.listHistory(shape, future=True) or [], type="nCloth", long=True) or [])]
    if not cloth:
        raise RuntimeError("createNCloth made no nCloth node (returned %r)" % (res,))
    cloth = cloth[0]
    cxf = cmds.listRelatives(cloth, parent=True, fullPath=True)[0]
    if name:
        cxf = cmds.ls(cmds.rename(cxf, name), long=True)[0]
        cloth = cmds.listRelatives(cxf, shapes=True, fullPath=True, type="nCloth")[0]
    nuc = (cmds.listConnections(cloth, type="nucleus") or [None])[0]
    out = cmds.listConnections(cloth + ".outputMesh", shapes=True, type="mesh") or []   # [verify plug]
    return {"cloth": cloth, "cloth_xform": cxf, "nucleus": nuc,
            "cloth_out": cmds.ls(out[0], long=True)[0] if out else None, "input": xf}


def make_collider(mesh, nucleus=None, name=None):
    """FX > nCloth > Create Passive Collider (MEL makeCollideNCloth [verify])."""
    cmds, mel = _cmds(), _mel()
    shape, xf = _audit().resolve_mesh(mesh)
    with _Selection([xf]):
        if nucleus:
            _set_active_nucleus(nucleus)
        res = mel.eval("makeCollideNCloth;") or []                          # [verify]
    rigid = cmds.ls(res, dag=True, type="nRigid", long=True) or \
        cmds.ls(cmds.listHistory(shape, future=True) or [], type="nRigid", long=True) or []
    if not rigid:
        raise RuntimeError("makeCollideNCloth made no nRigid node (returned %r)" % (res,))
    rigid = rigid[0]
    if name:
        rxf = cmds.rename(cmds.listRelatives(rigid, parent=True, fullPath=True)[0], name)
        rigid = cmds.listRelatives(rxf, shapes=True, fullPath=True, type="nRigid")[0]
    return {"rigid": rigid, "mesh": xf, "nucleus": (cmds.listConnections(rigid, type="nucleus") or [None])[0]}


def input_mesh(cloth):
    """The nCloth's input mesh shape, upstream of <nCloth>.inputMesh [verify plug]. Constraint
    sets and painted-map substitutes are built on it (2027 Help, Tips)."""
    cmds = _cmds()
    src = cmds.listConnections(cloth + ".inputMesh", source=True, destination=False, shapes=True) or []
    return cmds.ls(src[0], long=True)[0] if src else None


def output_mesh(cloth):
    """The nCloth's output mesh shape, downstream of <nCloth>.outputMesh [verify plug]."""
    cmds = _cmds()
    out = cmds.listConnections(cloth + ".outputMesh", source=False, destination=True, shapes=True,
                               type="mesh") or []
    return cmds.ls(out[0], long=True)[0] if out else None


def point_to_surface(components, surface, name=None, exclude_collisions=True, strength=None,
                     tangent_strength=None, cloth=None):
    """nConstraint > Point to Surface from cloth vertices to a surface (MEL createNConstraint
    pointToSurface 0 [verify]). SARKAMARI turns on Exclude Collisions on waistband
    constraints (RhAxSgPpZww [00:23:40]); the doc: Tangent Strength must be above 0 for the
    constraint to act as a collision, lower Strength on long links that pop (Tips). cloth: the
    nCloth node; the vertices are then rewritten onto its input mesh by index, and a member left
    on the output mesh raises (constraint_members_verdict: DG loop otherwise, Tips)."""
    cmds, mel = _cmds(), _mel()
    check = []
    if cloth:
        shape_in, shape_out = input_mesh(cloth), output_mesh(cloth)
        if shape_in:
            components = ["%s.vtx[%d]" % (shape_in, i) for i in vtx_indices(components)]
        members = cmds.ls(list(components), objectsOnly=True, long=True) or []
        check = constraint_members_verdict(members, shape_in or "?", shape_out or "?")
        if check:
            raise ValueError(check[0])
    with _Selection(list(components) + [surface]):
        res = mel.eval("createNConstraint pointToSurface 0;") or []           # [verify]
    con = cmds.ls(res, dag=True, type="dynamicConstraint", long=True) or []
    if not con:
        raise RuntimeError("createNConstraint made no dynamicConstraint (returned %r)" % (res,))
    con = con[0]
    if name:
        cxf = cmds.rename(cmds.listRelatives(con, parent=True, fullPath=True)[0], name)
        con = cmds.listRelatives(cxf, shapes=True, fullPath=True)[0]
    vals = {}
    if exclude_collisions:
        vals["excludeCollisions"] = 1                                         # [verify name]
    if strength is not None:
        vals["strength"] = strength
    if tangent_strength is not None:
        vals["tangentStrength"] = tangent_strength
    return {"constraint": con, "set": set_attrs(con, vals), "members": list(components)}


def vertex_map_attrs(cloth):
    """{base: (mapTypeAttr, perVertexAttr)} for every per-vertex-capable nCloth property
    (doc: Stretch, Bend, Bend Dropoff, Restitution, Rigidity, Deform, Input Attract, Rest
    Length Scale, Damp, Mass, Lift, Drag, Tangential Drag, Wrinkle) [verify long names]."""
    cmds = _cmds()
    attrs = set(cmds.listAttr(cloth) or [])
    out = {}
    for a in attrs:
        if a.endswith("MapType"):
            base = a[:-len("MapType")]
            pv = base + "PerVertex"
            if pv in attrs:
                out[base] = (a, pv)
    return out


def set_vertex_map(cloth, base, values):
    """Painted-map substitute: set <base>MapType to Per-vertex and write <base>PerVertex
    (one value per input-mesh vertex) [verify names; probe lists them]. SARKAMARI paints rest
    length 0.9 (tight), 0.5 (bunching), input attract around a collar, damp (RhAxSgPpZww
    [00:27:36], [00:34:51], [00:38:23])."""
    cmds = _cmds()
    pairs = vertex_map_attrs(cloth)
    if base not in pairs:
        raise KeyError("%s has no per-vertex map for %r (have %s)" % (cloth, base, sorted(pairs)))
    mt, pv = pairs[base]
    cmds.setAttr(cloth + "." + mt, enum_index(cloth, mt, "per-vertex"))
    cmds.setAttr(cloth + "." + pv, [float(v) for v in values], type="doubleArray")
    return {"map_type": mt, "per_vertex": pv, "count": len(values)}


def collar_attract_values(mesh, collar_vertices, band=8.0, lock_value=1.0, band_value=0.7,
                          smooth=2):
    """Input attract map for a pinned collar [added: no source simulates a cape]: lock_value on
    the collar row (with Input Attract Method "Lock values of 1.0 or greater" those vertices
    follow the input mesh, doc Input Mesh Method), band_value falling to 0 over `band` cm of
    surface distance, then smoothed (SARKAMARI smooths every map). band_value 0.7 echoes
    SARKAMARI's collar value [?]."""
    pts = get_points(mesh)
    counts, connects = get_topology(mesh)
    edges = edges_from_faces(counts, connects)
    dist = graph_distance(pts, edges, collar_vertices)
    vals = [lock_value if d == 0 else (0.0 if d == float("inf") else remap(d, 0.0, band, band_value, 0.0))
            for d in dist]
    return smooth_values(vals, neighbors(len(pts), edges), smooth, locked=collar_vertices)


def vertices_near(mesh, axis=1, side="max", within=0.5):
    """Indices of vertices within `within` cm of the mesh's max (or min) along an axis: a
    selection-free pick of a top row (cape collar, waistband) [added]."""
    pts = get_points(mesh)
    vals = [p[axis] for p in pts]
    ref = max(vals) if side == "max" else min(vals)
    return [i for i, v in enumerate(vals) if abs(v - ref) <= within]


def build_cloth_rig(garment, body, action_start, preset="tshirt", start_values=None,
                    nucleus_pass="first", pin="attract_lock", pin_vertices=None, thickness=None,
                    collider_thickness=None, space_scale=None, preroll=(25, 25), name="fx"):
    """One-call nCloth setup on already-prepared inputs (sim duplicates, pre-roll keyed):
    nCloth on the garment, passive collider on the body, one nucleus, pre-roll start frame,
    solver pass values, preset values plus overrides, and a pin. pin: "attract_lock" (input
    attract lock on pin_vertices with a falloff band, [added]) or "point_to_surface"
    (SARKAMARI's waistband method) or None. Returns every node name plus the change log."""
    cmds = _cmds()
    log = {}
    c = make_ncloth(garment, name="nCloth_%s" % name)
    r = make_collider(body, nucleus=c["nucleus"], name="nRigid_%s_body" % name)
    nuc = c["nucleus"]
    unit = cmds.currentUnit(q=True, linear=True)
    plan = preroll_plan(action_start, *preroll)
    nv = dict(NUCLEUS_PASSES[nucleus_pass])
    nv.update(startFrame=plan["nucleus_start"], spaceScale=solver_scale(unit) if space_scale is None else space_scale)
    log["nucleus"] = set_attrs(nuc, nv, NUCLEUS_ATTRS)
    vals = dict(CLOTH_PRESETS.get(preset, {}) if isinstance(preset, str) else preset or {})
    vals.update(start_values or {})
    if thickness is not None:
        vals["thickness"] = thickness
    log["cloth"] = set_attrs(c["cloth"], vals, CLOTH_ATTRS)
    if collider_thickness is not None:
        log["collider"] = set_attrs(r["rigid"], {"thickness": collider_thickness})
    pins = pin_vertices if pin_vertices is not None else vertices_near(garment)
    if pin == "attract_lock":
        values = collar_attract_values(garment, pins)
        log["pin"] = set_vertex_map(c["cloth"], "inputAttract", values)
        log["pin_method"] = set_attrs(c["cloth"], {"inputMeshAttract": 1.0, "inputAttractMethod": "lock",
                                                   "collideLastThreshold": 1.0}, CLOTH_ATTRS)
    elif pin == "point_to_surface":                       # members on the input mesh (doc, Tips)
        comps = ["%s.vtx[%d]" % (garment, i) for i in pins]
        log["pin"] = point_to_surface(comps, body, name="pts_%s_collar" % name, cloth=c["cloth"])
    return {"cloth": c["cloth"], "cloth_xform": c["cloth_xform"], "cloth_out": c["cloth_out"],
            "nucleus": nuc, "collider": r["rigid"], "collider_mesh": r["mesh"], "garment": garment,
            "start": plan["nucleus_start"], "action_start": action_start, "pins": pins, "log": log,
            "verdict": nucleus_verdict(get_attrs(nuc, ("substeps", "maxCollisionIterations", "spaceScale",
                                                       "startFrame"), NUCLEUS_ATTRS), unit, action_start)}


# ---- stepping, sampling, measuring -----------------------------------------------------------
def run_sim(meshes, start, end, sample=None, reset=True):
    """Evaluate every frame from start to end IN ORDER (solvers are sequential; a jump beyond
    the Frame Jump Limit skips the solve, Maya 2027 Help, Nucleus node) and sample world
    points of `meshes` on `sample` frames (default all). Returns {"points": {mesh: {f: pts}},
    "seconds": {f: s}}. reset: go to start - 1 first so the solver re-initializes at start
    [verify]."""
    cmds = _cmds()
    sample = set(range(int(start), int(end) + 1) if sample is None else sample)
    pts = {m: {} for m in meshes}
    secs = {}
    if reset:
        cmds.currentTime(start - 1, update=True)
    for f in range(int(start), int(end) + 1):
        t0 = time.time()
        cmds.currentTime(f, update=True)
        if f in sample:
            for m in meshes:
                pts[m][f] = get_points(m)
        secs[f] = round(time.time() - t0, 4)
    return {"points": pts, "seconds": secs}


def signed_distances(points, body, method="normal"):
    """Signed distance (cm) of each point to a closed collider mesh, negative inside.
    method "normal": sign of (p - closest) . normal (MFnMesh.getClosestPointAndNormal);
    "parity": inside when a +X ray hits the mesh an odd number of times (allIntersections),
    robust in concave regions of a closed mesh [verify both OM2 signatures]."""
    om = _om()
    fn = om.MFnMesh(_dag(mesh_shape(body)))
    acc = None
    if method == "parity":
        try:
            acc = fn.autoUniformGridParams()
        except Exception:
            acc = None
    out = []
    for p in points:
        mp = om.MPoint(p[0], p[1], p[2])
        cp, nrm = fn.getClosestPointAndNormal(mp, om.MSpace.kWorld)[:2]
        v = mp - cp
        d = v.length()
        if method == "parity":
            hits = fn.allIntersections(om.MFloatPoint(p[0], p[1], p[2]), om.MFloatVector(1, 0, 0),
                                       om.MSpace.kWorld, 1e7, False, accelParams=acc)
            inside = len(hits[0]) % 2 == 1
        else:
            n = om.MVector(nrm)
            n.normalize()
            inside = (v * n) < 0
        out.append(-d if inside else d)
    return out


def sim_report(cloth_out, body, start, end, action_start=None, hold=25, rest_frame=None,
               sample_every=1, stretch_limit=1.10, method="normal", thickness=None,
               reference_speed=None):
    """Run the sim once, in order, and measure it on the way (the collider is at the same
    frame): penetrating vertices per sampled frame (split pre-roll / action), edge stretch
    against the rest frame (default: the start frame, where the cloth equals its input),
    motion stats (non-finite, pops), settle over the last 5 held frames (start + hold),
    contact standoff versus thickness, seconds per frame. All [added] measurements of what
    the experts judge by eye (critique.md). reference_speed: character speed in cm/frame."""
    cmds = _cmds()
    step = max(1, int(sample_every))
    sample = set(range(int(start), int(end) + 1, step))
    rest_frame = int(start if rest_frame is None else rest_frame)
    hold_end = int(start) + int(hold)
    settle_frames = set(range(hold_end - 5, hold_end + 1)) if action_start is not None else set()
    sample |= {rest_frame} | settle_frames
    counts, connects = get_topology(cloth_out)
    edges = edges_from_faces(counts, connects)
    fp, pen, secs, standoff = {}, {}, {}, []
    stretch_max, stretch_frame, worst = 0.0, None, None
    cmds.currentTime(start - 1, update=True)
    for f in range(int(start), int(end) + 1):
        t0 = time.time()
        cmds.currentTime(f, update=True)
        if f in sample:
            fp[f] = get_points(cloth_out)
        secs[f] = round(time.time() - t0, 4)
        if f not in sample or f < rest_frame:
            continue
        sd = signed_distances(fp[f], body, method)
        pen[f] = sum(1 for d in sd if d < 0)
        pos = sorted(d for d in sd if d >= 0)
        if pos:
            standoff.append(_pct(pos, 0.05))
        st = stretch_stats(fp[rest_frame], fp[f], edges, stretch_limit)
        if st.get("max") and st["max"] > stretch_max:
            stretch_max, stretch_frame, worst = st["max"], f, st
    a0 = action_start if action_start is not None else start
    act = {f: n for f, n in pen.items() if f >= a0}
    pre = {f: n for f, n in pen.items() if f < a0}
    rep = {"frames": [int(start), int(end)], "sampled": len(fp), "vertices": len(fp[rest_frame]),
           "penetration": {"per_frame": pen, "action_max": max(act.values()) if act else 0,
                           "action_frames_with": [f for f, n in sorted(act.items()) if n],
                           "preroll_max": max(pre.values()) if pre else 0, "method": method},
           "stretch": {"max": stretch_max, "max_frame": stretch_frame, "limit": stretch_limit,
                       "worst": (worst or {}).get("worst"), "p99_at_max": (worst or {}).get("p99")},
           "motion": motion_stats({f: p for f, p in fp.items() if (f - int(start)) % step == 0}),
           "standoff": _pct(sorted(standoff), 0.5) if standoff else None, "thickness": thickness,
           "seconds_per_frame": secs, "solve_seconds_total": round(sum(secs.values()), 2)}
    if settle_frames:
        rep["settle"] = settle_stats(fp, settle_frames, reference_speed)
    return rep


def convergence_test(cloth_out, nucleus, start, end, factor=2, sample_every=2):
    """Run the same sim at substeps S and factor x S (collision iterations kept above substeps)
    and compare [added]. Reading: coarse metrics worse and deviation large = under-stepped,
    raise substeps (SARKAMARI 10 -> 30 fixed his remaining penetration, RhAxSgPpZww
    [00:29:57]; doc: high stretch resistance cannot converge at low substeps). Deviation small
    = the extra substeps buy nothing. Restores the nucleus values."""
    frames = list(range(int(start), int(end) + 1, max(1, int(sample_every))))
    old = get_attrs(nucleus, ("substeps", "maxCollisionIterations"), NUCLEUS_ATTRS)
    out = {"substeps": [old["substeps"], old["substeps"] * factor]}
    try:
        a = run_sim([cloth_out], start, end, sample=frames)["points"][cloth_out]
        set_attrs(nucleus, {"substeps": old["substeps"] * factor,
                            "maxCollisionIterations": max(old["maxCollisionIterations"] * factor,
                                                          old["substeps"] * factor + 1)}, NUCLEUS_ATTRS)
        b = run_sim([cloth_out], start, end, sample=frames)["points"][cloth_out]
    finally:
        set_attrs(nucleus, old, NUCLEUS_ATTRS)
    out.update(compare_runs(a, b))
    counts, connects = get_topology(cloth_out)
    edges = edges_from_faces(counts, connects)
    for tag, run in (("coarse", a), ("fine", b)):
        rest = run[frames[0]]
        out[tag + "_stretch_max"] = max((stretch_stats(rest, run[f], edges).get("max") or 0) for f in run)
    out.pop("per_frame_max", None)
    return out


# ---- caches ----------------------------------------------------------------------------------
def disable_nucleus(nucleus, off=True):
    """After caching, disable the nucleus to scrub fast (Maya 2027 Help, Tips)."""
    return set_attrs(nucleus, {"enable": 0 if off else 1}, NUCLEUS_ATTRS)


def nucleus_timing_output(nucleus, mode="frame"):
    """Nucleus Timing Output: "frame" or "subframe" prints the solve time per frame or substep to
    the Script Editor (2027 Help, Nucleus node), "none" turns it off [verify enum labels; headless
    the lines should land in the mx_run job log, verify]. Returns the set_attrs log."""
    return set_attrs(nucleus, {"timingOutput": mode}, NUCLEUS_ATTRS)


def transform_is_animated(node):
    """True when any translate, rotate or scale channel of `node` or of a parent is driven
    (keys, constraints, expressions): what an nCloth cache would not hold."""
    cmds = _cmds()
    n = cmds.ls(node, long=True)[0]
    while n:
        for a in "trs":
            for ax in "xyz":
                if cmds.listConnections("%s.%s%s" % (n, a, ax), source=True, destination=False):
                    return True
        par = cmds.listRelatives(n, parent=True, fullPath=True)
        n = par[0] if par else None
    return False


def ncache_check(cloth, start, end, fmt="mcx", one_file=True, evaluate_every=1.0):
    """ncache_verdict on a live nCloth: output-mesh vertex count, whether its transform moves."""
    cmds = _cmds()
    mesh = output_mesh(cloth)
    if not mesh:
        return {"mesh": None, "problems": ["warn: no output mesh found on %s [verify outputMesh]" % cloth]}
    xf = cmds.listRelatives(mesh, parent=True, fullPath=True)[0]
    n = cmds.polyEvaluate(mesh, vertex=True)
    moving = transform_is_animated(xf)
    return {"mesh": mesh, "vertices": n, "transform_animated": moving,
            "problems": ncache_verdict(n, start, end, fmt, one_file, evaluate_every,
                                       transform_animated=moving)}


def ncache_create(cloth_shapes, start, end, directory, name="", fmt="mcx", one_file=True):
    """nCache > Create New Cache > nObject (MEL doCreateNclothCache 5 {...} [verify the argument
    list with the probe, which reads the procedure's source]). mcx can exceed 2 GB, mcc cannot;
    caches store vertex positions only (Maya 2027 Help, nCache Options): ncache_check runs first
    and an mcc cache over 2 GB raises. Cache from the nucleus start frame."""
    mel = _mel()
    checks = {c: ncache_check(c, start, end, fmt, one_file) for c in cloth_shapes}
    over = [p for c in checks.values() for p in c["problems"] if p.startswith("error")]
    if over:
        raise ValueError(over[0])
    os.makedirs(directory, exist_ok=True)
    args = ["2", str(start), str(end), "OneFile" if one_file else "OneFilePerFrame", "1", directory,
            "1", name, "0", "add", "0", "1", "1", "0", "1", fmt]
    with _Selection(list(cloth_shapes)):
        res = mel.eval("doCreateNclothCache 5 {%s};" % ", ".join('"%s"' % a for a in args))   # [verify]
    return {"result": res, "directory": directory, "checks": checks,
            "files": sorted(glob.glob(os.path.join(directory, "*")))}


def _no_space_path(path):
    """AbcExport's -j string splits on spaces [verify]: write to a space-free temp path and move."""
    if " " not in path:
        return path, None
    tmp = tempfile.mkdtemp(prefix="mxfx_")
    return os.path.join(tmp, os.path.basename(path).replace(" ", "_")), tmp


def alembic_export(roots, path, start, end, step=1.0, uv_write=True, write_color_sets=True,
                   world_space=True, extra=()):
    """Cache > Alembic Cache > Export Selection to Alembic, scripted (Maya 2027 Help: AbcExport
    -j "-frameRange s e -root r -file f"). UV Write and Write Color Sets on (SARKAMARI
    RhAxSgPpZww [00:31:10]; Waters Jv_rgrcd3C0 [00:00:35]); Ogawa is the only format since
    2022. The range must start at the solver start frame unless the sim is already cached,
    or the export jumps the solver. Returns the final path."""
    cmds = _cmds()
    ensure_plugin("AbcExport")
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    target, tmp = _no_space_path(path)
    parts = ["-frameRange %s %s" % (start, end)]
    if step != 1:
        parts.append("-step %s" % step)
    if uv_write:
        parts.append("-uvWrite")
    if write_color_sets:
        parts.append("-writeColorSets")
    if world_space:
        parts.append("-worldSpace")
    parts += list(extra)
    for r in roots:
        node = cmds.ls(r, long=True)[0]
        if cmds.nodeType(node) == "mesh":                   # a shape: export its transform
            node = cmds.listRelatives(node, parent=True, fullPath=True)[0]
        parts.append("-root %s" % node)
    parts.append("-file %s" % target)
    job = " ".join(parts)
    cmds.AbcExport(j=job)
    if tmp:
        shutil.move(target, path)          # the empty temp folder is left to the OS (no deletes)
    return {"path": path, "job": job}


def alembic_check(path, start=None, end=None):
    """Import an Alembic into a throwaway namespace, report frame range, meshes and vertex
    counts, then delete what the import created [verify AlembicNode attribute names]."""
    cmds = _cmds()
    ensure_plugin("AbcImport")
    src, tmp = _no_space_path(path)
    if tmp:
        shutil.copyfile(path, src)
    before = set(cmds.ls(long=True) or [])
    rec = {"path": path}
    try:
        cmds.AbcImport(src, mode="import")
        new = sorted(set(cmds.ls(long=True) or []) - before)
        abc = cmds.ls(new, type="AlembicNode") or []
        if abc:
            for k, a in (("start", "startFrame"), ("end", "endFrame")):
                try:
                    rec[k] = cmds.getAttr(abc[0] + "." + a)
                except Exception as exc:
                    rec[k] = "error %s" % exc
        meshes = cmds.ls(new, type="mesh", long=True, noIntermediate=True) or []
        rec["meshes"] = {m: cmds.polyEvaluate(m, vertex=True) for m in meshes}
        if start is not None and isinstance(rec.get("start"), (int, float)):
            rec["range_ok"] = abs(rec["start"] - start) < 1e-3 and abs(rec["end"] - end) < 1e-3
    finally:
        new = sorted(set(cmds.ls(long=True) or []) - before)
        roots = [n for n in new if cmds.objExists(n) and cmds.nodeType(n) == "transform"
                 and not cmds.listRelatives(n, parent=True)]
        others = [n for n in new if cmds.objExists(n) and n not in roots and not n.startswith("|")]
        for n in roots + others:            # Maya nodes this import created, nothing else
            if cmds.objExists(n):
                try:
                    cmds.delete(n)
                except Exception:
                    pass
    return rec


# ---- Bifrost (VNN commands; every call [verify]) ---------------------------------------------
BF_TYPE_HINTS = {   # namespaces as spoken in the talks and the 2027 docs; confirm with bifrost_type()
    "get_point_position": "Geometry::Properties", "set_point_position": "Geometry::Properties",
    "add": "Core::Math", "basic_aero_graph": "Simulation::Aero", "source_air": "Simulation::Aero",
    "simulate_aero": "Simulation::Aero", "aero_solver_settings": "Simulation::Aero",
    "collider": "Simulation::Common", "file_cache": "File", "basic_mpm_snow_graph": "Simulation::MPM",
    "basic_mpm_sand_graph": "Simulation::MPM", "basic_mpm_cloth": "Simulation::MPM",
    "source_mpm_snow": "Simulation::MPM", "simulate_mpm": "Simulation::MPM",
    "mpm_solver_settings": "Simulation::MPM", "make_mpm_cloth": "Simulation::MPM",
    "constrain_mpm": "Simulation::MPM", "basic_liquid_graph": "Simulation::Liquid",
}
_BF_LIBRARY = {}


def bifrost_library(refresh=False):
    """Scan the installed Bifrost compound JSON files for "<namespace>::<name>" definitions
    [added: the digest's substitute for the Tab search; path layout verify]. Returns
    {name: [namespace, ...]}."""
    if _BF_LIBRARY and not refresh:
        return _BF_LIBRARY
    cmds = _cmds()
    roots = []
    try:
        d = os.path.dirname(cmds.pluginInfo("bifrostGraph", q=True, path=True))
        for _ in range(4):                  # only ancestors inside the Bifrost install
            if "bifrost" in d.lower():
                roots.append(d)
            d = os.path.dirname(d)
    except Exception:
        pass
    roots = roots[-1:] + glob.glob("/Applications/Autodesk/bifrost*")
    rx = re.compile(r'"name"\s*:\s*"((?:[A-Za-z0-9_]+::)+)([A-Za-z0-9_]+)"')
    seen = set()
    for r in roots:
        for dirpath, _, files in os.walk(r):
            if "compound" not in dirpath.lower() and "resources" not in dirpath.lower():
                continue
            for fn in files:
                if not fn.endswith(".json"):
                    continue
                fp = os.path.join(dirpath, fn)
                if fp in seen:
                    continue
                seen.add(fp)
                try:
                    with open(fp, errors="replace") as f:
                        text = f.read(200000)
                except Exception:
                    continue
                for ns, name in rx.findall(text):
                    _BF_LIBRARY.setdefault(name, [])
                    ns = ns[:-2]
                    if ns not in _BF_LIBRARY[name]:
                        _BF_LIBRARY[name].append(ns)
        if len(_BF_LIBRARY) > 50:
            break
    return _BF_LIBRARY


def bifrost_type(name):
    """Full VNN type string "BifrostGraph,<namespace>,<name>" [verify format]: from the
    library scan, else the hint table."""
    ns = (bifrost_library().get(name) or [None])[0] or BF_TYPE_HINTS.get(name)
    if not ns:
        raise KeyError("no namespace known for Bifrost node %r" % name)
    return "BifrostGraph,%s,%s" % (ns, name)


class BifrostGraph(object):
    """Thin, logged wrapper over the VNN commands the Bifrost menus echo (vnnCompound,
    vnnNode, vnnConnect). Every call is recorded in .log with its outcome, so the probe and
    the tests report the syntax that works on this Maya. Names and flags all [verify]."""

    def __init__(self, shape):
        self.shape = shape
        self.log = []

    @classmethod
    def create(cls, name="fxGraph"):
        cmds = _cmds()
        ensure_plugin("bifrostGraph")
        shape = None
        try:
            res = cmds.bifrostGraph(create=True)                              # [verify command]
            shape = cmds.ls(res, dag=True, type="bifrostGraphShape", long=True)[0]
        except Exception:
            shape = cmds.createNode("bifrostGraphShape", name=name + "Shape")  # [verify type]
            shape = cmds.ls(shape, long=True)[0]
        return cls(shape)

    def _call(self, fn, *a, **kw):
        cmds = _cmds()
        rec = {"call": "%s%r %r" % (fn, a, kw)}
        try:
            rec["result"] = getattr(cmds, fn)(self.shape, *a, **kw)
            rec["ok"] = True
        except Exception as exc:
            rec["ok"], rec["error"] = False, "%s: %s" % (type(exc).__name__, exc)
        self.log.append(rec)
        if not rec["ok"]:
            raise RuntimeError(rec["error"] + " in " + rec["call"])
        return rec["result"]

    def add(self, name_or_type, parent="/"):
        """Add a node; returns its path under parent (the node is named after its type by
        default, a digit is appended on clashes [verify])."""
        t = name_or_type if "," in name_or_type else bifrost_type(name_or_type)
        res = self._call("vnnCompound", parent, addNode=t)
        short = (res[0] if isinstance(res, (list, tuple)) and res else res) or t.split(",")[-1]
        return parent.rstrip("/") + "/" + str(short).split("/")[-1]

    def connect(self, src, dst):
        return self._call("vnnConnect", src, dst)

    def set(self, node, port, value):
        """Port default value; float3 as "{x,y,z}" [verify format]."""
        if isinstance(value, (list, tuple)):
            value = "{%s}" % ",".join(str(v) for v in value)
        elif isinstance(value, bool):
            value = "true" if value else "false"
        return self._call("vnnNode", node, setPortDefaultValues=(port, str(value)))

    def add_input(self, name, type_name="Object"):
        """Graph input port (the Maya-side attribute on the graph shape) [verify]."""
        return self._call("vnnNode", "/input", createOutputPort=(name, type_name))

    def add_output(self, name, type_name="Object"):
        return self._call("vnnNode", "/output", createInputPort=(name, type_name))

    def explode(self, node):
        return self._call("vnnCompound", node, explode=True)

    def nodes(self, path="/"):
        return self._call("vnnCompound", path, listNodes=True)

    def ports(self, node):
        return self._call("vnnNode", node, listPorts=True)

    def find_port(self, node, *candidates):
        """First candidate port that exists on node (match_port on ports()): for names the docs
        disagree on, e.g. the source_air volume and resolution modes [verify listing format]."""
        return match_port(self.ports(node), *candidates)


def emitter_facts(mesh):
    """Open or closed, and the emitter box, for aero_source_verdict: open borders from
    mx_audit.audit (holes), extent in scene units and in meters."""
    cmds = _cmds()
    r = _audit().audit(mesh)
    lo, hi = bbox_cm([mesh])
    mpu = meters_per_unit(cmds.currentUnit(q=True, linear=True))
    ext = tuple((hi[k] - lo[k]) / 100.0 / mpu for k in range(3))
    return {"mesh": mesh, "open": bool(r.get("holes")), "holes": r.get("holes"),
            "extent_units": ext, "extent_m": tuple(e * mpu for e in ext)}


def step_frames(start, end, pull=()):
    """Evaluate frames in order and read `pull` plugs each frame: Bifrost is pull-based, an
    unpulled output is never computed (Jason E3aOt5wuvoo [00:22:49]); whether a getAttr on the
    graph shape triggers the solve headless is [verify]. `start` is the sim's own start frame
    (default 1 on every Bifrost sim): check with sim_range_verdict first. Returns seconds per
    frame (timing_verdict reads them)."""
    cmds = _cmds()
    secs = {}
    cmds.currentTime(start - 1, update=True)
    for f in range(int(start), int(end) + 1):
        t0 = time.time()
        cmds.currentTime(f, update=True)
        for p in pull:
            try:
                cmds.getAttr(p)
            except Exception:
                pass
        secs[f] = round(time.time() - t0, 4)
    return secs


def volume_review(vdb_pattern, frames, out_dir, grids="voxel_fog_density", density=1.0,
                  interpolation="tricubic", resolution=512, view=(0.0, 0.3, 1.0), fps_label=None):
    """Render VDB frames through an Arnold Volume (Jason: faster and better than the Bifrost
    shape, bp9ydYUCmx8 [00:05:21]; the sim guide: judge artifacts in the render, try tricubic
    before re-simulating) with one dim sky dome from above (bp9ydYUCmx8 [00:02:03]), then one
    labelled sheet via mx_review.contact_sheet. Creates nodes in namespace mxFxVol and deletes
    them. aiVolume and aiStandardVolume attribute names are [verify]; the render call follows
    mx_review (arnoldRender -b, [verify])."""
    cmds, mel, mr = _cmds(), _mel(), _review()
    ensure_plugin("mtoa")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    ns = "mxFxVol"
    if cmds.namespace(exists=":" + ns):
        cmds.namespace(removeNamespace=":" + ns, deleteNamespaceContent=True)
    cmds.namespace(add=ns)
    prev_ns = cmds.namespaceInfo(currentNamespace=True, absoluteName=True)
    rest = mr._Restorer()           # the scenario-maya-expert render-settings restorer (shared, not duplicated)
    tiles, notes = [], []
    try:
        cmds.namespace(set=":" + ns)
        vol = cmds.createNode("aiVolume", name="vol")
        vxf = cmds.listRelatives(vol, parent=True, fullPath=True)[0]
        shader = cmds.shadingNode("aiStandardVolume", asShader=True, name="volShader")
        sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name="volSG")
        cmds.connectAttr(shader + ".outColor", sg + ".volumeShader", force=True)     # [verify plug]
        cmds.sets(vol, e=True, forceElement=sg)
        set_attrs(shader, {"density": density, "densityChannel": grids.split()[0]})   # [verify]
        try:
            set_attrs(shader, {"interpolation": interpolation})
        except Exception as exc:
            notes.append("interpolation not set: %s" % exc)
        dome = cmds.shadingNode("aiSkyDomeLight", asLight=True, name="dome")
        dshape = cmds.listRelatives(dome, shapes=True, fullPath=True)[0]
        cmds.setAttr(dshape + ".intensity", 0.5)
        cam, cam_shape = cmds.camera(name="cam")
        cmds.namespace(set=prev_ns or ":")
        R = rest.set
        R("defaultRenderGlobals.currentRenderer", "arnold", "string")
        R("defaultRenderGlobals.imageFormat", 32)
        R("defaultResolution.width", resolution)
        R("defaultResolution.height", resolution)
        R("defaultArnoldDriver.ai_translator", "png", "string")
        for c in cmds.ls(type="camera", long=True) or []:
            if c != cmds.ls(cam_shape, long=True)[0]:
                R(c + ".renderable", 0)
        cmds.setAttr(cam_shape + ".renderable", 1)
        for f in frames:
            path = expand_pattern(vdb_pattern, f)
            cmds.setAttr(vol + ".filename", path, type="string")                   # [verify]
            cmds.setAttr(vol + ".grids", grids, type="string")                     # [verify]
            cmds.currentTime(f, update=True)
            bb = cmds.exactWorldBoundingBox(vxf)                                   # UI units
            lo, hi = bb[:3], bb[3:]
            center = [(lo[k] + hi[k]) / 2.0 for k in range(3)]
            corners = [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
            fr = mr.frame(corners, center, view, True, 1.2)
            d = mr._norm(view)
            cmds.xform(cam, worldSpace=True, translation=[center[k] + d[k] * fr["distance"] for k in range(3)],
                       rotation=mr.aim_rotation(view))
            prefix = os.path.join(out_dir, "_raw", "vol_%04d" % f)
            os.makedirs(os.path.dirname(prefix), exist_ok=True)
            R("defaultRenderGlobals.imageFilePrefix", prefix, "string")
            t0 = time.time()
            mel.eval("arnoldRender -b;")                                           # [verify]
            found = sorted((p for p in glob.glob(prefix + "*.png") if os.path.getmtime(p) >= t0 - 1),
                           key=os.path.getmtime)
            tiles.append(("frame %d" % f, found[-1] if found else None))
    finally:
        rest.restore()
        cmds.namespace(set=prev_ns or ":")
        if cmds.namespace(exists=":" + ns):
            cmds.namespace(removeNamespace=":" + ns, deleteNamespaceContent=True)
    cells = []
    tile = min(256, resolution)
    for label, p in tiles:
        if not p:
            cells.append((label + " (missing)", None))
            continue
        w, h, rgba = mr.read_rgba(p)
        cells.append((label, mr.downsample(w, h, mr.rgba_to_rgb(rgba), tile, tile)))
    sheet, size = mr.contact_sheet(cells, min(6, len(cells)), tile, tile, os.path.join(out_dir, "volume_sheet.png"))
    return {"sheet": sheet, "tiles": tiles, "notes": notes}


# ---- MASH --------------------------------------------------------------------------------------
def mash_network(sources, name="fxMASH", geometry="Repro"):
    """MASH > Create MASH Network through the plug-in's Python API (MASH.api is not in any
    source: [added] [verify]). geometry "Repro" (the documented default and the author's
    advice: start with Repro, switch to Instancer for speed, GzXUcjz-M4E [00:00:33]) or
    "Instancer". Returns the api object and node names found on it."""
    ensure_plugin("MASH")
    import MASH.api as mapi                                                     # [verify]
    with _Selection(list(sources)):
        net = mapi.Network()
        net.createNetwork(name=name, geometry=geometry)                         # [verify signature]
    info = {"api": net}
    for k in ("waiter", "distribute", "instancer", "repro"):
        v = getattr(net, k, None)
        info[k] = getattr(v, "name", v) if v is not None else None
    return info


def mash_nodes(waiter):
    """MASH nodes of a network: history and future of the Waiter filtered on MASH_ types
    (and Maya's instancer)."""
    cmds = _cmds()
    nodes = set()
    for fut in (False, True):
        for n in cmds.listHistory(waiter, future=fut) or []:
            t = cmds.nodeType(n)
            if t.startswith("MASH_") or t == "instancer":
                nodes.add(n)
    nodes.add(waiter)
    return sorted(nodes)


def mash_inventory(waiter):
    """Rows for mash_cache_reasons(): type plus the attributes that make a network a
    simulation (names [verify]: simulatedTime, useVelocity, timeScale, mode on Falloff)."""
    cmds = _cmds()
    rows = []
    for n in mash_nodes(waiter):
        t = cmds.nodeType(n)
        a = {}
        for key in ("simulatedTime", "useVelocity", "enable"):
            if cmds.attributeQuery(key, node=n, exists=True):
                a[key] = cmds.getAttr(n + "." + key)
        if cmds.attributeQuery("timeScale", node=n, exists=True):
            a["timeScale_keyed"] = bool(cmds.listConnections(n + ".timeScale", source=True,
                                                             destination=False, type="animCurve"))
        if t == "MASH_Falloff" and cmds.attributeQuery("mode", node=n, exists=True):
            a["mode_label"] = cmds.getAttr(n + ".mode", asString=True)
        if t == "MASH_Python":
            user = cmds.listAttr(n, userDefined=True) or []
            a["state_attrs"] = [u for u in user if cmds.getAttr(n + "." + u, type=True) == "string"]
        rows.append({"name": n, "type": t, "attrs": a})
    return rows


def mash_output_mesh(waiter):
    """The Repro network's output mesh (an ordinary Maya mesh, Waters Jv_rgrcd3C0 [00:00:35])."""
    cmds = _cmds()
    for r in [n for n in mash_nodes(waiter) if cmds.nodeType(n) == "MASH_Repro"]:
        m = cmds.listConnections(r, type="mesh", shapes=True, destination=True, source=False) or []
        if m:
            return cmds.ls(m[0], long=True)[0]
    return None


MASH_PYTHON_TEMPLATE = '''import openMASH
import maya.cmds as cmds
md = openMASH.MASHData(thisNode)
count = md.count()
frame = md.getFrame()
amp = cmds.getAttr(thisNode + ".py_amp") if cmds.attributeQuery("py_amp", node=thisNode, exists=True) else 1.0
for i in range(count):
    md.outPosition[i].y = md.position[i].y + amp
md.setData()
'''   # boilerplate as Waters describes it (ij5ke9ftyH8 [00:01:33], [00:14:25]); openMASH name [verify]


def mash_set_python(py_node, code=MASH_PYTHON_TEMPLATE):
    """Write the script of a MASH Python node (attribute found by name pattern [verify])."""
    cmds = _cmds()
    cands = [a for a in (cmds.listAttr(py_node, string="*cript*") or [])
             if cmds.getAttr(py_node + "." + a, type=True) == "string"]
    if not cands:
        raise RuntimeError("no script string attribute on %s" % py_node)
    compile(code, "mash_python", "exec")            # Python 3 syntax check before Maya runs it
    cmds.setAttr(py_node + "." + cands[0], code, type="string")
    return cands[0]


# ---- USD for Unreal (pxr) ----------------------------------------------------------------------
def usd_check_unreal(path, up_axis="Z", meters_per_unit=None):
    """Jason's Unreal checklist (QMx97b19oHk): up axis Z, meters per unit set, frames per second
    set explicitly (else Unreal is unstable), default prim, triangulated meshes, unique prim
    names, no primvars:normals (renders slightly wrong), no Points or BasisCurves (Unreal
    dropped them in 2023, re-check on current Unreal). pxr API [verify in mayapy]."""
    from pxr import Usd, UsdGeom
    stage = Usd.Stage.Open(path)
    probs, names = [], {}
    if UsdGeom.GetStageUpAxis(stage) != up_axis:
        probs.append("error: up axis %s, Unreal wants %s" % (UsdGeom.GetStageUpAxis(stage), up_axis))
    if not stage.HasAuthoredMetadata("metersPerUnit"):
        probs.append("error: metersPerUnit not authored")
    elif meters_per_unit is not None and abs(UsdGeom.GetStageMetersPerUnit(stage) - meters_per_unit) > 1e-9:
        probs.append("error: metersPerUnit %s, expected %s" % (UsdGeom.GetStageMetersPerUnit(stage), meters_per_unit))
    if not stage.HasAuthoredMetadata("framesPerSecond"):
        probs.append("error: framesPerSecond not authored")
    if not stage.GetDefaultPrim():
        probs.append("error: no default prim")
    for prim in stage.Traverse():
        names[prim.GetName()] = names.get(prim.GetName(), 0) + 1
        if prim.IsA(UsdGeom.Mesh):
            m = UsdGeom.Mesh(prim)
            counts = m.GetFaceVertexCountsAttr().Get() or []
            if any(c != 3 for c in counts):
                probs.append("error: %s not triangulated" % prim.GetPath())
            pv = UsdGeom.PrimvarsAPI(prim).GetPrimvar("normals")
            if pv and pv.IsDefined():
                probs.append("warn: %s has primvars:normals (usd_fix_normals)" % prim.GetPath())
        if prim.IsA(UsdGeom.Points) or prim.IsA(UsdGeom.BasisCurves):
            probs.append("warn: %s is %s: convert to a mesh for Unreal" % (prim.GetPath(), prim.GetTypeName()))
    dups = sorted(n for n, c in names.items() if c > 1)
    if dups:
        probs.append("warn: duplicate prim names %s" % dups[:10])
    return probs


def usd_fix_normals(path, out_path=None):
    """Jason's text fix (rename primvars:normals to normals, QMx97b19oHk [00:29:40]) done with
    the API: copy the primvar (flattened, per time sample) into the mesh normals attribute
    with the same interpolation, then remove the primvar [added; verify Unreal reads it]."""
    from pxr import Usd, UsdGeom
    stage = Usd.Stage.Open(path)
    fixed = []
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        api = UsdGeom.PrimvarsAPI(prim)
        pv = api.GetPrimvar("normals")
        if not (pv and pv.IsDefined()):
            continue
        mesh = UsdGeom.Mesh(prim)
        attr = mesh.GetNormalsAttr() or mesh.CreateNormalsAttr()
        times = pv.GetAttr().GetTimeSamples()
        if times:
            for t in times:
                attr.Set(pv.ComputeFlattened(t), t)
        else:
            attr.Set(pv.ComputeFlattened())
        mesh.SetNormalsInterpolation(pv.GetInterpolation())
        api.RemovePrimvar("normals")
        fixed.append(str(prim.GetPath()))
    if out_path:
        stage.GetRootLayer().Export(out_path)
    else:
        stage.GetRootLayer().Save()
    return fixed


def usd_set_stage_metadata(path, up_axis="Z", meters_per_unit=0.01, fps=24.0):
    """Author the metadata Jason insists on (QMx97b19oHk [00:11:25], [00:16:50])."""
    from pxr import Usd, UsdGeom
    stage = Usd.Stage.Open(path)
    UsdGeom.SetStageUpAxis(stage, up_axis)
    UsdGeom.SetStageMetersPerUnit(stage, meters_per_unit)
    stage.SetFramesPerSecond(fps)
    stage.SetTimeCodesPerSecond(fps)
    stage.GetRootLayer().Save()
    return {"up": up_axis, "mpu": meters_per_unit, "fps": fps}


def to_json(obj, path):
    """Write a report (tuples and OpenMaya arrays become lists)."""
    def _default(o):
        try:
            return list(o)
        except TypeError:
            return repr(o)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, default=_default)
    return path
