class_name PersistComponent
extends Node
## Makes its parent saveable: a child node, so persistence is composed onto any entity.
##
## `properties` are read and written on the target with get() and set(); their values go through
## JSON.from_native, so Vector3, int and StringName keep their types. A target that needs more
## (an Inventory, a state machine) implements save_state() -> Dictionary and load_state(Dictionary);
## both are optional. `save_id` must be stable and unique: a node path changes when a level is
## reorganised, an exported id does not.

@export var save_id: StringName = &""
@export var target: Node
@export var properties: PackedStringArray = []


func _ready() -> void:
	if target == null:
		target = get_parent()
	add_to_group(SaveService.GROUP)
	if save_id == &"":
		push_warning("%s: PersistComponent without save_id is skipped by tests and saves" % get_path())


func capture() -> Dictionary:
	var state := {}
	for prop: String in properties:
		state[prop] = target.get(prop)
	if target.has_method(&"save_state"):
		state["custom"] = target.call(&"save_state")
	return state


func restore(state: Dictionary) -> void:
	for prop: String in properties:
		if state.has(prop):
			target.set(prop, state[prop])
	if state.has("custom") and target.has_method(&"load_state"):
		target.call(&"load_state", state["custom"])
