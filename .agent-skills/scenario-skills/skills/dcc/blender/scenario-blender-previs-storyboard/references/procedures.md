# Tested procedures (Blender 5.2.1)

Every code block below runs, in order, in one namespace:
`tests/code/blender-previs-storyboard/test_03_procedures.py` extracts the blocks from this file and
executes them verbatim (only the two paths in P0 are substituted). The asserts inside the blocks are
the gates. Deeper checks of the same functions: `test_01_s6_end_to_end.py` (scenario S6 built
completely, 27 checks), `test_02_api_traps.py` (traps, coverage, hybrids, 27 checks) and
`test_04_grading_gates.py` (passepartout, fog, coverage runs, cost gates, Rigify proxies, 22
checks). Run any of them with:

```
blender --background --factory-startup --python-exit-code 1 --python tests/code/blender-previs-storyboard/<test>.py
```

The example is S6 cut down: a keeper, a small robot, a snack, three cinematic shots.

## P0. Import the toolkit

Verified on 5.2.1: test_03 block 0.

```python
import math, os, sys
SKILLS = "/abs/path/to/skills"      # folder holding scenario-blender-previs-storyboard and scenario-blender-expert
OUT = "/abs/path/to/output"         # any writable folder
sys.path += [os.path.join(SKILLS, "scenario-blender-previs-storyboard", "scripts"),
             os.path.join(SKILLS, "scenario-blender-expert", "scripts")]
import bpy
from mathutils import Vector
import bx_previs as P
os.makedirs(OUT, exist_ok=True)
```

## P1. Beats of information, then shots (Hjalti)

