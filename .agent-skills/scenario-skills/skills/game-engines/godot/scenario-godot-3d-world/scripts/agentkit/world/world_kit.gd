extends RefCounted
## Modular kit: MeshLibrary built in code and a GridMap level from an ASCII plan (scenario-godot-3d-world 0.1, 4.7.2).
##   world_kit.gd:build_kit   -> res://world/kit/kit.tres (MeshLibrary: floor, wall, pillar, stairs)
##   world_kit.gd:build_grid  -> res://world/kit/dungeon.tscn (GridMap from a plan) + raycast checks
## The editor route (Scene > Export As > MeshLibrary from a scene of MeshInstance3D + StaticBody3D) has no
## script API; building the library in code is the substitute and gives the same resource.

const W = preload("res://addons/agentkit/world/world_common.gd")

const ITEM_FLOOR := 0
const ITEM_WALL := 1
const ITEM_PILLAR := 2
const ITEM_STAIRS := 3


static func _boxmesh(size: Vector3, color: Color, offset: Vector3 = Vector3.ZERO) -> ArrayMesh:
	# Material on the mesh SURFACE: a MeshLibrary item has no MeshInstance3D to carry an override.
	var st := SurfaceTool.new()
	var bm := BoxMesh.new()
	bm.size = size
	st.append_from(bm, 0, Transform3D(Basis(), offset))
	st.set_material(W.flat_material(color))
	return st.commit()


func build_kit(job) -> Dictionary:
	var cell: Vector3 = job.arg("cell_size", Vector3(4, 3, 4))
	var path: String = job.arg("path", "res://world/kit/kit.tres")
	var lib := MeshLibrary.new()
	var specs := {
		ITEM_FLOOR: {"name": "floor", "size": Vector3(cell.x, 0.2, cell.z), "off": Vector3(0, -0.1, 0), "color": Color(0.55, 0.55, 0.55)},
		ITEM_WALL: {"name": "wall", "size": Vector3(cell.x, cell.y, 0.3), "off": Vector3(0, cell.y * 0.5, 0), "color": Color(0.75, 0.35, 0.3)},
		ITEM_PILLAR: {"name": "pillar", "size": Vector3(0.6, cell.y, 0.6), "off": Vector3(0, cell.y * 0.5, 0), "color": Color(0.85, 0.8, 0.3)},
	}
	for id in specs:
		var s: Dictionary = specs[id]
		lib.create_item(id)
		lib.set_item_name(id, s["name"])
		lib.set_item_mesh(id, _boxmesh(s["size"], s["color"], s["off"]))
		var shape := BoxShape3D.new()
		shape.size = s["size"]
		lib.set_item_shapes(id, [shape, Transform3D(Basis(), s["off"])])  # flat array: shape, transform, ...
	# stairs item filling one cell, trimesh collision from the mesh itself. Rise per step must stay under
	# the controller's max_step_height (0.45 in third_person_controller.gd): 3 m / 6 steps = 0.5 fails.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var steps := ceili(cell.y / float(job.arg("max_rise", 0.4)))
	var rise := cell.y / steps
	var run := cell.z / steps
	var bm := BoxMesh.new()
	for i in steps:
		bm.size = Vector3(cell.x, rise * (i + 1), run)
		st.append_from(bm, 0, Transform3D(Basis(), Vector3(0, rise * (i + 1) * 0.5, cell.z * 0.5 - run * (i + 0.5))))
	st.set_material(W.flat_material(Color(0.6, 0.5, 0.35)))
	var stairs := st.commit()
	lib.create_item(ITEM_STAIRS)
	lib.set_item_name(ITEM_STAIRS, "stairs")
	lib.set_item_mesh(ITEM_STAIRS, stairs)
	lib.set_item_shapes(ITEM_STAIRS, [stairs.create_trimesh_shape(), Transform3D()])
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var err := ResourceSaver.save(lib, path)
	var items := {}
	for id in lib.get_item_list():
		items[lib.get_item_name(id)] = {"id": id, "triangles": W.triangles(lib.get_item_mesh(id)), "shapes": lib.get_item_shapes(id).size() / 2}
	return {"ok": err == OK, "path": path, "items": items, "rise_m": rise, "run_m": run}


