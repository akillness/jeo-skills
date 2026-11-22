class_name ItemDefinition
extends Resource
## Static data for one item type, saved as a .tres under res://data/items/.
##
## Loaded resources are cached and shared: every inventory slot that holds a sword points at this one
## object, so game code never writes to it at runtime (per-instance state lives in ItemStack).
## One Resource class per file: an inner class would save its properties but not reload them.

@export var id: StringName = &""
@export var display_name: String = ""
@export var icon: Texture2D
@export_range(1, 999) var max_stack: int = 1
@export var tags: Array[StringName] = []
## Scene dropped in the world when the item is spawned (a typed reference survives file moves).
@export var world_scene: PackedScene


func has_tag(tag: StringName) -> bool:
	return tags.has(tag)
