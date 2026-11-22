extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): renderer-aware lighting audit of one scene. Headless.
##
##   gd_run.run_script(P, kit("light_audit.gd:audit"), {"scene": "res://level.tscn", "targets": ["forward_plus", "mobile"]})
##
## targets default: the project's rendering_method plus its .mobile override (built-in default "mobile"),
## i.e. what the game uses on desktop and on phones. Each flag: {severity, code, message, nodes}.
## Limits and support come from the 4.7 renderer and lights docs; the ones checked live are marked in
## references/procedures.md (P5). Thresholds marked [added] are this skill's defaults.

## Features a renderer ignores (docs: renderers feature matrix, 4.7).
const UNSUPPORTED := {
	"mobile": ["sdfgi", "voxelgi", "ssil", "ssr", "volumetric_fog", "ssao", "taa", "fsr2", "pcss_directional"],
	"gl_compatibility": ["sdfgi", "voxelgi", "ssil", "ssr", "volumetric_fog", "taa", "fsr2", "compositor", "decal",
			"light_projector", "pcss_directional", "pcss_positional", "smaa_fxaa", "debanding", "dof"],
	"forward_plus": [],
}
const QUAD_SLOTS := [0, 1, 4, 16, 64, 256, 1024]   # positional atlas quadrant subdiv enum -> shadow slots


func audit(job) -> Dictionary:
	var scene_path: String = job.arg("scene", str(ProjectSettings.get_setting("application/run/main_scene", "")))
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var targets: Array = job.arg("targets", [])
	if targets.is_empty():
		targets = [str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "forward_plus"))]
		var mob := str(ProjectSettings.get_setting("rendering/renderer/rendering_method.mobile", "mobile"))
		if not targets.has(mob):
			targets.append(mob)
	var root: Node = (load(scene_path) as PackedScene).instantiate()
	job.root.add_child(root)
	await job.wait_frames(1)
	var r := inspect(root, targets)
	r["scene"] = scene_path
	root.queue_free()
	return r


