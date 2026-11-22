"""
mx_audit: objective mesh checks an agent runs before calling a model done (Maya 2027).

STATUS: not yet run in Maya (written 2026-09-24). extract() uses maya.cmds and OpenMaya 2.0
and is unverified; analyze() is pure Python and was run offline on synthetic meshes
(tests/code/maya-expert/test_mx_audit_offline.py).

  import sys; sys.path.insert(0, "<skill>/scripts"); import mx_audit
  r = mx_audit.audit("crate_geo", texture_size=2048, units="cm")
  mx_audit.verdict(r, profile="game")          # [] when clean, else "error: ...", "warn: ..."
  mx_audit.audit_all(roots=["asset_GRP"])      # every mesh under the roots

Headless, through mx_run:
  mayapy mx_run.py --scene crate.ma mx_audit.py -- --mesh crate_geo --texture-size 2048 \
         --profile game --json /abs/out/audit.json          (--all instead of --mesh)

Two layers, so the math is testable without Maya:
  extract(mesh)  -> plain lists from OpenMaya 2.0 (world points in centimeters, the
                    internal unit, whatever the UI unit is) plus cmds metadata
  analyze(data)  -> the report (pure Python)

Report keys (distances in `units`, densities in px per `units`):
  verts faces tris quads ngons tris_equivalent quads_pct
  valence_hist_interior poles_e3 poles_e5 poles_e6plus pole_samples
  non_manifold_edges non_manifold_verts lamina_faces   (Maya's polyInfo definitions)
  edges_over_2_faces inconsistent_winding_edges border_edges border_loops holes
  zero_area_faces zero_length_edges loose_verts loose_edges
  edge_len_mean edge_len_min edge_len_max edge_len_cv
  symmetry_pct symmetry_axis center_offset bbox_min bbox_max dimensions
  uv_sets uv (for the audited set: uvs, faces_without_uvs, uvs_outside_01, shells,
     udim_tiles, looks_udim, shells_crossing_tiles, uv_overlap_cells, uv_overlap_pct,
     uv_overlapping_shell_pairs, uv_self_overlap_cells, uv_folded_faces, mirrored_shells,
     uv_zero_area_faces, texel_density {px_per_<units>, min, max, max_over_min, shells})
  transform (frozen, values, offset_parent_matrix_identity, ancestors_not_frozen,
     pivot_ws, pivot_at_origin, pivot_at_base_center, pivot_at_bbox_center)
  history_nodes deformers naming (short, default_name, duplicate_short_name, namespace)
  (history_nodes excludes bind poses and deformer weight drivers: split_history)
  empty mesh: {object, shape, empty: True, verts, faces}; verdict() gives "error: empty mesh"

Guards other code should reuse: is_empty_mesh(shape) and mfn_mesh(shape) (None instead of
the MFnMesh exception on an empty mesh, 2022.1+), split_history(shape) (construction
history vs deformers vs deformer inputs such as the skinCluster's bind pose).
  instanced smooth_preview locked_normal_verts hard_edges

What the numbers are NOT: edge_len_cv is not a quality score (hand-planned density around
eyes and joints raises it, uniform remeshes lower it); poles are fine in flat,
non-deforming areas and bad in folds and on deforming rims (Polycount wiki, Poles).
Thresholds in verdict() are marked with their source; [added] ones are this toolkit's
own defaults and can be overridden.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import math
import re
import sys

UNIT_PER_CM = {"mm": 10.0, "cm": 1.0, "m": 0.01, "km": 1e-5, "in": 1 / 2.54, "ft": 1 / 30.48,
               "yd": 1 / 91.44}
UI_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0, "km": 1e5, "in": 2.54, "ft": 30.48, "yd": 91.44,
            "mi": 160934.4}
DEFAULT_NAME_RE = re.compile(
    r"^(pCube|pSphere|pCylinder|pCone|pPlane|pTorus|pPrism|pPyramid|pPipe|pHelix|pSolid|pDisc|"
    r"pPlatonic|pGear|pSuperShape|polySurface|group|transform|null|mesh|nurbsSphere|nurbsCube|"
    r"nurbsCylinder|nurbsCone|nurbsPlane|nurbsTorus|nurbsCircle|curve|subdiv)\d*$")
_AXES = {"x": 0, "y": 1, "z": 2, 0: 0, 1: 1, 2: 2}


# =========================================================================== pure analysis
class _UF(object):
    """Union-find over integer ids."""

    def __init__(self, n=0):
        self.p = list(range(n))

    def find(self, x):
        p = self.p
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def _symmetry(pts, axis, tol, max_queries=300000):
    if not pts:
        return 0.0
    cell = max(tol * 2.0, 1e-9)
    grid = {}
    for i, p in enumerate(pts):
        key = (int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell)), int(math.floor(p[2] / cell)))
        grid.setdefault(key, []).append(i)
    step = max(1, len(pts) // max_queries)
    tol2 = tol * tol
    hits = queries = 0
    for i in range(0, len(pts), step):
        m = list(pts[i])
        m[axis] = -m[axis]
        kx, ky, kz = (int(math.floor(m[0] / cell)), int(math.floor(m[1] / cell)),
                      int(math.floor(m[2] / cell)))
        found = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((kx + dx, ky + dy, kz + dz), ()):
                        q = pts[j]
                        if (q[0] - m[0]) ** 2 + (q[1] - m[1]) ** 2 + (q[2] - m[2]) ** 2 <= tol2:
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
        hits += found
        queries += 1
    return 100.0 * hits / queries


def _raster_triangle(p0, p1, p2, visit):
    """Call visit(ix, iy) for every unit cell whose center lies inside the triangle."""
    area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
    if abs(area) < 1e-12:
        return
    sgn = 1.0 if area > 0 else -1.0
    x0 = int(math.floor(min(p0[0], p1[0], p2[0])))
    x1 = int(math.ceil(max(p0[0], p1[0], p2[0])))
    y0 = int(math.floor(min(p0[1], p1[1], p2[1])))
    y1 = int(math.ceil(max(p0[1], p1[1], p2[1])))
    for iy in range(y0, y1):
        cy = iy + 0.5
        for ix in range(x0, x1):
            cx = ix + 0.5
            w0 = ((p2[0] - p1[0]) * (cy - p1[1]) - (p2[1] - p1[1]) * (cx - p1[0])) * sgn
            if w0 < 0:
                continue
            w1 = ((p0[0] - p2[0]) * (cy - p2[1]) - (p0[1] - p2[1]) * (cx - p2[0])) * sgn
            if w1 < 0:
                continue
            w2 = ((p1[0] - p0[0]) * (cy - p0[1]) - (p1[1] - p0[1]) * (cx - p0[0])) * sgn
            if w2 < 0:
                continue
            visit(ix, iy)


def _uv_analysis(uvd, counts, areas, texture_size, k, overlap_grid, max_faces_overlap, max_listed):
    u, v = uvd.get("u") or [], uvd.get("v") or []
    ucnt, uids = uvd.get("uv_counts") or [], uvd.get("uv_ids") or []
    nf = len(counts)
    res = {"uvs": len(u)}
    if not u or not ucnt:
        res.update(faces_without_uvs=nf, shells=0)
        return res
    eps = 1e-5
    res["uvs_outside_01"] = sum(1 for i in range(len(u))
                                if u[i] < -eps or u[i] > 1 + eps or v[i] < -eps or v[i] > 1 + eps)
    res["uv_bounds"] = [round(min(u), 5), round(min(v), 5), round(max(u), 5), round(max(v), 5)]
    uf = _UF(len(u))
    face_ids = [None] * nf
    off = missing = 0
    for fi in range(nf):
        c = ucnt[fi] if fi < len(ucnt) else 0
        if c <= 0:
            missing += 1
            continue
        ids = uids[off:off + c]
        off += c
        face_ids[fi] = ids
        for x in ids[1:]:
            uf.union(ids[0], x)
    res["faces_without_uvs"] = missing
    roots = {}
    face_shell = [None] * nf
    for fi, ids in enumerate(face_ids):
        if ids is None:
            continue
        r = uf.find(ids[0])
        face_shell[fi] = roots.setdefault(r, len(roots))
    ns = len(roots)
    res["shells"] = ns
    if "maya_shells" in uvd:
        res["maya_shell_count"] = uvd["maya_shells"]
    # per-shell accumulators
    a3 = [0.0] * ns
    auv = [0.0] * ns
    pos = [0.0] * ns
    neg = [0.0] * ns
    bnd = [[1e30, 1e30, -1e30, -1e30] for _ in range(ns)]
    face_sign = [0] * nf
    uv_zero = 0
    tiles = {}
    bad_tiles = 0
    for fi, ids in enumerate(face_ids):
        if ids is None:
            continue
        s = face_shell[fi]
        sa = 0.0
        n = len(ids)
        cu = cv = 0.0
        b = bnd[s]
        for j in range(n):
            ia, ib = ids[j], ids[(j + 1) % n]
            sa += u[ia] * v[ib] - u[ib] * v[ia]
            cu += u[ia]
            cv += v[ia]
            if u[ia] < b[0]:
                b[0] = u[ia]
            if v[ia] < b[1]:
                b[1] = v[ia]
            if u[ia] > b[2]:
                b[2] = u[ia]
            if v[ia] > b[3]:
                b[3] = v[ia]
        sa *= 0.5
        if abs(sa) < 1e-12:
            uv_zero += 1
        a3[s] += areas[fi]
        auv[s] += abs(sa)
        if sa >= 0:
            pos[s] += sa
            face_sign[fi] = 1
        else:
            neg[s] -= sa
            face_sign[fi] = -1
        cu, cv = cu / n, cv / n
        tu, tv = int(math.floor(cu)), int(math.floor(cv))
        if 0 <= tu <= 9 and tv >= 0:
            t = 1001 + tu + 10 * tv
            tiles[t] = tiles.get(t, 0) + 1
        else:
            bad_tiles += 1
    res["uv_zero_area_faces"] = uv_zero
    res["udim_tiles"] = sorted(tiles)
    res["faces_outside_udim_range"] = bad_tiles
    crossing = 0
    for b in bnd:
        if b[0] > b[2]:
            continue
        if (math.floor(b[0] + eps) != math.floor(b[2] - eps)) or (math.floor(b[1] + eps) != math.floor(b[3] - eps)):
            crossing += 1
    res["shells_crossing_tiles"] = crossing
    res["looks_udim"] = bool(tiles) and sorted(tiles) != [1001] and crossing == 0 and bad_tiles == 0
    # orientation: folded faces inside a shell, mirrored shells relative to the majority
    dom = [1 if pos[s] >= neg[s] else -1 for s in range(ns)]
    total_pos = sum(pos[s] for s in range(ns) if dom[s] > 0)
    total_neg = sum(neg[s] for s in range(ns) if dom[s] < 0)
    glob = 1 if total_pos >= total_neg else -1
    res["mirrored_shells"] = sum(1 for s in range(ns) if dom[s] != glob)
    res["uv_folded_faces"] = sum(1 for fi in range(nf) if face_shell[fi] is not None
                                 and face_sign[fi] != dom[face_shell[fi]] and face_sign[fi] != 0)
    # texel density
    tot3, totuv = sum(a3), sum(auv)
    td = {"texture_size": texture_size, "units": "px/%s" % _unit_name(k)}
    if tot3 > 0 and totuv > 0:
        td["px_per_unit"] = round(texture_size * math.sqrt(totuv / tot3) / k, 4)
        shells = []
        for s in range(ns):
            if a3[s] > 0 and auv[s] > 0:
                shells.append({"shell": s, "px_per_unit": round(texture_size * math.sqrt(auv[s] / a3[s]) / k, 4),
                               "area_3d": round(a3[s] * k * k, 6), "uv_area": round(auv[s], 8)})
        sig = [x for x in shells if x["area_3d"] >= 0.001 * tot3 * k * k]   # [added] ignore slivers
        vals = [x["px_per_unit"] for x in sig] or [x["px_per_unit"] for x in shells]
        if vals:
            td["min"], td["max"] = min(vals), max(vals)
            td["max_over_min"] = round(max(vals) / min(vals), 4) if min(vals) > 0 else None
            w = [x["area_3d"] for x in (sig or shells)]
            mean = sum(a * b for a, b in zip(vals, w)) / sum(w)
            var = sum(wi * (x - mean) ** 2 for x, wi in zip(vals, w)) / sum(w)
            td["area_weighted_cv"] = round(math.sqrt(var) / mean, 4) if mean else None
        shells.sort(key=lambda x: x["px_per_unit"])
        td["lowest_shells"] = shells[:max_listed]
        td["highest_shells"] = shells[-max_listed:][::-1]
    res["texel_density"] = td
    # overlap by rasterization on a grid of overlap_grid cells per UV unit
    if nf > max_faces_overlap:
        res["uv_overlap_cells"] = None
        res["uv_overlap_note"] = "skipped: more than %d faces" % max_faces_overlap
        return res
    G = float(overlap_grid)
    owner = {}          # cell -> (first shell, first face)
    extra = {}          # cell -> set of shells, only for cells covered by 2+ shells
    overlap = set()
    selfo = set()
    pairs = set()
    for fi, ids in enumerate(face_ids):
        if ids is None:
            continue
        s = face_shell[fi]
        p = [(u[i] * G, v[i] * G) for i in ids]

        def visit(ix, iy, s=s, fi=fi):
            key = (ix, iy)
            prev = owner.get(key)
            if prev is None:
                owner[key] = (s, fi)
                return
            shells = extra.get(key)
            if shells is None:
                if prev[0] == s:
                    if prev[1] != fi:
                        selfo.add(key)          # same shell, another face: a fold
                    return
                shells = extra[key] = {prev[0]}
            if s not in shells:
                for o in shells:
                    pairs.add((min(o, s), max(o, s)))
                shells.add(s)
                overlap.add(key)

        for j in range(1, len(p) - 1):
            _raster_triangle(p[0], p[j], p[j + 1], visit)
    res["uv_overlap_grid"] = overlap_grid
    res["uv_covered_cells"] = len(owner)
    res["uv_overlap_cells"] = len(overlap)
    res["uv_overlap_pct"] = round(100.0 * len(overlap) / len(owner), 3) if owner else 0.0
    res["uv_overlapping_shell_pairs"] = len(pairs)
    res["uv_self_overlap_cells"] = len(selfo)
    return res


def _unit_name(k):
    for name, val in UNIT_PER_CM.items():
        if abs(val - k) < 1e-12:
            return name
    return "unit"


def analyze(data, texture_size=2048, units="cm", uv_set=None, symmetry_axis="x",
            symmetry_tol=None, max_listed=25, uv_checks=True, overlap_grid=256,
            max_faces_overlap=300000):
    """Pure-Python analysis of extract()'s data. Points must be in centimeters."""
    k = UNIT_PER_CM[units]
    pts = data["points"]
    counts = data["counts"]
    conn = data["connects"]
    nv, nf = len(pts), len(counts)
    r = {"object": data.get("name"), "shape": data.get("shape"), "units": units,
         "verts": nv, "faces": nf}
    tris = quads = 0
    ngons = []
    for i, c in enumerate(counts):
        if c == 3:
            tris += 1
        elif c == 4:
            quads += 1
        elif c > 4:
            ngons.append(i)
    r.update(tris=tris, quads=quads, ngons=len(ngons), tris_equivalent=sum(c - 2 for c in counts),
             quads_pct=round(100.0 * quads / nf, 2) if nf else 0.0, ngon_faces_sample=ngons[:max_listed],
             all_triangles=(nf > 0 and tris == nf))
    if nv:
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
    else:
        lo = hi = [0.0, 0.0, 0.0]
    diag = math.sqrt(sum((hi[i] - lo[i]) ** 2 for i in range(3))) or 1.0
    r["bbox_min"] = [round(x * k, 6) for x in lo]
    r["bbox_max"] = [round(x * k, 6) for x in hi]
    r["dimensions"] = [round((hi[i] - lo[i]) * k, 6) for i in range(3)]
    # ---- edges from face corners
    cnt, dsum = {}, {}
    degenerate = 0
    N = max(nv, 1)
    off = 0
    for c in counts:
        f = conn[off:off + c]
        off += c
        for j in range(c):
            a, b = f[j], f[(j + 1) % c]
            if a == b:
                degenerate += 1
                continue
            if a < b:
                key, d = a * N + b, 1
            else:
                key, d = b * N + a, -1
            cnt[key] = cnt.get(key, 0) + 1
            dsum[key] = dsum.get(key, 0) + d
    val = [0] * nv
    bnd = bytearray(nv)
    border = []
    over2 = incons = zero_len = 0
    lengths = []
    eps_len = diag * 1e-6          # [added] relative tolerance
    for key, n in cnt.items():
        a, b = divmod(key, N)
        val[a] += 1
        val[b] += 1
        L = math.dist(pts[a], pts[b])
        lengths.append(L)
        if L < eps_len:
            zero_len += 1
        if n == 1:
            border.append((a, b))
            bnd[a] = bnd[b] = 1
        elif n > 2:
            over2 += 1
        elif dsum[key] != 0:
            incons += 1
    r.update(edges=len(cnt), edges_over_2_faces=over2, inconsistent_winding_edges=incons,
             border_edges=len(border), zero_length_edges=zero_len, degenerate_face_corners=degenerate)
    if data.get("num_edges_api") is not None:
        r["loose_edges"] = max(0, int(data["num_edges_api"]) - len(cnt))
    uf = _UF(nv)
    for a, b in border:
        uf.union(a, b)
    loops = {}
    for a, b in border:
        root = uf.find(a)
        loops[root] = loops.get(root, 0) + 1
    r["border_loops"] = sorted(loops.values(), reverse=True)[:max_listed]
    r["holes"] = len(loops)
    hist = {}
    loose_v = 0
    e5, e3 = [], []
    for i in range(nv):
        n = val[i]
        if n == 0:
            loose_v += 1
            continue
        if bnd[i]:
            continue
        hist[n] = hist.get(n, 0) + 1
        if n >= 5 and len(e5) < max_listed:
            e5.append(i)
        elif n == 3 and len(e3) < max_listed:
            e3.append(i)
    r["loose_verts"] = loose_v
    r["valence_hist_interior"] = {str(key): hist[key] for key in sorted(hist)}
    r["poles_e3"] = hist.get(3, 0)
    r["poles_e5"] = hist.get(5, 0)
    r["poles_e6plus"] = sum(c for n, c in hist.items() if n >= 6)
    r["pole_samples"] = {"e5plus": [[round(x * k, 5) for x in pts[i]] + [val[i]] for i in e5],
                         "e3": [[round(x * k, 5) for x in pts[i]] for i in e3]}
    if lengths:
        mean = sum(lengths) / len(lengths)
        sd = math.sqrt(sum((x - mean) ** 2 for x in lengths) / len(lengths))
        r.update(edge_len_mean=round(mean * k, 6), edge_len_min=round(min(lengths) * k, 6),
                 edge_len_max=round(max(lengths) * k, 6), edge_len_cv=round(sd / mean, 4) if mean else 0.0)
    # ---- face areas (vector area: exact for planar polygons, convex or not)
    areas = [0.0] * nf
    off = 0
    zero_area = 0
    eps_area = eps_len * eps_len
    for i, c in enumerate(counts):
        f = conn[off:off + c]
        off += c
        p0 = pts[f[0]]
        ax = ay = az = 0.0
        for j in range(1, c - 1):
            p1, p2 = pts[f[j]], pts[f[j + 1]]
            ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
            vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
            ax += uy * vz - uz * vy
            ay += uz * vx - ux * vz
            az += ux * vy - uy * vx
        areas[i] = 0.5 * math.sqrt(ax * ax + ay * ay + az * az)
        if areas[i] < eps_area:
            zero_area += 1
    r["zero_area_faces"] = zero_area
    r["surface_area"] = round(sum(areas) * k * k, 6)
    # ---- symmetry (world space, mirror across the axis plane through the origin)
    ax_i = _AXES[symmetry_axis]
    tol = symmetry_tol / k if symmetry_tol else max(hi[i] - lo[i] for i in range(3)) * 1e-3 or 1e-6
    r["symmetry_axis"] = "xyz"[ax_i]
    r["symmetry_tol"] = round(tol * k, 8)
    r["symmetry_pct"] = round(_symmetry(pts, ax_i, tol), 2)
    r["center_offset"] = round((lo[ax_i] + hi[ax_i]) / 2.0 * k, 6)
    # ---- UVs
    sets = data.get("uv_sets") or {}
    r["uv_sets"] = list(sets)
    use = uv_set or data.get("current_uv_set") or (list(sets)[0] if sets else None)
    r["uv_set"] = use
    if uv_checks and use in sets:
        r["uv"] = _uv_analysis(sets[use], counts, areas, texture_size, k, overlap_grid,
                               max_faces_overlap, max_listed)
    else:
        r["uv"] = {"uvs": 0, "faces_without_uvs": nf, "shells": 0}
    r["uv_other_sets"] = {name: {"uvs": len(d.get("u") or []),
                                 "faces_without_uvs": sum(1 for c in (d.get("uv_counts") or []) if c <= 0)
                                 if d.get("uv_counts") else nf}
                          for name, d in sets.items() if name != use}
    # ---- metadata from extract() is copied through untouched
    for key in ("non_manifold_edges", "non_manifold_verts", "lamina_faces", "non_manifold_sample",
                "lamina_sample", "transform", "history_nodes", "deformers", "naming", "instanced",
                "smooth_preview", "locked_normal_verts", "hard_edges", "linear_unit", "up_axis",
                "arnold_subdiv"):
        if key in data:
            r[key] = data[key]
    return r


