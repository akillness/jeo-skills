class_name SaveService
extends RefCounted
## Save slots as JSON in user://saves/: a versioned envelope around data encoded with
## JSON.from_native, written atomically with one backup.
##
## Why this format (all verified in Godot 4.7.2):
## - plain JSON returns every number as a float and has no Vector3 or StringName; JSON.from_native
##   keeps int, float, StringName, Vector2i and Vector3, and to_native refuses objects by default;
## - a .tres or .res loaded from user:// runs any GDScript embedded in it, and str_to_var or
##   ConfigFile build objects written as Object(...) in the text: never load those from a save
##   file someone else could have handed the player.
## Persistent nodes join the "persist" group through a PersistComponent child.

const FORMAT := "game-save"
const VERSION := 2
const DIR := "user://saves"
const GROUP := &"persist"
## Integer fields restored when migrating a version 1 (plain JSON) save.
const INT_KEYS: Array[String] = ["count", "level", "slot"]


static func slot_path(slot: int) -> String:
	return "%s/slot_%d.json" % [DIR, slot]


## Writes `data` to path.tmp, keeps the previous file as path.bak, then renames into place.
static func write(path: String, data: Dictionary) -> Error:
	var envelope := {
		"format": FORMAT,
		"version": VERSION,
		"saved_at": Time.get_datetime_string_from_system(true),
		"data": JSON.from_native(data),
	}
	var err := DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	if err != OK:
		return err
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	var stored := f.store_string(JSON.stringify(envelope, "\t"))
	f.close()
	if not stored:
		return ERR_FILE_CANT_WRITE
	if FileAccess.file_exists(path):
		DirAccess.copy_absolute(path, path + ".bak")
	return DirAccess.rename_absolute(tmp, path)


## Returns {ok, data, version, migrated_from, error, used_backup}. Never builds objects from the file.
static func read(path: String) -> Dictionary:
	var r := _read_one(path)
	if not r["ok"] and FileAccess.file_exists(path + ".bak"):
		var b := _read_one(path + ".bak")
		if b["ok"]:
			b["used_backup"] = true
			b["error"] = "main file unreadable (%s), loaded the backup" % r["error"]
			return b
	return r


static func _read_one(path: String) -> Dictionary:
	var r := {"ok": false, "data": {}, "version": 0, "migrated_from": 0, "error": "", "used_backup": false}
	if not FileAccess.file_exists(path):
		r["error"] = "no save at " + path
		return r
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		r["error"] = "corrupt JSON at line %d: %s" % [json.get_error_line(), json.get_error_message()]
		return r
	if not (json.data is Dictionary):
		r["error"] = "save root is not an object"
		return r
	var envelope: Dictionary = json.data
	var version := int(envelope.get("version", 0))
	var raw: Variant = envelope.get("data", {})
	var data: Variant
	if version >= 2:
		data = JSON.to_native(raw)
	else:
		data = raw
	if not (data is Dictionary):
		r["error"] = "save data is not a dictionary (version %d)" % version
		return r
	var d: Dictionary = data
	if version < VERSION:
		r["migrated_from"] = version
		d = migrate(d, version)
	r["ok"] = true
	r["data"] = d
	r["version"] = VERSION
	return r


## One step per old version, in order. Version 1 was plain JSON, where every number comes back
## as a float: the step turns the integer fields back into ints.
static func migrate(data: Dictionary, from_version: int) -> Dictionary:
	var d: Dictionary = data.duplicate(true)
	if from_version <= 1:
		d = _restore_ints(d)
	return d



static func _restore_ints(value: Variant) -> Variant:
	if value is Dictionary:
		var src: Dictionary = value
		var out := {}
		for k: Variant in src:
			var v: Variant = src[k]
			if str(k) in INT_KEYS and v is float:
				out[k] = int(v)
			else:
				out[k] = _restore_ints(v)
		return out
	if value is Array:
		var arr: Array = []
		for v: Variant in value:
			arr.append(_restore_ints(v))
		return arr
	return value


## {save_id: state} for every PersistComponent in the tree; duplicate ids are reported.
static func collect(tree: SceneTree) -> Dictionary:
	var nodes := {}
	var duplicates: Array[String] = []
	for n: Node in tree.get_nodes_in_group(GROUP):
		if not (n is PersistComponent):
			continue
		var pc: PersistComponent = n
		if nodes.has(pc.save_id):
			duplicates.append(String(pc.save_id))
		nodes[pc.save_id] = pc.capture()
	return {"nodes": nodes, "duplicate_ids": duplicates}


## Restores every PersistComponent whose save_id is in `data.nodes`; returns the ids not found.
static func apply(tree: SceneTree, data: Dictionary) -> Array[StringName]:
	var nodes: Dictionary = data.get("nodes", {})
	var missing: Array[StringName] = []
	var seen := {}
	for n: Node in tree.get_nodes_in_group(GROUP):
		if not (n is PersistComponent):
			continue
		var pc: PersistComponent = n
		var key: Variant = pc.save_id
		if not nodes.has(key):
			key = String(pc.save_id)
		if nodes.has(key):
			pc.restore(nodes[key])
			seen[pc.save_id] = true
	for k: Variant in nodes:
		if not seen.has(StringName(str(k))):
			missing.append(StringName(str(k)))
	return missing
