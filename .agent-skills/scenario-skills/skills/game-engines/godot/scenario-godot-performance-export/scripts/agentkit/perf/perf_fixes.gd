extends RefCounted
## scenario-godot-performance-export 0.1 (Godot 4.7.2): scripted versions of the standard 3D fixes, each one
## change, so it can be measured alone. Static functions work on a scene root; the job methods load
## a scene, apply one fix and save it under a new name (never over the source).
##
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_fixes.gd:apply",
##       {"scene": "res://level.tscn", "out": "res://level_fix1.tscn", "fix": "share_materials"})
##
## fix: share_materials | multimesh | shadow_budget | box_occluders | visibility_range | strip_process
## The source scene is never overwritten: pass a new `out` (version before overwrite).

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


func apply(job) -> Dictionary:
	var src: String = job.arg("scene", "")
	var out: String = job.arg("out", "")
	var fix: String = job.arg("fix", "")
	if src == "" or out == "" or src == out:
		return {"ok": false, "error": "need scene and a different out path (never overwrite the source)"}
	if not ResourceLoader.exists(src):
		return {"ok": false, "error": "scene not found: " + src}
	var root: Node = (load(src) as PackedScene).instantiate()
	var r: Dictionary
	match fix:
		"share_materials":
			r = share_materials(root)
		"multimesh":
			r = to_multimesh(root, job.arg("min_count", 16), job.arg("shader", ""))
		"shadow_budget":
			r = shadow_budget(root, job.arg("max_shadowed", 4), job.arg("fade_begin", 30.0))
		"box_occluders":
			r = box_occluders(root, job.arg("min_size", 6.0), job.arg("shrink", 0.05))
		"visibility_range":
			r = visibility_range(root, job.arg("end", 40.0), job.arg("margin", 4.0), job.arg("max_size", 2.0))
		"strip_process":
			r = strip_process(root)
		_:
			root.free()
			return {"ok": false, "error": "unknown fix: " + fix}
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	r["ok"] = saved.get("ok", false) and r.get("ok", true)
	r["fix"] = fix
	r["saved"] = saved
	return r


static func _walk(n: Node, out: Array) -> void:
	out.append(n)
	for c in n.get_children():
		_walk(c, out)


static func _material_of(mi: MeshInstance3D) -> Material:
	if mi.material_override:
		return mi.material_override
	if mi.mesh and mi.mesh.get_surface_count() > 0:
		var m := mi.get_surface_override_material(0)
		return m if m else mi.mesh.surface_get_material(0)
	return null


## Signature of a StandardMaterial3D ignoring albedo color: materials that differ only by color can
## become one material plus per-instance color.
static func _sig(m: Material, ignore_color: bool) -> String:
	if m == null:
		return "none"
	if not (m is StandardMaterial3D):
		return "id:%d" % m.get_instance_id()
	var s := m as StandardMaterial3D
	var parts := [s.transparency, s.shading_mode, snappedf(s.metallic, 0.01), snappedf(s.roughness, 0.01),
			s.albedo_texture.get_rid().get_id() if s.albedo_texture else 0, s.emission_enabled, s.rim_enabled,
			s.clearcoat_enabled, s.normal_enabled, s.cull_mode]
	if not ignore_color:
		parts.append(s.albedo_color.to_html())
	return str(parts)


## Fix 1: identical StandardMaterial3D settings become ONE shared material per signature. In Forward+
## that turns on automatic instancing for MeshInstance3D nodes sharing mesh and material (docs:
## Optimizing 3D performance). Colors are kept: each color becomes its own shared material.
static func share_materials(root: Node) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var shared := {}
	var before := {}
	var replaced := 0
	for n in nodes:
		if not (n is MeshInstance3D):
			continue
		var m := _material_of(n)
		if m == null:
			continue
		before[m.get_instance_id()] = true
		var key := _sig(m, false)
		if not shared.has(key):
			shared[key] = m
		elif shared[key] != m:
			n.material_override = shared[key]
			replaced += 1
	return {"ok": true, "materials_before": before.size(), "materials_after": shared.size(), "replaced": replaced}


## Fix 2: groups of >= min_count MeshInstance3D with the same mesh (and the same material apart from
## color) become one MultiMeshInstance3D. Per-instance color carries the old albedo; when `shader`
## is a res:// .gdshader path, the material is a ShaderMaterial (per-instance speed in custom data,
## from a "speed" property if the node had one). The original nodes are freed with their scripts,
## whose _process work the shader replaces. Physics, signals and per-node logic do NOT survive: keep
## real nodes for anything interactive (Firebelley keeps one thin node per card for input).
static func to_multimesh(root: Node, min_count: int = 16, shader_path: String = "") -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var groups := {}
	for n in nodes:
		if n is MeshInstance3D and n != root and n.mesh != null and n.get_child_count() == 0:
			var key := "%d|%s|%d" % [n.mesh.get_instance_id(), _sig(_material_of(n), true), n.get_parent().get_instance_id()]
			if not groups.has(key):
				groups[key] = []
			groups[key].append(n)
	var made: Array = []
	for key in groups:
		var g: Array = groups[key]
		if g.size() < min_count:
			continue
		var first: MeshInstance3D = g[0]
		var parent: Node = first.get_parent()
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = first.mesh
		mm.instance_count = g.size()
		var base_mat := _material_of(first)
		# Write the buffer directly: in a headless run (RenderingServer dummy) set_instance_transform,
		# set_instance_color and set_instance_custom_data are silently dropped and the saved .tscn has
		# no instance data; an assigned `buffer` is kept (observed 4.7.2).
		var stride := 12 + 4 + 4
		var buf := PackedFloat32Array()
		buf.resize(g.size() * stride)
		for i in g.size():
			var mi: MeshInstance3D = g[i]
			var col := Color.WHITE
			var m := _material_of(mi)
			if m is StandardMaterial3D:
				col = (m as StandardMaterial3D).albedo_color
			var spd = mi.get("speed")
			_pack(buf, i * stride, mi.transform, col, Color(float(spd) if spd != null else 0.0, 0, 0, 0))
		mm.buffer = buf
		var mmi := MultiMeshInstance3D.new()
		mmi.name = "%s_MultiMesh" % first.name.rstrip("0123456789")
		mmi.multimesh = mm
		if shader_path != "" and ResourceLoader.exists(shader_path):
			var sm := ShaderMaterial.new()
			sm.shader = load(shader_path)
			mmi.material_override = sm
		else:
			var mat: StandardMaterial3D = (base_mat as StandardMaterial3D).duplicate() if base_mat is StandardMaterial3D else StandardMaterial3D.new()
			mat.vertex_color_use_as_albedo = true      # instance color arrives as COLOR
			mat.vertex_color_is_srgb = true             # albedo_color values are sRGB (paler cubes otherwise, seen)
			mat.albedo_color = Color.WHITE
			mmi.material_override = mat
		parent.add_child(mmi)
		for mi in g:
			parent.remove_child(mi)
			mi.free()
		made.append({"name": str(mmi.name), "instances": mm.instance_count, "mesh": mm.mesh.get_class()})
	return {"ok": true, "multimeshes": made, "groups_seen": groups.size()}