One fact per line; beats you add are marked. Shots group consecutive beats; `shot_list` refuses a
missing, duplicated or reordered beat and assigns previs frames on decades (Charge: 10-frame blocks;
a live shot's longer block pushes the next start to the next decade). Verified on 5.2.1: test_03
block 1; test_01 sections 1, 4, 5.

```python
BEATS = ["The shopkeeper has his back to the floor.",
         "A little robot sneaks toward a snack.",
         "The shopkeeper turns around.",
         "The robot freezes like a toy."]
try:
    P.shot_list(BEATS, [{"id": "sh010", "beats": [1, 3]}])
    raise AssertionError("a missing beat must be refused")
except ValueError as err:
    print("refused:", err)
SHOTS = [
    dict(id="sh010", beats=[1, 2], subjects=["robot", "keeper"], loc=(-1.5, -1.4, 0.55),
         aim=(1.2, 0.9, 0.75), lens=28, size="wide", dur=3.0, intent="irony two-shot at robot height"),
    dict(id="sh020", beats=[3], subjects=["keeper"], size="mcu", lens=50, height="eye",
         azimuth=-35, dur=1.5, intent="neutral MCU at his eye line"),
    dict(id="sh030", beats=[4], subjects=["robot"], loc=(2.0, 0.55, 1.72), aim="robot", lens=35,
         dur=2.0, block=48, live=True, pov=True, intent="his POV, quick zoom: he fixes on it"),
]
table = P.shot_list(BEATS, SHOTS, start=10)
assert [t["frame"] for t in table] == [10, 20, 30]
```

## P2. Scene with the format locked first (Charge)

`setup_scene` sets resolution, fps, Workbench with object colors and outlines, the Standard view
transform (grays render as set), AUDIO_SYNC playback (never judge timing on play-every-frame,
Hjalti) and makes the scene the window scene. Raw equivalent of the key lines below it. Verified on
5.2.1: test_03 block 2; test_01 section 2.

```python
sc = P.setup_scene("01_blend procedures", res=(1920, 1080), fps=24, pct=20)
# raw bpy equivalent of what matters
sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = 1920, 1080, 24
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light, sc.display.shading.color_type = "STUDIO", "OBJECT"
sc.view_settings.view_transform = "Standard"
bpy.context.window.scene = sc          # measuring needs the window scene (see P16)
assert bpy.context.scene == sc
```

## P3. Set pieces and proxy characters

Real scale, origins at the bottom, grays, one pop color (Renato). A mannequin is a root empty at the
feet with `height` and `eye_height` custom properties and four pivoted parts that are the only
controls previs keys (Hjalti's layout selection set). Verified on 5.2.1: test_03 block 3; test_01
section 2.

```python
P.prop(sc, "floor", (9.0, 7.5, 0.02), (0, -0.25, -0.02), (0.3, 0.3, 0.3, 1))
P.prop(sc, "counter", (0.5, 2.4, 1.0), (2.0, 0.6, 0), (0.68, 0.68, 0.68, 1))
P.prop(sc, "snack_bin", (0.45, 0.6, 0.35), (1.35, 0.5, 0), (0.6, 0.6, 0.6, 1))
snack = P.prop(sc, "snack", (0.16, 0.06, 0.22), (1.22, 0.3, 0.35), (0.95, 0.78, 0.1, 1), collection="PROPS")
keeper = P.mannequin(sc, "keeper", 1.75, (2.85, 1.0, 0), facing=90, color=P.BLUE_GREY)
robot = P.mannequin(sc, "robot", 0.55, (-0.2, 0.75, 0), facing=75, color=P.POP, kind="robot")
chars = {"keeper": keeper, "robot": robot, "snack": snack}
MOV = P.movables(keeper, robot) + [snack]
assert sorted(P.controls(robot)) == ["arm_L", "arm_R", "chest", "head"]
assert abs(keeper["eye_height"] - 0.93 * 1.75) < 1e-6
```

## P4. Stepped blocking; key before you cheat (Charge)

Per block: `frame_set` first (holds the previous pose), set only what changes, key every movable. A
cheat (the snack at 1.4x for one shot) is just another keyed value. Python keys ignore the new-key
interpolation preference, so force CONSTANT through the channelbag. Raw loop shown after the module
call. Verified on 5.2.1: test_03 block 4; test_01 section 6; test_02 section 2.

```python
def block(frame, **poses):
    sc.frame_set(frame)
    for obj, kw in poses.items():
        P.pose(chars[obj], **kw) if obj != "snack" else setattr(snack, "scale", (kw["scale"],) * 3)
    P.key_block(MOV, frame)

block(10, robot=dict(loc=(-0.2, 0.75, 0), facing=75, chest=(18, 0, 0), arm_L=(-70, 0, 0), arm_R=(-60, 0, 0)),
      keeper=dict(facing=90, chest=(12, 0, 0), head=(18, 0, 0), arm_R=(-80, 0, 0)), snack=dict(scale=1.0))
block(20, keeper=dict(loc=(2.85, 1.0, 0), facing=90, chest=(5, 0, -40), head=(0, 0, -50)),
      robot=dict(loc=(0.97, 0.36, 0), facing=90, arm_R=(-120, 0, 0)), snack=dict(scale=1.4))   # cheat
block(30, keeper=dict(loc=(2.75, 0.95, 0), facing=-70, chest=(28, 0, 0), head=(22, 0, 0), arm_R=(-20, 0, 0)),
      robot=dict(facing=90, head=(-20, 0, 35), arm_R=(-150, 0, 0)), snack=dict(scale=1.0))
block(36, robot=dict(facing=109, head=(0, 12, 0), arm_L=(0, -80, 0), arm_R=(0, 80, 0)))  # the snap, inside the live shot

P.make_stepped(MOV)
# raw equivalent (5.x slotted actions; action.fcurves is gone)
from bpy_extras import anim_utils
for ob in MOV:
    ad = ob.animation_data
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    for fc in cb.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
assert P.stepped_report(MOV) == {}
sc.frame_set(10); assert abs(snack.scale.x - 1.0) < 1e-6
sc.frame_set(20); assert abs(snack.scale.x - 1.4) < 1e-6
```

## P5. One camera per shot, markers bound to cameras

`build_shots` places each camera (default: mean eye height of the subjects; distance = visible
height x lens / sensor height, visible height from the size table and the subjects' spread; explicit
`loc`/`aim` wins), sets a 36 mm horizontal sensor, an opaque passepartout (Hjalti, Charge: "it will
give your brain a more accurate representation of the composition"; viewport display only, renders
are unaffected) and clip 0.01 to 200, and binds a marker at the shot's first frame.
`P.passepartout(cams_or_scene)` does the same for cameras made any other way, and `audit` flags a
shot camera without it. The raw binding and look-at follow. Camera moves that carry meaning are
keyed on the camera afterwards. Verified on 5.2.1: test_03 block 5; test_01 section 7; test_02
section 5.

```python
cams = P.build_shots(sc, table, chars)
assert all(c.data.show_passepartout and c.data.passepartout_alpha == 1.0 for c in cams.values())
cam30 = cams["sh030"]
P.key_lens(cam30, [(38, 35), (46, 50)])              # quick zoom, linear (Dillon)
P.handheld(cam30, strength=0.012, scale=22, frame=30)  # a person's POV

# raw equivalents
m = sc.timeline_markers["sh020"]
assert m.camera == cams["sh020"] and m.frame == 20
extra = bpy.data.objects.new("CAM-extra", bpy.data.cameras.new("CAM-extra"))
sc.collection.objects.link(extra)
extra.location = (0, -5, 1.6)
extra.rotation_euler = (Vector((0, 0, 1.0)) - extra.location).to_track_quat("-Z", "Y").to_euler()
extra.data.show_passepartout, extra.data.passepartout_alpha = True, 1.0   # opaque, as P.passepartout does
sc.timeline_markers.new("tmp", frame=90).camera = extra      # data-level Ctrl+B
sc.frame_set(90); assert sc.camera == extra
sc.timeline_markers.remove(sc.timeline_markers["tmp"])
bpy.data.objects.remove(extra)
sc.frame_set(19); assert sc.camera == cams["sh010"]
sc.frame_set(20); assert sc.camera == cams["sh020"]
```

## P6. Measurable gates

`audit` per shot: camera switch at the frame and not before, lens, height class and pitch, main
subject's eye line in frame and not blocked (ray cast names the blocker), coverage and measured
size, action-line side, screen direction for a journey, block length, two inserts in a row,
non-constant keys outside live blocks. Cost and camera gates (P20): opaque passepartout, no camera
move inside a still shot, no keys between block starts outside live shots, Workbench engine; light
objects come back as `warnings`. Verified on 5.2.1: test_03 block 6; test_01 section 8 (including a
regression that re-creates the door and counter occlusions and sees them flagged).

```python
rep = P.audit(sc, table, chars, line=("robot", "keeper"), stepped=MOV)
for r in rep["rows"]:
    print(r["id"], r["lens"], r["height"], r["cam_z"], r.get("side"),
          {n: (s["size"], s["eye_visible"]) for n, s in r["subjects"].items()})
assert rep["problems"] == [], rep["problems"]
print("warnings:", rep["warnings"])
```

## P7. Stills, contact sheet, single frames

`render_stills` renders one Workbench still per shot at its first frame, versioned `<id>_v###.png`,
never overwritten; `contact_sheet` stamps each (shot, lens, camera height, size, seconds, intent),
adds the last frame of live shots and tiles them. `render_frame` renders any scene at any frame
safely (P16). Verified on 5.2.1: test_03 block 7; test_01 section 9.

```python
stills = P.render_stills(sc, table, os.path.join(OUT, "stills"))
sheet = P.contact_sheet(sc, table, OUT, cols=4, name="procedures_contact", chars=chars)
print("open:", sheet)
one = P.render_frame(sc, 40, os.path.join(OUT, "sh030_f40.png"))
assert os.path.exists(sheet) and os.path.exists(one) and set(stills) == {"sh010", "sh020", "sh030"}
```

## P8. Lens A/B at equal subject size (Hjalti)

Non-destructive: renders the shot at each focal length, moving the camera along its view axis so the
subject keeps its size (d2 = d1 x f2 / f1 [added]), side by side. Not for shots whose lens or
location is keyed. Verified on 5.2.1: test_03 block 8; test_01 section 9.

```python
ab = P.ab_lens(sc, table[1], (35, 50, 85), os.path.join(OUT, "ab"))
assert os.path.exists(ab) and cams["sh020"].data.lens == 50
```

## P9. Floor plan

Top orthographic render in a temporary scene: camera glyphs with their horizontal field of view and
labels (co-located cameras share one label), the action line in red, journeys in green. Verified on
5.2.1: test_03 block 9; test_01 section 9.

```python
fp = P.floor_plan(sc, table, chars, os.path.join(OUT, "floor_plan.png"), line=("robot", "keeper"),
                  paths=["robot"], frame=30)
assert os.path.exists(fp) and "BX_FloorPlan" not in bpy.data.scenes
```

## P10. The animatic edit

`animatic` builds `NN_edit` beside `NN_blend`: image strips held `round(dur * fps)` frames (fit to
frame), `push` keys a fake dolly-in on a still by multiplying the FIT scale (Charge), `live` shots
become scene strips through their camera with the source frame aligned to the cut, sounds go on
upper channels, `burn_in` stamps strip name and frame, the edit gets the Standard view transform,
and `bx_review.playblast` renders the MP4. The raw VSE calls follow. Verified on 5.2.1: test_03
block 10; test_01 section 10 (MP4 streams and duration by ffprobe, live frame equal to the previs
frame, push rendered).

```python
table[0]["push"] = 1.1
ed = P.animatic(sc, table, stills, P._versioned(OUT, "procedures_animatic", ".mp4"),
                edit_name="01_edit procedures", burn_in=True)
print(ed["seconds"], ed["cuts"])
assert abs(ed["seconds"] - 6.5) < 1e-6 and os.path.exists(ed["mp4"])

# raw VSE equivalents (5.1+ names)
e2 = bpy.data.scenes.new("raw_edit")
e2.render.fps = 24
e2.view_settings.view_transform = "Standard"
sed = e2.sequence_editor_create()
s1 = sed.strips.new_image("sh010", stills["sh010"], 1, 1, fit_method="FIT")
s1.right_handle = 1 + 72                                 # hold 3 s
live = table[2]
s2 = sed.strips.new_scene("sh030", sc, 1, 73)
s2.content_start = 73 - (live["frame"] - sc.frame_start) # source frame 30 at edit frame 73
s2.left_handle, s2.right_handle = 73, 73 + 48
s2.scene_camera = cams["sh030"]
e2.render.image_settings.media_type = "VIDEO"            # before FFMPEG (5.0)
e2.render.image_settings.file_format = "FFMPEG"
e2.render.ffmpeg.format, e2.render.ffmpeg.codec = "MPEG4", "H264"
assert (s1.duration, s2.left_handle, s2.right_handle) == (72, 73, 121)
bpy.data.scenes.remove(e2)
```

## P11. Coverage from one action (Story Tools, Pablo Fournier)

One scene strip split with `Strip.split(frame, split_method='SOFT')`, each piece through its own
camera; move the camera switch with `move_cut`, shift the action inside a piece with `slip`. Editing
the animation updates every angle. Verified on 5.2.1: test_03 block 11; test_02 section 7 (edit
frames pixel-identical to the source through the right camera, before and after move and slip).

```python
cov_edit = bpy.data.scenes.new("coverage_edit")
pieces = P.coverage(cov_edit, sc, [cams["sh010"], cams["sh020"]], [20])
P.move_cut(pieces[0], pieces[1], 24)
P.slip(pieces[1], -3)
assert pieces[0].right_handle == 24 and pieces[1].left_handle == 24 and pieces[1].scene_camera == cams["sh020"]
# raw split
s = cov_edit.sequence_editor.strips.new_scene("raw", sc, 3, 1)
right = s.split(frame=15, split_method="SOFT")
assert (s.right_handle, right.left_handle) == (15, 15)
```

## P12. Story Tools wiring for a live session

Sequencer shows the Edit scene (pinned), scrubbing syncs the main window to the shot scene under the
playhead, auto-key off in Edit (Pablo: "two kinds of auto keys"). Headless these are plain
properties. Verified on 5.2.1: test_03 block 12; test_02 section 12.

```python
st = P.story_tools(bpy.data.scenes[ed["edit"]])
ws = bpy.context.workspace
assert ws.sequencer_scene.name == ed["edit"] and ws.use_scene_time_sync and ws.use_pin_scene
```

## P13. Camera moves that feel physical (Dillon Gu)

Quick zoom = keyed lens, linear; dolly zoom = lens and distance keyed together so the subject keeps
its size (distance proportional to focal length [added]); handheld = NOISE modifiers on rotation.
REPLACE (default) centers the noise on the curve, ADD shifts it by about strength/2; measured
peak-to-peak about 0.66 x strength at scale 22 over 400 frames. Verified on 5.2.1: test_03 block 13;
test_02 section 10.

```python
from bpy_extras.object_utils import world_to_camera_view
dz = bpy.data.objects.new("CAM-dolly_zoom", bpy.data.cameras.new("CAM-dolly_zoom"))
sc.collection.objects.link(dz)
target = Vector((*keeper.matrix_world.translation.xy, P.eye_z(keeper)))
back = Vector((0, -1, 0))
for f, mm in ((100, 24), (124, 70)):
    dz.data.lens = mm
    dz.location = target + back * (1.2 * mm / 24)          # distance scales with focal length
    dz.rotation_euler = (target - dz.location).to_track_quat("-Z", "Y").to_euler()
    dz.data.keyframe_insert("lens", frame=f)
    dz.keyframe_insert("location", frame=f)
    dz.keyframe_insert("rotation_euler", frame=f)
P.make_stepped([dz, dz.data], "LINEAR")                    # Dillon: linear for the dolly zoom
sizes = []
for f in (100, 112, 124):
    sc.frame_set(f)
    top = world_to_camera_view(sc, dz, target + Vector((0, 0, 0.1)))
    bot = world_to_camera_view(sc, dz, target - Vector((0, 0, 0.1)))
    sizes.append(top.y - bot.y)
print("subject size through the dolly zoom:", [round(x, 4) for x in sizes])
assert max(sizes) - min(sizes) < 0.01 * max(sizes)
bpy.data.objects.remove(dz)
```

## P14. 2D/3D hybrid boards: carriers, glass rig, facing

A Grease Pencil drawing rides a 3D proxy (Spitfire, Renato, Pablo) or a pivot over the subject with
the camera ("drawing on glass", BouncyBrain). Flag frames where the carrier turns the flat drawing
more than 70 degrees from the camera [added threshold]. Strokes: scenario-blender-grease-pencil;
`gp_polyline` is only for guides. Drawing-plane settings for a live session:
`ts.gpencil_stroke_placement_view3d = 'ORIGIN'`, `ts.gpencil_sculpt.lock_axis = 'VIEW'` (Spitfire's
default). Verified on 5.2.1: test_03 block 14; test_02 section 11 (strokes render headless in
Workbench).

```python
proxy = P.prop(sc, "proxy_plane", (0.6, 0.02, 1.0), (-2.5, 0.0, 0), P.GREY)
gp = P.gp_carrier(sc, "GP-board", parent=proxy, loc=(-2.5, -0.03, 0))
P.gp_polyline(gp, [(-0.25, 0, 0.1), (0, 0, 0.9), (0.25, 0, 0.1)], radius=0.015)
proxy.rotation_euler.z = 0
proxy.keyframe_insert("rotation_euler", frame=1)
proxy.rotation_euler.z = math.radians(-85)
proxy.keyframe_insert("rotation_euler", frame=9)
rep_f = P.facing_report(gp, sc, cams["sh010"], [1, 5, 9])
print(rep_f)
assert 9 in rep_f["flagged"] and 1 not in rep_f["flagged"]
gcam = bpy.data.objects.new("CAM-glass", bpy.data.cameras.new("CAM-glass"))
sc.collection.objects.link(gcam)
gcam.location = (-2.5, -4.0, 0.6)
pivot = P.glass_rig(sc, gcam, (-2.5, 0.0, 0.5), drawing=gp)
assert gp.parent == pivot and gcam.parent == pivot
```

## P15. Depth fog planes (Hjalti, Charge)

A plane with an ARRAY modifier and a translucent object color, placed in depth to separate the
backdrop from the characters in unrendered grays (Hjalti: readability, not lighting). `fog_planes`
places one in world space; `fog_for_shot` faces the shot camera, starts `behind` meters past the
farthest subject (so it can never tint the hero), covers the frame, and keys
`hide_render`/`hide_viewport` so it exists only in that shot's block (a keyed cheat). Measured on
5.2.1 Workbench: the fog pulls what is behind it toward its own shaded value, so a light fog lifts a
dim backdrop (0.373 to 0.499 display with the characters at 0.374: separation 0.002 to 0.125) but
barely changes a mid-gray one (0.529 to 0.533); pick a fog value away from the characters' and check
with `values_at`. Verified on 5.2.1: test_03 block 15; test_02 section 9; test_04 section 2
(characters unchanged, other shots unchanged, fog put in front is reported by the audit as the
blocker).

```python
fog = P.fog_planes(sc, "FX-fog", (0, 2.0, 0), 8, 3, count=4, spacing=0.4, alpha=0.25)
assert fog.modifiers["depth"].count == 4 and abs(fog.color[3] - 0.25) < 1e-6
fog.hide_render = fog.hide_viewport = True           # keep the world-space example out of the shots
hero_pt = keeper.matrix_world.translation + Vector((0, 0, 1.2))
f10 = P.fog_for_shot(sc, table[0], chars, behind=0.8, depth=3.0, count=4, alpha=0.3)
vals = P.values_at(sc, table[0]["frame"], [hero_pt], os.path.join(OUT, "sh010_fog.png"))
sc.frame_set(table[1]["frame"]); assert f10.hide_render            # only in its own shot
sc.frame_set(table[0]["frame"]); assert not f10.hide_render and f10["near"] < f10["far"]
print("hero value with fog:", vals)
```

## P16. The traps, reproduced

Verified on 5.2.1: test_03 block 16; test_02 sections 1 to 6.

```python
# 1. viewport render is impossible headless
try:
    bpy.ops.render.opengl(write_still=True)
except RuntimeError as err:
    assert "background mode" in str(err)
# 2. the new-key interpolation preference does not reach keyframe_insert()
bpy.context.preferences.edit.keyframe_new_interpolation_type = "CONSTANT"
probe = bpy.data.objects.new("probe", None); sc.collection.objects.link(probe)
probe.keyframe_insert("location", frame=1)
assert {k.interpolation for fc in P.fcurves(probe) for k in fc.keyframe_points} == {"BEZIER"}
bpy.context.preferences.edit.keyframe_new_interpolation_type = "BEZIER"
bpy.data.objects.remove(probe)
# 3. measure only in the window scene: frame_set elsewhere leaves transforms stale
other = bpy.data.scenes.new("other"); e = bpy.data.objects.new("e", None); other.collection.objects.link(e)
e.keyframe_insert("location", frame=1); e.location.x = 10; e.keyframe_insert("location", frame=11)
other.frame_set(6); assert e.matrix_world.translation.x != 5.0
P.activate(other); other.frame_set(6); assert abs(e.matrix_world.translation.x - 5.0) < 1e-6
P.activate(sc)
# 4. marker binding by operator needs a timeline context; the data path works anywhere
try:
    bpy.ops.marker.camera_bind()
except RuntimeError as err:
    assert "context" in str(err)
# 5. a 6 fps board scene cut into a 24 fps edit keeps its frame count: 4x fast
b6 = bpy.data.scenes.new("boards6"); b6.render.fps, b6.frame_start, b6.frame_end = 6, 1, 12
tmp_edit = bpy.data.scenes.new("tmp_edit"); tmp_edit.render.fps = 24
assert tmp_edit.sequence_editor_create().strips.new_scene("b6", b6, 1, 1).duration == 12
```

## P17. Layout bone subset on a real rig (Selection Sets substitute)

The Selection Sets add-on is not bundled in 5.2.1; a bone collection named `layout` does the job,
and scripts key only its bones (Hjalti: fewer bones, fewer misclicks). Verified on 5.2.1: test_03
block 17; test_02 section 8.

```python
arm = bpy.data.armatures.new("RIG-proxy")
rig = bpy.data.objects.new("RIG-proxy", arm)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, head, tail in (("root", (0, 0, 0), (0, 0.3, 0)), ("chest", (0, 0, 1.1), (0, 0, 1.4)),
                         ("finger", (0.6, 0, 1.0), (0.65, 0, 1.0))):
    b = arm.edit_bones.new(name); b.head, b.tail = head, tail
bpy.ops.object.mode_set(mode="OBJECT")
layout = arm.collections.new("layout")
for name in ("root", "chest"):
    layout.assign(rig.pose.bones[name])
for pb in rig.pose.bones:
    if any(c.name == "layout" for c in pb.bone.collections):
        pb.keyframe_insert("rotation_quaternion", frame=1)
assert sorted({fc.data_path.split('"')[1] for fc in P.fcurves(rig)}) == ["chest", "root"]
```

## P18. Coverage run in the animatic: one scene, several scene strips, retime by moving the cut (Story Tools)

Pablo Fournier's multi-camera trick from one scene [4flnlr39S1U 00:23:03]: a `live` shot followed by
`cover=True` shots is one continuous action; `shot_list` starts each cover shot where the previous
block ends, `build_shots` binds its marker there, and `animatic` cuts the run as ONE scene strip
soft-split at the cuts, each piece through its own camera (edit length must equal the block inside a
run). `retime_cut` moves a cut without touching keys and moves the right shot's marker (and the
table) with it, so stills, audit and scene playback agree with the edit. Editing the animation
updates every angle. Verified on 5.2.1: test_03 block 18; test_04 section 3 (edit frames
pixel-identical to the previs frames through the right camera before and after the retime; one key
change shows in both angles).

```python
cv = P.setup_scene("02_blend coverage", pct=10)
P.prop(cv, "floor", (10, 10, 0.02), (0, 0, -0.02), P.GREY_DARK)
k2 = P.mannequin(cv, "keeper2", 1.75, (1.2, 1.0, 0), facing=-90)
r2 = P.mannequin(cv, "robot2", 0.55, (-1.5, 1.0, 0), facing=90, color=P.POP, kind="robot")
ch2, MOV2 = {"keeper": k2, "robot": r2}, P.movables(k2, r2)
T2 = P.shot_list(["The robot rolls toward the keeper.", "The keeper sees it coming."],
                 [dict(id="sh010", beats=[1], subjects=["robot"], size="full", lens=35, azimuth=-20, block=24,
                       dur=1.0, live=True, intent="follows the roll"),
                  dict(id="sh020", beats=[2], subjects=["keeper", "robot"], size="full", lens=50, azimuth=30,
                       block=24, dur=1.0, cover=True, intent="his reaction while it rolls")], start=10)
assert [(t["frame"], t["block"]) for t in T2] == [(10, 24), (34, 24)]
cv.frame_set(10); P.key_block(MOV2, 10)
r2.location.x = 0.4; P.key_block(MOV2, 57)
P.make_stepped(MOV2)
for fc in P.fcurves(r2):
    for k in fc.keyframe_points:
        if round(k.co.x) == 10:
            k.interpolation = "LINEAR"                   # the roll itself is continuous
cams2 = P.build_shots(cv, T2, ch2)
ed2 = P.animatic(cv, T2, {}, os.path.join(OUT, "coverage_animatic.mp4"), edit_name="02_edit coverage", render=False)
e2 = bpy.data.scenes[ed2["edit"]]
a, b = e2.sequence_editor.strips["sh010"], e2.sequence_editor.strips["sh020"]
assert a.scene == b.scene == cv and a.content_start == b.content_start and b.scene_camera == cams2["sh020"]
src = P.retime_cut(e2, "sh010", b.left_handle + 6, src=cv, table=T2)   # hold the roll 6 frames longer
assert src == 40 and cv.timeline_markers["sh020"].frame == 40 and a.right_handle == b.left_handle
assert P.audit(cv, T2, ch2, stepped=MOV2)["problems"] == []
```

## P19. Rigify proxies: enable Rigify first

Rigify ships with Blender but is OFF in a factory startup and under `--factory-startup`:
`bpy.ops.object.armature_basic_human_metarig_add` raises "could not be found" until it is enabled
(S6 grader flag). `ensure_rigify` enables it (`addon_utils.enable("rigify", default_set=True)`).
`rigify_proxy` builds a Basic Human scaled to height with one bone-parented gray box per deform bone
(no weights, Charge), deletes the metarig, and adds a `layout` bone collection (torso, chest, head,
IK hands and feet [added]) that `key_block` keys and `pose(bones=...)` sets (quaternion controls
converted). Mannequins stay the cheaper default; use this only when the brief asks for Rigify rigs.
Full rigging: scenario-blender-rigging. Verified on 5.2.1: test_03 block 19; test_04 section 5
(operator missing before, audit and still work with the proxy).

```python
import addon_utils
assert P.ensure_rigify() and addon_utils.check("rigify")[1]
hero = P.rigify_proxy(cv, "hero", 1.7, (0.0, 3.0, 0), facing=0)
assert {pb.name for pb in P.layout_bones(hero)} == set(P.RIGIFY_LAYOUT) and abs(hero["height"] - 1.7) < 1e-6
cv.frame_set(70)
P.pose(hero, bones={"chest": (15, 0, 0), "hand_ik.R": {"loc": (0, -0.2, 0.3)}})
P.key_block([hero], 70)
P.make_stepped([hero])
keyed = {fc.data_path.split('"')[1] for fc in P.fcurves(hero) if fc.data_path.startswith("pose.bones")}
assert keyed <= set(P.RIGIFY_LAYOUT) and "chest" in keyed and P.stepped_report([hero]) == {}
```

## P20. Cost and camera gates: what the audit refuses

Previs is the cheapest version that conveys the idea (Hjalti [XZtJ64g5VQQ 00:48:40]): stills, not
continuous animation of every shot [00:18:54]; camera moves only when the move is the story
[cTx-n4OZXYE 00:04:32]; grays, not mood lighting. `audit` turns these into problems: a camera moving
inside a still shot, keys between block starts outside live shots, a render engine other than
Workbench; light objects are a warning (Workbench ignores them). Compare against the scene's own
baseline so unrelated findings do not mask the new one. Verified on 5.2.1: test_03 block 20; test_04
section 4.

```python
base = set(P.audit(sc, table, chars, stepped=MOV)["problems"])
c20, loc0 = cams["sh020"], cams["sh020"].location.copy()
c20.keyframe_insert("location", frame=20); c20.location.z += 0.3; c20.keyframe_insert("location", frame=29)
new = set(P.audit(sc, table, chars, stepped=MOV)["problems"]) - base
assert any("sh020: camera moves inside a still shot" in p for p in new), new
c20.animation_data_clear(); c20.location = loc0
P.key_block(MOV, 15)
assert any("keys outside shot starts" in p for p in set(P.audit(sc, table, chars, stepped=MOV)["problems"]) - base)
for o in MOV:
    for path in ("location", "rotation_euler", "scale"):
        o.keyframe_delete(path, frame=15)
sc.render.engine = "BLENDER_EEVEE"
assert any("render engine" in p for p in P.audit(sc, table, chars, stepped=MOV)["problems"])
sc.render.engine = "BLENDER_WORKBENCH"
lamp = bpy.data.objects.new("mood", bpy.data.lights.new("mood", "SPOT")); sc.collection.objects.link(lamp)
rep_l = P.audit(sc, table, chars, stepped=MOV)
assert rep_l["warnings"] and set(rep_l["problems"]) == base
bpy.data.objects.remove(lamp)
```

## P21. Storyboarding app template (replaces the open file, run last)

Ships an `Edit` scene (1 to 240, 24 fps) with scene strips of `Shot.001` and `Shot.002`, three shot
scenes each with a Grease Pencil object and a 50 mm camera, the Storyboarding workspace on Edit with
sync on (pin off there, on in Video Editing), auto-key on in shots and off in Edit. From the command
line: `blender --app-template Storyboarding`. Verified on 5.2.1: test_03 block 21; test_02
section 13.

```python
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "procedures.blend"), copy=True)
bpy.ops.wm.read_homefile(app_template="Storyboarding")
ws = bpy.data.workspaces["Storyboarding"]
assert ws.sequencer_scene.name == "Edit" and ws.use_scene_time_sync
assert not bpy.data.scenes["Edit"].tool_settings.use_keyframe_insert_auto
assert all(bpy.data.scenes[f"Shot.00{i}"].tool_settings.use_keyframe_insert_auto for i in range(3))
```
