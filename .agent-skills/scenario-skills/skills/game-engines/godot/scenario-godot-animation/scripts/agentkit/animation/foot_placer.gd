extends SkeletonModifier3D
## Foot placement (scenario-godot-animation 0.1, Godot 4.7.2). Put this BEFORE the TwoBoneIK3D in the Skeleton3D's
## children: modifiers run in child order, so this one moves the IK targets and lowers the hips, then the
## IK solves the legs to the targets.
##
## Each foot: ray straight down from the ANIMATED foot (plus ray_up above it); target = hit + ankle height
## (the animated foot's height above its own ground, so lifted swing feet stay lifted). The hips drop by
## the lowest negative correction, so the leg over a hole can still reach (else it straightens and floats).
## Tested with a step, a drop and a slope: see references/procedures.md.

@export var feet: Array[StringName] = [&"LeftFoot", &"RightFoot"]
@export var targets: Array[NodePath] = []          # one Node3D per foot, the TwoBoneIK3D targets
@export var hips: StringName = &"Hips"
@export var ankle_height := 0.08                     # foot bone height above the sole in the rest pose
@export var ray_up := 0.5
@export var ray_down := 1.0
@export_flags_3d_physics var mask := 1
@export var max_drop := 0.35

var last := {}                                       # per-frame report for tests and debug draws


func _process_modification_with_delta(_delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or not is_inside_tree():
		return
	var space := sk.get_world_3d().direct_space_state
	var xf := sk.global_transform
	var corrections: Array = []
	var hits: Array = []
	for i in feet.size():
		var bi := sk.find_bone(feet[i])
		if bi < 0:
			continue
		var animated: Vector3 = xf * sk.get_bone_global_pose(bi).origin
		var q := PhysicsRayQueryParameters3D.create(animated + Vector3.UP * ray_up, animated + Vector3.DOWN * ray_down, mask)
		var hit := space.intersect_ray(q)
		var lift := maxf(0.0, animated.y - xf.origin.y - ankle_height)   # swing height in the clip
		var target := animated
		if not hit.is_empty():
			target = Vector3(animated.x, hit.position.y + ankle_height + lift, animated.z)
		corrections.append(target.y - animated.y)
		hits.append(hit.get("position", null))
		var node := get_node_or_null(targets[i]) as Node3D if i < targets.size() else null
		if node:
			node.global_position = target
	var drop := 0.0
	for c in corrections:
		drop = minf(drop, c)
	drop = maxf(drop, -max_drop)
	var hb := sk.find_bone(hips)
	if hb >= 0 and drop < 0.0:
		var p := sk.get_bone_pose_position(hb)
		sk.set_bone_pose_position(hb, p + (xf.basis.inverse() * Vector3(0, drop, 0)))
	last = {"corrections": corrections, "hips_drop": drop, "hits": hits}
