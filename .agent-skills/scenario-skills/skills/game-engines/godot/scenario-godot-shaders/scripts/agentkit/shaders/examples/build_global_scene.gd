extends "res://addons/agentkit/agent_job.gd"
## res://scenes/global_tint.tscn: left cube reads the registered global `day_tint`, right cube reads
## a global that is NOT in project.godot (compiles with no error at runtime in 4.7.2 and reads
## another registered global's value, observed: day_tint; the editor and the shader baker do report it).
const AgentBuild := preload("res://addons/agentkit/agent_build.gd")

func run() -> Dictionary:
	var root: Node3D = load("res://main.tscn").instantiate()
	root.name = "GlobalTint"
	root.get_node("RefCube").queue_free()
	for spec in [["Registered", "res://probe/global_tint.gdshader", -0.9], ["Missing", "res://probe/global_missing.gdshader", 0.9]]:
		var mi := MeshInstance3D.new()
		mi.name = spec[0]
		mi.mesh = BoxMesh.new()
		mi.position = Vector3(spec[2], 0.5, 0)
		var m := ShaderMaterial.new()
		m.shader = load(spec[1])
		mi.material_override = m
		root.add_child(mi)
	await wait_frames(1)
	var saved := AgentBuild.save_scene(root, "res://scenes/global_tint.tscn")
	root.free()
	return {"ok": saved.get("ok", false), "globals_at_startup": RenderingServer.global_shader_parameter_get_list(),
			"setting": ProjectSettings.get_setting("shader_globals/day_tint", null)}
