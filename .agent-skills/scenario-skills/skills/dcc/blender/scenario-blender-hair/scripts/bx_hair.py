"""
bx_hair: headless hair-curves grooming for Blender 5.2 (tested on 5.2.1 LTS).

What experts do with a tablet (place guides, comb, add procedural layers, judge a
render) done from Python. Brush strokes on hair curves are NOT scriptable in 5.2.1
(sculpt_curves.brush_stroke has no exec, see SKILL.md), so guides are written as
data and every look decision goes through the Essentials hair node-group assets.

  import sys; sys.path.append("<skill>/scripts"); import bx_hair as H
  hair = H.new_groom(scalp)                                  # Empty Hair: parent, surface, UV map, Hair Dynamics
  P, N = H.sample_roots(scalp, spacing=0.01, mask="density_fur")
  H.add_guides(hair, P, N, length=0.03, points=2, flow=(0, 0, -1), flow_blend=0.6)
  md = H.add_asset(hair, "Interpolate Hair Curves")
  H.set_inputs(md, {"Density": 20000, "Density Mask": "attr:density_fur"})
  H.random_curve_mask(hair, "frizz_mask", threshold=0.8)    # Simon: 80% of strands get no frizz
  fz = H.add_asset(hair, "Frizz Hair Curves"); H.set_inputs(fz, {"Factor": "attr:frizz_mask"})
  print(H.count(hair)); rep = H.groom_report(hair); print(H.verdict(rep))
  H.review([scalp, hair], "/abs/out", engine="CYCLES")     # lit render sheet, open it with the image reader

Every function works in a live GUI session too (object mode). Values are metres.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector, kdtree

HAIR_LIB = "nodes/procedural_hair_node_assets.blend"
DYN_LIB = "nodes/geometry_nodes_dynamics_assets.blend"
DYNAMICS_ASSETS = {"Hair Dynamics", "Cloth Dynamics (Experimental)", "Collider", "Custom Force"}
# Modifier assets in procedural_hair_node_assets.blend (5.2.1), by asset-browser catalog.
HAIR_ASSETS = {
    "Generation": ["Interpolate Hair Curves", "Duplicate Hair Curves", "Generate Hair Curves"],
    "Guides": ["Clump Hair Curves", "Curl Hair Curves", "Braid Hair Curves", "Create Guide Index Map"],
    "Deformation": ["Hair Curves Noise", "Frizz Hair Curves", "Trim Hair Curves", "Rotate Hair Curves",
                    "Roll Hair Curves", "Displace Hair Curves", "Shrinkwrap Hair Curves",
                    "Smooth Hair Curves", "Straighten Hair Curves", "Blend Hair Curves"],
    "Write": ["Set Hair Curve Profile"],
    "Utility": ["Attach Hair Curves to Surface", "Redistribute Curve Points",
                "Restore Curve Segment Length"],
    # node-only (no modifier): Attachment Info, Curve Info, Curve Root, Curve Segment, Curve Tip
}
DEFORMERS = set(HAIR_ASSETS["Guides"] + HAIR_ASSETS["Deformation"]) - {"Create Guide Index Map"}

# Simon Thommes' highland-cow long fur (Blender Studio, gCQN5vNgHiI), values from the talk.
# Absolute metres: tuned for a real-size animal patch. Entries marked [added] are not in the talk.
FUR_STACK_LONG = [
    ("Set Hair Curve Profile", {"Radius": 0.0002}),                                    # 0.2 mm at 1M/m2
    ("Interpolate Hair Curves", {"Density": 1_000_000.0, "Viewport Amount": 0.04}),
    ("Hair Curves Noise", {}),                                                         # Factor: paint a mask
    ("Curl Hair Curves", {"Radius": 0.02, "Curl Start": 1.0, "Factor End": 0.3,         # Factor End "much lower" [added 0.3]
                          "Random Offset": 0.5, "Existing Guide Map": False,
                          "Guide Distance": 0.01, "Guide Mask": 0.2}),
    ("Hair Curves Noise", {"Distance": 0.005, "Factor": "attr:stray_mask"}),           # strays: 10% of curves
    ("Frizz Hair Curves", {"Distance": 0.002, "Shape": -0.5}),                          # negative shape (value [added])
    ("Clump Hair Curves", {"Existing Guide Map": False, "Guide Distance": 0.001,
                           "Guide Mask": 0.1, "Shape": 0.3}),                           # "lower Shape" [added 0.3]
    ("Clump Hair Curves", {"Existing Guide Map": False, "Guide Distance": 0.004,
                           "Guide Mask": 0.25, "Clump Offset": 0.005}),
    ("Frizz Hair Curves", {"Shape": -0.2, "Distance": 0.002, "Cumulative Offset": False,
                           "Factor": "attr:frizz_mask"}),
    ("Trim Hair Curves", {"Replace Length": False, "Random Offset": 0.005}),
    ("Rotate Hair Curves", {"Random Offset": math.radians(5)}),
]


# ----------------------------------------------------------------------------- basics
def _s(sockets, key):
    """Socket by identifier, else by name among enabled sockets (Mix, Capture Attribute
    and other dynamic nodes reuse names like 'A' or 'Result' across data types)."""
    for sk in sockets:
        if sk.identifier == key:
            return sk
    for sk in sockets:
        if sk.name == key and sk.enabled:
            return sk
    raise KeyError(key)


def _ctx_obj(obj):
    return bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                     selected_editable_objects=[obj])


def _object_mode():
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def new_groom(surface, name="Hair"):
    """Add an empty hair curves object on `surface` (Add > Curve > Empty Hair).
    Sets parent, data.surface, data.surface_uv_map (active UV map) and a pinned
    Hair Dynamics modifier in Animation mode (moves hair with the deforming surface)."""
    if surface.type != "MESH" or not surface.data.uv_layers:
        raise ValueError("surface must be a mesh with a UV map (hair binds to UV space)")
    _object_mode()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    surface.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.curves_empty_hair_add()
    hair = bpy.context.active_object
    hair.name = hair.data.name = name
    bpy.context.view_layer.update()
    return hair


def _mesh_arrays(surface):
    me = surface.data
    me.calc_loop_triangles()
    tris = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tris)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    vn = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get("vector", vn)
    return tris.reshape(-1, 3), co.reshape(-1, 3), vn.reshape(-1, 3)


def group_weights(obj, group):
    """Per-vertex weights of a vertex group as a numpy array (0 where unassigned)."""
    vg = obj.vertex_groups[group]
    w = np.zeros(len(obj.data.vertices), np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == vg.index:
                w[v.index] = g.weight
    return w


def sample_roots(surface, spacing, mask=None, threshold=0.5, seed=0, max_roots=200_000):
    """Evenly spaced guide roots on the surface (Poisson-disk dart throwing).
    Kerstin: even spacing matters more than count; gaps become bald spots.
    Returns (P, N) world-space positions and smooth normals, numpy (n, 3)."""
    tris, co, vn = _mesh_arrays(surface)
    M = np.array(surface.matrix_world, dtype=np.float64)
    R = M[:3, :3]
    cw = co @ R.T + M[:3, 3]
    nrm_m = np.linalg.inv(R).T
    nw = vn @ nrm_m.T
    a, b, c = cw[tris[:, 0]], cw[tris[:, 1]], cw[tris[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    total = float(area.sum())
    n_cand = int(min(max_roots * 6, max(64, 6 * total / (spacing * spacing))))
    rng = np.random.default_rng(seed)
    ti = rng.choice(len(tris), n_cand, p=area / total)
    s = np.sqrt(rng.random(n_cand))
    r2 = rng.random(n_cand)
    u, v, w = 1 - s, s * (1 - r2), s * r2
    t = tris[ti]
    P = a[ti] * u[:, None] + b[ti] * v[:, None] + c[ti] * w[:, None]
    N = nw[t[:, 0]] * u[:, None] + nw[t[:, 1]] * v[:, None] + nw[t[:, 2]] * w[:, None]
    N /= np.linalg.norm(N, axis=1)[:, None] + 1e-12
    if mask:
        wv = group_weights(surface, mask)
        wp = wv[t[:, 0]] * u + wv[t[:, 1]] * v + wv[t[:, 2]] * w
        keep = wp >= threshold
        P, N = P[keep], N[keep]
    # dart throwing on a hash grid, cell = spacing
    grid, keep = {}, []
    inv = 1.0 / spacing
    s2 = spacing * spacing
    for i, p in enumerate(P):
        k = (int(math.floor(p[0] * inv)), int(math.floor(p[1] * inv)), int(math.floor(p[2] * inv)))
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        d = P[j] - p
                        if d @ d < s2:
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    break
            if not ok:
                break
        if ok:
            grid.setdefault(k, []).append(i)
            keep.append(i)
            if len(keep) >= max_roots:
                break
    keep = np.array(keep, dtype=np.int64)
    return P[keep], N[keep]


def add_guides(hair, roots, normals, length, points=2, flow=None, flow_blend=0.0,
               droop=0.0, snap=True):
    """Write guide curves (the tablet-free replacement for the Add brush).

    roots, normals: (n, 3) world space (from sample_roots). length: float or (n,).
    points: Kerstin grooms with 2 points until every direction is right, 3 for short
    fur, up to 8 for long hair; Bystedt resamples long human hair to 15.
    flow: None, a world vector, or callable(P, N) -> (n, 3) flow directions; it is
    projected on the surface tangent plane and blended with the normal by flow_blend
    (0 = straight out, 1 = lying on the surface). droop: tip sag along -Z as a fraction
    of length (needs points >= 3 to bend). snap: snap_curves_to_surface(NEAREST), which
    writes surface_uv_coordinate (the attachment). Returns the number of curves added."""
    _object_mode()
    P = np.asarray(roots, np.float64)
    N = np.asarray(normals, np.float64)
    n = len(P)
    if n == 0:
        return 0
    L = np.broadcast_to(np.asarray(length, np.float64), (n,))
    d = N.copy()
    if flow is not None and flow_blend > 0:
        F = flow(P, N) if callable(flow) else np.broadcast_to(np.asarray(flow, np.float64), (n, 3))
        T = F - (F * N).sum(1)[:, None] * N
        T /= np.linalg.norm(T, axis=1)[:, None] + 1e-12
        d = (1 - flow_blend) * N + flow_blend * T
        d /= np.linalg.norm(d, axis=1)[:, None] + 1e-12
    t = np.linspace(0.0, 1.0, points)
    pts = P[:, None, :] + d[:, None, :] * (L[:, None, None] * t[None, :, None])
    if droop:
        pts[:, :, 2] -= droop * L[:, None] * t[None, :] ** 2
    inv = np.array(hair.matrix_world.inverted(), dtype=np.float64)
    loc = pts.reshape(-1, 3) @ inv[:3, :3].T + inv[:3, 3]
    cv = hair.data
    old = len(cv.points)
    cv.add_curves([points] * n)
    buf = np.empty(len(cv.points) * 3, np.float32)
    cv.attributes["position"].data.foreach_get("vector", buf)
    buf[old * 3:] = loc.ravel()
    cv.attributes["position"].data.foreach_set("vector", buf)
    cv.update_tag()
    if snap:
        snap_to_surface(hair, "NEAREST")
    return n


def snap_to_surface(hair, mode="NEAREST"):
    """NEAREST: move each curve so its root sits on the closest surface point and store
    the attachment UV. DEFORM: re-place curves from their stored UV after the surface
    was edited (Simon: Snap to Deformed Surface)."""
    _object_mode()
    with _ctx_obj(hair):
        return bpy.ops.curves.snap_curves_to_surface(attach_mode=mode)


def subdivide_guides(hair, cuts=1):
    """Add points to every guide (Edit Mode curves.subdivide, works headless)."""
    _object_mode()
    with _ctx_obj(hair):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.curves.select_all(action="SELECT")
        bpy.ops.curves.subdivide(number_cuts=cuts)
        bpy.ops.object.mode_set(mode="OBJECT")
    return len(hair.data.points) // max(1, len(hair.data.curves))


def resample_guides(hair, count=15):
    """Bystedt: resample guides to a fixed point count, then apply (bakes the new points)."""
    ng = bpy.data.node_groups.get("BX Resample Curves") or _resample_group()
    md = hair.modifiers.new("BX Resample", "NODES")
    md.node_group = ng
    set_inputs(md, {"Count": int(count)})
    with _ctx_obj(hair):
        bpy.ops.object.modifier_move_to_index(modifier=md.name, index=0)
        bpy.ops.object.modifier_apply(modifier=md.name)
    return len(hair.data.points) // max(1, len(hair.data.curves))


def _resample_group():
    ng = bpy.data.node_groups.new("BX Resample Curves", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    s = ng.interface.new_socket("Count", in_out="INPUT", socket_type="NodeSocketInt")
    s.default_value, s.min_value = 15, 2
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
    rs = ng.nodes.new("GeometryNodeResampleCurve")
    ng.links.new(gi.outputs["Geometry"], rs.inputs["Curve"])
    ng.links.new(gi.outputs["Count"], rs.inputs["Count"])
    ng.links.new(rs.outputs["Curve"], go.inputs["Geometry"])
    return ng


# ----------------------------------------------------------------------------- assets
def add_asset(hair, name, label=None, index=None):
    """Add an Essentials hair (or dynamics) node-group asset as a modifier. New modifiers
    land above the pinned Hair Dynamics. Returns the modifier."""
    _object_mode()
    lib = DYN_LIB if name in DYNAMICS_ASSETS else HAIR_LIB
    with _ctx_obj(hair):
        bpy.ops.object.modifier_add_node_group(
            asset_library_type="ESSENTIALS", asset_library_identifier="",
            relative_asset_identifier=f"{lib}/NodeTree/{name}")
    md = hair.modifiers.active
    if label:
        md.name = label
    if index is not None:
        move(hair, md, index)
    return md


def move(hair, md, index):
    with _ctx_obj(hair):
        bpy.ops.object.modifier_move_to_index(modifier=md.name, index=index)


def _input_items(md):
    out = {}
    for it in md.node_group.interface.items_tree:
        if it.item_type == "SOCKET" and it.in_out == "INPUT" and it.socket_type != "NodeSocketGeometry":
            out.setdefault(it.name, []).append(it)
    return out


def _resolve(md, key, value):
    ins = md.properties.inputs
    if key.startswith(("Input_", "Socket_")) and hasattr(ins, key):
        return key
    items = _input_items(md).get(key)
    if not items:
        raise KeyError(f"{md.name}: no input '{key}'. Inputs: {sorted(_input_items(md))}")
    if len(items) > 1:  # e.g. Displace/Shrinkwrap 'Surface' exists as Object and Geometry
        want = "NodeSocketObject" if isinstance(value, bpy.types.Object) else None
        for it in items:
            if (want and it.socket_type == want) or (not want and it.socket_type != "NodeSocketObject"):
                return it.identifier
    return items[0].identifier


def set_inputs(md, values):
    """Set modifier inputs by their UI name (or Input_/Socket_ identifier).
    "attr:NAME" binds the input to an attribute (a surface vertex group reaches the
    interpolated children as an attribute). Tags the object: in background the
    evaluated result stays stale without update_tag()."""
    ins = md.properties.inputs
    for key, val in values.items():
        p = getattr(ins, _resolve(md, key, val))
        if isinstance(val, str) and val.startswith("attr:"):
            p.type = "ATTRIBUTE"
            p.attribute_name = val[5:]
        else:
            if hasattr(p, "type") and p.type == "ATTRIBUTE":
                p.type = "VALUE"
            p.value = val
    md.id_data.update_tag()
    return md


def get_inputs(md):
    """{UI name: value} with 'attr:NAME' for attribute-bound inputs."""
    ins, out = md.properties.inputs, {}
    for name, items in _input_items(md).items():
        for it in items:
            p = getattr(ins, it.identifier, None)
            if p is None:
                continue
            if getattr(p, "type", "VALUE") == "ATTRIBUTE":
                v = "attr:" + p.attribute_name
            elif not hasattr(p, "value"):  # matrix / bundle sockets have no stored value
                continue
            else:
                v = p.value
                if isinstance(v, bpy.types.ID):
                    v = v.name
                elif hasattr(v, "__len__") and not isinstance(v, str):
                    v = tuple(round(x, 5) for x in v)
                elif isinstance(v, float):
                    v = round(v, 6)
            out[name if len(items) == 1 else f"{name} ({it.socket_type[10:]})"] = v
    return out


def build_stack(hair, spec, masks=True):
    """Add a list of (asset name, {inputs}) in order. With masks=True, the random curve
    masks referenced as attr:stray_mask / attr:frizz_mask are created first."""
    mods = []
    used = {v[5:] for _, vals in spec for v in vals.values() if isinstance(v, str) and v.startswith("attr:")}
    for name, vals in spec:
        md = add_asset(hair, name)
        set_inputs(md, vals)
        mods.append(md)
        if name == "Interpolate Hair Curves" and masks:
            if "stray_mask" in used:
                mods.append(random_curve_mask(hair, "stray_mask", threshold=0.9, hard=True, seed=3))
            if "frizz_mask" in used:
                mods.append(random_curve_mask(hair, "frizz_mask", threshold=0.8, seed=7))
    return mods


# ----------------------------------------------------------------------------- per-curve fields
def _attr_group(kind):
    name = {"random": "BX Random Curve Mask", "along": "BX Along Curve Ramp"}[kind]
    ng = bpy.data.node_groups.get(name)
    if ng:
        return ng
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    I = ng.interface
    I.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    I.new_socket("Name", in_out="INPUT", socket_type="NodeSocketString")
    gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
    st = ng.nodes.new("GeometryNodeStoreNamedAttribute")
    st.data_type = "FLOAT"
    if kind == "random":
        I.new_socket("Threshold", in_out="INPUT", socket_type="NodeSocketFloat").default_value = 0.8
        I.new_socket("Seed", in_out="INPUT", socket_type="NodeSocketInt")
        I.new_socket("Hard", in_out="INPUT", socket_type="NodeSocketBool")
        st.domain = "CURVE"
        rnd = ng.nodes.new("FunctionNodeRandomValue")
        rnd.data_type = "FLOAT"
        idn = ng.nodes.new("GeometryNodeInputID")
        ng.links.new(idn.outputs["ID"], rnd.inputs["ID"])
        ng.links.new(gi.outputs["Seed"], rnd.inputs["Seed"])
        mr = ng.nodes.new("ShaderNodeMapRange")          # soft: 0 below threshold, ramps to 1
        ng.links.new(rnd.outputs["Value"], mr.inputs["Value"])
        ng.links.new(gi.outputs["Threshold"], mr.inputs["From Min"])
        cmp = ng.nodes.new("FunctionNodeCompare")        # hard: 1 above threshold
        cmp.data_type, cmp.operation = "FLOAT", "GREATER_THAN"
        ng.links.new(rnd.outputs["Value"], cmp.inputs[0])
        ng.links.new(gi.outputs["Threshold"], cmp.inputs[1])
        sw = ng.nodes.new("GeometryNodeSwitch")
        sw.input_type = "FLOAT"
        ng.links.new(gi.outputs["Hard"], sw.inputs["Switch"])
        ng.links.new(mr.outputs["Result"], sw.inputs["False"])
        ng.links.new(cmp.outputs[0], sw.inputs["True"])
        val = sw.outputs["Output"]
    else:
        I.new_socket("Root", in_out="INPUT", socket_type="NodeSocketFloat").default_value = 0.0
        I.new_socket("Tip", in_out="INPUT", socket_type="NodeSocketFloat").default_value = 1.0
        st.domain = "POINT"
        sp = ng.nodes.new("GeometryNodeSplineParameter")
        mr = ng.nodes.new("ShaderNodeMapRange")
        ng.links.new(sp.outputs["Factor"], mr.inputs["Value"])
        ng.links.new(gi.outputs["Root"], mr.inputs["To Min"])
        ng.links.new(gi.outputs["Tip"], mr.inputs["To Max"])
        val = mr.outputs["Result"]
    I.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    ng.links.new(gi.outputs["Geometry"], st.inputs["Geometry"])
    ng.links.new(gi.outputs["Name"], st.inputs["Name"])
    ng.links.new(val, st.inputs["Value"])
    ng.links.new(st.outputs["Geometry"], go.inputs["Geometry"])
    return ng


def random_curve_mask(hair, attr, threshold=0.8, seed=0, hard=False, after="Interpolate Hair Curves"):
    """Store a per-CURVE random float attribute to drive an asset input with "attr:<attr>".
    Simon: randomize per curve, not per point. Soft: 0 for `threshold` of the curves,
    ramping to 1 (frizz on ~20% of strands). Hard: 1 on (1 - threshold) of the curves
    (stray hairs: threshold 0.9). Placed right after `after` (the children exist there)."""
    md = hair.modifiers.new(f"BX {attr}", "NODES")
    md.node_group = _attr_group("random")
    set_inputs(md, {"Name": attr, "Threshold": float(threshold), "Seed": int(seed), "Hard": bool(hard)})
    _place_after(hair, md, after)
    return md


def along_curve_attr(hair, attr, root=0.0, tip=1.0, after="Interpolate Hair Curves"):
    """Store a per-POINT root-to-tip ramp (Simon: curl frequency rises toward the tip)."""
    md = hair.modifiers.new(f"BX {attr}", "NODES")
    md.node_group = _attr_group("along")
    set_inputs(md, {"Name": attr, "Root": float(root), "Tip": float(tip)})
    _place_after(hair, md, after)
    return md


def _place_after(hair, md, after):
    names = [m.name for m in hair.modifiers]
    idx = next((i for i, n in enumerate(names) if after and n.startswith(after)), None)
    if idx is not None:
        move(hair, md, idx + 1)
    elif "Hair Dynamics" in names:
        move(hair, md, max(0, names.index("Hair Dynamics")))


def distance_weights(surface, group, source, radius, profile="bump"):
    """Write vertex group `group` from the distance to `source` vertices (a vertex group
    name or index list). profile 'bump': 0 on the line, 1 at radius/2, 0 at radius
    (Bystedt's parting lift curve); 'falloff': 1 on the line to 0 at radius.
    Use it as an asset Factor ("attr:<group>") after Interpolate."""
    me = surface.data
    if isinstance(source, str):
        w = group_weights(surface, source)
        src = np.nonzero(w > 0.5)[0]
    else:
        src = np.asarray(source)
    kd = kdtree.KDTree(len(src))
    for i in src:
        kd.insert(me.vertices[int(i)].co, int(i))
    kd.balance()
    vg = surface.vertex_groups.get(group) or surface.vertex_groups.new(name=group)
    for v in me.vertices:
        _, _, d = kd.find(v.co)
        x = min(1.0, d / radius)
        wv = math.sin(math.pi * x) if profile == "bump" else 1.0 - x * x * (3 - 2 * x)
        if x >= 1.0:
            wv = 0.0
        vg.add([v.index], float(wv), "REPLACE")
    return vg


# ----------------------------------------------------------------------------- measure
def count(hair, full=True):
    """Evaluated curve/point counts. full=True evaluates with every 'Viewport Amount'
    at 1.0 (render density): background evaluation uses the viewport amount."""
    saved = []
    if full:
        for md in hair.modifiers:
            if md.type == "NODES" and md.node_group and "Viewport Amount" in _input_items(md):
                p = getattr(md.properties.inputs, _resolve(md, "Viewport Amount", 1.0))
                if getattr(p, "type", "VALUE") == "VALUE":
                    saved.append((p, p.value))
                    p.value = 1.0
    hair.update_tag()
    ev = hair.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    res = {"curves": len(ev.curves), "points": len(ev.points)}
    for p, v in saved:
        p.value = v
    hair.update_tag()
    return res


def _curve_arrays(cv):
    n = len(cv.curves)
    off = np.empty(n + 1, np.int32)
    cv.curve_offset_data.foreach_get("value", off)
    pos = np.empty(len(cv.points) * 3, np.float32)
    cv.attributes["position"].data.foreach_get("vector", pos)
    return off, pos.reshape(-1, 3)


def uv_report(surface):
    """UV health of the growth surface: hair binds to UV space, so overlapping
    (stacked) UVs make curves ignore deformation (Kerstin). UDIM tiles are fine."""
    me = surface.data
    rep = {"uv_maps": [u.name for u in me.uv_layers], "active": me.uv_layers.active.name if me.uv_layers else None}
    if not me.uv_layers:
        rep["overlap_faces"] = None
        return rep
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    rep["uv_outside_0_1"] = int(((uv < -1e-4) | (uv > 1 + 1e-4)).any(1).sum())
    view_layer = bpy.context.view_layer
    prev_active, prev_sel = view_layer.objects.active, list(bpy.context.selected_objects)
    _object_mode()
    for o in prev_sel:
        o.select_set(False)
    surface.select_set(True)
    view_layer.objects.active = surface
    ts = bpy.context.scene.tool_settings
    sync = ts.use_uv_select_sync
    ts.use_uv_select_sync = False
    import bmesh
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="DESELECT")
        bpy.ops.uv.select_overlap()
        bm = bmesh.from_edit_mesh(me)
        rep["overlap_faces"] = sum(1 for f in bm.faces if all(l.uv_select_vert for l in f.loops))
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        ts.use_uv_select_sync = sync
        surface.select_set(False)
        for o in prev_sel:
            o.select_set(True)
        view_layer.objects.active = prev_active
    rep["faces"] = len(me.polygons)
    return rep


def groom_report(hair, k=6):
    """Objective groom checks (guides, attachment, spacing, length dents, stack order,
    evaluated counts, radius vs density, render settings, shader vs engine)."""
    cv, rep = hair.data, {"hair": hair.name}
    surf = cv.surface
    rep["surface"] = surf.name if surf else None
    rep["surface_uv_map"] = cv.surface_uv_map
    rep["uv_map_on_surface"] = bool(surf and cv.surface_uv_map in surf.data.uv_layers)
    n = len(cv.curves)
    rep["guides"] = n
    rep["has_attachment_uv"] = "surface_uv_coordinate" in cv.attributes
    if n:
        off, pos = _curve_arrays(cv)
        ppc = np.diff(off)
        rep["points_per_guide"] = [int(ppc.min()), int(np.median(ppc)), int(ppc.max())]
        M = np.array(hair.matrix_world, dtype=np.float64)
        pw = pos @ M[:3, :3].T + M[:3, 3]
        roots = pw[off[:-1]]
        seg = np.linalg.norm(np.diff(pw, axis=0), axis=1)
        csum = np.concatenate([[0.0], np.cumsum(seg)])
        lengths = csum[off[1:] - 1] - csum[off[:-1]]
        rep["guide_length"] = [round(float(lengths.min()), 5), round(float(np.median(lengths)), 5),
                               round(float(lengths.max()), 5)]
        if surf:
            SI = np.array(surf.matrix_world.inverted(), dtype=np.float64)
            SM = surf.matrix_world
            dists = []
            for r in roots:
                lr = Vector(SI[:3, :3] @ r + SI[:3, 3])
                ok, loc, _nrm, _ = surf.closest_point_on_mesh(lr)
                dists.append(((SM @ loc) - Vector(r)).length if ok else float("inf"))
            dists = np.array(dists)
            tol = max(1e-5, 0.02 * float(np.median(lengths)))
            rep["roots_off_surface"] = int((dists > tol).sum())
            rep["root_dist_max"] = round(float(dists.max()), 6)
        if n >= 3:
            kd = kdtree.KDTree(n)
            for i, r in enumerate(roots):
                kd.insert(r, i)
            kd.balance()
            nn, ratio = [], []
            kk = min(k + 1, n)
            for i, r in enumerate(roots):
                found = kd.find_n(r, kk)
                nn.append(found[1][2])
                neigh = [f[1] for f in found[1:]]
                ratio.append(lengths[i] / (np.mean(lengths[neigh]) + 1e-12))
            nn, ratio = np.array(nn), np.array(ratio)
            med = float(np.median(nn))
            rep["spacing_nn"] = [round(med, 5), round(float(nn.max()), 5)]
            rep["spacing_gaps_2x"] = int((nn > 2 * med).sum())
            rep["length_outliers"] = int((np.abs(ratio - 1) > 0.5).sum())
        if rep["has_attachment_uv"]:
            a = cv.attributes["surface_uv_coordinate"]
            uvs = np.empty(len(a.data) * 2, np.float32)
            a.data.foreach_get("vector", uvs)
            rep["attachment_uv_nan"] = int(np.isnan(uvs).sum())
    # stack
    mods = [(m.name, m.node_group.name if m.type == "NODES" and m.node_group else m.type,
             m.show_viewport, m.show_render) for m in hair.modifiers]
    rep["modifiers"] = [m[0] for m in mods]
    groups = [m[1] for m in mods]
    notes = []
    if "Hair Dynamics" in groups and groups[-1] != "Hair Dynamics":
        notes.append("Hair Dynamics is not last: modifiers after it do not follow the deforming surface")
    if "Interpolate Hair Curves" in groups:
        ii = groups.index("Interpolate Hair Curves")
        pre = [g for g in groups[:ii] if g in DEFORMERS]
        if pre:
            notes.append(f"before Interpolate (shape guides only, children inherit): {pre}")
        md = hair.modifiers[mods[ii][0]]
        vals = get_inputs(md)
        rep["density"] = vals.get("Density")
        rep["density_mask"] = vals.get("Density Mask")
        rep["viewport_amount"] = vals.get("Viewport Amount")
    for m in hair.modifiers:
        if m.type == "NODES" and m.node_group and m.node_group.name == "Trim Hair Curves":
            if get_inputs(m).get("Replace Length") is True:
                notes.append(f"{m.name}: Replace Length on (replaces every length with 'Length', 1 m default)")
        if m.type == "NODES" and m.node_group and m.node_group.name in ("Frizz Hair Curves", "Hair Curves Noise"):
            f = get_inputs(m).get("Factor")
            if f == 1.0:
                notes.append(f"{m.name}: Factor 1.0 unmasked over the whole groom")
    rep["stack_notes"] = notes
    # evaluated
    try:
        rep["evaluated_viewport"] = count(hair, full=False)
        rep["evaluated_full"] = count(hair, full=True)
        ev = hair.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
        rep["evaluated_attrs"] = sorted(a.name for a in ev.attributes if not a.name.startswith("."))
        if "radius" in ev.attributes and len(ev.points):
            r = np.empty(len(ev.points), np.float32)
            ev.attributes["radius"].data.foreach_get("value", r)
            rep["radius_max"] = round(float(r.max()), 6)
            dens = rep.get("density")
            if isinstance(dens, (int, float)):
                rep["root_area_fraction"] = round(float(dens * math.pi * r.max() ** 2), 4)
    except Exception as e:  # never let a report crash the caller
        rep["evaluated_error"] = str(e)
    sc = bpy.context.scene
    rep["engine"] = sc.render.engine
    rep["hair_type"], rep["hair_subdiv"] = sc.render.hair_type, sc.render.hair_subdiv
    rep["cycles_curve_shape"] = sc.cycles_curves.shape
    shaders = set()
    for slot in hair.material_slots:
        if slot.material and slot.material.node_tree:
            shaders |= {n.bl_idname for n in slot.material.node_tree.nodes if "Bsdf" in n.bl_idname}
    rep["shaders"] = sorted(shaders)
    return rep


def verdict(rep):
    """Problems worth fixing, as plain sentences (empty list = nothing flagged)."""
    out = []
    if not rep.get("surface"):
        out.append("no attachment surface")
    if rep.get("surface") and not rep.get("uv_map_on_surface"):
        out.append("surface_uv_map not found on the surface mesh")
    if rep.get("guides") and not rep.get("has_attachment_uv"):
        out.append("guides have no surface_uv_coordinate: run snap_to_surface(hair)")
    if rep.get("roots_off_surface"):
        out.append(f"{rep['roots_off_surface']} guide roots off the surface (snap NEAREST, or DEFORM after surface edits)")
    if rep.get("spacing_gaps_2x"):
        out.append(f"{rep['spacing_gaps_2x']} guides with a neighbour gap > 2x median spacing (bald-spot risk)")
    if rep.get("length_outliers"):
        out.append(f"{rep['length_outliers']} guides differ > 50% from neighbour lengths (renders as a dent)")
    if rep.get("attachment_uv_nan"):
        out.append("invalid attachment UVs (NaN)")
    out += rep.get("stack_notes", [])
    if rep.get("guides") and "Interpolate Hair Curves" not in " ".join(rep.get("modifiers", [])):
        out.append("no Interpolate Hair Curves: only guides render")
    if rep.get("density_mask") in (None, 1.0) and rep.get("density") is not None:
        out.append("Interpolate has no Density Mask: children spawn over the whole surface")
    if rep.get("root_area_fraction", 0) > 0.5:
        out.append(f"radius too thick for the density (root area fraction {rep['root_area_fraction']}): solid-mass look")
    if rep.get("hair_type") == "STRAND" and rep.get("engine") != "CYCLES":
        out.append("render hair shape is Strand: radius changes invisible (use STRIP + hair_subdiv >= 1)")
    if rep.get("engine") == "BLENDER_EEVEE" and "ShaderNodeBsdfHairPrincipled" in rep.get("shaders", []):
        out.append("Principled Hair BSDF under EEVEE renders dark and flat: use Principled BSDF with explicit color")
    return out


# ----------------------------------------------------------------------------- shading
def hair_material(name="Hair", engine="CYCLES", root_color=(0.05, 0.025, 0.012), tip_color=(0.35, 0.17, 0.07),
                  melanin=None, roughness=(0.25, 0.4), random_color=0.1, uv_noise=0.0):
    """Strand material with a root-to-tip gradient (Curves Info Intercept) and per-strand
    roughness variation (Curves Info Random). engine CYCLES: Principled Hair BSDF (Chiang);
    melanin=(root, tip) switches to melanin parametrization. engine EEVEE: Principled BSDF
    with explicit colors (Simon: Principled Hair BSDF is a Cycles shader).
    uv_noise > 0 adds Simon's surface-UV noise (Attribute surface_uv_coordinate)."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    info = nt.nodes.new("ShaderNodeHairInfo")
    rough = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(info.outputs["Random"], rough.inputs["Value"])
    rough.inputs["To Min"].default_value, rough.inputs["To Max"].default_value = roughness
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    _s(col.inputs, "A_Color").default_value = (*root_color, 1.0)
    _s(col.inputs, "B_Color").default_value = (*tip_color, 1.0)
    nt.links.new(info.outputs["Intercept"], _s(col.inputs, "Factor_Float"))
    color_out = _s(col.outputs, "Result_Color")
    if uv_noise > 0:
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "surface_uv_coordinate"
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 8.0
        nt.links.new(attr.outputs["Vector"], noise.inputs["Vector"])
        soft = nt.nodes.new("ShaderNodeMix")
        soft.data_type, soft.blend_type = "RGBA", "SOFT_LIGHT"
        _s(soft.inputs, "Factor_Float").default_value = uv_noise
        nt.links.new(color_out, _s(soft.inputs, "A_Color"))
        nt.links.new(noise.outputs["Color"], _s(soft.inputs, "B_Color"))
        color_out = _s(soft.outputs, "Result_Color")
    if engine == "CYCLES":
        b = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
        b.model = "CHIANG"
        if melanin is not None:
            b.parametrization = "MELANIN"
            mm = nt.nodes.new("ShaderNodeMapRange")
            nt.links.new(info.outputs["Intercept"], mm.inputs["Value"])
            mm.inputs["To Min"].default_value, mm.inputs["To Max"].default_value = melanin
            nt.links.new(mm.outputs["Result"], b.inputs["Melanin"])
            b.inputs["Random Color"].default_value = random_color
        else:
            b.parametrization = "COLOR"
            nt.links.new(color_out, b.inputs["Color"])
        nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    else:
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(color_out, b.inputs["Base Color"])
        nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def setup_render(scene=None, engine="CYCLES", close_up=False):
    """Strip display with subdivisions (radius visible in EEVEE/viewport); Cycles curve
    shape THICK for close-ups [added], RIBBONS (default, faster) otherwise."""
    sc = scene or bpy.context.scene
    sc.render.engine = "CYCLES" if engine == "CYCLES" else "BLENDER_EEVEE"
    sc.render.hair_type = "STRIP"
    sc.render.hair_subdiv = 2 if close_up else 1
    sc.cycles_curves.shape = "THICK" if close_up else "RIBBONS"
    return sc


# ----------------------------------------------------------------------------- review
def eval_bbox(objs):
    """World bbox of what renders: evaluated curve points and any mesh a node tree
    outputs (bound_box of a curves object misses generated card meshes)."""
    for o in objs:
        o.update_tag()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        eo = o.evaluated_get(dg)
        M = np.array(eo.matrix_world, dtype=np.float64)
        local = []
        if o.type == "CURVES" and len(eo.data.points):
            p = np.empty(len(eo.data.points) * 3, np.float32)
            eo.data.attributes["position"].data.foreach_get("vector", p)
            local.append(p.reshape(-1, 3))
        try:
            gs = eo.evaluated_geometry()
            me = gs.mesh
            if me is not None and len(me.vertices):
                p = np.empty(len(me.vertices) * 3, np.float32)
                me.vertices.foreach_get("co", p)
                local.append(p.reshape(-1, 3))
        except Exception:
            pass
        if not local:
            local.append(np.array([list(c) for c in eo.bound_box], np.float32))
        allp = np.concatenate(local)
        pts.append(allp @ M[:3, :3].T + M[:3, 3])
    allw = np.concatenate(pts)
    return Vector(allw.min(0)), Vector(allw.max(0))


def _review_mod():
    here = os.path.dirname(os.path.abspath(__file__))
    p = os.path.normpath(os.path.join(here, "..", "..", "scenario-blender-expert", "scripts"))
    if p not in sys.path:
        sys.path.append(p)
    import bx_review
    return bx_review


def review(objs, out_dir, engine="CYCLES", views=("front", "threequarter", "right"), res=512,
           samples=32, close_up=False, name="hair_review", zoom=1.0, frame=None):
    """Lit render sheet of a groom in a temporary scene (user scene untouched).
    Simon's review rig: warm fill from the top, small key from the side, cool rim from
    the other side, darker bluish world; square camera. Renders at full density
    (render depsgraph ignores Viewport Amount). Renders the current frame of the active
    scene unless `frame` is given (pose checks). Returns the sheet path."""
    R = _review_mod()
    os.makedirs(out_dir, exist_ok=True)
    src_frame = bpy.context.scene.frame_current if frame is None else frame
    sc = bpy.data.scenes.new("BX_HairReview")
    for o in objs:
        sc.collection.objects.link(o)
    sc.frame_set(src_frame)
    setup_render(sc, engine, close_up)
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    if engine == "CYCLES":
        sc.cycles.samples = samples
        sc.cycles.device = "CPU"
    world = bpy.data.worlds.new("BX_HairReview_World")
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.04, 0.06, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sc.world = world
    lo, hi = eval_bbox(objs)
    center, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)
    made = []

    def light(name, kind, energy, color, offset, sz):
        ld = bpy.data.lights.new(name, kind)
        ld.energy, ld.color = energy, color
        if kind == "AREA":
            ld.size = sz
        ob = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(ob)
        ob.location = center + offset
        R._look_at(ob, center, offset.normalized(), offset.length)
        made.append((ob, ld))
    d = size * 1.5
    k = d * d  # keep irradiance constant with scale
    light("BX_Fill_Top", "AREA", 35 * k, (1.0, 0.85, 0.7), Vector((0, 0, d)), size)
    light("BX_Key_Side", "AREA", 90 * k, (1.0, 0.95, 0.9), Vector((-d, -d * 0.6, d * 0.3)), size * 0.25)
    light("BX_Rim_Cool", "AREA", 120 * k, (0.6, 0.75, 1.0), Vector((d * 0.9, d, d * 0.4)), size * 0.5)
    cam_data = bpy.data.cameras.new("BX_HairReview_Cam")
    cam = bpy.data.objects.new("BX_HairReview_Cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    paths, labels = [], []
    try:
        for view in views:
            dvec = R.VIEW_DIRS[view]
            half, depth = R._extent(corners, center, dvec)
            cam_data.type, cam_data.lens = "PERSP", 50
            fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
            dist = (half * 1.1 / math.tan(fov / 2) + depth * 0.6) / zoom
            cam_data.clip_start, cam_data.clip_end = dist * 0.01, dist * 10
            R._look_at(cam, center, dvec, dist)
            p = os.path.join(out_dir, f"{name}_{engine.lower()}_{view}.png")
            sc.render.filepath = p
            bpy.ops.render.render(write_still=True, scene=sc.name)
            paths.append(p)
            labels.append(f"{engine} / {view}")
        sheet = R._tile(paths, 1, len(paths), os.path.join(out_dir, f"{name}_{engine.lower()}.png"), labels)
    finally:
        for ob, ld in made:
            bpy.data.objects.remove(ob)
            bpy.data.lights.remove(ld)
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_data)
        bpy.data.scenes.remove(sc)
        bpy.data.worlds.remove(world)
    return sheet


