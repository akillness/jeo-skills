extends "res://addons/agentkit/gameplay/state.gd"
## Search: go to the last known position, look around for `duration` s, then patrol.

@export var duration := 3.0
var _left := 0.0


func enter() -> void:
	_left = duration


func physics_update(delta: float) -> Node:
	if actor.percept.get("sees", false):
		return machine.get_state("chase")
	if actor.move_to(actor.last_known, actor.walk_speed, delta, 0.8):
		actor.rotation.y += 1.5 * delta      # look around
		_left -= delta
	else:
		_left -= delta * 0.5
	if _left <= 0.0:
		return machine.get_state("patrol")
	return null
