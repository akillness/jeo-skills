// scenario-godot-vfx 0.1: projectile head, the text version of Le Lu's VisualShader (74XywaLGO5Q 00:07:30 to 00:14:38).
// Scrolling noise minus a gradient along the mesh, clamped (negative values make black marks, 00:11:01),
// HDR colour (above 1) so it glows. Use on a SphereMesh rotated so its +Y pole points forward (UV.y = 0 at the nose).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec4 fire_color : source_color = vec4(2.0, 1.3, 0.6, 1.0);
uniform vec4 edge_color : source_color = vec4(1.4, 0.35, 0.06, 1.0);
uniform sampler2D noise_tex : hint_default_white, repeat_enable, filter_linear_mipmap;
uniform vec2 scroll = vec2(0.1, -3.0);      // UV per second; Le Lu uses (0.1, 3)
uniform vec2 tiling = vec2(2.0, 1.0);
uniform float coverage : hint_range(0.0, 1.0) = 0.45;   // how far back along the mesh the fire reaches
uniform float sharpness = 2.0;
uniform float intensity = 1.0;

void fragment() {
	float n = texture(noise_tex, UV * tiling + TIME * scroll).r;
	float a = clamp((n - (UV.y - coverage)) * sharpness - 0.5, 0.0, 1.0);
	float facing = abs(dot(NORMAL, VIEW));
	a *= smoothstep(0.0, 0.45, facing);     // soft silhouette
	ALBEDO = mix(edge_color.rgb, fire_color.rgb, a) * intensity;
	ALPHA = a * fire_color.a;
}
