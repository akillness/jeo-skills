extends Node
## Test fixture for test_scene_runner.gd: emits `opened` when its timer fires.
signal opened


func _ready() -> void:
	$OpenTimer.timeout.connect(func(): opened.emit())
