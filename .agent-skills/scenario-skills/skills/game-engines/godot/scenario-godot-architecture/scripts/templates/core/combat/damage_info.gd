class_name DamageInfo
extends RefCounted
## One hit, packed into one object: adding a field later does not break the signal signatures that
## carry it (Eric Peterson, GodotCon 2025 [00:23:18]).

var amount: float = 0.0
var type: StringName = &"physical"
var source: Node = null


func _init(p_amount: float = 0.0, p_type: StringName = &"physical", p_source: Node = null) -> void:
	amount = p_amount
	type = p_type
	source = p_source
