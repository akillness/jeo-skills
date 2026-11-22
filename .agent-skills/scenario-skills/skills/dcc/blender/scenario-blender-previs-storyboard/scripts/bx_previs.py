"""
bx_previs: story previs helpers for Blender 5.2 (script -> beats -> shots -> animatic).

The method is Hjalti Hjalmarsson's (Blender Studio, Charge / Sprite Fright): a numbered
list of beats of information, beats grouped into shots, one camera per shot bound to a
marker at the first frame of a 10-frame block, stepped (constant) blocking keys, one
still per shot, timing found in a separate edit. Everything here is headless-safe
(Workbench renders, data-level VSE), tested on 5.2.1 by
tests/code/blender-previs-storyboard/test_01_s6_end_to_end.py, test_02_api_traps.py,
test_03_procedures.py and test_04_grading_gates.py (passepartout, fog, coverage runs,
cost gates, Rigify proxies).

  import sys
  sys.path += ["<skills>/scenario-blender-previs-storyboard/scripts", "<skills>/scenario-blender-expert/scripts"]
  import bx_previs as P
  sc = P.setup_scene("01_blend cinematic")                    # format first, Workbench, greys
  keeper = P.mannequin(sc, "keeper", 1.75, (2.8, 1, 0), facing=90, color=P.BLUE_GREY)
  robot = P.mannequin(sc, "robot", 0.55, (-3, 2.4, 0), color=P.POP, kind="robot")
  table = P.shot_list(BEATS, SHOTS, start=10)                 # validates beats, assigns frames
  for t in table:                                              # block: pose, then key everything
      sc.frame_set(t["frame"]); POSES[t["id"]](); P.key_block(P.movables(keeper, robot), t["frame"])
  P.make_stepped(P.movables(keeper, robot))                    # prefs do not apply to Python keys
  P.build_shots(sc, table, {"keeper": keeper, "robot": robot}) # cameras + markers bound
  rep = P.audit(sc, table, chars, line=("robot", "keeper"), travel={"robot": "right"})
  sheet = P.contact_sheet(sc, table, out_dir)                  # look at it
  stills = P.render_stills(sc, table, out_dir + "/stills")
  P.animatic(sc, table, stills, out_dir + "/animatic_v001.mp4", edit_name="01_edit cinematic")
  P.fog_for_shot(sc, table[0], chars)                          # depth fog behind the subjects, one shot
  P.retime_cut(bpy.data.scenes["01_edit cinematic"], "sh030", 88, src=sc, table=table)  # cover runs

Shot spec keys (dicts in SHOTS): id, beats (1-based, consecutive over the list), subjects
(names in `chars`), size (see SIZES), lens (mm, 36 mm horizontal sensor), height ("eye",
"eye:<name>" or metres), azimuth (deg; 0 = camera on -Y looking +Y, 90 = on +X looking -X),
aim (name or xyz), loc (xyz, overrides placement), cam (shared camera name), fit ("all" =
frame the extremes over every shot sharing the camera), dur (edit seconds), block (previs
frames, default 10), live (True = animated shot, cut in as a scene strip), cover (True =
another angle on the previous live shot's continuous action: it starts where that block
ends, and the animatic cuts the run as soft-split pieces of ONE scene strip, retimed with
retime_cut; Story Tools, Pablo Fournier), push (end scale of a fake dolly-in on the still,
Charge), intent (why the camera is where it is), cross/pov (allowed exceptions to the
action-line check).

Rigify proxies: Rigify is off under --factory-startup; ensure_rigify() first, or build them
with rigify_proxy() (layout bone collection keyed by key_block, posed with pose(bones=...)).
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import json
import math
import os

import bmesh
import bpy
from bpy_extras import anim_utils
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

SENSOR_W = 36.0
# Visible frame height as a multiple of the subject's height. [added: standard framing
# grammar, calibrated on the S6 contact sheet; the source talks give no numbers]
SIZES = {"ews": 4.0, "wide": 2.0, "full": 1.15, "mws": 0.8, "medium": 0.6,
         "mcu": 0.4, "cu": 0.25, "ecu": 0.12}
EYE_TOL = 0.15          # metres: camera within this of an eye line counts as eye height [added]
EDGE_ON_DEG = 70.0      # 2D drawing facing more than this away from camera reads flat [added]

GREY_DARK, GREY, GREY_LIGHT = (0.3, 0.3, 0.3, 1), (0.5, 0.5, 0.5, 1), (0.72, 0.72, 0.72, 1)
BLUE_GREY = (0.32, 0.4, 0.55, 1)
POP = (0.85, 0.1, 0.08, 1)          # Renato Roldan: red as the one popping colour
INK = (0.04, 0.04, 0.04, 1)


# ----------------------------------------------------------------------------- scene
def activate(sc):
    """Make `sc` the window scene. Needed before frame_set-based measuring: frame_set on a
    scene that is not the window scene does not write animated values back to the
    original objects (verified 5.2.1: location and matrix_world stay stale)."""
    win = bpy.context.window
    if win is not None and win.scene != sc:
        win.scene = sc
    return sc


def coll(sc, name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in sc.collection.children:
        sc.collection.children.link(c)
    return c


def setup_scene(name, res=(1920, 1080), fps=24, pct=50, background=0.09):
    """Previs scene with the format locked first (Charge): resolution, fps, Workbench,
    object colours, Standard view transform so greys render as set, AUDIO_SYNC playback
    (Hjalti: never judge timing with play-every-frame). Makes it the window scene."""
    sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    r = sc.render
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = pct
    r.fps, r.fps_base = fps, 1.0
    r.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light, sh.color_type = "STUDIO", "OBJECT"
    sh.show_object_outline = True
    sh.show_cavity = False
    sh.show_shadows = False
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.get("BX_previs_world") or bpy.data.worlds.new("BX_previs_world")
    w.color = (background,) * 3
    sc.world = w
    sc.frame_start = 1
    sc.sync_mode = "AUDIO_SYNC"
    for c in ("SET", "CA-cameras", "FX"):
        coll(sc, c)
    return activate(sc)


def store_text(name, text):
    """Keep the beats list / shot table inside the .blend (Text datablock)."""
    t = bpy.data.texts.get(name) or bpy.data.texts.new(name)
    t.clear()
    t.write(text)
    return t


# ----------------------------------------------------------------------------- primitives
def _bm_mesh(name, kind, dims, center=(0, 0, 0), segments=16):
    bm = bmesh.new()
    if kind == "box":
        bmesh.ops.create_cube(bm, size=1.0)
    elif kind == "cyl":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=0.5, radius2=0.5, depth=1.0)
    elif kind == "cone":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=0.5, radius2=0.0, depth=1.0)
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(6, segments // 2), radius=0.5)
    else:
        raise ValueError(kind)
    d, c = Vector(dims), Vector(center)
    for v in bm.verts:
        v.co = Vector((v.co.x * d.x, v.co.y * d.y, v.co.z * d.z)) + c
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def prop(sc, name, dims, loc, color=GREY_LIGHT, kind="box", collection="SET", rot_z=0.0):
    """Real-scale primitive with its origin at the bottom centre (props, set pieces).
    Stores height / eye_height so a prop can be a shot subject (eye_height = its centre)."""
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, _bm_mesh(name, kind, dims, (0, 0, dims[2] / 2)))
        coll(sc, collection).objects.link(ob)
    ob.location, ob.rotation_euler.z, ob.color = loc, math.radians(rot_z), color
    ob["height"], ob["eye_height"] = float(dims[2]), float(dims[2]) * 0.5
    return ob


def fog_planes(sc, name, loc, width, height, count=4, spacing=0.5, alpha=0.25, facing=0.0,
               color=(0.85, 0.87, 0.95)):
    """Hjalti / Charge depth fog: one vertical plane, ARRAY modifier stepping away from the
    camera, translucent object colour. Workbench renders it translucent (verified)."""
    ob = bpy.data.objects.get(name)
    if ob is None:
        me = _bm_mesh(name, "box", (width, 0.0001, height), (0, 0, height / 2))
        ob = bpy.data.objects.new(name, me)
        coll(sc, "FX").objects.link(ob)
        arr = ob.modifiers.new("depth", "ARRAY")
        arr.use_relative_offset, arr.use_constant_offset = False, True
    arr = ob.modifiers["depth"]
    arr.count = count
    arr.constant_offset_displace = (0, spacing, 0)      # local +Y = away from a front camera
    ob.location, ob.rotation_euler.z = loc, math.radians(facing)
    ob.color = (*color, alpha)
    return ob


# ----------------------------------------------------------------------------- characters
def mannequin(sc, name, height, loc, facing=0.0, color=BLUE_GREY, kind="human"):
    """Proxy character at real scale: root empty at the feet (custom props height,
    eye_height, kind) and a handful of pivoted parts that ARE the layout controls
    (CTL-<name>-chest/head/arm_L/arm_R), the previs equivalent of Hjalti's 'layout'
    selection set. Faces local -Y; `facing` is the world heading in degrees
    (0 = toward -Y / the front camera, 90 = toward +X, -90 = toward -X, 180 = +Y)."""
    root = bpy.data.objects.get(f"CH-{name}")
    if root is not None:
        pose(root, loc=loc, facing=facing)
        return root
    c = coll(sc, f"CH-{name}")
    H = float(height)
    root = bpy.data.objects.new(f"CH-{name}", None)
    root.empty_display_type, root.empty_display_size = "PLAIN_AXES", H * 0.3
    c.objects.link(root)

    def part(pname, kind_, dims, center, parent, joint, col=color, ctl=False):
        n = f"CTL-{name}-{pname}" if ctl else f"{name}-{pname}"
        ob = bpy.data.objects.new(n, _bm_mesh(n, kind_, [H * x for x in dims], [H * x for x in center]))
        c.objects.link(ob)
        ob.parent, ob.location, ob.color = parent, [H * x for x in joint], col
        return ob

    dark = (color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, 1)
    if kind == "human":
        for s, x in (("L", 0.055), ("R", -0.055)):
            part(f"leg_{s}", "box", (0.075, 0.085, 0.46), (0, 0, 0.23), root, (x, 0, 0))
        chest = part("chest", "box", (0.24, 0.13, 0.34), (0, 0, 0.17), root, (0, 0, 0.48), ctl=True)
        head = part("head", "sphere", (0.11, 0.12, 0.13), (0, 0, 0.105), chest, (0, 0, 0.34), ctl=True)
        part("nose", "box", (0.03, 0.05, 0.03), (0, -0.06, 0), head, (0, 0, 0.1), col=dark)
        arm_len, shoulder = 0.36, (0.145, 0, 0.31)
        eye = 0.93
    elif kind == "robot":
        for s, x in (("L", 0.1), ("R", -0.1)):
            part(f"leg_{s}", "box", (0.12, 0.14, 0.25), (0, 0, 0.125), root, (x, 0, 0))
        chest = part("chest", "box", (0.42, 0.3, 0.33), (0, 0, 0.165), root, (0, 0, 0.25), ctl=True)
        head = part("head", "box", (0.5, 0.36, 0.3), (0, 0, 0.17), chest, (0, 0, 0.33), ctl=True)
        for s, x in (("L", 0.11), ("R", -0.11)):
            part(f"eye_{s}", "box", (0.09, 0.02, 0.07), (0, -0.185, 0), head, (x, 0, 0.19), col=INK)
        part("antenna", "cyl", (0.02, 0.02, 0.1), (0, 0, 0.05), head, (0, 0, 0.32), col=dark)
        arm_len, shoulder = 0.3, (0.24, 0, 0.27)
        eye = 0.77
    else:
        raise ValueError(kind)
    for s, sx in (("L", 1), ("R", -1)):
        a = part(f"arm_{s}", "box", (0.06, 0.065, arm_len), (0, 0, -arm_len / 2), chest,
                 (sx * shoulder[0], shoulder[1], shoulder[2]), ctl=True)
        a["length"] = arm_len * H
    root["height"], root["eye_height"], root["kind"] = H, eye * H, kind
    pose(root, loc=loc, facing=facing)
    return root


def controls(root):
    """{'chest': obj, 'head': obj, 'arm_L': obj, 'arm_R': obj} (recursive CTL- children)."""
    prefix = f"CTL-{root.name[3:]}-"
    out, stack = {}, list(root.children)
    while stack:
        o = stack.pop()
        if o.name.startswith(prefix):
            out[o.name[len(prefix):]] = o
        stack.extend(o.children)
    return out


def movables(*items):
    """Everything blocking keys must cover: roots + their controls, plus plain objects."""
    out = []
    for it in items:
        out.append(it)
        if it.name.startswith("CH-"):
            out.extend(controls(it).values())
    return out


def pose(root, loc=None, facing=None, scale=None, bones=None, **parts):
    """Set a pose: root location / heading / scale (cheats), and part rotations in degrees,
    e.g. pose(robot, loc=(1, 0.5, 0), facing=90, arm_R=(-150, 0, 0), head=(20, 0, 0)).
    Rigify proxy: bones={"chest": (10, 0, 0), "hand_ik.R": {"loc": (0, -0.2, 0.3)}}
    (rotation in degrees, or a dict with rot and/or loc; quaternion bones are converted)."""
    from mathutils import Euler
    for bname, v in (bones or {}).items():
        pb = root.pose.bones[bname]
        rot, bl = (v.get("rot"), v.get("loc")) if isinstance(v, dict) else (v, None)
        if rot is not None:
            e = Euler([math.radians(a) for a in rot])
            if pb.rotation_mode == "QUATERNION":
                pb.rotation_quaternion = e.to_quaternion()
            elif pb.rotation_mode == "AXIS_ANGLE":
                q = e.to_quaternion()
                pb.rotation_axis_angle = (q.angle, *q.axis)
            else:
                pb.rotation_euler = e
        if bl is not None:
            pb.location = bl
    if loc is not None:
        root.location = loc
    if facing is not None:
        root.rotation_euler.z = math.radians(facing)
    if scale is not None:
        root.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
    ctl = controls(root) if parts else {}
    for k, rot in parts.items():
        ctl[k].rotation_euler = [math.radians(a) for a in rot]
    return root


def eye_z(obj):
    """World height of a character's (or prop's) eye line, including cheats on z/scale."""
    return obj.matrix_world.translation.z + obj["eye_height"] * obj.matrix_world.to_scale().z


def hand_point(root, side="R"):
    """World position of a mannequin's hand (end of the arm part), after a view-layer update."""
    bpy.context.view_layer.update()
    arm = controls(root)[f"arm_{side}"]
    return arm.matrix_world @ Vector((0, 0, -arm["length"]))


