extends "res://addons/agentkit/agent_job.gd"
## Builds three lab scenes from main.tscn:
##  scenes/stencil_lab.tscn   portal (shader stencil_mode write/read), X-ray and outline (BaseMaterial3D presets)
##  scenes/fullscreen.tscn    full-screen quad with fullscreen_depth.gdshader (debug_view settable),
##                            plus a hidden "Trap" quad that uses the pre-4.3 POSITION = vec4(VERTEX, 1.0)
##  scenes/sky_lab.tscn       sky_toon.gdshader on the WorldEnvironment, camera looking at the sun

const AgentBuild := preload("res://addons/agentkit/agent_build.gd")

func base(name: String) -> Node3D:
	var root: Node3D = load("res://main.tscn").instantiate()
	root.name = name
	root.get_node("RefCube").free()
	return root

func box(root: Node, name: String, pos: Vector3, size: Vector3, col: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = name
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.position = pos
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	mi.material_override = m
	root.add_child(mi)
	return mi

func shader_mat(path: String, priority := 0) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	m.render_priority = priority
	return m

func run() -> Dictionary:
	var saved := {}
	# --- stencil lab
	var s := base("StencilLab")
	var portal := MeshInstance3D.new()
	portal.name = "Portal"
	var q := QuadMesh.new()
	q.size = Vector2(1.6, 2.2)
	portal.mesh = q
	portal.position = Vector3(-1.6, 1.2, 0.5)
	portal.material_override = shader_mat("res://shaders/portal_writer.gdshader", 0)
	s.add_child(portal)
	var frame := box(s, "PortalFrame", Vector3(-1.6, 1.2, 0.45), Vector3(1.9, 2.5, 0.05), Color(0.25, 0.22, 0.2))
	frame.visible = true
	var inside := MeshInstance3D.new()
	inside.name = "PortalWorld"
	var sm := SphereMesh.new()
	sm.radius = 1.4
	sm.height = 2.8
	inside.mesh = sm
	inside.position = Vector3(-1.6, 1.2, -1.2)
	inside.material_override = shader_mat("res://shaders/portal_reader.gdshader", 1)
	s.add_child(inside)
	var wall := box(s, "Wall", Vector3(1.6, 1.0, 1.0), Vector3(2.2, 2.0, 0.2), Color(0.55, 0.55, 0.6))
	var hidden := MeshInstance3D.new()
	hidden.name = "XRayHero"
	hidden.mesh = CapsuleMesh.new()
	hidden.position = Vector3(1.6, 1.0, -0.4)
	var xm := StandardMaterial3D.new()
	xm.albedo_color = Color(0.3, 0.8, 0.4)
	xm.stencil_mode = BaseMaterial3D.STENCIL_MODE_XRAY
	xm.stencil_color = Color(0.2, 0.9, 1.0, 1.0)
	hidden.material_override = xm
	s.add_child(hidden)
	var crate := box(s, "OutlinedCrate", Vector3(0.2, 0.4, 2.2), Vector3(0.8, 0.8, 0.8), Color(0.8, 0.5, 0.2))
	var om := crate.material_override as StandardMaterial3D
	om.stencil_mode = BaseMaterial3D.STENCIL_MODE_OUTLINE
	om.stencil_color = Color(1.0, 0.9, 0.1, 1.0)
	om.stencil_outline_thickness = 0.06
	var ball := MeshInstance3D.new()
	ball.name = "OutlinedBall"
	ball.mesh = SphereMesh.new()
	ball.position = Vector3(-0.3, 0.5, 2.6)
	var bm := StandardMaterial3D.new()
	bm.albedo_color = Color(0.3, 0.45, 0.9)
	bm.stencil_mode = BaseMaterial3D.STENCIL_MODE_OUTLINE
	bm.stencil_color = Color(1.0, 0.9, 0.1, 1.0)
	bm.stencil_outline_thickness = 0.06
	ball.material_override = bm
	s.add_child(ball)
	crate.position = Vector3(0.9, 0.4, 2.2)
	saved["stencil"] = AgentBuild.save_scene(s, "res://scenes/stencil_lab.tscn").get("ok", false)
	var info := {"xray_next_pass": xm.next_pass != null, "outline_next_pass": om.next_pass != null,
			"om_stencil_flags": om.stencil_flags, "om_compare": om.stencil_compare, "om_ref": om.stencil_reference,
			"xm_flags": xm.stencil_flags, "xm_compare": xm.stencil_compare}
	s.free()
	# --- full-screen quad
	var f := base("Fullscreen")
	for i in 6:
		box(f, "Box%d" % i, Vector3(-3.0 + i * 1.2, 0.5, -i * 1.6), Vector3(0.8, 1.0, 0.8), Color(0.7, 0.4, 0.3))
	var cam: Camera3D = f.get_node("Camera3D")
	for pair in [["Post", "res://shaders/fullscreen_depth.gdshader", true], ["Trap", "res://shaders/lab/fullscreen_old_trap.gdshader", false]]:
		var mi := MeshInstance3D.new()
		mi.name = pair[0]
		var fq := QuadMesh.new()
		fq.size = Vector2(2, 2)
		fq.flip_faces = true
		mi.mesh = fq
		mi.extra_cull_margin = 16384.0
		mi.material_override = shader_mat(pair[1])
		mi.visible = pair[2]
		cam.add_child(mi)
	saved["fullscreen"] = AgentBuild.save_scene(f, "res://scenes/fullscreen.tscn").get("ok", false)
	f.free()
	# --- sky
	var k := base("SkyLab")
	var env: Environment = (k.get_node("WorldEnvironment") as WorldEnvironment).environment.duplicate()
	var sky := Sky.new()
	sky.sky_material = shader_mat("res://shaders/sky_toon.gdshader")
	env.sky = sky
	(k.get_node("WorldEnvironment") as WorldEnvironment).environment = env
	var sun: DirectionalLight3D = k.get_node("Sun")
	sun.transform = Transform3D.IDENTITY
	sun.rotation_degrees = Vector3(-15, 180, 0)
	var kc: Camera3D = k.get_node("Camera3D")
	kc.transform = Transform3D.IDENTITY
	kc.position = Vector3(0, 1.5, 6)
	kc.rotation_degrees = Vector3(8, 0, 0)
	kc.fov = 70.0
	box(k, "Pillar", Vector3(2.0, 1.5, 0), Vector3(0.6, 3.0, 0.6), Color(0.8, 0.8, 0.8))
	saved["sky"] = AgentBuild.save_scene(k, "res://scenes/sky_lab.tscn").get("ok", false)
	k.free()
	return {"ok": saved.values().all(func(v): return v), "saved": saved, "stencil_info": info}
