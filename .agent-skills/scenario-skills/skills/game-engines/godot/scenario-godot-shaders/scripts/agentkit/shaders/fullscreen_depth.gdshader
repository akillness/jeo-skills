// Full-screen post-process quad with linear depth and world position (scenario-godot-shaders 0.1, Godot 4.7.2).
// Mesh: QuadMesh size (2, 2), flip_faces = true, child of the Camera3D, extra_cull_margin 16384.
// Reversed-z (4.3+): POSITION z = 1.0 is the near plane; the pre-4.3 vec4(VERTEX, 1.0) is wrong.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, depth_draw_never, depth_test_disabled;

uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
/** 0 = scene with depth fog tint, 1 = fract(linear depth) bands (debug), 2 = fract(world position). */
uniform int debug_view : hint_range(0, 2) = 1;
uniform vec4 fog_tint : source_color = vec4(0.6, 0.7, 0.9, 1.0);
uniform float fog_distance = 30.0;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	float raw = texture(depth_tex, SCREEN_UV).r;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(SCREEN_UV, raw) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(SCREEN_UV * 2.0 - 1.0, raw);
#endif
	vec4 view = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	view.xyz /= view.w;
	float linear_depth = -view.z;
	vec4 world = INV_VIEW_MATRIX * INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	vec3 world_position = world.xyz / world.w;
	vec3 scene = textureLod(screen_tex, SCREEN_UV, 0.0).rgb;
	if (debug_view == 1) {
		ALBEDO = vec3(fract(linear_depth));
	} else if (debug_view == 2) {
		ALBEDO = fract(world_position);
	} else {
		ALBEDO = mix(scene, fog_tint.rgb, clamp(linear_depth / fog_distance, 0.0, 1.0));
	}
}
