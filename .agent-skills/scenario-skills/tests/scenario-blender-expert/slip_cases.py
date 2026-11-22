"""Keys a two-point foot with known contacts, runs bx_anim's slip helpers and writes the results.

Run by test_live_slip.py:
  blender -b --factory-startup --python-exit-code 1 -P slip_cases.py -- <animation scripts> <out.json>

The foot, 24 fps, scene units in meters:
  1-10   planted; from frame 7 the ankle rolls forward 1 cm and up 1.2 cm per frame, the ball
         stays
  11-18  swing at 8 cm
  19-20  skims down to 1 cm, still moving 4 cm per frame (not planted yet)
  21-30  planted, both points sliding 2 mm per frame sideways (18 mm over the range)
  31-34  swing at 8 cm
  35-36  down for two frames only (dropped by min_frames=3)
"""

import json
import sys

import bpy

SCRIPTS, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
sys.path.insert(0, SCRIPTS)
import bx_anim as A  # noqa: E402


def ankle_ball(f):
    """(ankle, ball) positions at frame f."""
    if f <= 10:
        roll = max(f - 6, 0)
        return (0.0, 0.01 * roll, 0.012 * roll), (0.0, 0.15, 0.0)
    if f <= 18:
        y = 0.04 + (0.38 - 0.04) * (f - 10) / 8
        return (0.0, y, 0.08), (0.0, y + 0.11, 0.08)
    if f <= 20:
        y = {19: 0.44, 20: 0.48}[f]
        return (0.0, y, 0.01), (0.0, y + 0.15, 0.01)
    if f <= 30:
        x = 0.002 * (f - 21)
        return (x, 0.5, 0.0), (x, 0.65, 0.0)
    if f <= 34:
        return (0.018, 0.5, 0.08), (0.018, 0.65, 0.08)
    return (0.018, 0.5, 0.0), (0.018, 0.65, 0.0)


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps, sc.render.fps_base = 24, 1.0
sc.frame_start, sc.frame_end = 1, 36
arm = bpy.data.armatures.new("Rig")
rig = bpy.data.objects.new("Rig", arm)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name in ("ankle", "ball"):
    b = arm.edit_bones.new(name)
    b.head, b.tail = (0.0, 0.0, 0.0), (0.0, 0.05, 0.0)  # along +Y: pose location is world offset
bpy.ops.object.mode_set(mode="OBJECT")
for f in range(1, 37):
    ankle, ball = ankle_ball(f)
    A.key_pose(rig, {"ankle": {"location": ankle}, "ball": {"location": ball}}, f, interpolation="LINEAR")

frames = range(1, 37)
foot = ("ankle", "ball")
out = {
    "height_only": A.foot_contacts(rig, foot, frames),
    "onset": A.foot_contacts(rig, foot, frames, onset=0.5),
    "ankle_only": A.foot_contacts(rig, ("ankle",), frames),
    # the clip cut at frame 20: the skim never slows under onset
    "cut_in_skim": A.foot_contacts(rig, foot, range(1, 21), min_frames=2),
    "cut_in_skim_onset": A.foot_contacts(rig, foot, range(1, 21), min_frames=2, onset=0.5),
    # the clip starting mid-skim: the first frame is moving, not planted
    "start_in_skim_onset": A.foot_contacts(rig, foot, range(19, 31), onset=0.5),
}
ranges = out["onset"]
out["slip_ankle"] = [round(r["slide"], 6) for r in A.foot_slip(rig, "ankle", ranges)]
with_ball = A.foot_slip(rig, "ankle", ranges, ball="ball")
out["slip_ball"] = [round(r["slide"], 6) for r in with_ball]
out["lift"] = [round(r["lift"], 6) for r in with_ball]
out["slip_height_only"] = [round(r["slide"], 6)
                           for r in A.foot_slip(rig, "ankle", out["height_only"], ball="ball")]
s = A.slip_summary(with_ball)
out["summary"] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in s.items()}
out["empty"] = A.slip_summary([])

with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
