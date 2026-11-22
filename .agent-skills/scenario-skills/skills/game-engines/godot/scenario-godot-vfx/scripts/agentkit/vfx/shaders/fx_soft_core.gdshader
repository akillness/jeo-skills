// scenario-godot-vfx 0.1: inner glow ball (Le Lu 74XywaLGO5Q 00:15:01 to 00:18:25): inverted Fresnel to alpha, HDR colour.
// Draw it before the head: render_priority lower than the head's.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

uniform vec4 core_color : source_color = vec4(2.2, 1.8, 1.0, 1.0);
uniform float power = 4.5;   // Le Lu: 4 to 5

void fragment() {
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), power);
	ALBEDO = core_color.rgb;
	ALPHA = (1.0 - rim) * core_color.a;
}