# ----------------------------------------------------------------------------- keys
def fcurves(id_):
    """F-curves of an ID (object, camera data, scene) through the 5.x channelbag."""
    ad = getattr(id_, "animation_data", None)
    if not ad or not ad.action or ad.action_slot is None:
        return []
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    return list(cb.fcurves) if cb else []


def layout_bones(rig):
    """Pose bones of the armature's 'layout' bone collection (Hjalti's layout selection set;
    the Selection Sets add-on is not bundled in 5.2.1)."""
    col = rig.data.collections_all.get("layout") if rig.type == "ARMATURE" else None
    return [rig.pose.bones[b.name] for b in col.bones] if col else []


def key_block(objs, frame, paths=("location", "rotation_euler", "scale")):
    """Key every listed object on every channel at `frame`, plus the 'layout' bones of any
    armature (location and rotation in the bone's own rotation mode). Key everything you
    touch before cheating it for a shot (Charge): unkeyed cheats leak into earlier shots."""
    for o in objs:
        for p in paths:
            o.keyframe_insert(p, frame=frame)
        for pb in layout_bones(o):
            pb.keyframe_insert("location", frame=frame)
            rp = {"QUATERNION": "rotation_quaternion", "AXIS_ANGLE": "rotation_axis_angle"}.get(pb.rotation_mode, "rotation_euler")
            pb.keyframe_insert(rp, frame=frame)


def make_stepped(ids, interpolation="CONSTANT"):
    """Force interpolation on every key. The preference keyframe_new_interpolation_type
    is ignored by keyframe_insert() from Python (verified 5.2.1), so always call this."""
    n = 0
    for i in ids:
        for fc in fcurves(i):
            for k in fc.keyframe_points:
                if k.interpolation != interpolation:
                    k.interpolation = interpolation
                    n += 1
    return n


def stepped_report(ids):
    """{name: number of non-CONSTANT keys} for the ids that have any."""
    out = {}
    for i in ids:
        bad = sum(1 for fc in fcurves(i) for k in fc.keyframe_points if k.interpolation != "CONSTANT")
        if bad:
            out[i.name] = bad
    return out


def key_lens(cam, keys, interpolation="LINEAR"):
    """Animate focal length: keys = [(frame, mm), ...]. Dillon Gu: a quick zoom in reads as
    someone fixing on a target; linear for zoom slides and dolly zooms."""
    for f, mm in keys:
        cam.data.lens = mm
        cam.data.keyframe_insert("lens", frame=f)
    for fc in fcurves(cam.data):
        if fc.data_path == "lens":
            for k in fc.keyframe_points:
                k.interpolation = interpolation
    return cam


