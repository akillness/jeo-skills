@tool
extends EditorScenePostImport
## Post-import script for props from an art drop, AI image-to-3D GLBs included (scenario-godot-3d-world 0.1,
## Godot 4.7.2). Set it on the .import file: import_script/path="res://addons/agentkit/world/post_import_prop.gd"
## (gd_world.configure_import does it), then `godot --headless --import`.
##
## Per-file settings come from res://props/props_manifest.json (path overridable with the project setting
## "world/props/manifest"):
##   {"defaults": {"collision": "box", "layer": 3, "mask": 0, "single_sided": true},
##    "props": {"robot": {"height_m": 1.8, "yaw_deg": 90, "collision": "convex"}}}
## keyed by the source file name without extension. Keys:
##   height_m / longest_m  real size (AI GLBs arrive normalised to a 1 unit box: always give one)
##   yaw_deg               turn the visual so the asset's front faces +Z (Vector3.MODEL_FRONT)
##   pivot                 "base" (bottom centre, default) or "keep"
##   collision             "box" | "convex" | "trimesh" (static level pieces only) | "none"
##   layer, mask           collision layer and mask bits of the generated StaticBody3D
##   single_sided          true turns doubleSided (cull disabled) materials back to back-face culling
##   name                  root node name (default "prop_<file>")
##
## The three post-import traps (Marion Allard, GodotCon 2026, 5fDuf2IlizU [00:11:14]-[00:13:56]), all
## reproduced in 4.7.2 by tests/code/godot-3d-world: a node without owner is not saved; the scene is not in
## a tree, so global_transform fails (work in local transforms, accumulated here); reparent() keeps the
## global transform by default and fails, so nodes are moved with remove_child/add_child and re-owned.

const DEFAULT_MANIFEST := "res://props/props_manifest.json"


func _post_import(scene: Node) -> Object:
	var src := get_source_file()
	var base := src.get_file().get_basename()
	var spec := _spec_for(base)
	var meshes: Array = []
	_collect_meshes(scene, scene, Transform3D.IDENTITY, meshes)
	if meshes.is_empty():
		push_warning("post_import_prop: no MeshInstance3D in " + src)
		return scene
	var aabb := _merged_aabb(meshes)
	var s := 1.0
	if float(spec.get("height_m", 0.0)) > 0.0 and aabb.size.y > 0.0:
		s = float(spec["height_m"]) / aabb.size.y
	elif float(spec.get("longest_m", 0.0)) > 0.0:
		s = float(spec["longest_m"]) / maxf(aabb.get_longest_axis_size(), 0.000001)
	var yaw := deg_to_rad(float(spec.get("yaw_deg", 0.0)))

	# Move every imported child under one Visual node: remove_child + add_child (not reparent), then re-own.
	var visual := Node3D.new()
	visual.name = "Visual"
	var kids := scene.get_children()
	scene.add_child(visual)
	visual.owner = scene
	for k in kids:
		_own(k, null)  # unset first, or add_child warns "will make owner inconsistent" (observed 4.7.2)
		scene.remove_child(k)
		visual.add_child(k)
		_own(k, scene)
	var b := Basis(Vector3.UP, yaw).scaled(Vector3(s, s, s))
	var pivot := Vector3(aabb.get_center().x, aabb.position.y, aabb.get_center().z)
	if str(spec.get("pivot", "base")) == "keep":
		pivot = Vector3.ZERO
	visual.transform = Transform3D(b, -(b * pivot))

	var final_aabb: AABB = visual.transform * aabb
	var tris := 0
	for m in meshes:
		tris += _triangles(m["node"].mesh)
	var mats := _fix_materials(meshes, bool(spec.get("single_sided", true)))

	var shape_kind := str(spec.get("collision", "box"))
	if shape_kind != "none":
		var body := StaticBody3D.new()
		body.name = "Body"
		body.collision_layer = int(spec.get("layer", 1))
		body.collision_mask = int(spec.get("mask", 0))
		scene.add_child(body)
		body.owner = scene
		var cs := CollisionShape3D.new()
		cs.name = "Shape"
		cs.shape = _make_shape(shape_kind, meshes, visual.transform, final_aabb)
		if cs.shape is BoxShape3D:
			cs.position = final_aabb.get_center()
		body.add_child(cs)
		cs.owner = scene

	scene.name = str(spec.get("name", "prop_" + base.to_snake_case()))
	scene.set_meta("prop", {
		"source": src, "scale_applied": s, "yaw_deg": float(spec.get("yaw_deg", 0.0)),
		"size_m": final_aabb.size, "triangles": tris, "meshes": meshes.size(),
		"collision": shape_kind, "materials": mats,
	})
	return scene


