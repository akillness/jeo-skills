extends Node3D
## NetProp (scenario-godot-multiplayer 0.1): a server-owned object for bandwidth and visibility tests.
## The server moves it when `moving` is true; PropSync replicates `position`.

static var moving := true
var phase := 0.0


func _physics_process(delta: float) -> void:
	if not multiplayer.is_server() or not moving:
		return
	phase += delta
	position.x = float(get_index() % 10) * 1.5 + sin(phase * 2.0) * 0.5
	position.z = floorf(get_index() / 10.0) * 1.5