# =========================================================================== Maya layer
def _num(fn, name, *args):
    attr = getattr(fn, name)
    return attr(*args) if callable(attr) else attr


def _count(cmds, node, **flag):
    """polyEvaluate as an int. polyEvaluate returns a message string, not 0, when it has
    nothing to count ("Nothing counted : no polygonal object is selected.") [verify the exact
    2027 behaviour on an empty mesh], so anything that is not an int counts as 0."""
    try:
        v = cmds.polyEvaluate(node, **flag)
    except Exception:
        return 0
    if isinstance(v, bool):
        return 0
    return v if isinstance(v, int) else 0


def mesh_counts(shape):
    """{"verts", "faces"} of a mesh shape as ints (0 when polyEvaluate counts nothing)."""
    import maya.cmds as cmds
    return {"verts": _count(cmds, shape, vertex=True), "faces": _count(cmds, shape, face=True)}


def is_empty_mesh(shape):
    """True for a mesh with no vertices or no faces. Call before om.MFnMesh: API 2.0 MFnMesh
    raises on an empty mesh since 2022.1 (devkit What's New), which would turn one empty
    leftover shape into a crash of the whole audit or batch job."""
    c = mesh_counts(shape)
    return c["verts"] == 0 or c["faces"] == 0


def mfn_mesh(shape):
    """om.MFnMesh for a mesh shape, or None when the mesh is empty (guarded twice: counts
    first, then the constructor's RuntimeError). The one sanctioned way for toolkit and
    skill code to wrap a mesh it did not build itself."""
    import maya.api.OpenMaya as om
    if is_empty_mesh(shape):
        return None
    sl = om.MSelectionList()
    sl.add(shape)
    try:
        return om.MFnMesh(sl.getDagPath(0))
    except RuntimeError:                     # [verify] the exception type OM2 raises here
        return None


