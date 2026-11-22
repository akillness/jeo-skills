extends RefCounted
## Player scaffold and controller gym (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_player.gd:build_player   writes res://world/player/player.tscn (+ InputMap actions)
##   world_player.gd:controller_suite  builds a gym in memory and drives the player with a test brain:
##       flat run, look-down run, stair lanes (several step heights, step module on and off),
##       descent, ledge walk-off, ramps, jump apex, spring-arm wall. Run with --fixed-fps 60.

const W = preload("res://addons/agentkit/world/world_common.gd")
const CONTROLLER := "res://addons/agentkit/world/runtime/third_person_controller.gd"


func build_player(job) -> Dictionary:
	var path: String = job.arg("path", "res://world/player/player.tscn")
	var radius: float = job.arg("radius", 0.35)
	var height: float = job.arg("height", 1.8)
	var arm: float = job.arg("spring_length", 4.5)
	var world_mask: int = job.arg("world_mask", 1)
	var player_layer: int = job.arg("player_layer", 2)
	var root := CharacterBody3D.new()
	root.name = "Player"
	root.set_script(load(CONTROLLER))
	root.collision_layer = W.layer_bit(player_layer)
	root.collision_mask = world_mask
	root.floor_snap_length = job.arg("floor_snap_length", 0.2)
	var cs := CollisionShape3D.new()
	cs.name = "Collision"
	var cap := CapsuleShape3D.new()
	cap.radius = radius
	cap.height = height
	cs.shape = cap
	cs.position = Vector3(0, height * 0.5, 0)
	root.add_child(cs)
	var skin := Node3D.new()
	skin.name = "Skin"
	root.add_child(skin)
	var body_mesh := MeshInstance3D.new()
	body_mesh.name = "Body"
	var cm := CapsuleMesh.new()
	cm.radius = radius
	cm.height = height
	body_mesh.mesh = cm
	body_mesh.position = Vector3(0, height * 0.5, 0)
	body_mesh.material_override = W.flat_material(Color(0.2, 0.55, 0.9))
	skin.add_child(body_mesh)
	var nose := MeshInstance3D.new()
	nose.name = "FrontMarker"  # on +Z, the model front (Vector3.MODEL_FRONT)
	var nb := BoxMesh.new()
	nb.size = Vector3(0.2, 0.15, 0.25)
	nose.mesh = nb
	nose.position = Vector3(0, height * 0.8, radius + 0.08)
	nose.material_override = W.flat_material(Color(1.0, 0.8, 0.1))
	skin.add_child(nose)
	var pivot := Node3D.new()
	pivot.name = "CameraPivot"
	pivot.position = Vector3(0, job.arg("pivot_height", 1.5), 0)
	root.add_child(pivot)
	var sa := SpringArm3D.new()
	sa.name = "SpringArm3D"
	sa.spring_length = arm
	var sph := SphereShape3D.new()
	sph.radius = 0.3  # Octodemy ZCb12AHKMfE [00:07:40]: cuts ground clipping
	sa.shape = sph
	sa.collision_mask = world_mask
	sa.position = Vector3(0, 0, 0)
	pivot.add_child(sa)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.near = job.arg("camera_near", 0.1)
	cam.current = true
	sa.add_child(cam)
	root.set("pivot_height", job.arg("pivot_height", 1.5))
	var saved := W.save(root, path)
	root.free()
	var actions := {}
	if job.arg("write_input_map", true):
		actions = _write_input_map()
	return {"ok": saved.get("ok", false), "saved": saved, "input_actions": actions}


