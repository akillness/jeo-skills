extends RefCounted
## scenario-godot-performance-export 0.1 (Godot 4.7.2): benchmark jobs that measure one variable at a time.
##
## run_variant: profile a scene in a SubViewport with viewport settings and toggles applied
##   (windowed, Vulkan for GPU time). Records the lead's CSV (agent_profile.record) plus the
##   per-viewport render info (objects, draw calls, primitives; visible and shadow passes).
## stagger: N agents polling raycasts on a cooldown, all in phase or with a random phase (headless).
## hitch: load a heavy area synchronously or through ResourceLoader threads and measure the worst
##   frame and the pipeline compilations around it (windowed).
##
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_bench.gd:run_variant", {...}, headless=False,
##                     extra_args=["--rendering-driver", "vulkan"])

const Profile = preload("res://addons/agentkit/agent_profile.gd")
const Capture = preload("res://addons/agentkit/agent_capture.gd")


static func _walk(n: Node, out: Array) -> void:
	out.append(n)
	for c in n.get_children():
		_walk(c, out)


static func render_info(vp: Viewport) -> Dictionary:
	var out := {}
	for t in [["visible", Viewport.RENDER_INFO_TYPE_VISIBLE], ["shadow", Viewport.RENDER_INFO_TYPE_SHADOW]]:
		out[t[0]] = {
			"objects": vp.get_render_info(t[1], Viewport.RENDER_INFO_OBJECTS_IN_FRAME),
			"draw_calls": vp.get_render_info(t[1], Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME),
			"primitives": vp.get_render_info(t[1], Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME),
		}
	return out


## Toggles, one string each (applied after the scene is in the tree):
##   "prop:<Class>:<property>=<json>"  set a property on every node of that class (is_class)
##   "hide:<NodePath>"                  visible = false on that node (and its subtree)
##   "freeze:<NodePath>"                process_mode = PROCESS_MODE_DISABLED on that subtree
static func apply_toggles(scene_root: Node, toggles: Array) -> Array:
	var done: Array = []
	var nodes: Array = []
	_walk(scene_root, nodes)
	for t in toggles:
		var s := str(t)
		if s.begins_with("prop:"):
			var rest := s.substr(5)
			var cls := rest.get_slice(":", 0)
			var kv := rest.substr(cls.length() + 1)
			var prop := kv.get_slice("=", 0)
			var val = JSON.parse_string(kv.substr(prop.length() + 1))
			var n_set := 0
			for n in nodes:
				if n.is_class(cls):
					n.set(prop, val)
					n_set += 1
			done.append({"toggle": s, "nodes": n_set})
		elif s.begins_with("hide:"):
			var target := scene_root.get_node_or_null(NodePath(s.substr(5)))
			if target and "visible" in target:
				target.visible = false
			done.append({"toggle": s, "nodes": 1 if target else 0})
		elif s.begins_with("freeze:"):
			var target2 := scene_root.get_node_or_null(NodePath(s.substr(7)))
			if target2:
				target2.process_mode = Node.PROCESS_MODE_DISABLED
			done.append({"toggle": s, "nodes": 1 if target2 else 0})
		else:
			done.append({"toggle": s, "error": "unknown toggle"})
	return done


