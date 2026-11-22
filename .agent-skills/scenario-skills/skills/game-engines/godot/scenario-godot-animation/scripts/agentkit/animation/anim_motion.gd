extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): root motion and foot sliding, measured headless.
##
## root_motion(job)  args scene, anim ("walk_rm"), track ("Armature/Skeleton3D:Root"), seconds (3.0),
##                   dt (1/60), motion_scale (null = keep), body (true: drive a CharacterBody3D on a floor)
##   Plays the clip with AnimationMixer.root_motion_track set, sums get_root_motion_position() each step,
##   moves a CharacterBody3D with velocity = (basis * root_motion) / delta and move_and_slide(), and reports
##   distance per loop, body travel, and whether the Root bone itself stayed at the origin in the pose.
## foot_speed(job)   args scene, anims (["walk", "run"]), feet (["LeftFoot", "RightFoot"]), samples (120),
##                   contact_eps (0.005 m above the lowest foot height)
##   For IN-PLACE clips: the planted foot slides backwards at the speed the character must move for no
##   foot sliding. Returns the median planted-foot speed per clip (m/s).

func _feet_y(sk: Skeleton3D, bi: int) -> Vector3:
	return sk.global_transform * sk.get_bone_global_pose(bi).origin


func root_motion(job) -> Dictionary:
	var inst := (load(str(job.arg("scene", "res://anim/hero.tscn"))) as PackedScene).instantiate() as Node3D
	var anim: String = job.arg("anim", "walk_rm")
	var dt: float = job.arg("dt", 1.0 / 60.0)
	var seconds: float = job.arg("seconds", 3.0)
	var use_body: bool = job.arg("body", true)
	var holder: Node3D = inst
	var body: CharacterBody3D = null
	if use_body:
		var floor_body := StaticBody3D.new()
		var fcs := CollisionShape3D.new()
		var fb := BoxShape3D.new()
		fb.size = Vector3(40, 1, 40)
		fcs.shape = fb
		floor_body.add_child(fcs)
		floor_body.position.y = -0.5
		job.root.add_child(floor_body)
		body = CharacterBody3D.new()
		var cs := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.3
		cap.height = 1.8
		cs.shape = cap
		cs.position.y = 0.9
		body.add_child(cs)
		body.add_child(inst)
		job.root.add_child(body)
		body.position.y = 0.01
		holder = body
	else:
		job.root.add_child(inst)
	var sk := inst.get_node("Armature/Skeleton3D") as Skeleton3D
	if job.arg("motion_scale", null) != null:
		sk.motion_scale = float(job.arg("motion_scale"))
	var player := inst.get_node("AnimationPlayer") as AnimationPlayer
	player.root_motion_track = NodePath(str(job.arg("track", "Armature/Skeleton3D:Root")))
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	for k in 3:
		await job.physics_frame
	player.play(anim)
	player.advance(0.0)
	var length := player.get_animation(anim).length
	var total := Vector3.ZERO
	var per_loop: Array = []
	var loop_start := Vector3.ZERO
	var t := 0.0
	var root_bone := sk.find_bone("Root")
	var root_bone_max := 0.0
	var start_pos := holder.global_position
	var steps := int(round(seconds / dt))
	for i in steps:
		player.advance(dt)
		var rm := player.get_root_motion_position()
		total += rm
		if body:
			body.velocity = (body.global_basis * rm) / dt
			body.velocity.y -= 9.8 * dt                    # keep it on the floor; root motion carries only XZ here
			body.move_and_slide()
		if root_bone >= 0:
			root_bone_max = maxf(root_bone_max, sk.get_bone_pose_position(root_bone).length())
		t += dt
		if t + 1e-6 >= length * (per_loop.size() + 1):
			per_loop.append(snappedf((total - loop_start).length(), 0.0001))
			loop_start = total
	var travel := holder.global_position - start_pos
	var res := {"ok": true, "anim": anim, "length": length, "seconds": seconds, "root_motion_sum": total,
		"per_loop_m": per_loop, "speed_mps": total.length() / seconds, "body_travel": travel,
		"body_travel_xz_m": Vector2(travel.x, travel.z).length(), "root_bone_pose_offset_max_m": root_bone_max,
		"motion_scale": sk.motion_scale, "on_floor": body.is_on_floor() if body else null}
	holder.queue_free()
	await job.wait_frames(1)
	return res


func foot_speed(job) -> Dictionary:
	var inst := (load(str(job.arg("scene", "res://anim/hero.tscn"))) as PackedScene).instantiate() as Node3D
	job.root.add_child(inst)
	var sk := _skeleton(inst)
	var player := inst.get_node("AnimationPlayer") as AnimationPlayer
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	var n: int = job.arg("samples", 120)
	var eps: float = job.arg("contact_eps", 0.005)
	var out := {}
	for anim in job.arg("anims", ["walk", "run"]):
		if not player.has_animation(str(anim)):
			out[str(anim)] = {"error": "missing"}
			continue
		player.play(str(anim))
		var length := player.get_animation(str(anim)).length
		var speeds: Array = []
		for foot in job.arg("feet", ["LeftFoot", "RightFoot"]):
			var bi := sk.find_bone(str(foot))
			var pts: Array = []
			for i in range(n + 1):
				player.seek(length * float(i) / float(n), true)
				pts.append(sk.global_transform * sk.get_bone_global_pose(bi).origin)
			var ymin := INF
			for p in pts:
				ymin = minf(ymin, p.y)
			for i in range(n):
				var a: Vector3 = pts[i]
				var b: Vector3 = pts[i + 1]
				if a.y <= ymin + eps and b.y <= ymin + eps:
					speeds.append(Vector2(b.x - a.x, b.z - a.z).length() / (length / float(n)))
		speeds.sort()
		out[str(anim)] = {"length": length, "contact_samples": speeds.size(),
			"no_slide_speed_mps": speeds[speeds.size() / 2] if speeds.size() > 0 else null,
			"min": speeds[0] if speeds.size() > 0 else null, "max": speeds[-1] if speeds.size() > 0 else null,
			"motion_scale": sk.motion_scale}
	inst.queue_free()
	await job.wait_frames(1)
	return {"ok": true, "clips": out}


func _skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _skeleton(c)
		if s:
			return s
	return null
