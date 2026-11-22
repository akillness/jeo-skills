extends Node
## Gameplay state an AnimationTree reads through advance expressions (scenario-godot-animation 0.1).
## Point AnimationTree.advance_expression_base_node at this node; transitions then use plain
## expressions such as `jump_pressed`, `on_floor`, `not on_floor`, `speed > 0.1`.
## Advance conditions cannot be negated; expressions can.

@export var speed := 0.0
@export var on_floor := true
@export var jump_pressed := false
@export var vertical_velocity := 0.0