# Nodes upstream of a mesh that are never construction history. dagPose: the bind pose
# that every skinCluster's bindPose attribute reads (open issue 2026-09-24: it was counted
# as history, so every skinned mesh looked dirty). The others are component bookkeeping.
DEFORMER_SUPPORT_TYPES = ("groupId", "groupParts", "tweak", "objectSet", "shadingEngine", "dagPose")
_GEOMETRY_INPUTS = ("input", "originalGeometry")        # geometryFilter plugs carrying the mesh
_BOOKKEEPING_TYPES = ("nodeGraphEditorInfo", "hyperLayout", "hyperView", "container", "dagContainer",
                      "objectSet", "shapeEditorManager")


def _drives_deformer_only(cmds, plug, deformers, drivers):
    node, _, attr = plug.partition(".")
    node = node.rsplit("|", 1)[-1]
    if node in deformers:
        return re.split(r"[\[.]", attr, 1)[0] not in _GEOMETRY_INPUTS
    if node in drivers:
        return True
    try:
        return cmds.nodeType(node) in _BOOKKEEPING_TYPES
    except Exception:
        return False


def split_history(shape):
    """Upstream nodes of a mesh in three groups:
      history          construction history, what Delete History removes: [(node, type)]
      deformers        geometryFilter nodes (skinCluster, blendShape, cluster...)
      deformer_inputs  nodes that only feed deformers' non-geometry inputs: the bind pose,
                       weight drivers (animation curves, unit conversions, expressions)
    A node counts as a deformer input when every one of its outgoing connections ends on a
    deformer attribute other than input/originalGeometry, on another deformer input, or on
    editor bookkeeping (iterated to a fixed point) [added rule]."""
    import maya.cmds as cmds
    hist = cmds.listHistory(shape, pruneDagObjects=True) or []
    deformers, cands, support = [], [], []
    for h in hist:
        t = cmds.nodeType(h)
        if t == "mesh":
            continue
        if "geometryFilter" in (cmds.nodeType(h, inherited=True) or []):
            deformers.append(h)
        elif t in DEFORMER_SUPPORT_TYPES:
            if t == "dagPose":
                support.append(h)
        else:
            cands.append((h, t))
    drivers = set(support)
    if deformers and cands:
        dset = set(d.rsplit("|", 1)[-1] for d in deformers)
        changed = True
        while changed:
            changed = False
            for h, _t in cands:
                if h in drivers:
                    continue
                dests = cmds.listConnections(h, source=False, destination=True, plugs=True) or []
                if dests and all(_drives_deformer_only(cmds, p, dset, drivers) for p in dests):
                    drivers.add(h)
                    changed = True
    return {"history": [(h, t) for h, t in cands if h not in drivers], "deformers": deformers,
            "deformer_inputs": sorted(drivers)}


