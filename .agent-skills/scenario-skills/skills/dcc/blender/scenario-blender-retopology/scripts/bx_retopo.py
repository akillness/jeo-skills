"""
bx_retopo: retopology building blocks for an agent with no mouse (Blender 5.2.1 LTS).

Works headless (`blender --background`) and inside a live session. Everything operates on
mesh data (bmesh / numpy / BVH), so no 3D view, brush stroke or modal tool is needed.
Tested by tests/code/blender-retopology/test_bx_retopo.py on the Blender Studio sheep sculpt.

    import sys; sys.path.append("<skills>/scenario-blender-retopology/scripts"); import bx_retopo as R

COORDINATES. All points passed to or returned by this module are in the TARGET's local
space. `setup_cage` gives the cage the target's transform, so cage-local == target-local
and Mirror X is the sculpt's own symmetry plane (sculpts are often rotated in world space;
the test sheep is rotated 27 degrees about Z, world-X mirroring would be wrong).

STACK AND FREEZE (Kaspar's setup, Dikko, CG Boost)
  setup_cage(target, ...)            new cage object: Mirror (clip, merge) > Shrinkwrap > Subsurf
  freeze(obj)                        "duplicate and apply" the Shrinkwrap, re-pin the centre line
  project(obj, target, idx)          move vertices onto the surface (nearest or along normals)
  snap_center(obj) / symmetrize(obj) keep the mirror seam closed / make one side win

BUILD (the map method, as data instead of strokes)
  surface_point(target, origin, dir) ray cast a landmark onto the sculpt
  cross_section(target, co, no)      closed contours of the sculpt cut by a plane
  ring(target, center, normal, n)    n evenly spaced vertices around a limb/feature section
  tube(obj, target, stations, n)     extrude rings along a path and bridge them (limbs, ears, horns)
  joint_stations(a, joint, b, ...)   stations with Kaspar's 3 loops per joint
  add_ring / bridge / weld_loops / grid_fill / boundary_loops   assemble islands, match counts, merge
  cut_region(obj, seed, inside)      cut a socket out of an auto-remesh, returns its border (odd
                                     if the cut holds an odd boundary: parity_strip first)
  carve_rings(obj, target, ...)      concentric rings around an eye / mouth: corners (top = bottom),
                                     count or (lo, hi) range, geodesic rings, slit (2-pole corners)
  carve_band(obj, target, curve)     a clean loop along a map line (face frame, nasolabial, neck)
  bridge_reduce / reduce_loop        3-to-1 reduction strips between ring counts (4 poles a unit)
  parity_strip(obj, a, b)            loop-cut a quad strip between two odd boundaries
  limb_tip / limb_profile            geodesic contours from a tip: root and joints found
  socket_tube(obj, target, profile)  socket + rings on geodesic contours + 3 rings per joint + cap
  find_loop_near(obj, curve, tol)    verify that a planned line exists as a real edge loop

FIELDS AND LANDMARKS (on the sculpt's own mesh)
  geodesic, iso_contours, surface_seeds, enclosing_contour, nearest_vertex
  face_sets, face_set_map, face_set_components, face_set_border, face_verts, face_set_review

AUTO START (static assets, scans, AI meshes, first pass)
  quadriflow(target, faces, ...)     QuadriFlow with the fixes it needs headless (scale trick,
                                     voxel fallback); symmetry OFF unless the mesh is symmetric;
                                     density=[(center, radius, factor)] denser where the face is
  relax(obj, target, ...)            tangential smooth + reproject (Relax Slide substitute), pins
                                     boundary / centre line / crease-attribute vertices

VOLUME (a shrinkwrapped cage shrinks under subdivision)
  fit_subdiv(obj, target, ...)       Duha: move cage verts so the SUBDIVIDED surface fits
  multires_recover(obj, target, ...) Kaspar: Multires + Shrinkwrap + Apply Base

CHECKS
  fidelity(obj, target, levels=2)    distance of the subdivided surface to the sculpt, plus coverage
  topology_report(obj, ...)          bx_audit + expert checks: rim poles, centre-line poles, crease
                                     poles, adjacent 5-poles, valence 2, local symmetry, pole density
  loops_around(obj, center, ...)     closed edge rings that encircle a landmark (eye, mouth), parity
  loop_stats(obj)                    closed vs open loops, spiral suspects
GAME
  tri_count, triangulate_twisted(obj, high), push_outside(obj, high, offset),
  hard_edges_without_seams(obj)
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-blender-expert", "scripts"))
if _EXPERT not in sys.path:
    sys.path.append(_EXPERT)

_BVH_CACHE = {}


# --------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------
def _local_size(target):
    me = target.data
    if not len(me.vertices):
        return 1.0
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return float((co.max(0) - co.min(0)).max()) or 1.0


def clear_cache():
    """Drop cached target BVHs (call after editing a target sculpt)."""
    _BVH_CACHE.clear()


def target_bvh(target):
    """BVH of the evaluated target in its LOCAL space (cached per target object)."""
    key = (target.name, len(target.data.vertices), len(target.data.polygons))
    hit = _BVH_CACHE.get(key)
    if hit is None:
        dg = bpy.context.evaluated_depsgraph_get()
        hit = BVHTree.FromObject(target, dg)
        _BVH_CACHE.clear()
        _BVH_CACHE[key] = hit
    return hit


def _ctx(obj):
    return bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                     selected_editable_objects=[obj])


def _object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def _local_size_of_mesh(me):
    if not len(me.vertices):
        return 1.0
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return float((co.max(0) - co.min(0)).max()) or 1.0


def _has_mirror(obj):
    return any(m.type == "MIRROR" and m.show_viewport for m in obj.modifiers)


# --------------------------------------------------------------------------------------
# stack
# --------------------------------------------------------------------------------------
def setup_cage(target, name="GEO-retopo", mirror=True, wrap="TARGET_PROJECT", subsurf=2,
               offset=0.0, project_limit=None, mesh=None, collection=None):
    """Create the retopo cage object with the expert modifier stack.

    wrap: 'TARGET_PROJECT' (Kaspar's default for skin, On Surface), 'NEAREST_SURFACEPOINT'
    (Dikko, simplest), or 'PROJECT' (clothing shells or double-sided sculpts: both
    directions, Above Surface and a Limit so it cannot grab the inner side; Kaspar Live #7).
    The cage copies the target's matrix_world so Mirror X = the target's local X plane.
    Returns the object. Subsurf is hidden in edit mode (Kaspar, Jamie Dunbar: never build
    with subdivision showing on the cage).
    """
    me = mesh or bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, me)
    coll = collection or (target.users_collection[0] if target.users_collection
                          else bpy.context.scene.collection)
    coll.objects.link(obj)
    obj.matrix_world = target.matrix_world.copy()
    size = _local_size(target)
    if mirror:
        m = obj.modifiers.new("Mirror", "MIRROR")
        m.use_axis = (True, False, False)
        m.use_clip = True
        m.use_mirror_merge = True
        m.merge_threshold = size * 1e-3
    sw = obj.modifiers.new("Shrinkwrap", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = wrap
    sw.offset = offset
    if wrap == "PROJECT":
        sw.use_negative_direction = True
        sw.use_positive_direction = True
        sw.wrap_mode = "ABOVE_SURFACE"
        sw.project_limit = size * 0.05 if project_limit is None else project_limit
    else:
        sw.wrap_mode = "ON_SURFACE"
    if subsurf:
        s = obj.modifiers.new("Subdivision", "SUBSURF")
        s.levels = subsurf
        s.render_levels = 2
        s.show_in_editmode = False
        s.show_on_cage = False
    obj.show_wire = True
    obj.show_in_front = True
    return obj


def freeze(obj, modifier="Shrinkwrap"):
    """Kaspar's "duplicate and apply": bake the Shrinkwrap into the vertices, keep a live copy.

    Stops twitching, gives relax/bmesh steps real on-surface positions. Re-pins the mirror
    seam afterwards (the projection can pull centre vertices off x = 0).
    """
    _object_mode()
    if modifier not in obj.modifiers:
        raise KeyError(f"{obj.name} has no modifier '{modifier}'")
    with _ctx(obj):
        bpy.ops.object.modifier_copy(modifier=modifier)
        bpy.ops.object.modifier_apply(modifier=modifier)  # "not first" info is expected
    # the copy is named "<name>.001": give it the original name back
    for m in obj.modifiers:
        if m.type == "SHRINKWRAP" and m.name.startswith(modifier + "."):
            m.name = modifier
            break
    if _has_mirror(obj):
        snap_center(obj)
    return obj


def snap_center(obj, eps=None):
    """Put every vertex within eps of x = 0 exactly on the mirror plane. Returns the count."""
    eps = eps if eps is not None else _local_size_of_mesh(obj.data) * 2e-3
    n = 0
    for v in obj.data.vertices:
        if abs(v.co.x) < eps and v.co.x != 0.0:
            v.co.x = 0.0
            n += 1
    obj.data.update()
    return n


def symmetrize(obj, direction="-X", dist=None):
    """Mirror one half onto the other (bmesh.ops.symmetrize), then snap the seam.

    direction '-X' keeps the -X half and rebuilds +X from it ('+X' the reverse).
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    d = dist if dist is not None else _local_size_of_mesh(obj.data) * 1e-4
    bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction=direction, dist=d)
    bm.to_mesh(obj.data)
    bm.free()
    snap_center(obj)
    return obj


def project(obj, target, indices=None, method="nearest", keep_center=None):
    """Move cage vertices (all, or `indices`) onto the target surface.

    method 'nearest' = Shrinkwrap Nearest Surface Point; 'normal' casts along the vertex
    normal both ways first (closer to Target Normal Project), falling back to nearest.
    """
    bvh = target_bvh(target)
    me = obj.data
    keep_center = _has_mirror(obj) if keep_center is None else keep_center
    eps = _local_size_of_mesh(me) * 1e-5
    idx = range(len(me.vertices)) if indices is None else indices
    for i in idx:
        v = me.vertices[i]
        on_center = keep_center and abs(v.co.x) < eps
        p = None
        if method == "normal" and v.normal.length > 0:
            best = None
            for d in (v.normal, -v.normal):
                h = bvh.ray_cast(v.co, d)
                if h[0] is not None and (best is None or h[3] < best[3]):
                    best = h
            p = best[0] if best else None
        if p is None:
            p = bvh.find_nearest(v.co)[0]
        if p is not None:
            v.co = p
            if on_center:
                v.co.x = 0.0
    me.update()


# --------------------------------------------------------------------------------------
# relax
# --------------------------------------------------------------------------------------
def _adjacency(bm):
    nbr = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
    return nbr


def relax(obj, target, iterations=10, factor=0.5, pin_boundary=True, pin_attr="retopo_crease",
          pin_indices=None, keep_center=None, tangential=True):
    """Relax Slide substitute: tangential Laplacian smoothing + reprojection onto the target.

    Evens out quad sizes without changing the form (Kaspar: "Slide Relax keeps the form
    alive", plain Smooth shrinks it). Pinned: boundary verts (Mesh Boundary auto-masking),
    verts on edges flagged by the boolean edge attribute `pin_attr` (crease loops you
    placed on purpose), explicit `pin_indices`. Centre-line verts stay on x = 0.
    Returns the mean vertex displacement of the last iteration (convergence hint).
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    keep_center = _has_mirror(obj) if keep_center is None else keep_center
    pinned = set(pin_indices or [])
    if pin_boundary:
        pinned |= {v.index for v in bm.verts if v.is_boundary and
                   not (keep_center and abs(v.co.x) < _local_size_of_mesh(me) * 1e-5)}
    attr = me.attributes.get(pin_attr) if pin_attr else None
    if attr is not None and attr.domain == "EDGE":
        flags = [False] * len(me.edges)
        attr.data.foreach_get("value", flags)
        for e in me.edges:
            if flags[e.index]:
                pinned.update(e.vertices)
    nbr = _adjacency(bm)
    bm.free()
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    eps = _local_size_of_mesh(me) * 1e-5
    center = np.abs(co[:, 0]) < eps if keep_center else np.zeros(n, bool)
    movable = np.array([i not in pinned and len(nbr[i]) > 0 for i in range(n)])
    bvh = target_bvh(target)
    last = 0.0
    for _ in range(iterations):
        lap = np.array([co[nb].mean(0) if nb else co[i] for i, nb in enumerate(nbr)]) - co
        if tangential:
            nrm = np.zeros_like(co)
            for i in range(n):
                if movable[i]:
                    hit = bvh.find_nearest(Vector(co[i]))
                    if hit[1] is not None:
                        nrm[i] = hit[1]
            lap -= (lap * nrm).sum(1)[:, None] * nrm
        new = co + factor * lap
        new[~movable] = co[~movable]
        for i in np.nonzero(movable)[0]:
            p, pn, _, _ = bvh.find_nearest(Vector(new[i]))
            if p is None:
                new[i] = co[i]
            elif tangential and nrm[i].any() and Vector(nrm[i]).dot(pn) < 0.2:
                new[i] = co[i]  # would jump to the other side of a thin part (ear, lip, finger)
            else:
                new[i] = p
        new[center, 0] = 0.0
        last = float(np.linalg.norm(new - co, axis=1)[movable].mean()) if movable.any() else 0.0
        co = new
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    return last


# --------------------------------------------------------------------------------------
# building: landmarks, sections, rings, tubes
# --------------------------------------------------------------------------------------
def surface_point(target, origin, direction):
    """First hit of a ray on the target (local space), or None. The agent's 3D cursor."""
    hit = target_bvh(target).ray_cast(Vector(origin), Vector(direction).normalized())
    return hit[0]


def nearest_point(target, co):
    """(location, normal, distance) of the closest target surface point."""
    loc, nrm, _, d = target_bvh(target).find_nearest(Vector(co))
    return loc, nrm, d


def volume_center(target, point, direction):
    """Midpoint between the two surface hits across a limb: Kaspar's 'cursor snapped to
    Volume' used to centre an 8-vertex circle inside an arm. `point` is outside or on
    the surface, `direction` points through the limb."""
    d = Vector(direction).normalized()
    bvh = target_bvh(target)
    a = bvh.ray_cast(Vector(point) - d * 1e-4, d)
    if a[0] is None:
        return None
    b = bvh.ray_cast(a[0] + d * 1e-5, d)
    return (a[0] + b[0]) / 2 if b[0] is not None else None


def _mesh_arrays(target):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = target.evaluated_get(dg)
    me = ev.to_mesh()
    nv, ne, nl, npoly = len(me.vertices), len(me.edges), len(me.loops), len(me.polygons)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    ed = np.empty(ne * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    le = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("edge_index", le)
    ls = np.empty(npoly, dtype=np.int64)
    me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(npoly, dtype=np.int64)
    me.polygons.foreach_get("loop_total", lt)
    ev.to_mesh_clear()
    return co.reshape(-1, 3), ed.reshape(-1, 2), le, ls, lt


def _field_contours(co, ed, le, ls, lt, d):
    """Zero-level contours of a per-vertex scalar `d` (non-finite values never cross).
    Returns [(points ndarray (n, 3), closed bool)] ordered along each contour."""
    d = np.array(d, dtype=np.float64)
    d[d == 0] = 1e-12
    da, db = d[ed[:, 0]], d[ed[:, 1]]
    ok = np.isfinite(da) & np.isfinite(db)
    cross = np.nonzero(ok & (da * db < 0))[0]
    if not len(cross):
        return []
    t = da[cross] / (da[cross] - db[cross])
    pts = co[ed[cross, 0]] + (co[ed[cross, 1]] - co[ed[cross, 0]]) * t[:, None]
    slot = {int(e): k for k, e in enumerate(cross)}
    poly_of_loop = np.repeat(np.arange(len(ls)), lt)
    is_cross = np.zeros(len(ed), bool)
    is_cross[cross] = True
    mask = is_cross[le]
    faces = {}
    for f, e in zip(poly_of_loop[mask], le[mask]):
        faces.setdefault(int(f), []).append(slot[int(e)])
    links = [[] for _ in range(len(cross))]
    for lst in faces.values():
        for a in range(0, len(lst) - 1, 2):
            links[lst[a]].append(lst[a + 1])
            links[lst[a + 1]].append(lst[a])
    seen = np.zeros(len(cross), bool)
    out = []
    for s in range(len(cross)):
        if seen[s]:
            continue
        # walk to one end first if open
        start = s
        prev, cur = None, s
        guard = 0
        while guard < len(cross) + 2:
            guard += 1
            nxt = [x for x in links[cur] if x != prev]
            if not nxt or nxt[0] == s:
                break
            prev, cur = cur, nxt[0]
            if len(links[cur]) < 2:
                start = cur
                break
        chain = [start]
        seen[start] = True
        prev, cur = None, start
        closed = False
        while True:
            nxt = [x for x in links[cur] if x != prev]
            if not nxt:
                break
            if nxt[0] == start:
                closed = True
                break
            if seen[nxt[0]]:
                break
            prev, cur = cur, nxt[0]
            chain.append(cur)
            seen[cur] = True
        ci = cross[chain]
        near = np.where(t[chain] < 0.5, ed[ci, 0], ed[ci, 1])
        out.append((pts[chain], closed, near))
    return out


def cross_section(target, plane_co, plane_no):
    """Cut the target with a plane. Returns a list of (points, closed) contours, points as
    Vectors in target-local space, ordered along the contour. Plane sections fold at bends
    (a knee, a curled ear): for limbs prefer geodesic contours (limb_profile)."""
    co, ed, le, ls, lt = _mesh_arrays(target)
    p = np.asarray(plane_co, float)
    n = np.asarray(plane_no, float)
    n = n / np.linalg.norm(n)
    return [([Vector(q) for q in pts], closed)
            for pts, closed, _ in _field_contours(co, ed, le, ls, lt, (co - p) @ n)]


# --------------------------------------------------------------------------------------
# fields on the sculpt: topology cache, geodesic distance, iso-contours
# --------------------------------------------------------------------------------------
_TOPO_CACHE = {}


def _topo(target):
    """Arrays and CSR edge graph of the target's ORIGINAL mesh data (local space, cached).
    Face sets and geodesic fields index these vertices; use a target without
    topology-changing modifiers (apply them on a copy first)."""
    me = target.data
    key = (target.name, len(me.vertices), len(me.edges), len(me.polygons))
    t = _TOPO_CACHE.get(key)
    if t is not None:
        return t
    nv, ne, nl, npoly = len(me.vertices), len(me.edges), len(me.loops), len(me.polygons)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ed = np.empty(ne * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    le = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("edge_index", le)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    ls = np.empty(npoly, dtype=np.int64)
    me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(npoly, dtype=np.int64)
    me.polygons.foreach_get("loop_total", lt)
    ln = np.linalg.norm(co[ed[:, 0]] - co[ed[:, 1]], axis=1)
    src = np.concatenate([ed[:, 0], ed[:, 1]])
    dst = np.concatenate([ed[:, 1], ed[:, 0]])
    w = np.concatenate([ln, ln])
    order = np.argsort(src, kind="stable")
    src, dst, w = src[order], dst[order], w[order]
    ptr = np.searchsorted(src, np.arange(nv + 1))
    kd = KDTree(nv)
    for i, c in enumerate(co):
        kd.insert(c, i)
    kd.balance()
    vn = np.empty(nv * 3)
    me.vertices.foreach_get("normal", vn)
    t = {"co": co, "vn": vn.reshape(-1, 3), "ed": ed, "le": le, "lv": lv, "ls": ls, "lt": lt,
         "pol": np.repeat(np.arange(npoly), lt), "ptr": ptr.tolist(), "dst": dst.tolist(),
         "w": w.tolist(), "edge_len": ln, "kd": kd, "edge_p95": float(np.percentile(ln, 95)) if ne else 0.0}
    _TOPO_CACHE.clear()
    _TOPO_CACHE[key] = t
    return t


def nearest_vertex(target, p, normal=None, k=12):
    """Target vertex nearest to p; with a normal, the nearest whose normal agrees (dot > 0.2)
    so a point on the cheek never maps onto an ear lying against it, and vice versa."""
    tt = _topo(target)
    if normal is None:
        return tt["kd"].find(p)[1]
    n = Vector(normal)
    for _, i, _ in tt["kd"].find_n(p, k):
        if n.dot(Vector(tt["vn"][i])) > 0.2:
            return i
    return tt["kd"].find(p)[1]


def geodesic(target, seeds, limit=None, block=None):
    """Geodesic distance (Dijkstra over the target's edges, local units) from seed vertices.

    seeds: vertex indices of the target. limit: stop beyond this distance (inf there).
    block: bool array per target vertex that paths may not enter (a closed chain of blocked
    vertices is a wall: edge paths cannot cross it). Edge-graph distance overestimates the
    true geodesic by a few %, which does not matter for iso-contours. Pure Python: about
    1 to 3 s on the 186k-vertex sheep without a limit."""
    import heapq
    t = _topo(target)
    ptr, dst, w = t["ptr"], t["dst"], t["w"]
    n = len(t["co"])
    dist = [math.inf] * n
    bl = np.asarray(block, bool).tolist() if block is not None else None
    lim = math.inf if limit is None else float(limit)
    h = []
    for s in set(int(x) for x in seeds):
        dist[s] = 0.0
        h.append((0.0, s))
    heapq.heapify(h)
    pop, push = heapq.heappop, heapq.heappush
    while h:
        d, u = pop(h)
        if d > dist[u]:
            continue
        for k in range(ptr[u], ptr[u + 1]):
            v = dst[k]
            if bl is not None and bl[v]:
                continue
            nd = d + w[k]
            if nd < dist[v] and nd <= lim:
                dist[v] = nd
                push(h, (nd, v))
    return np.array(dist)


def surface_seeds(target, points, radius=None):
    """Target vertices along a polyline (e.g. a retopo border or a landmark contour), for
    use as geodesic seeds or as a wall. radius=None: the nearest vertex of each point,
    after sampling the polyline finer than the target's edges. With a radius (e.g. the
    target's p95 edge length), every vertex within it: a band thick enough that no edge
    path crosses it (use as `block` to wall off the inside of a contour). 3D-nearest:
    where two surfaces touch (an ear on a cheek) it can pick the wrong one; iso_contours
    (verts=True) gives exact vertices for contour curves."""
    t = _topo(target)
    kd = t["kd"]
    pts = [Vector(p) for p in points]
    step = max(t["edge_p95"] * 0.5, 1e-9)
    dense = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        k = max(1, int((b - a).length / step))
        dense += [a.lerp(b, j / k) for j in range(k)]
    out = set()
    for p in dense:
        if radius:
            out.update(i for _, i, _ in kd.find_range(p, radius))
        else:
            out.add(kd.find(p)[1])
    return sorted(out)


def iso_contours(target, field, level, close_gaps=0.0, verts=False):
    """Contours where a per-vertex scalar field (e.g. from `geodesic`) equals `level`.
    Returns [(points [Vector], closed, length)], plus the target vertex next to each point
    as a 4th item with verts=True (exact seeds on the right surface: a 3D nearest-vertex
    lookup jumps to another part where surfaces touch, e.g. an ear lying on the cheek).
    close_gaps > 0 treats an open contour whose end gap is under close_gaps x its length
    as closed (contours cut open by a blocked region or a hole, e.g. hooves that touch)."""
    t = _topo(target)
    f = np.asarray(field, float) - level
    out = []
    for P, closed, near in _field_contours(t["co"], t["ed"], t["le"], t["ls"], t["lt"], f):
        if len(P) < 2:
            continue
        seg = np.linalg.norm(np.diff(np.vstack([P, P[:1]]) if closed else P, axis=0), axis=1)
        length = float(seg.sum())
        if not closed and close_gaps and len(P) >= 6:
            gap = float(np.linalg.norm(P[0] - P[-1]))
            if gap < close_gaps * length:
                closed = True
                length += gap
        item = ([Vector(p) for p in P], closed, length)
        out.append(item + (near.tolist(),) if verts else item)
    return out


def enclosing_contour(target, seeds, level, block=None, return_verts=False, close=0.0):
    """The largest closed iso-contour at `level` of the geodesic distance from `seeds`:
    a loop that encloses a feature group at a set distance (face frame around eyes and
    muzzle, nasolabial loop around nose and mouth, a neck ring). Returns [Vector] or None;
    with return_verts=True (points, target vertex indices along it): pass those to
    carve_band(curve_verts=...) so the band never snaps onto a touching part.
    close: morphological closing radius (geodesic): gaps between the features narrower
    than about 2 x (close + level) are filled, so the loop has no fjords whose two strands
    would make a band overlap itself (the sheep's face frame between the eye masks)."""
    if close:
        tt = _topo(target)
        R_ = level + close
        f1 = geodesic(target, seeds, limit=R_ + 4 * tt["edge_p95"], block=block)
        shell = np.nonzero((f1 > R_) & (f1 <= R_ + 2 * tt["edge_p95"]))[0]
        f2 = geodesic(target, shell, limit=close * 1.5, block=block)
        field = np.where(f1 <= R_, f2, -1.0)          # distance inward from the dilated rim
        lvl = close
    else:
        field = geodesic(target, seeds, limit=level * 1.5, block=block)
        lvl = level
    cs = [c for c in iso_contours(target, field, lvl, verts=True) if c[1]]
    if not cs:
        return (None, None) if return_verts else None
    best = max(cs, key=lambda c: c[2])
    return (best[0], best[3]) if return_verts else best[0]


# --------------------------------------------------------------------------------------
# the sculptor's face sets: a ready-made landmark map
# --------------------------------------------------------------------------------------
def face_sets(target):
    """Per-face face-set ids (numpy int array) of the target, or None if it has none.
    Sculptors partition characters with face sets (eye masks, lips, mouth, ears, hooves);
    they give lip lines, feature outlines and limb pieces better than any ellipse."""
    a = target.data.attributes.get(".sculpt_face_set")
    if a is None:
        return None
    fs = np.empty(len(target.data.polygons), np.int32)
    a.data.foreach_get("value", fs)
    return fs


def _face_components(t, face_mask):
    """Edge-connected components of the masked faces, largest first (face index arrays)."""
    faces = np.nonzero(face_mask)[0]
    parent = {int(f): int(f) for f in faces}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    lm = face_mask[t["pol"]]
    e, f = t["le"][lm], t["pol"][lm]
    o = np.argsort(e, kind="stable")
    e, f = e[o], f[o]
    same = np.nonzero(e[1:] == e[:-1])[0]
    for i in same:
        a, b = find(int(f[i])), find(int(f[i + 1]))
        if a != b:
            parent[a] = b
    groups = {}
    for x in parent:
        groups.setdefault(find(x), []).append(x)
    return sorted((np.array(sorted(g)) for g in groups.values()), key=len, reverse=True)


def face_set_components(target, set_ids):
    """Connected pieces of one face set (or a set of ids), largest first, as face-index
    arrays. Separates touching left/right parts (two hooves, two ears in one face set)
    where k-means on a coordinate splits them wrongly."""
    fs = face_sets(target)
    ids = [set_ids] if np.isscalar(set_ids) else list(set_ids)
    return _face_components(_topo(target), np.isin(fs, ids))


def face_verts(target, faces):
    """Vertex indices used by the given faces (face-index array)."""
    t = _topo(target)
    m = np.zeros(len(t["ls"]), bool)
    m[np.asarray(faces, np.int64)] = True
    return np.unique(t["lv"][m[t["pol"]]])


def face_set_map(target):
    """Summary of every face set: {id: dict(faces, area, center, min, max, components,
    neighbours={id: shared edges})}. Print it, render the sets in colour
    (face_set_review) and name the features from their positions: the landmark map."""
    fs = face_sets(target)
    if fs is None:
        return {}
    t = _topo(target)
    me = target.data
    cen = np.empty(len(me.polygons) * 3)
    me.polygons.foreach_get("center", cen)
    cen = cen.reshape(-1, 3)
    ar = np.empty(len(me.polygons))
    me.polygons.foreach_get("area", ar)
    e, f = t["le"], t["pol"]
    o = np.argsort(e, kind="stable")
    e, f = e[o], f[o]
    same = np.nonzero(e[1:] == e[:-1])[0]
    a, b = fs[f[same]], fs[f[same + 1]]
    diff = a != b
    nb = {}
    for x, y in zip(a[diff].tolist(), b[diff].tolist()):
        nb.setdefault(x, {}).setdefault(y, 0)
        nb.setdefault(y, {}).setdefault(x, 0)
        nb[x][y] += 1
        nb[y][x] += 1
    out = {}
    for s in np.unique(fs).tolist():
        m = fs == s
        out[s] = {"faces": int(m.sum()), "area": round(float(ar[m].sum()), 5),
                  "center": [round(float(v), 4) for v in cen[m].mean(0)],
                  "min": [round(float(v), 4) for v in cen[m].min(0)],
                  "max": [round(float(v), 4) for v in cen[m].max(0)],
                  "components": [len(c) for c in _face_components(t, m)][:6],
                  "neighbours": dict(sorted(nb.get(s, {}).items(), key=lambda kv: -kv[1]))}
    return out


def face_set_border(target, set_a, set_b=None, include_boundary=False):
    """Ordered vertex chains on the border of face set(s) `set_a` (against `set_b`, or
    against anything else). Returns [(vertex indices, closed)] longest first. Example:
    the lip line = border between the mouth-opening set and the lip sets."""
    fs = face_sets(target)
    t = _topo(target)
    A = np.isin(fs, [set_a] if np.isscalar(set_a) else list(set_a))
    B = None if set_b is None else np.isin(fs, [set_b] if np.isscalar(set_b) else list(set_b))
    e, f = t["le"], t["pol"]
    o = np.argsort(e, kind="stable")
    e, f = e[o], f[o]
    cnt = np.bincount(e, minlength=len(t["ed"]))
    first = np.searchsorted(e, np.arange(len(t["ed"])))
    sel = []
    for ei in range(len(t["ed"])):
        c = cnt[ei]
        if c == 2:
            f1, f2 = int(f[first[ei]]), int(f[first[ei] + 1])
            if A[f1] != A[f2]:
                other = f2 if A[f1] else f1
                if B is None or B[other]:
                    sel.append(ei)
        elif c == 1 and include_boundary and A[int(f[first[ei]])]:
            sel.append(ei)
    adj = {}
    for ei in sel:
        u, v = (int(x) for x in t["ed"][ei])
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)
    seen, chains = set(), []
    for s in sorted(adj, key=lambda x: len(adj[x])):
        if s in seen:
            continue
        chain, prev, cur, closed = [s], None, s, False
        seen.add(s)
        while True:
            nxt = [x for x in adj[cur] if x != prev and (x not in seen or (x == s and len(chain) > 2))]
            if not nxt:
                break
            if nxt[0] == s:
                closed = True
                break
            prev, cur = cur, nxt[0]
            chain.append(cur)
            seen.add(cur)
        chains.append((chain, closed))
    return sorted(chains, key=lambda c: len(c[0]), reverse=True)


def face_set_review(target, out_dir, views=("front",), focus=None, res=800, view_dirs=None):
    """Render the face sets in flat colours (Workbench, attribute colour) to read which id
    is which feature. views: 'front' (-Y), 'right' (+X), 'left', 'back', 'top', 'low'
    in the TARGET's local axes; focus=((x, y, z) local, radius) frames a close-up.
    Returns (paths, palette {id: rgb})."""
    import colorsys
    fs = face_sets(target)
    os.makedirs(out_dir, exist_ok=True)
    me = target.data
    ids = np.unique(fs)
    pal = {int(s): colorsys.hsv_to_rgb((k * 0.618) % 1.0, 0.7, 0.95) for k, s in enumerate(ids)}
    t = _topo(target)
    rgb = np.array([pal[int(s)] for s in fs], np.float32)[t["pol"]]
    name = "bx_face_sets"
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    att = me.color_attributes.new(name, "BYTE_COLOR", "CORNER")
    att.data.foreach_set("color", np.hstack([rgb, np.ones((len(rgb), 1), np.float32)]).ravel())
    prev_name = me.color_attributes.active_color_name
    me.color_attributes.active_color = att
    sc = bpy.data.scenes.new("BX_facesets")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "VERTEX"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = "Standard"
    sc.world = bpy.data.worlds.new("BX_fs_world")
    sc.world.color = (0.25, 0.25, 0.25)
    inst = bpy.data.objects.new("BX_fs_obj", me)
    inst.matrix_world = target.matrix_world.copy()
    sc.collection.objects.link(inst)
    cam = bpy.data.objects.new("BX_fs_cam", bpy.data.cameras.new("BX_fs_cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    dirs = {"front": (0, -1, 0), "back": (0, 1, 0), "right": (1, 0, 0), "left": (-1, 0, 0),
            "top": (0, 0, 1), "low": (0, -0.6, -1)}
    dirs.update(view_dirs or {})
    co = t["co"]
    if focus is not None:
        c_loc, half = Vector(focus[0]), float(focus[1])
    else:
        c_loc = Vector(((co.min(0) + co.max(0)) / 2).tolist())
        half = float((co.max(0) - co.min(0)).max()) * 0.6
    mw = target.matrix_world
    paths = []
    try:
        for v in views:
            d = (mw.to_3x3() @ Vector(dirs[v])).normalized()
            c = mw @ c_loc
            cam.location = c + d * (half * 8 + 1)
            fwd = -d
            up = Vector((0, 0, 1)) if abs(fwd.z) < 0.95 else Vector((0, 1, 0))
            right = fwd.cross(up).normalized()
            up = right.cross(fwd)
            cam.rotation_euler = Matrix((right, up, -fwd)).transposed().to_euler()
            cam.data.ortho_scale = 2 * half * max(mw.to_scale())
            cam.data.clip_end = half * 20 + 10
            p = os.path.join(out_dir, f"facesets_{v}.png")
            sc.render.filepath = p
            bpy.ops.render.render(write_still=True, scene=sc.name)
            paths.append(p)
    finally:
        bpy.data.objects.remove(inst)
        bpy.data.objects.remove(cam)
        bpy.data.worlds.remove(sc.world)
        bpy.data.scenes.remove(sc)
        me.color_attributes.remove(me.color_attributes[name])
        if prev_name and prev_name in me.color_attributes:
            me.color_attributes.active_color_name = prev_name
    return paths, pal


def _resample(points, n, closed=True):
    pts = [Vector(p) for p in points]
    if closed:
        pts = pts + [pts[0]]
    seg = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(seg)
    count = n if closed else n - 1
    step = total / count
    out, acc, i = [pts[0].copy()], 0.0, 0
    for k in range(1, count if closed else n):
        goal = k * step
        while i < len(seg) - 1 and acc + seg[i] < goal:
            acc += seg[i]
            i += 1
        t = (goal - acc) / seg[i] if seg[i] else 0.0
        out.append(pts[i].lerp(pts[i + 1], min(max(t, 0.0), 1.0)))
    if not closed:
        out[-1] = pts[-1].copy()
    return out


def ring(target, center, normal, n=8, start_dir=(0, 0, 1)):
    """n evenly spaced surface points around the target's section through `center`.

    Kaspar's limb start: an 8-vertex circle inside the arm, "go as low as possible"
    (Live #4 [00:06:54]); legs 8 then 12 (Live #5 [01:21:00]). Picks the closed contour
    that encircles `center` (smallest one if several); for thin curved parts (ears,
    folds) whose section does not contain its own centroid, falls back to the closed
    contour whose centroid is nearest. Starts at the point furthest along `start_dir`
    and winds counter-clockwise around `normal`, so consecutive rings bridge untwisted.
    """
    c0 = Vector(center)
    nrm = Vector(normal).normalized()
    u = Vector(start_dir) - nrm * Vector(start_dir).dot(nrm)
    if u.length < 1e-9:
        u = nrm.orthogonal()
    u.normalize()
    w = nrm.cross(u)

    def winding(pts, c):
        ang = [math.atan2((p - c).dot(w), (p - c).dot(u)) for p in pts]
        return sum(((ang[(i + 1) % len(ang)] - ang[i] + math.pi) % (2 * math.pi)) - math.pi
                   for i in range(len(ang)))

    enc, near = [], []
    for pts, closed in cross_section(target, c0, nrm):
        if not closed or len(pts) < 3:
            continue
        cc = sum(pts, Vector()) / len(pts)
        radius = sum((p - cc).length for p in pts) / len(pts)
        if abs(winding(pts, c0)) > math.pi:
            enc.append((radius, pts, c0))
        elif (cc - c0).length < radius:
            near.append(((cc - c0).length, pts, cc))
    if enc:
        _, pts, c = min(enc, key=lambda x: x[0])
    elif near:
        _, pts, c = min(near, key=lambda x: x[0])
    else:
        raise ValueError("no closed section at this centre; move the centre inside the part")
    if winding(pts, c) < 0:
        pts = pts[::-1]
    k = max(range(len(pts)), key=lambda i: (pts[i] - c).dot(u))
    pts = pts[k:] + pts[:k]
    return _resample(pts, n, closed=True)


def add_ring(obj, points, closed=True):
    """Append vertices (and edges between them) to the cage mesh. Returns vertex indices."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    vs = [bm.verts.new(Vector(p)) for p in points]
    rng = range(len(vs)) if closed else range(len(vs) - 1)
    for i in rng:
        bm.edges.new((vs[i], vs[(i + 1) % len(vs)]))
    bm.verts.index_update()
    idx = [v.index for v in vs]
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return idx


def _loop_edges(bm, idx, closed=True):
    bm.verts.ensure_lookup_table()
    es = []
    rng = range(len(idx)) if closed else range(len(idx) - 1)
    for i in rng:
        a, b = bm.verts[idx[i]], bm.verts[idx[(i + 1) % len(idx)]]
        e = bm.edges.get((a, b))
        if e is None:
            raise ValueError(f"vertices {idx[i]} and {idx[(i + 1) % len(idx)]} are not connected")
        es.append(e)
    return es


def bridge(obj, loop_a, loop_b, align=True):
    """Quad strip between two closed vertex loops of EQUAL count (Kaspar: count and match
    before connecting). align=True picks the cyclic shift and direction of loop_b that
    minimises total edge length, so loops built independently connect without a twist.
    Returns the number of faces created."""
    if len(loop_a) != len(loop_b):
        raise ValueError(f"ring counts differ ({len(loop_a)} vs {len(loop_b)}): add or remove "
                         "loops on one side first, do not let bridge make triangles")
    me = obj.data
    n = len(loop_a)
    lb = list(loop_b)
    if align:
        A = [me.vertices[i].co.copy() for i in loop_a]
        best = None
        for cand in (lb, lb[::-1]):
            B = [me.vertices[i].co.copy() for i in cand]
            for sft in range(n):
                cost = sum((A[i] - B[(i + sft) % n]).length for i in range(n))
                if best is None or cost < best[0]:
                    best = (cost, cand[sft:] + cand[:sft])
        lb = best[1]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    faces = []
    for i in range(n):
        q = [bm.verts[loop_a[i]], bm.verts[loop_a[(i + 1) % n]],
             bm.verts[lb[(i + 1) % n]], bm.verts[lb[i]]]
        faces.append(bm.faces.new(q))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(faces)


def joint_stations(start, joint, end, n_before=1, n_after=1, spacing=None):
    """Stations for a limb segment start > joint > end with Kaspar's three loops over the
    joint (centre plus one each side, Live #4 [00:08:01], Live #5 [01:37:48]).
    spacing defaults to 12% of the shorter segment. Returns a list of Vectors."""
    a, j, b = Vector(start), Vector(joint), Vector(end)
    sp = spacing or 0.12 * min((j - a).length, (b - j).length)
    da, db = (j - a).normalized(), (b - j).normalized()
    out = [a]
    for k in range(1, n_before + 1):
        out.append(a.lerp(j - da * sp, k / (n_before + 1)))
    out += [j - da * sp, j, j + db * sp]
    for k in range(1, n_after + 1):
        out.append((j + db * sp).lerp(b, k / (n_after + 1)))
    out.append(b)
    return out


def tube(obj, target, stations, n=8, start_dir=(0, 0, 1), first_loop=None):
    """Build a quad tube through the target along `stations` (rings from cross sections,
    bridged in order). Returns the list of ring vertex-index lists (first/last are open
    boundaries you can cap with grid_fill or connect to another part).
    first_loop: an existing boundary loop of `obj` (a socket cut with cut_region) used as
    the first ring; n is then forced to its vertex count and stations[0] is ignored."""
    st = [Vector(s) for s in stations]
    rings = []
    prev_u = Vector(start_dir)
    if first_loop is not None:
        n = len(first_loop)
        rings.append(list(first_loop))
        c0 = sum((obj.data.vertices[i].co for i in first_loop), Vector()) / n
        prev_u = obj.data.vertices[first_loop[0]].co - c0
        st[0] = c0
    for i, c in enumerate(st):
        if first_loop is not None and i == 0:
            continue
        a = st[max(i - 1, 0)]
        b = st[min(i + 1, len(st) - 1)]
        nrm = (b - a).normalized()
        pts = ring(target, c, nrm, n, start_dir=prev_u)
        rings.append(add_ring(obj, pts))
        prev_u = pts[0] - c
    for i in range(len(rings) - 1):
        bridge(obj, rings[i], rings[i + 1])
    return rings


def boundary_loops(obj):
    """Ordered vertex-index loops of every open boundary (hole, cut, part border)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    todo = {e for e in bm.edges if e.is_boundary}
    loops = []
    while todo:
        e = todo.pop()
        a, b = e.verts
        chain = [a.index, b.index]
        cur = b
        while True:
            nxt = [x for x in cur.link_edges if x in todo]
            if not nxt:
                break
            x = nxt[0]
            todo.remove(x)
            cur = x.other_vert(cur)
            if cur.index == chain[0]:
                break
            chain.append(cur.index)
        loops.append(chain)
    bm.free()
    return sorted(loops, key=len, reverse=True)


def weld_loops(obj, loop_a, loop_b):
    """Merge two boundary loops with equal counts into one (Kaspar's Bridge Edge Loops,
    then slide one loop into the other with Auto Merge). Pairs vertices by nearest
    position around the loop. Returns the number of merged vertices."""
    if len(loop_a) != len(loop_b):
        raise ValueError(f"counts differ ({len(loop_a)} vs {len(loop_b)})")
    me = obj.data
    A = [me.vertices[i].co.copy() for i in loop_a]
    n = len(A)
    best = None
    for rev in (False, True):
        bb = list(reversed(loop_b)) if rev else list(loop_b)
        BB = [me.vertices[i].co for i in bb]
        for s in range(n):
            cost = sum((A[i] - BB[(i + s) % n]).length for i in range(n))
            if best is None or cost < best[0]:
                best = (cost, bb, s)
    _, bb, s = best
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    targetmap = {}
    for i in range(n):
        va, vb = bm.verts[loop_a[i]], bm.verts[bb[(i + s) % n]]
        mid = (va.co + vb.co) / 2
        va.co = mid
        targetmap[vb] = va
    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return n


def grid_fill(obj, loop, span=None, offset=0, target=None):
    """Fill a closed boundary loop with a quad grid (Edit Mode Grid Fill, headless-safe).

    Needs an EVEN vertex count: an odd loop "finishes" with zero faces (silent failure in
    5.2.1), so this raises instead. Dikko and Kenny count before every fill.
    target: project the new interior vertices onto it (a cap that follows a tip or dome).
    Returns the number of faces created.
    """
    if len(loop) % 2:
        raise ValueError(f"grid fill needs an even loop, got {len(loop)}: add or dissolve one vertex")
    _object_mode()
    before = len(obj.data.polygons)
    nv0 = len(obj.data.vertices)
    vl = bpy.context.view_layer
    prev_active = vl.objects.active
    vl.objects.active = obj
    obj.select_set(True)
    with _ctx(obj):
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            v.select = False
        for e in bm.edges:
            e.select = False
        for f in bm.faces:
            f.select = False
        for e in _loop_edges(bm, loop):
            e.select = True
        bm.select_flush_mode()
        bmesh.update_edit_mesh(obj.data)
        kw = {"offset": offset}
        if span:
            kw["span"] = span
        bpy.ops.mesh.fill_grid(**kw)
        bpy.ops.object.mode_set(mode="OBJECT")
    if prev_active is not None and prev_active is not obj:
        vl.objects.active = prev_active
    made = len(obj.data.polygons) - before
    if made <= 0:
        raise RuntimeError("grid fill created no faces (loop not closed or shape too irregular)")
    if target is not None and len(obj.data.vertices) > nv0:
        project(obj, target, indices=range(nv0, len(obj.data.vertices)))
    return made


# --------------------------------------------------------------------------------------
# auto start: QuadriFlow
# --------------------------------------------------------------------------------------
def density_warp(co, center, radius, factor):
    """Monotone radial space warp p -> c + d * g(|d|), g(r) = 1 + (factor - 1) / (1 + (r/radius)^4):
    linear scale `factor` near the centre, identity far away. Raises if not invertible
    (factor above about 2.7). co: (n, 3) array. Returns the warped array."""
    c = np.asarray(center, float)
    s, R0 = float(factor), float(radius)
    rr = np.linspace(0, 8 * R0, 4000)
    f = rr * (1 + (s - 1) / (1 + (rr / R0) ** 4))
    if (np.diff(f) <= 0).any():
        raise ValueError(f"density factor {factor} makes the warp fold; use a factor <= 2.5")
    d = np.asarray(co, float) - c
    r = np.linalg.norm(d, axis=1)
    return c + d * (1 + (s - 1) / (1 + (r / R0) ** 4))[:, None]


def density_unwarp(co, center, radius, factor):
    """Inverse of density_warp (bisection on the radius)."""
    c = np.asarray(center, float)
    s, R0 = float(factor), float(radius)
    d = np.asarray(co, float) - c
    rp = np.linalg.norm(d, axis=1)
    lo, hi = np.zeros_like(rp), rp / min(1.0, s) + 1e-12
    for _ in range(64):
        mid = (lo + hi) / 2
        f = mid * (1 + (s - 1) / (1 + (mid / R0) ** 4))
        lo = np.where(f < rp, mid, lo)
        hi = np.where(f >= rp, mid, hi)
    r = (lo + hi) / 2
    return c + d * np.where(rp > 1e-12, r / np.maximum(rp, 1e-12), 1.0)[:, None]


def quadriflow(target, faces, symmetry=False, preserve_sharp=False, preserve_boundary=True,
               seed=0, voxel=None, name=None, tolerance=0.06, density=None):
    """QuadriFlow remesh of a COPY of the target at about `faces` quads. Returns (obj, info).

    Fixes needed headless in 5.2.1:
    - QuadriFlow refuses meshes with edges shorter than ~1e-4 (absolute) as "not manifold";
      a 0.8 m sculpt with 186k faces fails. The copy is scaled to ~10 units, remeshed and
      scaled back (face-count target is scale invariant).
    - Non-manifold input (AI meshes, scans): falls back to a voxel remesh first
      (voxel size = `voxel` or 1/250 of the size), which also closes holes.
    - `use_mesh_symmetry` DEFAULTS TO TRUE in the operator: here it is off unless asked.
      Only enable it when the mesh is symmetric about its LOCAL x = 0.
    - It lands 10 to 20 % under `target_faces`; the target is corrected and rerun (up to
      twice) until within `tolerance`.
    - It closes small holes (the sculpt's 144-edge eye holes vanished) and does not keep
      boundary vertex counts: carve holes back with carve_rings.
    QuadriFlow output: all quads, even density, no feature loops (no rings around eyes or
    mouth, loops wander). Treat it as a start, not a finished deforming character.
    density: [(center, radius, factor), ...] local space. QuadriFlow is uniform; this
      remeshes a copy inflated around each centre (density_warp, monotone and invertible),
      maps the result back and projects it onto the target, so edges near the centre come
      out about `factor` times shorter (sheep head, factor 1.8: 1.46x measured). The
      returned info has edge_ratio (mean edge length outside / inside the first radius).
    """
    _object_mode()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    obj = bpy.data.objects.new(name or f"{target.name}_qf", me)
    (target.users_collection[0] if target.users_collection else bpy.context.scene.collection).objects.link(obj)
    obj.matrix_world = target.matrix_world.copy()
    size = _local_size_of_mesh(me)
    s = 10.0 / size
    info = {"scale_trick": s, "voxel": None}

    def run(n):
        obj.data.transform(Matrix.Scale(s, 4))
        with _ctx(obj):
            r = bpy.ops.object.quadriflow_remesh(
                target_faces=int(n), use_mesh_symmetry=symmetry, use_preserve_sharp=preserve_sharp,
                use_preserve_boundary=preserve_boundary, smooth_normals=False, seed=seed, mode="FACES")
        obj.data.transform(Matrix.Scale(1.0 / s, 4))
        return r

    t = time.time()
    warps = [(np.asarray(c_, float), float(r_), float(f_)) for c_, r_, f_ in (density or [])]
    if warps:
        wco = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", wco)
        wco = wco.reshape(-1, 3)
        for c_, r_, f_ in warps:
            wco = density_warp(wco, c_, r_, f_)
        me.vertices.foreach_set("co", wco.ravel())
        me.update()
        s = 10.0 / _local_size_of_mesh(me)
        info["scale_trick"] = s
    if voxel:
        _voxel(obj, voxel)
        info["voxel"] = voxel
    src = obj.data.copy()
    r = run(int(faces))
    if r != {"FINISHED"}:
        vs = voxel or size / 250.0
        _voxel(obj, vs)
        src = obj.data.copy()
        info["voxel"] = vs
        r = run(int(faces))
    if r != {"FINISHED"}:
        raise RuntimeError(f"QuadriFlow failed: {info}")
    ask = int(faces)
    for _ in range(2):  # QuadriFlow lands 10 to 20 % under the target: correct once or twice
        got = len(obj.data.polygons)
        if abs(got - faces) <= tolerance * faces:
            break
        ask = int(ask * faces / max(got, 1))
        old = obj.data
        obj.data = src.copy()
        bpy.data.meshes.remove(old)
        run(ask)
    bpy.data.meshes.remove(src)
    if warps:
        qme = obj.data
        qco = np.empty(len(qme.vertices) * 3)
        qme.vertices.foreach_get("co", qco)
        qco = qco.reshape(-1, 3)
        for c_, r_, f_ in reversed(warps):
            qco = density_unwarp(qco, c_, r_, f_)
        qme.vertices.foreach_set("co", qco.ravel())
        qme.update()
        project(obj, target, method="nearest", keep_center=False)
        ed = np.empty(len(qme.edges) * 2, np.int64)
        qme.edges.foreach_get("vertices", ed)
        ed = ed.reshape(-1, 2)
        qco = np.empty(len(qme.vertices) * 3)
        qme.vertices.foreach_get("co", qco)
        qco = qco.reshape(-1, 3)
        mid = (qco[ed[:, 0]] + qco[ed[:, 1]]) / 2
        ln = np.linalg.norm(qco[ed[:, 0]] - qco[ed[:, 1]], axis=1)
        near = np.linalg.norm(mid - warps[0][0], axis=1) < 0.8 * warps[0][1]
        if near.any() and (~near).any():
            info["edge_ratio"] = round(float(ln[~near].mean() / ln[near].mean()), 3)
    info.update(status=list(r)[0], seconds=round(time.time() - t, 1), faces=len(obj.data.polygons),
                asked=ask)
    return obj, info


def _voxel(obj, voxel_size):
    obj.data.remesh_voxel_size = voxel_size
    obj.data.use_remesh_preserve_volume = True
    obj.data.use_remesh_fix_poles = True
    with _ctx(obj):
        bpy.ops.object.voxel_remesh()


# --------------------------------------------------------------------------------------
# sockets and islands: cut a region of an auto-remesh, rebuild it with planned loops
# --------------------------------------------------------------------------------------
PROTECT = "bx_keep"   # INT face attribute: faces built by carve_rings / carve_band / socket_tube


def _protect_from(obj, first_face, name=PROTECT):
    """Flag faces [first_face:] (just built) so later cuts leave them alone."""
    me = obj.data
    a = me.attributes.get(name)
    if a is None:
        a = me.attributes.new(name, "INT", "FACE")
    vals = np.zeros(len(me.polygons), np.int32)
    a.data.foreach_get("value", vals)
    vals[first_face:] = 1
    a.data.foreach_set("value", vals)


def _cut(obj, seed, inside, guard=True, protect=PROTECT, keep_islands=False, want_deleted=False,
         oriented=False, force=None):
    """Delete faces satisfying inside(center) (flood from the face nearest `seed`, or every
    such face when seed is None), never faces flagged by the `protect` attribute. Returns
    (new boundary loops, pre-cut BVH or None, deleted-face mask of the pre-cut mesh or None).
    oriented=True: inside(center, normal) receives the face normal too. force (with seed None):
    face indices always cut, and the cut grows from them only (a connected region).
    Every border vertex where the cut staircases across the base grid (1 or 3 of its 4 faces
    cut) becomes a 3- or 5-pole once bridged: on the sheep, cut borders carried about half of
    all poles. Smoothing the selection (fill notches, drop teeth) was tried and made it worse."""
    me = obj.data

    def key(lp):   # by position: vertex indices shift when the cut deletes vertices
        return frozenset(tuple(round(x, 6) for x in me.vertices[i].co) for i in lp)
    before = {key(lp) for lp in boundary_loops(obj)}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    lay = bm.faces.layers.int.get(protect) if protect else None

    def ok(f):
        return lay is None or not f[lay]

    def ins(f):
        return inside(f.calc_center_median(), f.normal) if oriented else inside(f.calc_center_median())
    if seed is None and force:
        # grow from the forced faces only: nothing disconnected from them can join the cut
        sel = {bm.faces[i] for i in force if i < len(bm.faces) and ok(bm.faces[i])}
        stack = list(sel)
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in sel and ok(g) and ins(g):
                        sel.add(g)
                        stack.append(g)
    elif seed is None:
        sel = {f for f in bm.faces if ok(f) and ins(f)}
    else:
        c = Vector(seed)
        cand = [f for f in bm.faces if ok(f)]
        start = min(cand, key=lambda f: (f.calc_center_median() - c).length)
        sel = {start}
        stack = [start]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in sel and ok(g) and ins(g):
                        sel.add(g)
                        stack.append(g)
    if guard:
        # no border vertex may keep 5+ edges (a new spoke would make it a 6-pole). Such a
        # vertex is a pole with only 1 or 2 of its faces in the cut: shrink the cut away from
        # it (growing over it instead runs away across the base's poles); grow only when a
        # forced face is involved and growth is possible (not blocked by protected faces)
        forced = {bm.faces[i] for i in (force or []) if i < len(bm.faces)}
        for _ in range(60):
            grow, shrink = set(), set()
            for f in sel:
                for v in f.verts:
                    kept = [e for e in v.link_edges if any(g not in sel for g in e.link_faces)]
                    if len(kept) >= 5 or (v.is_boundary and len(kept) >= 4):
                        mine = [g for g in v.link_faces if g in sel]
                        free = [g for g in v.link_faces if g not in sel and ok(g)]
                        if any(g in forced for g in mine) and free:
                            grow.update(free)
                        else:
                            shrink.update(mine)
            if not grow and not shrink:
                break
            sel = (sel | grow) - shrink
    if True:
        rest = set(bm.faces) - sel
        comps, seen = [], set()
        for f in rest:
            if f in seen:
                continue
            comp, st = [f], [f]
            seen.add(f)
            while st:
                x = st.pop()
                for e in x.edges:
                    for g in e.link_faces:
                        if g in rest and g not in seen:
                            seen.add(g)
                            comp.append(g)
                            st.append(g)
            comps.append(comp)
        comps.sort(key=len, reverse=True)
        # without keep_islands every enclosed piece under 5 % goes with the cut (one clean
        # border); with it (bands) only stranded scraps of 1 to 3 faces go, the enclosed
        # interior (the face inside a face-frame band, a small nose-and-mouth patch) stays
        small = 4 if keep_islands else 0.05 * len(bm.faces)
        for comp in comps[1:]:
            if len(comp) < max(small, 1) and all(ok(f) for f in comp):
                sel.update(comp)
    bvh, deleted = None, None
    if want_deleted:
        bvh = BVHTree.FromBMesh(bm)
        deleted = np.zeros(len(bm.faces), bool)
        deleted[[f.index for f in sel]] = True
    bmesh.ops.delete(bm, geom=list(sel), context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bm.to_mesh(me)
    bm.free()
    me.update()
    me = obj.data
    new = [lp for lp in boundary_loops(obj) if key(lp) not in before]
    return new, bvh, deleted


def cut_region(obj, seed, inside, guard=True, protect=PROTECT):
    """Delete the faces connected to `seed` whose centres satisfy inside(point) and return
    the ordered border loop (vertex indices) around the hole.

    The socket step of the hybrid method: cut the part of an auto-remesh that needs
    planned topology (eye, mouth, an ear or limb that QuadriFlow tore), then rebuild it
    with carve_rings, socket_tube or tube(first_loop=border). guard grows the cut so no
    border vertex keeps 5+ edges (it would become a 6-pole once a new edge is attached).
    Small enclosed islands are removed with the cut so there is one clean border. Faces
    flagged by the `protect` attribute (built by earlier carves) are never cut.

    PARITY: an all-quad mesh has an even total of boundary edges, so a cut border is even
    ONLY if the cut contains no odd boundary. QuadriFlow closes eye holes into 3-edge slits:
    a cut around one slit then has an odd border (the sheep gave 47 and 45) and no all-quad
    annulus can change ring parity. Fix it before carving: parity_strip(obj, slit_a, slit_b).
    """
    c = Vector(seed)
    new, _, _ = _cut(obj, seed, inside, guard=guard, protect=protect)
    me = obj.data

    def lcenter(lp):
        return sum((me.vertices[i].co for i in lp), Vector()) / len(lp)
    loops = new or boundary_loops(obj)
    return min(loops, key=lambda lp: (lcenter(lp) - c).length)


def parity_strip(obj, loop_a, loop_b, max_steps=2000):
    """Loop-cut the shortest quad strip (edge ring) that runs from boundary loop A to
    boundary loop B: +1 vertex on both loops, all quads kept. Odd boundaries come in pairs
    on an all-quad mesh (the eye slits QuadriFlow leaves: 3 and 3 edges become 4 and 4),
    so pair them up with this BEFORE cutting islands around them. Returns the number of
    edges cut (0 if no strip connects them)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    A, B = set(loop_a), set(loop_b)

    def on(e, S):
        return e.is_boundary and e.verts[0].index in S and e.verts[1].index in S
    best = None
    for e0 in [e for e in bm.edges if on(e, A)]:
        ring_e, e, f, ok = [e0], e0, e0.link_faces[0], False
        seen = {e0}
        for _ in range(max_steps):
            if len(f.verts) != 4:
                break
            lp = next(l for l in f.loops if l.edge is e)
            e = lp.link_loop_next.link_loop_next.edge
            if e in seen:
                break
            seen.add(e)
            ring_e.append(e)
            if e.is_boundary:
                ok = on(e, B)
                break
            f = next(g for g in e.link_faces if g is not f)
        if ok and (best is None or len(ring_e) < len(best)):
            best = ring_e
    if best is None:
        bm.free()
        return 0
    n = len(best)
    bmesh.ops.subdivide_edges(bm, edges=best, cuts=1, use_grid_fill=False)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return n


def _orient_ccw(pts, c, nrm):
    """Return pts ordered counter-clockwise around nrm (seen from the normal side)."""
    u = nrm.orthogonal().normalized()
    w = nrm.cross(u)
    ang = [math.atan2((p - c).dot(w), (p - c).dot(u)) for p in pts]
    wind = sum(((ang[(i + 1) % len(ang)] - ang[i] + math.pi) % (2 * math.pi)) - math.pi
               for i in range(len(ang)))
    return (list(pts), False) if wind >= 0 else (list(pts)[::-1], True)


def _unit_edges(m, k, avoid=()):
    """k reduction units on the edges of an m-vertex ring (edge j = vertices j, j+1),
    spread as evenly as possible, never on adjacent edges (a shared vertex would become a
    6-pole) and never touching `avoid` vertices. Returns a sorted list of edge indices;
    raises ValueError when impossible (e.g. exactly 2:1 with protected corners)."""
    if k == 0:
        return []
    if m < 2 * k:
        raise ValueError(f"cannot fit {k} reduction units on a {m}-vertex ring (needs m >= 2k)")
    av = set(avoid or ())
    allowed = [j for j in range(m) if j not in av and (j + 1) % m not in av]
    # gap 3 leaves two plain edges between units: their 5-poles are not adjacent (Kaspar:
    # separate adjacent 5-poles); gap 2 (one plain edge) only when the ring is too short
    for gap in ((3, 2) if m >= 3 * k else (2,)):
        for off in sorted(range(m), key=lambda o: min(o, m - o)):
            chosen = []
            for u in range(k):
                ideal = (int(math.floor((u + 0.5) * m / k)) + off) % m
                for dj in sorted(range(-(m // 2), m // 2 + 1), key=abs):
                    j = (ideal + dj) % m
                    if j in allowed and all(min((j - c) % m, (c - j) % m) >= gap for c in chosen):
                        chosen.append(j)
                        break
                else:
                    break
            if len(chosen) == k:
                return sorted(chosen)
    raise ValueError(f"no placement of {k} units on {m} vertices avoids {sorted(av)}: add an "
                     "intermediate ring (_mid_count) or relax `avoid`")


def _strip_ok(n_outer, n_inner, corner_inner=False):
    """Can one reduction strip join rings of these counts (poles off the inner ring's
    corners at 0 and n_inner // 2 when corner_inner)?"""
    if n_outer == n_inner:
        return True
    if (n_outer - n_inner) % 2 or max(n_outer, n_inner) > 2 * min(n_outer, n_inner):
        return False
    if n_inner > n_outer:
        return True                     # poles land on the outer (smaller) ring
    try:
        _unit_edges(n_inner, (n_outer - n_inner) // 2,
                    {0, n_inner // 2} if corner_inner else ())
        return True
    except ValueError:
        return False


def _mid_count(n, m):
    """An intermediate ring count between n and m that one reduction strip can reach from
    both sides (ratio <= 2, same parity as both)."""
    lo, hi = min(n, m), max(n, m)
    g = math.sqrt(lo * hi)
    cands = [x for x in range(int(math.ceil(hi / 2)), 2 * lo + 1) if (x - n) % 2 == 0 and (x - m) % 2 == 0]
    if not cands:
        raise ValueError(f"no intermediate count between {n} and {m} (parity differs?)")
    return min(cands, key=lambda x: abs(x - g))


def _count_path(n, m, corners=False, max_steps=5):
    """Shortest chain of ring counts n -> ... -> m in which every strip is feasible
    (_strip_ok); ties broken toward an even (geometric) progression. Returns [.., m]."""
    if _strip_ok(n, m, corners):
        return [m]
    lo, hi = max(4, min(n, m) // 2), 2 * max(n, m)
    ok_count = [x for x in range(lo, hi + 1) if (x - n) % 2 == 0 and (not corners or x % 2 == 0)]
    layer, parent = [n], {n: None}
    for _ in range(max_steps):
        nxt = []
        for a in layer:
            for x in ok_count:
                if x not in parent and _strip_ok(a, x, corners):
                    parent[x] = a
                    nxt.append(x)
        if any(_strip_ok(x, m, corners) for x in nxt):
            ends = [x for x in nxt if _strip_ok(x, m, corners)]
            best = None
            for e in ends:
                chain = [e]
                while parent[chain[-1]] != n:
                    chain.append(parent[chain[-1]])
                chain = chain[::-1] + [m]
                seq = [n] + chain
                cost = sum(abs(math.log(seq[i + 1] / seq[i]) - math.log(m / n) / (len(seq) - 1))
                           for i in range(len(seq) - 1))
                if best is None or cost < best[0]:
                    best = (cost, chain)
            return best[1]
        layer = nxt
    raise ValueError(f"no chain of feasible reduction strips joins {n} to {m}")


def bridge_reduce(obj, loop_a, loop_b, target=None, avoid=None):
    """Quad strip between two closed loops of DIFFERENT counts (Lampel's 3-to-1 junction,
    repeated): the larger count N may be at most twice the smaller M, and N - M must be
    even (all-quad parity). Each unit turns 3 edges into 1 with two 3-poles inside the strip
    and two 5-poles on the smaller loop; units never touch each other (no 6-poles) and never
    touch the smaller loop's `avoid` vertex indices (e.g. lid or lip corners). The larger
    loop's rotation and direction are chosen for the shortest spokes. Equal counts fall back
    to bridge(). target: project the new mid-strip vertices onto it.
    Returns dict(faces, units, poles=[vertex indices of the unit 3- and 5-poles])."""
    na, nb = len(loop_a), len(loop_b)
    if na == nb:
        return {"faces": bridge(obj, loop_a, loop_b), "units": 0, "poles": []}
    big, small = (list(loop_a), list(loop_b)) if na > nb else (list(loop_b), list(loop_a))
    N, M = len(big), len(small)
    if (N - M) % 2:
        raise ValueError(f"ring counts {N} and {M} differ by an odd number: an all-quad strip "
                         "cannot connect them (run parity_strip on the odd boundaries first)")
    if N > 2 * M:
        raise ValueError(f"{N} to {M} is more than 2:1; add an intermediate ring "
                         f"(_mid_count gives {_mid_count(N, M)})")
    k = (N - M) // 2
    av = {small.index(v) for v in (avoid or []) if v in small}
    val = [0] * len(obj.data.vertices)          # unit endpoints get two new edges
    for e in obj.data.edges:
        val[e.vertices[0]] += 1
        val[e.vertices[1]] += 1
    av |= {j for j, v in enumerate(small) if val[v] >= 4}
    units = set(_unit_edges(M, k, av))
    cons = [3 if j in units else 1 for j in range(M)]
    A = [0]
    for j in range(M - 1):
        A.append(A[-1] + cons[j])
    me = obj.data
    B = [me.vertices[i].co.copy() for i in small]
    best = None
    for cand in (big, big[::-1]):
        P = [me.vertices[i].co.copy() for i in cand]
        for off in range(N):
            cost = sum((P[(off + A[j]) % N] - B[j]).length for j in range(M))
            if best is None or cost < best[0]:
                best = (cost, cand, off)
    _, cand, off = best
    a_of = [cand[(off + A[j]) % N] for j in range(M)]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bvh = target_bvh(target) if target is not None else None
    faces, poles = [], []
    vmap = {i: bm.verts[i] for i in set(big) | set(small)}   # fetch before adding verts

    def V(i):
        return vmap[i]
    for j in range(M):
        b0, b1 = V(small[j]), V(small[(j + 1) % M])
        if j not in units:
            a0 = V(a_of[j])
            a1 = V(cand[(off + A[j] + 1) % N])
            faces.append(bm.faces.new((a0, a1, b1, b0)))
            continue
        ai = [V(cand[(off + A[j] + s) % N]) for s in range(4)]
        p1 = (ai[1].co + (b0.co * 2 + b1.co) / 3) / 2
        p2 = (ai[2].co + (b0.co + b1.co * 2) / 3) / 2
        if bvh is not None:
            p1 = bvh.find_nearest(p1)[0] or p1
            p2 = bvh.find_nearest(p2)[0] or p2
        m1, m2 = bm.verts.new(p1), bm.verts.new(p2)
        faces += [bm.faces.new((ai[0], ai[1], m1, b0)), bm.faces.new((ai[1], ai[2], m2, m1)),
                  bm.faces.new((ai[2], ai[3], b1, m2)), bm.faces.new((m1, m2, b1, b0))]
        poles += [m1, m2, b0, b1]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    pole_idx = [v.index for v in poles]
    bm.to_mesh(me)
    bm.free()
    me.update()
    return {"faces": len(faces), "units": k, "poles": pole_idx}


def reduce_loop(obj, loop, count, points, target=None, avoid=None):
    """Grow a new ring of `count` vertices along the closed polyline `points` (e.g. an
    iso-contour next to the loop) and connect it to the existing boundary `loop` with
    reduction strips (one strip up to 2:1, an intermediate ring beyond). Returns the new
    ring's vertex indices. The way to set a ring count instead of inheriting it from a
    jagged cut border (eye 46 to 48 on the sheep, Kaspar's 18)."""
    n = len(loop)
    if (n - count) % 2:
        raise ValueError(f"parity: {n} -> {count} is odd; choose count {count - 1} or {count + 1}")
    pts = [Vector(p) for p in points]
    me = obj.data
    if max(n, count) > 2 * min(n, count):
        mid = _mid_count(n, count)
        src = [me.vertices[i].co.copy() for i in loop]
        a = _resample(src, mid, closed=True)
        b = _resample(pts, mid, closed=True)
        b, _ = _align_cyclic(a, b)
        mp = [x.lerp(y, 0.5) for x, y in zip(a, b)]
        if target is not None:
            mp = [nearest_point(target, p)[0] or p for p in mp]
        loop = reduce_loop(obj, loop, mid, mp, target=target)
    ring_idx = add_ring(obj, _resample(pts, count, closed=True))
    bridge_reduce(obj, loop, ring_idx, target=target, avoid=avoid)
    return ring_idx


def _align_cyclic(ref, pts):
    """Rotate/reverse pts (same count as ref) for the smallest summed distance to ref."""
    n = len(ref)
    best = None
    for cand in (list(pts), list(pts)[::-1]):
        for s in range(n):
            cost = sum((ref[i] - cand[(i + s) % n]).length for i in range(n))
            if best is None or cost < best[0]:
                best = (cost, cand[s:] + cand[:s])
    return best[1], best[0]


def _corner_resample(pts, c, nrm, ca, cb, m):
    """Closed contour -> m points counter-clockwise around nrm, index 0 at the contour point
    nearest corner `ca`, index m//2 at the point nearest `cb`: both halves get the same
    count (lid / lip parity by construction, Dikko 10/10)."""
    pts, _ = _orient_ccw([Vector(p) for p in pts], c, nrm)
    ia = min(range(len(pts)), key=lambda i: (pts[i] - ca).length)
    pts = pts[ia:] + pts[:ia]
    ib = min(range(1, len(pts)), key=lambda i: (pts[i] - cb).length)
    n_up = m // 2
    up = _resample(pts[:ib + 1], n_up + 1, closed=False)
    lo = _resample(pts[ib:] + [pts[0]], m - n_up + 1, closed=False)
    return up[:-1] + lo[:-1]


def _angle_corner(pts, c, u, w, theta):
    """Contour point whose angle around c (in the u, w plane) is closest to theta."""
    return min(pts, key=lambda p: abs(((math.atan2((p - c).dot(w), (p - c).dot(u)) - theta + math.pi)
                                       % (2 * math.pi)) - math.pi))


def _pick_count(n, count, even=False):
    """Ring count from `count`: an int (forced), a (lo, hi) range (keep the border's own count n
    when it falls inside: zero reductions, zero extra poles; else the nearest end), or None (n).
    The result keeps n's parity (all-quad strips) and is even when `even` (corner split)."""
    if count is None:
        return n
    if isinstance(count, (tuple, list)):
        lo, hi = int(count[0]), int(count[1])
        c = min(max(n, lo), hi)
        if (c - n) % 2 or (even and c % 2):
            for d in (1, -1, 2, -2):
                x = c + d
                if lo <= x <= hi and (x - n) % 2 == 0 and not (even and x % 2):
                    return x
        return c
    return int(count)


def carve_rings(obj, target, center, normal, radius, rings=3, inner=0.35, axis=(1, 0, 0),
                aspect=1.0, open_center=True, inner_points=None, corners=None, count=None,
                ring_mode="geodesic", inside=None, levels=None, slit=False, protect=PROTECT):
    """Replace the faces of `obj` around a landmark with concentric quad rings.

    The delta between an auto-remesh and expert topology is loops that close around the
    eyes and mouth (Grant Abbitt: auto retopo has "no edge flow around the eye or mouth";
    Kaspar, Dikko, Kenny: rings around eyes and mouth first).

    Region: faces connected to the landmark inside an ellipse (semi-axes radius and
    radius*aspect, long axis `axis`, plane normal to `normal`), or a custom inside(point)
    predicate (e.g. "nearest sculpt face is in the lip face sets"). Protected faces
    (earlier carves) are never cut. Inner ring: `inner_points` (the sculpt's eye hole, a
    face-set lip line) or a projected ellipse at `inner` x radius.

    corners=(a, b): the inner ring is split at the contour points nearest a and b and
      both halves get the same count (lid / lip parity by construction; Dikko 10/10,
      Kaspar, Kenny: top = bottom). Every ring is split the same way, by angle.
    rings: clean rings of `count` vertices, the inner ring included (Kaspar's sheep eye:
      about 5 around the socket).
    count: vertices per ring (even with corners), or a (lo, hi) range: the border's own count
      is kept when it falls inside (no reduction, no extra poles), else the nearest end.
      Default: the border's own count, which a dense QuadriFlow border sets too high (sheep
      eyes 46 to 48 on the E1 base; Kaspar used 18).
      With a count, one or two TRANSITION rings are added outside the clean rings: the
      reduction strips (bridge_reduce) put their poles there, in the eye mask where Dikko
      puts the eye poles, never on the corners, never on the clean rings. The border count
      and count must have the same parity.
    ring_mode 'geodesic' (default): intermediate rings are iso-contours of
      t = d_in / (d_in + d_out), geodesic distances on the sculpt to the inner contour and
      to the island border, so rings follow overhangs and rolls (the hanging upper lip:
      straight lerps skipped it; coverage p95 1.69 % -> 1.14 % on the sheep). 'lerp': the
      old straight interpolation plus nearest projection (fast, flat areas only).
    levels: t value of each ring between border and inner ring, outer to inner, transition
      rings first (default: transition rings 0.12 apart from the border, clean rings evenly
      inside): bunch three levels to put a crease ring between two hugging rings (Kaspar).
    slit=True (needs corners): weld the upper half of the inner ring onto the lower half: a
      closed mouth line whose two corners are 2-poles, Kaspar's construction that turns the
      upper-lip loop into the lower lip so every ring circles the mouth; rip it (build
      with slit=False) for the mouth interior. The spokes leave the rings at the island
      border, where Dikko's eye-mask poles sit.
    open_center=False grid fills the inner ring.
    Returns dict(border, count, rings=[border, transition..., clean..., inner], hole,
    transition (number of transition rings), lerp_fallback_levels (levels where no closed
    geodesic contour existed, e.g. a protected band clips the island: check the render),
    sides, units).
    """
    c = Vector(center)
    nrm = Vector(normal).normalized()
    if corners is not None:
        ca, cb = Vector(corners[0]), Vector(corners[1])
        u = (ca - c) - nrm * (ca - c).dot(nrm)
    else:
        u = Vector(axis) - nrm * Vector(axis).dot(nrm)
    u.normalize()
    w = nrm.cross(u)
    ry = radius * aspect

    def ellipse(p):
        d = p - c
        if abs(d.dot(nrm)) > 1.5 * max(radius, ry):
            return False
        return (d.dot(u) / radius) ** 2 + (d.dot(w) / ry) ** 2 <= 1.0
    pred = inside or ellipse
    geo = ring_mode == "geodesic" and rings > 1
    new, bvh_pre, deleted = _cut(obj, c, pred, protect=protect, want_deleted=geo)
    me = obj.data

    def lcenter(lp):
        return sum((me.vertices[i].co for i in lp), Vector()) / len(lp)
    border = min(new or boundary_loops(obj), key=lambda lp: (lcenter(lp) - c).length)
    first_face = len(me.polygons)
    N = len(border)
    bpts = [me.vertices[i].co.copy() for i in border]
    bpts, rev = _orient_ccw(bpts, c, nrm)
    if rev:
        border = border[::-1]
    if inner_points:
        ip = [Vector(p) for p in inner_points]
    else:
        ip = []
        for k in range(180):
            ang = 2 * math.pi * k / 180
            q = c + (u * math.cos(ang) * radius + w * math.sin(ang) * ry) * inner
            hit = surface_point(target, q + nrm * radius * 2, -nrm)
            ip.append(hit if hit is not None else nearest_point(target, q)[0])
    ip, _ = _orient_ccw(ip, c, nrm)
    M = _pick_count(N, count, even=corners is not None)
    if corners is not None and M % 2:
        raise ValueError(f"corner parity needs an even ring count, got {M} (border {N}): "
                         "pass an even count, or pair odd boundaries with parity_strip first")
    if (N - M) % 2:
        raise ValueError(f"parity: border {N} and count {M} differ by an odd number; use count "
                         f"{M - 1} or {M + 1}, or run parity_strip on the odd boundaries first")
    th_a = th_b = None
    if corners is not None:
        th_a = math.atan2((ca - c).dot(w), (ca - c).dot(u))
        th_b = math.atan2((cb - c).dot(w), (cb - c).dot(u))

    def resample_ring(pts, m, is_inner=False):
        if corners is not None:
            a_ = min(pts, key=lambda p: (p - ca).length) if is_inner else _angle_corner(pts, c, u, w, th_a)
            b_ = min(pts, key=lambda p: (p - cb).length) if is_inner else _angle_corner(pts, c, u, w, th_b)
            return _corner_resample(pts, c, nrm, a_, b_, m)
        pts, _ = _orient_ccw(pts, c, nrm)
        k0 = max(range(len(pts)), key=lambda i: (pts[i] - c).normalized().dot(u))
        return _resample(pts[k0:] + pts[:k0], m, closed=True)
    cor = corners is not None
    path = _count_path(N, M, cor)                # N -> ... -> M, feasible strips only
    seq = path[:-1]                              # transition rings before the clean ones
    if (seq[-1] if seq else N) > M:
        seq.append(M)                            # receives the 5-poles of the last strip
    counts = seq + [M] * rings
    T = len(counts)
    nt = len(seq)
    if levels:
        lv = list(levels)
    elif nt:
        # transition rings packed near the border (their poles stay at the island edge, in
        # the eye mask), clean rings evenly spaced inside
        tc = 1.0 - 0.12 * (nt + 1)
        lv = [1.0 - 0.12 * (k + 1) for k in range(nt)] + [tc * (rings - 1 - j) / (rings - 1)
                                                          for j in range(rings - 1)]
    else:
        lv = [1.0 - r / T for r in range(1, T)]
    if len(lv) != T - 1:
        raise ValueError(f"levels needs {T - 1} values ({len(seq)} transition + {rings} rings - 1)")
    ring_pts, fallback = [], []
    if geo:
        tt = _topo(target)
        L_in = sum((ip[i] - ip[i - 1]).length for i in range(len(ip)))
        L_b = sum((bpts[i] - bpts[i - 1]).length for i in range(len(bpts)))
        wall = surface_seeds(target, ip, radius=tt["edge_p95"])    # seals the inside of the inner contour
        seeds_out = surface_seeds(target, bpts)
        ext = 3.0 * max((p - c).length for p in bpts)
        block = np.zeros(len(tt["co"]), bool)
        block[wall] = True
        d_in = geodesic(target, surface_seeds(target, ip), limit=ext)
        d_out = geodesic(target, seeds_out, limit=ext, block=block)
        d_out[wall] = geodesic(target, seeds_out, limit=ext)[wall]  # only beyond the wall stays inf
        cand = np.nonzero(np.isfinite(d_in) & np.isfinite(d_out))[0]
        tf = np.full(len(tt["co"]), np.inf)
        for i in cand:
            hit = bvh_pre.find_nearest(Vector(tt["co"][i]))
            if hit[2] is not None and deleted[hit[2]]:
                tf[i] = d_in[i] / max(d_in[i] + d_out[i], 1e-12)
            else:
                tf[i] = 1.0 + d_out[i]      # outside the island: above every ring level
        for r, level in enumerate(lv):
            cs = [x for x in iso_contours(target, tf, level, close_gaps=0.25) if x[1] and len(x[0]) >= 4]
            if not cs:
                # the island is clipped (a protected band crosses it) or too thin here: fall back
                # to the straight ring for this level and report it
                fallback.append(round(level, 3))
                m = counts[r]
                a_ = _resample(bpts, m, closed=True)
                b_ = resample_ring(ip, m, is_inner=True)
                a_, _ = _align_cyclic(b_, a_)
                ring_pts.append([nearest_point(target, x.lerp(y, 1 - level))[0] or x.lerp(y, 1 - level)
                                 for x, y in zip(a_, b_)])
                continue
            L_exp = level * L_b + (1 - level) * L_in

            def score(x):
                cc = sum(x[0], Vector()) / len(x[0])
                return abs(math.log(max(x[2], 1e-9) / L_exp)) + (cc - c).length / max(radius, 1e-9)
            ring_pts.append(resample_ring(min(cs, key=score)[0], counts[r]))
    else:
        for r, level in enumerate(lv):
            m = counts[r]
            a_ = _resample(bpts, m, closed=True)
            b_ = resample_ring(ip, m, is_inner=True)
            a_, _ = _align_cyclic(b_, a_)
            ring_pts.append([nearest_point(target, x.lerp(y, 1 - level))[0] or x.lerp(y, 1 - level)
                             for x, y in zip(a_, b_)])
    ring_pts.append(resample_ring(ip, counts[-1], is_inner=True))
    all_rings = [border] + [add_ring(obj, pts) for pts in ring_pts]
    units = 0
    for r in range(len(all_rings) - 1):
        a_, b_ = all_rings[r], all_rings[r + 1]
        mb = len(b_)
        av = [b_[0], b_[mb // 2]] if corners is not None else None
        if len(a_) == len(b_):
            if r == 0:
                P = [me.vertices[i].co.copy() for i in a_]
                Q = [obj.data.vertices[i].co.copy() for i in b_]
                s = min(range(len(a_)), key=lambda s_: sum((P[(s_ + i) % len(a_)] - Q[i]).length
                                                             for i in range(len(a_))))
                a_ = a_[s:] + a_[:s]
            bridge(obj, a_, b_, align=False)
        else:
            units += bridge_reduce(obj, a_, b_, target=target, avoid=av)["units"]
    hole = all_rings[-1]
    if slit:
        if corners is None:
            raise ValueError("slit needs corners")
        m = len(hole)
        keep = [[me.vertices[i].co.copy() for i in rg] for rg in all_rings]
        keep[-1] = keep[-1][:m // 2 + 1]
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        tmap = {}
        for i in range(1, m // 2):
            va, vb = bm.verts[hole[i]], bm.verts[hole[m - i]]
            va.co = (va.co + vb.co) / 2
            keep[-1][i] = va.co.copy()
            tmap[vb] = va
        bmesh.ops.weld_verts(bm, targetmap=tmap)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        kd = KDTree(len(obj.data.vertices))
        for v in obj.data.vertices:
            kd.insert(v.co, v.index)
        kd.balance()
        all_rings = [[kd.find(p)[1] for p in rg] for rg in keep]
        hole = all_rings[-1]          # the slit: an open chain corner a ... corner b
    elif not open_center:
        grid_fill(obj, hole)
    if protect:
        _protect_from(obj, first_face, protect)
    return {"border": N, "count": M, "rings": all_rings, "hole": hole, "transition": len(seq),
            "lerp_fallback_levels": fallback,
            "sides": (M // 2, M - M // 2) if corners is not None else None, "units": units}


def carve_band(obj, target, curve, width=None, rings=1, count=None, protect=PROTECT, curve_verts=None,
               spacing=None):
    """Install closed edge loops along a surface curve through an auto-remesh: the map
    method's edge-flow and crease lines as real loops (face frame, nasolabial / muzzle loop,
    neck ring, a crease with its two hugging loops with rings=3, a joint loop on an
    auto-remeshed limb). The faces within width/2 (geodesic) of the curve are cut (protected
    faces excepted), which must leave exactly two new borders (an annulus; the width grows
    up to 3x when the band is narrower than a face and the cut breaks up); `rings` loops of
    `count` vertices follow the curve (offset copies `spacing` apart) and are joined to both
    borders with reduction strips, so the curve does not inherit the jagged cut.
    count: default from the curve length and the cut's edge length, with the parity both
    borders require (their counts must have the same parity).
    POLES: a reduction strip puts its 5-poles on the smaller-count ring, and a ring that
    carries poles is no longer an edge loop (loop select and loop walks stop at poles). The
    default count is the larger border's, so the poles land on the base side and every band
    ring is clean: rings=1 (default) is the edge-flow loop itself, exactly on the curve;
    rings=3 with a crease spacing is Kaspar's crease (one loop plus two hugging loops).
    spacing: distance between the band's rings. Default = the local edge length: an
      edge-flow loop (face frame, nasolabial, neck). Tight rings read as a crease after
      subdivision (Kaspar: "the closer they hug this edge the sharper the crease"): pass
      spacing about 0.3 x edge length only for a crease. Measured on the sheep: rings 3.5 mm
      apart on 12 mm faces left a visible ridge across the forehead.
    width: cut width; default and minimum (rings + 1) x spacing (two edges for one loop).
    curve_verts: target vertices along the curve (enclosing_contour(..., return_verts=True));
      without them the curve is mapped to 3D-nearest vertices, which jump onto a touching
      part (the sheep's ear lies on its cheek).
    Returns dict(loops=[ring vertex lists], count, borders=(na, nb), units, width)."""
    pts = [Vector(p) for p in curve]
    dense = _resample(pts, max(len(pts), 400), closed=True)
    # geodesic distance to the curve, so a part that is near in 3D but far on the surface
    # (a hoof raised to the chin, an ear lying on the cheek) is never cut
    tt = _topo(target)
    seeds = list(curve_verts) if curve_verts is not None else surface_seeds(target, dense)
    name = obj.data.name
    new, attempts = [], []
    # the faces the curve crosses (oriented: a face on an ear lying on the cheek is skipped):
    # the band grows from them, so it is one connected strip along the curve
    me0 = obj.data
    spacing_local = None if spacing is None else float(spacing)
    fc = np.empty(len(me0.polygons) * 3)
    me0.polygons.foreach_get("center", fc)
    fnrm = np.empty(len(me0.polygons) * 3)
    me0.polygons.foreach_get("normal", fnrm)
    fc, fnrm = fc.reshape(-1, 3), fnrm.reshape(-1, 3)
    kdf = KDTree(len(fc))
    for i, c in enumerate(fc):
        kdf.insert(c, i)
    kdf.balance()
    if curve_verts is not None:
        kdc = KDTree(len(seeds))
        for i, v in enumerate(seeds):
            kdc.insert(Vector(tt["co"][v]), i)
        kdc.balance()
    crossed = set()
    for p in dense:
        v = seeds[kdc.find(p)[1]] if curve_verts is not None else nearest_vertex(target, p)
        sn = Vector(tt["vn"][v])
        cand = kdf.find_n(p, 8)
        # no face agreeing in normal: skip the sample (the nearest face may sit on a touching
        # part, and one stray forced face leaves a hole in the cut)
        pick = next((i for _, i, _ in cand if sn.dot(Vector(fnrm[i])) > 0.2), None)
        if pick is not None:
            crossed.add(pick)
    if spacing_local is None:       # flow loop: ring spacing = edge length of the crossed faces
        el = [(me0.vertices[a].co - me0.vertices[b].co).length for f in crossed
              for a, b in zip(me0.polygons[f].vertices, list(me0.polygons[f].vertices[1:]) + [me0.polygons[f].vertices[0]])]
        spacing_local = sum(el) / max(len(el), 1)
    width = max(width or 0.0, (rings + 1) * spacing_local)
    d_curve = geodesic(target, seeds, limit=3 * width)
    for wtry in (width, 1.5 * width, 2.2 * width, 3.0 * width):
        backup = obj.data.copy()

        def inside(p, n, half=wtry / 2.0):
            return d_curve[nearest_vertex(target, p, n)] <= half
        new, _, _ = _cut(obj, None, inside, protect=protect, keep_islands=True, oriented=True, force=crossed)
        small = [lp for lp in new if len(lp) in (4, 6)]
        if len(new) - len(small) == 2 and small:
            # stranded 4- or 6-vertex holes next to the band: close them with quads
            for lp in small:
                if len(lp) == 4:
                    bm_ = bmesh.new()
                    bm_.from_mesh(obj.data)
                    bm_.verts.ensure_lookup_table()
                    bm_.faces.new([bm_.verts[i] for i in lp])
                    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces[:])
                    bm_.to_mesh(obj.data)
                    bm_.free()
                else:
                    grid_fill(obj, lp)
            new = [lp for lp in boundary_loops(obj) if len(lp) > 6 and
                   any(set(lp) == set(n) for n in new)]
        attempts.append((round(wtry, 4), sorted(len(lp) for lp in new)))
        # the two borders must not touch (a shared vertex would get a spoke from each side)
        if len(new) == 2 and not set(new[0]) & set(new[1]):
            bpy.data.meshes.remove(backup)
            width = wtry
            break
        cut_mesh = obj.data           # not an annulus (band narrower than a face): widen
        obj.data = backup
        bpy.data.meshes.remove(cut_mesh)
    obj.data.name = name
    if len(new) != 2:
        raise RuntimeError(f"band cut never left exactly 2 new borders (an annulus); attempts "
                           f"(width, border sizes): {attempts}. Move the curve off holes and "
                           "protected islands, or build this band before them")
    me = obj.data
    first_face = len(me.polygons)
    A, B = new
    na, nb = len(A), len(B)
    if (na - nb) % 2:
        raise ValueError(f"band borders {na} and {nb} have different parity: pair odd "
                         "boundaries with parity_strip first")
    lo = int(math.ceil(max(na, nb) / 2))
    hi = 2 * min(na, nb)
    if count is None:
        # the larger border count: both strips then put their poles on the base side (the
        # smaller loop), every band ring stays a clean loop, and the fewest units are used
        count = min(max(na, nb), 2 * min(na, nb))
    count = min(max(int(count), lo), hi)
    if (count - na) % 2:
        count = count + 1 if count + 1 <= min(hi, max(na, nb)) else count - 1
    if not lo <= count <= hi:
        raise ValueError(f"no band count fits borders {na} and {nb} (needs {lo} to {hi})")
    if rings < 2 and count != na and count != nb:
        raise ValueError("both sides reduce: use rings >= 2 (one ring would get 6-poles)")
    # the first ring takes the A-side poles when A is larger, the last ring the B-side poles
    # when B is larger: keep at least one ring between them clean
    base = _resample(dense, count, closed=True)
    bvh = target_bvh(target)
    kdb = KDTree(nb)
    for i, v in enumerate(B):
        kdb.insert(me.vertices[v].co, i)
    kdb.balance()
    step = spacing_local
    offs = [(r - (rings - 1) / 2) * step for r in range(rings)]
    ring_pts = [[] for _ in range(rings)]
    for i, p in enumerate(base):
        t = (base[(i + 1) % count] - base[i - 1]).normalized()
        n = bvh.find_nearest(p)[1] or Vector((0, 0, 1))
        side = n.cross(t).normalized()
        if kdb.find(p + side * step)[2] > kdb.find(p - side * step)[2]:
            side = -side
        for r, o in enumerate(offs):
            q = p + side * o
            ring_pts[r].append(bvh.find_nearest(q)[0] or q)
    loops = [add_ring(obj, rp) for rp in ring_pts]
    units = bridge_reduce(obj, A, loops[0], target=target)["units"]
    for r in range(rings - 1):
        bridge(obj, loops[r], loops[r + 1], align=True)
    units += bridge_reduce(obj, loops[-1], B, target=target)["units"]
    if protect:
        _protect_from(obj, first_face, protect)
    return {"loops": loops, "count": count, "borders": (na, nb), "units": units, "width": width,
            "spacing": round(step, 5)}


# --------------------------------------------------------------------------------------
# limbs from geodesic contours (no plane sections: they fold at bends)
# --------------------------------------------------------------------------------------
def limb_tip(target, verts, core_point):
    """The vertex of `verts` farthest (geodesic) from core_point: a hoof sole, an ear tip."""
    tt = _topo(target)
    core = tt["kd"].find(Vector(core_point))[1]
    d = geodesic(target, [core])
    verts = np.asarray(verts)
    return int(verts[np.argmax(np.where(np.isfinite(d[verts]), d[verts], -1))])


def limb_profile(target, tip, step=0.004, max_level=0.4, block=None, seed_radius=None,
                 slope_on=1.0, slope_peak=2.5, run=6, bend_deg=25.0):
    """Walk closed geodesic iso-contours from a limb tip toward the body, find the root and
    the joints.

    Contours of the geodesic distance from the tip never cross and follow bends, where
    plane sections fold. block: target vertices paths may not enter (the other ear or
    hoof, a touching tail); contours cut open by a blocked patch are closed by their chord.
    Root (works on caps): the contour length L rises steeply over the cap, stays nearly
    flat along the limb, then climbs for good where the contour slides onto the body. The
    root is the first level after the cap from which dL/dlevel stays above `slope_on` for
    `run` samples and peaks above `slope_peak` (a short bump such as an elbow does not
    qualify); if L dips to a local minimum just before (an ear's narrow base), that neck is
    the root. Joints: bends of the contour-centroid path above bend_deg over +-3 samples.
    Tested on the sheep: roots 0 to 2 cm from the levels a person read off the printed
    profiles (ears 0 and 0.2 cm, forelegs 0.4 and 1.6, hind legs 1.6 and 2.1).
    Returns dict(field, levels, contours, lengths, centers, root, root_index, cap_end, joints).
    """
    tt = _topo(target)
    co = tt["co"]
    r = seed_radius or 2.0 * tt["edge_p95"]
    seeds = [i for _, i, _ in tt["kd"].find_range(Vector(co[tip]), r)] or [tip]
    if block is not None:
        block = np.asarray(block, bool).copy()
        block[seeds] = False
    field = geodesic(target, seeds, limit=max_level + 3 * step, block=block)
    levels, conts, lens, cents = [], [], [], []
    prev, miss = None, 0
    lvl = step
    while lvl < max_level:
        cs = [x for x in iso_contours(target, field, lvl, close_gaps=0.3) if x[1] and len(x[0]) >= 6]
        if cs:
            if prev is None:
                P, _, L = min(cs, key=lambda x: x[2])
            else:
                P, _, L = min(cs, key=lambda x: (sum(x[0], Vector()) / len(x[0]) - prev).length)
            cc = sum(P, Vector()) / len(P)
            if prev is not None and (cc - prev).length > 4 * step + L / (2 * math.pi):
                break
            levels.append(lvl)
            conts.append(P)
            lens.append(L)
            cents.append(cc)
            prev, miss = cc, 0
        else:
            miss += 1
            if miss > 3:
                break
        lvl += step
    n = len(lens)
    Ls = np.array(lens)
    if n >= 3:
        Ls = np.convolve(np.pad(Ls, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    slope = np.gradient(Ls, step) if n >= 2 else np.zeros(n)
    cap_end = next((i for i in range(1, n) if slope[i] < slope_on), 0)
    root_i = None
    for i in range(cap_end + 1, n - run + 1):
        win = slope[i:i + run]
        if (win > slope_on).all() and win.max() > slope_peak:
            root_i = i
            break
    if root_i is None:
        root_i = n - 1
    lo = max(cap_end, root_i - 3)
    j = lo + int(np.argmin(Ls[lo:root_i + 1]))
    if lo < j < root_i and Ls[j - 1] > Ls[j]:
        root_i = j
    joints = []
    wdw = 3
    for i in range(max(wdw, cap_end), min(root_i, n - wdw)):
        a = cents[i] - cents[i - wdw]
        b = cents[i + wdw] - cents[i]
        if a.length > 1e-9 and b.length > 1e-9 and math.degrees(a.angle(b)) > bend_deg:
            joints.append(i)
    # keep one joint per bend (the sharpest sample of each run of consecutive indices)
    jl = []
    for i in joints:
        if jl and i - jl[-1][-1] <= 2:
            jl[-1].append(i)
        else:
            jl.append([i])

    def bend(i):
        return (cents[i] - cents[i - wdw]).angle(cents[i + wdw] - cents[i])
    joint_levels = [levels[max(g, key=bend)] for g in jl]
    return {"field": field, "levels": levels, "contours": conts, "lengths": lens, "centers": cents,
            "root": levels[root_i] if n else None, "root_index": root_i, "cap_end": cap_end,
            "joints": joint_levels, "tip": tip}


def socket_tube(obj, target, profile, spacing, count=None, root=None, cap=True, joints=True,
                protect=PROTECT):
    """Rebuild a limb, ear or tail of an auto-remesh from a limb_profile: cut a socket at
    the root (trial cuts until exactly one new hole with a usable border), rings on the
    geodesic contours every `spacing` from the root to the tip, 3 rings over each detected
    joint (Kaspar: 3 loops per joint), reduction strips from the socket border to `count`
    (legs 8 to 12 Kaspar, arms 8 to 14 Dikko; a (lo, hi) range keeps the socket's own count
    when it is inside: no reduction poles), a grid-filled cap on the tip.
    Returns dict(border, count, rings, levels, cap_faces, root)."""
    _topo(target)  # kept from the original: builds the cached topology and fails early on a bad target
    field = profile["field"]
    Lr = root if root is not None else profile["root"]
    lv_arr = np.array(profile["levels"])
    k_root = int(np.argmin(np.abs(lv_arr - Lr)))
    seed = profile["centers"][max(k_root - 2, 0)]
    step = (lv_arr[1] - lv_arr[0]) if len(lv_arr) > 1 else spacing / 3
    n_holes = len(boundary_loops(obj))
    mesh_name = obj.data.name
    chosen = None
    trials = []
    for dm in (0, -1, 1, -2, 2, -3, 3, -4, 4):
        lim = Lr + dm * step
        backup = obj.data.copy()

        def inside(p, n, lim=lim):
            return field[nearest_vertex(target, p, n)] < lim
        try:
            new, _, _ = _cut(obj, seed, inside, protect=protect, oriented=True)
            ok = len(new) == 1 and len(boundary_loops(obj)) == n_holes + 1 and len(new[0]) >= 6
            nb = len(new[0]) if new else 0
            if ok and isinstance(count, int) and (nb - count) % 2:
                ok = False
            trials.append((round(lim, 4), len(new), nb, len(boundary_loops(obj))))
        except Exception as ex:
            ok, nb = False, 0
            trials.append((round(lim, 4), repr(ex)[:80]))
        cut_mesh = obj.data
        obj.data = backup
        bpy.data.meshes.remove(cut_mesh)
        if ok:
            chosen = lim
            break
    obj.data.name = mesh_name
    if chosen is None:
        raise RuntimeError(f"no socket cut gave one clean hole (holes before {n_holes}; trials "
                           f"(level, new borders, border verts, holes after): {trials}); pass root=")

    def inside(p, n, lim=chosen):
        return field[nearest_vertex(target, p, n)] < lim
    new, _, _ = _cut(obj, seed, inside, protect=protect, oriented=True)
    border = new[0]
    first_face = len(obj.data.polygons)
    N = len(border)
    M = _pick_count(N, count, even=cap)
    levels = [x for x in np.arange(chosen - 0.5 * spacing, 0.6 * spacing, -spacing)]
    if joints:
        for j in profile["joints"]:
            if 0.8 * spacing < j < chosen - spacing:
                levels = [x for x in levels if abs(x - j) > 0.6 * spacing] + [j - 0.4 * spacing, j,
                                                                               j + 0.4 * spacing]
        levels = sorted(levels, reverse=True)
    rings = [border]
    counts = []
    prev_m = N
    for i, lvl in enumerate(levels):
        k = int(np.argmin(np.abs(lv_arr - lvl)))
        cs = [x for x in iso_contours(target, field, lvl, close_gaps=0.3) if x[1] and len(x[0]) >= 4]
        if not cs:
            continue
        P = min(cs, key=lambda x: (sum(x[0], Vector()) / len(x[0]) - profile["centers"][k]).length)[0]
        m = M if max(prev_m, M) <= 2 * min(prev_m, M) else _mid_count(prev_m, M)
        rings.append(add_ring(obj, _resample(P, m, closed=True)))
        counts.append(m)
        prev_m = m
    for a_, b_ in zip(rings[:-1], rings[1:]):
        if len(a_) == len(b_):
            bridge(obj, a_, b_, align=True)
        else:
            bridge_reduce(obj, a_, b_, target=target)
    cap_faces = 0
    if cap and len(rings[-1]) % 2 == 0:
        cap_faces = grid_fill(obj, rings[-1], target=target)
    if protect:
        _protect_from(obj, first_face, protect)
    return {"border": N, "count": M, "rings": rings, "ring_counts": counts, "levels": levels,
            "cap_faces": cap_faces, "root": chosen}


def find_loop_near(obj, points, tol):
    """The closed edge loop of obj that follows a curve (every loop vertex within tol of the
    curve and every curve sample within tol of the loop). Verifies that a planned line of
    the map (face frame, nasolabial, crease) exists as a real loop.
    Returns dict(verts, dev_max, indices) of the best match, or None."""
    pts = [Vector(p) for p in points]
    dense = _resample(pts, max(len(pts), 300), closed=True)
    kd = KDTree(len(dense))
    for i, p in enumerate(dense):
        kd.insert(p, i)
    kd.balance()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    best = None
    for edges, verts, closed in _all_loops(bm):
        if not closed or len(verts) < 4:
            continue
        dev = max(kd.find(v.co)[2] for v in verts)
        if dev > tol:
            continue
        lk = KDTree(len(verts))
        for i, v in enumerate(verts):
            lk.insert(v.co, i)
        lk.balance()
        el = max((verts[i].co - verts[i - 1].co).length for i in range(len(verts)))
        back = max(lk.find(p)[2] for p in dense)
        if back > tol + el / 2:
            continue
        if best is None or dev < best["dev_max"]:
            best = {"verts": len(verts), "dev_max": round(dev, 6), "indices": [v.index for v in verts]}
    bm.free()
    return best


# --------------------------------------------------------------------------------------
# volume: fit the subdivided surface
# --------------------------------------------------------------------------------------
def _limit_positions(obj):
    """Limit-surface position of every cage vertex, evaluated through Mirror (if any) and a
    temporary level-1 Subsurf with use_limit_surface (Blender keeps base vertices first)."""
    states = [(m, m.show_viewport) for m in obj.modifiers]
    for m, _ in states:
        m.show_viewport = m.type == "MIRROR" and m.show_viewport
    tmp = obj.modifiers.new("_bx_limit", "SUBSURF")
    tmp.levels = 1
    tmp.use_limit_surface = True
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(obj.data.vertices)
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
    finally:
        obj.modifiers.remove(tmp)
        for m, s in states:
            m.show_viewport = s
    return co.reshape(-1, 3)[:n]


def fit_subdiv(obj, target, iterations=6, step=0.6, smooth=0.6, pin_boundary=False, keep_center=None,
               clamp=0.25):
    """Vilem Duha (BCON23): place cage vertices so the SUBDIVIDED surface fits the sculpt.

    Snapping cage verts onto the sculpt makes the subdivided result shrink inside convex
    areas; a Shrinkwrap offset fixes convex areas and worsens cavities. This iterates:
    limit position of each vertex -> nearest sculpt point -> move the vertex by the
    (neighbour-smoothed) difference. Disables live Shrinkwrap modifiers (they would
    re-snap the cage): the fitted cage is meant to ship without them.
    clamp limits each vertex's total move to clamp x its mean edge length, so small
    features the cage is too coarse for do not crumple the cage (Kaspar: the character
    must still read with Subdivision off, it is what riggers and animators see).
    Defaults are the gentle setting measured on the sheep: same mean error as an
    aggressive fit (iterations 12, step 0.8, smooth 0.3, clamp 0.5) with a lower max
    error, half the self-intersections and a visibly smoother surface.
    Returns dict(before=..., after=...) subdivided-surface fidelity (levels 2).
    """
    keep_center = _has_mirror(obj) if keep_center is None else keep_center
    for m in obj.modifiers:
        if m.type == "SHRINKWRAP":
            m.show_viewport = False
            m.show_render = False
    before = fidelity(obj, target, levels=2, coverage=False)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    nbr = _adjacency(bm)
    boundary = np.array([v.is_boundary for v in bm.verts])
    bm.free()
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    eps = _local_size_of_mesh(me) * 1e-5
    center = np.abs(co[:, 0]) < eps if keep_center else np.zeros(n, bool)
    bvh = target_bvh(target)
    co0 = co.copy()
    elen = np.array([np.linalg.norm(co[nb] - co[i], axis=1).mean() if nb else 0.0
                     for i, nb in enumerate(nbr)])
    cap = clamp * elen if clamp else None
    for _ in range(iterations):
        lim = _limit_positions(obj)
        delta = np.zeros_like(co)
        for i in range(n):
            p = bvh.find_nearest(Vector(lim[i]))[0]
            if p is not None:
                delta[i] = np.array(p) - lim[i]
        if smooth:
            avg = np.array([delta[nb].mean(0) if nb else delta[i] for i, nb in enumerate(nbr)])
            delta = (1 - smooth) * delta + smooth * avg
        if pin_boundary:
            delta[boundary] = 0
        co = co + step * delta
        if cap is not None:
            off = co - co0
            ln = np.linalg.norm(off, axis=1)
            over = ln > cap
            co[over] = co0[over] + off[over] * (cap[over] / ln[over])[:, None]
        co[center, 0] = 0.0
        me.vertices.foreach_set("co", co.ravel())
        me.update()
    after = fidelity(obj, target, levels=2, coverage=False)
    return {"before": before, "after": after}


def multires_recover(obj, target, levels=2, wrap="NEAREST_SURFACEPOINT", subsurf=2):
    """Kaspar's volume recovery (Snow Live #5 [02:09:01]): Multires subdivided `levels`
    times, a Shrinkwrap placed AFTER it is applied onto the multires levels, then Apply
    Base at level 0 and Multires swapped for Subdivision Surface. Applies Mirror first
    (Multires and Mirror do not mix; Jamie Dunbar) and removes Shrinkwrap/Subsurf.
    Never re-shrinkwrap afterwards (it undoes the recovered volume). Kaspar: overshoots a
    little and depends on density, check eyelids and lips after.
    Returns dict(before=..., after=...) fidelity at subdivision 2.
    """
    _object_mode()
    before = fidelity(obj, target, levels=2, coverage=False)
    with _ctx(obj):
        for m in list(obj.modifiers):
            if m.type == "MIRROR":
                bpy.ops.object.modifier_apply(modifier=m.name)
            elif m.type in ("SHRINKWRAP", "SUBSURF", "MULTIRES"):
                obj.modifiers.remove(m)
        mr = obj.modifiers.new("Multires", "MULTIRES")
        for _ in range(levels):
            bpy.ops.object.multires_subdivide(modifier=mr.name, mode="CATMULL_CLARK")
        sw = obj.modifiers.new("SW_detail", "SHRINKWRAP")
        sw.target = target
        sw.wrap_method = wrap
        bpy.ops.object.modifier_apply(modifier=sw.name)
        obj.modifiers[mr.name].levels = 0
        bpy.ops.object.multires_base_apply(modifier=mr.name, apply_heuristic=True)
        obj.modifiers.remove(obj.modifiers[mr.name])
    s = obj.modifiers.new("Subdivision", "SUBSURF")
    s.levels = subsurf
    s.render_levels = 2
    after = fidelity(obj, target, levels=2, coverage=False)
    return {"before": before, "after": after}


# --------------------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------------------
def fidelity(obj, target, levels=2, coverage=True, target_mask=None, sample=30000):
    """How well the SUBDIVIDED cage matches the sculpt (Duha: judge the subdivided
    surface, not cage vertices; Kaspar: compare at render subdivision, 2 levels).

    Evaluates Mirror + Shrinkwrap-before-subsurf + a Subsurf at `levels` (0 = cage).
    Distances in target-local units and as % of the target's size:
      mean/p95/max  subdivided surface -> sculpt
      inside_pct    share of subdivided verts inside the sculpt (>55 = shrunken cage)
      dihedral_*    angle between neighbouring faces of the subdivided surface: lumpiness.
                    Distance alone rewards a cage that chases every sculpt bump; compare
                    with a clean reference or the previous iteration and LOOK at a matcap.
      cov_*         sculpt -> subdivided surface (missing parts, holes, unbuilt limbs);
                    target_mask (bool per target vertex) restricts the region.
    """
    states = [(m, m.show_viewport) for m in obj.modifiers]
    first_sub = next((i for i, m in enumerate(obj.modifiers) if m.type in ("SUBSURF", "MULTIRES")), None)
    for i, (m, s) in enumerate(states):
        keep = m.type == "MIRROR" or (m.type == "SHRINKWRAP" and (first_sub is None or i < first_sub))
        m.show_viewport = s and keep
    tmp = None
    if levels:
        tmp = obj.modifiers.new("_bx_fid", "SUBSURF")
        tmp.levels = levels
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        polys = [p.vertices[:] for p in me.polygons] if coverage else None
        bmr = bmesh.new()
        bmr.from_mesh(me)
        dih = np.array([e.calc_face_angle() for e in bmr.edges if len(e.link_faces) == 2])
        bmr.free()
        ev.to_mesh_clear()
    finally:
        if tmp:
            obj.modifiers.remove(tmp)
        for m, s in states:
            m.show_viewport = s
    # evaluated cage is in cage-local space == target-local when set up with setup_cage;
    # convert generally through world space
    to_t = np.array(target.matrix_world.inverted() @ obj.matrix_world)
    if not np.allclose(to_t, np.eye(4), atol=1e-7):
        co = co @ to_t[:3, :3].T + to_t[:3, 3]
    bvh = target_bvh(target)
    size = _local_size(target)
    ds, sg = [], []
    for c in co:
        loc, nrm, _, d = bvh.find_nearest(Vector(c))
        if loc is None:
            continue
        ds.append(d)
        sg.append((Vector(c) - loc).dot(nrm))
    ds = np.array(ds)
    r = {
        "levels": levels, "verts": len(co),
        "mean": round(float(ds.mean()), 6), "p95": round(float(np.percentile(ds, 95)), 6),
        "max": round(float(ds.max()), 6),
        "mean_pct": round(100 * float(ds.mean()) / size, 3),
        "p95_pct": round(100 * float(np.percentile(ds, 95)) / size, 3),
        "max_pct": round(100 * float(ds.max()) / size, 3),
        "inside_pct": round(100 * float((np.array(sg) < 0).mean()), 1),
        "dihedral_mean_deg": round(float(np.degrees(dih.mean())), 2) if len(dih) else 0.0,
        "dihedral_p99_deg": round(float(np.degrees(np.percentile(dih, 99))), 2) if len(dih) else 0.0,
    }
    if coverage:
        tree = BVHTree.FromPolygons([Vector(c) for c in co], polys)
        tco = np.empty(len(target.data.vertices) * 3)
        target.data.vertices.foreach_get("co", tco)
        tco = tco.reshape(-1, 3)
        idx = np.arange(len(tco))
        if target_mask is not None:
            idx = idx[np.asarray(target_mask, bool)]
        if len(idx) > sample:
            idx = idx[:: max(1, len(idx) // sample)]
        cd = np.array([tree.find_nearest(Vector(tco[i]))[3] for i in idx])
        r.update(cov_mean_pct=round(100 * float(cd.mean()) / size, 3),
                 cov_p95_pct=round(100 * float(np.percentile(cd, 95)) / size, 3),
                 cov_max_pct=round(100 * float(cd.max()) / size, 3))
    return r


def _walk_loop(e, v):
    """Edge loop walk starting on edge e towards vertex v. Returns (edges, verts, closed)."""
    start = e
    edges, verts = [e], [e.other_vert(v), v]
    while True:
        if v.is_boundary:
            # continue along the boundary if e is a boundary edge
            if not e.is_boundary:
                return edges, verts, False
            nxt = [x for x in v.link_edges if x is not e and x.is_boundary]
            if len(nxt) != 1 or len(v.link_edges) != 3:
                return edges, verts, False
            e = nxt[0]
        else:
            if len(v.link_edges) != 4:
                return edges, verts, False
            faces = set(e.link_faces)
            nxt = [x for x in v.link_edges if x is not e and not (set(x.link_faces) & faces)]
            if len(nxt) != 1:
                return edges, verts, False
            e = nxt[0]
        if e is start:
            return edges, verts[:-1], True
        edges.append(e)
        v = e.other_vert(v)
        verts.append(v)
        if len(edges) > 100000:
            return edges, verts, False


def _all_loops(bm):
    seen = set()
    out = []
    for e in bm.edges:
        if e.index in seen:
            continue
        a, b = e.verts
        e1, v1, closed = _walk_loop(e, b)
        if closed:
            edges, verts = e1, v1
        else:
            e2, v2, _ = _walk_loop(e, a)
            edges = list(reversed(e2[1:])) + e1
            verts = list(reversed(v2[2:])) + v1
        for x in edges:
            seen.add(x.index)
        out.append((edges, verts, closed))
    return out


def loops_around(obj, center, normal, max_radius, corners=None):
    """Closed edge loops (boundary loops included) that encircle a landmark.

    The measurable version of "loops around the eyes and mouth" (Kaspar, Dikko, Kenny,
    Grant Abbitt's critique of auto retopo). Winding is measured in the plane normal to
    `normal`; only loops entirely within max_radius count. corners=(a, b) splits each
    ring at the vertices nearest to the two corner points and reports the edge counts of
    both sides (lid/lip parity, Dikko: 10 top = 10 bottom).
    Returns a list of dicts sorted from the innermost ring outward.
    """
    c = Vector(center)
    nrm = Vector(normal).normalized()
    u = nrm.orthogonal().normalized()
    w = nrm.cross(u)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = []
    for edges, verts, closed in _all_loops(bm):
        if not closed:
            continue
        pts = [v.co for v in verts]
        if any((p - c).length > max_radius for p in pts):
            continue
        ang = [math.atan2((p - c).dot(w), (p - c).dot(u)) for p in pts]
        wind = sum(((ang[(i + 1) % len(ang)] - ang[i] + math.pi) % (2 * math.pi)) - math.pi
                   for i in range(len(ang)))
        if abs(wind) < math.pi:
            continue
        rad = [(p - c).length for p in pts]
        d = {"verts": len(verts), "radius_mean": round(sum(rad) / len(rad), 5),
             "radius_min": round(min(rad), 5), "radius_max": round(max(rad), 5),
             "boundary": all(e.is_boundary for e in edges)}
        if corners:
            n = len(pts)

            def near(q):
                q = Vector(q)
                order = sorted(range(n), key=lambda i: (pts[i] - q).length)
                el = min((pts[order[0]] - pts[(order[0] + 1) % n]).length,
                         (pts[order[0]] - pts[order[0] - 1]).length)
                # a corner point half-way between two vertices is ambiguous by one
                return [order[0]] + ([order[1]] if (pts[order[1]] - q).length - (pts[order[0]] - q).length
                                     < 0.25 * el else [])
            opts = [((ib - ia) % n) for ia in near(corners[0]) for ib in near(corners[1])]
            s1 = min(opts, key=lambda x: abs(2 * x - n))
            d["sides"] = (s1, n - s1)
            d["corner_ambiguous"] = len(set(opts)) > 1
        out.append(d)
    bm.free()
    return sorted(out, key=lambda d: d["radius_mean"])


def loop_stats(obj, min_len=8):
    """Edge-loop census. Closed loops = rings that close on themselves (expert target);
    spiral suspects = open loops whose vertices come back within one edge of an earlier
    part of the same loop (Kaspar: "never let a loop spiral"; Dikko: a spiral around the
    eyes or lips means rebuild). Heuristic: confirm suspects on a wire render."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    loops = _all_loops(bm)
    closed = [l for l in loops if l[2]]
    spirals = []
    for edges, verts, cl in loops:
        if cl or len(verts) < min_len:
            continue
        pos = {v.index: k for k, v in enumerate(verts)}
        hit = False
        for k, v in enumerate(verts):
            for e in v.link_edges:
                j = pos.get(e.other_vert(v).index)
                if j is not None and abs(j - k) > 3:
                    hit = True
                    break
            if hit:
                break
        if hit:
            spirals.append(len(verts))
    edge_total = len(bm.edges)
    r = {
        "loops": len(loops), "closed": len(closed),
        "edges_in_closed_pct": round(100 * sum(len(l[0]) for l in closed) / max(edge_total, 1), 1),
        "open_longest": max((len(l[1]) for l in loops if not l[2]), default=0),
        "spiral_suspects": len(spirals),
    }
    bm.free()
    return r


def topology_report(obj, crease_attr="retopo_crease", hidden_group=None, mirror_axis=0):
    """bx_audit numbers plus the checks experts apply by eye. Local space (the mesh data).

    rim_poles        boundary verts with 4+ edges (Kaspar: no poles on a shell rim)
    center_poles     verts on x = 0 whose valence is not 4 (Dikko: centre line pole-free)
    crease_poles     verts with valence != 4 on an edge flagged by `crease_attr`
    adjacent_e5      edges joining two interior 5+ poles (Kaspar Live #2: separate them)
    valence2         interior verts with 2 edges (only as a temporary aid)
    non_quads_visible  tris/n-gons outside `hidden_group` (vertex group of hidden areas)
    sym_local_pct    share of verts with a local X-mirror partner (world-space symmetry is
                     meaningless when the object is rotated)
    pole_density_pct (e3 + e5+) / faces: studio 1.8 % head, ~5 % body (calibration)
    cage_dihedral_mean/p95  angle between neighbouring faces of the cage in degrees: how
                     readable the cage is with Subdivision off (crumpled fits read high)
    """
    import bx_audit
    a = bx_audit.audit(obj)
    a = {k: v for k, v in a.items() if not k.endswith("_sample")}
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    eps = _local_size_of_mesh(obj.data) * 1e-4
    rim = sum(1 for v in bm.verts if v.is_boundary and len(v.link_edges) >= 4)
    center_poles = sum(1 for v in bm.verts if abs(v.co[mirror_axis]) < eps and not v.is_boundary
                       and len(v.link_edges) != 4)
    adj5 = sum(1 for e in bm.edges if all(not v.is_boundary and len(v.link_edges) >= 5 for v in e.verts))
    val2 = sum(1 for v in bm.verts if not v.is_boundary and len(v.link_edges) == 2)
    crease_poles = None
    attr = obj.data.attributes.get(crease_attr) if crease_attr else None
    if attr is not None and attr.domain == "EDGE":
        flags = [False] * len(obj.data.edges)
        attr.data.foreach_get("value", flags)
        bad = set()
        for e in bm.edges:
            if flags[e.index]:
                for v in e.verts:
                    if not v.is_boundary and len(v.link_edges) != 4:
                        bad.add(v.index)
        crease_poles = len(bad)
    hidden = set()
    if hidden_group and hidden_group in obj.vertex_groups:
        gi = obj.vertex_groups[hidden_group].index
        hidden = {v.index for v in obj.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
    visible_non_quads = sum(1 for f in bm.faces if len(f.verts) != 4 and
                            not all(v.index in hidden for v in f.verts))
    co = [v.co.copy() for v in bm.verts]
    kd = KDTree(len(co))
    for i, c in enumerate(co):
        kd.insert(c, i)
    kd.balance()
    tol = _local_size_of_mesh(obj.data) * 1e-3
    sym = 0
    for c in co:
        m = c.copy()
        m[mirror_axis] = -m[mirror_axis]
        if kd.find(m)[2] <= tol:
            sym += 1
    dih = [math.degrees(e.calc_face_angle()) for e in bm.edges if len(e.link_faces) == 2]
    bm.free()
    a.update(cage_dihedral_mean=round(sum(dih) / max(len(dih), 1), 2),
             cage_dihedral_p95=round(sorted(dih)[int(0.95 * (len(dih) - 1))], 2) if dih else 0.0)
    a.update(rim_poles=rim, center_poles=center_poles, crease_poles=crease_poles, adjacent_e5=adj5,
             valence2=val2, non_quads_visible=visible_non_quads,
             sym_local_pct=round(100 * sym / max(len(co), 1), 2),
             pole_density_pct=round(100 * (a["poles_e3"] + a["poles_e5plus"]) / max(a["faces"], 1), 2))
    a.pop("symmetry_pct", None)
    return a


# --------------------------------------------------------------------------------------
# game
# --------------------------------------------------------------------------------------
def tri_count(obj, evaluated=True):
    """Triangles the engine will get (evaluated: Mirror etc. applied)."""
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
        return n
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def triangulate_twisted(obj, high=None, angle=15.0):
    """SpeedChar ep35: cut non-planar quads yourself so the baker and the engine use the
    same diagonal. A quad whose two triangle normals differ by more than `angle` degrees
    is split along the diagonal whose triangles sit closer to `high` (or the shorter
    diagonal without a high poly). Returns the number of quads split."""
    bvh = target_bvh(high) if high is not None else None
    to_h = (high.matrix_world.inverted() @ obj.matrix_world) if high is not None else None
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    todo = []
    lim = math.radians(angle)
    for f in bm.faces:
        if len(f.verts) != 4:
            continue
        a, b, c, d = [v.co for v in f.verts]
        n1 = (b - a).cross(c - a)
        n2 = (c - a).cross(d - a)
        n3 = (b - a).cross(d - a)
        n4 = (c - b).cross(d - b)
        if n1.length and n2.length and n1.angle(n2) > lim or (n3.length and n4.length and n3.angle(n4) > lim):
            todo.append(f)
    split = 0
    for f in todo:
        vs = list(f.verts)
        opts = [(vs[0], vs[2]), (vs[1], vs[3])]
        if bvh is not None:
            def cost(pair):
                o = [v for v in vs if v not in pair]
                s = 0.0
                for x in o:
                    ctr = (pair[0].co + pair[1].co + x.co) / 3
                    s += bvh.find_nearest(to_h @ ctr)[3]
                return s
            pair = min(opts, key=cost)
        else:
            pair = min(opts, key=lambda p: (p[0].co - p[1].co).length)
        bmesh.ops.connect_verts(bm, verts=list(pair))
        split += 1
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return split


def push_outside(obj, high, offset):
    """SpeedChar's fitting pass (ep35: 'slightly proud' low poly, Inflate until it sits a
    touch over the high): every vertex inside the high poly or closer than `offset` is
    moved out along the high's normal to `offset`. Centre line kept on x = 0.
    Returns the number of moved vertices."""
    bvh = target_bvh(high)
    to_h = high.matrix_world.inverted() @ obj.matrix_world
    back = to_h.inverted()
    keep = _has_mirror(obj)
    moved = 0
    for v in obj.data.vertices:
        p = to_h @ v.co
        loc, nrm, _, d = bvh.find_nearest(p)
        if loc is None:
            continue
        s = (p - loc).dot(nrm)
        if s < offset:
            x0 = v.co.x
            v.co = back @ (loc + nrm * offset)
            if keep and abs(x0) < 1e-9:
                v.co.x = 0.0
            moved += 1
    obj.data.update()
    return moved


def hard_edges_without_seams(obj):
    """Game bake rule (On Mars 3D, Polycount): every hard (sharp) edge must be a UV seam,
    or the normal map shows crack lines. Returns the count of sharp edges lacking a seam."""
    me = obj.data
    sharp = me.attributes.get("sharp_edge")
    seam = me.attributes.get("uv_seam")
    if sharp is None:
        return 0
    s = [False] * len(me.edges)
    sharp.data.foreach_get("value", s)
    m = [False] * len(me.edges)
    if seam is not None:
        seam.data.foreach_get("value", m)
    return sum(1 for a, b in zip(s, m) if a and not b)
