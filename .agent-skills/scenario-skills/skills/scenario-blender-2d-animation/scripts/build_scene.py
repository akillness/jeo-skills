"""Side-scrolling platformer shot built in Blender from Scenario-generated assets.

Every image comes from Scenario; this script only lays them out and animates:
- 5 parallax planes (sky, sea, jungle, ground, foreground plants) driven by the camera
- hero: a 9-frame run cycle (image sequence from a Scenario video) and a jump pose, one image
  per frame (no body parts), with squash and stretch on take-off and landing
- a floating island with 3 paw coins to collect
- coconuts that drop from the palm (rigid bodies released at a frame)
- a tower of clay pots and a golden idol on a temple pedestal that the hero smashes
  (rigid body physics, constrained to the 2D plane)

Usage (headless):
  blender -b --factory-startup --python-exit-code 1 -P build_scene.py -- --set SET_DIR [--out DIR] [--review] [--final] [--force]
Inside an open Blender (Python console, or a Blender MCP execute_python call), where a full file reset may be blocked,
from a new file (File > New) or this script's own output, since --live empties the open file and refuses any other:
  import sys; sys.argv = ["blender", "--", "--set", "/abs/SET_DIR", "--live"]; exec(open("/abs/build_scene.py").read())

  --set SET_DIR  the art set: a folder holding game/ (the processed sprites, fixed file names, see below)
  --out DIR      where the .blend, the review stills and the film go (default: the folder that holds SET_DIR)
  --review       render 11 review stills at 40 percent to DIR/review<tag>/
  --final        render the 1920x1080, 24 fps film to DIR/platformer<tag>.mp4
  --live         build in the open file (its objects and data are removed first) instead of a factory reset;
                 refused unless the open file is new or is this script's own output
  --force        overwrite an existing .blend or film

Art sets: the animation, camera, timing and physics are the same for every set; only the pictures change.
SET_DIR/game/ holds sky.png, sea_tile.png, jungle_tile.png, ground_tile.png, fg_bush.png, fg_fern.png,
fg_hibiscus.png, fg_boulder.png, fg_curl.png, island.png, palm.png, pedestal.png, coin.png, jar.png,
pot_round.png, idol.png, amphora.png, coconut.png, hero_jump.png, hero_run/run_001.png..., shapes.json (from
trace_hulls.py) and config.json, which holds the few numbers measured from its pictures (horizon and ground
lines, the island and pedestal tops, the hero's size); any number it leaves out keeps the default below.
"""
import bpy, math, os, sys
from mathutils import Vector

import json
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def usage(msg):
    print(__doc__)
    print("error:", msg)
    sys.exit(1)


if "--set" not in ARGS or ARGS.index("--set") + 1 >= len(ARGS):
    usage("pass --set SET_DIR")
SET = os.path.abspath(ARGS[ARGS.index("--set") + 1])
A = os.path.join(SET, "game")
if not os.path.isfile(os.path.join(A, "shapes.json")):
    usage(f"{A}/shapes.json not found (run trace_hulls.py on the props first)")
ROOT = os.path.abspath(ARGS[ARGS.index("--out") + 1]) if "--out" in ARGS else os.path.dirname(SET)
os.makedirs(ROOT, exist_ok=True)
with open(os.path.join(A, "shapes.json"), encoding="utf-8") as f:
    SHAPES = json.load(f)
CFG = {  # the jungle set's numbers; a set's game/config.json overrides any of them
    "tag": "", "sea_h": 6.0, "sea_horizon": 0.585, "sea_base_z": 2.1, "jungle_h": 7.0, "jungle_z0": -1.6,
    "ground_h": 4.3, "ground_top": 0.501, "island_top_px": 33, "pedestal_top_px": 48, "palm_h": 7.4,
    "nuts": [[-0.35, 6.25], [0.25, 6.15], [0.05, 6.45]], "nut_size": 0.5,
    "hero_h": 1.62, "run_fig_px": 483, "run_pad_px": 8, "jump_base_px": 785, "run_n": 9, "run_canvas_px": 768,
}
if os.path.exists(os.path.join(A, "config.json")):
    with open(os.path.join(A, "config.json"), encoding="utf-8") as f:
        CFG.update(json.load(f))
