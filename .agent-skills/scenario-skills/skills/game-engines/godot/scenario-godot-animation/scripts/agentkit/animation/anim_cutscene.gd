extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): a cutscene authored as one AnimationPlayer, built in code.
##
## build(job)  args hero ("res://anim/hero.tscn"), out ("res://anim/cutscene.tscn"), length (20.0)
##   Cutscene (Node3D) > Hero (instance), CamA, CamB, Director (cutscene_director.gd), Set (floor, light),
##   CutscenePlayer (AnimationPlayer, root_node ".."). One clip "cutscene" with:
##     Hero:position        walk 0..5 s (0 -> 6 m at the clip's 1.2 m/s), walk 14..19 s (6 -> 12 m)
##     Hero/AnimationPlayer animation track: walk, idle, wave, idle, walk, idle (the hero's own clips)
##     CamA:position/rotation dolly; CamA:current and CamB:current discrete cuts at 8 s and 14 s
##     Director method track: disable_gameplay (0), say (8, 10.5), enable_gameplay (19.9)
##     markers intro 0, talk 8, outro 14, end 20
## run(job)    args scene, dt (1/60), section (["talk","outro"] or []), callback_mode_method (0 deferred, 1 immediate)
##   Advances the clip manually and reports the director log, the current camera and hero clip at checkpoints,
##   animation_finished, and whether every track path resolves.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const Director = preload("res://addons/agentkit/animation/cutscene_director.gd")


static func _value_track(a: Animation, path: String, keys: Array, discrete := false) -> int:
	var i := a.add_track(Animation.TYPE_VALUE)
	a.track_set_path(i, NodePath(path))
	a.value_track_set_update_mode(i, Animation.UPDATE_DISCRETE if discrete else Animation.UPDATE_CONTINUOUS)
	a.track_set_interpolation_type(i, Animation.INTERPOLATION_CUBIC if not discrete else Animation.INTERPOLATION_NEAREST)
	for k in keys:
		a.track_insert_key(i, float(k[0]), k[1])
	return i


func build(job) -> Dictionary:
	var length: float = job.arg("length", 20.0)
	var root := Node3D.new()
	root.name = "Cutscene"
	var hero: Node3D = (load(str(job.arg("hero", "res://anim/hero.tscn"))) as PackedScene).instantiate()
	hero.name = "Hero"
	root.add_child(hero)
	var set := Node3D.new()
	set.name = "Set"
	root.add_child(set)
	var floor_mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(12, 24)
	floor_mi.mesh = pm
	floor_mi.position = Vector3(0, 0, 6)
	set.add_child(floor_mi)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 35, 0)
	sun.shadow_enabled = true
	set.add_child(sun)
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.32, 0.34, 0.38)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.78, 0.85)
	env.ambient_light_energy = 0.6
	we.environment = env
	set.add_child(we)
	for cn in ["CamA", "CamB"]:
		var c := Camera3D.new()
		c.name = cn
		c.fov = 45.0
		root.add_child(c)
	var cam_b: Camera3D = root.get_node("CamB")
	cam_b.position = Vector3(2.2, 1.5, 7.6)              # over-the-shoulder for the talk beat
	cam_b.rotation_degrees = Vector3(-8, 70, 0)
	var director := Director.new()
	director.name = "Director"
	root.add_child(director)
	var player := AnimationPlayer.new()
	player.name = "CutscenePlayer"
	root.add_child(player)
	var a := Animation.new()
	a.length = length
	# Hero travel: matches the walk clip's measured no-slide speed (1.2 m/s), 5 s -> 6 m.
	_value_track(a, "Hero:position", [[0.0, Vector3.ZERO], [5.0, Vector3(0, 0, 6)], [14.0, Vector3(0, 0, 6)], [19.0, Vector3(0, 0, 12)]])
	a.track_set_interpolation_type(0, Animation.INTERPOLATION_LINEAR)
	var at := a.add_track(Animation.TYPE_ANIMATION)
	a.track_set_path(at, NodePath("Hero/AnimationPlayer"))
	for k in [[0.0, "walk"], [5.0, "idle"], [8.0, "wave"], [10.0, "idle"], [14.0, "walk"], [19.0, "idle"]]:
		a.animation_track_insert_key(at, k[0], StringName(k[1]))
	_value_track(a, "CamA:position", [[0.0, Vector3(-3.5, 1.6, -1.0)], [8.0, Vector3(-3.0, 1.4, 6.0)], [14.0, Vector3(-3.5, 2.0, 7.0)], [20.0, Vector3(-2.5, 2.4, 15.0)]])
	_value_track(a, "CamA:rotation_degrees", [[0.0, Vector3(-10, -108, 0)], [8.0, Vector3(-8, -92, 0)], [14.0, Vector3(-16, -74, 0)], [20.0, Vector3(-28, -40, 0)]])
	# Cuts: discrete keys. Turn the outgoing camera off before the incoming one on (track order matters).
	_value_track(a, "CamA:current", [[0.0, true], [8.0, false], [14.0, true]], true)
	_value_track(a, "CamB:current", [[0.0, false], [8.0, true], [14.0, false]], true)
	var mt := a.add_track(Animation.TYPE_METHOD)
	a.track_set_path(mt, NodePath("Director"))
	for k in [[0.0, "disable_gameplay", []], [8.0, "say", ["Hello there."]], [10.5, "say", ["Follow me."]], [19.9, "enable_gameplay", []]]:
		a.track_insert_key(mt, k[0], {"method": k[1], "args": k[2]})
	for m in [["intro", 0.0], ["talk", 8.0], ["outro", 14.0], ["end", length]]:
		a.add_marker(StringName(m[0]), m[1])
	var lib := AnimationLibrary.new()
	lib.add_animation(&"cutscene", a)
	player.add_animation_library(&"", lib)
	var saved := AgentBuild.save_scene(root, str(job.arg("out", "res://anim/cutscene.tscn")))
	root.free()
	return {"ok": saved.get("ok", false), "saved": saved, "tracks": a.get_track_count(), "length": length}


