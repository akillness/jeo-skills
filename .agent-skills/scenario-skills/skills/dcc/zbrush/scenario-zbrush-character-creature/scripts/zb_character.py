"""
zb_character: toolkit of the scenario-zbrush-character-creature skill (realistic heads, figures,
creatures, skin and scale detail, cloth folds, FiberMesh fur, horns).

It builds on the scenario-zbrush-expert toolkit and never re-implements it: strokes are encoded with
zb_stroke.encode, palette items are resolved and read back with zb_ops.resolve / set_checked /
press / stats, meshes are read with zb_audit.load_obj, views come from zb_stroke.Camera.

Three layers in one file:
  1. Pure Python, both sides (no numpy): stroke plans that feed zb_stroke.encode.
     jittered_lattice, poisson_disk, scale_borders, dragrect_stamps, dragdot_stamps, spray_loop,
     constant_field / radial_field / tangential_field, connect_the_dots, taper_segments,
     fold planner (fold_type_for, drop_folds, diaper_folds, x_folds, y_fold, snap_free_ends,
     free_endpoints, evenness), horn_path, mirror_points, crack_tree, MoveBudget, subdiv_plan,
     stack_check, map_request_check, head_canon, head_ratio_check, eye_report, split_ratio,
     scapula_check, view_facing, aim_at.
  2. Inside ZBrush (run through `call()`): checked wrappers for layers, morph targets, masks by
     cavity / smoothness / peaks / AO / fibers, masked deformation, stroke types, alphas,
     auto-masking by polygroups, stamping, Surface Noise, GrabDoc alphas, Dynamics, Mesh
     Extract, FiberMesh, curves (horns, cards), eye spheres, brush_check. Every item path comes from a
     candidate list checked with exists(), because set() on a missing path is silent.
  3. Agent side (numpy, PIL): OBJ measurements (load_groups, marker_centroids, front_profile,
     front_section, profile_landmarks, fits, face_report, mirror_deviation, asymmetry_report,
     region_on_canvas, spike_report), alpha files (alpha_check, dots_check, recenter_alpha,
     clean_corners, scale_height_tile, save_alpha16, alpha_library_dir), review images
     (thumbnail, upside_down, blurred, detail_survival).

Evidence tags in comments: [macro] used by a shipped 2026.2.1 macro, [doc] Maxon docs,
[bridge] proven through the bridge (tests/code/zbrush-expert v01-v03), [verify] not confirmed.
NOTHING in layer 2 has run in ZBrush yet: see tests/code/zbrush-character-creature/live_c*.
Numbers attributed to experts carry their source; every threshold marked [added] is this
toolkit's own default and must be calibrated (see the skill's references/critique.md).

Calling a ZBrush-side function from the agent:
    import sys; sys.path.insert(0, "<skills>/scenario-zbrush-character-creature/scripts")
    import zb_character as zc
    zc.call("layer_new")                      # through zb_launch.run, main thread
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import glob
import importlib
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
INSTALL = "/Applications/Maxon ZBrush 2026"


def _import_expert(name):
    """Import a scenario-zbrush-expert toolkit module without leaving its folder on sys.path (the
    shared-interpreter rule of the Maxon SDK style guide, as in zb_launch's prelude)."""
    try:
        return importlib.import_module(name)
    except ImportError:
        sys.path.insert(0, EXPERT_SCRIPTS)
        try:
            return importlib.import_module(name)
        finally:
            sys.path.remove(EXPERT_SCRIPTS)


zb_stroke = _import_expert("zb_stroke")
zb_ops = _import_expert("zb_ops")


class ZBCharError(RuntimeError):
    pass


# ============================================================================================
# 1. Pure Python plans (both sides)
# ============================================================================================

def _rot2(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def _unit2(v):
    n = math.hypot(v[0], v[1])
    return (v[0] / n, v[1] / n) if n > 1e-12 else (1.0, 0.0)


def point_in_polygon(p, poly):
    """Even-odd rule; poly is a list of (x, y)."""
    x, y = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xc = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xc > x:
                inside = not inside
    return inside


def _inside_fn(inside):
    if inside is None:
        return lambda p: True
    if callable(inside):
        return inside
    return lambda p: point_in_polygon(p, inside)


def jittered_lattice(width, height, spacing, angle_deg=45.0, jitter=0.2, seed=0, origin=(0.0, 0.0),
                     stagger=True, inside=None):
    """Scale or pore centres on a rotated, staggered lattice, jittered by jitter x spacing.

    Henning Sanden (TuRIf92oMCY 00:03:20-00:04:25): a scale tile has a clear directionality
    (diagonal, crisscrossing flow) and fairly uniform sizes so it stays generic and does not
    tile visibly. angle_deg is the flow direction in canvas or tile space; `inside` is an
    optional polygon or predicate. Returns (x, y) points.
    """
    rng = random.Random(seed)
    row = spacing * (math.sqrt(3.0) / 2.0 if stagger else 1.0)
    reach = math.hypot(width, height)
    cx, cy = origin[0] + width / 2.0, origin[1] + height / 2.0
    keep = _inside_fn(inside)
    out = []
    nr = int(reach / row) + 2
    nc = int(reach / spacing) + 2
    for r in range(-nr, nr + 1):
        off = spacing / 2.0 if (stagger and r % 2) else 0.0
        for c in range(-nc, nc + 1):
            u, v = c * spacing + off, r * row
            x, y = _rot2((u, v), angle_deg)
            x += cx + rng.uniform(-jitter, jitter) * spacing
            y += cy + rng.uniform(-jitter, jitter) * spacing
            if origin[0] <= x <= origin[0] + width and origin[1] <= y <= origin[1] + height \
                    and keep((x, y)):
                out.append((x, y))
    return out


def poisson_disk(width, height, radius, seed=0, k=30, origin=(0.0, 0.0), inside=None, limit=200000):
    """Bridson Poisson-disk samples at least `radius` apart inside the rectangle (and the
    optional polygon or predicate). Used for pore and blemish layouts with one radius band per
    zone (Costa Lfen-BSwWcE 00:39:01: keep one stamp size per zone) [added method]."""
    rng = random.Random(seed)
    keep = _inside_fn(inside)
    cell = radius / math.sqrt(2.0)
    gw, gh = int(width / cell) + 1, int(height / cell) + 1
    grid = {}
    pts, active = [], []

    def fits(p):
        gx, gy = int((p[0] - origin[0]) / cell), int((p[1] - origin[1]) / cell)
        for i in range(max(0, gx - 2), min(gw, gx + 3)):
            for j in range(max(0, gy - 2), min(gh, gy + 3)):
                q = grid.get((i, j))
                if q is not None and math.dist(p, q) < radius:
                    return False
        return True

    def add(p):
        grid[(int((p[0] - origin[0]) / cell), int((p[1] - origin[1]) / cell))] = p
        pts.append(p)
        active.append(p)

    for _ in range(200):
        p = (origin[0] + rng.uniform(0, width), origin[1] + rng.uniform(0, height))
        if keep(p):
            add(p)
            break
    while active and len(pts) < limit:
        i = rng.randrange(len(active))
        base = active[i]
        for _ in range(k):
            a = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(radius, 2 * radius)
            p = (base[0] + d * math.cos(a), base[1] + d * math.sin(a))
            if origin[0] <= p[0] < origin[0] + width and origin[1] <= p[1] < origin[1] + height \
                    and keep(p) and fits(p):
                add(p)
                break
        else:
            active.pop(i)
    return pts


def dragrect_stamps(centers, size_px, base_angle_deg=0.0, alternate=True, angle_jitter_deg=35.0,
                    size_jitter=0.0, seed=0):
    """Two-point strokes for a DragRect stamp per centre: start at the centre, end at
    size_px along a direction. Costa (Lfen-BSwWcE 00:38:27-00:39:01): alternate the drag
    direction (top to bottom, then left to right) and drag on a diagonal so each stamp is
    rotated; keep one size per zone (size_jitter 0 by default). That DragRect maps the drag
    length to the stamp size and the drag direction to its rotation is [verify live_c02]."""
    rng = random.Random(seed)
    out = []
    for i, c in enumerate(centers):
        a = base_angle_deg + (90.0 if (alternate and i % 2) else 0.0)
        a += rng.uniform(-angle_jitter_deg, angle_jitter_deg)
        s = size_px * (1.0 + rng.uniform(-size_jitter, size_jitter))
        d = _rot2((s, 0.0), a)
        out.append([(float(c[0]), float(c[1])), (float(c[0]) + d[0], float(c[1]) + d[1])])
    return out


def scale_borders(centers, spacing, length_frac=0.55, reach=1.35):
    """Short separating strokes between neighbouring scale centres: each crosses the midpoint
    of a neighbour link, perpendicular to it (a Voronoi-like border set), for Dam_Standard on
    the tile. Henning (TuRIf92oMCY 00:06:36-00:08:16): each scale individual but part of a
    whole, broken lines of varying weight; vary Draw Size per stroke for line weight [added
    geometry]. Returns two-point strokes."""
    cell = spacing * reach
    grid = {}
    for i, p in enumerate(centers):
        grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(i)
    out = []
    half = spacing * length_frac / 2.0
    for i, p in enumerate(centers):
        gx, gy = int(p[0] // cell), int(p[1] // cell)
        for a in (gx - 1, gx, gx + 1):
            for b in (gy - 1, gy, gy + 1):
                for j in grid.get((a, b), ()):
                    if j <= i:
                        continue
                    q = centers[j]
                    d = math.dist(p, q)
                    if d == 0 or d > cell:
                        continue
                    m = ((p[0] + q[0]) / 2.0, (p[1] + q[1]) / 2.0)
                    n = (-(q[1] - p[1]) / d, (q[0] - p[0]) / d)
                    out.append([(m[0] - n[0] * half, m[1] - n[1] * half),
                                (m[0] + n[0] * half, m[1] + n[1] * half)])
    return out


def dragdot_stamps(centers, repeats=2):
    """One repeated-point stroke per centre (DragDot places the alpha where it lands: J Hill
    places clogged pores one by one this way, HlHoIGE2Ocs 00:22:50-00:23:54). Uses
    zb_stroke.dab; how many repeats sculpt best is [verify live_c02]."""
    return [zb_stroke.dab(c, repeats) for c in centers]


def spray_loop(center, radius, turns=3.0, spacing=3.0, wobble=0.15, seed=0):
    """A small outward spiral for a Spray stroke. Costa (Lfen-BSwWcE 00:42:21-00:42:54): low
    intensity Spray in small circles, "try not to go over the same area too often"; an
    Archimedean spiral never revisits a point [added shape]."""
    rng = random.Random(seed)
    pts = []
    total = 2 * math.pi * turns
    t = 0.0
    while t <= total:
        r = radius * t / total
        rr = r * (1.0 + rng.uniform(-wobble, wobble))
        pts.append((center[0] + rr * math.cos(t), center[1] + rr * math.sin(t)))
        step = spacing / max(r, spacing)          # about `spacing` px of arc per sample
        t += min(step, 0.8)
    return pts


def constant_field(angle_deg):
    """Direction field: the same direction everywhere (forehead lines are horizontal: Costa
    j5XLtLMN0P8 00:42:33)."""
    d = _rot2((1.0, 0.0), angle_deg)
    return lambda p: d


def radial_field(center):
    """Direction field pointing away from a centre (lines perpendicular to a circular muscle,
    such as the orbicularis oris: Costa Lfen-BSwWcE 00:46:18; crow's feet from the outer eye
    corner) [added reading of the rule]."""
    return lambda p: _unit2((p[0] - center[0], p[1] - center[1]))


def tangential_field(center):
    """Direction field around a centre (fine lid wrinkles "circular around the eyes": J Hill
    HlHoIGE2Ocs 00:17:38-00:18:10)."""
    return lambda p: _unit2((-(p[1] - center[1]), p[0] - center[0]))


def connect_the_dots(points, field, max_link, max_turn_deg=30.0, chain=(2, 4), seed=0):
    """Wrinkles built by connecting neighbouring pores along a direction field, as short
    chains of short segments, never one long line (Costa Lfen-BSwWcE 00:46:18-00:47:26).
    Returns {"chains": [[p, ...]], "segments": [[p, q]]}: play each segment as its own stroke.
    A point is used by one chain at most."""
    rng = random.Random(seed)
    cell = float(max_link)
    grid = {}
    for i, p in enumerate(points):
        grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(i)
    used = set()
    cos_max = math.cos(math.radians(max_turn_deg))
    order = list(range(len(points)))
    rng.shuffle(order)
    chains = []

    def neighbours(i):
        p = points[i]
        gx, gy = int(p[0] // cell), int(p[1] // cell)
        for a in (gx - 1, gx, gx + 1):
            for b in (gy - 1, gy, gy + 1):
                for j in grid.get((a, b), ()):
                    if j != i:
                        yield j

    for start in order:
        if start in used:
            continue
        want = rng.randint(chain[0], chain[1])
        cur, path = start, [start]
        sign = None
        while len(path) - 1 < want:
            d = field(points[cur])
            best, best_d = None, None
            for j in neighbours(cur):
                if j in used or j in path:
                    continue
                v = (points[j][0] - points[cur][0], points[j][1] - points[cur][1])
                dist = math.hypot(*v)
                if dist == 0 or dist > max_link:
                    continue
                c = (v[0] * d[0] + v[1] * d[1]) / dist
                s = 1 if c >= 0 else -1
                if abs(c) < cos_max or (sign is not None and s != sign):
                    continue
                if best_d is None or dist < best_d:
                    best, best_d, best_s = j, dist, s
            if best is None:
                break
            sign = best_s
            path.append(best)
            cur = best
        if len(path) >= 2:
            used.update(path)
            chains.append([tuple(points[k]) for k in path])
    segments = [[c[i], c[i + 1]] for c in chains for i in range(len(c) - 1)]
    return {"chains": chains, "segments": segments}


def taper_segments(points, n=3, size=(24.0, 8.0), z=(30.0, 10.0), overlap=1):
    """Split a path into n consecutive pieces with decreasing Draw Size and Z Intensity: the
    substitute for pen-pressure taper, which the proven V02 stroke format cannot carry
    (scenario-zbrush-expert, zb_stroke PRESSURE_TOKEN). Returns [(points, draw_size, z_intensity)]."""
    pts = list(points)
    if len(pts) < 2 or n <= 1:
        return [(pts, size[0], z[0])]
    out = []
    step = (len(pts) - 1) / float(n)
    for k in range(n):
        a = int(round(k * step))
        b = int(round((k + 1) * step)) + overlap
        piece = pts[a:min(b, len(pts) - 1) + 1]
        f = k / float(n - 1)
        if len(piece) >= 2:
            out.append((piece, size[0] + (size[1] - size[0]) * f, z[0] + (z[1] - z[0]) * f))
    return out


# --------------------------------------------------------------------------------------------
# Cloth fold planner (Rafael Grassetti, gNx4v0WVVHo)
# --------------------------------------------------------------------------------------------

# Tightness picks the fold type (Grassetti 00:04:26, 00:05:30-00:06:36, 00:10:31).
FOLD_TYPES = {"loose": "drop", "two_point": "diaper", "tight": "x", "split": "y", "joint": "rolls"}


def fold_type_for(tightness):
    if tightness not in FOLD_TYPES:
        raise ValueError(f"tightness must be one of {sorted(FOLD_TYPES)}")
    return FOLD_TYPES[tightness]


def _polyline_pts(p0, p1, n):
    return [(p0[0] + (p1[0] - p0[0]) * i / (n - 1), p0[1] + (p1[1] - p0[1]) * i / (n - 1))
            for i in range(n)]


def drop_folds(pin, count=5, length=300.0, spread_deg=40.0, gravity=(0.0, 1.0), weight=(1.0, 0.35),
               start_offset=0.08, samples=12, seed=0):
    """Drop (curtain) folds: cones fanning down from one tension point, heavier near the pin
    and relaxing away from it (Grassetti 00:00:31-00:03:41). Each fold carries per-point
    weights from weight[0] at the pin end to weight[1] at the far end, for taper_segments.
    Lengths and angles are jittered so the family is never even [added numbers]."""
    rng = random.Random(seed)
    g = _unit2(gravity)
    out = []
    for i in range(count):
        f = 0.0 if count == 1 else i / float(count - 1)
        ang = -spread_deg / 2.0 + spread_deg * f + rng.uniform(-0.15, 0.15) * spread_deg / max(count, 1)
        d = _rot2(g, ang)
        ln = length * rng.uniform(0.75, 1.0)
        s0 = (pin[0] + d[0] * length * start_offset, pin[1] + d[1] * length * start_offset)
        p1 = (pin[0] + d[0] * ln, pin[1] + d[1] * ln)
        path = _polyline_pts(s0, p1, samples)
        w = [weight[0] + (weight[1] - weight[0]) * k / (samples - 1) for k in range(samples)]
        out.append({"type": "drop", "path": path, "weight": w, "anchors": [tuple(pin)],
                    "anchor_tol": length * start_offset * 1.5})
    return out


def diaper_folds(pin_a, pin_b, count=4, sag=60.0, spacing=35.0, growth=1.3, gravity=(0.0, 1.0),
                 samples=16, weight=(1.0, 0.5)):
    """Diaper (zigzag) folds between two tension points: nested sags whose ends terminate on
    the previous sag, spacing growing downward (Grassetti 00:02:04-00:03:41). The first sag
    hangs from the pins; a parabola stands in for the catenary [added]."""
    g = _unit2(gravity)
    out = []
    prev = None
    depth = 0.0
    for k in range(count):
        depth += sag if k == 0 else spacing * (growth ** (k - 1))
        if prev is None:
            a, b = tuple(pin_a), tuple(pin_b)
        else:
            a, b = prev[1], prev[-2]            # ends sit on the sag above (termination)
        path = []
        for i in range(samples):
            t = i / float(samples - 1)
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            s = depth * 4.0 * t * (1.0 - t)
            path.append((x + g[0] * s, y + g[1] * s))
        w = [weight[0] + (weight[1] - weight[0]) * k / max(count - 1, 1)] * samples
        out.append({"type": "diaper", "path": path, "weight": w,
                    "anchors": [tuple(pin_a), tuple(pin_b)] if prev is None else []})
        prev = path
    return out


def x_folds(center, width, height, pairs=2, spread=0.6, samples=10):
    """X folds on a tight, compressed band: pairs of wide crossing diagonals whose ends run
    to the band edges (Grassetti 00:04:26-00:05:30). Build them as raised ridges first (Clay
    Z 80), then push the valleys in (Standard), per his frames."""
    out = []
    for k in range(pairs):
        dx = width / 2.0 * (1.0 - 0.25 * k)
        dy = height / 2.0
        cx = center[0] + (k - (pairs - 1) / 2.0) * width * spread / max(pairs, 1)
        for sgn in (1, -1):
            p0 = (cx - dx, center[1] - sgn * dy)
            p1 = (cx + dx, center[1] + sgn * dy)
            out.append({"type": "x", "path": _polyline_pts(p0, p1, samples),
                        "weight": [1.0] * samples, "anchors": []})
    return out


def y_fold(start, direction, length=200.0, fork_at=0.5, split_deg=28.0, samples=8):
    """A Y fold: one stem splitting off a tension line (Grassetti 00:06:36, 00:09:16)."""
    d = _unit2(direction)
    fork = (start[0] + d[0] * length * fork_at, start[1] + d[1] * length * fork_at)
    stem = _polyline_pts(start, fork, samples)
    out = [{"type": "y", "path": stem, "weight": [1.0] * samples, "anchors": [tuple(start)]}]
    rest = length * (1.0 - fork_at)
    for sgn in (1, -1):
        b = _rot2(d, sgn * split_deg)
        end = (fork[0] + b[0] * rest, fork[1] + b[1] * rest)
        out.append({"type": "y", "path": _polyline_pts(fork, end, samples),
                    "weight": [0.8] * samples, "anchors": []})
    return out


def _near_path(p, path, tol):
    for q in path:
        if math.dist(p, q) <= tol:
            return True
    for a, b in zip(path, path[1:]):
        ab = (b[0] - a[0], b[1] - a[1])
        L2 = ab[0] ** 2 + ab[1] ** 2
        if L2 == 0:
            continue
        t = max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2))
        c = (a[0] + ab[0] * t, a[1] + ab[1] * t)
        if math.dist(p, c) <= tol:
            return True
    return False


def free_endpoints(folds, border=None, tol=6.0, pins=()):
    """Fold ends that terminate by themselves: not on a pin, another fold, or the border
    rectangle (x0, y0, x1, y1). Grassetti's rule (00:02:35): a fold never ends alone. Target
    zero. Returns [(fold_index, 'start'|'end', point)]."""
    shared = [tuple(p) for p in pins]
    for f in folds:
        shared += [tuple(a) for a in f.get("anchors", [])]
    out = []
    for i, f in enumerate(folds):
        own = [tuple(a) for a in f.get("anchors", [])]
        own_tol = max(tol, float(f.get("anchor_tol", 0.0)))
        for tag, p in (("start", f["path"][0]), ("end", f["path"][-1])):
            if any(math.dist(p, a) <= own_tol for a in own):
                continue
            if any(math.dist(p, a) <= tol for a in shared):
                continue
            if border is not None:
                x0, y0, x1, y1 = border
                if min(abs(p[0] - x0), abs(p[0] - x1), abs(p[1] - y0), abs(p[1] - y1)) <= tol:
                    continue
            if any(j != i and _near_path(p, g["path"], tol) for j, g in enumerate(folds)):
                continue
            out.append((i, tag, p))
    return out


def snap_free_ends(folds, border=None, tol=6.0, reach=80.0, pins=()):
    """Extend each free end to the nearest point of another fold (or the border) within
    `reach`, so every fold terminates into a neighbour or an edge (Grassetti 00:02:35).
    Returns (folds, still_free)."""
    for i, tag, p in free_endpoints(folds, border, tol, pins):
        best, best_d = None, None
        for j, g in enumerate(folds):
            if j == i:
                continue
            for q in g["path"]:
                d = math.dist(p, q)
                if best_d is None or d < best_d:
                    best, best_d = q, d
        if border is not None:
            x0, y0, x1, y1 = border
            for q in ((x0, p[1]), (x1, p[1]), (p[0], y0), (p[0], y1)):
                d = math.dist(p, q)
                if best_d is None or d < best_d:
                    best, best_d = q, d
        if best is not None and best_d <= reach:
            path = folds[i]["path"]
            w = folds[i]["weight"]
            if tag == "end":
                path.append(tuple(best))
                w.append(w[-1])
            else:
                path.insert(0, tuple(best))
                w.insert(0, w[0])
    return folds, free_endpoints(folds, border, tol, pins)


def evenness(values):
    """Coefficient of variation (std / mean) of fold spacings, lengths or depths. Grassetti
    (00:03:08): folds are never even; a value near 0 means a mechanical family [added]."""
    vals = [float(v) for v in values]
    if len(vals) < 2:
        return None
    m = sum(vals) / len(vals)
    if m == 0:
        return None
    var = sum((v - m) ** 2 for v in vals) / len(vals)
    return math.sqrt(var) / abs(m)


# --------------------------------------------------------------------------------------------
# Horns and curves (Pablo Munoz Gomez, TN9ARiC_82w)
# --------------------------------------------------------------------------------------------

def _v3(a):
    return [float(a[0]), float(a[1]), float(a[2])]


def _norm3(v):
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return [v[0] / n, v[1] / n, v[2] / n] if n > 1e-12 else [0.0, 0.0, 1.0]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _rodrigues(v, k, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    kv = _cross(k, v)
    kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]
    return [v[i] * c + kv[i] * s + k[i] * kd * (1 - c) for i in range(3)]


def horn_path(base, direction, length, curl_deg=90.0, twist_deg=0.0, bend_axis=None,
              radius=(0.15, 0.02), samples=8):
    """Centreline and radii for a horn in tool space, to push into a curve brush with the SDK
    curves API (new_curves, add_new_curve, add_curve_point, curves_to_ui: Maxon example
    add_curve_point.0.py). Pablo curves a straight, detailed horn with Bend Curve, where 5 or
    6 points are enough (00:26:48); the curve route uses curve Resolution 10 and a Size
    falloff that starts large (00:15:04-00:16:43). curl_deg bends the tangent progressively
    around bend_axis; twist_deg turns the bend axis along the length (a spiral horn)
    [added geometry]. Returns {"points", "radii", "length"}."""
    d = _norm3(_v3(direction))
    if bend_axis is None:
        up = [0.0, 1.0, 0.0] if abs(d[1]) < 0.9 else [1.0, 0.0, 0.0]
        bend_axis = _cross(d, up)
    k = _norm3(_v3(bend_axis))
    step = length / float(samples - 1)
    pts = [_v3(base)]
    t = d[:]
    for i in range(1, samples):
        kk = _rodrigues(k, t, twist_deg / (samples - 1) * i) if twist_deg else k
        t = _norm3(_rodrigues(t, _norm3(kk), curl_deg / (samples - 1)))
        p = pts[-1]
        pts.append([p[0] + t[0] * step, p[1] + t[1] * step, p[2] + t[2] * step])
    radii = [radius[0] + (radius[1] - radius[0]) * i / (samples - 1) for i in range(samples)]
    return {"points": pts, "radii": radii, "length": step * (samples - 1)}


def mirror_points(points, axis=0, center=0.0):
    """Mirror a path across a plane (the second horn of a pair)."""
    out = []
    for p in points:
        q = list(p)
        q[axis] = 2 * center - q[axis]
        out.append(q)
    return out


def crack_tree(start, direction, length, levels=3, branches=2, shrink=0.5, spread_deg=35.0,
               wobble_deg=12.0, samples=8, seed=0):
    """Staged cracks for tusks, spikes, horns, bone plates and dry skin, largest first.
    Starkie ("Drake"): main cracks first with Orb Cracks and Dam_Standard, main shapes split
    into secondary ones as you go, small Orb Cracks last. Orb brushes do not ship in 2026.2.1:
    play level 0 with Dam_Standard at full size, each later level smaller (Draw Size x
    size_frac), and review a raking render between levels. Geometry [added]: a jittered
    polyline per crack, `branches` children per crack starting ON the parent, each `shrink`
    times as long, turned up to spread_deg off the parent's tangent. On horns, detail the
    straight tube first and bend last (Pablo TN9ARiC_82w 00:23:04). Canvas coordinates.
    Returns [{"level", "path", "size_frac", "parent"}] in play order (level by level)."""
    rng = random.Random(seed)
    out = []

    def walk(p0, d, L):
        pts = [tuple(p0)]
        a = math.degrees(math.atan2(d[1], d[0]))
        step = L / float(samples - 1)
        for _ in range(1, samples):
            a += rng.uniform(-wobble_deg, wobble_deg)
            r = math.radians(a)
            p = pts[-1]
            pts.append((p[0] + step * math.cos(r), p[1] + step * math.sin(r)))
        return pts

    frontier = [(None, tuple(start), _unit2(direction), float(length))]
    for lev in range(levels):
        nxt = []
        for parent, p0, d, L in frontier:
            path = walk(p0, d, L)
            idx = len(out)
            out.append({"level": lev, "path": path, "size_frac": shrink ** lev, "parent": parent})
            if lev + 1 >= levels:
                continue
            for b in range(branches):
                k = min(max(int(round(rng.uniform(0.25, 0.8) * (samples - 1))), 1), samples - 2)
                tang = _unit2((path[k + 1][0] - path[k - 1][0], path[k + 1][1] - path[k - 1][1]))
                sgn = 1 if b % 2 == 0 else -1
                bd = _rot2(tang, sgn * rng.uniform(0.6, 1.0) * spread_deg)
                nxt.append((idx, path[k], bd, L * shrink))
        frontier = nxt
    return out


# --------------------------------------------------------------------------------------------
# Process discipline, budgets, canon numbers
# --------------------------------------------------------------------------------------------

class MoveBudget:
    """Stroke ledger per stage and region (Ryan Kingslien, 6wiDxO-ZADg 00:20:29-00:24:47): count
    moves, cut them (48 down to 13 for the head wedge; a 16-move target 00:28:04), and treat a
    second touch of the same region as a signal to go back and replan, not to add strokes
    ("I've touched the back of the head twice, that's not good", 00:21:01)."""

    def __init__(self, budgets=None, max_touches=1):
        self.budgets = dict(budgets or {})
        self.max_touches = int(max_touches)
        self.rows = []

    def log(self, stage, region, n=1, note=""):
        self.rows.append({"stage": stage, "region": region, "n": int(n), "note": note})
        return self.touches(stage, region)

    def touches(self, stage, region):
        return sum(1 for r in self.rows if r["stage"] == stage and r["region"] == region)

    def report(self, stage):
        rows = [r for r in self.rows if r["stage"] == stage]
        regions = {}
        for r in rows:
            regions[r["region"]] = regions.get(r["region"], 0) + 1
        strokes = sum(r["n"] for r in rows)
        budget = self.budgets.get(stage)
        return {"stage": stage, "strokes": strokes, "budget": budget,
                "over_budget": budget is not None and strokes > budget,
                "retouched": sorted(k for k, v in regions.items() if v > self.max_touches),
                "regions": regions}

    def to_json(self):
        return json.dumps({"budgets": self.budgets, "max_touches": self.max_touches,
                           "rows": self.rows})

    @classmethod
    def from_json(cls, text):
        d = json.loads(text)
        mb = cls(d.get("budgets"), d.get("max_touches", 1))
        mb.rows = d.get("rows", [])
        return mb


def subdiv_plan(base_faces, route="regular", max_faces=25.6e6, regular_top=(1.0e6, 2.0e6),
                hd_levels=3, smt_off_levels=0, max_regular_levels=4):
    """Subdivision stack for detail work. Faces multiply by 4 per level (Tool > Geometry >
    Divide doc; Pablo Logic Part 7). Choose the route BEFORE the first Divide and gate the plan
    with stack_check: a deep regular stack cannot take HD afterwards.

    route "hd" (computer-use agent only; Costa Lfen-BSwWcE 00:17:53-00:18:25; J Hill
    HlHoIGE2Ocs 00:13:22): 3 to 4 regular levels (at most max_regular_levels, top at most 1 to
    2 million), then 3 (Costa) or 3 to 4 (J Hill) DivideHD levels, because "you are not able to
    go below where you started" in HD and smoothing needs lower levels. Entering an HD region
    needs the A key over the cursor, which the SDK cannot send (press_key "does not work").
    route "regular" (SDK-only agent default [added]): Divide while faces stay under max_faces;
    J Hill stops game work at 20 to 40 million (SDiv 7 = 25.5M from a 6,240-face base); the
    finest micro detail then goes into a tiled map at render (Costa Lfen 01:10:58).
    smt_off_levels: first levels divided with Smt off to keep joints and knuckles crisp
    (Eaton Ale6SXXbJMM 00:32:36, about 6 levels and 1.7M for a full figure)."""
    if base_faces <= 0:
        raise ValueError("base_faces must be positive")
    levels = [{"level": 1, "faces": int(base_faces), "kind": "base", "smt": None}]
    n = float(base_faces)
    notes = []
    if route == "hd":
        while n < regular_top[0] and len(levels) < max_regular_levels:
            n *= 4
            levels.append({"level": len(levels) + 1, "faces": int(n), "kind": "regular",
                           "smt": len(levels) > smt_off_levels})
        if n < regular_top[0]:
            notes.append(f"regular top {int(n)} after {len(levels)} levels, under Costa's 1 to 2 "
                         "million: J Hill's split still holds (3 to 4 regular, 3 to 4 HD); "
                         "consider hd_levels=4")
        if n > regular_top[1]:
            notes.append(f"regular top {int(n)} is above {int(regular_top[1])}: Costa keeps the "
                         "regular stack at 1 to 2 million so 8K exports stay fast (00:18:58); "
                         "use a lighter base")
        for i in range(hd_levels):
            n *= 4
            levels.append({"level": len(levels) + 1, "faces": int(n), "kind": "hd", "smt": True})
        notes.append("HD levels: sculpt HD needs the A key over the mesh (computer use); store "
                     "the morph target again on every HD entry; layers do not survive leaving HD "
                     "(J Hill 00:13:54)")
    elif route == "regular":
        while n * 4 <= max_faces:
            n *= 4
            levels.append({"level": len(levels) + 1, "faces": int(n), "kind": "regular",
                           "smt": len(levels) > smt_off_levels})
    else:
        raise ValueError("route must be 'regular' or 'hd'")
    regular = [lv for lv in levels if lv["kind"] != "hd"]
    if len(regular) < 3:
        notes.append("fewer than 2 levels below the detail level: J Hill smooths at lower levels "
                     "(00:27:57); start from a denser base or a lower top")
    return {"route": route, "levels": levels, "top_faces": levels[-1]["faces"],
            "regular_top_faces": regular[-1]["faces"], "notes": notes}


HD_CEILING = 1.0e9   # HD Geometry doc: "divide your model to 1 billion polygons"


def stack_check(plan, computer_use=False):
    """Gate a subdivision plan (subdiv_plan output, or {"levels": [{"level", "faces", "kind"}]}
    with kind "base", "regular" or "hd") before the first Divide. The two branches:
      SDK only: regular levels to about 20 to 25M, no HD, micro detail in a tiled map.
      computer use: split from the start, 3 to 4 regular levels (top 1 to 2M) + 3 to 4 HD.
    Problems (J Hill HlHoIGE2Ocs 00:11:10, 00:13:22; Costa Lfen-BSwWcE 00:17:53, 00:18:58;
    HD doc): HD without a computer-use agent; 6 or more regular levels then HD; a regular top
    above 2M under HD; more than 1 billion faces; a regular-only top above 40M ("40 million
    is high"). Warnings: 5 regular levels before HD [added: between J Hill's 3 to 4 and his 6
    to 7], fewer than 3 HD levels, a regular top above 25.6M, fewer than 2 levels of smoothing
    room below the top (below the HD entry, levels do not count)."""
    levels = plan["levels"]
    reg = [lv for lv in levels if lv["kind"] != "hd"]
    hd = [lv for lv in levels if lv["kind"] == "hd"]
    top = int(levels[-1]["faces"])
    problems, warnings, notes = [], [], []
    if hd:
        route = "hd"
        if not computer_use:
            problems.append("HD levels without a computer-use agent: entering an HD region needs "
                            "the A key over the mesh and press_key does not work in the 2026 SDK; "
                            "plan the regular route and put micro detail in a tiled map")
        if len(reg) >= 6:
            problems.append(f"{len(reg)} regular levels then HD: J Hill splits 3 to 4 regular plus 3 "
                            "to 4 HD, never 6 or 7 regular then HD, because you cannot go below the "
                            "HD entry level and need lower levels to smooth (00:13:22)")
        elif len(reg) == 5:
            warnings.append("5 regular levels before HD [added]: lighter top preferred (J Hill 3 to 4)")
        if reg[-1]["faces"] > 2.0e6:
            problems.append(f"regular top {int(reg[-1]['faces'])} above 2M under HD: Costa keeps it "
                            "at 1 to 2 million so 8K map exports stay fast (00:17:53, 00:18:58)")
        if len(hd) < 3:
            warnings.append(f"{len(hd)} HD level(s): Costa uses 3, J Hill 3 to 4")
        room = len(hd) - 1
        notes.append("store the morph target on every HD entry; layers do not survive leaving HD "
                     "(J Hill 00:13:54)")
    else:
        route = "regular"
        if top > 40.0e6:
            problems.append(f"regular top {top} above 40M: J Hill calls 40 million high (00:11:10); "
                            "stop at about 20 to 25M and move micro detail into a tiled map")
        elif top > 25.6e6:
            warnings.append(f"regular top {top} above the 25.6M agent default [added]")
        room = len(reg) - 1
        notes.append("micro detail (finest pores, scale grain) as a tiled micro-displacement map at "
                     "render (Costa Lfen 01:10:58; J Hill 00:11:10)")
    if top > HD_CEILING:
        problems.append(f"{top} faces above the 1 billion HD Geometry ceiling (HD doc): each level "
                        "multiplies by 4, so 3 DivideHD over 16M is already 1 billion")
    if room < 2:
        warnings.append(f"{room} level(s) of smoothing room below the top: J Hill smooths at a lower "
                        "level (00:27:57)")
    return {"ok": not problems, "route": route, "computer_use": bool(computer_use),
            "regular_levels": len(reg), "hd_levels": len(hd), "top_faces": top,
            "problems": problems, "warnings": warnings, "notes": notes}


def map_request_check(req):
    """Gate the map request this skill hands to scenario-zbrush-retopology-export, which owns the Multi
    Map Exporter (rx.mme_set, rx.renderer_plan). req: {"top_level": int,
    "displacement": {"subdiv", "adaptive", "bits", "mid", "exr"}, "normal": {"subdiv",
    "adaptive"} or None, "renderer_zero": float, "merge_maps": bool, "udim": bool,
    "tile_format": "UDIM", "tile_dot": bool}. Rules:
      - Adaptive identical in normal and displacement maps meant to combine (HD doc
        "Adaptive"; MME doc);
      - every map's SubDiv level below the top: a map compares the chosen level with the
        highest one (AskZBrush 2zDAtaQqwh8 00:01:44; MME uses level 1 at or above the top);
        a normal from the level just below the top holds micro detail only (00:02:53);
      - 32-bit displacement with its Mid equal to the renderer's zero (Costa Mid 0 for Arnold;
        FlippedNormals Mid 0.5 with Scalar Zero Value 0.5); 16-bit: Mid 0.5 (MME doc);
      - EXR and Merge Maps do not combine: Merge Maps off, one object per UDIM tile
        (FlippedNormals -ThBTEc8L_M 00:04:43-00:05:41, 00:11:08; [verify on 2026]);
      - UDIMs: tile ID format UDIM with a dot before the tile number, so the files form an
        image sequence (00:06:36-00:07:09)."""
    problems, warnings = [], []
    top = req.get("top_level")
    disp, nrm = req.get("displacement") or {}, req.get("normal") or {}
    if disp and nrm and bool(disp.get("adaptive")) != bool(nrm.get("adaptive")):
        problems.append("Adaptive differs between the displacement and normal maps: set it the "
                        "same when they combine (HD doc)")
    for name, m in (("displacement", disp), ("normal", nrm)):
        if m and top is not None and m.get("subdiv") is not None and m["subdiv"] >= top:
            problems.append(f"{name} SubDiv level {m['subdiv']} at or above the top ({top}): the "
                            "map compares that level with the top, so it would hold nothing")
    if disp:
        bits = disp.get("bits", 32)
        mid = disp.get("mid")
        if mid is None:
            problems.append("displacement Mid not recorded: the renderer needs it as its zero")
        elif bits == 16 and abs(mid - 0.5) > 1e-6:
            problems.append(f"16-bit displacement with Mid {mid}: the MME doc gives 0.5 for 16-bit")
        zero = req.get("renderer_zero")
        if mid is not None and zero is not None and abs(mid - zero) > 1e-6:
            problems.append(f"Mid {mid} but the renderer zero is {zero}: set them equal")
        if disp.get("exr") and req.get("merge_maps"):
            problems.append("EXR with Merge Maps: Merge Maps writes TIFF; turn it off and give each "
                            "object its own UDIM tile (FlippedNormals 00:04:43)")
    if req.get("udim"):
        if str(req.get("tile_format", "")).upper() != "UDIM":
            problems.append("UDIM layout but the tile ID format is not UDIM (Mari numbering, 1001)")
        if not req.get("tile_dot"):
            warnings.append("no dot before the tile number: the files do not read as an image "
                            "sequence in Maya (FlippedNormals 00:06:36)")
    return {"ok": not problems, "problems": problems, "warnings": warnings}


# Anatomy For Sculptors head canon ("Adding detail"): crown to hairline 1/6 of the head height;
# the rest in three equal thirds (hairline-brow, brow-nose base, nose base-chin); the lower
# third split in three (nose-mouth, mouth-upper chin, chin); the eye line at 1/2.
def head_canon(H, chin_y=0.0):
    t = 5.0 * H / 18.0
    return {"chin": chin_y, "chin_crease": chin_y + t / 3.0, "mouth": chin_y + 2.0 * t / 3.0,
            "nose_base": chin_y + t, "brow": chin_y + 2.0 * t, "hairline": chin_y + 3.0 * t,
            "crown": chin_y + H, "eye": chin_y + H / 2.0}


def head_ratio_check(landmarks, tol=0.05, deliberate=()):
    """Compare measured landmark heights (front view, y up) with head_canon. Needs 'chin' and
    'crown'. tol is a fraction of head height (plus or minus 5 percent [added], per the
    character digest). `deliberate` names ratios broken on purpose (stylized: know which
    ratio you break, A4S note)."""
    if "chin" not in landmarks or "crown" not in landmarks:
        raise ValueError("landmarks need 'chin' and 'crown' heights")
    H = landmarks["crown"] - landmarks["chin"]
    if H <= 0:
        raise ValueError("crown must be above chin")
    canon = head_canon(H, landmarks["chin"])
    rows = {}
    for k, v in landmarks.items():
        if k in ("chin", "crown") or k not in canon:
            continue
        err = (v - canon[k]) / H
        rows[k] = {"measured": v, "canon": round(canon[k], 6), "error_H": round(err, 4),
                   "ok": abs(err) <= tol or k in deliberate, "deliberate": k in deliberate}
    return {"H": H, "tol": tol, "rows": rows, "ok": all(r["ok"] for r in rows.values())}


# Kris Costa, "Useful Measurements" slide (j5XLtLMN0P8 00:38:12): head 229 mm, eyeball 24 mm,
# pupillary distance 63 mm, eyes rotated 3 to 10 degrees outward (about 5, kappa angle).
COSTA_MM = {"head_height": 229.0, "eyeball": 24.0, "ipd": 63.0, "kappa_deg": (3.0, 10.0)}


def eye_report(center_l, center_r, eye_diameter, head_height, forward_l=None, forward_r=None,
               head_forward=(0.0, 0.0, 1.0), tol_mm=(2.0, 5.0)):
    """Eye placement against Costa's measurements, in the units of the mesh. head_height
    (chin to crown) sets the millimetre scale (229 mm). forward_* are each eye's gaze vectors
    (+Z faces the camera in the front view of an OBJ export, zb_stroke notes); divergence is
    measured in the horizontal plane, positive outward. tol_mm = (eyeball, ipd) [added]."""
    mm = head_height / COSTA_MM["head_height"]
    cl, cr = _v3(center_l), _v3(center_r)
    ipd = math.dist(cl, cr) / mm
    eye = eye_diameter / mm
    out = {"units_per_mm": mm, "eyeball_mm": round(eye, 2), "ipd_mm": round(ipd, 2),
           "eyeball_ok": abs(eye - COSTA_MM["eyeball"]) <= tol_mm[0],
           "ipd_ok": abs(ipd - COSTA_MM["ipd"]) <= tol_mm[1]}
    if forward_l is not None and forward_r is not None:
        hf = _norm3(_v3(head_forward))
        div = {}
        for name, c, f, other in (("left", cl, forward_l, cr), ("right", cr, forward_r, cl)):
            f = _norm3(_v3(f))
            out_dir = _norm3([c[0] - other[0], 0.0, c[2] - other[2]])   # away from the other eye
            fh = [f[0], 0.0, f[2]]
            n = math.hypot(fh[0], fh[2])
            ang = math.degrees(math.atan2(fh[0] * out_dir[0] + fh[2] * out_dir[2],
                                          fh[0] * hf[0] + fh[2] * hf[2])) if n > 1e-9 else 0.0
            div[name] = round(ang, 2)
        lo, hi = COSTA_MM["kappa_deg"]
        out["divergence_deg"] = div
        out["divergence_ok"] = all(lo <= v <= hi for v in div.values())
        out["cross_eyed_risk"] = any(v < lo for v in div.values())
    return out


def split_ratio(position, start, end, band=(0.45, 0.55)):
    """Where a main break sits along a limb or piece, as a fraction. Rakan Khamash (Blizzard,
    FRZtVXpAokc 00:16:37): 70/30, never 50/50; the 0.45 to 0.55 flag band is [added]."""
    L = float(end) - float(start)
    if L == 0:
        raise ValueError("zero length")
    r = (float(position) - float(start)) / L
    return {"ratio": round(r, 4), "fifty_fifty": band[0] <= r <= band[1]}


def scapula_check(humerus_elevation_deg, scapula_rotation_deg, tol_deg=8.0):
    """Scott Eaton (Ale6SXXbJMM 00:39:55): with the humerus raised 90 degrees from vertical the
    scapula should be rotated about 30 degrees. Only that data point is given, so the check
    runs for elevations of 80 to 100 degrees; A4S: rotation only shows above shoulder level.
    tol_deg is [added]."""
    if not 80.0 <= humerus_elevation_deg <= 100.0:
        return {"applicable": False, "note": "Eaton gives one number: about 30 degrees at 90"}
    return {"applicable": True, "expected": 30.0,
            "ok": abs(scapula_rotation_deg - 30.0) <= tol_deg}


def view_facing(axis, convention=None, step=90.0):
    """A (x_rotate, y_rotate, z_rotate) triple that turns the model axis ('+X', '-Y', ...)
    toward the camera under the zb_stroke convention (hypothesis H0 until the lead's live_04
    fits it). '-Y' gives Kingslien's view from below (6wiDxO-ZADg 01:07:39) [verify on the
    canvas: the chin must face the camera]."""
    vec = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0),
           "+Z": (0, 0, 1), "-Z": (0, 0, -1)}[axis]
    vals = [0.0, 90.0, 180.0, -90.0] if step == 90.0 else [i * step for i in range(int(360 / step))]
    for rx in vals:
        for ry in vals:
            for rz in vals:
                cam = zb_stroke.Camera([0, 0, 0, 1, 1, 1, rx, ry, rz], (0, 0, 0), convention)
                if cam.facing(vec) > 0.999:
                    return (rx, ry, rz)
    return None