func _key(code: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.physical_keycode = code
	return e


func _axis(axis: JoyAxis, v: float) -> InputEventJoypadMotion:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = v
	e.device = -1
	return e


func _write_input_map() -> Dictionary:
	var spec := {
		"move_left": [_key(KEY_A), _axis(JOY_AXIS_LEFT_X, -1.0)],
		"move_right": [_key(KEY_D), _axis(JOY_AXIS_LEFT_X, 1.0)],
		"move_forward": [_key(KEY_W), _axis(JOY_AXIS_LEFT_Y, -1.0)],
		"move_back": [_key(KEY_S), _axis(JOY_AXIS_LEFT_Y, 1.0)],
		"look_left": [_axis(JOY_AXIS_RIGHT_X, -1.0)],
		"look_right": [_axis(JOY_AXIS_RIGHT_X, 1.0)],
		"look_up": [_axis(JOY_AXIS_RIGHT_Y, -1.0)],
		"look_down": [_axis(JOY_AXIS_RIGHT_Y, 1.0)],
	}
	var jump := InputEventJoypadButton.new()
	jump.button_index = JOY_BUTTON_A
	jump.device = -1
	spec["jump"] = [_key(KEY_SPACE), jump]
	var written := []
	for a in spec:
		var key: String = "input/" + a
		if not ProjectSettings.has_setting(key):
			ProjectSettings.set_setting(key, {"deadzone": 0.2, "events": spec[a]})
			written.append(a)
	if not written.is_empty():
		ProjectSettings.save()
	return {"written": written}


# ------------------------------------------------------------------ gym


func _box(parent: Node, name: String, size: Vector3, pos: Vector3, color: Color, rot_x_deg: float = 0.0) -> StaticBody3D:
	var b := StaticBody3D.new()
	b.name = name
	b.position = pos
	b.rotation_degrees = Vector3(rot_x_deg, 0, 0)
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	b.add_child(cs)
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = W.flat_material(color)
	b.add_child(mi)
	parent.add_child(b)
	return b


## Gym: floor top at y=0; lanes along -Z starting at z=-3: stairs of each step height (8 steps, tread
## 0.35 m), then a 1 m ledge lane, ramps at 40 and 50 degrees, a wall for the spring arm.
func build_gym(parent: Node, step_heights: Array, tread: float = 0.35) -> Dictionary:
	var gym := Node3D.new()
	gym.name = "Gym"
	parent.add_child(gym)
	_box(gym, "Floor", Vector3(120, 1, 120), Vector3(0, -0.5, 0), Color(0.5, 0.5, 0.5))
	var lanes := {}
	var x := 6.0
	for h: float in step_heights:
		var steps := 8
		for i in steps:
			var top := float(h) * (i + 1)
			_box(gym, "Step_%s_%d" % [str(h), i], Vector3(2.0, top, tread), Vector3(x, top * 0.5, -3.0 - tread * (i + 0.5)), Color(0.7, 0.6, 0.4))
		# landing at the top
		var top_h := float(h) * steps
		_box(gym, "Landing_%s" % str(h), Vector3(2.0, top_h, 3.0), Vector3(x, top_h * 0.5, -3.0 - tread * steps - 1.5), Color(0.6, 0.5, 0.35))
		# end wall so the player stops on the landing (descent test starts there)
		_box(gym, "LandingWall_%s" % str(h), Vector3(2.0, top_h + 3.0, 0.5), Vector3(x, (top_h + 3.0) * 0.5, -3.0 - tread * steps - 3.25), Color(0.8, 0.3, 0.3))
		lanes[str(h)] = {"x": x, "top": top_h, "end_z": -3.0 - tread * steps - 1.5}
		x += 5.0
	# ledge lane: 1 m platform from z=0 to z=-6, player walks off its -Z edge
	_box(gym, "Ledge", Vector3(2.0, 1.0, 6.0), Vector3(-6.0, 0.5, -3.0), Color(0.4, 0.6, 0.4))
	lanes["ledge"] = {"x": -6.0, "top": 1.0, "edge_z": -6.0}
	# ramps: 6 m long, rising toward -Z
	for deg: float in [40.0, 50.0]:
		var rx := -12.0 - (deg - 40.0) * 0.5
		var length := 6.0
		var r := deg_to_rad(deg)
		var b := _box(gym, "Ramp_%d" % int(deg), Vector3(2.0, 0.2, length), Vector3(rx, sin(r) * length * 0.5, -3.0 - cos(r) * length * 0.5), Color(0.5, 0.4, 0.6), deg)
		lanes["ramp_%d" % int(deg)] = {"x": rx, "top": sin(r) * length}
		b.set_meta("deg", deg)
	# wall 2 m behind a spawn at (0, 0, 20) for the spring arm (camera sits at +Z of the pivot)
	_box(gym, "Wall", Vector3(8, 6, 0.5), Vector3(0, 3, 22.25), Color(0.8, 0.3, 0.3))
	lanes["wall"] = {"spawn": [0, 0, 20], "wall_z": 22.0}
	return lanes


func _spawn(job, scene_root: Node, at: Vector3) -> CharacterBody3D:
	var p: CharacterBody3D = load(job.arg("player", "res://world/player/player.tscn")).instantiate()
	p.use_player_input = false
	if job.arg("floor_snap_length", -1.0) >= 0.0:
		p.floor_snap_length = job.arg("floor_snap_length", 0.2)
	if job.arg("max_step_height", -1.0) >= 0.0:
		p.max_step_height = job.arg("max_step_height", 0.45)
	scene_root.add_child(p)
	p.global_position = at
	return p


func _drive(job, p: CharacterBody3D, input: Vector2, frames: int, pitch_deg: float = -15.0) -> Dictionary:
	var pivot := p.get_node("CameraPivot") as Node3D
	pivot.rotation = Vector3(deg_to_rad(pitch_deg), 0, 0)
	var ys: Array = []
	var speeds: Array = []
	var floor_frames := 0
	var max_dy := 0.0
	var prev_y := p.global_position.y
	for i in frames:
		p.move_input = input
		await job.physics_frame
		var y := p.global_position.y
		ys.append(snappedf(y, 0.001))
		speeds.append(snappedf(Vector2(p.velocity.x, p.velocity.z).length(), 0.001))
		max_dy = maxf(max_dy, absf(y - prev_y))
		prev_y = y
		if p.is_on_floor():
			floor_frames += 1
	p.move_input = Vector2.ZERO
	return {"final": p.global_position, "y_max": ys.max() if not ys.is_empty() else 0.0, "speed_max": speeds.max() if not speeds.is_empty() else 0.0,
			"speed_end": speeds[-1] if not speeds.is_empty() else 0.0, "floor_ratio": float(floor_frames) / max(frames, 1),
			"max_dy_per_frame": max_dy, "ys": ys}


func controller_suite(job) -> Dictionary:
	var heights: Array = job.arg("step_heights", [0.1, 0.25, 0.45, 0.6])
	var level := Node3D.new()
	level.name = "GymRoot"
	job.root.add_child(level)
	var lanes := build_gym(level, heights)
	await job.wait_physics_frames(2)
	var out := {"lanes": lanes, "engine": ProjectSettings.get_setting("physics/3d/physics_engine")}
	var step_on: bool = job.arg("step_enabled", true)

	# 1 flat run and 2 look-down run
	var p := _spawn(job, level, Vector3(0, 0.05, 10))
	p.step_enabled = step_on
	await job.wait_physics_frames(20)
	var flat: Dictionary = await _drive(job, p, Vector2(0, -1), 90, -15.0)
	flat.erase("ys")
	out["flat"] = flat
	p.global_position = Vector3(0, 0.05, 10)
	p.velocity = Vector3.ZERO
	await job.wait_physics_frames(10)
	var down: Dictionary = await _drive(job, p, Vector2(0, -1), 90, -60.0)
	down.erase("ys")
	out["look_down"] = down
	# 7 jump apex
	p.global_position = Vector3(0, 0.05, 10)
	p.velocity = Vector3.ZERO
	await job.wait_physics_frames(10)
	var y0 := p.global_position.y
	p.jump_pressed = true
	var apex := y0
	for i in 90:
		await job.physics_frame
		apex = maxf(apex, p.global_position.y)
	out["jump"] = {"apex_m": apex - y0, "expected_m": pow(p.jump_velocity, 2) / (2.0 * absf(p.get_gravity().y))}
	p.queue_free()

	# 3 stair lanes, step module on and off
	var stairs := {}
	for mode in [true, false]:
		for h in heights:
			var lane: Dictionary = lanes[str(h)]
			var sp := _spawn(job, level, Vector3(lane["x"], 0.05, -1.0))
			sp.step_enabled = mode
			await job.wait_physics_frames(10)
			var r: Dictionary = await _drive(job, sp, Vector2(0, -1), 150, -15.0)
			var climbed: bool = float(r["y_max"]) > float(lane["top"]) - 0.1
			stairs["%s_%s" % ["module" if mode else "stock", str(h)]] = {"step_h": h, "climbed": climbed, "final_y": r["final"].y,
					"top": lane["top"], "y_max": r["y_max"], "steps_up": sp.steps_up, "max_dy_per_frame": r["max_dy_per_frame"], "speed_end": r["speed_end"]}
			# 4 descent from the landing back down (only where it climbed)
			if climbed:
				var air := 0
				var pivot := sp.get_node("CameraPivot") as Node3D
				pivot.rotation = Vector3(deg_to_rad(-15.0), PI, 0)
				var trace: Array = []
				for i in 120:
					sp.move_input = Vector2(0, -1)
					await job.physics_frame
					if not sp.is_on_floor():
						air += 1
					trace.append("%.2f%s" % [sp.global_position.y, "" if sp.is_on_floor() else "*"])
				if job.arg("trace", false):
					stairs["%s_%s" % ["module" if mode else "stock", str(h)]]["descent_trace"] = " ".join(trace)
				stairs["%s_%s" % ["module" if mode else "stock", str(h)]]["descent_airborne_frames"] = air
				stairs["%s_%s" % ["module" if mode else "stock", str(h)]]["steps_down"] = sp.steps_down
				stairs["%s_%s" % ["module" if mode else "stock", str(h)]]["descent_final_y"] = sp.global_position.y
			sp.queue_free()
			await job.wait_physics_frames(1)
	out["stairs"] = stairs

	# 5 ledge walk-off: falls under gravity, no snap
	var lp := _spawn(job, level, Vector3(-6.0, 1.05, -1.0))
	lp.step_enabled = step_on
	await job.wait_physics_frames(10)
	var ledge: Dictionary = await _drive(job, lp, Vector2(0, -1), 90, -15.0)
	var ys: Array = ledge["ys"]
	var big_drop := 0.0
	for i in range(1, ys.size()):
		big_drop = maxf(big_drop, float(ys[i - 1]) - float(ys[i]))
	out["ledge"] = {"steps_down": lp.steps_down, "largest_drop_per_frame": big_drop, "final_y": ledge["final"].y}
	lp.queue_free()

	# 6 ramps
	var ramps := {}
	for deg: int in [40, 50]:
		var lane2: Dictionary = lanes["ramp_%d" % deg]
		var rp := _spawn(job, level, Vector3(lane2["x"], 0.05, -1.0))
		rp.step_enabled = step_on
		await job.wait_physics_frames(10)
		var rr: Dictionary = await _drive(job, rp, Vector2(0, -1), 150, -15.0)
		ramps[str(deg)] = {"y_max": rr["y_max"], "top": lane2["top"], "climbed": float(rr["y_max"]) > float(lane2["top"]) * 0.8}
		rp.queue_free()
	out["ramps"] = ramps

	# 8 spring arm against a wall 2 m behind the pivot
	var wp := _spawn(job, level, Vector3(0, 0.05, 20))
	await job.wait_physics_frames(10)
	var sa := wp.get_node("CameraPivot/SpringArm3D") as SpringArm3D
	var cam := sa.get_node("Camera3D") as Camera3D
	(wp.get_node("CameraPivot") as Node3D).rotation = Vector3.ZERO
	await job.wait_physics_frames(5)
	out["spring_arm"] = {"spring_length": sa.spring_length, "hit_length": sa.get_hit_length(),
			"camera_to_pivot": cam.global_position.distance_to(sa.global_position), "wall_distance": 22.0 - wp.global_position.z}
	wp.queue_free()
	level.queue_free()
	await job.wait_frames(1)
	out["ok"] = true
	return out


## Save the gym with a player and a review camera (for captures).
func save_gym(job) -> Dictionary:
	var path: String = job.arg("path", "res://world/player/gym.tscn")
	var root := Node3D.new()
	root.name = "GymScene"
	var lanes := build_gym(root, job.arg("step_heights", [0.1, 0.18, 0.25, 0.45, 0.6]))
	var p: Node3D = load(job.arg("player", "res://world/player/player.tscn")).instantiate()
	p.position = Vector3(0, 0, -1)
	root.add_child(p)
	var cam := p.get_node("CameraPivot/SpringArm3D/Camera3D") as Camera3D
	cam.current = false
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45, -25, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var review := Camera3D.new()
	review.name = "ReviewCam"
	root.add_child(review)
	review.look_at_from_position(Vector3(34, 12, 12), Vector3(8, 1.5, -6), Vector3.UP)
	review.current = true
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = Sky.new()
	e.sky.sky_material = ProceduralSkyMaterial.new()
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.environment = e
	root.add_child(env)
	var saved := W.save(root, path)
	root.free()
	return {"ok": saved.get("ok", false), "path": path, "lanes": lanes}
