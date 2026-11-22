extends RefCounted
## scenario-godot-architecture AgentKit: validate every data resource under a folder.
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/validate_data.gd:resources",
##                     args={"root": "res://data/items", "class": "ItemDefinition",
##                           "id_property": "id", "required": ["id", "display_name"]})
##
## Catches: files that fail to load or log errors while loading (a Resource whose _init has a
## parameter without a default logs "Method expected 1 argument(s)"), a script that is built in
## (an inner-class Resource saves an empty built-in GDScript and loses its fields on reload),
## the wrong class, empty required fields and duplicate ids. Loads bypass the cache, so the
## files on disk are judged, not instances a previous step modified.


func resources(job) -> Dictionary:
	job.expect_errors = true
	var root_dir: String = job.arg("root", "res://data")
	var cls: String = job.arg("class", "")
	var id_prop: String = job.arg("id_property", "id")
	var required: Array = job.arg("required", [])
	var problems: Array[String] = []
	var ids := {}
	var checked := 0
	for f: String in _walk(root_dir):
		checked += 1
		var before: int = job.captured_error_count()
		var r: Resource = ResourceLoader.load(f, "", ResourceLoader.CACHE_MODE_IGNORE)
		var errs: Array = job.captured_errors().slice(before)
		if r == null:
			problems.append("%s: failed to load" % f)
			continue
		for e: Dictionary in errs:
			problems.append("%s: load error: %s" % [f, str(e.get("message", "")).left(160)])
		var scr: Script = r.get_script()
		if scr == null:
			if cls != "":
				problems.append("%s: no script (plain %s), expected %s" % [f, r.get_class(), cls])
			continue
		if scr.resource_path == "" or scr.resource_path.contains("::"):
			problems.append("%s: built-in script (inner class or embedded): fields will not reload" % f)
			continue
		if cls != "" and scr.get_global_name() != StringName(cls):
			continue
		for prop: Variant in required:
			var v: Variant = r.get(str(prop))
			if v == null or ((v is String or v is StringName) and str(v) == ""):
				problems.append("%s: required field %s is empty" % [f, prop])
		if id_prop != "":
			var id_value := str(r.get(id_prop))
			if ids.has(id_value):
				problems.append("%s: duplicate %s %s (also in %s)" % [f, id_prop, id_value, ids[id_value]])
			ids[id_value] = f
	return {"ok": problems.is_empty(), "checked": checked, "ids": ids.size(), "problems": problems}


static func _walk(dir: String) -> Array[String]:
	var out: Array[String] = []
	var stack: Array[String] = [dir]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		for entry: String in ResourceLoader.list_directory(d):
			if entry.ends_with("/"):
				stack.append(d.path_join(entry.trim_suffix("/")))
			elif entry.get_extension() in ["tres", "res"]:
				out.append(d.path_join(entry))
	out.sort()
	return out
