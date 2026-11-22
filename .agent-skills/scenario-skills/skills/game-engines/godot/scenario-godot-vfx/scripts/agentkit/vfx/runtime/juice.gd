extends Node
## scenario-godot-vfx 0.1: game-feel helpers, meant as an autoload named Juice.
##   Juice.hitstop(0.05, 0.08)   freeze frame (Mostly Mad Jwv9t5zFlqI): time scale down, timer that ignores it
##   Juice.add_trauma(0.4)       camera shake from smooth noise (Mostly Mad pG4KGyxQp40), trauma squared [added]
## Owns Camera3D.h_offset / v_offset and Camera2D.offset of the current camera while shaking.

@export var max_offset_3d := Vector2(0.30, 0.22)   # metres, Camera3D h_offset / v_offset at trauma 1
@export var max_offset_2d := Vector2(24.0, 16.0)   # pixels, Camera2D offset at trauma 1
@export var decay := 1.8                            # trauma lost per real second
@export var frequency := 22.0                       # noise samples per real second

var trauma := 0.0
var shake := Vector2.ZERO
var _noise := FastNoiseLite.new()
var _t := 0.0
var _stops := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_noise.seed = randi()
	_noise.frequency = 1.0
	Engine.time_scale = 1.0     # never inherit a stuck slow-motion (Mostly Mad 00:01:37)


## Freeze frame. Overlapping calls keep the lowest scale; the last one to end restores 1.0.
func hitstop(time_scale: float = 0.05, duration: float = 0.08) -> void:
	_stops += 1
	Engine.time_scale = minf(Engine.time_scale, time_scale)
	await get_tree().create_timer(duration, true, false, true).timeout   # process_always, idle, ignore_time_scale
	_stops -= 1
	if _stops <= 0:
		_stops = 0
		Engine.time_scale = 1.0


func add_trauma(amount: float) -> void:
	trauma = clampf(trauma + amount, 0.0, 1.0)


func _process(delta: float) -> void:
	var real_dt := delta / maxf(Engine.time_scale, 0.0001)   # shake keeps moving during a hit-stop
	_t += real_dt * frequency
	trauma = maxf(trauma - decay * real_dt, 0.0)
	var s := trauma * trauma
	shake = Vector2(_noise.get_noise_2d(_t, 0.0), _noise.get_noise_2d(0.0, _t)) * s
	var vp := get_viewport()
	var c3 := vp.get_camera_3d()
	if c3:
		c3.h_offset = shake.x * max_offset_3d.x
		c3.v_offset = shake.y * max_offset_3d.y
	var c2 := vp.get_camera_2d()
	if c2:
		c2.offset = Vector2(shake.x * max_offset_2d.x, shake.y * max_offset_2d.y)
