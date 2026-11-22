class_name Hitbox3D
extends Area3D
## Deals damage to each Hurtbox3D it starts to overlap.
##
## A typed `is` check instead of has_method duck typing: the static typing docs flag has_method plus
## call as UNSAFE_METHOD_ACCESS, and a wrong area type is an expected outcome here, not a bug.
## Layers: put hurtboxes on their own physics layer and set this mask to it, or every Area3D in
## range reports in (a silent layer or mask mismatch is the first suspect when hits miss).

signal hit(hurtbox: Hurtbox3D, dealt: float)

@export var damage: float = 10.0
@export var damage_type: StringName = &"physical"
## Who is credited with the hit. Defaults to the scene that owns this hitbox.
@export var source: Node


func _ready() -> void:
	area_entered.connect(_on_area_entered)


func _on_area_entered(area: Area3D) -> void:
	if not (area is Hurtbox3D):
		return
	var hurtbox: Hurtbox3D = area
	var credited: Node = source if source != null else owner
	var dealt := hurtbox.take_hit(DamageInfo.new(damage, damage_type, credited))
	hit.emit(hurtbox, dealt)
