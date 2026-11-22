extends Resource
## scenario-godot-gameplay kit 0.1: an item definition. Shared, read-only at runtime: one .tres per item kind,
## referenced by every stack that holds it. Never store per-instance state (durability) here.

@export var id: StringName
@export var display_name := ""
@export var max_stack := 99
@export var icon: Texture2D
