extends RefCounted
## scenario-godot-2d: SpriteFrames from a scenario-sprite-pipeline manifest (Godot 4.7.2).
## A clip is one strip or grid: {"src", "frames", "w", "h", "ground", "fps"?, "loop"?}. `ground` is
## the feet row (frame 0's ink bottom, measured by the pipeline), in frame pixels. Every clip is
## registered on the same feet point, so idle, run and attack line up although the generator framed
## them differently: AnimatedSprite2D origin = feet centre (offset (-w/2, -(ground+1)), centered off).
## That origin is also what Y-sort compares, so characters sort by their feet.
##
## Job use:  run_script(P, "res://addons/agentkit/2d/sprite_frames_builder.gd:build",
##             {"manifest": "res://art/sprites/manifest.json", "character": "hero",
##              "out": "res://art/sprites/hero_frames.tres"})

const META := "agentkit_clips"


func build(job) -> Dictionary:
	var info := {}
	var sf := from_manifest(job.arg("manifest"), job.arg("character"), info, job.arg("fps", 10.0))
	if sf == null:
		return {"ok": false, "error": info.get("error", "build failed"), "info": info}
	var out: String = job.arg("out", "res://art/sprites/%s_frames.tres" % job.arg("character"))
	var err := ResourceSaver.save(sf, out)
	return {"ok": err == OK, "out": out, "info": info}


## Builds SpriteFrames; per-clip geometry is stored as metadata on the resource so a sprite can be
## registered later (see register). Textures load through the import system when the file is under
## res:// and imported (filter, fix_alpha_border apply); otherwise from the file at runtime.
static func from_manifest(manifest_path: String, character: String, info: Dictionary, default_fps: float = 10.0) -> SpriteFrames:
	var txt := FileAccess.get_file_as_string(manifest_path)
	var m = JSON.parse_string(txt)
	if not (m is Dictionary) or not m.has("clips") or not m["clips"].has(character):
		info["error"] = "no clips.%s in %s" % [character, manifest_path]
		return null
	var base := manifest_path.get_base_dir()
	var sf := SpriteFrames.new()
	if sf.has_animation(&"default"):
		sf.remove_animation(&"default")
	var meta := {}
	var clips: Dictionary = m["clips"][character]
	info["clips"] = {}
	for clip_name in clips:
		var c: Dictionary = clips[clip_name]
		var src: String = c["src"]
		var path := src if src.begins_with("res://") or src.begins_with("user://") else base.path_join(src)
		var tex := load_texture(path)
		if tex == null:
			info["clips"][clip_name] = "missing " + path       # degrade gracefully: skip the clip
			continue
		var w := int(c["w"])
		var h := int(c["h"])
		var n := int(c["frames"])
		var cols := maxi(1, tex.get_width() / w)
		sf.add_animation(clip_name)
		sf.set_animation_speed(clip_name, float(c.get("fps", default_fps)))
		sf.set_animation_loop(clip_name, bool(c.get("loop", true)))
		for i in n:
			var at := AtlasTexture.new()
			at.atlas = tex
			at.region = Rect2((i % cols) * w, (i / cols) * h, w, h)
			sf.add_frame(clip_name, at)
		var ground := int(c.get("ground", h - 1))
		meta[clip_name] = {"w": w, "h": h, "ground": ground, "offset": Vector2(-w / 2.0, -(ground + 1))}
		info["clips"][clip_name] = {"frames": n, "w": w, "h": h, "ground": ground, "cols": cols}
	sf.set_meta(META, meta)
	return sf


static func load_texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		return load(path)
	if FileAccess.file_exists(path):
		var img := Image.load_from_file(path)          # runtime load: no import step, key RGB stays
		if img:
			img.fix_alpha_edges()                       # the import's fix_alpha_border, done by hand
			return ImageTexture.create_from_image(img)
	return null


## Puts the sprite's origin on the feet of whichever clip plays.
static func register(sprite: AnimatedSprite2D) -> void:
	sprite.centered = false
	var apply := func():
		var meta: Dictionary = sprite.sprite_frames.get_meta(META, {})
		if meta.has(String(sprite.animation)):
			sprite.offset = meta[String(sprite.animation)]["offset"]
	sprite.animation_changed.connect(apply)
	apply.call()
