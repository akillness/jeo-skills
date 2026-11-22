// Stylized water, LITE tier (low-end phones, web): depth only, no screen copy, alpha blended.
// scenario-godot-shaders 0.1, Godot 4.7.2. Same body as water_stylized.gdshader.
shader_type spatial;
render_mode blend_mix, cull_back, diffuse_lambert, specular_schlick_ggx;
#define WATER_LITE
#include "water_common.gdshaderinc"
