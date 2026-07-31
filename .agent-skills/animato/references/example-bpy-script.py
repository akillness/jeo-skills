# Reference shape of a script that satisfies the Animato contract and the static gate.
# It is illustrative: bone names, axes, and timing always come from the /api/prompt dump
# for the specific model, never from this file.
import math

import bpy

MODEL = "public/upload/X-Bot.fbx"  # exact path handed over by /api/prompt
FPS = 24
FRAME_START = 1
FRAME_END = 48

# 1. start from an empty scene so nothing from a previous run leaks in
bpy.ops.wm.read_factory_settings(use_empty=True)

# 2. import the uploaded model from the exact path given in the prompt
bpy.ops.import_scene.fbx(filepath=MODEL)

armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="POSE")

arm_bone = armature.pose.bones["mixamorig:RightArm"]
forearm = armature.pose.bones["mixamorig:RightForeArm"]
for bone in (arm_bone, forearm):
    bone.rotation_mode = "XYZ"

# 3. keyframe the pose bones — a raised arm that waves twice
scene = bpy.context.scene
scene.frame_start = FRAME_START
scene.frame_end = FRAME_END
scene.render.fps = FPS

for frame in range(FRAME_START, FRAME_END + 1, 6):
    scene.frame_set(frame)
    phase = (frame - FRAME_START) / (FRAME_END - FRAME_START)
    arm_bone.rotation_euler = (0.0, 0.0, math.radians(-70.0 * min(phase * 3.0, 1.0)))
    forearm.rotation_euler = (0.0, 0.0, math.radians(25.0 * math.sin(phase * math.tau * 2.0)))
    arm_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    forearm.keyframe_insert(data_path="rotation_euler", frame=frame)

bpy.ops.object.mode_set(mode="OBJECT")

# 4. export with the animation baked in, overwriting the uploaded file in place
bpy.ops.export_scene.fbx(
    filepath=MODEL,
    bake_anim=True,
    bake_anim_use_all_actions=False,
    add_leaf_bones=False,
)
print("exported", MODEL)