def aim_at(normal, step=15.0, convention=None):
    """Rotation (x_rotate, y_rotate, 0) that turns a model-space normal toward the camera: aim
    the view at a region (its mean normal from region_on_canvas) before stamping, as the
    realism digest's stamp procedure and Kingslien's view discipline require. Grid search,
    smallest rotations first [added]; same [verify] as view_facing (live_04 fits the
    convention). Returns {"rotation", "facing"} (facing 1 = straight at the camera)."""
    n = _norm3(_v3(normal))
    vals = [0.0]
    k = 1
    while k * step < 180.0 + 1e-9:
        vals += [k * step, -k * step]
        k += 1
    best = None
    for rx in vals:
        for ry in vals:
            f = zb_stroke.Camera([0, 0, 0, 1, 1, 1, rx, ry, 0.0], (0, 0, 0), convention).facing(n)
            if best is None or f > best[0] + 1e-9:
                best = (f, rx, ry)
    return {"rotation": (best[1], best[2], 0.0), "facing": round(best[0], 4)}


# ============================================================================================
# 2. Inside ZBrush (through call()). NOT YET RUN IN ZBRUSH.
# ============================================================================================

CHAR_PATHS = {
    # layers (Enhance Details macro uses New, Delete, Duplicate, Bake All, Rename, Scrollbar)
    "layer_new": ["Tool:Layers:New"],                                   # [macro]
    "layer_delete": ["Tool:Layers:Delete"],                             # [macro]
    "layer_duplicate": ["Tool:Layers:Duplicate"],                       # [macro]
    "layer_bake_all": ["Tool:Layers:Bake All"],                         # [macro]
    "layer_scrollbar": ["Tool:Layers:Layers Scrollbar"],                # [macro] enabled = has layers
    "layer_intensity": ["Tool:Layers:Intensity", "Tool:Layers:Layer Intensity"],   # [verify]
    "layer_record_mdd": ["Tool:Layers:Record Deformation Animation",
                         "Tool:Layers:Record"],                         # [verify]
    "mt_delete": ["Tool:Morph Target:DelMT"],                           # [verify]
    # masks by feature (Tool > Masking reference)
    "mask_cavity": ["Tool:Masking:Mask By Cavity"],                     # [doc]
    "mask_cavity_blur": ["Tool:Masking:Mask By Cavity:Blur", "Tool:Masking:Blur"],       # [verify]
    "mask_cavity_intensity": ["Tool:Masking:Mask By Cavity:Intensity",
                              "Tool:Masking:Intensity"],                # [verify]
    "mask_smoothness": ["Tool:Masking:Mask By Smoothness"],             # [doc]
    "mask_peaks": ["Tool:Masking:Mask PeaksAndValleys", "Tool:Masking:MaskPeaksAndValleys"],  # [doc]
    "mask_ao": ["Tool:Masking:Mask Ambient Occlusion"],                 # [doc]
    "mask_fibers": ["Tool:Masking:FiberMask", "Tool:Masking:Mask By Fibers:FiberMask"],       # [doc]
    "automask_pg": ["Brush:Auto Masking:Mask By Polygroups"],           # [macro] Toggle Mask By Polygroups
    # strokes and alphas (picker items are addressable by name: SDK overview) [verify names]
    "stroke_dragrect": ["Stroke:DragRect"],
    "stroke_dragdot": ["Stroke:DragDot"],
    "stroke_spray": ["Stroke:Spray"],
    "stroke_dots": ["Stroke:Dots"],
    "stroke_freehand": ["Stroke:FreeHand", "Stroke:Freehand"],
    "grabdoc": ["Alpha:Transfer:GrabDoc"],                              # [macro] Create Stencil
    "alpha_intensity": ["Alpha:Modify:Intensity"],                      # [macro]
    "alpha_mid": ["Alpha:Modify:MidValue"],                             # [verify]
    "alpha_export": ["Alpha:Export"],                                   # [verify]
    "alpha_import": ["Alpha:Import"],                                   # [verify]
    "doc_resize": ["Document:Resize"],                                  # [verify]
    "actual": ["Transform:Actual", "Document:Actual"],                  # [verify]
    # Surface Noise (Tool > Surface reference)
    "surf_noise": ["Tool:Surface:Noise"],                               # [doc] opens NoiseMaker if none
    "surf_edit": ["Tool:Surface:Edit"],                                 # [doc]
    "surf_del": ["Tool:Surface:Del"],                                   # [doc]
    "surf_apply": ["Tool:Surface:Apply To Mesh"],                       # [doc]
    "surf_snorm": ["Tool:Surface:SNorm"],                               # [doc]
    "quick3d": ["Transform:Quick 3D Edit", "Transform:Quick"],          # [verify] noise shows only with it on
    # HD and polygroups for UDIM regions
    "divide_hd": ["Tool:Geometry HD:Divide HD", "Tool:Geometry HD:DivideHD"],   # [verify]
    "pg_uv": ["Tool:Polygroups:Auto Groups With UV"],                   # [verify]
    "pg_uv_islands": ["Tool:Polygroups:Uv Groups", "Tool:Polygroups:UV Groups"],  # [verify]
    # Mesh Extract (Tool > SubTool > Extract reference)
    "extract": ["Tool:SubTool:Extract", "Tool:SubTool:Extract:Extract"],          # [doc] [verify path]
    "extract_thick": ["Tool:SubTool:Thick", "Tool:SubTool:Extract:Thick"],        # [verify]
    "extract_ssmt": ["Tool:SubTool:S Smt", "Tool:SubTool:Extract:S Smt"],         # [verify]
    "extract_accept": ["Tool:SubTool:Accept", "Tool:SubTool:Extract:Accept"],     # [verify]
    # Dynamics palette (DYNA doc labels; duplicate labels need the group level) [verify all]
    "dyn_gravity": ["Dynamics:Gravity"],
    "dyn_gravity_strength": ["Dynamics:Gravity Strength"],
    "dyn_iterations": ["Dynamics:Simulation Iterations"],
    "dyn_strength": ["Dynamics:Strength"],
    "dyn_firmness": ["Dynamics:Firmness"],
    "dyn_self_collision": ["Dynamics:Self Collision"],
    "dyn_floor": ["Dynamics:Floor Collision"],
    "dyn_allow_shrink": ["Dynamics:Allow Shrink"],
    "dyn_allow_expand": ["Dynamics:Allow Expand"],
    "dyn_liquify": ["Dynamics:Liquify"],
    "dyn_set_direction": ["Dynamics:Set Direction"],
    "dyn_inflate": ["Dynamics:Inflate"],
    "dyn_expand": ["Dynamics:Expand"],
    "dyn_contract": ["Dynamics:Contract"],
    "dyn_deflate": ["Dynamics:Deflate"],
    "dyn_collision": ["Dynamics:CollisionVolume", "Dynamics:Collision Volume:CollisionVolume"],
    "dyn_recalc": ["Dynamics:Recalc", "Dynamics:Collision Volume:Recalc"],
    "dyn_resolution": ["Dynamics:Resolution", "Dynamics:Collision Volume:Resolution"],
    "dyn_collision_inflate": ["Dynamics:Collision Volume:Inflate"],
    "dyn_run": ["Dynamics:Run Simulation"],
    "dyn_max_points": ["Dynamics:Max Simulation Points"],
    "dsub_dynamic": ["Tool:Geometry:Dynamic Subdiv:Dynamic", "Tool:Geometry:Dynamic"],
    "dsub_smooth": ["Tool:Geometry:Dynamic Subdiv:SmoothSubdiv", "Tool:Geometry:SmoothSubdiv"],
    "dsub_thickness": ["Tool:Geometry:Dynamic Subdiv:Thickness", "Tool:Geometry:Thickness"],
    "dsub_offset": ["Tool:Geometry:Dynamic Subdiv:Offset"],
    "dsub_apply": ["Tool:Geometry:Dynamic Subdiv:Apply", "Tool:Geometry:Apply"],
    "close_holes": ["Tool:Geometry:Modify Topology:Close Holes", "Tool:Geometry:Close Holes"],
    # FiberMesh (FIB doc labels) [verify all]
    "fm_preview": ["Tool:FiberMesh:Preview"],
    "fm_accept": ["Tool:FiberMesh:Accept"],
    "fm_open": ["Tool:FiberMesh:Open"],
    "fm_save": ["Tool:FiberMesh:Save"],
    "fm_max_fibers": ["Tool:FiberMesh:Modifiers:Max Fibers", "Tool:FiberMesh:Max Fibers"],
    "fm_segments": ["Tool:FiberMesh:Modifiers:Segments", "Tool:FiberMesh:Segments"],
    "fm_fast_preview": ["Tool:FiberMesh:Preview Settings:Fast Preview", "Tool:FiberMesh:Fast Preview"],
    "fm_pre_vis": ["Tool:FiberMesh:Preview Settings:PRE Vis", "Tool:FiberMesh:PRE Vis"],
    "fiber_uv": ["Tool:UV Map:FiberUV"],
    # eyes, as the shipped Append Eyes macro builds them
    "popup_sphere": ["PopUp:Sphere3D"],                                 # [macro]
    "toyplastic": ["Material:ToyPlastic"],                              # [macro]
}

