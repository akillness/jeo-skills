extends ProgressBar
## scenario-godot-ui 0.1 (Godot 4.7.2): health bar with a damage trail (after DashNothing, f90ieBOoIYQ).
## Front bar (this node, background StyleBoxEmpty) over a TrailBar child that catches up after
## `trail_delay` seconds; each hit restarts the delay so a combo keeps the trail; heals are instant.
## Updates come from a signal (health_changed), never from _process.

@export var trail_delay := 0.4
@export var trail_time := 0.25

var trail: ProgressBar
var _timer: Timer
var _tween: Tween


func _ready() -> void:
	show_percentage = false
	theme_type_variation = &"HealthBar"
	trail = get_node_or_null("Trail") as ProgressBar
	if trail == null:
		trail = ProgressBar.new()
		trail.name = "Trail"
		trail.show_percentage = false
		trail.theme_type_variation = &"TrailBar"
		trail.set_anchors_preset(Control.PRESET_FULL_RECT)
		trail.mouse_filter = Control.MOUSE_FILTER_IGNORE
		trail.show_behind_parent = true
		add_child(trail)
	trail.max_value = max_value
	trail.value = value
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.wait_time = trail_delay
	_timer.timeout.connect(_catch_up)
	add_child(_timer)


func set_health(h: float, max_h: float = -1.0) -> void:
	if max_h > 0.0:
		max_value = max_h
		trail.max_value = max_h
	var prev := value
	value = clampf(h, 0.0, max_value)
	if value < prev:
		_timer.start(trail_delay)
	else:
		trail.value = value


func _catch_up() -> void:
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(trail, "value", value, trail_time)
