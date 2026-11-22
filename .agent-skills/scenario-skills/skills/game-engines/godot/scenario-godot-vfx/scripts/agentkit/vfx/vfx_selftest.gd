extends RefCounted
## scenario-godot-vfx 0.1: behaviour checks for the runtime scripts and two engine facts. Job methods for gd_run.
##   juice       (headless)  hit-stop restores Engine.time_scale (single and overlapping), shake bounded, back to 0
##   lifecycle   (windowed)  N explosions spawned in a stage free themselves: node count back to baseline
##   projectile  (windowed)  the fireball hits the wall, emits `hit`, spawns the explosion, frees itself
##   frequency   (windowed)  sub_emitter_frequency: Hz or seconds? renders child dots for an image count

const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")
const VR = preload("res://addons/agentkit/vfx/vfx_recipes.gd")
const Cap = preload("res://addons/agentkit/agent_capture.gd")


func juice(job) -> Dictionary:
	var j: Node = load("res://vfx/runtime/juice.gd").new()
	j.name = "Juice"
	job.root.add_child(j)
	var cam := Camera3D.new()
	var world := Node3D.new()
	job.root.add_child(world)
	world.add_child(cam)
	cam.current = true
	await job.process_frame
	var r := {}
	# single hit-stop
	var t0 := Time.get_ticks_msec()
	j.hitstop(0.05, 0.08)
	r["scale_during"] = Engine.time_scale
	while Engine.time_scale != 1.0 and Time.get_ticks_msec() - t0 < 2000:
		await job.process_frame
	r["single_restored"] = Engine.time_scale == 1.0
	r["single_ms"] = Time.get_ticks_msec() - t0
	# overlapping: 0.2 at scale 0.1, then 0.05 at scale 0.02 starting 30 ms later
	t0 = Time.get_ticks_msec()
	j.hitstop(0.1, 0.2)
	await job.create_timer(0.03, true, false, true).timeout
	j.hitstop(0.02, 0.05)
	r["overlap_min_scale"] = Engine.time_scale
	var restored_at := -1
	var early_restore := false
	while Time.get_ticks_msec() - t0 < 1000:
		await job.process_frame
		if Engine.time_scale == 1.0 and restored_at < 0:
			restored_at = Time.get_ticks_msec() - t0
		if Engine.time_scale == 1.0 and Time.get_ticks_msec() - t0 < 150:
			early_restore = true
	r["overlap_restored_ms"] = restored_at
	r["overlap_early_restore"] = early_restore
	# shake: trauma 1 then let it decay
	j.add_trauma(1.0)
	var max_h := 0.0
	var max_v := 0.0
	var frames := 0
	t0 = Time.get_ticks_msec()
	while j.trauma > 0.0 and Time.get_ticks_msec() - t0 < 3000:
		await job.process_frame
		frames += 1
		max_h = maxf(max_h, absf(cam.h_offset))
		max_v = maxf(max_v, absf(cam.v_offset))
	await job.process_frame
	r["shake_ms"] = Time.get_ticks_msec() - t0
	r["shake_max_h"] = max_h
	r["shake_max_v"] = max_v
	r["shake_end_offset"] = Vector2(cam.h_offset, cam.v_offset)
	r["shake_frames"] = frames
	r["ok"] = r.single_restored and restored_at > 0 and not early_restore and max_h <= 0.30 + 1e-4 \
			and max_v <= 0.22 + 1e-4 and max_h > 0.01 and cam.h_offset == 0.0 and cam.v_offset == 0.0
	j.queue_free()
	world.queue_free()
	return r


func _count(n: Node) -> int:
	var c := 1
	for k in n.get_children():
		c += _count(k)
	return c


func _stage_viewport(job) -> SubViewport:
	var cap = Cap.new()
	return cap.make_viewport(job, Vector2i(160, 90), false)


