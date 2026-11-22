extends RefCounted
## Stock-Godot terrain: noise heightmap -> chunked ArrayMesh + HeightMapShape3D (scenario-godot-3d-world 0.1, 4.7.2).
##   world_terrain.gd:noise_timing   FastNoiseLite.get_image vs a per-pixel get_noise_2d loop
##   world_terrain.gd:build_island   heightmap image, chunk meshes, one HeightMapShape3D, water, sun, camera
##   world_terrain.gd:collision_check  ray hits on the collision vs the mesh heights at random points
## For sculpting, painting and big worlds use the Terrain3D add-on (GDExtension, see terrain3d_probe).

const W = preload("res://addons/agentkit/world/world_common.gd")


static func make_noise(seed_: int, frequency: float) -> FastNoiseLite:
	var n := FastNoiseLite.new()
	n.seed = seed_
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 5
	n.frequency = frequency
	return n


func noise_timing(job) -> Dictionary:
	var size: int = job.arg("size", 513)
	var n := make_noise(7, 0.004)
	var t0 := Time.get_ticks_usec()
	var img := n.get_image(size, size, false, false, false)  # values 0..1 in FORMAT_L8 unless in_3d_space
	var t_img := (Time.get_ticks_usec() - t0) / 1000.0
	t0 = Time.get_ticks_usec()
	var arr := PackedFloat32Array()
	arr.resize(size * size)
	for z in size:
		for x in size:
			arr[z * size + x] = n.get_noise_2d(x, z)
	var t_loop := (Time.get_ticks_usec() - t0) / 1000.0
	var img_f := Image.create_from_data(size, size, false, Image.FORMAT_RF, arr.to_byte_array())
	return {"ok": true, "size": size, "get_image_ms": t_img, "image_format": img.get_format(), "loop_ms": t_loop,
			"speedup": t_loop / maxf(t_img, 0.001), "loop_range": [arr[0], img_f.get_pixel(size - 1, size - 1).r],
			"note": "get_image returns 8-bit luminance by default: 256 height levels, use the float loop (or get_image with normalize false then convert) for terrain"}


## Heights in metres for a (size x size) grid with 1/scale spacing: fBm noise times a radial falloff
## so the border sinks below the water (an island). Returned as an Image in FORMAT_RF.
static func island_heights(size: int, height_m: float, seed_: int, frequency: float) -> Image:
	var n := make_noise(seed_, frequency)
	var arr := PackedFloat32Array()
	arr.resize(size * size)
	var c := (size - 1) * 0.5
	for z in size:
		for x in size:
			var d := Vector2(x - c, z - c).length() / c  # 0 centre, 1 edge
			var fall := clampf(1.0 - pow(d, 2.2), 0.0, 1.0)
			var h := (n.get_noise_2d(x, z) * 0.5 + 0.5) * fall
			arr[z * size + x] = h * height_m - 4.0  # border ends at -4 m, under the water at 0
	return Image.create_from_data(size, size, false, Image.FORMAT_RF, arr.to_byte_array())


static func _h(img: Image, x: int, z: int) -> float:
	return img.get_pixel(clampi(x, 0, img.get_width() - 1), clampi(z, 0, img.get_height() - 1)).r


## One chunk mesh covering vertices [x0, x0+n] x [z0, z0+n] of the heightmap, spacing `cell` metres,
## centred like HeightMapShape3D (heightmap centre at the origin). Normals by central differences.
static func chunk_mesh(img: Image, x0: int, z0: int, n: int, cell: float, material: Material) -> ArrayMesh:
	var size := img.get_width()
	var c := (size - 1) * 0.5
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var cols := PackedColorArray()
	for z in range(z0, z0 + n + 1):
		for x in range(x0, x0 + n + 1):
			var h := _h(img, x, z)
			verts.append(Vector3((x - c) * cell, h, (z - c) * cell))
			var nx := _h(img, x - 1, z) - _h(img, x + 1, z)
			var nz := _h(img, x, z - 1) - _h(img, x, z + 1)
			norms.append(Vector3(nx, 2.0 * cell, nz).normalized())
			uvs.append(Vector2(x, z) / float(size - 1))
			# vertex colour by height and slope: sand, grass, rock, snow (blockout read, no textures)
			var slope := 1.0 - norms[-1].y
			var col := Color(0.82, 0.76, 0.55) if h < 1.2 else (Color(0.35, 0.5, 0.25) if h < 18.0 else Color(0.9, 0.9, 0.92))
			if slope > 0.25 and h >= 1.2:
				col = Color(0.45, 0.42, 0.38)
			cols.append(col)
	var idx := PackedInt32Array()
	var row := n + 1
	for z in n:
		for x in n:
			var a := z * row + x
			var b := a + 1
			var d := a + row
			var e := d + 1
			# Godot front faces are CLOCKWISE seen from the front (from above here): a, b, d then b, e, d
			idx.append_array([a, b, d, b, e, d])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	m.surface_set_material(0, material)
	return m