# ----------------------------------------------------------------------------- cards
def cards_group():
    """GN group 'BX Hair Cards': hair curves -> card or tube mesh with UVs (Sara
    Matsumoto's BCON24 layout, Bystedt's surface-aligned tilt and root snap).
    Resample -> curve normal from the surface normal (card lies on the scalp) ->
    Curve to Mesh with a bent arc (cards) or a flat 1-turn spiral (tubes) ->
    UVMap (U across the profile, halved on cards; V root 0 to tip 1) -> material ->
    roots snapped onto the surface."""
    ng = bpy.data.node_groups.get("BX Hair Cards")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("BX Hair Cards", "GeometryNodeTree")
    I = ng.interface
    I.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    I.new_socket("Surface", in_out="INPUT", socket_type="NodeSocketObject")
    s = I.new_socket("Width", in_out="INPUT", socket_type="NodeSocketFloat"); s.default_value = 0.01
    I.new_socket("Tubes", in_out="INPUT", socket_type="NodeSocketBool")
    s = I.new_socket("Card Segments", in_out="INPUT", socket_type="NodeSocketInt"); s.default_value, s.min_value = 3, 1
    s = I.new_socket("Bend", in_out="INPUT", socket_type="NodeSocketFloat"); s.default_value = math.radians(90)
    s = I.new_socket("Resample", in_out="INPUT", socket_type="NodeSocketInt"); s.default_value, s.min_value = 12, 2
    s = I.new_socket("Root Scale", in_out="INPUT", socket_type="NodeSocketFloat"); s.default_value = 1.0
    s = I.new_socket("Tip Scale", in_out="INPUT", socket_type="NodeSocketFloat"); s.default_value = 0.3
    I.new_socket("Material", in_out="INPUT", socket_type="NodeSocketMaterial")
    s = I.new_socket("Snap Roots", in_out="INPUT", socket_type="NodeSocketBool"); s.default_value = True
    I.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    rs = N.new("GeometryNodeResampleCurve")
    L.new(gi.outputs["Geometry"], rs.inputs["Curve"])
    L.new(gi.outputs["Resample"], rs.inputs["Count"])
    oi = N.new("GeometryNodeObjectInfo"); oi.transform_space = "RELATIVE"
    L.new(gi.outputs["Surface"], oi.inputs["Object"])
    nrm = N.new("GeometryNodeInputNormal")
    sns = N.new("GeometryNodeSampleNearestSurface"); sns.data_type = "FLOAT_VECTOR"
    L.new(oi.outputs["Geometry"], sns.inputs["Mesh"])
    L.new(nrm.outputs["Normal"], sns.inputs["Value"])
    scn = N.new("GeometryNodeSetCurveNormal")
    scn.inputs["Mode"].default_value = "Free"
    L.new(rs.outputs["Curve"], scn.inputs["Curve"])
    L.new(sns.outputs["Value"], scn.inputs["Normal"])
    # capture length parameter on the hair curve
    sp_c = N.new("GeometryNodeSplineParameter")
    cap_c = N.new("GeometryNodeCaptureAttribute"); cap_c.domain = "POINT"
    cap_c.capture_items.new("FLOAT", "V")
    L.new(scn.outputs["Curve"], cap_c.inputs["Geometry"])
    L.new(sp_c.outputs["Factor"], _s(cap_c.inputs, "V"))
    # taper (Curve to Mesh Scale, 4.5+) root->tip
    taper = N.new("ShaderNodeMapRange")
    L.new(sp_c.outputs["Factor"], taper.inputs["Value"])
    L.new(gi.outputs["Root Scale"], taper.inputs["To Min"])
    L.new(gi.outputs["Tip Scale"], taper.inputs["To Max"])
    half_w = N.new("ShaderNodeMath"); half_w.operation = "MULTIPLY"; half_w.inputs[1].default_value = 0.5
    L.new(gi.outputs["Width"], half_w.inputs[0])
    # card profile: arc of angle Bend centred on +X (curve normal = surface normal), shifted so
    # the apex sits on the curve and the edges hang toward the scalp
    arc = N.new("GeometryNodeCurveArc")              # Resolution = points, so segments + 1
    seg1 = N.new("ShaderNodeMath"); seg1.operation = "ADD"; seg1.inputs[1].default_value = 1.0
    L.new(gi.outputs["Card Segments"], seg1.inputs[0])
    L.new(seg1.outputs[0], arc.inputs["Resolution"])
    sin_h = N.new("ShaderNodeMath"); sin_h.operation = "MULTIPLY"; sin_h.inputs[1].default_value = 0.5
    L.new(gi.outputs["Bend"], sin_h.inputs[0])
    sin = N.new("ShaderNodeMath"); sin.operation = "SINE"
    L.new(sin_h.outputs[0], sin.inputs[0])
    rad = N.new("ShaderNodeMath"); rad.operation = "DIVIDE"
    L.new(half_w.outputs[0], rad.inputs[0]); L.new(sin.outputs[0], rad.inputs[1])
    L.new(rad.outputs[0], arc.inputs["Radius"])
    neg = N.new("ShaderNodeMath"); neg.operation = "MULTIPLY"; neg.inputs[1].default_value = -1.0
    L.new(sin_h.outputs[0], neg.inputs[0])
    L.new(neg.outputs[0], arc.inputs["Start Angle"])
    L.new(gi.outputs["Bend"], arc.inputs["Sweep Angle"])
    shift = N.new("ShaderNodeCombineXYZ")
    nrad = N.new("ShaderNodeMath"); nrad.operation = "MULTIPLY"; nrad.inputs[1].default_value = -1.0
    L.new(rad.outputs[0], nrad.inputs[0]); L.new(nrad.outputs[0], shift.inputs["X"])
    tr = N.new("GeometryNodeTransform")
    L.new(arc.outputs["Curve"], tr.inputs["Geometry"])
    L.new(shift.outputs["Vector"], tr.inputs["Translation"])
    # tube profile: flat spiral, start = end radius, height 0, resolution 6, 1 rotation (Sara)
    spi = N.new("GeometryNodeCurveSpiral")
    spi.inputs["Resolution"].default_value = 6
    spi.inputs["Rotations"].default_value = 1.0
    spi.inputs["Height"].default_value = 0.0
    L.new(half_w.outputs[0], spi.inputs["Start Radius"]); L.new(half_w.outputs[0], spi.inputs["End Radius"])
    swp = N.new("GeometryNodeSwitch"); swp.input_type = "GEOMETRY"
    L.new(gi.outputs["Tubes"], swp.inputs["Switch"])
    L.new(tr.outputs["Geometry"], swp.inputs["False"]); L.new(spi.outputs["Curve"], swp.inputs["True"])
    sp_p = N.new("GeometryNodeSplineParameter")
    cap_p = N.new("GeometryNodeCaptureAttribute"); cap_p.domain = "POINT"
    cap_p.capture_items.new("FLOAT", "U")
    L.new(swp.outputs["Output"], cap_p.inputs["Geometry"])
    L.new(sp_p.outputs["Factor"], _s(cap_p.inputs, "U"))
    c2m = N.new("GeometryNodeCurveToMesh")
    L.new(cap_c.outputs["Geometry"], c2m.inputs["Curve"])
    L.new(cap_p.outputs["Geometry"], c2m.inputs["Profile Curve"])
    L.new(taper.outputs["Result"], c2m.inputs["Scale"])
    # UV: cards (3-ish sides) use half the texture width so density matches tubes (Sara)
    uscale = N.new("GeometryNodeSwitch"); uscale.input_type = "FLOAT"
    uscale.inputs["False"].default_value, uscale.inputs["True"].default_value = 0.5, 1.0
    L.new(gi.outputs["Tubes"], uscale.inputs["Switch"])
    umul = N.new("ShaderNodeMath"); umul.operation = "MULTIPLY"
    L.new(_s(cap_p.outputs, "U"), umul.inputs[0]); L.new(uscale.outputs["Output"], umul.inputs[1])
    uv = N.new("ShaderNodeCombineXYZ")
    L.new(umul.outputs[0], uv.inputs["X"]); L.new(_s(cap_c.outputs, "V"), uv.inputs["Y"])
    st = N.new("GeometryNodeStoreNamedAttribute"); st.data_type = "FLOAT2"; st.domain = "CORNER"
    st.inputs["Name"].default_value = "UVMap"
    L.new(c2m.outputs["Mesh"], st.inputs["Geometry"]); L.new(uv.outputs["Vector"], st.inputs["Value"])
    smooth = N.new("GeometryNodeSetShadeSmooth")
    L.new(st.outputs["Geometry"], smooth.inputs[0])
    sm = N.new("GeometryNodeSetMaterial")
    L.new(smooth.outputs[0], sm.inputs["Geometry"]); L.new(gi.outputs["Material"], sm.inputs["Material"])
    # root snap: vertices of the root row (V == 0) onto the closest surface point, last
    prox = N.new("GeometryNodeProximity"); prox.target_element = "FACES"
    L.new(oi.outputs["Geometry"], prox.inputs["Target"])
    cmp = N.new("FunctionNodeCompare"); cmp.data_type = "FLOAT"; cmp.operation = "LESS_THAN"
    cmp.inputs[1].default_value = 1e-4
    L.new(_s(cap_c.outputs, "V"), cmp.inputs[0])
    band = N.new("FunctionNodeBooleanMath"); band.operation = "AND"
    L.new(cmp.outputs[0], band.inputs[0]); L.new(gi.outputs["Snap Roots"], band.inputs[1])
    setp = N.new("GeometryNodeSetPosition")
    L.new(sm.outputs["Geometry"], setp.inputs["Geometry"])
    L.new(band.outputs[0], setp.inputs["Selection"])
    L.new(prox.outputs["Position"], setp.inputs["Position"])
    L.new(setp.outputs["Geometry"], go.inputs["Geometry"])
    return ng


