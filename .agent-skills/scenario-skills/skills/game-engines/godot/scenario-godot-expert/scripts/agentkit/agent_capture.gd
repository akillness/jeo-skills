extends RefCounted
## AgentKit capture (scenario-godot-expert 0.1, Godot 4.7.2): render a scene to PNG in a WINDOWED run.
##
## Headless runs draw nothing (Engine.get_frames_drawn() stays 0, verified 4.7.2), and
## --write-movie crashes under --headless, so every capture needs a window. gd_run opens a tiny one
## (160x90) and renders through a SubViewport at the requested size, so the window size does not
## limit the image.
##
## Job use:   gd_run.capture_scene(project, "res://main.tscn", out="shots/main.png", size=(1280, 720))
##            gd_run.capture_scene(project, "res://hero.tscn", views=["front", "three_quarter"])
##            gd_run.capture_sequence(project, "res://fx/explosion.tscn", count=8, every=6)
## From your own job (scene already built under root):
##   var cap = preload("res://addons/agentkit/agent_capture.gd").new()
##   var r: Dictionary = await cap.capture_node(self, my_root, "shots/a.png", Vector2i(1280, 720))
##
## View names (3D, framed on the scene bounds; flat planes such as floors are ignored when other
## geometry exists): front = camera on +Z looking at the model's front (Vector3.MODEL_FRONT is +Z),
## back = -Z, left = +X (the model's left side), right = -X, top = +Y, three_quarter = +X +Y +Z.

const VIEW_DIRS := {
	"front": Vector3(0, 0, 1),
	"back": Vector3(0, 0, -1),
	"left": Vector3(1, 0, 0),
	"right": Vector3(-1, 0, 0),
	"top": Vector3(0, 1, 0),
	"three_quarter": Vector3(0.62, 0.45, 0.65),
}


func capture(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "capture needs a windowed run: headless draws no frames (use gd_run.capture_scene or headless=False)"}
	var size: Vector2i = job.arg("size", Vector2i(1280, 720))
	var frames: int = job.arg("frames", 8)
	var out: String = job.arg("out", "captures/shot.png")
	var views: Array = job.arg("views", [])
	var cam_path: String = job.arg("camera", "")
	var scene_path: String = job.arg("scene", "")
	if scene_path == "":
		scene_path = str(ProjectSettings.get_setting("application/run/main_scene", ""))
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var vp := make_viewport(job, size, job.arg("transparent", false))
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	await job.wait_frames(2)
	var r := await _shoot(job, vp, inst, out, cam_path, frames, views)
	r["scene"] = scene_path
	vp.queue_free()
	await job.process_frame
	return r


## Capture a node that already lives in the main tree (shares its World2D/World3D and camera).
func capture_node(job, node: Node, out: String, size: Vector2i = Vector2i(1280, 720), cam_path: String = "",
		frames: int = 8, views: Array = []) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "capture needs a windowed run"}
	var vp := make_viewport(job, size, false)
	var src_vp := node.get_viewport()
	vp.world_3d = src_vp.find_world_3d()
	vp.world_2d = src_vp.find_world_2d()
	var r := await _shoot(job, vp, node, out, cam_path, frames, views, src_vp)
	vp.queue_free()
	return r


