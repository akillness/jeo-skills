// Portal content: drawn only where the stencil equals 1. Reading stencil needs the alpha pass,
// so ALPHA is written, and render_priority on the material must be above the writer's. depth_test_disabled
// lets it show "behind" the frame that holds the portal.
shader_type spatial;
render_mode depth_test_disabled, depth_draw_never;
stencil_mode read, compare_equal, 1;
uniform vec4 tint : source_color = vec4(1.0, 0.35, 0.1, 1.0);
void fragment() {
	ALBEDO = tint.rgb;
	ALPHA = 1.0;
}
