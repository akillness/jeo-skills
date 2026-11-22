extends Node
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): base state for a node-based finite state machine.
##
## A state RETURNS the next state (or null to stay) from its update hooks, after The Shaggy Dev
## (oqFbZoA2lnU [00:05:07]): a return value cannot double-fire and is easy to unit test. The machine
## injects `actor` and `machine` (no get_parent() climbing, [00:04:34]). States do not use the
## engine's _process / _physics_process / _unhandled_input: the machine calls these hooks, so a
## state only runs while it is current ([00:06:45]).
##
## Subclass it in its own file (extends "res://addons/agentkit/gameplay/state.gd", or a class_name
## of your own) and override what you need. Overrides of the typed hooks must return a value on
## every path in 4.7 ("Not all code paths return a value" otherwise, version deltas 3.2).

## The node this state drives (CharacterBody3D, enemy root...). Set by the machine.
var actor: Node
## The owning state machine. Set by the machine.
var machine: Node


func enter() -> void:
	pass


func exit() -> void:
	pass


## Return another state node to switch to it, or null to stay.
func physics_update(_delta: float) -> Node:
	return null


func process_update(_delta: float) -> Node:
	return null


func handle_input(_event: InputEvent) -> Node:
	return null
