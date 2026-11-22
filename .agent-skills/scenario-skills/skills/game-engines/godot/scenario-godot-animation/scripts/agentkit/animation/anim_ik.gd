extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): SkeletonModifier3D IK set up in code and measured headless.
##
## legs(job)  args scene (character with AnimationPlayer + Armature/Skeleton3D), anim ("idle"), time (0.0),
##            ground [{"pos":[x,y,z], "size":[x,y,z], "rot_x_deg":0}] static boxes, influence (1.0),
##            placer (true: foot_placer.gd before the IK), save ("" or res://...tscn to keep the rig)
##   Adds FootPlacer + TwoBoneIK3D (2 settings: UpperLeg > LowerLeg > Foot, pole marker in front of the
##   knee, pole direction +Z on the shin). Reports three reads of the feet and hips: inside
##   modification_processed (the IK result at 100%, before influence), in Skeleton3D.skeleton_updated (the
##   final pose that skins the mesh: use this one), and from plain code a frame later (the animated pose:
##   modifier output is not kept in the bone poses). foot_error_m = |final foot - target|.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const FootPlacer = preload("res://addons/agentkit/animation/foot_placer.gd")


static func add_leg_ik(sk: Skeleton3D, owner_root: Node3D, placer: bool) -> Dictionary:
	var made := {}
	var fp: Node = null
	if placer:
		fp = FootPlacer.new()
		fp.name = "FootPlacer"
		sk.add_child(fp)
	var ik := TwoBoneIK3D.new()
	ik.name = "LegIK"
	sk.add_child(ik)
	ik.setting_count = 2
	var tpaths: Array[NodePath] = []
	var i := 0
	for side in ["Left", "Right"]:
		var target := Marker3D.new()
		target.name = side + "FootTarget"
		owner_root.add_child(target)
		var pole := Marker3D.new()
		pole.name = side + "KneePole"
		owner_root.add_child(pole)
		var foot := sk.find_bone(side + "Foot")
		var knee := sk.find_bone(side + "LowerLeg")
		target.global_position = sk.global_transform * sk.get_bone_global_pose(foot).origin
		pole.global_position = sk.global_transform * sk.get_bone_global_pose(knee).origin + owner_root.global_basis.z * 0.6
		ik.set_root_bone_name(i, side + "UpperLeg")
		ik.set_middle_bone_name(i, side + "LowerLeg")
		ik.set_end_bone_name(i, side + "Foot")
		ik.set_target_node(i, ik.get_path_to(target))
		ik.set_pole_node(i, ik.get_path_to(pole))
		ik.set_pole_direction(i, SkeletonModifier3D.SECONDARY_DIRECTION_PLUS_Z)
		if fp:
			tpaths.append(fp.get_path_to(target))
		made[side] = {"target": target, "pole": pole}
		i += 1
	if fp:
		fp.targets = tpaths
	made["ik"] = ik
	made["placer"] = fp
	return made


func legs(job) -> Dictionary:
	var inst := (load(str(job.arg("scene", "res://anim/hero.tscn"))) as PackedScene).instantiate() as Node3D
	job.root.add_child(inst)
	for g in job.arg("ground", [{"pos": [0, -0.5, 0], "size": [4, 1, 4]}]):
		var body := StaticBody3D.new()
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = _v(g["size"])
		cs.shape = box
		body.add_child(cs)
		var mi := MeshInstance3D.new()                # visible in captures of the saved rig
		var bm := BoxMesh.new()
		bm.size = box.size
		mi.mesh = bm
		body.add_child(mi)
		body.name = "Ground%d" % inst.get_child_count()
		inst.add_child(body)
		body.global_position = _v(g["pos"])
		body.rotation_degrees.x = float(g.get("rot_x_deg", 0.0))
	var sk := inst.get_node("Armature/Skeleton3D") as Skeleton3D
	var player := inst.get_node("AnimationPlayer") as AnimationPlayer
	player.play(str(job.arg("anim", "idle")))
	player.seek(float(job.arg("time", 0.0)), true)
	player.pause()
	await job.wait_frames(1)
	var animated := _feet(sk)
	var rig := add_leg_ik(sk, inst, job.arg("placer", true))
	var ik: TwoBoneIK3D = rig["ik"]
	ik.influence = float(job.arg("influence", 1.0))
	if job.arg("deltas", {}) is Dictionary:
		for side in job.arg("deltas", {}):            # move a target by hand (no placer): {"Left": [0, .2, 0]}
			rig[side]["target"].global_position += _v(job.arg("deltas")[side])
	var inside := {}
	ik.modification_processed.connect(func():
		inside.merge(_feet(sk), true)                 # lambdas capture by value: mutate, never reassign
		inside["fired"] = int(inside.get("fired", 0)) + 1
		inside["targets"] = {"Left": rig["Left"]["target"].global_position, "Right": rig["Right"]["target"].global_position})
	var final := {}
	sk.skeleton_updated.connect(func(): final.merge(_feet(sk), true))   # final pose, after every modifier and influence
	for k in 4:
		await job.physics_frame
	await job.wait_frames(3)
	var outside := _feet(sk)
	if not inside.has("targets"):
		return {"ok": false, "error": "modification_processed never fired (modifier inactive or skeleton not processing)"}
	var err := {}
	for side in ["Left", "Right"]:
		err[side] = (final[side + "Foot"] as Vector3).distance_to(inside["targets"][side])
	var res := {"ok": true, "animated": animated, "inside_signal": inside, "outside_signal": outside, "final": final, "foot_error_m": err,
		"hips_drop_from_animated": final["Hips"].y - animated["Hips"].y,
		"placer": rig["placer"].last if rig["placer"] else {}}
	if str(job.arg("save", "")) != "":
		inst.get_parent().remove_child(inst)
		res["saved"] = AgentBuild.save_scene(inst, str(job.arg("save")))
		inst.free()
	else:
		inst.queue_free()
	await job.wait_frames(1)
	return res


static func _feet(sk: Skeleton3D) -> Dictionary:
	var d := {}
	for b in ["Hips", "LeftFoot", "RightFoot", "LeftLowerLeg", "RightLowerLeg"]:
		d[b] = sk.global_transform * sk.get_bone_global_pose(sk.find_bone(b)).origin
	return d


static func _v(a) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))
