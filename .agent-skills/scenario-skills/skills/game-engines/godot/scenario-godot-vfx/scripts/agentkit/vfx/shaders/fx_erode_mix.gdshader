// scenario-godot-vfx 0.1: alpha-blended eroding puff (smoke, dust). Draw order view_depth on the emitter.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://vfx/shaders/fx_erode.gdshaderinc"