# Friendly names for dynamics_config (keys of CHAR_PATHS without the prefix).
DYN_KEYS = ("gravity", "gravity_strength", "iterations", "strength", "firmness", "self_collision",
            "floor", "allow_shrink", "allow_expand", "liquify", "inflate", "expand", "contract",
            "deflate", "resolution", "collision_inflate", "max_points")


def _z():
    return zb_ops._z()


def _r(key, required=True):
    cands = CHAR_PATHS.get(key)
    return zb_ops.resolve(cands if cands is not None else key, required)


def _set(key, value, tol=0.51):
    cands = CHAR_PATHS.get(key)
    return zb_ops.set_checked(cands if cands is not None else key, value, tol)


def _press(key, check_enabled=True):
    p = _r(key)
    z = _z()
    if check_enabled and not z.is_enabled(p):
        raise ZBCharError(f"{p} is greyed out in the current state")
    z.press(p)
    z.update(redraw_ui=True)
    return p


def path_inventory(keys=None):
    """Which candidate paths exist in this build, per CHAR_PATHS key (a path oracle to run once
    per session: live_c01 logs it)."""
    z = _z()
    out = {}
    for k in (keys or sorted(CHAR_PATHS)):
        out[k] = [p for p in CHAR_PATHS[k] if z.exists(p)]
    return out


