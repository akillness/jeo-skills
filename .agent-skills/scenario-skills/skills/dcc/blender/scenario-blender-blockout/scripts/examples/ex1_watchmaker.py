"""Example 1, The Watchmaker: still, one character, interior, realistic. Simple density,
shaped fidelity, category colors.

Brief: "6 s, 24 fps. Dusk in an old watchmaker's workshop. An elderly watchmaker sits at
her bench under a brass lamp, lifts a loupe to her eye and leans in over an open pocket
watch. Rain on the window beside her. One slow push-in, 40 mm."
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ex_common import B, K, bpy, finish, pose, start, sun  # noqa: E402

FPS, SECS = 24, 6
END = FPS * SECS
C = start(FPS, SECS)
pal = K.scheme("category")
fid = "shaped"

# -- room: 6 x 5 m, 3 m ceiling. She sits at the origin facing -Y (toward camera).
B.box("ENV_floor", (6.0, 5.0, 0.1), (0, 0.5, -0.05), rgb=pal["ground"], coll=C["env"])
B.box("ENV_wall_back", (6.0, 0.2, 3.0), (0, 2.1, 1.5), rgb=pal["wall"], coll=C["env"])
B.box("ENV_wall_right", (0.2, 5.0, 3.0), (3.0, 0.5, 1.5), rgb=K.tint(pal["wall"], 3), coll=C["env"])
B.box("ENV_wall_left_low", (0.2, 5.0, 0.9), (-3.0, 0.5, 0.45), rgb=K.tint(pal["wall"], 5), coll=C["env"])
B.box("ENV_ceiling_beam", (6.0, 0.25, 0.25), (0, 0.8, 2.85), rgb=pal["trunk"], coll=C["env"])

# window on the back wall, behind her left shoulder: frame, mullions, glass
win = K.Parts()
win.add("box", (1.6, 0.06, 1.7), (0, 0, 0), pal["glass"])
for x in (-0.8, 0.0, 0.8):
    win.add("box", (0.08, 0.12, 1.8), (x, -0.03, 0), pal["trim"])
for z in (-0.88, 0.0, 0.88):
    win.add("box", (1.68, 0.12, 0.08), (0, -0.03, z), pal["trim"])
win.add("box", (1.8, 0.3, 0.06), (0, -0.12, -0.9), pal["trim"])  # sill
win.to_object("ENV_window", (-1.3, 1.98, 1.65), 0.0, C["env"])

# the street outside the window, for depth (lit windows across the lane)
for i, x in enumerate((-6.0, -1.0, 4.0)):
    K.building(f"ENV_outside_{i}", (5.0, 4.0, 9.0), (x, 8.0, 0), fid, pal, floors=3, facing_deg=0, seed=i, coll=C["env"])
B.box("ENV_lane", (16.0, 5.0, 0.05), (0, 4.6, -0.6), rgb=pal["road"], coll=C["env"])

# a high watchmaker's bench in front of her: top at 0.88 m, drawer blocks, green mat
TOP = 0.88
bench = K.Parts()
bench.add("box", (1.7, 0.75, 0.06), (0, 0, TOP - 0.03), pal["prop"])
bench.add("box", (0.5, 0.7, TOP - 0.06), (-0.58, 0, 0.0), K.tint(pal["prop"], 2), base=True)
bench.add("box", (0.5, 0.7, TOP - 0.06), (0.58, 0, 0.0), K.tint(pal["prop"], 2), base=True)
for z in (0.14, 0.38, 0.62):
    for x in (-0.58, 0.58):
        bench.add("box", (0.44, 0.02, 0.18), (x, -0.36, z), pal["trim"])
bench.add("box", (0.7, 0.45, 0.012), (0, 0.05, TOP + 0.006), pal["vegetation"])  # leather mat
bench.to_object("PRP_bench", (0, -0.42, 0), 180.0, C["prp"])

# brass lamp on her side of the bench, the arm reaching over the work, shade glowing
lamp = K.Parts()
lamp.add("cylinder", (0.16, 0.16, 0.03), (0, 0, 0.0), pal["metal"], base=True, segments=16)
lamp.add("box", (0.025, 0.025, 0.44), (0, -0.05, 0.21), pal["metal"], rot=(-0.23, 0, 0))
lamp.add("box", (0.025, 0.025, 0.36), (0, -0.25, 0.46), pal["metal"], rot=(-1.3, 0, 0))
lamp.add("cone", (0.2, 0.2, 0.16), (0, -0.43, 0.42), K.tint(pal["vegetation"], 7), rot=(math.pi, 0, 0), segments=16)
lamp.add("sphere", (0.07, 0.07, 0.05), (0, -0.43, 0.36), pal["light"], segments=10)
lamp.to_object("PRP_lamp", (-0.72, -0.14, TOP), 70.0, C["prp"])

# shelves of clocks on the back wall, right of the window
shelf = K.Parts()
for k, z in enumerate((1.0, 1.45, 1.9, 2.35)):
    shelf.add("box", (2.2, 0.3, 0.04), (0, 0, z), pal["trunk"])
    for j in range(6):
        x = -0.95 + j * 0.38
        h = 0.18 + 0.08 * ((j + k) % 3)
        shelf.add("box", (0.2, 0.14, h), (x, 0, z + 0.02), K.tint(pal["prop"], j + 5 * k), base=True)
        shelf.add("cylinder", (0.13, 0.13, 0.02), (x, -0.08, z + 0.02 + h * 0.6), pal["trim"], rot=(math.pi / 2, 0, 0), segments=14)
shelf.to_object("ENV_clock_shelves", (1.2, 1.85, 0), 0.0, C["env"])

# wall clocks on the right wall, a longcase clock in the back corner
for i, (y, z, r) in enumerate(((1.2, 2.2, 0.36), (0.3, 2.3, 0.26), (-0.4, 2.0, 0.3), (0.8, 1.6, 0.22))):
    p = K.Parts()
    p.add("cylinder", (2 * r, 2 * r, 0.06), (0, 0, 0), K.tint(pal["prop"], 20 + i), rot=(0, math.pi / 2, 0), segments=20)
    p.add("cylinder", (1.6 * r, 1.6 * r, 0.065), (-0.01, 0, 0), pal["trim"], rot=(0, math.pi / 2, 0), segments=20)
    p.to_object(f"ENV_wall_clock_{i}", (2.86, y, z), 0.0, C["env"])
lc = K.Parts()
lc.add("box", (0.55, 0.4, 2.1), (0, 0, 0), K.tint(pal["prop"], 30), base=True)
lc.add("cylinder", (0.36, 0.36, 0.03), (0, -0.21, 1.75), pal["trim"], rot=(math.pi / 2, 0, 0), segments=20)
lc.add("box", (0.3, 0.02, 0.8), (0, -0.21, 0.7), pal["glass"])
lc.to_object("ENV_longcase_clock", (2.5, 1.7, 0), 0.0, C["env"])

# side cabinet, stool rail, a hanging bulb over the shelves
B.box("PRP_cabinet", (0.6, 1.4, 1.0), (2.6, -0.6, 0.5), rgb=K.tint(pal["prop"], 9), coll=C["prp"])
B.box("PRP_cabinet_top_box", (0.4, 0.3, 0.25), (2.6, -0.3, 1.125), rgb=K.tint(pal["prop"], 11), coll=C["prp"])
bulb = K.Parts()
bulb.add("box", (0.01, 0.01, 0.7), (0, 0, 0.35), pal["metal"])
bulb.add("sphere", (0.12, 0.12, 0.14), (0, 0, 0.0), pal["light"], segments=12)
bulb.to_object("PRP_hanging_bulb", (1.4, 1.2, 2.15), 0.0, C["prp"])
stool = K.Parts()  # a tall bench stool with a footrest ring
SEAT = 0.62
stool.add("cylinder", (0.4, 0.4, 0.05), (0, 0, SEAT - 0.025), pal["trunk"], segments=16)
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    stool.add("box", (0.04, 0.04, SEAT - 0.05), (0.16 * math.cos(ang), 0.16 * math.sin(ang), 0.0), pal["trunk"], base=True)
stool.add("cylinder", (0.42, 0.42, 0.03), (0, 0, 0.2), pal["metal"], segments=16)
stool.to_object("PRP_stool", (0, 0.12, 0), 0.0, C["prp"])

# -- the watchmaker: shaped jointed figure seated on the stool, facing the camera side.
# Sign convention: negative X swings a hanging limb forward, positive X tips torso or head forward.
H = 1.66
fig = K.figure("watchmaker_red", H, (0, 0.1, 0), facing_deg=0.0, rgb=B.PALETTE["red"], fidelity=fid, coll=C["fig"])
root = bpy.data.objects[fig]
root.location.z = SEAT - 0.47 * H  # pelvis on the seat
# thighs forward, shins down to the footrest ring
pose(fig, 1, thigh_L=-84, thigh_R=-84, shin_L=70, shin_R=70)
# 0 to 1.2 s: both hands on the bench; the right holds the watch, the left the loupe
pose(fig, 1, torso=10, head=18, uparm_L=(-40, 0, -12), forearm_L=-58, uparm_R=(-38, 0, 12), forearm_R=-62)
pose(fig, 26, torso=10, head=20, uparm_L=(-38, 0, -14), forearm_L=-62)
# 1.2 s to 2.6 s: the left hand (camera side) lifts the loupe to her left eye
pose(fig, 30, uparm_L=(-38, 0, -14), forearm_L=-62, head=20)
pose(fig, 62, uparm_L=(-70, 0, -22), forearm_L=(-114, 0, 0), head=6)
# 2.4 s to 4.5 s: she leans in over the watch, the loupe hand follows the head
pose(fig, 58, torso=10, uparm_R=(-38, 0, 12), forearm_R=-62)
pose(fig, 108, torso=22, head=8, uparm_R=(-50, 0, 12), forearm_R=-44)
pose(fig, 110, uparm_L=(-84, 0, -22), forearm_L=(-106, 0, 0))
# holds, then the faintest settle
pose(fig, END + 12, torso=23, head=9, uparm_R=(-50, 0, 12), forearm_R=-43, uparm_L=(-85, 0, -22), forearm_L=(-105, 0, 0))
for part in ("torso", "head", "uparm_L", "forearm_L", "uparm_R", "forearm_R"):
    B.smooth_keys(bpy.data.objects[f"{fig}_{part}"])

# props carried in the hands: the gold watch (right), the loupe (left, camera side)
watch = K.Parts()
watch.add("cylinder", (0.06, 0.06, 0.014), (0, 0, 0), B.PALETTE["yellow"], rot=(math.pi / 2, 0, 0), segments=20)
watch.add("cylinder", (0.06, 0.06, 0.006), (0, 0.03, 0.03), B.PALETTE["yellow"], rot=(0.4, 0, 0), segments=20)  # open case lid
watch.to_object("PRP_watch_yellow", (0, 0, -0.1 * H), 0.0, C["prp"], parent=bpy.data.objects[f"{fig}_forearm_R"])
loupe = K.Parts()
loupe.add("cylinder", (0.035, 0.035, 0.04), (0, 0, 0), (0.15, 0.13, 0.11), segments=14)
loupe.to_object("PRP_loupe", (0, -0.02, -0.105 * H), 0.0, C["prp"], parent=bpy.data.objects[f"{fig}_forearm_L"])

sun((62, 0, -35), 2.5)

# -- one camera: slow push-in from a three-quarter front, eye level with her
rig = B.rail_camera("s1_pushin", [(1.5, -2.9, 1.42), (1.12, -2.3, 1.38), (0.78, -1.72, 1.34)],
                    target=(0.0, 0.0, 1.08), lens=40, coll=C["cam"])
B.key_rail(rig["dolly"], [(1, 0.0), (END + 12, 1.0)])
B.bind_cuts([(1, rig["camera"])])
# the aim drifts up from hands-and-face to the face and loupe as she leans in
tgt = bpy.data.objects[rig["target"]]
tgt.keyframe_insert("location", frame=1)
tgt.location = (0.0, -0.1, 1.16)
tgt.keyframe_insert("location", frame=END + 12)
B.smooth_keys(tgt)

finish("ex1_watchmaker", "simple", {
    "framing": lambda: B.audit_framing({"CAM_s1_pushin": [fig]}, step=12),
    "occlusion": lambda: B.audit_occlusion(fig, step=12),
})
