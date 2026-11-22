"""
bx_gp: Grease Pencil v3 from Python for Blender 5.2 (tested on 5.2.1 LTS, headless
and GUI). Builds 2D/2.5D drawings and frame-by-frame animation as DATA (layers,
frames, drawings, stroke attributes), checks them the way 2D leads do, and renders
them for review. Real draw/sculpt brushes are NOT scriptable in 5.2.1 (no exec, see the
live-session section): strokes are written as data, sculpt/eraser work is done with
grab / dissolve / edit_op, and a live session adds gui_trim / gui_erase_box / gui_reproject.

  import sys; sys.path.append("<skill>/scripts"); import bx_gp as G
  cam = G.scene_2d(res=(1080, 1080), fps=12, frame_range=(1, 24), ortho_scale=6)
  ob  = G.new_object("Hero", layers=("Fills", "Shadow", "Lines"))   # bottom -> top, unlit
  ink = G.material(ob, "Ink", stroke="#1a1a1a")
  skin = G.material(ob, "Skin", fill="#f2b8a0")
  d = G.key(ob, "Fills", 1)                                       # get-or-create drawing
  G.add_shape(d, G.circle(1.0), holes=[G.circle(0.4)], material=skin)
  d = G.key(ob, "Lines", 1)
  G.add_stroke(d, G.smooth_path([(-1, 0, 0), (0, 0, .5), (1, 0, 0)]), radius=0.03,
               pressure=G.taper(25), brush="INK_PEN", material=ink)
  G.key(ob, "Lines", 7, mode="instance", source=1)                # shared drawing (cycles, holds)
  G.end_exposure(ob, "Lines", 13)                                 # blank key ends the drawing
  print(G.match(dA, dB)); G.interpolate(ob, "Lines", 1, step=2)   # native in-betweens
  G.inbetween(ob, "Lines", 1, 9, frames=(3, 5, 7), ease="EASE_IN_OUT")   # data in-betweens
  rep = G.report(ob); print(G.verdict(rep))
  G.render_strip("/abs/strip.png", frames=range(1, 25, 2))        # onion-skin substitute
  G.onion("/abs/onion.png", 5, before=(3,), after=(7,))

Conventions: drawing plane XZ (front view), camera at -Y looking +Y. Distances in
metres. `radius` is HALF the line width. Tuple colors are scene-linear RGBA; hex
strings ("#RRGGBB") are sRGB and converted (use hex for palette colors).
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-blender-expert", "scripts"))
GP_BRUSH_FILES = {
    "PAINT_GREASE_PENCIL": "essentials_brushes-gp_draw.blend",
    "SCULPT_GREASE_PENCIL": "essentials_brushes-gp_sculpt.blend",
    "VERTEX_GREASE_PENCIL": "essentials_brushes-gp_vertex.blend",
    "WEIGHT_GREASE_PENCIL": "essentials_brushes-gp_weight.blend",
}
RADIUS_DEFAULT = 0.01          # radius a point has while the 'radius' attribute does not exist
BRUSH_LIKE = ("PEN", "INK_PEN", "PENCIL")   # constant / pressure->radius / pressure->radius+opacity


# --------------------------------------------------------------------------- colors

def srgb(c, alpha=1.0):
    """'#RRGGBB' (sRGB) or an RGB(A) tuple (already linear) -> linear RGBA tuple."""
    if isinstance(c, str):
        h = c.lstrip("#")
        rgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
        lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
        a = int(h[6:8], 16) / 255.0 if len(h) == 8 else alpha
        return (lin[0], lin[1], lin[2], a)
    c = tuple(c)
    return c if len(c) == 4 else (c[0], c[1], c[2], alpha)


# --------------------------------------------------------------------------- scene

def scene_2d(res=(1920, 1080), fps=24, frame_range=(1, 48), ortho_scale=8.0,
             background="#ffffff", transparent=False, engine="BLENDER_EEVEE",
             cam_name="GP_Camera", scene=None, ambient=None):
    """Flat 2D stage: ortho camera at (0,-10,0) looking +Y onto the XZ plane, Standard
    view transform (predictable colors), background color. `ambient` (0..1 grey or
    color) sets World.color, the ambient that LIT GP layers receive (not the node tree)."""
    sc = scene or bpy.context.scene
    r = sc.render
    r.engine = engine
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.fps, r.fps_base = fps, 1.0
    sc.frame_start, sc.frame_end = frame_range
    r.film_transparent = transparent
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    bg = srgb(background)
    nt = sc.world.node_tree
    node = nt.nodes.get("Background") if nt else None
    if node is not None:
        node.inputs["Color"].default_value = bg
    if ambient is not None:
        a = (ambient,) * 3 if isinstance(ambient, (int, float)) else srgb(ambient)[:3]
        sc.world.color = a
    cam = bpy.data.objects.get(cam_name)
    if cam is None:
        cam = bpy.data.objects.new(cam_name, bpy.data.cameras.new(cam_name))
        sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho_scale
    cam.data.clip_start, cam.data.clip_end = 0.1, 100.0
    cam.location = (0.0, -10.0, 0.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    sc.camera = cam
    return cam


def px_size(scene=None, depth=None):
    """World size of one rendered pixel. Ortho: at any depth. Perspective: at `depth`
    metres in front of the camera (required)."""
    sc = scene or bpy.context.scene
    cam = sc.camera
    r = sc.render
    n = max(r.resolution_x, r.resolution_y) * r.resolution_percentage / 100.0
    if cam.data.type == "ORTHO":
        return cam.data.ortho_scale / n
    if depth is None:
        raise ValueError("perspective camera: pass depth (distance along the view axis)")
    return 2.0 * depth * math.tan(cam.data.angle / 2.0) / n


# --------------------------------------------------------------------------- objects, layers, materials

def new_object(name, layers=("Fills", "Lines"), lit=False, collection=None, location=(0, 0, 0)):
    """Get-or-create a GP object. Layers are created bottom -> top in the given order.
    lit=False sets use_lights=False (flat color); new layers default to True, which
    renders flat colors dark unless World.color or lamps light them."""
    ob = bpy.data.objects.get(name)
    if ob is None or ob.type != "GREASEPENCIL":
        gp = bpy.data.grease_pencils.new(name)
        ob = bpy.data.objects.new(name, gp)
        (collection or bpy.context.scene.collection).objects.link(ob)
        ob.location = location
    for n in layers:
        layer(ob, n, lit=lit)
    return ob


def layer(ob, name, lit=False, below=None, above=None):
    """Get-or-create a layer (new layers go on top), optionally moved directly below or
    above another layer. Returns the layer. Stack order: ob.data.layers, bottom -> top."""
    gp = ob.data
    lay = gp.layers.get(name)
    if lay is None:
        lay = gp.layers.new(name, set_active=False)
        lay.use_lights = lit
    ref = below or above
    if ref is not None:
        idx = lambda n: [l.name for l in gp.layers].index(n)
        for _ in range(len(gp.layers) * 2):
            want = idx(ref) - 1 if below else idx(ref) + 1
            if idx(name) == want:
                break
            gp.layers.move(gp.layers[name], "DOWN" if idx(name) > want else "UP")
    return gp.layers[name]


def material(ob, name, stroke=None, fill=None, holdout=False):
    """Get-or-create a GP material ('paint bucket': editing it recolors every stroke that
    uses it), make sure the object has it, return its slot index. stroke/fill: hex sRGB
    or linear tuple. Whether a stroke is filled is decided per stroke (fill_id), not here."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    if not m.is_grease_pencil:
        bpy.data.materials.create_gpencil_data(m)
    g = m.grease_pencil
    if stroke is not None:
        g.color = srgb(stroke)
    if fill is not None:
        g.fill_color = srgb(fill)
    g.use_fill_holdout = g.use_stroke_holdout = bool(holdout)
    mats = ob.data.materials
    for i, x in enumerate(mats):
        if x == m:
            return i
    mats.append(m)
    return len(mats) - 1