## Plan legend: '.' floor, '#' wall on the cell's north edge (-Z) plus floor, 'P' pillar plus floor,
## 'S' stairs going up toward -Z, ' ' empty. Row 0 is the north row (-Z).
func build_grid(job) -> Dictionary:
	var lib_path: String = job.arg("library", "res://world/kit/kit.tres")
	var cell: Vector3 = job.arg("cell_size", Vector3(4, 3, 4))
	var plan: Array = job.arg("plan", ["#####", "....P", ".S...", "....."])
	var path: String = job.arg("path", "res://world/kit/dungeon.tscn")
	var root := Node3D.new()
	root.name = "Dungeon"
	var gm := GridMap.new()
	gm.name = "GridMap"
	gm.mesh_library = load(lib_path)
	gm.cell_size = cell
	gm.cell_center_y = false  # floor tiles sit ON y = 0 (the default true centres items at cell.y / 2)
	gm.collision_layer = 1
	root.add_child(gm)
	var counts := {"floor": 0, "wall": 0, "pillar": 0, "stairs": 0}
	for row in plan.size():
		var line: String = plan[row]
		for col in line.length():
			var ch: String = line[col]
			var c := Vector3i(col, 0, row)
			if ch == " ":
				continue
			if ch == "S":
				gm.set_cell_item(c, ITEM_STAIRS)
				counts["stairs"] += 1
				continue
			gm.set_cell_item(c, ITEM_FLOOR)
			counts["floor"] += 1
	# One item per cell per GridMap: walls and pillars go on a second GridMap sharing the library,
	# or they would replace the floor in that cell.
	var props := GridMap.new()
	props.name = "GridMapProps"
	props.mesh_library = gm.mesh_library
	props.cell_size = cell
	props.cell_center_y = false
	root.add_child(props)
	var north := gm.get_orthogonal_index_from_basis(Basis())
	for row in plan.size():
		var line: String = plan[row]
		for col in line.length():
			var ch: String = line[col]
			if ch == "#":
				props.set_cell_item(Vector3i(col, 0, row), ITEM_WALL, north)
				counts["wall"] += 1
			elif ch == "P":
				props.set_cell_item(Vector3i(col, 0, row), ITEM_PILLAR)
				counts["pillar"] += 1
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -30, 0)
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	var w: float = str(plan[0]).length() * cell.x
	var d: float = plan.size() * cell.z
	root.add_child(cam)
	cam.look_at_from_position(Vector3(w * 1.1, maxf(w, d) * 0.9, d * 1.4), Vector3(w * 0.5, 0, d * 0.5), Vector3.UP)
	cam.current = true
	var saved := W.save(root, path)
	# live checks: ray down at every floor cell centre, ray into the stairs
	job.root.add_child(root)
	await job.wait_physics_frames(3)
	var space := root.get_world_3d()
	var hits := 0
	var misses: Array = []
	var expected := 0
	for c in gm.get_used_cells():
		var centre := gm.to_global(gm.map_to_local(c))
		var item := gm.get_cell_item(c)
		expected += 1
		var hit := W.ray_down(space, centre.x + 0.7, centre.z + 0.7, 20.0, -5.0, 1)
		if hit.is_empty():
			misses.append(c)
		else:
			hits += 1
	var first: Vector3i = gm.get_used_cells()[0] if not gm.get_used_cells().is_empty() else Vector3i.ZERO
	var map_local := gm.map_to_local(first)
	var stairs_top := {}
	for c in gm.get_used_cells_by_item(ITEM_STAIRS):
		var ctr := gm.map_to_local(c)
		var h := W.ray_down(space, ctr.x, ctr.z - cell.z * 0.5 + 0.2, 20.0, -5.0, 1)
		stairs_top = {"cell": c, "top_y": h.get("position", Vector3.ZERO).y if not h.is_empty() else null}
	job.root.remove_child(root)
	root.free()
	return {"ok": saved.get("ok", false) and misses.is_empty(), "path": path, "counts": counts, "cells": expected,
			"ray_hits": hits, "ray_misses": misses, "map_to_local_first": map_local, "cell_center": [true, false, true],
			"stairs_top": stairs_top}


## Walk the player up every stairs item of a saved GridMap scene; pass = highest point reaches the cell top.
func stairs_walk(job) -> Dictionary:
	var level: Node = await job.load_scene(job.arg("scene", "res://world/kit/dungeon.tscn"), 2)
	var gm := level.get_node("GridMap") as GridMap
	await job.wait_physics_frames(3)
	var out := {}
	for c in gm.get_used_cells_by_item(ITEM_STAIRS):
		var ctr := gm.to_global(gm.map_to_local(c))
		var p: CharacterBody3D = load(job.arg("player", "res://world/player/player.tscn")).instantiate()
		p.use_player_input = false
		level.add_child(p)
		p.global_position = ctr + Vector3(0, 0.05, gm.cell_size.z)  # one cell south, walk north (-Z)
		await job.wait_physics_frames(5)
		(p.get_node("CameraPivot") as Node3D).rotation = Vector3(deg_to_rad(-10.0), 0, 0)
		var y_max := 0.0
		for i in 120:
			p.move_input = Vector2(0, -1)
			await job.physics_frame
			y_max = maxf(y_max, p.global_position.y)
		out[str(c)] = {"y_max": snappedf(y_max, 0.01), "top": gm.cell_size.y, "climbed": y_max > gm.cell_size.y - 0.1, "steps_up": p.steps_up}
		p.queue_free()
	var ok := not out.is_empty()
	for k in out:
		ok = ok and out[k]["climbed"]
	return {"ok": ok, "stairs": out}
