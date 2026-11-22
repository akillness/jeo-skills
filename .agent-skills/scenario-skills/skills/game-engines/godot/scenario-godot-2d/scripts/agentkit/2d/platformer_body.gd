extends CharacterBody2D
## scenario-godot-2d platformer body (Godot 4.7.2): CharacterBody2D with coyote time, jump buffer, variable
## jump height, apex hang, fall gravity and head-corner correction (Bsy8pknHc0M [00:01:04 to 00:04:13]).
##
## Body and brain are split (Godotneers, CreugthdgJ0 [00:18:14]): the body reads only the intent
## fields below. With use_input on, it fills them from the Input Map each physics tick; a test or an
## AI brain sets use_input = false and writes the fields itself before each tick, so a headless run is
## deterministic. Movement happens only in _physics_process (Godot docs, Using CharacterBody2D).

signal jumped
signal landed
signal left_ground
## Emitted after each move: a test sets the intent fields, then `await body.stepped` (one move).
signal stepped

const Tuning = preload("res://addons/agentkit/2d/platformer_tuning.gd")

@export var tuning: Resource
@export var use_input: bool = true
@export var action_left: StringName = &"move_left"
@export var action_right: StringName = &"move_right"
@export var action_jump: StringName = &"jump"

## Brain to body intent (written every tick).
var intent_x: float = 0.0
var jump_pressed: bool = false   ## edge: true on the tick the button went down
var jump_held: bool = false

var coyote: int = 0              ## ticks of ledge grace left
var buffer: int = 0              ## ticks a jump press is remembered
var jumping: bool = false
var was_on_floor: bool = false
var corrections: int = 0


func _ready() -> void:
	if tuning == null:
		tuning = Tuning.new()


func _physics_process(delta: float) -> void:
	if use_input:
		intent_x = Input.get_axis(action_left, action_right)
		jump_pressed = Input.is_action_just_pressed(action_jump)
		jump_held = Input.is_action_pressed(action_jump)
	step(delta)


func step(dt: float) -> void:
	var t: Resource = tuning
	var on_floor := is_on_floor()           # result of the previous move_and_slide()
	if on_floor:
		coyote = t.ticks(t.coyote_time)       # full window from the first airborne tick
		jumping = false
	if jump_pressed:
		buffer = t.ticks(t.buffer_time)
	if buffer > 0 and coyote > 0:
		velocity.y = t.jump_velocity()
		buffer = 0
		coyote = 0
		jumping = true
		jumped.emit()
	if jumping and velocity.y < 0.0 and not jump_held:
		velocity.y *= t.jump_cut             # early release: cut the rise (smoother than zeroing it)
		jumping = false
	var g: float = t.gravity_up() if velocity.y < 0.0 else t.gravity_down()
	if jumping and jump_held and absf(velocity.y) < t.apex_threshold:
		g *= t.apex_gravity_mult
	velocity.y = minf(velocity.y + g * dt, t.max_fall)
	var target: float = intent_x * t.max_speed
	var rate: float = t.air_accel
	if on_floor:
		var speeding_up := absf(target) > absf(velocity.x) and signf(target) == signf(velocity.x) or is_zero_approx(velocity.x)
		rate = t.ground_accel if speeding_up and target != 0.0 else t.ground_decel
	velocity.x = move_toward(velocity.x, target, rate * dt)
	if velocity.y < 0.0 and t.corner_correction > 0:
		_correct_corner(dt)
	move_and_slide()
	buffer = maxi(buffer - 1, 0)
	if not on_floor:
		coyote = maxi(coyote - 1, 0)
	var now := is_on_floor()
	if now and not was_on_floor:
		landed.emit()
	elif was_on_floor and not now:
		left_ground.emit()
	was_on_floor = now
	stepped.emit()


## Head clips a ceiling corner by a few pixels: slide sideways instead of losing the jump.
func _correct_corner(dt: float) -> void:
	var motion := Vector2(0.0, velocity.y * dt)
	if not test_move(global_transform, motion):
		return
	for i in range(1, int(tuning.corner_correction) + 1):
		for dir in [1.0, -1.0]:
			var off := Vector2(dir * i, 0.0)
			if not test_move(global_transform.translated(off), motion):
				global_position += off
				corrections += 1
				return
