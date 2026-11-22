extends RefCounted
## AgentKit audits (scenario-godot-expert 0.1, Godot 4.7.2). Each method takes the job and returns a Dictionary
## with "ok", the data, and "flags" (strings an agent should read before trusting the project).
##
##   gd_run.audit(project, "project")
##   gd_run.audit(project, "scene", scene="res://main.tscn")
##   gd_run.audit(project, "resources", root="res://")
##   gd_run.audit(project, "scripts", root="res://", exclude=["res://addons/"])
##   gd_run.audit(project, "imports")
##   gd_run.audit(project, "classdb", checks=["CharacterBody2D.move_and_slide", "Camera2D:zoom", "Button!pressed"])

const SETTINGS := [
	"application/run/main_scene",
	"application/config/features",
	"rendering/renderer/rendering_method",
	"rendering/renderer/rendering_method.mobile",
	"rendering/rendering_device/driver.macos",
	"rendering/rendering_device/driver.windows",
	"physics/3d/physics_engine",
	"physics/2d/physics_engine",
	"physics/common/physics_ticks_per_second",
	"physics/common/physics_interpolation",
	"physics/common/physics_jitter_fix",
	"display/window/size/viewport_width",
	"display/window/size/viewport_height",
	"display/window/stretch/mode",
	"display/window/stretch/aspect",
	"display/window/stretch/scale_mode",
	"display/window/vsync/vsync_mode",
	"application/run/max_fps",
	"rendering/textures/canvas_textures/default_texture_filter",
	"rendering/2d/snap/snap_2d_transforms_to_pixel",
	"rendering/2d/snap/snap_2d_vertices_to_pixel",
	"rendering/anti_aliasing/quality/msaa_3d",
	"rendering/anti_aliasing/quality/msaa_2d",
	"rendering/anti_aliasing/quality/screen_space_aa",
	"rendering/anti_aliasing/quality/use_taa",
	"rendering/scaling_3d/mode",
	"rendering/scaling_3d/scale",
	"rendering/textures/vram_compression/import_etc2_astc",
	"rendering/textures/vram_compression/import_s3tc_bptc",
	"rendering/lights_and_shadows/directional_shadow/size",
	"rendering/lights_and_shadows/positional_shadow/atlas_size",
	"rendering/global_illumination/gi/use_half_resolution",
	"rendering/environment/defaults/default_clear_color",
	"audio/driver/enable_input",
	"gui/theme/custom",
	"internationalization/locale/translations",
	"debug/gdscript/warnings/untyped_declaration",
	"debug/gdscript/warnings/inference_on_variant",
]


func project(job) -> Dictionary:
	var s := {}
	for k in SETTINGS:
		s[k] = ProjectSettings.get_setting(k, null)
	var autoloads := {}
	var actions: Array = []
	for p in ProjectSettings.get_property_list():
		var n: String = p["name"]
		if n.begins_with("autoload/"):
			autoloads[n.substr(9)] = ProjectSettings.get_setting(n)
		elif n.begins_with("input/") and not n.begins_with("input/ui_"):
			actions.append(n.substr(6))
	var flags: Array = []
	if str(s["physics/3d/physics_engine"]) in ["DEFAULT", "GodotPhysics3D"]:
		flags.append("3D physics is GodotPhysics3D (DEFAULT): projects made by the 4.6+ project manager use Jolt; set physics/3d/physics_engine=\"Jolt Physics\" unless intended")
	if str(s["display/window/stretch/mode"]) == "disabled":
		flags.append("stretch mode disabled: the UI will not scale with the window (4.7 new-project default is canvas_items/expand)")
	if str(s["application/run/main_scene"]) == "" or s["application/run/main_scene"] == null:
		flags.append("no main scene: exports and plain runs start nothing")
	elif not ResourceLoader.exists(str(s["application/run/main_scene"])):
		flags.append("main scene path does not exist: " + str(s["application/run/main_scene"]))
	var feats = s["application/config/features"]
	if feats is PackedStringArray and not ("4.7" in feats):
		flags.append("config/features lacks 4.7: project last saved by another Godot version " + str(feats))
	var cache_ok := FileAccess.file_exists("res://.godot/global_script_class_cache.cfg")
	if not cache_ok:
		flags.append("no .godot/global_script_class_cache.cfg: run --import before using class_name types headless")
	return {
		"ok": true,
		"settings": s,
		"autoloads": autoloads,
		"input_actions": actions,
		"class_cache": cache_ok,
		"export_presets": FileAccess.file_exists("res://export_presets.cfg"),
		"flags": flags,
	}


