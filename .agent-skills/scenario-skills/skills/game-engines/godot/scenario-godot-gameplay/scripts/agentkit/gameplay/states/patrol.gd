extends "res://addons/agentkit/gameplay/state.gd"
## Patrol: walk the patrol points; any sighting starts a chase.

func enter() -> void:
	actor.aware = false


func physics_update(delta: float) -> Node:
	if actor.percept.get("sees", false):
		return machine.get_state("chase")
	if actor.patrol_points.is_empty():
		actor.halt(delta)
		return null
	var goal: Vector3 = actor.patrol_points[actor.patrol_index]
	if actor.move_to(goal, actor.walk_speed, delta, 0.5):
		actor.patrol_index = (actor.patrol_index + 1) % actor.patrol_points.size()
	return null
