@tool
class_name Hurtbox3D
extends Area3D
## Takes hits and forwards them to the HealthComponent the parent scene wires in (@export).
##
## @tool only so the Scene dock shows a warning icon while `health` is unset: the dependency is
## documented by the node itself (Godot docs, Scene organization).

signal hit_received(info: DamageInfo, dealt: float)

@export var health: HealthComponent:
	set(value):
		health = value
		update_configuration_warnings()


func take_hit(info: DamageInfo) -> float:
	if health == null:
		push_warning("%s: Hurtbox3D has no HealthComponent wired" % get_path())
		return 0.0
	var dealt := health.apply_damage(info)
	hit_received.emit(info, dealt)
	return dealt


func _get_configuration_warnings() -> PackedStringArray:
	var warnings := PackedStringArray()
	if health == null:
		warnings.append("Assign a HealthComponent to `health`, or hits are ignored.")
	return warnings