## MultiMesh.buffer layout for TRANSFORM_3D (+ colors + custom data): 12 floats per transform,
## row by row (basis.x.x, basis.y.x, basis.z.x, origin.x, then .y, then .z), then RGBA, then custom.
static func _pack(buf: PackedFloat32Array, o: int, t: Transform3D, col: Color, custom: Color) -> void:
	var b := t.basis
	var v := [b.x.x, b.y.x, b.z.x, t.origin.x, b.x.y, b.y.y, b.z.y, t.origin.y, b.x.z, b.y.z, b.z.z, t.origin.z,
			col.r, col.g, col.b, col.a, custom.r, custom.g, custom.b, custom.a]
	for k in v.size():
		buf[o + k] = v[k]


## Fix 3: keep shadows on the `max_shadowed` lights with the largest range, turn them off on the
## rest, and fade every positional light out with distance. Omni shadows render the scene several
## times per light; this is the usual first GPU lever [added: order]. Art direction may veto it.
static func shadow_budget(root: Node, max_shadowed: int = 4, fade_begin: float = 30.0) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var lights: Array = []
	for n in nodes:
		if (n is OmniLight3D or n is SpotLight3D) and n.shadow_enabled:
			lights.append(n)
	lights.sort_custom(func(a, b): return _light_range(a) > _light_range(b))
	var off := 0
	for i in lights.size():
		var l: Light3D = lights[i]
		if i >= max_shadowed:
			l.shadow_enabled = false
			off += 1
		l.distance_fade_enabled = true
		l.distance_fade_begin = fade_begin
		l.distance_fade_length = 10.0
	return {"ok": true, "shadowed_before": lights.size(), "shadowed_after": lights.size() - off}


static func _light_range(l: Light3D) -> float:
	return l.omni_range if l is OmniLight3D else (l as SpotLight3D).spot_range


## Fix 4: one OccluderInstance3D with a BoxOccluder3D per large MeshInstance3D (walls, buildings),
## sized from its local AABB and shrunk by `shrink` so it stays conservative. Zenva measured
## hand-sized boxes beating a whole-scene bake (VBiBZBVxu1s). Needs
## rendering/occlusion_culling/use_occlusion_culling=true.
static func box_occluders(root: Node, min_size: float = 6.0, shrink: float = 0.05) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var made := 0
	for n in nodes:
		if not (n is MeshInstance3D) or n.mesh == null:
			continue
		var bb: AABB = n.mesh.get_aabb()
		if bb.size.x < min_size and bb.size.y < min_size and bb.size.z < min_size:
			continue
		if n.has_node("Occluder"):
			continue
		var occ := OccluderInstance3D.new()
		occ.name = "Occluder"
		var box := BoxOccluder3D.new()
		box.size = bb.size * (1.0 - shrink)
		occ.occluder = box
		occ.position = bb.get_center()
		n.add_child(occ)
		made += 1
	return {"ok": true, "occluders": made}


## Fix 5: small props (largest AABB side <= max_size) stop drawing past `end` meters
## (GeometryInstance3D.visibility_range_end, the HLOD tool of the 3D optimization docs).
static func visibility_range(root: Node, end: float = 40.0, margin: float = 4.0, max_size: float = 2.0) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var set_n := 0
	for n in nodes:
		if n is GeometryInstance3D and n is MeshInstance3D and n.mesh != null:
			var bb: AABB = n.mesh.get_aabb()
			if max(bb.size.x, max(bb.size.y, bb.size.z)) <= max_size and n.visibility_range_end == 0.0:
				n.visibility_range_end = end
				n.visibility_range_end_margin = margin
				n.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
				set_n += 1
	return {"ok": true, "nodes_with_range": set_n, "end": end}


## Strip per-node scripts whose only job is _process work (measurement aid for bisecting, never a
## shipping fix by itself).
static func strip_process(root: Node) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var stripped := 0
	for n in nodes:
		var s: Script = n.get_script()
		if s and _script_has(s, "_process"):
			n.set_script(null)
			stripped += 1
	return {"ok": true, "stripped": stripped}


static func _script_has(s: Script, method: String) -> bool:
	for m in s.get_script_method_list():
		if m.get("name", "") == method:
			return true
	return false