# Brushes the procedures name, for one brush_check per session.
PLAN_BRUSHES = ("Move", "Standard", "ClayBuildup", "Clay", "Dam_Standard", "Inflat", "Elastic",
                "Morph", "TrimAdaptive", "TrimDynamic", "Slash3", "CurveTube", "MaskLasso")


def brush_check(names=PLAN_BRUSHES):
    """Which palette item each brush name resolves to in this build, without selecting it.
    `Brush:Dam_Standard` does not resolve on 2026.2.1 (README exists() list): zb_ops.select_brush
    tries the DamStandard spellings and loads the .ZBP otherwise. Orb_Cracks and the RK_ and
    Antro_ brushes do not ship. match: "palette" (an exists() hit), "file" (exact or alias file
    to load), "fuzzy" (a close name only: pick the stand-in yourself), None (absent)."""
    z = _z()
    files = zb_ops.list_brush_files()
    out = {}
    for name in names:
        key = zb_ops.normalize_name(name)
        aliases = list(zb_ops.BRUSH_ALIASES.get(key, []))
        hits = zb_ops.find_brush(name, files=files)
        labels = aliases + [f["name"] for f in hits] + [name]
        path = next(("Brush:" + lab for lab in dict.fromkeys(labels) if z.exists("Brush:" + lab)), None)
        exact = {key} | {zb_ops.normalize_name(a) for a in aliases}
        f0 = next((f for f in hits if zb_ops.normalize_name(f["name"]) in exact), None)
        match = "palette" if path else ("file" if f0 else ("fuzzy" if hits else None))
        out[name] = {"path": path, "file": f0["path"] if f0 else None, "match": match,
                     "ok": match in ("palette", "file"),
                     "close": [f["name"] for f in hits] if match == "fuzzy" else []}
    return out


