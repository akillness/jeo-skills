extends RefCounted
## scenario-godot-performance-export 0.1 (Godot 4.7.2): offline cost audit of a scene (no rendering, runs
## headless). It counts what usually costs frame time and returns flags, each with a fix and the
## teammate who owns the fix. Counts are facts; thresholds are heuristics marked [added].
##
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_audit.gd:scene", {"scene": "res://level.tscn"})
##
## Flags: {id, severity (high|medium|low), count, what, fix, owner}.

const REPEAT_MIN := 32           # same mesh this many times: MultiMesh candidate [added]
const UNIQUE_MAT_MIN := 64       # this many materials on one mesh: auto-instancing broken [added]
const SHADOWED_POSITIONAL_MAX := 4   # shadowed omni/spot lights visible at once [added]
const LABEL3D_MAX := 50          # Label3D cost shows up as renderer time (Blackshaw, grdqHJOL5F4)
const PROCESS_NODES_MAX := 300   # nodes with their own _process/_physics_process [added]
const MESHES_NO_RANGE_MAX := 1000  # meshes without visibility range in one scene [added]


static func _walk(n: Node, out: Array) -> void:
	out.append(n)
	for c in n.get_children():
		_walk(c, out)


static func _script_methods(n: Node) -> Array:
	var s: Script = n.get_script()
	if s == null:
		return []
	var names: Array = []
	for m in s.get_script_method_list():
		names.append(m.get("name", ""))
	return names


static func _materials(mi: MeshInstance3D) -> Array:
	var out: Array = []
	if mi.material_override:
		out.append(mi.material_override)
		return out
	if mi.mesh == null:
		return out
	for i in mi.mesh.get_surface_count():
		var m := mi.get_surface_override_material(i)
		if m == null:
			m = mi.mesh.surface_get_material(i)
		if m:
			out.append(m)
	return out


func scene(job) -> Dictionary:
	var path: String = job.arg("scene", "")
	if path == "":
		path = str(ProjectSettings.get_setting("application/run/main_scene", ""))
	if path == "" or not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var t0 := Time.get_ticks_usec()
	var root: Node = (load(path) as PackedScene).instantiate()
	var instantiate_ms := float(Time.get_ticks_usec() - t0) / 1000.0
	var r := audit_node(root, job.arg("repeat_min", REPEAT_MIN))
	root.free()
	r["scene"] = path
	r["instantiate_ms"] = instantiate_ms
	return r