# --------------------------------------------------------------------------- frames

def _layer(ob_or_layer, layer_name=None):
    if layer_name is None:
        return ob_or_layer
    return ob_or_layer.data.layers[layer_name]


def key(ob, layer_name, frame, mode="blank", source=None, keyframe_type="KEYFRAME"):
    """Get-or-create the drawing keyed at `frame` (idempotent: an existing key is returned
    untouched). mode: 'blank' (replacement drawing), 'copy' (additive: starts as a copy of
    `source` or of the drawing exposed at `frame`), 'instance' (shares the source drawing:
    editing one edits all; for holds and cycles)."""
    lay = _layer(ob, layer_name)
    for f in lay.frames:
        if f.frame_number == frame:
            return f.drawing
    if mode == "blank":
        fr = lay.frames.new(frame)
    else:
        src = source
        if src is None:
            ex = lay.get_frame_at(frame)
            if ex is None:
                raise ValueError(f"no drawing exposed at frame {frame} to copy")
            src = ex.frame_number
        fr = lay.frames.copy(src, frame, instance_drawing=(mode == "instance"))
    fr.keyframe_type = keyframe_type
    return fr.drawing


def end_exposure(ob, layer_name, frame):
    """Blank key: the layer shows nothing from `frame` on (ends an effect or a held drawing)."""
    return key(ob, layer_name, frame, mode="blank")


def exposures(ob, layer_name):
    """[(frame, keyframe_type, n_strokes, drawing.user_count)] for one layer."""
    lay = _layer(ob, layer_name)
    return [(f.frame_number, f.keyframe_type, len(f.drawing.strokes), f.drawing.user_count)
            for f in sorted(lay.frames, key=lambda f: f.frame_number)]


def cycle(ob, layer_name, keys, start, end, step=2):
    """Repeat drawings `keys` (frame numbers, in order) as instances on `step`s from
    start to end. Existing keys are never overwritten. Returns frames created."""
    lay = _layer(ob, layer_name)
    have = {f.frame_number for f in lay.frames}
    made = []
    for i, f in enumerate(range(start, end + 1, step)):
        src = keys[i % len(keys)]
        if f in have or f == src:
            continue
        lay.frames.copy(src, f, instance_drawing=True)
        have.add(f)
        made.append(f)
    return made


# --------------------------------------------------------------------------- polylines

def circle(r=1.0, n=48, center=(0, 0, 0)):
    """Closed polyline in the XZ plane (no repeated end point: set cyclic=True)."""
    cx, cy, cz = center
    return [(cx + r * math.cos(2 * math.pi * i / n), cy, cz + r * math.sin(2 * math.pi * i / n))
            for i in range(n)]


def ellipse(rx, rz, n=48, center=(0, 0, 0), rot=0.0):
    cx, cy, cz = center
    c, s = math.cos(rot), math.sin(rot)
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, z = rx * math.cos(a), rz * math.sin(a)
        out.append((cx + c * x - s * z, cy, cz + s * x + c * z))
    return out


def rect(w, h, center=(0, 0, 0), n_side=8):
    """Closed rectangle with n_side points per side (enough points to deform or sculpt)."""
    cx, cy, cz = center
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - h / 2, cz + h / 2
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    out = []
    for k in range(4):
        (ax, az), (bx, bz) = corners[k], corners[(k + 1) % 4]
        for i in range(n_side):
            t = i / n_side
            out.append((ax + (bx - ax) * t, cy, az + (bz - az) * t))
    return out


def xz(points_2d, y=0.0):
    """[(x, z)] design coordinates -> [(x, y, z)] on the drawing plane."""
    return [(p[0], y, p[1]) for p in points_2d]