def handheld(cam, strength=0.012, scale=22.0, frame=None):
    """Operator feel: NOISE F-modifiers on the camera's X/Z rotation (one key is enough).
    Default blend REPLACE centres the noise on the curve; ADD offsets it by strength/2
    (both measured on 5.2.1). Starting values from render-to-real guide
    playblasts (0.010 to 0.018 rad at an 18 to 26 frame scale). animation_data_clear() removes them."""
    f = bpy.context.scene.frame_current if frame is None else frame
    if not any(fc.data_path == "rotation_euler" for fc in fcurves(cam)):
        cam.keyframe_insert("rotation_euler", frame=f)
    mods = []
    for fc in fcurves(cam):
        if fc.data_path == "rotation_euler" and fc.array_index in (0, 2):
            m = fc.modifiers.new("NOISE")
            m.strength, m.scale, m.phase = strength, scale, 1.0 + 7.3 * fc.array_index
            mods.append(m)
    return mods


# ----------------------------------------------------------------------------- shot list
def shot_list(beats, shots, start=10, block=10):
    """Validate the beat grouping and assign previs frames. Every beat (1-based) must appear
    exactly once, in order (Hjalti: a missing beat means the idea never gets a fair test).
    Shots start on round frames, 10 apart (Charge: 10 frames per shot, the winner on the
    first frame of the decade); a longer block (live shot) pushes the next start to the
    following decade. A `cover` shot starts where the previous live block ends (continuous
    action seen from another camera). Returns a new list of dicts with frame, block and
    beat_text."""
    used = [b for s in shots for b in s["beats"]]
    n = len(beats)
    missing = sorted(set(range(1, n + 1)) - set(used))
    dups = sorted({b for b in used if used.count(b) > 1})
    extra = sorted(b for b in set(used) if not 1 <= b <= n)
    if missing or dups or extra or used != sorted(used):
        raise ValueError(f"beats: missing {missing}, duplicated {dups}, unknown {extra}, "
                         f"in order {used == sorted(used)}")
    f, table = start, []
    for s in shots:
        t = dict(s)
        if s.get("cover"):                  # another angle on the previous live action
            if not table or not table[-1].get("live"):
                raise ValueError(f"{s['id']}: cover=True continues the previous LIVE shot's action")
            f = table[-1]["frame"] + table[-1]["block"]
            t["live"] = True
        t["frame"], t["block"] = f, int(s.get("block", block))
        t["beat_text"] = [beats[b - 1] for b in s["beats"]]
        table.append(t)
        f = int(math.ceil((f + t["block"]) / 10.0) * 10)
    return table


def shot_list_markdown(beats, table, title="Shot list"):
    """Deliverable table: shot, previs frame, edit in-out, seconds, beats, size (planned /
    measured by audit), lens and camera height (measured by audit when run), intent."""
    lines = [f"# {title}", "", "Beats of information (one fact per line):", ""]
    lines += [f"{i}. {b}" for i, b in enumerate(beats, 1)]
    lines += ["", "| shot | previs frame | edit in-out | s | beats | size planned/measured | lens | camera height | intent |",
              "|---|---|---|---|---|---|---|---|---|"]
    for t in table:
        edit = f"{t['edit_in']}-{t['edit_out']}" if "edit_in" in t else ""
        size = "/".join(x for x in (t.get("size", "-"), t.get("size_measured", "")) if x)
        lines.append(f"| {t['id']} | {t['frame']} | {edit} | {t.get('dur', '')} | "
                     f"{','.join(map(str, t['beats']))} | {size} | {t.get('lens_measured', t.get('lens', ''))} | "
                     f"{t.get('height_measured', t.get('height', 'eye'))} | {t.get('intent', '')} |")
    return "\n".join(lines) + "\n"


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def _sensor_h(sc):
    return SENSOR_W * sc.render.resolution_y / sc.render.resolution_x


def _subject_samples(sc, chars, names, frames):
    out = []
    for f in frames:
        sc.frame_set(f)
        for n in names:
            o = chars[n]
            s = o.matrix_world.to_scale().z
            out.append((o.matrix_world.translation.copy(), o["height"] * s, eye_z(o)))
    return out


def _height(h, samples, chars):
    if isinstance(h, (int, float)):
        return float(h)
    if h == "eye":
        return sum(e for _, _, e in samples) / len(samples)
    if h.startswith("eye:"):
        return eye_z(chars[h[4:]])
    raise ValueError(h)


def place_camera(sc, cam, spec, chars, frames=None):
    """Put a shot camera where the spec says. Default (Hjalti): camera at the mean eye
    height of the subjects, level-ish, distance from shot size and lens:
    visible height v = SIZES[size] * subject height (widened to fit the subjects' spread),
    distance = v * lens / sensor_height. Frames: those whose subject positions must fit
    (the shot's own frame, or every frame of a shared locked-off camera)."""
    activate(sc)
    fr = spec["frame"]
    frames = frames or [fr]
    names = spec.get("subjects", [])
    cam.data.lens = spec.get("lens", 35)
    samples = _subject_samples(sc, chars, names, frames) if names else []
    sc.frame_set(fr)
    now = _subject_samples(sc, chars, names, [fr]) if names else []
    aim = spec.get("aim")
    if "loc" in spec:
        cam.location = spec["loc"]
        if isinstance(aim, str):
            o = chars[aim]
            target = Vector((*o.matrix_world.translation.xy, eye_z(o)))
        else:
            target = Vector(aim)
    else:
        az = math.radians(spec.get("azimuth", 0.0))
        back = Vector((math.sin(az), -math.cos(az), 0.0))       # from subject toward camera
        right = Vector((math.cos(az), math.sin(az), 0.0))
        H = max(h for _, h, _ in samples)
        base_z = min(p.z for p, _, _ in samples)
        along = [p.dot(right) for p, _, _ in samples]
        depth = [p.dot(-back) for p, _, _ in samples]
        aspect = sc.render.resolution_x / sc.render.resolution_y
        v = max(SIZES[spec.get("size", "full")] * H, (max(along) - min(along) + 0.6 * H) / aspect)
        c_xy = right * ((max(along) + min(along)) / 2) - back * (sum(depth) / len(depth))
        zc = base_z + max(0.5 * H, H - 0.4 * v)                 # 10 % headroom band [added]
        if isinstance(aim, str):
            o = chars[aim]
            target = Vector((*o.matrix_world.translation.xy, eye_z(o)))
        elif aim is not None:
            target = Vector(aim)
        else:
            target = Vector((c_xy.x, c_xy.y, zc))
        dist = v * cam.data.lens / _sensor_h(sc)
        z = _height(spec.get("height", "eye"), now or samples, chars)
        loc = Vector((target.x, target.y, 0)) + back * dist
        cam.location = (loc.x, loc.y, z)
    look_at(cam, target)
    cam["aim"] = list(target)
    return cam


def build_shots(sc, table, chars, prefix="CAM-"):
    """One camera per shot (or a shared `cam`), placed by place_camera, and a timeline
    marker per shot at its first frame with marker.camera bound (the data-level Ctrl+B).
    Cameras: 36 mm horizontal sensor, opaque passepartout (Charge), clip 0.01 to 200
    (Hjalti's rig). Extends the scene end frame and stores the table as a Text block.
    Run after blocking: placement reads the subjects' keyed positions."""
    activate(sc)
    ids = {t["id"] for t in table}
    for m in list(sc.timeline_markers):
        if m.name in ids:
            sc.timeline_markers.remove(m)
    cc = coll(sc, "CA-cameras")
    placed, cams = set(), {}
    for t in table:
        name = t.get("cam") or f"{prefix}{t['id']}"
        cam = bpy.data.objects.get(name)
        if cam is None:
            cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
            cc.objects.link(cam)
        d = cam.data
        d.sensor_fit, d.sensor_width = "HORIZONTAL", SENSOR_W
        d.passepartout_alpha, d.show_passepartout = 1.0, True
        d.show_composition_thirds = True
        d.clip_start, d.clip_end = 0.01, 200.0
        if name not in placed:
            frames = [x["frame"] for x in table if x.get("cam") == name] if t.get("fit") == "all" else None
            place_camera(sc, cam, t, chars, frames)
            placed.add(name)
        m = sc.timeline_markers.new(t["id"], frame=t["frame"])
        m.camera = cam
        t["camera"] = cam.name
        cams[t["id"]] = cam
    end = max(t["frame"] + t["block"] - 1 for t in table)
    sc.frame_end = max(end, sc.frame_end if sc.get("bx_previs_built") else 0)
    sc["bx_previs_built"] = True
    store_text(f"PREVIS {table[0]['id']}-{table[-1]['id']}.json",
               json.dumps([{k: v for k, v in t.items()} for t in table], indent=1, default=str))
    return cams


# ----------------------------------------------------------------------------- review renders
def _versioned(out_dir, label, ext=".png"):
    v = 1
    while os.path.exists(os.path.join(out_dir, f"{label}_v{v:03d}{ext}")):
        v += 1
    return os.path.join(out_dir, f"{label}_v{v:03d}{ext}")


