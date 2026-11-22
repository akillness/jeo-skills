"""Blender side of the Roblox animation bridge. Run headless:

    blender -b --factory-startup --python blender_roblox_anim.py -- <command> [options]

Commands (each prints one line `RBXANIM_JSON <json>` for rbx_animation.py to parse):
    make-test-rig --out rig.blend [--bad]   small creature: armature, skinned boxes, one 24 fps action
                                             (--bad: 60 fps, scale keys, 5 influences, Root weights)
    audit --blend rig.blend                  fps, frame range, actions, NLA, scale keys, influences
    export --blend rig.blend --out a.fbx [--with-mesh] [--leaf-bones]
                                             FBX with the Roblox animation settings (armature only;
                                             --leaf-bones reproduces the Blender default for comparison)
    inspect-fbx --fbx a.fbx                  re-import into an empty scene: bones, leaf bones, frames
    sample --blend rig.blend --out s.json [--scale 1] [--action NAME]
                                             rest frames and per-frame local poses in Roblox space

Axes: Roblox Y up and -Z forward; Blender Z up and -Y forward. A Blender world vector (x, y, z) is
(-x, z, y) in Roblox, which keeps a character facing Blender -Y facing Roblox -Z. Bone frames keep
Blender's convention (local Y along the bone), so pose rotations need no conversion.
"""
from __future__ import annotations

import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

C = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))


def emit(obj) -> None:
    print("RBXANIM_JSON " + json.dumps(obj))


def args() -> dict:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"cmd": argv[0] if argv else ""}
    i = 1
    while i < len(argv):
        k = argv[i].lstrip("-").replace("-", "_")
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            out[k] = argv[i + 1]
            i += 2
        else:
            out[k] = True
            i += 1
    return out


def armature() -> bpy.types.Object:
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise SystemExit(f"expected one armature, found {len(arms)}")
    return arms[0]


# ------------------------------------------------------------------ test rig
BONES = [
    # name, parent, head, tail (Blender metres; the creature faces -Y)
    ("Root", None, (0, 0, 0.0), (0, 0, 0.4)),
    ("Body", "Root", (0, 0, 0.8), (0, -0.9, 0.8)),
    ("Neck", "Body", (0, -0.9, 0.8), (0, -1.2, 1.2)),
    ("Head", "Neck", (0, -1.2, 1.2), (0, -1.6, 1.25)),
    ("Tail1", "Body", (0, 0.0, 0.8), (0, 0.5, 0.9)),
    ("Tail2", "Tail1", (0, 0.5, 0.9), (0, 1.0, 1.0)),
    ("LegFL", "Body", (0.3, -0.75, 0.8), (0.3, -0.75, 0.0)),
    ("LegFR", "Body", (-0.3, -0.75, 0.8), (-0.3, -0.75, 0.0)),
    ("LegBL", "Body", (0.3, -0.1, 0.8), (0.3, -0.1, 0.0)),
    ("LegBR", "Body", (-0.3, -0.1, 0.8), (-0.3, -0.1, 0.0)),
]


