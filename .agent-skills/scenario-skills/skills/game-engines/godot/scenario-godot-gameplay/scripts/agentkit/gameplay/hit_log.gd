extends RefCounted
## scenario-godot-gameplay kit 0.1: one log per attack, shared by every hitbox of that attack, so overlapping
## shapes hit each target once (Queble, cX-vzfmzjnE [00:12:55]). RefCounted, not Resource: nothing
## is saved ([00:14:00]).

var _hit: Dictionary = {}


func has_hit(target: Object) -> bool:
	return _hit.has(target.get_instance_id())


func log_hit(target: Object) -> void:
	_hit[target.get_instance_id()] = true


func count() -> int:
	return _hit.size()
