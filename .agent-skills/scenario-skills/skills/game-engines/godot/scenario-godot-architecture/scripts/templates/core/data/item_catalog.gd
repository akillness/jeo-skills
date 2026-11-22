class_name ItemCatalog
extends Resource
## Registry of every ItemDefinition, written at edit time by the build_catalog tool.
##
## The game reads this one file instead of scanning res://data/items at runtime: a folder scan
## works in the editor and changes in an exported build, where resources are converted and
## listed with .remap entries (Godotneers, 4vAkTHeoORk [01:13:35]).

@export var items: Array[ItemDefinition] = []

var _by_id: Dictionary[StringName, ItemDefinition] = {}


func get_item(item_id: StringName) -> ItemDefinition:
	if _by_id.size() != items.size():
		_index()
	if _by_id.has(item_id):
		return _by_id[item_id]
	return null


func has_item(item_id: StringName) -> bool:
	return get_item(item_id) != null


## Problems a build or a test should fail on: null entries, empty or duplicate ids, bad stacks.
func validate() -> PackedStringArray:
	var problems := PackedStringArray()
	var seen: Dictionary[StringName, int] = {}
	for i in items.size():
		var item: ItemDefinition = items[i]
		if item == null:
			problems.append("items[%d] is null" % i)
			continue
		if item.id == &"":
			problems.append("items[%d] (%s) has an empty id" % [i, item.resource_path])
		elif seen.has(item.id):
			problems.append("duplicate id %s at items[%d] and items[%d]" % [item.id, seen[item.id], i])
		else:
			seen[item.id] = i
		if item.max_stack < 1:
			problems.append("%s: max_stack %d < 1" % [item.id, item.max_stack])
	return problems


func _index() -> void:
	_by_id.clear()
	for item: ItemDefinition in items:
		if item != null:
			_by_id[item.id] = item
