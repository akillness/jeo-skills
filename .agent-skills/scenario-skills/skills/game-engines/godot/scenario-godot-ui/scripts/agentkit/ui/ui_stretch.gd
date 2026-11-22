extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): stretch math and device emulation.
##
## compute() reproduces Window::_update_viewport_size() for the root window: given a physical window
## size and the stretch settings it returns the logical canvas the UI lays out in (what
## get_viewport().get_visible_rect() reports), the drawn area and the black-bar margins.
## Parity with the engine was checked headless on 2026-10-02 (tests/code/godot-ui, L2): the engine
## value comes from setting root.size, which works in --headless (the root starts at 64x64 but takes
## any size you set, and content scaling is applied).
##
##   const Stretch = preload("res://addons/agentkit/ui/ui_stretch.gd")
##   var s := Stretch.compute(Vector2i(1080, 2400), Vector2i(1152, 648), "canvas_items", "expand")
##   s.logical -> Vector2(1152, 2560), s.scale -> 0.9375
##   await Stretch.set_device(job, Vector2i(1080, 2400))     # headless layout at a phone size

const MODES := {"disabled": 0, "canvas_items": 1, "viewport": 2}
const ASPECTS := {"ignore": 0, "keep": 1, "keep_width": 2, "keep_height": 3, "expand": 4}
const STRETCHES := {"fractional": 0, "integer": 1}


static func project_settings() -> Dictionary:
	return {
		"base": Vector2i(int(ProjectSettings.get_setting("display/window/size/viewport_width", 1152)),
				int(ProjectSettings.get_setting("display/window/size/viewport_height", 648))),
		"mode": str(ProjectSettings.get_setting("display/window/stretch/mode", "disabled")),
		"aspect": str(ProjectSettings.get_setting("display/window/stretch/aspect", "keep")),
		"stretch": str(ProjectSettings.get_setting("display/window/stretch/scale_mode", "fractional")),
		"factor": float(ProjectSettings.get_setting("display/window/stretch/scale", 1.0)),
	}


## Logical canvas, drawn area and margins for one physical window size.
## Returns {logical: Vector2, screen: Vector2, margin: Vector2, scale: float, render: Vector2i,
## factor: float, mode, aspect}. `render` is the internal resolution in viewport mode.
static func compute(window: Vector2i, base: Vector2i, mode: String = "canvas_items", aspect: String = "expand",
		stretch: String = "fractional", factor: float = 1.0) -> Dictionary:
	var f := factor
	if stretch == "integer":
		f = maxf(1.0, floorf(f))
	var video := Vector2(window)
	if mode == "disabled" or base.x == 0 or base.y == 0:
		return {"logical": video / f, "screen": video, "margin": Vector2.ZERO, "scale": f, "render": window,
				"factor": f, "mode": mode, "aspect": aspect}
	var desired := Vector2(base)
	var vp_aspect := desired.aspect()
	var vm_aspect := video.aspect()
	var viewport_size := Vector2.ZERO
	var screen_size := Vector2.ZERO
	if aspect == "ignore" or is_equal_approx(vp_aspect, vm_aspect):
		viewport_size = desired
		screen_size = video
	elif vp_aspect < vm_aspect:
		if aspect == "keep_height" or aspect == "expand":
			viewport_size = Vector2(desired.y * vm_aspect, desired.y)
			screen_size = video
		else:
			viewport_size = desired
			screen_size = Vector2(video.y * vp_aspect, video.y)
	else:
		if aspect == "keep_width" or aspect == "expand":
			viewport_size = Vector2(desired.x, desired.x / vm_aspect)
			screen_size = video
		else:
			viewport_size = desired
			screen_size = Vector2(video.x, video.x / vp_aspect)
	screen_size = screen_size.floor()
	viewport_size = viewport_size.floor()
	if stretch == "integer":
		var k := floorf(minf(screen_size.x / viewport_size.x, screen_size.y / viewport_size.y))
		screen_size = viewport_size * maxf(1.0, k)
	# Centred on each axis where the drawn area is smaller than the window: black bars for keep*,
	# and also with expand when integer stretch leaves a border (engine origin checked by parity()).
	var margin := Vector2.ZERO
	if screen_size.x < video.x:
		margin.x = roundf((video.x - screen_size.x) / 2.0)
	if screen_size.y < video.y:
		margin.y = roundf((video.y - screen_size.y) / 2.0)
	var logical := viewport_size / f
	var render := Vector2i(window)
	if mode == "viewport":
		render = Vector2i((viewport_size / f).floor())
		logical = Vector2(render)
	return {"logical": logical, "screen": screen_size, "margin": margin, "scale": screen_size.x / logical.x,
			"render": render, "factor": f, "mode": mode, "aspect": aspect}


## Headless or windowed: resize the root window and wait for layout. Uses the project stretch
## settings unless overridden. Windowed runs would resize the real OS window: use it headless.
static func set_device(job, size: Vector2i, factor: float = -1.0, frames: int = 2) -> Dictionary:
	var w: Window = job.root
	w.size = size
	if factor > 0.0:
		w.content_scale_factor = factor
	await job.wait_frames(frames)
	return {"size": w.size, "visible": w.get_visible_rect().size, "scale": w.get_final_transform().get_scale().x,
			"origin": w.get_final_transform().origin}


## Apply stretch settings to the root at runtime (same effect as the project settings).
static func apply_root(w: Window, mode: String, aspect: String, base: Vector2i, stretch: String = "fractional",
		factor: float = 1.0) -> void:
	w.content_scale_mode = MODES.get(mode, 1)
	w.content_scale_aspect = ASPECTS.get(aspect, 4)
	w.content_scale_size = base
	w.content_scale_stretch = STRETCHES.get(stretch, 0)
	w.content_scale_factor = factor


## Job method: engine values for a list of cases, for parity checks against compute().
## args: cases = [[w, h, mode, aspect, stretch, factor, bw, bh], ...]
func parity(job) -> Dictionary:
	var cases: Array = job.arg("cases", [])
	var out: Array = []
	var w: Window = job.root
	for c in cases:
		var base := Vector2i(int(c[6]), int(c[7]))
		apply_root(w, str(c[2]), str(c[3]), base, str(c[4]), float(c[5]))
		w.size = Vector2i(int(c[0]), int(c[1]))
		await job.wait_frames(2)
		var engine_logical := w.get_visible_rect().size
		var xf := w.get_final_transform()
		var mine := compute(Vector2i(int(c[0]), int(c[1])), base, str(c[2]), str(c[3]), str(c[4]), float(c[5]))
		var ok: bool = (engine_logical - mine["logical"]).length() < 1.01 and (xf.origin - mine["margin"]).length() < 1.01 \
				and absf(xf.get_scale().y - mine["scale"]) < 0.01
		out.append({"case": c, "engine_logical": engine_logical, "engine_scale": xf.get_scale(), "engine_origin": xf.origin,
				"mine_logical": mine["logical"], "mine_scale": mine["scale"], "mine_margin": mine["margin"], "match": ok})
	var bad := out.filter(func(x): return not x["match"])
	return {"ok": bad.is_empty(), "cases": out, "mismatches": bad.size()}
