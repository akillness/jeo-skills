extends RefCounted
## scenario-godot-vfx 0.1: timeline capture of an effect at exact game times (WINDOWED run; headless draws nothing).
## Run through gd_vfx.timeline(), which passes --fixed-fps <fps>: every frame then advances the game by
## exactly 1/fps s, so the frame captured k frames after the trigger shows t = k/fps whatever the machine.
##
## args: scene, times [s], out_dir, size [w, h], fps (must match --fixed-fps), trigger ("restart" | "none"),
##   warm (frames before the trigger: noise textures generate on a thread), overdraw (bool:
##   Viewport.DEBUG_DRAW_OVERDRAW), baseline (bool: one frame before the trigger), cam_pos / cam_look
##   ([x, y, z]; default: the scene's current camera), aabb_check (bool: capture_aabb() per emitter per time),
##   play_method ("method" on the root or "Node/Path:method", called at t = 0 instead of restarting emitters),
##   hold (NodePath: node kept PROCESS_MODE_DISABLED during the warm-up, released at t = 0, e.g. a projectile),
##   spawn (res:// scene instanced under the root at t = 0, at spawn_pos), time_scale (float, Engine.time_scale).

const Cap = preload("res://addons/agentkit/agent_capture.gd")
const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")
const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


func timeline(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "timeline capture needs a windowed run (gd_vfx.timeline)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size: Vector2i = job.arg("size", Vector2i(640, 360))
	var fps: int = job.arg("fps", 60)
	var times: Array = job.arg("times", [0.1, 0.3, 0.6])
	var out_dir: String = job.arg("out_dir", "vfx/timeline")
	var trigger: String = job.arg("trigger", "restart")
	var warm: int = job.arg("warm", 8)
	var cap = Cap.new()
	var vp: SubViewport = cap.make_viewport(job, size, false)
	if job.arg("overdraw", false):
		vp.debug_draw = Viewport.DEBUG_DRAW_OVERDRAW
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	if job.args.has("cam_pos"):
		var cam := Camera3D.new()
		cam.name = "TimelineCam"
		cam.fov = float(job.arg("fov", 55.0))
		vp.add_child(cam)
		var cp: Vector3 = job.arg("cam_pos", Vector3(4, 2, 4))
		var cl: Vector3 = job.arg("cam_look", Vector3.ZERO)
		cam.look_at_from_position(cp, cl, Vector3.UP)
		cam.current = true
	var emitters: Array = VB.emitters(inst)
	var held: Node = inst.get_node_or_null(NodePath(str(job.arg("hold", "")))) if str(job.arg("hold", "")) != "" else null
	if held:
		held.process_mode = Node.PROCESS_MODE_DISABLED
	if trigger == "restart":
		for e in emitters:          # hold everything until t = 0
			e.emitting = false
	await job.wait_frames(warm)
	var images: Array = []
	var res := {}
	if job.arg("baseline", false):
		await RenderingServer.frame_post_draw
		var bp: String = job.out_path(out_dir.path_join("baseline.png"))
		_save(vp, bp)
		res["baseline_image"] = bp
	if job.args.has("time_scale"):
		Engine.time_scale = float(job.arg("time_scale", 1.0))
	var t0_frames := Engine.get_process_frames()
	if held:
		held.process_mode = Node.PROCESS_MODE_INHERIT
	var play_method: String = job.arg("play_method", "")
	var play_target: Node = inst
	if play_method.contains(":"):
		play_target = inst.get_node_or_null(NodePath(play_method.get_slice(":", 0)))
		play_method = play_method.get_slice(":", 1)
	if job.args.has("spawn"):
		var sp: Node3D = (load(str(job.arg("spawn", ""))) as PackedScene).instantiate()
		inst.add_child(sp)
		sp.position = job.arg("spawn_pos", Vector3.ZERO)
		emitters = VB.emitters(inst)
	elif play_method != "" and play_target != null and play_target.has_method(play_method):
		play_target.call(play_method)
	elif trigger == "restart":
		for e in emitters:
			e.restart()
	var aabb_rows: Array = []
	var frame := 0
	for t in times:
		var target := int(round(float(t) * fps))
		while frame < target:
			await job.process_frame
			frame += 1
		await RenderingServer.frame_post_draw
		var p: String = job.out_path(out_dir.path_join("t_%05.2f.png" % float(t)))
		var err := _save(vp, p)
		if err != "":
			return {"ok": false, "error": err}
		images.append(p)
		if job.arg("aabb_check", false):
			aabb_rows.append({"t": t, "emitters": _aabb_fit(emitters)})
	Engine.time_scale = 1.0
	vp.queue_free()
	await job.process_frame
	res.merge({"ok": true, "images": images, "times": times, "fps": fps, "frames_after_trigger": frame,
			"engine_frames": Engine.get_process_frames() - t0_frames, "renderer": RenderingServer.get_current_rendering_method(),
			"driver": RenderingServer.get_current_rendering_driver_name(), "overdraw": job.arg("overdraw", false)})
	if not aabb_rows.is_empty():
		res["aabb"] = aabb_rows
	return res


## The agent's "Generate Visibility AABB" (an editor-only GUI button): plays the effect, unions
## capture_aabb() of every GPUParticles3D every `every` frames for `seconds`, grows it by `margin` (fraction),
## and when `write` is true saves the scene (`out`, default the input) with the fitted visibility_aabb.
## Sub-emitter children get the union of their own and their parent's box. WINDOWED (capture_aabb reads the GPU).
## args: scene, node (path of the effect inside `scene`, e.g. "Explosion" in a stage with colliders: measure
##   where the effect lands, debris falls through the world otherwise), seconds (default: longest lifetime x 1.5
##   + 0.2), every (frames, default 2), margin (0.1), fps (60, = --fixed-fps), write (false), out (the effect's own
##   scene to write into; default `scene`), play_method (as timeline; fx_burst roots play on _ready anyway).
## Measured on 4.7.2: capture_aabb() pads particle positions by the longest axis of the draw mesh and ignores
## per-particle scale, so this job adds longest_axis x (max scale - 1) for emitters that scale above 1.
func fit_aabb(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "fit_aabb needs a windowed run (capture_aabb reads particle data back from the GPU)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var cap = Cap.new()
	var vp: SubViewport = cap.make_viewport(job, Vector2i(160, 90), false)
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	if "free_when_done" in inst:
		inst.set("free_when_done", false)
	vp.add_child(inst)
	var cam := Camera3D.new()
	vp.add_child(cam)
	cam.look_at_from_position(Vector3(0, 3, 12), Vector3.ZERO, Vector3.UP)
	cam.current = true
	var fx: Node = inst
	if str(job.arg("node", "")) != "":
		fx = inst.get_node_or_null(NodePath(str(job.arg("node", ""))))
		if fx == null:
			return {"ok": false, "error": "node not found: " + str(job.arg("node", ""))}
	var ems: Array = VB.emitters(fx).filter(func(e): return e is GPUParticles3D)
	var longest := 0.0
	for e in ems:
		longest = maxf(longest, e.lifetime / maxf(e.speed_scale, 0.001))
	var seconds: float = float(job.arg("seconds", longest * 1.5 + 0.2))
	var every: int = int(job.arg("every", 2))
	var margin: float = float(job.arg("margin", 0.1))
	var pm: String = job.arg("play_method", "")
	if pm != "":
		var tgt: Node = inst.get_node_or_null(NodePath(pm.get_slice(":", 0))) if pm.contains(":") else inst
		var m := pm.get_slice(":", 1) if pm.contains(":") else pm
		if tgt and tgt.has_method(m):
			tgt.call(m)
	var boxes := {}
	var frames := int(ceil(seconds * int(job.arg("fps", 60))))   # run with --fixed-fps <fps>
	var fps := Engine.get_frames_per_second()
	for f in frames:
		await job.process_frame
		if f % every != 0:
			continue
		for e in ems:
			if not is_instance_valid(e):
				continue
			var a: AABB = (e as GPUParticles3D).capture_aabb()
			if a.size == Vector3.ZERO:
				continue
			var key := str(fx.get_path_to(e))
			boxes[key] = boxes[key].merge(a) if boxes.has(key) else a
	var rows: Array = []
	var fitted := {}
	for e in ems:
		var key := str(fx.get_path_to(e))
		if not boxes.has(key):
			rows.append({"emitter": key, "live": null, "note": "no live particles seen"})
			continue
		var live: AABB = boxes[key]
		var g := live.grow(live.size.length() * margin * 0.5 + _scale_pad(e))
		fitted[key] = g
		rows.append({"emitter": key, "live": live, "fitted": g, "old": (e as GPUParticles3D).visibility_aabb,
				"old_encloses_live": (e as GPUParticles3D).visibility_aabb.encloses(live)})
	# sub-emitter children: also cover the parent's box (spawn positions come from the parent)
	for e in ems:
		var ppm := (e as GPUParticles3D).process_material as ParticleProcessMaterial
		if ppm and ppm.sub_emitter_mode != ParticleProcessMaterial.SUB_EMITTER_DISABLED:
			var ch := (e as GPUParticles3D).get_node_or_null((e as GPUParticles3D).sub_emitter)
			if ch:
				var pk := str(fx.get_path_to(e))
				var ck := str(fx.get_path_to(ch))
				if fitted.has(pk):
					fitted[ck] = fitted[pk].merge(fitted.get(ck, fitted[pk]))
	vp.queue_free()
	await job.process_frame
	var res := {"ok": true, "scene": scene_path, "seconds": seconds, "frames": frames, "rows": rows, "fitted": fitted,
			"render_fps_seen": fps}
	if job.arg("write", false):
		var out: String = job.arg("out", scene_path)
		var root: Node = (load(out) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		for k in fitted:
			var n := root.get_node_or_null(NodePath(k)) as GPUParticles3D
			if n:
				n.visibility_aabb = fitted[k]
		res["saved"] = AgentBuild.save_scene(root, out)
		root.free()
	return res


## Extra padding capture_aabb() leaves out: it grows by the mesh's longest axis at scale 1.
static func _scale_pad(e: GPUParticles3D) -> float:
	var pm := e.process_material as ParticleProcessMaterial
	if pm == null or e.draw_pass_1 == null:
		return 0.0
	var mx := pm.scale_max
	var ct := pm.scale_curve as CurveTexture
	if ct and ct.curve:
		var cm := 0.0
		for i in ct.curve.point_count:
			cm = maxf(cm, ct.curve.get_point_position(i).y)
		mx *= cm
	var longest := e.draw_pass_1.get_aabb().get_longest_axis_size()
	return longest * maxf(0.0, mx - 1.0)


## Is every live particle inside the node's visibility AABB? capture_aabb() reads back the GPU (windowed only).
func _aabb_fit(emitters: Array) -> Array:
	var rows: Array = []
	for e in emitters:
		if not (e is GPUParticles3D) or not is_instance_valid(e) or not e.is_inside_tree():
			continue
		var g := e as GPUParticles3D
		var live: AABB = g.capture_aabb()
		var vis: AABB = g.visibility_aabb
		var inside := live.size == Vector3.ZERO or vis.encloses(live)
		rows.append({"emitter": str(g.name), "live": live, "visibility": vis, "inside": inside})
	return rows


func _save(vp: SubViewport, path: String) -> String:
	var img := vp.get_texture().get_image()
	if img == null or img.is_empty():
		return "viewport returned no image"
	if img.get_format() != Image.FORMAT_RGBA8 and img.get_format() != Image.FORMAT_RGB8:
		img.convert(Image.FORMAT_RGBA8)
	return "" if img.save_png(path) == OK else "save_png failed"
