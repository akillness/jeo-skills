extends "res://addons/agentkit/agent_job.gd"
## Builds a VisualShader in code and saves it as res://shaders/vs_dissolve.tres (a resource the human
## opens in the graph editor). Graph: FloatParameter amount + Texture2DParameter noise -> Texture ->
## Expression (dissolve math in text) -> Output alpha, alpha scissor, emission, albedo.
## Then builds res://scenes/vs_dissolve.tscn: a sphere with it, for captures.

const AgentBuild := preload("res://addons/agentkit/agent_build.gd")
const ShaderTools := preload("res://addons/agentkit/shaders/shader_tools.gd")
const F := VisualShader.TYPE_FRAGMENT

## Port names are not exposed to GDScript (get_input_port_count is not bound on 4.7.2), so the
## spatial fragment Output indices are hard-coded; probe/vs_ports.gd maps them by reading get_code().
const OUT := {"albedo": 0, "alpha": 1, "metallic": 2, "roughness": 3, "specular": 4, "emission": 5,
		"alpha_scissor_threshold": 19}
const TEX_SAMPLER_PORT := 2  # VisualShaderNodeTexture inputs: uv 0, lod 1, sampler2D 2

func run() -> Dictionary:
	var vs := VisualShader.new()
	vs.set_mode(Shader.MODE_SPATIAL)
	var amount := VisualShaderNodeFloatParameter.new()
	amount.parameter_name = "amount"
	amount.hint = VisualShaderNodeFloatParameter.HINT_RANGE
	amount.min = 0.0
	amount.max = 1.0
	amount.default_value_enabled = true
	amount.default_value = 0.4
	var noise_p := VisualShaderNodeTexture2DParameter.new()
	noise_p.parameter_name = "noise"
	noise_p.texture_repeat = VisualShaderNodeTextureParameter.REPEAT_ENABLED
	var tex := VisualShaderNodeTexture.new()
	tex.source = VisualShaderNodeTexture.SOURCE_PORT
	var expr := VisualShaderNodeExpression.new()
	expr.size = Vector2(420, 260)
	expr.add_input_port(0, VisualShaderNode.PORT_TYPE_SCALAR, "n")
	expr.add_input_port(1, VisualShaderNode.PORT_TYPE_SCALAR, "a")
	expr.add_output_port(0, VisualShaderNode.PORT_TYPE_SCALAR, "alpha")
	expr.add_output_port(1, VisualShaderNode.PORT_TYPE_VECTOR_3D, "glow")
	expr.add_output_port(2, VisualShaderNode.PORT_TYPE_VECTOR_3D, "base")
	expr.set_expression("float t = mix(-0.08, 1.0, a);\nfloat d = n - t;\nalpha = step(0.0, d);\nfloat e = 1.0 - smoothstep(0.0, 0.08, d);\nglow = vec3(0.3, 0.8, 1.0) * e * 5.0;\nbase = vec3(0.8) * (1.0 - e);")
	var out := vs.get_node(F, VisualShader.NODE_ID_OUTPUT)
	var ids := {}
	var x := -900.0
	for pair in [["amount", amount], ["noise", noise_p], ["tex", tex], ["expr", expr]]:
		var id := vs.get_valid_node_id(F)
		vs.add_node(F, pair[1], Vector2(x, 0), id)
		ids[pair[0]] = id
		x += 260.0
	var c := []
	c.append(vs.connect_nodes(F, ids["noise"], 0, ids["tex"], TEX_SAMPLER_PORT))
	c.append(vs.connect_nodes(F, ids["tex"], 0, ids["expr"], 0))
	c.append(vs.connect_nodes(F, ids["amount"], 0, ids["expr"], 1))
	c.append(vs.connect_nodes(F, ids["expr"], 0, VisualShader.NODE_ID_OUTPUT, OUT["alpha"]))
	c.append(vs.connect_nodes(F, ids["expr"], 1, VisualShader.NODE_ID_OUTPUT, OUT["emission"]))
	c.append(vs.connect_nodes(F, ids["expr"], 2, VisualShader.NODE_ID_OUTPUT, OUT["albedo"]))
	var scissor := VisualShaderNodeFloatConstant.new()
	scissor.constant = 0.5
	var sid := vs.get_valid_node_id(F)
	vs.add_node(F, scissor, Vector2(-260, 320), sid)
	c.append(vs.connect_nodes(F, sid, 0, VisualShader.NODE_ID_OUTPUT, OUT["alpha_scissor_threshold"]))
	var err := ResourceSaver.save(vs, "res://shaders/vs_dissolve.tres")
	# scene with a sphere using it
	var root: Node3D = load("res://main.tscn").instantiate()
	root.name = "VSDissolve"
	root.get_node("RefCube").free()
	var mi := MeshInstance3D.new()
	mi.name = "Sphere"
	mi.mesh = SphereMesh.new()
	mi.position = Vector3(0, 1.0, 0)
	mi.scale = Vector3(1.6, 1.6, 1.6)
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/vs_dissolve.tres")
	var nt := ShaderTools.noise_texture_2d(256, 0.03, 11)
	(nt.noise as FastNoiseLite).noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	nt.noise.fractal_type = FastNoiseLite.FRACTAL_FBM
	m.set_shader_parameter("noise", nt)
	mi.material_override = m
	root.add_child(mi)
	var saved := AgentBuild.save_scene(root, "res://scenes/vs_dissolve.tscn")
	root.free()
	return {"ok": err == OK and saved.get("ok", false) and not c.has(ERR_INVALID_PARAMETER) and c.all(func(v): return v == OK),
			"connect_results": c, "ids": ids, "out_ports": OUT}