def resolve_mesh(name):
    """Return (shape, transform) long names for a transform or mesh shape name."""
    import maya.cmds as cmds
    found = cmds.ls(name, long=True) or []
    if not found:
        raise ValueError("no node named %s" % name)
    if len(found) > 1 and len({f.rsplit("|", 1)[-1] for f in found}) > 1:
        raise ValueError("ambiguous name %s: %s (use a long name)" % (name, found))
    node = found[0]           # several paths to one instanced node: take the first
    if cmds.nodeType(node) == "mesh":
        return node, (cmds.listRelatives(node, parent=True, fullPath=True) or [node])[0]
    shapes = cmds.listRelatives(node, shapes=True, noIntermediate=True, fullPath=True, type="mesh") or []
    if not shapes:
        raise ValueError("%s has no (non-intermediate) mesh shape" % node)
    return shapes[0], node


def _is_identity(m, tol=1e-6):
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    return all(abs(a - b) <= tol for a, b in zip(m, ident))


def _frozen(cmds, node, tol=1e-5):
    t = cmds.getAttr(node + ".translate")[0]
    r = cmds.getAttr(node + ".rotate")[0]
    s = cmds.getAttr(node + ".scale")[0]
    sh = cmds.getAttr(node + ".shear")[0] if cmds.attributeQuery("shear", node=node, exists=True) else (0, 0, 0)
    opm_ok = True
    if cmds.attributeQuery("offsetParentMatrix", node=node, exists=True):
        opm_ok = _is_identity(cmds.getAttr(node + ".offsetParentMatrix"))
    ok = (all(abs(x) <= tol for x in tuple(t) + tuple(r) + tuple(sh)) and
          all(abs(x - 1) <= tol for x in s) and opm_ok)
    return ok, {"t": [round(x, 6) for x in t], "r": [round(x, 6) for x in r],
                "s": [round(x, 6) for x in s], "shear": [round(x, 6) for x in sh],
                "offset_parent_matrix_identity": opm_ok}


