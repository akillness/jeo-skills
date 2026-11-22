# gdUnit4 suite: scene_runner, monitor_signals and set_time_factor (claims from Godotneers and Mike Schulze),
# checked on gdUnit4 6.2.1 + Godot 4.7.2 headless. The scene is built in code, so no .tscn fixture is needed.
extends GdUnitTestSuite


func _door_scene() -> PackedScene:
	var root := Node.new()
	root.name = "Door"
	var t := Timer.new()
	t.name = "OpenTimer"
	t.wait_time = 1.0
	t.one_shot = true
	t.autostart = true
	root.add_child(t)
	t.owner = root
	root.set_script(load("res://test/pipeline/door.gd"))
	var ps := PackedScene.new()
	ps.pack(root)
	root.free()
	return ps


func test_signal_seen_when_monitored_before_the_action() -> void:
	var runner := scene_runner(_door_scene().instantiate())
	var door := runner.scene()
	monitor_signals(door)   # before the action: a signal emitted before monitoring is missed
	runner.set_time_factor(5.0)
	var t0 := Time.get_ticks_msec()
	await assert_signal(door).wait_until(3000).is_emitted("opened")
	var ms := Time.get_ticks_msec() - t0
	assert_int(ms).is_less(800)   # 1 s timer at time factor 5: about 200 ms, not 1000
