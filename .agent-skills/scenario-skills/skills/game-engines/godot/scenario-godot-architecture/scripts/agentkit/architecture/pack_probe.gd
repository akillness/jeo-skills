extends RefCounted
## scenario-godot-architecture AgentKit: what an exported build sees of the data folders.
##
## Run inside an exported pack (gd_architecture.pack_smoke does it with --main-pack):
##   args {"root": "res://data/items", "catalog": "res://data/item_catalog.tres",
##         "list_property": "items", "load": [...], "wrong_case": "res://Data/Items/Sword.tres"}
## Reports DirAccess.get_files_at (what folder-scanning game code sees), ResourceLoader.list_directory,
## the catalog's item count, which paths load, and whether a wrong-case path still loads.


func listing(job) -> Dictionary:
	job.expect_errors = true
	var root_dir: String = job.arg("root", "res://data/items")
	var out := {}
	out["template_feature"] = OS.has_feature("template")
	out["dir_files"] = Array(DirAccess.get_files_at(root_dir))
	out["list_directory"] = Array(ResourceLoader.list_directory(root_dir))
	var loaded_by_scan := 0
	for f: String in DirAccess.get_files_at(root_dir):
		if f.get_extension() == "tres" and load(root_dir.path_join(f)) != null:
			loaded_by_scan += 1
	out["loaded_by_naive_scan"] = loaded_by_scan
	var cat_path: String = job.arg("catalog", "")
	if cat_path != "":
		var cat: Resource = load(cat_path)
		out["catalog_items"] = (cat.get(job.arg("list_property", "items")) as Array).size() if cat != null else -1
	var loads := {}
	for p: Variant in job.arg("load", []):
		loads[str(p)] = load(str(p)) != null
	out["loads"] = loads
	var wrong: String = job.arg("wrong_case", "")
	if wrong != "":
		out["wrong_case_exists"] = ResourceLoader.exists(wrong)
	out["errors"] = job.captured_errors().size()
	return {"ok": true, "pack": out}
