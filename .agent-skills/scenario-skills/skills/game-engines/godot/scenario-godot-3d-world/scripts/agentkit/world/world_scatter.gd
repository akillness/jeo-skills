extends RefCounted
## Rule-based scatter into MultiMeshInstance3D tiles (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_scatter.gd:scatter  rays onto any collision (terrain, blockout), rejects by slope, height and
##                             clearance, writes one MultiMeshInstance3D per tile with a visibility range.
## RUN IT WINDOWED (gd_run headless=False): under --headless the dummy renderer keeps no MultiMesh
## buffer, so instance transforms read back as identity and the saved .tscn has instance_count but no
## buffer (every tree lost; observed 4.7.2). The job refuses to run headless.
## One tile = one draw call and one culling AABB: tiles let the camera cull what is behind it, where a single
## MultiMesh for the whole map is always drawn in full.

const W = preload("res://addons/agentkit/world/world_common.gd")


static func tree_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.12
	trunk.bottom_radius = 0.18
	trunk.height = 1.4
	trunk.radial_segments = 6
	trunk.rings = 1
	var crown := CylinderMesh.new()
	crown.top_radius = 0.0
	crown.bottom_radius = 1.1
	crown.height = 3.0
	crown.radial_segments = 7
	crown.rings = 1
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_color(Color(0.4, 0.27, 0.15))
	st.append_from(trunk, 0, Transform3D(Basis(), Vector3(0, 0.7, 0)))
	var st2 := SurfaceTool.new()
	st2.append_from(crown, 0, Transform3D(Basis(), Vector3(0, 2.6, 0)))
	var m := st.commit()
	var crown_mesh := st2.commit()
	var mt := StandardMaterial3D.new()
	mt.albedo_color = Color(0.4, 0.27, 0.15)
	m.surface_set_material(0, mt)
	var crown_arrays := crown_mesh.surface_get_arrays(0)
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, crown_arrays)
	var mc := StandardMaterial3D.new()
	mc.albedo_color = Color(0.18, 0.4, 0.2)
	m.surface_set_material(1, mc)
	return m


