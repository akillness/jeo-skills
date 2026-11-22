class_name BaseLevel
extends Node3D
## Root of every level scene. A level exposes spawn points (Marker3D children in the "spawn"
## group, named after the spawn id) and never creates the player.


func spawn_position(spawn: StringName = &"default") -> Vector3:
	for n: Node in find_children("*", "Marker3D", true, false):
		if n.name == spawn and n.is_in_group(&"spawn"):
			return (n as Marker3D).global_position
	for n: Node in find_children("*", "Marker3D", true, false):
		if n.is_in_group(&"spawn"):
			return (n as Marker3D).global_position
	push_warning("%s has no spawn marker, using the level origin" % scene_file_path)
	return global_position