## args: tier, spawns (5), gap (0.25 s), wait (s after the last spawn, default 6)
func lifecycle(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "lifecycle needs a windowed run (headless particles never simulate)"}
	var tier: String = job.arg("tier", "high")
	var vp := _stage_viewport(job)
	var st := VR.stage()
	vp.add_child(st)
	await job.wait_frames(5)
	var base := _count(st)
	var scene := load("res://vfx/explosion_%s.tscn" % tier) as PackedScene
	var spawns: int = job.arg("spawns", 5)
	var done := [0]
	var peak := base
	for i in spawns:
		var fx: Node3D = scene.instantiate()
		fx.connect("done", func(): done[0] += 1)
		st.add_child(fx)
		fx.position = Vector3(i - 2.0, 0.05, -8.0)
		await job.create_timer(float(job.arg("gap", 0.25))).timeout
		peak = maxi(peak, _count(st))
	var t0 := Time.get_ticks_msec()
	var limit := float(job.arg("wait", 6.0)) * 1000.0
	while (done[0] < spawns or _count(st) > base) and Time.get_ticks_msec() - t0 < limit:
		await job.process_frame
	await job.process_frame
	var after := _count(st)
	vp.queue_free()
	return {"ok": after == base and done[0] == spawns, "baseline_nodes": base, "peak_nodes": peak, "after_nodes": after,
			"done_signals": done[0], "spawns": spawns, "settle_ms": Time.get_ticks_msec() - t0}


## args: tier. Runs the shot scene until the fireball is gone and the explosion is done.
func projectile(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "projectile needs a windowed run"}
	var tier: String = job.arg("tier", "high")
	var vp := _stage_viewport(job)
	var st: Node = (load("res://vfx/shot_%s.tscn" % tier) as PackedScene).instantiate()
	var fb: Node3D = st.get_node("Fireball")
	var hits: Array = []
	fb.connect("hit", func(p, n, c): hits.append({"pos": p, "normal": n, "collider": str(c.name) if c else ""}))
	var t0 := Time.get_ticks_msec()
	vp.add_child(st)
	var base := 0
	var hit_frame := -1
	var frame := 0
	var explosion_seen := false
	var fireball_freed_frame := -1
	while frame < 60 * 8:
		await job.process_frame
		frame += 1
		if hits.size() > 0 and hit_frame < 0:
			hit_frame = frame
		for c in st.get_children():
			if c.name.begins_with("Explosion"):
				explosion_seen = true
		if fireball_freed_frame < 0 and not is_instance_valid(fb):
			fireball_freed_frame = frame
		if fireball_freed_frame > 0 and explosion_seen:
			var any := false
			for c in st.get_children():
				if c.name.begins_with("Explosion"):
					any = true
			if not any:
				break
	var left: Array = []
	for c in st.get_children():
		left.append(str(c.name))
	vp.queue_free()
	return {"ok": hits.size() == 1 and explosion_seen and fireball_freed_frame > 0 and not ("Fireball" in left)
			and not left.any(func(x): return x.begins_with("Explosion")),
			"hits": hits, "hit_frame": hit_frame, "hit_time_s": hit_frame / 60.0, "fireball_freed_frame": fireball_freed_frame,
			"explosion_seen": explosion_seen, "frames": frame, "children_left": left, "wall_ms": Time.get_ticks_msec() - t0}


## Sub-emitter frequency test. A parent particle moves along +X at 1 m/s for `seconds`; the child leaves
## dots that live 20 s. Hz reading: frequency x seconds dots, 1/frequency m apart. Seconds reading: about
## seconds / frequency dots. Saves a top-down orthographic frame for gd_vfx.count_blobs.
## args: frequency (4.0), seconds (2.0), out_dir
func frequency(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "frequency needs a windowed run"}
	var f: float = float(job.arg("frequency", 4.0))
	var secs: float = float(job.arg("seconds", 2.0))
	var cap = Cap.new()
	var vp: SubViewport = cap.make_viewport(job, Vector2i(640, 160), false)
	var root := Node3D.new()
	vp.add_child(root)
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.BLACK
	we.environment = env
	root.add_child(we)
	var parent := VB.emitter({"name": "Parent", "amount": 1, "lifetime": secs + 5.0, "one_shot": true, "explosiveness": 1.0,
		"aabb": [-2, -2, -2, 14, 4, 4],
		"pm": {"direction": [1, 0, 0], "spread": 0.0, "initial_velocity_min": 1.0, "initial_velocity_max": 1.0,
			"gravity": [0, 0, 0], "color": [0, 0, 0, 0]},
		"draw": {"mesh": "quad", "size": [0.01, 0.01], "blend": "add"}})
	var child := VB.emitter({"name": "Child", "amount": 1, "lifetime": 20.0, "aabb": [-2, -2, -2, 14, 4, 4],
		"pm": {"gravity": [0, 0, 0], "initial_velocity_min": 0.0, "initial_velocity_max": 0.0, "color": [1, 1, 1, 1]},
		"draw": {"mesh": "quad", "size": [0.08, 0.08], "blend": "mix", "texture": VR.shared_tex("dot")}})
	root.add_child(parent)
	root.add_child(child)
	var cap_n := VB.link_sub_emitter(parent, child, ParticleProcessMaterial.SUB_EMITTER_CONSTANT, 1, f)
	child.amount = maxi(child.amount, 64)      # generous cap, so the cap cannot limit the count
	child.emitting = bool(job.arg("child_emitting", true))
	parent.fixed_fps = int(job.arg("fixed_fps", 60))
	child.fixed_fps = int(job.arg("fixed_fps", 60))
	parent.sub_emitter = parent.get_path_to(child)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	root.add_child(cam)
	cam.look_at_from_position(Vector3(secs * 0.5, 0, 5), Vector3(secs * 0.5, 0, 0), Vector3.UP)
	cam.keep_aspect = Camera3D.KEEP_WIDTH
	cam.size = secs + 1.0
	cam.current = true
	await job.wait_frames(4)
	parent.restart()
	var frames := int(round(secs * 60.0))
	for i in frames:
		await job.process_frame
	parent.speed_scale = 0.0      # freeze the parent: no more emissions after `secs`
	await job.wait_frames(2)
	await RenderingServer.frame_post_draw
	var p: String = job.out_path(str(job.arg("out_dir", "vfx/frequency")).path_join("dots_f%.1f_t%.1f.png" % [f, secs]))
	var img := vp.get_texture().get_image()
	img.save_png(p)
	vp.queue_free()
	return {"ok": true, "image": p, "frequency": f, "seconds": secs, "child_amount": child.amount, "child_emitting": child.emitting, "cap_computed": cap_n,
			"expected_if_hz": int(f * secs), "expected_if_seconds": int(secs / f) + 1, "metres_per_px": (secs + 1.0) / 640.0}


