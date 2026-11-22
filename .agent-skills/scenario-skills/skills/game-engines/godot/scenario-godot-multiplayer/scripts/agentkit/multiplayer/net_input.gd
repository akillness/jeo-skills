extends Node
## NetInput (scenario-godot-multiplayer 0.1): the input a client owns. Its multiplayer authority is the owning
## peer; the child InputSync replicates `move` to the server every network frame.

@export var move := Vector2.ZERO
