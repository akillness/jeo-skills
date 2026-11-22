// Stylized water, HQ tier (Forward+, Mobile on capable phones, Compatibility): depth + screen refraction.
// scenario-godot-shaders 0.1, Godot 4.7.2. Body in water_common.gdshaderinc (relative include).
shader_type spatial;
render_mode blend_mix, cull_back, diffuse_lambert, specular_schlick_ggx;
#include "water_common.gdshaderinc"