func scatter(job) -> Dictionary:
	if job.is_headless() and not job.arg("allow_headless", false):
		return {"ok": false, "error": "headless: MultiMesh transforms are not stored by the dummy renderer; run windowed"}
	var scene: String = job.arg("scene", "res://world/terrain/island.tscn")
	var out_path: String = job.arg("path", "res://world/terrain/island_scattered.tscn")
	var area: float = job.arg("area", 240.0)  # square side in metres, centred on the origin
	var tile: float = job.arg("tile", 60.0)
	var candidates: int = job.arg("candidates", 6000)
	var max_slope_deg: float = job.arg("max_slope_deg", 30.0)
	var min_h: float = job.arg("min_height", 1.5)  # above the beach
	var max_h: float = job.arg("max_height", 14.0)
	var clearance: float = job.arg("clearance", 2.0)  # min distance between instances
	var vis_end: float = job.arg("visibility_end", 150.0)
	var mask: int = job.arg("mask", 1)
	var ps: PackedScene = load(scene)
	var level: Node3D = ps.instantiate()
	job.root.add_child(level)
	await job.wait_physics_frames(3)
	var space := level.get_world_3d()
	var rng := RandomNumberGenerator.new()
	rng.seed = job.arg("seed", 21)
	var t0 := Time.get_ticks_usec()
	var reasons := {"miss": 0, "slope": 0, "low": 0, "high": 0, "crowded": 0}
	var by_tile := {}
	var grid := {}  # clearance hash grid: cell = clearance
	var max_cos := cos(deg_to_rad(max_slope_deg))
	for i in candidates:
		var x := rng.randf_range(-area * 0.5, area * 0.5)
		var z := rng.randf_range(-area * 0.5, area * 0.5)
		var hit := W.ray_down(space, x, z, 500.0, -100.0, mask)
		if hit.is_empty():
			reasons["miss"] += 1
			continue
		var n: Vector3 = hit["normal"]
		var p: Vector3 = hit["position"]
		if n.y < max_cos:
			reasons["slope"] += 1
			continue
		if p.y < min_h:
			reasons["low"] += 1
			continue
		if p.y > max_h:
			reasons["high"] += 1
			continue
		var key := Vector2i(floori(x / clearance), floori(z / clearance))
		var crowded := false
		for dx in range(-1, 2):
			for dz in range(-1, 2):
				var other = grid.get(key + Vector2i(dx, dz))
				if other != null and Vector2(other.x - x, other.z - z).length() < clearance:
					crowded = true
		if crowded:
			reasons["crowded"] += 1
			continue
		grid[key] = p
		var tkey := Vector2i(floori(x / tile), floori(z / tile))
		if not by_tile.has(tkey):
			by_tile[tkey] = []
		var s := rng.randf_range(0.8, 1.3)
		# upright trees (no slope tilt), random yaw, sunk 0.1 m so the base never floats on slopes
		var xf := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * s), p - Vector3(0, 0.1, 0))
		by_tile[tkey].append(xf)
	var t_place := (Time.get_ticks_usec() - t0) / 1000.0
	var root := Node3D.new()
	root.name = "Scatter"
	level.add_child(root)
	var mesh := tree_mesh()
	var placed := 0
	for tkey in by_tile:
		var xfs: Array = by_tile[tkey]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = mesh
		mm.instance_count = xfs.size()
		var origin := Vector3((tkey.x + 0.5) * tile, 0, (tkey.y + 0.5) * tile)
		for k in xfs.size():
			var xf: Transform3D = xfs[k]
			xf.origin -= origin  # instance transforms are local to the MultiMeshInstance3D
			mm.set_instance_transform(k, xf)
		var mmi := MultiMeshInstance3D.new()
		mmi.name = "Trees_%d_%d" % [tkey.x, tkey.y]
		mmi.multimesh = mm
		mmi.position = origin
		mmi.visibility_range_end = vis_end
		mmi.visibility_range_end_margin = 10.0
		mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		root.add_child(mmi)
		placed += xfs.size()
	# grounding check: every instance base vs a fresh ray (catches the local/global origin mistake)
	var worst := 0.0
	var worst_at := {}
	for mmi: MultiMeshInstance3D in root.get_children():
		var mm := mmi.multimesh
		for k in mini(mm.instance_count, 50):
			var g: Vector3 = mmi.global_transform * mm.get_instance_transform(k).origin
			var h := W.ray_down(space, g.x, g.z, 500.0, -100.0, mask)
			if not h.is_empty():
				var e := absf(g.y + 0.1 - h["position"].y)
				if e > worst:
					worst = e
					worst_at = {"g": g, "hit": h["position"], "normal": h["normal"]}
	# review camera inside the visibility range, looking at the densest tile
	var best_key: Vector2i = by_tile.keys()[0] if not by_tile.is_empty() else Vector2i.ZERO
	for k in by_tile:
		if by_tile[k].size() > by_tile[best_key].size():
			best_key = k
	var focus := Vector3((best_key.x + 0.5) * tile, 0, (best_key.y + 0.5) * tile)
	var fh := W.ray_down(space, focus.x, focus.z, 500.0, -100.0, mask)
	focus.y = float(fh["position"].y) if not fh.is_empty() else 5.0
	var close := Camera3D.new()
	close.name = "CloseCam"
	level.add_child(close)
	close.look_at_from_position(focus + Vector3(28, 22, 40), focus, Vector3.UP)
	job.root.remove_child(level)
	var saved := W.save(level, out_path)
	var tri := W.scene_triangles(root)
	level.free()
	return {"ok": saved.get("ok", false) and placed > 0 and worst < 0.05, "path": out_path, "placed": placed, "tiles": by_tile.size(),
			"candidates": candidates, "rejected": reasons, "place_ms": t_place, "worst_ground_err_m": worst, "worst_at": worst_at,
			"mesh_triangles": W.triangles(mesh), "multimesh_triangles": tri["multimesh_triangles"]}