func make_viewport(job, size: Vector2i, transparent: bool) -> SubViewport:
	var rv: Viewport = job.root
	var vp := SubViewport.new()
	vp.name = "AgentCapture"
	vp.size = size
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.transparent_bg = transparent
	# Project anti-aliasing and scaling settings apply to the root viewport only: copy them.
	vp.msaa_2d = rv.msaa_2d
	vp.msaa_3d = rv.msaa_3d
	vp.screen_space_aa = rv.screen_space_aa
	vp.use_taa = rv.use_taa
	vp.use_debanding = rv.use_debanding
	vp.scaling_3d_mode = rv.scaling_3d_mode
	vp.scaling_3d_scale = rv.scaling_3d_scale
	vp.mesh_lod_threshold = rv.mesh_lod_threshold
	vp.use_hdr_2d = rv.use_hdr_2d
	vp.use_occlusion_culling = rv.use_occlusion_culling
	vp.anisotropic_filtering_level = rv.anisotropic_filtering_level
	vp.positional_shadow_atlas_size = rv.positional_shadow_atlas_size
	vp.canvas_item_default_texture_filter = rv.canvas_item_default_texture_filter
	vp.canvas_item_default_texture_repeat = rv.canvas_item_default_texture_repeat
	vp.snap_2d_transforms_to_pixel = rv.snap_2d_transforms_to_pixel
	vp.snap_2d_vertices_to_pixel = rv.snap_2d_vertices_to_pixel
	# Emulate the project stretch settings as the root window would apply them to a window of `size`
	# (stretch_compute below, the engine's Window::_update_viewport_size math). canvas_items: the
	# SubViewport is the drawn area (black bars excluded) with the 2D/UI canvas at the logical size;
	# viewport: the SubViewport renders at the low internal resolution and grab() scales it up.
	# grab() composites the bars (keep, keep_width, keep_height, integer scale) into a `size` image.
	# Job arg emulate_stretch=false turns this off (plain SubViewport at `size`).
	var st := stretch_compute(size, Vector2i(int(ProjectSettings.get_setting("display/window/size/viewport_width", 1152)),
			int(ProjectSettings.get_setting("display/window/size/viewport_height", 648))),
			str(ProjectSettings.get_setting("display/window/stretch/mode", "disabled")),
			str(ProjectSettings.get_setting("display/window/stretch/aspect", "keep")),
			str(ProjectSettings.get_setting("display/window/stretch/scale_mode", "fractional")),
			float(ProjectSettings.get_setting("display/window/stretch/scale", 1.0)))
	var emulate: bool = job.arg("emulate_stretch", true) if job.has_method("arg") else true
	if emulate and not (st["mode"] == "disabled" and is_equal_approx(float(st["factor"]), 1.0)):
		if st["mode"] == "viewport":
			vp.size = st["render"]
		else:
			vp.size = Vector2i(st["screen"])
			vp.size_2d_override = Vector2i((st["logical"] as Vector2).round())
			vp.size_2d_override_stretch = true
		st["full"] = size
		vp.set_meta("agent_stretch", st)
	job.root.add_child(vp)
	return vp


## Logical canvas, drawn area (screen), black-bar margin and scale for a window of `window` pixels.
## Port of scenario-godot-ui's ui_stretch.compute(), which matched the engine on 224 cases (logical size,
## origin, scale; tests/code/godot-ui); the lead re-checks it against the root window (L21).
## Returns {logical: Vector2, screen: Vector2, margin: Vector2, scale, scale_xy: Vector2, render: Vector2i,
## factor, mode, aspect}.
static func stretch_compute(window: Vector2i, base: Vector2i, mode: String = "canvas_items", aspect: String = "expand",
		scale_mode: String = "fractional", factor: float = 1.0) -> Dictionary:
	var f := factor
	if scale_mode == "integer":
		f = maxf(1.0, floorf(f))
	var video := Vector2(window)
	if mode == "disabled" or base.x == 0 or base.y == 0:
		return {"logical": video / f, "screen": video, "margin": Vector2.ZERO, "scale": f, "scale_xy": Vector2(f, f),
				"render": window, "factor": f, "mode": mode, "aspect": aspect}
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
	if scale_mode == "integer":
		var k := floorf(minf(screen_size.x / viewport_size.x, screen_size.y / viewport_size.y))
		screen_size = viewport_size * maxf(1.0, k)
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
	# scale_xy differs per axis only with aspect "ignore" (non-uniform stretch).
	return {"logical": logical, "screen": screen_size, "margin": margin, "scale": screen_size.x / logical.x,
			"scale_xy": screen_size / logical, "render": render, "factor": f, "mode": mode, "aspect": aspect}