STAMP_OFF = ("use_stamp_date", "use_stamp_time", "use_stamp_render_time", "use_stamp_frame",
             "use_stamp_frame_range", "use_stamp_camera", "use_stamp_lens", "use_stamp_scene",
             "use_stamp_filename", "use_stamp_memory", "use_stamp_hostname", "use_stamp_marker",
             "use_stamp_sequencer_strip")


def _stamp(r, text, size=None):
    for a in STAMP_OFF:
        setattr(r, a, False)
    r.use_stamp, r.use_stamp_note, r.stamp_note_text = True, True, text
    r.stamp_font_size = size or max(12, int(r.resolution_y * r.resolution_percentage / 100 / 22))


def height_class(z, eyes):
    """'eye' / 'eye:<name>' / 'low' / 'high' for a camera height against subject eye lines."""
    if not eyes:
        return "n/a"
    mean = sum(eyes.values()) / len(eyes)
    if abs(z - mean) <= EYE_TOL:
        return "eye"
    for n, e in eyes.items():
        if abs(z - e) <= EYE_TOL:
            return f"eye:{n}"
    return "low" if z < min(eyes.values()) else "high" if z > max(eyes.values()) else "between"


def render_stills(sc, table, out_dir, stamp=False, live_ends=False, chars=None):
    """One Workbench still per shot at its first frame (the markers switch the camera),
    versioned <id>_v###.png, never overwritten (Charge). live_ends adds the last frame of
    live shots. stamp burns a note (shot, lens, camera height, size, seconds, intent).
    Headless path; bpy.ops.render.opengl fails in --background."""
    activate(sc)
    os.makedirs(out_dir, exist_ok=True)
    r = sc.render
    saved = (r.filepath, r.use_stamp, r.use_stamp_note, r.stamp_note_text, r.stamp_font_size,
             r.image_settings.media_type, sc.frame_current)
    r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "PNG"
    paths = {}
    try:
        for t in table:
            frames = [t["frame"]]
            if live_ends and t.get("live"):
                frames.append(t["frame"] + t["block"] - 1)
            for i, f in enumerate(frames):
                sc.frame_set(f)
                label = t["id"] + ("_end" if i else "")
                if stamp:
                    cam = sc.camera
                    eyes = {n: eye_z(chars[n]) for n in t.get("subjects", []) if chars and n in chars}
                    hc = height_class(cam.matrix_world.translation.z, eyes)
                    _stamp(r, f"{t['id']}{' end' if i else ''} | {cam.data.lens:.0f}mm | cam {hc} "
                              f"{cam.matrix_world.translation.z:.2f}m | {t.get('size', '')} | "
                              f"{t.get('dur', '')}s | {t.get('intent', '')}")
                else:
                    r.use_stamp = False
                p = _versioned(out_dir, label)
                r.filepath = p
                bpy.ops.render.render(write_still=True, scene=sc.name)
                paths[label] = p
    finally:
        (r.filepath, r.use_stamp, r.use_stamp_note, r.stamp_note_text, r.stamp_font_size,
         media, cur) = saved
        r.image_settings.media_type = media
        sc.frame_set(cur)
    return paths


def render_frame(scene, frame, path):
    """Single still of any scene (previs or edit) at `frame`. A write_still render of a
    scene that is not the window scene used the WINDOW scene's frame, not its own
    frame_current (verified 5.2.1), so this activates the scene first and restores the
    previous window scene afterwards. Animation renders are not affected."""
    prev = bpy.context.window.scene if bpy.context.window else None
    activate(scene)
    r = scene.render
    saved = (scene.frame_current, r.filepath, r.image_settings.media_type)
    try:
        scene.frame_set(frame)
        r.image_settings.media_type, r.image_settings.file_format = "IMAGE", "PNG"
        r.filepath = path
        bpy.ops.render.render(write_still=True, scene=scene.name)
    finally:
        scene.frame_set(saved[0])
        r.filepath, r.image_settings.media_type = saved[1], saved[2]
        if prev is not None:
            activate(prev)
    return path


def _tile(paths, cols, out, gutter=6, bg=0.06):
    import numpy as np
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p, check_existing=False)
        w, h = im.size
        imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    rows = int(math.ceil(len(imgs) / cols))
    H, W = rows * h + (rows + 1) * gutter, cols * w + (cols + 1) * gutter
    sheet = np.ones((H, W, 4), dtype=np.float32)
    sheet[..., :3] = bg
    for i, a in enumerate(imgs):
        r, c = divmod(i, cols)
        y0 = H - (r + 1) * (h + gutter)           # images are stored bottom-up
        x0 = gutter + c * (w + gutter)
        sheet[y0:y0 + h, x0:x0 + w] = a[:h, :w]
    img = bpy.data.images.new("BX_previs_sheet", W, H, alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw, img.file_format = out, "PNG"
    img.save()
    bpy.data.images.remove(img)
    return out


def contact_sheet(sc, table, out_dir, cols=4, name="contact_sheet", chars=None):
    """Stamped thumbnail per shot (plus the end frame of live shots) tiled into one sheet,
    versioned. The agent's equivalent of Hjalti's thumbnails and of scrubbing the edit:
    open it and check every beat is visible, one focal point per shot, cheats invisible."""
    thumbs = render_stills(sc, table, os.path.join(out_dir, "thumbs"), stamp=True,
                           live_ends=True, chars=chars)
    return _tile(list(thumbs.values()), cols, _versioned(out_dir, name))


def ab_lens(sc, t, lenses, out_dir, keep_size=True, chars=None):
    """Hjalti's lens A/B before posing further: render the shot at each focal length,
    moving the camera along its view axis so the subject keeps its size (d2 = d1*f2/f1
    [added]), side by side in one image. Non-destructive (camera restored). Not for
    shots whose lens or location is keyed (the render would re-evaluate the keys)."""
    activate(sc)
    cam = bpy.data.objects[t["camera"]]
    sc.frame_set(t["frame"])
    aim, loc0, lens0 = Vector(cam["aim"]), cam.location.copy(), cam.data.lens
    d0, back = (loc0 - aim).length, (loc0 - aim).normalized()
    os.makedirs(out_dir, exist_ok=True)
    r = sc.render
    saved = (r.filepath, r.use_stamp)
    paths = []
    try:
        for mm in lenses:
            cam.data.lens = mm
            if keep_size:
                cam.location = aim + back * d0 * mm / lens0
            _stamp(r, f"{t['id']} A/B {mm:.0f}mm  dist {d0 * (mm / lens0 if keep_size else 1):.2f}m")
            p = _versioned(out_dir, f"{t['id']}_ab_{mm:.0f}mm")
            r.filepath = p
            bpy.ops.render.render(write_still=True, scene=sc.name)
            paths.append(p)
    finally:
        cam.location, cam.data.lens = loc0, lens0
        r.filepath, r.use_stamp = saved
    return _tile(paths, len(paths), _versioned(out_dir, f"{t['id']}_ab"))


def floor_plan(sc, table, chars, out_path, line=None, paths=(), frame=None, hide=(), res=1400,
               margin=1.0):
    """Top orthographic plan (Hjalti: floor plan with camera positions and the action line
    before the cameras; stops two people imagining 'the shot' from opposite sides).
    Draws each camera as a cone with its horizontal field of view and shot label, the
    action line between two subjects in red, and subject paths across shots in green.
    Renders in a temporary scene; the previs scene is left untouched."""
    activate(sc)
    frame = frame or table[-1]["frame"]
    tmp = bpy.data.scenes.new("BX_FloorPlan")
    for c in sc.collection.children:
        tmp.collection.children.link(c)
    for o in sc.collection.objects:
        tmp.collection.objects.link(o)
    ann = bpy.data.collections.new("BX_FloorPlan_ann")
    tmp.collection.children.link(ann)
    made = []

    def add(ob, color):
        ann.objects.link(ob)
        ob.color = color
        made.append(ob)
        return ob

    def seg(name, a, b, width, color, z):
        a, b = Vector((a.x, a.y, z)), Vector((b.x, b.y, z))
        L = max((b - a).length, 1e-4)
        ob = add(bpy.data.objects.new(name, _bm_mesh(name, "box", (L, width, 0.01))), color)
        ob.location = (a + b) / 2
        ob.rotation_euler.z = math.atan2(b.y - a.y, b.x - a.x)
        return ob

    def label(name, text, xy, z, size, color=INK):
        cu = bpy.data.curves.new(name, "FONT")
        cu.body, cu.size, cu.align_x, cu.align_y = text, size, "CENTER", "CENTER"
        ob = add(bpy.data.objects.new(name, cu), color)
        ob.location = (xy.x, xy.y, z)
        return ob

    saved_hide = [(o, o.hide_render) for o in hide]
    try:
        for o in hide:
            o.hide_render = True
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        pts = []
        for o in sc.objects:
            if o.type == "MESH" and not o.hide_render:
                eo = o.evaluated_get(dg)
                pts += [eo.matrix_world @ Vector(c) for c in eo.bound_box]
        cams = {}
        for t in table:
            cams.setdefault(t["camera"], []).append(t["id"])
        for cn in cams:
            pts.append(bpy.data.objects[cn].matrix_world.translation)
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        top = hi.z + 0.2
        span = max(hi.x - lo.x, hi.y - lo.y) + 2 * margin
        scale = span / 12.0
        spots = {}                                  # co-located cameras share one label
        for cn, ids in cams.items():
            key = tuple(round(c / 0.1) for c in bpy.data.objects[cn].matrix_world.translation.xy)
            spots.setdefault(key, []).append(cn)
        for cn, ids in cams.items():
            cam = bpy.data.objects[cn]
            p = cam.matrix_world.translation
            key = tuple(round(c / 0.1) for c in p.xy)
            fwd = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
            yaw = math.atan2(fwd.y, fwd.x)
            cone = add(bpy.data.objects.new(f"fp_{cn}", _bm_mesh("fp", "cone", (0.35 * scale, 0.35 * scale, 0.5 * scale))),
                       (1.0, 0.55, 0.05, 1))
            cone.location = (p.x, p.y, top + 0.05)
            cone.rotation_euler = (0, math.pi / 2, yaw)
            half = math.atan(SENSOR_W / (2 * cam.data.lens))
            for s in (-1, 1):
                d = Vector((math.cos(yaw + s * half), math.sin(yaw + s * half), 0)) * 1.6 * scale
                seg(f"fp_{cn}_fov{s}", p, p + d, 0.03 * scale, (1.0, 0.55, 0.05, 1), top)
            if spots[key][0] == cn:
                txt = "  ".join("/".join(cams[c]) + f" {bpy.data.objects[c].data.lens:.0f}" for c in spots[key])
                label(f"fp_{cn}_lbl", txt, p.xy - fwd.xy.normalized() * 0.55 * scale, top + 0.45 * scale, 0.28 * scale)
        if line:
            a, b = (chars[n].matrix_world.translation.copy() for n in line)
            dvec = (b - a).normalized() * 2.0
            seg("fp_line", a - dvec, b + dvec, 0.05 * scale, (0.9, 0.05, 0.05, 1), top)
        for n in paths:
            seq = []
            for t in table:
                sc.frame_set(t["frame"])
                seq.append(chars[n].matrix_world.translation.copy())
            for i in range(len(seq) - 1):
                if (seq[i + 1] - seq[i]).length > 0.05:
                    seg(f"fp_path_{n}_{i}", seq[i], seq[i + 1], 0.04 * scale, (0.1, 0.7, 0.2, 1), top + 0.02)
            sc.frame_set(frame)
        cd = bpy.data.cameras.new("BX_fp_cam")
        cd.type, cd.ortho_scale = "ORTHO", span
        cd.clip_start, cd.clip_end = 0.1, (top - lo.z) + 50
        cam = bpy.data.objects.new("BX_fp_cam", cd)
        ann.objects.link(cam)
        made.append(cam)
        cam.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, top + 20)
        tmp.camera = cam
        tmp.frame_current = frame
        r = tmp.render
        r.engine = "BLENDER_WORKBENCH"
        r.resolution_x, r.resolution_y, r.resolution_percentage = res, res, 100
        r.image_settings.media_type, r.image_settings.file_format = "IMAGE", "PNG"
        tmp.display.shading.light, tmp.display.shading.color_type = "FLAT", "OBJECT"
        tmp.view_settings.view_transform = "Standard"
        tmp.world = sc.world
        r.filepath = out_path
        bpy.ops.render.render(write_still=True, scene=tmp.name)
    finally:
        for o, h in saved_hide:
            o.hide_render = h
        for ob in made:
            data = ob.data
            bpy.data.objects.remove(ob)
            if data is not None and data.users == 0:
                for coll_ in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras):
                    if data.name in coll_ and coll_[data.name] == data:
                        coll_.remove(data)
                        break
        bpy.data.collections.remove(ann)
        bpy.data.scenes.remove(tmp)
        activate(sc)
    return out_path