def transform_info(xform, bbox_cm=None):
    import maya.cmds as cmds
    ok, vals = _frozen(cmds, xform)
    anc = []
    p = cmds.listRelatives(xform, parent=True, fullPath=True)
    while p:
        pok, _ = _frozen(cmds, p[0])
        if not pok:
            anc.append(p[0])
        p = cmds.listRelatives(p[0], parent=True, fullPath=True)
    unit = cmds.currentUnit(q=True, linear=True)
    f = UI_TO_CM.get(unit, 1.0)
    piv = [x * f for x in cmds.xform(xform, q=True, ws=True, rotatePivot=True)]
    info = {"frozen": ok, "values": vals, "ancestors_not_frozen": anc, "pivot_ws_cm": [round(x, 6) for x in piv]}
    if bbox_cm:
        lo, hi = bbox_cm
        tol = max(1e-4, 1e-3 * math.sqrt(sum((hi[i] - lo[i]) ** 2 for i in range(3))))
        base = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
        if cmds.upAxis(q=True, axis=True) == "z":
            base = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
        center = [(lo[i] + hi[i]) / 2 for i in range(3)]
        info["pivot_at_origin"] = all(abs(x) <= tol for x in piv)
        info["pivot_at_base_center"] = all(abs(piv[i] - base[i]) <= tol for i in range(3))
        info["pivot_at_bbox_center"] = all(abs(piv[i] - center[i]) <= tol for i in range(3))
    return info


