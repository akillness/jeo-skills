extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): deterministic pose and timeline captures (WINDOWED run).
##
## Real-time sequence captures (gd_run.capture_sequence) sample whatever frame the clock lands on.
## For animation review you want exact times: this job seeks the AnimationPlayer (or advances an
## AnimationTree by a fixed step) to each requested time, renders, and saves one PNG per time and view,
## with a fixed camera framed on the rest-pose bounds so frames compare like for like.
##
## gd_anim.pose_sheet(P, "res://anim/hero.tscn", anim="walk", times=[0, .25, .5, .75], views=["left", "front"])
## args: scene, anim, player ("AnimationPlayer"), times [s], views (front back left right top three_quarter,
##   or "scene" = the scene's own current camera, for cutscenes), size [w, h], out_dir, stage (true: add a
##   light, sky ambient and a floor when the scene has none), driver ("player" seek | "tree" advance),
##   tree ("AnimationTree"), params ({"parameters/...": value} set before driving), bones ([names] whose
##   global positions are reported per time), skeleton ("" = first Skeleton3D found), frame (node path the
##   camera frames, "." = whole scene; "Armature" keeps level geometry from shrinking the character).

const Cap = preload("res://addons/agentkit/agent_capture.gd")


func poses(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "pose captures need a windowed run (headless draws no frames)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size: Vector2i = job.arg("size", Vector2i(480, 480))
	var times: Array = job.arg("times", [0.0])
	var views: Array = job.arg("views", ["front"])
	var out_dir: String = job.arg("out_dir", "captures/poses")
	var anim: String = job.arg("anim", "")
	var driver: String = job.arg("driver", "player")
	var params: Dictionary = job.arg("params", {})
	var bone_names: Array = job.arg("bones", [])
	var cap = Cap.new()
	var vp: SubViewport = cap.make_viewport(job, size, false)
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	if job.arg("stage", true):
		_stage(vp, inst)
	await job.wait_frames(2)
	var sk := _find_skeleton(inst, str(job.arg("skeleton", "")))
	var player := inst.get_node_or_null(str(job.arg("player", "AnimationPlayer"))) as AnimationPlayer
	var tree := inst.get_node_or_null(str(job.arg("tree", "AnimationTree"))) as AnimationTree
	if driver == "player":
		if player == null:
			return {"ok": false, "error": "no AnimationPlayer at " + str(job.arg("player", "AnimationPlayer"))}
		if tree:
			tree.active = false
		if anim != "":
			if not player.has_animation(anim):
				return {"ok": false, "error": "animation not found: " + anim, "have": Array(player.get_animation_list())}
			player.play(anim)
			player.pause()
	elif driver == "tree":
		if tree == null:
			return {"ok": false, "error": "no AnimationTree"}
		tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		tree.active = true
		for k in params:
			tree.set(str(k), params[k])
	var own_cam: Camera3D = null
	var frame_node: Node = inst.get_node_or_null(str(job.arg("frame", ".")))   # frame on a sub-node, e.g. "Armature"
	var aabb: AABB = cap.scene_aabb(frame_node if frame_node else inst)
	var use_scene_cam := views.size() == 1 and str(views[0]) == "scene"
	if not use_scene_cam:
		own_cam = Camera3D.new()
		own_cam.fov = float(job.arg("fov", 40.0))
		vp.add_child(own_cam)
		own_cam.current = true
	var images: Array = []
	var samples: Array = []
	var t_prev := 0.0
	for ti in range(times.size()):
		var t := float(times[ti])
		if driver == "player":
			player.seek(t, true)
		elif driver == "tree":
			var dt := t - t_prev
			if ti == 0:
				tree.advance(0.0)
			var steps := int(ceil(dt / 0.0166667))
			for s in range(steps):
				tree.advance(dt / float(steps))
			t_prev = t
		await job.wait_frames(2)
		var sample := {"t": t}
		if sk and not bone_names.is_empty():
			var bp := {}
			for bn in bone_names:
				var bi := sk.find_bone(str(bn))
				if bi >= 0:
					bp[str(bn)] = sk.global_transform * sk.get_bone_global_pose(bi).origin
			sample["bones"] = bp
		if driver == "tree" and tree:
			var pb = tree.get("parameters/playback")
			if pb is AnimationNodeStateMachinePlayback:
				sample["state"] = str((pb as AnimationNodeStateMachinePlayback).get_current_node())
		samples.append(sample)
		for v in views:
			var view := str(v)
			if own_cam:
				own_cam.global_transform = cap.view_transform(aabb, view, own_cam.fov, float(size.x) / float(size.y))
			await job.wait_frames(1)
			await RenderingServer.frame_post_draw
			var label := "%s_t%05.2f_%s" % [anim if anim != "" else "scene", t, view]
			var path: String = job.out_path(out_dir.path_join(label.replace(" ", "_").replace("/", "_") + ".png"))
			var err: String = cap._save(vp, path)
			if err != "":
				return {"ok": false, "error": err}
			images.append(path)
	vp.queue_free()
	await job.process_frame
	return {"ok": true, "images": images, "samples": samples, "aabb": {"position": aabb.position, "size": aabb.size}}


func _find_skeleton(n: Node, path: String) -> Skeleton3D:
	if path != "":
		return n.get_node_or_null(path) as Skeleton3D
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skeleton(c, "")
		if s:
			return s
	return null


func _has(n: Node, cls: String) -> bool:
	if n.is_class(cls):
		return true
	for c in n.get_children():
		if _has(c, cls):
			return true
	return false


## Light, ambient sky and a checker floor so poses read; skipped for what the scene already has.
func _stage(vp: SubViewport, inst: Node) -> void:
	if not _has(inst, "WorldEnvironment"):
		var we := WorldEnvironment.new()
		var env := Environment.new()
		env.background_mode = Environment.BG_COLOR
		env.background_color = Color(0.32, 0.34, 0.38)
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		env.ambient_light_color = Color(0.75, 0.78, 0.85)
		env.ambient_light_energy = 0.6
		env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
		we.environment = env
		vp.add_child(we)
	if not _has(inst, "DirectionalLight3D"):
		var sun := DirectionalLight3D.new()
		sun.rotation_degrees = Vector3(-50, 35, 0)
		sun.shadow_enabled = true
		vp.add_child(sun)
	if not _has(inst, "StaticBody3D") and not _has(inst, "CSGShape3D"):
		var floor_mi := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(8, 8)
		floor_mi.mesh = pm
		var m := StandardMaterial3D.new()
		var img := Image.create_empty(8, 8, false, Image.FORMAT_RGB8)
		for y in 8:
			for x in 8:
				img.set_pixel(x, y, Color(0.55, 0.55, 0.55) if (x + y) % 2 == 0 else Color(0.42, 0.42, 0.42))
		m.albedo_texture = ImageTexture.create_from_image(img)
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		m.uv1_scale = Vector3(4, 4, 1)
		floor_mi.material_override = m
		floor_mi.position.y = -0.001
		vp.add_child(floor_mi)
