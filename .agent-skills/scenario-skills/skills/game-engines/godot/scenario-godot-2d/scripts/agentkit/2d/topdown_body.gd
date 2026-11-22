extends CharacterBody2D
## scenario-godot-2d top-down body (Godot 4.7.2). FLOATING motion mode: every collision is a wall, floor
## helpers do not apply (Godot docs, Using CharacterBody2D). Input is a desire, not a velocity
## (BT Plays Games, m71-kZgYXlw [00:10:46]).
##
## model "linear": velocity.move_toward(target, rate * dt). It caps speed and stops at exactly zero
## with no sign flip, which is what the hand-written versions get wrong (unbounded additive
## acceleration needs limit_length; subtracting from the length goes negative and vibrates around
## zero, m71-kZgYXlw [00:07:30 to 00:09:31]).
## model "steer": velocity += (target - velocity) * k, frame-rate independent here, plus a minimum
## step so it really reaches top speed and zero (the asymptote fix, m71-kZgYXlw [00:14:08]).

signal stepped

@export var max_speed: float = 120.0       ## px/s
@export var accel: float = 900.0           ## px/s^2 while input is held (0.13 s to max)
@export var decel: float = 1200.0          ## px/s^2 after release
@export_enum("linear", "steer") var model: String = "linear"
@export var steer_k: float = 0.2           ## fraction of the gap closed per 1/60 s
@export var min_step: float = 6.0          ## px/s per tick (0.1 px per frame at 60 ticks)
@export var use_input: bool = true
@export var actions: PackedStringArray = PackedStringArray(["move_left", "move_right", "move_up", "move_down"])

var intent: Vector2 = Vector2.ZERO
var facing: Vector2 = Vector2.DOWN       ## last non-zero direction: idle keeps facing where it stopped


func _ready() -> void:
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING


func _physics_process(delta: float) -> void:
	if use_input:
		intent = Input.get_vector(actions[0], actions[1], actions[2], actions[3])   # length <= 1, deadzone applied
	step(delta)


func step(dt: float) -> void:
	var dir := intent.limit_length(1.0)         # a hand-made Vector2(1, 1) would be 41% faster diagonally
	if dir != Vector2.ZERO:
		facing = dir.normalized()
	var target := dir * max_speed
	if model == "steer":
		var k := 1.0 - pow(1.0 - steer_k, dt * 60.0)
		var dv := (target - velocity) * k
		if dv.length() < min_step and (target - velocity).length() > 0.0:
			dv = (target - velocity).limit_length(min_step)
		velocity += dv
	else:
		var rate := accel if dir != Vector2.ZERO else decel
		velocity = velocity.move_toward(target, rate * dt)
	move_and_slide()
	stepped.emit()
