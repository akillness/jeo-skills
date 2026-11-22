extends Node
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): node-based finite state machine.
##
## Children are states (state.gd). The owner calls init(self) once, then forwards its callbacks:
##   func _ready(): $StateMachine.init(self)
##   func _physics_process(d): $StateMachine.physics_update(d)
##   func _unhandled_input(e): $StateMachine.handle_input(e)
## Transitions: a state returns the next state node, or calls machine.request(self, "chase")
## (Bitlytic's signal style, ow_Lum-Agbs [00:03:00]: ignored unless the caller is the current
## state, names compared lower-case [00:03:32]).

signal state_changed(from_state: StringName, to_state: StringName)

## Starting state; the first child when empty.
@export var initial_state: Node

var current: Node
var states: Dictionary = {}
## Names of the states entered, in order (tests read it).
var history: Array[StringName] = []
var ignored_requests := 0


func init(actor: Node) -> void:
	states.clear()
	for c in get_children():
		if c.has_method("physics_update") and c.has_method("enter"):
			states[String(c.name).to_lower()] = c
			c.set("actor", actor)
			c.set("machine", self)
	var first: Node = initial_state if initial_state != null else (get_child(0) if get_child_count() > 0 else null)
	if first != null:
		change(first)


func physics_update(delta: float) -> void:
	if current == null:
		return
	var nxt: Node = current.physics_update(delta)
	if nxt != null:
		change(nxt)


func process_update(delta: float) -> void:
	if current == null:
		return
	var nxt: Node = current.process_update(delta)
	if nxt != null:
		change(nxt)


func handle_input(event: InputEvent) -> void:
	if current == null:
		return
	var nxt: Node = current.handle_input(event)
	if nxt != null:
		change(nxt)


## Switch state: exit the old one, enter the new one. Same state: no-op.
func change(to: Node) -> void:
	if to == null or to == current:
		return
	var from_name: StringName = current.name if current != null else &""
	if current != null:
		current.exit()
	current = to
	history.append(to.name)
	current.enter()
	state_changed.emit(from_name, to.name)


## Signal-style transition by name; stale requests from a non-current state are ignored.
func request(from: Node, to_name: String) -> bool:
	if from != current:
		ignored_requests += 1
		return false
	var s: Node = states.get(to_name.to_lower())
	if s == null:
		push_warning("state_machine: no state named " + to_name)
		return false
	change(s)
	return true


func get_state(state_name: String) -> Node:
	return states.get(state_name.to_lower())
