"""Builds a face with a few planted keys, runs the face-shape helpers and writes the results.

Run by test_live_face_shapes.py:
  blender -b --factory-startup --python-exit-code 1 -P face_cases.py -- <rigging scripts> <out.json> <tmp dir>
"""

import json
import os
import sys

import bmesh
import bpy
from mathutils import Vector

SCRIPTS, OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:3]
sys.path.insert(0, SCRIPTS)
import bx_rig as R  # noqa: E402


def face():
    """A 20 cm sphere, symmetric across X, with Basis and planted keys."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new("Face")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.1)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("Face", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.shape_key_add(name="Basis", from_mix=False)

    def key(name, pick, move):
        kb = obj.shape_key_add(name=name, from_mix=False)
        kb.value = 0.0
        for v, d in zip(me.vertices, kb.data):
            if pick(v.co):
                d.co = v.co + move
        return kb

    from mathutils import Vector
    key("eyeBlinkLeft", lambda c: c.x > 0.03 and c.z > 0.03, Vector((0, 0, -0.01)))
    key("jawLeft", lambda c: c.z < -0.05, Vector((0.01, 0, 0)))
    key("JawOpen", lambda c: c.z < -0.05, Vector((0, 0, -0.01)))
    # planted on the wrong side: the character's right is -X
    key("mouthSmileLeft", lambda c: c.x < -0.03 and -0.05 < c.z < 0, Vector((0, 0, 0.005)))
    key("customKey", lambda c: c.y < -0.08, Vector((0, -0.005, 0)))
    return obj


def keys(obj):
    return [kb.name for kb in obj.data.shape_keys.key_blocks]


def reimport(path, op, **kw):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    op(filepath=path, **kw)
    obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    return {"keys": keys(obj), "report": R.shape_report(obj)}


out = {}
obj = face()
out["before"] = R.shape_report(obj)
out["created"] = R.shape_set(obj, rename={"JawOpen": "jawOpen"})
out["created_values"] = sorted({obj.data.shape_keys.key_blocks[n].value for n in out["created"]})
out["unmatched"] = R.mirror_shape_key(obj, "eyeBlinkLeft", "eyeBlinkRight")
out["after"] = R.shape_report(obj)
out["second_call"] = R.shape_set(obj)
out["visemes_created"] = R.shape_set(obj, "visemes")
out["visemes"] = R.shape_report(obj, "visemes")

obj.select_set(True)
bpy.context.view_layer.objects.active = obj
fbx = os.path.join(TMP, "face.fbx")
glb = os.path.join(TMP, "face.glb")
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, add_leaf_bones=False)
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True)
out["fbx"] = reimport(fbx, bpy.ops.import_scene.fbx)
out["glb"] = reimport(glb, bpy.ops.import_scene.gltf)

bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new("Bare")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=0.2)
bm.to_mesh(me)
bm.free()
bare = bpy.data.objects.new("Bare", me)
bpy.context.scene.collection.objects.link(bare)
out["bare"] = R.shape_report(bare)

# A head on a T-pose bar 1.8 m wide: blinks that drift 0.2 mm along +X on both sides
# still read by the side they sit on, not by that drift.
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new("Body")
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.1)
head = len(bm.verts)
arms = bmesh.ops.create_cube(bm, size=1.0)["verts"]
bmesh.ops.scale(bm, vec=(1.8, 0.1, 0.1), verts=arms)
bmesh.ops.translate(bm, vec=(0, 0, -0.25), verts=arms)
bm.to_mesh(me)
bm.free()
body = bpy.data.objects.new("Body", me)
bpy.context.scene.collection.objects.link(body)
body.shape_key_add(name="Basis", from_mix=False)
for name, pick, move in (("eyeBlinkLeft", lambda c: c.x > 0.03 and c.z > 0.03, (0.0002, 0, -0.01)),
                         ("eyeBlinkRight", lambda c: c.x < -0.03 and c.z > 0.03, (0.0002, 0, -0.01)),
                         ("jawLeft", lambda c: c.z < -0.05, (0.01, 0, 0))):
    kb = body.shape_key_add(name=name, from_mix=False)
    for v, d in zip(list(me.vertices)[:head], kb.data):
        if pick(v.co):
            d.co = v.co + Vector(move)
out["body"] = R.shape_report(body)

with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
