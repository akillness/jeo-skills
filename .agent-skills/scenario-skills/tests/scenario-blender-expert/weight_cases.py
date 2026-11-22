"""Builds symmetric weighted grids, runs bx_rig.weight_report and mirror_name, writes the results.

Run by test_live_weights.py:
  blender -b --factory-startup --python-exit-code 1 -P weight_cases.py -- <rigging scripts> <out.json>
"""

import json
import sys

import bmesh
import bpy

SCRIPTS, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
sys.path.insert(0, SCRIPTS)
import bx_rig as R  # noqa: E402

NAMES = ["upper_arm.L", "upper_arm.R", "DEF-lid.T.L.001", "f_index.01.R", "clavicle_l", "thigh_r",
         "foot-L", "spine_01", "head", "lowerarm_l.001"]


def rig(left, right):
    arm = bpy.data.armatures.new("Rig")
    obj = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, x in ((left, 0.5), (right, -0.5)):
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = (x, 0, 0), (x, 0, 0.2)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def grid(name, left, right, left_weight=1.0):
    """A 2 m grid symmetric across X: +X on `left`, -X on `right`, the center shared."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=12, y_segments=12, size=1.0)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    gl, gr = obj.vertex_groups.new(name=left), obj.vertex_groups.new(name=right)
    for v in me.vertices:
        if v.co.x > 1e-4:
            gl.add([v.index], left_weight, "REPLACE")
        elif v.co.x < -1e-4:
            gr.add([v.index], 1.0, "REPLACE")
        else:
            gl.add([v.index], 0.5, "REPLACE")
            gr.add([v.index], 0.5, "REPLACE")
    return obj


def report(left, right, left_weight=1.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    r = R.weight_report(grid("Body", left, right, left_weight), rig(left, right), expect_inside=False)
    return {k: r[k] for k in ("mirror_err", "mirror_pairs_sampled")}


result = {
    "names": {n: R.mirror_name(n) for n in NAMES},
    "engine": report("clavicle_l", "clavicle_r"),
    "engine_planted": report("clavicle_l", "clavicle_r", left_weight=0.4),
    "blender": report("upper_arm.L", "upper_arm.R"),
}
with open(OUT, "w") as f:
    json.dump(result, f, indent=1)
