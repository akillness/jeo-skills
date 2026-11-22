extends RefCounted
## CSG blockout from a layout dict, bake to meshes, and measured checks (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_blockout.gd:build_village  layout -> CSG scene (+ baked scene), timings, triangles
##   world_blockout.gd:door_test      drives the player through every door of a built village
##   world_blockout.gd:csg_cost       cost of a moving CSG operand vs the same baked geometry
##
## Layout (metres, Y up, the same dict gd_world.validate_layout checks offline):
##   {"ground": [60, 60], "houses": [{"name": "Inn", "pos": [x, z], "size": [w, d, h], "wall": 0.25,
##     "door": {"width": 1.2, "height": 2.2, "side": "+z"}, "roof": 1.6}]}

const W = preload("res://addons/agentkit/world/world_common.gd")

const WALL := Color(0.78, 0.74, 0.66)
const ROOF := Color(0.62, 0.25, 0.2)
const GROUND := Color(0.45, 0.5, 0.42)


func _house(h: Dictionary) -> CSGCombiner3D:
	var size: Array = h["size"]
	var w := float(size[0])
	var d := float(size[1])
	var ht := float(size[2])
	var t := float(h.get("wall", 0.25))
	var c := CSGCombiner3D.new()
	c.name = str(h["name"])
	c.use_collision = true
	c.position = Vector3(float(h["pos"][0]), 0, float(h["pos"][1]))
	var shell := CSGBox3D.new()
	shell.name = "Shell"
	shell.size = Vector3(w, ht, d)
	shell.position = Vector3(0, ht * 0.5, 0)
	shell.material = W.flat_material(WALL)
	c.add_child(shell)
	var inner := CSGBox3D.new()
	inner.name = "Inside"
	inner.operation = CSGShape3D.OPERATION_SUBTRACTION
	inner.size = Vector3(w - 2 * t, ht - t, d - 2 * t)  # floor stays open at y=0, ceiling thickness t
	inner.position = Vector3(0, (ht - t) * 0.5 - 0.01, 0)
	c.add_child(inner)
	var door: Dictionary = h.get("door", {})
	if not door.is_empty():
		var dw := float(door.get("width", 1.2))
		var dh := float(door.get("height", 2.2))
		var side := str(door.get("side", "+z"))
		var cut := CSGBox3D.new()
		cut.name = "Door"
		cut.operation = CSGShape3D.OPERATION_SUBTRACTION
		var axis_z := side.ends_with("z")
		var sgn := -1.0 if side.begins_with("-") else 1.0
		cut.size = Vector3(dw, dh, t * 3.0) if axis_z else Vector3(t * 3.0, dh, dw)
		cut.position = Vector3(0, dh * 0.5 - 0.01, sgn * d * 0.5) if axis_z else Vector3(sgn * w * 0.5, dh * 0.5 - 0.01, 0)
		c.add_child(cut)
	var roof_h := float(h.get("roof", 0.0))
	if roof_h > 0.0:
		var roof := CSGPolygon3D.new()  # gable prism: polygon in XY, extruded along -Z by depth
		roof.name = "Roof"
		roof.polygon = PackedVector2Array([Vector2(-w * 0.5 - 0.3, 0), Vector2(w * 0.5 + 0.3, 0), Vector2(0, roof_h)])
		roof.mode = CSGPolygon3D.MODE_DEPTH
		roof.depth = d + 0.6
		roof.position = Vector3(0, ht, d * 0.5 + 0.3)
		roof.material = W.flat_material(ROOF)
		c.add_child(roof)
	return c


func _ground(size: Array) -> StaticBody3D:
	var b := StaticBody3D.new()
	b.name = "Ground"
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(float(size[0]), 1.0, float(size[1]))
	cs.shape = bs
	cs.position = Vector3(0, -0.5, 0)
	b.add_child(cs)
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(float(size[0]), float(size[1]))
	mi.mesh = pm
	mi.material_override = W.flat_material(GROUND)
	b.add_child(mi)
	return b


func _light_and_camera(root: Node3D, extent: float) -> void:
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50, -35, 0)
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
	env.environment = e
	root.add_child(env)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(extent * 0.55, extent * 0.45, extent * 0.75)
	root.add_child(cam)
	cam.look_at_from_position(cam.position, Vector3.ZERO, Vector3.UP)
	cam.current = true


