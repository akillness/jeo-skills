extends RefCounted
## scenario-godot-vfx 0.1 (Godot 4.7.2): build particle effects from plain dictionaries, no inspector.
##
## Copied to res://addons/agentkit/vfx/ by gd_vfx.install(project). Use from any job:
##   const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")
##   var p: GPUParticles3D = VB.emitter({"name": "Sparks", "amount": 24, "lifetime": 0.6,
##       "pm": {"spread": 180.0, "initial_velocity_min": 3.0},
##       "draw": {"mesh": "quad", "size": [0.04, 0.3], "blend": "add", "billboard": "particles"}})
##
## Rules this file enforces (each was a silent failure in the sources and in live tests):
## - vertex_color_use_as_albedo is always on, or color_ramp / alpha_curve / emission_curve do nothing
##   (Brackeys htRjt505sPg 00:12:26, Godotneers cZ5Ang_Ji8E 00:09:44).
## - billboard_keep_scale is on for billboards, or scale curves do nothing (Brackeys 00:23:44).
## - GradientTexture1D.use_hdr is set when any colour channel is above 1, or the ramp clamps to 1 [added, live test T3].
## - Curve min/max are widened to the points (Curve enforces its range since 4.4, deltas section 4.4).
## - trail meshes get use_particle_trails on their material (GPUParticles3D docs).
## - unknown property names are push_error'd, so a typo fails the job instead of doing nothing.

const BLEND := {"mix": BaseMaterial3D.BLEND_MODE_MIX, "add": BaseMaterial3D.BLEND_MODE_ADD,
		"premult": BaseMaterial3D.BLEND_MODE_PREMULT_ALPHA, "sub": BaseMaterial3D.BLEND_MODE_SUB}
const BILLBOARD := {"disabled": BaseMaterial3D.BILLBOARD_DISABLED, "enabled": BaseMaterial3D.BILLBOARD_ENABLED,
		"y": BaseMaterial3D.BILLBOARD_FIXED_Y, "particles": BaseMaterial3D.BILLBOARD_PARTICLES}
const ALIGN := {"disabled": GPUParticles3D.TRANSFORM_ALIGN_DISABLED, "z_billboard": GPUParticles3D.TRANSFORM_ALIGN_Z_BILLBOARD,
		"y_to_velocity": GPUParticles3D.TRANSFORM_ALIGN_Y_TO_VELOCITY,
		"z_billboard_y_to_velocity": GPUParticles3D.TRANSFORM_ALIGN_Z_BILLBOARD_Y_TO_VELOCITY}


# ------------------------------------------------------------------ resources

## Curve from [[t, v], ...]; the range is widened to the points (4.4+ clamps to min/max).
static func curve(points: Array) -> Curve:
	var c := Curve.new()
	var lo := 0.0
	var hi := 1.0
	for p in points:
		lo = minf(lo, float(p[1]))
		hi = maxf(hi, float(p[1]))
	c.min_value = lo
	c.max_value = hi
	for p in points:
		c.add_point(Vector2(float(p[0]), float(p[1])))
	return c


static func curve_tex(points: Array, width: int = 128) -> CurveTexture:
	var t := CurveTexture.new()
	t.width = width
	t.curve = curve(points)
	return t


## Gradient from [[offset, [r, g, b, a]], ...]. Values above 1 are HDR: use_hdr is then set on the texture.
static func gradient(stops: Array) -> Gradient:
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for s in stops:
		offs.append(float(s[0]))
		cols.append(to_color(s[1]))
	g.offsets = offs
	g.colors = cols
	return g


static func gradient_tex(stops: Array, width: int = 128) -> GradientTexture1D:
	var t := GradientTexture1D.new()
	t.width = width
	t.gradient = gradient(stops)
	for s in stops:
		var c := to_color(s[1])
		if c.r > 1.0 or c.g > 1.0 or c.b > 1.0:
			t.use_hdr = true
	return t