# ----------------------------------------------------------------------------- edit
def animatic(sc, table, stills, out_path, edit_name=None, sounds=(), burn_in=False, res_pct=None,
             channel=1, render=True):
    """Build the edit scene (Hjalti's NN_edit beside NN_blend) and render it with
    bx_review.playblast. Stills become image strips held for round(dur * fps) frames;
    `push` keys a fake dolly-in on the still (Charge); `live` shots become scene strips of
    the previs scene through their camera, source frame t['frame'] aligned to the cut; a live
    shot followed by `cover` shots becomes ONE scene strip soft-split at the cuts, each piece
    through its camera (Story Tools coverage: the action stays continuous, retime_cut moves
    a cut without touching keys). Stills with no `dur` hold block / fps seconds.
    sounds: [(wav_path, shot_id, frame_offset), ...] on channels above the picture.
    Returns the cut list (edit in/out per shot) and writes edit_in/edit_out into table."""
    import bx_review
    fps = sc.render.fps
    ed = bpy.data.scenes.get(edit_name or sc.name.replace("_blend", "_edit")) or \
        bpy.data.scenes.new(edit_name or sc.name.replace("_blend", "_edit"))
    r = ed.render
    r.resolution_x, r.resolution_y = sc.render.resolution_x, sc.render.resolution_y
    r.resolution_percentage = res_pct or sc.render.resolution_percentage
    r.fps, r.fps_base = fps, 1.0
    ed.sync_mode = "AUDIO_SYNC"
    ed.view_settings.view_transform = "Standard"   # new scenes default to AgX, applied on top of the stills
    ed.tool_settings.use_keyframe_insert_auto = False      # Story Tools: no auto-key in Edit
    sed = ed.sequence_editor or ed.sequence_editor_create()
    for s in list(sed.strips):
        sed.strips.remove(s)
    if ed.animation_data:
        ed.animation_data_clear()
    t, cuts, i = 1, [], 0
    frames_of = lambda x: int(round(x.get("dur", x["block"] / fps) * fps))
    while i < len(table):
        sh = table[i]
        if sh.get("live"):
            run = [sh]                              # a live shot plus its cover angles
            while i + len(run) < len(table) and table[i + len(run)].get("cover"):
                run.append(table[i + len(run)])
            durs = [frames_of(x) for x in run]
            for x, d in zip(run[:-1], durs[:-1]):
                if d != x["block"]:
                    raise ValueError(f"{x['id']}: in a coverage run the edit length ({d}) must equal the previs "
                                     f"block ({x['block']}) so the action stays continuous across the cut")
            if durs[-1] > run[-1]["block"]:
                raise ValueError(f"{run[-1]['id']}: live shot needs {durs[-1]} frames, previs block has {run[-1]['block']}")
            s = sed.strips.new_scene(sh["id"], sc, channel, t)
            s.content_start = t - (sh["frame"] - sc.frame_start)
            s.left_handle, s.right_handle = t, t + sum(durs)
            pieces, cut = [s], t
            for d in durs[:-1]:                     # Story Tools: soft cuts on ONE scene strip
                cut += d
                pieces.append(pieces[-1].split(frame=cut, split_method="SOFT"))
            for p, x, d in zip(pieces, run, durs):
                p.name = x["id"]
                p.scene_camera = bpy.data.objects[x["camera"]]
                x["edit_in"], x["edit_out"] = p.left_handle, p.left_handle + d - 1
                cuts.append({"id": x["id"], "in": x["edit_in"], "out": x["edit_out"], "frames": d, "live": True,
                             "run": sh["id"] if len(run) > 1 else None})
            t += sum(durs)
            i += len(run)
            continue
        dur = frames_of(sh)
        s = sed.strips.new_image(sh["id"], stills[sh["id"]], channel, t, fit_method="FIT")
        s.right_handle = t + dur
        if sh.get("push"):
            base = s.transform.scale_x         # FIT already scaled the still: multiply it
            for f, v in ((t, base), (t + dur - 1, base * float(sh["push"]))):
                s.transform.scale_x = s.transform.scale_y = v
                s.transform.keyframe_insert("scale_x", frame=f)
                s.transform.keyframe_insert("scale_y", frame=f)
        sh["edit_in"], sh["edit_out"] = t, t + dur - 1
        cuts.append({"id": sh["id"], "in": t, "out": t + dur - 1, "frames": dur, "live": False, "run": None})
        t += dur
        i += 1
    for fc in fcurves(ed):
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    starts = {c["id"]: c["in"] for c in cuts}
    for i, (path, sid, off) in enumerate(sounds):
        sed.strips.new_sound(f"snd{i:02d}_{sid}", path, channel + 1 + i, starts[sid] + off)
    ed.frame_start, ed.frame_end = 1, t - 1
    r.ffmpeg.audio_codec = "AAC" if sounds else "NONE"
    if burn_in:
        _stamp(r, os.path.splitext(os.path.basename(out_path))[0])
        r.use_stamp_sequencer_strip = r.use_stamp_frame = True
    else:
        r.use_stamp = False
    if render:
        bx_review.playblast(out_path, scene=ed, res_pct=r.resolution_percentage, color_type="OBJECT")
    return {"mp4": out_path if render else None, "edit": ed.name, "frames": t - 1,
            "seconds": round((t - 1) / fps, 2), "cuts": cuts}


