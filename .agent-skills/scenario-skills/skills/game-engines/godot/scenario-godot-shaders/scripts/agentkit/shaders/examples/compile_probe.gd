extends "res://addons/agentkit/agent_job.gd"

const CASES := {
	"ok_spatial": "shader_type spatial;\nuniform vec4 c : source_color = vec4(1.0);\nvoid fragment() { ALBEDO = c.rgb; }\n",
	"int_to_float": "shader_type spatial;\nvoid fragment() { float a = 2; ALBEDO = vec3(a); }\n",
	"hint_color_g3": "shader_type spatial;\nuniform vec4 c : hint_color;\nvoid fragment() { ALBEDO = c.rgb; }\n",
	"screen_texture_g3": "shader_type spatial;\nvoid fragment() { ALBEDO = texture(SCREEN_TEXTURE, SCREEN_UV).rgb; }\n",
	"global_missing": "shader_type spatial;\nglobal uniform vec4 not_registered_color;\nvoid fragment() { ALBEDO = not_registered_color.rgb; }\n",
	"normal_roughness": "shader_type spatial;\nuniform sampler2D nr : hint_normal_roughness_texture;\nvoid fragment() { ALBEDO = texture(nr, SCREEN_UV).rgb; }\n",
	"stencil_read_opaque": "shader_type spatial;\nstencil_mode read, compare_equal, 1;\nvoid fragment() { ALBEDO = vec3(1.0); }\n",
	"sampler_instance": "shader_type spatial;\ninstance uniform sampler2D t;\nvoid fragment() { ALBEDO = texture(t, UV).rgb; }\n",
	"varying_in_light": "shader_type spatial;\nvarying float v;\nvoid light() { v = 1.0; DIFFUSE_LIGHT += vec3(v); }\n",
	"array_default": "shader_type spatial;\nuniform float arr[4] = {1.0, 2.0, 3.0, 4.0};\nvoid fragment() { ALBEDO = vec3(arr[0]); }\n",
	"include_gdshader": "shader_type spatial;\n#include \"res://probe/ok.gdshader\"\nvoid fragment() { ALBEDO = vec3(1.0); }\n",
	"sky_ok": "shader_type sky;\nvoid sky() { COLOR = mix(vec3(0.8,0.9,1.0), vec3(0.1,0.3,0.8), clamp(EYEDIR.y,0.0,1.0)); }\n",
	"fog_ok": "shader_type fog;\nvoid fog() { DENSITY = 0.5; ALBEDO = vec3(1.0); }\n",
	"particles_ok": "shader_type particles;\nvoid start() { VELOCITY = vec3(0.0, 1.0, 0.0); }\nvoid process() { VELOCITY.y -= 9.8 * DELTA; }\n",
	"particles_g3_vertex": "shader_type particles;\nvoid vertex() { VELOCITY = vec3(0.0); }\n",
	"canvas_ok": "shader_type canvas_item;\nuniform float blink : hint_range(0.0, 1.0) = 0.0;\nvoid fragment() { vec4 c = texture(TEXTURE, UV); COLOR = vec4(mix(c.rgb, vec3(1.0), blink * c.a), c.a); }\n",
	"compat_branch": "shader_type spatial;\nuniform sampler2D d : hint_depth_texture;\nvoid fragment() {\n#if CURRENT_RENDERER == RENDERER_COMPATIBILITY\n ALBEDO = vec3(1.0,0.0,0.0);\n#else\n ALBEDO = vec3(texture(d, SCREEN_UV).r);\n#endif\n}\n",
	"syntax_error": "shader_type spatial;\nvoid fragment() { ALBEDO = vec3(1.0) }\n",
	"depth_one_branch": "shader_type spatial;\nvoid fragment() { if (UV.x > 0.5) { DEPTH = 0.5; } ALBEDO = vec3(1.0); }\n",
	"uninit_local": "shader_type spatial;\nvoid fragment() { float a; ALBEDO = vec3(a); }\n",
}

func run() -> Dictionary:
	expect_errors = true
	var out := {}
	for k in CASES:
		var before := captured_error_count()
		var sh := Shader.new()
		sh.code = CASES[k]
		var ul := sh.get_shader_uniform_list()
		var errs := captured_errors().slice(before)
		var msgs := []
		for e in errs:
			msgs.append("%s|%s|%s" % [e.get("type"), e.get("message"), e.get("code")])
		out[k] = {"errors": msgs.size(), "msgs": msgs.slice(0, 3), "uniforms": ul.size(), "mode": sh.get_mode()}
	return {"ok": true, "cases": out, "renderer": RenderingServer.get_current_rendering_method()}
