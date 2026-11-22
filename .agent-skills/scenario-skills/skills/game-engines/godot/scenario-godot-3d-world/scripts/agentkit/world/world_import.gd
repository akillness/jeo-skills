extends RefCounted
## Imported-asset checks (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_import.gd:audit     load imported prop scenes and check name, pivot, size, triangles vs budget,
##                             collision bodies and shapes, layers, materials (cull, transparency, metal)
##   world_import.gd:traps     the post-import traps (Allard, 5fDuf2IlizU) reproduced: no owner = not
##                             saved, global transform outside the tree, reparent vs remove/add
##   world_import.gd:lod_probe primitives drawn at distance with mesh LODs on vs off (run windowed)

const W = preload("res://addons/agentkit/world/world_common.gd")


static func _materials(root: Node) -> Array:
	var out: Array = []
	for m in W.meshes_in(root):
		var mi: MeshInstance3D = m["node"]
		for s in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(s)
			if mat is BaseMaterial3D:
				var b := mat as BaseMaterial3D
				out.append({"node": str(mi.name), "surface": s, "cull": b.cull_mode, "transparency": b.transparency,
						"metallic": b.metallic, "has_metallic_tex": b.metallic_texture != null, "albedo_tex": b.albedo_texture != null,
						"normal": b.normal_enabled})
			else:
				out.append({"node": str(mi.name), "surface": s, "class": mat.get_class() if mat else "none"})
	return out


static func _bodies(root: Node) -> Array:
	var out: Array = []
	for b in root.find_children("*", "CollisionObject3D", true, false):
		var shapes: Array = []
		for c in b.find_children("*", "CollisionShape3D", true, false):
			var cs := c as CollisionShape3D
			shapes.append({"shape": cs.shape.get_class() if cs.shape else "none", "scale": cs.scale,
					"scaled": not cs.scale.is_equal_approx(Vector3.ONE)})
		out.append({"name": str(b.name), "class": b.get_class(), "layer": (b as CollisionObject3D).collision_layer,
				"mask": (b as CollisionObject3D).collision_mask, "shapes": shapes})
	return out


func audit(job) -> Dictionary:
	var scenes: Array = job.arg("scenes", [])
	var budgets: Dictionary = job.arg("budgets", {})
	var report := {}
	var flagged := 0
	for p in scenes:
		var ps: PackedScene = load(p)
		if ps == null:
			report[p] = {"error": "not loadable"}
			flagged += 1
			continue
		var t0 := Time.get_ticks_usec()
		var root: Node = ps.instantiate()
		var inst_ms := (Time.get_ticks_usec() - t0) / 1000.0
		var meshes := W.meshes_in(root)
		var box := W.merged_aabb(meshes) if not meshes.is_empty() else AABB()
		if root is Node3D:
			box = (root as Node3D).transform * box
		var tris := W.scene_triangles(root)
		var meta: Dictionary = root.get_meta("prop", {}) if root.has_meta("prop") else {}
		var cat: String = job.arg("categories", {}).get(p.get_file().get_basename(), "prop")
		var budget := int(budgets.get(cat, 0))
		var flags: Array = []
		if budget > 0 and tris["triangles"] > budget:
			flags.append("triangles %d > %s budget %d" % [tris["triangles"], cat, budget])
		if absf(box.position.y) > 0.05:
			flags.append("pivot not at the base: lowest point y = %.2f" % box.position.y)
		var bodies := _bodies(root)
		if bodies.is_empty():
			flags.append("no collision body")
		for b in bodies:
			for s in b["shapes"]:
				if s["scaled"]:
					flags.append("scaled collision shape under %s (Jolt and Godot Physics both prefer unscaled shapes)" % b["name"])
		var mats := _materials(root)
		for m in mats:
			if m.get("cull", 0) == BaseMaterial3D.CULL_DISABLED:
				flags.append("double-sided material on %s: twice the fragment cost on closed meshes" % m["node"])
			if m.get("metallic", 0.0) >= 0.99 and m.get("has_metallic_tex", false):
				flags.append("metallic 1.0 with a metallic map on %s: fine when the map holds real values (glTF multiplies)" % m["node"])
		report[p] = {"root": root.get_class(), "name": str(root.name), "size_m": box.size, "base_y": box.position.y,
				"triangles": tris["triangles"], "mesh_instances": tris["mesh_instances"], "bodies": bodies, "materials": mats,
				"instantiate_ms": inst_ms, "meta": meta, "flags": flags}
		if not flags.is_empty():
			flagged += 1
		root.free()
	return {"ok": true, "scenes": report, "flagged": flagged, "count": scenes.size()}