## The image a window of the requested size would show: the SubViewport texture, scaled up in
## viewport mode, placed at the margin on black (transparent when transparent_bg) bars. Use it
## instead of vp.get_texture().get_image() on a make_viewport() SubViewport.
static func grab(vp: SubViewport) -> Image:
	var img := vp.get_texture().get_image()
	if img == null or img.is_empty() or not vp.has_meta("agent_stretch"):
		return img
	var st: Dictionary = vp.get_meta("agent_stretch")
	if img.get_format() != Image.FORMAT_RGBA8:
		img.convert(Image.FORMAT_RGBA8)
	var screen := Vector2i(st["screen"])
	if img.get_size() != screen:
		var nearest: bool = int(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter", 1)) == 0 \
				or str(ProjectSettings.get_setting("display/window/stretch/scale_mode", "fractional")) == "integer"
		img.resize(screen.x, screen.y, Image.INTERPOLATE_NEAREST if nearest else Image.INTERPOLATE_BILINEAR)
	var full: Vector2i = st["full"]
	if full == screen:
		return img
	var out := Image.create(full.x, full.y, false, Image.FORMAT_RGBA8)
	out.fill(Color(0, 0, 0, 0) if vp.transparent_bg else Color(0, 0, 0, 1))
	out.blit_rect(img, Rect2i(Vector2i.ZERO, screen), Vector2i(st["margin"]))
	return out


func _is_3d(n: Node) -> bool:
	if n is Node3D:
		return true
	if n is Node2D or n is Control:
		return false
	for c in n.get_children():
		if _is_3d(c):
			return true
	return false


func scene_aabb(n: Node) -> AABB:
	var boxes: Array = []
	var stack: Array = [n]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		if x is GeometryInstance3D and (x as GeometryInstance3D).visible:
			var gi := x as GeometryInstance3D
			var b: AABB = gi.global_transform * gi.get_aabb()
			if b.size.length() > 0.0:
				boxes.append(b)
		for c in x.get_children():
			stack.append(c)
	var solid: Array = []
	for b in boxes:
		var horiz := maxf(b.size.x, b.size.z)
		if horiz <= 0.0 or b.size.y > 0.01 * horiz:
			solid.append(b)
	var use: Array = solid if not solid.is_empty() else boxes
	if use.is_empty():
		return AABB(Vector3(-1, -1, -1), Vector3(2, 2, 2))
	var acc: AABB = use[0]
	for b in use:
		acc = acc.merge(b)
	return acc


func view_transform(aabb: AABB, view: String, fov_deg: float, aspect: float) -> Transform3D:
	var dir: Vector3 = VIEW_DIRS.get(view, VIEW_DIRS["three_quarter"]).normalized()
	var c := aabb.get_center()
	var radius := maxf(aabb.size.length() * 0.5, 0.01)
	var vfov := deg_to_rad(fov_deg)
	var hfov := 2.0 * atan(tan(vfov * 0.5) * aspect)
	var d := radius / sin(minf(vfov, hfov) * 0.5) * 1.05
	var pos := c + dir * d
	var up := Vector3.UP if absf(dir.dot(Vector3.UP)) < 0.99 else Vector3(0, 0, -1)
	return Transform3D(Basis.looking_at(c - pos, up), pos)


func _shoot(job, vp: SubViewport, scene_root: Node, out: String, cam_path: String, frames: int, views: Array,
		src_vp: Viewport = null) -> Dictionary:
	var images: Array = []
	var cams: Array = []
	var is3d := _is_3d(scene_root)
	var source_cam: Node = null
	if cam_path != "":
		source_cam = scene_root.get_node_or_null(cam_path)
		if source_cam == null:
			return {"ok": false, "error": "camera not found: " + cam_path}
	elif src_vp != null:
		source_cam = src_vp.get_camera_3d() if is3d else src_vp.get_camera_2d()
	else:
		source_cam = vp.get_camera_3d() if is3d else vp.get_camera_2d()
	var shots: Array = views.duplicate()
	if shots.is_empty():
		shots = ["camera" if source_cam != null else ("three_quarter" if is3d else "camera")]
	var own_cam: Node = null
	if is3d:
		var cam := Camera3D.new()
		cam.name = "AgentCaptureCam"
		vp.add_child(cam)
		own_cam = cam
		if source_cam is Camera3D:
			var sc := source_cam as Camera3D
			cam.projection = sc.projection
			cam.fov = sc.fov
			cam.size = sc.size
			cam.near = sc.near
			cam.far = sc.far
			cam.keep_aspect = sc.keep_aspect
			cam.h_offset = sc.h_offset
			cam.v_offset = sc.v_offset
			cam.cull_mask = sc.cull_mask
			cam.environment = sc.environment
			cam.attributes = sc.attributes
			cam.compositor = sc.compositor
		cam.current = true
		var aabb := scene_aabb(scene_root)
		var aspect := float(vp.size.x) / float(vp.size.y)
		for i in range(shots.size()):
			var v: String = str(shots[i])
			if v == "camera" and source_cam is Camera3D:
				cam.global_transform = (source_cam as Camera3D).global_transform
			else:
				cam.global_transform = view_transform(aabb, v, cam.fov, aspect)
			await job.wait_frames(frames)
			await RenderingServer.frame_post_draw
			var path := _out_name(job, out, v, i, shots.size())
			var err := _save(vp, path)
			if err != "":
				return {"ok": false, "error": err}
			images.append(path)
			cams.append({"view": v, "transform": cam.global_transform})
		cams.append({"aabb": aabb})
	else:
		var cam2 := Camera2D.new()
		cam2.name = "AgentCaptureCam2D"
		vp.add_child(cam2)
		own_cam = cam2
		if source_cam is Camera2D:
			var s2 := source_cam as Camera2D
			cam2.global_position = s2.get_screen_center_position()
			cam2.zoom = s2.zoom
			cam2.rotation = s2.global_rotation if not s2.ignore_rotation else 0.0
			cam2.ignore_rotation = s2.ignore_rotation
			cam2.enabled = true
			cam2.make_current()
		else:
			cam2.enabled = false
		for i in range(shots.size()):
			await job.wait_frames(frames)
			await RenderingServer.frame_post_draw
			var path2 := _out_name(job, out, str(shots[i]), i, shots.size())
			var err2 := _save(vp, path2)
			if err2 != "":
				return {"ok": false, "error": err2}
			images.append(path2)
			cams.append({"view": str(shots[i]), "camera": "copied" if source_cam is Camera2D else "none (canvas origin)"})
	if own_cam:
		own_cam.queue_free()
	var st: Dictionary = vp.get_meta("agent_stretch") if vp.has_meta("agent_stretch") else {}
	return {"ok": true, "images": images, "size": st.get("full", vp.size), "mode": "3d" if is3d else "2d", "views": cams,
			"source_camera": str(source_cam.name) if source_cam else "", "stretch": st}


func _out_name(job, out: String, view: String, i: int, n: int) -> String:
	var p := out
	if n > 1:
		p = out.get_basename() + "_" + view + "." + (out.get_extension() if out.get_extension() != "" else "png")
	return job.out_path(p)


func _save(vp: SubViewport, path: String) -> String:
	var img := grab(vp)
	if img == null or img.is_empty():
		return "viewport returned no image (renderer not drawing?)"
	if img.get_format() != Image.FORMAT_RGBA8 and img.get_format() != Image.FORMAT_RGB8:
		img.convert(Image.FORMAT_RGBA8)
	var err := img.save_png(path)
	return "" if err == OK else "save_png failed: " + error_string(err)


## Capture `count` frames, one every `every` rendered frames (particles, animation, tweens).
func sequence(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "sequence capture needs a windowed run"}
	var scene_path: String = job.arg("scene", "")
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size: Vector2i = job.arg("size", Vector2i(640, 360))
	var count: int = job.arg("count", 8)
	var every: int = job.arg("every", 6)
	var out_dir: String = job.arg("out_dir", "captures/seq")
	var vp := make_viewport(job, size, job.arg("transparent", false))
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	var is3d := _is_3d(inst)
	var cam_path: String = job.arg("camera", "")
	if is3d and vp.get_camera_3d() == null and cam_path == "":
		var cam := Camera3D.new()
		vp.add_child(cam)
		await job.wait_frames(1)
		cam.global_transform = view_transform(scene_aabb(inst), str(job.arg("view", "three_quarter")), cam.fov, float(vp.size.x) / vp.size.y)
		cam.current = true
	elif cam_path != "":
		var c = inst.get_node_or_null(cam_path)
		if c is Camera3D:
			(c as Camera3D).current = true
		elif c is Camera2D:
			(c as Camera2D).make_current()
	var images: Array = []
	var t0 := Time.get_ticks_msec()
	for i in range(count):
		await job.wait_frames(every)
		await RenderingServer.frame_post_draw
		var p: String = job.out_path(out_dir.path_join("frame_%03d.png" % i))
		var err := _save(vp, p)
		if err != "":
			return {"ok": false, "error": err}
		images.append(p)
	var elapsed := (Time.get_ticks_msec() - t0) / 1000.0
	if vp.has_meta("agent_stretch"):
		size = vp.get_meta("agent_stretch")["full"]
	vp.queue_free()
	return {"ok": true, "images": images, "count": count, "every_frames": every, "elapsed_s": elapsed,
			"mode": "3d" if is3d else "2d", "scene": scene_path, "size": size}
