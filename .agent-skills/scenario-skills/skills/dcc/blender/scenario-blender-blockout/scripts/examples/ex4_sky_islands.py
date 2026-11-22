"""Example 4, Sky Islands: fast, five characters, wide exterior, stylized fantasy. Expert
density, shaped fidelity, category colors, featured capsule cast. The last argument picks
another cast style for an A/B (references/cast.md): capsule, featured, jointed, mannequin.

Brief: "12 s, 24 fps, stylized animated feature. Five young adventurers sprint across a
rope-and-plank bridge between two floating islands while a giant sky whale carrying a
village on its back glides beneath them; villagers wave from the far island. Four shots:
an establishing wide, a low tracking shot beside the runners, a front-on shot backing
away from the leader, a high crane down past the bridge onto the whale."
"""
import math
import os
import random
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ex_common import CAST as CAST_ARG, B, K, bpy, finish, pose, start, sun  # noqa: E402

FPS, SECS = 24, 12
END = FPS * SECS
C = start(FPS, SECS, world_rgb=(0.46, 0.58, 0.74))
pal = K.scheme("category")
fid = "shaped"
STYLE = CAST_ARG or "featured"  # aliased: CAST below is this scene's character list
CAPSULES = STYLE in ("capsule", "featured")
GRASS, CLOUD = pal["vegetation"], (0.93, 0.93, 0.95)
rng = random.Random(21)

# -- geometry of the crossing: island tops at z = 0, a sagging bridge between their edges
XA, XB, SAG = -12.0, 14.0, 0.8
XM, HALF = (XA + XB) / 2, (XB - XA) / 2


def deck_z(x):
    if XA <= x <= XB:
        return -SAG * (1 - ((x - XM) / HALF) ** 2)
    return 0.0


def island(name, center, radius, depth, seed, trees=0, houses=0, bushes=0, mill=False):
    cx, cy = center
    p = K.Parts()
    p.add("cylinder", (2 * radius, 2 * radius, 1.2), (0, 0, -0.6), GRASS, segments=28)
    p.add("cylinder", (2 * radius * 0.97, 2 * radius * 0.97, 1.6), (0, 0, -2.0), pal["ground"], segments=28)
    p.add("cone", (2 * radius * 0.95, 2 * radius * 0.95, depth), (0, 0, -2.8 - depth / 2), pal["rock"], rot=(math.pi, 0, 0), segments=14)
    p.to_object(name, (cx, cy, 0), rng.uniform(0, 360), C["env"])
    r2 = random.Random(seed)
    for k in range(trees):
        a, d = r2.uniform(0, 2 * math.pi), r2.uniform(0.35, 0.85) * radius
        K.tree(f"{name}_tree_{k:02d}", (cx + d * math.cos(a), cy + d * math.sin(a), 0), r2.uniform(3.5, 6.5), fid, pal, seed=seed + k, coll=C["env"])
    for k in range(houses):
        a, d = r2.uniform(0, 2 * math.pi), r2.uniform(0.3, 0.7) * radius
        K.building(f"{name}_house_{k:02d}", (r2.uniform(3, 4.5), r2.uniform(3, 4), r2.uniform(3, 4.5)), (cx + d * math.cos(a), cy + d * math.sin(a), 0),
                   fid, pal, floors=1, roof="gable", facing_deg=r2.uniform(0, 360), seed=seed + 50 + k, coll=C["env"])
    for k in range(bushes):
        a, d = r2.uniform(0, 2 * math.pi), r2.uniform(0.2, 0.95) * radius
        s = r2.uniform(0.5, 1.1)
        b = K.Parts()
        b.add("sphere", (s * 1.3, s * 1.3, s), (0, 0, s * 0.4), K.tint(GRASS, seed + k, 0.15), segments=8)
        b.to_object(f"{name}_bush_{k:02d}", (cx + d * math.cos(a), cy + d * math.sin(a), 0), 0.0, C["env"])
    if mill:
        m = K.Parts()
        m.add("cylinder", (3.0, 3.0, 8.0), (0, 0, 0), pal["wall"], base=True, segments=12)
        m.add("cone", (3.6, 3.6, 2.4), (0, 0, 8.0), pal["roof"], base=True, segments=12)
        m.to_object(f"{name}_mill", (cx + radius * 0.45, cy + radius * 0.35, 0), 0.0, C["env"])
        bl = K.Parts()
        for k in range(4):
            bl.add("box", (0.5, 0.1, 5.5), (0, 0, 2.75), pal["fabric"], rot=(0, k * math.pi / 2, 0))
        blades = bl.to_object(f"PRP_{name}_mill_blades", (cx + radius * 0.45, cy + radius * 0.35 - 1.7, 7.4), 0.0, C["prp"])
        blades.rotation_mode = "XYZ"
        blades.keyframe_insert("rotation_euler", index=1, frame=1)
        blades.rotation_euler.y = math.radians(140)
        blades.keyframe_insert("rotation_euler", index=1, frame=END + 12)
        for fc in B.fcurves(blades):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        K.mark_extra(blades)