def to_top_level():
    """Set SDiv to its maximum. New layers must be created at the top subdivision level, and
    Record can only be left there (3D Layers doc)."""
    z = _z()
    p = zb_ops.resolve("sdiv", required=False)
    if not p:
        return {"sdiv": None, "sdiv_max": None, "moved": False}
    cur, mx = z.get(p), z.get_max(p)
    if cur < mx:
        z.set(p, mx)
        z.update(redraw_ui=True)
    return {"sdiv": z.get(p), "sdiv_max": mx, "moved": cur < mx}


def has_layers():
    p = _r("layer_scrollbar", required=False)
    return bool(p and _z().is_enabled(p))


def layer_new():
    """New 3D layer at the top level (Record turns on by itself). A layer cannot be named from
    Python: the shipped macros rename through ZFileUtils RenameSetNext, which is a ZScript
    FileExecute call with no Python port, so keep an agent-side ledger (layer order ->
    purpose) [added]."""
    top = to_top_level()
    if top["sdiv"] is not None and top["sdiv"] < top["sdiv_max"]:
        raise ZBCharError(f"could not reach the top level: {top}")
    before = has_layers()
    p = _press("layer_new")
    return {"pressed": p, "top": top, "had_layers": before, "has_layers": has_layers(),
            "stats": zb_ops.stats()}


def layer_intensity(value):
    """Selected layer intensity: 1 as sculpted, above 1 exaggerates, negative inverts; always
    1 while recording (3D Layers doc). Path [verify live_c01]."""
    return {"intensity": _set("layer_intensity", float(value), tol=0.01),
            "volume": round(float(_z().get_polymesh3d_volume()), 6)}


def layer_bake_all():
    return {"pressed": _press("layer_bake_all"), "has_layers": has_layers()}


def morph_store():
    """Tool > Morph Target > StoreMT (one morph target per SubTool; it breaks when topology
    changes: Morph Targets doc)."""
    return {"pressed": _press("store_mt", check_enabled=False)}


def morph_switch():
    return {"pressed": _press("switch_mt"), "volume": round(float(_z().get_polymesh3d_volume()), 6)}


def mask_by(kind, blur=None, intensity=None):
    """Feature masks without strokes: cavity, smoothness, peaks, ao, fibers. Mask data cannot
    be read back (no API, Maxon forum 2026): judge the effect by volume changes or renders.
    A mask protects what it finds: Mask By Cavity and Mask Ambient Occlusion mask the crevices,
    so what follows (Deformation, fill, Surface Noise) works on the tops and plates; Inverse
    first to work in the crevices (Pablo inverts the AO mask to tint occluded skin, d03QU-eUaPo
    01:37:25) [added reading]."""
    key = {"cavity": "mask_cavity", "smoothness": "mask_smoothness", "peaks": "mask_peaks",
           "ao": "mask_ao", "fibers": "mask_fibers"}.get(kind)
    if key is None:
        raise ValueError("kind must be cavity, smoothness, peaks, ao or fibers")
    out = {}
    if kind == "cavity":
        if blur is not None:
            out["blur"] = _set("mask_cavity_blur", blur)
        if intensity is not None:
            out["intensity"] = _set("mask_cavity_intensity", intensity)
    out["pressed"] = _press(key, check_enabled=False)
    return out


def masked_deform(name, value, axes=None, mask=None, invert=False, blur=0, clear=True, **mask_kw):
    """Mask (by feature) -> optional Inverse and BlurMask x blur -> one Deformation slider set
    -> Clear. Masking constrains Deformation (masking doc). Lazov's concept trick is
    mask='cavity' then a light Inflate (AQsmWcXLxk8 00:25:21); Henning's mid-frequency lift
    is mask, blur, invert, blur, Inflate (TuRIf92oMCY 00:30:02)."""
    steps = []
    if mask:
        steps.append(("mask", mask_by(mask, **mask_kw)))
    if invert:
        steps.append(("invert", zb_ops.mask("invert")))
    for _ in range(int(blur)):
        steps.append(("blur", zb_ops.mask("blur")))
    res = zb_ops.deform(name, value, axes)
    if clear:
        steps.append(("clear", zb_ops.mask("clear")))
    res["steps"] = steps
    return res


def set_stroke_type(name):
    p = _r("stroke_" + name.lower().replace(" ", ""))
    _z().press(p)
    return p


def select_alpha(ref):
    """Alpha by number (39 = Costa's wrinkle alpha, 60 = J Hill's fine wrinkles, 16 = Costa's
    Elastic pass, 6 = Lazov's ClayBuildup) or by file path. Numbered palette names are
    [verify]; the files are ZData/Alphas/Alpha 0NN.PSD (local 2026-09-24). Files load with
    set_next_filename + Alpha:Import [verify]."""
    z = _z()
    if isinstance(ref, (int, float)) or (isinstance(ref, str) and ref.isdigit()):
        n = int(ref)
        for lab in (f"Alpha:Alpha {n}", f"Alpha:Alpha {n:02d}", f"Alpha:Alpha {n:03d}"):
            if z.exists(lab):
                z.press(lab)
                return {"path": lab, "loaded": False}
        ref = os.path.join(INSTALL, "ZData", "Alphas", f"Alpha {n:03d}.PSD")
    path = os.path.abspath(str(ref))
    if not os.path.exists(path):
        raise ZBCharError(f"alpha file not found: {path}")
    z.set_next_filename(path)
    p = _r("alpha_import")
    z.press(p)
    return {"path": p, "file": path, "loaded": True,
            "preset_consumed": not z.has_next_filename()}


def automask_polygroups(value=100):
    """Brush > Auto Masking > Mask By Polygroups: strokes stay inside the polygroup they start
    on (the shipped Toggle Mask By Polygroups macro sets this slider). The agent's way to keep
    lip, lid or scale strokes inside a region without painting a mask [added]."""
    return _set("automask_pg", value)


def stamp(strokes, brush=None, stroke_type=None, size=None, z_intensity=None, focal=None,
          zsub=False, alpha=None, automask_pg=None, per_stroke=None):
    """Play a list of synthesized strokes (lists of canvas points) with one brush state:
    alpha stamps (DragRect / DragDot two-point strokes), separating lines, spray loops.
    per_stroke: optional list of (draw_size, z_intensity) per stroke (taper_segments output).
    Returns counts and the volume before and after as evidence that it sculpted."""
    z = _z()
    zb_ops.ensure_edit()
    out = {"brush": zb_ops.select_brush(brush) if brush else None,
           "stroke": set_stroke_type(stroke_type) if stroke_type else None,
           "alpha": select_alpha(alpha) if alpha is not None else None}
    # Zadd and Zsub are exclusive; Draw:Zsub is only set when asked (its path is [verify])
    out["draw"] = zb_ops.set_draw(size=size, z_intensity=z_intensity, focal=focal,
                                  zadd=not zsub, zsub=True if zsub else None)
    if automask_pg is not None:
        out["automask_pg"] = automask_polygroups(automask_pg)
    v0 = z.get_polymesh3d_volume()
    ok = 0
    for i, pts in enumerate(strokes):
        if per_stroke is not None:
            ds, zi = per_stroke[i]
            zb_ops.set_draw(size=ds, z_intensity=zi)
        ok += 1 if z.canvas_stroke(z.Stroke(zb_stroke.encode(pts))) else 0
    z.update(redraw_ui=True)
    v1 = z.get_polymesh3d_volume()
    out.update({"strokes": len(strokes), "ok": ok, "volume_before": round(float(v0), 6),
                "volume_after": round(float(v1), 6)})
    return out


def surface_noise(on=True):
    """Tool > Surface > Noise. With no noise yet it opens the NoiseMaker pop-up; whether that
    window blocks the bridge is [verify live_c03] (use a short timeout). Guards (Surface Noise
    doc): Quick 3D Edit must be on (set here) or nothing shows; open NoisePlug with Strength at
    0.5 or -0.5 to see the preview, then lower it; vary scale per region with a mask and
    Magnify by Mask / Strength by Mask; Snake Skin needs Scale Variability and Amplitude; UV
    projection risks seams (check a close-up); NoiseMaker 2.0 (2026.0) rotates the alpha so a tile
    can follow each region's flow. The plugin-window settings are a computer-use step: save
    them as a .ZNM once and reopen the file."""
    z = _z()
    q = _r("quick3d", required=False)
    if q and z.get(q) < 0.5:
        z.set(q, 1)
    p = _r("surf_noise")
    was = z.get(p) >= 0.5
    if was != bool(on):
        z.press(p)
        z.update(redraw_ui=True)
    return {"path": p, "was_on": was, "is_on": z.get(p) >= 0.5}


def surface_noise_apply(snorm=None, off_after=True):
    """Apply To Mesh on the current layer (SNorm 100 at high scale and strength: Surface Noise
    doc), then switch the noise off so it does not render twice."""
    _z()
    if snorm is not None:
        _set("surf_snorm", snorm)
    before = zb_ops.stats()
    p = _press("surf_apply")
    after = zb_ops.stats()
    if off_after:
        surface_noise(False)
    return {"pressed": p, "volume_before": before.get("volume"), "volume_after": after.get("volume"),
            "points": after.get("points")}


def grab_alpha(export_path=None, midvalue=50):
    """GrabDoc the current canvas depth into a 16-bit alpha (Create Stencil From Subtool
    macro), set MidValue (Henning: 50 after the +50 / -50 calibration dots, TuRIf92oMCY
    00:26:47) and optionally export it. Expects the canvas already set: document 1024 x 1024,
    tool framed, perspective off, Actual size (Henning 00:14:15, 00:26:15)."""
    z = _z()
    out = {"grab": _press("grabdoc", check_enabled=False)}
    if midvalue is not None:
        out["midvalue"] = _set("alpha_mid", midvalue)
    if export_path:
        path = os.path.abspath(export_path)
        if os.path.exists(path):
            raise ZBCharError(f"{path} exists: choose a new name (never overwrite an alpha)")
        z.set_next_filename(path)
        z.press(_r("alpha_export"))
        out["preset_consumed"] = not z.has_next_filename()
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            raise ZBCharError(f"Alpha:Export wrote nothing at {path}; preset consumed: "
                              f"{out['preset_consumed']} (a dialog may be open: screenshot it)")
        out["file"] = path
        out["bytes"] = os.path.getsize(path)
    return out


def dynamics_config(**values):
    """Set Dynamics values by friendly name (gravity_strength=1.5, iterations=100, firmness=2,
    self_collision=1, resolution=1024, collision_inflate=0.3 ...), each read back. Values from
    Pavlovich (m5O_sBag_iA, F7bcjQAK0Wc, nqoCyOME8Jo); paths [verify live_c05]."""
    out = {}
    for k, v in values.items():
        if k not in DYN_KEYS:
            raise ValueError(f"unknown dynamics key {k}; use one of {DYN_KEYS}")
        tol = 0.51 if isinstance(v, bool) or float(v).is_integer() else 0.01
        out[k] = _set("dyn_" + k, float(v), tol=tol)
    return out


def collision_volume(recalc=True):
    """CollisionVolume is a cached voxel copy of every visible, non-active SubTool (Pavlovich
    nqoCyOME8Jo 00:03:06): press Recalc after any visibility, move or tool change."""
    z = _z()
    p = _r("dyn_collision")
    if z.get(p) < 0.5:
        z.press(p)
    elif recalc:
        z.press(_r("dyn_recalc"))
    z.update(redraw_ui=True)
    return {"collision": z.get(p)}


def run_simulation():
    """Dynamics > Run Simulation with the area before and after (the solver keeps area, so a
    large rise is stretch: Pavlovich m5O_sBag_iA 00:14:54 [added tolerance in critique]).
    How a scripted run stops (the doc: click the document or Spacebar) is [verify live_c05];
    call it with a short bridge timeout the first time."""
    z = _z()
    pts = int(z.query_mesh3d(0)[0])
    lim = _r("dyn_max_points", required=False)
    if lim and pts > z.get(lim) * 1000:
        raise ZBCharError(f"{pts} points > Max Simulation Points {z.get(lim)}k: the sim would "
                          "not run; lower the level or Del Higher first")
    a0 = float(z.get_polymesh3d_area())
    p = _press("dyn_run", check_enabled=False)
    a1 = float(z.get_polymesh3d_area())
    return {"pressed": p, "points": pts, "area_before": round(a0, 6), "area_after": round(a1, 6),
            "area_change_pct": round((a1 - a0) / a0 * 100.0, 3) if a0 else None}


def extract_shell(thick=0.01, s_smt=None, accept=True):
    """Mesh Extract from the current mask (or hidden part): Thick 0.01 for cloth, 0.03 for
    leather (SubTool > Extract reference). Returns the SubTool count before and after."""
    z = _z()
    n0 = z.get_subtool_count()
    _set("extract_thick", thick, tol=0.001)
    if s_smt is not None:
        _set("extract_ssmt", s_smt)
    out = {"extract": _press("extract", check_enabled=False)}
    if accept:
        out["accept"] = _press("extract_accept")
    out["subtools_before"] = n0
    out["subtools_after"] = z.get_subtool_count()
    return out


def fibermesh_grow(preset=None, max_fibers=None, segments=None, accept=True, fast_preview=True,
                   pre_vis=None):
    """FiberMesh from the current mask: optional preset file (curve profiles have no SDK
    setter: save a preset once and load it, FIB doc), Preview, a few sliders, Accept.
    Pablo (lgTA_ebLGDw 00:07:56-00:10:04): grooming overrides twist, revolve and gravity, so
    keep them neutral; Max Fibers 11 (thousands) and Segments 6 for creature fur; Fast
    Preview on with PRE Vis 6 to 8 before grooming. Accept may ask a Fast Preview question
    [verify live_c05]."""
    z = _z()
    out = {"subtools_before": z.get_subtool_count()}
    if preset:
        path = os.path.abspath(preset)
        z.set_next_filename(path)
        out["open"] = _press("fm_open", check_enabled=False)
        out["preset_consumed"] = not z.has_next_filename()
    out["preview"] = _press("fm_preview", check_enabled=False)
    if max_fibers is not None:
        out["max_fibers"] = _set("fm_max_fibers", max_fibers)
    if segments is not None:
        out["segments"] = _set("fm_segments", segments)
    if accept:
        out["accept"] = _press("fm_accept", check_enabled=False)
        out["subtools_after"] = z.get_subtool_count()
        if fast_preview is not None:
            fp = _r("fm_fast_preview", required=False)
            if fp:
                z.set(fp, 1 if fast_preview else 0)
        if pre_vis is not None:
            out["pre_vis"] = _set("fm_pre_vis", pre_vis)
    return out


