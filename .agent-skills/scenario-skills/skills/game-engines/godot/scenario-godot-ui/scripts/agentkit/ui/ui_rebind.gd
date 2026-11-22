extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): input rebinding that survives 4.7 device ids, layouts and restarts.
##
##   const Rebind = preload("res://addons/agentkit/ui/ui_rebind.gd")
##   # in the rebind button's _input while waiting:  if Rebind.accepts(event, "key"): Rebind.rebind("jump", event)
##   Rebind.save_bindings("user://bindings.cfg", ["jump", "fire"]); Rebind.load_bindings("user://bindings.cfg")
##
## 4.7 facts this relies on (verified 2026-10-02): InputEventKey.new().device is 16
## (DEVICE_ID_KEYBOARD) and keyboard events report 16, so a key event stored with device 0 no longer
## matches; InputEventJoypadButton.new().device is 0 and only matches pad 0, so a stored pad binding
## must use device -1 (all devices) or player 2's pad does nothing.

const KINDS := ["key", "pad", "mouse"]
const PAD_NAMES := {JOY_BUTTON_A: "A / Cross", JOY_BUTTON_B: "B / Circle", JOY_BUTTON_X: "X / Square",
		JOY_BUTTON_Y: "Y / Triangle", JOY_BUTTON_LEFT_SHOULDER: "LB / L1", JOY_BUTTON_RIGHT_SHOULDER: "RB / R1",
		JOY_BUTTON_BACK: "Back / Select", JOY_BUTTON_START: "Start / Options", JOY_BUTTON_LEFT_STICK: "L3",
		JOY_BUTTON_RIGHT_STICK: "R3", JOY_BUTTON_DPAD_UP: "D-pad Up", JOY_BUTTON_DPAD_DOWN: "D-pad Down",
		JOY_BUTTON_DPAD_LEFT: "D-pad Left", JOY_BUTTON_DPAD_RIGHT: "D-pad Right"}
const AXIS_NAMES := {JOY_AXIS_LEFT_X: "Left stick X", JOY_AXIS_LEFT_Y: "Left stick Y", JOY_AXIS_RIGHT_X: "Right stick X",
		JOY_AXIS_RIGHT_Y: "Right stick Y", JOY_AXIS_TRIGGER_LEFT: "LT / L2", JOY_AXIS_TRIGGER_RIGHT: "RT / R2"}


static func kind_of(e: InputEvent) -> String:
	if e is InputEventKey:
		return "key"
	if e is InputEventJoypadButton or e is InputEventJoypadMotion:
		return "pad"
	if e is InputEventMouseButton:
		return "mouse"
	return ""


## True when `e` is a fresh press of the kind being rebound (ignores echo, release, small stick noise,
## and Escape, which cancels the capture).
static func accepts(e: InputEvent, kind: String) -> bool:
	if kind_of(e) != kind:
		return false
	if e is InputEventKey:
		return e.pressed and not e.echo and (e as InputEventKey).physical_keycode != KEY_ESCAPE
	if e is InputEventJoypadMotion:
		return absf((e as InputEventJoypadMotion).axis_value) >= 0.6
	return e.is_pressed()


## The event as it should be stored: physical key (same place on AZERTY and QWERTY), device -1,
## no pressed state, stick direction as +1 or -1.
static func normalize(e: InputEvent) -> InputEvent:
	if e is InputEventKey:
		var k := InputEventKey.new()
		var src := e as InputEventKey
		k.physical_keycode = src.physical_keycode if src.physical_keycode != KEY_NONE else src.keycode
		k.device = -1
		return k
	if e is InputEventJoypadButton:
		var b := InputEventJoypadButton.new()
		b.button_index = (e as InputEventJoypadButton).button_index
		b.device = -1
		return b
	if e is InputEventJoypadMotion:
		var m := InputEventJoypadMotion.new()
		m.axis = (e as InputEventJoypadMotion).axis
		m.axis_value = signf((e as InputEventJoypadMotion).axis_value)
		m.device = -1
		return m
	if e is InputEventMouseButton:
		var mb := InputEventMouseButton.new()
		mb.button_index = (e as InputEventMouseButton).button_index
		mb.device = -1
		return mb
	return e


## Actions (from `actions`, default every non-ui_ action) already bound to this event.
static func conflicts(e: InputEvent, except_action: StringName, actions: Array = []) -> Array:
	var out: Array = []
	var pool: Array = actions if not actions.is_empty() else InputMap.get_actions().filter(func(a): return not str(a).begins_with("ui_"))
	var probe := normalize(e)
	if probe is InputEventKey:
		(probe as InputEventKey).pressed = true
	for a in pool:
		if StringName(a) == except_action:
			continue
		for old in InputMap.action_get_events(a):
			if kind_of(old) == kind_of(probe) and _same(old, probe):
				out.append(StringName(a))
	return out


