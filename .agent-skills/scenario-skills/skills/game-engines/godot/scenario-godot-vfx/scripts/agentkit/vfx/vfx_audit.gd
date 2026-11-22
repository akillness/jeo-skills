extends RefCounted
## scenario-godot-vfx 0.1: static audit of every particle emitter in a scene, against a quality tier.
## Run headless: gd_vfx.audit(project, "res://vfx/explosion_high.tscn", tier="high", level="res://level.tscn").
## args: scene, tier ("high" Forward+ | "mobile" Mobile | "low" Compatibility), level (optional scene whose
##   GPUParticlesCollision3D nodes count as colliders), fps_assumed (frame rate when fixed_fps = 0, default 60).
## Returns {ok, findings: [{emitter, id, severity, msg}], counts {error, warn, info}, totals}.
## ok is false when any finding is an error. Each rule cites where it comes from (see references/procedures.md P3).

const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")

const DEFAULT_AABB := AABB(Vector3(-4, -4, -4), Vector3(8, 8, 8))
const DEFAULT_RECT := Rect2(-100, -100, 200, 200)

var findings: Array = []
var tier := "high"


func audit(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "")
	tier = job.arg("tier", "high")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var root: Node = (load(scene_path) as PackedScene).instantiate()
	var colliders: Array = _colliders(root)
	var level: Node = null
	var level_path: String = job.arg("level", "")
	if level_path != "" and ResourceLoader.exists(level_path):
		level = (load(level_path) as PackedScene).instantiate()
		colliders.append_array(_colliders(level))
	var fps_assumed: int = job.arg("fps_assumed", 60)
	var totals := {"emitters": 0, "amount": 0, "trails": 0, "sub_emitters": 0, "collision": 0, "lights": 0, "decals": 0}
	for e in VB.emitters(root):
		totals.emitters += 1
		totals.amount += int(e.amount)
		if e is GPUParticles3D:
			_check_3d(e, root, colliders, fps_assumed, totals)
		elif e is GPUParticles2D:
			_check_2d(e)
		elif e is CPUParticles3D or e is CPUParticles2D:
			_check_cpu(e)
	_check_nodes(root, totals)
	root.free()
	if level:
		level.free()
	var counts := {"error": 0, "warn": 0, "info": 0}
	for f in findings:
		counts[f.severity] += 1
	return {"ok": counts.error == 0, "scene": scene_path, "tier": tier, "findings": findings, "counts": counts,
			"totals": totals, "ids": findings.map(func(f): return f.id)}


func _add(e: Node, id: String, severity: String, msg: String) -> void:
	findings.append({"emitter": str(e.name) if e else "", "id": id, "severity": severity, "msg": msg})


# ---------------------------------------------------------------- GPUParticles3D