## Radial texture: "dot" (soft disc), "ring" (shockwave), "hard" (crisp disc), or custom stops.
static func radial_tex(kind: String = "dot", size: int = 64, stops: Array = []) -> GradientTexture2D:
	var t := GradientTexture2D.new()
	t.width = size
	t.height = size
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(0.5, 0.0)
	var st: Array = stops
	if st.is_empty():
		match kind:
			"ring":
				st = [[0.0, [1, 1, 1, 0]], [0.62, [1, 1, 1, 0]], [0.84, [1, 1, 1, 1]], [1.0, [1, 1, 1, 0]]]
			"hard":
				st = [[0.0, [1, 1, 1, 1]], [0.8, [1, 1, 1, 1]], [1.0, [1, 1, 1, 0]]]
			_:
				st = [[0.0, [1, 1, 1, 1]], [0.35, [1, 1, 1, 0.55]], [1.0, [1, 1, 1, 0]]]
	t.gradient = gradient(st)
	return t


## Tileable noise texture (FastNoiseLite). Generated on a worker thread: wait a few frames before a capture.
static func noise_tex(size: int = 128, frequency: float = 0.03, seed_value: int = 7) -> NoiseTexture2D:
	var n := FastNoiseLite.new()
	n.seed = seed_value
	n.frequency = frequency
	n.fractal_octaves = 4
	var t := NoiseTexture2D.new()
	t.width = size
	t.height = size
	t.seamless = true
	t.noise = n
	return t


static func to_color(v: Variant) -> Color:
	if v is Color:
		return v
	if v is Array:
		var a: Array = v
		return Color(float(a[0]), float(a[1]), float(a[2]), float(a[3]) if a.size() > 3 else 1.0)
	if v is String:
		return Color(v)
	return Color.WHITE


## Set properties from a dictionary. Arrays become Vector2/3, Color or AABB from the current type;
## [[t, v], ...] on a *_curve property becomes a CurveTexture; [[t, [r,g,b,a]], ...] on a *_ramp
## property becomes a GradientTexture1D. Unknown names push_error.
static func apply(obj: Object, props: Dictionary) -> void:
	for k in props:
		var key: String = str(k)
		if not (key in obj):
			push_error("vfx_build.apply: %s has no property '%s'" % [obj.get_class(), key])
			continue
		obj.set(key, convert_value(obj.get(key), props[k], key))


static func convert_value(current: Variant, v: Variant, key: String = "") -> Variant:
	if v is Array:
		var a: Array = v
		if (key.ends_with("_curve") or key.ends_with("curve")) and not a.is_empty() and a[0] is Array:
			return curve_tex(a)
		if key.ends_with("_ramp") and not a.is_empty() and a[0] is Array:
			return gradient_tex(a)
		match typeof(current):
			TYPE_VECTOR2:
				return Vector2(float(a[0]), float(a[1]))
			TYPE_VECTOR2I:
				return Vector2i(int(a[0]), int(a[1]))
			TYPE_VECTOR3:
				return Vector3(float(a[0]), float(a[1]), float(a[2]))
			TYPE_COLOR:
				return to_color(a)
			TYPE_AABB:
				return AABB(Vector3(float(a[0]), float(a[1]), float(a[2])), Vector3(float(a[3]), float(a[4]), float(a[5])))
	if typeof(current) == TYPE_FLOAT and (v is int):
		return float(v)
	return v


# ------------------------------------------------------------------ materials and meshes

## Draw material for particle meshes. d keys: blend (add, mix, premult), unshaded (true), billboard
## (particles, enabled, y, disabled), texture (Texture2D), color ([r,g,b,a], HDR allowed), cull_disabled (true),
## trails (false), proximity_fade (0 = off, else distance in m), render_priority (0), flipbook ([h, v]).
static func particle_material(d: Dictionary) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BLEND.get(str(d.get("blend", "add")), BaseMaterial3D.BLEND_MODE_ADD)
	if bool(d.get("unshaded", true)):
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED if bool(d.get("cull_disabled", true)) else BaseMaterial3D.CULL_BACK
	var bb: int = BILLBOARD.get(str(d.get("billboard", "particles")), BaseMaterial3D.BILLBOARD_PARTICLES)
	m.billboard_mode = bb
	if bb != BaseMaterial3D.BILLBOARD_DISABLED:
		m.billboard_keep_scale = true
	if d.has("texture") and d["texture"] != null:
		m.albedo_texture = d["texture"]
	if d.has("color"):
		m.albedo_color = to_color(d["color"])
	m.use_particle_trails = bool(d.get("trails", false))
	var pf: float = float(d.get("proximity_fade", 0.0))
	if pf > 0.0:
		m.proximity_fade_enabled = true
		m.proximity_fade_distance = pf
	m.render_priority = int(d.get("render_priority", 0))
	if d.has("flipbook"):
		var fb: Array = d["flipbook"]
		m.particles_anim_h_frames = int(fb[0])
		m.particles_anim_v_frames = int(fb[1])
		m.particles_anim_loop = bool(d.get("flipbook_loop", false))
	m.disable_receive_shadows = true
	return m