island("ENV_island_A", (-25.0, 0.0), 13.0, 22.0, seed=100, trees=7, houses=2, bushes=80)
island("ENV_island_B", (28.0, 3.0), 14.0, 26.0, seed=200, trees=8, houses=4, bushes=90, mill=True)
for k in range(12):  # distant islands around the crossing, at several heights
    a = rng.uniform(0, 2 * math.pi)
    d = rng.uniform(80, 220)
    island(f"ENV_far_island_{k:02d}", (d * math.cos(a), 60 + d * math.sin(a)), rng.uniform(6, 16), rng.uniform(10, 24),
           seed=300 + k * 7, trees=1, bushes=2)
    bpy.data.objects[f"ENV_far_island_{k:02d}"].location.z = rng.uniform(-25, 30)
    for child in [o for o in bpy.data.objects if o.name.startswith(f"ENV_far_island_{k:02d}_")]:
        child.location.z += bpy.data.objects[f"ENV_far_island_{k:02d}"].location.z

# -- the bridge: planks on the catenary, posts with lanterns, rope rails in segments
n = int((XB - XA) / 0.45)
for i in range(n + 1):
    x = XA + i * (XB - XA) / n
    B.box(f"ENV_plank_{i:03d}", (0.24, 2.0, 0.08), (x, 0, deck_z(x) - 0.04), rgb=K.tint(pal["prop"], i, 0.1), coll=C["env"])
for i in range(14):
    x = XA + i * (XB - XA) / 13
    for side in (-1, 1):
        B.box(f"ENV_post_{i:02d}{'L' if side < 0 else 'R'}", (0.12, 0.12, 1.2), (x, side * 1.05, deck_z(x) + 0.6), rgb=pal["trunk"], coll=C["env"])
    if i % 2 == 0:
        lan = K.Parts()
        lan.add("sphere", (0.3, 0.3, 0.38), (0, 0, 0), pal["light"], segments=10)
        lan.to_object(f"PRP_lantern_{i:02d}", (x, 1.05, deck_z(x) + 1.45), 0.0, C["prp"])
for side in (-1, 1):
    for i in range(26):
        x0, x1 = XA + i, XA + i + 1
        z0, z1 = deck_z(x0) + 1.05, deck_z(x1) + 1.05
        seg = K.Parts()
        seg.add("box", (math.hypot(1, z1 - z0) + 0.02, 0.05, 0.05), (0, 0, 0), pal["trunk"], rot=(0, -math.atan2(z1 - z0, 1), 0))
        seg.to_object(f"ENV_rope_{'L' if side < 0 else 'R'}{i:02d}", ((x0 + x1) / 2, side * 1.05, (z0 + z1) / 2), 0.0, C["env"])

# -- clouds below and around
for k in range(40):
    s = rng.uniform(8, 26)
    cl = K.Parts()
    cl.add("sphere", (s * 1.8, s, s * 0.45), (0, 0, 0), K.tint(CLOUD, k, 0.04), segments=12)
    cl.add("sphere", (s, s * 0.8, s * 0.4), (s * 0.5, s * 0.2, s * 0.15), K.tint(CLOUD, k + 50, 0.04), segments=12)
    cl.to_object(f"ENV_cloud_{k:02d}", (rng.uniform(-160, 160), rng.uniform(-60, 200), rng.uniform(-70, -32)), rng.uniform(0, 360), C["env"])

