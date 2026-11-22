extends RefCounted
## scenario-godot-vfx 0.1 (Godot 4.7.2): the G4 fireball kit, built in code, per quality tier.
##   tier "high"   Forward+ desktop: every layer, ribbon trail, sub-emitter debris, collision, decal, light
##   tier "mobile" Mobile renderer: about 60% of the particles, no debris/sub-emitter, no turbulence
##   tier "low"    Compatibility (web, old GLES3 phones): no trails, no decal, no light, about 40% of the particles
## Job use (see procedures.md P1):
##   const VR = preload("res://addons/agentkit/vfx/vfx_recipes.gd")
##   var r: Dictionary = VR.build_all(job, "high")      # saves res://vfx/fireball_high.tscn and friends

const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")
const AgentBuild = preload("res://addons/agentkit/agent_build.gd")

const SH := "res://vfx/shaders/"
const RT := "res://vfx/runtime/"
const TEX := "res://vfx/tex/"
const TIER_SCALE := {"high": 1.0, "mobile": 0.6, "low": 0.4}


## Shared textures live in res://vfx/tex/*.tres, so effect scenes reference one file instead of
## embedding a copy each (Brackeys htRjt505sPg 00:15:04: never make the texture unique).
static func shared_tex(tex_name: String) -> Texture2D:
	var path := TEX + tex_name + ".tres"
	if ResourceLoader.exists(path):
		return load(path)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(TEX))
	var t: Texture2D
	match tex_name:
		"noise":
			t = VB.noise_tex(128, 0.045, 11)
		"noise_fine":
			t = VB.noise_tex(128, 0.09, 23)
		"ring":
			t = VB.radial_tex("ring", 128)
		"scorch":
			t = VB.radial_tex("dot", 128, [[0.0, [0.03, 0.02, 0.015, 0.85]], [0.55, [0.04, 0.03, 0.02, 0.6]], [1.0, [0.05, 0.04, 0.03, 0.0]]])
		"trail_fade":
			var g := GradientTexture2D.new()
			g.width = 8
			g.height = 64
			g.fill_from = Vector2(0.5, 0.0)
			g.fill_to = Vector2(0.5, 1.0)
			g.gradient = VB.gradient([[0.0, [1, 1, 1, 0]], [0.35, [1, 1, 1, 0.7]], [1.0, [1, 1, 1, 1]]])
			t = g
		_:
			t = VB.radial_tex("dot", 64)
	var err := ResourceSaver.save(t, path)
	if err != OK:
		push_error("shared_tex: cannot save " + path)
		return t
	return load(path)


static func erode_material(blend: String, noise_name: String = "noise") -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(SH + ("fx_erode_add.gdshader" if blend == "add" else "fx_erode_mix.gdshader"))
	m.set_shader_parameter("noise_tex", shared_tex(noise_name))
	m.set_shader_parameter("mask_tex", shared_tex("dot"))
	return m


static func n(base: int, tier: String) -> int:
	return maxi(1, int(round(base * float(TIER_SCALE.get(tier, 1.0)))))


# ------------------------------------------------------------------ projectile