func scene(job) -> Dictionary:
	var path: String = job.arg("scene", "")
	if path == "":
		path = str(ProjectSettings.get_setting("application/run/main_scene", ""))
	if path == "" or not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var ps = load(path)
	if not (ps is PackedScene):
		return {"ok": false, "error": "not a PackedScene: " + path}
	var state: SceneState = ps.get_state()
	var inst: Node = ps.instantiate()
	job.root.add_child(inst)
	await job.process_frame
	var by_class := {}
	var scripts := {}
	var max_depth := 0
	var lights := {"directional": 0, "omni": 0, "spot": 0, "area": 0, "shadowed": 0, "light2d": 0}
	var meshes := {"instances": 0, "surfaces": 0, "no_material": [], "multimesh_instances": 0}
	var physics := {"bodies": 0, "areas": 0, "shapes": 0, "bodies_without_shape": []}
	var particles := {"emitters": 0, "amount_total": 0, "no_process_material": []}
	var cameras := {"2d": 0, "3d": 0, "current_3d": ""}
	var envs := 0
	var aabb := AABB()
	var has_aabb := false
	var stack: Array = [[inst, 0]]
	var total := 0
	while not stack.is_empty():
		var it: Array = stack.pop_back()
		var n: Node = it[0]
		var depth: int = it[1]
		total += 1
		max_depth = maxi(max_depth, depth)
		var c := n.get_class()
		by_class[c] = int(by_class.get(c, 0)) + 1
		var scr = n.get_script()
		if scr:
			scripts[scr.resource_path] = true
		if n is DirectionalLight3D:
			lights["directional"] += 1
		elif n is OmniLight3D:
			lights["omni"] += 1
		elif n is SpotLight3D:
			lights["spot"] += 1
		elif n.get_class() == "AreaLight3D":
			lights["area"] += 1
		if n is Light3D and (n as Light3D).shadow_enabled:
			lights["shadowed"] += 1
		if n is Light2D:
			lights["light2d"] += 1
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			meshes["instances"] += 1
			if mi.mesh:
				meshes["surfaces"] += mi.mesh.get_surface_count()
				for si in range(mi.mesh.get_surface_count()):
					if mi.material_override == null and mi.get_surface_override_material(si) == null and mi.mesh.surface_get_material(si) == null:
						if meshes["no_material"].size() < 20:
							meshes["no_material"].append(str(inst.get_path_to(n)))
						break
		if n is MultiMeshInstance3D and (n as MultiMeshInstance3D).multimesh:
			meshes["multimesh_instances"] += (n as MultiMeshInstance3D).multimesh.instance_count
		if n is VisualInstance3D and n is GeometryInstance3D:
			var gi := n as VisualInstance3D
			var b: AABB = gi.global_transform * gi.get_aabb()
			if b.size.length() > 0.0:
				aabb = b if not has_aabb else aabb.merge(b)
				has_aabb = true
		if n is CollisionObject3D or n is CollisionObject2D:
			if n is Area3D or n is Area2D:
				physics["areas"] += 1
			else:
				physics["bodies"] += 1
			if n.get_shape_owners().is_empty() and physics["bodies_without_shape"].size() < 20:
				physics["bodies_without_shape"].append(str(inst.get_path_to(n)))
		if n is CollisionShape3D or n is CollisionShape2D or n is CollisionPolygon2D or n is CollisionPolygon3D:
			physics["shapes"] += 1
		if n is GPUParticles3D or n is GPUParticles2D:
			particles["emitters"] += 1
			particles["amount_total"] += n.amount
			if n.process_material == null:
				particles["no_process_material"].append(str(inst.get_path_to(n)))
		if n is CPUParticles3D or n is CPUParticles2D:
			particles["emitters"] += 1
			particles["amount_total"] += n.amount
		if n is Camera2D:
			cameras["2d"] += 1
		if n is Camera3D:
			cameras["3d"] += 1
			if (n as Camera3D).current:
				cameras["current_3d"] = str(inst.get_path_to(n))
		if n is WorldEnvironment:
			envs += 1
		for ch in n.get_children():
			stack.append([ch, depth + 1])
	var flags: Array = []
	if envs > 1:
		flags.append("%d WorldEnvironment nodes: only one is used" % envs)
	if not physics["bodies_without_shape"].is_empty():
		flags.append("physics bodies with no collision shape: " + str(physics["bodies_without_shape"]))
	if not meshes["no_material"].is_empty():
		flags.append("meshes with no material (render default white): " + str(meshes["no_material"].slice(0, 5)))
	if lights["omni"] + lights["spot"] > 0 and lights["shadowed"] > 8:
		flags.append("%d shadowed lights: check the shadow atlas and the frame budget" % lights["shadowed"])
	if not particles["no_process_material"].is_empty():
		flags.append("GPU particles without a process material emit nothing: " + str(particles["no_process_material"]))
	var res := {
		"ok": true,
		"scene": path,
		"root_class": inst.get_class(),
		"nodes": total,
		"saved_nodes": state.get_node_count(),
		"connections": state.get_connection_count(),
		"max_depth": max_depth,
		"by_class": by_class,
		"scripts": scripts.keys(),
		"lights": lights,
		"meshes": meshes,
		"physics": physics,
		"particles": particles,
		"cameras": cameras,
		"world_environments": envs,
		"aabb": aabb if has_aabb else null,
		"flags": flags,
	}
	inst.queue_free()
	await job.process_frame
	return res