# -- the sky whale (a hero mover): head toward +X, a village on its back
wh = K.Parts()
SLATE, BELLY = (0.30, 0.38, 0.50), (0.80, 0.78, 0.70)
wh.add("sphere", (60, 16, 14), (0, 0, 0), SLATE, segments=24)
wh.add("sphere", (54, 12, 6), (2, 0, -4.5), BELLY, segments=20)
wh.add("wedge", (10, 22, 1.2), (-32, 0, 1.0), SLATE, rot=(0, 0, math.pi / 2))      # tail flukes
wh.add("box", (12, 3, 1.0), (6, 9, -4), SLATE, rot=(0.5, 0, -0.3))                  # pectoral fins
wh.add("box", (12, 3, 1.0), (6, -9, -4), SLATE, rot=(-0.5, 0, 0.3))
for k in range(6):  # houses and sails of the village on its back
    x = -14 + k * 5.5
    wh.add("box", (3.5, 3.5, 3.0), (x, (-2, 2)[k % 2], 7.5), pal["wall"], base=True)
    wh.add("wedge", (3.8, 3.8, 1.6), (x, (-2, 2)[k % 2], 11.3), pal["roof"])
for x in (-8, 8):
    wh.add("box", (0.3, 0.3, 9), (x, 0, 7), pal["trunk"], base=True)
    wh.add("box", (4.5, 0.1, 5), (x + 0.4, 0, 11.5), pal["trim"])
whale = wh.to_object("PRP_sky_whale", (-80, 26, -34), 0.0, C["prp"])
whale.rotation_euler = (0, math.radians(-4), math.radians(-8))
whale.keyframe_insert("location", frame=1)
whale.keyframe_insert("rotation_euler", frame=1)
whale.location = (40, -6, -20)
whale.rotation_euler = (0, math.radians(-2), math.radians(-14))
whale.keyframe_insert("location", frame=END + 12)
whale.keyframe_insert("rotation_euler", frame=END + 12)
for fc in B.fcurves(whale):
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"

# -- extras: a flock of birds crossing, villagers waving on island B, small airships
for k in range(60):
    x, y, z = rng.uniform(30, 90), rng.uniform(10, 50), rng.uniform(4, 18)
    bd = K.Parts()
    bd.add("wedge", (0.9, 0.5, 0.12), (0, 0, 0), (0.95, 0.95, 0.92), rot=(0, 0, math.pi / 2))
    o = bd.to_object(f"PRP_bird_{k:02d}", (x, y, z), 0.0, C["prp"])
    o.keyframe_insert("location", frame=1)
    o.location = (x - rng.uniform(55, 75), y + rng.uniform(-6, 6), z + rng.uniform(-2, 3))
    o.keyframe_insert("location", frame=END + 12)
    K.mark_extra(o)
vill = K.crowd("BG_villager_", 20, (24, 36, -6, 10), (1, END + 12), fid, pal, seed=5, walking=False, headings=(-80, -90, -100),
               heights=(1.2, 1.85), coll=C["fig"], style=STYLE, features=("arms",) if STYLE == "featured" else ())
