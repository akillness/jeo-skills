// scenario-godot-vfx 0.1: additive eroding puff (fire, flash, magic). Same code as fx_erode_mix, other blend mode.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
#include "res://vfx/shaders/fx_erode.gdshaderinc"