func inspect(root: Node, targets: Array) -> Dictionary:
	var flags: Array = []
	var nodes := {"we": [], "lights": [], "meshes": [], "voxelgi": [], "lightmapgi": [], "probes": [], "decals": [], "cameras": [], "fogvol": []}
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		var kids := n.get_children()
		kids.reverse()
		stack.append_array(kids)          # pre-order: tree order, like the engine picks the first WorldEnvironment
		if n is WorldEnvironment: nodes["we"].append(n)
		elif n is Light3D: nodes["lights"].append(n)
		elif n is VoxelGI: nodes["voxelgi"].append(n)
		elif n is LightmapGI: nodes["lightmapgi"].append(n)
		elif n is ReflectionProbe: nodes["probes"].append(n)
		elif n is Decal: nodes["decals"].append(n)
		elif n is Camera3D: nodes["cameras"].append(n)
		elif n is FogVolume: nodes["fogvol"].append(n)
		if n is MeshInstance3D and (n as MeshInstance3D).mesh != null: nodes["meshes"].append(n)
	var P := func(x: Node) -> String: return str(root.get_path_to(x))

	# ---- environment
	var env: Environment = null
	if nodes["we"].size() == 0:
		flags.append(_f("warn", "no_world_environment", "no WorldEnvironment: the game renders the default clear color with no sky light (the editor preview sun and sky are editor-only)", []))
	elif nodes["we"].size() > 1:
		flags.append(_f("error", "multiple_world_environments", "only one WorldEnvironment is allowed per scene tree", nodes["we"].map(P)))
	for w: WorldEnvironment in nodes["we"]:
		if w.environment != null:
			env = w.environment
			break
	var features := {}
	var env_summary := {}
	if env:
		features["sdfgi"] = env.sdfgi_enabled
		features["ssil"] = env.ssil_enabled
		features["ssr"] = env.ssr_enabled
		features["ssao"] = env.ssao_enabled
		features["volumetric_fog"] = env.volumetric_fog_enabled
		env_summary = {"background_mode": env.background_mode, "sky_material": env.sky.sky_material.get_class() if env.sky and env.sky.sky_material else "",
				"ambient_source": env.ambient_light_source, "ambient_energy": env.ambient_light_energy,
				"tonemap": ["linear", "reinhard", "filmic", "aces", "agx"][env.tonemap_mode], "exposure": env.tonemap_exposure,
				"white": env.tonemap_white, "glow": env.glow_enabled, "glow_blend_mode": env.glow_blend_mode,
				"glow_hdr_threshold": env.glow_hdr_threshold, "glow_intensity": env.glow_intensity, "fog": env.fog_enabled,
				"volumetric_fog": env.volumetric_fog_enabled, "sdfgi": env.sdfgi_enabled, "ssao": env.ssao_enabled,
				"ssil": env.ssil_enabled, "ssr": env.ssr_enabled, "adjustments": env.adjustment_enabled}
		if env.sdfgi_enabled and env.sdfgi_bounce_feedback > 0.5:
			flags.append(_f("warn", "sdfgi_bounce_feedback_high", "sdfgi_bounce_feedback %.2f > 0.5 can run away to extreme brightness (class reference)" % env.sdfgi_bounce_feedback, []))
		if env.tonemap_mode == Environment.TONE_MAPPER_LINEAR:
			flags.append(_f("warn", "tonemap_linear", "Linear tonemap clips every value above 1.0 (lights, sky, emission): use AgX, ACES or Filmic", []))
	features["compositor"] = false
	for w: WorldEnvironment in nodes["we"]:
		if w.compositor != null and (w.compositor.compositor_effects as Array).size() > 0:
			features["compositor"] = true
	for cam in nodes["cameras"]:
		if (cam as Camera3D).compositor != null:
			features["compositor"] = true
	features["voxelgi"] = nodes["voxelgi"].size() > 0
	features["decal"] = nodes["decals"].size() > 0
	if features.get("sdfgi", false) and features["voxelgi"]:
		flags.append(_f("warn", "sdfgi_and_voxelgi", "SDFGI and VoxelGI both active: pick one (they stack and confuse the look)", nodes["voxelgi"].map(P)))
	if features.get("sdfgi", false):
		for cam in nodes["cameras"]:
			if env.sdfgi_max_distance > (cam as Camera3D).far:
				flags.append(_f("warn", "sdfgi_beyond_camera_far", "sdfgi_max_distance %.1f > camera far %.1f (docs: keep it below)" % [env.sdfgi_max_distance, (cam as Camera3D).far], [P.call(cam)]))

	# ---- lights
	var small_shadowed: Array = []
	var counts := {"directional": 0, "omni": 0, "spot": 0, "area": 0, "shadowed_directional": 0, "shadowed_positional": 0, "pcss": 0, "projector": 0}
	for l: Light3D in nodes["lights"]:
		if l is DirectionalLight3D:
			counts["directional"] += 1
			if l.shadow_enabled and l.visible:
				counts["shadowed_directional"] += 1
			if l.light_angular_distance > 0.0:
				counts["pcss"] += 1
				features["pcss_directional"] = true
		else:
			var kind := "omni" if l is OmniLight3D else ("spot" if l is SpotLight3D else "area")
			counts[kind] += 1
			if l.shadow_enabled and l.visible:
				counts["shadowed_positional"] += 1
			if l.light_size > 0.0 and not (l.get_class() == "AreaLight3D"):
				counts["pcss"] += 1
				features["pcss_positional"] = true
			if l is SpotLight3D and l.shadow_enabled and (l as SpotLight3D).spot_angle > 89.0:
				flags.append(_f("warn", "spot_shadow_wide", "spot_angle %.0f > 89 with shadows: spot shadows stop working, use an OmniLight3D" % (l as SpotLight3D).spot_angle, [P.call(l)]))
			if l is OmniLight3D and l.shadow_enabled and (l as OmniLight3D).omni_range < 2.0:
				small_shadowed.append(P.call(l))
		if l.light_projector != null:
			counts["projector"] += 1
			features["light_projector"] = true
	if not small_shadowed.is_empty():
		flags.append(_f("info", "small_omni_shadowed", "shadowed omni lights with range < 2 m: candle-like lights usually go without shadows (Brackeys) [added threshold]", small_shadowed))
	if counts["shadowed_directional"] > 1:
		flags.append(_f("warn", "multiple_shadowed_directionals", "%d shadowed DirectionalLight3D share one atlas, each loses resolution" % counts["shadowed_directional"], []))
	var slots := 0
	for q in 4:
		var sub := int(ProjectSettings.get_setting("rendering/lights_and_shadows/positional_shadow/atlas_quadrant_%d_subdiv" % q, 2))
		slots += QUAD_SLOTS[clampi(sub, 0, 6)]
	if counts["shadowed_positional"] > slots:
		flags.append(_f("error", "shadow_atlas_full", "%d shadowed omni/spot lights, positional atlas holds %d: extra lights lose shadows" % [counts["shadowed_positional"], slots], []))
	if counts["pcss"] > 4:
		flags.append(_f("warn", "many_pcss_lights", "%d PCSS lights (light_size / angular_distance > 0): docs advise a handful; give players an off switch [added threshold 4]" % counts["pcss"], []))
	var clustered: int = counts["omni"] + counts["spot"] + nodes["decals"].size() + nodes["probes"].size()
	var max_cl := int(ProjectSettings.get_setting("rendering/limits/cluster_builder/max_clustered_elements", 512))
	if clustered > max_cl:
		flags.append(_f("warn", "clustered_elements", "%d omni+spot+decal+probe in the scene vs %d clustered elements per view (Forward+)" % [clustered, max_cl], []))
	if counts["area"] > 0 and targets.has("forward_plus"):
		flags.append(_f("info", "area_light_forward_plus", "a visible AreaLight3D in Forward+ costs on every rendered object (docs)", []))

	# ---- per-mesh light limits (Mobile 8 omni + 8 spot, Compatibility max_lights_per_object)
	var per_mesh_over := {"mobile": [], "gl_compatibility": []}
	var compat_max := int(ProjectSettings.get_setting("rendering/limits/opengl/max_lights_per_object", 8))
	var emissive: Array = []
	var dynamic_under_sdfgi: Array = []
	var no_uv2: Array = []
	for m: MeshInstance3D in nodes["meshes"]:
		if not m.visible:
			continue
		var box: AABB = m.global_transform * m.get_aabb()
		var o := 0
		var s := 0
		for l: Light3D in nodes["lights"]:
			if not l.visible:
				continue
			if l is OmniLight3D and _sphere_hits(l.global_position, (l as OmniLight3D).omni_range, box):
				o += 1
			elif l is SpotLight3D and _sphere_hits(l.global_position, (l as SpotLight3D).spot_range, box):
				s += 1
		if o > 8 or s > 8:
			per_mesh_over["mobile"].append("%s (%d omni, %d spot)" % [P.call(m), o, s])
		if o + s > compat_max:
			per_mesh_over["gl_compatibility"].append("%s (%d lights)" % [P.call(m), o + s])
		if m.gi_mode == GeometryInstance3D.GI_MODE_DYNAMIC and features.get("sdfgi", false):
			dynamic_under_sdfgi.append(P.call(m))
		if nodes["lightmapgi"].size() > 0 and m.gi_mode == GeometryInstance3D.GI_MODE_STATIC and not _has_uv2(m.mesh):
			no_uv2.append(P.call(m))
		for si in m.mesh.get_surface_count():
			var mat := m.get_active_material(si)
			if mat is BaseMaterial3D and (mat as BaseMaterial3D).emission_enabled:
				emissive.append({"node": P.call(m), "surface": si, "energy": (mat as BaseMaterial3D).emission_energy_multiplier})
	for t in ["mobile", "gl_compatibility"]:
		if targets.has(t) and not per_mesh_over[t].is_empty():
			flags.append(_f("error", "lights_per_mesh_" + t, "meshes reached by more lights than %s draws per mesh (excess lights pop or vanish): split the mesh, bake, or add distance fade" % t, per_mesh_over[t]))
	if not dynamic_under_sdfgi.is_empty():
		flags.append(_f("warn", "dynamic_mesh_under_sdfgi", "gi_mode Dynamic acts exactly like Disabled under SDFGI: these meshes bounce no light", dynamic_under_sdfgi))
	if env and not emissive.is_empty() and not env.glow_enabled:
		flags.append(_f("info", "emissive_without_glow", "emissive surfaces but glow is off: emission reads as flat colour (and lights nothing without GI)", emissive.map(func(e): return e["node"])))
	if env and env.glow_enabled and not emissive.is_empty():
		var top := 0.0
		for e in emissive:
			top = maxf(top, e["energy"])
		env_summary["max_emission_energy"] = top

	# ---- GI nodes
	for v: VoxelGI in nodes["voxelgi"]:
		if v.data == null:
			flags.append(_f("error", "voxelgi_no_data", "VoxelGI without baked data renders nothing (bake windowed: gi_bake.gd:voxelgi)", [P.call(v)]))
	if nodes["lightmapgi"].size() > 8:
		flags.append(_f("warn", "lightmapgi_over_8", "more than 8 LightmapGI visible at once flicker (docs)", nodes["lightmapgi"].map(P)))
	for lm: LightmapGI in nodes["lightmapgi"]:
		if lm.light_data == null:
			flags.append(_f("error", "lightmap_no_data", "LightmapGI has no baked data (bake: gi_bake.gd:lightmap, editor route)", [P.call(lm)]))
		elif not lm.light_data.resource_path.ends_with(".lmbake"):
			flags.append(_f("warn", "lightmap_data_embedded", "light data is embedded in the scene file: save it as an external .lmbake (docs)", [P.call(lm)]))
		for l: Light3D in nodes["lights"]:
			if not l.visible and l.light_bake_mode != Light3D.BAKE_DISABLED:
				flags.append(_f("warn", "hidden_light_baked", "hidden light with bake mode not Disabled is still baked (docs)", [P.call(l)]))
	if not no_uv2.is_empty():
		flags.append(_f("error", "static_mesh_without_uv2", "GI-static meshes without UV2 cannot be lightmapped (import Light Baking = Static Lightmaps, or add_uv2 on primitives)", no_uv2))

	# ---- renderer support
	var used: Array = []
	for k in features:
		if features[k]:
			used.append(k)
	for t: String in targets:
		var bad: Array = []
		for k in used:
			if UNSUPPORTED.get(t, []).has(k):
				bad.append(k)
		if not bad.is_empty():
			var sev := "error" if t == targets[0] else "warn"
			flags.append(_f(sev, "unsupported_on_" + t, "%s: %s ignored (only a one-line WARNING at load, observed 4.7.2): tune a separate tier so the look holds" % [t, ", ".join(bad)], bad))

	var by_sev := {"error": 0, "warn": 0, "info": 0}
	for f in flags:
		by_sev[f["severity"]] += 1
	return {"ok": true, "targets": targets, "features_used": used, "environment": env_summary, "lights": counts,
			"meshes": nodes["meshes"].size(), "voxelgi": nodes["voxelgi"].size(), "lightmapgi": nodes["lightmapgi"].size(),
			"reflection_probes": nodes["probes"].size(), "emissive_surfaces": emissive.size(), "positional_shadow_slots": slots,
			"flags": flags, "by_severity": by_sev}


func _f(sev: String, code: String, msg: String, where: Array) -> Dictionary:
	return {"severity": sev, "code": code, "message": msg, "nodes": where}


func _sphere_hits(c: Vector3, r: float, b: AABB) -> bool:
	var q := Vector3(clampf(c.x, b.position.x, b.end.x), clampf(c.y, b.position.y, b.end.y), clampf(c.z, b.position.z, b.end.z))
	return q.distance_to(c) <= r


func _has_uv2(m: Mesh) -> bool:
	if m is PrimitiveMesh:
		return (m as PrimitiveMesh).add_uv2
	if m is ArrayMesh:
		for s in m.get_surface_count():
			if ((m as ArrayMesh).surface_get_format(s) & Mesh.ARRAY_FORMAT_TEX_UV2) == 0:
				return false
		return m.get_surface_count() > 0
	return true
