extends SkeletonModifier3D
## scenario-godot-animation 0.1 (Godot 4.7.2): keep modifier output across frames.
## Skeleton3D rolls modifier output back every frame (Fair Fight XFZQNsFejwk 00:02:04), which is what you
## want for post effects over an AnimationPlayer, but not when modifiers build the pose themselves
## (incremental motion, pose hold). Put a PosePersist with role RESTORE first under Skeleton3D and one with
## role SNAPSHOT last: the restore re-applies last frame's final pose before the other modifiers run.
enum Role { RESTORE, SNAPSHOT }
@export var role: Role = Role.SNAPSHOT
static var _poses := {}   # Skeleton3D instance id -> Array of bone pose Transform3D

func _process_modification_with_delta(_delta: float) -> void:
	var sk := get_skeleton()
	if sk == null:
		return
	var id := sk.get_instance_id()
	if role == Role.SNAPSHOT:
		var a := []
		for b in sk.get_bone_count():
			a.append(sk.get_bone_pose(b))
		_poses[id] = a
	elif _poses.has(id):
		var a: Array = _poses[id]
		for b in mini(a.size(), sk.get_bone_count()):
			sk.set_bone_pose(b, a[b])

func _exit_tree() -> void:
	var sk := get_skeleton()
	if sk and role == Role.SNAPSHOT:
		_poses.erase(sk.get_instance_id())
