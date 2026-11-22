"""
bx_uvbake: UV unwrapping, UV QA and high-to-low baking for Blender 5.2 (headless-safe).

Every public function works from Object Mode, restores selection, active object, modes and
render settings it touched, and returns a plain dict an agent can print as JSON.

  import sys; sys.path.append("<skills>/scenario-blender-uv-baking/scripts"); import bx_uvbake as ub

  # seams
  ub.seams_from_sharp(obj, angle_deg=30)            # hard-surface: every hard edge is a seam
  ub.seams_from_groups(obj, "FACE_SETS")            # organic: seams on region borders
  ub.cut_to_disks(obj, view_dirs=[(0, -1, 0)])      # ring / closed-shape rule, hidden side
  ub.island_topology(obj)                           # which islands are not disks yet
  # unwrap, density, pack
  ub.unwrap(obj, method="ANGLE_BASED")              # or "MINIMUM_STRETCH", "CONFORMAL", "BEST"
  ub.straighten(obj)                                # grid islands: Follow Active Quads + pins
  ub.normalize_texel_density(obj, 512, 2048)        # px/m target, optional priority weights
  ub.pack(obj, tex_res=2048)                        # pixel gap = res/128, no tilted islands
  ub.uv_qa(obj, tex_res=2048); ub.uv_verdict(report)
  ub.uv_layout_image(obj, "/abs/uv.png"); ub.checker_review([obj], "/abs/dir")
  # bake
  ub.prepare_low(low)                               # smooth shading, scale, optional sharps
  r = ub.bake_high_to_low(low, [high], "/abs/dir", res=2048, maps=("NORMAL", "AO"))
  r["paths"]["NORMAL"], r["sanity"]["NORMAL"]["problems"]
  ub.bake_multires(obj, "/abs/dir"); ub.bake_id(...); ub.curvature_from_normal(...)
  ub.bake_review(low, [high], {"NORMAL": path, "AO": path}, "/abs/dir")

Tested on Blender 5.2.1 LTS (tests/code/blender-uv-baking/). Facts the code relies on
(all verified there): uv.unwrap defaults to CONFORMAL and returns FINISHED even when an
island fails to solve; pack_islands FRACTION margin m leaves 2m between islands and m to
the tile border; bake writes only to an image node that is selected AND active and
returns CANCELLED silently otherwise; selected-to-active evaluates the low with RENDER
settings (Multires render_levels), measures max_ray_distance from the extruded start,
never lets the active low occlude its own AO, but every other render-visible object does.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import colorsys
import heapq
import math
import os
from contextlib import contextmanager

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ADAPTIVE_FACTORS = (0.05, 0.15, 0.35, 0.7, 1.0)
# Game texel density targets in px/m (Huge Menace, sR1sAWWT2x8 [00:12:28])
TD_TARGETS = {"fps": 1024.0, "fps_weapon": 2048.0, "third_person": 512.0, "top_down": 256.0}
SENTINEL = -7.0


# --------------------------------------------------------------------------- helpers
def _object_mode():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def _layer(me, uv_map=None):
    if uv_map:
        return me.uv_layers[uv_map]
    if me.uv_layers.active is None:
        raise ValueError(f"mesh {me.name} has no UV map")
    return me.uv_layers.active


def _get_uv(me, uv_map=None):
    lay = _layer(me, uv_map)
    a = np.empty(len(me.loops) * 2, dtype=np.float64)
    lay.uv.foreach_get("vector", a)
    return a.reshape(-1, 2)


def _set_uv(me, uv, uv_map=None):
    _layer(me, uv_map).uv.foreach_set("vector", np.ascontiguousarray(uv, dtype=np.float64).ravel())
    me.update()


def _get_pins(me, uv_map=None):
    lay = _layer(me, uv_map)
    att = me.attributes.get(".pn." + lay.name)
    if att is None:
        return np.zeros(len(me.loops), dtype=bool)
    a = np.zeros(len(me.loops), dtype=bool)
    att.data.foreach_get("value", a)
    return a


def _set_pins(me, pins, uv_map=None):
    lay = _layer(me, uv_map)
    name = ".pn." + lay.name
    att = me.attributes.get(name) or me.attributes.new(name, "BOOLEAN", "CORNER")
    att.data.foreach_set("value", np.ascontiguousarray(pins, dtype=bool))


@contextmanager
def _edit_mode(objs, uv_map=None, select_all=True):
    """Enter Edit Mode on objs with UV sync selection on; restore everything after."""
    vl = bpy.context.view_layer
    _object_mode()
    prev_sel = [o for o in vl.objects if o.select_get()]
    prev_act = vl.objects.active
    hidden = [o for o in objs if o.hide_get()]
    for o in hidden:
        o.hide_set(False)
    prev_uv = {o.name: o.data.uv_layers.active_index for o in objs}
    if uv_map:
        for o in objs:
            o.data.uv_layers.active = o.data.uv_layers[uv_map]
    ts = bpy.context.scene.tool_settings
    prev_sync = ts.use_uv_select_sync
    ts.use_uv_select_sync = True
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    if select_all:
        bpy.ops.mesh.select_all(action="SELECT")
    try:
        yield
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        ts.use_uv_select_sync = prev_sync
        for o in objs:
            o.data.uv_layers.active_index = prev_uv[o.name]
        for o in hidden:
            o.hide_set(True)
        for o in vl.objects:
            o.select_set(o in prev_sel)
        vl.objects.active = prev_act


class _Arrays:
    """Numpy view of a mesh: world positions, loops, faces, UVs."""

    def __init__(self, obj, uv_map=None, evaluated=False):
        self._eo = None
        if evaluated:
            dg = bpy.context.evaluated_depsgraph_get()
            self._eo = obj.evaluated_get(dg)
            me = self._eo.to_mesh()
            mw = self._eo.matrix_world
        else:
            me = obj.data
            mw = obj.matrix_world
        self.me = me
        nv, nl, nf = len(me.vertices), len(me.loops), len(me.polygons)
        co = np.empty(nv * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        M = np.array(mw)
        self.co = co @ M[:3, :3].T + M[:3, 3]
        self.lv = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("vertex_index", self.lv)
        self.le = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("edge_index", self.le)
        self.ls = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_start", self.ls)
        self.lt = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_total", self.lt)
        self.nf, self.nl, self.ne = nf, nl, len(me.edges)
        self.lf = np.repeat(np.arange(nf), self.lt)
        pos = np.arange(nl) - self.ls[self.lf]
        self.nxt = self.ls[self.lf] + (pos + 1) % self.lt[self.lf]
        self.prv = self.ls[self.lf] + (pos - 1) % self.lt[self.lf]
        self.uv = _get_uv(me, uv_map) if me.uv_layers else None

    def free(self):
        if self._eo is not None:
            self._eo.to_mesh_clear()
            self._eo = None


def _union_find(n, a, b):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for x, y in zip(a.tolist(), b.tolist()):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry
    roots = np.array([find(i) for i in range(n)], dtype=np.int64)
    return np.unique(roots, return_inverse=True)[1]


def _edge_pairs(A):
    """Loops sharing an edge: returns (edge_ids, c1, c2) for edges used by exactly 2 loops."""
    order = np.argsort(A.le, kind="stable")
    les = A.le[order]
    uniq, start, cnt = np.unique(les, return_index=True, return_counts=True)
    two = cnt == 2
    return uniq[two], order[start[two]], order[start[two] + 1]


def _uv_islands(A, eps=1e-5):
    """UV islands (faces connected by edges whose UVs match on both sides) and the
    set of UV-continuous edge ids."""
    e, c1, c2 = _edge_pairs(A)
    uv = A.uv
    opp = A.lv[c1] == A.lv[A.nxt[c2]]
    m_opp = (np.abs(uv[c1] - uv[A.nxt[c2]]).max(1) < eps) & (np.abs(uv[A.nxt[c1]] - uv[c2]).max(1) < eps)
    m_same = (np.abs(uv[c1] - uv[c2]).max(1) < eps) & (np.abs(uv[A.nxt[c1]] - uv[A.nxt[c2]]).max(1) < eps)
    con = np.where(opp, m_opp, m_same)
    labels = _union_find(A.nf, A.lf[c1][con], A.lf[c2][con])
    return labels, e[con]


def _seam_islands(obj):
    """Face groups separated by seams, mesh borders and non-manifold edges."""
    me = obj.data
    A = _Arrays(obj)
    seam = np.zeros(len(me.edges), dtype=bool)
    me.edges.foreach_get("use_seam", seam)
    e, c1, c2 = _edge_pairs(A)
    keep = ~seam[e]
    return _union_find(A.nf, A.lf[c1][keep], A.lf[c2][keep])


def _face_measures(A):
    uv, nxt = A.uv, A.nxt
    cr = uv[:, 0] * uv[nxt, 1] - uv[nxt, 0] * uv[:, 1]
    a_uv = 0.5 * np.bincount(A.lf, cr, minlength=A.nf)
    P = A.co[A.lv]
    c = np.cross(P, P[nxt])
    a3 = 0.5 * np.linalg.norm(np.stack([np.bincount(A.lf, c[:, k], minlength=A.nf) for k in range(3)], 1), axis=1)
    return a_uv, a3


def _corner_angles(X, A):
    a = X[A.prv] - X
    b = X[A.nxt] - X
    na = np.linalg.norm(a, axis=1)
    nb = np.linalg.norm(b, axis=1)
    ok = (na > 1e-12) & (nb > 1e-12)
    cos = np.einsum("ij,ij->i", a, b) / np.where(ok, na * nb, 1.0)
    return np.arccos(np.clip(cos, -1, 1)), ok


def _wpct(values, weights, q):
    if len(values) == 0:
        return float("nan")
    o = np.argsort(values)
    v, w = values[o], weights[o]
    cw = np.cumsum(w)
    return float(v[min(np.searchsorted(cw, q * cw[-1]), len(v) - 1)])


def _tris(A, uv=None):
    """Triangulation of every face: (T,3) loop indices and owning face. Quads are split on
    the diagonal that keeps both UV triangles the same orientation (a fan over a concave
    UV quad would fake an overlap); n-gons are fanned."""
    t0, t1, t2, tf = [], [], [], []
    for n in np.unique(A.lt):
        faces = np.nonzero(A.lt == n)[0]
        s = A.ls[faces]
        if n == 4 and uv is not None:
            def sa(i, j, k):
                a, b, c = uv[s + i], uv[s + j], uv[s + k]
                return (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])
            d02 = np.minimum(sa(0, 1, 2) * np.sign(sa(0, 2, 3) + sa(0, 1, 2)), sa(0, 2, 3) * np.sign(sa(0, 2, 3) + sa(0, 1, 2)))
            d13 = np.minimum(sa(1, 2, 3) * np.sign(sa(1, 3, 0) + sa(1, 2, 3)), sa(1, 3, 0) * np.sign(sa(1, 3, 0) + sa(1, 2, 3)))
            alt = d13 > d02
            base = np.where(alt, 1, 0)
            for k in (1, 2):
                t0.append(s + base)
                t1.append(s + (base + k) % 4)
                t2.append(s + (base + k + 1) % 4)
                tf.append(faces)
            continue
        for k in range(1, n - 1):
            t0.append(s)
            t1.append(s + k)
            t2.append(s + k + 1)
            tf.append(faces)
    return np.stack([np.concatenate(t0), np.concatenate(t1), np.concatenate(t2)], 1), np.concatenate(tf)


def _raster(tri_uv, tri_label, res, tile=(0, 0)):
    """Rasterize UV triangles into one tile: coverage count, label map, overlapping label pairs."""
    cnt = np.zeros((res, res), dtype=np.uint16)
    lab = np.full((res, res), -1, dtype=np.int64)
    pairs = set()
    P = (tri_uv - np.array(tile, dtype=np.float64)) * res
    lo = np.floor(P.min(1) - 0.5).astype(np.int64)
    hi = np.ceil(P.max(1) - 0.5).astype(np.int64)
    inside_tile = (hi[:, 0] >= 0) & (hi[:, 1] >= 0) & (lo[:, 0] < res) & (lo[:, 1] < res)
    for t in np.nonzero(inside_tile)[0]:
        x0, y0 = max(lo[t, 0], 0), max(lo[t, 1], 0)
        x1, y1 = min(hi[t, 0], res - 1), min(hi[t, 1], res - 1)
        if x1 < x0 or y1 < y0:
            continue
        (ax, ay), (bx, by), (cx, cy) = P[t]
        d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(d) < 1e-12:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((bx - X) * (cy - Y) - (cx - X) * (by - Y)) / d
        w1 = ((cx - X) * (ay - Y) - (ax - X) * (cy - Y)) / d
        ins = (w0 > 0) & (w1 > 0) & (1 - w0 - w1 > 0)
        if not ins.any():
            continue
        sub_l = lab[y0:y1 + 1, x0:x1 + 1]
        other = sub_l[ins]
        other = other[(other >= 0) & (other != tri_label[t])]
        if len(other):
            for o in np.unique(other).tolist():
                pairs.add((min(o, int(tri_label[t])), max(o, int(tri_label[t]))))
        cnt[y0:y1 + 1, x0:x1 + 1][ins] += 1
        sub_l[ins] = tri_label[t]
    return cnt, lab, pairs


def _min_gap(lab, cap):
    """Smallest gap (px) between differently labelled regions, by simultaneous dilation.
    Returns a value <= 2*cap+1, or None when every gap is larger."""
    def touching(L):
        h = (L[:, 1:] != L[:, :-1]) & (L[:, 1:] >= 0) & (L[:, :-1] >= 0)
        v = (L[1:, :] != L[:-1, :]) & (L[1:, :] >= 0) & (L[:-1, :] >= 0)
        return h.any() or v.any()

    L = lab.copy()
    if touching(L):
        return 0
    for k in range(1, cap + 1):
        N = L.copy()
        for sl_dst, sl_src in (((slice(None), slice(1, None)), (slice(None), slice(None, -1))),
                               ((slice(None), slice(None, -1)), (slice(None), slice(1, None))),
                               ((slice(1, None), slice(None)), (slice(None, -1), slice(None))),
                               ((slice(None, -1), slice(None)), (slice(1, None), slice(None)))):
            dst, src = N[sl_dst], L[sl_src]
            m = (dst < 0) & (src >= 0)
            dst[m] = src[m]
        if k % 2 == 0:  # alternate 4- and 8-neighbourhood: closer to Euclidean growth
            for sy, sx in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                src = np.roll(np.roll(L, sy, 0), sx, 1)
                m = (N < 0) & (src >= 0)
                N[m] = src[m]
        L = N
        if touching(L):
            return 2 * k - 1
    return None


# --------------------------------------------------------------------------- seams
def seams_from_sharp(obj, angle_deg=30.0, use_sharp_attr=True, mark_sharp=False, clear_first=False):
    """Hard-surface rule (Lampel, Gambrell, On Mars 3D): every hard edge is a UV seam.
    Hard = dihedral angle above angle_deg, or flagged sharp (sharp_edge attribute).
    mark_sharp=True also flags those edges sharp, so shading splits exactly on seams."""
    _object_mode()
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    thr = math.radians(angle_deg)
    added = 0
    for e in bm.edges:
        if clear_first:
            e.seam = False
        if not e.is_manifold:
            continue
        hard = e.calc_face_angle(0.0) > thr or (use_sharp_attr and not e.smooth)
        if hard:
            if not e.seam:
                added += 1
            e.seam = True
            if mark_sharp:
                e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.update()
    return {"seams_added": added, "seams_total": sum(e.use_seam for e in me.edges)}


def _face_labels(obj, groups):
    me = obj.data
    n = len(me.polygons)
    if isinstance(groups, str):
        if groups == "MATERIAL":
            a = np.empty(n, dtype=np.int64)
            me.polygons.foreach_get("material_index", a)
            return a
        name = ".sculpt_face_set" if groups == "FACE_SETS" else groups
        att = me.attributes.get(name)
        if att is None or att.domain != "FACE":
            raise ValueError(f"no face attribute {name!r} on {obj.name}")
        a = np.empty(n, dtype=np.int64 if att.data_type == "INT" else np.float64)
        att.data.foreach_get("value", a)
        return a
    a = np.asarray(groups)
    if len(a) != n:
        raise ValueError("groups needs one label per face")
    return a


def seams_from_groups(obj, groups="FACE_SETS", clear_first=False, faces=None):
    """Seam every edge between faces of different groups. groups: 'FACE_SETS', 'MATERIAL',
    a face attribute name, or one label per face (e.g. part ids an agent computed).
    faces: restrict to edges inside this face subset (e.g. one island that folds)."""
    _object_mode()
    me = obj.data
    lab = _face_labels(obj, groups)
    sub = None if faces is None else set(int(i) for i in faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    added = 0
    for e in bm.edges:
        if clear_first:
            e.seam = False
        if sub is not None and not all(f.index in sub for f in e.link_faces):
            continue
        if len(e.link_faces) == 2 and lab[e.link_faces[0].index] != lab[e.link_faces[1].index]:
            added += int(not e.seam)
            e.seam = True
    bm.to_mesh(me)
    bm.free()
    me.update()
    return {"seams_added": added, "groups": int(len(np.unique(lab)))}


def seams_from_uv_islands(obj, clear_first=True, uv_map=None):
    """Lampel: 'Seams from Islands' before re-unwrapping, or the existing layout's islands
    are thrown away. Also the way to recover real UV seams when the file's seam flags are
    leftover retopology marks (check with island_topology)."""
    _object_mode()
    if clear_first:
        for e in obj.data.edges:
            e.use_seam = False
    with _edit_mode([obj], uv_map):
        bpy.ops.uv.seams_from_islands(mark_seams=True, mark_sharp=False)
    return {"seams_total": sum(e.use_seam for e in obj.data.edges)}


def _visibility(bm, obj, view_dirs):
    """Per face: how much it faces the given view directions, graded 0 (pointing straight
    away) to 1 (facing the viewer), so the most hidden path wins, not any back-facing one."""
    N = np.array(obj.matrix_world.to_3x3().inverted().transposed())
    D = np.array([Vector(d).normalized() for d in view_dirs]) if view_dirs else np.zeros((0, 3))
    vis = np.zeros(len(bm.faces))
    if len(D) == 0:
        return vis
    fn = np.array([f.normal for f in bm.faces]) @ N.T
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    return ((fn @ D.T + 1.0) / 2.0).max(1)


def _edge_cost(e, vis, floor=0.05):
    v = np.mean([vis[f.index] for f in e.link_faces]) if e.link_faces else 1.0
    return e.calc_length() * (floor + v * v)


def _dijkstra(sources, targets, allowed, cost):
    """Shortest edge path over bm verts. sources/targets: sets of BMVerts; allowed(e) bool."""
    dist = {v: 0.0 for v in sources}
    prev = {}
    heap = [(0.0, v.index, v) for v in sources]
    heapq.heapify(heap)
    done = set()
    while heap:
        d, _, v = heapq.heappop(heap)
        if v in done:
            continue
        done.add(v)
        if v in targets:
            path = []
            while v in prev:
                e, v = prev[v]
                path.append(e)
            return path
        for e in v.link_edges:
            if not allowed(e):
                continue
            w = e.other_vert(v)
            nd = d + cost(e)
            if nd < dist.get(w, float("inf")):
                dist[w] = nd
                prev[w] = (e, v)
                heapq.heappush(heap, (nd, w.index, w))
    return None


def seam_path(obj, v_from, v_to, view_dirs=((0, -1, 0),)):
    """Mark the least visible shortest edge path between two vertex indices as a seam
    (the headless stand-in for Ctrl+click Tag Seam)."""
    _object_mode()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    vis = _visibility(bm, obj, view_dirs)
    path = _dijkstra({bm.verts[v_from]}, {bm.verts[v_to]}, lambda e: True, lambda e: _edge_cost(e, vis))
    for e in path or []:
        e.seam = True
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return {"edges": len(path or []), "found": path is not None}


def _topology(bm, island_faces):
    """Euler characteristic of the island cut open along its seams, boundary loop count."""
    fset = set(island_faces)
    verts = {v for f in island_faces for v in f.verts}
    edges = {e for f in island_faces for e in f.edges}

    def interior(e):
        lf = e.link_faces
        return len(lf) == 2 and not e.seam and lf[0] in fset and lf[1] in fset

    E = sum(1 if interior(e) else sum(1 for f in e.link_faces if f in fset) for e in edges)
    V = 0
    for v in verts:
        fs = [f for f in v.link_faces if f in fset]
        par = {f: f for f in fs}

        def find(x):
            while par[x] is not x:
                par[x] = par[par[x]]
                x = par[x]
            return x

        for e in v.link_edges:
            if interior(e):
                a, b = e.link_faces
                par[find(a)] = find(b)
        V += len({find(f) for f in fs})
    chi = V - E + len(island_faces)
    bedges = [e for e in edges if not interior(e)]
    par = {}

    def find2(x):
        par.setdefault(x, x)
        while par[x] is not x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    for e in bedges:
        a, b = e.verts
        par[find2(a)] = find2(b)
    loops = len({find2(v) for e in bedges for v in e.verts})
    return chi, loops, bedges, interior


def _kind(chi, loops):
    genus = (2 - chi - loops) // 2
    if chi == 1:
        return "disk", genus
    if loops == 0:
        return ("closed" if genus == 0 else "closed_handle"), genus
    if genus > 0:
        return "handle", genus
    return ("ring" if loops == 2 else "holes"), genus


def island_topology(obj):
    """Per seam island: faces, Euler characteristic chi, boundary loops and genus.
    disk (chi 1) always flattens; ring (2 loops) and holes (3+ loops, genus 0) flatten as a
    planar shape with holes, fine for a flat washer or a face with eye holes, badly for a
    long tube (measure it: cut_to_disks does); closed (no boundary) cannot flatten at all;
    handle / closed_handle (genus > 0, e.g. a torus) need loop cuts."""
    _object_mode()
    labels = _seam_islands(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    out = []
    for k in range(labels.max() + 1 if len(labels) else 0):
        faces = [bm.faces[i] for i in np.nonzero(labels == k)[0]]
        chi, loops, _, _ = _topology(bm, faces)
        kind, genus = _kind(chi, loops)
        out.append({"island": k, "faces": len(faces), "chi": chi, "loops": loops, "genus": genus, "kind": kind})
    bm.free()
    return {"islands": len(out), "not_disk": [i for i in out if i["kind"] != "disk"],
            "must_cut": [i for i in out if i["kind"] in ("closed", "closed_handle", "handle")], "all": out}


def _island_quality(obj, face_idx, uv_name):
    """Unwrap one island alone (Angle Based, fill holes) and measure it; UVs restored."""
    me = obj.data
    old = _get_uv(me, uv_name).copy()
    fs = set(int(i) for i in face_idx)
    with _edit_mode([obj], uv_name, select_all=False):
        bm = bmesh.from_edit_mesh(me)
        for f in bm.faces:
            f.select_set(f.index in fs)
        bmesh.update_edit_mesh(me)
        bpy.ops.uv.unwrap(method="ANGLE_BASED", fill_holes=True, margin=0.001)
    A = _Arrays(obj, uv_name)
    a_uv, a3 = _face_measures(A)
    fm = np.zeros(A.nf, dtype=bool)
    fm[list(fs)] = True
    ang_uv, ok1 = _corner_angles(np.c_[A.uv, np.zeros(A.nl)], A)
    ang_3d, ok2 = _corner_angles(A.co[A.lv], A)
    lm = fm[A.lf] & ok1 & ok2
    td = np.sqrt(np.abs(a_uv[fm]) / np.maximum(a3[fm], 1e-18))
    spread = _wpct(td, a3[fm], 0.95) / max(_wpct(td, a3[fm], 0.05), 1e-12)
    ang95 = float(np.percentile(np.degrees(np.abs(ang_uv - ang_3d)[lm]), 95)) if lm.any() else 0.0
    flipped = int((a_uv[fm] < 0).sum())
    A.free()
    _set_uv(me, old, uv_name)
    return spread, ang95, flipped


def cut_to_disks(obj, view_dirs=((0, -1, 0),), strict=False, max_spread=2.0, max_angle_p95=20.0, max_cuts=200):
    """Add the least visible seams an island needs to flatten well.
    Always: closed shells get a slit (Morren: anything closed on itself needs a cut), genus > 0
    (torus, handle) gets its loops via a tree-cotree cut. Islands with holes (ring, holes)
    are test-unwrapped first and cut between two boundaries only while their density spread
    exceeds max_spread or angle error p95 exceeds max_angle_p95 (a long tube: Gambrell's ring
    rule; a flat washer or a face with eye holes stays whole). strict=True cuts every island
    down to a disk. view_dirs: directions toward the viewer (front = (0,-1,0)); seams avoid
    faces facing them."""
    _object_mode()
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv_name = me.uv_layers.active.name
    report = {"cuts": 0, "kept_with_holes": [], "unsolved": []}
    accepted = set()
    for _ in range(max_cuts):
        labels = _seam_islands(obj)
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        vis = _visibility(bm, obj, view_dirs)
        cost = lambda e: _edge_cost(e, vis)
        changed = False
        for k in range(labels.max() + 1):
            fidx = np.nonzero(labels == k)[0]
            key = (len(fidx), int(fidx[0]))
            if key in accepted:
                continue
            faces = [bm.faces[i] for i in fidx]
            chi, loops, bedges, interior = _topology(bm, faces)
            kind, genus = _kind(chi, loops)
            if kind == "disk":
                continue
            fverts = {v for f in faces for v in f.verts}
            path = None
            if kind in ("ring", "holes"):
                if not strict:
                    spread, ang95, flipped = _island_quality(obj, fidx, uv_name)
                    if spread <= max_spread and ang95 <= max_angle_p95 and flipped == 0:
                        accepted.add(key)
                        report["kept_with_holes"].append({"faces": len(fidx), "loops": loops, "spread": round(spread, 2),
                                                          "angle_p95": round(ang95, 1)})
                        continue
                par = {}

                def find(x):
                    par.setdefault(x, x)
                    while par[x] is not x:
                        par[x] = par[par[x]]
                        x = par[x]
                    return x

                for e in bedges:
                    par[find(e.verts[0])] = find(e.verts[1])
                comp = {}
                for e in bedges:
                    for v in e.verts:
                        comp.setdefault(find(v), set()).add(v)
                groups = sorted(comp.values(), key=lambda g: (len(g), min(v.index for v in g)))
                path = _dijkstra(groups[0], set().union(*groups[1:]), interior, cost)
            elif kind == "closed":
                vs = sorted(fverts, key=lambda v: v.index)
                vvis = np.array([np.mean([vis[f.index] for f in v.link_faces]) for v in vs])
                a = vs[int(np.argmin(vvis))]
                low = [v for v, sv in zip(vs, vvis) if sv <= np.median(vvis)]
                far = max(low, key=lambda v: (v.co - a.co).length)
                path = _dijkstra({a}, {far}, interior, cost)
            elif kind == "closed_handle":
                path = _tree_cotree(bm, faces, fverts, interior, cost, vis)
            else:
                report["unsolved"].append({"faces": len(fidx), "chi": chi, "loops": loops, "genus": genus,
                                           "hint": "handle on an open island: seam a loop around it"})
                accepted.add(key)
                continue
            if path:
                for e in path:
                    e.seam = True
                report["cuts"] += 1
                changed = True
                break
        bm.to_mesh(me)
        bm.free()
        me.update()
        if not changed:
            break
    report["topology"] = island_topology(obj)["must_cut"]
    return report


def _tree_cotree(bm, faces, fverts, interior, cost, vis):
    """Cut graph of a closed surface of genus g: 2g loops through the least visible vertex."""
    root = min(fverts, key=lambda v: (np.mean([vis[f.index] for f in v.link_faces]), v.index))
    dist, prev = {root: 0.0}, {}
    heap = [(0.0, root.index, root)]
    done = set()
    while heap:
        d, _, v = heapq.heappop(heap)
        if v in done:
            continue
        done.add(v)
        for e in v.link_edges:
            if not interior(e):
                continue
            w = e.other_vert(v)
            nd = d + cost(e)
            if nd < dist.get(w, float("inf")):
                dist[w], prev[w] = nd, (e, v)
                heapq.heappush(heap, (nd, w.index, w))
    tree = {e for e, _ in prev.values()}
    fset = set(faces)
    dual_edges = sorted([e for f in faces for e in f.edges if interior(e) and e not in tree],
                        key=lambda e: -cost(e))  # keep visible edges in the co-tree (uncut)
    par = {f: f for f in fset}

    def find(x):
        while par[x] is not x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    left = []
    for e in dict.fromkeys(dual_edges):
        a, b = e.link_faces
        ra, rb = find(a), find(b)
        if ra is rb:
            left.append(e)
        else:
            par[ra] = rb
    cut = set()
    for e in left:
        cut.add(e)
        for v in e.verts:
            while v in prev:
                pe, v = prev[v]
                cut.add(pe)
    return list(cut)


# --------------------------------------------------------------------------- unwrap
def _self_overlap(uv, T, tf, faces_mask, res=256):
    """Share of an island's covered pixels covered twice (global fold), island-normalized."""
    sel = faces_mask[tf]
    if not sel.any():
        return 0.0
    tri = uv[T[sel]]
    lo = tri.reshape(-1, 2).min(0)
    span = max(float((tri.reshape(-1, 2).max(0) - lo).max()), 1e-9)
    cnt, _, _ = _raster((tri - lo) / span * 0.999, np.zeros(len(tri), dtype=np.int64), res)
    cov = (cnt > 0).sum()
    return float((cnt > 1).sum()) / max(cov, 1)