def history_info(shape):
    """(["node (type)" construction history], [deformers]); bind poses and deformer weight
    drivers are not history (split_history)."""
    s = split_history(shape)
    return ["%s (%s)" % (h, t) for h, t in s["history"]], s["deformers"]


def naming_info(xform):
    import maya.cmds as cmds
    short = xform.rsplit("|", 1)[-1]
    base = short.rsplit(":", 1)[-1]
    dups = [n for n in (cmds.ls(type="transform") or []) if n.rsplit("|", 1)[-1] == short]
    return {"short": short, "default_name": bool(DEFAULT_NAME_RE.match(base)),
            "duplicate_short_name": len(dups) > 1, "namespace": ":" in short}


def _poly_info(cmds, shape, max_listed, **flag):
    res = cmds.polyInfo(shape, **flag) or []
    try:
        flat = cmds.ls(res, flatten=True) or res
    except Exception:
        flat = res
    return len(flat), [str(x).strip() for x in flat[:max_listed]]


def extract(mesh, max_listed=25, hard_edge_limit=500000):
    """Read a mesh with OpenMaya 2.0 (world space, centimeters) plus cmds metadata."""
    import maya.cmds as cmds
    import maya.api.OpenMaya as om
    shape, xform = resolve_mesh(mesh)
    data = {"name": xform, "shape": shape}
    fn = mfn_mesh(shape)            # None for an empty mesh: MFnMesh raises on one since 2022.1
    if fn is None:
        data.update(points=[], counts=[], connects=[], empty=True, counted=mesh_counts(shape))
        return data
    sl = om.MSelectionList()
    sl.add(shape)
    dag = sl.getDagPath(0)
    data["points"] = [(p.x, p.y, p.z) for p in fn.getPoints(om.MSpace.kWorld)]
    counts, connects = fn.getVertices()
    data["counts"], data["connects"] = list(counts), list(connects)
    data["num_edges_api"] = int(_num(fn, "numEdges"))
    sets = {}
    for s in fn.getUVSetNames():
        u, v = fn.getUVs(s)
        c, ids = fn.getAssignedUVs(s)
        d = {"u": list(u), "v": list(v), "uv_counts": list(c), "uv_ids": list(ids)}
        try:
            n, _ = fn.getUvShellsIds(s)      # [verify] OM2 name; cross-check only
            d["maya_shells"] = int(n)
        except Exception:
            pass
        sets[s] = d
    data["uv_sets"] = sets
    try:
        data["current_uv_set"] = fn.currentUVSetName()
    except Exception:
        data["current_uv_set"] = None
    n, sample = _poly_info(cmds, shape, max_listed, nonManifoldEdges=True)
    data["non_manifold_edges"], data["non_manifold_sample"] = n, sample
    data["non_manifold_verts"] = _poly_info(cmds, shape, max_listed, nonManifoldVertices=True)[0]
    n, sample = _poly_info(cmds, shape, max_listed, laminaFaces=True)
    data["lamina_faces"], data["lamina_sample"] = n, sample
    pts = data["points"]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    data["transform"] = transform_info(xform, (lo, hi))
    data["history_nodes"], data["deformers"] = history_info(shape)
    data["naming"] = naming_info(xform)
    data["instanced"] = len(cmds.listRelatives(shape, allParents=True, fullPath=True) or []) > 1
    data["smooth_preview"] = cmds.getAttr(shape + ".displaySmoothMesh") if cmds.attributeQuery(
        "displaySmoothMesh", node=shape, exists=True) else None
    if cmds.attributeQuery("aiSubdivType", node=shape, exists=True):
        data["arnold_subdiv"] = {"type": cmds.getAttr(shape + ".aiSubdivType"),
                                 "iterations": cmds.getAttr(shape + ".aiSubdivIterations")}
    try:
        fr = cmds.polyNormalPerVertex(shape + ".vtx[*]", q=True, freezeNormal=True) or []
        data["locked_normal_verts"] = sum(1 for x in fr if x)
    except Exception:
        data["locked_normal_verts"] = None
    if data["num_edges_api"] <= hard_edge_limit:
        it = om.MItMeshEdge(dag)
        hard = 0
        while not it.isDone():
            sm = it.isSmooth
            if callable(sm):
                sm = sm()
            if not sm:
                hard += 1
            it.next()
        data["hard_edges"] = hard
    data["linear_unit"] = cmds.currentUnit(q=True, linear=True)
    data["up_axis"] = cmds.upAxis(q=True, axis=True)
    return data


