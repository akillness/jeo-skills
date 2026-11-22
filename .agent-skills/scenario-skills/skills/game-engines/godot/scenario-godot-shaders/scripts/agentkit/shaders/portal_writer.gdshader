// Portal mask: writes stencil 1 where the quad covers the screen, draws nothing visible.
shader_type spatial;
render_mode unshaded, depth_draw_never, cull_disabled, blend_mix;
stencil_mode write, compare_always, 1;
void fragment() {
	ALBEDO = vec3(0.0);
	ALPHA = 0.0;
}