def _score(a_uv, a3, ang_err, faces_mask, loops_mask):
    td = np.sqrt(np.abs(a_uv[faces_mask]) / np.maximum(a3[faces_mask], 1e-18))
    w = a3[faces_mask]
    spread = _wpct(td, w, 0.95) / max(_wpct(td, w, 0.05), 1e-12)
    ang = float(np.degrees(ang_err[loops_mask].mean())) if loops_mask.any() else 0.0
    return ang / 5.0 + math.log2(max(spread, 1.0)), spread, ang


def unwrap(obj, method="ANGLE_BASED", uv_map=None, faces=None, fill_holes=True, correct_aspect=True,
           use_subsurf_data=False, iterations=10, weight_group=None, weight_factor=1.0):
    """Unwrap along the marked seams with an explicit method (5.2 defaults to CONFORMAL).
    method: 'ANGLE_BASED' (organic default), 'CONFORMAL' (flat hard-surface islands),
    'MINIMUM_STRETCH' (most even density), or 'BEST' = all three, kept per island by
    score = mean angle error / 5 deg + log2(density spread p95/p05).
    Detects islands the solver silently skipped ('Unwrap failed to solve') and restores
    their previous UVs. weight_group: vertex group whose weights give more texture space
    to heavy areas (MINIMUM_STRETCH only; 5.x importance weights).
    Islands that fold over themselves in every method (a limb flattened onto the body: no
    flipped face, still an overlap) are returned in folding_islands / folding_faces: add a
    seam that separates the branch (seams_from_groups(..., faces=folding_faces)) and
    unwrap again."""
    _object_mode()
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name=uv_map or "UVMap")
    lname = _layer(me, uv_map).name     # keep the NAME: layer references go stale after Edit Mode
    A = _Arrays(obj, lname)
    fsel = np.ones(A.nf, dtype=bool) if faces is None else np.isin(np.arange(A.nf), np.asarray(faces))
    lsel = fsel[A.lf]
    old = A.uv.copy()
    pins = _get_pins(me, lname)
    labels = _seam_islands(obj)
    methods = ["ANGLE_BASED", "CONFORMAL", "MINIMUM_STRETCH"] if method == "BEST" else [method]
    results = {}
    for m in methods:
        uv = old.copy()
        uv[lsel & ~pins] = SENTINEL
        _set_uv(me, uv, lname)
        with _edit_mode([obj], lname, select_all=False):
            bm = bmesh.from_edit_mesh(me)
            for f in bm.faces:
                f.select_set(bool(fsel[f.index]))
            bmesh.update_edit_mesh(me)
            kw = dict(method=m, fill_holes=fill_holes, correct_aspect=correct_aspect,
                      use_subsurf_data=use_subsurf_data, margin_method="SCALED", margin=0.001)
            if m == "MINIMUM_STRETCH":
                kw["iterations"] = iterations
                if weight_group:
                    kw.update(use_weights=True, weight_group=weight_group, weight_factor=weight_factor)
            r = bpy.ops.uv.unwrap(**kw)
        new = _get_uv(me, lname)
        # 5.2.1: an island the solver cannot flatten (closed, no seam) keeps its previous UVs
        # (here the sentinel, repacked to a zero-area point) while the operator returns FINISHED.
        A.uv = new
        a_uv_n, a3_n = _face_measures(A)
        bad_f = fsel & (a3_n > 1e-14) & (np.abs(a_uv_n) < 1e-14)
        stuck = (np.all(new == SENTINEL, axis=1) | bad_f[A.lf]) & lsel
        new[stuck] = old[stuck]
        results[m] = (new, int(len(np.unique(A.lf[stuck]))), r)
    # pick per island
    per_island = {}
    final = old.copy()
    A.uv = None
    uv3 = {}
    for m, (uv, _, _) in results.items():
        A.uv = uv
        a_uv, a3 = _face_measures(A)
        ang_uv, ok1 = _corner_angles(np.c_[uv, np.zeros(len(uv))], A)
        ang_3d, ok2 = _corner_angles(A.co[A.lv], A)
        uv3[m] = (a_uv, a3, np.where(ok1 & ok2, np.abs(ang_uv - ang_3d), 0.0))
    tris = {m: _tris(A, results[m][0]) for m in results}
    folding = []
    for k in np.unique(labels[fsel]):
        fm = (labels == k) & fsel
        lm = fm[A.lf]
        scores = {}
        for m in results:
            sc, sp, an = _score(*uv3[m], fm, lm)
            ov = _self_overlap(results[m][0], *tris[m], fm)
            scores[m] = (sc + 100.0 * ov, sp, an, ov)
        best = min(scores, key=lambda m: scores[m][0])
        final[lm] = results[best][0][lm]
        per_island[int(k)] = {m: {"score": round(s[0], 3), "spread": round(s[1], 2), "angle_err_deg": round(s[2], 2),
                                  "self_overlap": round(s[3], 4)} for m, s in scores.items()} | {"chosen": best}
        if scores[best][3] > 0.005:     # > 0.5% of the island's pixels: a real fold, not a slit-tip sliver
            folding.append({"island": int(k), "faces": np.nonzero(fm)[0].tolist(), "self_overlap": round(scores[best][3], 4)})
    _set_uv(me, final, lname)
    if method == "BEST" and len(methods) > 1:
        # islands from different runs overlap: repack into the tile (real layout comes from pack())
        with _edit_mode([obj], lname, select_all=False):
            bm = bmesh.from_edit_mesh(me)
            for f in bm.faces:
                f.select_set(bool(fsel[f.index]))
            bmesh.update_edit_mesh(me)
            bpy.ops.uv.average_islands_scale()
            bpy.ops.uv.pack_islands(rotate=False, margin_method="FRACTION", margin=0.002)
    A.free()
    chosen = {}
    for v in per_island.values():
        chosen[v["chosen"]] = chosen.get(v["chosen"], 0) + 1
    return {"method": method, "islands": len(per_island), "chosen": chosen,
            "unsolved_faces": {m: results[m][1] for m in results},
            "folding_islands": [{"island": f["island"], "n_faces": len(f["faces"]), "self_overlap": f["self_overlap"]} for f in folding],
            "folding_faces": [i for f in folding for i in f["faces"]],
            "per_island": per_island if len(per_island) <= 40 else "omitted (>40 islands)"}