func build_island(job) -> Dictionary:
	var size: int = job.arg("size", 257)  # vertices per side (2^n + 1 keeps chunks even)
	var cell: float = job.arg("cell", 1.0)
	var chunk: int = job.arg("chunk", 64)
	var height_m: float = job.arg("height", 32.0)
	var path: String = job.arg("path", "res://world/terrain/island.tscn")
	var t0 := Time.get_ticks_usec()
	var img := island_heights(size, height_m, job.arg("seed", 11), job.arg("frequency", 0.012))
	var t_heights := (Time.get_ticks_usec() - t0) / 1000.0
	var root := Node3D.new()
	root.name = "Island"
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.95
	var terrain := Node3D.new()
	terrain.name = "Terrain"
	root.add_child(terrain)
	t0 = Time.get_ticks_usec()
	var chunks := 0
	var tris := 0
	for cz in range(0, size - 1, chunk):
		for cx in range(0, size - 1, chunk):
			var mi := MeshInstance3D.new()
			mi.name = "Chunk_%d_%d" % [cx / chunk, cz / chunk]
			mi.mesh = chunk_mesh(img, cx, cz, mini(chunk, size - 1 - cx), cell, mat)
			terrain.add_child(mi)
			chunks += 1
			tris += W.triangles(mi.mesh)
	var t_mesh := (Time.get_ticks_usec() - t0) / 1000.0
	# collision: one HeightMapShape3D, centred, 1 m spacing; scale the CollisionShape3D for other spacings
	t0 = Time.get_ticks_usec()
	var body := StaticBody3D.new()
	body.name = "TerrainBody"
	body.collision_layer = 1
	var cs := CollisionShape3D.new()
	cs.name = "Shape"
	var hm := HeightMapShape3D.new()
	# Pixels are read as 0..1 and remapped to [height_min, height_max] even for FORMAT_RF: (0, 1) keeps
	# metres stored in the image unchanged. (-1000, 1000) would turn 10 m into 19000 m (observed).
	hm.update_map_data_from_image(img, 0.0, 1.0)
	cs.shape = hm
	if not is_equal_approx(cell, 1.0):
		cs.scale = Vector3(cell, 1.0, cell)  # [measured] the shape itself has no spacing property
	body.add_child(cs)
	root.add_child(body)
	var t_col := (Time.get_ticks_usec() - t0) / 1000.0
	var water := MeshInstance3D.new()
	water.name = "Water"
	var pm := PlaneMesh.new()
	pm.size = Vector2(size * cell * 3.0, size * cell * 3.0)
	water.mesh = pm
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.1, 0.35, 0.55, 0.8)
	wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	wm.roughness = 0.1
	water.material_override = wm
	root.add_child(water)
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
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.fog_enabled = true
	e.fog_density = 0.002
	env.environment = e
	root.add_child(env)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.far = 2000.0
	var ext := size * cell
	root.add_child(cam)
	cam.look_at_from_position(Vector3(ext * 0.55, ext * 0.42, ext * 0.75), Vector3(0, 4, 0), Vector3.UP)
	cam.current = true
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var hpath := path.get_base_dir().path_join("heights.exr")
	var exr_err := img.save_exr(ProjectSettings.globalize_path(hpath), true)  # grayscale float EXR for reuse
	root.set_meta("heights", {"size": size, "cell": cell, "exr": hpath})
	var saved := W.save(root, path)
	var mn := INF
	var mx := -INF
	for z in range(0, size, 4):
		for x in range(0, size, 4):
			var v := _h(img, x, z)
			mn = minf(mn, v)
			mx = maxf(mx, v)
	root.free()
	return {"ok": saved.get("ok", false), "path": path, "size": size, "cell": cell, "chunks": chunks, "triangles": tris,
			"heights_ms": t_heights, "mesh_ms": t_mesh, "collision_ms": t_col, "height_range": [mn, mx],
			"exr_saved": exr_err == OK, "scene_bytes": FileAccess.get_file_as_bytes(path).size()}


## Rays straight down at random points: collision height vs bilinear heightmap height; also checks that
## mesh normals face up (clockwise winding gives up-facing geometric normals).
func collision_check(job) -> Dictionary:
	var scene: String = job.arg("scene", "res://world/terrain/island.tscn")
	var samples: int = job.arg("samples", 400)
	var level: Node3D = await job.load_scene(scene, 2)
	await job.wait_physics_frames(3)
	var meta: Dictionary = level.get_meta("heights", {})
	var img := Image.load_from_file(ProjectSettings.globalize_path(meta.get("exr", "")))
	if img == null or img.is_empty():
		return {"ok": false, "error": "heights.exr not readable"}
	img.convert(Image.FORMAT_RF)
	var size: int = meta.get("size", img.get_width())
	var cell: float = meta.get("cell", 1.0)
	var c := (size - 1) * 0.5
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	var space := level.get_world_3d()
	var max_err := 0.0
	var sum_err := 0.0
	var misses := 0
	for i in samples:
		var gx := rng.randf_range(1.0, size - 2.0)
		var gz := rng.randf_range(1.0, size - 2.0)
		var x0 := floori(gx)
		var z0 := floori(gz)
		var fx := gx - x0
		var fz := gz - z0
		var h := lerpf(lerpf(_h(img, x0, z0), _h(img, x0 + 1, z0), fx), lerpf(_h(img, x0, z0 + 1), _h(img, x0 + 1, z0 + 1), fx), fz)
		var hit := W.ray_down(space, (gx - c) * cell, (gz - c) * cell, 500.0, -500.0, 1)
		if hit.is_empty():
			misses += 1
			continue
		var err := absf(float(hit["position"].y) - h)
		max_err = maxf(max_err, err)
		sum_err += err
	# winding: geometric normal of the first triangle of the first chunk
	var mi := level.get_node("Terrain").get_child(0) as MeshInstance3D
	var arr: Array = (mi.mesh as ArrayMesh).surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var ix: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	# Godot: front face is clockwise; for a clockwise triangle seen from +Y, (b - a) x (c - a) points DOWN,
	# so the up-facing normal is (c - a) x (b - a).
	var geo := (v[ix[2]] - v[ix[0]]).cross(v[ix[1]] - v[ix[0]]).normalized()
	return {"ok": misses == 0 and max_err < 0.6, "samples": samples, "misses": misses, "max_err_m": max_err,
			"mean_err_m": sum_err / maxf(samples - misses, 1), "first_tri_up_normal_y": geo.y}