func _check_3d(g: GPUParticles3D, root: Node, colliders: Array, fps_assumed: int, totals: Dictionary) -> void:
	var pm := g.process_material as ParticleProcessMaterial
	if g.process_material == null:
		_add(g, "no_process_material", "error", "no process_material: nothing moves (GPUParticles3D docs)")
	if g.draw_passes < 1 or g.draw_pass_1 == null:
		_add(g, "no_draw_pass", "error", "draw_pass_1 has no mesh: nothing is drawn")
		return
	var mesh: Mesh = g.draw_pass_1
	var mat: Material = g.material_override if g.material_override else mesh.surface_get_material(0)
	var std := mat as BaseMaterial3D
	var is_trail_mesh := mesh is RibbonTrailMesh or mesh is TubeTrailMesh

	if pm:
		var uses_color := pm.color_ramp != null or pm.color_initial_ramp != null or pm.alpha_curve != null \
				or not pm.color.is_equal_approx(Color.WHITE)
		if std:
			if uses_color and not std.vertex_color_use_as_albedo:
				_add(g, "vertex_color_off", "error", "colour/alpha from the process material is ignored: set vertex_color_use_as_albedo on the draw material (Godotneers cZ5Ang_Ji8E, Brackeys htRjt505sPg)")
			if (pm.alpha_curve != null or _ramp_has_alpha(pm)) and std.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED:
				_add(g, "opaque_with_alpha", "warn", "alpha fades but the material is opaque: set transparency (alpha or additive blend)")
			if pm.scale_curve != null and std.billboard_mode == BaseMaterial3D.BILLBOARD_PARTICLES and not std.billboard_keep_scale:
				_add(g, "keep_scale_off", "error", "scale_curve is ignored by a particle billboard unless billboard_keep_scale is on (Godotneers cZ5Ang_Ji8E)")
			if (pm.angle_min != 0.0 or pm.angle_max != 0.0) and std.billboard_mode == BaseMaterial3D.BILLBOARD_ENABLED:
				_add(g, "angle_lost", "warn", "angle is set but billboard_mode ENABLED discards particle rotation: use BILLBOARD_PARTICLES [added]")
			if g.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF and (std.shading_mode == BaseMaterial3D.SHADING_MODE_UNSHADED or std.blend_mode == BaseMaterial3D.BLEND_MODE_ADD):
				_add(g, "shadow_on_glow", "warn", "an unshaded/additive emitter casts shadows: turn cast_shadow off [added]")
		elif g.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF:
			_add(g, "shadow_on_fx", "info", "cast_shadow is on: effects rarely need it [added]")
		if pm.turbulence_enabled and tier != "high":
			_add(g, "turbulence_mobile", "warn", "turbulence is expensive on mobile and web (ParticleProcessMaterial docs, Godotneers)")
		_check_collision(g, pm, colliders, fps_assumed, totals)
		_check_reach(g, pm)
		_check_sub_emitter(g, pm, root, totals)
		if _has_hdr(pm) and tier == "low":
			_add(g, "hdr_on_compat", "warn", "colours above 1.0 clamp in Compatibility (RGBA8 LDR buffer, renderers docs): the glow look changes")
	elif g.process_material is ShaderMaterial:
		_add(g, "particle_shader", "info", "custom particle shader: CPUParticles conversion cannot carry it")

	if g.trail_enabled:
		totals.trails += 1
		if not is_trail_mesh:
			_add(g, "trail_mesh", "error", "trail_enabled but draw mesh is not a RibbonTrailMesh or TubeTrailMesh (3D particle trails docs)")
		var trail_mat_ok := false
		if std:
			trail_mat_ok = std.use_particle_trails
		elif mat is ShaderMaterial and (mat as ShaderMaterial).shader:
			trail_mat_ok = (mat as ShaderMaterial).shader.code.contains("particle_trails")
		if not trail_mat_ok:
			_add(g, "trail_material", "error", "trail mesh material needs use_particle_trails (or render_mode particle_trails): otherwise the ribbon is drawn flat at the particle")
		if tier == "low":
			_add(g, "trail_on_compat", "error", "particle trails are not supported in Compatibility (renderers docs): drop the trail or use a mesh/Line3D fallback")
	elif is_trail_mesh:
		_add(g, "trail_mesh_unused", "warn", "trail mesh without trail_enabled: draws one stretched section")

	if g.one_shot and g.preprocess > 0.0:
		_add(g, "preprocess_one_shot", "warn", "preprocess on a one-shot burst skips its first %.2f s (the flash and peak)" % g.preprocess)
	if g.amount_ratio < 1.0:
		_add(g, "amount_ratio", "info", "amount_ratio %.2f hides particles but the GPU still processes `amount` (GPUParticles3D docs): lower amount per tier" % g.amount_ratio)
	if g.process_material is ParticleProcessMaterial and g.speed_scale <= 0.0:
		_add(g, "speed_zero", "warn", "speed_scale 0: the emitter is frozen")


