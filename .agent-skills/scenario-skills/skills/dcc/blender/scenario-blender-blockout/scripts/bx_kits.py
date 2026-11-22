"""
bx_kits: shaped and detailed proxies, color schemes, figures in four cast styles, crowds
and traffic for a bx_blockout scene. The levels these serve (density, fidelity, color) are
in references/levels.md; the cast styles in references/cast.md.

Runs inside Blender beside bx_blockout, under the same rules: builders are get-or-create
by name, refuse names the user's own work holds, and tag every datablock they make.

  import sys; sys.path.insert(0, "<absolute path of this skill>/scripts")
  for m in ("bx_blockout", "bx_kits"): sys.modules.pop(m, None)  # Blender keeps old imports
  import bx_blockout as B, bx_kits as K
  pal = K.scheme("category")                                   # role -> color
  K.building("ENV_shop_a", (8, 6, 9), (12, 4, 0), fidelity="detailed", pal=pal, floors=3)
  K.tree("ENV_tree_01", (4, -3, 0), height=6, fidelity="shaped", pal=pal)
  K.vehicle("PRP_car_01", "car", (0, 10, 0), facing_deg=180, fidelity="shaped", rgb=pal["vehicle"])
  hero = K.figure("red", 1.75, (0, 20, 0), style="featured", features=("hair", "backpack"))
  K.walk_path(hero, [(1, (0, 20)), (120, (0, 8))])             # glides with a step bob
  K.crowd("BG", 24, area=(-6, 6, 0, 40), frames=(1, 192), fidelity="rough", pal=pal)
  van = K.vehicle("PRP_van_02", "van", (-30, 5, 0), facing_deg=-90, pal=pal)
  K.drive(van, [(1, (-30, 5)), (192, (30, 5))]); K.mark_extra(van)  # background traffic
  K.audit_budget("advanced")                                   # [] = the scene meets the level
  B.solid_view()                                               # Material: kits are multi-color

Fidelity is one of "rough" (boxes, cylinders), "shaped" (bevels, composed silhouettes) or
"detailed" (openings, trims, parts a camera would read at 2 m). Figures take a cast style
instead (CAST: capsule, featured, jointed, mannequin), set apart from the set's fidelity.
A kit is one mesh with one material slot per role color, so a detailed building stays
one object; Solid view needs color type Material to show more than one color per object.
Kit materials are shared per color and named after it (MAT_cc0d0d), and every kit call
resets them: recolor a part through the kit's arguments, never by editing its material.
"""

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import bx_blockout as B

FIDELITY = ("rough", "shaped", "detailed")

# -- color schemes -------------------------------------------------------------------------
# Roles a set is built from. Every scheme maps every role, so a kit can ask for any of them.
ROLES = ("ground", "road", "wall", "roof", "trim", "opening", "glass", "vegetation", "trunk",
         "water", "rock", "prop", "fabric", "metal", "vehicle", "light", "sign", "crowd")

_GRAY = {r: v for r, v in zip(ROLES, (0.30, 0.22, 0.48, 0.38, 0.55, 0.16, 0.20, 0.42, 0.34,
                                      0.26, 0.40, 0.46, 0.50, 0.36, 0.44, 0.90, 0.52, 0.58))}

SCHEMES = {
    # Neutral set, color only on tracked elements (bx_blockout's PALETTE). Lowest leak risk;
    # weakest separation of masses.
    "identity": {r: (v, v, v) for r, v in _GRAY.items()},
    # One muted hue per role: masses separate at a glance and the legend is short. Movers
    # still take saturated PALETTE colors so they stand out from any role.
    "category": {
        "ground": (0.33, 0.33, 0.35), "road": (0.20, 0.20, 0.23), "wall": (0.70, 0.62, 0.50),
        "roof": (0.55, 0.36, 0.30), "trim": (0.82, 0.80, 0.74), "opening": (0.12, 0.12, 0.14),
        "glass": (0.36, 0.52, 0.62), "vegetation": (0.38, 0.58, 0.32), "trunk": (0.42, 0.32, 0.24),
        "water": (0.28, 0.46, 0.66), "rock": (0.52, 0.50, 0.47), "prop": (0.74, 0.56, 0.30),
        "fabric": (0.66, 0.42, 0.58), "metal": (0.56, 0.60, 0.64), "vehicle": (0.62, 0.66, 0.72),
        "light": (1.00, 0.92, 0.62), "sign": (0.86, 0.70, 0.36), "crowd": (0.47, 0.46, 0.47),
    },
    # Colors close to the real material's albedo: whatever leaks into the render is already
    # right. Use when the look reference covers the whole frame.
    "material": {
        "ground": (0.36, 0.34, 0.31), "road": (0.14, 0.14, 0.15), "wall": (0.62, 0.55, 0.46),
        "roof": (0.36, 0.22, 0.18), "trim": (0.78, 0.75, 0.68), "opening": (0.08, 0.07, 0.07),
        "glass": (0.20, 0.30, 0.36), "vegetation": (0.18, 0.34, 0.14), "trunk": (0.27, 0.19, 0.13),
        "water": (0.10, 0.22, 0.30), "rock": (0.44, 0.42, 0.39), "prop": (0.48, 0.34, 0.20),
        "fabric": (0.50, 0.16, 0.14), "metal": (0.50, 0.52, 0.54), "vehicle": (0.30, 0.32, 0.36),
        "light": (1.00, 0.86, 0.55), "sign": (0.80, 0.18, 0.12), "crowd": (0.30, 0.28, 0.30),
    },
}

# Rear blocks of every vehicle. Hero red is B.PALETTE["red"] (0.8, 0.05, 0.05); a rear in that
# red reads as part of the hero wherever the two meet in frame.
REAR_RED = (0.32, 0.03, 0.03)


def scheme(name="category"):
    """Role -> RGB for a color scheme ("identity", "category" or "material")."""
    if name not in SCHEMES:
        raise ValueError(f"scheme must be one of {sorted(SCHEMES)}")
    return dict(SCHEMES[name])


def tint(rgb, seed, amount=0.07):
    """A repeatable value shift of `rgb` (one per instance), so neighbouring blocks of the
    same role still separate. amount 0.07 shifts value by up to 7 %."""
    k = 1.0 + (random.Random(seed).random() * 2.0 - 1.0) * amount
    return tuple(min(1.0, max(0.0, c * k)) for c in rgb)


def _fidelity(value):
    if value not in FIDELITY:
        raise ValueError(f"fidelity must be one of {FIDELITY}")
    return FIDELITY.index(value)


# -- one mesh from many primitives -----------------------------------------------------------


