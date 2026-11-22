extends "res://addons/agentkit/gameplay/state.gd"
## Attack: stand, face the target, hit every `cooldown` s; leave past ATTACK_EXIT (hysteresis).

const Brain = preload("res://addons/agentkit/gameplay/brain.gd")

@export var cooldown := 0.8
var _left := 0.0


func enter() -> void:
	_left = 0.2                      # wind-up before the first hit


func physics_update(delta: float) -> Node:
	var p: Dictionary = actor.percept
	if not p.get("sees", false) or float(p.get("dist", INF)) > Brain.ATTACK_EXIT:
		return machine.get_state("chase")
	actor.halt(delta)
	actor.face(actor.target.global_position, delta)
	_left -= delta
	if _left <= 0.0:
		actor.attacks += 1
		_left = cooldown
	return null
