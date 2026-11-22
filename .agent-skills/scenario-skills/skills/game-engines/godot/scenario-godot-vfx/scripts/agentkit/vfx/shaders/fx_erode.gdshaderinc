// scenario-godot-vfx 0.1: billboard particle with noise erosion driven by particle age (onetupthree N9ilhL8JFes 00:02:18, 00:05:38).
// INSTANCE_CUSTOM.x = rotation (radians), .y = age 0..1 with the default ParticleProcessMaterial.
// COLOR is the particle colour (color_ramp, alpha_curve); it multiplies the result.
uniform sampler2D noise_tex : hint_default_white, repeat_enable, filter_linear_mipmap;
uniform sampler2D mask_tex : hint_default_white, filter_linear;
uniform vec4 tint : source_color = vec4(1.0);
uniform float erode_start = 0.05;
uniform float erode_end = 1.05;
uniform float edge = 0.18;
uniform float noise_scale = 0.7;
varying float life;
varying float rnd;

void vertex() {
	mat4 mat_world = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	mat_world = mat_world * mat4(vec4(cos(INSTANCE_CUSTOM.x), -sin(INSTANCE_CUSTOM.x), 0.0, 0.0), vec4(sin(INSTANCE_CUSTOM.x), cos(INSTANCE_CUSTOM.x), 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat_world;
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	life = INSTANCE_CUSTOM.y;
	rnd = fract(float(INSTANCE_ID) * 0.6180339);
}

void fragment() {
	float n = texture(noise_tex, UV * noise_scale + vec2(rnd, rnd * 1.7)).r;
	float m = texture(mask_tex, UV).a;
	float shape = m * (0.45 + n);
	float thr = mix(erode_start, erode_end, life);
	float a = smoothstep(thr, thr + edge, shape);
	ALBEDO = COLOR.rgb * tint.rgb;
	ALPHA = a * COLOR.a * tint.a;
}