## Mesh for a draw pass. d keys: mesh (quad, quad_y, ribbon, ribbon_flat, tube, sphere), size ([w, h]),
## sections (8), section_length (0.2), section_segments (3), taper ([[t, w], ...] width over the trail).
static func draw_mesh(d: Dictionary, mat: Material) -> Mesh:
	var kind: String = str(d.get("mesh", "quad"))
	var sz: Array = d.get("size", [0.5, 0.5])
	match kind:
		"ribbon", "ribbon_flat":
			var r := RibbonTrailMesh.new()
			r.shape = RibbonTrailMesh.SHAPE_FLAT if kind == "ribbon_flat" else RibbonTrailMesh.SHAPE_CROSS
			r.size = float(sz[0])
			r.sections = int(d.get("sections", 8))
			r.section_length = float(d.get("section_length", 0.2))
			r.section_segments = int(d.get("section_segments", 3))
			if d.has("taper"):
				r.curve = curve(d["taper"])
			r.material = mat
			return r
		"tube":
			var tb := TubeTrailMesh.new()
			tb.radius = float(sz[0]) * 0.5
			tb.sections = int(d.get("sections", 8))
			tb.section_length = float(d.get("section_length", 0.2))
			tb.section_rings = int(d.get("section_segments", 3))
			if d.has("taper"):
				tb.curve = curve(d["taper"])
			tb.material = mat
			return tb
		"sphere":
			var s := SphereMesh.new()
			s.radius = float(sz[0]) * 0.5
			s.height = float(sz[0])
			s.radial_segments = 12
			s.rings = 6
			s.material = mat
			return s
		_:
			var q := QuadMesh.new()
			q.size = Vector2(float(sz[0]), float(sz[1]))
			if kind == "quad_y":
				q.orientation = PlaneMesh.FACE_Y
			q.material = mat
			return q


# ------------------------------------------------------------------ emitters

## One GPUParticles3D from a spec:
##   name, amount, lifetime, one_shot, explosiveness, randomness, local_coords, fixed_fps, preprocess,
##   speed_scale, aabb [x, y, z, w, h, d], align (transform_align key), trail [lifetime] (enables trails),
##   draw_order ("index", "lifetime", "view_depth"), seed (int: fixed seed), sorting_offset,
##   pm: ParticleProcessMaterial properties (apply() rules), shader_process: res:// path of a particles shader
##   used instead (pm then sets its uniforms),
##   draw: particle_material() + draw_mesh() keys, or "material": a Material to use as is,
##   node: extra GPUParticles3D properties.
static func emitter(spec: Dictionary) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = str(spec.get("name", "Emitter"))
	p.amount = int(spec.get("amount", 16))
	p.lifetime = float(spec.get("lifetime", 1.0))
	p.one_shot = bool(spec.get("one_shot", false))
	p.explosiveness = float(spec.get("explosiveness", 0.0))
	p.randomness = float(spec.get("randomness", 0.0))
	p.local_coords = bool(spec.get("local_coords", false))
	p.fixed_fps = int(spec.get("fixed_fps", 60))
	p.preprocess = float(spec.get("preprocess", 0.0))
	p.speed_scale = float(spec.get("speed_scale", 1.0))
	p.sorting_offset = float(spec.get("sorting_offset", 0.0))
	if spec.has("aabb"):
		var a: Array = spec["aabb"]
		p.visibility_aabb = AABB(Vector3(float(a[0]), float(a[1]), float(a[2])), Vector3(float(a[3]), float(a[4]), float(a[5])))
	if spec.has("seed"):
		p.use_fixed_seed = true
		p.seed = int(spec["seed"])
	if spec.has("align"):
		p.transform_align = ALIGN.get(str(spec["align"]), GPUParticles3D.TRANSFORM_ALIGN_DISABLED)
	match str(spec.get("draw_order", "index")):
		"lifetime":
			p.draw_order = GPUParticles3D.DRAW_ORDER_LIFETIME
		"view_depth":
			p.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
		"reverse_lifetime":
			p.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	if spec.has("shader_process"):
		var sm := ShaderMaterial.new()
		sm.shader = load(str(spec["shader_process"]))
		var u: Dictionary = spec.get("pm", {})
		for k in u:
			sm.set_shader_parameter(str(k), u[k])
		p.process_material = sm
	else:
		var pm := ParticleProcessMaterial.new()
		apply(pm, spec.get("pm", {}))
		p.process_material = pm
	var d: Dictionary = spec.get("draw", {})
	var mat: Material = d.get("material", null)
	if mat == null:
		var md := d.duplicate()
		if spec.has("trail"):
			md["trails"] = true
		mat = particle_material(md)
	p.draw_pass_1 = draw_mesh(d, mat)
	if spec.has("trail"):
		p.trail_enabled = true
		p.trail_lifetime = float(spec["trail"])
	apply(p, spec.get("node", {}))
	return p