def add_cards(hair, surface=None, width=0.01, tubes=False, material=None, segments=3,
              bend=math.radians(90), resample=12, root_scale=1.0, tip_scale=0.3, label="BX Hair Cards"):
    """Turn the groom into card (or tube) meshes at the end of the stack (before Hair
    Dynamics, so dynamics still act on curves: move it last if you want the cards to
    follow the simulated curves). Returns the modifier."""
    md = hair.modifiers.new(label, "NODES")
    md.node_group = cards_group()
    vals = {"Surface": surface or hair.data.surface, "Width": float(width), "Tubes": bool(tubes),
            "Card Segments": int(segments), "Bend": float(bend), "Resample": int(resample),
            "Root Scale": float(root_scale), "Tip Scale": float(tip_scale)}
    if material:
        vals["Material"] = material
    set_inputs(md, vals)
    names = [m.name for m in hair.modifiers]
    if "Hair Dynamics" in names:
        move(hair, md, names.index("Hair Dynamics"))
    return md


def card_material(name="HairCard", root_color=(0.04, 0.02, 0.01), tip_color=(0.3, 0.15, 0.06),
                  strands=24.0, anisotropic=0.5, image=None):
    """Alpha card material on the 'UVMap' written by cards_group(). With `image` (a baked
    strand plate: color + alpha, Sara's workflow) it samples that; without, a procedural
    strand stand-in [added] (Wave bands across U, tip fade) for layout and silhouette review.
    Tangent from the UV map + Anisotropic stretches highlights along strands (Sara).
    EEVEE: Render Method Dithered (4.2+ replacement for Blend Mode)."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs["Vector"])
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    else:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type, wave.bands_direction = "BANDS", "X"
        wave.inputs["Scale"].default_value = strands
        wave.inputs["Distortion"].default_value = 3.0
        nt.links.new(uvn.outputs["UV"], wave.inputs["Vector"])
        band = nt.nodes.new("ShaderNodeMapRange")
        band.inputs["From Min"].default_value, band.inputs["From Max"].default_value = 0.35, 0.65
        nt.links.new(wave.outputs["Fac"], band.inputs["Value"])
        fade = nt.nodes.new("ShaderNodeMapRange")            # 1 at the root row, 0 at the tip
        fade.inputs["From Min"].default_value, fade.inputs["From Max"].default_value = 0.6, 1.0
        fade.inputs["To Min"].default_value, fade.inputs["To Max"].default_value = 1.0, 0.0
        nt.links.new(sep.outputs["Y"], fade.inputs["Value"])
        alpha = nt.nodes.new("ShaderNodeMath")
        alpha.operation = "MULTIPLY"
        nt.links.new(band.outputs["Result"], alpha.inputs[0])
        nt.links.new(fade.outputs["Result"], alpha.inputs[1])
        nt.links.new(alpha.outputs[0], bsdf.inputs["Alpha"])
        col = nt.nodes.new("ShaderNodeMix")
        col.data_type = "RGBA"
        _s(col.inputs, "A_Color").default_value = (*root_color, 1.0)
        _s(col.inputs, "B_Color").default_value = (*tip_color, 1.0)
        nt.links.new(sep.outputs["Y"], _s(col.inputs, "Factor_Float"))
        nt.links.new(_s(col.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    tan = nt.nodes.new("ShaderNodeTangent")
    tan.direction_type, tan.uv_map = "UV_MAP", "UVMap"
    nt.links.new(tan.outputs["Tangent"], bsdf.inputs["Tangent"])
    bsdf.inputs["Anisotropic"].default_value = anisotropic
    bsdf.inputs["Roughness"].default_value = 0.4
    mat.surface_render_method = "DITHERED"
    return mat


def card_stats(hair):
    """Triangles, UV range and root distance of the evaluated card mesh."""
    hair.update_tag()
    dg = bpy.context.evaluated_depsgraph_get()   # evaluates pending updates
    eo = hair.evaluated_get(dg)
    gs = eo.evaluated_geometry()
    me = gs.mesh
    if me is None:
        return {"mesh": False}
    tri = sum(len(p.vertices) - 2 for p in me.polygons)
    out = {"mesh": True, "verts": len(me.vertices), "faces": len(me.polygons), "tris": tri}
    if "UVMap" in me.attributes:
        a = me.attributes["UVMap"]
        uv = np.empty(len(a.data) * 2, np.float32)
        a.data.foreach_get("vector", uv)
        uv = uv.reshape(-1, 2)
        out["uv_min"] = [round(float(x), 4) for x in uv.min(0)]
        out["uv_max"] = [round(float(x), 4) for x in uv.max(0)]
    return out