## The audit itself, usable from any job on a node that is not in the tree (nothing runs).
static func audit_node(root: Node, repeat_min: int = REPEAT_MIN) -> Dictionary:
	var nodes: Array = []
	_walk(root, nodes)
	var by_class := {}
	var mesh_groups := {}       # mesh id -> {count, materials: {id: true}, name}
	var materials := {}
	var transparent := 0
	var shader_materials := 0
	var lights := {"directional": 0, "omni": 0, "spot": 0, "shadowed_positional": 0, "unfaded_shadowed": 0, "dynamic_bake": 0}
	var process_nodes := 0
	var physics_process_nodes := 0
	var meshes := 0
	var meshes_no_range := 0
	var multimesh_instances := 0
	var particles_amount := 0
	var skeletons := 0
	var enablers := 0
	var occluders := 0
	var lightmap_gi := 0
	var areas_on_bodies := 0
	var env_features: Array = []
	var probes_always := 0
	for n in nodes:
		var cls: String = n.get_class()
		by_class[cls] = by_class.get(cls, 0) + 1
		var methods := _script_methods(n)
		if "_process" in methods:
			process_nodes += 1
		if "_physics_process" in methods:
			physics_process_nodes += 1
		if n is MeshInstance3D:
			meshes += 1
			if n.visibility_range_end == 0.0:
				meshes_no_range += 1
			if n.mesh:
				var key: int = n.mesh.get_instance_id()
				if not mesh_groups.has(key):
					mesh_groups[key] = {"count": 0, "materials": {}, "example": str(n.name), "mesh": n.mesh.get_class()}
				mesh_groups[key]["count"] += 1
				for m in _materials(n):
					mesh_groups[key]["materials"][m.get_instance_id()] = true
			for m in _materials(n):
				if not materials.has(m.get_instance_id()):
					materials[m.get_instance_id()] = true
					if m is BaseMaterial3D and m.transparency in [BaseMaterial3D.TRANSPARENCY_ALPHA, BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS]:
						transparent += 1
					elif m is ShaderMaterial:
						shader_materials += 1
		elif n is MultiMeshInstance3D and n.multimesh:
			multimesh_instances += n.multimesh.instance_count
		if n is DirectionalLight3D:
			lights["directional"] += 1
		elif n is OmniLight3D or n is SpotLight3D:
			lights["omni" if n is OmniLight3D else "spot"] += 1
			if n.shadow_enabled:
				lights["shadowed_positional"] += 1
				if not n.distance_fade_enabled:
					lights["unfaded_shadowed"] += 1
			if n.light_bake_mode == Light3D.BAKE_DYNAMIC:
				lights["dynamic_bake"] += 1
		if n is GPUParticles3D or n is GPUParticles2D or n is CPUParticles3D or n is CPUParticles2D:
			particles_amount += int(n.amount)
		if n is Skeleton3D:
			skeletons += 1
		if n is VisibleOnScreenEnabler3D or n is VisibleOnScreenNotifier3D:
			enablers += 1
		if n is OccluderInstance3D:
			occluders += 1
		if n is LightmapGI:
			lightmap_gi += 1
		if n is ReflectionProbe and n.update_mode == ReflectionProbe.UPDATE_ALWAYS:
			probes_always += 1
		if (n is CharacterBody3D or n is CharacterBody2D) :
			for c in n.get_children():
				if c is Area3D or c is Area2D:
					areas_on_bodies += 1
		if n is WorldEnvironment and n.environment:
			var e: Environment = n.environment
			for f in [["sdfgi", e.sdfgi_enabled], ["ssr", e.ssr_enabled], ["ssao", e.ssao_enabled], ["ssil", e.ssil_enabled],
					["volumetric_fog", e.volumetric_fog_enabled], ["glow", e.glow_enabled]]:
				if f[1]:
					env_features.append(f[0])
	var repeats: Array = []
	var unique_mat_groups: Array = []
	for k in mesh_groups:
		var g: Dictionary = mesh_groups[k]
		if g["count"] >= repeat_min:
			repeats.append({"mesh": g["mesh"], "example": g["example"], "count": g["count"], "materials": g["materials"].size()})
			if g["materials"].size() >= mini(UNIQUE_MAT_MIN, g["count"]):
				unique_mat_groups.append({"mesh": g["mesh"], "example": g["example"], "count": g["count"], "materials": g["materials"].size()})
	repeats.sort_custom(func(a, b): return a["count"] > b["count"])
	var flags: Array = []
	var occl_on: bool = ProjectSettings.get_setting("rendering/occlusion_culling/use_occlusion_culling", false)
	var method := str(ProjectSettings.get_setting("rendering/renderer/rendering_method", ""))
	if not unique_mat_groups.is_empty():
		var c := 0
		for g in unique_mat_groups:
			c += g["count"]
		flags.append(_flag("unique_materials", "high", c,
				"%d mesh group(s) where (almost) every instance has its own material: one draw call each, Forward+ auto-instancing cannot batch them" % unique_mat_groups.size(),
				"share one material per look (perf_fixes share_materials), or MultiMesh with per-instance color", "scenario-godot-performance-export"))
	if not repeats.is_empty():
		var c2 := 0
		for g in repeats:
			c2 += g["count"]
		flags.append(_flag("multimesh_candidates", "medium" if method == "forward_plus" else "high", c2,
				"%d mesh(es) repeated >= %d times as separate nodes (auto-instancing is Forward+ only, opaque or alpha-tested)" % [repeats.size(), repeat_min],
				"MultiMeshInstance3D for static or shader-animated repeats (perf_fixes multimesh); keep nodes only for interactive ones", "scenario-godot-performance-export"))
	if process_nodes + physics_process_nodes > PROCESS_NODES_MAX:
		flags.append(_flag("per_node_process", "high", process_nodes + physics_process_nodes,
				"%d nodes run their own _process/_physics_process" % (process_nodes + physics_process_nodes),
				"one manager loop, a shader, or staggered timers with random phase (Dan Does Dev); measure process_ms before and after", "scenario-godot-gameplay"))
	if lights["shadowed_positional"] > SHADOWED_POSITIONAL_MAX:
		flags.append(_flag("shadowed_lights", "high", lights["shadowed_positional"],
				"%d shadowed omni/spot lights (each re-renders shadow casters)" % lights["shadowed_positional"],
				"shadow budget (perf_fixes shadow_budget): shadows on the few lights that matter, distance fade on all", "scenario-godot-rendering-lighting"))
	if lights["unfaded_shadowed"] > 0:
		flags.append(_flag("no_distance_fade", "low", lights["unfaded_shadowed"], "shadowed lights without distance fade",
				"Light3D.distance_fade_enabled with begin/length per light", "scenario-godot-rendering-lighting"))
	if lightmap_gi > 0 and lights["dynamic_bake"] > 0:
		flags.append(_flag("dynamic_lights_with_lightmaps", "medium", lights["dynamic_bake"],
				"omni/spot lights left on Bake Mode Dynamic in a lightmapped scene",
				"Bake Mode Static on omni/spot, keep the DirectionalLight3D Dynamic (docs, Optimizing 3D performance)", "scenario-godot-rendering-lighting"))
	if transparent > 16:
		flags.append(_flag("transparent_materials", "medium", transparent, "alpha-blended materials (sorted back to front, never batched)",
				"alpha scissor or hash where possible; split small transparent parts into their own surface", "scenario-godot-shaders"))
	var labels: int = by_class.get("Label3D", 0)
	if labels > LABEL3D_MAX:
		flags.append(_flag("label3d", "medium", labels, "Label3D nodes (cost hides in renderer and scene-tree time)",
				"TextMesh or one shared-font text system (Blackshaw)", "scenario-godot-ui"))
	if meshes > MESHES_NO_RANGE_MAX and meshes_no_range > MESHES_NO_RANGE_MAX:
		flags.append(_flag("no_visibility_range", "medium", meshes_no_range, "meshes with no visibility range in a large scene",
				"visibility_range_end on small props (perf_fixes visibility_range), mesh LOD on imported meshes", "scenario-godot-3d-world"))
	if meshes > MESHES_NO_RANGE_MAX and occluders == 0:
		flags.append(_flag("no_occluders", "low", meshes, "large scene without OccluderInstance3D" + ("" if occl_on else " and occlusion culling off"),
				"enable rendering/occlusion_culling/use_occlusion_culling and add box occluders to big walls (perf_fixes box_occluders); judge by objects drawn from several cameras", "scenario-godot-performance-export"))
	if skeletons > 8 and enablers == 0:
		flags.append(_flag("skinned_offscreen", "medium", skeletons, "skinned characters with no VisibleOnScreenEnabler3D",
				"pause or throttle animation off screen", "scenario-godot-animation"))
	if areas_on_bodies > 50:
		flags.append(_flag("hurtbox_areas", "medium", areas_on_bodies, "Area nodes on character bodies (one physics object more each)",
				"let the attack Area detect bodies and drop the hurtbox (Deep Dive Dev)", "scenario-godot-gameplay"))
	if probes_always > 0:
		flags.append(_flag("probe_update_always", "medium", probes_always, "ReflectionProbe with update mode Always",
				"update mode Once", "scenario-godot-rendering-lighting"))
	if not env_features.is_empty():
		flags.append(_flag("costly_environment", "low", env_features.size(), "environment effects on: " + ", ".join(env_features),
				"quality tiers: measure each effect's GPU ms, set laptop and phone defaults", "scenario-godot-rendering-lighting"))
	if particles_amount > 20000:
		flags.append(_flag("particles", "medium", particles_amount, "total particle amount", "cap amounts per tier, visibility ranges on emitters", "scenario-godot-vfx"))
	var high := 0
	for f in flags:
		if f["severity"] == "high":
			high += 1
	return {
		"ok": true,
		"nodes": nodes.size(),
		"by_class": by_class,
		"meshes": meshes,
		"unique_meshes": mesh_groups.size(),
		"materials": materials.size(),
		"transparent_materials": transparent,
		"shader_materials": shader_materials,
		"repeats": repeats.slice(0, 10),
		"multimesh_instances": multimesh_instances,
		"process_nodes": process_nodes,
		"physics_process_nodes": physics_process_nodes,
		"lights": lights,
		"occluders": occluders,
		"occlusion_culling_setting": occl_on,
		"renderer": method,
		"environment_features": env_features,
		"flags": flags,
		"high_flags": high,
	}


static func _flag(id: String, severity: String, count: int, what: String, fix: String, owner: String) -> Dictionary:
	return {"id": id, "severity": severity, "count": count, "what": what, "fix": fix, "owner": owner}