func _check_collision(g: GPUParticles3D, pm: ParticleProcessMaterial, colliders: Array, fps_assumed: int, totals: Dictionary) -> void:
	if pm.collision_mode == ParticleProcessMaterial.COLLISION_DISABLED:
		return
	totals.collision += 1
	if colliders.is_empty():
		_add(g, "no_collider", "warn", "collision_mode is set but no GPUParticlesCollision3D node exists (pass level=): particles ignore physics bodies (Godotneers cZ5Ang_Ji8E)")
	var fps := g.fixed_fps if g.fixed_fps > 0 else fps_assumed
	var v_max := pm.initial_velocity_max + pm.gravity.length() * g.lifetime
	var step := v_max / maxf(1.0, float(fps))
	var thin := INF
	for c in colliders:
		if c is GPUParticlesCollisionBox3D:
			var s: Vector3 = (c as GPUParticlesCollisionBox3D).size
			thin = minf(thin, minf(s.x, minf(s.y, s.z)))
		if c is GPUParticlesCollisionSDF3D and tier == "low":
			_add(g, "sdf_on_compat", "error", "SDF particle collision is not supported in Compatibility (renderers docs)")
	if thin < INF and step > thin * 0.5:
		_add(g, "tunnelling", "warn", "worst step %.3f m per tick (v %.1f m/s / %d fps) exceeds half the thinnest collider (%.2f m): raise fixed_fps or thicken the collider (Godotneers cZ5Ang_Ji8E 00:47:17)" % [step, v_max, fps, thin])
	if g.collision_base_size <= 0.0101 and _draw_size(g) > 0.05:
		_add(g, "collision_base_size", "warn", "collision_base_size is the 0.01 default while the quad is %.2f m: particles sink into surfaces" % _draw_size(g))
	if g.fixed_fps == 0:
		_add(g, "collision_no_fixed_fps", "info", "fixed_fps 0: collision quality follows the frame rate")


func _check_reach(g: GPUParticles3D, pm: ParticleProcessMaterial) -> void:
	if g.local_coords and g.trail_enabled:
		return
	var reach := pm.initial_velocity_max * g.lifetime + 0.5 * pm.gravity.length() * g.lifetime * g.lifetime
	reach += _emission_extent(pm) + _draw_size(g) * 0.5 * (pm.scale_max if pm.scale_curve == null else pm.scale_max * _curve_max(pm.scale_curve))
	if g.visibility_aabb.is_equal_approx(DEFAULT_AABB) and reach > 4.0:
		_add(g, "default_aabb", "warn", "visibility_aabb is the default 8 m box but particles can reach %.1f m: they pop out and stop colliding outside it (GPUParticles3D docs, Godotneers)" % reach)


func _check_sub_emitter(g: GPUParticles3D, pm: ParticleProcessMaterial, root: Node, totals: Dictionary) -> void:
	if pm.sub_emitter_mode == ParticleProcessMaterial.SUB_EMITTER_DISABLED:
		return
	totals.sub_emitters += 1
	var child := g.get_node_or_null(g.sub_emitter) as GPUParticles3D
	if child == null:
		_add(g, "sub_emitter_missing", "error", "sub_emitter_mode is set but sub_emitter does not point at a GPUParticles3D")
		return
	var need := 0
	match pm.sub_emitter_mode:
		ParticleProcessMaterial.SUB_EMITTER_CONSTANT:
			need = int(ceil(g.amount * pm.sub_emitter_frequency * child.lifetime))
		ParticleProcessMaterial.SUB_EMITTER_AT_END:
			need = g.amount * pm.sub_emitter_amount_at_end
		ParticleProcessMaterial.SUB_EMITTER_AT_COLLISION:
			need = g.amount * pm.sub_emitter_amount_at_collision
		_:
			if "sub_emitter_amount_at_start" in pm:
				need = g.amount * int(pm.get("sub_emitter_amount_at_start"))
	if child.amount < need:
		_add(child, "sub_emitter_cap", "warn", "child amount %d < %d needed by %s: the child's amount is a global cap, emissions are dropped (Godotneers yKoGuBGZatY 00:44:48)" % [child.amount, need, g.name])
	var pa: AABB = g.visibility_aabb
	if not child.visibility_aabb.encloses(pa):
		_add(child, "sub_emitter_aabb", "warn", "child visibility_aabb does not enclose the parent's: child particles spawned far out are culled [added]")
	if pm.sub_emitter_mode == ParticleProcessMaterial.SUB_EMITTER_AT_COLLISION and pm.collision_mode == ParticleProcessMaterial.COLLISION_DISABLED:
		_add(g, "sub_at_collision_no_collision", "error", "AT_COLLISION sub-emitter without collision_mode: never fires")
	if tier == "low":
		_add(g, "sub_emitter_on_compat", "warn", "sub-emitters rely on GPU emit_particle, not available in Compatibility (GPUParticles3D docs): see P5 for what renders")


# ---------------------------------------------------------------- 2D and CPU

