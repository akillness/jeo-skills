extends RefCounted
## Terrain3D add-on (Tokisan Games, GDExtension) driven from code (scenario-godot-3d-world 0.1, Godot 4.7.2,
## Terrain3D 1.0.2). Only dynamic access (ClassDB, get, call): this file must parse in projects without
## the add-on, where the identifier Terrain3D does not exist.
##   world_terrain3d.gd:probe  class present? version, API names an agent needs
##   world_terrain3d.gd:build  import a float heightmap, query heights, check collision, save data + scene

const T := preload("res://addons/agentkit/world/world_terrain.gd")
const W = preload("res://addons/agentkit/world/world_common.gd")


static func _methods(cls: String) -> Array:
	var out: Array = []
	for m in ClassDB.class_get_method_list(cls, true):
		out.append(m["name"])
	out.sort()
	return out


func probe(job) -> Dictionary:
	var present := ClassDB.class_exists("Terrain3D")
	if not present:
		return {"ok": false, "present": false, "hint": "install addons/terrain_3d, run --import once (the first may crash, see OPEN_ISSUES), enable the plugin"}
	var t: Node = ClassDB.instantiate("Terrain3D")
	var info := {"ok": true, "present": true, "version": t.get("version"),
			"classes": ["Terrain3D", "Terrain3DData", "Terrain3DAssets", "Terrain3DMaterial", "Terrain3DCollision", "Terrain3DInstancer",
					"Terrain3DTextureAsset", "Terrain3DMeshAsset", "Terrain3DRegion"].filter(func(c): return ClassDB.class_exists(c)),
			"data_methods": _methods("Terrain3DData").filter(func(n): return n.begins_with("import") or n.begins_with("get_height") or n.begins_with("save") or n.begins_with("export") or n == "get_normal"),
			"terrain_props": [], "collision_methods": _methods("Terrain3DCollision") if ClassDB.class_exists("Terrain3DCollision") else []}
	for p in t.get_property_list():
		if p["usage"] & PROPERTY_USAGE_EDITOR:
			info["terrain_props"].append(p["name"])
	t.free()
	return info


func build(job) -> Dictionary:
	if not ClassDB.class_exists("Terrain3D"):
		return {"ok": false, "error": "Terrain3D not loaded"}
	var size: int = job.arg("size", 512)
	var height_m: float = job.arg("height", 48.0)
	var dir: String = job.arg("data_dir", "res://world/terrain3d/data")
	var path: String = job.arg("path", "res://world/terrain3d/island_t3d.tscn")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var img: Image = T.island_heights(size + 1, height_m, job.arg("seed", 11), job.arg("frequency", 0.006))
	img.crop(size, size)
	var root := Node3D.new()
	root.name = "IslandT3D"
	job.root.add_child(root)
	# The camera must exist before Terrain3D enters the tree: it grabs the active camera on ready, else it
	# logs "Cannot find the active camera" and stops its _physics_process (observed). Or call set_camera().
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.far = 3000.0
	root.add_child(cam)
	cam.look_at_from_position(Vector3(size * 0.5, size * 0.35, size * 0.7), Vector3(0, 4, 0), Vector3.UP)
	cam.current = true
	var t: Node3D = ClassDB.instantiate("Terrain3D")
	t.name = "Terrain3D"
	var mode_name: String = job.arg("collision_mode", "FULL_GAME")
	root.add_child(t, true)
	t.set("data_directory", dir)
	var mat: Object = t.get("material")
	if mat:
		mat.set("world_background", 0)  # NONE: no flat background mesh outside the regions
		mat.set("auto_shader", true)
	var data: Object = t.get("data")
	var t0 := Time.get_ticks_usec()
	# import_images([height, control, color], global_position, offset, scale): heights are image value * scale + offset
	data.call("import_images", [img, null, null], Vector3(-size * 0.5, 0, -size * 0.5), 0.0, 1.0)
	var t_import := (Time.get_ticks_usec() - t0) / 1000.0
	# Region size: set("region_size") is ignored in 1.0.2 (reads 256 before and after add_child, observed).
	# change_region_size() works once regions exist. Allocated area = region_count x region_size^2:
	# a 1024 m terrain centred on the origin takes 16 x 256 or 4 x 512 regions (1.05 km2), but 4 x 1024
	# (4.19 km2, 4x the memory) because the origin sits on a region corner (observed, Tokisan 00:20:22).
	var region_size: int = job.arg("region_size", 256)
	if region_size != int(t.get("region_size")):
		t.call("change_region_size", region_size)
	var regions := {"region_size": t.get("region_size"), "region_count": data.call("get_region_count")}
	var col: Object = t.get("collision")
	# Collision modes (Terrain3DCollision constants): DYNAMIC_GAME (default) only builds shapes within
	# collision_radius of the camera; FULL_GAME builds every region. A ray far from the camera misses in
	# dynamic mode (observed). Set the mode on terrain.collision once the node is in the tree: setting
	# Terrain3D.collision_mode before add_child left the mode at DYNAMIC_GAME (observed, 1.0.2).
	col.call("set_mode", ClassDB.class_get_integer_constant("Terrain3DCollision", mode_name))
	var col_state := {"enabled": col.call("is_enabled"), "mode": col.call("get_mode"), "dynamic": col.call("is_dynamic_mode")}
	await job.wait_physics_frames(4)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var max_err := 0.0
	var nan := 0
	for i in 200:
		var px := rng.randi_range(2, size - 3)
		var pz := rng.randi_range(2, size - 3)
		var want := img.get_pixel(px, pz).r
		var got: float = data.call("get_height", Vector3(px - size * 0.5, 0, pz - size * 0.5))
		if is_nan(got):
			nan += 1
			continue
		max_err = maxf(max_err, absf(got - want))
	# collision near the origin (dynamic collision builds around the camera or collision target)
	await job.wait_physics_frames(10)
	var hit := W.ray_down(root.get_world_3d(), 3.0, 5.0, 500.0, -500.0)
	var want0 := img.get_pixel(int(3 + size * 0.5), int(5 + size * 0.5)).r
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-40, -40, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var env := WorldEnvironment.new()
	env.name = "Env"
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = Sky.new()
	e.sky.sky_material = ProceduralSkyMaterial.new()
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.environment = e
	root.add_child(env)
	t0 = Time.get_ticks_usec()
	data.call("save_directory", dir)
	var t_save := (Time.get_ticks_usec() - t0) / 1000.0
	job.root.remove_child(root)
	var saved := W.save(root, path)
	root.free()
	var files := DirAccess.get_files_at(dir)
	return {"ok": saved.get("ok", false) and nan == 0 and max_err < 0.05 and not hit.is_empty(),
			"import_ms": t_import, "save_ms": t_save, "height_max_err_m": max_err, "nan_heights": nan,
			"ray_hit": not hit.is_empty(), "ray_y": hit.get("position", Vector3.ZERO).y if not hit.is_empty() else null, "want_y": want0,
			"data_files": files, "regions": regions, "path": path, "collision_mode": mode_name, "collision_state": col_state,
			"collision_constants": ClassDB.class_get_integer_constant_list("Terrain3DCollision")}