def straighten(obj, uv_map=None, min_quad_share=0.9, islands=None):
    """Lampel/Morren straightening, headless: per grid-like island make its central quad an
    axis-aligned rectangle, Follow Active Quads over the island's quads, pin them, re-unwrap
    the rest around the pins, clear the pins. Run BEFORE normalize/pack."""
    _object_mode()
    me = obj.data
    lname = _layer(me, uv_map).name
    A = _Arrays(obj, lname)
    labels, _ = _uv_islands(A)
    old_pins = _get_pins(me, lname)
    done = []
    todo = range(labels.max() + 1) if islands is None else islands
    for k in todo:
        fidx = np.nonzero(labels == k)[0]
        quads = fidx[A.lt[fidx] == 4]
        if len(fidx) < 2 or len(quads) / len(fidx) < min_quad_share:
            continue
        uv = _get_uv(me, lname)
        cen = np.array([uv[A.ls[f]:A.ls[f] + 4].mean(0) for f in quads])
        mid = uv[np.concatenate([np.arange(A.ls[f], A.ls[f] + A.lt[f]) for f in fidx])].mean(0)
        act = int(quads[np.argmin(np.linalg.norm(cen - mid, axis=1))])
        with _edit_mode([obj], lname, select_all=False):
            bm = bmesh.from_edit_mesh(me)
            bm.faces.ensure_lookup_table()
            ul = bm.loops.layers.uv[lname]
            f = bm.faces[act]
            ls = list(f.loops)
            p = [l[ul].uv.copy() for l in ls]
            w = ((p[1] - p[0]).length + (p[2] - p[3]).length) / 2
            h = ((p[2] - p[1]).length + (p[3] - p[0]).length) / 2
            ang = math.atan2((p[1] - p[0]).y, (p[1] - p[0]).x)
            q = round(ang / (math.pi / 2)) * (math.pi / 2)
            ex = Vector((math.cos(q), math.sin(q)))
            ey = Vector((-ex.y, ex.x))
            sgn = 1.0 if ((p[1] - p[0]).to_3d().cross((p[3] - p[0]).to_3d())).z >= 0 else -1.0
            c = sum(p, Vector((0, 0))) / 4
            corners = [c - ex * w / 2 - sgn * ey * h / 2, c + ex * w / 2 - sgn * ey * h / 2,
                       c + ex * w / 2 + sgn * ey * h / 2, c - ex * w / 2 + sgn * ey * h / 2]
            for l, co in zip(ls, corners):
                l[ul].uv = co
            qset = set(quads.tolist())
            for g in bm.faces:
                g.select_set(g.index in qset)
            bm.faces.active = f
            bmesh.update_edit_mesh(me)
            bpy.ops.uv.follow_active_quads(mode="LENGTH_AVERAGE")
            bm = bmesh.from_edit_mesh(me)
            bm.faces.ensure_lookup_table()
            ul = bm.loops.layers.uv[lname]
            fset = set(fidx.tolist())
            for g in bm.faces:
                inq = g.index in qset
                for l in g.loops:
                    l[ul].pin_uv = inq or l[ul].pin_uv
                g.select_set(g.index in fset)
            bmesh.update_edit_mesh(me)
            if len(quads) < len(fidx):
                bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0, fill_holes=True)
        done.append(int(k))
    _set_pins(me, old_pins, lname)
    A.free()
    return {"straightened_islands": done}


def pin_loops(obj, loops, state=True, uv_map=None):
    """Pin (or unpin) face corners by loop index. Pinned UVs survive every uv.unwrap."""
    _object_mode()
    p = _get_pins(obj.data, uv_map)
    p[np.asarray(loops, dtype=np.int64)] = state
    _set_pins(obj.data, p, uv_map)
    return {"pinned": int(p.sum())}


# --------------------------------------------------------------------------- density
def texel_density(obj, tex_res=2048, uv_map=None):
    """Area-weighted texel density in px/m: whole object, per UV island."""
    _object_mode()
    A = _Arrays(obj, uv_map)
    labels, _ = _uv_islands(A)
    a_uv, a3 = _face_measures(A)
    isl = []
    for k in range(labels.max() + 1):
        m = labels == k
        isl.append(tex_res * math.sqrt(np.abs(a_uv[m]).sum() / max(a3[m].sum(), 1e-18)))
    A.free()
    total = tex_res * math.sqrt(np.abs(a_uv).sum() / max(a3.sum(), 1e-18))
    return {"px_per_m": round(total, 1), "px_per_cm": round(total / 100, 2), "islands": [round(v, 1) for v in isl]}


def texture_size_for(obj, target_px_per_m, coverage=0.75):
    """Density first, texture second (Huge Menace): smallest power of two that holds the
    target at the given UV coverage. res = TD * sqrt(surface m2 / coverage)."""
    A = _Arrays(obj)
    P = A.co[A.lv]
    c = np.cross(P, P[A.nxt])
    area = 0.5 * np.linalg.norm(np.stack([np.bincount(A.lf, c[:, k], minlength=A.nf) for k in range(3)], 1), axis=1).sum()
    A.free()
    need = target_px_per_m * math.sqrt(area / coverage)
    return {"surface_m2": round(float(area), 4), "min_res": round(need), "res": int(2 ** math.ceil(math.log2(max(need, 1))))}


