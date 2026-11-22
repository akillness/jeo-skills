extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): render one view under N variants in ONE windowed run.
## Use it for A/B passes: tonemappers, exposure, shadow bias, fog density, GI on/off, quality tiers.
##
##   gd_lighting.sweep(P, "res://level.tscn", variants, camera="Cameras/Hero", size=(640, 360), measure=60)
##
## args: scene, camera (NodePath in the scene, "" = current camera; or camera_look [[pos], [target]]), size [w, h], frames (settle frames
## per variant, default 12; SDFGI needs about 30), measure (frames of GPU/CPU timing per variant, 0 = off),
## out_dir, variants: [{"label": "agx", "set": [[node, property, value], ...]}]
##   node: NodePath from the scene root ("WorldEnvironment", "Sun", "."), or
##         "$viewport" for the capture SubViewport (msaa_3d, screen_space_aa, use_taa, scaling_3d_scale, debug_draw),
##         "$rs" to call RenderingServer: [ "$rs", "directional_shadow_atlas_set_size", [4096, true] ].
##   property: Node.set_indexed path, e.g. "environment:tonemap_mode", "shadow_bias", "light_color".
##   value: JSON value; arrays become Color / Vector2 / Vector3 when the property holds one.
## A variant may also carry "call": ["res://x.gd", "static_method", [args]], called as
## static_method(args..., capture_viewport, scene_root) after the sets (e.g. graphics_tiers.gd apply).
## Every variant starts from the loaded values: properties touched by any variant are restored first
## ("$rs" calls are not restorable: order those variants yourself). A variant with "keep": true skips the
## restore (cumulative series, e.g. SDFGI convergence); "frames" in a variant overrides the settle frames.
## Timing: gpu_ms is 0 on the Metal driver in 4.7.2; pass extra_args ["--rendering-driver", "vulkan"].


