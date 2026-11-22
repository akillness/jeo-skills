extends Node3D
## scenario-godot-vfx 0.1 test helper: replays every child that has play() every `period` seconds (staggered),
## so a profiler run sees a steady stream of bursts. Not a game asset.
@export var period := 2.0

var _t := 0.0


func _ready() -> void:
	var i := 0
	for c in get_children():
		if c.has_method("play"):
			get_tree().create_timer(period * i / maxf(1.0, get_child_count())).timeout.connect(c.play)
			i += 1


func _process(delta: float) -> void:
	_t += delta
	if _t >= period:
		_t -= period
		var i := 0
		for c in get_children():
			if c.has_method("play"):
				get_tree().create_timer(period * i / maxf(1.0, get_child_count())).timeout.connect(c.play)
				i += 1