def face_weights_from_vgroup(obj, group, low=1.0, high=2.0):
    """Per-face priority weight from a vertex group: weight 0 -> low, 1 -> high."""
    vg = obj.vertex_groups[group]
    w = np.zeros(len(obj.data.vertices))
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == vg.index:
                w[v.index] = g.weight
    return np.array([low + (high - low) * w[list(p.vertices)].mean() for p in obj.data.polygons])


def normalize_texel_density(obj, target_px_per_m=None, tex_res=2048, weights=None, uv_map=None):
    """Scale every UV island about its center so its density = target x weight.
    target None: the current area-weighted median (like Average Islands Scale, but with
    priorities). weights: one value per face (e.g. face_weights_from_vgroup), island
    weight = area-weighted mean; face/hands > 1, soles/inner mouth < 1 (Kaspar,
    SpeedChar). Pack afterwards with scale=False to keep the density exact."""
    _object_mode()
    me = obj.data
    A = _Arrays(obj, uv_map)
    labels, _ = _uv_islands(A)
    a_uv, a3 = _face_measures(A)
    n = labels.max() + 1
    td = np.array([tex_res * math.sqrt(np.abs(a_uv[labels == k]).sum() / max(a3[labels == k].sum(), 1e-18)) for k in range(n)])
    area = np.array([a3[labels == k].sum() for k in range(n)])
    if target_px_per_m is None:
        target_px_per_m = _wpct(td, area, 0.5)
    w = np.ones(n)
    if weights is not None:
        fw = np.asarray(weights, dtype=np.float64)
        w = np.array([np.average(fw[labels == k], weights=np.maximum(a3[labels == k], 1e-18)) for k in range(n)])
    uv = A.uv.copy()
    lab_l = labels[A.lf]
    for k in range(n):
        m = lab_l == k
        s = target_px_per_m * w[k] / max(td[k], 1e-9)
        c = (uv[m].min(0) + uv[m].max(0)) / 2
        uv[m] = c + (uv[m] - c) * s
    _set_uv(me, uv, uv_map)
    A.free()
    return {"target_px_per_m": round(float(target_px_per_m), 1),
            "before_min_max": [round(float(td.min()), 1), round(float(td.max()), 1)],
            "islands": int(n), "weights_min_max": [round(float(w.min()), 2), round(float(w.max()), 2)]}


# --------------------------------------------------------------------------- pack
def pack(objs, tex_res=2048, gap_px=None, rotate_method="CARDINAL", scale=True, shape_method="CONCAVE",
         merge_overlap=False, udim_source="CLOSEST_UDIM", sweep=True, allow_any=False, uv_map=None, faces=None):
    """Pack all islands of objs into one shared layout with a PIXEL gap.
    gap_px: island-to-island gap in texture pixels, default tex_res/128 (Lampel, games;
    16 px at 2K, On Mars 3D). Uses margin_method FRACTION, margin = gap/(2*res), which also
    leaves gap/2 to the tile border. rotate_method CARDINAL keeps straightened islands
    straight (never ANY after straightening). scale=False keeps texel density exact
    (reports overflow if the islands do not fit: raise the resolution or split sets).
    sweep tries CONCAVE/CONVEX and CARDINAL/AXIS_ALIGNED and keeps the best coverage;
    allow_any adds free rotation (organic islands nobody paints in 2D). faces: pack only
    these faces of a single object (one UDIM region, one texture set); headless the region
    lands in 0-1 whatever tile it was in, so pack first, then move_to_tile()."""
    _object_mode()
    objs = [objs] if isinstance(objs, bpy.types.Object) else list(objs)
    gap_px = tex_res / 128.0 if gap_px is None else gap_px
    margin = gap_px / (2.0 * tex_res)
    start = {o.name: _get_uv(o.data, uv_map) for o in objs}
    variants = [(shape_method, rotate_method)]
    if sweep:
        rots = [rotate_method] + ([r for r in ("CARDINAL", "AXIS_ALIGNED") if r != rotate_method]
                                  if rotate_method in ("CARDINAL", "AXIS_ALIGNED") else [])
        if allow_any and "ANY" not in rots:
            rots.append("ANY")
        for s in ("CONCAVE", "CONVEX"):
            for r in rots:
                if (s, r) not in variants:
                    variants.append((s, r))
    best = None
    tried = []
    for s, r in variants:
        for o in objs:
            _set_uv(o.data, start[o.name], uv_map)
        with _edit_mode(objs, uv_map, select_all=faces is None):
            if faces is not None:
                fs = set(int(i) for i in faces)
                bm = bmesh.from_edit_mesh(objs[0].data)
                for f in bm.faces:
                    f.select_set(f.index in fs)
                bmesh.update_edit_mesh(objs[0].data)
            bpy.ops.uv.pack_islands(udim_source=udim_source, rotate=r != "NONE", rotate_method=r if r != "NONE" else "CARDINAL",
                                          scale=scale, merge_overlap=merge_overlap, margin_method="FRACTION",
                                          margin=margin, shape_method=s)
        cov, over = 0.0, 0
        for o in objs:
            A = _Arrays(o, uv_map)
            a_uv, _ = _face_measures(A)
            fm = np.ones(A.nf, dtype=bool) if faces is None else np.isin(np.arange(A.nf), np.asarray(faces))
            cov += float(np.abs(a_uv[fm]).sum())
            u = A.uv[fm[A.lf]]
            t = np.floor(u.mean(0)) if faces is not None and len(u) else np.zeros(2)
            over += int(((u < t - 1e-6) | (u > t + 1 + 1e-6)).any(1).sum())
            A.free()
        tried.append({"shape": s, "rotate": r, "coverage": round(cov, 4), "loops_outside_tile": over})
        key = (over == 0, cov)
        if best is None or key > best[0]:
            best = (key, s, r, {o.name: _get_uv(o.data, uv_map) for o in objs})
    for o in objs:
        _set_uv(o.data, best[3][o.name], uv_map)
    return {"coverage": round(best[0][1], 4), "shape": best[1], "rotate": best[2], "gap_px": gap_px,
            "margin_fraction": round(margin, 6), "fits_tile": best[0][0], "tried": tried}


