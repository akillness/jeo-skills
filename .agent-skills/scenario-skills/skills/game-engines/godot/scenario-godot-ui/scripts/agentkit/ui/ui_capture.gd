extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): render a UI scene at device sizes larger than the screen (windowed run).
##
## Each target renders in a SubViewport sized to the drawn area, with size_2d_override set to the
## logical canvas from ui_stretch.compute() (the root's own stretch math), then is composited at the
## black-bar margin into an image of the full physical size. Fonts are rasterized at the target
## resolution, as on the device. Optional safe-area insets are drawn as translucent red bands so a
## reviewer sees what a notch would cover.
##
## Why not an embedded Window with content_scale_*: inside a SubViewport it lays out at the right
## logical size but draws unscaled (UI in the top-left corner of a 4K image; observed 2026-10-02).
##
## Job use: gd_ui.capture_matrix(P, "res://ui/hud.tscn", targets, out_dir="captures/hud")

const Stretch = preload("res://addons/agentkit/ui/ui_stretch.gd")
const Layout = preload("res://addons/agentkit/ui/ui_layout.gd")


func matrix(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "capture needs a windowed run (headless draws no frames)"}
	var scene_path: String = job.arg("scene", "")
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var locale: String = job.arg("locale", "")
	if locale != "":
		TranslationServer.set_locale(locale)
	if job.arg("pseudo", false):
		ProjectSettings.set_setting("internationalization/pseudolocalization/expansion_ratio", job.arg("expansion", 0.3))
		TranslationServer.pseudolocalization_enabled = true
		TranslationServer.reload_pseudolocalization()
	var targets: Array = job.arg("targets", [["hd", 1280, 720]])
	var out_dir: String = job.arg("out_dir", "captures/ui")
	var frames: int = job.arg("frames", 6)
	var insets: Dictionary = job.arg("safe_insets", {})
	var factor: float = job.arg("factor", -1.0)
	var setup: String = job.arg("setup", "")
	var ps := Stretch.project_settings()
	var images: Array = []
	var meta := {}
	for t in targets:
		var name := str(t[0])
		var size := Vector2i(int(t[1]), int(t[2]))
		var st := Stretch.compute(size, ps["base"], ps["mode"], ps["aspect"], ps["stretch"], factor if factor > 0.0 else ps["factor"])
		var sv := SubViewport.new()
		sv.name = "UICapture_" + name
		sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		sv.transparent_bg = false
		sv.canvas_item_default_texture_filter = job.root.canvas_item_default_texture_filter
		sv.snap_2d_transforms_to_pixel = job.root.snap_2d_transforms_to_pixel
		sv.msaa_2d = job.root.msaa_2d
		if ps["mode"] == "viewport":
			sv.size = st["render"]
		else:
			sv.size = Vector2i(st["screen"])
			sv.size_2d_override = Vector2i(st["logical"].round())
			sv.size_2d_override_stretch = true
		job.root.add_child(sv)
		var inst: Node = (load(scene_path) as PackedScene).instantiate()
		sv.add_child(inst)
		if setup != "":
			var i := setup.rfind(":")
			var mod = load(setup.substr(0, i)).new()
			await mod.call(setup.substr(i + 1), job, inst)
		await job.wait_frames(1)
		Layout.apply_insets(inst, insets.get(name, []))
		await job.wait_frames(frames)
		await RenderingServer.frame_post_draw
		var img := sv.get_texture().get_image()
		if img == null or img.is_empty():
			return {"ok": false, "error": "SubViewport returned no image"}
		img.convert(Image.FORMAT_RGBA8)
		if ps["mode"] == "viewport":
			img.resize(int(st["screen"].x), int(st["screen"].y), Image.INTERPOLATE_NEAREST)
		var full := Image.create_empty(size.x, size.y, false, Image.FORMAT_RGBA8)
		full.fill(Color.BLACK)
		full.blit_rect(img, Rect2i(Vector2i.ZERO, img.get_size()), Vector2i(st["margin"]))
		var ins: Array = insets.get(name, [])
		if ins.size() >= 4:
			_band(full, Rect2i(0, 0, int(ins[0]), size.y))
			_band(full, Rect2i(0, 0, size.x, int(ins[1])))
			_band(full, Rect2i(size.x - int(ins[2]), 0, int(ins[2]), size.y))
			_band(full, Rect2i(0, size.y - int(ins[3]), size.x, int(ins[3])))
		var p: String = job.out_path(out_dir.path_join("%s_%dx%d.png" % [name, size.x, size.y]))
		DirAccess.make_dir_recursive_absolute(p.get_base_dir())
		var err := full.save_png(p)
		if err != OK:
			return {"ok": false, "error": "save_png failed " + error_string(err)}
		images.append(p)
		meta[name] = {"physical": size, "logical": st["logical"], "scale": st["scale"], "margin": st["margin"], "image": p}
		sv.queue_free()
		await job.wait_frames(1)
	if job.arg("pseudo", false):
		TranslationServer.pseudolocalization_enabled = false
	return {"ok": true, "images": images, "targets": meta, "scene": scene_path, "locale": TranslationServer.get_locale()}


static func _band(img: Image, r: Rect2i) -> void:
	if r.size.x <= 0 or r.size.y <= 0:
		return
	var band := Image.create_empty(r.size.x, r.size.y, false, Image.FORMAT_RGBA8)
	band.fill(Color(1.0, 0.0, 0.0, 0.35))
	img.blend_rect(band, Rect2i(Vector2i.ZERO, r.size), r.position)
