"""
bx_hardsurface: hard-surface building blocks and shading QA for an agent with no mouse
(stock Blender 5.2.1 LTS, headless-safe, no add-ons).

Tested by tests/code/blender-hard-surface/test_*.py (run with
`blender --background --factory-startup --python-exit-code 1 --python <test>`).

    import sys; sys.path.append("<skills>/scenario-blender-hard-surface/scripts"); import bx_hardsurface as HS

All sizes are in scene units (metres) and in WORLD space. Apply scale first (apply_scale):
bevel, solidify and array read object-local distances, so unapplied scale skews them.

SETUP
  apply_scale(ob, rotation=False)        data-level Ctrl+A that keeps children in place
  find_edges(ob, min_angle=..., inside=(lo, hi), parallel=axis)   edge indices, no mouse
  set_edge_attr(ob, edges, value, attr)  bevel_weight_edge (design bevel) / crease_edge
  support_loops(ob, edges, offset)       destructive holding edges (even segments, profile 1.0)
  support_cut(ob, point, normal, avoid)  plane cut through a boolean region (du Mont's fix;
                                         measure before/after, it can make things worse)
  nonplanar_faces(ob) / flatten_faces(ob)  find / project non-planar faces onto their plane

CUTTERS AND BOOLEANS (School A: n-gons + booleans + bevel + custom normals)
  make_cutter(target, kind, size, location, rotation_deg, ...)   BOX (optional chamfer),
                                         CYLINDER (half-segment phase), SLOT (stadium)
  as_cutter(ob, target)                  apply the cutter checklist to an existing object
  add_boolean(target, cutter, operation, solver)   lands above the micro bevel / normals tail
  slice_boolean(target, cutter)          Slice = Difference on target + Intersect on a copy
  cutters_of(ob) / hide_cutters(ob)      list / view-layer hide (booleans keep evaluating)

STACKS
  hard_surface_stack(ob, micro_width, ...)   [Mirror] > Bevel_design(WEIGHT) > (booleans) >
                                             Bevel_micro(ANGLE, harden, arc) > [Smooth by
                                             Angle] > WeightedNormal(keep sharp), pinned
  subd_stack(ob, support_width, levels)      School B: [Bevel WEIGHT even seg profile 1.0] > Subsurf
  order_stack(ob, pin=True)              canonical order; unpin, reorder, re-pin bottom-up
  stack_problems(ob)                     order and settings errors as readable strings
  transfer_normals(ob)                   Data Transfer custom normals from the uncut curved
                                         surface (cuts on curved skins), after WN
  mirror_seam_fix(ob)                    Face Strength Affected + WN Face Influence 100

QA
  shading_audit(ob) -> verdict(report)   one dict / a list of readable problems (empty = clean):
                                         stack, scale, custom normals, non-planar faces,
                                         flat-face normal smear, smoothed hard edges, folds,
                                         flat-shaded faces, sharp edges on smooth surfaces,
                                         cuts on curvature, clamp probe + culprits, slivers,
                                         boolean effect, cutter hygiene, subD cage metrics
  cutter_report(cutter, target)          scale, smooth, display, collection, manifold,
                                         coplanar / near-parallel faces, thin walls, narrow gaps,
                                         near-miss verts, rounding facets the bevel will catch,
                                         pokes out
  boolean_report(ob, try_solvers=False)  per boolean: changed, emptied, operand manifold, solvers
  clamp_probe(ob) / clamp_culprits(ob)   displacement clamp on vs off / booleans that cause it
  sliver_report(ob)                      sub-bevel-width edges and faces each boolean adds
  cuts_on_curvature(ob)                  cutters that end on a curved surface
  subd_cage_report(ob)                   quads %, quad aspect, long rectangles, crease length

REVIEW
  review(objs, out_dir, views, modes)    bx_review contact sheet of the EVALUATED mesh (cutters
                                         never show, wire = real boolean topology); extra modes
                                         shiny, reflect, hsgrey, fullmetal
  closeup(ob, point, radius, out_path, direction, mode)   one framed close-up of a cut

GAME
  tri_count(ob)                          evaluated triangles
  game_version(ob, micro_segments=1)     copy (in place) with fewer segments + Triangulate
                                         (keep custom normals); shares cutters, do not move it
  collapse(ob, name)                     new object from the evaluated mesh (keeps custom normals)
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-blender-expert", "scripts"))
if _EXPERT not in sys.path:
    sys.path.append(_EXPERT)

CUTTERS = "Cutters"
HELPERS = "HS_Helpers"
TAIL_RANK = {"micro_bevel": 0, "smooth_by_angle": 1, "weighted_normal": 2,
             "normal_transfer": 3, "triangulate": 4}


# --------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------
def _size(ob):
    return max(ob.dimensions) or 1.0


def _link_only(ob, col):
    for c in list(ob.users_collection):
        if c != col:
            c.objects.unlink(ob)
    if ob.name not in col.objects:
        col.objects.link(ob)


def _collection(name, scene=None):
    sc = scene or bpy.context.scene
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in sc.collection.children and col != sc.collection:
        sc.collection.children.link(col)
    return col


def _parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def _eval_copy(ob):
    """Independent mesh datablock of the evaluated object (caller removes it)."""
    dg = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True,
                                           depsgraph=dg)


def _free(me):
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)


def _coords(me):
    a = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def _bm(me, matrix=None):
    bm = bmesh.new()
    bm.from_mesh(me)
    if matrix is not None:
        bm.transform(matrix)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    return bm


def _thickness(f):
    """Area over longest edge: the width of a strip, the side of a square."""
    longest = max(e.calc_length() for e in f.edges)
    return f.calc_area() / longest if longest > 0 else 0.0


def _dihedral(e):
    if len(e.link_faces) != 2:
        return None
    return math.degrees(e.calc_face_angle(0.0))


def role(m):
    """Role of a modifier in a hard-surface stack."""
    t = m.type
    if t == "BOOLEAN":
        return "boolean"
    if t == "BEVEL":
        return "micro_bevel" if (m.limit_method == "ANGLE" or m.harden_normals) else "design_bevel"
    if t == "WEIGHTED_NORMAL":
        return "weighted_normal"
    if t == "NODES" and m.node_group and m.node_group.name.startswith("Smooth by Angle"):
        return "smooth_by_angle"
    if t == "DATA_TRANSFER" and m.use_loop_data and "CUSTOM_NORMAL" in m.data_types_loops:
        return "normal_transfer"
    if t == "TRIANGULATE":
        return "triangulate"
    if t == "MIRROR":
        return "mirror"
    if t == "SUBSURF":
        return "subsurf"
    return "other"


def _micro(ob):
    return [m for m in ob.modifiers if m.type == "BEVEL" and role(m) == "micro_bevel"]


# --------------------------------------------------------------------------------------
# setup
# --------------------------------------------------------------------------------------
def apply_scale(ob, rotation=False):
    """Data-level Apply Scale (and optionally Rotation). Makes a shared mesh single-user,
    flips winding for negative scale (as Blender 5.1+ does) and keeps children in place."""
    if ob.type != "MESH":
        raise TypeError(f"{ob.name} is not a mesh")
    if ob.data.users > 1:
        ob.data = ob.data.copy()
    kids = [(c, c.matrix_world.copy()) for c in ob.children]
    loc, rot, sca = ob.matrix_basis.decompose()
    m = Matrix.Diagonal(sca.to_4d())
    if rotation:
        m = rot.to_matrix().to_4x4() @ m
    ob.data.transform(m)
    if sca.x * sca.y * sca.z < 0:
        bm = _bm(ob.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
    keep_rot = Matrix.Identity(4) if rotation else rot.to_matrix().to_4x4()
    ob.matrix_basis = Matrix.Translation(loc) @ keep_rot
    ob.data.update()
    bpy.context.view_layer.update()
    for c, mw in kids:          # re-parent with keep-transform: the old parent inverse held the scale
        c.matrix_parent_inverse = ob.matrix_world.inverted()
        c.matrix_world = mw
    bpy.context.view_layer.update()
    return ob


def find_edges(ob, min_angle=None, max_angle=None, inside=None, parallel=None, tol_deg=2.0,
               boundary_only=False):
    """Indices of base-mesh edges matching all given filters.
    min_angle/max_angle: dihedral in degrees (90 for box edges); inside: (lo, hi) world box,
    both vertices inside; parallel: 'X'/'Y'/'Z' or a vector, within tol_deg."""
    bpy.context.view_layer.update()
    bm = _bm(ob.data, ob.matrix_world)
    axis = None
    if parallel is not None:
        axis = Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[parallel]
                      if isinstance(parallel, str) else parallel).normalized()
    out = []
    for e in bm.edges:
        if boundary_only and not e.is_boundary:
            continue
        a = _dihedral(e)
        if min_angle is not None and (a is None or a < min_angle):
            continue
        if max_angle is not None and (a is None or a > max_angle):
            continue
        if inside is not None:
            lo, hi = Vector(inside[0]), Vector(inside[1])
            if not all(all(lo[i] <= v.co[i] <= hi[i] for i in range(3)) for v in e.verts):
                continue
        if axis is not None:
            d = (e.verts[1].co - e.verts[0].co)
            if d.length == 0 or math.degrees(d.normalized().angle(axis)) > tol_deg and \
                    math.degrees(d.normalized().angle(-axis)) > tol_deg:
                continue
        out.append(e.index)
    bm.free()
    return out


def set_edge_attr(ob, edges, value=1.0, attr="bevel_weight_edge"):
    """Write a float edge attribute (bevel_weight_edge for Limit Method Weight, crease_edge
    for Subdivision creases). Returns the number of edges written."""
    me = ob.data
    a = me.attributes.get(attr) or me.attributes.new(attr, "FLOAT", "EDGE")
    for i in edges:
        a.data[i].value = value
    me.update()
    return len(edges)


def support_loops(ob, edges, offset, segments=2):
    """Destructive holding edges for School B (Lampel): bevel the edges with an even segment
    count and profile 1.0 so the original edge stays where it was."""
    if segments % 2:
        raise ValueError("support loops need an even segment count (odd loses the original edge)")
    bm = _bm(ob.data)
    geom = [bm.edges[i] for i in edges]
    bmesh.ops.bevel(bm, geom=geom, offset=offset, segments=segments, profile=1.0,
                    affect="EDGES", clamp_overlap=True)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return len(ob.data.edges)


def support_cut(ob, point, normal, avoid=None):
    """du Mont's bevel-shrink fix: add an edge loop on the TARGET through the middle of a
    boolean region (plane through `point` with `normal`, world space). avoid=<cutter>: shift
    the plane to lie midway between two cutter vertices, because a plane through cutter
    vertices creates the very short edges it is meant to prevent (verified in 5.2.1).
    Measure with sliver_report / clamp_probe before and after; undo if it got worse.
    Returns (edges added, plane offset applied)."""
    n = Vector(normal).normalized()
    shift = 0.0
    if avoid is not None:
        ds = sorted({round((avoid.matrix_world @ v.co - Vector(point)).dot(n), 7)
                     for v in avoid.data.vertices})
        below = [d for d in ds if d <= 0]
        above = [d for d in ds if d > 0]
        if below and above:
            lo, hi = below[-1], above[0]
            if abs(lo) < 1e-6:          # plane sits on a vertex row: move to the nearest gap middle
                prev = below[-2] if len(below) > 1 else None
                gaps = [(hi - lo, (lo + hi) / 2)] + ([(lo - prev, (lo + prev) / 2)] if prev is not None else [])
                shift = min(gaps, key=lambda g: abs(g[1]))[1]
            else:
                shift = (lo + hi) / 2
    co = ob.matrix_world.inverted() @ (Vector(point) + n * shift)
    no = (ob.matrix_world.to_3x3().transposed() @ n).normalized()  # plane normal to local
    bm = _bm(ob.data)
    before = len(bm.edges)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no)
    added = len(bm.edges) - before
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return added, shift


def nonplanar_faces(ob, tol=None):
    """(face index, deviation) for base faces with 4+ vertices off their plane by > tol
    (default 1e-4 x object size). Deviation is in scene units."""
    me = ob.data
    tol = tol if tol is not None else 1e-4 * _size(ob)
    s = ob.matrix_world.to_scale()
    scale = max(abs(s.x), abs(s.y), abs(s.z))
    out = []
    for p in me.polygons:
        if p.loop_total < 4:
            continue
        n, c = p.normal, p.center
        dev = max(abs((me.vertices[v].co - c).dot(n)) for v in p.vertices) * scale
        if dev > tol:
            out.append((p.index, dev))
    out.sort(key=lambda t: -t[1])
    return out


def flatten_faces(ob, faces=None, iterations=5, tol=None):
    """Gambrell's `S <axis> 0`: project the vertices of non-planar faces onto the face plane
    (repeated, since faces share vertices). Returns remaining max deviation."""
    faces = faces if faces is not None else [i for i, _ in nonplanar_faces(ob, tol)]
    for _ in range(iterations):
        bm = _bm(ob.data)
        for i in faces:
            f = bm.faces[i]
            n, c = f.normal.copy(), f.calc_center_median()
            for v in f.verts:
                v.co -= n * (v.co - c).dot(n)
        bm.normal_update()
        bm.to_mesh(ob.data)
        bm.free()
    ob.data.update()
    left = nonplanar_faces(ob, tol)
    return left[0][1] if left else 0.0


# --------------------------------------------------------------------------------------
# cutters and booleans
# --------------------------------------------------------------------------------------
def _prism(bm, outline, depth):
    """Closed prism from a 2D outline (counter-clockwise, in XY), centred on z = 0."""
    bot = [bm.verts.new((x, y, -depth / 2)) for x, y in outline]
    top = [bm.verts.new((x, y, depth / 2)) for x, y in outline]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))


def make_cutter(target, kind="BOX", size=(0.1, 0.1, 0.1), location=(0, 0, 0),
                rotation_deg=(0, 0, 0), name=None, chamfer=0.0, chamfer_segments=1,
                chamfer_edges="VERTICAL", vertices=32, phase_deg=None, display="WIRE",
                parent=True, operation="DIFFERENCE", solver="EXACT", add=True):
    """Build a cutter that follows the checklist (Gambrell, Ryuu, du Mont): built at size
    (scale 1), smooth shaded, only in the Cutters collection, wire/bounds display, hidden
    from render, parented to the target, and (add=True) wired as a Boolean on the target.
    kind 'BOX': size = full dimensions (chamfer rounds its vertical or all edges);
    'CYLINDER': size = (diameter x, diameter y, depth), axis = local Z, `vertices` fixed now
    (you cannot change it later, Ryuu); 'SLOT': stadium / rounded slot, size = (length,
    width, depth), `vertices` per half circle.
    phase_deg rotates the ring about its axis: default half a segment, so its radial edges do
    not land exactly on the edges of a target with the same segment count (same phase gave
    10 non-manifold edges with EXACT in 5.2.1).
    Make the cutter extend well past every surface it enters, and keep its edges far from
    target edges (or exactly coincident): run cutter_report afterwards."""
    name = name or f"Cutter_{kind.title()}"
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if kind == "BOX":
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    elif kind == "CYLINDER":
        ph = math.radians(phase_deg) if phase_deg is not None else math.pi / vertices
        rx, ry = size[0] / 2, size[1] / 2
        _prism(bm, [(rx * math.cos(ph + 2 * math.pi * i / vertices),
                     ry * math.sin(ph + 2 * math.pi * i / vertices)) for i in range(vertices)], size[2])
    elif kind == "SLOT":
        L, W, D = size
        r = W / 2
        k = max(2, vertices)
        pts = [(L / 2 - r + r * math.cos(-math.pi / 2 + math.pi * i / k),
                r * math.sin(-math.pi / 2 + math.pi * i / k)) for i in range(k + 1)]
        pts += [(-L / 2 + r + r * math.cos(math.pi / 2 + math.pi * i / k),
                 r * math.sin(math.pi / 2 + math.pi * i / k)) for i in range(k + 1)]
        _prism(bm, pts, D)
    else:
        raise ValueError("kind must be BOX, CYLINDER or SLOT (use as_cutter for custom shapes)")
    if chamfer > 0:
        if chamfer_edges == "VERTICAL":
            edges = [e for e in bm.edges
                     if abs((e.verts[1].co - e.verts[0].co).normalized().z) > 0.99]
        else:
            edges = list(bm.edges)
        bmesh.ops.bevel(bm, geom=edges, offset=chamfer, segments=chamfer_segments,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = Vector(location)
    ob.rotation_euler = Euler([math.radians(a) for a in rotation_deg])
    _collection(CUTTERS).objects.link(ob)
    ob.display_type = display
    ob.hide_render = True
    bpy.context.view_layer.update()
    if parent and target is not None:
        _parent_keep(ob, target)
    if add and target is not None:
        add_boolean(target, ob, operation=operation, solver=solver)
    return ob


def as_cutter(ob, target=None, display="WIRE", parent=True):
    """Apply the cutter checklist to an existing mesh object."""
    apply_scale(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    _link_only(ob, _collection(CUTTERS))
    ob.display_type = display
    ob.hide_render = True
    if parent and target is not None and ob.parent != target:
        _parent_keep(ob, target)
    return ob


def add_boolean(target, cutter, operation="DIFFERENCE", solver="EXACT", name=None):
    """Boolean modifier placed right after the last existing boolean (or at the end of the
    head of the stack), always above the micro bevel / normals tail. Solver policy: EXACT
    by default; MANIFOLD when both operands are manifold and speed matters; FLOAT only to
    diagnose (it breaks on coplanar faces in 5.2.1)."""
    m = target.modifiers.new(name or f"Bool_{cutter.name}", "BOOLEAN")
    m.object = cutter
    m.operation = operation
    m.solver = solver
    order_stack(target, pin=any(x.use_pin_to_last for x in target.modifiers))
    bools = [i for i, x in enumerate(target.modifiers) if x.type == "BOOLEAN" and x != m]
    if bools:
        pinned = [x for x in target.modifiers if x.use_pin_to_last]
        for x in pinned:
            x.use_pin_to_last = False
        cur = target.modifiers.find(m.name)
        dest = bools[-1] + 1 if bools[-1] < cur else bools[-1]
        if cur != dest:
            target.modifiers.move(cur, dest)
        for x in reversed(pinned):
            x.use_pin_to_last = True
    return m


def slice_boolean(target, cutter, solver="EXACT"):
    """Slice (Bool Tool's term) with stock modifiers: Difference on the target and a copy of
    the target (single-user mesh, same stack) with Intersect. Returns the slice object."""
    piece = target.copy()
    piece.data = target.data.copy()
    piece.name = target.name + "_slice"
    for c in target.users_collection:
        c.objects.link(piece)
    add_boolean(target, cutter, "DIFFERENCE", solver)
    for m in list(piece.modifiers):
        if m.type == "BOOLEAN" and m.object == cutter:
            piece.modifiers.remove(m)
    add_boolean(piece, cutter, "INTERSECT", solver)
    return piece


def cutters_of(ob):
    return [m.object for m in ob.modifiers if m.type == "BOOLEAN" and m.object is not None]


def hide_cutters(ob, hidden=True):
    """Hide the cutters in the viewport (view-layer hide). Booleans still evaluate."""
    for c in cutters_of(ob):
        c.hide_set(hidden)


# --------------------------------------------------------------------------------------
# stacks
# --------------------------------------------------------------------------------------
def order_stack(ob, pin=True):
    """Canonical order: everything else keeps its relative order (mirror, design bevel,
    booleans, solidify ...), then the tail: micro bevel(s) > Smooth by Angle >
    Weighted Normal > normal Data Transfer > Triangulate. Pinning is done bottom-up because
    5.2.1 keeps the relative order inside the pinned group (verified)."""
    mods = list(ob.modifiers)
    for m in mods:
        m.use_pin_to_last = False
    tail = [m for m in mods if role(m) in TAIL_RANK]
    head = [m for m in mods if role(m) not in TAIL_RANK]
    tail.sort(key=lambda m: (TAIL_RANK[role(m)], mods.index(m)))
    for i, m in enumerate(head + tail):
        cur = ob.modifiers.find(m.name)
        if cur != i:
            ob.modifiers.move(cur, i)
    if pin:
        for m in reversed(tail):
            m.use_pin_to_last = True
    return [m.name for m in ob.modifiers]


def hard_surface_stack(ob, micro_width=None, micro_segments=3, angle=30.0, harden=True,
                       weighted_normal=True, design_width=None, design_segments=12,
                       mirror_axes=None, mirror_object=None, smooth_by_angle=False,
                       face_strength=False, clamp=True, pin=True):
    """School A stack on a mesh with applied scale. All faces are set smooth (the bevel and
    custom normals do the hard look). Defaults: micro bevel angle 30 degrees, 3 segments
    (Gambrell's render default), Harden Normals, Miter Outer Arc, Weighted Normal Keep Sharp.
    micro_width default = 0.5% of the largest dimension [added]; prefer a real-world value
    (du Mont: about 3 mm on a small robot body, 1 mm on small parts, 0.1 mm on a collar).
    design_width: adds a weight-limited design bevel first (edges from set_edge_attr)."""
    s = ob.scale
    if max(abs(s.x - 1), abs(s.y - 1), abs(s.z - 1)) > 1e-4:
        apply_scale(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    if "sharp_face" in ob.data.attributes:
        ob.data.attributes.remove(ob.data.attributes["sharp_face"])
    out = {}
    if mirror_axes:
        mi = ob.modifiers.new("Mirror", "MIRROR")
        for i, ax in enumerate("XYZ"):
            mi.use_axis[i] = ax in mirror_axes
        mi.use_clip = True
        mi.use_mirror_merge = True
        if mirror_object is not None:
            mi.mirror_object = mirror_object
        out["mirror"] = mi
    if design_width:
        d = ob.modifiers.new("Bevel_design", "BEVEL")
        d.limit_method = "WEIGHT"
        d.width = design_width
        d.segments = design_segments
        d.miter_outer = "MITER_ARC"
        d.use_clamp_overlap = clamp
        out["design"] = d
    mb = ob.modifiers.new("Bevel_micro", "BEVEL")
    mb.limit_method = "ANGLE"
    mb.angle_limit = math.radians(angle)
    mb.width = micro_width if micro_width else 0.005 * _size(ob)
    mb.segments = micro_segments
    mb.harden_normals = harden
    mb.miter_outer = "MITER_ARC"
    mb.use_clamp_overlap = clamp
    out["micro"] = mb
    if smooth_by_angle:
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                                       selected_editable_objects=[ob]):
            bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
        out["smooth_by_angle"] = next(m for m in ob.modifiers if role(m) == "smooth_by_angle")
    if weighted_normal:
        wn = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        out["weighted_normal"] = wn
    if face_strength:
        mirror_seam_fix(ob)
    order_stack(ob, pin=pin)
    return out


def subd_stack(ob, support_width=None, support_segments=2, levels=2, render_levels=None,
               uv_smooth=None, weight_all_edges=False):
    """School B: optional Bevel (Limit Method Weight, even segments, profile 1.0) as editable
    support loops before Subdivision Surface (Lampel). Without support_width the cage must
    carry its own holding edges (support_loops) or creases. uv_smooth defaults to
    PRESERVE_CORNERS (Keep Corners) when the bevel is present, SMOOTH_ALL otherwise."""
    if support_segments % 2:
        raise ValueError("bevel before subdivision needs even segments (Lampel)")
    s = ob.scale
    if max(abs(s.x - 1), abs(s.y - 1), abs(s.z - 1)) > 1e-4:
        apply_scale(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    out = {}
    if support_width:
        if weight_all_edges:
            set_edge_attr(ob, range(len(ob.data.edges)), 1.0)
        b = ob.modifiers.new("Support", "BEVEL")
        b.limit_method = "WEIGHT"
        b.width = support_width
        b.segments = support_segments
        b.profile = 1.0
        out["support"] = b
    ss = ob.modifiers.new("Subdivision", "SUBSURF")
    ss.levels = levels
    ss.render_levels = render_levels if render_levels is not None else levels
    ss.uv_smooth = uv_smooth or ("PRESERVE_CORNERS" if support_width else "SMOOTH_ALL")
    out["subsurf"] = ss
    return out


def mirror_seam_fix(ob):
    """Gambrell's fix for the butterfly streak on a mirrored boolean mesh: bevel Face
    Strength = Affected, Weighted Normal Face Influence on, weight 100."""
    for m in _micro(ob):
        m.face_strength_mode = "FSTR_AFFECTED"
    wns = [m for m in ob.modifiers if m.type == "WEIGHTED_NORMAL"]
    if not wns:
        wns = [ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")]
        wns[0].keep_sharp = True
        order_stack(ob, pin=True)
    for w in wns:
        w.use_face_influence = True
        w.weight = 100
    return wns[0]


def transfer_normals(ob, source=None, max_distance=None, mix=1.0, angle=30.0, weighting="AUTO"):
    """Gambrell's fix for cuts on a curved surface: Data Transfer of custom normals from a
    clean, uncut copy of the curved surface, placed after Weighted Normal (before it, WN
    overwrites it; verified).
    source=None builds it from the target's pre-boolean state (mirror and design bevel
    applied, no cuts), keeping only curved faces (minus any ring that meets a flat face
    smoothly), smooth; hidden, parented. weighting: 'ANGLE' = plain smooth normals (domes,
    doubly curved skins), 'AREA' = a Weighted Normal on the source so big faces win (long
    extrusions meeting a design-bevel round, where plain smoothing tilts the whole face),
    'AUTO' = AREA when neighbouring curved faces differ in area by more than 4x.
    max_distance (default 1e-4 x size) limits the transfer to corners lying ON that surface,
    so cut walls and flat faces keep their own normals [added].
    Verified in 5.2.1 (tests/code/blender-hard-surface/test_02_shading_audit.py), normal
    error vs the true surface, p95: 32x16 sphere with a port 2.79 -> 0.34 deg; 24-segment
    cylinder with a design bevel 3.26 -> 0.07; 48-segment 0.61 -> 0.07; no new smear on the
    caps. Harden + WN alone already rendered acceptably on the cylinders: render first.
    Scopes that failed: a vertex group (EXACT gives cutter-made faces the target's weights,
    the cut walls took the cylinder normals), a patch cropped around the cut (its border
    normals made a seam). Where a curved region meets a flat face through a smooth design
    bevel, corners on that border can take the border normal: re-run shading_audit (smear).
    The object must not move away from its source. Returns the modifier or None."""
    if source is None:
        me = _state_before(ob, None)
        me.name = ob.name + "_NormalSrc"
        bm = _bm(me)
        thick = {f: _thickness(f) for f in bm.faces}
        flat = []
        for f in bm.faces:
            curved = False
            for e in f.edges:
                a = _dihedral(e)
                if a is not None and 1.0 < a <= angle:
                    other = next(x for x in e.link_faces if x != f)
                    if thick[other] > 0.3 * thick[f]:
                        curved = True
                        break
            if not curved:
                flat.append(f)
        flat_set = set(flat)
        # also drop curved faces that meet a flat face smoothly (a design-bevel ring next to a
        # cap): otherwise the flat face's border corners sit ON the source and take its normal
        ring = {f for f in bm.faces if f not in flat_set and any(
            (_dihedral(e) or 180.0) <= angle and any(x in flat_set for x in e.link_faces) for e in f.edges)}
        bmesh.ops.delete(bm, geom=list(flat_set | ring), context="FACES")
        for f in bm.faces:
            f.smooth = True
        ratio = 1.0
        for e in bm.edges:
            a = _dihedral(e)
            e.smooth = a is None or a <= angle
            if a is not None and a <= angle:
                a1, a2 = (f.calc_area() for f in e.link_faces)
                ratio = max(ratio, max(a1, a2) / max(min(a1, a2), 1e-12))
        bm.to_mesh(me)
        bm.free()
        if weighting == "AUTO":
            weighting = "AREA" if ratio > 4.0 else "ANGLE"
        if not len(me.polygons):
            bpy.data.meshes.remove(me)
            return None
        source = bpy.data.objects.new(me.name, me)
        _collection(HELPERS).objects.link(source)
        source.matrix_world = ob.matrix_world.copy()
        source.hide_render = True
        source.display_type = "WIRE"
        bpy.context.view_layer.update()
        _parent_keep(source, ob)
        if weighting == "AREA":           # big faces win: no gradient down a long face that
            wn = source.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")   # meets a round
            wn.keep_sharp = True
        source.hide_set(True)
    dt = ob.modifiers.new("HS_NormalTransfer", "DATA_TRANSFER")
    dt.object = source
    dt.use_object_transform = True
    dt.use_loop_data = True
    dt.data_types_loops = {"CUSTOM_NORMAL"}
    dt.loop_mapping = "POLYINTERP_LNORPROJ"
    dt.mix_factor = mix
    dt.use_max_distance = True
    dt.max_distance = max_distance if max_distance is not None else 1e-4 * _size(ob)
    order_stack(ob, pin=any(x.use_pin_to_last for x in ob.modifiers))
    return dt


def stack_problems(ob):
    """Order and settings errors in plain words (empty list = stack is sane)."""
    probs = []
    mods = [m for m in ob.modifiers if m.show_viewport]
    roles = [role(m) for m in mods]
    s = ob.scale
    if any(m.type in {"BEVEL", "SOLIDIFY", "ARRAY"} for m in mods) and \
            max(abs(s.x - 1), abs(s.y - 1), abs(s.z - 1)) > 1e-4:
        probs.append(f"scale not applied {tuple(round(x, 3) for x in s)}: bevel/solidify/array skew")
    micro_idx = [i for i, r in enumerate(roles) if r == "micro_bevel"]
    for i, r in enumerate(roles):
        if r == "boolean" and micro_idx and i > min(micro_idx):
            probs.append(f"{mods[i].name} is below {mods[min(micro_idx)].name}: its cut edges are not beveled")
        if r == "boolean" and mods[i].solver == "FLOAT":
            probs.append(f"{mods[i].name} uses the FLOAT solver: breaks on coplanar faces; use EXACT")
        if r == "boolean" and mods[i].object is None and mods[i].operand_type == "OBJECT":
            probs.append(f"{mods[i].name} has no cutter object")
    if "weighted_normal" in roles:
        wi = max(i for i, r in enumerate(roles) if r == "weighted_normal")
        after = [roles[j] for j in range(wi + 1, len(roles))]
        bad = [mods[wi + 1 + k].name for k, r in enumerate(after)
               if r not in {"triangulate", "normal_transfer"}]
        if bad:
            probs.append(f"Weighted Normal is not last: {bad} evaluate after it")
    if "triangulate" in roles and "weighted_normal" in roles:
        ti = roles.index("triangulate")
        if ti < roles.index("weighted_normal"):
            probs.append("Triangulate above Weighted Normal: compare both orders in a matcap")
        if not mods[ti].keep_custom_normals:
            probs.append("Triangulate without keep_custom_normals drops the custom normals")
    for i, m in enumerate(mods):
        if m.type == "BEVEL":
            if abs(m.width - 0.1) < 1e-6:
                probs.append(f"{m.name} width left at the 0.1 m default")
            nxt = roles[i + 1:]
            if "subsurf" in nxt and role(m) == "design_bevel":
                if m.segments % 2:
                    probs.append(f"{m.name} before Subdivision has odd segments ({m.segments}): original edge lost, UV stretch")
                if abs(m.profile - 1.0) > 1e-3:
                    probs.append(f"{m.name} before Subdivision: profile {m.profile:.2f}, use 1.0 to keep the edge")
                ss = mods[i + 1 + nxt.index("subsurf")]
                if ss.uv_smooth != "PRESERVE_CORNERS":
                    probs.append(f"{ss.name} uv_smooth {ss.uv_smooth}: Keep Corners when a bevel precedes it")
        if m.type == "MIRROR" and "weighted_normal" in roles and i > roles.index("weighted_normal"):
            probs.append(f"{m.name} is below Weighted Normal: move it above")
    return probs


# --------------------------------------------------------------------------------------
# QA
# --------------------------------------------------------------------------------------
def clamp_probe(ob, bevel=None):
    """Evaluate with Clamp Overlap on and off. A displacement above ~10% of the bevel width
    [added threshold] means clamping is biting: a geometry-proximity defect (du Mont)."""
    bevel = bevel or (_micro(ob) or [None])[0]
    if bevel is None:
        return None
    old = bevel.use_clamp_overlap
    try:
        bevel.use_clamp_overlap = True
        a = _eval_copy(ob)
        bevel.use_clamp_overlap = False
        b = _eval_copy(ob)
    finally:
        bevel.use_clamp_overlap = old
    try:
        if len(a.vertices) != len(b.vertices):
            return {"bevel": bevel.name, "topology_changed": True,
                    "verts_clamped": len(a.vertices), "verts_unclamped": len(b.vertices),
                    "ratio": None}
        if not len(a.vertices):
            return {"bevel": bevel.name, "max_disp": 0.0, "ratio": 0.0}
        d = np.linalg.norm(_coords(a) - _coords(b), axis=1)
        s = max(ob.matrix_world.to_scale())
        return {"bevel": bevel.name, "topology_changed": False,
                "max_disp": round(float(d.max()) * s, 6),
                "ratio": round(float(d.max()) * s / bevel.width, 3) if bevel.width else None,
                "worst_at": [round(x, 4) for x in ob.matrix_world @ Vector(_coords(a)[int(d.argmax())])]}
    finally:
        _free(a)
        _free(b)


def clamp_culprits(ob, bevel=None, threshold=0.1):
    """Clamp Overlap limits the bevel over the WHOLE object (one bad cut shrinks every bevel,
    verified), so the displacement peak is not where the cause is. Disable each boolean in
    turn: the ones whose removal brings the clamp ratio under `threshold` are the cause."""
    bevel = bevel or (_micro(ob) or [None])[0]
    out = []
    for m in [m for m in ob.modifiers if m.type == "BOOLEAN" and m.show_viewport]:
        m.show_viewport = False
        try:
            c = clamp_probe(ob, bevel)
        finally:
            m.show_viewport = True
        ratio = 0.0 if c is None else (99.0 if c.get("topology_changed") else (c.get("ratio") or 0.0))
        if ratio < threshold:
            out.append(m.name)
    return out


def _toggle_eval(ob, off):
    """Evaluated copy with the modifiers in `off` disabled."""
    saved = [(m, m.show_viewport) for m in off]
    try:
        for m in off:
            m.show_viewport = False
        return _eval_copy(ob)
    finally:
        for m, v in saved:
            m.show_viewport = v


def _short_stats(me, mw, length_tol, thick_tol, angle=None):
    """Short edges / thin faces. With `angle`, only unbeveled edges (and faces) touching an
    edge the angle-limited bevel will bevel: the bevel offset slides along those neighbours,
    so one shorter than the width limits it. Short beveled edges are left to clamp_probe."""
    bm = _bm(me, mw)
    if angle is not None:
        hard_e = {e for e in bm.edges if (_dihedral(e) or 0.0) >= angle}
        hard = {v for e in hard_e for v in e.verts}
        near_hard = lambda vs: any(v in hard for v in vs)
    else:
        hard_e = set()
        near_hard = lambda vs: True
    short = [e for e in bm.edges
             if e.calc_length() < length_tol and e not in hard_e and near_hard(e.verts)]
    thin = [f for f in bm.faces if _thickness(f) < thick_tol and near_hard(f.verts)]
    pts = [(e.verts[0].co + e.verts[1].co) / 2 for e in short] + [f.calc_center_median() for f in thin]
    r = (len(short), len(thin), [p.copy() for p in pts])
    bm.free()
    return r


def _near_cutter(pts, cutter, pad):
    lo, hi = _bbox_world(cutter)
    lo = lo - Vector((pad, pad, pad))
    hi = hi + Vector((pad, pad, pad))
    return sum(1 for p in pts if all(lo[i] <= p[i] <= hi[i] for i in range(3)))


def _bbox_world(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def sliver_report(ob):
    """Thin polygons and short edges created by the booleans, where they hurt the bevel.
    pre_bevel: boolean result BEFORE the micro bevel, edges shorter than the micro width and
    faces thinner than it (the bevel cannot fit: clamping or overlap). post_bevel: final mesh,
    edges under half the width (the digest's detector, 12 vs 304 on the verified case).
    Each count is compared with the same stack with that boolean disabled."""
    micro = _micro(ob)
    bools = [m for m in ob.modifiers if m.type == "BOOLEAN" and m.show_viewport]
    if not micro or not bools:
        return {"skipped": "needs a micro bevel and at least one boolean"}
    w = micro[0].width
    ang = math.degrees(micro[0].angle_limit) if micro[0].limit_method == "ANGLE" else 30.0
    first = list(ob.modifiers).index(micro[0])
    tail = [m for m in list(ob.modifiers)[first:] if m.show_viewport]
    mw = ob.matrix_world
    out = {"micro_width": w, "per_boolean": []}
    pre_all = _toggle_eval(ob, tail)
    post_all = _eval_copy(ob)
    try:
        pa = _short_stats(pre_all, mw, w, w, ang)
        qa = _short_stats(post_all, mw, 0.5 * w, 0.25 * w)
        out["pre_bevel_short_edges"], out["pre_bevel_thin_faces"] = pa[0], pa[1]
        out["post_bevel_short_edges"], out["post_bevel_thin_faces"] = qa[0], qa[1]
        for b in bools:
            pre_wo = _toggle_eval(ob, tail + [b])
            post_wo = _toggle_eval(ob, [b])
            try:
                pb = _short_stats(pre_wo, mw, w, w, ang)
                qb = _short_stats(post_wo, mw, 0.5 * w, 0.25 * w)
            finally:
                _free(pre_wo)
                _free(post_wo)
            c = b.object
            entry = {"boolean": b.name, "cutter": c.name if c else None,
                     "pre_short_added": pa[0] - pb[0], "pre_thin_added": pa[1] - pb[1],
                     "post_short_added": qa[0] - qb[0], "post_thin_added": qa[1] - qb[1]}
            if c is not None:
                lo, hi = _bbox_world(c)
                pad = Vector((2 * w,) * 3)
                near = [p for p in pa[2] if all(lo[i] - pad[i] <= p[i] <= hi[i] + pad[i] for i in range(3))]
                entry["pre_defects_near_cutter"] = len(near)
                entry["pre_defect_sample"] = [[round(x, 4) for x in p] for p in near[:4]]
            out["per_boolean"].append(entry)
    finally:
        _free(pre_all)
        _free(post_all)
    return out


def _state_before(target, modifier=None):
    """Evaluated target as it is just before `modifier` (that modifier and everything after it
    disabled). modifier=None: all booleans and the micro-bevel/normals tail disabled."""
    mods = list(target.modifiers)
    if modifier is not None and modifier in mods:
        off = mods[mods.index(modifier):]
    else:
        off = [m for m in mods if m.type == "BOOLEAN" or role(m) in TAIL_RANK]
    return _toggle_eval(target, off)


def _inside(tree, p):
    loc, no, _, _ = tree.find_nearest(p)
    return loc is not None and (p - loc).dot(no) < 0


def _face_samples(bm, k=4):
    """Points strictly inside every face (fan triangles, k(k+1)/2 barycentric points each)."""
    out = []
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            a, b, c = vs[0], vs[i], vs[i + 1]
            for u in range(k):
                for w in range(k - u):
                    p = a + (b - a) * ((u + 1 / 3) / k) + (c - a) * ((w + 1 / 3) / k)
                    out.append((p, f.normal, f.index))
    return out


def cutter_report(cutter, target, near=None, eps=1e-4):
    """The cutter checklist, measured. near = band in which a surface counts as too close:
    default 2 x micro bevel width (a wall, step or gap thinner than that makes the two bevels
    on it overlap [added rule]), else 2% of target size.
    coplanar_faces: cutter faces lying on a target face (Z-fighting; FLOAT breaks, EXACT ok).
    near_parallel_faces: cutter faces parallel to a target face within the band (thin steps).
    thin_wall: for DIFFERENCE, material left between the cut and a roughly parallel target
    surface (within 45 degrees) thinner than the band (ray along the cutter normal).
    narrow_gap: for DIFFERENCE, the cut itself narrower than the band inside the target
    (groove of 2 mm with 1.5 mm bevels clamped 0.47; 3.1 mm was clean, verified).
    near_miss_verts: cutter vertices within the band of the target surface but not on it."""
    mb = _micro(target)
    near = near or (2 * mb[0].width if mb else 0.02 * _size(target))
    op = next((m.operation for m in target.modifiers
               if m.type == "BOOLEAN" and m.object == cutter), "DIFFERENCE")
    r = {"cutter": cutter.name, "operation": op}
    ps = cutter.matrix_basis.to_scale()
    r["scale_applied"] = max(abs(ps.x - 1), abs(ps.y - 1), abs(ps.z - 1)) < 1e-4
    r["smooth"] = all(p.use_smooth for p in cutter.data.polygons)
    r["display"] = cutter.display_type
    r["hide_render"] = cutter.hide_render
    r["collections"] = [c.name for c in cutter.users_collection]
    r["only_in_cutters"] = r["collections"] == [CUTTERS]
    r["parented_to_target"] = cutter.parent == target
    cme = _eval_copy(cutter)
    cbm = _bm(cme, cutter.matrix_world)
    _free(cme)
    r["non_manifold_edges"] = sum(1 for e in cbm.edges if not e.is_manifold)
    if mb and mb[0].limit_method == "ANGLE":
        lim = math.degrees(mb[0].angle_limit)
        # rounding facets whose edges reach the bevel's angle limit get beveled; on facets
        # narrower than 2 x width those bevels overlap and clamp the WHOLE bevel (verified)
        r["beveled_narrow_facet_edges"] = sum(
            1 for e in cbm.edges if len(e.link_faces) == 2 and (_dihedral(e) or 0) >= lim - 0.5
            and max(_thickness(f) for f in e.link_faces) < 2 * mb[0].width)
    bmod = next((m for m in target.modifiers if m.type == "BOOLEAN" and m.object == cutter), None)
    ref = _state_before(target, bmod)
    tbm = _bm(ref, target.matrix_world)
    _free(ref)
    tree = BVHTree.FromBMesh(tbm)
    tbm.free()
    ctree = BVHTree.FromBMesh(cbm)
    cop, nearf, thin, gap = set(), set(), set(), set()
    wall_min, wall_at, gap_min = None, None, None
    for p, n, fi in _face_samples(cbm):
        loc, tn, ti, d = tree.find_nearest(p)
        if loc is None:
            continue
        parallel = abs(abs(tn.dot(n)) - 1) < 1e-3
        if parallel and d < eps:
            cop.add(fi)
        elif parallel and d < near:
            nearf.add(fi)
        if op == "DIFFERENCE" and (p - loc).dot(tn) < -eps:       # sample inside the target
            hit = tree.ray_cast(p + n * 1e-6, n, near)
            # a slab, not the knife edge every cut wall makes where it meets a curved skin
            if hit[0] is not None and hit[3] > eps and abs(hit[1].dot(n)) > 0.7:
                thin.add(fi)
                if wall_min is None or hit[3] < wall_min:
                    wall_min, wall_at = hit[3], p.copy()
            # the cut itself too narrow: the cutter's opposite face closer than the band
            own = ctree.ray_cast(p - n * 1e-6, -n, near)
            if own[0] is not None and own[3] > eps and own[1].dot(n) < -0.7:
                gap.add(fi)
                gap_min = own[3] if gap_min is None else min(gap_min, own[3])
    r["coplanar_faces"] = len(cop)
    r["near_parallel_faces"] = len(nearf)
    r["thin_wall_faces"] = len(thin)
    r["thin_wall_min"] = round(wall_min, 5) if wall_min is not None else None
    r["thin_wall_at"] = [round(x, 4) for x in wall_at] if wall_at is not None else None
    r["narrow_gap_faces"] = len(gap)
    r["narrow_gap_min"] = round(gap_min, 5) if gap_min is not None else None
    dists, inside = [], 0
    for v in cbm.verts:
        loc, no, idx, d = tree.find_nearest(v.co)
        if loc is None:
            continue
        dists.append(d)
        if (v.co - loc).dot(no) < 0:
            inside += 1
    r["verts_inside_target"] = inside
    # a long bar can have every vertex buried and still cross the surface: test samples too
    r["pokes_out"] = inside < len(cbm.verts) or any(
        not _inside(tree, p) for p, _, _ in _face_samples(cbm, 3))
    r["near_miss_verts"] = sum(1 for d in dists if eps < d < near)
    r["near_band"] = round(near, 6)
    cbm.free()
    return r


def boolean_report(ob, try_solvers=False):
    """Per boolean: does it change the mesh, did it empty it (Exact drops the whole result on
    a broken operand, Ryuu), operand manifold. try_solvers: evaluate EXACT/MANIFOLD/FLOAT
    and report vertex and non-manifold counts (diagnose, then repair the operand)."""
    out = []
    full = _eval_copy(ob)
    n_full = len(full.vertices)
    _free(full)
    for m in [m for m in ob.modifiers if m.type == "BOOLEAN"]:
        e = {"boolean": m.name, "solver": m.solver, "operation": m.operation,
             "enabled": m.show_viewport}
        wo = _toggle_eval(ob, [m])
        n_wo = len(wo.vertices)
        e["changes_mesh"] = n_full != n_wo
        e["result_empty"] = n_full == 0 and n_wo > 0
        _free(wo)
        if m.object is not None:
            cme = _eval_copy(m.object)
            cbm = _bm(cme)
            e["operand_non_manifold"] = sum(1 for x in cbm.edges if not x.is_manifold)
            cbm.free()
            _free(cme)
        if try_solvers:
            old = m.solver
            e["solvers"] = {}
            for s in ("EXACT", "MANIFOLD", "FLOAT"):
                m.solver = s
                me = _eval_copy(ob)
                bm = _bm(me)
                e["solvers"][s] = {"verts": len(me.vertices), "cut_applied": len(me.vertices) != n_wo,
                                   "non_manifold": sum(1 for x in bm.edges if not x.is_manifold)}
                bm.free()
                _free(me)
            m.solver = old
        out.append(e)
    return out


def _curved_faces_pre(ob, angle):
    """Faces of the pre-boolean evaluated mesh (mirror, design bevel, solidify applied) that
    sit on a curved region: a neighbour at 1 to `angle` degrees that is not a thin strip."""
    me = _state_before(ob, None)
    bm = _bm(me, ob.matrix_world)
    _free(me)
    curved = set()
    for f in bm.faces:
        t = _thickness(f)
        for e in f.edges:
            a = _dihedral(e)
            if a is None or not (1.0 < a <= angle):
                continue
            other = next(x for x in e.link_faces if x != f)
            if _thickness(other) > 0.3 * t:
                curved.add(f.index)
                break
    return bm, curved


def cuts_on_curvature(ob, angle=30.0):
    """Cutters whose volume meets curved base faces: the cut will end on a curved surface and
    its beveled n-gons cannot shade cleanly (Gambrell). Fix: end the cut on a flat area, or
    transfer_normals()."""
    bm, curved = _curved_faces_pre(ob, angle)
    out = []
    if curved:
        ttree = BVHTree.FromBMesh(bm)
        for c in cutters_of(ob):
            cme = _eval_copy(c)
            cbm = _bm(cme, c.matrix_world)
            _free(cme)
            ctree = BVHTree.FromBMesh(cbm)
            hits = {a for a, b in ttree.overlap(ctree)} & curved
            for i in curved - hits:            # faces fully inside the cutter
                if _inside(ctree, bm.faces[i].calc_center_median()):
                    hits.add(i)
            cbm.free()
            if hits:
                out.append({"cutter": c.name, "curved_faces_hit": len(hits)})
    bm.free()
    return out


def _normal_checks(ob, me, panel_min, flat_tol, hard_deg, curve_max, fold_area=0.0):
    """Flat-face smear and smoothed hard edges on the evaluated mesh (world space)."""
    mw = ob.matrix_world
    nl = len(me.loops)
    cn = np.empty(nl * 3)
    me.corner_normals.foreach_get("vector", cn)
    cn = cn.reshape(-1, 3)
    rot = np.array(mw.to_3x3().inverted().transposed())
    cn = cn @ rot.T
    cn /= np.maximum(np.linalg.norm(cn, axis=1, keepdims=True), 1e-12)
    bm = _bm(me, mw)
    loop_start = [p.loop_start for p in me.polygons]
    thick = [_thickness(f) for f in bm.faces]
    panel_area = bad_area = 0.0
    bad, worst = [], 0.0
    ngon_curved = 0
    for f in bm.faces:
        t = thick[f.index]
        curved = False
        for e in f.edges:
            a = _dihedral(e)
            if a is not None and 1.0 < a <= curve_max:
                other = next(x for x in e.link_faces if x != f)
                if thick[other.index] > 0.3 * t:
                    curved = True
                    break
        if curved:
            if len(f.verts) > 4:
                ngon_curved += 1
            continue
        if t < panel_min:
            continue
        n = np.array(f.normal)
        ls = loop_start[f.index]
        dots = np.clip(cn[ls:ls + len(f.loops)] @ n, -1, 1)
        dev = float(np.degrees(np.arccos(dots.min())))
        area = f.calc_area()
        panel_area += area
        if dev > flat_tol:
            bad_area += area
            bad.append((dev, f.calc_center_median().copy()))
        worst = max(worst, dev)
    smoothed_hard, folds, tiny_folds = [], [], 0
    for e in bm.edges:
        a = _dihedral(e)
        if a is None or a < hard_deg:
            continue
        f1, f2 = e.link_faces
        if a > 150.0:                       # folded-back faces: degenerate, not a hard edge
            if min(f1.calc_area(), f2.calc_area()) > fold_area:
                folds.append((e.verts[0].co + e.verts[1].co) / 2)
            else:
                tiny_folds += 1             # bevel-corner specks, invisible at viewing distance
            continue
        for v in e.verts:
            l1 = next(l for l in f1.loops if l.vert == v)
            l2 = next(l for l in f2.loops if l.vert == v)
            i1 = loop_start[f1.index] + list(f1.loops).index(l1)
            i2 = loop_start[f2.index] + list(f2.loops).index(l2)
            if float(cn[i1] @ cn[i2]) > math.cos(math.radians(5.0)):
                smoothed_hard.append((e.verts[0].co + e.verts[1].co) / 2)
                break
    bm.free()
    bad.sort(key=lambda t: -t[0])
    return {
        "panel_faces_checked_area": round(panel_area, 6),
        "smear_faces": len(bad),
        "smear_area_pct": round(100 * bad_area / panel_area, 2) if panel_area else 0.0,
        "smear_worst_deg": round(worst, 2),
        "smear_sample": [[round(d, 1)] + [round(x, 4) for x in c] for d, c in bad[:8]],
        "smoothed_hard_edges": len(smoothed_hard),
        "smoothed_hard_sample": [[round(x, 4) for x in p] for p in smoothed_hard[:8]],
        "folded_edges": len(folds), "folded_sample": [[round(x, 4) for x in p] for p in folds[:8]],
        "tiny_folded_edges": tiny_folds,
        "ngons_on_curvature_eval": ngon_curved,
    }


def subd_cage_report(ob, aspect_max=2.5):
    """School B cage metrics [added thresholds]: quads %, quad aspect (longer over shorter
    mid-edge span), share of long rectangles excluding support strips (short side under a
    quarter of the median edge), creased edge length."""
    me = ob.data
    bm = _bm(me, ob.matrix_world)
    lens = sorted(e.calc_length() for e in bm.edges)
    med = lens[len(lens) // 2] if lens else 0.0
    quads = [f for f in bm.faces if len(f.verts) == 4]
    asp, rect = [], 0
    for f in quads:
        v = [x.co for x in f.verts]
        a = ((v[0] + v[1]) / 2 - (v[2] + v[3]) / 2).length
        b = ((v[1] + v[2]) / 2 - (v[3] + v[0]) / 2).length
        lo, hi = min(a, b), max(a, b)
        if lo <= 0:
            continue
        r = hi / lo
        asp.append(r)
        if r > aspect_max and lo >= 0.25 * med:
            rect += 1
    cr = me.attributes.get("crease_edge")
    crease_len = 0.0
    if cr:
        vals = [d.value for d in cr.data]
        crease_len = sum(bm.edges[i].calc_length() for i, x in enumerate(vals) if x > 0.9)
    asp.sort()
    out = {
        "quads_pct": round(100 * len(quads) / len(bm.faces), 1) if bm.faces else 0.0,
        "aspect_p50": round(asp[len(asp) // 2], 2) if asp else None,
        "aspect_p90": round(asp[int(0.9 * (len(asp) - 1))], 2) if asp else None,
        "long_rectangles": rect,
        "full_crease_length": round(crease_len, 4),
        "full_crease_length_rel": round(crease_len / _size(ob), 3),
    }
    bm.free()
    return out


def shading_audit(ob, flat_tol=3.0, hard_deg=45.0, planar_tol=None, panel_min=None,
                  cutters=True, slivers=True):
    """Everything code can say about hard-surface shading before you look at a render.
    Thresholds: flat_tol = degrees a corner normal may lean off its flat face [added],
    hard_deg = dihedral above which smoothing across an edge is an error [added]."""
    r = {"object": ob.name}
    r["stack"] = [m.name + ("*" if m.use_pin_to_last else "") for m in ob.modifiers]
    r["stack_problems"] = stack_problems(ob)
    s = ob.matrix_basis.to_scale()
    r["scale_applied"] = max(abs(s.x - 1), abs(s.y - 1), abs(s.z - 1)) < 1e-4
    mods = [m for m in ob.modifiers if m.show_viewport]
    micro = [m for m in mods if role(m) == "micro_bevel"]
    has_subsurf = any(m.type == "SUBSURF" for m in mods)
    r["school"] = "B (subdivision)" if has_subsurf else "A (bevel + custom normals)"
    expects_custom = any(role(m) in {"weighted_normal", "normal_transfer"} for m in mods) or \
        any(m.harden_normals for m in micro)
    me = _eval_copy(ob)
    try:
        r["eval_verts"], r["eval_faces"] = len(me.vertices), len(me.polygons)
        me.calc_loop_triangles()
        r["eval_tris"] = len(me.loop_triangles)
        r["custom_normals"] = bool(me.has_custom_normals)
        r["custom_normals_expected"] = expects_custom
        bm = _bm(me)
        r["eval_non_manifold_edges"] = sum(1 for e in bm.edges if not e.is_manifold)
        r["eval_ngons"] = sum(1 for f in bm.faces if len(f.verts) > 4)
        bm.free()
        r["eval_flat_shaded_faces"] = sum(1 for p in me.polygons if not p.use_smooth)
        if not has_subsurf and len(me.polygons):
            w = micro[0].width if micro else 0.0
            pm = panel_min if panel_min is not None else (2.5 * w if w else 0.02 * _size(ob))
            curve_max = math.degrees(micro[0].angle_limit) if micro else 45.0
            r["normals"] = _normal_checks(ob, me, pm, flat_tol, hard_deg, curve_max,
                                          fold_area=(w if w else 0.005 * _size(ob)) ** 2)
    finally:
        _free(me)
    base = ob.data
    r["base_flat_shaded_faces"] = sum(1 for p in base.polygons if not p.use_smooth)
    sh = base.attributes.get("sharp_edge")
    sharp_on_smooth = 0
    if sh:
        bmb = _bm(base, ob.matrix_world)
        for e in bmb.edges:
            a = _dihedral(e)
            if sh.data[e.index].value and a is not None and a < 5.0:
                sharp_on_smooth += 1
        bmb.free()
    r["sharp_edges_on_smooth_surface"] = sharp_on_smooth
    npf = nonplanar_faces(ob, planar_tol)
    r["nonplanar_base_faces"] = len(npf)
    r["nonplanar_worst"] = round(npf[0][1], 6) if npf else 0.0
    r["nonplanar_sample"] = [i for i, _ in npf[:10]]
    r["base_ngons"] = sum(1 for p in base.polygons if p.loop_total > 4)
    angle = math.degrees(micro[0].angle_limit) if micro else 30.0
    r["cuts_on_curvature"] = cuts_on_curvature(ob, angle) if cutters else []
    r["has_normal_transfer"] = any(role(m) == "normal_transfer" for m in mods)
    if micro:
        r["clamp"] = [clamp_probe(ob, m) for m in micro]
        if any(c and (c.get("topology_changed") or (c.get("ratio") or 0) > 0.1) for c in r["clamp"]):
            r["clamp_culprits"] = clamp_culprits(ob)
    if cutters and any(m.type == "BOOLEAN" for m in mods):
        r["booleans"] = boolean_report(ob)
        r["cutters"] = [cutter_report(c, ob) for c in cutters_of(ob)]
        if slivers:
            r["slivers"] = sliver_report(ob)
    if has_subsurf:
        r["subd_cage"] = subd_cage_report(ob)
    return r


def verdict(r, clamp_ratio=0.1):
    """Readable problems from shading_audit (empty list = nothing code can find)."""
    out = list(r.get("stack_problems", []))
    if not r.get("scale_applied", True):
        out.append("object scale not applied")
    if r.get("custom_normals_expected") and not r.get("custom_normals"):
        out.append("custom normals expected (harden/WN) but absent on the evaluated mesh")
    if r.get("eval_non_manifold_edges"):
        out.append(f"{r['eval_non_manifold_edges']} non-manifold edges in the result")
    if r.get("eval_flat_shaded_faces"):
        out.append(f"{r['eval_flat_shaded_faces']} flat-shaded faces (cutter or base not shaded smooth): facets on bevels/cut walls")
    if r.get("sharp_edges_on_smooth_surface"):
        out.append(f"{r['sharp_edges_on_smooth_surface']} sharp-marked edges on a smooth surface: visible seam")
    if r.get("nonplanar_base_faces"):
        out.append(f"{r['nonplanar_base_faces']} non-planar base faces (worst {r['nonplanar_worst']}): flatten_faces()")
    n = r.get("normals") or {}
    if n.get("smear_faces"):
        out.append(f"normal smear on {n['smear_faces']} flat faces ({n['smear_area_pct']}% of flat area, worst {n['smear_worst_deg']} deg): "
                   "Harden Normals / Weighted Normal; if they change nothing, the face is not planar")
    if n.get("folded_edges"):
        out.append(f"{n['folded_edges']} folded-back faces (dihedral > 150 deg) near {n['folded_sample'][:2]}: degenerate geometry, check a closeup")
    if n.get("smoothed_hard_edges"):
        out.append(f"{n['smoothed_hard_edges']} hard edges smoothed across: micro bevel, Smooth by Angle or WN Keep Sharp")
    if not r.get("has_normal_transfer"):
        for c in r.get("cuts_on_curvature", []):
            out.append(f"{c['cutter']} ends on a curved surface ({c['curved_faces_hit']} faces): check a closeup; "
                       "if it stretches, end it on a flat area or transfer_normals()")
    for c in r.get("clamp") or []:
        if c is None:
            continue
        if c.get("topology_changed"):
            out.append(f"{c['bevel']}: Clamp Overlap changes topology: overlapping geometry near a cut")
        elif c.get("ratio") is not None and c["ratio"] > clamp_ratio:
            out.append(f"{c['bevel']}: Clamp Overlap moves verts by {c['ratio']} x width (the whole bevel shrinks); "
                       f"caused by {r.get('clamp_culprits') or 'several cuts together'}")
    for b in r.get("booleans", []):
        if b.get("enabled") and not b.get("changes_mesh"):
            out.append(f"{b['boolean']} changes nothing (cutter misses the target, or Exact dropped the result)")
        if b.get("result_empty"):
            out.append(f"{b['boolean']} empties the mesh: broken operand, diagnose with try_solvers")
        if b.get("operand_non_manifold"):
            out.append(f"{b['boolean']}: operand has {b['operand_non_manifold']} non-manifold edges")
    for c in r.get("cutters", []):
        if not c["scale_applied"]:
            out.append(f"{c['cutter']}: scale not applied")
        if not c["smooth"]:
            out.append(f"{c['cutter']}: not smooth shaded (facets transfer into the cut)")
        if not c["hide_render"] or c["display"] not in ("WIRE", "BOUNDS"):
            out.append(f"{c['cutter']}: visible in render or solid display")
        if not c["only_in_cutters"]:
            out.append(f"{c['cutter']}: linked outside the Cutters collection {c['collections']}")
        if c["coplanar_faces"]:
            out.append(f"{c['cutter']}: {c['coplanar_faces']} faces coplanar with the target (Z-fighting; keep EXACT or offset it)")
        if c["near_parallel_faces"] or c["near_miss_verts"]:
            out.append(f"{c['cutter']}: {c['near_parallel_faces']} faces / {c['near_miss_verts']} verts within {c['near_band']} of a target surface: "
                       "thin polygons; move it clearly past or make it coincident")
        if c.get("narrow_gap_faces"):
            out.append(f"{c['cutter']}: cuts a gap of {c['narrow_gap_min']} (under 2 x bevel width): the rim bevels meet; widen it or thin the bevel")
        if c.get("thin_wall_faces"):
            out.append(f"{c['cutter']}: leaves a wall of {c['thin_wall_min']} near {c['thin_wall_at']} (under 2 x bevel width): "
                       "move or resize the cut, or thin the bevel")
        if c.get("beveled_narrow_facet_edges"):
            out.append(f"{c['cutter']}: {c['beveled_narrow_facet_edges']} rounding edges reach the bevel angle limit on facets "
                       "narrower than 2 x width: use more segments (facet angle well under the limit)")
        if not c["pokes_out"]:
            out.append(f"{c['cutter']}: entirely inside the target (does not break the surface)")
    sl = r.get("slivers") or {}
    clamping = any(c and (c.get("topology_changed") or (c.get("ratio") or 0) > clamp_ratio)
                   for c in r.get("clamp") or [])
    for b in sl.get("per_boolean", []) if clamping else []:   # locate the cause of clamping
        if b["pre_short_added"] > 0 or b["pre_thin_added"] > 0:
            out.append(f"{b['boolean']}: adds {b['pre_short_added']} edges / {b['pre_thin_added']} faces smaller than the micro bevel "
                       f"next to beveled edges ({b.get('pre_defects_near_cutter', '?')} near the cutter, e.g. {b.get('pre_defect_sample', [])[:2]})")
    sc = r.get("subd_cage")
    if sc:
        if sc["long_rectangles"]:
            out.append(f"subD cage: {sc['long_rectangles']} long rectangles (aspect > 2.5): square them if the cage will be "
                       "sculpted or subdivided further (PzThree)")
        if sc["full_crease_length_rel"] > 0.5:
            out.append("subD: long fully creased edges; creases cost about 10x the triangles of support loops at equal quality (Lampel)")
    return out


# --------------------------------------------------------------------------------------
# review
# --------------------------------------------------------------------------------------
EXTRA_MODES = {"shiny": "metal_carpaint.exr", "reflect": "check_reflection_horizontal.exr",
               "hsgrey": "hard_surface_grey.exr", "fullmetal": "fullmetal.exr"}


def _collapsed_copies(objs):
    copies = []
    for o in objs:
        me = _eval_copy(o)
        c = bpy.data.objects.new(o.name + "_HSreview", me)
        c.matrix_world = o.matrix_world.copy()
        bpy.context.scene.collection.objects.link(c)
        copies.append(c)
    bpy.context.view_layer.update()
    return copies


def _remove_copies(copies):
    for c in copies:
        me = c.data
        bpy.data.objects.remove(c)
        _free(me)


def review(objs, out_dir, views=("front", "threequarter", "top", "low"),
           modes=("matcap", "hsgrey", "reflect", "wire"), res=640):
    """bx_review contact sheet of the EVALUATED meshes (booleans, bevels, custom normals
    baked into temporary copies, so the wire row shows the real boolean topology and the
    cutters never appear). Extra modes on top of bx_review's: shiny (metal_carpaint),
    reflect (check_reflection_horizontal), hsgrey (hard_surface_grey), fullmetal."""
    import bx_review
    orig = bx_review._set_mode

    def patched(sc, world, mode, o, wires):
        if mode in EXTRA_MODES:
            orig(sc, world, "matcap", o, wires)
            sc.display.shading.studio_light = EXTRA_MODES[mode]
        else:
            orig(sc, world, mode, o, wires)

    copies = _collapsed_copies(objs)
    bx_review._set_mode = patched
    try:
        return bx_review.review(copies, out_dir, views=views, modes=modes, res=res)
    finally:
        bx_review._set_mode = orig
        _remove_copies(copies)


def closeup(ob, point, radius, out_path, direction=(-0.6, -1.0, 0.8), mode="shiny", res=640,
            lens=50.0):
    """One perspective close-up of the evaluated object around `point` (world), framing a
    sphere of `radius`. Use it on each cut: smears and bevel shrink are too small to judge
    on a whole-object sheet."""
    import bx_review
    copies = _collapsed_copies([ob])
    sc, cam, world = bx_review._setup_scene(copies, res)
    try:
        if mode in EXTRA_MODES:
            bx_review._set_mode(sc, world, "matcap", copies, [])
            sc.display.shading.studio_light = EXTRA_MODES[mode]
        else:
            bx_review._set_mode(sc, world, mode, copies, [])
        cam.data.type, cam.data.lens = "PERSP", lens
        fov = 2 * math.atan(cam.data.sensor_width / (2 * lens))
        dist = radius / math.sin(fov / 2)
        cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 20
        bx_review._look_at(cam, Vector(point), Vector(direction).normalized(), dist)
        sc.render.filepath = out_path
        bpy.ops.render.render(write_still=True, scene=sc.name)
    finally:
        bx_review._cleanup(sc, cam, world)
        _remove_copies(copies)
    return out_path


# --------------------------------------------------------------------------------------
# game
# --------------------------------------------------------------------------------------
def tri_count(ob):
    me = _eval_copy(ob)
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    _free(me)
    return n


def game_version(ob, name=None, micro_segments=1, design_segments=None, triangulate=True):
    """Gambrell's game route: a copy with fewer bevel segments, Triangulate (keep custom
    normals) after Weighted Normal. Returns (copy, evaluated tris). Check it in a matcap and
    against the budget; bake-based routes live in scenario-blender-retopology / scenario-blender-uv-baking."""
    g = ob.copy()
    g.data = ob.data.copy()
    g.name = name or ob.name + "_game"
    for c in ob.users_collection:
        c.objects.link(g)
    for m in g.modifiers:
        if m.type == "BEVEL":
            if role(m) == "micro_bevel":
                m.segments = micro_segments
            elif design_segments is not None:
                m.segments = design_segments
    if triangulate and not any(m.type == "TRIANGULATE" for m in g.modifiers):
        t = g.modifiers.new("Triangulate", "TRIANGULATE")
        t.keep_custom_normals = True
    order_stack(g, pin=True)
    return g, tri_count(g)


def collapse(ob, name=None, link=True):
    """du Mont's rig/export prep without operators: a new object from the evaluated mesh
    (modifiers baked, custom normals kept), same transform and collections."""
    me = _eval_copy(ob)
    me.name = (name or ob.name + "_collapsed")
    c = bpy.data.objects.new(me.name, me)
    c.matrix_world = ob.matrix_world.copy()
    if link:
        for col in ob.users_collection:
            col.objects.link(c)
    return c
