@tool
extends EditorScript
## File > Run (Ctrl+Shift+X) in the script editor. Adds 3 SpawnPoints to the open scene with undo.
## Agents run the same _run() headless: see tools_job.gd (scenario-godot-pipeline-automation example).


func _run() -> void:
	var root := EditorInterface.get_edited_scene_root()  # get_scene() is deprecated in 4.7
	if root == null:
		push_error("open a scene first")
		return
	var ur := EditorInterface.get_editor_undo_redo()
	ur.create_action("Add spawn points", UndoRedo.MERGE_DISABLE, root)
	for i in 3:
		var sp := SpawnPoint.new()
		sp.name = "Spawn%d" % i
		sp.team = 1
		sp.position = Vector3(i * 2.0, 0.0, 0.0)
		ur.add_do_method(root, "add_child", sp, true)
		ur.add_do_method(sp, "set_owner", root)
		ur.add_do_reference(sp)
		ur.add_undo_method(root, "remove_child", sp)
	ur.commit_action()
