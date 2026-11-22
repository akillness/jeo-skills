// scenario-godot-vfx 0.1: particles shader for a ribbon that FOLLOWS its emitter (Octodemy iPCzOe-S9EQ 00:05:42):
// the particle is pinned to the emitter every frame, so the trail history draws the path.
// Use with GPUParticles3D: amount 1, local_coords false, trail_enabled, a RibbonTrailMesh draw pass whose
// material has use_particle_trails. No gravity or velocity: forces would pull the head off the emitter.
shader_type particles;
render_mode disable_velocity;

uniform vec4 color : source_color = vec4(1.0);

void start() {
	TRANSFORM = EMISSION_TRANSFORM;
	VELOCITY = vec3(0.0);
	COLOR = color;
	CUSTOM = vec4(0.0);
}

void process() {
	CUSTOM.y = clamp(CUSTOM.y + DELTA / LIFETIME, 0.0, 1.0);
	TRANSFORM[3].xyz = EMISSION_TRANSFORM[3].xyz;
}
