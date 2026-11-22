class_name HealthComponent
extends Node
## Health numbers and signals, nothing else: no collision, UI, score or death animation.
##
## The entity's root script is the glue that reacts to `died` (Firebelley Games, rCu8vQrdDDI
## [00:03:42, 00:07:24]). Tuning lives in @export values set per scene; runtime health lives here,
## never in a shared Resource.

signal health_changed(current: float, maximum: float)
signal damaged(info: DamageInfo, dealt: float)
signal died

@export var max_health: float = 100.0
## Fraction of damage blocked per damage type, 0 to 1.
@export var resistances: Dictionary[StringName, float] = {}
@export var invulnerable: bool = false

var current: float = 0.0
var _dead: bool = false


func _ready() -> void:
	reset()


func reset() -> void:
	current = max_health
	_dead = false
	health_changed.emit(current, max_health)


func is_dead() -> bool:
	return _dead


## Applies one hit and returns the damage actually dealt. `died` fires exactly once.
func apply_damage(info: DamageInfo) -> float:
	if invulnerable or _dead or info == null or info.amount <= 0.0:
		return 0.0
	var resist := 0.0
	if resistances.has(info.type):
		resist = clampf(resistances[info.type], 0.0, 1.0)
	var dealt := minf(current, info.amount * (1.0 - resist))
	current -= dealt
	damaged.emit(info, dealt)
	health_changed.emit(current, max_health)
	if current <= 0.0:
		_dead = true
		died.emit()
	return dealt


func heal(amount: float) -> float:
	if _dead or amount <= 0.0:
		return 0.0
	var healed := minf(amount, max_health - current)
	current += healed
	health_changed.emit(current, max_health)
	return healed


func save_state() -> Dictionary:
	return {"current": current, "dead": _dead}


func load_state(state: Dictionary) -> void:
	current = clampf(float(state.get("current", max_health)), 0.0, max_health)
	_dead = bool(state.get("dead", false))
	health_changed.emit(current, max_health)
