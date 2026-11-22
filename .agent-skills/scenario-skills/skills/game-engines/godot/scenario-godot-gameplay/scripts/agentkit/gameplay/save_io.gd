extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): save and load helpers. Static functions, no autoload needed.
##
##   const SaveIO = preload("res://addons/agentkit/gameplay/save_io.gd")
##   SaveIO.save_resource_atomic(save, "user://slot1.tres")
##   var s = SaveIO.load_resource_checked("user://slot1.tres", ["res://save/game_save.gd"])
##
## Rules measured in G6 [added]: a text .tres that carries a GDScript sub_resource runs that script on
## load (so never load a .tres from a player share or a mod folder unchecked); load with
## CACHE_MODE_IGNORE or a second load returns the cached object, not the file; JSON turns every
## number into a float and every Vector3 into a string unless you go through JSON.from_native.


## Write to <path>.tmp then rename over the old file, so a crash mid-write never leaves half a save.
static func save_resource_atomic(res: Resource, path: String) -> Error:
	var ext := path.get_extension()
	var tmp := path.get_basename() + ".tmp." + ext   # ResourceSaver picks the format from the extension
	var err := ResourceSaver.save(res, tmp)
	if err != OK:
		return err
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(tmp), ProjectSettings.globalize_path(path))


## Same idea for text (JSON, CSV).
static func save_text_atomic(text: String, path: String) -> Error:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_string(text)
	f.close()
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(tmp), ProjectSettings.globalize_path(path))


## Refuse a text resource that embeds a script or references a script outside `allowed_scripts`,
## then load it uncached. Binary .res cannot be scanned this way: refused unless allow_binary.
static func scan_text(text: String, allowed_scripts: Array) -> Dictionary:
	var problems: Array = []
	var rx_sub := RegEx.create_from_string('\\[sub_resource[^\\]]*type="(GDScript|CSharpScript|Script)"')
	var rx_src := RegEx.create_from_string("(?m)^\\s*script/source\\s*=")
	var rx_ext := RegEx.create_from_string("\\[ext_resource[^\\]]*\\]")
	if rx_sub.search(text) or rx_src.search(text):
		problems.append("embedded script")
	for m in rx_ext.search_all(text):
		var tag := m.get_string()
		if tag.contains('type="GDScript"') or tag.contains('type="Script"') or tag.contains('type="CSharpScript"'):
			var p := RegEx.create_from_string('path="([^"]+)"').search(tag)
			if p == null or not allowed_scripts.has(p.get_string(1)):
				problems.append("foreign script " + (p.get_string(1) if p else "?"))
	return {"ok": problems.is_empty(), "problems": problems}


static func load_resource_checked(path: String, allowed_scripts: Array, allow_binary := false) -> Resource:
	if path.get_extension() == "tres":
		var scan := scan_text(FileAccess.get_file_as_string(path), allowed_scripts)
		if not scan["ok"]:
			push_warning("save rejected: %s %s" % [path, scan["problems"]])
			return null
	elif not allow_binary:
		push_warning("save rejected: binary resource " + path)
		return null
	return ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE)


## Collect state from every node in `group` that has save_state() -> Dictionary.
## Each dictionary must hold "scene" (res:// path) and "path" (NodePath string) to be restored.
static func collect(tree: SceneTree, group := "persist") -> Array:
	var out: Array = []
	for n in tree.get_nodes_in_group(group):
		if n.has_method("save_state"):
			var d: Dictionary = n.save_state()
			d["path"] = str(n.get_path())
			if n.scene_file_path != "":
				d["scene"] = n.scene_file_path
			out.append(d)
	return out