## Bake every CSGCombiner3D under root into MeshInstance3D + StaticBody3D siblings, then remove the CSG.
## CSG meshes are built deferred: the combiners must be in the tree and a frame must have passed.
static func bake_all(root: Node) -> Dictionary:
	var out := {"baked": 0, "triangles": 0, "ms": 0.0}
	var t0 := Time.get_ticks_usec()
	var combos: Array = []
	for n in root.find_children("*", "CSGCombiner3D", true, false):
		combos.append(n)
	for c: CSGCombiner3D in combos:
		var mesh: ArrayMesh = c.bake_static_mesh()
		var shape: ConcavePolygonShape3D = c.bake_collision_shape()
		if mesh == null:
			continue
		var mi := MeshInstance3D.new()
		mi.name = str(c.name)
		mi.mesh = mesh
		mi.transform = c.transform
		var body := StaticBody3D.new()
		body.name = "Body"
		body.collision_layer = c.collision_layer
		body.collision_mask = c.collision_mask
		var cs := CollisionShape3D.new()
		cs.name = "Shape"
		cs.shape = shape
		body.add_child(cs)
		mi.add_child(body)
		var parent := c.get_parent()
		var idx := c.get_index()
		parent.remove_child(c)
		c.free()
		parent.add_child(mi)
		parent.move_child(mi, idx)
		out["baked"] += 1
		out["triangles"] += W.triangles(mesh)
	out["ms"] = (Time.get_ticks_usec() - t0) / 1000.0
	return out


func build_village(job) -> Dictionary:
	var layout: Dictionary = job.arg("layout", {})
	var csg_path: String = job.arg("csg_path", "res://world/blockout/village_csg.tscn")
	var baked_path: String = job.arg("baked_path", "res://world/blockout/village_baked.tscn")
	var root := Node3D.new()
	root.name = "Village"
	var gsize: Array = layout.get("ground", [60, 60])
	root.add_child(_ground(gsize))
	var houses := Node3D.new()
	houses.name = "Houses"
	root.add_child(houses)
	for h in layout.get("houses", []):
		houses.add_child(_house(h))
	_light_and_camera(root, maxf(float(gsize[0]), float(gsize[1])))
	var saved_csg := W.save(root, csg_path)
	# CSG meshes are computed when the nodes are in the tree; time it.
	var t0 := Time.get_ticks_usec()
	job.root.add_child(root)
	await job.wait_frames(2)
	var csg_ready_ms := (Time.get_ticks_usec() - t0) / 1000.0
	var csg_tris := 0
	for c in houses.get_children():
		var m: Array = (c as CSGShape3D).get_meshes()
		if m.size() >= 2 and m[1] is Mesh:
			csg_tris += W.triangles(m[1])
	var bake := bake_all(houses)
	job.root.remove_child(root)
	var saved_baked := W.save(root, baked_path)
	root.free()
	# load timings: instantiate + first frames for each saved scene (CSG recomputes, baked does not)
	var loads := {}
	for p in [csg_path, baked_path]:
		var t1 := Time.get_ticks_usec()
		var ps: PackedScene = ResourceLoader.load(p, "", ResourceLoader.CACHE_MODE_IGNORE)
		var inst := ps.instantiate()
		job.root.add_child(inst)
		await job.wait_frames(2)
		loads[p.get_file()] = {"ms": (Time.get_ticks_usec() - t1) / 1000.0,
				"bytes": FileAccess.get_file_as_bytes(p).size()}
		inst.queue_free()
		await job.wait_frames(1)
	return {"ok": saved_csg.get("ok", false) and saved_baked.get("ok", false) and bake["baked"] == layout.get("houses", []).size(),
			"houses": layout.get("houses", []).size(), "csg_ready_ms": csg_ready_ms, "csg_triangles": csg_tris, "bake": bake,
			"loads": loads, "csg_path": csg_path, "baked_path": baked_path}


