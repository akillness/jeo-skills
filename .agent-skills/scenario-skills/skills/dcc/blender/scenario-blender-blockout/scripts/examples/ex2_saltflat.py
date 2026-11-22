"""Example 2, Salt Flat Run: fast, two characters, wide exterior, realistic. Medium density,
shaped fidelity, category colors.

Brief: "8 s, 24 fps. Golden hour on a salt flat. A motocross rider on a dirt bike races
toward us down a dirt track along a line of telegraph poles, a battered blue pickup
chasing 15 m behind. Shot 1: a low tracking shot from a camera car just ahead of the bike, the pickup looming
behind. Shot 2: an
aerial tracking shot beside them as the bike swerves around boulders and the pickup
follows."
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ex_common import B, K, bpy, finish, pose, start, sun  # noqa: E402

FPS, SECS = 24, 8
END = FPS * SECS
C = start(FPS, SECS, world_rgb=(0.42, 0.46, 0.54))
pal = K.scheme("category")
fid = "shaped"
SALT = (0.95, 0.94, 0.90)
DIRT = (0.56, 0.46, 0.36)

# -- ground: a pale salt flat, a packed dirt track along Y (vehicles run toward -Y)
B.box("ENV_saltflat", (1600, 1600, 0.2), (0, 0, -0.1), rgb=SALT, coll=C["env"])
B.box("ENV_track", (5.0, 520, 0.03), (0, 20, 0.015), rgb=DIRT, coll=C["env"])
for i, y in enumerate(range(-200, 260, 40)):  # tyre ruts as darker bands
    B.box(f"ENV_rut_{i:02d}", (0.4, 36, 0.035), ((-0.9, 0.9)[i % 2], y, 0.018), rgb=K.tint(DIRT, i, 0.12), coll=C["env"])

# distant mesas and mountains, far enough to sit on the horizon
for i, (x, y, s) in enumerate(((-420, 520, 190), (-150, 640, 240), (160, 600, 210), (430, 520, 170),
                               (620, 300, 150), (-640, 260, 160), (60, 780, 300), (-300, 900, 260))):
    K.rock(f"ENV_mountain_{i}", (x, y, -s * 0.35), s, fid, pal, seed=i, coll=C["env"])

# telegraph poles along the right of the track, every 25 m
for i, y in enumerate(range(-150, 230, 25)):
    p = K.Parts()
    p.add("cylinder", (0.26, 0.26, 8.0), (0, 0, 0), pal["trunk"], base=True, segments=10)
    p.add("box", (1.8, 0.14, 0.14), (0, 0, 7.4), pal["trunk"])
    for x in (-0.7, 0.0, 0.7):
        p.add("cylinder", (0.08, 0.08, 0.16), (x, 0, 7.55), pal["trim"], segments=8)
    p.to_object(f"ENV_pole_{i:02d}", (9.0, y, 0), 0.0, C["env"])

# a fence line on the left, posts only
for i, y in enumerate(range(-120, 200, 10)):
    B.box(f"ENV_fencepost_{i:02d}", (0.14, 0.14, 1.3), (-13.0, y, 0.65), rgb=K.tint(pal["trunk"], i), coll=C["env"])

# a rusted water tower and a wrecked car, landmarks for the wide shots
tw = K.Parts()
for dx, dy in ((-1.8, -1.8), (1.8, -1.8), (-1.8, 1.8), (1.8, 1.8)):
    tw.add("box", (0.25, 0.25, 9.0), (dx, dy, 0), pal["metal"], base=True)
tw.add("cylinder", (5.2, 5.2, 4.2), (0, 0, 9.0), K.tint(pal["prop"], 3), base=True, segments=20)
tw.add("cone", (5.6, 5.6, 1.4), (0, 0, 13.9), pal["roof"], segments=20)
tw.to_object("ENV_water_tower", (-34, 70, 0), 0.0, C["env"])
K.vehicle("PRP_wreck", "car", (16, -46, 0), 115, fid, (0.48, 0.32, 0.22), pal, C["prp"])

# boulders: two the bike swerves around, scatter along the edges
K.rock("PRP_boulder_a", (-0.6, -45, 0), 1.6, fid, pal, seed=11, coll=C["prp"])
K.rock("PRP_boulder_b", (1.4, -82, 0), 1.4, fid, pal, seed=12, coll=C["prp"])
pts = K.scatter_points(26, (-12, 12, -140, 140), seed=5, min_dist=6, avoid=[(0, y, 4.0) for y in range(-150, 160, 4)])
for i, (x, y) in enumerate(pts):
    K.rock(f"ENV_rock_{i:02d}", (x, y, 0), 0.4 + (i % 5) * 0.25, fid, pal, seed=20 + i, coll=C["env"])


# -- the dirt bike (front = local -Y, marked: white number plate and headlight in front,
# red tail light behind) and its rider, standing on the pegs
def dirt_bike(name, body):
    p = K.Parts()
    for y in (-0.72, 0.72):
        p.add("cylinder", (0.74, 0.74, 0.12), (0, y, 0.37), (0.07, 0.07, 0.08), rot=(0, math.pi / 2, 0), segments=18)
        p.add("cylinder", (0.32, 0.32, 0.13), (0, y, 0.37), pal["metal"], rot=(0, math.pi / 2, 0), segments=12)
    p.add("box", (0.28, 0.62, 0.36), (0, 0.02, 0.52), (0.16, 0.16, 0.18))  # engine
    p.add("box", (0.38, 0.52, 0.24), (0, -0.16, 0.86), body)  # tank and shrouds
    p.add("box", (0.26, 0.74, 0.08), (0, 0.3, 0.95), (0.12, 0.12, 0.13))  # seat
    p.add("box", (0.2, 0.6, 0.05), (0, 0.78, 0.98), body, rot=(-0.25, 0, 0))  # rear fender
    p.add("box", (0.18, 0.4, 0.04), (0, -0.78, 0.8), body, rot=(0.35, 0, 0))  # front fender
    p.add("box", (0.07, 0.07, 0.78), (0, -0.62, 0.74), pal["metal"], rot=(-0.42, 0, 0))  # fork
    p.add("box", (0.78, 0.05, 0.05), (0, -0.46, 1.12), pal["metal"])  # handlebar
    p.add("box", (0.26, 0.04, 0.22), (0, -0.67, 1.0), pal["trim"])  # number plate
    p.add("box", (0.12, 0.05, 0.08), (0, -0.7, 0.96), pal["light"])  # headlight
    p.add("box", (0.1, 0.05, 0.06), (0, 1.06, 0.98), K.REAR_RED)  # tail light
    return p.to_object(name, (0, 0, 0), 0.0, C["prp"])


bike = dirt_bike("PRP_dirtbike", pal["trim"])
rider = K.figure("rider_red", 1.78, (0, 0, 0), 0.0, B.PALETTE["red"], fidelity=fid, coll=C["fig"])
rb = bpy.data.objects[rider]
rb.parent = bike
rb.location = (0, 0.12, 0.3)
# crouched attack stance: knees bent, torso forward, arms to the bars, head up
pose(rider, 1, thigh_L=-40, thigh_R=-40, shin_L=62, shin_R=62, torso=34, head=-26,
     uparm_L=(-58, 0, -6), uparm_R=(-58, 0, 6), forearm_L=-34, forearm_R=-34)
pose(rider, END + 12, torso=36, head=-28)


# -- the pickup (front = local -Y): hood, cab, open bed, roof light bar
def pickup(name, body):
    r, L, W = 0.42, 5.3, 2.0
    p = K.Parts()
    p.add("box", (W, L, 0.72), (0, 0, r * 1.05), body, base=True, bevel=0.05)
    p.add("box", (W * 0.95, 1.6, 0.78), (0, -0.55, r * 1.05 + 0.72), body, base=True, bevel=0.05)
    p.add("box", (W * 0.97, 1.42, 0.44), (0, -0.55, r * 1.05 + 0.86), pal["glass"], base=True)
    for x in (-W / 2 + 0.06, W / 2 - 0.06):
        p.add("box", (0.12, 2.4, 0.5), (x, 1.42, r * 1.05 + 0.72), body, base=True)
    p.add("box", (W, 0.12, 0.5), (0, L / 2 - 0.06, r * 1.05 + 0.72), body, base=True)
    p.add("box", (W * 0.86, 2.3, 0.04), (0, 1.42, r * 1.05 + 0.73), (0.15, 0.15, 0.16), base=True)  # bed floor
    p.add("box", (1.6, 0.22, 0.14), (0, -1.15, r * 1.05 + 1.52), pal["metal"], base=True)  # light bar
    for x in (-0.6, -0.2, 0.2, 0.6):
        p.add("cylinder", (0.16, 0.16, 0.08), (x, -1.28, r * 1.05 + 1.59), pal["light"], rot=(math.pi / 2, 0, 0), segments=10)
    p.add("box", (W * 1.04, 0.2, 0.24), (0, -L / 2 - 0.05, r * 0.95), pal["metal"], base=True)  # chrome bumper
    p.add("box", (W * 0.6, 0.06, 0.32), (0, -L / 2 - 0.02, r * 1.05 + 0.3), (0.12, 0.12, 0.13), base=True)  # grille
    for x in (-0.72, 0.72):
        p.add("box", (0.26, 0.08, 0.2), (x, -L / 2 - 0.04, r * 1.05 + 0.4), pal["light"], base=True)
        p.add("box", (0.18, 0.08, 0.3), (x, L / 2 + 0.03, r * 1.05 + 0.3), K.REAR_RED, base=True)
    for y in (-L * 0.31, L * 0.31):
        for x in (-W / 2 + 0.16, W / 2 - 0.16):
            p.add("cylinder", (2 * r, 2 * r, 0.32), (x, y, r), (0.07, 0.07, 0.08), rot=(0, math.pi / 2, 0), segments=18)
    return p.to_object(name, (0, 0, 0), 0.0, C["prp"])


truck = pickup("PRP_pickup_blue", B.PALETTE["blue"])


# -- motion: one smooth path, both vehicles on it at 24 m/s, the pickup 16 m behind
# and closing to 11 m. x(y) swerves around the two boulders.
def lane_x(y):
    x = 0.3
    x += 2.0 * math.exp(-((y + 45) / 9.0) ** 2)   # right of boulder a
    x -= 2.1 * math.exp(-((y + 82) / 9.0) ** 2)   # left of boulder b
    return x


def path(y0, speed, frames=(1, END + 12), step=3):
    out = []
    for f in list(range(frames[0], frames[1] + 1, step)) + [frames[1]]:
        y = y0 - speed * (f - 1) / FPS
        out.append((f, (lane_x(y), y)))
    return sorted(set(out))


K.drive(bike, path(92.0, 24.0))
K.drive(truck, path(108.0, 24.9))

sun((78, 0, 150), 3.0)  # low sun from behind the pair: golden hour

# -- shot 1 (0 to 3.5 s): low front tracking from a camera car 7 m ahead of the bike, 28 mm,
# looking back at the rider with the pickup looming behind
CUT2 = 85
a = B.rail_camera("s1_front_track", [(1.6, 85.0, 1.1), (1.6, 40.0, 1.1), (1.6, -6.0, 1.1)],
                  follow=bike.name, target_offset=(0, 7.0, 1.0), lens=28, coll=C["cam"])
B.key_rail(a["dolly"], [(1, 0.0), (CUT2 + 8, 1.0)])
# -- shot 2 (3.5 to 8 s): aerial tracking beside the pair, 40 mm, keeping pace
b = B.rail_camera("s2_aerial_track", [(-12, -4, 6.0), (-12, -50, 5.6), (-12, -100, 5.2), (-12, -122, 5.2)],
                  follow=bike.name, target_offset=(0, 6.5, 0.6), lens=40, coll=C["cam"])
B.key_rail(b["dolly"], [(CUT2 - 8, 0.0), (END + 12, 1.0)])
for d in (a["dolly"], b["dolly"]):
    for fc in B.fcurves(bpy.data.objects[d]):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
B.bind_cuts([(1, a["camera"]), (CUT2, b["camera"])])

finish("ex2_saltflat", "medium", {
    "framing": lambda: B.audit_framing({"CAM_s1_front_track": [bike.name, truck.name], "CAM_s2_aerial_track": [bike.name, truck.name]}, step=8),
    "occlusion": lambda: B.audit_occlusion(rider, step=8),
})
