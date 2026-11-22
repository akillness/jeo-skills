extends Resource
## scenario-godot-2d platformer tuning (Godot 4.7.2). Design numbers, not physics constants: gravity and jump
## velocity are derived from jump height and times (Bsy8pknHc0M [00:04:13]: solve them from max
## height and time to apex; make the height a multiple of the tile size). Values are px and seconds.
## Defaults are a starting point for a 16 px tile game [added]; tune per game, then keep them here so
## tests read the same data as the game.

@export_group("Run")
@export var max_speed: float = 120.0          ## px/s (7.5 tiles/s at 16 px)
@export var ground_accel: float = 1200.0      ## px/s^2: 0.1 s to max speed
@export var ground_decel: float = 1600.0      ## px/s^2 when input is released or reversed
@export var air_accel: float = 900.0          ## px/s^2: less control in the air
@export_group("Jump")
@export var jump_height: float = 56.0         ## px at full hold (3.5 tiles of 16 px)
@export var time_to_apex: float = 0.35        ## s
@export var time_to_land: float = 0.28        ## s from apex back to take-off height: heavier fall
@export var jump_cut: float = 0.4             ## vy multiplier on early release (variable height)
@export var apex_threshold: float = 30.0      ## px/s: |vy| under this near the top counts as the apex
@export var apex_gravity_mult: float = 0.6    ## lighter gravity at the apex while jump is held (hang)
@export var max_fall: float = 420.0           ## px/s terminal fall speed
@export_group("Forgiveness")
@export var coyote_time: float = 0.1          ## s after leaving a ledge that a jump still counts
@export var buffer_time: float = 0.1          ## s before landing that a jump press is remembered
@export var corner_correction: int = 4        ## px of sideways nudge when the head clips a ledge corner
@export_group("Integration")
## move_and_slide integrates velocity first, then position (semi-implicit Euler), which loses about
## v*dt/2 of height: 53.5 px for a 56 px design at 60 ticks (measured in 4.7.2). Adding g*dt/2 to
## the take-off speed puts the apex back on the design height.
@export var compensate_integration: bool = true


func gravity_up() -> float:
	return 2.0 * jump_height / (time_to_apex * time_to_apex)


func gravity_down() -> float:
	return 2.0 * jump_height / (time_to_land * time_to_land)


func jump_velocity() -> float:
	var v := -2.0 * jump_height / time_to_apex
	if compensate_integration:
		v -= gravity_up() * 0.5 / float(Engine.physics_ticks_per_second)
	return v


## Seconds to whole physics ticks (windows are counted in ticks so they do not drift with float error).
func ticks(seconds: float) -> int:
	return int(round(seconds * Engine.physics_ticks_per_second))
