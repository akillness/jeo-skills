// Smoke that diffuses by mip level (scenario-godot-vfx 0.1, Godot 4.7.2). Le Lu e_6ZA-xa_DQ 00:16:40 to 00:24:20:
// the particle colour ramp carries the LOD (COLOR.r 0 to 1 over life becomes mip 0 to max_lod), so one
// tileable noise texture blurs into soft smoke at almost no cost. The colour comes from smoke_color,
// because COLOR is used as data. Use with a ParticleProcessMaterial colour ramp from black to white
// and an alpha curve for the fade. The noise texture needs mipmaps (NoiseTexture2D generates them).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform sampler2D noise_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
uniform vec4 smoke_color : source_color = vec4(0.55, 0.55, 0.55, 1.0);
uniform float max_lod = 8.0;
varying float lod;
varying float fade;

void vertex() {
	// Particle billboard with kept scale (the code a StandardMaterial3D with BILLBOARD_PARTICLES generates).
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0),
			vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0),
			vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	lod = COLOR.r * max_lod;
	fade = COLOR.a;
}

void fragment() {
	float circle = 1.0 - smoothstep(0.3, 0.5, distance(UV, vec2(0.5)));
	ALBEDO = smoke_color.rgb;
	ALPHA = textureLod(noise_tex, UV, lod).r * circle * fade;
}
