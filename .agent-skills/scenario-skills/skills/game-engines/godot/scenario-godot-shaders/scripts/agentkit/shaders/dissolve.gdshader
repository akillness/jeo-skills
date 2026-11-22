// Character dissolve (scenario-godot-shaders 0.1, Godot 4.7.2).
// Object-space 3D noise + a sweep along a direction, so the effect follows the mesh when it moves,
// rotates or is scaled, with no @tool bounds script (StayAtHomeDev fed world AABBs instead).
// Alpha scissor keeps the material in the opaque pass: sorting and shadow casting stay, and the shadow
// dissolves with the mesh. It is still an alpha test (like discard), so the mesh loses early-Z: swap this
// material in only for the effect (dissolve_swap.gd) rather than leaving it on every mesh. dissolve_amount and bounds are INSTANCE uniforms: one shared
// material, a different value per MeshInstance3D (set_instance_shader_parameter, or the property path
// "instance_shader_parameters/dissolve_amount" for Tween and AnimationPlayer).
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque, diffuse_burley, specular_schlick_ggx;

group_uniforms surface;
uniform vec4 albedo : source_color = vec4(0.8, 0.8, 0.85, 1.0);
uniform sampler2D albedo_tex : source_color, hint_default_white, filter_linear_mipmap;
uniform float roughness : hint_range(0.0, 1.0) = 0.6;
/** Colour of back faces seen through the cut (the inside of the mesh). */
uniform vec4 interior_color : source_color = vec4(0.06, 0.02, 0.02, 1.0);
group_uniforms dissolve;
instance uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler3D noise_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
/** Noise tiles per metre, in object space. */
uniform float noise_scale = 1.2;
uniform float noise_strength : hint_range(0.0, 1.0) = 0.3;
/** Object-space direction of the sweep: the low end disappears first. */
uniform vec3 dissolve_direction = vec3(0.0, 1.0, 0.0);
/** Extent of the mesh along dissolve_direction (object space), per instance: ShaderTools.dissolve_bounds(mesh). */
instance uniform vec2 bounds = vec2(-1.0, 1.0);
group_uniforms dissolve.edge;
uniform float edge_width : hint_range(0.0, 0.5) = 0.06;
uniform vec4 edge_color_hot : source_color = vec4(1.0, 0.85, 0.35, 1.0);
uniform vec4 edge_color_cool : source_color = vec4(1.0, 0.22, 0.04, 1.0);
/** HDR multiplier: above 1 so Environment glow picks the edge up. */
uniform float edge_emission = 6.0;
group_uniforms;

varying vec3 obj_pos;

void vertex() {
	obj_pos = VERTEX;
}

void fragment() {
	vec3 dir = normalize(dissolve_direction);
	float h = (dot(obj_pos, dir) - bounds.x) / max(bounds.y - bounds.x, 0.0001);
	float n = texture(noise_tex, obj_pos * noise_scale).r;
	float v = h + (n - 0.5) * 2.0 * noise_strength;
	// amount 0: threshold below every v (all visible, no edge); amount 1: above every v (all gone).
	float threshold = mix(-noise_strength - edge_width - 0.001, 1.0 + noise_strength + 0.001, dissolve_amount);
	float diff = v - threshold;
	float edge = 1.0 - smoothstep(0.0, max(edge_width, 0.0001), diff);
	vec3 edge_col = mix(edge_color_hot.rgb, edge_color_cool.rgb, clamp(diff / max(edge_width, 0.0001), 0.0, 1.0));
	vec3 base = albedo.rgb * texture(albedo_tex, UV).rgb;
	if (!FRONT_FACING) {
		base = interior_color.rgb;
	}
	ALBEDO = base * (1.0 - edge);
	ROUGHNESS = roughness;
	EMISSION = edge_col * edge * edge_emission;
	ALPHA = step(0.0, diff);
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