## Args: scene, size [w, h] (1280x720), seconds (3), warmup (60), csv, settings {viewport property:
## value} (scaling_3d_scale, use_occlusion_culling, msaa_3d, use_taa, screen_space_aa,
## mesh_lod_threshold, debug_draw ...), toggles [..], shot ("" or a PNG path under .agent_out).
func run_variant(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "run_variant renders: run it windowed (headless=False)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size_a: Array = job.arg("size", [1280, 720])
	var cap = Capture.new()
	var vp: SubViewport = cap.make_viewport(job, Vector2i(int(size_a[0]), int(size_a[1])), false)
	var settings: Dictionary = job.arg("settings", {})
	var applied := {}
	for k in settings:
		if k in vp:
			vp.set(k, settings[k])
			applied[k] = vp.get(k)
		else:
			applied[k] = "<no such Viewport property>"
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	var span := span_pair(vp, PROC_SENTINEL_GD, false)
	await job.wait_frames(2)
	var toggles := apply_toggles(inst, job.arg("toggles", []))
	var prof = Profile.new()
	var warm: int = job.arg("warmup", 60)
	var r: Dictionary = await prof.record(job, job.arg("csv", "bench/variant.csv"), job.arg("seconds", 3.0), warm, vp)
	var costs: Array = span[0].get("costs")
	r["scene_process"] = span_stats(costs.slice(mini(costs.size(), warm)))
	r["render_info"] = render_info(vp)
	r["settings_applied"] = applied
	r["toggles"] = toggles
	r["scene"] = scene_path
	r["size"] = [vp.size.x, vp.size.y]
	r["renderer"] = RenderingServer.get_current_rendering_method()
	r["driver"] = RenderingServer.get_current_rendering_driver_name()
	r["adapter"] = RenderingServer.get_video_adapter_name()
	var shot: String = job.arg("shot", "")
	if shot != "":
		await RenderingServer.frame_post_draw
		var img := vp.get_texture().get_image()
		var p: String = job.out_path(shot)
		img.save_png(p)
		r["shot"] = p
	inst.queue_free()
	return r


const AGENT_GD := """extends Node3D
var cooldown := 0.1
var timer := 0.1
var rays := 4
var hits := 0
var ray: RayCast3D

func _ready() -> void:
	ray = $Ray
	ray.enabled = false

func _physics_process(delta: float) -> void:
	timer -= delta
	if timer <= 0.0:
		timer += cooldown
		for i in rays:
			ray.target_position = Vector3(sin(float(i)), -1.0, cos(float(i))) * 20.0
			ray.force_raycast_update()
			if ray.is_colliding():
				hits += 1
"""

## Process-span sentinels: Performance.TIME_PROCESS is NOT per frame (it holds one value for about a
## second, the worst process step of the previous second, observed 4.7.2), so per-frame script cost
## is timed between a first (-1e6) and a last (+1e6) process_priority node.
const PROC_SENTINEL_GD := """extends Node
var t_start := 0
var costs: Array = []
var first = null

func _process(_d: float) -> void:
	if first == null:
		t_start = Time.get_ticks_usec()
	else:
		first.costs.append(Time.get_ticks_usec() - first.t_start)
"""


static func span_pair(parent: Node, src: String, physics: bool) -> Array:
	var sc := GDScript.new()
	sc.source_code = src
	sc.reload()
	var a := Node.new()
	a.name = "SpanFirst"
	a.set_script(sc)
	var b := Node.new()
	b.name = "SpanLast"
	b.set_script(sc)
	b.set("first", a)
	if physics:
		a.process_physics_priority = -1000000
		b.process_physics_priority = 1000000
	else:
		a.process_priority = -1000000
		b.process_priority = 1000000
	parent.add_child(a)
	parent.add_child(b)
	return [a, b]


static func span_stats(costs_us: Array) -> Dictionary:
	var ms: Array = costs_us.map(func(c): return float(c) / 1000.0)
	var s := ms.duplicate()
	s.sort()
	if s.is_empty():
		return {"n": 0}
	var mean := 0.0
	for v in s:
		mean += v
	return {"n": s.size(), "mean_ms": mean / s.size(), "p50_ms": s[s.size() / 2], "p95_ms": s[int(0.95 * (s.size() - 1))], "max_ms": s[-1]}


const SENTINEL_GD := """extends Node
var t_start := 0
var costs: Array = []
var first = null

func _physics_process(_d: float) -> void:
	if first == null:
		t_start = Time.get_ticks_usec()
	else:
		first.costs.append(Time.get_ticks_usec() - first.t_start)
"""


## Args: agents (600), mode ("sync" | "staggered"), cooldown (0.1), rays (4), frames (300),
## warmup (30), seed (1). Headless is fine: physics and scripts run, nothing is drawn.
func stagger(job) -> Dictionary:
	var n: int = job.arg("agents", 600)
	var mode: String = job.arg("mode", "sync")
	var cooldown: float = job.arg("cooldown", 0.1)
	var frames: int = job.arg("frames", 300)
	var warmup: int = job.arg("warmup", 30)
	var rng := RandomNumberGenerator.new()
	rng.seed = job.arg("seed", 1)
	var world := Node3D.new()
	world.name = "StaggerWorld"
	var floor_body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(200, 1, 200)
	shape.shape = box
	floor_body.add_child(shape)
	floor_body.position = Vector3(0, -0.5, 0)
	world.add_child(floor_body)
	var agent_script := GDScript.new()
	agent_script.source_code = AGENT_GD
	agent_script.reload()
	var sentinel_script := GDScript.new()
	sentinel_script.source_code = SENTINEL_GD
	sentinel_script.reload()
	var first := Node.new()
	first.set_script(sentinel_script)
	first.process_physics_priority = -1000000      # runs before every agent
	world.add_child(first)
	for i in n:
		var a := Node3D.new()
		a.set_script(agent_script)
		var ray := RayCast3D.new()
		ray.name = "Ray"
		a.add_child(ray)
		a.position = Vector3(rng.randf_range(-90, 90), 2.0, rng.randf_range(-90, 90))
		a.set("cooldown", cooldown)
		a.set("rays", job.arg("rays", 4))
		a.set("timer", cooldown if mode == "sync" else rng.randf() * cooldown)
		world.add_child(a)
	var last := Node.new()
	last.set_script(sentinel_script)
	last.set("first", first)
	last.process_physics_priority = 1000000        # runs after every agent
	world.add_child(last)
	job.root.add_child(world)
	await job.wait_physics_frames(warmup + frames)
	var costs: Array = first.get("costs")
	costs = costs.slice(costs.size() - frames)
	var ms: Array = costs.map(func(c): return float(c) / 1000.0)
	var sorted := ms.duplicate()
	sorted.sort()
	var mean := 0.0
	for v in ms:
		mean += v
	mean /= max(1, ms.size())
	var med: float = sorted[sorted.size() / 2] if not sorted.is_empty() else 0.0
	var spikes := 0
	for v in ms:
		if v > 2.0 * med and v > 0.2:
			spikes += 1
	var hits := 0
	for c in world.get_children():
		if c.get_script() == agent_script:
			hits += int(c.get("hits"))
	world.queue_free()
	return {"ok": true, "mode": mode, "agents": n, "frames": ms.size(), "mean_ms": mean, "median_ms": med,
			"p95_ms": sorted[int(0.95 * (sorted.size() - 1))] if not sorted.is_empty() else 0.0,
			"max_ms": sorted[-1] if not sorted.is_empty() else 0.0, "spike_frames": spikes, "hits": hits,
			"physics_ticks": Engine.physics_ticks_per_second, "series_ms": ms.slice(0, 60)}


const PIPE := {
	"canvas": Performance.PIPELINE_COMPILATIONS_CANVAS,
	"mesh": Performance.PIPELINE_COMPILATIONS_MESH,
	"surface": Performance.PIPELINE_COMPILATIONS_SURFACE,
	"draw": Performance.PIPELINE_COMPILATIONS_DRAW,
	"specialization": Performance.PIPELINE_COMPILATIONS_SPECIALIZATION,
}


static func _pipes() -> Dictionary:
	var d := {}
	for k in PIPE:
		d[k] = int(Performance.get_monitor(PIPE[k]))
	return d


## Args: area (res://perf_fx/area.tscn), mode ("sync" | "threaded" | "threaded_instantiate"),
## at_frame (60), frames (240), size [w, h] (960x540). Windowed for the draw cost; headless still
## measures load and instantiate time.
func hitch(job) -> Dictionary:
	var area: String = job.arg("area", "res://perf_fx/area.tscn")
	var mode: String = job.arg("mode", "sync")
	var at_frame: int = job.arg("at_frame", 60)
	var frames: int = job.arg("frames", 240)
	var size_a: Array = job.arg("size", [960, 540])
	var host: Node = job.root
	if not job.is_headless():
		var cap = Capture.new()
		host = cap.make_viewport(job, Vector2i(int(size_a[0]), int(size_a[1])), false)
	var stage := Node3D.new()
	var cam := Camera3D.new()
	cam.position = Vector3(0, 6, 6)
	cam.rotation_degrees = Vector3(-35, 0, 0)
	cam.current = true
	stage.add_child(cam)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -30, 0)
	stage.add_child(sun)
	host.add_child(stage)
	var rows: Array = []
	var last := Time.get_ticks_usec()
	var requested := -1
	var added := -1
	var load_ms := 0.0
	var instantiate_ms := 0.0
	var add_ms := 0.0
	var t_req := 0
	var worker_task := -1
	var worker_result: Array = [null]
	for f in frames:
		await job.process_frame
		var now := Time.get_ticks_usec()
		rows.append({"frame": f, "dt_ms": float(now - last) / 1000.0, "pipes": _pipes()})
		last = now
		if f == at_frame:
			requested = f
			t_req = Time.get_ticks_usec()
			if mode == "sync":
				var ps: PackedScene = load(area)
				load_ms = float(Time.get_ticks_usec() - t_req) / 1000.0
				var t1 := Time.get_ticks_usec()
				var node: Node = ps.instantiate()
				instantiate_ms = float(Time.get_ticks_usec() - t1) / 1000.0
				var t2 := Time.get_ticks_usec()
				stage.add_child(node)
				add_ms = float(Time.get_ticks_usec() - t2) / 1000.0
				added = f
			elif mode == "threaded":
				ResourceLoader.load_threaded_request(area, "", true)
			elif mode == "threaded_instantiate":
				worker_task = WorkerThreadPool.add_task(func():
					var ps2: PackedScene = ResourceLoader.load(area)
					worker_result[0] = ps2.instantiate()      # off-tree instantiate is allowed off the main thread
				)
		elif requested >= 0 and added < 0:
			if mode == "threaded" and ResourceLoader.load_threaded_get_status(area) == ResourceLoader.THREAD_LOAD_LOADED:
				var ps3: PackedScene = ResourceLoader.load_threaded_get(area)
				load_ms = float(Time.get_ticks_usec() - t_req) / 1000.0
				var t3 := Time.get_ticks_usec()
				var node3: Node = ps3.instantiate()
				instantiate_ms = float(Time.get_ticks_usec() - t3) / 1000.0
				var t4 := Time.get_ticks_usec()
				stage.add_child(node3)
				add_ms = float(Time.get_ticks_usec() - t4) / 1000.0
				added = f
			elif mode == "threaded_instantiate" and worker_task >= 0 and WorkerThreadPool.is_task_completed(worker_task):
				WorkerThreadPool.wait_for_task_completion(worker_task)
				load_ms = float(Time.get_ticks_usec() - t_req) / 1000.0
				var t5 := Time.get_ticks_usec()
				stage.add_child(worker_result[0])
				add_ms = float(Time.get_ticks_usec() - t5) / 1000.0
				added = f
	# the frame after `added` carries the add + first draw of the new area
	var dts: Array = rows.map(func(r): return r["dt_ms"])
	var worst := 0.0
	var worst_i := -1
	for i in dts.size():
		if i > 5 and dts[i] > worst:
			worst = dts[i]
			worst_i = i
	var base: Array = dts.slice(5, at_frame)
	base.sort()
	var base_med: float = base[base.size() / 2] if not base.is_empty() else 0.0
	var window: Array = []
	for i in range(max(0, added - 2), min(rows.size(), added + 8)):
		window.append(rows[i])
	var p0: Dictionary = rows[max(0, at_frame - 1)]["pipes"]
	var p1: Dictionary = rows[-1]["pipes"]
	var pipe_delta := {}
	for k in p0:
		pipe_delta[k] = p1[k] - p0[k]
	stage.queue_free()
	return {"ok": added >= 0, "error": "" if added >= 0 else "area never finished loading", "mode": mode,
			"requested_frame": requested, "added_frame": added, "frames_waiting": added - requested,
			"load_ms": load_ms, "instantiate_ms": instantiate_ms, "add_ms": add_ms, "baseline_median_ms": base_med,
			"worst_ms": worst, "worst_frame": worst_i, "pipelines_delta": pipe_delta, "around_add": window,
			"headless": job.is_headless(), "renderer": RenderingServer.get_current_rendering_method()}
