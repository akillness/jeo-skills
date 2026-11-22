// Stylized sky: banded gradient plus a hard sun disc from the first DirectionalLight3D.
shader_type sky;
uniform vec4 zenith : source_color = vec4(0.10, 0.28, 0.65, 1.0);
uniform vec4 horizon : source_color = vec4(0.75, 0.85, 0.95, 1.0);
uniform vec4 ground : source_color = vec4(0.22, 0.20, 0.18, 1.0);
uniform float bands = 5.0;
uniform float sun_size : hint_range(0.0, 0.1) = 0.03;
void sky() {
	float h = clamp(EYEDIR.y, 0.0, 1.0);
	float b = floor(pow(h, 0.5) * bands) / bands;
	vec3 c = mix(horizon.rgb, zenith.rgb, b);
	if (LIGHT0_ENABLED) {
		float d = dot(EYEDIR, LIGHT0_DIRECTION);
		float disc = step(cos(sun_size), d);
		c = mix(c, LIGHT0_COLOR * LIGHT0_ENERGY * 4.0, disc);
	}
	COLOR = EYEDIR.y < 0.0 ? ground.rgb : c;
}
