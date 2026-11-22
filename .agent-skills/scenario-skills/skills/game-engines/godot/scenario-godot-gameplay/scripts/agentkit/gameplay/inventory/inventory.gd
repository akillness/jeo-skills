extends Resource
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): slot inventory as a Resource, so it saves with the game save.
## add() fills existing stacks first, then empty slots, and returns what did not fit. Every change
## calls emit_changed(): UI connects to `changed` and redraws, it never polls.
##
## Each holder needs its own copy: two chests that preload the same inventory.tres share one object.
## Use inventory.duplicate_deep() (4.5+) or duplicate(true): both copy the stacks; neither copies an Item
## that lives in its own .tres file (those stay shared, which is what you want) [measured in G7].

const ItemStack = preload("res://addons/agentkit/gameplay/inventory/item_stack.gd")

@export var size := 12
@export var slots: Array[Resource] = []


func _ensure() -> void:
	while slots.size() < size:
		slots.append(null)


func add(item: Resource, amount: int) -> int:
	_ensure()
	var left := amount
	for s in slots:
		if left == 0:
			break
		if s != null and s.item == item and s.count < item.max_stack:
			var put := mini(left, item.max_stack - s.count)
			s.count += put
			left -= put
	for i in slots.size():
		if left == 0:
			break
		if slots[i] == null:
			var st: Resource = ItemStack.new()
			st.item = item
			st.count = mini(left, item.max_stack)
			left -= st.count
			slots[i] = st
	if left != amount:
		emit_changed()
	return left


func remove(item: Resource, amount: int) -> int:
	_ensure()
	var left := amount
	for i in range(slots.size() - 1, -1, -1):
		var s: Resource = slots[i]
		if left == 0:
			break
		if s != null and s.item == item:
			var take := mini(left, s.count)
			s.count -= take
			left -= take
			if s.count == 0:
				slots[i] = null
	if left != amount:
		emit_changed()
	return amount - left


func count_of(item: Resource) -> int:
	var n := 0
	for s in slots:
		if s != null and s.item == item:
			n += s.count
	return n