END, FPS = 184, 24
out_blend = os.path.join(ROOT, f"platformer_scene{CFG['tag']}.blend")
out_film = os.path.join(ROOT, f"platformer{CFG['tag']}.mp4")
for path in (out_blend, out_film if "--final" in ARGS else None):
    if path and os.path.exists(path) and "--force" not in ARGS:
        usage(f"{path} exists (pass --force to replace it)")

if "--live" in ARGS:
    # an open session: empty the current file instead of a factory reset, but never the user's own work. Only a
    # new file (nothing beyond the startup cube, light and camera) or this script's own output qualifies;
    # bpy.data.is_dirty cannot tell, since a new file already reports unsaved changes
    if bpy.data.filepath:
        own = os.path.abspath(bpy.data.filepath) == out_blend
    else:
        own = not {o.name for o in bpy.data.objects} - {"Cube", "Light", "Camera"}
    if not own:
        usage("--live empties the open file: save your work, then start from File > New")
    sc = bpy.context.scene
    if sc.rigidbody_world:
        bpy.ops.rigidbody.world_remove()
    for data in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras,
                 bpy.data.lights, bpy.data.worlds, bpy.data.actions):
        for block in list(data):
            data.remove(block)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = "Platformer"
sc.frame_start, sc.frame_end = 1, END
r = sc.render
r.engine = "BLENDER_EEVEE"
r.resolution_x, r.resolution_y, r.fps = 1920, 1080, FPS
sc.view_settings.view_transform = "Standard"
sc.world = bpy.data.worlds.new("World")
sc.world.color = (0, 0, 0)


# ----------------------------------------------------------------- helpers
def image(path, sequence=False):
    im = bpy.data.images.load(path, check_existing=True)
    im.alpha_mode = "STRAIGHT"
    if sequence:
        im.source = "SEQUENCE"
    return im


def sprite_material(name, img, seq_len=0, seq_start=1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.extension = "CLIP"
    if seq_len:
        u = tex.image_user
        u.frame_duration, u.frame_start, u.frame_offset = seq_len, seq_start, 0
        u.use_cyclic = True
        u.use_auto_refresh = True
    em = nt.nodes.new("ShaderNodeEmission")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    L = nt.links
    L.new(tex.outputs["Color"], em.inputs["Color"])
    L.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs["Surface"])
    return m


def quads_mesh(name, quads):
    """quads: [(x0, z0, x1, z1)] in the XZ plane, each UV-mapped 0..1."""
    me = bpy.data.meshes.new(name)
    verts, faces, uvs = [], [], []
    for x0, z0, x1, z1 in quads:
        i = len(verts)
        verts += [(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)]
        faces.append((i, i + 1, i + 2, i + 3))
        uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new()
    for li, loop in enumerate(me.loops):
        uv.data[li].uv = uvs[loop.vertex_index]
    # normals face -Y (towards the camera)
    for p in me.polygons:
        p.flip() if p.normal.y > 0 else None
    return me


def sprite(name, path, height=None, width=None, loc=(0, 0, 0), anchor="bottom", parent=None, img=None, mat=None):
    img = img or image(path)
    w_px, h_px = img.size
    if height:
        width = height * w_px / h_px
    else:
        height = width * h_px / w_px
    x0, x1 = -width / 2, width / 2
    z0, z1 = (0, height) if anchor == "bottom" else (-height / 2, height / 2)
    ob = bpy.data.objects.new(name, quads_mesh(name, [(x0, z0, x1, z1)]))
    ob.data.materials.append(mat or sprite_material(name, img))
    sc.collection.objects.link(ob)
    ob.location = loc
    ob.parent = parent
    return ob