func _spec_for(base: String) -> Dictionary:
	var path := str(ProjectSettings.get_setting("world/props/manifest", DEFAULT_MANIFEST))
	var spec := {}
	if FileAccess.file_exists(path):
		var data = JSON.parse_string(FileAccess.get_file_as_string(path))
		if data is Dictionary:
			var d = data.get("defaults", {})
			if d is Dictionary:
				spec.merge(d, true)
			var props = data.get("props", {})
			if props is Dictionary and props.has(base) and props[base] is Dictionary:
				spec.merge(props[base], true)
	return spec


## Mesh nodes with their transform relative to the scene root, accumulated from local transforms
## (global_transform fails here: the imported scene is not inside a tree).
func _collect_meshes(n: Node, scene: Node, xf: Transform3D, out: Array) -> void:
	for c in n.get_children():
		var cxf := xf
		if c is Node3D:
			cxf = xf * (c as Node3D).transform
		if c is MeshInstance3D and (c as MeshInstance3D).mesh != null:
			out.append({"node": c, "xf": cxf})
		_collect_meshes(c, scene, cxf, out)


func _merged_aabb(meshes: Array) -> AABB:
	var acc := AABB()
	var first := true
	for m in meshes:
		var box: AABB = m["xf"] * (m["node"] as MeshInstance3D).mesh.get_aabb()
		acc = box if first else acc.merge(box)
		first = false
	return acc


func _own(n: Node, scene: Node) -> void:
	n.owner = scene
	for c in n.get_children():
		_own(c, scene)


func _triangles(mesh: Mesh) -> int:
	var t := 0
	if mesh is ArrayMesh:
		var am := mesh as ArrayMesh
		for i in am.get_surface_count():
			var idx := am.surface_get_array_index_len(i)
			t += (idx if idx > 0 else am.surface_get_array_len(i)) / 3
	elif mesh != null:
		t = mesh.get_faces().size() / 3
	return t


func _fix_materials(meshes: Array, single_sided: bool) -> Array:
	var out: Array = []
	for m in meshes:
		var mesh: Mesh = (m["node"] as MeshInstance3D).mesh
		for i in mesh.get_surface_count():
			var mat := mesh.surface_get_material(i)
			if mat is BaseMaterial3D:
				var bm := mat as BaseMaterial3D
				var was_double := bm.cull_mode == BaseMaterial3D.CULL_DISABLED
				if single_sided and was_double:
					bm.cull_mode = BaseMaterial3D.CULL_BACK
				out.append({"name": bm.resource_name, "was_double_sided": was_double, "metallic": bm.metallic,
						"metallic_texture": bm.metallic_texture != null, "albedo_texture": bm.albedo_texture != null,
						"normal_texture": bm.normal_texture != null, "cull_mode": bm.cull_mode})
			else:
				out.append({"name": str(mat), "class": mat.get_class() if mat else "none"})
	return out


func _make_shape(kind: String, meshes: Array, visual_xf: Transform3D, final_aabb: AABB) -> Shape3D:
	match kind:
		"convex":
			var pts := PackedVector3Array()
			for m in meshes:
				var hull := (m["node"] as MeshInstance3D).mesh.create_convex_shape(true, true)
				var xf: Transform3D = visual_xf * m["xf"]
				for p in hull.points:
					pts.append(xf * p)
			var cshape := ConvexPolygonShape3D.new()
			cshape.points = pts
			return cshape
		"trimesh":
			var faces := PackedVector3Array()
			for m in meshes:
				var xf2: Transform3D = visual_xf * m["xf"]
				for p in (m["node"] as MeshInstance3D).mesh.get_faces():
					faces.append(xf2 * p)
			var tshape := ConcavePolygonShape3D.new()
			tshape.set_faces(faces)
			return tshape
	var box := BoxShape3D.new()
	box.size = final_aabb.size
	return box