func _walk(root: String, exts: Array, exclude: Array) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		var skip := false
		for e in exclude:
			if (d + "/").begins_with(str(e)) or d.begins_with(str(e)):
				skip = true
		if skip:
			continue
		var da := DirAccess.open(d)
		if da == null:
			continue
		if FileAccess.file_exists(d.path_join(".gdignore")):
			continue
		for f in da.get_files():
			if exts.has(f.get_extension()):
				out.append(d.path_join(f))
		for sub in da.get_directories():
			if sub.begins_with("."):
				continue
			stack.append(d.path_join(sub))
	out.sort()
	return out


## Load every scene and resource under root with the cache bypassed; report the ones that fail.
func resources(job) -> Dictionary:
	job.expect_errors = true
	var files := _walk(job.arg("root", "res://"), job.arg("exts", ["tscn", "scn", "tres", "res"]), job.arg("exclude", ["res://addons/"]))
	var failed: Array = []
	for f in files:
		var before: int = job.captured_error_count()
		var r = ResourceLoader.load(f, "", ResourceLoader.CACHE_MODE_IGNORE)
		var errs: Array = job.captured_errors().slice(before)
		if r == null or not errs.is_empty():
			var msgs: Array = []
			for e in errs.slice(0, 5):
				msgs.append(e["message"])
			failed.append({"path": f, "loaded": r != null, "errors": msgs})
	return {"ok": failed.is_empty(), "checked": files.size(), "failed": failed}