arm = "arm" if STYLE == "featured" else "uparm"  # a plain capsule has no arm to wave
for k, v in enumerate(vill[:8] if STYLE != "capsule" else []):  # some wave
    side = "R" if k % 2 else "L"
    for f in range(1, END + 13, 10):
        up = -150 + (15 if (f // 10 + k) % 2 else -15)
        pose(v, f, **{f"{arm}_{side}": (up, 0, 0)})
for k in range(3):
    ab = K.Parts()
    ab.add("sphere", (14, 5, 5), (0, 0, 0), pal["fabric"], segments=16)
    ab.add("box", (4, 1.6, 1.4), (0, 0, -4.2), pal["prop"])
    o = ab.to_object(f"PRP_airship_{k}", (rng.uniform(-120, 120), rng.uniform(90, 180), rng.uniform(10, 40)), 0.0, C["prp"])
    o.keyframe_insert("location", frame=1)
    o.location.x += 18
    o.keyframe_insert("location", frame=END + 12)
    K.mark_extra(o)

# -- the five runners, leader first, at 3.4 m/s, on the deck's height as they cross. Featured
# capsules carry what tells each one apart; the model invents their running.
CAST = (("leader_red", "red", 1.55, 0.0, ("goggles", "scarf")), ("backpack_blue", "blue", 1.50, 0.35, ("hair", "backpack")),
        ("slingshot_green", "green", 1.42, -0.35, ("hood", "cape")), ("raincoat_yellow", "yellow", 1.18, 0.3, ("hood", "coat")),
        ("staff_purple", "purple", 1.78, -0.3, ("hair", "coat", "staff")))
SPEED = 3.4
kids = []
for i, (name, color, h, dy, feats) in enumerate(CAST):
    x0 = -19.0 - i * 1.7
    fig = K.figure(name, h, (x0, dy, 0), facing_deg=90.0, rgb=B.PALETTE[color], coll=C["fig"], style=STYLE,
                   features=feats if STYLE == "featured" else ())
    x1 = x0 + SPEED * (END + 12 - 8) / FPS
    K.walk_path(fig, [(1, (x0, dy)), (8, (x0, dy)), (END + 12, (x1, dy))], stride=h * 0.72, swing_deg=38)
    root = bpy.data.objects[fig]
    fx = next(fc for fc in B.fcurves(root) if fc.data_path == "location" and fc.array_index == 0)
    fz = next(fc for fc in B.fcurves(root) if fc.data_path == "location" and fc.array_index == 2)
    for kp in fz.keyframe_points:  # ride the sag of the bridge, on top of the stride's bob
        kp.co.y += deck_z(fx.evaluate(kp.co.x))
    fz.update()
    if CAPSULES:
        root.rotation_euler.x = math.radians(7)  # a forward lean for running (walk_path keys only the yaw)
    else:
        pose(fig, 1, torso=14)
    kids.append(fig)
if STYLE == "jointed":
    staff = K.Parts()
    staff.add("box", (0.04, 0.04, 1.7), (0, 0, 0), pal["trunk"])
    staff.to_object("PRP_staff", (0, -0.03, -0.1 * 1.78), 0.0, C["prp"], parent=bpy.data.objects["FIG_staff_purple_forearm_R"])
elif STYLE == "mannequin":  # bone-parented: set the world matrix after parenting, Blender solves the offset
    staff = K.Parts()
    staff.add("box", (0.04, 0.04, 1.7), (0, 0, 0), pal["trunk"])
    o = staff.to_object("PRP_staff", (0, 0, 0), 0.0, C["prp"])
    rig = bpy.data.objects["FIG_staff_purple"]
    bpy.context.scene.frame_set(1)
    hand = rig.matrix_world @ rig.pose.bones["forearm_R"].tail
    o.parent, o.parent_type, o.parent_bone = rig, "BONE", "forearm_R"
    bpy.context.view_layer.update()
    o.matrix_world = Matrix.Translation(hand + Vector((0, 0, 0.1)))

sun((40, 0, 120), 3.0)

# -- cameras: four shots of 3 s
C2, C3, C4 = 73, 145, 217
# 1: establishing wide from far below the crossing's level, 28 mm, a slow drift in
a = B.rail_camera("s1_establish", [(-14, -78, 14), (-10, -74, 13), (-6, -70, 12)], target=(-4, 0, -8), lens=28, coll=C["cam"])
B.key_rail(a["dolly"], [(1, 0.0), (C2 + 8, 1.0)])
# 2: low tracking beside the bridge, 35 mm, framing the first three runners
b = B.rail_camera("s2_side_track", [(-11.0, -8.0, -0.2), (-6.5, -8.0, -0.3), (-1.5, -8.0, -0.4)],
                  follow=kids[1], target_offset=(0, 0, 0.9), lens=35, coll=C["cam"])
B.key_rail(b["dolly"], [(C2 - 8, 0.0), (C3 + 8, 1.0)])
# 3: front-on, backing away 4 m ahead of the leader on the bridge, 28 mm
pts = [(x, 0.2, deck_z(x) + 1.35) for x in (4.0, 9.0, 14.5)]
c = B.rail_camera("s3_front_backing", pts, follow=kids[0], target_offset=(0, 2.5, 0.9), lens=28, coll=C["cam"])
B.key_rail(c["dolly"], [(C3 - 8, 0.0), (C4 + 8, 1.0)])
# 4: high crane rising over the far end, looking down past the bridge onto the whale, 24 mm
d = B.rail_camera("s4_crane_down", [(8, -17, 13), (9, -16, 18), (10, -15, 23)], target=(8, 2, -12), lens=24, coll=C["cam"])
B.key_rail(d["dolly"], [(C4 - 8, 0.0), (END + 12, 1.0)])
for rig in (b, c):
    for fc in B.fcurves(bpy.data.objects[rig["dolly"]]):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
B.bind_cuts([(1, a["camera"]), (C2, b["camera"]), (C3, c["camera"]), (C4, d["camera"])])

finish("ex4_sky_islands", "expert", {
    "framing": lambda: B.audit_framing({"CAM_s2_side_track": kids[:3], "CAM_s3_front_backing": kids[:2],
                                        "CAM_s4_crane_down": ["PRP_sky_whale"]}, step=8),
    "occlusion_leader": lambda: B.audit_occlusion(kids[0], frames=range(C3, C4, 8)),
})