def move_to_tile(obj, faces, tile, uv_map=None):
    """Move the UVs of these faces into UDIM tile `tile` (1001 + u + 10 v), keeping their
    position inside the tile (uv.move_on_axis needs a UV editor; this does not)."""
    _object_mode()
    A = _Arrays(obj, uv_map)
    fm = np.isin(A.lf, np.asarray(faces))
    uv = A.uv.copy()
    cur = np.floor(uv[fm].mean(0))
    tgt = np.array([(tile - 1001) % 10, (tile - 1001) // 10], dtype=np.float64)
    uv[fm] += tgt - cur
    _set_uv(obj.data, uv, uv_map)
    A.free()
    return {"tile": tile, "moved_loops": int(fm.sum())}


def offset_stacked(obj, du=1.0, uv_map=None, which="FLIPPED"):
    """Move the mirrored copy of stacked UVs exactly one tile to the right before baking
    (Polycount; verified: the baker ignores UVs outside a non-tiled image, both halves then
    read the same texels). which='FLIPPED' moves faces with negative UV area."""
    _object_mode()
    A = _Arrays(obj, uv_map)
    a_uv, _ = _face_measures(A)
    m = (a_uv < 0)[A.lf] if which == "FLIPPED" else np.isin(A.lf, np.asarray(which))
    uv = A.uv.copy()
    uv[m, 0] += du
    _set_uv(obj.data, uv, uv_map)
    A.free()
    return {"moved_faces": int((a_uv < 0).sum()) if which == "FLIPPED" else len(which), "du": du}


# --------------------------------------------------------------------------- QA
def uv_qa(obj, tex_res=2048, uv_map=None, evaluated=False, analysis_res=None, gap_px=None, max_islands_listed=12):
    """Measure a UV layout the way experts judge it (checker, stretch overlay, packing):
    islands, stretch (angle and area), texel density per island and its spread, flipped
    and overlapping faces (raster, per tile), coverage, min island gap and border in
    texture pixels, tiles used and faces crossing tiles, hard edges not on seams."""
    _object_mode()
    A = _Arrays(obj, uv_map, evaluated)
    me = A.me
    labels, cont_edges = _uv_islands(A)
    a_uv, a3 = _face_measures(A)
    n_isl = int(labels.max() + 1) if A.nf else 0
    valid = (a3 > 1e-14) & (np.abs(a_uv) > 1e-16)
    td_face = tex_res * np.sqrt(np.abs(a_uv) / np.maximum(a3, 1e-18))
    ang_uv, ok1 = _corner_angles(np.c_[A.uv, np.zeros(A.nl)], A)
    ang_3d, ok2 = _corner_angles(A.co[A.lv], A)
    ok = ok1 & ok2
    aerr = np.degrees(np.abs(ang_uv - ang_3d))[ok]
    ratio = (np.abs(a_uv) / max(np.abs(a_uv).sum(), 1e-18)) / (a3 / max(a3.sum(), 1e-18))
    lr = np.abs(np.log2(np.maximum(ratio[valid], 1e-9)))
    isl = []
    for k in range(n_isl):
        m = labels == k
        ta, tu = a3[m].sum(), np.abs(a_uv[m]).sum()
        fl = int((a_uv[m] < 0).sum())
        uvk = A.uv[m[A.lf]]
        isl.append({"island": k, "faces": int(m.sum()), "td": round(tex_res * math.sqrt(tu / max(ta, 1e-18)), 1),
                    "area_m2": round(float(ta), 5), "uv_px": round(float(tu) * tex_res ** 2),
                    "flipped": fl, "bbox": [round(float(x), 4) for x in (*uvk.min(0), *uvk.max(0))]})
    td_isl = np.array([i["td"] for i in isl])
    ar_isl = np.array([i["area_m2"] for i in isl])
    # tiles
    cen = np.stack([np.bincount(A.lf, A.uv[:, k], minlength=A.nf) / A.lt for k in range(2)], 1)
    tile_uv = np.floor(cen + 1e-9)
    outside = np.any((A.uv < tile_uv[A.lf] - 1e-5) | (A.uv > tile_uv[A.lf] + 1 + 1e-5), axis=1)
    crossing = int(np.bincount(A.lf, outside, minlength=A.nf).astype(bool).sum())
    tiles = sorted({(int(u), int(v)) for u, v in tile_uv})
    # raster per tile
    ares = analysis_res or min(tex_res, 2048)
    T, tf = _tris(A, A.uv)
    tri_uv = A.uv[T]
    tri_lab = labels[tf]
    tri_tile = tile_uv[tf]
    per_tile = {}
    gap_needed = tex_res / 128.0 if gap_px is None else gap_px
    overlap_px = 0
    pairs_all = set()
    self_overlap = set()
    min_gap_tex = None
    for (tu_, tv_) in tiles:
        sel = (tri_tile[:, 0] == tu_) & (tri_tile[:, 1] == tv_)
        cnt, lab, pairs = _raster(tri_uv[sel], tri_lab[sel], ares, (tu_, tv_))
        cov = float((cnt > 0).mean())
        ov = int((cnt > 1).sum())
        overlap_px += ov
        pairs_all |= pairs
        if ov:
            ys, xs = np.nonzero(cnt > 1)
            for lbl in np.unique(lab[ys, xs]).tolist():
                if not any(lbl in p for p in pairs):
                    self_overlap.add(int(lbl))
        cap = int(math.ceil(gap_needed * ares / tex_res)) + 2
        g = _min_gap(lab, cap)
        g_tex = None if g is None else round(g * tex_res / ares, 1)
        if g_tex is not None:
            min_gap_tex = g_tex if min_gap_tex is None else min(min_gap_tex, g_tex)
        uvt = tri_uv[sel].reshape(-1, 2) - np.array([tu_, tv_])
        border = float(np.min(np.minimum(uvt, 1 - uvt))) * tex_res if len(uvt) else None
        udim = 1001 + tu_ + 10 * tv_
        per_tile[udim] = {"coverage": round(cov, 4), "overlap_px_pct": round(100 * ov / ares ** 2, 3),
                          "min_gap_px": g_tex if g_tex is not None else f">{round((2 * cap + 1) * tex_res / ares)}",
                          "border_px": None if border is None else round(border, 1)}
    # seams vs hard edges
    sharp = np.zeros(A.ne, dtype=bool)
    att = me.attributes.get("sharp_edge")
    if att is not None and att.domain == "EDGE":
        att.data.foreach_get("value", sharp)
    cont = np.zeros(A.ne, dtype=bool)
    cont[cont_edges] = True
    sharp_not_seam = int((sharp & cont).sum())
    flat = me.attributes.get("sharp_face")
    flat_share = 0.0
    if flat is not None:
        fa = np.zeros(A.nf, dtype=bool)
        flat.data.foreach_get("value", fa)
        flat_share = float(fa.mean())
    tiny = [i["island"] for i in isl if i["uv_px"] < 16]
    flipped = int((a_uv < 0).sum())
    A.free()
    order = np.argsort(td_isl)
    listed = [isl[i] for i in list(order[:max_islands_listed // 2]) + list(order[-max_islands_listed // 2:])] \
        if n_isl > max_islands_listed else isl
    return {
        "object": obj.name, "uv_map": uv_map or (obj.data.uv_layers.active.name if obj.data.uv_layers else None),
        "tex_res": tex_res, "faces": int(A.nf), "islands": n_isl,
        "td_px_per_m": round(_wpct(td_face[valid], a3[valid], 0.5), 1),
        "td_face_spread_p95_p05": round(_wpct(td_face[valid], a3[valid], 0.95) / max(_wpct(td_face[valid], a3[valid], 0.05), 1e-9), 2),
        "td_island_spread_p95_p05": round(_wpct(td_isl, ar_isl, 0.95) / max(_wpct(td_isl, ar_isl, 0.05), 1e-9), 2) if n_isl else None,
        "td_island_min_max": [round(float(td_isl.min()), 1), round(float(td_isl.max()), 1)] if n_isl else None,
        "angle_err_mean_deg": round(float(aerr.mean()), 2) if len(aerr) else None,
        "angle_err_p95_deg": round(float(np.percentile(aerr, 95)), 2) if len(aerr) else None,
        "area_stretch_p95_log2": round(float(np.percentile(lr, 95)), 2) if len(lr) else None,
        "flipped_faces": flipped, "zero_area_faces": int((~valid).sum()),
        "overlap_px_pct": round(100 * overlap_px / (ares ** 2 * max(len(tiles), 1)), 3),
        "overlapping_island_pairs": len(pairs_all), "self_overlapping_islands": sorted(self_overlap)[:20],
        "tiles": sorted(per_tile), "per_tile": per_tile, "faces_crossing_tiles": crossing,
        "min_gap_px": min_gap_tex, "gap_required_px": gap_needed,
        "tiny_islands": tiny[:20], "sharp_edges_not_on_seams": sharp_not_seam, "flat_shaded_share": round(flat_share, 3),
        "mirror_stacked_hint": bool(flipped and 0.3 < flipped / max(A.nf, 1) < 0.7 and overlap_px > 0),
        "islands_detail": listed,
    }


def uv_verdict(r, profile="game", priorities=False):
    """Human-readable problems from uv_qa. profile 'game' (one 0-1 set) or 'film' (UDIM,
    symmetry allowed). priorities=True accepts deliberate density differences."""
    p = []
    if r["zero_area_faces"]:
        p.append(f"{r['zero_area_faces']} faces with zero UV area (unsolved island or collapsed faces)")
    if r["mirror_stacked_hint"]:
        p.append("mirror-stacked UVs (half the faces flipped and overlapping): bake would overwrite one side; "
                 "offset_stacked() before baking or give unique UVs where AO differs")
    elif r["overlap_px_pct"] > 0.05:
        p.append(f"overlaps: {r['overlap_px_pct']}% of tile pixels, {r['overlapping_island_pairs']} island pairs, "
                 f"self-overlapping islands {r['self_overlapping_islands']}")
    if r["flipped_faces"] and not r["mirror_stacked_hint"]:
        p.append(f"{r['flipped_faces']} flipped UV faces")
    if r["faces_crossing_tiles"]:
        p.append(f"{r['faces_crossing_tiles']} faces cross a tile border")
    if profile == "game":
        if r["tiles"] != [1001]:
            p.append(f"UVs outside 0-1 (tiles {r['tiles']}) on a single-set game asset")
        cov = r["per_tile"].get(1001, {}).get("coverage", 0)
        if cov < 0.70:
            p.append(f"coverage {cov:.0%} < 70% (Gambrell >70, Huge Menace 75% studio minimum)")
    if r["min_gap_px"] is not None and r["min_gap_px"] < r["gap_required_px"] - 1:
        p.append(f"island gap {r['min_gap_px']} px < required {r['gap_required_px']:.0f} px (res/128)")
    for t, d in r["per_tile"].items():
        if d["border_px"] is not None and d["border_px"] < r["gap_required_px"] / 2 - 1:
            p.append(f"tile {t}: islands {d['border_px']} px from the border (< gap/2)")
    if not priorities and r["td_island_spread_p95_p05"] and r["td_island_spread_p95_p05"] > 1.25:
        p.append(f"texel density spread between islands {r['td_island_spread_p95_p05']} (> 1.25; Gambrell: 10-20% is invisible)")
    if r["angle_err_p95_deg"] and r["angle_err_p95_deg"] > 15:
        p.append(f"angle stretch p95 {r['angle_err_p95_deg']} deg (> 15: add a seam or relax with pins)")
    if r["sharp_edges_not_on_seams"]:
        p.append(f"{r['sharp_edges_not_on_seams']} hard edges inside islands (bake seams): seam them or smooth them")
    if r["flat_shaded_share"] > 0.5:
        p.append("mesh is flat shaded: shade smooth (hard edges only on seams) before baking")
    if r["tiny_islands"]:
        p.append(f"islands smaller than 4x4 px: {r['tiny_islands']}")
    return p


# --------------------------------------------------------------------------- images and renders
def _save_rgba(arr, path, float16=False):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("bx_tmp_img", w, h, alpha=True, float_buffer=float16)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def island_mask(obj, res, uv_map=None, tile=(0, 0)):
    """Boolean (res, res) mask of pixels covered by UV faces in one tile (rows bottom-up,
    like Image.pixels)."""
    A = _Arrays(obj, uv_map)
    T, tf = _tris(A, A.uv)
    cnt, _, _ = _raster(A.uv[T], tf, res, tile)
    A.free()
    return cnt > 0


def uv_layout_image(obj, path, res=1024, uv_map=None, color="island", tile=(0, 0), wire=True):
    """PNG of the UV layout (the agent's UV editor): islands in distinct hues or colored by
    density ('density': blue low, white median, red high) or angle stretch ('angle'),
    overlaps magenta, island borders dark, UV edges drawn when wire=True."""
    A = _Arrays(obj, uv_map)
    labels, _ = _uv_islands(A)
    T, tf = _tris(A, A.uv)
    cnt, lab, _ = _raster(A.uv[T], tf, res, tile)
    a_uv, a3 = _face_measures(A)
    img = np.full((res, res, 4), (0.12, 0.12, 0.12, 1.0), dtype=np.float32)
    covered = lab >= 0
    face = lab[covered]
    if color == "density":
        td = np.sqrt(np.abs(a_uv) / np.maximum(a3, 1e-18))
        med = np.median(td[a3 > 0]) if (a3 > 0).any() else 1.0
        x = np.clip(np.log2(np.maximum(td, 1e-12) / med), -1, 1)
        col = np.where(x[:, None] < 0, (1 + x[:, None]) * np.array([1, 1, 1]) + (-x[:, None]) * np.array([0.1, 0.3, 1.0]),
                       (1 - x[:, None]) * np.array([1, 1, 1]) + x[:, None] * np.array([1.0, 0.15, 0.1]))
    elif color == "angle":
        ang_uv, ok1 = _corner_angles(np.c_[A.uv, np.zeros(A.nl)], A)
        ang_3d, ok2 = _corner_angles(A.co[A.lv], A)
        e = np.degrees(np.bincount(A.lf, np.where(ok1 & ok2, np.abs(ang_uv - ang_3d), 0), minlength=A.nf) / A.lt)
        x = np.clip(e / 20.0, 0, 1)[:, None]
        col = (1 - x) * np.array([0.95, 0.95, 0.95]) + x * np.array([1.0, 0.1, 0.1])
    else:
        hues = (labels * 0.618034) % 1.0
        col = np.array([colorsys.hsv_to_rgb(h, 0.55, 0.9) for h in hues]) if len(hues) else np.zeros((0, 3))
    img[covered, :3] = col[face]
    isl = np.where(covered, labels[np.maximum(lab, 0)], -1)
    edge = np.zeros_like(covered)
    edge[:, 1:] |= isl[:, 1:] != isl[:, :-1]
    edge[1:, :] |= isl[1:, :] != isl[:-1, :]
    img[edge & covered, :3] *= 0.35
    if wire:
        a, b = (A.uv - np.array(tile)) * res, (A.uv[A.nxt] - np.array(tile)) * res
        n = np.maximum(np.ceil(np.linalg.norm(b - a, axis=1)).astype(np.int64), 1)
        idx = np.repeat(np.arange(len(a)), n)
        t = (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)) / np.repeat(n, n)
        p = a[idx] + (b[idx] - a[idx]) * t[:, None]
        x, y = p[:, 0].astype(np.int64), p[:, 1].astype(np.int64)
        ok = (x >= 0) & (y >= 0) & (x < res) & (y < res)
        img[y[ok], x[ok], :3] *= 0.6
    img[cnt > 1, :3] = (1.0, 0.0, 1.0)
    A.free()
    return _save_rgba(img, path)


def _review_helpers():
    import sys
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.join(os.path.dirname(os.path.dirname(here)), "scenario-blender-expert", "scripts")
    if root not in sys.path:
        sys.path.append(root)
    import bx_review
    return bx_review


def _render_views(objs_visible, frame_objs, out_dir, prefix, views, res, sc, cam, per_view=None):
    R = _review_helpers()
    lo, hi = R._world_bbox(frame_objs)
    center = (lo + hi) / 2
    pts = R._sample_points(frame_objs)
    paths = []
    for view in views:
        d = R.VIEW_DIRS[view]
        half, depth = R._extent(pts, center, d)
        if view in R.PERSPECTIVE:
            cam.data.type, cam.data.lens = "PERSP", 50
            fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
            dist = R._persp_distance(pts, center, d, math.tan(fov / 2) / 1.1)
        else:
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = 2 * half * 1.1
            dist = depth * 4 + 1.0
        cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 10
        R._look_at(cam, center, d, dist)
        if per_view is not None:
            per_view(d)
        p = os.path.join(out_dir, f"{prefix}_{view}.png")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True, scene=sc.name)
        paths.append(p)
    return paths


def _temp_scene(name, res, engine):
    sc = bpy.data.scenes.new(name)
    sc.render.engine = engine
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new(name + "_W")
    sc.world = world
    cam = bpy.data.objects.new(name + "_Cam", bpy.data.cameras.new(name + "_Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam, world


def _drop_scene(sc, cam, world, extra_objs=(), extra_data=()):
    for o in list(extra_objs) + [cam]:
        d = o.data
        bpy.data.objects.remove(o)
        if d is not None and d.users == 0:
            if isinstance(d, bpy.types.Camera):
                bpy.data.cameras.remove(d)
            elif isinstance(d, bpy.types.Light):
                bpy.data.lights.remove(d)
            elif isinstance(d, bpy.types.Mesh) and d.name.startswith("BX_tmp"):
                bpy.data.meshes.remove(d)
    bpy.data.scenes.remove(sc)
    bpy.data.worlds.remove(world)
    for d in extra_data:
        try:
            if isinstance(d, bpy.types.Material):
                bpy.data.materials.remove(d)
            elif isinstance(d, bpy.types.Image):
                bpy.data.images.remove(d)
            elif isinstance(d, bpy.types.Mesh):
                bpy.data.meshes.remove(d)
        except ReferenceError:
            pass


def _copy_with_material(o, sc, mat, base_levels=None):
    c = o.copy()
    sc.collection.objects.link(c)
    if c.type == "MESH":
        if base_levels is not None:
            for m in c.modifiers:
                if m.type in ("MULTIRES", "SUBSURF"):
                    m.render_levels = base_levels
                    m.levels = base_levels
        if mat is not None:
            if not c.material_slots:
                c.data = c.data.copy()
                c.data.name = "BX_tmp_mesh"
                c.data.materials.append(None)
            for s in c.material_slots:
                s.link = "OBJECT"
                s.material = mat
    return c


def checker_review(objs, out_dir, views=("front", "right", "threequarter", "back"), res=700,
                   grid="COLOR_GRID", tex_res=1024, uv_map=None, prefix="checker"):
    """Color-grid render through the UVs (Kaspar prefers the color grid: letters show
    orientation). Temporary object copies with an object-linked checker material, in a
    temporary Workbench scene: the user's materials are untouched. Returns the sheet."""
    R = _review_helpers()
    os.makedirs(out_dir, exist_ok=True)
    img = bpy.data.images.new("BX_checker", tex_res, tex_res)
    img.generated_type = grid
    mat = bpy.data.materials.new("BX_checker")
    mat.use_nodes = True
    nt = mat.node_tree
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = img
    if uv_map:
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = uv_map
        nt.links.new(uvn.outputs["UV"], tn.inputs["Vector"])
    nt.links.new(tn.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    nt.nodes.active = tn
    sc, cam, world = _temp_scene("BX_Checker", res, "BLENDER_WORKBENCH")
    sh = sc.display.shading
    sh.light, sh.color_type, sh.studio_light = "STUDIO", "TEXTURE", "Default"
    world.color = (0.2, 0.2, 0.2)
    copies = [_copy_with_material(o, sc, mat) for o in objs]
    try:
        paths = _render_views(copies, copies, out_dir, prefix, views, res, sc, cam)
    finally:
        _drop_scene(sc, cam, world, copies, (mat, img))
    return R._tile(paths, 1, len(paths), os.path.join(out_dir, prefix + "_sheet.png"), [f"{prefix} / {v}" for v in views])


def distortion_review(obj, out_dir, metric="density", views=("front", "right", "threequarter", "back"),
                      res=700, uv_map=None, prefix=None):
    """The UV Stretch overlay as a render: per-face density ratio to the median
    ('density': blue = too little texture, red = too much) or angle error ('angle': white
    0 deg to red 20+ deg), written to a color attribute on a temporary mesh copy."""
    R = _review_helpers()
    os.makedirs(out_dir, exist_ok=True)
    prefix = prefix or f"stretch_{metric}"
    A = _Arrays(obj, uv_map)
    a_uv, a3 = _face_measures(A)
    if metric == "density":
        td = np.sqrt(np.abs(a_uv) / np.maximum(a3, 1e-18))
        x = np.clip(np.log2(np.maximum(td, 1e-12) / np.median(td[a3 > 0])), -1, 1)
        col = np.where(x[:, None] < 0, (1 + x[:, None]) * 0.9 + (-x[:, None]) * np.array([0.1, 0.3, 1.0]),
                       (1 - x[:, None]) * 0.9 + x[:, None] * np.array([1.0, 0.15, 0.1]))
    else:
        ang_uv, ok1 = _corner_angles(np.c_[A.uv, np.zeros(A.nl)], A)
        ang_3d, ok2 = _corner_angles(A.co[A.lv], A)
        e = np.degrees(np.bincount(A.lf, np.where(ok1 & ok2, np.abs(ang_uv - ang_3d), 0), minlength=A.nf) / A.lt)
        x = np.clip(e / 20.0, 0, 1)[:, None]
        col = (1 - x) * 0.9 + x * np.array([1.0, 0.1, 0.1])
    lf = A.lf
    A.free()
    me2 = obj.data.copy()
    ca = me2.color_attributes.new("BX_heat", "FLOAT_COLOR", "CORNER")
    rgba = np.c_[col[lf], np.ones(len(lf))].astype(np.float32)
    ca.data.foreach_set("color", rgba.ravel())
    me2.color_attributes.active_color = ca
    sc, cam, world = _temp_scene("BX_Heat", res, "BLENDER_WORKBENCH")
    sh = sc.display.shading
    sh.light, sh.color_type, sh.studio_light = "STUDIO", "VERTEX", "Default"
    world.color = (0.2, 0.2, 0.2)
    c = obj.copy()
    c.data = me2
    sc.collection.objects.link(c)
    try:
        paths = _render_views([c], [c], out_dir, prefix, views, res, sc, cam)
    finally:
        _drop_scene(sc, cam, world, [c], (me2,))
    return R._tile(paths, 1, len(paths), os.path.join(out_dir, prefix + "_sheet.png"), [f"{prefix} / {v}" for v in views])


# --------------------------------------------------------------------------- bake
def prepare_low(low, smooth=True, apply_scale=True, sharp_from_uv_islands=False, triangulate=False):
    """Bake preconditions on the low poly: scale applied (On Mars 3D, Polycount), smooth
    shading (Abbitt), optionally hard edges exactly on UV island borders (games, On Mars
    3D) and a Triangulate modifier that keeps normals (Kaspar #3, Polycount: bake the
    triangulation you ship; the bake uses the evaluated mesh)."""
    _object_mode()
    vl = bpy.context.view_layer
    prev_sel = [o for o in vl.objects if o.select_get()]
    prev_act = vl.objects.active
    for o in vl.objects:
        o.select_set(False)
    low.select_set(True)
    vl.objects.active = low
    rep = {}
    if apply_scale and any(abs(s - 1) > 1e-6 for s in low.scale):
        if low.data.users > 1:
            low.data = low.data.copy()
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        rep["scale_applied"] = True
    if smooth:
        bpy.ops.object.shade_smooth(keep_sharp_edges=True)
        rep["smooth"] = True
    if sharp_from_uv_islands:
        with _edit_mode([low]):
            bpy.ops.uv.seams_from_islands(mark_seams=False, mark_sharp=True)
        rep["sharp_from_islands"] = True
    if triangulate and not any(m.type == "TRIANGULATE" for m in low.modifiers):
        m = low.modifiers.new("Triangulate", "TRIANGULATE")
        m.keep_custom_normals = True
        rep["triangulate_modifier"] = True
    for o in vl.objects:
        o.select_set(o in prev_sel)
    vl.objects.active = prev_act
    return rep


def _use_gpu(sc):
    """GPU for Cycles in background runs only (never changes a live user's preferences)."""
    if not bpy.app.background:
        return sc.cycles.device
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for t in ("OPTIX", "CUDA", "METAL", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = t
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == t
                sc.cycles.device = "GPU"
                return t
    except Exception:
        pass
    sc.cycles.device = "CPU"
    return "CPU"


def _world_mesh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    me = eo.to_mesh()
    M = np.array(eo.matrix_world)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    polys = [tuple(p.vertices) for p in me.polygons]
    return co, polys, me, eo


def measure_projection(low, highs, samples=12000, search=None, quantile=0.995, low_base_levels=None):
    """Measure, instead of guessing, how far the high sits outside and inside the low along
    the low's normals (the rays the baker casts). Returns suggested cage_extrusion and
    max_ray_distance (counted from the extruded start, as Cycles does), plus the predicted
    share of rays that miss the high and of rays that would hit another part first.
    Rays start on the LOW, so high parts the low does not cover (a tail, a prop) cannot
    inflate the distance, unlike a nearest-point test from every high vertex.
    low_base_levels: temporarily set Multires/Subsurf levels on the low (use 0 when the low
    carries the sculpt as Multires; bake_high_to_low does this itself)."""
    mods = [(m, m.levels, m.render_levels) for m in low.modifiers if m.type in ("MULTIRES", "SUBSURF")] \
        if low_base_levels is not None else []
    for m, _, _ in mods:
        m.levels = m.render_levels = low_base_levels
    try:
        return _measure_projection(low, highs, samples, search, quantile)
    finally:
        for m, lv, rl in mods:
            m.levels, m.render_levels = lv, rl


def _measure_projection(low, highs, samples, search, quantile):
    dg = bpy.context.evaluated_depsgraph_get()
    hv, hp = [], []
    off = 0
    for h in highs:
        co, polys, me, eo = _world_mesh(h)
        hv.append(co)
        hp += [tuple(i + off for i in p) for p in polys]
        off += len(co)
        eo.to_mesh_clear()
    bvh = BVHTree.FromPolygons([Vector(v) for v in np.concatenate(hv)], hp, all_triangles=False)
    eo = low.evaluated_get(dg)
    me = eo.to_mesh()
    M = eo.matrix_world
    N3 = M.to_3x3().inverted().transposed()
    diag = Vector(low.dimensions).length
    search = search or 0.08 * diag
    smooth = any(p.use_smooth for p in me.polygons)
    pts = []
    vn = [v.normal for v in me.vertices]
    for v in me.vertices:
        pts.append((M @ v.co, (N3 @ vn[v.index]).normalized()))
    for p in me.polygons:
        n = sum((vn[i] for i in p.vertices), Vector()) if smooth and p.use_smooth else p.normal
        pts.append((M @ p.center, (N3 @ n).normalized()))
    eo.to_mesh_clear()
    step = max(1, len(pts) // samples)
    pts = pts[::step]
    s_vals = []
    miss = 0
    for p, n in pts:
        ho = bvh.ray_cast(p, n, search)
        hi_ = bvh.ray_cast(p, -n, search)
        to = ho[3] if ho[0] is not None else None
        ti = hi_[3] if hi_[0] is not None else None
        if to is None and ti is None:
            miss += 1
            s_vals.append(None)
            continue
        s_vals.append(to if (ti is None or (to is not None and to <= ti)) else -ti)
    s = np.array([x for x in s_vals if x is not None])
    out = s[s > 0]
    inn = -s[s < 0]
    q_out = float(np.quantile(out, quantile)) if len(out) else 0.0
    q_in = float(np.quantile(inn, quantile)) if len(inn) else 0.0
    ext = q_out * 1.1 + 1e-4 * diag
    ray = ext + q_in * 1.1 + 1e-4 * diag
    wrong = 0
    uncovered = 0
    for (p, n), sv in zip(pts, s_vals):
        if sv is None:
            continue
        if sv > ext or -sv > ray - ext:
            uncovered += 1
            continue
        h = bvh.ray_cast(p + n * ext, -n, ray)
        if h[0] is not None and h[3] < (ext - sv) - 0.02 * max(abs(sv), 1e-4 * diag) - 1e-5 * diag:
            wrong += 1
    npts = len(pts)
    return {"samples": npts, "outward_q": round(q_out, 5), "inward_q": round(q_in, 5),
            "outward_max": round(float(out.max()) if len(out) else 0.0, 5),
            "inward_max": round(float(inn.max()) if len(inn) else 0.0, 5),
            "cage_extrusion": round(ext, 5), "max_ray_distance": round(ray, 5),
            "miss_pct": round(100 * miss / npts, 2), "uncovered_pct": round(100 * uncovered / npts, 2),
            "wrong_part_pct": round(100 * wrong / npts, 2), "search": round(search, 4), "quantile": quantile}


def build_cage(low, highs, clearance=0.5, margin=1.15, min_offset=None, smooth_iters=3, low_base_levels=0,
               search=None, name=None):
    """Automatic cage (what Gambrell paints in Marmoset and On Mars 3D shrinks by hand): per
    low vertex, push out just past the high along the normal (x margin), but never more than
    `clearance` of the free space to the next surface beyond it (an ear over the head, the
    next finger), so rays cannot start inside or behind a neighbouring part. Built from the
    low evaluated at its base level (same topology and face order, as Blender requires).
    Returns the cage object (hidden from render) and its offset stats; bake with cage=...
    EXPERIMENTAL: on the sheep it baked worse (9.5% inverted texels) than one measured
    distance (7.3%) and far worse than adaptive=True (2.9%); prefer the adaptive bake and use
    a hand-edited cage (procedures.md snippet cage_object) where one is really needed."""
    mods = [(m, m.levels, m.render_levels) for m in low.modifiers if m.type in ("MULTIRES", "SUBSURF")]
    for m, _, _ in mods:
        m.levels = m.render_levels = low_base_levels
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        hv, hp, off = [], [], 0
        for h in highs:
            co, polys, _, eo = _world_mesh(h)
            hv.append(co)
            hp += [tuple(i + off for i in p) for p in polys]
            off += len(co)
            eo.to_mesh_clear()
        eo = low.evaluated_get(dg)
        lme = eo.to_mesh()
        cage_me = lme.copy()
        eo.to_mesh_clear()
    finally:
        for m, lv, rl in mods:
            m.levels, m.render_levels = lv, rl
    M = low.matrix_world
    N3 = M.to_3x3().inverted().transposed()
    lco = [M @ v.co for v in cage_me.vertices]
    lpolys = [tuple(p.vertices) for p in cage_me.polygons]
    bvh_h = BVHTree.FromPolygons([Vector(v) for v in np.concatenate(hv)], hp, all_triangles=False)
    bvh_all = BVHTree.FromPolygons([Vector(v) for v in np.concatenate(hv)] + lco,
                                   hp + [tuple(i + off for i in p) for p in lpolys], all_triangles=False)
    diag = Vector(low.dimensions).length
    search = search or 0.08 * diag
    min_offset = 1e-3 * diag if min_offset is None else min_offset
    n = len(lco)
    need = np.full(n, min_offset)
    cap = np.full(n, search)
    nrm = [(N3 @ v.normal).normalized() for v in cage_me.vertices]
    for i, (p, d) in enumerate(zip(lco, nrm)):
        ho = bvh_h.ray_cast(p, d, search)
        hi_ = bvh_h.ray_cast(p, -d, search)
        t_o = ho[3] if ho[0] is not None else None
        t_i = hi_[3] if hi_[0] is not None else None
        base = 0.0
        if t_o is not None and (t_i is None or t_o <= t_i):
            need[i] = max(t_o * margin, min_offset)
            base = t_o
        start = p + d * (base + 1e-5 * diag)
        nx = bvh_all.ray_cast(start, d, search)
        if nx[0] is not None:
            cap[i] = base + clearance * nx[3]
    edges = np.array([tuple(e.vertices) for e in cage_me.edges], dtype=np.int64)
    offs = np.minimum(need, cap)
    for _ in range(smooth_iters):   # smooth, but never above the local cap
        acc = np.zeros(n); cnt = np.zeros(n)
        np.add.at(acc, edges[:, 0], offs[edges[:, 1]]); np.add.at(acc, edges[:, 1], offs[edges[:, 0]])
        np.add.at(cnt, edges[:, 0], 1); np.add.at(cnt, edges[:, 1], 1)
        offs = np.minimum(np.maximum((offs + acc) / (1 + cnt), need * 0 + min_offset), cap)
    Minv = M.inverted()
    for v, p, d, o in zip(cage_me.vertices, lco, nrm, offs):
        v.co = Minv @ (p + d * float(o))
    cage = bpy.data.objects.new(name or low.name + "_cage", cage_me)
    cage.matrix_world = low.matrix_world
    bpy.context.scene.collection.objects.link(cage)
    cage.hide_render = True
    capped = float((need > cap + 1e-9).mean())
    return cage, {"offset_min": round(float(offs.min()), 5), "offset_median": round(float(np.median(offs)), 5),
                  "offset_max": round(float(offs.max()), 5), "capped_pct": round(100 * capped, 2), "verts": n}


def sweep_projection(low, highs, out_dir, factors=(0.35, 0.5, 0.7, 1.0, 1.4), res=512, **kw):
    """SpeedChar's ray-distance sweep, automated: fast NORMAL bakes at `res` with the measured
    extrusion and ray scaled by each factor; returns the sanity numbers per factor and the
    best factor by inverted + wrong-looking pixels (inverted_pct + 0.2 x flat_exact_pct)."""
    base = measure_projection(low, highs, low_base_levels=kw.get("low_base_levels", 0))
    rows = []
    for f in factors:
        r = bake_high_to_low(low, highs, out_dir, res=res, maps=("NORMAL",), extrusion=base["cage_extrusion"] * f,
                             max_ray=base["cage_extrusion"] * f + (base["max_ray_distance"] - base["cage_extrusion"]),
                             prefix=f"sweep_{f}", save=False, adaptive=False, **kw)
        sn = r["sanity"]["NORMAL"]
        rows.append({"factor": f, "extrusion": round(base["cage_extrusion"] * f, 5), "inverted_pct": sn["inverted_pct"],
                     "flat_exact_pct": sn["flat_exact_pct"], "score": round(sn["inverted_pct"] + 0.2 * sn["flat_exact_pct"], 3)})
    best = min(rows, key=lambda x: x["score"])
    return {"measured": base, "rows": rows, "best": best}


def _bake_target(low, name, res, float_buffer=True, colorspace="Non-Color"):
    img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=float_buffer)
    img.colorspace_settings.name = colorspace
    nodes = []
    if not low.material_slots:
        low.data.materials.append(bpy.data.materials.new(low.name + "_bake"))
    for s in low.material_slots:
        if s.material is None:
            s.material = bpy.data.materials.new(low.name + "_bake")
        mat = s.material
        mat.use_nodes = True
        nt = mat.node_tree
        node = nt.nodes.get("BX_BAKE_TARGET") or nt.nodes.new("ShaderNodeTexImage")
        node.name = node.label = "BX_BAKE_TARGET"
        node.image = img
        prev_active = nt.nodes.active
        for n in nt.nodes:
            n.select = False
        node.select = True          # 5.x: the target must be selected AND active
        nt.nodes.active = node
        nodes.append((nt, node, prev_active))
    return img, nodes


def _drop_targets(nodes):
    for nt, node, prev in nodes:
        try:
            nt.nodes.remove(node)
            if prev is not None and prev.name in nt.nodes:
                nt.nodes.active = prev
        except ReferenceError:
            pass


def _save_image(img, path, fmt="PNG"):
    img.filepath_raw = path
    img.file_format = fmt
    img.save()               # a float buffer saved as PNG is written 16-bit
    return path


def bake_sanity(img, kind, mask, directx=False):
    """Pixel checks on a baked map inside the UV islands (mask from island_mask()).
    NORMAL (tangent): blue < 0.5 = rays that hit the far side (ray start inside the high:
    raise extrusion or use a cage); exactly flat (0.5, 0.5, 1) = rays that missed (max ray
    too short, high not selected); length far from 1 = corrupted/averaged normals.
    AO: black share (occluders, coincident shells), white share (distance too small)."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[..., :3]
    m = mask if mask is not None else np.ones((h, w), dtype=bool)
    px = a[m]
    r = {"pixels": int(m.sum())}
    probs, notes = [], []
    if kind == "NORMAL":
        n = px * 2 - 1
        if directx:
            n[:, 1] *= -1
        ln = np.linalg.norm(n, axis=1)
        r.update(inverted_pct=round(100 * float((px[:, 2] < 0.5).mean()), 3),
                 flat_exact_pct=round(100 * float((np.abs(px - [0.5, 0.5, 1.0]).max(1) < 0.002).mean()), 2),
                 bad_length_pct=round(100 * float((np.abs(ln - 1) > 0.15).mean()), 3),
                 steep_pct=round(100 * float((n[:, 2] < 0.5).mean()), 3),
                 mean=[round(float(x), 3) for x in px.mean(0)], std=[round(float(x), 3) for x in px.std(0)],
                 nan=int(np.isnan(px).any(1).sum()))
        if r["nan"]:
            probs.append("NaN pixels")
        if r["inverted_pct"] > 2.0:
            probs.append(f"{r['inverted_pct']}% inverted normals (blue < 0.5): rays start inside or behind the high; "
                         "if a sweep does not move it, low and high differ there (map_problem_review)")
        elif r["inverted_pct"] > 0.2:
            notes.append(f"{r['inverted_pct']}% inverted texels: locate them with map_problem_review (thin parts, holes)")
        if r["flat_exact_pct"] > 25:
            probs.append(f"{r['flat_exact_pct']}% exactly flat: rays missing the high (max_ray_distance too short, wrong selection) or no detail there")
        if r["bad_length_pct"] > 1:
            probs.append(f"{r['bad_length_pct']}% non-unit normals: check color space/format")
        if max(r["std"]) < 0.01:
            probs.append("map is almost uniform: nothing was captured (check levels, selection, ray distance)")
    elif kind == "AO":
        g = px[:, 0]
        r.update(mean=round(float(g.mean()), 3), black_pct=round(100 * float((g < 0.05).mean()), 2),
                 white_pct=round(100 * float((g > 0.98).mean()), 2))
        if r["black_pct"] > 10:
            probs.append(f"AO {r['black_pct']}% black: an occluder encloses the surface (other render-visible objects, shells)")
        if r["white_pct"] > 85:
            probs.append(f"AO {r['white_pct']}% white: world AO distance too small for this asset")
        if r["mean"] < 0.3:
            probs.append("AO very dark overall: distance too large or occluders")
    else:
        r.update(mean=[round(float(x), 3) for x in px.mean(0)], std=[round(float(x), 3) for x in px.std(0)])
    r["problems"] = probs
    r["notes"] = notes
    return r


def map_problem_review(low, map_path, out_dir, kind="NORMAL", views=("front", "right", "threequarter", "back", "low"),
                       res=600, uv_map=None, prefix=None):
    """Where on the model are the bad texels? Samples the baked map at 5 points per low face
    and paints faces by their share of bad samples (NORMAL: blue < 0.5 = red, exactly flat =
    blue; AO: black = red), then renders the views. Returns the sheet and the share of faces
    flagged. Bad texels that stay put while extrusion changes = low and high do not match
    there (fix the mesh), not a projection setting."""
    im = bpy.data.images.load(map_path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    a = a.reshape(h, w, 4)
    A = _Arrays(low, uv_map)
    cen = np.stack([np.bincount(A.lf, A.uv[:, k], minlength=A.nf) / A.lt for k in range(2)], 1)
    pts = [cen] + [0.5 * (cen + A.uv[A.ls + (j % A.lt)]) for j in range(4)]
    bad = np.zeros(A.nf)
    flat = np.zeros(A.nf)
    for q in pts:
        x = np.clip(((q[:, 0] % 1.0) * w).astype(np.int64), 0, w - 1)
        y = np.clip(((q[:, 1] % 1.0) * h).astype(np.int64), 0, h - 1)
        px = a[y, x, :3]
        if kind == "NORMAL":
            bad += px[:, 2] < 0.5
            flat += np.abs(px - [0.5, 0.5, 1.0]).max(1) < 0.002
        else:
            bad += px[:, 0] < 0.05
    bad /= len(pts)
    flat /= len(pts)
    lf = A.lf
    A.free()
    col = np.ones((len(bad), 3)) * 0.85
    col = col * (1 - bad[:, None]) + np.array([1.0, 0.05, 0.05]) * bad[:, None]
    col = col * (1 - flat[:, None]) + np.array([0.1, 0.3, 1.0]) * flat[:, None]
    me2 = low.data.copy()
    me2.name = "BX_tmp_problem"
    ca = me2.color_attributes.new("BX_problem", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", np.c_[col[lf], np.ones(len(lf))].astype(np.float32).ravel())
    me2.color_attributes.active_color = ca
    sc, cam, world = _temp_scene("BX_Problem", res, "BLENDER_WORKBENCH")
    sh = sc.display.shading
    sh.light, sh.color_type, sh.studio_light = "STUDIO", "VERTEX", "Default"
    world.color = (0.2, 0.2, 0.2)
    c = low.copy()
    c.data = me2
    for m in c.modifiers:
        if m.type in ("MULTIRES", "SUBSURF"):
            m.levels = m.render_levels = 0
    sc.collection.objects.link(c)
    prefix = prefix or f"problems_{kind.lower()}"
    try:
        paths = _render_views([c], [c], out_dir, prefix, views, res, sc, cam)
    finally:
        _drop_scene(sc, cam, world, [c], (me2,))
    R = _review_helpers()
    sheet = R._tile(paths, 1, len(paths), os.path.join(out_dir, prefix + "_sheet.png"), [f"{prefix} / {v}" for v in views])
    return {"sheet": sheet, "faces_bad_pct": round(100 * float((bad > 0.5).mean()), 2),
            "faces_flat_pct": round(100 * float((flat > 0.5).mean()), 2)}


def bake_high_to_low(low, highs, out_dir, res=2048, maps=("NORMAL", "AO"), uv_map=None, directx=False,
                     samples=None, extrusion=None, max_ray=None, cage=None, margin_px=None, ao_distance=None,
                     occluders=(), prefix=None, low_base_levels=0, save=True, keep_nodes=False,
                     file_format="PNG", measure_samples=12000, adaptive=True):
    """Cycles selected-to-active bake of highs onto low into one texture set.
    maps: any of NORMAL, AO, ROUGHNESS, EMIT, DIFFUSE, POSITION. Projection: a cage object,
    or explicit extrusion/max_ray, or MEASURED (default) from the geometry. Settings:
    tangent normals, OpenGL (Y+) unless directx=True (Unreal); margin res/128 (16 px at
    2K); samples 16 for normals (antialiasing), 128 for AO; AO distance 0.2 x low bbox
    diagonal [added]; everything except low, highs and occluders hidden from render during
    the bake; Multires/Subsurf on the low forced to low_base_levels for the bake (bake uses
    RENDER levels). Asserts FINISHED on every call, saves float maps as 16-bit PNG, runs
    bake_sanity, restores the scene. Returns paths, settings, projection and sanity.
    adaptive (default, no cage): per texel, the smallest extrusion that hits a front face of
    the high. Bakes NORMAL at ADAPTIVE_FACTORS x the extrusion (ray depth kept) and keeps, per
    pixel, the first pass that is neither inverted nor an exact miss; other maps reuse that
    choice so all maps sample the same surface. One global distance is SpeedChar's
    'compromise' (a thin ear next to a deep socket); this is his per-region idea per pixel.
    On the sheep it cut inverted texels from 7.5% to 1.3% (consistent pair). adaptive=False:
    one pass at the measured or given distance."""
    _object_mode()
    highs = [h for h in highs if h is not low]
    if not highs:
        raise ValueError("no high objects")
    if not low.data.uv_layers:
        raise ValueError(f"{low.name} has no UV map")
    os.makedirs(out_dir, exist_ok=True)
    prefix = prefix or low.name
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    state = {"engine": sc.render.engine, "device": sc.cycles.device, "samples": sc.cycles.samples,
             "sel": [o for o in vl.objects if o.select_get()], "act": vl.objects.active,
             "hide_render": {o.name: o.hide_render for o in sc.objects},
             "levels": [(m, m.levels, m.render_levels) for m in low.modifiers if m.type in ("MULTIRES", "SUBSURF")],
             "world": sc.world, "ao_dist": sc.world.light_settings.distance if sc.world else None,
             "uv_active": low.data.uv_layers.active_index}
    report = {"low": low.name, "highs": [h.name for h in highs], "res": res, "paths": {}, "sanity": {}, "warnings": []}
    targets = []
    try:
        sc.render.engine = "CYCLES"
        report["device"] = _use_gpu(sc)
        for m, _, _ in state["levels"]:
            m.levels = low_base_levels
            m.render_levels = low_base_levels
        if uv_map:
            low.data.uv_layers.active = low.data.uv_layers[uv_map]
        qa = uv_qa(low, tex_res=res, analysis_res=min(res, 1024))
        if qa["mirror_stacked_hint"] or qa["overlap_px_pct"] > 0.05:
            report["warnings"].append("overlapping UVs inside the tile: the last island baked overwrites the others")
        if qa["flat_shaded_share"] > 0.5:
            report["warnings"].append("low is flat shaded: normals bake faceted (run prepare_low)")
        if cage is not None:
            proj = {"cage": cage.name}
            ext, ray = 0.0, (max_ray or 0.0)
        elif extrusion is None or max_ray is None:
            proj = measure_projection(low, highs, samples=measure_samples)
            ext = proj["cage_extrusion"] if extrusion is None else extrusion
            ray = proj["max_ray_distance"] if max_ray is None else max_ray
            if proj["wrong_part_pct"] > 1:
                report["warnings"].append(f"{proj['wrong_part_pct']}% of rays would hit another part first: explode or bake per pair")
        else:
            proj = {"given": True}
            ext, ray = extrusion, max_ray
        report["projection"] = proj
        margin = int(margin_px if margin_px is not None else max(4, res // 128))
        keep = {low.name} | {h.name for h in highs} | {o.name for o in occluders}
        for o in sc.objects:
            if o.name not in keep:
                o.hide_render = True
        low.hide_render = False
        for o in vl.objects:
            o.select_set(False)
        for h in highs:
            h.select_set(True)
        low.select_set(True)
        vl.objects.active = low
        mask = island_mask(low, res)
        report["settings"] = {"cage_extrusion": ext, "max_ray_distance": ray, "cage": cage.name if cage else None,
                              "margin_px": margin, "normal_convention": "DIRECTX" if directx else "OPENGL"}
        factors = None
        if adaptive and cage is None:
            factors = tuple(adaptive) if isinstance(adaptive, (list, tuple)) else ADAPTIVE_FACTORS
        depth = max(ray - ext, 0.0)
        order = list(maps)
        if factors and "NORMAL" not in order:
            order = ["NORMAL"] + order          # choice map only, not saved
        choice = None
        for kind in order:
            is_color = kind in ("DIFFUSE", "EMIT")
            img, nodes = _bake_target(low, f"{prefix}_{kind.lower()}", res, float_buffer=not is_color,
                                      colorspace="sRGB" if is_color else "Non-Color")
            targets += nodes
            if kind == "AO":
                if sc.world is None:
                    sc.world = bpy.data.worlds.new("World")
                sc.world.light_settings.distance = ao_distance or 0.2 * Vector(low.dimensions).length
                sc.cycles.samples = samples or 128
                report["settings"]["ao_distance"] = round(sc.world.light_settings.distance, 4)
            else:
                sc.cycles.samples = samples or 16
            kw = dict(type=kind, use_selected_to_active=True,
                      use_cage=cage is not None, cage_object=cage.name if cage else "", margin=margin,
                      margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES", normal_space="TANGENT",
                      normal_r="POS_X", normal_g="NEG_Y" if directx else "POS_Y", normal_b="POS_Z")
            if kind in ("DIFFUSE",):
                kw["pass_filter"] = {"COLOR"}
            passes = [(ext * f, ext * f + depth) for f in factors] if factors else [(ext, ray)]
            stack = []
            for e_, r_ in passes:
                res_op = bpy.ops.object.bake(cage_extrusion=e_, max_ray_distance=r_, **kw)
                if res_op != {"FINISHED"}:
                    raise RuntimeError(f"bake {kind} returned {res_op}")
                if len(passes) > 1:
                    buf = np.empty(res * res * 4, dtype=np.float32)
                    img.pixels.foreach_get(buf)
                    stack.append(buf.reshape(res, res, 4))
            if len(passes) > 1:
                S = np.stack(stack)
                if kind == "NORMAL":
                    rgb = S[..., :3]
                    valid = (rgb[..., 2] >= 0.5) & (np.abs(rgb - np.array([0.5, 0.5, 1.0])).max(-1) >= 0.002)
                    choice = np.where(valid.any(0), np.argmax(valid, axis=0), len(passes) - 1)
                    share = np.bincount(choice[mask], minlength=len(passes)) / max(int(mask.sum()), 1)
                    report["adaptive"] = {"extrusions": [round(p[0], 5) for p in passes],
                                          "texel_share": [round(float(x), 4) for x in share]}
                comp = np.take_along_axis(S, choice[None, ..., None].repeat(4, -1), 0)[0]
                img.pixels.foreach_set(np.ascontiguousarray(comp).ravel())
                img.update()
                del S, stack
            if kind in maps:
                report["sanity"][kind] = bake_sanity(img, kind, mask, directx=directx)
                if save:
                    report["paths"][kind] = _save_image(img, os.path.join(out_dir, f"{prefix}_{kind.lower()}.png"), file_format)
            if not keep_nodes or kind not in maps:
                _drop_targets(nodes)
                targets = [t for t in targets if t not in nodes]
    finally:
        _drop_targets(targets)
        sc.render.engine = state["engine"]
        sc.cycles.samples = state["samples"]
        sc.cycles.device = state["device"]
        for m, lv, rl in state["levels"]:
            m.levels, m.render_levels = lv, rl
        for o in sc.objects:
            if o.name in state["hide_render"]:
                o.hide_render = state["hide_render"][o.name]
        if state["world"] is not None and state["ao_dist"] is not None:
            state["world"].light_settings.distance = state["ao_dist"]
        low.data.uv_layers.active_index = state["uv_active"]
        for o in vl.objects:
            o.select_set(o in state["sel"])
        vl.objects.active = state["act"]
    return report


def bake_multires(obj, out_dir, res=2048, types=("NORMALS",), base_level=0, margin_px=None, prefix=None):
    """Bake from Multires (Abbitt): the base (viewport level base_level) receives the detail
    of the highest level (render level). Equal levels bake a flat map, so levels are set
    explicitly and restored. types: NORMALS, DISPLACEMENT, VECTOR_DISPLACEMENT."""
    _object_mode()
    mr = next((m for m in obj.modifiers if m.type == "MULTIRES"), None)
    if mr is None:
        raise ValueError(f"{obj.name} has no Multires modifier")
    os.makedirs(out_dir, exist_ok=True)
    prefix = prefix or obj.name
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    b = sc.render.bake
    st = (sc.render.engine, mr.levels, mr.render_levels, b.use_multires, b.type, b.margin, b.use_clear,
          [o for o in vl.objects if o.select_get()], vl.objects.active)
    rep = {"paths": {}, "sanity": {}}
    try:
        sc.render.engine = "CYCLES"
        mr.levels = base_level
        mr.render_levels = mr.total_levels
        b.use_multires = True
        b.margin = int(margin_px if margin_px is not None else max(4, res // 128))
        b.use_clear = True
        for o in vl.objects:
            o.select_set(False)
        obj.select_set(True)
        vl.objects.active = obj
        mask = island_mask(obj, res)
        for t in types:
            img, nodes = _bake_target(obj, f"{prefix}_mr_{t.lower()}", res)
            b.type = t
            r = bpy.ops.object.bake_image()
            _drop_targets(nodes)
            if r != {"FINISHED"}:
                raise RuntimeError(f"multires bake {t} returned {r}")
            rep["sanity"][t] = bake_sanity(img, "NORMAL" if t == "NORMALS" else t, mask)
            rep["paths"][t] = _save_image(img, os.path.join(out_dir, f"{prefix}_mr_{t.lower()}.png"))
        rep["levels"] = {"low": base_level, "high": mr.total_levels}
    finally:
        sc.render.engine, mr.levels, mr.render_levels, b.use_multires, b.type, b.margin, b.use_clear = st[:7]
        for o in vl.objects:
            o.select_set(o in st[7])
        vl.objects.active = st[8]
    return rep


def bake_id(low, highs, out_dir, res=2048, source="MATERIAL", attribute=None, prefix=None, **kw):
    """ID map (SpeedChar: one flat color per future material): temporarily gives each high an
    emission material per material slot ('MATERIAL'), per object ('OBJECT') or from a color
    attribute ('ATTRIBUTE'), bakes EMIT selected-to-active, restores the materials."""
    saved = []
    temp = []
    try:
        for i, h in enumerate(highs):
            slots = [(s, s.link, s.material) for s in h.material_slots]
            saved.append((h, slots, h.data.materials[:] if not slots else None))
            if not h.material_slots:
                h.data.materials.append(None)
            for j, s in enumerate(h.material_slots):
                key = i if source == "OBJECT" else (s.material.name if s.material else f"{h.name}_{j}")
                hue = (hash(key) % 997) / 997.0 if source != "OBJECT" else (i * 0.618034) % 1.0
                m = bpy.data.materials.new("BX_ID")
                m.use_nodes = True
                nt = m.node_tree
                for n in list(nt.nodes):
                    nt.nodes.remove(n)
                out = nt.nodes.new("ShaderNodeOutputMaterial")
                em = nt.nodes.new("ShaderNodeEmission")
                if source == "ATTRIBUTE":
                    at = nt.nodes.new("ShaderNodeVertexColor")
                    at.layer_name = attribute or ""
                    nt.links.new(at.outputs["Color"], em.inputs["Color"])
                else:
                    em.inputs["Color"].default_value = (*colorsys.hsv_to_rgb(hue, 0.8, 0.9), 1.0)
                nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
                s.link = "OBJECT"
                s.material = m
                temp.append(m)
        rep = bake_high_to_low(low, highs, out_dir, res=res, maps=("EMIT",), prefix=(prefix or low.name) + "_id",
                               samples=kw.pop("samples", 4), **kw)
    finally:
        for h, slots, _ in saved:
            for j, s in enumerate(h.material_slots):
                if j < len(slots):
                    s.material = None
                    s.link = slots[j][1]
                    s.material = slots[j][2]
        for m in temp:
            bpy.data.materials.remove(m)
    return rep


def curvature_from_normal(normal_path, out_path, mask=None, blur_px=1, directx=False, gain=None):
    """Curvature map from a tangent-space normal map (Blender has no curvature bake):
    divergence of the normal's XY in UV space, convex > 0.5 > concave, computed only
    inside islands so seams do not spike. gain None: 99th percentile maps to 0/1."""
    im = bpy.data.images.load(normal_path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    a = a.reshape(h, w, 4)
    nx = a[..., 0] * 2 - 1
    ny = (a[..., 1] * 2 - 1) * (-1 if directx else 1)
    m = mask if mask is not None else np.ones((h, w), dtype=bool)
    dx = np.zeros_like(nx)
    dy = np.zeros_like(ny)
    okx = m[:, 2:] & m[:, :-2] & m[:, 1:-1]
    oky = m[2:, :] & m[:-2, :] & m[1:-1, :]
    dx[:, 1:-1] = np.where(okx, (nx[:, 2:] - nx[:, :-2]) / 2, 0)
    dy[1:-1, :] = np.where(oky, (ny[2:, :] - ny[:-2, :]) / 2, 0)
    c = dx + dy
    for _ in range(max(0, blur_px)):
        c = (c + np.roll(c, 1, 0) + np.roll(c, -1, 0) + np.roll(c, 1, 1) + np.roll(c, -1, 1)) / 5
    g = gain or 0.5 / max(float(np.percentile(np.abs(c[m]), 99)), 1e-6)
    v = np.clip(0.5 + c * g, 0, 1)
    v[~m] = 0.5
    out = np.dstack([v, v, v, np.ones_like(v)])
    _save_rgba(out, out_path)
    return {"path": out_path, "gain": round(float(g), 3)}


def explode(groups, axis=(0.0, 0.0, 1.0), gap=None):
    """Move each group (list of objects: a low with its highs) by k * gap along one axis
    (SpeedChar: only Z, so reassembly is exact). Stores the offset on each object."""
    ax = Vector(axis).normalized()
    if gap is None:
        ext = 0.0
        for g in groups:
            for o in g:
                ext = max(ext, max(abs(Vector(c).dot(ax)) for c in o.bound_box) * 2 * max(o.scale))
        gap = 1.5 * ext
    for k, g in enumerate(groups):
        for o in g:
            d = ax * gap * k
            o.location += d
            o["bx_explode"] = list(d)
    bpy.context.view_layer.update()
    return {"gap": gap, "groups": len(groups)}


def unexplode(objs):
    for o in objs:
        if "bx_explode" in o:
            o.location -= Vector(o["bx_explode"])
            del o["bx_explode"]
    bpy.context.view_layer.update()
    return {"restored": len(objs)}


def hookup_maps(low, normal=None, ao=None, uv_map=None, directx=False, ao_preview=False):
    """Wire baked maps into every material of the low: Image (Non-Color) -> Normal Map node
    (tangent, UV map set, OPENGL or DIRECTX convention, 5.1+) -> BSDF Normal. AO stays a
    separate map for the engine; ao_preview multiplies it into Base Color for review only."""
    lay = uv_map or low.data.uv_layers.active.name
    imgs = {}
    for key, v in (("normal", normal), ("ao", ao)):
        if v is None:
            continue
        img = v if isinstance(v, bpy.types.Image) else bpy.data.images.load(v, check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        imgs[key] = img
    done = 0
    for s in low.material_slots:
        if s.material is None:
            continue
        nt = s.material.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        if "normal" in imgs:
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = imgs["normal"]
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.space = "TANGENT"
            nm.uv_map = lay
            nm.convention = "DIRECTX" if directx else "OPENGL"
            nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        if "ao" in imgs and ao_preview:
            ta = nt.nodes.new("ShaderNodeTexImage")
            ta.image = imgs["ao"]
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            src = bsdf.inputs["Base Color"]
            if src.links:
                nt.links.new(src.links[0].from_socket, mix.inputs["A"])
            else:
                mix.inputs["A"].default_value = src.default_value
            nt.links.new(ta.outputs["Color"], mix.inputs["B"])
            nt.links.new(mix.outputs["Result"], src)
        done += 1
    return {"materials": done}


def bake_review(low, highs, maps, out_dir, views=("front", "threequarter", "right", "back"), res=600,
                engine="BLENDER_EEVEE", low_base_levels=0, prefix="bake_review"):
    """High vs low vs low+maps under the same raking light (the comparison every expert
    makes): rows = high (clay), low (clay, no maps), low + normal (+ AO multiply), columns =
    views. Temporary scene and object copies with object-linked materials; the user's
    objects are untouched."""
    R = _review_helpers()
    os.makedirs(out_dir, exist_ok=True)
    clay = bpy.data.materials.new("BX_clay")
    clay.use_nodes = True
    b = clay.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.62, 0.6, 0.58, 1)
    b.inputs["Roughness"].default_value = 0.55
    mapped = clay.copy()
    mapped.name = "BX_mapped"
    temp_imgs = []
    nt = mapped.node_tree
    b2 = nt.nodes["Principled BSDF"]
    lay = low.data.uv_layers.active.name
    if maps.get("NORMAL"):
        img = bpy.data.images.load(maps["NORMAL"], check_existing=False)
        img.colorspace_settings.name = "Non-Color"
        temp_imgs.append(img)
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.uv_map = lay
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b2.inputs["Normal"])
    if maps.get("AO"):
        img = bpy.data.images.load(maps["AO"], check_existing=False)
        img.colorspace_settings.name = "Non-Color"
        temp_imgs.append(img)
        ta = nt.nodes.new("ShaderNodeTexImage")
        ta.image = img
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["A"].default_value = (0.62, 0.6, 0.58, 1)
        nt.links.new(ta.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], b2.inputs["Base Color"])
    sc, cam, world = _temp_scene("BX_BakeReview", res, engine)
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.03, 0.035, 1)
    sun = bpy.data.objects.new("BX_key", bpy.data.lights.new("BX_key", "SUN"))
    sun.data.energy = 4.0
    sc.collection.objects.link(sun)
    fill = bpy.data.objects.new("BX_fill", bpy.data.lights.new("BX_fill", "SUN"))
    fill.data.energy = 0.6
    sc.collection.objects.link(fill)

    def aim(d):   # raking key 50 deg left of the camera and 35 deg up, weak fill from the right
        from mathutils import Matrix
        for light, yaw, lift in ((sun, 50, 35), (fill, -70, 10)):
            L = Matrix.Rotation(math.radians(yaw), 3, "Z") @ Vector(d)
            L.z += math.tan(math.radians(lift)) * Vector((L.x, L.y, 0)).length
            light.rotation_euler = (-L.normalized()).to_track_quat("-Z", "Y").to_euler()
    hi_c = [_copy_with_material(h, sc, clay) for h in highs]
    lo_c = _copy_with_material(low, sc, clay, base_levels=low_base_levels)
    lo_m = _copy_with_material(low, sc, mapped, base_levels=low_base_levels)
    paths, labels = [], []
    try:
        rows = [("high", hi_c), ("low", [lo_c]), ("low_maps", [lo_m])]
        allc = hi_c + [lo_c, lo_m]
        for name, objs in rows:
            for c in allc:
                c.hide_render = c not in objs
            paths += _render_views(objs, [lo_c], out_dir, f"{prefix}_{name}", views, res, sc, cam, per_view=aim)
            labels += [f"{name} / {v}" for v in views]
    finally:
        _drop_scene(sc, cam, world, hi_c + [lo_c, lo_m, sun, fill], (clay, mapped, *temp_imgs))
    return R._tile(paths, 3, len(views), os.path.join(out_dir, prefix + "_sheet.png"), labels)
