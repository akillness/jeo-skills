extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): build a lighting calibration scene ("lookdev").
##
## Guide spheres (near-black 0.03, 18% grey, near-white 0.85, mirror), a grey card, an emissive
## block, a capsule "hero" at 1.8 m, a closed room (0.25 m walls, one window, one door) with a warm
## omni light, a sun and a procedural sky. Every primitive mesh has add_uv2 = true so LightmapGI can
## bake it. Cameras: Cameras/Exterior (current), Cameras/Spheres, Cameras/Interior.
##
##   gd_run.run_script(P, "res://addons/agentkit/rendering/lookdev.gd:build", {"out": "res://lookdev/lookdev.tscn"})
##
## Idempotent: rebuilds the file from scratch each run (it is a test asset, not a level).

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


func build(job) -> Dictionary:
	var out: String = job.arg("out", "res://lookdev/lookdev.tscn")
	var with_room: bool = job.arg("room", true)
	var root := Node3D.new()
	root.name = "Lookdev"

	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = default_environment()
	root.add_child(we)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50, 35, 0)
	sun.shadow_enabled = true
	root.add_child(sun)

	var geo := Node3D.new()
	geo.name = "Geometry"
	root.add_child(geo)
	_box(geo, "Ground", Vector3(40, 0.2, 40), Vector3(0, -0.1, 0), Color(0.42, 0.45, 0.4))
	var spheres := {"SphereDark": [Color(0.03, 0.03, 0.03), 0.0, 0.6], "SphereGrey": [Color(0.18, 0.18, 0.18), 0.0, 0.6],
			"SphereWhite": [Color(0.85, 0.85, 0.85), 0.0, 0.6], "SphereMirror": [Color(0.95, 0.95, 0.95), 1.0, 0.02]}
	var x := -3.0
	for n: String in spheres:
		var s: Array = spheres[n]
		_sphere(geo, n, Vector3(x, 0.5, 2.0), s[0], s[1], s[2])
		x += 1.4
	_box(geo, "GreyCard", Vector3(1.2, 1.6, 0.05), Vector3(-4.2, 0.8, 0.2), Color(0.18, 0.18, 0.18))
	var em := _box(geo, "EmissiveBlock", Vector3(0.6, 0.6, 0.6), Vector3(2.6, 0.3, 0.6), Color(1.0, 0.45, 0.1))
	var emm := em.material_override as StandardMaterial3D
	emm.emission_enabled = true
	emm.emission = Color(1.0, 0.45, 0.1)
	emm.emission_energy_multiplier = 4.0
	var hero := MeshInstance3D.new()
	hero.name = "Hero"
	var cap := CapsuleMesh.new()
	cap.height = 1.8
	cap.radius = 0.35
	cap.add_uv2 = true
	hero.mesh = cap
	hero.position = Vector3(0.6, 0.9, 0.2)
	hero.material_override = _mat(Color(0.25, 0.45, 0.85), 0.0, 0.5)
	geo.add_child(hero)

	if with_room:
		var room := Node3D.new()
		room.name = "Room"
		room.position = Vector3(0, 0, -7)
		geo.add_child(room)
		var wall_c := Color(0.75, 0.7, 0.62)
		var t := 0.25
		_box(room, "Floor", Vector3(6, t, 6), Vector3(0, t * 0.5, 0), Color(0.5, 0.38, 0.28))
		_box(room, "Roof", Vector3(6.5, t, 6.5), Vector3(0, 3.0 + t * 0.5, 0), wall_c)
		_box(room, "WallBack", Vector3(6, 3, t), Vector3(0, 1.5, -3), wall_c)
		_box(room, "WallLeft", Vector3(t, 3, 6), Vector3(-3, 1.5, 0), wall_c)
		_box(room, "WallRight", Vector3(t, 3, 6), Vector3(3, 1.5, 0), wall_c)
		# Front wall with a 1.2 m door at x = 0 and a window on the right.
		_box(room, "WallFrontL", Vector3(2.4, 3, t), Vector3(-1.8, 1.5, 3), wall_c)
		_box(room, "WallFrontR1", Vector3(0.6, 3, t), Vector3(0.9, 1.5, 3), wall_c)
		_box(room, "WallFrontR2", Vector3(1.8, 1.0, t), Vector3(2.1, 0.5, 3), wall_c)
		_box(room, "WallFrontR3", Vector3(1.8, 0.8, t), Vector3(2.1, 2.6, 3), wall_c)
		_box(room, "DoorHeader", Vector3(1.2, 0.8, t), Vector3(0, 2.6, 3), wall_c)
		_box(room, "Table", Vector3(1.4, 0.8, 0.8), Vector3(-1.2, 0.4 + t, -1.5), Color(0.35, 0.22, 0.12))
		_sphere(room, "RoomSphere", Vector3(1.2, 0.5 + t, -1.0), Color(0.85, 0.85, 0.85), 0.0, 0.5)
		var lamp := OmniLight3D.new()
		lamp.name = "Lamp"
		lamp.position = Vector3(-1.2, 2.2, -1.5)
		lamp.light_color = Color(1.0, 0.72, 0.42)
		lamp.light_energy = 2.0
		lamp.omni_range = 6.0
		lamp.shadow_enabled = true
		room.add_child(lamp)

	var cams := Node3D.new()
	cams.name = "Cameras"
	root.add_child(cams)
	_cam(cams, "Exterior", Vector3(1.5, 2.2, 8.5), Vector3(-0.5, 0.6, 0), true)
	_cam(cams, "Spheres", Vector3(-0.9, 1.0, 5.2), Vector3(-0.9, 0.5, 2.0), false)
	if with_room:
		_cam(cams, "Interior", Vector3(1.9, 1.6, -4.6), Vector3(-1.0, 0.8, -8.6), false)

	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "saved": saved}


static func default_environment() -> Environment:
	var env := Environment.new()
	var sky := Sky.new()
	var psm := ProceduralSkyMaterial.new()
	sky.sky_material = psm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = true
	return env


func _mat(c: Color, metal: float, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = metal
	m.roughness = rough
	return m


func _box(parent: Node, n: String, size: Vector3, pos: Vector3, c: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	var b := BoxMesh.new()
	b.size = size
	b.add_uv2 = true
	mi.mesh = b
	mi.position = pos
	mi.material_override = _mat(c, 0.0, 0.85)
	parent.add_child(mi)
	return mi


func _sphere(parent: Node, n: String, pos: Vector3, c: Color, metal: float, rough: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	var s := SphereMesh.new()
	s.radius = 0.5
	s.height = 1.0
	s.add_uv2 = true
	mi.mesh = s
	mi.position = pos
	mi.material_override = _mat(c, metal, rough)
	parent.add_child(mi)
	return mi


func _cam(parent: Node, n: String, pos: Vector3, target: Vector3, current: bool) -> Camera3D:
	var c := Camera3D.new()
	c.name = n
	c.fov = 55.0
	c.transform = Transform3D(Basis.looking_at(target - pos, Vector3.UP), pos)   # parent at the origin; no tree needed
	c.current = current
	parent.add_child(c)
	return c
