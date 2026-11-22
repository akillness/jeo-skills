// water_common.gdshaderinc (scenario-godot-shaders 0.1, Godot 4.7.2): stylized water body.
// Included by water_stylized.gdshader (HQ: depth + screen refraction) and water_lite.gdshader
// (#define WATER_LITE: depth only, no screen copy, alpha blended). Both start with shader_type spatial.
// Expects a flat, unrotated, subdivided plane (PlaneMesh with subdivide_width/depth >= 32 for waves).
// Recipe: two panned copies of one seamless cellular noise multiplied and raised to 1.25 (Bramwell),
// shared by vertex and fragment so crests sit on wave tops; vertical water depth from the depth
// texture with the reversed-z formula (4.3+) and a Compatibility branch; banded colour with a small
// smoothstep at each band edge (Dylearn hybrid toon); hard shoreline foam broken by noise and two-tone
// ripples from a step on the noise product [added].

group_uniforms colors;
uniform vec4 shallow_color : source_color = vec4(0.25, 0.85, 0.82, 1.0);
uniform vec4 deep_color : source_color = vec4(0.04, 0.20, 0.42, 1.0);
uniform vec4 foam_color : source_color = vec4(0.95, 0.98, 1.0, 1.0);
/** Metres of water (vertical) at which the colour reaches deep_color. */
uniform float depth_range : hint_range(0.1, 20.0) = 2.5;
uniform int color_bands : hint_range(1, 8) = 4;
/** 0 = hard toon bands, 1 = smooth ramp. Small values stop flicker at band edges. */
uniform float band_smoothing : hint_range(0.0, 1.0) = 0.15;
group_uniforms foam;
/** Metres of water under which the shoreline foam appears. */
uniform float shore_foam_distance : hint_range(0.0, 3.0) = 0.25;
/** Two-tone ripples: where the panned noise product passes this value the colour moves toward foam. */
uniform float ripple_threshold : hint_range(0.0, 1.0) = 0.2;
uniform float ripple_strength : hint_range(0.0, 1.0) = 0.4;
group_uniforms waves;
uniform sampler2D noise_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
/** Noise tiles per metre. */
uniform float noise_scale = 0.09;
uniform vec2 pan_a = vec2(0.035, 0.02);
uniform vec2 pan_b = vec2(-0.03, 0.038);
uniform float wave_height = 0.12;
uniform float wave_speed = 1.0;
group_uniforms refraction;
uniform float refraction_strength : hint_range(0.0, 0.2) = 0.035;
/** How much of the bottom shows through in shallow water (HQ only). */
uniform float clarity : hint_range(0.0, 1.0) = 0.75;
/** LITE only: alpha in the shallowest water. */
uniform float shallow_alpha : hint_range(0.0, 1.0) = 0.55;
group_uniforms;

#ifndef WATER_LITE
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
#endif
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;

varying vec3 world_pos;

float water_noise(vec2 xz, float t) {
	vec2 uv = xz * noise_scale;
	float a = textureLod(noise_tex, uv + pan_a * t, 0.0).r;
	float b = textureLod(noise_tex, uv * 1.618 + pan_b * t, 0.0).r;
	return pow(a * b, 1.25);
}

// Scene position behind a screen pixel, in world space. Functions cannot read stage built-ins,
// so the matrices come in as arguments.
vec3 scene_world_pos(vec2 suv, float raw, mat4 inv_proj, mat4 inv_view) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(suv, raw) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(suv * 2.0 - 1.0, raw);
#endif
	vec4 v = inv_proj * vec4(ndc, 1.0);
	v.xyz /= v.w;
	return (inv_view * vec4(v.xyz, 1.0)).xyz;
}

float toon(float x, float bands, float smoothing) {
	float y = x * bands;
	float f = fract(y);
	float w = max(smoothing, 0.0001);
	return clamp((floor(y) + smoothstep(1.0 - w, 1.0, f)) / bands, 0.0, 1.0);
}

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = TIME * wave_speed;
	float n = water_noise(wp.xz, t);
	float swell = sin(dot(wp.xz, vec2(0.45, 0.25)) + t * 1.3) * 0.5 + 0.5;
	VERTEX.y += (n * 0.65 + swell * 0.35) * wave_height;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float t = TIME * wave_speed;
	float n = water_noise(world_pos.xz, t);
	float raw = texture(depth_tex, SCREEN_UV).r;
	vec3 bottom = scene_world_pos(SCREEN_UV, raw, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
	float water_depth = max(world_pos.y - bottom.y, 0.0);
	float d = clamp(water_depth / depth_range, 0.0, 1.0);
	float banded = toon(d, float(color_bands), band_smoothing);
	vec3 water_col = mix(shallow_color.rgb, deep_color.rgb, banded);

	// Shoreline foam: hard edge broken by a finer, slower noise; crest foam where both pans overlap.
	float fine = textureLod(noise_tex, world_pos.xz * noise_scale * 3.1 - pan_a * t * 0.5, 0.0).r;
	float shore = 1.0 - clamp(water_depth / max(shore_foam_distance, 0.001), 0.0, 1.0);
	float aa = max(fwidth(shore), 0.001);
	float shore_foam = smoothstep(fine - aa, fine + aa, shore);
	float foam = shore_foam;
	water_col = mix(water_col, foam_color.rgb, step(ripple_threshold, n) * ripple_strength);

#ifndef WATER_LITE
	// Refraction: offset the screen read by the noise, fading in with depth; reject samples that
	// land on something above the water surface (stops foreground objects bleeding in) [added].
	vec2 offs = (vec2(n, water_noise(world_pos.xz + vec2(7.3, 3.1), t)) - 0.25) * refraction_strength * clamp(water_depth, 0.0, 1.0);
	vec2 ruv = clamp(SCREEN_UV + offs, vec2(0.0), vec2(1.0));
	vec3 b2 = scene_world_pos(ruv, texture(depth_tex, ruv).r, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
	if (b2.y > world_pos.y) {
		ruv = SCREEN_UV;
	}
	vec3 behind = textureLod(screen_tex, ruv, 0.0).rgb;
	float transmit = clarity * (1.0 - banded) * (1.0 - foam);
	// The background is already lit: route it through EMISSION so lighting is not applied twice.
	ALBEDO = mix(water_col, foam_color.rgb, foam) * (1.0 - transmit);
	EMISSION = behind * mix(vec3(1.0), shallow_color.rgb, 0.35) * transmit;
	ALPHA = 1.0;
#else
	ALBEDO = mix(water_col, foam_color.rgb, foam);
	ALPHA = mix(mix(shallow_alpha, 1.0, banded), 1.0, foam);
#endif
	ROUGHNESS = mix(0.08, 0.9, foam);
	SPECULAR = 0.5;
}