## Point an emitter at a sub-emitter: copies the parent's visibility AABB (sub-emitters do not inherit it,
## Godotneers cZ5Ang_Ji8E 01:06:19) and raises the child's amount to the cap the parent needs
## (the child's amount is a global cap, Godotneers yKoGuBGZatY 00:44:48). Returns the cap used.
static func link_sub_emitter(parent: GPUParticles3D, child: GPUParticles3D, mode: int, per_event: int = 1,
		frequency_hz: float = 0.0) -> int:
	var pm := parent.process_material as ParticleProcessMaterial
	pm.sub_emitter_mode = mode
	var need := 0
	match mode:
		ParticleProcessMaterial.SUB_EMITTER_CONSTANT:
			pm.sub_emitter_frequency = frequency_hz
			need = int(ceil(parent.amount * frequency_hz * child.lifetime))
		ParticleProcessMaterial.SUB_EMITTER_AT_COLLISION:
			pm.sub_emitter_amount_at_collision = per_event
			need = parent.amount * per_event
		ParticleProcessMaterial.SUB_EMITTER_AT_END:
			pm.sub_emitter_amount_at_end = per_event
			need = parent.amount * per_event
		ParticleProcessMaterial.SUB_EMITTER_AT_START:
			pm.sub_emitter_amount_at_start = per_event
			need = parent.amount * per_event
	child.amount = maxi(child.amount, need)
	child.visibility_aabb = parent.visibility_aabb
	child.one_shot = false
	parent.sub_emitter = parent.get_path_to(child) if parent.is_inside_tree() and child.is_inside_tree() else NodePath("../" + str(child.name))
	return child.amount


