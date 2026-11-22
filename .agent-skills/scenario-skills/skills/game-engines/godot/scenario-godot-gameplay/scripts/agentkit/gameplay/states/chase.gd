extends "res://addons/agentkit/gameplay/state.gd"
## Chase: run to the last known position; attack in range; search once lost for LOSE_AFTER s.

const Brain = preload("res://addons/agentkit/gameplay/brain.gd")


func physics_update(delta: float) -> Node:
	var p: Dictionary = actor.percept
	if p.get("sees", false) and float(p.get("dist", INF)) <= Brain.ATTACK_RANGE:
		return machine.get_state("attack")
	if not p.get("sees", false) and actor.lost_s >= Brain.LOSE_AFTER:
		return machine.get_state("search")
	actor.move_to(actor.last_known, actor.run_speed, delta, Brain.ATTACK_RANGE * 0.8)
	return null