func traps(job) -> Dictionary:
	job.expect_errors = true
	var out := {}
	# 1 owner: a node added in code without an owner is not packed
	var root := Node3D.new()
	root.name = "Root"
	var a := Node3D.new()
	a.name = "Owned"
	root.add_child(a)
	a.owner = root
	var b := Node3D.new()
	b.name = "NoOwner"
	root.add_child(b)
	var ps := PackedScene.new()
	ps.pack(root)
	var inst := ps.instantiate()
	out["owner"] = {"owned_saved": inst.has_node("Owned"), "unowned_saved": inst.has_node("NoOwner")}
	inst.free()
	# 2 global transform outside the tree: logs an error and returns the local transform
	var before: int = job.captured_error_count()
	root.position = Vector3(5, 0, 0)
	a.position = Vector3(1, 0, 0)
	var g := a.global_transform.origin
	out["global_outside_tree"] = {"returned": g, "errors_logged": job.captured_error_count() - before,
			"local_chain": (root.transform * a.transform).origin}
	# 3 reparent outside the tree keeps the global transform only when it can compute it
	var c := Node3D.new()
	c.name = "Moved"
	root.add_child(c)
	c.owner = root
	c.position = Vector3(0, 2, 0)
	before = job.captured_error_count()
	c.reparent(a)  # keep_global_transform = true by default
	out["reparent_outside_tree"] = {"position_after": c.position, "errors_logged": job.captured_error_count() - before}
	# 3b reparent(node, false) keeps the LOCAL transform and logs nothing (Allard's form)
	var c2 := Node3D.new()
	c2.name = "Moved1b"
	root.add_child(c2)
	c2.owner = root
	c2.position = Vector3(0, 2, 0)
	before = job.captured_error_count()
	c2.reparent(a, false)
	out["reparent_keep_local"] = {"position_after": c2.position, "errors_logged": job.captured_error_count() - before}
	# 4 owner after a move: the child keeps owner = root only if it was unset and set again
	var d := Node3D.new()
	d.name = "Moved2"
	root.add_child(d)
	d.owner = root
	before = job.captured_error_count()
	var warn_before: int = job._logger.warnings.size()
	root.remove_child(d)
	a.add_child(d)
	out["remove_add_keeps_owner"] = {"owner_is_root": d.owner == root, "warnings": job._logger.warnings.size() - warn_before}
	root.free()
	return {"ok": true, "traps": out}


## Windowed: frame the prop at several distances, read RENDER_TOTAL_PRIMITIVES_IN_FRAME with
## mesh_lod_threshold 1.0 (default) and 0.0 (LODs off).
func lod_probe(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "needs a windowed run: headless draws nothing and primitives read 0"}
	var scene: String = job.arg("scene", "res://props/lighthouse.glb")
	var distances: Array = job.arg("distances", [10, 40, 120, 300])
	# LOD selection is screen-space: render in a SubViewport at a real resolution, not in the 160x90
	# test window (at 160x90 the robot drew its LOD1 even at 5 m: observed).
	var size: Vector2i = job.arg("size", Vector2i(1920, 1080))
	var vp := SubViewport.new()
	vp.size = size
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	job.root.add_child(vp)
	var root := Node3D.new()
	vp.add_child(root)
	var prop: Node3D = (load(scene) as PackedScene).instantiate()
	root.add_child(prop)
	var meshes := W.meshes_in(prop)
	var box := W.merged_aabb(meshes)
	var center := prop.transform * box.get_center()
	var cam := Camera3D.new()
	cam.far = 5000.0
	root.add_child(cam)
	cam.current = true
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = false  # shadow passes would add their own primitives
	root.add_child(sun)
	var out := {}
	for thr in [1.0, 0.0]:
		vp.mesh_lod_threshold = thr
		var row := {}
		for d in distances:
			cam.look_at_from_position(center + Vector3(0, 0, float(d)), center, Vector3.UP)
			await job.wait_frames(6)
			row[str(d)] = int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		out["threshold_%s" % str(thr)] = row
	var tri: int = W.scene_triangles(prop)["triangles"]
	vp.queue_free()
	return {"ok": true, "scene": scene, "size_m": box.size, "primitives": out, "viewport": size,
			"source_triangles": tri}


## Line up imported props on a ground plane for a review capture, a 1.8 m capsule as the scale reference.
func lineup(job) -> Dictionary:
	var scenes: Array = job.arg("scenes", [])
	var path: String = job.arg("path", "res://world/review/props_lineup.tscn")
	var root := Node3D.new()
	root.name = "Lineup"
	var ground := MeshInstance3D.new()
	ground.name = "Ground"
	var pm := PlaneMesh.new()
	pm.size = Vector2(80, 40)
	ground.mesh = pm
	ground.material_override = W.flat_material(Color(0.42, 0.44, 0.4))
	root.add_child(ground)
	var x := 0.0
	var gap := 1.5
	var placed: Array = []
	var ref := MeshInstance3D.new()
	ref.name = "HumanRef_1_8m"
	var cm := CapsuleMesh.new()
	cm.radius = 0.3
	cm.height = 1.8
	ref.mesh = cm
	ref.position = Vector3(0, 0.9, 0)
	ref.material_override = W.flat_material(Color(0.95, 0.75, 0.2))
	root.add_child(ref)
	x = 1.2
	var top := 1.8
	for p in scenes:
		var inst: Node3D = (load(p) as PackedScene).instantiate()
		var box := W.merged_aabb(W.meshes_in(inst))
		box = inst.transform * box
		inst.position = Vector3(x - box.position.x, 0, -box.get_center().z)
		root.add_child(inst)
		placed.append({"scene": p, "x": x, "size": box.size})
		x += box.size.x + gap
		top = maxf(top, box.size.y)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, -30, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = Sky.new()
	e.sky.sky_material = ProceduralSkyMaterial.new()
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	root.add_child(env)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	root.add_child(cam)
	var mid := Vector3(x * 0.5, top * 0.45, 0)
	cam.look_at_from_position(mid + Vector3(0, top * 0.35, maxf(x, top) * 1.15), mid, Vector3.UP)
	cam.current = true
	var saved := W.save(root, path)
	root.free()
	return {"ok": saved.get("ok", false), "path": path, "placed": placed}