## Convert every GPUParticles3D under root into a CPUParticles3D twin (Compatibility / low tier).
## Returns what the CPU twins lose (trails, collision, sub-emitters, particle shaders, turbulence).
static func to_cpu(root: Node) -> Dictionary:
	var converted: Array = []
	var lost: Array = []
	var stack: Array = [root]
	var gpus: Array = []
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is GPUParticles3D:
			gpus.append(n)
		for c in n.get_children():
			stack.append(c)
	for g in gpus:
		var gp := g as GPUParticles3D
		var cpu := CPUParticles3D.new()
		# 4.7.2: convert_from_particles copies draw_order as a raw int, but the enums differ (GPU VIEW_DEPTH = 3,
		# REVERSE_LIFETIME = 2; CPU VIEW_DEPTH = 2): "Index p_order = 3 is out of bounds" and the sort is lost.
		# Convert with INDEX, then map by name (live test V6).
		var order := gp.draw_order
		gp.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
		cpu.convert_from_particles(gp)
		gp.draw_order = order
		var why: Array = []
		match order:
			GPUParticles3D.DRAW_ORDER_LIFETIME:
				cpu.draw_order = CPUParticles3D.DRAW_ORDER_LIFETIME
			GPUParticles3D.DRAW_ORDER_VIEW_DEPTH:
				cpu.draw_order = CPUParticles3D.DRAW_ORDER_VIEW_DEPTH
			GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME:
				cpu.draw_order = CPUParticles3D.DRAW_ORDER_LIFETIME
				why.append("reverse_lifetime draw order (CPU has none: LIFETIME used)")
		if gp.transform_align != GPUParticles3D.TRANSFORM_ALIGN_DISABLED:
			# CPU has particle_flag_align_y only (no camera-facing variant): sparks keep their direction,
			# lose the billboard twist (live test V6: they rendered vertical without it)
			cpu.particle_flag_align_y = true
			why.append("transform_align (align_y used)")
		var keep_name := gp.name
		gp.name = str(keep_name) + "_gpu_old"     # free the name before the twin enters the tree
		cpu.name = keep_name
		cpu.transform = gp.transform
		if gp.trail_enabled:
			why.append("trail")
		if gp.sub_emitter != NodePath():
			why.append("sub_emitter")
		var pm := gp.process_material as ParticleProcessMaterial
		if pm == null:
			why.append("particle shader (no ParticleProcessMaterial)")
		else:
			if pm.collision_mode != ParticleProcessMaterial.COLLISION_DISABLED:
				why.append("collision")
			if pm.turbulence_enabled:
				why.append("turbulence")
			if pm.sub_emitter_mode != ParticleProcessMaterial.SUB_EMITTER_DISABLED:
				why.append("sub_emitter_mode")
			if pm.alpha_curve != null:
				# CPUParticles3D has no alpha_curve: bake it into the colour ramp (live test V6: the shockwave
				# ring stayed opaque without this)
				cpu.color_ramp = _bake_alpha(pm)
				why.append("alpha_curve (baked into color_ramp)")
			if pm.emission_curve != null:
				why.append("emission_curve")
		var parent := gp.get_parent()
		var idx := gp.get_index()
		parent.add_child(cpu)
		parent.move_child(cpu, idx)
		cpu.owner = gp.owner
		parent.remove_child(gp)
		gp.free()
		converted.append(str(cpu.name))
		if not why.is_empty():
			lost.append({"emitter": str(cpu.name), "lost": why})
	return {"converted": converted, "lost": lost}


static func _bake_alpha(pm: ParticleProcessMaterial) -> Gradient:
	var src: Gradient = (pm.color_ramp as GradientTexture1D).gradient if pm.color_ramp is GradientTexture1D else null
	var ac: Curve = (pm.alpha_curve as CurveTexture).curve if pm.alpha_curve is CurveTexture else null
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for i in 9:
		var t := i / 8.0
		var c: Color = src.sample(t) if src else Color.WHITE
		# pm.color is copied to cpu.color by convert_from_particles and multiplies the ramp: not baked here
		if ac:
			c.a *= ac.sample(t)
		offs.append(t)
		cols.append(c)
	g.offsets = offs
	g.colors = cols
	return g


## Restart every emitter under root (GPU and CPU). restart(), not emitting = true: a one-shot replayed
## right after `finished` can silently not restart (GPUParticles3D docs).
static func restart_all(root: Node, keep_seed: bool = false) -> int:
	var n := 0
	var stack: Array = [root]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		if x is GPUParticles3D:
			(x as GPUParticles3D).restart(keep_seed)
			n += 1
		elif x is CPUParticles3D:
			(x as CPUParticles3D).restart()
			n += 1
		elif x is GPUParticles2D:
			(x as GPUParticles2D).restart(keep_seed)
			n += 1
		elif x is CPUParticles2D:
			(x as CPUParticles2D).restart()
			n += 1
		for c in x.get_children():
			stack.append(c)
	return n


static func emitters(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		if x is GPUParticles3D or x is CPUParticles3D or x is GPUParticles2D or x is CPUParticles2D:
			out.append(x)
		for c in x.get_children():
			stack.append(c)
	return out
