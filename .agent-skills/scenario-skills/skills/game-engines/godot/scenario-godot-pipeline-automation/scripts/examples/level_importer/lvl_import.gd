@tool
extends EditorImportPlugin
## .lvl -> PackedScene (scenario-godot-pipeline-automation 0.1, Godot 4.7.2). Text format, one shape per line:
##   box <x> <y> <z> <w> <h> <d>     # comment lines start with '#'
## Bump _get_format_version() whenever the output changes: every .lvl then reimports.


func _get_importer_name() -> String:
	return "example.level_text"


func _get_visible_name() -> String:
	return "Level (text)"


func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["lvl"])


func _get_save_extension() -> String:
	return "scn"


func _get_resource_type() -> String:
	return "PackedScene"


func _get_format_version() -> int:
	return 1


func _get_priority() -> float:
	return 1.0


func _get_import_order() -> int:
	return IMPORT_ORDER_SCENE


func _get_preset_count() -> int:
	return 1


func _get_preset_name(_i: int) -> String:
	return "Default"


func _get_import_options(_path: String, _preset: int) -> Array[Dictionary]:
	return [{"name": "collision", "default_value": true}, {"name": "scale", "default_value": 1.0}]


func _get_option_visibility(_path: String, _option: StringName, _options: Dictionary) -> bool:
	return true


func _import(source_file: String, save_path: String, options: Dictionary, _platform_variants: Array[String],
		_gen_files: Array[String]) -> Error:
	var text := FileAccess.get_file_as_string(source_file)
	if text == "" and FileAccess.get_open_error() != OK:
		return FileAccess.get_open_error()
	var root := Node3D.new()
	root.name = source_file.get_file().get_basename()
	var s := float(options.get("scale", 1.0))
	var n := 0
	for raw in text.split("\n"):
		var line := raw.strip_edges()
		if line == "" or line.begins_with("#"):
			continue
		var t := line.split(" ", false)
		if t.size() != 7 or t[0] != "box":
			push_error("%s: bad line '%s' (want: box x y z w h d)" % [source_file, line])
			return ERR_PARSE_ERROR
		var pos := Vector3(t[1].to_float(), t[2].to_float(), t[3].to_float()) * s
		var size := Vector3(t[4].to_float(), t[5].to_float(), t[6].to_float()) * s
		var mi := MeshInstance3D.new()
		mi.name = "Box%d" % n
		var bm := BoxMesh.new()
		bm.size = size
		mi.mesh = bm
		mi.position = pos
		root.add_child(mi)
		mi.owner = root
		if options.get("collision", true):
			var body := StaticBody3D.new()
			body.name = "Body"
			var cs := CollisionShape3D.new()
			var sh := BoxShape3D.new()
			sh.size = size
			cs.shape = sh
			mi.add_child(body)
			body.owner = root
			body.add_child(cs)
			cs.owner = root
		n += 1
	root.set_meta("boxes", n)
	var ps := PackedScene.new()
	var err := ps.pack(root)
	root.free()
	if err != OK:
		return err
	return ResourceSaver.save(ps, "%s.%s" % [save_path, _get_save_extension()])
