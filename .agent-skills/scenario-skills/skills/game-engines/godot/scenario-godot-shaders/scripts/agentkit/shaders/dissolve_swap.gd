extends RefCounted
## Swap a dissolve ShaderMaterial in for the effect only (alpha scissor is an alpha test: it gives up
## early-Z for that mesh, so it should not stay on every mesh all the time). One duplicate per surface
## keeps that surface's albedo colour and texture; dissolve_amount and bounds stay instance uniforms.
static func swap_in(mi: MeshInstance3D, dissolve: ShaderMaterial) -> Array:
	var saved := []
	for s in mi.mesh.get_surface_count():
		saved.append(mi.get_surface_override_material(s))
		var src := mi.get_active_material(s)
		var m := dissolve.duplicate() as ShaderMaterial
		if src is BaseMaterial3D:
			m.set_shader_parameter("albedo", src.albedo_color)
			if src.albedo_texture:
				m.set_shader_parameter("albedo_tex", src.albedo_texture)
		mi.set_surface_override_material(s, m)
	return saved

static func restore(mi: MeshInstance3D, saved: Array) -> void:
	for s in saved.size():
		mi.set_surface_override_material(s, saved[s])
