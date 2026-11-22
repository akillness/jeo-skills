extends "res://addons/agentkit/agent_job.gd"
## Maps VisualShader output port indices to built-in names (port names are not exposed to GDScript).
func run() -> Dictionary:
	var names := {}
	for p in 40:
		var vs := VisualShader.new()
		var k := VisualShaderNodeVec3Constant.new()
		vs.add_node(VisualShader.TYPE_FRAGMENT, k, Vector2(), 2)
		var f := VisualShaderNodeFloatConstant.new()
		vs.add_node(VisualShader.TYPE_FRAGMENT, f, Vector2(), 3)
		var e := vs.connect_nodes(VisualShader.TYPE_FRAGMENT, 3, 0, 0, p)
		if e != OK:
			e = vs.connect_nodes(VisualShader.TYPE_FRAGMENT, 2, 0, 0, p)
		if e != OK:
			continue
		for line in vs.get_code().split("\n"):
			if line.strip_edges().contains(" = n_out") and not line.contains("float n_out") and not line.contains("vec3 n_out"):
				names[p] = line.strip_edges()
	var t := VisualShaderNodeTexture.new()
	t.source = VisualShaderNodeTexture.SOURCE_PORT
	return {"ok": true, "ports": names}