## Fireball projectile: head (shader mesh), core, flame and spark tails (world space), ribbon (not on low),
## light (not on low). Root script: res://vfx/runtime/fx_projectile.gd. Flies along -Z.
static func fireball(tier: String = "high", speed: float = 14.0) -> Node3D:
	var root := Node3D.new()
	root.name = "Fireball"
	root.set_script(load(RT + "fx_projectile.gd"))
	root.set("speed", speed)

	var head := MeshInstance3D.new()
	head.name = "Head"
	var sm := SphereMesh.new()
	sm.radius = 0.25
	sm.height = 0.5
	sm.radial_segments = 24
	sm.rings = 12
	head.mesh = sm
	head.rotation_degrees = Vector3(-90, 0, 0)      # +Y pole (UV.y = 0) points forward, along -Z
	head.scale = Vector3(1.0, 1.8, 1.0)             # stretched along the flight axis
	head.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var hm := ShaderMaterial.new()
	hm.shader = load(SH + "fx_fire_head.gdshader")
	hm.set_shader_parameter("noise_tex", shared_tex("noise_fine"))
	hm.render_priority = 2
	head.material_override = hm
	root.add_child(head)

	var core := MeshInstance3D.new()
	core.name = "Core"
	var cs := SphereMesh.new()
	cs.radius = 0.15
	cs.height = 0.3
	core.mesh = cs
	core.position = Vector3(0, 0, -0.08)
	core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var cm := ShaderMaterial.new()
	cm.shader = load(SH + "fx_soft_core.gdshader")
	cm.render_priority = 1
	core.material_override = cm
	root.add_child(core)

	var tail_len := speed * 0.5 + 2.0    # world-space particles trail behind: keep them inside the AABB [added]
	var flames := VB.emitter({
		"name": "Flames", "amount": n(40, tier), "lifetime": 0.35, "fixed_fps": 60,
		"aabb": [-1.5, -1.5, -1.0, 3.0, 3.0, tail_len],
		"pm": {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, "emission_sphere_radius": 0.14,
			"direction": [0, 0, 1], "spread": 20.0, "initial_velocity_min": 0.4, "initial_velocity_max": 1.4,
			"gravity": [0, 0.6, 0], "damping_min": 1.0, "damping_max": 2.0,
			"scale_min": 0.6, "scale_max": 1.0, "scale_curve": [[0.0, 0.7], [0.2, 1.0], [1.0, 0.25]],
			"angle_min": 0.0, "angle_max": 360.0,
			"color_ramp": [[0.0, [3.0, 2.0, 0.9, 1.0]], [0.3, [2.2, 0.8, 0.15, 0.9]], [0.7, [0.9, 0.18, 0.04, 0.5]], [1.0, [0.3, 0.05, 0.02, 0.0]]]},
		"draw": {"mesh": "quad", "size": [0.6, 0.6], "material": erode_material("add")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF}})
	root.add_child(flames)

	var sparks := VB.emitter({
		"name": "Sparks", "amount": n(16, tier), "lifetime": 0.3, "fixed_fps": 60, "align": "z_billboard_y_to_velocity",
		"aabb": [-1.5, -1.5, -1.0, 3.0, 3.0, tail_len],
		"pm": {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE, "emission_sphere_radius": 0.2,
			"direction": [0, 0, 1], "spread": 35.0, "initial_velocity_min": 3.0, "initial_velocity_max": 8.0,
			"radial_velocity_min": 1.0, "radial_velocity_max": 2.0, "gravity": [0, 0, 0],
			"scale_min": 1.0, "scale_max": 1.5, "scale_curve": [[0.0, 1.0], [1.0, 0.0]],
			"color": [2.0, 1.3, 0.5, 1.0]},
		"draw": {"mesh": "quad", "size": [0.035, 0.22], "blend": "add", "billboard": "disabled", "texture": shared_tex("dot")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF}})
	root.add_child(sparks)

	if tier != "low":
		var ribbon := VB.emitter({
			"name": "Ribbon", "amount": 1, "lifetime": 8.0, "fixed_fps": 60, "trail": 0.22,
			"shader_process": SH + "fx_trail_follow.gdshader", "pm": {"color": Color(2.4, 1.0, 0.25, 1.0)},
			"aabb": [-1.5, -1.5, -1.0, 3.0, 3.0, tail_len],
			"draw": {"mesh": "ribbon", "size": [0.34, 0.34], "sections": 12, "section_length": 0.06, "section_segments": 2,
				"taper": [[0.0, 0.05], [1.0, 1.0]], "blend": "add", "billboard": "disabled", "texture": shared_tex("trail_fade")},
			"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF}})
		ribbon.set_meta("fx_linger", 0.3)       # the head is pinned: after a hit the ribbon collapses in trail_lifetime
		root.add_child(ribbon)
		var light := OmniLight3D.new()
		light.name = "Light"
		light.light_color = Color(1.0, 0.55, 0.2)
		light.light_energy = 2.0
		light.omni_range = 4.0
		light.shadow_enabled = false
		root.add_child(light)
	return root


# ------------------------------------------------------------------ impact / explosion

## One-shot burst, +Y along the surface normal. size 1.0 = explosion, 0.4 = small impact.
static func burst(tier: String = "high", size: float = 1.0) -> Node3D:
	var root := Node3D.new()
	root.name = "Explosion" if size >= 0.75 else "Impact"
	root.set_script(load(RT + "fx_burst.gd"))
	var s := size
	var big := [-8.0 * s, -1.0, -8.0 * s, 16.0 * s, 9.0 * s, 16.0 * s]
	# Boxes from gd_vfx.fit_aabb on the high explosion in the stage (procedures P4), rounded up.
	var mid := [-4.8 * s, -4.0 * s, -4.8 * s, 9.6 * s, 9.0 * s, 9.6 * s]
	var smoke_box := [-8.5 * s, -7.5 * s, -8.5 * s, 17.0 * s, 17.5 * s, 17.0 * s]
	var shadow_off := {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF}

	root.add_child(VB.emitter({
		"name": "Flash", "amount": 1, "lifetime": 0.12, "one_shot": true, "explosiveness": 1.0, "aabb": mid,
		"pm": {"gravity": [0, 0, 0], "initial_velocity_min": 0.0, "initial_velocity_max": 0.0,
			"scale_curve": [[0.0, 0.5], [0.25, 1.0], [1.0, 0.0]], "color": [2.4, 1.7, 1.0, 0.9]},
		"draw": {"mesh": "quad", "size": [2.0 * s, 2.0 * s], "blend": "add", "texture": shared_tex("dot")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "position": [0.0, 0.9 * s, 0.0]}}))

	root.add_child(VB.emitter({
		"name": "Fire", "amount": n(24, tier), "lifetime": 0.7, "one_shot": true, "explosiveness": 0.95, "aabb": mid,
		"pm": {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, "emission_sphere_radius": 0.25 * s,
			"direction": [0, 1, 0], "spread": 180.0, "initial_velocity_min": 2.0 * s, "initial_velocity_max": 4.5 * s,
			"damping_min": 5.0, "damping_max": 7.0, "gravity": [0, 1.5, 0], "lifetime_randomness": 0.35,
			"scale_min": 0.7, "scale_max": 1.3, "scale_curve": [[0.0, 0.4], [0.15, 1.0], [1.0, 0.6]],
			"angle_min": 0.0, "angle_max": 360.0,
			"color_ramp": [[0.0, [2.4, 1.3, 0.45, 0.8]], [0.2, [1.8, 0.6, 0.1, 0.75]], [0.55, [0.8, 0.16, 0.03, 0.55]], [1.0, [0.1, 0.02, 0.01, 0.0]]]},
		"draw": {"mesh": "quad", "size": [2.0 * s, 2.0 * s], "material": erode_material("add")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "position": [0.0, 0.5 * s, 0.0]}}))

	root.add_child(VB.emitter({
		"name": "Smoke", "amount": n(14, tier), "lifetime": 1.8, "one_shot": true, "explosiveness": 0.9, "aabb": smoke_box,
		"draw_order": "view_depth",
		"pm": {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, "emission_sphere_radius": 0.35 * s,
			"direction": [0, 1, 0], "spread": 70.0, "initial_velocity_min": 1.0 * s, "initial_velocity_max": 2.5 * s,
			"damping_min": 1.5, "damping_max": 2.5, "gravity": [0, 0.9, 0], "lifetime_randomness": 0.3,
			"scale_min": 0.8, "scale_max": 1.4, "scale_curve": [[0.0, 0.5], [1.0, 2.2]],
			"angle_min": 0.0, "angle_max": 360.0,
			"color_ramp": _smoke_ramp(tier)},
		"draw": {"mesh": "quad", "size": [2.2 * s, 2.2 * s], "material": erode_material("mix")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "position": [0.0, 0.7 * s, 0.0]}}))

	var spark_pm := {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, "emission_sphere_radius": 0.1 * s,
		"direction": [0, 1, 0], "spread": 75.0, "initial_velocity_min": 5.0 * s, "initial_velocity_max": 11.0 * s,
		"gravity": [0, -9.8, 0], "damping_min": 0.3, "damping_max": 0.6, "lifetime_randomness": 0.5,
		"scale_curve": [[0.0, 1.0], [0.7, 0.8], [1.0, 0.0]],
		"color_ramp": [[0.0, [3.0, 1.8, 0.6, 1.0]], [0.6, [2.0, 0.6, 0.1, 1.0]], [1.0, [0.8, 0.1, 0.02, 0.0]]]}
	spark_pm["collision_mode"] = ParticleProcessMaterial.COLLISION_RIGID
	spark_pm["collision_bounce"] = 0.35
	spark_pm["collision_friction"] = 0.25
	root.add_child(VB.emitter({
		"name": "Sparks", "amount": n(40, tier), "lifetime": 0.9, "one_shot": true, "explosiveness": 1.0, "aabb": big,
		"align": "z_billboard_y_to_velocity",
		"pm": spark_pm,
		"draw": {"mesh": "quad", "size": [0.045 * s, 0.38 * s], "blend": "add", "billboard": "disabled", "texture": shared_tex("dot")},
		"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "collision_base_size": 0.05}}))

	root.add_child(VB.emitter({
		"name": "Shockwave", "amount": 1, "lifetime": 0.4, "one_shot": true, "explosiveness": 1.0, "aabb": mid,
		"local_coords": true,
		"pm": {"gravity": [0, 0, 0], "initial_velocity_min": 0.0, "initial_velocity_max": 0.0,
			"scale_curve": [[0.0, 0.2], [0.3, 3.0], [1.0, 4.5]], "alpha_curve": [[0.0, 1.0], [1.0, 0.0]],
			"color": [2.5, 1.6, 0.8, 0.8]},
		"draw": {"mesh": "quad_y", "size": [1.0 * s, 1.0 * s], "blend": "add", "billboard": "disabled", "texture": shared_tex("ring")},
		"node": shadow_off}))

	if tier == "high":
		var debris := VB.emitter({
			"name": "Debris", "amount": 8, "lifetime": 1.5, "one_shot": true, "explosiveness": 1.0, "aabb": big,
			"pm": {"direction": [0, 1, 0], "spread": 60.0, "initial_velocity_min": 4.0 * s, "initial_velocity_max": 8.0 * s,
				"gravity": [0, -9.8, 0], "collision_mode": ParticleProcessMaterial.COLLISION_RIGID, "collision_bounce": 0.3,
				"collision_friction": 0.4, "angle_min": 0.0, "angle_max": 360.0, "color": [0.12, 0.09, 0.07, 1.0]},
			"draw": {"mesh": "quad", "size": [0.16 * s, 0.16 * s], "blend": "mix", "texture": shared_tex("dot")},
			"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "collision_base_size": 0.12,
				"position": [0.0, 0.3 * s, 0.0]}})   # spawned inside the floor collider (base size 0.12 at y 0.05) they stuck [added]
		var trail := VB.emitter({
			"name": "DebrisSmoke", "amount": 1, "lifetime": 0.5, "aabb": big, "draw_order": "view_depth",
			"pm": {"gravity": [0, 0.5, 0], "initial_velocity_min": 0.0, "initial_velocity_max": 0.2,
				"scale_min": 0.6, "scale_max": 0.9, "scale_curve": [[0.0, 0.4], [1.0, 1.3]], "angle_min": 0.0, "angle_max": 360.0,
				"color_ramp": [[0.0, [0.08, 0.07, 0.065, 0.6]], [1.0, [0.04, 0.04, 0.04, 0.0]]]},
			"draw": {"mesh": "quad", "size": [0.35 * s, 0.35 * s], "material": erode_material("mix")},
			"node": shadow_off})
		root.add_child(debris)
		root.add_child(trail)
		VB.link_sub_emitter(debris, trail, ParticleProcessMaterial.SUB_EMITTER_CONSTANT, 1, 30.0)

	if tier != "low":
		var light := OmniLight3D.new()
		light.name = "FlashLight"
		light.light_color = Color(1.0, 0.6, 0.3)
		light.light_energy = 6.0
		light.omni_range = 5.0 * s
		light.shadow_enabled = false
		root.add_child(light)
		var decal := Decal.new()
		decal.name = "Scorch"
		decal.size = Vector3(2.6 * s, 1.0, 2.6 * s)
		decal.texture_albedo = shared_tex("scorch")
		decal.upper_fade = 0.3
		decal.lower_fade = 0.3
		root.add_child(decal)
	return root


## Smoke ramp. Fades in by 0.3 of its life so the fire reads first. On Compatibility the same values
## rendered near black on 2026-10-02 (Forward+ and Mobile showed mid grey), so the low tier is retuned
## by eye on that renderer (procedures P5) [added].
static func _smoke_ramp(tier: String) -> Array:
	var k := 3.6 if tier == "low" else 1.0
	return [[0.0, [0.07 * k, 0.06 * k, 0.055 * k, 0.0]], [0.3, [0.06 * k, 0.055 * k, 0.05 * k, 0.8]], [1.0, [0.035 * k, 0.035 * k, 0.035 * k, 0.0]]]


# ------------------------------------------------------------------ stage and shot

## Dark stage with glow, a floor and a target wall, both with particle colliders (particles ignore physics
## bodies: GPUParticlesCollision3D nodes are separate, Godotneers cZ5Ang_Ji8E 00:44:23).
static func stage() -> Node3D:
	var root := Node3D.new()
	root.name = "Stage"
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.035, 0.04, 0.055)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.3, 0.32, 0.38)
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.0
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Moon"
	sun.light_energy = 0.35
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var gray := StandardMaterial3D.new()
	gray.albedo_color = Color(0.2, 0.2, 0.22)
	_box(root, "Floor", Vector3(0, -0.1, -6), Vector3(40, 0.2, 40), gray)
	_box(root, "Wall", Vector3(0, 2.0, -12.25), Vector3(8, 4, 0.5), gray)
	var fc := GPUParticlesCollisionBox3D.new()
	fc.name = "FloorCollider"
	fc.size = Vector3(40, 2, 40)
	fc.position = Vector3(0, -1, -6)
	root.add_child(fc)
	var wc := GPUParticlesCollisionBox3D.new()
	wc.name = "WallCollider"
	wc.size = Vector3(8, 4, 1.0)
	wc.position = Vector3(0, 2.0, -12.25)
	root.add_child(wc)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.fov = 55.0
	root.add_child(cam)
	cam.position = Vector3(7.5, 2.6, -2.0)
	cam.look_at_from_position(cam.position, Vector3(0, 1.2, -8.0), Vector3.UP)
	cam.current = true
	var muzzle := Marker3D.new()
	muzzle.name = "Muzzle"
	muzzle.position = Vector3(0, 1.3, 0)
	root.add_child(muzzle)
	return root


static func _box(root: Node3D, nm: String, pos: Vector3, size: Vector3, mat: Material) -> void:
	var body := StaticBody3D.new()
	body.name = nm
	body.position = pos
	var mi := MeshInstance3D.new()
	mi.name = "Mesh"
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	body.add_child(mi)
	var cs := CollisionShape3D.new()
	cs.name = "Shape"
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	body.add_child(cs)
	root.add_child(body)


## Build and save the kit for one tier: res://vfx/explosion_<tier>.tscn, impact_<tier>.tscn,
## fireball_<tier>.tscn (impact_scene = the explosion), shot_<tier>.tscn (stage + fireball at the muzzle),
## burst_stage_<tier>.tscn (stage + an explosion on the floor, for timeline captures).
static func build_all(job, tier: String) -> Dictionary:
	var out := {}
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://vfx"))
	var ex := burst(tier, 1.0)
	out["explosion"] = AgentBuild.save_scene(ex, "res://vfx/explosion_%s.tscn" % tier)
	ex.free()
	var im := burst(tier, 0.4)
	out["impact"] = AgentBuild.save_scene(im, "res://vfx/impact_%s.tscn" % tier)
	im.free()
	var fb := fireball(tier)
	fb.set("impact_scene", load("res://vfx/explosion_%s.tscn" % tier))
	out["fireball"] = AgentBuild.save_scene(fb, "res://vfx/fireball_%s.tscn" % tier)
	fb.free()
	var st := stage()
	var shot := (load("res://vfx/fireball_%s.tscn" % tier) as PackedScene).instantiate() as Node3D
	shot.name = "Fireball"
	st.add_child(shot)
	shot.position = Vector3(0, 1.3, 0)
	out["shot"] = AgentBuild.save_scene(st, "res://vfx/shot_%s.tscn" % tier)
	st.free()
	var st2 := stage()
	var b := (load("res://vfx/explosion_%s.tscn" % tier) as PackedScene).instantiate() as Node3D
	b.name = "Explosion"
	b.set("autoplay", false)
	b.set("free_when_done", false)
	st2.add_child(b)
	b.position = Vector3(0, 0.05, -8.0)
	out["burst_stage"] = AgentBuild.save_scene(st2, "res://vfx/burst_stage_%s.tscn" % tier)
	st2.free()
	var ok := true
	for k in out:
		if not out[k].get("ok", false):
			ok = false
	return {"ok": ok, "tier": tier, "saved": out}
