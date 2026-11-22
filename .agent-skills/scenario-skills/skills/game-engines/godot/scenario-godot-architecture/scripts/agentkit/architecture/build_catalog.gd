extends RefCounted
## scenario-godot-architecture AgentKit: build a registry Resource from a folder of data resources.
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/build_catalog.gd:build",
##                     args={"root": "res://data/items", "out": "res://data/item_catalog.tres",
##                           "catalog_script": "res://core/data/item_catalog.gd",
##                           "item_class": "ItemDefinition", "list_property": "items",
##                           "id_property": "id"})
##
## Run it whenever data files are added (in CI before export). The scan happens here, at edit
## time; the game only loads the catalog, which works the same in the editor and in an export.


func build(job) -> Dictionary:
	var root_dir: String = job.arg("root", "res://data/items")
	var out: String = job.arg("out", "res://data/item_catalog.tres")
	var catalog_script: String = job.arg("catalog_script", "res://core/data/item_catalog.gd")
	var item_class: String = job.arg("item_class", "ItemDefinition")
	var list_prop: String = job.arg("list_property", "items")
	var id_prop: String = job.arg("id_property", "id")
	var files := _walk(root_dir)
	var items: Array[Resource] = []
	var skipped: Array[String] = []
	var ids := {}
	var duplicates: Array[String] = []
	for f: String in files:
		if f == out:
			continue
		var r: Resource = load(f)
		var scr: Script = r.get_script() if r != null else null
		if scr == null or scr.get_global_name() != StringName(item_class):
			skipped.append(f)
			continue
		var id_value := str(r.get(id_prop))
		if ids.has(id_value):
			duplicates.append("%s in %s and %s" % [id_value, ids[id_value], f])
		ids[id_value] = f
		items.append(r)
	items.sort_custom(func(a: Resource, b: Resource) -> bool: return str(a.get(id_prop)) < str(b.get(id_prop)))
	var cat_scr: Script = load(catalog_script)
	if cat_scr == null:
		return {"ok": false, "error": "cannot load " + catalog_script}
	var catalog: Resource = cat_scr.new()
	var list: Array = catalog.get(list_prop)
	list.clear()
	for r: Resource in items:
		list.append(r)
	var err := ResourceSaver.save(catalog, out)
	var back: Resource = ResourceLoader.load(out, "", ResourceLoader.CACHE_MODE_IGNORE)
	var back_count: int = (back.get(list_prop) as Array).size() if back != null else -1
	var text := FileAccess.get_file_as_string(out)
	return {"ok": err == OK and duplicates.is_empty() and back_count == items.size(),
			"error": "" if duplicates.is_empty() else "duplicate ids: " + ", ".join(duplicates),
			"out": out, "items": items.size(), "reloaded": back_count, "ids": ids.keys(),
			"skipped": skipped, "duplicates": duplicates, "ext_resources": text.count("[ext_resource")}


## Recursive listing through ResourceLoader.list_directory (4.4+): it skips .import and .uid files
## and returns directories with a trailing slash.
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
