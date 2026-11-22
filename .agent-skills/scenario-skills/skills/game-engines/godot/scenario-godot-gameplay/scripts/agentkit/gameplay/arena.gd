extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): a seeded test arena for navigation, AI and combat jobs.
##
##   const Arena = preload("res://addons/agentkit/gameplay/arena.gd")
##   var a := Arena.build(root, {"size": 60.0, "obstacles": 14, "seed": 7})
##   a.level (Node3D), a.region (NavigationRegion3D), a.boxes (Array[AABB]), a.camera (Camera3D, top-down)
##
## Static geometry is in the group "nav_source" so a navmesh baked with source "group" never picks
## up agents that live elsewhere in the tree (Bramwell, 2W4JP48oZ8U [00:12:37]).

const LAYER_WORLD := 1


static func _box(parent: Node, name: String, size: Vector3, pos: Vector3, color: Color, group: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = name
	body.position = pos
	body.collision_layer = LAYER_WORLD
	body.collision_mask = 0
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	var mi := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mesh.material = mat
	mi.mesh = mesh
	body.add_child(mi)
	if group != "":
		body.add_to_group(group)
	parent.add_child(body)
	return body


## opts: size (m, default 60), obstacles (count, 14), seed (7), clear_radius (m kept free at the
## centre, 7), obstacle_size ([3, 2, 3] max), camera_height (m, 70), group ("nav_source").
static func build(parent: Node, opts: Dictionary = {}) -> Dictionary:
	var size := float(opts.get("size", 60.0))
	var count := int(opts.get("obstacles", 14))
	var group := str(opts.get("group", "nav_source"))
	var clear_r := float(opts.get("clear_radius", 7.0))
	var rng := RandomNumberGenerator.new()
	rng.seed = int(opts.get("seed", 7))
	var level := Node3D.new()
	level.name = "Level"
	parent.add_child(level)
	var region := NavigationRegion3D.new()
	region.name = "NavRegion"
	level.add_child(region)
	_box(region, "Floor", Vector3(size, 0.2, size), Vector3(0, -0.1, 0), Color(0.55, 0.56, 0.52), group)
	var boxes: Array = []
	var tries := 0
	while boxes.size() < count and tries < count * 40:
		tries += 1
		var s := Vector3(rng.randf_range(1.5, 4.0), 2.0, rng.randf_range(1.5, 4.0))
		var p := Vector3(rng.randf_range(-size * 0.42, size * 0.42), 1.0, rng.randf_range(-size * 0.42, size * 0.42))
		if Vector2(p.x, p.z).length() < clear_r + s.length() * 0.5:
			continue
		var aabb := AABB(p - s * 0.5, s)
		var overlap := false
		for b in boxes:
			if (b as AABB).grow(1.5).intersects(aabb):
				overlap = true
				break
		if overlap:
			continue
		_box(region, "Obstacle%02d" % boxes.size(), s, p, Color(0.35, 0.38, 0.45), group)
		boxes.append(aabb)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-60, 30, 0)
	level.add_child(sun)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.12, 0.13, 0.15)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.6, 0.6, 0.65)
	e.ambient_light_energy = 0.6
	env.environment = e
	level.add_child(env)
	var cam := Camera3D.new()
	cam.name = "TopCamera"
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = size * 1.02
	cam.position = Vector3(0, float(opts.get("camera_height", 70.0)), 0)
	cam.rotation_degrees = Vector3(-90, 0, 0)
	cam.far = 200.0
	level.add_child(cam)
	cam.current = true
	return {"level": level, "region": region, "boxes": boxes, "camera": cam, "size": size}


## Spawn points on a ring (seeded), outside the obstacles.
static func ring_points(n: int, r_min: float, r_max: float, boxes: Array, seed: int = 11) -> PackedVector3Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var pts := PackedVector3Array()
	var guard := 0
	while pts.size() < n and guard < n * 200:
		guard += 1
		var a := rng.randf() * TAU
		var r := rng.randf_range(r_min, r_max)
		var p := Vector3(cos(a) * r, 0.0, sin(a) * r)
		var bad := false
		for b in boxes:
			if (b as AABB).grow(0.8).has_point(Vector3(p.x, 1.0, p.z)):
				bad = true
				break
		if not bad:
			for q in pts:
				if q.distance_to(p) < 0.9:
					bad = true
					break
		if not bad:
			pts.append(p)
	return pts