static func _same(a: InputEvent, b: InputEvent) -> bool:
	if a is InputEventKey and b is InputEventKey:
		var ka := (a as InputEventKey)
		var kb := (b as InputEventKey)
		var ca := ka.physical_keycode if ka.physical_keycode != KEY_NONE else ka.keycode
		var cb := kb.physical_keycode if kb.physical_keycode != KEY_NONE else kb.keycode
		return ca == cb
	if a is InputEventJoypadButton and b is InputEventJoypadButton:
		return (a as InputEventJoypadButton).button_index == (b as InputEventJoypadButton).button_index
	if a is InputEventJoypadMotion and b is InputEventJoypadMotion:
		return (a as InputEventJoypadMotion).axis == (b as InputEventJoypadMotion).axis and signf((a as InputEventJoypadMotion).axis_value) == signf((b as InputEventJoypadMotion).axis_value)
	if a is InputEventMouseButton and b is InputEventMouseButton:
		return (a as InputEventMouseButton).button_index == (b as InputEventMouseButton).button_index
	return false


## Replace the bindings of one kind on an action, keep the other kinds (the pad binding survives a
## keyboard rebind). swap=true gives the old event to the conflicting action. Returns the conflicts.
static func rebind(action: StringName, e: InputEvent, swap: bool = false, actions: Array = []) -> Array:
	var kind := kind_of(e)
	var ne := normalize(e)
	var clash := conflicts(e, action, actions)
	var previous: InputEvent = null
	for old in InputMap.action_get_events(action):
		if kind_of(old) == kind:
			previous = old
			InputMap.action_erase_event(action, old)
	InputMap.action_add_event(action, ne)
	for other in clash:
		for old in InputMap.action_get_events(other):
			if kind_of(old) == kind and _same(old, ne):
				InputMap.action_erase_event(other, old)
				if swap and previous != null:
					InputMap.action_add_event(other, previous)
	return clash


## What the player sees: the key label of the current keyboard layout (AZERTY shows A where QWERTY
## shows Q for the same physical key), pad button names, mouse buttons.
static func label(e: InputEvent) -> String:
	if e is InputEventKey:
		var k := e as InputEventKey
		var code := k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode
		var shown := DisplayServer.keyboard_get_label_from_physical(code) if DisplayServer.get_name() != "headless" else code
		return OS.get_keycode_string(shown if shown != KEY_NONE else code)
	if e is InputEventJoypadButton:
		return PAD_NAMES.get((e as InputEventJoypadButton).button_index, "Pad %d" % (e as InputEventJoypadButton).button_index)
	if e is InputEventJoypadMotion:
		var m := e as InputEventJoypadMotion
		return "%s %s" % [AXIS_NAMES.get(m.axis, "Axis %d" % m.axis), "+" if m.axis_value > 0 else "-"]
	if e is InputEventMouseButton:
		return "Mouse %d" % (e as InputEventMouseButton).button_index
	return "?"


static func to_dict(e: InputEvent) -> Dictionary:
	if e is InputEventKey:
		var k := e as InputEventKey
		return {"t": "key", "code": int(k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode)}
	if e is InputEventJoypadButton:
		return {"t": "pad", "button": int((e as InputEventJoypadButton).button_index)}
	if e is InputEventJoypadMotion:
		return {"t": "axis", "axis": int((e as InputEventJoypadMotion).axis), "dir": signf((e as InputEventJoypadMotion).axis_value)}
	if e is InputEventMouseButton:
		return {"t": "mouse", "button": int((e as InputEventMouseButton).button_index)}
	return {}


static func from_dict(d: Dictionary) -> InputEvent:
	match str(d.get("t", "")):
		"key":
			var k := InputEventKey.new()
			k.physical_keycode = int(d["code"]) as Key
			k.device = -1
			return k
		"pad":
			var b := InputEventJoypadButton.new()
			b.button_index = int(d["button"]) as JoyButton
			b.device = -1
			return b
		"axis":
			var m := InputEventJoypadMotion.new()
			m.axis = int(d["axis"]) as JoyAxis
			m.axis_value = float(d["dir"])
			m.device = -1
			return m
		"mouse":
			var mb := InputEventMouseButton.new()
			mb.button_index = int(d["button"]) as MouseButton
			mb.device = -1
			return mb
	return null


## Plain data in a ConfigFile (readable, diffable, no serialized Objects).
static func save_bindings(path: String, actions: Array) -> Error:
	var cf := ConfigFile.new()
	for a in actions:
		var list: Array = []
		for e in InputMap.action_get_events(a):
			var d := to_dict(e)
			if not d.is_empty():
				list.append(d)
		cf.set_value("bindings", str(a), list)
	return cf.save(path)


static func load_bindings(path: String) -> int:
	var cf := ConfigFile.new()
	if cf.load(path) != OK:
		return 0
	var n := 0
	for a in cf.get_section_keys("bindings"):
		if not InputMap.has_action(a):
			continue
		InputMap.action_erase_events(a)
		for d in cf.get_value("bindings", a, []):
			var e := from_dict(d)
			if e != null:
				InputMap.action_add_event(a, e)
				n += 1
	return n


## Back to the project defaults (project.godot [input]).
static func reset_all() -> void:
	InputMap.load_from_project_settings()