def push_curves(curves, brush="CurveTube", delete_after=False):
    """Create curves in tool space with the SDK curves API and hand them to a curve brush
    (Maxon example: press the brush, new_curves, add_new_curve, add_curve_point, curves_to_ui).
    curves: list of point lists. Horn IMM curve brushes and CurveFlat hair cards use the same
    route; whether an IMM curve brush accepts script curves is [verify live_c06]."""
    z = _z()
    zb_ops.ensure_edit()
    sel = zb_ops.select_brush(brush) if brush else None
    before = zb_ops.stats()
    z.new_curves()
    ids = []
    for pts in curves:
        cid = z.add_new_curve()
        for p in pts:
            z.add_curve_point(cid, float(p[0]), float(p[1]), float(p[2]))
        ids.append(cid)
    rc = z.curves_to_ui()
    z.update(redraw_ui=True)
    if delete_after:
        z.delete_curves()
    after = zb_ops.stats()
    return {"brush": sel, "curves": ids, "curves_to_ui": rc, "points_before": before.get("points"),
            "points_after": after.get("points"), "subtools": after.get("subtools")}


def insert_sphere(x=0.0, y=0.0, z_pos=0.0, size=0.5, material="toyplastic"):
    """Insert a Sphere3D SubTool and place it by Geometry position and XYZ Size, the sequence
    of the shipped Append Eyes macro (Tool:SubTool:Insert, PopUp:Sphere3D, Tool:Geometry:X/Y/Z
    Position, XYZ Size, Material:ToyPlastic). Used for eyeballs and landmark markers."""
    z = _z()
    n0 = z.get_subtool_count()
    z.press(zb_ops.resolve("insert"))
    z.press(_r("popup_sphere"))
    for key, val in (("x_pos", x), ("y_pos", y), ("z_pos", z_pos), ("xyz_size", size)):
        zb_ops.set_checked(key, val, tol=0.01)
    if material:
        mp = _r(material, required=False)
        if mp:
            z.press(mp)
    z.update(redraw_ui=True)
    return {"subtools_before": n0, "subtools_after": z.get_subtool_count(),
            "active": z.get_active_subtool_index()}


# ============================================================================================
# Bridge helpers (agent side)
# ============================================================================================

def bridge_code(func, *args, **kwargs):
    """Source that imports this module inside ZBrush by path (this folder and the scenario-zbrush-expert
    scripts folder on sys.path only while importing, zb_ modules popped afterwards, as in
    zb_launch's prelude), calls func and leaves the value in `result`."""
    if not func.isidentifier():
        raise ValueError(f"bad function name {func!r}")
    return "\n".join([
        "import sys as _cs, importlib as _ci, json as _cj",
        f"_cdirs = [{HERE!r}, {EXPERT_SCRIPTS!r}]",
        "_cbefore = set(_cs.modules)",
        "for _cd in _cdirs:",
        "    _cs.path.insert(0, _cd)",
        "try:",
        "    zb_character = _ci.import_module('zb_character')",
        "finally:",
        "    for _cd in _cdirs:",
        "        _cs.path.remove(_cd)",
        "    for _ck in set(_cs.modules) - _cbefore:",
        "        if _ck.startswith('zb_'):",
        "            _cs.modules.pop(_ck, None)",
        f"result = zb_character.{func}(*_cj.loads({json.dumps(list(args))!r}), "
        f"**_cj.loads({json.dumps(kwargs)!r}))",
        ""])


def call(func, *args, port=7788, timeout=120, **kwargs):
    """zb_character.func(*args, **kwargs) on ZBrush's main thread (zb_launch.run)."""
    zb_launch = _import_expert("zb_launch")
    return zb_launch.run(bridge_code(func, *args, **kwargs), (), port, timeout)


# ============================================================================================
# 3. Agent side: OBJ measurements and alpha files (numpy, PIL)
# ============================================================================================

def _np():
    import numpy as np
    return np


def _verts(mesh):
    """Vertices (N, 3) from an OBJ path, a zb_audit.Mesh or an array."""
    np = _np()
    if isinstance(mesh, str):
        mesh = _import_expert("zb_audit").load_obj(mesh)
    if hasattr(mesh, "verts"):
        return np.asarray(mesh.verts, dtype=np.float64)
    return np.asarray(mesh, dtype=np.float64).reshape(-1, 3)


def load_groups(path):
    """Polygroup name per face, in face order. ZBrush's OBJ export writes a `g Group<id>` line
    per polygroup (one line on the v03 sphere fixture, which has one group; multi-group files
    [verify live_c04])."""
    names, cur = [], None
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("g "):
                cur = line[2:].strip()
            elif line.startswith("f "):
                names.append(cur)
    return names


def marker_centroids(mesh, min_points=4):
    """Centre and radius of each shell of a markers SubTool (one tiny sphere per landmark,
    exported as one OBJ): the measurement route the A4S note prefers over detecting landmarks
    [added]. Shells come from zb_audit's connectivity labelling. Sorted top to bottom (y)."""
    np = _np()
    za = _import_expert("zb_audit")
    m = za.load_obj(mesh) if isinstance(mesh, str) else mesh
    a, b = za._edges(m)
    lab = za._shells(len(m.verts), a, b)
    used = np.zeros(len(m.verts), dtype=bool)
    used[m.flat] = True
    out = []
    for s in np.unique(lab[used]):
        idx = np.nonzero((lab == s) & used)[0]
        if len(idx) < min_points:
            continue
        p = m.verts[idx]
        c = p.mean(axis=0)
        out.append({"center": [round(float(v), 6) for v in c],
                    "radius": round(float(np.linalg.norm(p - c, axis=1).mean()), 6),
                    "points": int(len(idx))})
    return sorted(out, key=lambda d: -d["center"][1])


def name_markers(markers, names):
    """Pair markers (sorted top to bottom) with names given top to bottom."""
    if len(markers) != len(names):
        raise ValueError(f"{len(markers)} markers for {len(names)} names")
    return {n: m["center"] for n, m in zip(names, markers)}


def front_profile(mesh, x_center=0.0, x_tol=None, bins=160, up=1, depth=2, lateral=0):
    """Sagittal front profile: for each height bin, the most forward depth (+Z toward the
    camera in the front view of an OBJ export) among vertices within x_tol of the midline.
    Returns [(height, depth)]. x_tol defaults to 1 percent of the bbox diagonal."""
    np = _np()
    v = _verts(mesh)
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0))) or 1.0
    tol = x_tol if x_tol is not None else 0.01 * diag
    sel = v[np.abs(v[:, lateral] - x_center) <= tol]
    if len(sel) == 0:
        return []
    h, d = sel[:, up], sel[:, depth]
    edges = np.linspace(h.min(), h.max(), bins + 1)
    k = np.clip(np.searchsorted(edges, h, side="right") - 1, 0, bins - 1)
    best = np.full(bins, -np.inf)
    np.maximum.at(best, k, d)
    mid = (edges[:-1] + edges[1:]) / 2.0
    ok = np.isfinite(best)
    return [(float(a), float(b)) for a, b in zip(mid[ok], best[ok])]


def front_section(mesh, height, h_tol=None, bins=120, up=1, depth=2, lateral=0):
    """Transverse front contour at a height: for each lateral bin, the most forward depth among
    vertices within h_tol of the height. Returns [(x, depth)] from left to right."""
    np = _np()
    v = _verts(mesh)
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0))) or 1.0
    tol = h_tol if h_tol is not None else 0.005 * diag
    sel = v[np.abs(v[:, up] - height) <= tol]
    if len(sel) == 0:
        return []
    x, d = sel[:, lateral], sel[:, depth]
    edges = np.linspace(x.min(), x.max(), bins + 1)
    k = np.clip(np.searchsorted(edges, x, side="right") - 1, 0, bins - 1)
    best = np.full(bins, -np.inf)
    np.maximum.at(best, k, d)
    mid = (edges[:-1] + edges[1:]) / 2.0
    ok = np.isfinite(best)
    return [(float(a), float(b)) for a, b in zip(mid[ok], best[ok])]


def profile_landmarks(profile, chin, crown):
    """First-pass landmark heights read off a front profile (height, depth), for face_report
    and head_ratio_check. Heuristic windows in fractions of H [added]: nose tip = most forward
    point between 0.2 and 0.6 H; nasion = deepest point above it up to 0.7 H; brow = most
    forward point within 0.12 H above the nasion; subnasale = deepest point within 0.1 H below
    the tip; upper lip, stomion ('mouth') and lower lip below that; chin front. Confirm every
    value on the profile render before trusting a ratio."""
    H = crown - chin
    pr = sorted(profile)

    def pick(lo, hi, fn):
        w = [(h, d) for h, d in pr if chin + lo * H <= h <= chin + hi * H]
        return fn(w, key=lambda t: t[1]) if w else None

    out = {"chin": chin, "crown": crown}
    tip = pick(0.2, 0.6, max)
    if tip is None:
        return out
    out["nose_tip"] = tip[0]
    t = (tip[0] - chin) / H
    nas = pick(t + 0.05, 0.7, min)
    if nas:
        out["nasion"] = nas[0]
        br = pick((nas[0] - chin) / H, (nas[0] - chin) / H + 0.12, max)
        if br:
            out["brow"] = br[0]
    sn = pick(t - 0.1, t - 0.01, min)
    if sn:
        out["nose_base"] = sn[0]
        s = (sn[0] - chin) / H
        ul = pick(s - 0.1, s - 0.01, max)
        if ul:
            out["upper_lip"] = ul[0]
            u = (ul[0] - chin) / H
            st = pick(u - 0.06, u - 0.005, min)
            if st:
                out["mouth"] = st[0]
                m = (st[0] - chin) / H
                ll = pick(m - 0.06, m - 0.002, max)
                if ll:
                    out["lower_lip"] = ll[0]
                cf = pick(0.0, m - 0.06, max)
                if cf:
                    out["chin_front"] = cf[0]
    return out


def line_fit(pts):
    """Orthogonal least-squares line: {'angle_deg', 'rms'} (angle of the direction vector)."""
    np = _np()
    p = np.asarray(pts, dtype=np.float64)
    c = p.mean(axis=0)
    u, s, vt = np.linalg.svd(p - c)
    d = vt[0]
    r = (p - c) @ vt[1]
    return {"angle_deg": float(np.degrees(np.arctan2(d[1], d[0]))), "rms": float(np.sqrt((r ** 2).mean())),
            "center": c.tolist()}


def circle_fit(pts):
    """Algebraic (Kasa) circle fit: {'center', 'radius', 'rms'}."""
    np = _np()
    p = np.asarray(pts, dtype=np.float64)
    A = np.c_[2 * p[:, 0], 2 * p[:, 1], np.ones(len(p))]
    b = (p ** 2).sum(axis=1)
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = sol[0], sol[1]
    r = float(np.sqrt(max(sol[2] + cx * cx + cy * cy, 0.0)))
    res = np.sqrt(((p - [cx, cy]) ** 2).sum(axis=1)) - r
    return {"center": [float(cx), float(cy)], "radius": r, "rms": float(np.sqrt((res ** 2).mean()))}


def two_line_fit(pts, min_pts=4):
    """Best two-segment polyline split (plane plus plane with a corner). {'split', 'rms'}."""
    _np()
    p = [tuple(q) for q in pts]
    best = None
    for i in range(min_pts, len(p) - min_pts + 1):
        a, b = line_fit(p[:i]), line_fit(p[i - 1:])
        n1, n2 = i, len(p) - i + 1
        rms = math.sqrt((a["rms"] ** 2 * n1 + b["rms"] ** 2 * n2) / (n1 + n2))
        if best is None or rms < best["rms"]:
            best = {"split": p[i - 1], "rms": rms, "angles": [a["angle_deg"], b["angle_deg"]]}
    if best is None:
        f = line_fit(p)
        best = {"split": None, "rms": f["rms"], "angles": [f["angle_deg"]]}
    return best


def _window(profile, lo, hi):
    return [(h, d) for h, d in profile if lo <= h <= hi]


def face_report(mesh, landmarks, x_center=0.0, H=None):
    """Descriptors for Kingslien's critique steps that geometry can show, on a head exported as
    OBJ in the front orientation (+Y up, +Z toward the camera, x = x_center the midline).
    landmarks: heights of 'chin', 'crown' and optionally 'brow', 'nose_base', 'mouth', 'eye',
    'hairline' (from marker_centroids or head_canon for a first pass).

    Every descriptor and window is [added] and UNCALIBRATED: compare a stage with the previous
    stage, a duplicate, or a reference head exported the same way, and let the renders decide.
      forehead_box: two-line RMS / circle RMS of the half section between brow and hairline
          (below 1 = box-like: Kingslien's forehead box 00:40:39)
      maxilla_sagitta: (front depth at the midline - depth at 0.2 H to the side) / (0.2 H) at
          mouth height (flat = the mouth "on a wall", 00:43:31)
      lip_dominance: upper-lip apex depth minus lower-lip apex depth, in H (positive = upper
          lip ahead: 01:16:20)
      chin_slope_deg: slope of subnasale-to-chin in profile (positive = chin behind, "quite
          sloped", 01:12:51)
      brow_step: forehead line vs brow-to-nose-root line angle in profile (a soft brow shows
          little change, 01:09:55)
    """
    np = _np()
    v = _verts(mesh)
    lm = dict(landmarks)
    H = H or (lm["crown"] - lm["chin"])
    prof = front_profile(v, x_center)
    out = {"H": H, "profile_points": len(prof)}
    if "chin" in lm and "crown" in lm:
        out["ratios"] = head_ratio_check({k: lm[k] for k in lm if k in head_canon(1.0)})
    brow = lm.get("brow")
    hair = lm.get("hairline", brow + 0.28 * H if brow is not None else None)
    if brow is not None:
        y = (brow + hair) / 2.0
        sec = [(x, d) for x, d in front_section(v, y) if x >= x_center]
        if len(sec) >= 10:
            c, t = circle_fit(sec), two_line_fit(sec)
            out["forehead_box"] = round(t["rms"] / c["rms"], 4) if c["rms"] > 0 else None
        fh = _window(prof, brow + 0.03 * H, hair)
        nr = _window(prof, brow - 0.08 * H, brow)
        if len(fh) >= 3 and len(nr) >= 3:
            a1 = line_fit([(d, h) for h, d in fh])["angle_deg"]
            a2 = line_fit([(d, h) for h, d in nr])["angle_deg"]
            dd = abs(((a1 - a2) + 90.0) % 180.0 - 90.0)
            out["brow_step_deg"] = round(dd, 2)
    mouth = lm.get("mouth")
    if mouth is not None:
        sec = front_section(v, mouth + 0.02 * H)
        if sec:
            xs = np.array([s[0] for s in sec])
            ds = np.array([s[1] for s in sec])
            dc = float(ds[np.argmin(np.abs(xs - x_center))])
            side = float(ds[np.argmin(np.abs(xs - (x_center + 0.2 * H)))])
            out["maxilla_sagitta"] = round((dc - side) / (0.2 * H), 4)
        up_lip = _window(prof, mouth, mouth + 0.05 * H)
        lo_lip = _window(prof, mouth - 0.05 * H, mouth)
        if up_lip and lo_lip:
            out["lip_dominance"] = round((max(d for _, d in up_lip) - max(d for _, d in lo_lip)) / H, 4)
    nose = lm.get("nose_base")
    chin = lm.get("chin")
    if nose is not None and chin is not None:
        sn = _window(prof, nose - 0.01 * H, nose + 0.01 * H)
        ch = _window(prof, chin, chin + 0.08 * H)
        if sn and ch:
            dn = min(d for _, d in sn)
            dcn = max(d for _, d in ch)
            out["chin_slope_deg"] = round(math.degrees(math.atan2(dn - dcn, nose - chin)), 2)
    return out


