"""Example 3, Salvage Bridge: medium pace, three characters, interior, science fiction.
Advanced density, shaped fidelity, category colors.

Brief: "10 s, 24 fps. The bridge of a deep-space salvage ship. The captain walks from her
chair to the front window as a huge derelict freighter drifts into view; the pilot at the
front console swivels round; the engineer hurries in through the side door with a tablet.
Wide, then over the captain's shoulder, then a reverse on pilot and engineer."
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ex_common import B, K, bpy, finish, pose, start, sun  # noqa: E402

FPS, SECS = 24, 10
END = FPS * SECS
C = start(FPS, SECS, world_rgb=(0.01, 0.012, 0.02))
pal = K.scheme("category")
fid = "shaped"
HULL = (0.36, 0.38, 0.42)       # bulkheads, a cool metal gray
DECK = (0.24, 0.25, 0.27)
SCREEN = (0.22, 0.66, 0.62)     # console screens glow teal
AMBER = (1.0, 0.62, 0.18)       # warning lamps

# -- the room: 14 m wide (x), 12 m deep (y, window at +6), 4 m high
B.box("ENV_deck", (14, 12, 0.1), (0, 0, -0.05), rgb=DECK, coll=C["env"])
for i, x in enumerate((-4.5, -1.5, 1.5, 4.5)):
    B.box(f"ENV_grate_{i}", (1.2, 11, 0.02), (x, -0.2, 0.01), rgb=K.tint(DECK, i + 3, 0.1), coll=C["env"])
B.box("ENV_ceiling", (14, 12, 0.1), (0, 0, 4.05), rgb=K.tint(HULL, 1), coll=C["env"])
B.box("ENV_wall_back", (14, 0.2, 4), (0, -6.1, 2), rgb=HULL, coll=C["env"])
B.box("ENV_wall_right", (0.2, 12, 4), (7.1, 0, 2), rgb=K.tint(HULL, 2), coll=C["env"])
# left wall with the side door opening at y -1..1
B.box("ENV_wall_left_a", (0.2, 5, 4), (-7.1, -3.5, 2), rgb=K.tint(HULL, 4), coll=C["env"])
B.box("ENV_wall_left_b", (0.2, 5, 4), (-7.1, 3.5, 2), rgb=K.tint(HULL, 4), coll=C["env"])
B.box("ENV_door_lintel", (0.2, 2, 1.6), (-7.1, 0, 3.2), rgb=K.tint(HULL, 5), coll=C["env"])
door = K.Parts()
for y in (-1.05, 1.05):
    door.add("box", (0.3, 0.1, 2.4), (0, y, 0), pal["trim"], base=True)
door.add("box", (0.3, 2.2, 0.1), (0, 0, 2.4), AMBER)
door.to_object("ENV_door_frame", (-7.0, 0, 0), 0.0, C["env"])
B.box("ENV_corridor_floor", (4, 3, 0.1), (-9.2, 0, -0.05), rgb=DECK, coll=C["env"])
B.box("ENV_corridor_wall", (0.2, 3, 4), (-11.2, 0, 2), rgb=K.tint(HULL, 9), coll=C["env"])

# the front window: an open band from 1.0 to 3.6 m in five angled bays, frames only
for i in range(5):
    ang = (i - 2) * 0.16
    x = (i - 2) * 2.7
    y = 6.0 - abs(i - 2) * 0.35
    f = K.Parts()
    f.add("box", (2.8, 0.5, 1.0), (0, 0, 0), K.tint(HULL, 6), base=True)      # sill wall
    f.add("box", (2.8, 0.5, 0.45), (0, 0, 3.6), K.tint(HULL, 6), base=True)   # header
    f.add("box", (0.16, 0.4, 2.6), (-1.36, 0, 1.0), pal["trim"], base=True)   # mullion
    f.add("box", (2.8, 0.1, 0.06), (0, -0.25, 1.0), pal["light"])             # sill light strip
    f.to_object(f"ENV_window_bay_{i}", (x, y, 0), math.degrees(-ang), C["env"])

# ceiling ribs, light strips, wall panels, pipes
for i, y in enumerate([-5.2 + 1.5 * k for k in range(8)]):
    r = K.Parts()
    r.add("box", (14, 0.25, 0.3), (0, 0, 3.75), K.tint(HULL, 10 + i), base=False)
    for x in (-6.85, 6.85):
        r.add("box", (0.3, 0.25, 3.6), (x, 0, 0), K.tint(HULL, 10 + i), base=True)
    r.to_object(f"ENV_rib_{i}", (0, y, 0), 0.0, C["env"])
    B.box(f"ENV_ceiling_light_{i}", (3.0, 0.18, 0.05), (0, y + 0.75, 3.95), rgb=pal["light"], coll=C["env"])
for side in (-1, 1):
    for k in range(9):
        y = -5.0 + k * 1.25
        if side < 0 and -1.3 < y < 1.3:
            continue
        B.box(f"ENV_panel_{'L' if side < 0 else 'R'}{k}", (0.06, 1.0, 1.4), (side * 6.97, y, 1.9), rgb=K.tint(HULL, 30 + k + (side > 0) * 9, 0.12), coll=C["env"])
    for j, z in enumerate((3.3, 3.45)):
        p = K.Parts()
        p.add("cylinder", (0.12, 0.12, 11.5), (0, 0, 0), pal["metal"], rot=(math.pi / 2, 0, 0), segments=10)
        p.to_object(f"ENV_pipe_{'L' if side < 0 else 'R'}{j}", (side * 6.75, 0, z), 0.0, C["env"])


# consoles: a desk with a sloped top and a glowing screen, facing local -Y
def console(name, loc, facing, w=1.6, screen=SCREEN, seed=0):
    p = K.Parts()
    p.add("box", (w, 0.7, 0.8), (0, 0, 0), K.tint(HULL, seed + 40), base=True)
    p.add("wedge", (w, 0.6, 0.25), (0, 0.05, 0.92), K.tint(HULL, seed + 41), rot=(0, 0, math.pi))
    p.add("box", (w * 0.9, 0.06, 0.5), (0, 0.32, 1.32), screen, rot=(-0.25, 0, 0))
    p.add("box", (w * 0.25, 0.1, 0.06), (w * 0.3, -0.2, 1.0), AMBER)
    return p.to_object(name, loc, facing, C["prp"])


console("PRP_console_pilot", (-1.6, 4.3, 0), 180.0, seed=1)
console("PRP_console_copilot", (1.6, 4.3, 0), 180.0, seed=2)
for k, y in enumerate((-3.6, -1.6, 2.4)):
    console(f"PRP_station_L{k}", (-6.2, y, 0), -90.0, w=1.4, seed=10 + k)
for k, y in enumerate((-3.6, -1.6, 0.4, 2.4)):
    console(f"PRP_station_R{k}", (6.2, y, 0), 90.0, w=1.4, screen=K.tint(SCREEN, k, 0.15), seed=20 + k)
# overhead monitors hanging above the front consoles
for k, x in enumerate((-3.0, 0.0, 3.0)):
    B.box(f"PRP_overhead_monitor_{k}", (1.3, 0.08, 0.7), (x, 3.4, 3.2), rgb=K.tint(SCREEN, k + 5, 0.1), coll=C["prp"])


def seat(name, loc, facing):
    p = K.Parts()
    p.add("cylinder", (0.16, 0.16, 0.42), (0, 0, 0), pal["metal"], base=True, segments=10)
    p.add("box", (0.56, 0.56, 0.1), (0, 0, 0.47), (0.16, 0.16, 0.18))
    p.add("box", (0.56, 0.12, 0.7), (0, 0.28, 0.85), (0.16, 0.16, 0.18))
    return p.to_object(name, loc, facing, C["prp"])


seat("PRP_seat_copilot", (1.6, 3.35, 0), 180.0)
seat("PRP_captain_chair", (0.0, -2.6, 0), 180.0)
for k, y in enumerate((-3.6, -1.6, 2.4)):
    seat(f"PRP_seat_L{k}", (-5.4, y, 0), 90.0)
# floor lights along the walkway, ceiling vents between ribs, cable bundles, wall displays
for k in range(8):
    for x in (-0.9, 0.9):
        B.box(f"PRP_floor_light_{k}{'L' if x < 0 else 'R'}", (0.12, 0.3, 0.03), (x, -4.8 + k * 1.2, 0.015), rgb=pal["light"], coll=C["prp"])
for k in range(7):
    for x in (-4.0, 4.0):
        B.box(f"ENV_vent_{k}{'L' if x < 0 else 'R'}", (1.6, 0.8, 0.08), (x, -4.45 + k * 1.5, 3.96), rgb=K.tint(HULL, 60 + k, 0.15), coll=C["env"])
for k in range(6):
    p = K.Parts()
    for j in range(3):
        p.add("cylinder", (0.06, 0.06, 3.4), (j * 0.08, 0, 0), (0.14, 0.14, 0.15), base=True, segments=8)
    p.to_object(f"ENV_cables_{k}", ((-6.6, 6.6)[k % 2], -5.0 + (k // 2) * 4.0, 0), 0.0, C["env"])
for k in range(6):
    B.box(f"PRP_wall_display_{k}", (0.05, 0.9, 0.55), ((-6.92, 6.92)[k % 2], -4.4 + (k // 2) * 3.3, 2.8), rgb=K.tint(SCREEN, 10 + k, 0.12), coll=C["prp"])
# a map table, lockers, cases
mt = K.Parts()
mt.add("cylinder", (1.4, 1.4, 0.9), (0, 0, 0), K.tint(HULL, 50), base=True, segments=20)
mt.add("cylinder", (1.3, 1.3, 0.04), (0, 0, 0.92), K.tint(SCREEN, 3, 0.1), segments=20)
mt.to_object("PRP_map_table", (3.2, -0.6, 0), 0.0, C["prp"])
for k in range(5):
    B.box(f"PRP_locker_{k}", (0.6, 0.5, 2.0), (-3.2 + k * 0.65, -5.7, 1.0), rgb=K.tint(pal["metal"], k, 0.12), coll=C["prp"])
for k, (x, y) in enumerate(((5.6, -5.2), (6.2, -4.6), (4.9, -5.4), (5.9, 4.9), (-5.9, 5.0), (-6.2, 4.4))):
    B.box(f"PRP_case_{k}", (0.8, 0.6, 0.5 + 0.1 * (k % 3)), (x, y, 0.25 + 0.05 * (k % 3)), rgb=K.tint(pal["prop"], k), coll=C["prp"])

# -- outside: the derelict freighter (a hero mover), debris (extras), a planet's limb
dl = K.Parts()
dl.add("box", (150, 32, 26), (-80, 0, 0), (0.30, 0.27, 0.25))
dl.add("box", (120, 30, 24), (60, 6, -6), (0.28, 0.25, 0.23), rot=(0, 0.08, 0.12))   # the broken spine
for k in range(6):
    dl.add("box", (14, 34, 16), (-140 + k * 26, 0, 0), (0.12, 0.11, 0.11))           # open cargo bays
dl.add("box", (24, 20, 36), (-150, 0, 22), (0.33, 0.30, 0.28))                       # command tower
for k in range(7):
    dl.add("sphere", (3, 3, 3), (-150 + k * 34, -17, 12), AMBER, segments=8)           # beacons
derelict = dl.to_object("PRP_derelict", (210, 520, 40), 0.0, C["prp"])
derelict.rotation_euler = (0.0, 0.05, math.radians(8))
derelict.keyframe_insert("location", frame=1)
derelict.keyframe_insert("rotation_euler", frame=1)
derelict.location = (40, 470, 34)
derelict.rotation_euler = (0.0, 0.09, math.radians(14))
derelict.keyframe_insert("location", frame=END + 12)
derelict.keyframe_insert("rotation_euler", frame=END + 12)
for fc in B.fcurves(derelict):
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
import random  # noqa: E402
rng = random.Random(7)
for k in range(32):
    x, y, z = rng.uniform(-60, 90), rng.uniform(40, 220), rng.uniform(-10, 40)
    d = K.Parts()
    d.add("ico", (rng.uniform(1, 4), rng.uniform(1, 3), rng.uniform(0.5, 2)), (0, 0, 0), K.tint((0.34, 0.31, 0.29), k, 0.2))
    o = d.to_object(f"PRP_debris_{k:02d}", (x, y, z), rng.uniform(0, 360), C["prp"])
    o.keyframe_insert("location", frame=1)
    o.keyframe_insert("rotation_euler", frame=1)
    o.location = (x - rng.uniform(6, 14), y, z + rng.uniform(-2, 2))
    o.rotation_euler = (rng.uniform(0, 1.5), rng.uniform(0, 1.5), o.rotation_euler.z + rng.uniform(-1, 1))
    o.keyframe_insert("location", frame=END + 12)
    o.keyframe_insert("rotation_euler", frame=END + 12)
    K.mark_extra(o)
pl = K.Parts()
pl.add("sphere", (3000, 3000, 3000), (0, 0, 0), (0.30, 0.42, 0.56), segments=48)
pl.to_object("ENV_planet", (1900, 4200, -1900), 0.0, C["env"])

# -- the crew. Sign convention: negative X swings a hanging limb forward, positive X tips
# torso or head forward.
cap = K.figure("captain_red", 1.72, (0.9, -2.7, 0), facing_deg=180.0, rgb=B.PALETTE["red"], fidelity=fid, coll=C["fig"])
K.walk_path(cap, [(1, (0.9, -2.7)), (22, (0.9, -2.7)), (130, (0.15, 4.25)), (END + 12, (0.15, 4.25))])

pil = K.figure("pilot_blue", 1.78, (-1.6, 3.35, 0), facing_deg=180.0, rgb=B.PALETTE["blue"], fidelity=fid, coll=C["fig"])
pilot = bpy.data.objects[pil]
pilot.location.z = 0.52 - 0.47 * 1.78
pose(pil, 1, thigh_L=-86, thigh_R=-86, shin_L=84, shin_R=84, uparm_L=(-50, 0, -6), uparm_R=(-50, 0, 6),
     forearm_L=-40, forearm_R=-40, torso=6)
bpy.context.view_layer.update()
pseat = seat("PRP_seat_pilot", (-1.6, 3.35, 0), 180.0)
pseat.parent = pilot  # the seat turns with the pilot
pseat.matrix_parent_inverse = pilot.matrix_world.inverted()
# 7.8 s to 8.9 s: the pilot swivels round toward the engineer, hands off the console
pilot.keyframe_insert("rotation_euler", index=2, frame=188)
pilot.rotation_euler.z = math.radians(180 + 150)
pilot.keyframe_insert("rotation_euler", index=2, frame=214)
B.smooth_keys(pilot)
pose(pil, 188, uparm_L=(-50, 0, -6), uparm_R=(-50, 0, 6), forearm_L=-40, forearm_R=-40, head=0)
pose(pil, 212, uparm_L=(-20, 0, -8), uparm_R=(-24, 0, 8), forearm_L=-60, forearm_R=-55, head=-6)

eng = K.figure("engineer_green", 1.70, (-8.6, 0.0, 0), facing_deg=90.0, rgb=B.PALETTE["green"], fidelity=fid, coll=C["fig"])
K.walk_path(eng, [(1, (-8.6, 0.0)), (72, (-8.6, 0.0)), (186, (-2.55, 1.95)), (END + 12, (-2.55, 1.95))], stride=0.78)
# the tablet, carried in the right hand, raised to show the pilot once she stops
tab = K.Parts()
tab.add("box", (0.26, 0.02, 0.2), (0, 0, 0), SCREEN)
tab.to_object("PRP_tablet", (0, -0.03, -0.11 * 1.70), 0.0, C["prp"], parent=bpy.data.objects[f"{eng}_forearm_R"])
pose(eng, 188, uparm_R=-10, forearm_R=-20, head=0)
pose(eng, 210, uparm_R=(-34, 0, 10), forearm_R=-70, head=14)

sun((45, 0, 200), 2.0)

# -- shot 1 (0 to 3.5 s): wide from the rear right corner, 20 mm, sliding left
CUT2, CUT3 = 85, 169
a = B.rail_camera("s1_wide", [(5.8, -5.3, 3.3), (4.6, -5.5, 3.25), (3.3, -5.6, 3.2)], target=(-0.6, 3.0, 1.3), lens=20, coll=C["cam"])
B.key_rail(a["dolly"], [(1, 0.0), (CUT2 + 8, 1.0)])
# -- shot 2 (3.5 to 7 s): over the captain's shoulder toward the window and the derelict, 35 mm
b = B.rail_camera("s2_ots", [(1.15, -1.3, 1.8), (1.0, 0.3, 1.76), (0.85, 1.9, 1.72)], target=(8.0, 60.0, 5.0), lens=35, coll=C["cam"])
B.key_rail(b["dolly"], [(CUT2 - 8, 0.0), (CUT3 + 8, 1.0)])
# -- shot 3 (7 to 10 s): reverse from the window on the pilot and the engineer, 32 mm, slow push
c = B.rail_camera("s3_reverse", [(-4.1, 5.15, 1.6), (-3.9, 4.95, 1.55), (-3.7, 4.75, 1.52)], target=(-2.0, 2.5, 1.15), lens=30, coll=C["cam"])
B.key_rail(c["dolly"], [(CUT3 - 8, 0.0), (END + 12, 1.0)])
B.bind_cuts([(1, a["camera"]), (CUT2, b["camera"]), (CUT3, c["camera"])])

finish("ex3_bridge", "advanced", {
    "framing": lambda: B.audit_framing({"CAM_s1_wide": [cap], "CAM_s2_ots": [f"{cap}_head", "PRP_derelict"], "CAM_s3_reverse": [pil, eng]}, step=8),
    "occlusion_captain": lambda: B.audit_occlusion(cap, frames=range(1, CUT3, 8)),
    "occlusion_engineer": lambda: B.audit_occlusion(eng, frames=range(CUT3, END + 1, 8)),
})
