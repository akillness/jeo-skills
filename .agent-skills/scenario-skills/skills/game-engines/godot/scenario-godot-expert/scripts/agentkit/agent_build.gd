extends RefCounted
## AgentKit build helpers (scenario-godot-expert 0.1, Godot 4.7.2): save scenes built in code, export presets,
## verify an exported pack, and the base scenes written by gd_env.new_project().
##
## Static use from any script:
##   const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
##   AgentBuild.save_scene(root_node, "res://levels/test.tscn")
## Job use (module methods take the job): --agent-call res://addons/agentkit/agent_build.gd:presets


## Give every node built in code an owner, then pack and save. PackedScene.pack() silently drops
## children whose owner is not the packed root (verified 4.7.2). Children of instanced sub-scenes are
## left alone so the instance stays an instance.
static func save_scene(root: Node, path: String) -> Dictionary:
	_own_recursive(root, root)
	var ps := PackedScene.new()
	var err := ps.pack(root)
	if err != OK:
		return {"ok": false, "error": "pack failed: " + error_string(err), "path": path}
	var abs_dir := ProjectSettings.globalize_path(path.get_base_dir())
	DirAccess.make_dir_recursive_absolute(abs_dir)
	err = ResourceSaver.save(ps, path)
	if err != OK:
		return {"ok": false, "error": "save failed: " + error_string(err), "path": path}
	return {"ok": true, "path": path, "nodes": ps.get_state().get_node_count()}


static func _own_recursive(node: Node, owner_root: Node) -> void:
	for c in node.get_children():
		if c.owner == null:
			c.owner = owner_root
		if c.scene_file_path == "":
			_own_recursive(c, owner_root)


## Read export_presets.cfg: [{index, name, platform, export_path, runnable, options}].
static func read_presets(cfg_path: String = "res://export_presets.cfg") -> Array:
	var out: Array = []
	var cf := ConfigFile.new()
	if cf.load(cfg_path) != OK:
		return out
	for s in cf.get_sections():
		if not s.begins_with("preset.") or s.ends_with(".options"):
			continue
		var opts := {}
		var os_ := s + ".options"
		if cf.has_section(os_):
			for k in cf.get_section_keys(os_):
				opts[k] = cf.get_value(os_, k)
		out.append({
			"index": int(s.get_slice(".", 1)),
			"name": cf.get_value(s, "name", ""),
			"platform": cf.get_value(s, "platform", ""),
			"export_path": cf.get_value(s, "export_path", ""),
			"runnable": cf.get_value(s, "runnable", false),
			"options": opts,
		})
	return out


## Add or replace one preset in export_presets.cfg, keeping the others. An empty options section
## breaks ConfigFile parsing (verified 4.7.2), so at least one option is always written.
static func write_preset(name: String, platform: String, export_path: String = "", options: Dictionary = {},
		cfg_path: String = "res://export_presets.cfg") -> Dictionary:
	var cf := ConfigFile.new()
	cf.load(cfg_path)  # missing file is fine
	var idx := -1
	var max_idx := -1
	for s in cf.get_sections():
		if s.begins_with("preset.") and not s.ends_with(".options"):
			var n := int(s.get_slice(".", 1))
			max_idx = maxi(max_idx, n)
			if cf.get_value(s, "name", "") == name:
				idx = n
	if idx < 0:
		idx = max_idx + 1
	var sec := "preset.%d" % idx
	if cf.has_section(sec + ".options"):
		cf.erase_section(sec + ".options")
	cf.set_value(sec, "name", name)
	cf.set_value(sec, "platform", platform)
	cf.set_value(sec, "runnable", true)
	cf.set_value(sec, "export_filter", "all_resources")
	cf.set_value(sec, "include_filter", "")
	cf.set_value(sec, "exclude_filter", "*.agent_out/*")
	cf.set_value(sec, "export_path", export_path)
	var opts := options.duplicate()
	if opts.is_empty():
		var defaults := {
			"macOS": {"binary_format/architecture": "universal", "application/bundle_identifier": "com.example." + name.to_lower().validate_filename().replace(" ", "-")},
			"Linux": {"binary_format/architecture": "x86_64"},
			"Windows Desktop": {"binary_format/architecture": "x86_64"},
			"Web": {"variant/thread_support": false},
			"Android": {"gradle_build/use_gradle_build": false},
		}
		opts = defaults.get(platform, {"custom_template/release": ""})
	for k in opts:
		cf.set_value(sec + ".options", k, opts[k])
	var err := cf.save(cfg_path)
	return {"ok": err == OK, "index": idx, "name": name, "platform": platform, "error": "" if err == OK else error_string(err)}