def coverage(edit, src, cams, cut_frames, channel=1, start=1):
    """Story Tools coverage (Pablo Fournier): one scene, one action, one scene strip split
    at the edit cut frames with Strip.split(SOFT); piece i sees through cams[i]. Editing
    the animation updates every angle; retime with move_cut() and slip()."""
    sed = edit.sequence_editor or edit.sequence_editor_create()
    edit.view_settings.view_transform = src.view_settings.view_transform
    s = sed.strips.new_scene(f"{src.name}_cov", src, channel, start)
    pieces = [s]
    for f in cut_frames:
        pieces.append(pieces[-1].split(frame=f, split_method="SOFT"))
    for p, cam in zip(pieces, cams):
        p.scene_camera = cam
    return pieces


def move_cut(left, right, frame):
    """Move the camera switch between two adjacent soft-split pieces without touching keys."""
    left.right_handle, right.left_handle = frame, frame
    return frame


def slip(strip, frames):
    """Shift which part of the source plays inside a strip; its cut points stay put."""
    lh, rh = strip.left_handle, strip.right_handle
    strip.content_start += frames
    strip.left_handle, strip.right_handle = lh, rh
    return strip


def story_tools(edit, workspace=None):
    """5.0+ in-file animatic wiring for a live session: the Sequencer shows the Edit scene
    (pinned), scrubbing it switches the main window to the shot under the playhead (sync),
    auto-key off in Edit. The Storyboarding app template ships this preconfigured."""
    ws = workspace or bpy.context.workspace or bpy.data.workspaces[0]
    ws.sequencer_scene, ws.use_scene_time_sync, ws.use_pin_scene = edit, True, True
    edit.tool_settings.use_keyframe_insert_auto = False
    return {"workspace": ws.name, "sequencer_scene": ws.sequencer_scene.name,
            "sync": ws.use_scene_time_sync, "pinned": ws.use_pin_scene}


def retime_cut(edit, left_id, frame, src=None, table=None):
    """Story Tools retime (Pablo Fournier: "two shortcuts" instead of moving keys): move the
    cut between shot `left_id` and the next piece of the same coverage run to edit `frame`.
    Both pieces share the scene and the content offset, so the action does not move, only
    which camera sees it. With `src` (the previs scene) the right shot's marker follows the
    cut, so render_stills, audit and scene playback agree with the edit; with `table` the
    shot frames, blocks and edit in/out are updated too. Returns the new source frame."""
    sed = edit.sequence_editor
    left = sed.strips[left_id]
    right = next((x for x in sed.strips if x != left and x.channel == left.channel
                  and x.left_handle == left.right_handle), None)
    if right is None or left.type != "SCENE" or right.type != "SCENE" or right.scene != left.scene \
            or abs(right.content_start - left.content_start) > 1e-6:
        raise ValueError(f"{left_id}: no adjacent piece of the same coverage run (cover=True shots)")
    if not left.left_handle < frame < right.right_handle:
        raise ValueError(f"cut {frame} outside {left.left_handle}..{right.right_handle}")
    move_cut(left, right, frame)
    source = int(round(left.scene.frame_start + frame - left.content_start))
    if src is not None and right.name in src.timeline_markers:
        src.timeline_markers[right.name].frame = source
    if table is not None:
        by = {x["id"]: x for x in table}
        a, b = by.get(left.name), by.get(right.name)
        if a and b:
            end = b["frame"] + b["block"]
            a["block"], b["frame"], b["block"] = source - a["frame"], source, end - source
            a["edit_out"], b["edit_in"] = frame - 1, frame
            a["dur"], b["dur"] = (frame - a["edit_in"]) / edit.render.fps, (b["edit_out"] + 1 - frame) / edit.render.fps
    return source


def passepartout(cams, alpha=1.0):
    """Charge (Hjalti): the shot camera's passepartout NOT see-through, "it will give your
    brain a more accurate representation of the composition" (cTx-n4OZXYE 00:02:11).
    build_shots sets it; call this on any camera made another way. Viewport display only:
    renders are unaffected, it matters when judging through the camera in a live session.
    `cams`: cameras or a scene (every camera in it). audit() flags a shot camera without it."""
    if isinstance(cams, bpy.types.Scene):
        cams = [o for o in cams.objects if o.type == "CAMERA"]
    for c in cams:
        c.data.show_passepartout, c.data.passepartout_alpha = True, alpha
    return len(cams)


def fog_for_shot(sc, t, chars, behind=0.6, depth=6.0, count=4, alpha=0.25, color=(0.85, 0.87, 0.95),
                 only_this_shot=True, name=None):
    """Depth fog for one shot (Hjalti, XZtJ64g5VQQ 00:11:13: separate backdrop from characters
    in unrendered greys; readability, not lighting). Planes face the shot camera and step away
    from it, starting `behind` metres past the farthest subject along the view axis, so the
    backdrop is hazed and the characters are not; sized to cover the frame at the far plane.
    only_this_shot keys hide_render / hide_viewport so the planes exist only in this shot's
    block (a cheat, keyed like any other: Charge). Measure with values_at()."""
    from mathutils import Matrix
    activate(sc)
    sc.frame_set(t["frame"])
    cam = bpy.data.objects[t["camera"]]
    mw = cam.matrix_world.copy()
    fwd = mw.to_quaternion() @ Vector((0, 0, -1))
    far_subject = max(((chars[n].matrix_world.translation + Vector((0, 0, chars[n]["height"] * 0.5)))
                       - mw.translation).dot(fwd) for n in t.get("subjects", [])) if t.get("subjects") else 1.0
    near = far_subject + behind
    far = near + depth
    half_w = far * SENSOR_W / (2 * cam.data.lens) * 1.1
    half_h = half_w * sc.render.resolution_y / sc.render.resolution_x
    nm = name or f"FX-fog_{t['id']}"
    ob = bpy.data.objects.get(nm)
    if ob is None:
        ob = bpy.data.objects.new(nm, _bm_mesh(nm, "box", (2 * half_w, 2 * half_h, 0.0001)))
        coll(sc, "FX").objects.link(ob)
        arr = ob.modifiers.new("depth", "ARRAY")
        arr.use_relative_offset, arr.use_constant_offset = False, True
    arr = ob.modifiers["depth"]
    arr.count = count
    arr.constant_offset_displace = (0, 0, -(far - near) / max(count - 1, 1))    # local -Z = away from the lens
    ob.matrix_world = mw @ Matrix.Translation((0, 0, -near))
    ob.color = (*color, alpha)
    if ob.animation_data:
        ob.animation_data_clear()
    if only_this_shot:
        f0, f1 = t["frame"], t["frame"] + t["block"]
        for f, hide in ((min(f0 - 1, sc.frame_start - 1), True), (f0, False), (f1, True)):
            ob.hide_render = ob.hide_viewport = hide
            ob.keyframe_insert("hide_render", frame=f)
            ob.keyframe_insert("hide_viewport", frame=f)
        make_stepped([ob])
        sc.frame_set(t["frame"])
    ob["near"], ob["far"] = near, far
    return ob


def values_at(sc, frame, points, out_path):
    """Render `sc` at `frame` (the marker camera) to out_path and return the display value
    (Rec.709 luma, 0..1) at each world point: the measurable side of depth separation
    (hero vs backdrop) and of 'the eye finds one thing' checks."""
    import numpy as np
    render_frame(sc, frame, out_path)
    activate(sc)
    sc.frame_set(frame)
    im = bpy.data.images.load(out_path, check_existing=False)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    out = []
    for p in points:
        v = world_to_camera_view(sc, sc.camera, Vector(p))
        x, y = min(w - 1, max(0, int(v.x * w))), min(h - 1, max(0, int(v.y * h)))
        c = a[max(0, y - 1):y + 2, max(0, x - 1):x + 2, :3].reshape(-1, 3).mean(axis=0)
        out.append(round(float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]), 4))
    return out


