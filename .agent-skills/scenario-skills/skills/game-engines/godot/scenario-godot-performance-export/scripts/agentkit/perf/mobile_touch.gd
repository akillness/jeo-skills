extends RefCounted
## scenario-godot-performance-export 0.1 (Godot 4.7.2): touch controls bound to InputMap actions, and a
## headless check that a touch really presses the action.
##
## TouchScreenButton.action presses an existing InputMap action, so keyboard and gamepad gameplay
## code needs no change (WisconsiKnight, uofaDRa7dWM [00:03:21]). Layout (anchors, safe area) is
## scenario-godot-ui's job; this module only builds and proves the input path.
##
##   gd_run.run_script(P, "res://addons/agentkit/perf/mobile_touch.gd:check", {"actions": {"jump": [900, 480]}})
##
## Synthetic touches in a test go through Viewport.push_input(event, true): with in_local_coords
## false the position is read as WINDOW coordinates and scaled by the stretch transform (a 160x90
## test window maps 1152x648 by 0.139), so the touch misses the button (observed 4.7.2).


## actions: {"action_name": Vector2 or [x, y] position in viewport pixels}. Returns the CanvasLayer.
static func make_touch_layer(actions: Dictionary, size := Vector2(128, 128)) -> CanvasLayer:
	var layer := CanvasLayer.new()
	layer.name = "TouchControls"
	for a in actions:
		if not InputMap.has_action(a):
			InputMap.add_action(a)
		var b := TouchScreenButton.new()
		b.name = "Touch_" + str(a)
		var tex := PlaceholderTexture2D.new()      # swap for the real icon texture in the game
		tex.size = size
		b.texture_normal = tex
		b.action = a
		var p = actions[a]
		b.position = p if p is Vector2 else Vector2(float(p[0]), float(p[1]))
		b.visibility_mode = TouchScreenButton.VISIBILITY_ALWAYS
		layer.add_child(b)
	return layer


static func touch(vp: Viewport, pos: Vector2, pressed: bool, index := 0) -> void:
	var ev := InputEventScreenTouch.new()
	ev.index = index
	ev.position = pos
	ev.pressed = pressed
	vp.push_input(ev, true)


## Job: build the layer, touch the centre of each button, then a point outside all of them.
## Args: actions {name: [x, y]}, size (128).
func check(job) -> Dictionary:
	var actions: Dictionary = job.arg("actions", {"jump": [900, 480], "left": [60, 480]})
	var s: float = job.arg("size", 128)
	var layer := make_touch_layer(actions, Vector2(s, s))
	job.root.add_child(layer)
	await job.wait_frames(2)
	var rows := {}
	for a in actions:
		var p = actions[a]
		var c := Vector2(float(p[0]), float(p[1])) + Vector2(s, s) * 0.5
		touch(job.root, c, true)
		await job.wait_frames(2)
		var down := Input.is_action_pressed(a)
		touch(job.root, c, false)
		await job.wait_frames(2)
		rows[a] = {"pressed_on_touch": down, "released": not Input.is_action_pressed(a)}
	touch(job.root, Vector2(-500, -500), true, 3)
	await job.wait_frames(2)
	var any_stray := false
	for a in actions:
		any_stray = any_stray or Input.is_action_pressed(a)
	touch(job.root, Vector2(-500, -500), false, 3)
	layer.queue_free()
	var ok := not any_stray
	for a in rows:
		ok = ok and rows[a]["pressed_on_touch"] and rows[a]["released"]
	return {"ok": ok, "actions": rows, "stray_touch_pressed": any_stray,
			"emulate_mouse_from_touch": ProjectSettings.get_setting("input_devices/pointing/emulate_mouse_from_touch"),
			"emulate_touch_from_mouse": ProjectSettings.get_setting("input_devices/pointing/emulate_touch_from_mouse")}
