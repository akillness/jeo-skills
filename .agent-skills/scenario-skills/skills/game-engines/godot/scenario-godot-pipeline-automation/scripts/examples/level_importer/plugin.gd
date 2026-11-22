@tool
extends EditorPlugin
## Registers the .lvl importer. Enabled plugins load in headless --import too (verified 4.7.2).

var _importer: EditorImportPlugin


func _enter_tree() -> void:
	_importer = preload("res://addons/level_importer/lvl_import.gd").new()
	add_import_plugin(_importer)


func _exit_tree() -> void:
	remove_import_plugin(_importer)
	_importer = null