func run(job) -> Dictionary:
	var inst: Node3D = (load(str(job.arg("scene", "res://anim/cutscene.tscn"))) as PackedScene).instantiate()
	job.root.add_child(inst)
	await job.wait_frames(1)
	var player := inst.get_node("CutscenePlayer") as AnimationPlayer
	var director = inst.get_node("Director")
	var hero_player := inst.get_node("Hero/AnimationPlayer") as AnimationPlayer
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.callback_mode_method = int(job.arg("callback_mode_method", AnimationMixer.ANIMATION_CALLBACK_MODE_METHOD_IMMEDIATE))
	director.clock = func(): return player.current_animation_position
	var a := player.get_animation(&"cutscene")
	var unresolved: Array = []
	for i in a.get_track_count():
		var tp := a.track_get_path(i)
		var n := inst.get_node_or_null(NodePath(str(tp).get_slice(":", 0)))
		if n == null:
			unresolved.append(str(tp))
	var finished := [false, -1.0]
	player.animation_finished.connect(func(_n): finished[0] = true; finished[1] = player.current_animation_position)
	var section: Array = job.arg("section", [])
	if section.size() == 2:
		player.play_section_with_markers(&"cutscene", StringName(section[0]), StringName(section[1]))
	else:
		player.play(&"cutscene")
	player.advance(0.0)
	var dt: float = job.arg("dt", 1.0 / 60.0)
	var checkpoints := {}
	var cps: Array = job.arg("checkpoints", [1.0, 6.0, 9.0, 12.0, 15.0, 19.5])
	var t := 0.0
	var start_pos := player.current_animation_position
	var guard := 0
	var gameplay_at := {}
	while player.is_playing() and guard < 100000:
		player.advance(dt)
		if job.arg("await_frames", false):
			await job.process_frame
		t += dt
		guard += 1
		for c in cps:
			var key := str(c)
			if not checkpoints.has(key) and player.current_animation_position >= float(c) - 1e-6:
				var cam := inst.get_viewport().get_camera_3d()
				checkpoints[key] = {"camera": str(cam.name) if cam else "", "hero_clip": str(hero_player.current_animation),
					"hero_z": snappedf((inst.get_node("Hero") as Node3D).position.z, 0.001), "gameplay": director.gameplay_enabled}
	var res := {"ok": true, "length": a.get_length(), "markers": Array(a.get_marker_names()), "start": start_pos,
		"played_s": snappedf(t, 0.0001), "finished": finished[0], "finished_at": finished[1], "calls": director.calls,
		"checkpoints": checkpoints, "unresolved_tracks": unresolved, "gameplay_enabled_end": director.gameplay_enabled,
		"callback_mode_method": player.callback_mode_method}
	inst.queue_free()
	await job.wait_frames(1)
	return res