def smooth_path(control, samples=8, closed=False):
    """Centripetal Catmull-Rom through control points -> dense polyline. What a
    confident hand stroke looks like when you only know a few key positions."""
    P = [Vector(p) for p in control]
    if len(P) < 3:
        return [tuple(p) for p in P]
    if closed:
        pts = [P[-1]] + P + [P[0], P[1]]
        segs = len(P)
    else:
        pts = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
        segs = len(P) - 1
    out = []
    for i in range(segs):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        t0 = 0.0
        t1 = t0 + max((p1 - p0).length ** 0.5, 1e-6)
        t2 = t1 + max((p2 - p1).length ** 0.5, 1e-6)
        t3 = t2 + max((p3 - p2).length ** 0.5, 1e-6)
        for k in range(samples):
            t = t1 + (t2 - t1) * k / samples
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append(tuple((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2))
    if not closed:
        out.append(tuple(P[-1]))
    return out


def resample(points, n, closed=False):
    """Arc-length resample to exactly n points (gives two drawings matching point counts,
    the condition for clean interpolation)."""
    P = np.array(points, dtype=np.float64)
    if closed:
        P = np.vstack([P, P[:1]])
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    total = s[-1]
    ts = np.linspace(0.0, total, n, endpoint=not closed) if not closed else np.arange(n) * total / n
    out = np.empty((n, 3))
    for k in range(3):
        out[:, k] = np.interp(ts, s, P[:, k])
    return [tuple(p) for p in out]


def taper(n, start=0.25, end=0.35, floor=0.08, power=0.7):
    """Pressure profile 0..1 for n points: ramps up over `start` fraction, down over
    `end` fraction, `floor` at the tips. Written into radius (INK_PEN) or radius and
    opacity (PENCIL) by add_stroke: the headless stand-in for pen pressure."""
    out = []
    for i in range(n):
        t = i / max(n - 1, 1)
        a = min(1.0, t / start) if start > 0 else 1.0
        b = min(1.0, (1.0 - t) / end) if end > 0 else 1.0
        out.append(floor + (1.0 - floor) * (min(a, b) ** power))
    return out


# --------------------------------------------------------------------------- strokes

_WIDTH = {"FLOAT": 1, "FLOAT_VECTOR": 3, "FLOAT_COLOR": 4}
_KEY = {"FLOAT": "value", "FLOAT_VECTOR": "vector", "FLOAT_COLOR": "color"}


def _write_points(d, name, dtype, start, values, default):
    """Write values for points [start:] of a point attribute, creating it safely.
    Trap: attributes.new('radius') zero-fills existing points (they vanish), so fill
    the defaults first."""
    n = len(d.attributes["position"].data)
    w = _WIDTH[dtype]
    buf = np.empty(n * w, dtype=np.float32)
    a = d.attributes.get(name)
    if a is None:
        d.attributes.new(name, dtype, "POINT")
        buf[:] = np.tile(np.asarray(default, dtype=np.float32).reshape(-1), n)
    else:
        a.data.foreach_get(_KEY[dtype], buf)
    buf[start * w:] = np.asarray(values, dtype=np.float32).reshape(-1)
    d.attributes[name].data.foreach_set(_KEY[dtype], buf)


def add_strokes(d, specs):
    """Bulk add. specs: list of dicts with add_stroke's keyword names (points required).
    One add_strokes call and one array write per attribute: fast for thousands of strokes."""
    specs = [dict(s) for s in specs if len(s["points"]) > 0]
    if not specs:
        return []
    n0_pts = len(d.attributes["position"].data) if "position" in d.attributes else 0
    n0_str = len(d.strokes)
    d.add_strokes([len(s["points"]) for s in specs])
    pos, rad, opa, vcol = [], [], [], []
    need_vc = any(s.get("vertex_color") is not None for s in specs)
    for s in specs:
        pts = np.asarray(s["points"], dtype=np.float32)
        n = len(pts)
        pos.append(pts)
        prs = s.get("pressure")
        prs = np.ones(n) if prs is None else (np.full(n, float(prs)) if np.isscalar(prs) else np.asarray(prs, float))
        like = s.get("brush", "INK_PEN")
        if like not in BRUSH_LIKE:
            raise ValueError(f"brush must be one of {BRUSH_LIKE}")
        r = np.full(n, s.get("radius", 0.01), float)
        o = np.full(n, s.get("opacity", 1.0), float)
        if like in ("INK_PEN", "PENCIL"):
            r = r * prs
        if like == "PENCIL":
            o = o * prs
        rad.append(r)
        opa.append(o)
        vc = s.get("vertex_color")
        vcol.append(np.tile(srgb(vc) if vc is not None else (0, 0, 0, 0), (n, 1)))
    _write_points(d, "position", "FLOAT_VECTOR", n0_pts, np.concatenate(pos), (0, 0, 0))
    _write_points(d, "radius", "FLOAT", n0_pts, np.concatenate(rad), RADIUS_DEFAULT)
    _write_points(d, "opacity", "FLOAT", n0_pts, np.concatenate(opa), 1.0)
    if need_vc:
        _write_points(d, "vertex_color", "FLOAT_COLOR", n0_pts, np.concatenate(vcol), (0, 0, 0, 0))
    out = []
    for i, s in enumerate(specs):
        st = d.strokes[n0_str + i]
        st.material_index = s.get("material", 0)
        st.cyclic = bool(s.get("cyclic", False))
        st.fill_id = int(s.get("fill_id", 0))
        st.hide_stroke = bool(s.get("hide_stroke", False))
        if s.get("softness"):
            st.softness = s["softness"]
        if s.get("fill_color") is not None:
            st.fill_color = srgb(s["fill_color"])
        out.append(n0_str + i)
    d.tag_positions_changed()
    return out


def add_stroke(d, points, radius=0.01, pressure=None, brush="INK_PEN", opacity=1.0,
               material=0, cyclic=False, fill_id=0, hide_stroke=False, vertex_color=None,
               softness=0.0, fill_color=None):
    """Add one stroke from a polyline. radius = half line width (m). pressure: None,
    a float, or a per-point list (see taper()). brush: 'PEN' ignores pressure (constant
    width, matches Line Art), 'INK_PEN' pressure->radius, 'PENCIL' pressure->radius and
    opacity. fill_id != 0 fills (same id = one fill, even-odd holes). Returns stroke index."""
    return add_strokes(d, [dict(points=points, radius=radius, pressure=pressure, brush=brush,
                                opacity=opacity, material=material, cyclic=cyclic,
                                fill_id=fill_id, hide_stroke=hide_stroke,
                                vertex_color=vertex_color, softness=softness,
                                fill_color=fill_color)])[0]


def next_fill_id(d):
    ids = [s.fill_id for s in d.strokes]
    return (max(ids) + 1) if ids else 1


def add_shape(d, outline, holes=(), material=0, line=False, radius=0.01, fill_id=None):
    """Closed filled shape with optional holes, all strokes sharing one fill_id (even-odd).
    line=False: fill only (hide_stroke), for a Fills layer under a separate Lines layer.
    line=True: the same curves also draw their outline with the material stroke color.
    Returns the fill_id used."""
    fid = fill_id or next_fill_id(d)
    specs = [dict(points=p, radius=radius, brush="PEN", material=material, cyclic=True,
                  fill_id=fid, hide_stroke=not line) for p in [outline, *holes]]
    add_strokes(d, specs)
    return fid


def drawing_stats(d):
    """Counts, radius range and XZ bounding box of a drawing (compact dict)."""
    n = len(d.strokes)
    if n == 0:
        return {"strokes": 0, "points": 0}
    P = np.empty(len(d.attributes["position"].data) * 3, np.float32)
    d.attributes["position"].data.foreach_get("vector", P)
    P = P.reshape(-1, 3)
    rads = [p.radius for s in d.strokes for p in s.points]
    return {"strokes": n, "points": len(P), "radius_min": round(min(rads), 5),
            "radius_max": round(max(rads), 5),
            "bbox_min": [round(float(v), 3) for v in P.min(0)],
            "bbox_max": [round(float(v), 3) for v in P.max(0)],
            "fill_ids": sorted({s.fill_id for s in d.strokes})}


# --------------------------------------------------------------------------- interpolation

def _arrays(d):
    n = len(d.attributes["position"].data) if "position" in d.attributes else 0
    P = np.zeros(n * 3, np.float32)
    if n:
        d.attributes["position"].data.foreach_get("vector", P)
    R = np.full(n, RADIUS_DEFAULT, np.float32)
    O = np.ones(n, np.float32)
    if "radius" in d.attributes:
        d.attributes["radius"].data.foreach_get("value", R)
    if "opacity" in d.attributes:
        d.attributes["opacity"].data.foreach_get("value", O)
    return P.reshape(-1, 3), R, O


def match(da, db, eps=1e-6):
    """Tom Viguier's interpolability rule: 'copy' (identical), 'sculpted' (same stroke
    count, same point count per stroke, same material per stroke: interpolate), or
    'different' (redraw or clip to the nearest drawing). Returns (state, reason)."""
    if len(da.strokes) != len(db.strokes):
        return "different", f"stroke count {len(da.strokes)} vs {len(db.strokes)}"
    for i, (a, b) in enumerate(zip(da.strokes, db.strokes)):
        if len(a.points) != len(b.points):
            return "different", f"stroke {i}: {len(a.points)} vs {len(b.points)} points"
        if a.material_index != b.material_index:
            return "different", f"stroke {i}: material {a.material_index} vs {b.material_index}"
    Pa, Ra, _ = _arrays(da)
    Pb, Rb, _ = _arrays(db)
    if np.allclose(Pa, Pb, atol=eps) and np.allclose(Ra, Rb, atol=eps):
        return "copy", "identical drawings (hold or instance)"
    return "sculpted", "same strokes and points: interpolable"


def _ease(t, ease):
    if ease == "LINEAR":
        return t
    if ease == "EASE_IN":
        return t * t
    if ease == "EASE_OUT":
        return 1 - (1 - t) ** 2
    if ease == "EASE_IN_OUT":
        return t * t * (3 - 2 * t)
    raise ValueError("ease: LINEAR, EASE_IN, EASE_OUT, EASE_IN_OUT")


def interpolate(ob, layer_name, frame, step=2, type="LINEAR", easing="AUTO", all_layers=False,
                require_match=True):
    """Native in-betweens (grease_pencil.interpolate_sequence, runs headless) for the
    segment between the keys around `frame`. Inserts BREAKDOWN keys on `step`s. Does not
    key object transforms. require_match: refuse pairs that match() calls 'different'."""
    lay = _layer(ob, layer_name)
    keys = sorted(f.frame_number for f in lay.frames if f.keyframe_type != "BREAKDOWN")
    prev = max([k for k in keys if k <= frame], default=None)
    nxt = min([k for k in keys if k > frame], default=None)
    if prev is None or nxt is None:
        raise ValueError(f"frame {frame} is not between two keys of {layer_name}: {keys}")
    state, why = match(lay.get_frame_at(prev).drawing, lay.get_frame_at(nxt).drawing)
    if require_match and state == "different":
        raise ValueError(f"{prev}->{nxt} not interpolable ({why}); redraw or use inbetween(clip=True)")
    sc = bpy.context.scene
    old = sc.frame_current
    vl = bpy.context.view_layer
    vl.objects.active = ob
    ob.data.layers.active = lay
    sc.frame_set(prev)
    r = bpy.ops.grease_pencil.interpolate_sequence(step=step, layers="ALL" if all_layers else "ACTIVE",
                                                   type=type, easing=easing, exclude_breakdowns=True)
    sc.frame_set(old)
    return {"result": r, "segment": (prev, nxt), "match": state,
            "frames": [f for f in exposures(ob, layer_name) if prev < f[0] < nxt]}


def inbetween(ob, layer_name, a, b, frames, spacing=None, ease="LINEAR", clip=False,
              keyframe_type="BREAKDOWN"):
    """Data in-betweens between keys a and b with the animator's spacing: `spacing` gives
    t (0..1) per frame, else `ease` (LINEAR, EASE_IN, EASE_OUT, EASE_IN_OUT) on linear
    time. Pairs that are not 'sculpted' raise, or with clip=True reuse the nearest key as
    an instance instead of distorting (Tom's clip mode). Existing keys are kept."""
    lay = _layer(ob, layer_name)
    fa, fb = lay.get_frame_at(a), lay.get_frame_at(b)
    if fa is None or fb is None or fa.frame_number != a or fb.frame_number != b:
        raise ValueError("a and b must be keyed frames")
    da, db = fa.drawing, fb.drawing
    state, why = match(da, db)
    have = {f.frame_number for f in lay.frames}
    made = []
    for i, f in enumerate(frames):
        if f in have:
            continue
        t = spacing[i] if spacing is not None else _ease((f - a) / (b - a), ease)
        if state == "different" or state == "copy":
            if state == "different" and not clip:
                raise ValueError(f"{a}->{b} not interpolable ({why}); pass clip=True or redraw")
            fr = lay.frames.copy(a if t < 0.5 else b, f, instance_drawing=True)
            fr.keyframe_type = keyframe_type
            made.append((f, "clip" if state == "different" else "hold"))
            continue
        Pa, Ra, Oa = _arrays(da)
        Pb, Rb, Ob = _arrays(db)
        d = key(ob, layer_name, f, keyframe_type=keyframe_type)
        sizes = [len(s.points) for s in da.strokes]
        d.add_strokes(sizes)
        _write_points(d, "position", "FLOAT_VECTOR", 0, Pa + (Pb - Pa) * t, (0, 0, 0))
        _write_points(d, "radius", "FLOAT", 0, Ra + (Rb - Ra) * t, RADIUS_DEFAULT)
        _write_points(d, "opacity", "FLOAT", 0, Oa + (Ob - Oa) * t, 1.0)
        for s_out, s_in in zip(d.strokes, da.strokes):
            s_out.material_index = s_in.material_index
            s_out.cyclic = s_in.cyclic
            s_out.fill_id = s_in.fill_id
            s_out.hide_stroke = s_in.hide_stroke
        d.tag_positions_changed()
        made.append((f, round(t, 3)))
    return {"match": state, "why": why, "made": made}


# --------------------------------------------------------------------------- depth (cutout, multiplane)

def _view(cam):
    mw = cam.matrix_world
    return mw.translation.copy(), (mw.to_quaternion() @ Vector((0, 0, -1))).normalized()


def draw_order(objs, cam=None):
    """Names front -> back by origin distance along the camera axis (with the default
    2D stroke depth order, the nearer object draws on top)."""
    cam = cam or bpy.context.scene.camera
    bpy.context.view_layer.update()
    c, fwd = _view(cam)
    return [o.name for o in sorted(objs, key=lambda o: (o.matrix_world.translation - c).dot(fwd))]


def push_depth(ob, delta, cam=None):
    """Move an object `delta` metres further from the camera (negative = nearer) WITHOUT
    changing its image: ortho = translate along the view axis; perspective = scale about
    the camera center by d_new/d_old. Works on parented objects. [added]"""
    cam = cam or bpy.context.scene.camera
    bpy.context.view_layer.update()
    c, fwd = _view(cam)
    M = ob.matrix_world.copy()
    if cam.data.type == "ORTHO":
        new = Matrix.Translation(fwd * delta) @ M
    else:
        d = (M.translation - c).dot(fwd)
        k = (d + delta) / d
        new = Matrix.Translation(c) @ Matrix.Scale(k, 4) @ Matrix.Translation(-c) @ M
    ob.matrix_world = new
    bpy.context.view_layer.update()
    return ob.matrix_world.translation.copy()


# --------------------------------------------------------------------------- 2.5D helpers

def project_to_surface(points, target, cam=None, offset=0.005):
    """Place stroke points ON a mesh as seen from the camera (the headless 'Surface'
    placement, and Pablo Fournier's sticky strokes at bind time). Returns (hits, missed,
    captured): hits = projected points offset toward the camera; missed = indices with
    no surface under them (they would 'go to oblivion'); captured = indices whose first
    hit is another object (an occluder)."""
    sc = bpy.context.scene
    cam = cam or sc.camera
    dg = bpy.context.evaluated_depsgraph_get()
    c, fwd = _view(cam)
    ortho = cam.data.type == "ORTHO"
    hits, missed, captured = [], [], []
    for i, p in enumerate(points):
        p = Vector(p)
        if ortho:                                   # parallel rays along the view axis
            origin, direction = p - fwd * 50.0, fwd
        else:
            origin, direction = c, (p - c).normalized()
        ok, loc, nrm, _idx, hit_ob, _m = sc.ray_cast(dg, origin, direction)
        if not ok:
            missed.append(i)
            hits.append(tuple(p))
            continue
        if hit_ob.original != target:
            captured.append(i)
        hits.append(tuple(loc - direction * offset))
    return hits, missed, captured


def lineart(source=None, name="LineArt", radius=0.006, color="#141414", layer_name="Lines",
            depth_offset=None, fill=False):
    """GP object with a Line Art modifier. source: an object, a collection or None (scene;
    objects hidden from render are ignored). Measured on 5.2.1: the generated points get
    radius = modifier radius / 2, so the modifier `radius` IS the line width in metres.
    To match a drawn stroke of radius r, pass radius=2*r; for w pixels, w * px_size().
    The default 0.0025 m is a hairline at typical framings. Bake to strokes with
    bpy.ops.object.lineart_bake_strokes() after setting the scene frame range."""
    ob = new_object(name, layers=(layer_name,))
    mi = material(ob, name + "_Ink", stroke=color, fill=color)
    md = ob.modifiers.get("LineArt") or ob.modifiers.new("LineArt", "LINEART")
    if source is None:
        md.source_type = "SCENE"
    elif isinstance(source, bpy.types.Collection):
        md.source_type = "COLLECTION"
        md.source_collection = source
    else:
        md.source_type = "OBJECT"
        md.source_object = source
    md.target_layer = layer_name
    md.target_material = ob.data.materials[mi]
    md.radius = radius
    if depth_offset is not None:
        md.stroke_depth_offset = depth_offset
    if fill and "fill_strokes" in md.bl_rna.properties:
        md.fill_strokes = True
    return ob


def relight(ob, canvas, light_dir=(-0.6, -0.5, 0.6), shadow="#262a55", light="#ffc24a",
            low=-0.1, high=0.4, mode="STROKE", name="GP_Relight"):
    """Geometry Nodes relight of drawn strokes from a canvas mesh normal (a one-pass
    diffuse version of Michael Weigl's GN lighting passes): per point,
    dot(nearest canvas normal, light_dir) -> map low..high -> mix shadow..light ->
    Set Grease Pencil Color (mode STROKE or FILL). Returns the modifier."""
    ng = bpy.data.node_groups.get(name)
    if ng is None:
        ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
        ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        N, L = ng.nodes, ng.links
        gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
        oi = N.new("GeometryNodeObjectInfo")
        oi.name = "Canvas"
        oi.transform_space = "RELATIVE"
        nrm = N.new("GeometryNodeInputNormal")
        sns = N.new("GeometryNodeSampleNearestSurface")
        sns.data_type = "FLOAT_VECTOR"
        dot = N.new("ShaderNodeVectorMath")
        dot.name = "Light"
        dot.operation = "DOT_PRODUCT"
        mr = N.new("ShaderNodeMapRange")
        mr.name = "Band"
        mix = N.new("ShaderNodeMix")
        mix.name = "Colors"
        mix.data_type = "RGBA"
        sgc = N.new("GeometryNodeSetGreasePencilColor")
        sgc.name = "SetColor"
        L.new(oi.outputs["Geometry"], sns.inputs["Mesh"])
        L.new(nrm.outputs["Normal"], sns.inputs["Value"])
        L.new(sns.outputs["Value"], dot.inputs[0])
        L.new(dot.outputs["Value"], mr.inputs["Value"])
        L.new(mr.outputs["Result"], mix.inputs["Factor"])
        L.new(gi.outputs[0], sgc.inputs["Grease Pencil"])
        L.new(mix.outputs["Result"], sgc.inputs["Color"])
        L.new(sgc.outputs[0], go.inputs[0])
    N = ng.nodes
    N["Canvas"].inputs["Object"].default_value = canvas
    N["Light"].inputs[1].default_value = Vector(light_dir).normalized()
    N["Band"].inputs["From Min"].default_value = low
    N["Band"].inputs["From Max"].default_value = high
    N["Colors"].inputs["A"].default_value = srgb(shadow)
    N["Colors"].inputs["B"].default_value = srgb(light)
    N["SetColor"].mode = mode
    md = ob.modifiers.get(name) or ob.modifiers.new(name, "NODES")
    md.node_group = ng
    return md


# --------------------------------------------------------------------------- checks

def report(ob, scene=None):
    """Measurable checks a 2D lead would make, as a dict (see verdict())."""
    sc = scene or bpy.context.scene
    gp = ob.data
    has_lamps = any(o.type == "LIGHT" and not o.hide_render for o in sc.objects)
    amb = tuple(sc.world.color) if sc.world else (0.05, 0.05, 0.05)
    try:
        px = px_size(sc) if sc.camera and sc.camera.data.type == "ORTHO" else None
    except Exception:
        px = None
    used = set()
    rep = {"object": ob.name, "view_transform": sc.view_settings.view_transform,
           "px_size": px, "layers": [], "issues": [], "info": []}
    for lay in gp.layers:
        frames = sorted(lay.frames, key=lambda f: f.frame_number)
        L = {"name": lay.name, "use_lights": lay.use_lights, "blend": lay.blend_mode,
             "opacity": round(lay.opacity, 3), "hide": lay.hide, "lock": lay.lock,
             "masks": [m.name for m in lay.mask_layers] if lay.use_masks else [],
             "keys": [f.frame_number for f in frames]}
        rep["layers"].append(L)
        if lay.hide:
            continue
        if frames and frames[0].frame_number > sc.frame_start:
            rep["issues"].append(f"{lay.name}: first key {frames[0].frame_number} > frame_start "
                                 f"{sc.frame_start}: layer is empty before it")
        if lay.use_lights and not has_lamps and max(amb[:3]) < 0.5:
            rep["issues"].append(f"{lay.name}: use_lights=True, no lamps, World.color {tuple(round(a, 3) for a in amb)}: "
                                 "renders dark (set use_lights=False or raise World.color)")
        if lay.use_masks and len(lay.mask_layers) == 0:
            rep["issues"].append(f"{lay.name}: use_masks on but no mask layers")
        if len(lay.mask_layers) and not lay.use_masks:
            rep["info"].append(f"{lay.name}: mask layers set but use_masks is off")
        shared = [f.frame_number for f in frames if f.drawing.user_count > 1]
        if shared:
            rep["info"].append(f"{lay.name}: instanced drawings at {shared} (editing one edits all)")
        for f in frames:
            d = f.drawing
            for si, s in enumerate(d.strokes):
                used.add(s.material_index)
                npts = len(s.points)
                tag = f"{lay.name}@{f.frame_number} stroke {si}"
                if s.hide_stroke and s.fill_id == 0:
                    rep["issues"].append(f"{tag}: hide_stroke with fill_id 0 is invisible")
                if s.fill_id != 0 and not s.cyclic:
                    rep["info"].append(f"{tag}: filled but not cyclic (fill closes it anyway)")
                pts = [p.position for p in s.points]
                length = sum((Vector(pts[k + 1]) - Vector(pts[k])).length for k in range(npts - 1))
                if npts == 1 or length < 3 * (px or 0.002):
                    rep["issues"].append(f"{tag}: stray micro-stroke ({npts} points, {length:.4f} m long)")
                mi = s.material_index
                if mi >= len(gp.materials) or gp.materials[mi] is None:
                    rep["issues"].append(f"{tag}: material index {mi} has no material")
                    continue
                g = gp.materials[mi].grease_pencil
                if s.fill_id != 0 and g.fill_color[3] < 0.01:
                    rep["issues"].append(f"{tag}: filled but material '{gp.materials[mi].name}' fill alpha is 0")
                if not s.hide_stroke and g.color[3] < 0.01:
                    rep["issues"].append(f"{tag}: visible stroke but material '{gp.materials[mi].name}' stroke alpha is 0")
                if px and not s.hide_stroke:
                    rmin = min(p.radius for p in s.points)
                    if 2 * rmin / px < 1.0 and 2 * max(p.radius for p in s.points) / px < 1.0:
                        rep["issues"].append(f"{tag}: line thinner than 1 px (radius {rmin:.4f}, px {px:.4f})")
    unused = [m.name for i, m in enumerate(gp.materials) if m and i not in used]
    if unused:
        rep["info"].append(f"unused materials: {unused}")
    if sc.view_settings.view_transform != "Standard":
        rep["info"].append(f"view transform {sc.view_settings.view_transform}: palette colors will shift "
                           "(Standard gives predictable flat color)")
    return rep


def verdict(rep):
    return rep["issues"] or ["no measurable problems"]


# --------------------------------------------------------------------------- render and review

def render_frame(path, frame=None, scene=None, res_pct=None, transparent=None):
    """Render one frame to PNG and return the path (restores render settings)."""
    sc = scene or bpy.context.scene
    r = sc.render
    saved = (r.filepath, r.resolution_percentage, r.film_transparent, sc.frame_current)
    fmt = (r.image_settings.media_type, r.image_settings.file_format)
    try:
        if frame is not None:
            sc.frame_set(frame)
        if res_pct is not None:
            r.resolution_percentage = res_pct
        if transparent is not None:
            r.film_transparent = transparent
        r.image_settings.media_type = "IMAGE"
        r.image_settings.file_format = "PNG"
        r.filepath = path
        bpy.ops.render.render(write_still=True, scene=sc.name)
    finally:
        r.filepath, r.resolution_percentage, r.film_transparent, cur = saved
        r.image_settings.media_type = fmt[0]            # 5.x: media_type before file_format
        r.image_settings.file_format = fmt[1]
        sc.frame_set(cur)
    return path


def _load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a


def _save(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new("BX_gp_out", w, h, alpha=True)
    im.pixels = arr.ravel()
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    return path


def render_strip(out_path, frames, cols=None, res_pct=50, scene=None):
    """Render frames and tile them left->right, top->bottom into one sheet (the headless
    substitute for flipping and onion skin: timing, spacing, pops). Legend next to it."""
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.append(EXPERT_SCRIPTS)
    import bx_review
    frames = list(frames)
    tmp = tempfile.mkdtemp(prefix="bx_gp_strip_")
    paths = [render_frame(os.path.join(tmp, f"f{f:04d}.png"), f, scene, res_pct) for f in frames]
    cols = cols or min(len(frames), 6)
    rows = -(-len(frames) // cols)
    while len(paths) < rows * cols:                       # pad with a blank tile
        blank = np.ones_like(_load(paths[0]))
        paths.append(_save(blank, os.path.join(tmp, f"blank{len(paths)}.png")))
    return bx_review._tile(paths, rows, cols, out_path, [f"frame {f}" for f in frames])


def onion(out_path, frame, before=(), after=(), opacity=0.3, res_pct=50, scene=None,
          before_color=(0.1, 0.75, 0.25), after_color=(0.55, 0.25, 0.95)):
    """Rendered onion skin: neighbor frames as tinted ghosts (green before, purple after,
    like the viewport) under the current frame, on white. Unlike the viewport overlay it
    includes modifiers and object motion, the blind spots Falk David and Rik Schutte name."""
    tmp = tempfile.mkdtemp(prefix="bx_gp_onion_")
    cur = _load(render_frame(os.path.join(tmp, "cur.png"), frame, scene, res_pct, transparent=True))
    out = np.ones_like(cur)
    for frames, tint in ((before, before_color), (after, after_color)):
        for f in frames:
            g = _load(render_frame(os.path.join(tmp, f"g{f}.png"), f, scene, res_pct, transparent=True))
            a = g[..., 3:4] * opacity
            out[..., :3] = out[..., :3] * (1 - a) + np.array(tint, np.float32) * a
    a = cur[..., 3:4]
    out[..., :3] = out[..., :3] * (1 - a) + cur[..., :3] * a
    out[..., 3] = 1.0
    return _save(out, out_path)


# --------------------------------------------------------------------------- headless edits (sculpt / eraser substitutes)

def edit_op(ob, op, select="ALL", **kw):
    """Run a grease_pencil.* Edit-mode operator headless on every stroke of the visible,
    unlocked layers at the current frame, e.g. edit_op(ob, "stroke_smooth", iterations=5,
    factor=1.0), "stroke_simplify", "set_uniform_thickness", "stroke_subdivide",
    "set_curve_type", "outline", "join_fills", "separate_fills", "caps_set", "dissolve".
    Returns the operator result. View-dependent ops (stroke_trim, reproject, erase_*)
    need a live session: see gui_trim / gui_reproject / gui_erase_box."""
    vl = bpy.context.view_layer
    vl.objects.active = ob
    ob.select_set(True)
    prev = ob.mode
    if prev != "EDIT":
        bpy.ops.object.mode_set(mode="EDIT")
    try:
        if select == "ALL":
            bpy.ops.grease_pencil.select_all(action="SELECT")
        mod, name = ("grease_pencil", op) if "." not in op else op.split(".")
        return getattr(getattr(bpy.ops, mod), name)(**kw)
    finally:
        bpy.ops.object.mode_set(mode=prev)


def grab(d, center, radius, offset, strokes=None):
    """Sculpt-Grab equivalent on data: move points within `radius` of `center` by
    `offset` with a smooth falloff (Grant Abbitt fixes curves with Grab rather than
    redrawing). strokes: indices to affect (default all: lock by choosing)."""
    P, R, O = _arrays(d)
    c = np.asarray(center, np.float32)
    w = np.clip(1.0 - np.linalg.norm(P - c, axis=1) / radius, 0.0, 1.0)
    w = w * w * (3 - 2 * w)
    if strokes is not None:
        offs = [o.value for o in d.curve_offsets]
        mask = np.zeros(len(P), bool)
        for si in strokes:
            mask[offs[si]:offs[si + 1]] = True
        w = w * mask
    P = P + w[:, None] * np.asarray(offset, np.float32)
    _write_points(d, "position", "FLOAT_VECTOR", 0, P, (0, 0, 0))
    d.tag_positions_changed()
    return int((w > 0).sum())


def dissolve(d, stroke_index, point_indices):
    """Remove points from one stroke and keep it continuous (Pablo Fournier: dissolve,
    never delete, stray points; deleting breaks the stroke in two)."""
    offs = [o.value for o in d.curve_offsets]
    a, b = offs[stroke_index], offs[stroke_index + 1]
    drop = {a + i for i in point_indices}
    keep = [k for k in range(len(d.attributes["position"].data)) if k not in drop]
    if b - a - len(drop) < 1:
        d.remove_strokes(indices=[stroke_index])
        return 0
    arrays = {}
    for name, dt, dflt in (("position", "FLOAT_VECTOR", (0, 0, 0)), ("radius", "FLOAT", RADIUS_DEFAULT),
                           ("opacity", "FLOAT", 1.0), ("vertex_color", "FLOAT_COLOR", (0, 0, 0, 0))):
        if name in d.attributes:
            w = _WIDTH[dt]
            buf = np.empty(len(d.attributes[name].data) * w, np.float32)
            d.attributes[name].data.foreach_get(_KEY[dt], buf)
            arrays[name] = (dt, dflt, buf.reshape(-1, w)[keep])
    d.resize_strokes(sizes=[b - a - len(drop)], indices=[stroke_index])
    for name, (dt, dflt, arr) in arrays.items():
        _write_points(d, name, dt, 0, arr, dflt)
    d.tag_positions_changed()
    return b - a - len(drop)


# --------------------------------------------------------------------------- live session (view-dependent ops)
# Verified on 5.2.1 GUI: grease_pencil.brush_stroke and sculpt_paint have NO exec
# ("Invalid operator call", PASS_THROUGH): real draw/sculpt brushes cannot be driven
# with a stroke list the way bx_gui drives mesh sculpt. Replayed mouse events
# (Window.event_simulate with --enable-event-simulate) produced no stroke either.
# Strokes are data (add_stroke); these view-dependent edit ops DO run with an override.

def _gui():
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.append(EXPERT_SCRIPTS)
    import bx_gui
    if not bx_gui.has_window():
        raise RuntimeError("needs a Blender window (live session); headless use the data helpers")
    return bx_gui


def gui_frame(points, axis="FRONT", margin=1.6):
    """Point the first 3D view along `axis`, orthographic, framing world `points`."""
    bx_gui = _gui()
    win, area, region, rv3d = bx_gui.view3d()
    bx_gui.run("view3d.view_axis", type=axis)
    P = np.array(points, float)
    lo, hi = P.min(0), P.max(0)
    rv3d.view_perspective = "ORTHO"
    rv3d.view_location = Vector(((lo + hi) / 2).tolist())
    rv3d.view_distance = max(float(np.max(hi - lo)), 0.5) * margin
    rv3d.update()
    return region, rv3d


def _enter(ob, mode):
    bx_gui = _gui()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if ob.mode != mode:
        bx_gui.run("object.mode_set", mode=mode)
    return bx_gui


def _to_region(region, rv3d, p):
    from bpy_extras import view3d_utils
    v = view3d_utils.location_3d_to_region_2d(region, rv3d, Vector(p))
    return (v.x, v.y)


def gui_trim(ob, lasso, axis="FRONT"):
    """LIVE SESSION ONLY. Trim tool: inside the lasso (world points seen from `axis`), cut
    overshooting stroke ends back to the nearest intersection (Grant Abbitt: overlap on
    purpose, then trim). Lock layers you do not want cut. Returns the op result."""
    bx_gui = _enter(ob, "PAINT_GREASE_PENCIL")
    region, rv3d = gui_frame(lasso, axis)
    path = [{"name": "", "loc": _to_region(region, rv3d, p), "time": 0.0} for p in lasso]
    r = bx_gui.run("grease_pencil.stroke_trim", path=path)
    bx_gui.run("object.mode_set", mode="OBJECT")
    return r


def gui_erase_box(ob, lo, hi, axis="FRONT"):
    """LIVE SESSION ONLY. Erase every point inside the screen box spanned by world
    points lo and hi (Draw mode box eraser; strokes are cut, not deleted whole)."""
    bx_gui = _enter(ob, "PAINT_GREASE_PENCIL")
    region, rv3d = gui_frame([lo, hi], axis, margin=3.0)
    a, b = _to_region(region, rv3d, lo), _to_region(region, rv3d, hi)
    r = bx_gui.run("grease_pencil.erase_box", xmin=int(min(a[0], b[0])), xmax=int(max(a[0], b[0])),
                   ymin=int(min(a[1], b[1])), ymax=int(max(a[1], b[1])), wait_for_input=False)
    bx_gui.run("object.mode_set", mode="OBJECT")
    return r


def gui_reproject(ob, type="SURFACE", offset=0.0, axis="FRONT", keep_original=False, frame_points=None):
    """LIVE SESSION ONLY. Reproject all strokes of the current frame from the view onto
    surfaces (SURFACE), the cursor plane or an axis plane. Headless alternative:
    project_to_surface() on the point positions."""
    bx_gui = _enter(ob, "EDIT")
    if frame_points is not None:
        gui_frame(frame_points, axis)
    else:
        bx_gui.run("view3d.view_axis", type=axis)
    bx_gui.run("grease_pencil.select_all", action="SELECT")
    r = bx_gui.run("grease_pencil.reproject", type=type, offset=offset, keep_original=keep_original)
    bx_gui.run("object.mode_set", mode="OBJECT")
    return r