## Walk the player from 3 m outside each door to 2 m inside the house; pass = reached the inside.
func door_test(job) -> Dictionary:
	var scene: String = job.arg("scene", "res://world/blockout/village_baked.tscn")
	var layout: Dictionary = job.arg("layout", {})
	var level: Node = await job.load_scene(scene, 2)
	await job.wait_physics_frames(3)
	var results := {}
	for h in layout.get("houses", []):
		var door: Dictionary = h.get("door", {})
		if door.is_empty():
			continue
		var side := str(door.get("side", "+z"))
		var axis_z := side.ends_with("z")
		var sgn := -1.0 if side.begins_with("-") else 1.0
		var half := float(h["size"][1] if axis_z else h["size"][0]) * 0.5
		var c := Vector3(float(h["pos"][0]), 0.05, float(h["pos"][1]))
		var out_dir := Vector3(0, 0, sgn) if axis_z else Vector3(sgn, 0, 0)
		var start := c + out_dir * (half + 3.0)
		var goal := c - out_dir * maxf(half - 2.0, 0.0)
		var p: CharacterBody3D = load(job.arg("player", "res://world/player/player.tscn")).instantiate()
		p.use_player_input = false
		level.add_child(p)
		p.global_position = start
		await job.wait_physics_frames(5)
		var pivot := p.get_node("CameraPivot") as Node3D
		# camera looks along -basis.z; aim it from start toward the goal (input forward = away from the camera)
		var to_goal := (goal - start)
		pivot.rotation = Vector3(deg_to_rad(-10.0), atan2(-to_goal.x, -to_goal.z), 0)
		var best := INF
		for i in 240:
			p.move_input = Vector2(0, -1)
			await job.physics_frame
			best = minf(best, Vector2(p.global_position.x - goal.x, p.global_position.z - goal.z).length())
			if best < 0.5:
				break
		results[str(h["name"])] = {"door_width": door.get("width"), "reached": best < 0.5, "closest_m": snappedf(best, 0.01),
				"final": p.global_position}
		p.queue_free()
		await job.wait_physics_frames(1)
	var passed := 0
	for k in results:
		if results[k]["reached"]:
			passed += 1
	return {"ok": true, "doors": results, "passed": passed, "total": results.size()}


## Cost of moving a CSG operand: every move re-runs the booleans (Manifold) in a deferred update.
## Frame time with one operand move per frame minus idle frame time = rebuild cost per move. A baked
## MeshInstance3D only changes a transform. `segments` adds a CSGSphere3D window cut to scale the work.
func csg_cost(job) -> Dictionary:
	var moves: int = job.arg("moves", 30)
	var out := {}
	for seg in job.arg("segments", [0, 32, 128]):
		var h := {"name": "Probe", "pos": [0, 0], "size": [8, 8, 4], "wall": 0.25, "door": {"width": 1.2, "height": 2.2}, "roof": 2.0}
		var root := Node3D.new()
		job.root.add_child(root)
		var c := _house(h)
		root.add_child(c)
		if int(seg) > 0:
			var win := CSGSphere3D.new()
			win.name = "Window"
			win.operation = CSGShape3D.OPERATION_SUBTRACTION
			win.radius = 0.8
			win.radial_segments = int(seg)
			win.rings = int(seg) / 2
			win.position = Vector3(2, 2, 4)
			c.add_child(win)
		await job.wait_frames(2)
		var door := c.get_node("Door") as CSGBox3D
		var idle := 0.0
		for i in moves:  # baseline: frames with nothing moving
			var t0 := Time.get_ticks_usec()
			await job.process_frame
			idle += (Time.get_ticks_usec() - t0) / 1000.0
		var total := 0.0
		for i in moves:  # one operand move per frame; the rebuild runs deferred inside that frame
			door.position.x = sin(i * 0.4) * 2.0
			var t0 := Time.get_ticks_usec()
			await job.process_frame
			total += (Time.get_ticks_usec() - t0) / 1000.0
		var tris := W.triangles(c.bake_static_mesh())
		out[str(seg)] = {"moving_frame_ms": snappedf(total / moves, 0.01), "idle_frame_ms": snappedf(idle / moves, 0.01),
				"rebuild_ms": snappedf((total - idle) / moves, 0.01), "triangles": tris}
		root.queue_free()
		await job.wait_frames(1)
	return {"ok": true, "moves": moves, "by_sphere_segments": out,
			"note": "rebuild time per operand move (CPU); a baked MeshInstance3D move only updates a transform"}