def ensure_rigify():
    """Rigify ships with Blender but is OFF in a factory startup (and under --factory-startup):
    its metarig operators do not exist until it is enabled (AttributeError). Enable it before
    building or re-generating Rigify proxies. Returns True when enabled."""
    import addon_utils
    if not addon_utils.check("rigify")[1]:
        addon_utils.enable("rigify", default_set=True)
    return bool(addon_utils.check("rigify")[1])


RIGIFY_LAYOUT = ("torso", "chest", "head", "hand_ik.L", "hand_ik.R", "foot_ik.L", "foot_ik.R")   # [added]
_PART_T = (("DEF-spine.006", 0.12), ("DEF-spine.00", 0.17), ("DEF-spine", 0.17), ("DEF-thigh", 0.075),
           ("DEF-shin", 0.06), ("DEF-upper_arm", 0.05), ("DEF-forearm", 0.045), ("DEF-hand", 0.05), ("DEF-foot", 0.05))


def rigify_proxy(sc, name, height, loc, facing=0.0, color=BLUE_GREY):
    """Rigify Basic Human proxy for previs, when the characters are (or will be) Rigify rigs.
    Enables Rigify first, scales the metarig to `height`, generates, deletes the metarig,
    and skins nothing: one grey box per deform bone, bone-parented (Charge: no weight
    painting, fewest bones). A bone collection 'layout' holds the only controls previs keys
    (RIGIFY_LAYOUT; Hjalti's layout selection set); root motion stays on the object like a
    mannequin. The rig object is `CH-<name>` with height / eye_height / kind props, so it is
    a subject for place_camera, audit and floor_plan. Mannequins are cheaper; use this only
    when the brief calls for Rigify."""
    from mathutils import Matrix
    activate(sc)
    ensure_rigify()
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    sc.cursor.location = (0, 0, 0)
    bpy.ops.object.armature_basic_human_metarig_add()
    meta = bpy.context.active_object
    top = max((meta.matrix_world @ b.tail_local).z for b in meta.data.bones)
    meta.scale = (height / top,) * 3
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.pose.rigify_generate()
    rig = meta.data.rigify_target_rig
    arm_data = meta.data
    bpy.data.objects.remove(meta)
    bpy.data.armatures.remove(arm_data)
    rig.name = rig.data.name = f"CH-{name}"
    c = coll(sc, f"CH-{name}")
    for u in list(rig.users_collection):
        u.objects.unlink(rig)
    c.objects.link(rig)
    lay = rig.data.collections.new("layout")
    for b in RIGIFY_LAYOUT:
        lay.assign(rig.pose.bones[b])
    bpy.context.view_layer.update()
    H = float(height)
    for b in rig.data.bones:
        if not b.use_deform:
            continue
        th = next((f for pre, f in _PART_T if b.name.startswith(pre)), None)
        if th is None:
            continue
        L = b.length
        me = _bm_mesh(f"{name}-{b.name}", "box", (th * H, L, th * H), (0, L / 2, 0))
        ob = bpy.data.objects.new(f"{name}-{b.name}", me)
        c.objects.link(ob)
        ob.parent, ob.parent_type, ob.parent_bone = rig, "BONE", b.name
        ob.matrix_basis = Matrix.Translation((0, -L, 0))      # bone parenting starts at the tail
        ob.color = color
    head = rig.data.bones["DEF-spine.006"]
    nose = bpy.data.objects.new(f"{name}-nose", _bm_mesh(f"{name}-nose", "box", (0.03 * H, 0.05 * H, 0.03 * H)))
    c.objects.link(nose)
    nose.parent, nose.parent_type, nose.parent_bone = rig, "BONE", head.name
    at_rest = head.matrix_local @ Matrix.Translation((0, head.length, 0))
    nose.matrix_basis = at_rest.inverted() @ Matrix.Translation((0, -0.07 * H, head.head_local.z + 0.45 * head.length))
    nose.color = (color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, 1)
    rig["height"], rig["eye_height"], rig["kind"] = H, 0.93 * H, "rigify"
    pose(rig, loc=loc, facing=facing)
    return rig


# ----------------------------------------------------------------------------- gates
def size_class(cover):
    """Nearest SIZES name for a subject covering `cover` of the frame height."""
    if cover <= 0:
        return "off"
    m = 1.0 / cover
    return min(SIZES, key=lambda k: abs(math.log(SIZES[k] / m)))


def _cam_view(sc, cam, p):
    return world_to_camera_view(sc, cam, p)


def _belongs(ob, subject):
    while ob is not None:
        if ob == subject:
            return True
        ob = ob.parent
    return False


def line_of_sight(sc, origin, target, subject):
    """(visible, blocker_name) for a ray from the camera to a point on the subject: the first
    hit must be the subject itself (any of its parts) or lie beyond the point. Catches doors,
    counters and a POV character's own head between the lens and the hero."""
    dg = bpy.context.evaluated_depsgraph_get()
    d = Vector(target) - Vector(origin)
    L = d.length
    hit, loc, _n, _i, ob, _m = sc.ray_cast(dg, Vector(origin), d.normalized(), distance=L + 1e-3)
    if not hit:
        return True, None
    ob = getattr(ob, "original", ob)
    if _belongs(ob, subject) or (loc - Vector(origin)).length >= L - 0.02:
        return True, None
    return False, ob.name


