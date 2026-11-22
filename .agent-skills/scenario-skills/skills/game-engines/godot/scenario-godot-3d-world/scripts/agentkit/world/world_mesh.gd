extends RefCounted
## Procedural meshes with SurfaceTool (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_mesh.gd:winding  proves the front-face convention on Godot's own BoxMesh: for each triangle
##                          (a, b, c), (c - a) x (b - a) points along the stored normal (clockwise front)
##   world_mesh.gd:stairs   stairs mesh from quads (after Maltbie -5L0RK-9Wd4), flat normals through
##                          set_smooth_group(-1) + generate_normals, tangents, trimesh collision, checks

const W = preload("res://addons/agentkit/world/world_common.gd")


static func _agreement(mesh: Mesh) -> Dictionary:
	var arr := mesh.surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var nrm: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	var agree := 0
	var disagree := 0
	var count := idx.size() / 3 if idx.size() > 0 else v.size() / 3
	for t in count:
		var i0 := idx[t * 3] if idx.size() > 0 else t * 3
		var i1 := idx[t * 3 + 1] if idx.size() > 0 else t * 3 + 1
		var i2 := idx[t * 3 + 2] if idx.size() > 0 else t * 3 + 2
		var g := (v[i2] - v[i0]).cross(v[i1] - v[i0])
		if g.length() < 1e-9:
			continue
		if g.dot(nrm[i0]) > 0.0:
			agree += 1
		else:
			disagree += 1
	return {"triangles": count, "clockwise_front_agrees": agree, "disagrees": disagree}


func winding(job) -> Dictionary:
	var box := _agreement(BoxMesh.new())
	var sphere := _agreement(SphereMesh.new())
	return {"ok": box["disagrees"] == 0 and sphere["disagrees"] == 0, "box": box, "sphere": sphere,
			"rule": "front face = clockwise as seen from the front; normal = (c - a).cross(b - a)"}


## Quad (p0..p3 clockwise seen from the front) as two triangles.
static func _quad(st: SurfaceTool, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, uv_scale: float) -> void:
	var uvs := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]
	var pts := [p0, p1, p2, p3]
	for k in [0, 1, 2, 0, 2, 3]:
		st.set_uv(uvs[k] * uv_scale)
		st.add_vertex(pts[k])


static func stairs_mesh(steps: int, rise: float, run: float, width: float, material: Material = null) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_smooth_group(-1)  # -1 = flat shading for generate_normals (4.7.2 name; no add_smooth_group)
	var hw := width * 0.5
	for i in steps:
		var y0 := rise * i
		var y1 := rise * (i + 1)
		var z0 := -run * i
		var z1 := -run * (i + 1)
		# riser, facing +Z (toward someone walking up along -Z): clockwise seen from +Z
		_quad(st, Vector3(-hw, y1, z0), Vector3(hw, y1, z0), Vector3(hw, y0, z0), Vector3(-hw, y0, z0), 1.0)
		# tread, facing +Y: clockwise seen from above
		_quad(st, Vector3(-hw, y1, z1), Vector3(hw, y1, z1), Vector3(hw, y1, z0), Vector3(-hw, y1, z0), 1.0)
		# side walls, facing -X and +X, down to the ground
		_quad(st, Vector3(-hw, y1, z1), Vector3(-hw, y1, z0), Vector3(-hw, 0, z0), Vector3(-hw, 0, z1), 1.0)
		_quad(st, Vector3(hw, y1, z0), Vector3(hw, y1, z1), Vector3(hw, 0, z1), Vector3(hw, 0, z0), 1.0)
	# back wall, facing -Z
	var top := rise * steps
	var zb := -run * steps
	_quad(st, Vector3(hw, top, zb), Vector3(-hw, top, zb), Vector3(-hw, 0, zb), Vector3(hw, 0, zb), 1.0)
	st.index()
	st.generate_normals()
	st.generate_tangents()  # needs UVs and normals: a normal map on this mesh would otherwise be wrong
	if material:
		st.set_material(material)
	return st.commit()


func stairs(job) -> Dictionary:
	var steps: int = job.arg("steps", 10)
	var rise: float = job.arg("rise", 0.2)
	var run: float = job.arg("run", 0.3)
	var width: float = job.arg("width", 2.0)
	var path: String = job.arg("path", "res://world/mesh/stairs.tscn")
	var t0 := Time.get_ticks_usec()
	var mesh := stairs_mesh(steps, rise, run, width, W.flat_material(Color(0.7, 0.62, 0.5)))
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	var arr := mesh.surface_get_arrays(0)
	var has_tangents: bool = arr[Mesh.ARRAY_TANGENT] != null and (arr[Mesh.ARRAY_TANGENT] as PackedFloat32Array).size() > 0
	var agreement := _agreement(mesh)
	var root := Node3D.new()
	root.name = "Stairs"
	var mi := MeshInstance3D.new()
	mi.name = "Mesh"
	mi.mesh = mesh
	root.add_child(mi)
	var body := StaticBody3D.new()
	body.name = "Body"
	var cs := CollisionShape3D.new()
	cs.name = "Shape"
	cs.shape = mesh.create_trimesh_shape()
	body.add_child(cs)
	mi.add_child(body)
	var floor_body := StaticBody3D.new()
	floor_body.name = "Floor"
	var fcs := CollisionShape3D.new()
	var fb := BoxShape3D.new()
	fb.size = Vector3(20, 1, 20)
	fcs.shape = fb
	fcs.position = Vector3(0, -0.5, 0)
	floor_body.add_child(fcs)
	root.add_child(floor_body)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50, 35, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	root.add_child(cam)
	cam.look_at_from_position(Vector3(5.5, 4.0, 4.5), Vector3(0, rise * steps * 0.4, -run * steps * 0.5), Vector3.UP)
	cam.current = true
	var saved := W.save(root, path)
	# climb with the player
	job.root.add_child(root)
	await job.wait_physics_frames(3)
	var p: CharacterBody3D = load(job.arg("player", "res://world/player/player.tscn")).instantiate()
	p.use_player_input = false
	root.add_child(p)
	p.global_position = Vector3(0, 0.05, 3.0)
	await job.wait_physics_frames(5)
	(p.get_node("CameraPivot") as Node3D).rotation = Vector3(deg_to_rad(-10.0), 0, 0)
	var y_max := 0.0
	for i in 150:
		p.move_input = Vector2(0, -1)
		await job.physics_frame
		y_max = maxf(y_max, p.global_position.y)
	var top := rise * steps
	job.root.remove_child(root)
	root.free()
	return {"ok": saved.get("ok", false) and agreement["disagrees"] == 0 and has_tangents and y_max > top - 0.1,
			"build_ms": ms, "triangles": W.triangles(mesh), "vertices": (arr[Mesh.ARRAY_VERTEX] as PackedVector3Array).size(),
			"winding": agreement, "tangents": has_tangents, "climb_y_max": y_max, "top": top, "path": path}