def compare_reports(before, after, keys=None):
    """Numeric deltas between two face_report (or any flat numeric) dicts."""
    keys = keys or [k for k in after if isinstance(after.get(k), (int, float))
                    and isinstance(before.get(k), (int, float))]
    return {k: round(after[k] - before[k], 4) for k in keys}


def _grid_knn(query, ref, cell, k=1, chunk=200000):
    """Distances from each query point to its k nearest reference points found within the
    3 x 3 x 3 neighbouring cells of size `cell` (inf when fewer are found)."""
    np = _np()
    q = np.asarray(query, dtype=np.float64)
    r = np.asarray(ref, dtype=np.float64)
    dim = r.shape[1]
    lo = np.minimum(q.min(axis=0), r.min(axis=0)) - cell
    rk = np.floor((r - lo) / cell).astype(np.int64)
    qmax = np.floor((q.max(axis=0) - lo) / cell).astype(np.int64)
    dims = np.maximum(rk.max(axis=0), qmax) + 3
    strides = [1] * dim
    for i in range(dim - 2, -1, -1):
        strides[i] = strides[i + 1] * int(dims[i + 1])
    strides = np.array(strides, dtype=np.int64)
    key = (rk * strides).sum(axis=1)
    order = np.argsort(key, kind="stable")
    skey = key[order]
    sref = r[order]
    import itertools
    offsets = np.array(list(itertools.product((-1, 0, 1), repeat=dim)), dtype=np.int64)
    res = np.full((len(q), k), np.inf)
    for s in range(0, len(q), chunk):
        qq = q[s:s + chunk]
        qk = np.floor((qq - lo) / cell).astype(np.int64)
        best = np.full((len(qq), k), np.inf)
        for off in offsets:
            kk = ((qk + off) * strides).sum(axis=1)
            a = np.searchsorted(skey, kk, side="left")
            b = np.searchsorted(skey, kk, side="right")
            cnt = b - a
            mx = int(cnt.max()) if len(cnt) else 0
            for j in range(mx):
                valid = cnt > j
                if not valid.any():
                    break
                idx = np.where(valid, a + j, 0)
                d = np.sqrt(((sref[idx] - qq) ** 2).sum(axis=1))
                d = np.where(valid, d, np.inf)
                # insert d into the k-best list
                best = np.sort(np.concatenate([best, d[:, None]], axis=1), axis=1)[:, :k]
        res[s:s + chunk] = best
    return res


def mirror_deviation(mesh, center_x=0.0, sample=20000, seed=0, region=None, cell=None):
    """How far the mesh is from mirror symmetry across x = center_x: distance from each sampled
    vertex, mirrored, to the nearest vertex, as a fraction of the bbox diagonal. region:
    ((xmin, ymin, zmin), (xmax, ymax, zmax)) limits the sampled vertices (nose, one ear, lips).
    Distances beyond the search cell are reported as the cell size (a floor, marked capped).
    Symmetric while it saves time, asymmetric at the end (Costa Lfen-BSwWcE 00:34:04; J Hill
    HlHoIGE2Ocs 00:29:42; Eaton sculpts posed figures without symmetry, Ale6SXXbJMM 00:36:34)."""
    np = _np()
    v = _verts(mesh)
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0))) or 1.0
    idx = np.arange(len(v))
    if region is not None:
        lo, hi = np.asarray(region[0]), np.asarray(region[1])
        idx = idx[np.all((v >= lo) & (v <= hi), axis=1)]
    if len(idx) == 0:
        raise ValueError("no vertex in the region")
    rng = np.random.default_rng(seed)
    if len(idx) > sample:
        idx = rng.choice(idx, sample, replace=False)
    q = v[idx].copy()
    q[:, 0] = 2 * center_x - q[:, 0]
    if cell is None:
        cell = 2.0 * diag / math.sqrt(max(len(v), 1))
    d = _grid_knn(q, v, cell, k=1)[:, 0]
    capped = ~np.isfinite(d)
    d = np.where(capped, cell, d) / diag
    return {"sampled": int(len(idx)), "p50": round(float(np.percentile(d, 50)), 6),
            "p90": round(float(np.percentile(d, 90)), 6), "p99": round(float(np.percentile(d, 99)), 6),
            "max": round(float(d.max()), 6), "capped_pct": round(float(capped.mean() * 100), 3),
            "cell_rel": round(cell / diag, 6)}


def asymmetry_report(before, after, regions, center_x=0.0, rise=1.5, floor_rel=5e-4, min_big=2):
    """Did the asymmetry reach the big forms? J Hill breaks symmetry in the last 25 percent on
    big forms (nose tip off the axis, the septum, one ear, a lip corner, one eye's scale,
    HlHoIGE2Ocs 00:29:42-00:30:47); FlippedNormals already break it in the mid-frequency pass
    (G2o6fdoACIQ 00:06:19); Lazov pushes the whole creature from a stored morph target
    (AQsmWcXLxk8 00:56:58). Scars and broken scales alone fail this gate.
    regions: {name: {"box": ((xmin, ymin, zmin), (xmax, ymax, zmax)), "kind": "big" | "detail"}}
    in model units (creature big forms: skull mass, one orbit rim, the jaw corner, a nostril, a
    horn's angle; human: nose, ear, lip corner, eye). A region counts as broken when its mirror
    p90 grows `rise` times and above floor_rel of the diagonal [added thresholds]."""
    rows = {}
    for name, r in regions.items():
        b = mirror_deviation(before, center_x, region=r["box"])
        a = mirror_deviation(after, center_x, region=r["box"])
        broken = a["p90"] > max(rise * b["p90"], floor_rel)
        rows[name] = {"kind": r.get("kind", "big"), "p90_before": b["p90"], "p90_after": a["p90"],
                      "broken": bool(broken)}
    big = sorted(k for k, v in rows.items() if v["kind"] == "big" and v["broken"])
    detail = sorted(k for k, v in rows.items() if v["kind"] != "big" and v["broken"])
    problems = []
    if len(big) < min_big:
        problems.append(f"{len(big)} big-form region(s) broken, {min_big} wanted"
                        + ("; the asymmetry sits only in details" if detail else "")
                        + ": move the big forms (C12)")
    return {"ok": not problems, "big_broken": big, "detail_broken": detail, "rows": rows,
            "problems": problems}


def _face_normals(m):
    """Area-weighted face normals (fan triangles from the first corner) of a zb_audit.Mesh."""
    np = _np()
    v, flat, sizes, starts = m.verts, m.flat, m.sizes, m.starts
    n = np.zeros((len(sizes), 3))
    for k in range(1, int(sizes.max()) - 1 if len(sizes) else 0):
        sel = np.nonzero(sizes > k + 1)[0]
        p0, p1, p2 = v[flat[starts[sel]]], v[flat[starts[sel] + k]], v[flat[starts[sel] + k + 1]]
        n[sel] += np.cross(p1 - p0, p2 - p0) / 2.0
    return n


def region_on_canvas(mesh, transform, names, groups=None, pivot=None, convention=None,
                     min_facing=0.6, canvas=None):
    """Canvas polygon of a polygroup region under a view, so stamp and line layouts come from
    the mesh (the `inside=` of jittered_lattice and poisson_disk) instead of fixed canvas
    fractions. Aim first: aim_at(the region normal), set_transform, read get_transform back,
    export the OBJ, then call this (realism digest P3 step 3). mesh: OBJ path or zb_audit.Mesh
    in the export orientation; transform: the 9 values of zbc.get_transform(); names: polygroup
    names (load_groups gives them per face); pivot: default the bbox centre, as in C3.
    Returns the convex hull in canvas pixels, the region's mean normal, the fraction of its
    faces turned toward the camera, and aim_ok (facing fraction >= min_facing [added]). With
    canvas=(W, H): the fraction of region points on the canvas and the shift that centres the
    region (add it to transform positions 0 and 1: a position change moves every projected
    point by the same amount). The projection uses the lead's zb_stroke.Camera convention:
    confirm one stamp on the render."""
    np = _np()
    za = _import_expert("zb_audit")
    m = za.load_obj(mesh) if isinstance(mesh, str) else mesh
    if groups is None:
        if not isinstance(mesh, str):
            raise ValueError("give groups (per-face names) with an in-memory mesh")
        groups = load_groups(mesh)
    names = {names} if isinstance(names, str) else set(names)
    fsel = np.array([g in names for g in groups], dtype=bool)
    if len(fsel) != len(m.sizes):
        raise ValueError(f"{len(fsel)} group names for {len(m.sizes)} faces")
    if not fsel.any():
        raise ValueError(f"no face in groups {sorted(names)}")
    if pivot is None:
        pivot = ((m.verts.min(axis=0) + m.verts.max(axis=0)) / 2.0).tolist()
    cam = zb_stroke.Camera(transform, pivot, convention)
    R = np.asarray(cam.r, dtype=np.float64)
    c = cam.conv
    axes = np.asarray(c.axes, dtype=np.float64)
    fidx = np.nonzero(fsel)[0]
    vid = np.unique(m.flat[np.repeat(fsel, m.sizes)])
    q = (m.verts[vid] - np.asarray(cam.pivot, dtype=np.float64)) * axes
    vv = q @ R.T
    g = c.k * cam.s
    xy = np.c_[cam.pos[0] + g * c.fx * vv[:, 0], cam.pos[1] + g * c.fy * vv[:, 1]]
    fn = _face_normals(m)[fidx]
    area = np.linalg.norm(fn, axis=1)
    facing = c.fz * ((fn * axes) @ R.T)[:, 2]
    frac = float((area[facing > 0]).sum() / area.sum()) if area.sum() > 0 else 0.0
    mean_n = fn.sum(axis=0)
    mean_n = (mean_n / (np.linalg.norm(mean_n) or 1.0)).round(6).tolist()
    pts = sorted({(round(float(x), 3), round(float(y), 3)) for x, y in xy})

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:                                   # Andrew's monotone chain
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    out = {"polygon": hull, "points": int(len(vid)), "faces": int(len(fidx)),
           "center_px": xy.mean(axis=0).round(3).tolist(), "mean_normal": mean_n,
           "facing_frac": round(frac, 4), "aim_ok": frac >= min_facing}
    if canvas is not None:
        W, H = float(canvas[0]), float(canvas[1])
        inside = (xy[:, 0] >= 0) & (xy[:, 0] <= W) & (xy[:, 1] >= 0) & (xy[:, 1] <= H)
        out["on_canvas"] = round(float(inside.mean()), 4)
        out["center_shift"] = [round(W / 2.0 - out["center_px"][0], 3),
                               round(H / 2.0 - out["center_px"][1], 3)]
    return out


def spike_report(mesh, before=None, groups=None, ratio=4.0, disp_k=8.0, top=10):
    """Rogue vertices after Project All, per polygroup, for the level walk (FlippedNormals
    Zp07GW3rND0 00:03:49-00:07:43: step through every level; spikes that "go to infinity"
    and busted danger zones become hard lines in the displacement). Two measures [added,
    uncalibrated]:
      spike ratio: distance from a vertex to the mean of its edge neighbours over the median
          edge length of the mesh (fine detail stays near 1 or below; a spike stands far out);
      with `before` (same topology, exported before projecting, the stored-MT state):
          displacement above disp_k times its 90th percentile.
    groups: per-face polygroup names (load_groups), so eyes, lids, lips, nostrils, fingers,
    armpits and crotch are read first. Fix by Morph brush or a masked local reprojection, never
    by smoothing (00:06:36, 00:09:27)."""
    np = _np()
    za = _import_expert("zb_audit")
    m = za.load_obj(mesh) if isinstance(mesh, str) else mesh
    if groups is None and isinstance(mesh, str):
        groups = load_groups(mesh)
    v = m.verts
    n = len(v)
    a, b = za._edges(m)
    src, dst = np.concatenate([a, b]), np.concatenate([b, a])
    deg = np.bincount(src, minlength=n).astype(np.float64)
    nb = np.stack([np.bincount(src, weights=v[dst, k], minlength=n) for k in range(3)], axis=1)
    used = deg > 0
    lap = np.zeros(n)
    lap[used] = np.linalg.norm(v[used] - nb[used] / deg[used, None], axis=1)
    elen = np.linalg.norm(v[a] - v[b], axis=1)
    med = float(np.median(elen[elen > 0])) if (elen > 0).any() else 1.0
    r = lap / med
    flag = r > ratio
    out = {"vertices": int(used.sum()), "median_edge": round(med, 8),
           "ratio_p99": round(float(np.percentile(r[used], 99)), 4), "spikes": int(flag.sum())}
    if before is not None:
        mb = za.load_obj(before) if isinstance(before, str) else before
        if len(mb.verts) != n:
            raise ValueError(f"vertex count changed {len(mb.verts)} -> {n}: not the same topology")
        d = np.linalg.norm(v - mb.verts, axis=1)
        p90 = float(np.percentile(d[used], 90))
        dflag = used & (d > disp_k * max(p90, 1e-12))
        out.update({"disp_p90": round(p90, 8), "disp_outliers": int(dflag.sum())})
        flag = flag | dflag
    vg = None
    if groups is not None:
        if len(groups) != len(m.sizes):
            raise ValueError(f"{len(groups)} group names for {len(m.sizes)} faces")
        face_of_corner = np.repeat(np.arange(len(m.sizes)), m.sizes)
        vg = np.empty(n, dtype=object)
        vg[m.flat] = np.asarray(groups, dtype=object)[face_of_corner]
        per = {}
        for gname in vg[flag]:
            per[gname] = per.get(gname, 0) + 1
        out["per_group"] = dict(sorted(per.items(), key=lambda t: -t[1]))
    worst = np.argsort(-r)[:top]
    out["worst"] = [{"index": int(i), "ratio": round(float(r[i]), 3),
                     "position": v[i].round(6).tolist(),
                     "group": (vg[i] if vg is not None else None)} for i in worst if flag[i]]
    out["ok"] = not bool(flag.any())
    return out


