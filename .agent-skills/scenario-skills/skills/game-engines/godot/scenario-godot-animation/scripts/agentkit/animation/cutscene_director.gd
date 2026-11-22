extends Node
## Cutscene method-track target (scenario-godot-animation 0.1). Method tracks call these at keyed times; the calls list
## lets a headless test assert call order and timing. In a game, disable_gameplay() would also disable the
## player's input and AI; here it flips a flag other nodes can read.

signal line_said(text: String)

var gameplay_enabled := true
var calls: Array = []
var clock: Callable                                  # returns the cutscene time; set by the test or the game


func _stamp(what: String) -> void:
	calls.append([snappedf(float(clock.call()) if clock.is_valid() else -1.0, 0.0001), what])


func disable_gameplay() -> void:
	gameplay_enabled = false
	_stamp("disable_gameplay")


func enable_gameplay() -> void:
	gameplay_enabled = true
	_stamp("enable_gameplay")


func say(text: String) -> void:
	_stamp("say:" + text)
	line_said.emit(text)
