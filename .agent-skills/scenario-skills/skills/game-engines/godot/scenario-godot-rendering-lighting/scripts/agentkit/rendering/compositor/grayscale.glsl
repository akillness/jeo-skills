#[compute]
#version 450
// scenario-godot-rendering-lighting 0.1: full-screen compute pass for post_effect.gd (Godot 4.7.2 Compositor).
// Imported as RDShaderFile (needs an --import after the file is added). Replace the body of main()
// for other single-pass effects; keep the push-constant block 16-byte aligned (4 floats).
layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;
layout(rgba16f, set = 0, binding = 0) uniform image2D color_image;
layout(push_constant, std430) uniform Params {
	vec2 raster_size;
	float strength;
	float reserved;
} params;

void main() {
	ivec2 uv = ivec2(gl_GlobalInvocationID.xy);
	ivec2 size = ivec2(params.raster_size);
	if (uv.x >= size.x || uv.y >= size.y) {
		return;
	}
	vec4 color = imageLoad(color_image, uv);
	float gray = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
	color.rgb = mix(color.rgb, vec3(gray), params.strength);
	imageStore(color_image, uv, color);
}