def audit(mesh, texture_size=2048, units="cm", uv_set=None, symmetry_axis="x", symmetry_tol=None,
          max_listed=25, uv_checks=True, overlap_grid=256, max_faces_overlap=300000):
    """Full report for one mesh (transform or shape name)."""
    data = extract(mesh, max_listed=max_listed)
    if data.get("empty"):
        c = data.get("counted") or {}
        return {"object": data["name"], "shape": data["shape"], "empty": True, "verts": c.get("verts", 0),
                "faces": c.get("faces", 0)}
    return analyze(data, texture_size=texture_size, units=units, uv_set=uv_set,
                   symmetry_axis=symmetry_axis, symmetry_tol=symmetry_tol, max_listed=max_listed,
                   uv_checks=uv_checks, overlap_grid=overlap_grid, max_faces_overlap=max_faces_overlap)


def list_meshes(roots=None):
    """Transforms of every non-intermediate mesh in the scene or under `roots`."""
    import maya.cmds as cmds
    if roots:
        shapes = []
        for r in roots:
            shapes += cmds.listRelatives(r, allDescendents=True, type="mesh", fullPath=True) or []
            if cmds.nodeType(r) == "mesh":
                shapes.append(cmds.ls(r, long=True)[0])
    else:
        shapes = cmds.ls(type="mesh", long=True) or []
    out = []
    for s in shapes:
        if cmds.getAttr(s + ".intermediateObject"):
            continue
        p = (cmds.listRelatives(s, parent=True, fullPath=True) or [None])[0]
        if p and p not in out:
            out.append(p)
    return out


def audit_all(roots=None, **kw):
    reports = []
    for m in list_meshes(roots):
        try:
            reports.append(audit(m, **kw))
        except Exception as exc:
            reports.append({"object": m, "error": "%s: %s" % (type(exc).__name__, exc)})
    return reports


# =========================================================================== verdict
# severity per profile: None = not reported, "info", "warn", "error"
PROFILES = {
    #                      game     film     subd
    "ngons":            ("error", "error", "error"),   # FlippedNormals clean-scene checklist; OSD
    "tris":             (None,    None,    "warn"),    # Pixar OSD: triangles "used sparingly"
    "poles_e6plus":     ("info",  "warn",  "warn"),    # Pixar OSD: high valence costs, artifacts
    "history":          ("error", "error", "warn"),    # FlippedNormals: delete history before handoff
    "not_frozen":       ("error", "error", "warn"),    # FlippedNormals; Unreal pipeline (pipeline digest)
    "pivot":            ("warn",  "info",  None),      # Unreal: pivot at origin (pipeline digest)
    "uv_missing":       ("error", "error", "warn"),
    "uv_outside":       ("warn",  "error", "warn"),    # FlippedNormals: no UVs outside 0-1; Polycount: unless tiling
    "uv_crossing":      ("error", "error", "warn"),    # a shell across UDIM tiles
    "uv_overlap":       ("warn",  "error", "warn"),    # Maya UV help: stacked shells are normal in optimized game UVs
    "uv_self_overlap":  ("error", "error", "warn"),
    "uv_zero_area":     ("warn",  "warn",  "info"),
    "td_ratio":         (None,    "warn",  None),      # Maya UV help: technical mapping keeps one texel density
    "smooth_preview":   ("warn",  "warn",  "info"),    # FlippedNormals: save with smoothing off
    "instanced":        ("warn",  "info",  "info"),    # FBX: instances get the original's material
    "not_triangulated": ("info",  None,    None),      # FBX: tangents need an all-triangle mesh
    "locked_normals":   ("warn",  "warn",  "warn"),    # FBX troubleshooting: locked normals ignore deformation
    "default_name":     ("warn",  "warn",  "info"),
    "holes":            ("info",  "info",  "info"),
}
_PI = {"game": 0, "film": 1, "subd": 2}