def tiled(name, path, height, x_from, x_to, z0, y, img=None):
    img = img or image(path)
    w = height * img.size[0] / img.size[1]
    quads, x = [], x_from
    while x < x_to:
        quads.append((x, z0, x + w - 0.002, z0 + height))     # tiny overlap guard
        x += w - 0.004
    ob = bpy.data.objects.new(name, quads_mesh(name, quads))
    ob.data.materials.append(sprite_material(name, img))
    sc.collection.objects.link(ob)
    ob.location.y = y
    return ob


def empty(name, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    sc.collection.objects.link(e)
    e.location = loc
    return e


def key(ob, path, f, value=None, index=-1, interp=None):
    if value is not None:
        if index >= 0:
            getattr(ob, path)[index] = value
        else:
            setattr(ob, path, value)
    ob.keyframe_insert(path, index=index, frame=f)


def smooth(t):
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------- hero path (x, z per frame) and events
SPEED = 0.2                                       # m per frame, matched to the run cycle stride
ISLAND_X, ISLAND_W, ISLAND_TOP = 9.0, 4.4, 2.2    # island center x, width, walkable top
JUMPS = [  # (take-off frame, landing frame, x0, x1, z0, z1, peak height above the higher end)
    (46, 61, None, None, 0.0, ISLAND_TOP, 1.1),
    (76, 88, None, None, ISLAND_TOP, 0.0, 0.5),
    (118, 146, None, None, 0.0, 0.0, 2.35),
    (152, 175, None, None, 0.0, 0.0, 2.1),
]
X0 = -4.0


def hero_x(f):
    return X0 + SPEED * (f - 1)


def hero_z(f):
    for f0, f1, _, _, z0, z1, hpk in JUMPS:
        if f0 <= f <= f1:
            t = (f - f0) / (f1 - f0)
            top = max(z0, z1) + hpk
            # two half-parabolas meeting at the peak (t = 0.5): up from z0, then down to z1
            if t <= 0.5:
                return z0 + (top - z0) * (1 - (1 - t * 2) ** 2)
            return z1 + (top - z1) * (1 - ((t - 0.5) * 2) ** 2)
    if JUMPS[0][1] < f < JUMPS[1][0]:
        return ISLAND_TOP
    return 0.0


def airborne(f):
    return any(f0 < f < f1 for f0, f1, *_ in JUMPS)


# ----------------------------------------------------------------- camera
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 16.0
cam.data.clip_start, cam.data.clip_end = 0.1, 400
cam.rotation_euler = (math.radians(90), 0, 0)
cx, cz = hero_x(1) + 2.5, 2.4
CAM = {}
for f in range(1, END + 1):
    tx = hero_x(f) + 2.5
    tz = 2.4 + 0.35 * max(0.0, hero_z(f) - 0.4)
    cx += (tx - cx) * 0.25 if f > 1 else 0
    cz += (tz - cz) * 0.08
    cam.location = (cx, -100, cz)
    cam.keyframe_insert("location", frame=f)
    CAM[f] = (cx, cz)


def follow(ob, k):
    """Parallax: the layer moves k times as far as the camera (k=1: infinitely far)."""
    fc = ob.driver_add("location", 0)
    d = fc.driver
    d.type = "SCRIPTED"
    v = d.variables.new()
    v.name, v.type = "c", "TRANSFORMS"
    v.targets[0].id = cam
    v.targets[0].transform_type = "LOC_X"
    d.expression = f"c*{k}"
    assert d.is_simple_expression


# ----------------------------------------------------------------- parallax layers
CAM_MIN, CAM_MAX = -2.0, hero_x(END) + 3.0


def span(k, pad=9.5):
    return (1 - k) * CAM_MIN - pad, (1 - k) * CAM_MAX + pad


sky_img = image(os.path.join(A, "sky.png"))
sky_h = 10.6
sky = sprite("L1_Sky", None, height=sky_h, loc=(0, 60, 3.0), anchor="center", img=sky_img)
sky.location.x = (span(0.97)[0] + span(0.97)[1]) / 2
follow(sky, 0.97)

SEA_H, SEA_HORIZON = CFG["sea_h"], CFG["sea_horizon"]       # horizon row as a fraction from the top of the image
x0, x1 = span(0.85)
sea = tiled("L2_Sea", os.path.join(A, "sea_tile.png"), SEA_H, x0, x1, CFG["sea_base_z"] - SEA_H * (1 - SEA_HORIZON), 50)
follow(sea, 0.85)

JUN_H = CFG["jungle_h"]
x0, x1 = span(0.6)
jungle = tiled("L3_Jungle", os.path.join(A, "jungle_tile.png"), JUN_H, x0, x1, CFG["jungle_z0"], 40)
follow(jungle, 0.6)

GR_H, GR_TOP = CFG["ground_h"], CFG["ground_top"]       # walkable line as a fraction from the top
x0, x1 = span(0.0)
ground = tiled("L4_Ground", os.path.join(A, "ground_tile.png"), GR_H, x0 - 2, x1 + 2, -GR_H * (1 - GR_TOP), 8)

# foreground plants: big, dark, close to the camera, moving faster than the ground
FG = ["fg_bush", "fg_fern", "fg_hibiscus", "fg_boulder", "fg_curl"]
fg_root = empty("L5_Foreground", (0, -10, 0))
follow(fg_root, -0.45)
x0, x1 = span(-0.45, pad=12)
x, i = x0, 0
heights = [2.6, 3.0, 2.3, 2.1, 2.4]
while x < x1:
    name = FG[i % len(FG)]
    s = sprite(f"FG_{i:02d}_{name}", os.path.join(A, name + ".png"), height=heights[i % 5] * (1.0 + 0.12 * ((i * 7) % 3)),
               loc=(x, 0, -3.0), parent=fg_root)
    x += 5.5 + 2.5 * ((i * 5) % 3) / 2
    i += 1

# ----------------------------------------------------------------- level set pieces (k = 0, world space)
island = sprite("Island", os.path.join(A, "island.png"), width=ISLAND_W, loc=(ISLAND_X, 1.0, 0), anchor="bottom")
iw, ih = island.data.materials[0].node_tree.nodes["Image Texture"].image.size
isl_h = ISLAND_W * ih / iw
island.location.z = ISLAND_TOP - isl_h * (1 - CFG["island_top_px"] / ih)
# gentle bob
for f, dz in ((1, 0), (48, 0.05), (96, 0), (144, 0.05), (174, 0.02)):
    island.delta_location = (0, 0, dz)
    island.keyframe_insert("delta_location", index=2, frame=f)

PALM_X = 16.0
PALM_H = CFG["palm_h"]
pb = SHAPES["palm"]
palm_gap = PALM_H * (pb["h"] - 1 - pb["bbox"][3]) / pb["h"]       # empty space under the trunk in the image
palm = sprite("Palm", os.path.join(A, "palm.png"), height=PALM_H, loc=(PALM_X, 9.0, -0.35 - palm_gap))
# y = 9: just behind the ground strip, so the grass lip overlaps the base of the trunk

PED_X = 22.4
ped_w = 3.0
ped = sprite("Pedestal", os.path.join(A, "pedestal.png"), width=ped_w, loc=(PED_X, 0.6, -0.12))
pw, ph_ = ped.data.materials[0].node_tree.nodes["Image Texture"].image.size
ped_top = -0.12 + ped_w * ph_ / pw * (1 - CFG["pedestal_top_px"] / ph_)

# coins above the island
coins = []
coin_img = image(os.path.join(A, "coin.png"))
coin_mat = sprite_material("Coin", coin_img)
for j, cxp in enumerate((ISLAND_X - 1.1, ISLAND_X, ISLAND_X + 1.1)):
    c = sprite(f"Coin_{j}", None, height=0.62, loc=(cxp, 0.5, ISLAND_TOP + 0.95), anchor="center", img=coin_img, mat=coin_mat)
    coins.append(c)

# ----------------------------------------------------------------- hero
hero = empty("Hero", (hero_x(1), 0, 0))
RUN_N = CFG["run_n"]
run_img = image(os.path.join(A, "hero_run", "run_001.png"), sequence=True)
MPP = CFG["hero_h"] / CFG["run_fig_px"]   # meters per pixel in the run frames
_probe = bpy.data.images.load(os.path.join(A, "hero_run", "run_001.png"))     # a sequence reports 0x0 until played
run_w, run_h = _probe.size[0] * MPP, _probe.size[1] * MPP
bpy.data.images.remove(_probe)
pad = CFG["run_pad_px"] * MPP
run_plane = bpy.data.objects.new("Hero_Run", quads_mesh("Hero_Run", [(-run_w / 2, -pad, run_w / 2, run_h - pad)]))
run_plane.data.materials.append(sprite_material("Hero_Run", run_img, seq_len=RUN_N))
sc.collection.objects.link(run_plane)
run_plane.parent = hero
jump_img = image(os.path.join(A, "hero_jump.png"))
# the jump still keeps its reframed canvas while the clip comes back at the video model's own resolution, so the
# two scales differ by the canvas ratio (768 / 960 in the reference shot)
jump_w_px, jump_h_px = jump_img.size
JMPP = MPP * CFG["run_canvas_px"] / jump_h_px
jw, jh = jump_w_px * JMPP, jump_h_px * JMPP
jb = CFG["jump_base_px"]
jump_plane = bpy.data.objects.new("Hero_Jump", quads_mesh("Hero_Jump", [(-jw / 2, -(jump_h_px - jb) * JMPP, jw / 2, jh - (jump_h_px - jb) * JMPP)]))
jump_plane.data.materials.append(sprite_material("Hero_Jump", jump_img))
sc.collection.objects.link(jump_plane)
jump_plane.parent = hero

# hero shadow (a soft dark ellipse drawn as an image made here)
sh_path = os.path.join(A, "blob_shadow.png")
if not os.path.exists(sh_path):
    S = 128
    simg = bpy.data.images.new("blob", S, S // 4, alpha=True)
    px = []
    for yy in range(S // 4):
        for xx in range(S):
            d = math.hypot((xx - S / 2) / (S / 2), (yy - S / 8) / (S / 8))
            a = max(0.0, 1 - d) ** 1.5 * 0.55
            px += [0.12, 0.08, 0.05, a]
    simg.pixels = px
    simg.filepath_raw = sh_path
    simg.file_format = "PNG"
    simg.save()
shadow = sprite("Hero_Shadow", sh_path, width=1.5, loc=(0, 0.9, 0), anchor="center")

# per-frame hero animation: position, run/jump swap, squash and stretch, shadow
prev_air = False
for f in range(1, END + 1):
    x, z = hero_x(f), hero_z(f)
    hero.location = (x, 0, z)
    hero.keyframe_insert("location", frame=f)
    air = airborne(f)
    run_plane.hide_render = run_plane.hide_viewport = air
    jump_plane.hide_render = jump_plane.hide_viewport = not air
    for ob in (run_plane, jump_plane):
        ob.keyframe_insert("hide_render", frame=f)
        ob.keyframe_insert("hide_viewport", frame=f)
    # squash on landing / take-off, stretch while rising
    sx = sz = 1.0
    for f0, f1, *_ in JUMPS:
        if f0 - 2 <= f < f0:
            sx, sz = 1.12, 0.88                     # anticipation
        elif f0 <= f < f0 + 4:
            sx, sz = 0.9, 1.12                      # launch stretch
        elif f1 <= f < f1 + 3:
            sx, sz = 1.18, 0.84                     # landing squash
    hero.scale = (sx, 1, sz)
    hero.keyframe_insert("scale", frame=f)
    support = ISLAND_TOP if (ISLAND_X - ISLAND_W / 2 + 0.2 < x < ISLAND_X + ISLAND_W / 2 - 0.2 and z >= ISLAND_TOP - 0.05) else 0.0
    h = max(0.0, z - support)
    shadow.location = (x + 0.05, 0.9 if support == 0 else 0.45, support + 0.02)
    s = max(0.35, 1 - 0.25 * h)
    shadow.scale = (s, 1, s)
    shadow.keyframe_insert("location", frame=f)
    shadow.keyframe_insert("scale", frame=f)

# coins: spin while waiting; when collected each one flips and flies forward and upward from where it
# was (growing as it comes towards the camera), on its own path, and leaves through the top of the screen
COIN_FLY = 20
for j, c in enumerate(coins):
    home = (c.location.x, ISLAND_TOP + 0.95)
    got = next(f for f in range(1, END + 1) if hero_x(f) >= c.location.x - 0.25)
    drift = (-0.9, 0.2, 1.3)[j]                                  # each coin fans out a little differently
    for f in range(1, END + 1):
        if f < got:
            c.location = (home[0], 0.5, home[1] + 0.06 * math.sin(f * 0.2 + home[0]))
            c.scale = (abs(math.cos(f * 0.18 + home[0])) * 0.9 + 0.1, 1, 1)
        else:
            t = (f - got) / COIN_FLY
            if t >= 1:
                c.scale = (0, 1, 0)
                c.location = (home[0], -30, home[1])
            else:
                cxf, czf = CAM[f]
                sx0 = home[0] - CAM[got][0]                          # screen position when collected
                sz0 = home[1] - CAM[got][1]
                rise = (4.5 + 2.5 - sz0) * t ** 1.6                  # accelerates up and out past the top edge
                sx_ = sx0 + drift * math.sin(t * math.pi / 2)
                size = 1 + 3.2 * t ** 0.8                            # comes towards the camera: grows
                flip = math.cos(t * math.pi * 5)                     # fast flips
                c.location = (cxf + sx_, -30 + 0.01 * j, czf + sz0 + 0.35 * math.sin(t * math.pi) + rise)
                c.scale = (size * max(0.08, abs(flip)), 1, size)
        c.keyframe_insert("scale", frame=f)
        c.keyframe_insert("location", frame=f)

# ----------------------------------------------------------------- physics (2D: locked to the XZ plane)
bpy.ops.rigidbody.world_add()
rbw = sc.rigidbody_world
rbw.point_cache.frame_start, rbw.point_cache.frame_end = 1, END
rbw.substeps_per_frame, rbw.solver_iterations = 20, 30
rbw.collection = bpy.data.collections.new("RigidBodies")
sc.collection.children.link(rbw.collection)


def collider(name, size, loc, kind="PASSIVE", shape="BOX", mass=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.rigidbody.object_add(type=kind)
    rb = ob.rigid_body
    rb.collision_shape = shape
    rb.mass = mass
    rb.friction, rb.restitution = 0.6, 0.1
    rb.collision_margin = 0.005
    ob.hide_render = True
    ob.display_type = "WIRE"
    return ob


def lane_walls(y, half=0.36, x0=-20, x1=80):
    """Two invisible frictionless walls that keep a lane of bodies in the picture plane."""
    for side in (-1, 1):
        w = collider(f"LaneWall_{y:+.1f}_{side:+d}", (x1 - x0, 0.05, 30), ((x0 + x1) / 2, y + side * half, 10))
        w.rigid_body.friction = 0.0
        w.rigid_body.restitution = 0.0


def hull_body(name, height, y, depth, density=1.0, restitution=0.1, friction=0.6):
    """A rigid body whose collision shape is the sprite's own silhouette (convex hull),
    extruded through the picture plane, with its origin (= center of mass) at the hull centroid.
    Returns (body, sprite, visible width, visible height, bottom offset from origin)."""
    img = image(os.path.join(A, name + ".png"))
    W, H = img.size
    w = height * W / H
    hull = [((u - 0.5) * w, v * height) for u, v in SHAPES[name]["hull"]]
    # polygon area centroid
    A2 = cx_ = cz_ = 0.0
    for (x0, z0), (x1, z1) in zip(hull, hull[1:] + hull[:1]):
        cr = x0 * z1 - x1 * z0
        A2 += cr
        cx_ += (x0 + x1) * cr
        cz_ += (z0 + z1) * cr
    area = abs(A2) / 2
    cx_, cz_ = cx_ / (3 * A2), cz_ / (3 * A2)
    verts = []
    for yy in (-depth / 2, depth / 2):
        verts += [(x - cx_, yy, z - cz_) for x, z in hull]
    me = bpy.data.meshes.new(f"Col_{name}")
    n = len(hull)
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(f"Col_{name}", me)
    sc.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in sc.objects:
        o.select_set(o == ob)
    bpy.ops.rigidbody.object_add(type="ACTIVE")
    rb = ob.rigid_body
    rb.collision_shape = "CONVEX_HULL"
    rb.mass = area * density
    rb.friction, rb.restitution = friction, restitution
    rb.collision_margin = 0.004
    rb.linear_damping, rb.angular_damping = 0.04, 0.12          # close to real air drag
    ob.hide_render = True
    ob.display_type = "WIRE"
    spr = sprite(f"Spr_{name}", None, height=height, img=img, anchor="bottom")
    spr.parent = ob
    spr.location = (-cx_ + 0.0, -depth / 2 - 0.01, -cz_)
    zmin = min(z for _, z in hull)
    zmax = max(z for _, z in hull)
    xmin = min(x for x, _ in hull)
    xmax = max(x for x, _ in hull)
    ob["bottom"] = zmin - cz_
    ob["radius"] = max(math.hypot(x - cx_, z - cz_) for x, z in hull)
    return ob, (xmin - cx_, xmax - cx_, zmin - cz_, zmax - cz_)


ground_col = collider("Ground_Collider", (200, 30, 2), (30, 0, -1.0))
ground_col.rigid_body.friction = 0.8
ground_col.rigid_body.restitution = 0.6
lane_walls(0.3)
lane_walls(3.6, half=0.3)
ped_col = collider("Pedestal_Collider", (ped_w * 0.9, 2.0, ped_top + 0.12), (PED_X, 0.3, (ped_top - 0.12) / 2))
ped_col.rigid_body.friction = 0.8

# tower: clay pots + gold idol stacked on the pedestal, asleep until something touches them
pieces = []


def place(name, height, x_center, z_bottom, density=1.0, restitution=0.1):
    ob, (x0, x1, z0, z1) = hull_body(name, height, 0.3, 0.56, density, restitution)
    ob.location = (x_center, 0.3, z_bottom - z0 + 0.003)
    ob.rigid_body.use_deactivation = True
    ob.rigid_body.use_start_deactivated = True
    pieces.append(ob)
    return z_bottom + (z1 - z0)


# a stable stack: everything rests on a flat surface
top_jar = place("jar", 1.0, PED_X - 0.62, ped_top, density=1.0)                       # flat base, flat lid
place("pot_round", 1.02, PED_X + 0.66, ped_top, density=1.0, restitution=0.12)
place("idol", 1.05, PED_X - 0.62, top_jar, density=2.6)                               # solid gold, on the lid
place("amphora", 1.35, PED_X + 4.6, 0.0, density=0.9)                                 # on the grass, past the landing

# coconuts: held in the crown (kinematic) until the hero runs under the palm, then they drop
nuts = []
drop_f = next(f for f in range(1, END + 1) if hero_x(f) >= PALM_X - 3.2)
for j, (dx, dz) in enumerate(CFG["nuts"]):
    ob, _ = hull_body("coconut", CFG["nut_size"], 3.6, 0.5, density=1.4, restitution=0.75, friction=0.7)
    ob.name = f"Col_coconut{j}"
    ob.location = (PALM_X + dx, 3.6, dz)
    ob.rigid_body.angular_damping = 0.35                        # husk: rolls, but not forever
    ob.rigid_body.kinematic = True
    ob.keyframe_insert("rigid_body.kinematic", frame=1)
    ob.keyframe_insert("rigid_body.kinematic", frame=drop_f + j * 5)
    ob.rigid_body.kinematic = False
    ob.keyframe_insert("rigid_body.kinematic", frame=drop_f + j * 5 + 1)
    nuts.append(ob)

# the hero's body: a kinematic sphere that follows the hero. It lives outside the props lane (y = 5)
# and slides in sideways before the tower jump; it slides out only once nothing is within reach
# (EXIT_F comes from a first probe run), so it never pinches a piece against a lane wall.
# contact frame: first frame where the hero's body reaches a piece (pieces are static until hit)
def body_pos(f):
    return Vector((hero_x(f) + 0.2, 0.3, hero_z(f) + 0.78))


HIT_F = next(f for f in range(JUMPS[2][0], JUMPS[2][1])
             if min((p.location - body_pos(f)).length - p["radius"] - 0.62 for p in pieces[:3]) < 0.0)
KICK = {0: 0.0, 1: 0.04, 2: 0.06, 3: 0.04, 4: 0.0}        # a slight push forward on contact, then back
EXIT_F = HIT_F + 5
T0 = JUMPS[2][0] - 2
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, location=(0, 5, 0))
hb = bpy.context.active_object
hb.name = "Hero_Collider"
bpy.ops.rigidbody.object_add(type="ACTIVE")
hb.rigid_body.kinematic = True
hb.rigid_body.collision_shape = "SPHERE"
hb.rigid_body.friction = 0.4
hb.rigid_body.restitution = 0.5
hb.hide_render = True
hb.display_type = "WIRE"
for f in range(1, END + 1):
    # outside the props lane (y = 5) except from just before the jump until right after the strike
    if f < T0 - 6 or f > EXIT_F + 6:
        y = 5.0
    elif f < T0:
        y = 5.0 + (0.3 - 5.0) * smooth((f - (T0 - 6)) / 6)
    elif f <= EXIT_F:
        y = 0.3
    else:
        y = 0.3 + (5.0 - 0.3) * smooth((f - EXIT_F) / 6)
    pos = body_pos(f)
    hb.location = (pos.x + KICK.get(f - HIT_F, 0.0), y, pos.z)
    hb.keyframe_insert("location", frame=f)

# ----------------------------------------------------------------- simulate in order, save, review, final
clear = []
for f in range(1, END + 1):
    sc.frame_set(f)
    if f > JUMPS[2][0]:
        hp = Vector((hero_x(f) + 0.2, 0.3, hero_z(f) + 0.78))
        gap = min((p.matrix_world.translation - hp).length - p["radius"] - 0.62 for p in pieces)
        clear.append((f, gap))
ok = [f for f, g in clear if f >= JUMPS[2][1] - 6 and all(g2 > 0.35 for f2, g2 in clear if f <= f2 <= f + 8)]
print("HIT", HIT_F, "EXIT", EXIT_F, "PROBE first clear exit frame", ok[0] if ok else None, "min gaps", [(f, round(g, 2)) for f, g in clear[::4]])
# bake the simulation into the file, so any frame can be opened or rendered directly (not only in order)
with bpy.context.temp_override(scene=sc):
    bpy.ops.ptcache.bake_all(bake=True)
sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("EVENTS coins at", [next(f for f in range(1, END + 1) if hero_x(f) >= c.location.x - 0.25) for c in coins],
      "coconut drop", drop_f, "tower jump", JUMPS[2][:2])
for p in pieces + nuts:
    sc.frame_set(END)
    print("FINAL", p.name, tuple(round(v, 2) for v in p.matrix_world.translation))

rv = os.path.join(ROOT, "review" + CFG["tag"])
os.makedirs(rv, exist_ok=True)
if "--review" in ARGS:
    r.resolution_percentage = 40
    for f in (1, 55, 70, 90, 110, 122, 128, 134, 140, 150, 172):
        sc.frame_set(f)
        r.filepath = os.path.join(rv, f"f{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    r.resolution_percentage = 100
if "--final" in ARGS:
    r.image_settings.media_type = "VIDEO"
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format, r.ffmpeg.codec, r.ffmpeg.constant_rate_factor = "MPEG4", "H264", "HIGH"
    r.filepath = out_film
    bpy.ops.render.render(animation=True)
print("RESULT ok", out_blend)
