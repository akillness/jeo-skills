extends Node
## Autoload "GameTime": shader time that stops when the tree is paused and follows Engine.time_scale.
## Shaders read it as `global uniform float game_time;` (register it in [shader_globals] first).
var t := 0.0
func _process(delta: float) -> void:
	t += delta
	RenderingServer.global_shader_parameter_set("game_time", t)
