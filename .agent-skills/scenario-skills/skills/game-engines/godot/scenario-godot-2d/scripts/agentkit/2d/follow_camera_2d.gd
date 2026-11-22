extends Camera2D
## scenario-godot-2d follow camera (Godot 4.7.2), the GMTK camera spec (Mark Brown, TdWFzpgnljs) on a Camera2D:
## - lookahead by facing, gliding between sides (Cave Story) [00:00:26 to 00:02:35];
## - platformer vertical baseline: ignore jumps, re-baseline on landing (DKC), but follow a fall
##   past a band so the player never leaves the screen [00:03:06 to 00:05:06];
## - damping as exponential smoothing (frame-rate independent) instead of a stiff lock [00:05:06];
## - shake as trauma on `offset`, along a direction, with an off switch for accessibility [00:08:16 to 00:09:51].
## Limits come from the TileMapLayer's used rect so the void is never shown (DevWorm, RlSpjIb7TLo [00:20:01]).
##
## Not a child of the player: the camera owns its own position. It updates in the PHYSICS step, like
## the body it follows (Chris' Tutorials, 43c-Sm5GMbc [00:28:37]); with physics interpolation on,
## the renderer smooths both.

@export var target_path: NodePath
@export var lookahead: float = 32.0           ## px in front of the facing direction
@export var lookahead_speed: float = 3.0      ## 1/s: glide between sides
@export var damping: float = 8.0              ## 1/s: higher follows tighter (0 = locked)
@export var platformer_baseline: bool = true  ## ignore jumps; move vertically on landing
@export var fall_band: float = 48.0           ## px below the baseline before the camera follows a fall
@export var rise_band: float = 72.0           ## px above the baseline before it follows a climb
@export var shake_enabled: bool = true        ## expose in options (accessibility)
@export var shake_max: float = 6.0            ## px at trauma 1
@export var shake_decay: float = 1.6          ## trauma per second

var target: Node2D
var baseline_y: float = 0.0
var look: float = 0.0
var trauma: float = 0.0
var shake_dir: Vector2 = Vector2.ZERO
var focus: Vector2 = Vector2.ZERO             ## smoothed point the camera centres on (before offset)
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	position_smoothing_enabled = false        # this script does its own damping
	if target_path != NodePath():
		target = get_node_or_null(target_path)
	if target:
		snap_to_target()


func snap_to_target() -> void:
	baseline_y = target.global_position.y
	focus = Vector2(target.global_position.x, baseline_y)
	global_position = focus
	reset_smoothing()


func set_limits_from_layer(layer: TileMapLayer, margin_tiles: int = 0) -> Rect2:
	var r := layer.get_used_rect().grow(-margin_tiles)
	var ts := Vector2(layer.tile_set.tile_size)
	var a := layer.to_global(Vector2(r.position) * ts)
	var b := layer.to_global(Vector2(r.end) * ts)
	limit_left = int(a.x)
	limit_top = int(a.y)
	limit_right = int(b.x)
	limit_bottom = int(b.y)
	return Rect2(a, b - a)


func add_trauma(amount: float, direction: Vector2 = Vector2.ZERO) -> void:
	trauma = clampf(trauma + amount, 0.0, 1.0)
	shake_dir = direction.normalized()


func _physics_process(delta: float) -> void:
	if target == null:
		return
	var tp := target.global_position
	var facing := 0.0
	if "facing" in target and target.facing is Vector2:
		facing = signf(target.facing.x)
	elif "velocity" in target and absf(target.velocity.x) > 1.0:
		facing = signf(target.velocity.x)
	elif "intent_x" in target and absf(target.intent_x) > 0.1:
		facing = signf(target.intent_x)
	if facing != 0.0:
		look = move_toward(look, facing * lookahead, lookahead * lookahead_speed * 2.0 * delta)
	var want_y := tp.y
	if platformer_baseline:
		var grounded: bool = target.has_method("is_on_floor") and target.is_on_floor()
		if grounded:
			baseline_y = tp.y
		elif tp.y > baseline_y + fall_band:
			baseline_y = tp.y - fall_band
		elif tp.y < baseline_y - rise_band:
			baseline_y = tp.y + rise_band
		want_y = baseline_y
	var want := Vector2(tp.x + look, want_y)
	if damping <= 0.0:
		focus = want
	else:
		focus = focus.lerp(want, 1.0 - exp(-damping * delta))
	if platformer_baseline:
		# Damping lags by speed/damping (420 px/s fall at damping 8 = 52 px), which on top of the band
		# pushed the player 100 px below centre, off a 180 px screen (measured). Hard-clamp the band.
		focus.y = clampf(focus.y, tp.y - fall_band, tp.y + rise_band)
	global_position = focus
	if trauma > 0.0 and shake_enabled:
		var amp := shake_max * trauma * trauma
		var o := Vector2(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1)) * amp
		if shake_dir != Vector2.ZERO:
			o = shake_dir * o.length() * signf(_rng.randf_range(-1, 1))
		offset = o
	else:
		offset = Vector2.ZERO
	trauma = maxf(trauma - shake_decay * delta, 0.0)
