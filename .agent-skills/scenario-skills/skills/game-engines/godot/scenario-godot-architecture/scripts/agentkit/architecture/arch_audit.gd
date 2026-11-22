extends RefCounted
## scenario-godot-architecture AgentKit: instantiate every scene alone and audit its structure.
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/arch_audit.gd:scenes",
##                     args={"root": "res://", "exclude": ["res://addons/"]})
##
## Per scene: errors logged while it enters the tree alone (a scene that needs its parent to
## exist is not self-contained: Godot docs, Scene organization), negative scale above physics
## nodes (FAT Earth Studios, zLdTvkLsmgA [00:04:30]), physics objects on layer 0 or with mask 0,
## exported node slots left empty and NodePaths that do not resolve (Firebelley Games,
## rCu8vQrdDDI), editor-made signal connections whose target method is missing (GDQuest,
## Qlq8pBB2htg [00:06:16]), configuration warnings, and the process mode of every CanvasLayer.

const PHYSICS_CLASSES := ["CollisionObject2D", "CollisionObject3D", "CollisionShape2D", "CollisionShape3D",
		"CollisionPolygon2D", "CollisionPolygon3D", "RayCast2D", "RayCast3D", "ShapeCast2D", "ShapeCast3D"]
const MODE_NAMES := ["inherit", "pausable", "when_paused", "always", "disabled"]


func scenes(job) -> Dictionary:
	job.expect_errors = true
	var root_dir: String = job.arg("root", "res://")
	var exclude: Array = job.arg("exclude", ["res://addons/"])
	var report: Array[Dictionary] = []
	var flags: Array[String] = []
	for path: String in _walk(root_dir, exclude):
		var r := await _scene(job, path)
		report.append(r)
		for f: String in r["flags"]:
			flags.append("%s: %s" % [path, f])
	return {"ok": flags.is_empty(), "scenes": report.size(), "flags": flags, "report": report}


func _scene(job, path: String) -> Dictionary:
	var out := {"scene": path, "flags": [], "errors": [], "layers": []}
	var before: int = job.captured_error_count()
	var ps: PackedScene = load(path)
	if ps == null:
		out["flags"].append("does not load")
		return out
	var inst: Node = ps.instantiate()
	if inst == null:
		out["flags"].append("does not instantiate")
		return out
	job.root.add_child(inst)
	await job.process_frame
	for e: Dictionary in job.captured_errors().slice(before):
		out["errors"].append(str(e.get("message", "")).left(200))
	if not out["errors"].is_empty():
		out["flags"].append("%d error(s) when instanced alone, first: %s" % [out["errors"].size(), out["errors"][0]])
	var nodes: Array[Node] = [inst]
	nodes.append_array(inst.find_children("*", "", true, false))
	for n: Node in nodes:
		var rel := str(inst.get_path_to(n))
		if _local_flip(n) and _has_physics(n):
			out["flags"].append("negative scale on %s, which carries physics nodes: use flip_h or mirrored positions" % rel)
		if n is CollisionObject2D or n is CollisionObject3D:
			var layer: int = n.get("collision_layer")
			var mask: int = n.get("collision_mask")
			if layer == 0 and mask == 0:
				out["flags"].append("%s has collision_layer 0 and collision_mask 0: it touches nothing" % rel)
			elif (n is Area2D or n is Area3D) and bool(n.get("monitoring")) and mask == 0:
				out["flags"].append("%s monitors with mask 0: it detects nothing" % rel)
		if n.get_script() != null:
			for p: Dictionary in n.get_property_list():
				var usage: int = p["usage"]
				if not (usage & PROPERTY_USAGE_SCRIPT_VARIABLE) or not (usage & PROPERTY_USAGE_STORAGE):
					continue
				if p["type"] == TYPE_NODE_PATH:
					var np: NodePath = n.get(p["name"])
					if not np.is_empty() and n.get_node_or_null(np) == null:
						out["flags"].append("%s.%s NodePath %s does not resolve when the scene is alone" % [rel, p["name"], np])
				elif p["type"] == TYPE_OBJECT and p["hint"] == PROPERTY_HINT_NODE_TYPE and n.get(p["name"]) == null:
					out["flags"].append("%s.%s (%s) is not wired" % [rel, p["name"], p["hint_string"]])
		if n.has_method(&"_get_configuration_warnings"):
			var w: Variant = n.call(&"_get_configuration_warnings")
			if w is PackedStringArray and not (w as PackedStringArray).is_empty():
				out["flags"].append("%s configuration warning: %s" % [rel, (w as PackedStringArray)[0]])
		if n is CanvasLayer:
			out["layers"].append({"node": rel, "layer": (n as CanvasLayer).layer, "process_mode": MODE_NAMES[n.process_mode]})
	var state := ps.get_state()
	for i in state.get_connection_count():
		var target := inst.get_node_or_null(state.get_connection_target(i))
		var method := state.get_connection_method(i)
		if target == null or not target.has_method(method):
			out["flags"].append("connection %s.%s -> %s.%s: target method missing" % [
					state.get_connection_source(i), state.get_connection_signal(i), state.get_connection_target(i), method])
	inst.queue_free()
	await job.process_frame
	return out


static func _local_flip(n: Node) -> bool:
	if n is Node2D:
		return (n as Node2D).transform.determinant() < 0.0
	if n is Node3D:
		return (n as Node3D).transform.basis.determinant() < 0.0
	return false


static func _has_physics(n: Node) -> bool:
	for c: String in PHYSICS_CLASSES:
		if n.is_class(c) or not n.find_children("*", c, true, false).is_empty():
			return true
	return false


static func _walk(dir: String, exclude: Array) -> Array[String]:
	var out: Array[String] = []
	var stack: Array[String] = [dir]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		var skip := false
		for e: Variant in exclude:
			if (d.trim_suffix("/") + "/").begins_with(str(e)):
				skip = true
		if skip or FileAccess.file_exists(d.path_join(".gdignore")):
			continue
		var da := DirAccess.open(d)
		if da == null:
			continue
		for f: String in da.get_files():
			if f.get_extension() == "tscn":
				out.append(d.path_join(f))
		for sub: String in da.get_directories():
			if not sub.begins_with("."):
				stack.append(d.path_join(sub))
	out.sort()
	return out