## Overdraw calibration: 0..`layers` full-screen alpha quads stacked in front of the camera, rendered with
## Viewport.DEBUG_DRAW_OVERDRAW; returns the centre luma (0..255) for each layer count. windowed.
func overdraw_calibrate(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "needs a windowed run"}
	var layers: int = job.arg("layers", 8)
	var cap = Cap.new()
	var vp: SubViewport = cap.make_viewport(job, Vector2i(160, 90), false)
	vp.debug_draw = Viewport.DEBUG_DRAW_OVERDRAW
	var root := Node3D.new()
	vp.add_child(root)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.current = true
	var quads: Array = []
	for i in layers:
		var mi := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(4, 4)
		var m := StandardMaterial3D.new()
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color(1, 1, 1, 0.5)
		q.material = m
		mi.mesh = q
		mi.position = Vector3(0, 0, -1.0 - i * 0.05)
		mi.visible = false
		root.add_child(mi)
		quads.append(mi)
	var lumas: Array = []
	for n in layers + 1:
		for i in layers:
			quads[i].visible = i < n
		await job.wait_frames(3)
		await RenderingServer.frame_post_draw
		var img := vp.get_texture().get_image()
		var c := img.get_pixel(80, 45)
		lumas.append(snappedf((0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * 255.0, 0.01))
	vp.queue_free()
	var steps: Array = []
	for i in range(1, lumas.size()):
		steps.append(snappedf(lumas[i] - lumas[i - 1], 0.01))
	return {"ok": true, "luma_by_layers": lumas, "steps": steps, "renderer": RenderingServer.get_current_rendering_method()}


## Parse check of the kit (agent_audit.scripts skips res://addons/agentkit/): loads every .gd under
## res://addons/agentkit/vfx/ and res://vfx/ with CACHE_MODE_IGNORE and reports captured errors.
func compile(job) -> Dictionary:
	job.expect_errors = true
	var files: Array = []
	for dir in ["res://addons/agentkit/vfx/", "res://vfx/runtime/"]:
		for f in DirAccess.get_files_at(dir):
			# never reload the running script: on 4.7.2 a CACHE_MODE_IGNORE load of the script that is executing
			# broke the running function ("Internal script error! Opcode: 43"); it compiled to run anyway
			if f.ends_with(".gd") and dir + f != get_script().resource_path:
				files.append(dir + f)
	var failed: Array = []
	for f in files:
		var before: int = job.captured_error_count()
		var s = ResourceLoader.load(f, "GDScript", ResourceLoader.CACHE_MODE_IGNORE)
		var errs: Array = job.captured_errors().slice(before)
		if s == null or not errs.is_empty():
			failed.append({"path": f, "errors": errs.slice(0, 3)})
	return {"ok": failed.is_empty(), "checked": files.size() + 1, "failed": failed, "files": files,
			"self": get_script().resource_path}
