extends RefCounted
## scenario-godot-2d scene audit (Godot 4.7.2). Loads scenes and reports 2D mistakes that do not raise errors.
## Each rule names its evidence: a live measurement in this skill, or the expert source.
##
##   run_script(P, "res://addons/agentkit/2d/audit_2d.gd:scenes", {"paths": ["res://levels/x.tscn"]})
##   (no paths: every .tscn under res:// outside addons/ and .agent_out/)


func scenes(job) -> Dictionary:
	var paths: Array = job.arg("paths", [])
	if paths.is_empty():
		paths = _find_scenes("res://")
	var report := {}
	var totals := {"error": 0, "warn": 0, "info": 0}
	for p in paths:
		var ps: PackedScene = load(p)
		if ps == null:
			report[p] = [{"sev": "error", "rule": "load", "msg": "scene does not load"}]
			totals["error"] += 1
			continue
		var root := ps.instantiate()
		var issues := audit_tree(root)
		root.free()
		report[p] = issues
		for i in issues:
			totals[i["sev"]] += 1
	return {"ok": totals["error"] == 0, "totals": totals, "scenes": report}


static func audit_tree(root: Node) -> Array:
	var issues := []
	var nodes := [root]
	nodes.append_array(root.find_children("*", "", true, false))
	var has_modulate := false
	var lights: Array = []
	var occluders := 0
	var cams: Array = []
	var interp: bool = ProjectSettings.get_setting("physics/common/physics_interpolation", false)
	for n in nodes:
		var path: String = str(root.get_path_to(n))
		var cls: String = n.get_class()
		if cls in ["TileMap", "ParallaxBackground", "ParallaxLayer"]:
			issues.append(_i("warn", "deprecated_node", path, "%s is deprecated since 4.3: use %s" % [cls,
				"one TileMapLayer per layer" if cls == "TileMap" else "Parallax2D"]))
		if n is CanvasModulate:
			has_modulate = true
		if n is PointLight2D or n is DirectionalLight2D:
			lights.append(n)
			if n is PointLight2D and n.texture == null:
				issues.append(_i("warn", "light_no_texture", path, "PointLight2D has no texture: the texture is the light's shape (docs); use a radial GradientTexture2D"))
		if n is LightOccluder2D and n.occluder != null:
			occluders += 1
		if n is TileMapLayer and n.tile_set != null:
			if n.tile_set.get_occlusion_layers_count() > 0:
				occluders += 1
			if n.y_sort_enabled and not (n.get_parent() is Node2D and n.get_parent().y_sort_enabled):
				issues.append(_i("info", "tile_ysort_alone", path, "y_sort_enabled TileMapLayer under a parent without y_sort: cells sort only among themselves"))
		if n is Camera2D and n.enabled:
			cams.append(n)
			if not interp and n.position_smoothing_enabled and n.process_callback == Camera2D.CAMERA2D_PROCESS_IDLE:
				issues.append(_i("warn", "camera_idle_smoothing", path, "idle-process smoothing without physics interpolation: the player wobbles 3 px against the camera at 144 Hz (measured); turn on physics/common/physics_interpolation or process in physics"))
		if n is Node2D and n.y_sort_enabled:
			for c in n.get_children():
				if c is Sprite2D and c.centered and c.offset == Vector2.ZERO and c.texture and c.texture.get_height() > 16:
					issues.append(_i("warn", "ysort_centre_origin", str(root.get_path_to(c)), "Sprite2D under a y-sorted parent with a centred origin sorts by its middle: put the origin at the feet (offset.y = -height/2)"))
		if n is CollisionObject2D and n.collision_mask == 0 and not (n is StaticBody2D) and not (n is Area2D and not n.monitoring):
			issues.append(_i("warn", "mask_zero", path, "collision_mask is 0: this body detects nothing"))
		if n is CharacterBody2D and n.get_script() == null and n.get_child_count() == 0:
			issues.append(_i("info", "empty_body", path, "CharacterBody2D without shape or script"))
	if not lights.is_empty() and not has_modulate:
		issues.append(_i("info", "lights_no_modulate", ".", "2D lights without a CanvasModulate: the scene stays at full brightness, lights only add"))
	for l in lights:
		if l.shadow_enabled and occluders == 0:
			issues.append(_i("warn", "shadow_no_occluder", str(root.get_path_to(l)), "shadow_enabled but no LightOccluder2D or TileSet occlusion layer in the scene"))
	if cams.size() > 1:
		issues.append(_i("info", "several_cameras", ".", "%d enabled Camera2D: call make_current() on the one that should drive the view" % cams.size()))
	return issues


static func _i(sev: String, rule: String, path: String, msg: String) -> Dictionary:
	return {"sev": sev, "rule": rule, "node": path, "msg": msg}


static func _find_scenes(dir: String) -> Array:
	var out := []
	var d := DirAccess.open(dir)
	if d == null:
		return out
	for f in d.get_files():
		if f.ends_with(".tscn"):
			out.append(dir.path_join(f))
	for sub in d.get_directories():
		if sub in ["addons", ".agent_out", ".godot", "archive"]:
			continue
		out.append_array(_find_scenes(dir.path_join(sub)))
	return out