func _check_2d(g: GPUParticles2D) -> void:
	if g.process_material == null:
		_add(g, "no_process_material", "error", "no process_material")
	if g.texture == null:
		_add(g, "no_texture_2d", "info", "no texture: draws 1 px squares")
	var pm := g.process_material as ParticleProcessMaterial
	if pm:
		var reach := pm.initial_velocity_max * g.lifetime + 0.5 * pm.gravity.length() * g.lifetime * g.lifetime
		if g.visibility_rect.is_equal_approx(DEFAULT_RECT) and reach > 100.0:
			_add(g, "default_rect", "warn", "visibility_rect is the default 200 px box but particles reach %.0f px" % reach)
		if g.trail_enabled and tier == "low":
			_add(g, "trail_on_compat", "error", "particle trails are not supported in Compatibility")
		if pm.turbulence_enabled and tier != "high":
			_add(g, "turbulence_mobile", "warn", "turbulence is expensive on mobile and web")


func _check_cpu(e: Node) -> void:
	if e.amount > 500:
		_add(e, "cpu_amount", "warn", "CPUParticles with %d particles: CPU cost grows with amount [added]" % e.amount)


func _check_nodes(root: Node, totals: Dictionary) -> void:
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is Light3D:
			totals.lights += 1
			if (n as Light3D).shadow_enabled:
				_add(n, "light_shadow", "warn", "effect light casts shadows: a flash light lives 0.1 to 0.3 s, shadows cost a shadow map pass [added]")
		if n is Decal:
			totals.decals += 1
			if tier == "low":
				_add(n, "decal_on_compat", "error", "decals are not supported in Compatibility (renderers docs)")
		if n is GeometryInstance3D and not (n is GPUParticles3D) and n.material_override is BaseMaterial3D:
			var m := n.material_override as BaseMaterial3D
			if m.proximity_fade_enabled and tier != "high":
				_add(n, "proximity_fade_mobile", "info", "proximity fade reads the depth buffer: costly on mobile [added]")
		if n is GPUParticles3D:
			var mesh: Mesh = (n as GPUParticles3D).draw_pass_1
			if mesh and mesh.surface_get_material(0) is BaseMaterial3D:
				var pm3 := mesh.surface_get_material(0) as BaseMaterial3D
				if pm3.proximity_fade_enabled and tier != "high":
					_add(n, "proximity_fade_mobile", "info", "proximity fade reads the depth buffer: costly on mobile [added]")


# ---------------------------------------------------------------- helpers

func _colliders(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is GPUParticlesCollision3D:
			out.append(n)
		for c in n.get_children():
			stack.append(c)
	return out


func _draw_size(g: GPUParticles3D) -> float:
	var m: Mesh = g.draw_pass_1
	if m is QuadMesh:
		return maxf((m as QuadMesh).size.x, (m as QuadMesh).size.y)
	if m is PlaneMesh:
		return maxf((m as PlaneMesh).size.x, (m as PlaneMesh).size.y)
	if m:
		var a := m.get_aabb()
		return maxf(a.size.x, maxf(a.size.y, a.size.z))
	return 0.0


func _emission_extent(pm: ParticleProcessMaterial) -> float:
	match pm.emission_shape:
		ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE:
			return pm.emission_sphere_radius
		ParticleProcessMaterial.EMISSION_SHAPE_BOX:
			return pm.emission_box_extents.length()
	return 0.0


func _curve_max(t: Texture2D) -> float:
	var c: Curve = t.curve if t is CurveTexture else null
	if c == null:
		return 1.0
	var mx := 0.0
	for i in c.point_count:
		mx = maxf(mx, c.get_point_position(i).y)
	return mx


func _ramp_has_alpha(pm: ParticleProcessMaterial) -> bool:
	var gt := pm.color_ramp as GradientTexture1D
	if gt == null or gt.gradient == null:
		return pm.color.a < 1.0
	for c in gt.gradient.colors:
		if c.a < 0.999:
			return true
	return false


func _has_hdr(pm: ParticleProcessMaterial) -> bool:
	var cols: Array = [pm.color]
	var gt := pm.color_ramp as GradientTexture1D
	if gt and gt.gradient:
		cols.append_array(Array(gt.gradient.colors))
	for c in cols:
		if c.r > 1.0 or c.g > 1.0 or c.b > 1.0:
			return true
	return false
