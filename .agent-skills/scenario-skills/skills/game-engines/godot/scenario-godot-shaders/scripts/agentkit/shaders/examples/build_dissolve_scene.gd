extends "res://addons/agentkit/agent_job.gd"
## Builds res://scenes/dissolve_lab.tscn: three meshes (a 1.8 m capsule "Hero", a rotated torus, a
## rotated and non-uniformly scaled box) sharing ONE ShaderMaterial with dissolve.gdshader; each gets
## its own bounds and dissolve_amount through instance uniforms. Glow on, so the HDR edge blooms.

const AgentBuild := preload("res://addons/agentkit/agent_build.gd")
const ShaderTools := preload("res://addons/agentkit/shaders/shader_tools.gd")

func run() -> Dictionary:
	var out: String = arg("out", "res://scenes/dissolve_lab.tscn")
	var root := Node3D.new()
	root.name = "DissolveLab"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.06, 0.08)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.35, 0.38, 0.45)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = arg("glow", true)
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-45, 35, 0)
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.fov = 50.0
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0, 1.6, 5.2), Vector3(0, 0.85, 0), Vector3.UP)
	cam.current = true
	var floor_mi := MeshInstance3D.new()
	floor_mi.name = "Floor"
	var pm := PlaneMesh.new()
	pm.size = Vector2(12, 12)
	floor_mi.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.45, 0.45, 0.48)
	floor_mi.material_override = fm
	root.add_child(floor_mi)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/dissolve.gdshader")
	mat.set_shader_parameter("noise_tex", ShaderTools.noise_texture_3d(64, 0.06, 3))
	mat.set_shader_parameter("albedo", Color(0.75, 0.78, 0.85))
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.35
	capsule.height = 1.8
	var torus := TorusMesh.new()
	torus.inner_radius = 0.3
	torus.outer_radius = 0.6
	var box := BoxMesh.new()
	var specs := [["Hero", capsule, Vector3(-1.7, 0.9, 0), Vector3.ZERO, Vector3.ONE],
			["Torus", torus, Vector3(0, 1.0, 0), Vector3(70, 0, 25), Vector3(1.2, 1.2, 1.2)],
			["Crate", box, Vector3(1.7, 0.75, 0), Vector3(0, 30, 15), Vector3(0.8, 1.4, 0.8)]]
	var bounds_report := {}
	for s in specs:
		var mi := MeshInstance3D.new()
		mi.name = s[0]
		mi.mesh = s[1]
		mi.position = s[2]
		mi.rotation_degrees = s[3]
		mi.scale = s[4]
		mi.material_override = mat
		var b := ShaderTools.dissolve_bounds(s[1], Vector3.UP)
		mi.set_instance_shader_parameter("bounds", b)
		mi.set_instance_shader_parameter("dissolve_amount", 0.0)
		bounds_report[s[0]] = b
		root.add_child(mi)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "bounds": bounds_report}
