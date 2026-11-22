extends RefCounted
## Physics and project gate for 3D worlds (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   gd_world.physics_gate(P)  ->  world_project.gd:gate
## Reads the 3D physics engine, ticks, gravity, layer names and every physics/jolt_physics_3d/* key, then
## PROVES which engine runs: Jolt returns face_index -1 on a concave ray hit unless
## physics/jolt_physics_3d/queries/enable_ray_cast_face_index is on; GodotPhysics3D returns the triangle.
## (PhysicsServer3D.get_class() says PhysicsServer3D under both engines, so the class name proves nothing.)


func gate(job) -> Dictionary:
	var engine := str(ProjectSettings.get_setting("physics/3d/physics_engine", "DEFAULT"))
	var ticks := int(ProjectSettings.get_setting("physics/common/physics_ticks_per_second", 60))
	var max_steps := int(ProjectSettings.get_setting("physics/common/max_physics_steps_per_frame", 8))
	var jolt_keys := {}
	for p in ProjectSettings.get_property_list():
		var n: String = p["name"]
		if n.begins_with("physics/jolt_physics_3d/"):
			jolt_keys[n] = ProjectSettings.get_setting(n)
	var layers := {}
	for i in range(1, 33):
		var key := "layer_names/3d_physics/layer_%d" % i
		var v := str(ProjectSettings.get_setting(key, ""))
		if v != "":
			layers[i] = v
	var probe: Dictionary = await _face_index_probe(job)
	var running := "unknown"
	var face_setting := bool(jolt_keys.get("physics/jolt_physics_3d/queries/enable_ray_cast_face_index", false))
	if probe.get("hit", false):
		if int(probe["face_index"]) == -1 and not face_setting:
			running = "Jolt Physics"
		elif int(probe["face_index"]) >= 0:
			running = "Jolt Physics" if face_setting and engine == "Jolt Physics" else "GodotPhysics3D"
	var flags: Array = []
	if engine != "Jolt Physics":
		flags.append("physics/3d/physics_engine is %s: a hand-written project.godot gets GodotPhysics3D; new-project default since 4.6 is Jolt" % engine)
	if ticks % 60 != 0:
		flags.append("physics ticks %d: prefer multiples of 60 (120, 180, 240) for smooth motion on 60 Hz displays" % ticks)
	if layers.is_empty():
		flags.append("no 3D physics layer names: name them (layer_names/3d_physics/layer_N) before building levels")
	return {"ok": true, "engine_setting": engine, "engine_running": running, "probe": probe, "ticks": ticks,
			"max_physics_steps_per_frame": max_steps, "gravity": ProjectSettings.get_setting("physics/3d/default_gravity", 9.8),
			"layers": layers, "jolt_settings": jolt_keys, "jolt_setting_count": jolt_keys.size(), "flags": flags}


func _face_index_probe(job) -> Dictionary:
	var body := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(BoxMesh.new().get_faces())
	cs.shape = shape
	body.add_child(cs)
	job.root.add_child(body)
	await job.wait_physics_frames(2)
	var space := body.get_world_3d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(Vector3(0.1, 5, 0.2), Vector3(0.1, -5, 0.2)))
	body.queue_free()
	if hit.is_empty():
		return {"hit": false}
	return {"hit": true, "face_index": hit.get("face_index", -2), "normal": hit["normal"], "position": hit["position"]}


## Compile every .gd under root (default the world kit itself; agent_audit.gd:scripts skips agentkit).
func compile(job) -> Dictionary:
	job.expect_errors = true
	var root: String = job.arg("root", "res://addons/agentkit/world")
	var files: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		for sub in DirAccess.get_directories_at(d):
			stack.append(d.path_join(sub))
		for f in DirAccess.get_files_at(d):
			if f.ends_with(".gd"):
				files.append(d.path_join(f))
	var failed: Array = []
	for f in files:
		var before: int = job.captured_error_count()
		# Compile a pathless copy: reloading a script by path while it runs (this module) breaks the call.
		var s := GDScript.new()
		s.source_code = FileAccess.get_file_as_string(f)
		var err := s.reload()
		var errs: Array = job.captured_errors().slice(before)
		if err != OK or not errs.is_empty():
			var msgs: Array = []
			for e in errs.slice(0, 5):
				msgs.append("%s:%s %s" % [e.get("file", ""), e.get("line", ""), e["message"]])
			failed.append({"path": f, "errors": msgs})
	return {"ok": failed.is_empty(), "checked": files.size(), "failed": failed}