def verdict(r, profile="game", symmetric=None, td_ratio_max=2.0, max_tris=None, symmetry_min_pct=99.0):
    """Problems as strings "error: ...", "warn: ...", "info: ..." (empty list = clean).
    symmetric=True adds the X-symmetry check (characters). td_ratio_max and
    symmetry_min_pct are [added] defaults. max_tris: triangle budget (tris_equivalent)."""
    if r.get("error"):
        return ["error: audit failed: %s" % r["error"]]
    if r.get("empty"):
        return ["error: empty mesh"]
    pi = _PI[profile]
    out = []

    def add(rule, msg):
        sev = PROFILES[rule][pi] if rule in PROFILES else rule
        if sev:
            out.append("%s: %s" % (sev, msg))

    # unambiguous defects: errors in every profile (FlippedNormals: lamina, non-manifold,
    # zero-length edges are "purely technical"; Unfold3D refuses non-manifold meshes)
    for key, msg in (("non_manifold_edges", "non-manifold edges (Maya polyInfo)"),
                     ("non_manifold_verts", "non-manifold vertices (Maya polyInfo)"),
                     ("edges_over_2_faces", "edges shared by 3+ faces"),
                     ("lamina_faces", "lamina faces"),
                     ("zero_area_faces", "zero-area faces"),
                     ("zero_length_edges", "zero-length edges"),
                     ("inconsistent_winding_edges", "edges between faces of opposite winding (flipped normals)")):
        if r.get(key):
            out.append("error: %d %s" % (r[key], msg))
    for key, msg in (("loose_verts", "loose vertices"), ("loose_edges", "loose edges")):
        if r.get(key):
            out.append("warn: %d %s" % (r[key], msg))
    if r.get("naming", {}).get("duplicate_short_name"):
        out.append("error: another transform has the short name %s (never two objects with the same name: "
                   "FlippedNormals)" % r["naming"]["short"])
    if r.get("ngons"):
        add("ngons", "%d n-gons (faces over 4 sides): fix by hand, not with Cleanup" % r["ngons"])
    if r.get("tris"):
        add("tris", "%d triangles in a subdivision cage" % r["tris"])
    if r.get("poles_e6plus"):
        add("poles_e6plus", "%d interior vertices with 6+ edges" % r["poles_e6plus"])
    if max_tris and r.get("tris_equivalent", 0) > max_tris:
        out.append("error: %d triangles over the budget of %d" % (r["tris_equivalent"], max_tris))
    if r.get("history_nodes"):
        add("history", "construction history: %s" % ", ".join(r["history_nodes"][:6]))
    tr = r.get("transform") or {}
    if tr and not tr.get("frozen", True):
        add("not_frozen", "transform not frozen %s" % tr.get("values"))
    if tr.get("ancestors_not_frozen"):
        add("not_frozen", "parent groups not frozen: %s" % ", ".join(tr["ancestors_not_frozen"][:4]))
    if tr and not (tr.get("pivot_at_origin") or tr.get("pivot_at_base_center")):
        add("pivot", "pivot neither at the origin nor at the base center: %s cm" % tr.get("pivot_ws_cm"))
    uv = r.get("uv") or {}
    if not uv.get("uvs"):
        add("uv_missing", "no UVs in set %s" % r.get("uv_set"))
    else:
        if uv.get("faces_without_uvs"):
            add("uv_missing", "%d faces without UVs" % uv["faces_without_uvs"])
        if uv.get("uvs_outside_01") and not uv.get("looks_udim"):
            add("uv_outside", "%d UVs outside 0-1 (fine only if the shader tiles them)" % uv["uvs_outside_01"])
        if uv.get("looks_udim") and profile == "game":
            out.append("warn: UVs use UDIM tiles %s; engines expect 0-1" % uv.get("udim_tiles"))
        if uv.get("shells_crossing_tiles") and (uv.get("looks_udim") or uv.get("uvs_outside_01")):
            add("uv_crossing", "%d shells cross a UV tile border" % uv["shells_crossing_tiles"])
        if uv.get("uv_overlap_cells"):
            add("uv_overlap", "%d shell pairs overlap (%.2f%% of covered cells): unique bakes and lightmaps "
                "need unique UVs" % (uv.get("uv_overlapping_shell_pairs", 0), uv.get("uv_overlap_pct", 0)))
        so = uv.get("uv_self_overlap_cells") or 0
        if so > max(4, 0.001 * (uv.get("uv_covered_cells") or 0)):   # [added] tolerance
            add("uv_self_overlap", "%d UV cells covered twice inside one shell (folds)" % so)
        if uv.get("uv_folded_faces"):
            add("uv_self_overlap", "%d UV faces flipped against their shell" % uv["uv_folded_faces"])
        if uv.get("uv_zero_area_faces"):
            add("uv_zero_area", "%d faces with zero UV area" % uv["uv_zero_area_faces"])
        td = uv.get("texel_density") or {}
        if td_ratio_max and td.get("max_over_min") and td["max_over_min"] > td_ratio_max:
            add("td_ratio", "texel density varies %.2fx across shells (%.3g to %.3g %s)"
                % (td["max_over_min"], td["min"], td["max"], td.get("units")))
    if r.get("smooth_preview"):
        add("smooth_preview", "Smooth Mesh Preview is on (press 1 before saving)")
    if r.get("instanced"):
        add("instanced", "shape is instanced")
    if not r.get("all_triangles"):
        add("not_triangulated", "not triangulated: FBX writes tangents and binormals only for all-triangle meshes")
    if r.get("locked_normal_verts"):
        add("locked_normals", "%d vertices with locked normals (they will not follow skinning)" % r["locked_normal_verts"])
    if r.get("naming", {}).get("default_name"):
        add("default_name", "default name %s" % r["naming"]["short"])
    if r.get("holes"):
        add("holes", "%d open borders %s (expected for eye holes or cut necks, else holes)"
            % (r["holes"], r.get("border_loops")))
    if symmetric and r.get("symmetry_pct", 100) < symmetry_min_pct:
        out.append("warn: only %.1f%% of vertices mirror across %s=0 (center offset %s %s)"
                   % (r["symmetry_pct"], r.get("symmetry_axis"), r.get("center_offset"), r.get("units")))
    order = {"error": 0, "warn": 1, "info": 2}
    out.sort(key=lambda s: order.get(s.split(":", 1)[0], 3))
    return out


def passed(r, profile="game", **kw):
    return not any(p.startswith("error") for p in verdict(r, profile, **kw))


# =========================================================================== CLI (via mx_run)
def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="mx_audit")
    ap.add_argument("--mesh", default="", help="comma list of meshes")
    ap.add_argument("--all", action="store_true", help="every mesh in the scene (or under --roots)")
    ap.add_argument("--roots", default="", help="comma list of root groups for --all")
    ap.add_argument("--texture-size", type=int, default=2048)
    ap.add_argument("--units", default="cm", choices=sorted(UNIT_PER_CM))
    ap.add_argument("--uv-set", default=None)
    ap.add_argument("--profile", default="game", choices=sorted(_PI))
    ap.add_argument("--symmetric", action="store_true")
    ap.add_argument("--max-tris", type=int, default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args(argv)
    kw = dict(texture_size=a.texture_size, units=a.units, uv_set=a.uv_set)
    if a.all or not a.mesh:
        reports = audit_all([x for x in a.roots.split(",") if x] or None, **kw)
    else:
        reports = [audit(m, **kw) for m in a.mesh.split(",") if m]
    out = {"profile": a.profile, "reports": reports,
           "problems": {r.get("object"): verdict(r, a.profile, symmetric=a.symmetric, max_tris=a.max_tris)
                        for r in reports}}
    if a.json:
        with open(a.json, "w") as f:
            json.dump(out, f, indent=1)
    return out


if __name__ == "__main__":
    import maya.standalone
    maya.standalone.initialize(name="python")
    try:
        print(json.dumps(main(sys.argv[1:]), indent=1))
    finally:
        maya.standalone.uninitialize()
