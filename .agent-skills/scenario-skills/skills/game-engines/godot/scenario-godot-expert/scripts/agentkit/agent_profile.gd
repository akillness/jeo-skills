extends RefCounted
## AgentKit profiling (scenario-godot-expert 0.1, Godot 4.7.2): per-frame timings and Performance monitors to CSV.
##
##   gd_run.profile_scene(project, "res://main.tscn", seconds=5)                       # windowed, root viewport
##   gd_run.profile_scene(project, "res://main.tscn", seconds=5, size=(1920, 1080))    # GPU cost at 1080p
##   gd_run.profile_scene(project, "res://main.tscn", headless=True)                   # CPU only
##
## Columns: frame, t_s, frame_ms (wall clock between process frames), process_ms, physics_ms,
## navigation_ms, cpu_ms and gpu_ms (RenderingServer measured render time of the measured viewport),
## draw_calls, objects, primitives, video_mem_mb, texture_mem_mb, nodes, orphans, objects_total,
## static_mem_mb, physics2d_active, physics3d_active, physics3d_pairs, pipeline_compiles.
## process_wall_ms (last column): wall time from the first to the last node _process of the frame,
## measured by two sentinel nodes at process_priority -1e6 and +1e6 (previous frame's value, one
## frame of lag). process_ms and physics_ms are the TIME_* Performance monitors: they refresh about
## once per second (the same value on every row, observed 4.7.2 by scenario-godot-performance-export) and read 0
## under --fixed-fps, so they are not per-frame values. Judge per-frame script cost on process_wall_ms.
## Headless: no frame is drawn, so render columns stay 0, and frame_ms is paced at about 6.9 ms by
## the low-processor sleep (low_processor_usage_mode_sleep_usec 6900), not the game's cost.

const MONITORS := {
	"process_ms": Performance.TIME_PROCESS,
	"physics_ms": Performance.TIME_PHYSICS_PROCESS,
	"navigation_ms": Performance.TIME_NAVIGATION_PROCESS,
	"draw_calls": Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME,
	"objects": Performance.RENDER_TOTAL_OBJECTS_IN_FRAME,
	"primitives": Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME,
	"video_mem_mb": Performance.RENDER_VIDEO_MEM_USED,
	"texture_mem_mb": Performance.RENDER_TEXTURE_MEM_USED,
	"nodes": Performance.OBJECT_NODE_COUNT,
	"orphans": Performance.OBJECT_ORPHAN_NODE_COUNT,
	"objects_total": Performance.OBJECT_COUNT,
	"static_mem_mb": Performance.MEMORY_STATIC,
	"physics2d_active": Performance.PHYSICS_2D_ACTIVE_OBJECTS,
	"physics3d_active": Performance.PHYSICS_3D_ACTIVE_OBJECTS,
	"physics3d_pairs": Performance.PHYSICS_3D_COLLISION_PAIRS,
	"pipeline_compiles": Performance.PIPELINE_COMPILATIONS_DRAW,
}
class _Sentinel extends Node:
	var stamp_usec := 0

	func _process(_delta: float) -> void:
		stamp_usec = Time.get_ticks_usec()


const SECONDS_TO_MS := ["process_ms", "physics_ms", "navigation_ms"]
const BYTES_TO_MB := ["video_mem_mb", "texture_mem_mb", "static_mem_mb"]


func profile(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "")
	if scene_path == "":
		scene_path = str(ProjectSettings.get_setting("application/run/main_scene", ""))
	var seconds: float = job.arg("seconds", 5.0)
	var warmup: int = job.arg("warmup", 30)
	var csv_rel: String = job.arg("csv", "profile/frames.csv")
	var size_arr: Array = job.arg("size", [])
	var measured_vp: Viewport = job.root
	var inst: Node = null
	if scene_path != "":
		if not ResourceLoader.exists(scene_path):
			return {"ok": false, "error": "scene not found: " + scene_path}
		inst = (load(scene_path) as PackedScene).instantiate()
		if size_arr.size() >= 2 and not job.is_headless():
			var cap = load("res://addons/agentkit/agent_capture.gd").new()
			var vp: SubViewport = cap.make_viewport(job, Vector2i(int(size_arr[0]), int(size_arr[1])), false)
			vp.add_child(inst)
			measured_vp = vp
		else:
			job.root.add_child(inst)
	var r := await record(job, csv_rel, seconds, warmup, measured_vp)
	r["scene"] = scene_path
	r["measured_viewport"] = "subviewport %s" % [measured_vp.size] if measured_vp != job.root else "root"
	if inst:
		inst.queue_free()
	return r