class Parts:
    """Collects primitives into one bmesh, one material slot per color. Sizes are in meters
    and a part is centered on `center` unless `base=True` puts its bottom there."""

    def __init__(self):
        self.bm = bmesh.new()
        self.colors = []

    def _slot(self, rgb):
        rgb = tuple(round(c, 4) for c in rgb)
        if rgb not in self.colors:
            self.colors.append(rgb)
        return self.colors.index(rgb)

    def add(self, kind, size, center, rgb, rot=(0.0, 0.0, 0.0), base=False, bevel=0.0, segments=12, taper=1.0):
        """kind: box, cylinder, cone, sphere, ico, wedge (a ramp rising along +Y), capsule (a
        cylinder with round ends, sx wide and sz tall). taper scales a cylinder's top radius."""
        sx, sy, sz = size
        cx, cy, cz = center
        if base:
            cz += sz / 2.0
        place = Matrix.Translation((cx, cy, cz)) @ Euler(rot).to_matrix().to_4x4()
        mat = place @ Matrix.Diagonal((sx, sy, sz, 1.0))
        before = set(self.bm.verts)
        if kind == "box":
            bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)
        elif kind in ("cylinder", "cone"):
            bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segments, radius1=0.5,
                                  radius2=0.5 * taper if kind == "cylinder" else 0.0, depth=1.0, matrix=mat)
        elif kind == "capsule":
            # An odd ring count leaves no ring on the equator, so the stretch makes straight sides.
            bmesh.ops.create_uvsphere(self.bm, u_segments=segments, v_segments=(segments // 2) | 1, radius=0.5,
                                      matrix=Matrix.Diagonal((sx, sy, sx, 1.0)))
            made = [v for v in self.bm.verts if v not in before]
            half = max(0.0, sz - sx) / 2.0
            for v in made:
                v.co.z += half if v.co.z > 0.0 else -half
            bmesh.ops.transform(self.bm, matrix=place, verts=made)
        elif kind == "sphere":
            bmesh.ops.create_uvsphere(self.bm, u_segments=segments, v_segments=max(6, segments // 2), radius=0.5, matrix=mat)
        elif kind == "ico":
            bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=0.5, matrix=mat)
        elif kind == "wedge":
            pts = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5), (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5)]
            v = [self.bm.verts.new(mat @ Vector(p)) for p in pts]
            for f in ((0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 5), (3, 0, 4), (2, 3, 4, 5)):
                self.bm.faces.new([v[i] for i in f])
        else:
            raise ValueError(f"unknown primitive {kind!r}")
        new = [v for v in self.bm.verts if v not in before]
        faces = {f for v in new for f in v.link_faces}
        slot = self._slot(rgb)
        for f in faces:
            f.material_index = slot
        if bevel > 0.0:
            edges = list({e for f in faces for e in f.edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=2, affect="EDGES", profile=0.5)
        return self

    def to_object(self, name, location=(0.0, 0.0, 0.0), facing_deg=0.0, coll=None, parent=None, material_name=None):
        """Write the parts into object `name` (get-or-create, like B.box): one shared
        material per color (the first part's color takes `material_name` when given),
        object color set to the first part's color."""
        obj = bpy.data.objects.get(name)
        if obj is not None:
            B._own(obj, None)
        mesh = obj.data if obj is not None else bpy.data.meshes.new(name)
        # Slots first: clearing a mesh's materials resets every face's material index.
        mesh.materials.clear()
        for i, rgb in enumerate(self.colors):
            mat_name = material_name if i == 0 and material_name else B.material_name_for(rgb)
            mesh.materials.append(B.identity_material(mat_name, rgb))
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        if obj is None:
            obj = B._own(None, lambda: bpy.data.objects.new(name, mesh))
            (coll or bpy.context.scene.collection).objects.link(obj)
        obj.color = (*self.colors[0], 1.0) if self.colors else (1.0, 1.0, 1.0, 1.0)
        if parent is not None:
            obj.parent = parent
            obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.location = location
        obj.rotation_euler = (0.0, 0.0, math.radians(facing_deg))
        obj.scale = (1.0, 1.0, 1.0)
        return obj


# -- set kits -------------------------------------------------------------------------------


def building(name, size, location, fidelity="shaped", pal=None, floors=None, roof="flat", facing_deg=0.0, seed=0, coll=None):
    """A building with its street face toward local -Y. size = (width, depth, height).
    rough: one box. shaped: plinth, floor bands, roof, a door. detailed: window grid with
    sills, a shop front, balconies on upper floors, rooftop units."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    w, d, h = size
    wall = tint(pal["wall"], seed)
    p = Parts()
    if lvl == 0:
        p.add("box", (w, d, h), (0, 0, 0), wall, base=True)
        return p.to_object(name, location, facing_deg, coll)
    floors = floors or max(1, int(h // 3.2))
    fh = h / floors
    p.add("box", (w, d, h), (0, 0, 0), wall, base=True, bevel=0.03)
    p.add("box", (w + 0.1, d + 0.1, 0.5), (0, 0, 0), pal["trim"], base=True)
    for i in range(1, floors):
        p.add("box", (w + 0.06, d + 0.06, 0.14), (0, 0, i * fh), pal["trim"], base=True)
    if roof == "gable":
        p.add("wedge", (w + 0.4, d / 2 + 0.2, min(3.0, d * 0.4)), (0, -d / 4, h), pal["roof"], base=True)
        p.add("wedge", (w + 0.4, d / 2 + 0.2, min(3.0, d * 0.4)), (0, d / 4, h), pal["roof"], rot=(0, 0, math.pi), base=True)
    else:
        p.add("box", (w + 0.2, d + 0.2, 0.3), (0, 0, h), pal["roof"], base=True)
    front = -d / 2
    p.add("box", (1.1, 0.2, 2.2), (-w * 0.3, front - 0.02, 0), pal["opening"], base=True)
    if lvl >= 2:
        rng = random.Random(seed)
        cols = max(1, int(w // 2.2))
        step = w / cols
        p.add("box", (w * 0.9, 0.25, 0.5), (0, front - 0.1, 2.9), pal["sign"], base=True)
        p.add("box", (w * 0.55, 0.12, 2.3), (w * 0.15, front - 0.03, 0.3), pal["glass"], base=True)
        for f in range(1, floors):
            z = f * fh + fh * 0.3
            for c in range(cols):
                x = -w / 2 + step * (c + 0.5)
                p.add("box", (step * 0.5, 0.16, fh * 0.5), (x, front - 0.04, z), pal["glass"], base=True)
                p.add("box", (step * 0.62, 0.3, 0.08), (x, front - 0.1, z - 0.06), pal["trim"], base=True)
            if f >= 1 and rng.random() < 0.5:
                bx = -w / 2 + step * (rng.randrange(cols) + 0.5)
                p.add("box", (step * 0.9, 0.9, 0.12), (bx, front - 0.45, f * fh), pal["metal"], base=True)
                p.add("box", (step * 0.9, 0.05, 0.9), (bx, front - 0.88, f * fh + 0.12), pal["metal"], base=True)
        for _ in range(rng.randint(1, 3)):
            p.add("box", (rng.uniform(0.8, 1.6), rng.uniform(0.8, 1.4), rng.uniform(0.6, 1.2)),
                  (rng.uniform(-w / 3, w / 3), rng.uniform(-d / 4, d / 4), h + 0.3), pal["metal"], base=True)
    return p.to_object(name, location, facing_deg, coll)


def tree(name, location, height=6.0, fidelity="shaped", pal=None, kind="broadleaf", seed=0, coll=None):
    """rough: trunk and one crown. shaped: trunk and three overlapping crown masses.
    detailed: branches and seven to ten crown clusters, so the outline reads as foliage,
    not a ball (a single low-poly crown against the sky renders as topiary)."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    rng = random.Random(seed)
    leaf, bark = tint(pal["vegetation"], seed), pal["trunk"]
    p = Parts()
    trunk_h = height * (0.45 if kind == "broadleaf" else 0.25)
    p.add("cylinder", (height * 0.06, height * 0.06, trunk_h + 0.3), (0, 0, 0), bark, base=True, segments=8)
    if kind == "conifer":
        tiers = 1 if lvl == 0 else (3 if lvl == 1 else 5)
        for i in range(tiers):
            t = i / max(1, tiers)
            size = height * 0.45 * (1 - t * 0.7)
            p.add("cone", (size, size, height * 0.75 / tiers * 1.6), (0, 0, trunk_h + height * 0.75 * t), leaf, base=True, segments=10)
        return p.to_object(name, location, 0.0, coll)
    r = height * 0.32
    top = trunk_h + r * 0.9
    if lvl == 0:
        p.add("sphere", (2 * r, 2 * r, 1.7 * r), (0, 0, top), leaf, segments=10)
    else:
        n = 3 if lvl == 1 else rng.randint(7, 10)
        for i in range(n):
            a = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
            off = r * (0.45 if lvl == 1 else 0.7) * rng.uniform(0.6, 1.0)
            s = r * (1.25 if lvl == 1 else rng.uniform(0.6, 0.9))
            p.add("ico", (s * 1.6, s * 1.6, s * 1.3), (math.cos(a) * off, math.sin(a) * off, top + rng.uniform(-0.3, 0.5) * r), tint(leaf, seed + i, 0.1))
        if lvl == 2:
            for i in range(3):
                a = 2 * math.pi * i / 3 + 0.4
                p.add("cylinder", (0.12, 0.12, r * 1.3), (math.cos(a) * r * 0.35, math.sin(a) * r * 0.35, trunk_h + r * 0.4), bark, rot=(math.cos(a) * 0.7, -math.sin(a) * 0.7, 0), segments=6)
    return p.to_object(name, location, 0.0, coll)


def _tube(p, a, b, thick, rgb, x=0.0):
    """A square tube from (y, z) point `a` to `b` in the plane x = `x`."""
    dy, dz = b[0] - a[0], b[1] - a[1]
    p.add("box", (thick, thick, math.hypot(dy, dz)), (x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), rgb,
          rot=(math.atan2(-dy, dz), 0.0, 0.0))


def _bicycle(name, location, facing_deg, lvl, body, pal, coll, rear_rgb, size):
    """A bicycle 1.75 m long at size 1 (wheel radius 0.34 m), front at local -Y, and its
    cranks as a child object, NAME_cranks, spinning on local X so K.pedal can key them."""
    r, tire, dark = 0.34, 0.05, (0.08, 0.08, 0.09)
    bb, seat, head_top, head_bot = (0.02, 0.29), (0.18, 0.80), (-0.38, 0.80), (-0.42, 0.62)
    rear, front, bars, crank = (0.535, r), (-0.535, r), (-0.40, 0.98), 0.17
    p = Parts()
    for y in (front[0], rear[0]):
        p.add("cylinder", (2 * r, 2 * r, tire), (0, y, r), dark, rot=(0, math.pi / 2, 0), segments=20)
        if lvl == 2:
            p.add("cylinder", (0.12, 0.12, 0.1), (0, y, r), pal["metal"], rot=(0, math.pi / 2, 0), segments=10)
    for a, b in ((bb, seat), (bb, head_bot), (seat, head_top), (bb, rear)):
        _tube(p, a, b, 0.045, body)
    if lvl >= 1:
        _tube(p, head_bot, head_top, 0.06, body)
        for x in (-0.05, 0.05):
            _tube(p, (0.16, 0.76), rear, 0.03, body, x)  # seat stays
            _tube(p, head_bot, front, 0.035, body, x)  # fork
    _tube(p, head_top, bars, 0.04, pal["metal"])  # stem
    p.add("box", (0.56, 0.04, 0.04), (0, bars[0], bars[1]), pal["metal"])  # handlebar
    p.add("box", (0.14, 0.26, 0.06), (0, seat[0] + 0.04, seat[1] + 0.03), dark)  # saddle, top at 0.86
    p.add("box", (0.1, 0.06, 0.08), (0, head_top[0] - 0.07, 0.76), pal["light"])  # lamp
    p.add("box", (0.08, 0.04, 0.06), (0, seat[0] + 0.12, 0.74), rear_rgb)  # rear reflector
    q = Parts()
    for x, z in ((0.07, crank), (-0.07, -crank)):  # L arm up at rest, R arm down
        q.add("box", (0.03, 0.03, crank), (x, 0, z / 2), pal["metal"])
        q.add("box", (0.09, 0.06, 0.025), (x * 1.6, 0, z), dark)
    if lvl == 2:
        q.add("cylinder", (0.2, 0.2, 0.01), (-0.05, 0, 0), pal["metal"], rot=(0, math.pi / 2, 0), segments=16)
    for parts in (p, q):
        if size != 1.0:
            bmesh.ops.scale(parts.bm, vec=(size, size, size), verts=list(parts.bm.verts))
    obj = p.to_object(name, location, facing_deg, coll)
    cranks = q.to_object(f"{name}_cranks", (0, bb[0] * size, bb[1] * size), 0.0, coll, parent=obj)
    cranks.rotation_mode = "XYZ"
    cranks["vehicle_part"] = True  # spins with K.pedal but counts with the bike
    obj["saddle"] = (seat[0] * size + 0.04 * size, 0.86 * size)
    obj["bars"] = (bars[0] * size, bars[1] * size)
    obj["crank"] = (bb[0] * size, bb[1] * size, crank * size)
    return obj


def vehicle(name, kind="car", location=(0.0, 0.0, 0.0), facing_deg=0.0, fidelity="shaped", rgb=None, pal=None, coll=None, rear_rgb=REAR_RED,
            size=1.0):
    """Car, van, bus, scooter or bicycle facing local -Y, front marked in geometry: pale
    headlight blocks and a darker grille at the front, `rear_rgb` blocks at the rear (a dark
    red that never reads as the red hero), so the model cannot drive it backward. Wheels are
    one mesh here; spin a separate wheel object only for a close shot that reads rotation.
    rough: body, cabin, wheels. shaped: bevels, glass band, bumpers. detailed: mirrors,
    seats, wheel hubs, number plates. A bicycle is a frame of tubes with a lamp in front and
    a reflector behind; its cranks are a child object, NAME_cranks, spinning on local X.
    `size` scales the whole build: a bicycle for a rider of height h takes about h / 1.75."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    body = rgb or pal["vehicle"]
    dims = {"car": (1.8, 4.4, 1.45, 0.32), "van": (2.0, 5.2, 2.2, 0.34), "bus": (2.5, 11.0, 3.1, 0.5), "scooter": (0.7, 1.8, 1.15, 0.22),
            "bicycle": None}
    if kind not in dims:
        raise ValueError(f"kind must be one of {sorted(dims)}")
    if kind == "bicycle":
        return _bicycle(name, location, facing_deg, lvl, body, pal, coll, rear_rgb, size)
    w, l, h, r = dims[kind]
    bev = 0.06 if lvl else 0.0
    p = Parts()
    if kind == "scooter":
        p.add("box", (0.5, 1.3, 0.35), (0, 0.1, r * 1.4), body, bevel=bev)
        p.add("box", (0.45, 0.35, 0.8), (0, -0.55, r * 1.4 + 0.3), body, bevel=bev)
        p.add("cylinder", (0.06, 0.06, 0.6), (0, -0.62, r * 2 + 0.75), pal["metal"], rot=(0, math.pi / 2, 0), segments=8)
        p.add("box", (0.4, 0.6, 0.12), (0, 0.35, r * 1.4 + 0.25), pal["fabric"])
    else:
        cab_l = l * (0.5 if kind == "car" else 0.92)
        p.add("box", (w, l, h * 0.5), (0, 0, r * 0.9), body, base=True, bevel=bev)
        p.add("box", (w * 0.94, cab_l, h * 0.5), (0, l * (0.06 if kind == "car" else 0.0), r * 0.9 + h * 0.5), body, base=True, bevel=bev)
        if lvl >= 1:
            p.add("box", (w * 0.96, cab_l * 0.92, h * 0.32), (0, l * (0.06 if kind == "car" else 0.0), r * 0.9 + h * 0.56), pal["glass"], base=True)
            p.add("box", (w * 1.02, 0.18, 0.22), (0, -l / 2, r * 0.9), pal["trim"], base=True)
            p.add("box", (w * 1.02, 0.18, 0.22), (0, l / 2, r * 0.9), pal["trim"], base=True)
        p.add("box", (w * 0.6, 0.06, h * 0.16), (0, -l / 2 - 0.02, r * 0.9 + h * 0.18), pal["opening"], base=True)
    front_z = r * (2.2 if kind == "scooter" else 1.9)
    for side in ((-0.32, 0.32) if kind != "scooter" else (0.0,)):
        p.add("box", (max(0.14, w * 0.18), 0.08, 0.12), (side * w, -l / 2 - 0.03, front_z), pal["light"])
        p.add("box", (max(0.14, w * 0.18), 0.08, 0.12), (side * w, l / 2 + 0.03, front_z), rear_rgb)
    axles = (-l * 0.32, l * 0.32) if kind != "scooter" else (-l * 0.36, l * 0.36)
    sides = (-w / 2 + 0.12, w / 2 - 0.12) if kind != "scooter" else (0.0,)
    for y in axles:
        for x in sides:
            p.add("cylinder", (2 * r, 2 * r, 0.22 if kind != "scooter" else 0.1), (x, y, r), (0.08, 0.08, 0.09), rot=(0, math.pi / 2, 0), segments=16)
            if lvl == 2:
                p.add("cylinder", (r, r, 0.24 if kind != "scooter" else 0.12), (x, y, r), pal["metal"], rot=(0, math.pi / 2, 0), segments=10)
    if lvl == 2 and kind != "scooter":
        for s in (-1, 1):
            p.add("box", (0.22, 0.1, 0.12), (s * (w / 2 + 0.1), -l * 0.08, r * 0.9 + h * 0.55), body)
        p.add("box", (0.5, 0.04, 0.12), (0, -l / 2 - 0.1, r * 0.9 + 0.05), pal["trim"], base=True)
        p.add("box", (0.5, 0.04, 0.12), (0, l / 2 + 0.1, r * 0.9 + 0.05), pal["trim"], base=True)
        for s in (-1, 1):
            p.add("box", (w * 0.36, 0.5, 0.5), (s * w * 0.22, l * 0.02, r * 0.9 + h * 0.5), pal["fabric"], base=True)
    if size != 1.0:
        bmesh.ops.scale(p.bm, vec=(size, size, size), verts=list(p.bm.verts))
    return p.to_object(name, location, facing_deg, coll)


def stall(name, location, width=2.6, depth=1.8, fidelity="shaped", pal=None, facing_deg=0.0, seed=0, coll=None):
    """Market stall facing local -Y: counter, posts, awning. shaped adds a back shelf and
    goods; detailed adds hanging lanterns, a sign board and stools."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    rng = random.Random(seed)
    p = Parts()
    p.add("box", (width, depth * 0.45, 1.0), (0, -depth * 0.25, 0), tint(pal["prop"], seed), base=True, bevel=0.02 if lvl else 0.0)
    for x in (-width / 2 + 0.05, width / 2 - 0.05):
        for y in (-depth / 2 + 0.05, depth / 2 - 0.05):
            p.add("box", (0.08, 0.08, 2.4), (x, y, 0), pal["metal"], base=True)
    p.add("wedge" if lvl else "box", (width + 0.3, depth + 0.4, 0.35 if lvl else 0.08), (0, 0, 2.4), tint(pal["fabric"], seed + 7, 0.15), base=True)
    if lvl >= 1:
        p.add("box", (width * 0.9, 0.35, 1.6), (0, depth * 0.35, 0), pal["prop"], base=True)
        for i in range(rng.randint(3, 6)):
            p.add("cylinder", (0.25, 0.25, 0.25), (rng.uniform(-width / 2 + 0.2, width / 2 - 0.2), -depth * 0.25, 1.0), tint(pal["metal"], seed + i, 0.15), base=True, segments=10)
    if lvl == 2:
        p.add("box", (width * 0.7, 0.06, 0.45), (0, -depth / 2 - 0.15, 2.0), pal["sign"], base=True)
        for i in range(3):
            x = -width / 2 + width * (i + 0.5) / 3
            p.add("sphere", (0.32, 0.32, 0.4), (x, -depth / 2 - 0.2, 2.15), pal["light"], segments=10)
        for i in range(2):
            p.add("cylinder", (0.35, 0.35, 0.65), (-0.6 + 1.2 * i, -depth / 2 - 0.55, 0), pal["metal"], base=True, segments=10)
    return p.to_object(name, location, facing_deg, coll)


def street_lamp(name, location, height=4.5, fidelity="shaped", pal=None, facing_deg=0.0, coll=None):
    """Straight pole and a lamp head. Keep it straight: a curved pole proxy can render as
    a snake. detailed adds a base and an arm."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    p = Parts()
    p.add("cylinder", (0.12, 0.12, height), (0, 0, 0), pal["metal"], base=True, segments=8)
    if lvl == 2:
        p.add("cylinder", (0.3, 0.3, 0.5), (0, 0, 0), pal["metal"], base=True, segments=8)
        p.add("box", (0.08, 0.9, 0.08), (0, -0.45, height - 0.1), pal["metal"], base=True)
        p.add("box", (0.35, 0.45, 0.2), (0, -0.85, height - 0.35), pal["light"], base=True)
    else:
        p.add("box", (0.35, 0.35, 0.3), (0, 0, height), pal["light"], base=True)
    return p.to_object(name, location, facing_deg, coll)


def rock(name, location, size=1.0, fidelity="shaped", pal=None, seed=0, coll=None):
    """A boulder. rough: a flattened box. shaped and detailed: a jittered icosphere (two
    clustered at detailed). Avoid holes and faces: a holed rock can read as a skull."""
    pal = pal or scheme("category")
    lvl = _fidelity(fidelity)
    rng = random.Random(seed)
    p = Parts()
    if lvl == 0:
        p.add("box", (size, size * 0.8, size * 0.6), (0, 0, 0), tint(pal["rock"], seed), base=True)
        return p.to_object(name, location, rng.uniform(0, 360), coll)
    for i in range(1 if lvl == 1 else 2):
        s = size * (1.0 if i == 0 else 0.55)
        p.add("ico", (s, s * rng.uniform(0.7, 1.0), s * rng.uniform(0.5, 0.75)), (i * size * 0.55, i * size * 0.2, s * 0.25), tint(pal["rock"], seed + i))
    for v in p.bm.verts:
        v.co += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.5, 0.5))) * size * 0.08
    return p.to_object(name, location, rng.uniform(0, 360), coll)


def instance(source, name, location, yaw_deg=0.0, scale=1.0, coll=None):
    """Linked duplicate of a kit object (shares its mesh and colors): repeats cost one mesh."""
    src = bpy.data.objects[source] if isinstance(source, str) else source
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = B._own(None, lambda: bpy.data.objects.new(name, src.data))
        (coll or bpy.context.scene.collection).objects.link(obj)
    else:
        B._own(obj, None)
    obj.color = src.color
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
    obj.scale = (scale, scale, scale)
    return obj


def scatter_points(count, area, seed=0, min_dist=1.0, avoid=()):
    """Up to `count` (x, y) points in area (xmin, xmax, ymin, ymax), at least `min_dist`
    apart and outside every (x, y, radius) in `avoid` (keep the hero's lane clear)."""
    rng = random.Random(seed)
    pts = []
    for _ in range(count * 40):
        if len(pts) >= count:
            break
        x, y = rng.uniform(area[0], area[1]), rng.uniform(area[2], area[3])
        if any((x - ax) ** 2 + (y - ay) ** 2 < r * r for ax, ay, r in avoid):
            continue
        if all((x - px) ** 2 + (y - py) ** 2 >= min_dist ** 2 for px, py in pts):
            pts.append((x, y))
    return pts


# -- figures ----------------------------------------------------------------------------------
# The cast style decides what the video model copies from a figure (references/cast.md):
#   capsule    a colored capsule with a ball head, no limbs: the model invents body and gait
#   featured   a capsule plus signature features (hair, hood, backpack, a held lantern...)
#   jointed    thirteen rigid parts that walk_path steps: the model copies the limbs
#   mannequin  a gray mannequin skinned to an armature, fixed proportions: limbs copied
CAST = ("capsule", "featured", "jointed", "mannequin")

# Joint pivots and part boxes as fractions of the height. Each limb part's origin sits on
# its joint, so rotating the part swings it like a limb. (size x, y, z), pivot, offset of
# the box center from the pivot. The mannequin's bones start at the same pivots.
_JOINTED = {
    "pelvis": ((0.20, 0.11, 0.09), (0.0, 0.0, 0.50), (0.0, 0.0, 0.0), None),
    "torso": ((0.22, 0.12, 0.30), (0.0, 0.0, 0.54), (0.0, 0.0, 0.15), "pelvis"),
    "head": ((0.12, 0.13, 0.14), (0.0, 0.0, 0.86), (0.0, 0.0, 0.07), "torso"),
    "thigh_L": ((0.085, 0.095, 0.25), (0.05, 0.0, 0.49), (0.0, 0.0, -0.125), "pelvis"),
    "thigh_R": ((0.085, 0.095, 0.25), (-0.05, 0.0, 0.49), (0.0, 0.0, -0.125), "pelvis"),
    # Shins end at the ankle (0.03), inside the foot: one reaching the sole dips below it when tilted.
    "shin_L": ((0.075, 0.085, 0.22), (0.05, 0.0, 0.25), (0.0, 0.0, -0.11), "thigh_L"),
    "shin_R": ((0.075, 0.085, 0.22), (-0.05, 0.0, 0.25), (0.0, 0.0, -0.11), "thigh_R"),
    "foot_L": ((0.075, 0.15, 0.045), (0.05, 0.0, 0.03), (0.0, -0.05, -0.008), "shin_L"),
    "foot_R": ((0.075, 0.15, 0.045), (-0.05, 0.0, 0.03), (0.0, -0.05, -0.008), "shin_R"),
    "uparm_L": ((0.065, 0.075, 0.19), (0.14, 0.0, 0.82), (0.0, 0.0, -0.095), "torso"),
    "uparm_R": ((0.065, 0.075, 0.19), (-0.14, 0.0, 0.82), (0.0, 0.0, -0.095), "torso"),
    "forearm_L": ((0.06, 0.07, 0.19), (0.14, 0.0, 0.63), (0.0, 0.0, -0.095), "uparm_L"),
    "forearm_R": ((0.06, 0.07, 0.19), (-0.14, 0.0, 0.63), (0.0, 0.0, -0.095), "uparm_R"),
}
_BONE_TAILS = {
    "pelvis": (0.0, 0.0, 0.54), "torso": (0.0, 0.0, 0.84), "head": (0.0, 0.0, 1.0),
    "thigh_L": (0.05, 0.0, 0.25), "thigh_R": (-0.05, 0.0, 0.25),
    "shin_L": (0.05, 0.0, 0.03), "shin_R": (-0.05, 0.0, 0.03),
    "foot_L": (0.05, -0.11, 0.01), "foot_R": (-0.05, -0.11, 0.01),
    "uparm_L": (0.14, 0.0, 0.63), "uparm_R": (-0.14, 0.0, 0.63),
    "forearm_L": (0.14, 0.0, 0.44), "forearm_R": (-0.14, 0.0, 0.44),
}

# The capsule of the stand-in that let Seedance invent a natural walk in our film work: body
# radius, body top and head radius as fractions of the height.
_CAP_R, _CAP_TOP, _HEAD_R = 0.115, 0.875, 0.068
MANNEQUIN_GRAY, JOINT_GRAY = (0.62, 0.62, 0.64), (0.30, 0.30, 0.32)
_HAIR, _DARK, _LEATHER = (0.14, 0.09, 0.06), (0.09, 0.09, 0.10), (0.40, 0.27, 0.16)
_WOOD, _STEEL, _BRASS, _GLOW = (0.42, 0.32, 0.24), (0.56, 0.60, 0.64), (0.50, 0.36, 0.14), (1.0, 0.86, 0.55)


def _shade(rgb, k=0.6):
    return tuple(c * k for c in rgb)


def _f_hair(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    p.add("sphere", (2.15 * rh, 2.1 * rh, 1.9 * rh), (0, 0.35 * rh, zc + 0.3 * rh), c, segments=16)


def _f_long_hair(p, h, c):
    _f_hair(p, h, c)
    rh = _HEAD_R * h
    p.add("box", (1.8 * rh, 0.5 * rh, 0.17 * h), (0, _CAP_R * h * 0.75, h - 0.16 * h), c)


def _f_hood(p, h, c):
    rh, zc, r = _HEAD_R * h, h - _HEAD_R * h, _CAP_R * h
    p.add("sphere", (2.6 * rh, 2.6 * rh, 2.6 * rh), (0, 0.6 * rh, zc + 0.15 * rh), c, segments=16)
    p.add("cylinder", (2.1 * r, 2.1 * r, 0.07 * h), (0, 0, _CAP_TOP * h - 0.06 * h), c, base=True, segments=16, taper=0.75)


def _f_hat(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    p.add("cylinder", (3.4 * rh, 3.4 * rh, 0.012 * h), (0, 0, zc + 0.45 * rh), c, segments=20)
    p.add("cylinder", (2.0 * rh, 2.0 * rh, 1.0 * rh), (0, 0, zc + 0.45 * rh), c, base=True, segments=16, taper=0.92)


def _f_helmet(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    p.add("sphere", (2.3 * rh, 2.35 * rh, 2.2 * rh), (0, 0.12 * rh, zc + 0.22 * rh), c, segments=16)


def _f_goggles(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    p.add("cylinder", (2.12 * rh, 2.12 * rh, 0.25 * rh), (0, 0, zc + 0.38 * rh), c, segments=16)
    for s in (1, -1):  # two lenses on the forehead, half sunk into the head
        p.add("cylinder", (0.6 * rh, 0.6 * rh, 0.3 * rh), (s * 0.38 * rh, -0.86 * rh, zc + 0.38 * rh), c, rot=(math.pi / 2, 0, 0), segments=12)


def _f_nose(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    p.add("box", (0.6 * rh, 0.7 * rh, 0.5 * rh), (0, -0.95 * rh, zc - 0.05 * rh), c)


def _f_scarf(p, h, c):
    p.add("cylinder", (0.17 * h, 0.17 * h, 0.045 * h), (0, 0, 0.845 * h), c, segments=16)
    p.add("box", (0.07 * h, 0.02 * h, 0.24 * h), (-0.04 * h, 0.09 * h, 0.73 * h), c, rot=(0.17, 0, 0))


def _f_backpack(p, h, c):
    r = _CAP_R * h
    p.add("box", (1.55 * r, 0.9 * r, 0.27 * h), (0, 1.38 * r, 0.66 * h), c)


def _f_cape(p, h, c):
    r = _CAP_R * h
    p.add("box", (2.0 * r, 0.025 * h, 0.66 * h), (0, r + 0.012 * h, 0.50 * h), c, rot=(0.10, 0, 0))


def _f_coat(p, h, c):
    r = _CAP_R * h
    p.add("cylinder", (2.8 * r, 2.8 * r, 0.56 * h), (0, 0, 0.03 * h), c, base=True, segments=20, taper=0.75)


def _f_skirt(p, h, c):
    r = _CAP_R * h
    p.add("cylinder", (2.9 * r, 2.9 * r, 0.24 * h), (0, 0, 0.30 * h), c, base=True, segments=20, taper=0.72)


def _f_belt(p, h, c):
    r = _CAP_R * h
    p.add("cylinder", (2.08 * r, 2.08 * r, 0.035 * h), (0, 0, 0.50 * h), c, segments=20)


def _f_ears(p, h, c):
    rh, zc = _HEAD_R * h, h - _HEAD_R * h
    for s in (1, -1):
        p.add("cone", (0.55 * rh, 0.3 * rh, 1.0 * rh), (s * 0.55 * rh, 0.1 * rh, zc + 0.95 * rh), c, rot=(0, s * 0.3, 0), segments=8)


def _f_tail(p, h, c):
    r = _CAP_R * h
    p.add("cylinder", (0.07 * h, 0.07 * h, 0.38 * h), (0, r + 0.16 * h, 0.36 * h), c, rot=(-1.0, 0, 0), segments=10, taper=0.3)


def _f_bag(p, h, c):
    r = _CAP_R * h
    p.add("box", (0.42 * r, 0.55 * r, 0.10 * h), (1.2 * r, -0.15 * r, 0.46 * h), c)


def _f_sword(p, h, c):
    r = _CAP_R * h
    p.add("box", (0.012 * h, 0.035 * h, 0.40 * h), (r + 0.03 * h, 0.03 * h, 0.38 * h), c, rot=(0.45, 0, 0))
    p.add("box", (0.02 * h, 0.09 * h, 0.015 * h), (r + 0.03 * h, -0.05 * h, 0.555 * h), _DARK, rot=(0.45, 0, 0))


# Features merged into the capsule mesh: name -> (builder, default color; "shade" is a darker
# shade of the figure's color, "body" its color).
_WORN = {
    "hair": (_f_hair, _HAIR), "long_hair": (_f_long_hair, _HAIR), "hood": (_f_hood, "shade"),
    "hat": (_f_hat, (0.20, 0.15, 0.11)), "helmet": (_f_helmet, _STEEL), "goggles": (_f_goggles, _DARK),
    "nose": (_f_nose, "shade"), "scarf": (_f_scarf, "shade"), "backpack": (_f_backpack, "shade"),
    "cape": (_f_cape, "shade"), "coat": (_f_coat, "shade"), "skirt": (_f_skirt, "shade"),
    "belt": (_f_belt, _LEATHER), "ears": (_f_ears, "body"), "tail": (_f_tail, "body"),
    "bag": (_f_bag, _LEATHER), "sword": (_f_sword, _STEEL),
}
# Features built as child objects so walk_path can swing them and pose can key them.
_HELD = {"arms": "body", "lantern": _BRASS, "staff": _WOOD, "shield": _WOOD}
FEATURES = tuple(_WORN) + tuple(_HELD)


def _feature_color(feature, rgb, colors):
    c = (colors or {}).get(feature) or _WORN.get(feature, (None, _HELD.get(feature)))[1]
    return rgb if c == "body" else _shade(rgb) if c == "shade" else c


def _capsule(root_name, h, rgb, features, colors, location, facing_deg, coll):
    unknown = [f for f in features if f not in FEATURES]
    if unknown:
        raise ValueError(f"unknown features {unknown}; choose from {FEATURES}")
    p = Parts()
    p.add("capsule", (2 * _CAP_R * h, 2 * _CAP_R * h, _CAP_TOP * h), (0, 0, 0), rgb, base=True, segments=20)
    p.add("sphere", (2 * _HEAD_R * h,) * 3, (0, 0, h - _HEAD_R * h), rgb, segments=16)
    for f in features:
        if f in _WORN:
            _WORN[f][0](p, h, _feature_color(f, rgb, colors))
    root = p.to_object(root_name, location, facing_deg, coll, material_name=f"MAT_{root_name}")
    made = set()
    r = _CAP_R * h
    hand = {}
    if "arms" in features:
        c = _feature_color("arms", rgb, colors)
        for side, s in (("L", 1.0), ("R", -1.0)):
            a = Parts()
            a.add("capsule", (0.07 * h, 0.07 * h, 0.42 * h), (0, 0, -0.18 * h), c, segments=12)
            arm = a.to_object(f"{root_name}_arm_{side}", (s * (r + 0.03 * h), 0, 0.80 * h), 0.0, coll, parent=root)
            arm.rotation_mode, arm["swing_arm"] = "XYZ", s
            hand[side] = (arm, (0.0, -0.01 * h, -0.38 * h))
            made.add(arm.name)
    side_hand = {"R": (root, (-(r + 0.03 * h), -0.05 * h, 0.44 * h)), "L": (root, (r + 0.03 * h, -0.05 * h, 0.44 * h))}
    for f in ("lantern", "staff", "shield"):
        if f not in features:
            continue
        c = _feature_color(f, rgb, colors)
        parent, at = hand.get("L" if f == "shield" else "R") or side_hand["L" if f == "shield" else "R"]
        q = Parts()
        if f == "lantern":
            q.add("box", (0.008 * h, 0.008 * h, 0.05 * h), (0, 0, -0.025 * h), c)
            q.add("cylinder", (0.075 * h, 0.075 * h, 0.015 * h), (0, 0, -0.055 * h), c, segments=12)
            q.add("cylinder", (0.065 * h, 0.065 * h, 0.085 * h), (0, 0, -0.105 * h), _GLOW, segments=12)
            q.add("cylinder", (0.08 * h, 0.08 * h, 0.015 * h), (0, 0, -0.155 * h), c, segments=12)
            swing = 9.0
        elif f == "staff":
            hand_z = 0.80 * h - 0.38 * h if "arms" in features else 0.44 * h
            q.add("cylinder", (0.026 * h, 0.026 * h, 1.08 * h), (0, 0, 0.55 * h - hand_z), c, segments=8)
            q.add("sphere", (0.05 * h, 0.05 * h, 0.05 * h), (0, 0, 1.09 * h - hand_z), c, segments=10)
            swing = 4.0
        else:
            q.add("cylinder", (0.30 * h, 0.30 * h, 0.025 * h), (0.02 * h, 0, 0), c, rot=(0, math.pi / 2, 0), segments=20)
            swing = 3.0
        prop = q.to_object(f"{root_name}_{f}", at, 0.0, coll, parent=parent)
        prop.rotation_mode, prop["swing_deg"] = "XYZ", swing
        made.add(prop.name)
    for child in list(root.children_recursive):  # features dropped on a rebuild
        if child.name not in made and child.get(B.TAG):
            bpy.data.objects.remove(child)
    root["capsule"] = True
    root["features"] = ",".join(features)
    return root


def _mannequin(root_name, h, rgb, location, facing_deg, coll):
    """A gray artist's mannequin: ellipsoid segments and dark ball joints in one mesh, each part
    weighted fully to its bone (rigid skinning) on an armature whose bones start at the
    _JOINTED pivots, with every bone's X axis along the figure's X, so a positive X rotation
    swings a hanging limb back, as on a jointed figure. The torso carries `rgb` (None: gray)."""
    existing = bpy.data.objects.get(root_name)
    if existing is not None:
        B._own(existing, None)
        if existing.type != "ARMATURE":
            raise ValueError(f"{root_name!r} is a {existing.type}: a figure keeps its style, use another name")
        root = existing
    else:
        arm = B._own(None, lambda: bpy.data.armatures.new(root_name))
        root = B._own(None, lambda: bpy.data.objects.new(root_name, arm))
        (coll or bpy.context.scene.collection).objects.link(root)
    root.data.display_type = "STICK"
    vl = bpy.context.view_layer
    was_active = vl.objects.active
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = root
    bpy.ops.object.mode_set(mode="EDIT")
    bones = root.data.edit_bones
    for b in list(bones):
        bones.remove(b)
    for name, (_size, pivot, _offset, parent) in _JOINTED.items():
        b = bones.new(name)
        b.head = Vector(pivot) * h
        b.tail = Vector(_BONE_TAILS[name]) * h
        y = (b.tail - b.head).normalized()
        b.align_roll(Vector((1.0, 0.0, 0.0)).cross(y))  # bone Z = X cross Y keeps bone X on the figure's X
        if parent:
            b.parent = bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = was_active
    for pb in root.pose.bones:
        pb.rotation_mode = "XYZ"

    body_rgb = rgb or MANNEQUIN_GRAY
    p, groups = Parts(), {}

    def part(bone, kind, size, center, c):
        before = set(p.bm.verts)
        p.add(kind, [h * s for s in size], [h * v for v in center], c, segments=14)
        groups.setdefault(bone, []).extend(v for v in p.bm.verts if v not in before)

    part("pelvis", "sphere", (0.20, 0.13, 0.13), (0, 0, 0.505), body_rgb)
    part("torso", "sphere", (0.18, 0.115, 0.21), (0, 0, 0.615), body_rgb)
    part("torso", "sphere", (0.235, 0.135, 0.21), (0, 0, 0.735), body_rgb)
    part("torso", "cylinder", (0.045, 0.045, 0.06), (0, 0, 0.855), MANNEQUIN_GRAY)
    part("head", "sphere", (0.11, 0.125, 0.14), (0, -0.005, 0.925), MANNEQUIN_GRAY)
    for side, s in (("L", 1.0), ("R", -1.0)):
        x = 0.05 * s
        part(f"thigh_{side}", "sphere", (0.08, 0.08, 0.08), (x, 0, 0.49), JOINT_GRAY)
        part(f"thigh_{side}", "sphere", (0.085, 0.09, 0.25), (x, 0, 0.37), MANNEQUIN_GRAY)
        part(f"shin_{side}", "sphere", (0.062, 0.062, 0.062), (x, 0, 0.25), JOINT_GRAY)
        part(f"shin_{side}", "sphere", (0.068, 0.072, 0.22), (x, 0, 0.14), MANNEQUIN_GRAY)
        part(f"foot_{side}", "sphere", (0.05, 0.05, 0.05), (x, 0, 0.035), JOINT_GRAY)
        part(f"foot_{side}", "sphere", (0.07, 0.16, 0.05), (x, -0.04, 0.025), MANNEQUIN_GRAY)
        x = 0.14 * s
        part(f"uparm_{side}", "sphere", (0.07, 0.07, 0.07), (x, 0, 0.82), JOINT_GRAY)
        part(f"uparm_{side}", "sphere", (0.062, 0.066, 0.19), (x, 0, 0.725), MANNEQUIN_GRAY)
        part(f"forearm_{side}", "sphere", (0.052, 0.052, 0.052), (x, 0, 0.63), JOINT_GRAY)
        part(f"forearm_{side}", "sphere", (0.052, 0.056, 0.18), (x, 0, 0.54), MANNEQUIN_GRAY)
        part(f"forearm_{side}", "sphere", (0.045, 0.06, 0.085), (x, -0.005, 0.40), MANNEQUIN_GRAY)
    p.bm.verts.index_update()
    weights = {b: [v.index for v in vs] for b, vs in groups.items()}
    body = p.to_object(f"{root_name}_body", (0.0, 0.0, 0.0), 0.0, coll, parent=root, material_name=f"MAT_{root_name}")
    body.vertex_groups.clear()
    for b, ids in weights.items():
        body.vertex_groups.new(name=b).add(ids, 1.0, "REPLACE")
    mod = body.modifiers.get("Armature") or body.modifiers.new("Armature", "ARMATURE")
    mod.object = root
    root.location = location
    root.rotation_euler = (0.0, 0.0, math.radians(facing_deg))
    root["rigged"] = True
    return root


def figure(name, height=1.75, location=(0.0, 0.0, 0.0), facing_deg=0.0, rgb=B.PALETTE["red"], fidelity=None, coll=None,
           *, style=None, features=(), colors=None):
    """A figure in one of the CAST styles, root at the feet, facing local -Y (facing_deg 0
    faces -Y, 90 faces +X). Returns the root name.
    capsule: one object, the stand-in the video model replaces whole; walk_path bobs it.
    featured: a capsule plus `features` from FEATURES (wearables merged into the capsule;
    arms, lantern, staff and shield as child objects that swing and pose); `colors` maps a
    feature to an RGB. jointed: thirteen rigid parts that walk_path steps (fidelity
    "detailed" adds a nose block and a hair cap). mannequin: a gray armature-rigged mannequin
    with `rgb` on its torso (rgb=None: all gray). Without `style`, a legacy `fidelity` picks
    rough -> capsule, shaped or detailed -> jointed; with neither, capsule. The figure's
    first color sits on its own material, MAT_FIG_<name>, so it can be recolored alone."""
    if style is None:
        style = "capsule" if fidelity in (None, "rough") else "jointed"
    if style not in CAST:
        raise ValueError(f"style must be one of {CAST}")
    if features and style != "featured":
        raise ValueError("features need style='featured'")
    root_name = f"FIG_{name}"
    own = f"MAT_{root_name}"
    lvl = _fidelity(fidelity) if fidelity else 1
    old = bpy.data.objects.get(root_name)
    if old is not None:
        was = old.get("figure") or ("jointed" if old.get("jointed") else "capsule")
        if {was, style} != {"capsule", "featured"} and was != style:
            raise ValueError(f"{root_name} is a {was} figure; a figure keeps its style, so give the {style} another name")
    if style in ("capsule", "featured"):
        root = _capsule(root_name, height, rgb, tuple(features), colors, location, facing_deg, coll)
    elif style == "mannequin":
        root = _mannequin(root_name, height, rgb, location, facing_deg, coll)
    else:
        existing = bpy.data.objects.get(root_name)
        root = B._own(existing, lambda: bpy.data.objects.new(root_name, None))
        if existing is None:
            root.empty_display_type, root.empty_display_size = "PLAIN_AXES", height * 0.3
            (coll or bpy.context.scene.collection).objects.link(root)
        made = {}
        for part, (size, pivot, offset, parent) in _JOINTED.items():
            p = Parts()
            p.add("box", [height * s for s in size], [height * o for o in offset], rgb, bevel=0.008 if lvl == 2 else 0.0)
            if lvl == 2 and part == "head":
                p.add("box", (height * 0.03, height * 0.04, height * 0.03), (0, -height * 0.075, height * 0.065), rgb)
                p.add("box", (height * 0.13, height * 0.14, height * 0.04), (0, height * 0.005, height * 0.14), (0.12, 0.10, 0.09))
            par = made.get(parent, root)
            pivot_world = Vector([height * c for c in pivot])
            par_pivot = Vector([height * c for c in _JOINTED[parent][1]]) if parent else Vector((0, 0, 0))
            obj = p.to_object(f"{root_name}_{part}", pivot_world - par_pivot, 0.0, coll, parent=par, material_name=own)
            obj.rotation_mode = "XYZ"
            made[part] = obj
        root.location = location
        root.rotation_euler = (0.0, 0.0, math.radians(facing_deg))
        root["jointed"] = True
    root["height"] = height
    root["figure"] = style
    if rgb is not None:
        root["color"] = next((k for k, v in B.PALETTE.items() if all(abs(a - b) < 1e-3 for a, b in zip(v, rgb))), "")
    return root.name


def _joints(root):
    """Joint name -> what pose and walk_path key: part objects (jointed), pose bones
    (mannequin), or a featured capsule's arm_L, arm_R and held props."""
    if root.get("jointed"):
        return {k: bpy.data.objects[f"{root.name}_{k}"] for k in _JOINTED}
    if root.get("rigged"):
        return {k: root.pose.bones[k] for k in _JOINTED}
    pre = root.name + "_"
    return {c.name[len(pre):]: c for c in root.children_recursive if c.name.startswith(pre)}


def pose(fig, frame, **joints_deg):
    """Key joint rotations at a frame, in degrees: a number is the X axis (negative swings a
    hanging limb forward and tips an upright part back), a tuple is (x, y, z). Joints are a
    jointed figure's parts, a mannequin's bones (same names) or a featured capsule's arm_L,
    arm_R, lantern, staff and shield. Returns the joints keyed."""
    root = bpy.data.objects[fig] if isinstance(fig, str) else fig
    joints = _joints(root)
    for part, deg in joints_deg.items():
        if part not in joints:
            raise KeyError(f"{root.name} has no joint {part!r}; it has {sorted(joints)}")
        target = joints[part]
        xyz = deg if isinstance(deg, (tuple, list)) else (deg, 0.0, 0.0)
        target.rotation_euler = [math.radians(a) for a in xyz]
        target.keyframe_insert("rotation_euler", frame=frame)
    return sorted(joints_deg)


def _key_rot(obj, frame, x_deg):
    obj.rotation_euler = (math.radians(x_deg), 0.0, 0.0)
    obj.keyframe_insert("rotation_euler", index=0, frame=frame)


def _leg_ik(x, v, lt, ls):
    """Thigh and shin angles from vertical (radians, positive forward) that put the ankle `x`
    ahead of and `v` below the hip with the knee forward; out of reach straightens the leg."""
    d = max(1e-6, min(math.hypot(x, v), (lt + ls) * 0.9999))
    base = math.atan2(x, v)
    thigh = base + math.acos(max(-1.0, min(1.0, (lt * lt + d * d - ls * ls) / (2 * lt * d))))
    shin = base - math.acos(max(-1.0, min(1.0, (ls * ls + d * d - lt * lt) / (2 * ls * d))))
    return thigh, shin


def _gait(v):
    """0 standing to 1 walking, from speed in m/s: the step bob fades in by 0.6 m/s."""
    u = min(1.0, max(0.0, v / 0.12))
    return u * u * (3.0 - 2.0 * u) * (0.45 + 0.55 * min(1.0, v / 0.6))


def walk_path(fig, path, stride=None, swing_deg=26.0, step=1, bob=True, scene=None):
    """Move a figure's root along `path` [(frame, (x, y)), ...] and face it along the travel.
    `stride` is one step (default 0.42 x height; about 0.7 for a run). A capsule glides
    with one bob per step and a small sway per stride (bob=False turns both off; a capsule
    that only glides was rendered sliding), its arms swing and its held props sway, keyed
    every `step` frames. A jointed figure or a mannequin steps with planted feet, keyed every
    frame: each stance foot stays put while the body passes over it (legs solved per frame,
    soles level), the swing foot lifts and lands a stride ahead, and the root bobs as high as
    the stance leg allows. A stride past 0.5 h (a run) plants for 0.5 h and slides the rest.
    `swing_deg` sets a jointed arm swing. A pause is two path points at the same position. The
    root's z keys carry the bob: on raised or uneven ground, add its height to them rather than
    replace them. Returns key counts."""
    root = bpy.data.objects[fig] if isinstance(fig, str) else fig
    h = root.get("height", 1.75)
    stride = stride or h * 0.42  # one step
    joints = _joints(root)
    legs = bool(root.get("jointed") or root.get("rigged"))
    fps = (scene or bpy.context.scene).render.fps
    path = sorted(path)
    f0, f1 = path[0][0], path[-1][0]

    def pos(f):
        for (fa, a), (fb, b) in zip(path, path[1:]):
            if fa <= f <= fb:
                t = 0.0 if fb == fa else (f - fa) / (fb - fa)
                return Vector((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.0))
        return Vector((*path[-1][1], 0.0))

    frames = list(range(f0, f1 + 1, 1 if legs else max(1, step)))
    if frames[-1] != f1:
        frames.append(f1)
    track, dist, prev, prev_f, yaw = [], 0.0, pos(f0), f0, root.rotation_euler.z
    for f in frames:
        cur = pos(f)
        d = cur - prev
        if d.length > 1e-4:
            yaw = math.atan2(d.x, -d.y)
        dist += d.length
        speed = d.length * fps / max(1, f - prev_f)
        prev, prev_f = cur, f
        track.append([f, cur, yaw, dist, d.length > 1e-4, speed])
    if len(track) > 1:
        # The first frame faces and moves like the next one: a yaw jump would drag the planted foot.
        track[0][2], track[0][4], track[0][5] = track[1][2], track[1][4], track[1][5]

    if legs:
        hip, knee, ankle = (_JOINTED[k][1][2] * h for k in ("thigh_L", "shin_L", "foot_L"))
        lt, ls = hip - knee, knee - ankle
        reach = 0.98 * (lt + ls)
        # How far the planted foot travels either side of the hip. Past 0.25 h (a run's stride)
        # the hip would crouch out of reach, so the stance foot slides by the excess instead:
        # one foot always stays down, which B.audit_ground needs.
        half = min(stride / 2.0, 0.25 * h)
        lift_h = 0.05 * h + 0.1 * stride
        settle = 1.0 if not track[0][4] else 0.0  # 1 = stopped: the swing foot is down

    keys = 0
    for f, cur, yaw, dist, moving, speed in track:
        z = 0.0
        if legs:
            settle = min(1.0, max(0.0, settle + (-1 if moving else 1) / 6.0))
            go = 1.0 - settle * settle * (3.0 - 2.0 * settle)
            feet = {}
            for side, offset in (("L", 0.0), ("R", 0.5)):
                u = (dist / (2.0 * stride) + offset) % 1.0
                if u < 0.5:
                    x, up, planted = half - 4.0 * half * u, 0.0, True
                else:
                    s = 2.0 * u - 1.0
                    x, up, planted = -half + half * (1.0 - math.cos(math.pi * s)), lift_h * math.sin(math.pi * s), False
                # Stopped, the feet stay where they are and the swing foot sets down.
                feet[side] = (x, up * go, planted)
            worst = max(abs(x) for x, _, p in feet.values() if p)
            z = math.sqrt(reach * reach - worst * worst) - (lt + ls)
            legs_ik = {side: _leg_ik(x, hip + z - ankle - up, lt, ls) for side, (x, up, _) in feet.items()}
            for side, (thigh, shin) in legs_ik.items():
                _key_rot(joints[f"thigh_{side}"], f, -math.degrees(thigh))
                _key_rot(joints[f"shin_{side}"], f, -math.degrees(shin - thigh))
                _key_rot(joints[f"foot_{side}"], f, math.degrees(shin))  # sole level
                # Each arm swings against its own leg: back while that leg reaches forward.
                lead = legs_ik[side][0] - legs_ik["R" if side == "L" else "L"][0]
                _key_rot(joints[f"uparm_{side}"], f, 0.4 * swing_deg / 26.0 * math.degrees(lead) * go)
                _key_rot(joints[f"forearm_{side}"], f, -swing_deg * 0.5 * go)
        else:
            k, run = _gait(speed), min(1.0, max(0.0, (speed - 1.6) / 2.0))
            phase = dist / stride  # steps taken: lowest at each contact, highest passing over
            if bob:
                z = h * (0.017 + 0.02 * run) * k * (0.5 - 0.5 * math.cos(2.0 * math.pi * phase))
                cur = cur + Vector((math.cos(yaw), math.sin(yaw), 0.0)) * (0.008 * h * k * math.sin(math.pi * phase))
            for joint in joints.values():
                if "swing_arm" in joint:
                    _key_rot(joint, f, -joint["swing_arm"] * (16.0 + 24.0 * run) * k * math.sin(math.pi * phase))
                elif "swing_deg" in joint:
                    _key_rot(joint, f, joint["swing_deg"] * k * math.sin(math.pi * phase - 0.6))
        root.location = (cur.x, cur.y, z)
        root.rotation_euler = (0.0, 0.0, yaw)
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", index=2, frame=f)
        keys += 1
    for obj in [root, *(j for j in joints.values() if isinstance(j, bpy.types.Object))]:
        for fc in B.fcurves(obj):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    return {"figure": root.name, "frames": [f0, f1], "keys": keys, "distance_m": round(dist, 2)}


def cast(scene=None):
    """One row per figure root for the hand-off sheet's cast clause: name, style, color,
    height, features, and whether it is an extra."""
    sc = scene or bpy.context.scene
    return [{"figure": o.name, "style": o["figure"], "color": o.get("color", ""), "height_m": round(o.get("height", 0.0), 2),
             "features": [f for f in o.get("features", "").split(",") if f], "extra": bool(o.get("extra"))}
            for o in sc.objects if o.get(B.TAG) and o.get("figure")]


def crowd(prefix, count, area, frames, fidelity="rough", pal=None, speed=(1.0, 1.5), heights=(1.6, 1.9), seed=0, avoid=(), coll=None, walking=None, headings=None, keep_clear=(), style=None, features=()):
    """Background walkers crossing `area` (xmin, xmax, ymin, ymax) over `frames` (start,
    end), each on a straight line at its own speed, in the scheme's crowd color with a
    value tint per person. `style` picks the cast style (and `features` a featured
    capsule's); without it, rough walkers are capsules and shaped or detailed ones jointed
    figures that step.
    walking=False makes a standing crowd. headings: yaw choices in degrees
    (0 walks toward -Y, 180 toward +Y) to keep walkers along a street; None is random.
    keep_clear: [(frame_a, frame_b, (xmin, xmax, ymin, ymax)), ...] zones no walker may
    enter during those frames, such as the sight line between a camera and its subject;
    a walker whose line crosses one is dropped. Every root is tagged extra=True.
    Returns the figure roots."""
    pal = pal or scheme("category")
    rng = random.Random(seed)
    walking = True if walking is None else walking
    start_pts = scatter_points(count, area, seed, min_dist=0.9, avoid=avoid)
    fps = bpy.context.scene.render.fps
    roots = []
    secs = (frames[1] - frames[0]) / fps
    for i, (x, y) in enumerate(start_pts):
        h = rng.uniform(*heights)
        yaw = math.radians(rng.choice(headings)) if headings else rng.uniform(0, 2 * math.pi)
        v = rng.uniform(*speed) if walking else 0.0
        end = (x + math.sin(yaw) * v * secs, y - math.cos(yaw) * v * secs)
        if _crosses(keep_clear, frames, (x, y), end):
            continue
        name = f"{prefix.removeprefix('FIG_')}{i:03d}"  # figure() adds FIG_ itself
        rgb = tint(pal["crowd"], seed * 1000 + i, 0.25)
        root = figure(name, h, (x, y, 0.0), math.degrees(yaw), rgb, None if style else fidelity, coll, style=style, features=features)
        root = bpy.data.objects[root]
        root["extra"] = True
        roots.append(root.name)
        if walking:
            walk_path(root, [(frames[0], (x, y)), (frames[1], end)], step=2)
    return roots


def _crosses(zones, frames, a, b):
    """True when a straight walk from a to b over frames enters a keep_clear zone in time."""
    for fa, fb, (x0, x1, y0, y1) in zones:
        for f in range(max(fa, frames[0]), min(fb, frames[1]) + 1, 4):
            t = (f - frames[0]) / max(1, frames[1] - frames[0])
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            if x0 <= x <= x1 and y0 <= y <= y1:
                return True
    return False


def mark_extra(obj):
    """Tag a mover as an extra (background traffic, crowd): audit_budget counts heroes and
    extras separately, because only heroes carry the story and need a line in the prompt."""
    obj = bpy.data.objects[obj] if isinstance(obj, str) else obj
    obj["extra"] = True
    return obj.name


def drive(obj, path, scene=None):
    """Key a vehicle along `path` [(frame, (x, y)), ...] facing its travel (front = local
    -Y), one key per frame with LINEAR interpolation: vehicles keep constant speed between
    points and never ease into a turn by sliding sideways."""
    obj = bpy.data.objects[obj] if isinstance(obj, str) else obj
    path = sorted(path)
    keys = 0
    yaw = obj.rotation_euler.z
    for (fa, a), (fb, b) in zip(path, path[1:]):
        d = Vector((b[0] - a[0], b[1] - a[1], 0.0))
        if d.length > 1e-4:
            yaw = math.atan2(d.x, -d.y)
        for f in range(fa, fb + 1):
            t = 0.0 if fb == fa else (f - fa) / (fb - fa)
            obj.location = (a[0] + d.x * t, a[1] + d.y * t, obj.location.z)
            obj.rotation_euler = (0.0, 0.0, yaw)
            obj.keyframe_insert("location", frame=f)
            obj.keyframe_insert("rotation_euler", index=2, frame=f)
            keys += 1
    for fc in B.fcurves(obj):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    return {"vehicle": obj.name, "keys": keys}


def pedal(fig, bike, frames, rpm=70.0, lean_deg=25.0, scene=None):
    """Seat a figure on a K.vehicle bicycle and pedal it over `frames` (first, last): the root
    is parented to the bike with the pelvis on the saddle and the torso leans `lean_deg`
    forward. A jointed figure or a mannequin also puts its hands on the bars and keys its legs
    on the cranks every frame at `rpm`, feet level on the pedals; a capsule or featured rider
    has no legs, so it only sits and leans (its root tips). A featured rider's arm_L and arm_R
    hang: pose them onto the bars with K.pose. The bike's cranks spin either way. Drive the
    bike with K.drive: the rider travels with it and counts with it in K.movers. It clears the
    figure's earlier keys, a K.walk_path included, so key gestures with K.pose after it. Returns
    key counts and `overreach_m`, how far the legs fall short of the lowest pedal; above 0,
    build the bike smaller (size about rider height / 1.75)."""
    root = bpy.data.objects[fig] if isinstance(fig, str) else fig
    bike = bpy.data.objects[bike] if isinstance(bike, str) else bike
    if "crank" not in bike:
        raise ValueError(f"{bike.name} is not a K.vehicle bicycle")
    cranks = bpy.data.objects[f"{bike.name}_cranks"]
    h = root.get("height", 1.75)
    (sy, sz), (by, bz), (cy, cz, c) = bike["saddle"], bike["bars"], bike["crank"]
    lean = math.radians(lean_deg)
    legs = bool(root.get("jointed") or root.get("rigged"))
    seat = (_JOINTED["pelvis"][1][2] - _JOINTED["pelvis"][0][2] / 2) * h  # pelvis bottom above the root
    # World-space travel keys would keep playing in bike space once parented: the rider slid off.
    for obj in (root, *root.children_recursive):
        obj.animation_data_clear()
    root.parent = bike
    root.matrix_parent_inverse = Matrix.Identity(4)
    if legs:
        root.location, root.rotation_euler = (0.0, sy, sz - seat), (0.0, 0.0, 0.0)
    else:
        # A capsule tips at its feet: move the root back so the seat stays on the saddle.
        root.location = (0.0, sy + seat * math.sin(lean), sz - seat * math.cos(lean))
        root.rotation_euler = (lean, 0.0, 0.0)
    f0, f1 = frames
    joints = _joints(root)
    if legs:
        torso = _JOINTED["torso"][1][2] * h
        arm = _JOINTED["uparm_L"][1][2] * h - torso
        sh_y, sh_z = sy - arm * math.sin(lean), sz - seat + torso + arm * math.cos(lean)
        la = (_JOINTED["uparm_L"][1][2] - _JOINTED["forearm_L"][1][2]) * h
        lf = (_JOINTED["forearm_L"][1][2] - _BONE_TAILS["forearm_L"][2]) * h
        # The leg solver bends the knee forward; mirrored, it bends the elbow back.
        up, fore = _leg_ik(by - sh_y, sh_z - bz, la, lf)
        arms = {"uparm_L": up - lean, "uparm_R": up - lean, "forearm_L": fore - up, "forearm_R": fore - up}
        pose(root, f0, torso=lean_deg, head=-0.75 * lean_deg, **{k: math.degrees(v) for k, v in arms.items()})
        hip, knee, ankle = (_JOINTED[k][1][2] * h for k in ("thigh_L", "shin_L", "foot_L"))
        lt, ls = hip - knee, knee - ankle
        hip_z = sz - seat + hip
    fps = (scene or bpy.context.scene).render.fps
    over, keys = 0.0, 0
    for f in range(f0, f1 + 1):
        a = 2.0 * math.pi * rpm / 60.0 * (f - f0) / fps
        _key_rot(cranks, f, math.degrees(a))
        keys += 1
        if not legs:
            continue
        for side, off in (("L", 0.0), ("R", math.pi)):
            py, pz = cy - c * math.sin(a + off), cz + c * math.cos(a + off)
            # Ball of the foot on the pedal: the ankle sits behind and above it.
            x, v = sy - (py + 0.05 * h), hip_z - (pz + ankle)
            over = max(over, math.hypot(x, v) - (lt + ls))
            thigh, shin = _leg_ik(x, v, lt, ls)
            _key_rot(joints[f"thigh_{side}"], f, -math.degrees(thigh))
            _key_rot(joints[f"shin_{side}"], f, -math.degrees(shin - thigh))
            _key_rot(joints[f"foot_{side}"], f, math.degrees(shin))  # sole level
    for obj in [cranks, root, *(j for j in joints.values() if isinstance(j, bpy.types.Object))]:
        for fc in B.fcurves(obj):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    return {"figure": root.name, "bike": bike.name, "frames": [f0, f1], "keys": keys, "overreach_m": round(max(0.0, over), 3)}


# -- budgets ---------------------------------------------------------------------------------

# Targets per density level (references/levels.md explains each row). heroes are movers the
# story needs; extras are tagged crowd and traffic. shot_s bounds every cut, seconds the whole
# take sent in one request.
DENSITY = {
    "simple": {"footprint_m": 20, "objects": (10, 80), "heroes": (1, 2), "extras": (0, 2),
               "shots": (1, 1), "shot_s": (4, 6), "seconds": (4, 6)},
    "medium": {"footprint_m": 40, "objects": (50, 250), "heroes": (1, 2), "extras": (0, 12),
               "shots": (1, 2), "shot_s": (3, 8), "seconds": (5, 10)},
    "advanced": {"footprint_m": 80, "objects": (150, 800), "heroes": (2, 4), "extras": (10, 60),
                 "shots": (2, 4), "shot_s": (2.5, 6), "seconds": (8, 12)},
    "expert": {"footprint_m": 120, "objects": (500, 5000), "heroes": (2, 6), "extras": (50, 300),
               "shots": (3, 12), "shot_s": (2, 5), "seconds": (10, 15)},
}


def _animated(obj):
    ad = obj.animation_data
    if ad and ad.action:
        return True
    # A figure whose root stands still but whose limbs or arms gesture still performs.
    return bool(obj.get("figure") or obj.get("jointed")) and any(c.animation_data and c.animation_data.action for c in obj.children_recursive)


def _in_figure(obj):
    """True for a part of a figure at any depth: a jointed limb, a mannequin's mesh, a
    featured capsule's arm or held prop."""
    p = obj.parent
    while p is not None:
        if p.get("figure") or p.get("jointed"):
            return True
        p = p.parent
    return False


def elements(scene=None):
    """Scene elements as a viewer counts them: every tagged mesh, with a figure counted once
    (its root) and not once per limb, arm or held prop."""
    sc = scene or bpy.context.scene
    return [o.name for o in sc.objects if o.get(B.TAG) and o.visible_get() and not _in_figure(o) and not o.get("vehicle_part")
            and (o.type == "MESH" or o.get("figure") or o.get("jointed"))]


def movers(scene=None):
    """(heroes, extras): animated objects that move on their own, limbs, riders parented to
    a vehicle, a bicycle's cranks, cameras and rigs excluded."""
    sc = scene or bpy.context.scene
    heroes, extras = [], []
    for o in sc.objects:
        if not o.get(B.TAG) or not o.visible_get() or o.name.startswith(("CAM_", "RIG_", "NULL_", "CRV_")):
            continue
        if _in_figure(o) or o.get("vehicle_part"):
            continue
        if o.parent is not None and _animated(o.parent):
            continue  # a rider or a carried prop travels with its mover and counts with it
        if _animated(o):
            (extras if o.get("extra") else heroes).append(o.name)
    return heroes, extras


def audit_budget(density, scene=None):
    """Count what the scene holds against a density level: elements (a jointed figure counts
    once), heroes, extras,
    shots, the length of every shot, footprint and duration. Returns a list of gaps; []
    means the scene meets the level."""
    sc = scene or bpy.context.scene
    target = DENSITY[density]
    bpy.context.view_layer.update()  # new objects have no world matrix until an update
    meshes = [o for o in sc.objects if o.get(B.TAG) and o.visible_get() and o.type == "MESH"]
    count = len(elements(sc))
    heroes, extras = movers(sc)
    xs = [o.matrix_world.translation.x for o in meshes]
    ys = [o.matrix_world.translation.y for o in meshes]
    footprint = max((max(xs) - min(xs)) if xs else 0.0, (max(ys) - min(ys)) if ys else 0.0)
    cuts = B.cut_list(sc) if B._bound_markers(sc) else []
    shots = len(cuts) or 1
    seconds = (sc.frame_end - sc.frame_start + 1) / sc.render.fps
    gaps = []
    for label, value, (lo, hi) in (("objects", count, target["objects"]), ("heroes", len(heroes), target["heroes"]),
                                   ("extras", len(extras), target["extras"]), ("shots", shots, target["shots"]),
                                   ("seconds", seconds, target["seconds"])):
        if not lo <= value <= hi:
            gaps.append({"check": label, "value": round(value, 2), "target": [lo, hi]})
    lo, hi = target["shot_s"]
    for c in cuts:
        if not lo - 0.05 <= c["duration_s"] <= hi + 0.05:
            gaps.append({"check": "shot_s", "shot": c["shot"], "value": c["duration_s"], "target": [lo, hi]})
    if footprint < target["footprint_m"] * 0.5:
        gaps.append({"check": "footprint_m", "value": round(footprint, 1), "target": target["footprint_m"]})
    return gaps
