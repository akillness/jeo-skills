class_name InputRemap
extends RefCounted
## Runtime rebinding, saved to user://input_bindings.json as plain dictionaries.
##
## JSON on purpose: ConfigFile and str_to_var rebuild any Object(...) written in the file (verified
## 4.7.2), and a bindings file is user-editable. Rebinding replaces only events of the same family
## (keyboard and mouse, or gamepad) on the target action, and removes the event from every other
## action so one key never triggers two actions. The menu that listens for the key is scenario-godot-ui's.

const PATH := "user://input_bindings.json"
const VERSION := 1
const AXIS_THRESHOLD := 0.5


## True for events a "press a key" prompt should accept.
static func is_bindable(e: InputEvent) -> bool:
	if e is InputEventKey:
		var k: InputEventKey = e
		return k.pressed and not k.echo
	if e is InputEventMouseButton:
		return (e as InputEventMouseButton).pressed
	if e is InputEventJoypadButton:
		return (e as InputEventJoypadButton).pressed
	if e is InputEventJoypadMotion:
		return absf((e as InputEventJoypadMotion).axis_value) >= AXIS_THRESHOLD
	return false


static func family(e: InputEvent) -> StringName:
	if e is InputEventJoypadButton or e is InputEventJoypadMotion:
		return &"pad"
	return &"kbm"


## Binds `event` to `action`. Returns the actions that lost this event (conflicts resolved).
static func rebind(action: StringName, event: InputEvent) -> Array[StringName]:
	var clean := normalized(event)
	var lost: Array[StringName] = []
	for other: StringName in InputMap.get_actions():
		if other == action or String(other).begins_with("ui_"):
			continue
		for old: InputEvent in InputMap.action_get_events(other):
			if _same(old, clean):
				InputMap.action_erase_event(other, old)
				lost.append(other)
	for old: InputEvent in InputMap.action_get_events(action):
		if family(old) == family(clean):
			InputMap.action_erase_event(action, old)
	InputMap.action_add_event(action, clean)
	return lost


## A copy without press state or device, ready for InputMap.
static func normalized(e: InputEvent) -> InputEvent:
	return dict_to_event(event_to_dict(e))


static func event_to_dict(e: InputEvent) -> Dictionary:
	if e is InputEventKey:
		var k: InputEventKey = e
		var code := k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode
		return {"kind": "key", "code": int(code)}
	if e is InputEventMouseButton:
		return {"kind": "mouse", "button": int((e as InputEventMouseButton).button_index)}
	if e is InputEventJoypadButton:
		return {"kind": "joy_button", "button": int((e as InputEventJoypadButton).button_index)}
	if e is InputEventJoypadMotion:
		var m: InputEventJoypadMotion = e
		return {"kind": "joy_axis", "axis": int(m.axis), "dir": 1 if m.axis_value > 0.0 else -1}
	return {}


static func dict_to_event(d: Dictionary) -> InputEvent:
	match str(d.get("kind", "")):
		"key":
			return InputActions.key(int(d.get("code", 0)) as Key)
		"mouse":
			return InputActions.mouse(int(d.get("button", 1)) as MouseButton)
		"joy_button":
			return InputActions.joy_button(int(d.get("button", 0)) as JoyButton)
		"joy_axis":
			return InputActions.joy_axis(int(d.get("axis", 0)) as JoyAxis, signf(float(d.get("dir", 1))))
	return null


static func save_bindings(path: String = PATH) -> Error:
	var actions := {}
	for action: StringName in InputMap.get_actions():
		if String(action).begins_with("ui_"):
			continue
		var events: Array[Dictionary] = []
		for e: InputEvent in InputMap.action_get_events(action):
			var d := event_to_dict(e)
			if not d.is_empty():
				events.append(d)
		actions[String(action)] = events
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	var ok := f.store_string(JSON.stringify({"version": VERSION, "actions": actions}, "\t"))
	f.close()
	return OK if ok else ERR_FILE_CANT_WRITE


## Applies saved bindings over the project defaults. Unknown actions and kinds are ignored, so an
## old file never breaks a newer build. Returns the number of actions applied.
static func load_bindings(path: String = PATH) -> int:
	if not FileAccess.file_exists(path):
		return 0
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK or not (json.data is Dictionary):
		push_warning("input bindings unreadable, keeping defaults: " + path)
		return 0
	var root: Dictionary = json.data
	var actions: Dictionary = root.get("actions", {})
	var applied := 0
	for name: Variant in actions:
		var action := StringName(str(name))
		if not InputMap.has_action(action) or not (actions[name] is Array):
			continue
		var events: Array[InputEvent] = []
		for d: Variant in actions[name]:
			if d is Dictionary:
				var e := dict_to_event(d)
				if e != null:
					events.append(e)
		InputMap.action_erase_events(action)
		for e: InputEvent in events:
			InputMap.action_add_event(action, e)
		applied += 1
	return applied


## Back to project.godot (which the setup tool wrote from InputActions.defaults()).
static func reset_to_defaults() -> void:
	InputMap.load_from_project_settings()


static func _same(a: InputEvent, b: InputEvent) -> bool:
	return event_to_dict(a) == event_to_dict(b)