# --------------------------------------------------------------------------------------------
# Alpha files (Henning Sanden; Maxon Alphas doc: flattened 16-bit grayscale, no compression)
# --------------------------------------------------------------------------------------------

def _load_gray(path):
    np = _np()
    from PIL import Image
    with Image.open(path) as im:
        mode = im.mode
        bands = len(im.getbands())
        arr = np.asarray(im)
    if arr.ndim == 3:
        arr = arr[..., 0]
    if mode.startswith("I;16") or arr.dtype == np.uint16:
        f, bits = arr.astype(np.float64) / 65535.0, 16
    elif mode == "I" and arr.max() > 255:
        f, bits = arr.astype(np.float64) / 65535.0, 16
    else:
        f, bits = arr.astype(np.float64) / 255.0, 8
    return f, {"mode": mode, "bands": bands, "bits": bits, "size": [int(arr.shape[1]), int(arr.shape[0])]}


def save_alpha16(arr, path):
    """Write a float [0, 1] array as a 16-bit grayscale PNG or TIFF (uncompressed TIFF by
    default in Pillow), the format the Alphas doc asks for. Never overwrites."""
    np = _np()
    from PIL import Image
    path = os.path.abspath(path)
    if os.path.exists(path):
        raise FileExistsError(f"{path} exists: write a new version")
    a = np.clip(np.asarray(arr, dtype=np.float64), 0.0, 1.0)
    im = Image.fromarray((a * 65535.0 + 0.5).astype(np.uint16))
    im.save(path)
    return path


def alpha_library_dir():
    """The Asset Directory alpha folder, where the scale and pore alpha library belongs: since
    2026.1 ZBrush no longer writes to its install folder, and custom alphas and brushes live
    in <Asset Directory>/LightBox/Alphas and Brushes (deltas 3.1; on this Mac under
    ~/Library/Preferences/Maxon/ZBrush_<hash>/). ZBRUSH_USER_ASSETS_DIR overrides the location
    [verify that it points at the folder holding LightBox]. Returns the first existing folder
    or None."""
    cands = []
    env = os.environ.get("ZBRUSH_USER_ASSETS_DIR")
    if env:
        cands.append(os.path.join(env, "LightBox", "Alphas"))
    for base in ("~/Library/Preferences/Maxon", "~/Library/Application Support/Maxon"):
        cands += sorted(glob.glob(os.path.join(os.path.expanduser(base), "ZBrush_*", "LightBox",
                                               "Alphas")))
    return next((c for c in cands if os.path.isdir(c)), None)


def _border_mask(shape, frac):
    np = _np()
    h, w = shape
    b = max(1, int(round(frac * min(h, w))))
    m = np.zeros(shape, dtype=bool)
    m[:b, :] = m[-b:, :] = True
    m[:, :b] = m[:, -b:] = True
    return m


def alpha_check(path, border_frac=0.03, mid=0.5, tol=0.01, corner_frac=0.12):
    """Checks on an alpha file before it goes on a creature [thresholds added, rules from
    Henning TuRIf92oMCY 00:25:09-00:28:23 and the Alphas doc]: 16-bit single channel; the
    border band at the mid value (0.49 to 0.51) so a Focal Shift -100 DragRect stamp leaves no
    border; no clipping at 0 or 1; the corner calibration dots painted out."""
    _np()
    f, info = _load_gray(path)
    problems, warnings = [], []
    if info["bits"] != 16:
        problems.append(f"{info['bits']}-bit: alphas must be 16-bit (8-bit steps: Alphas doc)")
    if info["bands"] != 1:
        warnings.append(f"{info['bands']} channels: flatten to one gray channel")
    bm = _border_mask(f.shape, border_frac)
    band = f[bm]
    info["border_mean"] = round(float(band.mean()), 4)
    info["border_min"] = round(float(band.min()), 4)
    info["border_max"] = round(float(band.max()), 4)
    if band.min() < mid - tol or band.max() > mid + tol:
        problems.append(f"border band {info['border_min']}..{info['border_max']} not at mid "
                        f"{mid} +- {tol}: the stamp will show its edge")
    clip = float(((f <= 0.0) | (f >= 1.0)).mean())
    info["clipped_pct"] = round(clip * 100, 4)
    if clip > 0.001:
        warnings.append(f"{info['clipped_pct']} % pixels clipped at 0 or 1")
    h, w = f.shape
    c = max(2, int(corner_frac * min(h, w)))
    corners = {"tl": f[:c, :c], "tr": f[:c, -c:], "bl": f[-c:, :c], "br": f[-c:, -c:]}
    # the +50 / -50 dots are taller and deeper than anything else, so after GrabDoc they sit at
    # the ends of the range (Henning 00:25:42): look for near-white or near-black in a corner
    dots = [k for k, a in corners.items() if a.max() >= 0.97 or a.min() <= 0.03]
    info["corners_with_marks"] = dots
    if dots:
        problems.append(f"marks left in corners {dots}: paint the +50 / -50 calibration dots out")
    info["interior_std"] = round(float(f[~bm].std()), 4)
    if info["interior_std"] < 0.01:
        warnings.append("interior almost flat: the alpha carries little detail")
    return {"ok": not problems, "problems": problems, "warnings": warnings, **info}


def dots_check(path, corner_frac=0.12, border_frac=0.03, mid=0.5, tol=0.01, margin=0.002):
    """Henning's calibration on a grab that still carries the dots (TuRIf92oMCY 00:25:09-
    00:26:47): a +50 and a -50 dot, inflated by typed values in two corners, must be taller
    and deeper than anything in the tile, so GrabDoc maps the untouched plane to exactly
    MidValue 50. Checks: the brightest pixel in one corner, the darkest in another, nothing
    outside the corners reaching either extreme, the flat border at mid. Then clean_corners
    paints the dots out and alpha_check must pass. recenter_alpha is the dot-free substitute."""
    np = _np()
    f, info = _load_gray(path)
    h, w = f.shape
    c = max(2, int(corner_frac * min(h, w)))
    boxes = {"tl": (slice(0, c), slice(0, c)), "tr": (slice(0, c), slice(w - c, w)),
             "bl": (slice(h - c, h), slice(0, c)), "br": (slice(h - c, h), slice(w - c, w))}
    cm = np.zeros(f.shape, dtype=bool)
    for sl in boxes.values():
        cm[sl] = True
    hi = max(boxes, key=lambda k: f[boxes[k]].max())
    lo = min(boxes, key=lambda k: f[boxes[k]].min())
    dot_hi, dot_lo = float(f[boxes[hi]].max()), float(f[boxes[lo]].min())
    rest = f[~cm]
    band = f[_border_mask(f.shape, border_frac) & ~cm]
    problems = []
    if hi == lo:
        problems.append("both extremes in one corner: put the +50 and -50 dots in two corners")
    if rest.max() >= dot_hi - margin:
        problems.append("detail as high as the +50 dot: the dot must be taller than anything in the "
                        "alpha (Henning 00:25:42); raise the dot by a typed Inflate")
    if rest.min() <= dot_lo + margin:
        problems.append("detail as deep as the -50 dot: the dot must be deeper than anything")
    info.update({"dot_high": hi, "dot_low": lo, "dot_high_value": round(dot_hi, 4),
                 "dot_low_value": round(dot_lo, 4), "border_mean": round(float(band.mean()), 4)})
    if abs(info["border_mean"] - mid) > tol:
        problems.append(f"flat border at {info['border_mean']}, not {mid}: the dots were not "
                        "symmetric (+50 and -50, typed, not dragged)")
    return {"ok": not problems, "problems": problems, **info}


def recenter_alpha(path_in, path_out, border_frac=0.03, mid=0.5, headroom=0.98):
    """Rescale a grabbed alpha so its flat border sits exactly at the mid value, keeping the
    sign of every displacement: a deterministic substitute for Henning's +50 / -50 calibration
    dots (TuRIf92oMCY 00:25:09-00:28:23), whose only purpose is a border at MidValue 50 so a
    Focal Shift -100 stamp shows no edge [added method]. Needs a plane that fills the
    document with an untouched margin. Writes a new 16-bit file."""
    np = _np()
    f, _ = _load_gray(path_in)
    base = float(np.median(f[_border_mask(f.shape, border_frac)]))
    dev = f - base
    span = float(np.abs(dev).max()) or 1.0
    g = mid + dev / span * (min(mid, 1.0 - mid) * headroom)
    return save_alpha16(g, path_out)


def clean_corners(path_in, path_out, boxes=None, value=None, corner_frac=0.12):
    """Fill calibration-dot boxes (x0, y0, x1, y1) with the border's median value (Henning
    paints the two dots out with the neighbouring value, TuRIf92oMCY 00:27:19); default boxes:
    the four corners. Writes a new 16-bit file."""
    np = _np()
    f, _ = _load_gray(path_in)
    h, w = f.shape
    if value is None:
        value = float(np.median(f[_border_mask(f.shape, 0.03)]))
    if boxes is None:
        c = max(2, int(corner_frac * min(h, w)))
        boxes = [(0, 0, c, c), (w - c, 0, w, c), (0, h - c, c, h), (w - c, h - c, w, h)]
    g = f.copy()
    for x0, y0, x1, y1 in boxes:
        g[int(y0):int(y1), int(x0):int(x1)] = value
    return save_alpha16(g, path_out)


def scale_height_tile(size=512, spacing=40.0, angle_deg=45.0, jitter=0.2, seed=0, groove=0.18,
                      dome=1.0, margin_frac=0.04, fade_frac=0.08, amplitude=0.4):
    """Procedural scale height tile (float array, border faded to mid 0.5): Voronoi cells on
    a jittered lattice, domed, separated by grooves. A stand-in for Henning's hand-sculpted
    plane when strokes are too costly; his rules still hold: flow in one direction, uniform
    and generic, test on the model, unify by hand after stamping (TuRIf92oMCY 00:03:52,
    00:29:29). Height comes from form, never from a photo's shading (00:17:33) [added]."""
    np = _np()
    pts = jittered_lattice(size + 4 * spacing, size + 4 * spacing, spacing, angle_deg, jitter, seed,
                           origin=(-2 * spacing, -2 * spacing))
    ys, xs = np.mgrid[0:size, 0:size]
    q = np.c_[xs.ravel() + 0.5, ys.ravel() + 0.5]
    d = _grid_knn(q, np.asarray(pts), cell=spacing * 1.2, k=2)
    d1, d2 = d[:, 0], d[:, 1]
    d2 = np.where(np.isfinite(d2), d2, d1 + spacing)
    edge = (d2 - d1) / spacing                                 # 0 on cell borders
    g = np.clip(edge / max(groove, 1e-6), 0.0, 1.0)
    g = g * g * (3 - 2 * g)                                    # smoothstep into the groove
    domev = np.clip(1.0 - (d1 / (0.75 * spacing)) ** 2, 0.0, 1.0) ** (0.5 * dome)
    hgt = (g * domev).reshape(size, size)
    hgt = (hgt - hgt.mean()) / (hgt.max() - hgt.min() + 1e-12)
    val = 0.5 + amplitude * hgt
    m, b = margin_frac * size, max(fade_frac * size, 1.0)
    edge_d = np.minimum(np.minimum(xs + 0.5, size - xs - 0.5), np.minimum(ys + 0.5, size - ys - 0.5))
    ramp = np.clip((edge_d - m) / b, 0.0, 1.0)            # flat mid margin, then a smooth fade
    ramp = ramp * ramp * (3 - 2 * ramp)
    return 0.5 + (val - 0.5) * ramp


def thumbnail(png_path, out_path, height=128):
    """Small copy of a render for the "back of the room" read (Rakan Khamash, FRZtVXpAokc
    00:05:00) and Costa's from-afar read (Lfen-BSwWcE 00:28:50). Never overwrites."""
    from PIL import Image
    out_path = os.path.abspath(out_path)
    if os.path.exists(out_path):
        raise FileExistsError(out_path)
    with Image.open(png_path) as im:
        w = max(1, int(im.width * height / im.height))
        im.convert("RGB").resize((w, height)).save(out_path)
    return out_path


def upside_down(png_path, out_path):
    """Costa's reset: critique the render rotated 180 degrees as if it were a new model
    (Lfen-BSwWcE 00:29:26)."""
    from PIL import Image
    out_path = os.path.abspath(out_path)
    if os.path.exists(out_path):
        raise FileExistsError(out_path)
    with Image.open(png_path) as im:
        im.rotate(180).save(out_path)
    return out_path


def blurred(png_path, out_path, radius=8):
    """Costa's blur-your-eyes read of the primaries (j5XLtLMN0P8 00:09:18)."""
    from PIL import Image, ImageFilter
    out_path = os.path.abspath(out_path)
    if os.path.exists(out_path):
        raise FileExistsError(out_path)
    with Image.open(png_path) as im:
        im.convert("RGB").filter(ImageFilter.GaussianBlur(radius)).save(out_path)
    return out_path


def detail_survival(ref_png, sss_png, box=None, highlight_pct=20.0, sigma=2.0, min_ratio=0.5):
    """Does the sharp detail survive subsurface scattering? FlippedNormals: carve deeper than
    feels right, because shading, SSS and soft light eat sharpness (0PaYUUvgwYM 00:19:49-
    00:20:22); J Hill: in the SSS render "you just really retain the sharp details in the
    highlights" (HlHoIGE2Ocs 00:34:53). Measure [added, uncalibrated]: high-pass energy (image
    minus a Gaussian blur of sigma px) inside the brightest highlight_pct of the SSS render,
    over the same pixels of the reference render (MatCap Gray, same camera, same crop box).
    Below min_ratio: deepen the tertiary pass (Dam_Standard or Standard, not ClayBuildup)."""
    np = _np()
    from PIL import Image, ImageFilter

    def load(p):
        with Image.open(p) as im:
            g = im.convert("L")
            if box is not None:
                g = g.crop(tuple(int(v) for v in box))
            a = np.asarray(g, dtype=np.float64) / 255.0
            bl = np.asarray(g.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float64) / 255.0
        return a, a - bl

    ra, rh = load(ref_png)
    sa, sh = load(sss_png)
    if ra.shape != sa.shape:
        raise ValueError(f"renders differ in size {ra.shape} vs {sa.shape}: same camera and crop")
    m = sa >= np.percentile(sa, 100.0 - highlight_pct)
    er, es = float(rh[m].std()), float(sh[m].std())
    ratio = es / er if er > 0 else None
    return {"ratio": round(ratio, 4) if ratio is not None else None,
            "ok": ratio is not None and ratio >= min_ratio, "highlight_px": int(m.sum()),
            "energy_ref": round(er, 6), "energy_sss": round(es, 6)}
