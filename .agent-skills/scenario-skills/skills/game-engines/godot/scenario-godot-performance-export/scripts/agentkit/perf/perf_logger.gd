extends Node
## scenario-godot-performance-export 0.1 (Godot 4.7.2): frame logger for EXPORTED builds (desktop, Android,
## iOS, web), where the editor profiler cannot attach. Add as an autoload; it stays idle unless the
## build is started with user args:
##
##   ./Game --headless -- --perf-log --perf-seconds 10 --perf-quit      (desktop smoke; --perf-warmup N skips N startup frames)
##   adb shell am start -n <pkg>/com.godot.game.GodotApp -e command_line_params "--perf-log"  [not run here]
##
## It prints one `SHIP_BOOT {json}` line at start (platform, feature tags, renderer, driver) and, after
## --perf-seconds, one `PERF_SUMMARY {json}` line (frame-time percentiles, hitches, GPU ms, draw calls,
## pipeline compilations), and writes user://perf/frames_<unix>.csv. --perf-quit quits after that.

var _on := false
var _seconds := 10.0
var _quit := false
var _t0 := 0
var _last := 0
var _rows: PackedStringArray = []
var _dts: PackedFloat32Array = []
var _gpu: PackedFloat32Array = []
var _draws: PackedFloat32Array = []
var _pipes0 := 0
var _vp: RID
var _warm := 10
var _frame := 0
var first_frames_ms: PackedFloat32Array = []


func _ready() -> void:
	var ua := OS.get_cmdline_user_args()
	_on = ua.has("--perf-log")
	_quit = ua.has("--perf-quit")
	var i := ua.find("--perf-seconds")
	if i >= 0 and i + 1 < ua.size():
		_seconds = float(ua[i + 1])
	var w := ua.find("--perf-warmup")
	if w >= 0 and w + 1 < ua.size():
		_warm = int(ua[w + 1])
	var tags: Array = []
	for t in ["template", "editor", "debug", "release", "web", "mobile", "pc", "macos", "android", "ios",
			"linuxbsd", "windows", "arm64", "x86_64", "demo", "full", "perf", "threads", "nothreads"]:
		if OS.has_feature(t):
			tags.append(t)
	var boot := {
		"platform": OS.get_name(), "tags": tags, "renderer": RenderingServer.get_current_rendering_method(),
		"driver": RenderingServer.get_current_rendering_driver_name(), "adapter": RenderingServer.get_video_adapter_name(),
		"godot": Engine.get_version_info().get("string", ""), "display": DisplayServer.get_name(),
		"userfs_persistent": OS.is_userfs_persistent(), "processors": OS.get_processor_count(),
	}
	print("SHIP_BOOT " + JSON.stringify(boot))
	if not _on:
		set_process(false)
		return
	_vp = get_viewport().get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(_vp, true)
	_pipes0 = _pipeline_total()
	_t0 = Time.get_ticks_usec()
	_last = _t0
	_rows.append("t_s,frame_ms,gpu_ms,process_ms,physics_ms,draw_calls,objects,pipelines")


static func _pipeline_total() -> int:
	return int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_MESH) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SURFACE)
			+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_DRAW) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SPECIALIZATION))


func _process(_delta: float) -> void:
	var now := Time.get_ticks_usec()
	var dt := float(now - _last) / 1000.0
	_last = now
	_frame += 1
	if _frame <= _warm:
		# startup frames (window creation, first pipelines: 1008 ms seen on the first windowed frame)
		# are reported apart, not mixed into the percentiles. --perf-warmup N (default 10).
		first_frames_ms.append(dt)
		_t0 = now
		return
	var gpu := RenderingServer.viewport_get_measured_render_time_gpu(_vp)
	var draws := Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	_dts.append(dt)
	_gpu.append(gpu)
	_draws.append(draws)
	_rows.append("%.4f,%.3f,%.3f,%.3f,%.3f,%d,%d,%d" % [float(now - _t0) / 1e6, dt, gpu,
			Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0, Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
			int(draws), int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)), _pipeline_total() - _pipes0])
	if float(now - _t0) / 1e6 >= _seconds:
		_finish()


func _finish() -> void:
	set_process(false)
	var d := _dts.duplicate()
	d.sort()
	var g := _gpu.duplicate()
	g.sort()
	var n := d.size()
	var mean := 0.0
	for v in d:
		mean += v
	mean /= max(1, n)
	var med: float = d[n / 2] if n > 0 else 0.0
	var max_draws := 0.0
	for v in _draws:
		max_draws = maxf(max_draws, v)
	var hitches := 0
	for v in _dts:
		if v > 2.0 * med:
			hitches += 1
	DirAccess.make_dir_recursive_absolute("user://perf")
	var csv := "user://perf/frames_%d.csv" % int(Time.get_unix_time_from_system())
	var f := FileAccess.open(csv, FileAccess.WRITE)
	if f:
		f.store_string("\n".join(_rows))
		f.close()
	var s := {
		"frames": n, "seconds": _seconds, "mean_ms": mean, "p50_ms": med,
		"p95_ms": d[int(0.95 * (n - 1))] if n > 0 else 0.0, "p99_ms": d[int(0.99 * (n - 1))] if n > 0 else 0.0,
		"max_ms": d[n - 1] if n > 0 else 0.0, "hitches": hitches,
		"gpu_p95_ms": g[int(0.95 * (n - 1))] if n > 0 else 0.0, "max_draw_calls": max_draws,
		"pipelines_compiled": _pipeline_total() - _pipes0, "warmup_frames": _warm,
			"warmup_max_ms": Array(first_frames_ms).max() if first_frames_ms.size() > 0 else 0.0, "csv": ProjectSettings.globalize_path(csv),
	}
	print("PERF_SUMMARY " + JSON.stringify(s))
	if _quit:
		get_tree().quit()
