@tool
extends EditorPlugin
## Registers the prop post-import step. Enable it in project.godot so headless --import runs it:
##   [editor_plugins]
##   enabled=PackedStringArray("res://addons/prop_pipeline/plugin.cfg")
## If it is disabled, props import un-normalised and silently: the audit flags missing "pipeline" meta.

var _post: EditorScenePostImportPlugin


func _enter_tree() -> void:
	_post = preload("res://addons/prop_pipeline/prop_post_import.gd").new()
	add_scene_post_import_plugin(_post)


func _exit_tree() -> void:
	if _post:
		remove_scene_post_import_plugin(_post)
		_post = null
