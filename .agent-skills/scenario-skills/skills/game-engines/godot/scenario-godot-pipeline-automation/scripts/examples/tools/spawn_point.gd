@tool
class_name SpawnPoint
extends Marker3D
## @tool node with configuration warnings and an inspector button (scenario-godot-pipeline-automation example).
## The button is a plain Callable: tests and agents call it directly, no click needed.

@export var team := 0:
	set(v):
		team = v
		update_configuration_warnings()
@export_tool_button("Snap to floor", "Callable") var snap_button := snap_to_floor


func _get_configuration_warnings() -> PackedStringArray:
	var w := PackedStringArray()
	if team <= 0:
		w.append("team must be 1 or more")
	if position.y < 0.0:
		w.append("below the floor (y < 0)")
	return w


func snap_to_floor() -> void:
	position.y = 0.0
	update_configuration_warnings()
