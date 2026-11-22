@tool
extends EditorScenePostImportPlugin
## Project-wide post-import step for props (scenario-godot-pipeline-automation 0.1, Godot 4.7.2).
##
## Adds per-file import options (Import dock > "pipeline/*", stored in each .glb.import) and applies
## them on every (re)import, headless --import included (verified 4.7.2, tests M6 and M10):
##   pipeline/unit_scale   1.0 = keep; 0.01 for centimetre files
##   pipeline/fit_height   0 = keep; else scale so the bounds are this tall (image-to-3D output)
##   pipeline/fix_pivot    move the bounds' bottom centre to the origin
##   pipeline/collision    box | convex | none (StaticBody3D "Collision" child)
## Files without pipeline/prop_id are left untouched, so the plugin is safe in a whole game project.
## The root gets meta "pipeline" (version, id, scale, height, triangles, materials) for the audit.

const PIPELINE_VERSION := 1


func _get_import_options(path: String) -> void:
	add_import_option("pipeline/version", 0)
	add_import_option("pipeline/prop_id", "")
	add_import_option("pipeline/category", "")
	add_import_option("pipeline/source_md5", "")
	add_import_option_advanced(TYPE_FLOAT, "pipeline/unit_scale", 1.0, PROPERTY_HINT_RANGE, "0.0001,1000,0.0001")
	add_import_option_advanced(TYPE_FLOAT, "pipeline/fit_height", 0.0, PROPERTY_HINT_RANGE, "0,100,0.01")
	add_import_option("pipeline/fix_pivot", false)
	add_import_option_advanced(TYPE_STRING, "pipeline/collision", "box", PROPERTY_HINT_ENUM, "box,convex,none")
	add_import_option("pipeline/texture_limit", 0)


func _post_process(scene: Node) -> void:
	var id := str(get_option_value("pipeline/prop_id"))
	if id == "":
		return
	var meshes: Array = []
	for n in scene.find_children("*", "", true, false):
		if n is MeshInstance3D or n is ImporterMeshInstance3D:
			meshes.append(n)
	var box := _bounds(scene, meshes)
	if box.size.y <= 0.0:
		push_warning("prop_pipeline: %s has no mesh bounds" % id)
		return
	var s := float(get_option_value("pipeline/unit_scale"))
	var fit := float(get_option_value("pipeline/fit_height"))
	if fit > 0.0:
		s = fit / box.size.y
	var offset := Vector3.ZERO
	if bool(get_option_value("pipeline/fix_pivot")):
		offset = Vector3(box.position.x + box.size.x * 0.5, box.position.y, box.position.z + box.size.z * 0.5)
	var xf := Transform3D(Basis.from_scale(Vector3.ONE * s), -offset * s)
	for c in scene.get_children():
		if c is Node3D:
			c.transform = xf * c.transform
	var final_box := xf * box
	var mode := str(get_option_value("pipeline/collision"))
	if mode != "none" and scene.get_node_or_null("Collision") == null:
		var body := StaticBody3D.new()
		body.name = "Collision"
		scene.add_child(body)
		body.owner = scene
		if mode == "convex":
			for m in meshes:
				var mesh: Mesh = m.mesh if m is MeshInstance3D else (m.mesh.get_mesh() if m.mesh else null)
				if mesh == null:
					continue
				var cs := CollisionShape3D.new()
				cs.shape = mesh.create_convex_shape(true, true)
				cs.transform = _to_root(scene, m)
				body.add_child(cs)
				cs.owner = scene
		else:
			var cs := CollisionShape3D.new()
			cs.name = "Box"
			var shape := BoxShape3D.new()
			shape.size = final_box.size
			cs.shape = shape
			cs.position = final_box.get_center()
			body.add_child(cs)
			cs.owner = scene
	var tris := 0
	var mats := {}
	for m in meshes:
		var mesh = m.mesh
		if mesh == null:
			continue
		for si in mesh.get_surface_count():
			var mat = mesh.surface_get_material(si)
			if mat:
				mats[mat.get_instance_id()] = true
			var arr: Array = mesh.surface_get_arrays(si)
			var idx = arr[Mesh.ARRAY_INDEX]
			tris += (idx.size() if idx != null and idx.size() > 0 else (arr[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()) / 3
	scene.set_meta("pipeline", {
		"version": PIPELINE_VERSION, "id": id, "category": str(get_option_value("pipeline/category")),
		"source_md5": str(get_option_value("pipeline/source_md5")), "scale": s, "pivot_fixed": offset != Vector3.ZERO,
		"height": final_box.size.y, "aabb_position": final_box.position, "aabb_size": final_box.size,
		"triangles": tris, "materials": mats.size(), "mesh_nodes": meshes.size(), "collision": mode,
	})


func _bounds(scene: Node, meshes: Array) -> AABB:
	var out := AABB()
	var first := true
	for m in meshes:
		var local: AABB
		if m is MeshInstance3D:
			if m.mesh == null:
				continue
			local = m.mesh.get_aabb()
		else:
			if m.mesh == null or m.mesh.get_surface_count() == 0:
				continue
			local = _importer_aabb(m.mesh)
		var b: AABB = _to_root(scene, m) * local
		out = b if first else out.merge(b)
		first = false
	return out


func _importer_aabb(im: ImporterMesh) -> AABB:
	var out := AABB()
	var first := true
	for si in im.get_surface_count():
		var v: PackedVector3Array = im.get_surface_arrays(si)[Mesh.ARRAY_VERTEX]
		for p in v:
			if first:
				out = AABB(p, Vector3.ZERO)
				first = false
			else:
				out = out.expand(p)
	return out


func _to_root(scene: Node, n: Node) -> Transform3D:
	var t := Transform3D.IDENTITY
	var cur := n
	while cur != null and cur != scene:
		if cur is Node3D:
			t = (cur as Node3D).transform * t
		cur = cur.get_parent()
	return t