## Compile every .gd under root (one process for the whole project). Parse errors are logged with
## the file and line and also appear in gd_run's parse_errors. The AgentKit's own files are always
## skipped: reloading a script while it runs (CACHE_MODE_IGNORE) broke the GDScript VM in 4.7.2
## ("Internal script error! Opcode: 0"); check them with gd_run.check_only instead.
func scripts(job) -> Dictionary:
	job.expect_errors = true
	var files := _walk(job.arg("root", "res://"), ["gd"], job.arg("exclude", ["res://addons/"]))
	var failed: Array = []
	var skipped: Array = []
	for f in files:
		if f.begins_with("res://addons/agentkit/"):
			skipped.append(f)
			continue
		var before: int = job.captured_error_count()
		var s = ResourceLoader.load(f, "GDScript", ResourceLoader.CACHE_MODE_IGNORE)
		var errs: Array = job.captured_errors().slice(before)
		if s == null or not errs.is_empty():
			var msgs: Array = []
			for e in errs.slice(0, 5):
				msgs.append("%s:%s %s" % [e.get("file", ""), e.get("line", ""), e["message"]])
			failed.append({"path": f, "errors": msgs})
	return {"ok": failed.is_empty(), "checked": files.size() - skipped.size(), "failed": failed, "skipped": skipped}


## Read every .import file: importer, type and the parameters that decide quality and memory.
func imports(job) -> Dictionary:
	var files := _walk(job.arg("root", "res://"), ["import"], job.arg("exclude", ["res://addons/"]))
	var by_importer := {}
	var items: Array = []
	var flags: Array = []
	var keys := ["compress/mode", "compress/high_quality", "mipmaps/generate", "process/fix_alpha_border", "detect_3d/compress_to",
			"process/size_limit", "meshes/generate_lods", "meshes/ensure_tangents", "meshes/light_baking", "nodes/root_type",
			"skins/use_named_skins", "animation/import", "edit/loop_mode", "loop", "compress/lossy_quality"]
	for f in files:
		var cf := ConfigFile.new()
		if cf.load(f) != OK:
			continue
		var importer: String = cf.get_value("remap", "importer", "")
		by_importer[importer] = int(by_importer.get(importer, 0)) + 1
		var params := {}
		if cf.has_section("params"):
			for k in keys:
				if cf.has_section_key("params", k):
					params[k] = cf.get_value("params", k)
		var item := {"source": f.trim_suffix(".import"), "importer": importer, "type": cf.get_value("remap", "type", ""), "params": params}
		if items.size() < int(job.arg("max_items", 300)):
			items.append(item)
		if importer == "texture" and params.get("compress/mode", 0) == 0 and params.get("mipmaps/generate", false):
			flags.append("lossless texture with mipmaps (3D use?): " + item["source"])
	return {"ok": true, "count": files.size(), "by_importer": by_importer, "items": items, "flags": flags.slice(0, 50)}


## Check API names against this binary: "Class", "Class.method", "Class:property", "Class!signal",
## "Class#CONSTANT". Use it before writing code from a tutorial of another Godot version.
func classdb(job) -> Dictionary:
	var out := {}
	var missing: Array = []
	for c in job.arg("checks", []):
		var s: String = str(c)
		var ok := false
		if s.contains("."):
			var p := s.split(".")
			ok = ClassDB.class_exists(p[0]) and ClassDB.class_has_method(p[0], p[1])
		elif s.contains(":"):
			var p := s.split(":")
			ok = ClassDB.class_exists(p[0]) and _has_property(p[0], p[1])
		elif s.contains("!"):
			var p := s.split("!")
			ok = ClassDB.class_exists(p[0]) and ClassDB.class_has_signal(p[0], p[1])
		elif s.contains("#"):
			var p := s.split("#")
			ok = ClassDB.class_exists(p[0]) and ClassDB.class_has_integer_constant(p[0], p[1])
		else:
			ok = ClassDB.class_exists(s)
		out[s] = ok
		if not ok:
			missing.append(s)
	return {"ok": missing.is_empty(), "checks": out, "missing": missing,
			"note": "virtual methods (_ready, _process, _run) are not reported by ClassDB.class_has_method"}


func _has_property(cls: String, prop: String) -> bool:
	for p in ClassDB.class_get_property_list(cls):
		if p["name"] == prop:
			return true
	return false