# ------------------------------------------------------------------ job methods

func presets(job) -> Dictionary:
	var p := read_presets(job.arg("cfg", "res://export_presets.cfg"))
	return {"ok": true, "presets": p, "count": p.size()}


func add_preset(job) -> Dictionary:
	return write_preset(job.arg("name", ""), job.arg("platform", ""), job.arg("export_path", ""),
			job.arg("options", {}), job.arg("cfg", "res://export_presets.cfg"))


## Mount an exported .pck or .zip and list what it holds. Run it from an empty project
## (gd_run.verify_pack does) so files of the current project do not mask missing ones.
func verify_pack(job) -> Dictionary:
	var pck: String = job.arg("pck", "")
	if pck == "" or not FileAccess.file_exists(pck):
		return {"ok": false, "error": "pack not found: " + pck}
	var before := _list_files("res://")
	if not ProjectSettings.load_resource_pack(pck, true):
		return {"ok": false, "error": "load_resource_pack failed for " + pck}
	var after := _list_files("res://")
	var added: Array = []
	for f in after:
		if not before.has(f):
			added.append(f)
	added.sort()
	var expect: Array = job.arg("expect", [])
	var missing: Array = []
	for e in expect:
		if not (after.has(e) or ResourceLoader.exists(e)):
			missing.append(e)
	var loaded: Array = []
	var failed: Array = []
	for e in job.arg("load", []):
		var r = load(e)
		if r == null:
			failed.append(e)
		else:
			loaded.append({"path": e, "class": r.get_class()})
	return {"ok": missing.is_empty() and failed.is_empty(), "pack": pck, "files": added.size(),
			"sample": added.slice(0, 40), "missing": missing, "loaded": loaded, "failed_loads": failed,
			"has_project_binary": after.has("res://project.binary")}


static func _list_files(dir: String) -> Dictionary:
	var out := {}
	var stack: Array = [dir]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		var da := DirAccess.open(d)
		if da == null:
			continue
		da.include_hidden = true
		for f in da.get_files():
			out[d.path_join(f)] = true
		for sub in da.get_directories():
			if sub == ".godot" and d == "res://":
				continue
			stack.append(d.path_join(sub))
	return out


## Base 2D scene: Node2D root, Camera2D (enabled), Sprite2D with the project icon at the origin.
func make_base_scene_2d(job) -> Dictionary:
	var root := Node2D.new()
	root.name = "Main"
	var cam := Camera2D.new()
	cam.name = "Camera2D"
	root.add_child(cam)
	var spr := Sprite2D.new()
	spr.name = "Icon"
	if ResourceLoader.exists("res://icon.svg"):
		spr.texture = load("res://icon.svg")
	root.add_child(spr)
	var r := save_scene(root, job.arg("path", "res://main.tscn"))
	root.free()
	return r


## Base 3D scene: WorldEnvironment (procedural sky, AgX), shadowed sun, camera, 20 m floor with
## collision, 1 m reference cube at the origin.
func make_base_scene_3d(job) -> Dictionary:
	var root := Node3D.new()
	root.name = "Main"
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-50, -30, 0)
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(0, 2.5, 6)
	cam.rotation_degrees = Vector3(-20, 0, 0)
	cam.current = true
	root.add_child(cam)
	var floor_body := StaticBody3D.new()
	floor_body.name = "Floor"
	var fmesh := MeshInstance3D.new()
	fmesh.name = "Mesh"
	var plane := PlaneMesh.new()
	plane.size = Vector2(20, 20)
	fmesh.mesh = plane
	var fmat := StandardMaterial3D.new()   # a material-less mesh is flagged by audit(P, "scene")
	fmat.albedo_color = Color(0.45, 0.45, 0.48)
	fmesh.material_override = fmat
	floor_body.add_child(fmesh)
	var fcol := CollisionShape3D.new()
	fcol.name = "Collision"
	var box := BoxShape3D.new()
	box.size = Vector3(20, 0.2, 20)
	fcol.shape = box
	fcol.position = Vector3(0, -0.1, 0)
	floor_body.add_child(fcol)
	root.add_child(floor_body)
	var cube := MeshInstance3D.new()
	cube.name = "RefCube"
	cube.mesh = BoxMesh.new()
	cube.position = Vector3(0, 0.5, 0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.8, 0.35, 0.2)
	cube.material_override = mat
	root.add_child(cube)
	var r := save_scene(root, job.arg("path", "res://main.tscn"))
	root.free()
	return r
