"""Poses a two-bone cylinder with a shape key and a Subdivision, runs bx_rig.apply_pose_as_rest.

Run by test_live_pose_rest.py:
  blender -b --factory-startup --python-exit-code 1 -P pose_rest_cases.py -- <rigging scripts> <out.json>
"""

import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

SCRIPTS, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
sys.path.insert(0, SCRIPTS)
import bx_rig as R  # noqa: E402


def scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.1, depth=1.0, location=(0, 0, 0.5))
    body = bpy.context.object
    bpy.ops.object.transform_apply(location=True)  # vertex z then runs 0 to 1, like the bones
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=8)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    R.activate(rig, "EDIT")
    lo = arm.edit_bones.new("lo")
    lo.head, lo.tail = (0, 0, 0), (0, 0, 0.5)
    hi = arm.edit_bones.new("hi")
    hi.head, hi.tail, hi.parent, hi.use_connect = (0, 0, 0.5), (0, 0, 1.0), lo, True
    R.activate(rig, "OBJECT")
    for name in ("lo", "hi"):
        g = body.vertex_groups.new(name=name)
        for v in body.data.vertices:
            w = min(max((v.co.z - 0.4) / 0.2, 0.0), 1.0)
            g.add([v.index], w if name == "hi" else 1.0 - w, "REPLACE")
    body.modifiers.new("Armature", "ARMATURE").object = rig
    body.modifiers.new("Subdivision", "SUBSURF")
    body.shape_key_add(name="Basis")
    key = body.shape_key_add(name="bulge", from_mix=False)
    for i, v in enumerate(body.data.vertices):
        if v.co.z > 0.7:
            key.data[i].co = v.co + Vector((v.co.x, v.co.y, 0.0)) * 0.5
    pb = rig.pose.bones["hi"]
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = (math.radians(40), 0, 0)
    return rig, body


def posed(body, key_value):
    """Vertex positions through the Armature alone, with the key at key_value."""
    sub = body.modifiers["Subdivision"]
    sub.show_viewport = False
    body.data.shape_keys.key_blocks["bulge"].value = key_value
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.array([v.co[:] for v in me.vertices])
    ev.to_mesh_clear()
    sub.show_viewport = True
    body.data.shape_keys.key_blocks["bulge"].value = 0.0
    return co


rig, body = scene()
refused = ""
try:
    R.activate(body)
    bpy.ops.object.modifier_apply(modifier="Armature")
except RuntimeError as e:
    refused = str(e).strip().splitlines()[-1]

before = {"basis": posed(body, 0.0), "key": posed(body, 1.0)}
tail = rig.matrix_world @ rig.pose.bones["hi"].tail

# a linked duplicate shares the mesh data: refused before anything changes
dup = body.copy()
bpy.context.scene.collection.objects.link(dup)
rest_co = np.array([v.co[:] for v in body.data.vertices])
shared_error = ""
try:
    R.apply_pose_as_rest(rig, [body, dup])
except ValueError as e:
    shared_error = str(e)
shared_untouched = (bool(np.array_equal(rest_co, np.array([v.co[:] for v in body.data.vertices])))
                    and rig.pose.bones["hi"].matrix_basis != rig.pose.bones["hi"].matrix_basis.Identity(4))
bpy.data.objects.remove(dup)

rewritten = R.apply_pose_as_rest(rig, [body, body])  # the same mesh twice is baked once
after = {"basis": posed(body, 0.0), "key": posed(body, 1.0)}
result = {
    "refused": refused,
    "shared_error": shared_error,
    "shared_untouched": shared_untouched,
    "rewritten": rewritten,
    "modifiers": [m.type for m in body.modifiers],
    "keys": [kb.name for kb in body.data.shape_keys.key_blocks],
    "rest_tail_moved": (rig.matrix_world @ rig.data.bones["hi"].tail_local - tail).length,
    "pose_cleared": all(pb.matrix_basis == pb.matrix_basis.Identity(4) for pb in rig.pose.bones),
    "basis_err": float(np.abs(after["basis"] - before["basis"]).max()),
    "key_err": float(np.abs(after["key"] - before["key"]).max()),
    "key_moves": float(np.abs(after["key"] - after["basis"]).max()),
}
with open(OUT, "w") as f:
    json.dump(result, f, indent=1)
