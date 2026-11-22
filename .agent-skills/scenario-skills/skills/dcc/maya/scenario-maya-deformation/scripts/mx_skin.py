"""
mx_skin: skinning, weight maths and deformation tests for the scenario-maya-deformation skill (Maya 2027).

Import:
  import sys; sys.path.insert(0, "<skills>/scenario-maya-deformation/scripts"); import mx_skin as S
  (it adds ../../scenario-maya-expert/scripts to sys.path for mx_audit.resolve_mesh)

Data conventions
  W        list, one dict per vertex {influence index: weight}; the index is the PHYSICAL index in
           the skinCluster's influence list (MFnSkinCluster.influenceObjects order), not the
           logical .matrix[] index. read_weights() returns both lists.
  points   list of (x, y, z) in centimeters (OpenMaya internal unit), world space unless stated.
  matrix   16 floats, row-major, Maya row-vector convention: p' = p * M, translation in [12:15].

Headless recipes (through mx_run):
  python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene rig.ma <skills>/scenario-maya-deformation/scripts/mx_skin.py \
      -- audit --mesh body_geo --max-influences 4 --json /abs/out/weights_audit.json
  ... mx_skin.py -- export --mesh body_geo --path /abs/out/body_weights.json
  ... mx_skin.py -- test --mesh body_geo --spec /abs/rom_spec.json --json /abs/out/rom_report.json
  ... mx_skin.py -- probe            (Skin Tools module, plug-in and node names in this Maya)

Main entry points
  weights    read_weights, write_weights, audit_weights, limit_influences, prune_rows, export/import_weights_json
  authoring  bind, bind_precheck, block_regions, closest_bone_block, chain_ramp, mask_along, composite_layers,
             smooth_weights, sharpen_weights, volume_neighbors, copy_nearest, mirror_skin, copy_skin
  skin tools skin_tools_probe, skin_tools_api, skin_layers_node, st_add_region_layer, st_flood, delete_skin_layers
  testing    rom_schedule, rom_from_limits, key_rom, deformation_test, pose_metrics, deformation_verdict,
             cross_section, bone_volume, cross_talk, pose_snapshots, penetration
  shapes     corrective_driver, reader_weight, joint_drive, solve_pre_corrective, split_targets,
             add_split_targets, invert_deltas

Revision 2026-09-24 (refactor after the M3 blind grade): corrective_driver reads dagLocalMatrix so
constraint-driven and offsetParentMatrix-driven bind joints both fire their correctives; joint_drive
reports what moves a joint (pose it through its controls; Pose Editor controller-driven workflow);
reader_weight models the reader offline.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_MX_EXPERT = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(_MX_EXPERT) and _MX_EXPERT not in sys.path:
    sys.path.append(_MX_EXPERT)

FORMAT = "mx_skin_weights"
FORMAT_VERSION = 1

# Thresholds. Sources: see references/expert-notes.md. [added] = this toolkit's default, not an
# expert number; override per project.
THRESHOLDS = {
    "sum_tol": 1e-4,           # per-vertex weight sum (normalization, Jao 00:02:25; Maya 2027 Help)
    "prune": 0.01,             # [added]; the Help cites 0.008 as a typical insignificant weight
    "pinch": 0.7,              # edge length ratio below = compression [added]
    "stretch": 1.3,            # edge length ratio above = stretch [added]
    "collapse_area": 0.3,      # face area ratio below = collapsed face [added]
    "fold_deg": 120.0,         # dihedral angle in pose that counts as a fold [added]
    "fold_rest_max_deg": 60.0, # ...only where the rest dihedral was below this [added]
    "section_area": 0.7,       # cross-section area ratio below = candy wrapper [added]
    "section_perimeter": 0.8,  # cross-section perimeter ratio below [added]
    "volume": 0.10,            # relative bone-volume change [added] (Makauskas judges volume by eye)
    "rigid": 0.05,             # rigid regions (sole, palm): edge change [added]
    "mirror": 0.01,            # weight difference between mirrored vertices [added]
    "cross_talk": 1e-3,        # cm moved by vertices with zero weight on every moved joint [added]
    "penetration": 0.05,       # cm inside the body surface [added]
}


# =============================================================================== vector and matrix
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def _dist(a, b):
    return _len(_sub(a, b))


def _unit(a):
    n = _len(a)
    return (a[0] / n, a[1] / n, a[2] / n) if n > 1e-12 else (0.0, 0.0, 0.0)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def _clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def smoothstep(e0, e1, x):
    """0 below e0, 1 above e1, cubic ease in between (e0 > e1 inverts)."""
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = _clamp((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def _angle_deg(a, b):
    ua, ub = _unit(a), _unit(b)
    return math.degrees(math.acos(_clamp(_dot(ua, ub), -1.0, 1.0)))


IDENTITY = (1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)


def mat_mul(a, b):
    """a * b for 16-float row-major matrices (apply a, then b, in Maya's row-vector convention)."""
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[4 * r + c] = (a[4 * r] * b[c] + a[4 * r + 1] * b[4 + c] +
                              a[4 * r + 2] * b[8 + c] + a[4 * r + 3] * b[12 + c])
    return tuple(out)


def xform_point(p, m):
    x, y, z = p
    return (x * m[0] + y * m[4] + z * m[8] + m[12],
            x * m[1] + y * m[5] + z * m[9] + m[13],
            x * m[2] + y * m[6] + z * m[10] + m[14])


def xform_vector(v, m):
    x, y, z = v
    return (x * m[0] + y * m[4] + z * m[8],
            x * m[1] + y * m[5] + z * m[9],
            x * m[2] + y * m[6] + z * m[10])


def mat_inverse(m):
    """General 4x4 inverse (Gauss-Jordan with partial pivoting). Raises on a singular matrix."""
    a = [list(m[4 * r:4 * r + 4]) + [1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
    for col in range(4):
        piv = max(range(col, 4), key=lambda r: abs(a[r][col]))
        if abs(a[piv][col]) < 1e-14:
            raise ValueError("singular matrix")
        a[col], a[piv] = a[piv], a[col]
        d = a[col][col]
        a[col] = [x / d for x in a[col]]
        for r in range(4):
            if r != col and a[r][col] != 0.0:
                f = a[r][col]
                a[r] = [x - f * y for x, y in zip(a[r], a[col])]
    return tuple(a[r][4 + c] for r in range(4) for c in range(4))


def mat_rotation(axis, degrees, pivot=(0.0, 0.0, 0.0)):
    """Rotation about `axis` through `pivot`, row-vector convention (p' = p * M)."""
    x, y, z = _unit(axis)
    t = math.radians(degrees)
    c, s, C = math.cos(t), math.sin(t), 1.0 - math.cos(t)
    # column-convention Rodrigues matrix R (v' = R v); row convention is its transpose
    R = [[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
         [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
         [z * x * C - y * s, z * y * C + x * s, c + z * z * C]]
    m = [R[0][0], R[1][0], R[2][0], 0.0,
         R[0][1], R[1][1], R[2][1], 0.0,
         R[0][2], R[1][2], R[2][2], 0.0,
         0.0, 0.0, 0.0, 1.0]
    rp = xform_vector(pivot, m)
    m[12], m[13], m[14] = pivot[0] - rp[0], pivot[1] - rp[1], pivot[2] - rp[2]
    return tuple(m)


def mat_translation(t):
    return (1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, t[0], t[1], t[2], 1.0)


def _mat3_inverse(m):
    """Inverse of the upper 3x3 of a 16-float matrix, as 9 floats row-major; None if singular."""
    a, b, c = m[0], m[1], m[2]
    d, e, f = m[4], m[5], m[6]
    g, h, i = m[8], m[9], m[10]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-10:
        return None, det
    k = 1.0 / det
    return ((e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k,
            (f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k,
            (d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k), det


# =============================================================================== topology and grid
def build_topology(points, faces):
    """Edges, edge-to-face and face-to-edge maps, fan triangles, vertex neighbours, shells.
    points: list of xyz; faces: list of vertex-index lists (Maya winding)."""
    edge_index, edges, edge_faces, face_edges, tris = {}, [], [], [], []
    for fi, f in enumerate(faces):
        k = len(f)
        fe = []
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            key = (a, b) if a < b else (b, a)
            e = edge_index.get(key)
            if e is None:
                e = len(edges)
                edge_index[key] = e
                edges.append(key)
                edge_faces.append([])
            edge_faces[e].append(fi)
            fe.append(e)
        face_edges.append(fe)
        for i in range(1, k - 1):
            tris.append((f[0], f[i], f[i + 1]))
    n = len(points)
    nb = [set() for _ in range(n)]
    for a, b in edges:
        nb[a].add(b)
        nb[b].add(a)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    roots, shells = {}, []
    for v in range(n):
        r = find(v)
        shells.append(roots.setdefault(r, len(roots)))
    return {"points": [tuple(p) for p in points], "faces": [list(f) for f in faces], "edges": edges,
            "edge_faces": edge_faces, "face_edges": face_edges, "tris": tris,
            "neighbors": [sorted(s) for s in nb], "shells": shells, "shell_count": len(roots)}


def face_vector_areas(points, faces):
    """Newell vector area per face (direction = normal by winding, length = area)."""
    out = []
    for f in faces:
        nx = ny = nz = 0.0
        k = len(f)
        for i in range(k):
            p, q = points[f[i]], points[f[(i + 1) % k]]
            nx += (p[1] - q[1]) * (p[2] + q[2])
            ny += (p[2] - q[2]) * (p[0] + q[0])
            nz += (p[0] - q[0]) * (p[1] + q[1])
        out.append((0.5 * nx, 0.5 * ny, 0.5 * nz))
    return out


def bbox(points):
    xs, ys, zs = zip(*points)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


class Grid(object):
    """Uniform hash grid for nearest and radius queries on a point subset."""

    def __init__(self, points, ids=None, cell=None):
        self.points = points
        ids = list(range(len(points))) if ids is None else list(ids)
        if not ids:
            raise ValueError("Grid needs at least one point")
        if cell is None:
            lo, hi = bbox([points[i] for i in ids])
            diag = _dist(lo, hi) or 1.0
            cell = max(diag / max(1.0, len(ids) ** (1.0 / 3.0)), 1e-6)
        self.cell = float(cell)
        self.cells = {}
        for i in ids:
            self.cells.setdefault(self._key(points[i]), []).append(i)
        keys = list(self.cells)
        self.kmin = tuple(min(k[d] for k in keys) for d in range(3))
        self.kmax = tuple(max(k[d] for k in keys) for d in range(3))

    def _key(self, p):
        c = self.cell
        return (int(math.floor(p[0] / c)), int(math.floor(p[1] / c)), int(math.floor(p[2] / c)))

    def within(self, p, r):
        kx, ky, kz = self._key(p)
        n = int(math.ceil(r / self.cell))
        r2 = r * r
        out = []
        for dx in range(-n, n + 1):
            for dy in range(-n, n + 1):
                for dz in range(-n, n + 1):
                    for i in self.cells.get((kx + dx, ky + dy, kz + dz), ()):
                        q = self.points[i]
                        d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
                        if d2 <= r2:
                            out.append(i)
        return out

    def nearest(self, p, k=1):
        """[(distance, id)] of the k nearest points."""
        key = self._key(p)
        max_r = max(max(abs(key[d] - self.kmin[d]), abs(key[d] - self.kmax[d])) for d in range(3))
        best = []
        R = 0
        while R <= max_r:
            for dx in range(-R, R + 1):
                for dy in range(-R, R + 1):
                    for dz in range(-R, R + 1):
                        if max(abs(dx), abs(dy), abs(dz)) != R:
                            continue
                        for i in self.cells.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                            q = self.points[i]
                            best.append(((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2, i))
            if len(best) >= k:
                best.sort()
                if best[k - 1][0] <= (R * self.cell) ** 2:
                    break
            R += 1
        best.sort()
        return [(math.sqrt(d2), i) for d2, i in best[:k]]


# =============================================================================== weight rows
def normalize_rows(W, eps=1e-12):
    out = []
    for row in W:
        s = sum(w for w in row.values() if w > 0.0)
        out.append({i: w / s for i, w in row.items() if w > 0.0} if s > eps else {})
    return out


def prune_rows(W, threshold=THRESHOLDS["prune"]):
    """Drop weights below threshold (the largest weight of a vertex always stays), renormalize."""
    out = []
    for row in W:
        if not row:
            out.append({})
            continue
        top = max(row, key=row.get)
        kept = {i: w for i, w in row.items() if w >= threshold or i == top}
        s = sum(kept.values())
        out.append({i: w / s for i, w in kept.items()} if s > 0 else {})
    return out


def limit_influences(W, max_influences, prune=0.0):
    """Keep the `max_influences` largest weights per vertex (and drop those under `prune`), renormalize.
    This is the safe way to enforce an engine cap: editing skinCluster maximumInfluences in edit
    mode discards custom weights (Maya 2027 Help, skinCluster -mi). Returns (W, changed_vertex_count)."""
    out, changed = [], 0
    for row in W:
        items = sorted(row.items(), key=lambda kv: -kv[1])
        keep = [(i, w) for i, w in items[:max_influences] if w >= prune or i == (items[0][0] if items else None)]
        if len(keep) != len(items):
            changed += 1
        s = sum(w for _, w in keep)
        out.append({i: w / s for i, w in keep} if s > 0 else {})
    return out, changed


def dominant(W):
    """Index of the largest weight per vertex (-1 for an empty row)."""
    return [max(r, key=r.get) if r else -1 for r in W]


def rows_to_dense(W, k):
    flat = [0.0] * (len(W) * k)
    for v, row in enumerate(W):
        base = v * k
        for i, w in row.items():
            flat[base + i] = w
    return flat


def dense_to_rows(flat, k, eps=0.0):
    n = len(flat) // k if k else 0
    return [{i: flat[v * k + i] for i in range(k) if flat[v * k + i] > eps} for v in range(n)]


def max_row_difference(Wa, Wb):
    """Largest absolute per-influence difference between two weight lists (same vertex order)."""
    m, where = 0.0, -1
    for v, (a, b) in enumerate(zip(Wa, Wb)):
        for i in set(a) | set(b):
            d = abs(a.get(i, 0.0) - b.get(i, 0.0))
            if d > m:
                m, where = d, v
    return m, where


def audit_weights(W, names=None, max_influences=None, tol=THRESHOLDS["sum_tol"], tiny=None, max_listed=20):
    """Objective weight checks: sums, influence counts, tiny and negative weights, unused influences."""
    k = len(names) if names else (max((max(r) for r in W if r), default=-1) + 1)
    tiny = THRESHOLDS["prune"] if tiny is None else tiny
    hist, over, bad, zero, neg = {}, [], [], [], []
    tiny_count, max_dev, totals = 0, 0.0, [0.0] * k
    for v, row in enumerate(W):
        nz = [w for w in row.values() if w > 0.0]
        hist[len(nz)] = hist.get(len(nz), 0) + 1
        s = sum(row.values())
        if not row or s <= 1e-12:
            zero.append(v)
        elif abs(s - 1.0) > tol:
            bad.append(v)
        max_dev = max(max_dev, abs(s - 1.0) if row else 1.0)
        if max_influences and len(nz) > max_influences:
            over.append(v)
        tiny_count += sum(1 for w in nz if w < tiny)
        if any(w < 0.0 for w in row.values()):
            neg.append(v)
        for i, w in row.items():
            if 0 <= i < k:
                totals[i] += w
    unused = [i for i in range(k) if totals[i] <= 0.0]
    label = (lambda i: names[i]) if names else (lambda i: i)
    return {"vertices": len(W), "influences": k,
            "max_influences_found": max(hist) if hist else 0,
            "influence_count_histogram": {str(c): n for c, n in sorted(hist.items())},
            "over_budget": len(over), "over_budget_sample": over[:max_listed], "budget": max_influences,
            "bad_sum": len(bad), "bad_sum_sample": bad[:max_listed], "max_sum_deviation": max_dev,
            "zero_rows": len(zero), "zero_rows_sample": zero[:max_listed],
            "negative": len(neg), "tiny_weights": tiny_count, "tiny_threshold": tiny,
            "unused_influences": [label(i) for i in unused]}


def weights_verdict(a):
    """error / warn / info lines from audit_weights()."""
    out = []
    if a["zero_rows"]:
        out.append("error: %d vertices have no weight at all (sample %s)" % (a["zero_rows"], a["zero_rows_sample"][:5]))
    if a["bad_sum"]:
        out.append("error: %d vertices do not sum to 1 (max deviation %.2g)" % (a["bad_sum"], a["max_sum_deviation"]))
    if a["negative"]:
        out.append("error: %d vertices carry negative weights" % a["negative"])
    if a["budget"] and a["over_budget"]:
        out.append("error: %d vertices exceed %d influences (max found %d)" % (
            a["over_budget"], a["budget"], a["max_influences_found"]))
    if a["tiny_weights"]:
        out.append("warn: %d weights below %.3g (prune before handoff)" % (a["tiny_weights"], a["tiny_threshold"]))
    if a["unused_influences"]:
        out.append("info: %d influences carry no weight: %s" % (len(a["unused_influences"]), a["unused_influences"][:10]))
    return out


# =============================================================================== blocking and ramps
def point_segment(p, a, b):
    """(distance, t) from p to segment a-b; t in 0..1 along it (b None: a point)."""
    if b is None:
        return _dist(p, a), 0.0
    ab = _sub(b, a)
    l2 = _dot(ab, ab)
    t = 0.0 if l2 < 1e-18 else _clamp(_dot(_sub(p, a), ab) / l2)
    return _dist(p, _add(a, _mul(ab, t))), t


def closest_bone_block(points, bones, verts=None):
    """'Assign from Closest Joint' in plain Python: each vertex gets 1.0 on the influence whose bone
    segment (joint to child joint; end joints are points) is nearest (Makauskas 00:01:41; Jao 00:10:39
    on why segments map 'upwards' along an FK chain). bones: [(influence index, start, end or None)].
    Rows outside `verts` are empty dicts."""
    out = [dict() for _ in range(len(points))]
    vs = range(len(points)) if verts is None else verts
    for v in vs:
        p = points[v]
        best, bi = None, None
        for idx, a, b in bones:
            d = point_segment(p, a, b)[0]
            if best is None or d < best:
                best, bi = d, idx
        if bi is not None:
            out[v] = {bi: 1.0}
    return out


def chain_ramp(points, chain, verts=None, ease=False):
    """Even twist distribution: partition of unity along a polyline of joints (1.0 at each joint's
    position, linear or smoothstep between neighbours, clamped at the ends). chain: [(influence
    index, position)] ordered along the limb. Jao weights twist joints evenly and keeps the shape in
    the mask (XOmRKZnyIqQ 00:20:36, 00:22:19); the functional form is [added]."""
    if len(chain) < 2:
        raise ValueError("chain_ramp needs at least two joints")
    s = [0.0]
    for k in range(1, len(chain)):
        s.append(s[-1] + _dist(chain[k - 1][1], chain[k][1]))
    out = [dict() for _ in range(len(points))]
    vs = range(len(points)) if verts is None else verts
    for v in vs:
        p = points[v]
        best = None
        for k in range(len(chain) - 1):
            d, t = point_segment(p, chain[k][1], chain[k + 1][1])
            if best is None or d < best[0]:
                best = (d, k, t)
        _, k, u = best
        if k == 0 and u <= 0.0:
            out[v] = {chain[0][0]: 1.0}
            continue
        if k == len(chain) - 2 and u >= 1.0:
            out[v] = {chain[-1][0]: 1.0}
            continue
        if ease:
            u = smoothstep(0.0, 1.0, u)
        row = {}
        if 1.0 - u > 0.0:
            row[chain[k][0]] = row.get(chain[k][0], 0.0) + (1.0 - u)
        if u > 0.0:
            row[chain[k + 1][0]] = row.get(chain[k + 1][0], 0.0) + u
        out[v] = row
    return out


# =============================================================================== masks and layers
def mask_along(points, a, b, t0, t1, verts=None):
    """Layer mask from the parameter along a -> b: 0 below t0, 1 above t1 (smoothstep). Example:
    shoulder layer mask = mask_along(P, clavicle, upperarm, 0.3, 0.7) [added]. Values outside
    `verts` are 0."""
    ab = _sub(b, a)
    l2 = _dot(ab, ab) or 1e-18
    out = [0.0] * len(points)
    vs = range(len(points)) if verts is None else verts
    for v in vs:
        out[v] = smoothstep(t0, t1, _dot(_sub(points[v], a), ab) / l2)
    return out


def mask_sphere(points, center, r_in, r_out):
    """1 inside r_in, 0 beyond r_out, smoothstep between."""
    return [1.0 - smoothstep(r_in, r_out, _dist(p, center)) for p in points]


def mask_from_verts(n, verts, value=1.0):
    out = [0.0] * n
    for v in verts:
        out[v] = value
    return out


def smooth_scalar(values, neighbors, iterations=1, strength=0.5, verts=None):
    """Laplacian smoothing of a per-vertex scalar (mask polishing, Jao and Makauskas polish masks
    mostly with Smooth)."""
    cur = list(values)
    vs = range(len(cur)) if verts is None else list(verts)
    for _ in range(iterations):
        new = list(cur)
        for v in vs:
            nb = neighbors[v]
            if nb:
                new[v] = (1.0 - strength) * cur[v] + strength * sum(cur[u] for u in nb) / len(nb)
        cur = new
    return cur


def composite_layers(n, layers):
    """Skin Tools style layer stack evaluated in memory, bottom to top:
    W = a * W_layer + (1 - a) * W_below with a = mask * opacity; the mask is an alpha, not an
    influence (Makauskas 00:08:46; Maya 2027 Help, layer masks). Empty rows are transparent.
    layers: [{"weights": W, "mask": list or None, "opacity": 1.0, "enabled": True, "name": ...}].
    This mirrors the documented behaviour; it is not Autodesk's exact algorithm [added]."""
    acc = [dict() for _ in range(n)]
    for L in layers:
        if not L.get("enabled", True):
            continue
        Wl, mask, op = L["weights"], L.get("mask"), float(L.get("opacity", 1.0))
        for v in range(n):
            row = Wl[v]
            if not row:
                continue
            a = op * (mask[v] if mask is not None else 1.0)
            if a <= 0.0:
                continue
            s = sum(row.values())
            if s <= 0.0:
                continue
            below = acc[v]
            if not below or a >= 1.0:              # opaque, or nothing underneath to show through
                acc[v] = {i: w / s for i, w in row.items()}
                continue
            new = {i: (1.0 - a) * w for i, w in below.items()}
            for i, w in row.items():
                new[i] = new.get(i, 0.0) + a * w / s
            acc[v] = new
    return normalize_rows(acc)


def blend_weight_maps(Wa, Wb, t):
    """(1 - t) Wa + t Wb, normalized: Rudy's blendable skin weights between two body types
    (eFH53W7kPZs 00:11:28)."""
    out = []
    for a, b in zip(Wa, Wb):
        row = {i: (1.0 - t) * w for i, w in a.items()}
        for i, w in b.items():
            row[i] = row.get(i, 0.0) + t * w
        out.append(row)
    return normalize_rows(out)


# =============================================================================== smoothing
def _renorm_with_locks(row, orig, locked):
    lock_sum = sum(orig.get(i, 0.0) for i in locked)
    free = {i: w for i, w in row.items() if i not in locked and w > 0.0}
    fs = sum(free.values())
    target = max(0.0, 1.0 - lock_sum)
    if fs <= 0.0:
        free = {i: w for i, w in orig.items() if i not in locked}
        fs = sum(free.values())
    out = {i: orig[i] for i in locked if orig.get(i, 0.0) > 0.0}
    if fs > 0.0:
        for i, w in free.items():
            out[i] = w * target / fs
    return out


def smooth_weights(W, neighbors, iterations=1, strength=0.5, verts=None, locked=(), max_influences=None):
    """Average each vertex's weights with its neighbours (Jacobi iterations), renormalize.
    locked: influence indices whose weights never change (Jao's vanilla discipline, 00:05:08).
    Makauskas: strong smoothing on dense regions, sparing on sparse ones (fingers lose volume,
    00:18:35); restrict with `verts` and use fewer iterations there."""
    locked = set(locked)
    cur = [dict(r) for r in W]
    vs = range(len(cur)) if verts is None else sorted(set(verts))
    for _ in range(max(0, int(iterations))):
        new = list(cur)
        for v in vs:
            nb = neighbors[v]
            if not nb:
                continue
            avg = {}
            for u in nb:
                for i, w in cur[u].items():
                    avg[i] = avg.get(i, 0.0) + w
            inv = 1.0 / len(nb)
            row = cur[v]
            mixed = {}
            for i in set(row) | set(avg):
                x = (1.0 - strength) * row.get(i, 0.0) + strength * avg.get(i, 0.0) * inv
                if x > 1e-9:
                    mixed[i] = x
            if locked:
                mixed = _renorm_with_locks(mixed, row, locked)
            else:
                s = sum(mixed.values())
                mixed = {i: w / s for i, w in mixed.items()} if s > 0 else dict(row)
            if max_influences:
                mixed = limit_influences([mixed], max_influences)[0][0]
            new[v] = mixed
        cur = new
    return cur


def sharpen_weights(W, neighbors, strength=0.5, iterations=1, verts=None):
    """Inverse of smoothing (w + s * (w - average)), clamped and renormalized: Skin Tools' Sharpen,
    'an opposite of smooth brush' (Makauskas 00:18:51)."""
    cur = [dict(r) for r in W]
    vs = range(len(cur)) if verts is None else sorted(set(verts))
    for _ in range(max(0, int(iterations))):
        new = list(cur)
        for v in vs:
            nb = neighbors[v]
            if not nb:
                continue
            avg = {}
            for u in nb:
                for i, w in cur[u].items():
                    avg[i] = avg.get(i, 0.0) + w / len(nb)
            row = cur[v]
            out = {}
            for i in set(row) | set(avg):
                x = row.get(i, 0.0) + strength * (row.get(i, 0.0) - avg.get(i, 0.0))
                if x > 1e-9:
                    out[i] = x
            s = sum(out.values())
            new[v] = {i: w / s for i, w in out.items()} if s > 0 else dict(row)
        cur = new
    return cur


def volume_neighbors(points, radius, verts=None, candidates=None):
    """Neighbour lists by 3D proximity (across shells): the 'Volume' brush projection that lets a
    necklace or shirt agree with the body (Makauskas 00:05:33; Maya 2027 Help, brush projection).
    Pass the result to smooth_weights(neighbors=...). candidates: vertices allowed as neighbours."""
    grid = Grid(points, ids=candidates, cell=radius)
    vs = range(len(points)) if verts is None else verts
    out = [[] for _ in range(len(points))]
    for v in vs:
        out[v] = [u for u in grid.within(points[v], radius) if u != v]
    return out


def copy_nearest(W, points, src_verts, dst_verts, k=1):
    """Rows of dst_verts copied from the nearest src_verts (inverse-distance blend for k > 1): an
    accessory or clothing shell follows the body under it (Makauskas volume smoothing on the
    necklace, 00:21:29, as a deterministic transfer [added])."""
    grid = Grid(points, ids=src_verts)
    out = [dict(r) for r in W]
    for v in dst_verts:
        hits = grid.nearest(points[v], k)
        if k == 1 or hits[0][0] < 1e-9:
            out[v] = dict(W[hits[0][1]])
            continue
        row = {}
        for d, u in hits:
            wt = 1.0 / d
            for i, w in W[u].items():
                row[i] = row.get(i, 0.0) + wt * w
        s = sum(row.values())
        out[v] = {i: w / s for i, w in row.items()}
    return out


# =============================================================================== mirror and remap
SIDE_RULES = (
    ("prefix", "L_", "R_"), ("prefix", "l_", "r_"), ("prefix", "Left", "Right"), ("prefix", "left", "right"),
    ("suffix", "_L", "_R"), ("suffix", "_l", "_r"), ("suffix", "_lf", "_rt"),
    ("infix", "_L_", "_R_"), ("infix", "_l_", "_r_"), ("infix", "Left", "Right"), ("infix", "left", "right"),
)


def short_name(n):
    return n.rsplit("|", 1)[-1].rsplit(":", 1)[-1]


def mirror_name(name, rules=SIDE_RULES):
    """Opposite-side short name, or None for a centre name. Pose Editor mirroring also needs exact,
    case-sensitive side substrings (Maya 2027 Help, Mirror pose interpolators)."""
    s = short_name(name)
    for kind, a, b in rules:
        for x, y in ((a, b), (b, a)):
            if kind == "prefix" and s.startswith(x):
                return y + s[len(x):]
            if kind == "suffix" and s.endswith(x):
                return s[:-len(x)] + y
            if kind == "infix" and x in s:
                return s.replace(x, y, 1)
    return None


def mirror_influence_map(names, rules=SIDE_RULES):
    """(map, unmatched): map[i] = index of the opposite influence (itself for centre ones)."""
    by_short = {}
    for i, n in enumerate(names):
        by_short.setdefault(short_name(n), i)
    out, unmatched = [], []
    for i, n in enumerate(names):
        m = mirror_name(n, rules)
        if m is None:
            out.append(i)
        elif m in by_short:
            out.append(by_short[m])
        else:
            out.append(i)
            unmatched.append(n)
    return out, unmatched


def mirror_vertex_map(points, axis=0, tol=0.01):
    """(map, unmatched_count): map[v] = vertex nearest to v mirrored across the plane axis = 0,
    or -1 when none lies within tol (cm) [added default]. Mirroring needs a mesh centred on the
    axis in a symmetric pose (Maya 2027 Help, Mirror smooth skin weights)."""
    grid = Grid(points, cell=max(float(tol), 1e-6) * 2.0)      # partners only matter within tol
    out, miss = [], 0
    for p in points:
        q = list(p)
        q[axis] = -q[axis]
        q = tuple(q)
        hits = grid.within(q, tol)
        if hits:
            out.append(min(hits, key=lambda u: _dist(points[u], q)))
        else:
            out.append(-1)
            miss += 1
    return out, miss


def _remap_row(row, imap):
    out = {}
    for i, w in row.items():
        j = imap[i]
        out[j] = out.get(j, 0.0) + w
    return out


def mirror_weights(W, vmap, imap, points, axis=0, source="+", center_tol=1e-3):
    """Copy the source side onto the other side with influences swapped by imap; centre vertices
    (|coord| <= center_tol) get the average of their row and its mirror [added]. source '+' copies
    +X to -X (the character's left to right for a Y-up, +Z-facing character, like copySkinWeights
    without mirrorInverse). Returns (W, stats)."""
    out = [dict(r) for r in W]
    copied = centre = missing = 0
    for v, p in enumerate(points):
        x = p[axis]
        u = vmap[v]
        if abs(x) <= center_tol:
            src = W[u] if u >= 0 else W[v]
            row = dict(W[v])
            for i, w in _remap_row(src, imap).items():
                row[i] = row.get(i, 0.0) + w
            out[v] = normalize_rows([row])[0]
            centre += 1
        elif (x < 0.0) == (source == "+"):
            if u < 0:
                missing += 1
                continue
            out[v] = _remap_row(W[u], imap)
            copied += 1
    return out, {"copied": copied, "centre": centre, "unmatched": missing}


def mirror_error(W, vmap, imap, verts=None):
    """(max difference, vertex) between each vertex's row and its partner's mirrored row."""
    m, where = 0.0, -1
    vs = range(len(W)) if verts is None else verts
    for v in vs:
        u = vmap[v]
        if u < 0:
            continue
        a, b = W[v], _remap_row(W[u], imap)
        for i in set(a) | set(b):
            d = abs(a.get(i, 0.0) - b.get(i, 0.0))
            if d > m:
                m, where = d, v
    return m, where


def remap_by_closest(src_points, src_W, dst_points, k=1):
    """Weights for dst points from the nearest source points (k > 1: inverse-distance blend).
    For meshes that overlap in space, as Copy Skin Weights expects (Maya 2027 Help)."""
    grid = Grid(src_points)
    out, dmax, dsum = [], 0.0, 0.0
    for p in dst_points:
        hits = grid.nearest(p, k)
        dmax = max(dmax, hits[0][0])
        dsum += hits[0][0]
        if k == 1 or hits[0][0] < 1e-9:
            out.append(dict(src_W[hits[0][1]]))
            continue
        row = {}
        for d, u in hits:
            for i, w in src_W[u].items():
                row[i] = row.get(i, 0.0) + w / d
        s = sum(row.values())
        out.append({i: w / s for i, w in row.items()})
    return out, {"max_distance": dmax, "mean_distance": dsum / max(1, len(dst_points))}


# =============================================================================== ROM schedules
def rom_schedule(segments, start=1, step=10):
    """Calisthenics timing (Makauskas 00:03:01): keys every `step` frames, a pose on every second
    key, back to rest in between, one motion per segment (00:10:36).
    segments: [{"label": str, "channels": {"node.attr": value}}] or (node, attr, value[, label]).
    Values are absolute unless key_rom(relative=True). Returns the schedule dict (pure data)."""
    norm = []
    for s in segments:
        if isinstance(s, dict):
            norm.append({"label": s.get("label") or ",".join("%s=%g" % kv for kv in s["channels"].items()),
                         "channels": dict(s["channels"])})
        else:
            node, attr, value = s[0], s[1], s[2]
            plug = "%s.%s" % (node, attr)
            norm.append({"label": s[3] if len(s) > 3 else "%s=%g" % (plug, value), "channels": {plug: value}})
    plugs = []
    for s in norm:
        for p in s["channels"]:
            if p not in plugs:
                plugs.append(p)
    keys = {(p, start): None for p in plugs}
    poses, f = [], start
    for s in norm:
        pose_f, rest_f = f + step, f + 2 * step
        for p, val in s["channels"].items():
            keys.setdefault((p, f), None)
            keys[(p, pose_f)] = val
            keys[(p, rest_f)] = None
        poses.append({"label": s["label"], "frame": pose_f, "channels": dict(s["channels"])})
        f = rest_f
    key_list = sorted(((p, fr, v) for (p, fr), v in keys.items()), key=lambda k: (k[1], k[0]))
    rest_frames = sorted({start} | {p["frame"] + step for p in poses})
    return {"start": start, "end": f, "step": step, "plugs": plugs, "keys": key_list,
            "poses": poses, "rest_frames": rest_frames}


def rom_steps(lo, hi, step_deg=30.0):
    """Angles from 0 toward each limit in `step_deg` increments, limits included, 0 excluded
    (Widup: range -30..90 gives -30, 30, 60, 90 plus the neutral, 1_PoTPm2L1c 00:15:50)."""
    vals = []
    a = step_deg
    while a < hi - 1e-6:
        vals.append(a)
        a += step_deg
    if hi > 1e-6:
        vals.append(hi)
    a = -step_deg
    while a > lo + 1e-6:
        vals.append(a)
        a -= step_deg
    if lo < -1e-6:
        vals.append(lo)
    return sorted(set(round(v, 6) for v in vals))


def rom_from_limits(joints, step_deg=30.0, default_range=(-90.0, 90.0), axes=("rx", "ry", "rz"),
                    start=1, step=10):
    """One-joint-at-a-time pose data in ~30 degree steps (Widup, ML Deformer training, 00:15:50,
    00:27:41). joints: [{"node": name, "limits": {"rx": (min, max)}}]; axes without limits use
    default_range [added] and are listed in the schedule's "defaulted" field."""
    segs, defaulted = [], []
    for j in joints:
        lim = j.get("limits", {})
        for ax in axes:
            if ax in lim and lim[ax] is None:
                continue
            lo, hi = lim.get(ax, default_range)
            if ax not in lim:
                defaulted.append("%s.%s" % (j["node"], ax))
            for val in rom_steps(lo, hi, step_deg):
                segs.append({"label": "%s.%s=%g" % (j["node"], ax, val), "channels": {"%s.%s" % (j["node"], ax): val}})
    sched = rom_schedule(segs, start, step)
    sched["defaulted"] = defaulted
    return sched


# =============================================================================== deformation metrics
def edge_ratios(P0, P1, edges):
    out = []
    for a, b in edges:
        l0 = _dist(P0[a], P0[b])
        out.append(_dist(P1[a], P1[b]) / l0 if l0 > 1e-12 else 1.0)
    return out


def face_area_ratios(P0, P1, faces):
    A0 = face_vector_areas(P0, faces)
    A1 = face_vector_areas(P1, faces)
    return [(_len(b) / _len(a)) if _len(a) > 1e-12 else 1.0 for a, b in zip(A0, A1)]


def fold_edges(P0, P1, topo, fold_deg=None, rest_max_deg=None):
    """Interior edges whose two faces fold onto each other in the pose (dihedral >= fold_deg) while
    they were fairly flat at rest (<= rest_max_deg): collapsed creases at the inner elbow or knee."""
    fold_deg = THRESHOLDS["fold_deg"] if fold_deg is None else fold_deg
    rest_max_deg = THRESHOLDS["fold_rest_max_deg"] if rest_max_deg is None else rest_max_deg
    n0 = face_vector_areas(P0, topo["faces"])
    n1 = face_vector_areas(P1, topo["faces"])
    out = []
    for e, fs in enumerate(topo["edge_faces"]):
        if len(fs) != 2:
            continue
        a, b = fs
        if _len(n0[a]) < 1e-12 or _len(n0[b]) < 1e-12 or _len(n1[a]) < 1e-12 or _len(n1[b]) < 1e-12:
            continue
        if _angle_deg(n0[a], n0[b]) <= rest_max_deg and _angle_deg(n1[a], n1[b]) >= fold_deg:
            out.append(e)
    return out


def cross_section(points, topo, plane_point, plane_normal, verts=None):
    """Section of the mesh by a plane: the loop of edge crossings nearest to plane_point, ordered
    through shared faces. Returns {"points", "closed", "area", "perimeter", "centroid"} or None.
    Used for the candy-wrapper test: the section at mid-forearm keeps its area under a 90 degree
    twist with dual quaternion skinning and collapses with linear skinning (Maya 2027 Help, smooth
    skinning methods) [added: metric]. verts restricts crossings to edges touching those vertices."""
    n = _unit(plane_normal)
    scale = max(1e-6, _len(_sub(*bbox(points))))
    c = _add(plane_point, _mul(n, 1.37e-7 * scale))          # avoid vertices exactly on the plane
    d = [_dot(_sub(p, c), n) for p in points]
    allowed = None if verts is None else set(verts)
    hit = {}
    for e, (a, b) in enumerate(topo["edges"]):
        if (d[a] > 0.0) == (d[b] > 0.0):
            continue
        if allowed is not None and a not in allowed and b not in allowed:
            continue
        t = d[a] / (d[a] - d[b])
        hit[e] = _lerp(points[a], points[b], t)
    if len(hit) < 3:
        return None
    adj = {e: set() for e in hit}
    for fi, fe in enumerate(topo["face_edges"]):
        hs = [e for e in fe if e in hit]
        for i in range(len(hs)):
            for j in range(i + 1, len(hs)):
                adj[hs[i]].add(hs[j])
                adj[hs[j]].add(hs[i])
    seen, comps = set(), []
    for e in hit:
        if e in seen:
            continue
        stack, comp = [e], []
        seen.add(e)
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        comps.append(comp)

    def centroid(comp):
        s = (0.0, 0.0, 0.0)
        for e in comp:
            s = _add(s, hit[e])
        return _mul(s, 1.0 / len(comp))

    comps = [cp for cp in comps if len(cp) >= 3]
    if not comps:
        return None
    comp = min(comps, key=lambda cp: _dist(centroid(cp), plane_point))
    cset = set(comp)
    start = next((e for e in comp if len(adj[e] & cset) == 1), comp[0])
    order, prev, cur = [start], None, start
    while True:
        nxt = [y for y in adj[cur] if y in cset and y != prev and y not in order]
        if not nxt:
            break
        prev, cur = cur, nxt[0]
        order.append(cur)
    closed = len(order) == len(comp) and start in adj[order[-1]] and len(order) > 2
    pts = [hit[e] for e in order]
    cen = centroid(order)
    area_vec = (0.0, 0.0, 0.0)
    per = 0.0
    m = len(pts)
    for i in range(m if closed else m - 1):
        p, q = pts[i], pts[(i + 1) % m]
        area_vec = _add(area_vec, _cross(_sub(p, cen), _sub(q, cen)))
        per += _dist(p, q)
    return {"points": m, "closed": bool(closed), "area": abs(_dot(area_vec, n)) * 0.5 if closed else 0.0,
            "perimeter": per, "centroid": cen}


def signed_volume(points, tris, verts=None, origin=(0.0, 0.0, 0.0)):
    """Signed volume by the divergence theorem (positive for a closed shell with outward normals)."""
    allowed = None if verts is None else set(verts)
    V = 0.0
    for i, j, k in tris:
        if allowed is not None and not (i in allowed and j in allowed and k in allowed):
            continue
        a, b, c = _sub(points[i], origin), _sub(points[j], origin), _sub(points[k], origin)
        V += _dot(a, _cross(b, c)) / 6.0
    return V


def bone_volume(points, tris, a, b, verts=None):
    """Volume swept around a bone: tetrahedra from each triangle to the closest point of segment a-b.
    Compare rest and pose for one region (bicep, forearm) [added approximation for open regions]."""
    allowed = None if verts is None else set(verts)
    V = 0.0
    for i, j, k in tris:
        if allowed is not None and not (i in allowed and j in allowed and k in allowed):
            continue
        pi, pj, pk = points[i], points[j], points[k]
        cen = ((pi[0] + pj[0] + pk[0]) / 3.0, (pi[1] + pj[1] + pk[1]) / 3.0, (pi[2] + pj[2] + pk[2]) / 3.0)
        ab = _sub(b, a)
        l2 = _dot(ab, ab)
        t = 0.0 if l2 < 1e-18 else _clamp(_dot(_sub(cen, a), ab) / l2)
        o = _add(a, _mul(ab, t))
        V += _dot(_sub(pi, o), _cross(_sub(pj, o), _sub(pk, o))) / 6.0
    return V


def shell_volumes(points, tris, shells):
    """Signed volume per shell about its own centroid; negative means the normals point inward
    (Geodesic Voxel needs outward front faces, Maya 2027 Help)."""
    groups = {}
    for v, s in enumerate(shells):
        groups.setdefault(s, []).append(v)
    out = {}
    for s, vs in groups.items():
        cen = _mul(_add((0.0, 0.0, 0.0), tuple(sum(points[v][d] for v in vs) for d in range(3))), 1.0 / len(vs))
        out[s] = signed_volume(points, tris, verts=vs, origin=cen)
    return out


def displacements(P0, P1):
    return [_dist(a, b) for a, b in zip(P0, P1)]


def cross_talk(P0, P1, W, moved, tol=None):
    """Vertices with zero weight on every moved influence that still moved: impossible for pure
    skinning, so it flags a deformer above or below the skin (ML Deformer cross talk, Widup
    00:27:41; a Delta Mush or wrap leaking) [added: exact metric]."""
    tol = THRESHOLDS["cross_talk"] if tol is None else tol
    moved = set(moved)
    bad, mx = [], 0.0
    for v, row in enumerate(W):
        if sum(w for i, w in row.items() if i in moved) > 1e-9:
            continue
        d = _dist(P0[v], P1[v])
        if d > tol:
            bad.append(v)
            mx = max(mx, d)
    return {"count": len(bad), "max": mx, "sample": bad[:20]}


def rigid_error(P0, P1, edges, verts):
    """Largest |edge ratio - 1| among edges inside `verts` (foot sole, palm: Makauskas restores
    rigidity where anatomy is rigid, 00:23:31)."""
    vs = set(verts)
    m = 0.0
    for a, b in edges:
        if a in vs and b in vs:
            l0 = _dist(P0[a], P0[b])
            if l0 > 1e-12:
                m = max(m, abs(_dist(P1[a], P1[b]) / l0 - 1.0))
    return m


def mesh_error(Pa, Pb):
    """Mean and max distance between two point lists (ML output against its target, held-out poses)."""
    ds = displacements(Pa, Pb)
    i = max(range(len(ds)), key=ds.__getitem__) if ds else -1
    return {"mean": sum(ds) / max(1, len(ds)), "max": ds[i] if ds else 0.0, "argmax": i}


def _by_region(items, region_of, names):
    out = {}
    for x in items:
        r = region_of(x)
        key = names[r] if names and 0 <= r < len(names) else str(r)
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def pose_metrics(P0, P1, topo, W=None, names=None, thresholds=None, bones0=None, bones1=None,
                 moved=None, sections=None, rigid=None, min_region_tris=8):
    """Every measurable deformation check for one pose against rest.
    bones0/bones1: {influence index: (joint position, child position or None)} at rest and pose;
    sections: [{"label", "rest": (point, normal), "pose": (point, normal), "verts": optional}];
    rigid: {label: [vertex ids]}. Regions are the dominant influence of each vertex."""
    thr = dict(THRESHOLDS)
    thr.update(thresholds or {})
    dom = dominant(W) if W else [-1] * len(P0)
    edges = topo["edges"]
    er = edge_ratios(P0, P1, edges)
    pinch = [e for e, r in enumerate(er) if r < thr["pinch"]]
    stretch = [e for e, r in enumerate(er) if r > thr["stretch"]]
    ar = face_area_ratios(P0, P1, topo["faces"])
    collapsed = [f for f, r in enumerate(ar) if r < thr["collapse_area"]]
    folds = fold_edges(P0, P1, topo, thr["fold_deg"], thr["fold_rest_max_deg"])
    disp = displacements(P0, P1)
    rep = {
        "edge_ratio_min": min(er) if er else 1.0, "edge_ratio_max": max(er) if er else 1.0,
        "pinch": {"count": len(pinch), "by_region": _by_region(pinch, lambda e: dom[edges[e][0]], names)},
        "stretch": {"count": len(stretch), "by_region": _by_region(stretch, lambda e: dom[edges[e][0]], names)},
        "collapsed_faces": {"count": len(collapsed),
                            "by_region": _by_region(collapsed, lambda f: dom[topo["faces"][f][0]], names)},
        "folds": {"count": len(folds), "by_region": _by_region(folds, lambda e: dom[edges[e][0]], names)},
        "max_displacement": max(disp) if disp else 0.0,
    }
    if W is not None and moved is not None:
        rep["cross_talk"] = cross_talk(P0, P1, W, moved, thr["cross_talk"])
    if bones0 and bones1 and W is not None:
        vols = {}
        region_verts = {}
        for v, r in enumerate(dom):
            region_verts.setdefault(r, []).append(v)
        for i in (moved if moved is not None else bones0.keys()):
            if i not in bones0 or i not in bones1 or i not in region_verts:
                continue
            vs = set(region_verts[i])
            ntri = sum(1 for t in topo["tris"] if t[0] in vs and t[1] in vs and t[2] in vs)
            if ntri < min_region_tris:
                continue
            a0, b0 = bones0[i]
            a1, b1 = bones1[i]
            v0 = bone_volume(P0, topo["tris"], a0, b0 if b0 is not None else a0, vs)
            v1 = bone_volume(P1, topo["tris"], a1, b1 if b1 is not None else a1, vs)
            if abs(v0) > 1e-9:
                vols[names[i] if names else str(i)] = v1 / v0
        rep["volume_ratio"] = vols
    if sections:
        out = []
        for s in sections:
            r0 = cross_section(P0, topo, s["rest"][0], s["rest"][1], s.get("verts"))
            r1 = cross_section(P1, topo, s["pose"][0], s["pose"][1], s.get("verts"))
            item = {"label": s.get("label", "section")}
            if r0 and r1 and r0["closed"] and r1["closed"] and r0["area"] > 0 and r0["perimeter"] > 0:
                item.update(area_ratio=r1["area"] / r0["area"], perimeter_ratio=r1["perimeter"] / r0["perimeter"],
                            rest_area=r0["area"], pose_area=r1["area"])
            else:
                item["error"] = "section not found or not closed (rest %s, pose %s)" % (bool(r0), bool(r1))
            out.append(item)
        rep["sections"] = out
    if rigid:
        rep["rigid"] = {label: rigid_error(P0, P1, edges, vs) for label, vs in rigid.items()}
    return rep


def deformation_verdict(report, thresholds=None):
    """error / warn / info lines for deformation_test() (or a list of pose_metrics dicts)."""
    thr = dict(THRESHOLDS)
    thr.update(thresholds or {})
    out = []
    if "weights" in report:
        out.extend(weights_verdict(report["weights"]))
    for p in report.get("poses", []):
        tag = "pose %r f%s" % (p.get("label"), p.get("frame"))
        m = p.get("metrics", p)
        ct = m.get("cross_talk")
        if ct and ct["count"]:
            out.append("error: %s: %d vertices with no weight on the moved joints moved (max %.3g cm): a deformer "
                       "outside the skin, or the wrong joint moved" % (tag, ct["count"], ct["max"]))
        for s in m.get("sections", []):
            if "area_ratio" in s and (s["area_ratio"] < thr["section_area"] or s["perimeter_ratio"] < thr["section_perimeter"]):
                out.append("warn: %s: section %s keeps %.0f%% area, %.0f%% perimeter (candy wrapper: twist joints, "
                           "DQ blend or a corrective)" % (tag, s["label"], 100 * s["area_ratio"], 100 * s["perimeter_ratio"]))
            elif "error" in s:
                out.append("info: %s: section %s: %s" % (tag, s["label"], s["error"]))
        for region, r in (m.get("volume_ratio") or {}).items():
            if abs(r - 1.0) > thr["volume"]:
                out.append("warn: %s: %s volume %+.0f%%" % (tag, region, 100 * (r - 1.0)))
        for key, label in (("pinch", "edges compressed below %.2f" % thr["pinch"]),
                           ("stretch", "edges stretched above %.2f" % thr["stretch"]),
                           ("collapsed_faces", "faces below %.0f%% area" % (100 * thr["collapse_area"])),
                           ("folds", "folded edges")):
            c = m.get(key, {}).get("count", 0)
            if c:
                top = list(m[key]["by_region"].items())[:3]
                out.append("warn: %s: %d %s (%s)" % (tag, c, label, ", ".join("%s %d" % kv for kv in top)))
        for label, e in (m.get("rigid") or {}).items():
            if e > thr["rigid"]:
                out.append("warn: %s: rigid region %s changes %.0f%%" % (tag, label, 100 * e))
        for acc in m.get("penetration", []):
            if acc.get("increase", 0) > 0:
                out.append("warn: %s: %d vertices of %s inside %s" % (tag, acc["increase"], acc["mesh"], acc["body"]))
    return out


# =============================================================================== blend shape splits
def hat_weights(values, centers):
    """Partition of unity over sorted 1D centers (piecewise linear, clamped at the ends): lip sections
    that sum back to the master shape (antCGi's 0.8/0.2, 0.7/0.3 hand-typed loops, RbQM82Ta6zE
    00:23:36, as a function [added]). Returns one list of len(centers) weights per value."""
    order = sorted(range(len(centers)), key=lambda k: centers[k])
    cs = [centers[k] for k in order]
    out = []
    for x in values:
        w = [0.0] * len(centers)
        if x <= cs[0]:
            w[order[0]] = 1.0
        elif x >= cs[-1]:
            w[order[-1]] = 1.0
        else:
            for k in range(len(cs) - 1):
                if cs[k] <= x <= cs[k + 1]:
                    u = (x - cs[k]) / (cs[k + 1] - cs[k]) if cs[k + 1] > cs[k] else 0.0
                    w[order[k]] += 1.0 - u
                    w[order[k + 1]] += u
                    break
        out.append(w)
    return out


def side_weights(points, axis=0, width=0.5):
    """(left, right) complementary weights with a smooth band of +-width around the centre line."""
    left = [smoothstep(-width, width, p[axis]) for p in points]
    return left, [1.0 - x for x in left]


def split_targets(base, master, sections):
    """Section target point lists base + (master - base) * w_s. sections: per-vertex weight lists that
    must sum to 1 where the master moves; then the sections at weight 1 recreate the master exactly
    (antCGi's generator, 00:31:59)."""
    out = []
    for w in sections:
        out.append([_add(b, _mul(_sub(m, b), w[v])) for v, (b, m) in enumerate(zip(base, master))])
    return out


def split_error(base, master, targets):
    """Max |sum of section deltas - master delta| (antCGi's visual sum test made exact)."""
    m = 0.0
    for v in range(len(base)):
        s = (0.0, 0.0, 0.0)
        for t in targets:
            s = _add(s, _sub(t[v], base[v]))
        m = max(m, _dist(s, _sub(master[v], base[v])))
    return m


# =============================================================================== linear skinning maths
def skin_matrices(bind_pre, world):
    """Per influence: bindPreMatrix * worldMatrix (the matrix a skinCluster applies to a rest point)."""
    return [mat_mul(b, m) for b, m in zip(bind_pre, world)]


def lbs_points(rest, W, skin_mats):
    """Linear blend skinning in Python (reference and tests). Assumes an identity geometry matrix."""
    out = []
    for p, row in zip(rest, W):
        x = y = z = 0.0
        for i, w in row.items():
            q = xform_point(p, skin_mats[i])
            x += w * q[0]
            y += w * q[1]
            z += w * q[2]
        out.append((x, y, z))
    return out


def invert_deltas(W, skin_mats, deltas, verts=None):
    """Rest-space deltas that reproduce posed-space deltas under linear skinning:
    d_rest = d_pose * L^-1 with L the blended 3x3 skinning matrix of the vertex. This is what a
    pre-deformation corrective needs (it 'fixes the original mesh', Maya 2027 Help). Returns
    (deltas, singular_vertices)."""
    out = [(0.0, 0.0, 0.0)] * len(deltas)
    singular = []
    vs = range(len(deltas)) if verts is None else verts
    for v in vs:
        d = deltas[v]
        if d == (0.0, 0.0, 0.0):
            continue
        m = [0.0] * 16
        for i, w in W[v].items():
            s = skin_mats[i]
            for k in (0, 1, 2, 4, 5, 6, 8, 9, 10):
                m[k] += w * s[k]
        inv, det = _mat3_inverse(m)
        if inv is None:
            singular.append(v)
            continue
        out[v] = (d[0] * inv[0] + d[1] * inv[3] + d[2] * inv[6],
                  d[0] * inv[1] + d[1] * inv[4] + d[2] * inv[7],
                  d[0] * inv[2] + d[1] * inv[5] + d[2] * inv[8])
    return out, singular


# =============================================================================== joints inside (pure)
def _ray_hits(points, tris, p, axis):
    u, v = [d for d in (0, 1, 2) if d != axis]
    pu, pv = p[u] + 1.234567e-5, p[v] + 2.345678e-5          # jitter off edges [added]
    hits = 0
    for a, b, c in tris:
        A, B, C = points[a], points[b], points[c]
        if (pu < A[u] and pu < B[u] and pu < C[u]) or (pu > A[u] and pu > B[u] and pu > C[u]):
            continue
        if (pv < A[v] and pv < B[v] and pv < C[v]) or (pv > A[v] and pv > B[v] and pv > C[v]):
            continue
        den = (B[u] - A[u]) * (C[v] - A[v]) - (C[u] - A[u]) * (B[v] - A[v])
        if abs(den) < 1e-18:
            continue
        l1 = ((B[u] - pu) * (C[v] - pv) - (C[u] - pu) * (B[v] - pv)) / den
        l2 = ((C[u] - pu) * (A[v] - pv) - (A[u] - pu) * (C[v] - pv)) / den
        l3 = 1.0 - l1 - l2
        if l1 < 0.0 or l2 < 0.0 or l3 < 0.0:
            continue
        if l1 * A[axis] + l2 * B[axis] + l3 * C[axis] > p[axis]:
            hits += 1
    return hits


def point_inside(points, tris, p):
    """Ray-parity test along +X, +Y and +Z, majority vote (robust to one grazing ray) [added]."""
    return sum(_ray_hits(points, tris, p, ax) % 2 for ax in (0, 1, 2)) >= 2


def joints_inside(points, tris, joint_positions):
    """{joint: inside?}. Heat Map gives no weight to joints outside the mesh; Geodesic Voxel needs every
    joint inside (Maya 2027 Help, Bind methods; Geodesic Voxel binding)."""
    return {j: point_inside(points, tris, p) for j, p in joint_positions.items()}


# =============================================================================== Maya glue
def _cmds():
    import maya.cmds as cmds
    return cmds


def _om():
    import maya.api.OpenMaya as om
    return om


def _oma():
    import maya.api.OpenMayaAnim as oma
    return oma


class LayersPresentError(RuntimeError):
    pass


def resolve_mesh(name):
    """(shape, transform) long names; from scenario-maya-expert's mx_audit (shared toolkit)."""
    import mx_audit
    return mx_audit.resolve_mesh(name)


def _sel(name):
    om = _om()
    s = om.MSelectionList()
    s.add(name)
    return s


def _dag(name):
    return _sel(name).getDagPath(0)


def _mobj(name):
    return _sel(name).getDependNode(0)


def mesh_points(mesh, world=True):
    """Current (deformed) points of the visible shape, cm."""
    om = _om()
    shape = resolve_mesh(mesh)[0]
    pts = om.MFnMesh(_dag(shape)).getPoints(om.MSpace.kWorld if world else om.MSpace.kObject)
    return [(p.x, p.y, p.z) for p in pts]


def mesh_topology(mesh, world=True):
    """build_topology() of the visible shape at the current time, plus "shape" and "transform"."""
    om = _om()
    shape, xf = resolve_mesh(mesh)
    fn = om.MFnMesh(_dag(shape))
    counts, connects = fn.getVertices()
    counts, connects = list(counts), list(connects)
    faces, k = [], 0
    for c in counts:
        faces.append(connects[k:k + c])
        k += c
    topo = build_topology(mesh_points(shape, world), faces)
    topo["shape"], topo["transform"] = shape, xf
    return topo


def skin_clusters(mesh):
    """skinCluster nodes deforming the mesh, nearest to the output first (the most recently added
    cluster is listed first in Maya's own tools, Maya 2027 Help) [verify order]."""
    cmds = _cmds()
    shape = resolve_mesh(mesh)[0]
    hist = cmds.listHistory(shape, pruneDagObjects=True) or []
    return [h for h in hist if cmds.nodeType(h) == "skinCluster"]


def skin_cluster(mesh, index=0):
    scs = skin_clusters(mesh)
    if not scs:
        raise ValueError("%s has no skinCluster" % mesh)
    return scs[index]


def _skin_fn(sc):
    return _oma().MFnSkinCluster(_mobj(sc))


def _skin_path(fn, shape=None):
    try:
        return fn.getPathAtIndex(0)
    except Exception:
        if shape is None:
            raise
        return _dag(shape)


def influences(sc):
    """(names, logical indices) in physical order."""
    fn = _skin_fn(sc)
    paths = fn.influenceObjects()
    return [p.partialPathName() for p in paths], [int(fn.indexForInfluenceObject(p)) for p in paths]


def skin_settings(sc):
    cmds = _cmds()
    out = {}
    for a in ("skinningMethod", "normalizeWeights", "maxInfluences", "maintainMaxInfluences",
              "weightDistribution", "envelope"):
        try:
            out[a] = cmds.getAttr("%s.%s" % (sc, a))
        except Exception as exc:
            out[a] = "n/a (%s)" % exc
    return out


def _vertex_component(n, verts=None):
    om = _om()
    fn = om.MFnSingleIndexedComponent()
    comp = fn.create(om.MFn.kMeshVertComponent)
    if verts is None:
        fn.setCompleteData(n)
    else:
        fn.addElements(sorted(verts))
    return comp


def read_weights(sc, shape=None, verts=None):
    """Weights of a skinCluster through MFnSkinCluster.getWeights (fast), falling back to reading the
    weightList plugs. Rows are indexed by vertex id (full list) unless verts is given, then rows
    follow sorted(verts)."""
    om = _om()
    fn = _skin_fn(sc)
    path = _skin_path(fn, shape)
    n = om.MFnMesh(path).numVertices
    names, logical = influences(sc)
    k = len(names)
    method = "MFnSkinCluster.getWeights"
    try:
        flat, kk = fn.getWeights(path, _vertex_component(n, verts))
        rows = dense_to_rows(list(flat), int(kk))
    except Exception as exc:
        method = "weightList plugs (%s)" % exc
        cmds = _cmds()
        phys_of = {li: pi for pi, li in enumerate(logical)}
        rows = []
        for v in (sorted(verts) if verts is not None else range(n)):
            plug = "%s.weightList[%d].weights" % (sc, v)
            idx = cmds.getAttr(plug, multiIndices=True) or []
            vals = [cmds.getAttr("%s[%d]" % (plug, li)) for li in idx]
            rows.append({phys_of[li]: w for li, w in zip(idx, vals) if li in phys_of and w > 0.0})
    return {"skinCluster": sc, "shape": path.fullPathName(), "influences": names, "logical": logical,
            "weights": rows, "vertex_count": n, "verts": sorted(verts) if verts is not None else None,
            "method": method, "k": k}


def write_weights(sc, W, shape=None, verts=None, normalize=False, allow_layers=False):
    """Write rows (full per-vertex list, physical influence indices) with MFnSkinCluster.setWeights.
    Refuses when Skin Tools layers exist on the cluster (the layer system recomputes the cluster's
    weights and blocks the classic tools, Maya 2027 Help), unless allow_layers. OpenMaya writes are
    NOT undoable: export_weights_json() first in a GUI session. Falls back to skinPercent."""
    om = _om()
    if not allow_layers:
        layers = skin_layers_node(sc)
        if layers:
            raise LayersPresentError("%s has Skin Tools layers (%s): delete_skin_layers() first, or write "
                                     "through st_* functions" % (sc, layers))
    fn = _skin_fn(sc)
    path = _skin_path(fn, shape)
    n = om.MFnMesh(path).numVertices
    names, logical = influences(sc)
    k = len(names)
    vs = sorted(verts) if verts is not None else list(range(n))
    flat = om.MDoubleArray(len(vs) * k, 0.0)
    for r, v in enumerate(vs):
        for i, w in W[v].items():
            flat[r * k + i] = w
    try:
        fn.setWeights(path, _vertex_component(n, vs if verts is not None else None),
                      om.MIntArray(list(range(k))), flat, normalize)
        return {"method": "MFnSkinCluster.setWeights", "vertices": len(vs)}
    except Exception as exc:
        cmds = _cmds()
        shp = path.fullPathName()
        for v in vs:
            tv = [(names[i], w) for i, w in W[v].items()]
            cmds.skinPercent(sc, "%s.vtx[%d]" % (shp, v), transformValue=tv, zeroRemainingInfluences=True,
                             normalize=False)                                        # [verify flags]
        return {"method": "skinPercent fallback (%s)" % exc, "vertices": len(vs)}


def orig_shape(mesh):
    """The intermediate 'Orig' shape feeding the deformer chain (rest geometry)."""
    cmds = _cmds()
    shape, xf = resolve_mesh(mesh)
    cands = []
    for s in cmds.listRelatives(xf, shapes=True, fullPath=True) or []:
        if cmds.getAttr(s + ".intermediateObject") and not cmds.listConnections(s + ".inMesh", source=True,
                                                                                 destination=False):
            cands.append(s)
    for s in cands:
        if cmds.listConnections(s + ".worldMesh", s + ".outMesh", source=False, destination=True):
            return s
    return cands[0] if cands else None


def rest_points(mesh, world=True):
    """Points of the Orig shape (world uses the transform's matrix)."""
    om = _om()
    o = orig_shape(mesh)
    if o is None:
        return mesh_points(mesh, world)
    return [(p.x, p.y, p.z) for p in om.MFnMesh(_dag(o)).getPoints(om.MSpace.kWorld if world else om.MSpace.kObject)]


def _long(n):
    cmds = _cmds()
    found = cmds.ls(n, long=True) or []
    if not found:
        raise ValueError("no node %s" % n)
    return found[0]


def world_matrix(node, time=None):
    cmds = _cmds()
    if time is None:
        return tuple(cmds.getAttr(node + ".worldMatrix[0]"))
    return tuple(cmds.getAttr(node + ".worldMatrix[0]", time=time))


def bone_children(joints):
    """{joint: child joint used as the bone end, or None}. Several children: the one that continues
    the parent direction best [added]."""
    cmds = _cmds()
    out = {}
    for j in joints:
        lj = _long(j)
        kids = cmds.listRelatives(lj, children=True, type="joint", fullPath=True) or []
        if not kids:
            out[j] = None
            continue
        if len(kids) == 1:
            out[j] = kids[0]
            continue
        p = cmds.xform(lj, q=True, ws=True, t=True)
        par = (cmds.listRelatives(lj, parent=True, fullPath=True) or [None])[0]
        direction = _sub(p, cmds.xform(par, q=True, ws=True, t=True)) if par else (0.0, 1.0, 0.0)
        out[j] = max(kids, key=lambda c: _dot(_unit(_sub(cmds.xform(c, q=True, ws=True, t=True), p)), _unit(direction)))
    return out


def bone_segments(names, children=None, time=None):
    """{physical index: (joint world position, child world position or None)}."""
    children = bone_children(names) if children is None else children
    out = {}
    for i, n in enumerate(names):
        m = world_matrix(_long(n), time)
        c = children.get(n)
        end = None
        if c:
            cm = world_matrix(c, time)
            end = (cm[12], cm[13], cm[14])
        out[i] = ((m[12], m[13], m[14]), end)
    return out


BIND_METHODS = {"closest": 0, "hierarchy": 1, "heat": 2, "geodesic": 3}


def bind(mesh, joints, method="heat", max_influences=None, obey_max=False, skin_method=0, normalize=1,
         heatmap_falloff=None, dropoff=None, multi=False, name=None, voxel_resolution=256, voxel_falloff=0.2,
         init_layers=False):
    """skinCluster with every setting explicit (cmds and UI defaults differ, Maya 2027 Help).
    method: closest | hierarchy | heat | geodesic (bindMethod 3 is followed by geomBind, as the
    command page requires). obey_max off by default: experts paint freely and enforce the engine
    cap at the end (Jao 00:09:01; Burton 00:51:55). Returns {"skinCluster", "notes", ...}."""
    cmds = _cmds()
    kw = dict(toSelectedBones=True, bindMethod=BIND_METHODS[method], skinMethod=skin_method,
              normalizeWeights=normalize)
    if max_influences:
        kw["maximumInfluences"] = int(max_influences)
        kw["obeyMaxInfluences"] = bool(obey_max)
    if heatmap_falloff is not None and method == "heat":
        kw["heatmapFalloff"] = float(heatmap_falloff)
    if dropoff:
        kw["dropoffRate"] = float(dropoff)
    if multi:
        kw["multi"] = True
    if name:
        kw["name"] = name
    res = cmds.skinCluster(list(joints), mesh, **kw)
    sc = res[0] if isinstance(res, (list, tuple)) else res
    notes = []
    if method == "geodesic":
        gkw = dict(bindMethod=3, falloff=voxel_falloff, geodesicVoxelParams=(int(voxel_resolution), True))
        if max_influences:
            gkw["maxInfluences"] = int(max_influences)
        try:
            cmds.geomBind(sc, **gkw)                                              # [verify flags]
        except Exception as exc:
            notes.append("geomBind failed (%s): weights are the skinCluster defaults; retry in the GUI or use heat"
                         % exc)
    if init_layers:
        try:
            st_init_layers(sc)
        except Exception as exc:
            notes.append("Skin Tools layers not initialized: %s" % exc)
    return {"skinCluster": sc, "method": method, "flags": kw, "notes": notes, "settings": skin_settings(sc)}


def bind_precheck(mesh, joints, method="heat"):
    """Checks that decide the bind method before binding: joints inside the mesh (ray parity),
    shell normals (signed volume), non-manifold and lamina geometry, shells, frozen transform,
    non-deformer history, joints driven by connections (Go To Bind Pose blockers)."""
    cmds = _cmds()
    shape, xf = resolve_mesh(mesh)
    topo = mesh_topology(shape)
    pos = {j: tuple(cmds.xform(_long(j), q=True, ws=True, t=True)) for j in joints}
    inside = joints_inside(topo["points"], topo["tris"], pos)
    outside = sorted(j for j, ok in inside.items() if not ok)
    vols = shell_volumes(topo["points"], topo["tris"], topo["shells"])
    inward = sorted(s for s, v in vols.items() if v < 0.0)
    nmv = cmds.polyInfo(shape, nonManifoldVertices=True) or []
    nme = cmds.polyInfo(shape, nonManifoldEdges=True) or []
    lam = cmds.polyInfo(shape, laminaFaces=True) or []
    borders = sum(1 for fs in topo["edge_faces"] if len(fs) == 1)
    frozen = (all(abs(x) < 1e-5 for x in cmds.getAttr(xf + ".translate")[0] + cmds.getAttr(xf + ".rotate")[0]) and
              all(abs(x - 1.0) < 1e-5 for x in cmds.getAttr(xf + ".scale")[0]))
    benign = ("groupParts", "groupId", "dagPose", "objectSet", "tweak")
    hist = [h for h in (cmds.listHistory(shape, pruneDagObjects=True) or [])
            if cmds.nodeType(h) not in benign and "geometryFilter" not in (cmds.nodeType(h, inherited=True) or [])]
    driven = sorted(j for j in joints if any(cmds.listConnections("%s.%s" % (_long(j), a), source=True, destination=False)
                                            for a in ("rotate", "translate", "rx", "ry", "rz", "tx", "ty", "tz")))
    problems = []
    if method == "geodesic":
        if outside:
            problems.append("error: joints outside the mesh break geodesic distances: %s" % outside[:10])
        if inward:
            problems.append("error: %d shells have inward normals (Geodesic Voxel needs outward front faces)" % len(inward))
    else:
        if outside:
            problems.append("warn: joints outside the mesh get no Heat Map weight: %s" % outside[:10])
        if method == "heat" and (nmv or nme or lam or topo["shell_count"] > 1 or borders):
            problems.append("warn: non-manifold, lamina, open or multi-shell geometry: prefer geodesic (Maya 2027 Help)")
    if not frozen:
        problems.append("warn: mesh transform not frozen (weights and copies assume an identity geometry matrix)")
    if hist:
        problems.append("warn: non-deformer history on the mesh: %s (Delete Non-Deformer History first)" % hist[:5])
    if driven:
        problems.append("info: joints driven by connections (constraints block Go To Bind Pose): %s" % driven[:10])
    return {"mesh": xf, "method": method, "joints": len(joints), "joints_outside": outside,
            "shells": topo["shell_count"], "inward_shells": inward, "non_manifold_vertices": len(nmv),
            "non_manifold_edges": len(nme), "lamina_faces": len(lam), "border_edges": borders,
            "frozen": frozen, "history": hist, "driven_joints": driven, "problems": problems}


# ------------------------------------------------------------------------------- Skin Tools (2027)
# The Maya 2027 Developer Help page "Skin Tools Python API" names the `ngSkinTools2.api` namespace
# (`from ngSkinTools2 import api`) and ships its source in <maya>/runTime/plug-ins/ngSkinTools/scripts/
# ngSkinTools2 (doc-level confirmation, retrieved 2026-09-24; not yet imported in Maya). The other
# module and plug-in names are fallbacks for the probe only.
ST_MODULES = ("ngSkinTools2.api", "maya.app.skinTools.api", "skinTools.api")
ST_PLUGINS = ("ngSkinTools2", "ngSkinTools", "skinTools")                             # [verify plug-in name]
LAYER_NODE_RE = re.compile(r"(?i)(ngst|skin_?layer|skintool)")
_ST_CACHE = {}


def skin_tools_probe(load=True):
    """What this Maya exposes for Skin Tools: candidate plug-ins, node types, commands and Python API
    modules. The 2027 dev help lists a 'Skin Tools Python API' page with the slug ngSkinTools2;
    its content was not saved, so module and names are probed, not assumed."""
    import importlib
    cmds = _cmds()
    rep = {"plugins": {}, "listed_plugins": [], "node_types": [], "commands": [], "modules": {}, "api": None}
    try:
        rep["listed_plugins"] = [p for p in (cmds.pluginInfo(q=True, listPlugins=True) or [])
                                 if re.search(r"(?i)skin|ngst", p)]
    except Exception as exc:
        rep["listed_plugins"] = ["error: %s" % exc]
    for p in ST_PLUGINS:
        entry = {}
        try:
            entry["loaded_before"] = bool(cmds.pluginInfo(p, q=True, loaded=True))
        except Exception as exc:
            entry["loaded_before"] = "error: %s" % exc
        if load and entry.get("loaded_before") is False:
            try:
                cmds.loadPlugin(p, quiet=True)
                entry["loaded"] = True
            except Exception as exc:
                entry["loaded"] = "error: %s" % exc
        rep["plugins"][p] = entry
    try:
        rep["node_types"] = sorted(t for t in cmds.allNodeTypes() if LAYER_NODE_RE.search(t))
    except Exception as exc:
        rep["node_types"] = ["error: %s" % exc]
    rep["commands"] = sorted(c for c in dir(cmds) if re.search(r"(?i)ngst|skinlayer|skintool", c))
    for m in ST_MODULES:
        try:
            mod = importlib.import_module(m)
            names = sorted(n for n in dir(mod) if not n.startswith("_"))
            rep["modules"][m] = {"ok": True, "file": getattr(mod, "__file__", None), "names": names}
            if rep["api"] is None and "init_layers" in names:
                rep["api"] = m
        except Exception as exc:
            rep["modules"][m] = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    return rep


def skin_tools_api(required=False):
    """The Skin Tools Python API module, `ngSkinTools2.api` per the Maya 2027 Developer Help (init_layers,
    Layers, NamedPaintTarget, assign_from_closest_joint, flood_weights, PaintMode, PaintModeSettings,
    export_json, import_json, transfer_layers, VertexTransferMode, InfluenceMappingConfig, target_info), or
    None. Loads the plug-in if the import fails at first. Doc-confirmed names, not yet run in Maya."""
    import importlib
    if "api" not in _ST_CACHE:
        api = None
        for m in ST_MODULES:
            try:
                mod = importlib.import_module(m)
            except Exception:
                continue
            if hasattr(mod, "init_layers"):
                api = mod
                break
        if api is None:
            cmds = _cmds()
            for p in ST_PLUGINS:
                try:
                    cmds.loadPlugin(p, quiet=True)
                except Exception:
                    continue
            for m in ST_MODULES:
                try:
                    mod = importlib.import_module(m)
                except Exception:
                    continue
                if hasattr(mod, "init_layers"):
                    api = mod
                    break
        _ST_CACHE["api"] = api
    if required and _ST_CACHE["api"] is None:
        raise RuntimeError("no Skin Tools Python API found (run skin_tools_probe()); use block_regions() on a "
                           "plain skinCluster instead")
    return _ST_CACHE["api"]


def _st_get(api, name, submodules=("paint", "tools", "layers", "import_export", "transfer", "target_info")):
    import importlib
    if hasattr(api, name):
        return getattr(api, name)
    for sm in submodules:
        try:
            mod = importlib.import_module(api.__name__ + "." + sm)
        except Exception:
            continue
        if hasattr(mod, name):
            return getattr(mod, name)
    raise AttributeError("Skin Tools API has no %s [verify]" % name)


def skin_layers_node(sc):
    """Skin Tools layer data nodes attached to the cluster (empty list: no layers)."""
    cmds = _cmds()
    found = set()
    for n in cmds.listConnections(sc, source=True, destination=True) or []:
        try:
            if LAYER_NODE_RE.search(cmds.nodeType(n)):
                found.add(n)
        except Exception:
            pass
    api = _ST_CACHE.get("api")
    if api is not None:
        try:
            dn = _st_get(api, "get_related_data_node")(sc)
            if dn:
                found.add(dn)
        except Exception:
            pass
    return sorted(found)


def st_init_layers(target):
    """api.init_layers(target): 'Does nothing if layers are already attached' (2027 Developer Help)."""
    return skin_tools_api(required=True).init_layers(target)


def st_influence_indices(target):
    """{short joint name: logical index} from api.target_info.list_influences (InfluenceInfo)."""
    api = skin_tools_api(required=True)
    out = {}
    for info in _st_get(api, "list_influences")(target):
        name = getattr(info, "name", None) or getattr(info, "path", "")
        out[short_name(str(name))] = int(info.logicalIndex)
    return out


def st_add_region_layer(mesh, name, region_joints=None, verts=None, mask=None, smooth=None, rows=None):
    """One Skin Tools layer the way the experts build them: fill (assign from closest joint over the
    region's influences, or exact rows), smooth, then the mask as alpha (Makauskas 00:07:57;
    Jao 00:18:20; Maya 2027 Help quickstart). assign_from_closest_joint works on the component
    selection or the whole mesh, so this function selects `verts` and restores the selection.
    region_joints: joints to assign from (fill).
    smooth: {"intensity": 0.5, "iterations": 3, "volume": False} (volume = smoothing across shells,
    PaintModeSettings.use_volume_neighbours). mask: per-vertex list. rows: W (physical indices) written
    influence by influence with cumulative normalization, then read back [verify behaviour].
    API names as documented in the Maya 2027 Developer Help (Skin Tools Python API); not yet run."""
    cmds = _cmds()
    api = skin_tools_api(required=True)
    shape, xf = resolve_mesh(mesh)
    sc = skin_cluster(shape)
    layers = api.init_layers(sc)
    layer = layers.add(name)
    idx = st_influence_indices(sc)
    report = {"layer": name}
    prev_sel = cmds.ls(selection=True, long=True) or []
    try:
        if verts is not None:
            cmds.select(["%s.vtx[%d]" % (shape, v) for v in verts], replace=True)
        else:
            cmds.select(clear=True)
        if region_joints:
            missing = [j for j in region_joints if short_name(j) not in idx]
            if missing:
                raise ValueError("influences not in %s: %s" % (sc, missing))
            _st_get(api, "assign_from_closest_joint")(sc, layer, influences=[idx[short_name(j)] for j in region_joints])
        if smooth:
            PMS, PM = _st_get(api, "PaintModeSettings"), _st_get(api, "PaintMode")
            s = PMS()
            s.mode = PM.smooth
            s.intensity = float(smooth.get("intensity", 0.5))
            s.iterations = int(smooth.get("iterations", 1))
            s.use_volume_neighbours = bool(smooth.get("volume", False))
            if verts is not None:
                s.limit_to_component_selection = True
            _st_get(api, "flood_weights")(target=layer, settings=s)
    finally:
        if prev_sel:
            cmds.select(prev_sel, replace=True)
        else:
            cmds.select(clear=True)
    if rows is not None:
        names, logical = influences(sc)
        order = sorted({i for r in rows for i in r})
        cum = [0.0] * len(rows)
        for i in order:
            vals = []
            for v, r in enumerate(rows):
                w = r.get(i, 0.0)
                cum[v] += w
                vals.append(w / cum[v] if cum[v] > 0.0 else 0.0)
            layer.set_weights(logical[i], vals)
        err = 0.0
        for i in order:
            got = layer.get_weights(logical[i]) or []
            for v, r in enumerate(rows):
                if v < len(got):
                    err = max(err, abs(got[v] - r.get(i, 0.0)))
        report["rows_readback_max_error"] = err
    if mask is not None:
        layer.set_weights(_st_get(api, "NamedPaintTarget").MASK, [float(x) for x in mask])
    report["layer_object"] = layer
    return report


def st_flood(mesh, layer, mode="replace", influence=None, intensity=1.0, iterations=1, verts=None,
             volume=False, influences=None):
    """One Skin Tools flood on a layer, restricted to `verts` through the component selection (as in
    the 2027 Help example): mode replace | add | scale | smooth | sharpen; influence = a joint name,
    "mask" (the layer alpha) or None for smooth and sharpen. Jao Replace-floods the mask on the
    region's vertices [00:13:53]; Makauskas volume-smooths only the accessory [00:21:29]."""
    cmds = _cmds()
    api = skin_tools_api(required=True)
    shape = resolve_mesh(mesh)[0]
    PMS, PM = _st_get(api, "PaintModeSettings"), _st_get(api, "PaintMode")
    s = PMS()
    s.mode = getattr(PM, mode)
    s.intensity = float(intensity)
    s.iterations = int(iterations)
    s.use_volume_neighbours = bool(volume)
    kw = {"target": layer, "settings": s}
    if influence == "mask":
        kw["influence"] = _st_get(api, "NamedPaintTarget").MASK
    elif influence is not None:
        kw["influence"] = st_influence_indices(skin_cluster(shape))[short_name(influence)]
    if influences:
        idx = st_influence_indices(skin_cluster(shape))
        kw["influences"] = [idx[short_name(j)] for j in influences]
    prev = cmds.ls(selection=True, long=True) or []
    try:
        if verts is not None:
            cmds.select(["%s.vtx[%d]" % (shape, v) for v in verts], replace=True)
        else:
            cmds.select(clear=True)
        _st_get(api, "flood_weights")(**kw)
    finally:
        if prev:
            cmds.select(prev, replace=True)
        else:
            cmds.select(clear=True)
    return kw.get("influence")


def st_export_json(mesh, path):
    """Export layers (Skin Tools JSON, api.export_json); Jao keeps layered work this way (00:31:49)."""
    api = skin_tools_api(required=True)
    _st_get(api, "export_json")(skin_cluster(mesh), file=path)
    return path


def st_import_json(mesh, path, mode="vertexId"):
    """Import layers (api.import_json, existing layers preserved); mode vertexId for identical meshes
    (Jao's proxy trick, 00:36:26), closestPoint or uvSpace otherwise."""
    api = skin_tools_api(required=True)
    VTM = _st_get(api, "VertexTransferMode")
    _st_get(api, "import_json")(skin_cluster(mesh), file=path, vertex_transfer_mode=getattr(VTM, mode))
    return path


def delete_skin_layers(sc, verify=True, tol=1e-6):
    """Remove the Skin Tools layer data from a cluster and prove the evaluated weights survived (the
    Help promises they do; this checks and restores them if not). Needed before classic tools,
    copySkinWeights, write_weights, or a handoff (Maya 2027 Help, Delete Skin Layers)."""
    cmds = _cmds()
    nodes = skin_layers_node(sc)
    if not nodes:
        return {"deleted": [], "changed": False}
    before = read_weights(sc)["weights"] if verify else None
    cmds.delete(nodes)
    _ST_CACHE.pop("layers", None)
    rep = {"deleted": nodes, "remaining": skin_layers_node(sc)}
    if verify:
        after = read_weights(sc)["weights"]
        diff, where = max_row_difference(before, after)
        rep.update(max_diff=diff, vertex=where, changed=diff > tol)
        if diff > tol and not rep["remaining"]:
            write_weights(sc, before)
            rep["restored"] = True
    return rep


# ------------------------------------------------------------------------------- authoring on a plain cluster
def block_regions(mesh, plan, sc=None, write=True, neighbors=None):
    """Region-by-region skinning without a brush, the layer workflow computed in memory and written
    once: for each region (bottom to top) fill it by closest bone or an even twist ramp, smooth it,
    mask it, composite (Makauskas's region order torso > shoulders > upper arm > forearm > hand >
    thumb > fingers > head > legs > feet, 00:01:11).
    plan: [{"name", "influences": [joints] (closest bone) or "chain": [joints] (twist ramp),
            "verts": optional [ids], "smooth": {"iterations": 2, "strength": 0.5, "verts": optional},
            "mask": None | list | {"along": [jointA, jointB, t0, t1]} | {"verts": [...], "soften": 2},
            "opacity": 1.0}]
    Returns {"weights", "layers", "audit", "written"}. Needs a cluster without Skin Tools layers."""
    sc = sc or skin_cluster(mesh)
    shape = resolve_mesh(mesh)[0]
    names, _ = influences(sc)
    phys = {short_name(n): i for i, n in enumerate(names)}
    P = rest_points(shape)
    drift = max(_dist(a, b) for a, b in zip(P, mesh_points(shape)))
    if drift > 1e-3:
        raise RuntimeError("mesh is %.3g cm away from its rest shape: go to the bind pose first "
                           "(cmds.dagPose(root, restore=True, bindPose=True)) [verify]" % drift)
    topo = None
    if neighbors is None:
        topo = mesh_topology(shape)
        neighbors = topo["neighbors"]
    children = bone_children(names)
    segs = bone_segments(names, children)
    n = len(P)
    stack, summary = [], []
    for spec in plan:
        if "chain" in spec:
            ch = [(phys[short_name(j)], segs[phys[short_name(j)]][0]) for j in spec["chain"]]
            Wl = chain_ramp(P, ch, verts=spec.get("verts"), ease=spec.get("ease", False))
        else:
            infl = [phys[short_name(j)] for j in spec["influences"]]
            Wl = closest_bone_block(P, [(i, segs[i][0], segs[i][1]) for i in infl], verts=spec.get("verts"))
        sm = spec.get("smooth")
        if sm:
            Wl = smooth_weights(Wl, neighbors, iterations=sm.get("iterations", 2), strength=sm.get("strength", 0.5),
                                verts=sm.get("verts", spec.get("verts")))
        m = spec.get("mask")
        if isinstance(m, dict) and "along" in m:
            a, b, t0, t1 = m["along"]
            m = mask_along(P, segs[phys[short_name(a)]][0], segs[phys[short_name(b)]][0], t0, t1)
        elif isinstance(m, dict) and "verts" in m:
            m = smooth_scalar(mask_from_verts(n, m["verts"]), neighbors, iterations=m.get("soften", 0))
        stack.append({"name": spec.get("name"), "weights": Wl, "mask": m, "opacity": spec.get("opacity", 1.0)})
        summary.append({"name": spec.get("name"), "vertices": sum(1 for r in Wl if r)})
    W = composite_layers(n, stack)
    audit = audit_weights(W, names)
    written = write_weights(sc, W, shape) if write else None
    return {"weights": W, "layers": summary, "audit": audit, "written": written}


def prune_and_limit(mesh, max_influences=None, prune=THRESHOLDS["prune"], sc=None):
    """Prune small weights and enforce an influence cap on the weights, never through maximumInfluences
    (editing it wipes custom weights, Maya 2027 Help). Returns before and after audits."""
    sc = sc or skin_cluster(mesh)
    data = read_weights(sc)
    W0 = data["weights"]
    W = prune_rows(W0, prune) if prune else W0
    changed = 0
    if max_influences:
        W, changed = limit_influences(W, max_influences, prune=0.0)
    write_weights(sc, W)
    return {"before": audit_weights(W0, data["influences"], max_influences),
            "after": audit_weights(W, data["influences"], max_influences), "limited_vertices": changed}


def mirror_skin(mesh, axis=0, source="+", tol=0.01, sc=None, rules=SIDE_RULES, write=True):
    """Mirror weights with explicit vertex and influence maps (works where label association fails and
    reports what did not match). Classic Mirror Skin Weights is blocked while layers exist; use the
    Skin Tools Mirror tab or effect there (Maya 2027 Help)."""
    sc = sc or skin_cluster(mesh)
    data = read_weights(sc)
    P = rest_points(mesh)
    vmap, vmiss = mirror_vertex_map(P, axis, tol)
    imap, imiss = mirror_influence_map(data["influences"], rules)
    W, stats = mirror_weights(data["weights"], vmap, imap, P, axis, source)
    err, where = mirror_error(W, vmap, imap)
    if write:
        write_weights(sc, W)
    stats.update(unmatched_vertices=vmiss, unmatched_influences=imiss, mirror_error=err, worst_vertex=where)
    return stats


def label_joints(joints, rules=SIDE_RULES):
    """Set joint labels (side, type Other, otherType = name without side) so copySkinWeights
    influenceAssociation 'label' pairs sides [verify attribute enums: side 0 centre, 1 left, 2 right;
    type 18 other]."""
    cmds = _cmds()
    out = {}
    for j in joints:
        s = short_name(j)
        side, base = 0, s
        for kind, a, b in rules:
            if kind == "prefix" and (s.startswith(a) or s.startswith(b)):
                side, base = (1 if s.startswith(a) else 2), s[len(a) if s.startswith(a) else len(b):]
                break
            if kind == "suffix" and (s.endswith(a) or s.endswith(b)):
                side, base = (1 if s.endswith(a) else 2), s[:-len(a) if s.endswith(a) else -len(b)]
                break
        lj = _long(j)
        cmds.setAttr(lj + ".side", side)
        cmds.setAttr(lj + ".type", 18)
        cmds.setAttr(lj + ".otherType", base, type="string")
        out[j] = (side, base)
    return out


def copy_skin(src_mesh, dst_mesh, surface="closestPoint", influence=("oneToOne", "name", "closestJoint"),
              uv_space=None, bind_if_needed=True):
    """Burton's one-button skin copy (00:25:13): bind the destination to the source's influences if
    needed, then copySkinWeights with EXPLICIT associations (the command defaults to
    closestComponent while the UI defaults to Closest point on surface, Maya 2027 Help).
    Blocked on clusters with Skin Tools layers."""
    cmds = _cmds()
    src_sc = skin_cluster(src_mesh)
    names, _ = influences(src_sc)
    try:
        dst_sc = skin_cluster(dst_mesh)
    except ValueError:
        if not bind_if_needed:
            raise
        dst_sc = bind(dst_mesh, [_long(n) for n in names], method="closest")["skinCluster"]
    kw = dict(sourceSkin=src_sc, destinationSkin=dst_sc, noMirror=True, surfaceAssociation=surface,
              influenceAssociation=list(influence))
    if uv_space:
        kw["uvSpace"] = tuple(uv_space)
    cmds.copySkinWeights(**kw)
    return {"source": src_sc, "destination": dst_sc, "flags": kw}


# ------------------------------------------------------------------------------- weights JSON
def export_weights_json(mesh, path, sc=None, include_points=True):
    """Plain JSON (sparse rows, influence names, bind positions, rest points, settings) so weights
    survive rebuilds, mesh updates and rig changes (Jao 00:31:49: everything regenerable). The native
    alternative is cmds.deformerWeights(..., export=True) [verify its JSON format flag]."""
    cmds = _cmds()
    sc = sc or skin_cluster(mesh)
    data = read_weights(sc)
    infl = []
    for n, li in zip(data["influences"], data["logical"]):
        try:
            bpm = cmds.getAttr("%s.bindPreMatrix[%d]" % (sc, li))
            bp = mat_inverse(bpm)
            pos = [bp[12], bp[13], bp[14]]
        except Exception:
            pos = None
        infl.append({"name": short_name(n), "path": _long(n), "logical_index": li, "bind_position": pos})
    rec = {"format": FORMAT, "version": FORMAT_VERSION, "maya": cmds.about(version=True),
           "written": time.strftime("%Y-%m-%d %H:%M:%S"), "mesh": resolve_mesh(mesh)[1], "skinCluster": sc,
           "vertex_count": data["vertex_count"], "settings": skin_settings(sc), "influences": infl,
           "weights": [[[i, round(w, 8)] for i, w in sorted(r.items())] for r in data["weights"]]}
    if include_points:
        rec["points"] = [[round(c, 6) for c in p] for p in rest_points(mesh)]
    d = os.path.dirname(os.path.abspath(path))
    if not os.path.isdir(d):
        os.makedirs(d)
    with open(path, "w") as f:
        json.dump(rec, f)
    return {"path": path, "vertices": data["vertex_count"], "influences": len(infl)}


def import_weights_json(path, mesh, sc=None, vertex_mapping="auto", k=1, create=True, method="closest"):
    """Load export_weights_json() data onto `mesh`: by vertex index when the topology matches, else by
    closest rest point (k nearest, inverse-distance). Binds to the named joints when the mesh has no
    cluster (create), adds missing influences, then writes."""
    cmds = _cmds()
    with open(path) as f:
        rec = json.load(f)
    if rec.get("format") != FORMAT:
        raise ValueError("%s is not an %s file" % (path, FORMAT))
    src_names = [i["name"] for i in rec["influences"]]
    found, missing = {}, []
    for n in src_names:
        hits = cmds.ls(n, type="joint", long=True) or cmds.ls("*:" + n, type="joint", long=True) or []
        if len(hits) >= 1:
            found[n] = hits[0]
        else:
            missing.append(n)
    if missing:
        raise ValueError("joints missing in the scene: %s" % missing[:20])
    if sc is None:
        try:
            sc = skin_cluster(mesh)
        except ValueError:
            if not create:
                raise
            sc = bind(mesh, [found[n] for n in src_names], method=method)["skinCluster"]
    names, _ = influences(sc)
    have = {short_name(n) for n in names}
    for n in src_names:
        if n not in have:
            cmds.skinCluster(sc, e=True, addInfluence=found[n], weight=0.0)            # [verify]
    names, _ = influences(sc)
    phys = {short_name(n): i for i, n in enumerate(names)}
    src_W = [{phys[src_names[i]]: w for i, w in row} for row in rec["weights"]]
    dst_P = rest_points(mesh)
    mode = vertex_mapping
    if mode == "auto":
        mode = "index"
        if len(dst_P) != rec["vertex_count"]:
            mode = "closest"
        elif rec.get("points"):
            if max(_dist(tuple(a), b) for a, b in zip(rec["points"], dst_P)) > 1e-3:
                mode = "closest"
    stats = {}
    if mode == "index":
        if len(dst_P) != rec["vertex_count"]:
            raise ValueError("vertex counts differ (%d vs %d): use vertex_mapping='closest'" % (len(dst_P), rec["vertex_count"]))
        W = src_W
    else:
        if not rec.get("points"):
            raise ValueError("file has no points: export with include_points=True for closest mapping")
        W, stats = remap_by_closest([tuple(p) for p in rec["points"]], src_W, dst_P, k=k)
    write_weights(sc, W)
    return {"skinCluster": sc, "mapping": mode, "vertices": len(W), "stats": stats}


# ------------------------------------------------------------------------------- ROM in Maya
def key_rom(schedule, relative=False, tangent="linear", set_range=True):
    """Key a rom_schedule() on the rig: rest values read at the start frame, poses absolute (or
    rest + value with relative=True), linear tangents so in-betweens do not overshoot [added]."""
    cmds = _cmds()
    start = schedule["start"]
    rest, problems = {}, []
    for plug in schedule["plugs"]:
        try:
            rest[plug] = cmds.getAttr(plug, time=start)
        except Exception as exc:
            problems.append("%s: %s" % (plug, exc))
            continue
        if not cmds.getAttr(plug, settable=True) and not cmds.listConnections(plug, source=True, destination=False,
                                                                               type="animCurve"):
            problems.append("%s is locked or driven: key the control that drives it" % plug)
    if problems:
        raise ValueError("cannot key the ROM: %s" % problems)
    for plug, frame, val in schedule["keys"]:
        node, attr = plug.split(".", 1)
        value = rest[plug] if val is None else (rest[plug] + val if relative else val)
        cmds.setKeyframe(node, attribute=attr, time=frame, value=value, inTangentType=tangent,
                         outTangentType=tangent)
    if set_range:
        cmds.playbackOptions(minTime=start, maxTime=schedule["end"])
    return {"rest": rest, "poses": schedule["poses"], "start": start, "end": schedule["end"]}


def joint_limits(joints, axes=("rx", "ry", "rz")):
    """[{"node", "limits"}] for rom_from_limits(): axes whose min AND max rotation limits are enabled
    (Modify > Transformation Limits, or the joint's Limit Information) are included; others are left
    out so rom_from_limits() falls back to its default range and lists them as defaulted."""
    cmds = _cmds()
    out = []
    for j in joints:
        lim = {}
        for ax in axes:
            L = ax[1].upper()
            try:
                en = cmds.transformLimits(j, q=True, **{"enableRotation" + L: True})
                val = cmds.transformLimits(j, q=True, **{"rotation" + L: True})
            except Exception:
                continue
            if en and en[0] and en[1]:
                lim[ax] = (float(val[0]), float(val[1]))
        out.append({"node": j, "limits": lim})
    return out


def set_time(frame):
    _cmds().currentTime(frame, edit=True, update=True)


def penetration(acc_mesh, body_mesh, tol=None):
    """Vertices of an accessory or clothing shell inside the body (signed distance to the closest body
    point along its normal): Makauskas checks shirts and necklaces stay outside (00:06:24)."""
    om = _om()
    tol = THRESHOLDS["penetration"] if tol is None else tol
    body = om.MFnMesh(_dag(resolve_mesh(body_mesh)[0]))
    inside = 0
    for p in mesh_points(acc_mesh):
        mp = om.MPoint(*p)
        cp, nrm, _ = body.getClosestPointAndNormal(mp, om.MSpace.kWorld)
        if (mp - cp) * nrm < -tol:
            inside += 1
    return inside


def deformation_test(mesh, poses, rest_frame, sc=None, sections=None, rigid=None, accessories=None,
                     thresholds=None, max_influences=None):
    """Pose the rig at every frame of `poses` ([{"label", "frame"}], e.g. key_rom()["poses"]), compare
    with the rest frame and return {"poses": [...], "weights": audit, "verdict": [...]}.
    sections: [{"label": "L_forearm twist", "a": elbow joint, "b": wrist joint, "t": 0.5,
                "influences": optional joint list restricting the section}]
    rigid: {"L_sole": [vertex ids]}; accessories: [{"mesh": "shirt_geo", "body": "body_geo"}].
    Headless: points are read after currentTime; confirm the pose evaluated (max_displacement > 0)."""
    _cmds()
    shape, xf = resolve_mesh(mesh)
    sc = sc or skin_cluster(shape)
    data = read_weights(sc, shape)
    W, names = data["weights"], data["influences"]
    longs = [_long(n) for n in names]
    children = bone_children(names)
    set_time(rest_frame)
    topo = mesh_topology(shape)
    P0 = topo["points"]
    m0 = {i: world_matrix(longs[i]) for i in range(len(names))}
    segs0 = bone_segments(names, children)
    acc0 = [penetration(a["mesh"], a["body"]) for a in (accessories or [])]
    phys = {short_name(n): i for i, n in enumerate(names)}
    dom = dominant(W)
    out = []
    for pose in poses:
        set_time(pose["frame"])
        P1 = mesh_points(shape)
        moved = [i for i in range(len(names))
                 if max(abs(a - b) for a, b in zip(m0[i], world_matrix(longs[i]))) > 1e-6]
        segs1 = bone_segments(names, children)
        secs = []
        for s in sections or []:
            ia, ib = phys[short_name(s["a"])], phys[short_name(s["b"])]
            t = s.get("t", 0.5)
            a0, b0 = segs0[ia][0], segs0[ib][0]
            a1, b1 = segs1[ia][0], segs1[ib][0]
            verts = None
            if s.get("influences"):
                allowed = {phys[short_name(j)] for j in s["influences"]}
                verts = [v for v, d in enumerate(dom) if d in allowed]
            secs.append({"label": s.get("label", "%s-%s" % (s["a"], s["b"])),
                         "rest": (_lerp(a0, b0, t), _sub(b0, a0)), "pose": (_lerp(a1, b1, t), _sub(b1, a1)),
                         "verts": verts})
        met = pose_metrics(P0, P1, topo, W, names, thresholds, segs0, segs1, moved, secs, rigid)
        met["moved"] = [names[i] for i in moved]
        if accessories:
            met["penetration"] = []
            for a, base in zip(accessories, acc0):
                c = penetration(a["mesh"], a["body"])
                met["penetration"].append({"mesh": a["mesh"], "body": a["body"], "inside": c, "rest_inside": base,
                                           "increase": max(0, c - base)})
        out.append({"label": pose.get("label"), "frame": pose["frame"], "metrics": met})
    set_time(rest_frame)
    rep = {"mesh": xf, "skinCluster": sc, "rest_frame": rest_frame, "poses": out,
           "weights": audit_weights(W, names, max_influences), "thresholds": dict(THRESHOLDS, **(thresholds or {}))}
    rep["verdict"] = deformation_verdict(rep, thresholds)
    return rep


def pose_snapshots(mesh, frames, spacing=None, group="mxPoseSnapshots"):
    """Duplicate the posed mesh at each frame, side by side along +X, under one group: one
    mx_review.review() render then shows every ROM pose headless (no playblast in mayapy)."""
    cmds = _cmds()
    shape, xf = resolve_mesh(mesh)
    grp = group if cmds.objExists(group) else cmds.group(empty=True, name=group)
    lo, hi = bbox(mesh_points(shape))
    step = spacing or (hi[0] - lo[0]) * 1.25 + 1.0
    out = []
    for k, f in enumerate(frames):
        set_time(f)
        dup = cmds.duplicate(xf, name="%s_f%s" % (short_name(xf), str(f).replace(".", "_")), returnRootsOnly=True)[0]
        for s in cmds.listRelatives(dup, shapes=True, fullPath=True) or []:
            if cmds.getAttr(s + ".intermediateObject"):
                cmds.delete(s)
        for c in cmds.listRelatives(dup, children=True, type="transform", fullPath=True) or []:
            cmds.delete(c)
        for a in ("tx", "ty", "tz", "rx", "ry", "rz", "sx", "sy", "sz"):
            cmds.setAttr("%s.%s" % (dup, a), lock=False)
        dup = cmds.parent(dup, grp)[0]
        cmds.move(step * k, 0, 0, dup, relative=True, worldSpace=True)
        out.append(dup)
    return {"group": grp, "meshes": out, "spacing": step}


# ------------------------------------------------------------------------------- correctives
def reader_weight(local_m, axis, pose_vec, falloff):
    """Pure model of corrective_driver: 1 when `axis` carried by the local matrix points along
    `pose_vec`, falling linearly to 0 at `falloff` degrees."""
    ang = _angle_deg(xform_vector(axis, local_m), pose_vec)
    return _clamp(1.0 - ang / float(falloff))


def joint_drive(joint):
    """What moves a bind joint, which decides how a pose corrective must read it (Maya 2027 Help,
    Use controller-driven joints with pose space deformations): 'free' (its own keys or nothing),
    'channels' (rotate or translate driven by a constraint, pairBlend or direct connection from a
    control) or 'opm' (offsetParentMatrix connected: scenario-maya-rigging's matrix blend, channels stay 0).
    Returns {kind, sources}."""
    cmds = _cmds()
    lj = _long(joint)
    src = {}
    for a in ("rotate", "rotateX", "rotateY", "rotateZ", "translate", "translateX", "translateY", "translateZ",
              "offsetParentMatrix"):
        if not cmds.objExists(lj + "." + a):
            continue
        s = [x for x in (cmds.listConnections(lj + "." + a, s=True, d=False, plugs=True) or [])
             if not cmds.nodeType(x.split(".")[0]).startswith("animCurve")]
        if s:
            src[a] = s
    kind = "opm" if "offsetParentMatrix" in src else ("channels" if src else "free")
    return {"kind": kind, "sources": src}


def corrective_driver(joint, weight_plug, falloff=45.0, axis=(1.0, 0.0, 0.0), name=None, rest_time=None,
                      plug="dagLocalMatrix"):
    """Node pose reader for a corrective at the joint's CURRENT pose: weight 1 when the joint's aim
    axis (in parent space) matches the pose, 0 once it is `falloff` degrees away (vectorProduct ->
    angleBetween -> remapValue). Deterministic and inspectable; swing only (twist ignored). For twist
    or many poses use the Pose Editor or a swing-twist driver (Rudy 00:17:00) [added design].
    plug="dagLocalMatrix" (local matrix including the offsetParentMatrix) reads constraint-driven
    and OPM-driven bind joints alike; `.matrix` alone misses an OPM drive, whose channels stay 0,
    so the reader is stuck on or off [added; attribute from the 2027 transform node, verify on
    joints]. Pose a controller-driven
    joint through its controls, never by setAttr on the joint (joint_drive() says which it is).
    rest_time: a frame where the joint is at rest, to check the corrective is 0 there."""
    cmds = _cmds()
    lj = _long(joint)
    name = name or short_name(joint) + "_pose"
    if not cmds.objExists(lj + "." + plug):
        plug = "matrix"
    m = tuple(cmds.getAttr(lj + "." + plug))
    pose_vec = _unit(xform_vector(axis, m))
    vp = cmds.createNode("vectorProduct", name=name + "_aim_VP")
    cmds.setAttr(vp + ".operation", 3)                   # vector matrix product
    cmds.setAttr(vp + ".input1", *axis)
    cmds.setAttr(vp + ".normalizeOutput", 1)
    cmds.connectAttr(lj + "." + plug, vp + ".matrix")
    ab = cmds.createNode("angleBetween", name=name + "_AB")
    cmds.connectAttr(vp + ".output", ab + ".vector1")
    cmds.setAttr(ab + ".vector2", *pose_vec)
    rv = cmds.createNode("remapValue", name=name + "_RV")
    cmds.connectAttr(ab + ".angle", rv + ".inputValue")
    uc = cmds.listConnections(rv + ".inputValue", source=True, destination=False, type="unitConversion") or []
    factor = cmds.getAttr(uc[0] + ".conversionFactor") if uc else 1.0
    cmds.setAttr(rv + ".inputMin", 0.0)
    cmds.setAttr(rv + ".inputMax", math.radians(falloff) * factor)
    cmds.setAttr(rv + ".outputMin", 1.0)
    cmds.setAttr(rv + ".outputMax", 0.0)
    cmds.connectAttr(rv + ".outValue", weight_plug, force=True)
    rep = {"nodes": [vp, ab, rv] + uc, "pose_vector": pose_vec, "angle_factor": factor, "plug": plug}
    try:
        rep["drive"] = joint_drive(lj)
    except Exception as exc:
        rep["drive"] = {"kind": "unknown", "error": str(exc)}
    if rep["drive"].get("kind") == "opm" and plug == "matrix":
        rep["warning"] = ("joint is driven through offsetParentMatrix but only .matrix is readable: the reader "
                          "cannot see the pose (stuck on or off)")
    if rest_time is not None:
        mr = tuple(cmds.getAttr(lj + "." + plug, time=rest_time))
        rest_angle = _angle_deg(xform_vector(axis, mr), pose_vec)
        rep["rest_angle"] = rest_angle
        if rest_angle < falloff:
            rep["warning"] = "rest is only %.1f deg from the pose: the corrective shows at rest; lower falloff" % rest_angle
    return rep


def _mesh_from_points(template, points_object, name):
    """Copy of `template` (same topology) with its points set in object space."""
    om = _om()
    cmds = _cmds()
    xf = resolve_mesh(template)[1]
    dup = cmds.duplicate(xf, name=name, returnRootsOnly=True)[0]
    for s in cmds.listRelatives(dup, shapes=True, fullPath=True) or []:
        if cmds.getAttr(s + ".intermediateObject"):
            cmds.delete(s)
    for c in cmds.listRelatives(dup, children=True, type="transform", fullPath=True) or []:
        cmds.delete(c)
    cmds.delete(dup, constructionHistory=True)
    shape = resolve_mesh(dup)[0]
    om.MFnMesh(_dag(shape)).setPoints(om.MPointArray([om.MPoint(*p) for p in points_object]), om.MSpace.kObject)
    return resolve_mesh(dup)[1]


def _next_target_index(bs):
    cmds = _cmds()
    idx = cmds.getAttr(bs + ".weight", multiIndices=True) or []
    return (max(idx) + 1) if idx else 0


def skin_matrices_of(sc, time=None):
    """Per physical influence: bindPreMatrix * matrix (the skinCluster's own inputs)."""
    cmds = _cmds()
    names, logical = influences(sc)
    kw = {} if time is None else {"time": time}
    return [mat_mul(tuple(cmds.getAttr("%s.bindPreMatrix[%d]" % (sc, li), **kw)),
                    tuple(cmds.getAttr("%s.matrix[%d]" % (sc, li), **kw))) for li in logical]


def solve_pre_corrective(mesh, sculpt, bs=None, target_name=None, iterations=6, tol=1e-3, keep_target=False):
    """Pre-deformation corrective from a sculpt made IN the current pose: invert linear skinning per
    vertex, add the rest-space target to a frontOfChain blendShape, then refine by evaluating Maya
    until the posed result matches the sculpt within tol (cm). Works for DQ or extra deformers as
    long as they are locally invertible; cmds.invertShape is the built-in alternative [verify].
    Assumes the mesh transform is identity (handoff gate). Target weight is left at 1: drive it with
    corrective_driver() or the Pose Editor."""
    cmds = _cmds()
    shape, xf = resolve_mesh(mesh)
    sc = skin_cluster(shape)
    posed = mesh_points(shape)
    goal = mesh_points(sculpt)
    if len(goal) != len(posed):
        raise ValueError("sculpt has %d vertices, mesh has %d" % (len(goal), len(posed)))
    W = read_weights(sc, shape)["weights"]
    S = skin_matrices_of(sc)
    d_pose = [_sub(g, p) for g, p in zip(goal, posed)]
    d_rest, singular = invert_deltas(W, S, d_pose)
    rest = rest_points(shape, world=False)
    if bs is None:
        bs = cmds.blendShape(xf, frontOfChain=True, name=short_name(xf) + "_preFix_BS")[0]
    tname = target_name or short_name(sculpt) + "_pre"
    tgt = _mesh_from_points(shape, [_add(r, d) for r, d in zip(rest, d_rest)], tname)
    idx = _next_target_index(bs)
    cmds.blendShape(bs, e=True, target=(xf, idx, tgt, 1.0))
    cmds.setAttr("%s.weight[%d]" % (bs, idx), 1.0)
    om = _om()
    tshape = resolve_mesh(tgt)[0]
    residual = None
    for it in range(iterations):
        out = mesh_points(shape)
        r = [_sub(g, o) for g, o in zip(goal, out)]
        residual = max(_len(x) for x in r) if r else 0.0
        if residual < tol:
            break
        dr, _ = invert_deltas(W, S, r)
        d_rest = [_add(a, b) for a, b in zip(d_rest, dr)]
        om.MFnMesh(_dag(tshape)).setPoints(om.MPointArray([om.MPoint(*_add(p, d)) for p, d in zip(rest, d_rest)]),
                                          om.MSpace.kObject)
    else:
        out = mesh_points(shape)
        residual = max(_dist(g, o) for g, o in zip(goal, out))
    try:
        cmds.aliasAttr(tname, "%s.w[%d]" % (bs, idx))
    except Exception:
        pass
    if not keep_target:
        cmds.delete(tgt)
    return {"blendShape": bs, "index": idx, "target": tname, "residual": residual, "singular": singular[:20],
            "iterations": it + 1}


def add_split_targets(bs, base_mesh, section_points, names):
    """Add split targets (split_targets() output, object space) to blendShape `bs` and delete the
    temporary meshes (the data stays in the node). Returns [(name, index)]."""
    cmds = _cmds()
    xf = resolve_mesh(base_mesh)[1]
    out = []
    for pts, nm in zip(section_points, names):
        tgt = _mesh_from_points(base_mesh, pts, nm)
        idx = _next_target_index(bs)
        cmds.blendShape(bs, e=True, target=(xf, idx, tgt, 1.0))
        try:
            cmds.aliasAttr(nm, "%s.w[%d]" % (bs, idx))
        except Exception:
            pass
        cmds.delete(tgt)
        out.append((nm, idx))
    return out


def eval_seconds(mesh, frames):
    """Seconds per frame to evaluate the deformed mesh headless (compare ML Deformer on and off; the
    GUI Evaluation Toolkit and profiler remain the reference)."""
    shape = resolve_mesh(mesh)[0]
    t0 = time.time()
    for f in frames:
        set_time(f)
        mesh_points(shape)
    return (time.time() - t0) / max(1, len(frames))


# =============================================================================== CLI (mx_run job)
def _json_safe(x):
    if isinstance(x, dict):
        return {str(k): _json_safe(v) for k, v in x.items() if k != "layer_object"}
    if isinstance(x, (list, tuple)):
        return [_json_safe(v) for v in x]
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return str(x)
    return x


def main(argv=None):
    """mx_run job: probe | audit | export | import | test (see the module docstring)."""
    import argparse
    ap = argparse.ArgumentParser(prog="mx_skin")
    ap.add_argument("command", choices=("probe", "audit", "export", "import", "test", "precheck"))
    ap.add_argument("--mesh")
    ap.add_argument("--sc")
    ap.add_argument("--path")
    ap.add_argument("--spec", help="test: JSON {rom: segments | limits: joints, start, step, sections, rigid, accessories}")
    ap.add_argument("--joints", help="precheck: comma list")
    ap.add_argument("--method", default="heat")
    ap.add_argument("--max-influences", type=int)
    ap.add_argument("--mapping", default="auto")
    ap.add_argument("--json")
    a = ap.parse_args(list(argv or []))
    if a.command == "probe":
        res = skin_tools_probe()
    elif a.command == "audit":
        sc = a.sc or skin_cluster(a.mesh)
        d = read_weights(sc)
        audit = audit_weights(d["weights"], d["influences"], a.max_influences)
        res = {"skinCluster": sc, "settings": skin_settings(sc), "audit": audit, "verdict": weights_verdict(audit),
               "layers": skin_layers_node(sc), "clusters": skin_clusters(a.mesh)}
    elif a.command == "export":
        res = export_weights_json(a.mesh, a.path, sc=a.sc)
    elif a.command == "import":
        res = import_weights_json(a.path, a.mesh, sc=a.sc, vertex_mapping=a.mapping)
    elif a.command == "precheck":
        res = bind_precheck(a.mesh, a.joints.split(","), a.method)
    else:
        with open(a.spec) as f:
            spec = json.load(f)
        if "limits" in spec:
            sched = rom_from_limits(spec["limits"], spec.get("step_deg", 30.0), start=spec.get("start", 1),
                                    step=spec.get("step", 10))
        else:
            sched = rom_schedule(spec["rom"], spec.get("start", 1), spec.get("step", 10))
        keyed = key_rom(sched, relative=spec.get("relative", False))
        res = deformation_test(a.mesh, keyed["poses"], sched["start"], sc=a.sc, sections=spec.get("sections"),
                               rigid=spec.get("rigid"), accessories=spec.get("accessories"),
                               thresholds=spec.get("thresholds"), max_influences=a.max_influences)
        res["schedule"] = {"start": sched["start"], "end": sched["end"], "poses": len(sched["poses"])}
    res = _json_safe(res)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(res, f, indent=1, default=str)
    return res


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1:]), indent=1, default=str))