def make_test_rig(out: str, bad: bool = False) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 60 if bad else 24
    scene.frame_start, scene.frame_end = 0, (60 if bad else 24)
    arm_data = bpy.data.armatures.new("CreatureArmature")
    arm = bpy.data.objects.new("Creature", arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, parent, head, tail in BONES:
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = eb[parent]
        eb[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    # One box per bone, skinned to its bone (and, near joints, to the parent).
    for name, parent, head, tail in BONES[1:]:
        h, t = Vector(head), Vector(tail)
        mid, length = (h + t) / 2, (t - h).length
        bpy.ops.mesh.primitive_cube_add(size=1, location=mid)
        box = bpy.context.active_object
        box.name = name + "_Geo"
        box.scale = (0.25, max(length, 0.2), 0.25) if abs((t - h).z) < abs((t - h).y) else (0.25, 0.25, max(length, 0.2))
        bpy.ops.object.transform_apply(scale=True)
        box.parent = arm
        mod = box.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        g = box.vertex_groups.new(name=name)
        g.add([v.index for v in box.data.vertices], 1.0, "REPLACE")
        if parent and parent != "Root":
            gp = box.vertex_groups.new(name=parent)
            near = [v.index for v in box.data.vertices if (box.matrix_world @ v.co - h).length < length * 0.6]
            gp.add(near, 0.3, "REPLACE")
        if bad and name == "Body":
            for extra in ("Neck", "Tail1", "LegFL", "LegFR"):
                box.vertex_groups.new(name=extra).add([0], 0.2, "REPLACE")
            box.vertex_groups.new(name="Root").add([1, 2], 0.5, "REPLACE")
    # Action: four-legged walk in place, tail swing, head nod. Bones rotate in their own axes.
    arm.animation_data_create()
    act = bpy.data.actions.new("Walk_24" if not bad else "Walk_60")
    act.use_fake_user = True
    arm.animation_data.action = act
    end = scene.frame_end
    pb = arm.pose.bones
    for pbone in pb:
        pbone.rotation_mode = "XYZ"
    for f in range(0, end + 1, max(1, end // 8)):
        ph = 2 * math.pi * f / end
        pb["Tail1"].rotation_euler = (0, 0, math.radians(25) * math.sin(ph))
        pb["Tail2"].rotation_euler = (0, 0, math.radians(35) * math.sin(ph - 0.8))
        pb["Neck"].rotation_euler = (math.radians(10) * math.sin(2 * ph), 0, 0)
        pb["Head"].rotation_euler = (0, 0, math.radians(15) * math.sin(ph))
        for leg, off in (("LegFL", 0), ("LegBR", 0), ("LegFR", math.pi), ("LegBL", math.pi)):
            pb[leg].rotation_euler = (math.radians(30) * math.sin(ph + off), 0, 0)
        pb["Body"].location = (0, 0.04 * math.sin(2 * ph), 0)
        for name in ("Tail1", "Tail2", "Neck", "Head", "LegFL", "LegFR", "LegBL", "LegBR"):
            pb[name].keyframe_insert("rotation_euler", frame=f)
        pb["Body"].keyframe_insert("location", frame=f)
        if bad:
            pb["Body"].scale = (1, 1 + 0.1 * math.sin(ph), 1)
            pb["Body"].keyframe_insert("scale", frame=f)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"ok": True, "out": out, "bones": len(BONES), "fps": scene.render.fps, "frames": end + 1}


# ------------------------------------------------------------------ audit
def audit(blend: str) -> dict:
    bpy.ops.wm.open_mainfile(filepath=blend)
    scene = bpy.context.scene
    arm = armature()
    findings = []
    fps = scene.render.fps / scene.render.fps_base
    if abs(fps - 24) > 1e-6 and abs(fps - 30) > 1e-6:
        findings.append({"severity": "warn", "rule": "fps", "message": f"scene at {fps:g} fps: every frame becomes a keyframe in Studio; 24 or 30"})
    actions = []
    scale_keys = []
    for act in bpy.data.actions:
        rng = tuple(act.frame_range)
        curves = list(_fcurves(act))
        actions.append({"name": act.name, "start": rng[0], "end": rng[1], "fake_user": act.use_fake_user, "fcurves": len(curves)})
        for fc in curves:
            if fc.data_path.endswith(".scale"):
                vals = {round(k.co[1], 5) for k in fc.keyframe_points}
                if vals != {1.0}:
                    scale_keys.append({"action": act.name, "path": fc.data_path, "values": sorted(vals)[:4]})
        if not act.use_fake_user and act.users == 0:
            findings.append({"severity": "warn", "rule": "orphan-action", "message": f"{act.name} has no user and no fake user: Blender drops it on save"})
    if scale_keys:
        findings.append({"severity": "warn", "rule": "scale-keys", "message": "scale keys other than 1: Roblox ignores animated scale"})
    nla = len(arm.animation_data.nla_tracks) if arm.animation_data else 0
    max_inf, over, root_w = 0, 0, 0
    bone_names = {b.name for b in arm.data.bones}
    root_names = {"Root", "HumanoidRootNode"}
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        groups = {g.index: g.name for g in ob.vertex_groups}
        for v in ob.data.vertices:
            infl = [g for g in v.groups if g.weight > 0 and groups.get(g.group) in bone_names]
            max_inf = max(max_inf, len(infl))
            over += len(infl) > 4
            root_w += any(groups.get(g.group) in root_names for g in infl)
    if over:
        findings.append({"severity": "error", "rule": "influences", "message": f"{over} vertices have more than 4 bone influences (Studio keeps 4)"})
    if root_w:
        findings.append({"severity": "error", "rule": "root-weights", "message": f"{root_w} vertices weighted to Root or HumanoidRootNode: dropped on import"})
    return {"ok": not any(f["severity"] == "error" for f in findings), "fps": fps, "frame_start": scene.frame_start,
            "frame_end": scene.frame_end, "actions": actions, "nla_tracks": nla, "scale_keys": scale_keys,
            "max_influences": max_inf, "bones": len(arm.data.bones), "findings": findings}


def _fcurves(act):
    # Blender 4.4+ layered actions keep F-curves in channelbags; older ones on act.fcurves.
    if hasattr(act, "layers") and len(act.layers):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    elif hasattr(act, "fcurves"):
        yield from act.fcurves


# ------------------------------------------------------------------ export
def export(blend: str, out: str, with_mesh: bool = False, leaf_bones: bool = False) -> dict:
    bpy.ops.wm.open_mainfile(filepath=blend)
    arm = armature()
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    types = {"ARMATURE"}
    if with_mesh:
        types.add("MESH")
        for ob in bpy.data.objects:
            if ob.type == "MESH" and ob.parent == arm:
                ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # Values from Mykaiju's export panel (NI7GXKLwk6U 00:24:30, 00:25:51), plus Add Leaf Bones off
    # and Simplify 0 from his speech (00:23:45 to 00:27:07). FBX_SCALE_NONE is the panel's "All Local".
    bpy.ops.export_scene.fbx(
        filepath=out, use_selection=True, object_types=types, global_scale=1.0,
        apply_scale_options="FBX_SCALE_NONE", axis_forward="-Z", axis_up="Y", apply_unit_scale=True,
        use_space_transform=True, bake_space_transform=False, add_leaf_bones=leaf_bones,
        bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False, bake_anim_force_startend_keying=True,
        bake_anim_step=1.0, bake_anim_simplify_factor=0.0, use_armature_deform_only=False)
    import os
    return {"ok": os.path.exists(out), "out": out, "bytes": os.path.getsize(out) if os.path.exists(out) else 0}


def inspect_fbx(fbx: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    bones = [b.name for a in arms for b in a.data.bones]
    acts = [{"name": a.name, "start": a.frame_range[0], "end": a.frame_range[1]} for a in bpy.data.actions]
    return {"ok": bool(arms), "armatures": len(arms), "bones": bones,
            "scale": [round(v, 4) for v in arms[0].scale] if arms else None,
            "leaf_bones": [b for b in bones if b.endswith("_end")], "actions": acts,
            "meshes": len([o for o in bpy.data.objects if o.type == "MESH"])}


# ------------------------------------------------------------------ sample
def _cf(pos: Vector, rot: Matrix) -> list:
    return [pos.x, pos.y, pos.z, rot[0][0], rot[0][1], rot[0][2], rot[1][0], rot[1][1], rot[1][2],
            rot[2][0], rot[2][1], rot[2][2]]


def sample(blend: str, out: str, scale: float = 1.0, action: str | None = None) -> dict:
    bpy.ops.wm.open_mainfile(filepath=blend)
    scene = bpy.context.scene
    arm = armature()
    if action:
        arm.animation_data.action = bpy.data.actions[action]
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    W = arm.matrix_world
    rest = []
    # Parents before children, so a builder can join each part to one that already exists.
    for b in sorted(arm.data.bones, key=lambda b: len(b.parent_recursive)):
        m = W @ b.matrix_local
        rot = C @ m.to_3x3().normalized()
        rest.append({"name": b.name, "parent": b.parent.name if b.parent else None,
                     "cframe": _cf(C @ m.translation * scale, rot), "length": b.length * scale})
    poses = {b.name: [] for b in arm.pose.bones}
    tails = {b.name: [] for b in arm.pose.bones}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for pbone in arm.pose.bones:
            mb = pbone.matrix_basis
            loc, q, _ = mb.decompose()
            loc = loc * scale
            # Roblox CFrame.new(x, y, z, qX, qY, qZ, qW)
            poses[pbone.name].append([loc.x, loc.y, loc.z, q.x, q.y, q.z, q.w])
            t = C @ (W @ pbone.tail) * scale
            tails[pbone.name].append([t.x, t.y, t.z])
    data = {"name": act.name, "fps": scene.render.fps / scene.render.fps_base, "frames": f1 - f0 + 1,
            "scale": scale, "rest": rest, "poses": poses, "tails": tails}
    with open(out, "w") as fh:
        json.dump(data, fh)
    return {"ok": True, "out": out, "frames": data["frames"], "fps": data["fps"], "bones": len(rest)}


def main() -> None:
    a = args()
    try:
        if a["cmd"] == "make-test-rig":
            emit(make_test_rig(a["out"], bool(a.get("bad"))))
        elif a["cmd"] == "audit":
            emit(audit(a["blend"]))
        elif a["cmd"] == "export":
            emit(export(a["blend"], a["out"], bool(a.get("with_mesh")), bool(a.get("leaf_bones"))))
        elif a["cmd"] == "inspect-fbx":
            emit(inspect_fbx(a["fbx"]))
        elif a["cmd"] == "sample":
            emit(sample(a["blend"], a["out"], float(a.get("scale", 1.0)), a.get("action")))
        else:
            emit({"ok": False, "error": f"unknown command {a['cmd']!r}"})
    except Exception as e:  # report, do not hang the runner
        import traceback
        emit({"ok": False, "error": str(e), "trace": traceback.format_exc()[-1500:]})


main()
