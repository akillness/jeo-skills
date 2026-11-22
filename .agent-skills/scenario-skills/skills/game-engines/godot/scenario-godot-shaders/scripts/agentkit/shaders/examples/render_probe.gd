extends "res://addons/agentkit/agent_job.gd"
## Applies each probe case to a mesh that is actually drawn, so the real backend compiles it.

func run() -> Dictionary:
	expect_errors = true
	var cases: Dictionary = load("res://probe/compile_probe.gd").CASES.duplicate()
	cases["include_from_code_inc"] = "shader_type spatial;\n#include \"res://probe/noise.gdshaderinc\"\nvoid fragment() { ALBEDO = vec3(hash21(UV)); }\n"
	var vp := SubViewport.new()
	vp.size = Vector2i(64, 64)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(vp)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 0, 3)
	vp.add_child(cam)
	cam.current = true
	var mi := MeshInstance3D.new()
	mi.mesh = BoxMesh.new()
	vp.add_child(mi)
	var out := {}
	var file_sh: Shader = load("res://probe/uses_include.gdshader")
	out["include_file_loaded"] = {"uniform_list": file_sh.get_shader_uniform_list().size(), "code_has_hash": file_sh.code.contains("hash21")}
	for k in cases:
		var before := captured_error_count()
		var sh := Shader.new()
		sh.code = cases[k]
		var m := ShaderMaterial.new()
		m.shader = sh
		if sh.get_mode() == Shader.MODE_SPATIAL:
			mi.material_override = m
			await wait_frames(3)
			await RenderingServer.frame_post_draw
		else:
			sh.get_shader_uniform_list()
		var errs := captured_errors().slice(before)
		var msgs := []
		for e in errs:
			msgs.append("%s|%s" % [e.get("type"), str(e.get("message")).substr(0, 160)])
		out[k] = {"errors": msgs.size(), "msgs": msgs.slice(0, 3)}
	mi.material_override = null
	return {"ok": true, "cases": out, "renderer": RenderingServer.get_current_rendering_method(),
		"driver": RenderingServer.get_current_rendering_driver_name(), "frames": Engine.get_frames_drawn()}