func sweep(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "sweep renders: run windowed (headless draws no frames)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size: Vector2i = job.arg("size", Vector2i(640, 360))
	var frames: int = job.arg("frames", 12)
	var measure: int = job.arg("measure", 0)
	var out_dir: String = job.arg("out_dir", "captures/sweep")
	var cam_path: String = job.arg("camera", "")
	var variants: Array = job.arg("variants", [])
	var cap = load("res://addons/agentkit/agent_capture.gd").new()
	var vp: SubViewport = cap.make_viewport(job, size, false)
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	await job.wait_frames(1)
	var cam: Camera3D = null
	var look: Array = job.arg("camera_look", [])   # [[px, py, pz], [tx, ty, tz]] adds a camera there
	if look.size() == 2:
		cam = Camera3D.new()
		cam.name = "SweepCam"
		var cp := Vector3(look[0][0], look[0][1], look[0][2])
		var ct := Vector3(look[1][0], look[1][1], look[1][2])
		cam.transform = Transform3D(Basis.looking_at(ct - cp, Vector3.UP), cp)
		inst.add_child(cam)
		cam.current = true
	elif cam_path != "":
		cam = inst.get_node_or_null(cam_path) as Camera3D
		if cam == null:
			return {"ok": false, "error": "camera not found: " + cam_path}
		cam.current = true
	# Record the original value of every touched property.
	var originals := {}
	for v in variants:
		for s in v.get("set", []):
			var key := "%s|%s" % [s[0], s[1]]
			if str(s[0]) == "$rs" or originals.has(key):
				continue
			var target := _target(inst, vp, str(s[0]))
			if target == null:
				return {"ok": false, "error": "node not found: " + str(s[0])}
			originals[key] = target.get_indexed(NodePath(str(s[1])))
	var rid := vp.get_viewport_rid()
	var results: Array = []
	var i := 0
	for v in variants:
		if not v.get("keep", false):
			for key: String in originals:
				var parts := key.split("|")
				_target(inst, vp, parts[0]).set_indexed(NodePath(parts[1]), originals[key])
		for s in v.get("set", []):
			if str(s[0]) == "$rs":
				RenderingServer.callv(str(s[1]), s[2] if s[2] is Array else [s[2]])
				continue
			var target := _target(inst, vp, str(s[0]))
			var cur = target.get_indexed(NodePath(str(s[1])))
			target.set_indexed(NodePath(str(s[1])), _coerce(cur, s[2]))
		var called = null
		if v.has("call"):   # ["res://path.gd", "static_method", [args...]]: called as method(args..., viewport, scene_root)
			var c: Array = v["call"]
			var a: Array = (c[2] as Array).duplicate() if c.size() > 2 else []
			a.append_array([vp, inst])
			called = load(str(c[0])).callv(str(c[1]), a)
		await job.wait_frames(int(v.get("frames", frames)))
		var timing := {}
		if measure > 0:
			RenderingServer.viewport_set_measure_render_time(rid, true)
			await job.wait_frames(2)
			var g: Array = []
			var c: Array = []
			for k in measure:
				await job.process_frame
				g.append(RenderingServer.viewport_get_measured_render_time_gpu(rid))
				c.append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
			RenderingServer.viewport_set_measure_render_time(rid, false)
			timing = {"gpu_ms_mean": _mean(g), "gpu_ms_p95": _p95(g), "cpu_ms_mean": _mean(c)}
		await RenderingServer.frame_post_draw
		var label: String = str(v.get("label", "v%d" % i))
		var path: String = job.out_path(out_dir.path_join("%02d_%s.png" % [i, label.validate_filename()]))
		var img := vp.get_texture().get_image()
		if img == null or img.is_empty():
			return {"ok": false, "error": "viewport returned no image"}
		img.convert(Image.FORMAT_RGBA8)
		img.save_png(path)
		var row := {"label": label, "image": path}
		if called != null:
			row["call_result"] = called
		row.merge(timing)
		var focus: String = job.arg("focus", "")
		if focus != "":
			row["focus_rect"] = screen_rect(inst.get_node_or_null(focus), vp.get_camera_3d(), size)
		results.append(row)
		i += 1
	vp.queue_free()
	await job.process_frame
	return {"ok": true, "variants": results, "renderer": RenderingServer.get_current_rendering_method(),
			"driver": RenderingServer.get_current_rendering_driver_name(), "size": [size.x, size.y], "frames": frames}


## Normalized screen rectangle [x0, y0, x1, y1] of a node's visual bounds (for focal contrast checks).
static func screen_rect(n: Node, cam: Camera3D, size: Vector2i) -> Array:
	if n == null or cam == null:
		return []
	var acc := AABB()
	var first := true
	var stack: Array = [n]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		stack.append_array(x.get_children())
		if x is VisualInstance3D:
			var b: AABB = (x as VisualInstance3D).global_transform * (x as VisualInstance3D).get_aabb()
			acc = b if first else acc.merge(b)
			first = false
	if first:
		return []
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for i in 8:
		var p := cam.unproject_position(acc.get_endpoint(i))
		lo = lo.min(p)
		hi = hi.max(p)
	var s := cam.get_viewport().get_visible_rect().size   # stretch emulation: may differ from the pixel size
	return [clampf(lo.x / s.x, 0, 1), clampf(lo.y / s.y, 0, 1), clampf(hi.x / s.x, 0, 1), clampf(hi.y / s.y, 0, 1)]


func _target(inst: Node, vp: SubViewport, path: String) -> Object:
	if path == "$viewport":
		return vp
	if path == "." or path == "":
		return inst
	return inst.get_node_or_null(path)


func _coerce(cur, v):
	if v is Array:
		if cur is Color:
			return Color(v[0], v[1], v[2], v[3] if v.size() > 3 else 1.0)
		if cur is Vector3:
			return Vector3(v[0], v[1], v[2])
		if cur is Vector2:
			return Vector2(v[0], v[1])
		if cur is Vector3i:
			return Vector3i(int(v[0]), int(v[1]), int(v[2]))
	if cur is int and (v is float or v is int):
		return int(v)
	if cur is bool:
		return bool(v)
	return v


func _mean(a: Array) -> float:
	var s := 0.0
	for x in a:
		s += x
	return s / maxf(1.0, a.size())


func _p95(a: Array) -> float:
	if a.is_empty():
		return 0.0
	var b := a.duplicate()
	b.sort()
	return b[int(0.95 * (b.size() - 1))]
