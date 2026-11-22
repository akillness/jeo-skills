class_name Inventory
extends RefCounted
## Runtime inventory: stacks that point at shared ItemDefinitions. Emits `changed` after each edit.
##
## A plain RefCounted handed to the UI as a parameter, so the dialog never looks for the player
## (Godotneers, 4vAkTHeoORk [00:29:16]). Saved by item id, never by resource path.

signal changed

var capacity: int = 20
var _stacks: Array[ItemStack] = []


func _init(p_capacity: int = 20) -> void:
	capacity = p_capacity


## Adds up to `amount`, filling existing stacks first. Returns what did not fit.
func add(item: ItemDefinition, amount: int = 1) -> int:
	if item == null or amount <= 0:
		return maxi(amount, 0)
	var left := amount
	for stack: ItemStack in _stacks:
		if left == 0:
			break
		if stack.item.id == item.id and stack.count < item.max_stack:
			var put := mini(left, item.max_stack - stack.count)
			stack.count += put
			left -= put
	while left > 0 and _stacks.size() < capacity:
		var put := mini(left, item.max_stack)
		_stacks.append(ItemStack.new(item, put))
		left -= put
	if left != amount:
		changed.emit()
	return left


## Removes `amount` or nothing at all. Returns false when there is not enough.
func remove(item_id: StringName, amount: int = 1) -> bool:
	if amount <= 0 or count_of(item_id) < amount:
		return false
	var left := amount
	for i in range(_stacks.size() - 1, -1, -1):
		var stack: ItemStack = _stacks[i]
		if stack.item.id != item_id:
			continue
		var take := mini(left, stack.count)
		stack.count -= take
		left -= take
		if stack.count == 0:
			_stacks.remove_at(i)
		if left == 0:
			break
	changed.emit()
	return true


func count_of(item_id: StringName) -> int:
	var total := 0
	for stack: ItemStack in _stacks:
		if stack.item.id == item_id:
			total += stack.count
	return total


## True when every id in `needs` is held in that quantity. Reads `needs`, never edits it.
func has_all(needs: Dictionary[StringName, int]) -> bool:
	for item_id: StringName in needs:
		if count_of(item_id) < needs[item_id]:
			return false
	return true


func stack_count() -> int:
	return _stacks.size()


## A copy of the stack list, so callers cannot add or drop slots behind the signal.
func stacks() -> Array[ItemStack]:
	return _stacks.duplicate()


func clear() -> void:
	if _stacks.is_empty():
		return
	_stacks.clear()
	changed.emit()


func to_save() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for stack: ItemStack in _stacks:
		out.append({"id": stack.item.id, "count": stack.count})
	return out


## Rebuilds from saved data. Unknown ids are skipped and reported, never a crash: a save can
## outlive the item it names. Emits `changed` once.
func from_save(data: Array, catalog: ItemCatalog) -> PackedStringArray:
	var problems := PackedStringArray()
	_stacks.clear()
	for entry: Variant in data:
		if not (entry is Dictionary):
			problems.append("entry is not a dictionary: %s" % str(entry))
			continue
		var d: Dictionary = entry
		var item_id := StringName(str(d.get("id", "")))
		var item := catalog.get_item(item_id)
		if item == null:
			problems.append("unknown item id %s" % item_id)
			continue
		var amount := int(d.get("count", 0))
		while amount > 0 and _stacks.size() < capacity:
			var put := mini(amount, item.max_stack)
			_stacks.append(ItemStack.new(item, put))
			amount -= put
		if amount > 0:
			problems.append("%s: %d did not fit" % [item_id, amount])
	changed.emit()
	return problems
