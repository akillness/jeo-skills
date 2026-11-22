class_name ItemStack
extends RefCounted
## One inventory slot: a shared ItemDefinition plus this slot's own count.

var item: ItemDefinition
var count: int = 0


func _init(p_item: ItemDefinition = null, p_count: int = 0) -> void:
	item = p_item
	count = p_count