def audit(sc, table, chars, line=None, travel=None, block_max=10, stepped=()):
    """Measurable previs gates per shot: marker switches to the shot camera at its frame
    and not before; lens; camera height class vs subject eye lines and pitch; subject
    head/feet/eye in frame, eye and mid-body line of sight (ray cast: what blocks the
    hero), frame-height coverage and measured size; side of the action
    line (line = (nameA, nameB)); screen direction of a travelling subject
    (travel = {name: 'right'|'left'}: the move from the previous shot's pose into this
    shot, seen through this shot's camera, ignored under 5 % of frame width; a shot's own
    'travel' overrides it, Charge: reverse only when the character reverses); previs block
    length; consecutive shots without a character; non-constant blocking keys outside live
    blocks (a live or cover shot may interpolate its action).
    Cost and camera gates (previs is cheap, Hjalti/Charge): opaque passepartout on every shot
    camera; a still (non-live) shot whose camera moves inside its block; blocking keys on
    `stepped` objects at frames, within this table's range, that are neither a shot's first
    frame nor inside a live block (continuous animation of every shot; delete the losing A/B
    frame first; other treatments on the same timeline are ignored); a render
    engine other than Workbench (mood lighting). Light objects in the scene are a warning.
    Returns {'rows': [...], 'problems': [...], 'warnings': [...]}."""
    activate(sc)
    table = sorted(table, key=lambda x: x["frame"])
    rows, problems, sides = [], [], {}
    for i, t in enumerate(table):
        f = t["frame"]
        expected = bpy.data.objects[t["camera"]]
        sc.frame_set(f)
        row = {"id": t["id"], "frame": f, "switch_ok": sc.camera == expected}
        if i:
            sc.frame_set(f - 1)
            row["prev_ok"] = sc.camera == bpy.data.objects[table[i - 1]["camera"]]
            sc.frame_set(f)
        cam = expected
        p = cam.matrix_world.translation.copy()
        fwd = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        eyes = {n: eye_z(chars[n]) for n in t.get("subjects", []) if n in chars}
        row.update(lens=round(cam.data.lens, 1), cam_z=round(p.z, 2),
                   pitch=round(math.degrees(math.asin(max(-1, min(1, fwd.z)))), 1),
                   height=height_class(p.z, eyes))
        t["height_measured"] = f"{row['height']} {row['cam_z']}m"
        t["lens_measured"] = row["lens"]
        frame_info = {}
        for n in eyes:
            o = chars[n]
            base = o.matrix_world.translation.copy()
            top = base + Vector((0, 0, o["height"] * o.matrix_world.to_scale().z))
            eye = Vector((base.x, base.y, eye_z(o)))
            b, tp, e = (_cam_view(sc, cam, q) for q in (base, top, eye))
            inside = lambda v: v.z > 0 and 0 <= v.x <= 1 and 0 <= v.y <= 1
            cover = (tp.y - b.y) if (b.z > 0 and tp.z > 0) else 0.0
            mid = Vector((base.x, base.y, (base.z + top.z) / 2))
            vis_eye, blk_eye = line_of_sight(sc, p, eye, o)
            vis_mid, blk_mid = line_of_sight(sc, p, mid, o)
            frame_info[n] = {"cover": round(cover, 2), "size": size_class(cover),
                             "head_in": inside(tp), "feet_in": inside(b), "eye_in": inside(e),
                             "eye_xy": (round(e.x, 2), round(e.y, 2)),
                             "eye_visible": vis_eye, "mid_visible": vis_mid,
                             "blockers": sorted({x for x in (blk_eye, blk_mid) if x})}
            if n == t["subjects"][0]:
                if not inside(e):
                    problems.append(f"{t['id']}: main subject {n} eye line out of frame")
                elif not vis_eye:
                    problems.append(f"{t['id']}: main subject {n} eye hidden behind {blk_eye}")
        row["subjects"] = frame_info
        if eyes:
            t["size_measured"] = row["size_measured"] = frame_info[t["subjects"][0]]["size"]
            if t.get("size"):
                row["size_intended"] = t["size"]
        if eyes and not row["height"].startswith("eye") and not t.get("intent"):
            problems.append(f"{t['id']}: camera {row['height']} ({p.z:.2f} m) with no stated intent")
        if line and all(n in chars for n in line):
            a, bb = (chars[n].matrix_world.translation for n in line)
            d, v = bb - a, p - a
            cross = d.x * v.y - d.y * v.x
            row["side"] = 0 if abs(cross) < 1e-6 else int(math.copysign(1, cross))
            sides[t["id"]] = row["side"]
        rules = dict(travel or {})
        rules.update(t.get("travel", {}))           # per-shot override: a return journey
        for n, rule in rules.items():
            if n in eyes and i > 0:
                p1 = chars[n].matrix_world.translation.copy()
                sc.frame_set(table[i - 1]["frame"])
                p0 = chars[n].matrix_world.translation.copy()
                sc.frame_set(f)
                v0, v1 = _cam_view(sc, cam, p0), _cam_view(sc, cam, p1)
                dx = v1.x - v0.x
                if v0.z > 0 and v1.z > 0 and (p1 - p0).xy.length > 0.2 and abs(dx) >= 0.05:
                    ok = (dx > 0) == (rule == "right")
                    row[f"travel_{n}"] = {"dx": round(dx, 3), "ok": ok}
                    if not ok:
                        problems.append(f"{t['id']}: {n} travels screen-{'left' if dx < 0 else 'right'}, rule is {rule}")
        nxt = table[i + 1]["frame"] if i + 1 < len(table) else f + t["block"]
        row["block"] = nxt - f
        if row["block"] > block_max and not t.get("live") and not t.get("justify"):
            problems.append(f"{t['id']}: previs block {row['block']} frames > {block_max}")
        if not row["switch_ok"] or row.get("prev_ok") is False:
            problems.append(f"{t['id']}: marker camera switch wrong")
        rows.append(row)
    if sides:
        vals = [s for s in sides.values() if s]
        major = 1 if vals.count(1) >= vals.count(-1) else -1
        for t in table:
            s = sides.get(t["id"])
            if s and s != major and not (t.get("cross") or t.get("pov")):
                problems.append(f"{t['id']}: camera crosses the action line {line}")
    humans = lambda t: any(chars.get(n) is not None and chars[n].name.startswith("CH-") for n in t.get("subjects", []))
    for a, b in zip(table, table[1:]):
        if not humans(a) and not humans(b):
            problems.append(f"{a['id']}+{b['id']}: two inserts in a row without a character (Dillon: lowers tension)")
    live_ranges = [(t["frame"], t["frame"] + t["block"]) for t in table if t.get("live")]
    bad = {}
    for o in stepped:                          # inside a live block the action may be interpolated
        n = sum(1 for fc in fcurves(o) for k in fc.keyframe_points if k.interpolation != "CONSTANT"
                and not any(a <= int(round(k.co.x)) < b for a, b in live_ranges))
        if n:
            bad[o.name] = n
    if bad:
        problems.append(f"non-constant blocking keys: {bad}")
    # ---- cost and camera gates
    warnings = []
    for t in table:
        cd = bpy.data.objects[t["camera"]].data
        if not cd.show_passepartout or cd.passepartout_alpha < 0.999:
            problems.append(f"{t['id']}: camera {t['camera']} passepartout not opaque (Charge: judge the "
                            "composition without seeing past the frame; passepartout(cams))")
    for t in table:
        if t.get("live"):
            continue
        cam = bpy.data.objects[t["camera"]]
        states = []
        for f in (t["frame"], t["frame"] + max(t["block"] // 2, 1), t["frame"] + t["block"] - 1):
            sc.frame_set(f)
            states.append((cam.matrix_world.copy(), cam.data.lens))
        (m0, l0) = states[0]
        if any((m.translation - m0.translation).length > 1e-4 or
               m.to_quaternion().rotation_difference(m0.to_quaternion()).angle > 1e-4 or abs(l - l0) > 1e-3
               for m, l in states[1:]):
            problems.append(f"{t['id']}: camera moves inside a still shot (animate only story moves; fake a "
                            "push-in on the still with push, or mark the shot live)")
    allowed = {t["frame"] for t in table}
    for t in table:
        if t.get("live"):
            allowed |= set(range(t["frame"], t["frame"] + t["block"]))
    lo_f, hi_f = table[0]["frame"], max(t["frame"] + t["block"] for t in table)   # other treatments share the timeline
    stray = {}
    for o in stepped:
        fr = sorted({f for f in (int(round(k.co.x)) for fc in fcurves(o) for k in fc.keyframe_points)
                     if lo_f <= f < hi_f} - allowed)
        if fr:
            stray[o.name] = fr
    if stray:
        problems.append(f"keys outside shot starts and live blocks {stray}: previs blocks are stills "
                        "(Charge: 10-frame blocks, animate only the story moves)")
    if sc.render.engine != "BLENDER_WORKBENCH":
        problems.append(f"render engine {sc.render.engine}: previs is judged in Workbench greys "
                        "(Charge: a few shades of grey); mood lighting belongs to lighting")
    nl = sum(1 for o in sc.objects if o.type == "LIGHT")
    if nl:
        warnings.append(f"{nl} light object(s) in the previs scene: Workbench ignores them; mood lighting is not previs")
    sc.frame_set(table[0]["frame"])
    return {"rows": rows, "problems": problems, "warnings": warnings}


# ----------------------------------------------------------------------------- 2D/3D hybrid
def gp_carrier(sc, name, parent=None, loc=(0, 0, 0), color=INK):
    """Empty Grease Pencil object for a board drawing (layers Fills below Lines, one ink
    material), parented with keep-transform to a proxy that carries the motion (Spitfire,
    Renato, Pablo). The drawing itself is the scenario-blender-grease-pencil skill's job."""
    gp = bpy.data.grease_pencils.new(name)
    ob = bpy.data.objects.new(name, gp)
    coll(sc, "STORY").objects.link(ob)
    mat = bpy.data.materials.new(f"{name}_ink")
    bpy.data.materials.create_gpencil_data(mat)
    mat.grease_pencil.color = color
    gp.materials.append(mat)
    gp.layers.new("Fills")
    gp.layers.new("Lines")
    ob.location = loc
    if parent is not None:
        bpy.context.view_layer.update()
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob


def gp_polyline(gp_obj, points, radius=0.01, frame=1, layer="Lines"):
    """One stroke from local-space points (guides, floor-plan paths, stick figures)."""
    lay = gp_obj.data.layers[layer]
    fr = next((x for x in lay.frames if x.frame_number == frame), None) or lay.frames.new(frame)
    d = fr.drawing
    d.add_strokes([len(points)])
    s = d.strokes[len(d.strokes) - 1]
    for pt, co in zip(s.points, points):
        pt.position, pt.radius = co, radius
    return len(d.strokes)


def glass_rig(sc, cam, pivot_loc, drawing=None, name="RIG-glass"):
    """BouncyBrain's 'drawing on glass': a pivot empty over the subject; camera and hero
    drawing are both children (keep transform). Orbit = rotate the pivot (the drawing
    keeps its place in frame); dolly = move the camera along its local Z (the drawing
    changes size on screen)."""
    piv = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if piv.name not in sc.collection.objects and not piv.users_collection:
        coll(sc, "CA-cameras").objects.link(piv)
    piv.location = pivot_loc
    bpy.context.view_layer.update()
    for ob in (cam, drawing):
        if ob is not None:
            mw = ob.matrix_world.copy()
            ob.parent = piv
            ob.matrix_parent_inverse = piv.matrix_world.inverted()
            ob.matrix_world = mw
    return piv


def facing_report(obj, sc, cam, frames, axis=(0, -1, 0), max_angle=EDGE_ON_DEG):
    """Angle between a flat drawing's facing axis (default local -Y) and the direction to
    the camera per frame; frames above max_angle read as a cardboard cutout or go edge-on
    (Renato: flags a shot that will be hard for 2D animation)."""
    activate(sc)
    out = {}
    for f in frames:
        sc.frame_set(f)
        n = (obj.matrix_world.to_3x3() @ Vector(axis)).normalized()
        to_cam = (cam.matrix_world.translation - obj.matrix_world.translation).normalized()
        out[f] = round(math.degrees(math.acos(max(-1.0, min(1.0, n.dot(to_cam))))), 1)
    return {"angles": out, "flagged": [f for f, a in out.items() if a > max_angle]}
