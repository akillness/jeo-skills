class_name InputActions
extends RefCounted
## Action names and default bindings: one table read by the setup tool (writes project.godot) and
## by InputRemap.reset_to_defaults().
##
## Keys use physical_keycode, so WASD stays under the same fingers on AZERTY or QWERTZ.
## Every event gets device = -1 (all devices), as the editor writes it: a joypad event made in
## code defaults to device 0 and then answers only the first pad (verified 4.7.2). Keyboard and
## mouse events report device 16 and 32 in 4.7, never 0.

const MOVE_LEFT := &"move_left"
const MOVE_RIGHT := &"move_right"
const MOVE_FORWARD := &"move_forward"
const MOVE_BACK := &"move_back"
const LOOK_LEFT := &"look_left"
const LOOK_RIGHT := &"look_right"
const LOOK_UP := &"look_up"
const LOOK_DOWN := &"look_down"
const ATTACK := &"attack"
const DODGE := &"dodge"
const INTERACT := &"interact"
const INVENTORY := &"inventory"
const PAUSE := &"pause"
const DEADZONE := 0.2


static func defaults() -> Dictionary:
	return {
		MOVE_LEFT: [key(KEY_A), joy_axis(JOY_AXIS_LEFT_X, -1.0)],
		MOVE_RIGHT: [key(KEY_D), joy_axis(JOY_AXIS_LEFT_X, 1.0)],
		MOVE_FORWARD: [key(KEY_W), joy_axis(JOY_AXIS_LEFT_Y, -1.0)],
		MOVE_BACK: [key(KEY_S), joy_axis(JOY_AXIS_LEFT_Y, 1.0)],
		LOOK_LEFT: [joy_axis(JOY_AXIS_RIGHT_X, -1.0)],
		LOOK_RIGHT: [joy_axis(JOY_AXIS_RIGHT_X, 1.0)],
		LOOK_UP: [joy_axis(JOY_AXIS_RIGHT_Y, -1.0)],
		LOOK_DOWN: [joy_axis(JOY_AXIS_RIGHT_Y, 1.0)],
		ATTACK: [mouse(MOUSE_BUTTON_LEFT), joy_button(JOY_BUTTON_RIGHT_SHOULDER)],
		DODGE: [key(KEY_SPACE), joy_button(JOY_BUTTON_B)],
		INTERACT: [key(KEY_E), joy_button(JOY_BUTTON_A)],
		INVENTORY: [key(KEY_I), joy_button(JOY_BUTTON_BACK)],
		PAUSE: [key(KEY_ESCAPE), joy_button(JOY_BUTTON_START)],
	}


static func key(code: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.physical_keycode = code
	e.device = -1
	return e


static func mouse(button: MouseButton) -> InputEventMouseButton:
	var e := InputEventMouseButton.new()
	e.button_index = button
	e.device = -1
	return e


static func joy_button(button: JoyButton) -> InputEventJoypadButton:
	var e := InputEventJoypadButton.new()
	e.button_index = button
	e.device = -1
	return e


static func joy_axis(axis: JoyAxis, value: float) -> InputEventJoypadMotion:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = value
	e.device = -1
	return e