## Record frames for `seconds` after `warmup` frames. Usable from any job:
##   var prof = preload("res://addons/agentkit/agent_profile.gd").new()
##   var r: Dictionary = await prof.record(self, "profile/run.csv", 3.0, 30, root)
func record(job, csv_rel: String, seconds: float, warmup: int, vp: Viewport) -> Dictionary:
	var rid := vp.get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(rid, true)
	await job.wait_frames(warmup)
	var path: String = job.out_path(csv_rel)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return {"ok": false, "error": "cannot write " + path}
	var cols: Array = ["frame", "t_s", "frame_ms", "cpu_ms", "gpu_ms"]
	cols.append_array(MONITORS.keys())
	cols.append("process_wall_ms")
	var first := _Sentinel.new()
	first.name = "AgentProfileFirst"
	first.process_priority = -1000000
	var last_s := _Sentinel.new()
	last_s.name = "AgentProfileLast"
	last_s.process_priority = 1000000
	job.root.add_child(first)
	job.root.add_child(last_s)
	f.store_line(",".join(cols))
	var t_start := Time.get_ticks_usec()
	var last := t_start
	var n := 0
	var frame_ms_all: Array = []
	var max_draw := 0.0
	var max_gpu := 0.0
	while true:
		await job.process_frame
		var now := Time.get_ticks_usec()
		var dt := float(now - last) / 1000.0
		last = now
		var t := float(now - t_start) / 1e6
		var row: Array = [n, "%.4f" % t, "%.3f" % dt,
				"%.3f" % RenderingServer.viewport_get_measured_render_time_cpu(rid),
				"%.3f" % RenderingServer.viewport_get_measured_render_time_gpu(rid)]
		max_gpu = maxf(max_gpu, RenderingServer.viewport_get_measured_render_time_gpu(rid))
		for k in MONITORS:
			var v := float(Performance.get_monitor(MONITORS[k]))
			if k in SECONDS_TO_MS:
				v *= 1000.0
			elif k in BYTES_TO_MB:
				v /= 1048576.0
			if k == "draw_calls":
				max_draw = maxf(max_draw, v)
			row.append("%.3f" % v)
		var pw := float(last_s.stamp_usec - first.stamp_usec) / 1000.0 if last_s.stamp_usec >= first.stamp_usec and first.stamp_usec > 0 else 0.0
		row.append("%.3f" % pw)
		f.store_line(",".join(row.map(func(x): return str(x))))
		frame_ms_all.append(dt)
		n += 1
		if t >= seconds:
			break
	f.close()
	first.queue_free()
	last_s.queue_free()
	RenderingServer.viewport_set_measure_render_time(rid, false)
	frame_ms_all.sort()
	var p95: float = frame_ms_all[int(0.95 * (frame_ms_all.size() - 1))] if not frame_ms_all.is_empty() else 0.0
	var mean := 0.0
	for x in frame_ms_all:
		mean += x
	mean /= max(1, frame_ms_all.size())
	var notes: Array = []
	if job.is_headless():
		notes.append("headless: nothing is drawn, render and GPU columns are 0; frame_ms is paced by the low-processor sleep (about 6.9 ms), not game cost; benchmark with --fixed-fps 60 and process_wall_ms")
	else:
		if max_gpu <= 0.0:
			notes.append("gpu_ms is 0: the Metal driver reports no GPU time in 4.7.2; rerun with --rendering-driver vulkan (gd_run.profile_scene(driver=\"vulkan\"))")
		notes.append("windowed on macOS: frame_ms is capped at the display refresh (8.33 ms at 120 Hz observed, even with --disable-vsync); judge cost on gpu_ms and cpu_ms")
	return {"ok": true, "csv": path, "frames": n, "seconds": seconds, "mean_frame_ms": mean, "p95_frame_ms": p95,
			"max_draw_calls": max_draw, "max_gpu_ms": max_gpu,
		"notes": notes + ["process_ms/physics_ms are TIME_* monitors refreshed about once per second, not per frame: use process_wall_ms"]}
