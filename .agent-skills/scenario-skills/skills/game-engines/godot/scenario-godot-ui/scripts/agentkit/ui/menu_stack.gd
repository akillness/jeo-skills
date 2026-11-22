extends Node
## scenario-godot-ui 0.1 (Godot 4.7.2): menu stack with focus restore (after Mostly Mad, ecJZipjUj6k).
## Add as a child of the menu root; call open(panel, opener) and close(). ui_cancel closes the top.
## - The panel below the top one is disabled (focus_mode NONE, mouse_filter IGNORE) so hidden or
##   covered buttons cannot steal focus or clicks.
## - close() gives focus back to the button that opened the panel.
## - The first key or pad event when nothing is focused grabs the default button and is swallowed,
##   so it does not also move the selection.
## 4.6+ already hides the focus ring after mouse clicks (gui/common/show_focus_state_on_pointer_event
## = 1, text inputs only), so no manual hover/focus mode switch is needed for the ring itself.

signal opened(panel: Control)
signal closed(panel: Control)

@export var base_panel: Control
@export var default_button: Control

var stack: Array[Dictionary] = []
var _saved := {}


func _ready() -> void:
	if default_button:
		default_button.grab_focus.call_deferred()


func top() -> Control:
	return stack.back()["panel"] if not stack.is_empty() else base_panel


func open(panel: Control, opener: Control = null, first: Control = null) -> void:
	_set_enabled(top(), false)
	panel.show()
	_set_enabled(panel, true)
	stack.append({"panel": panel, "opener": opener})
	var f := first if first else _first_focusable(panel)
	if f:
		f.grab_focus()
	opened.emit(panel)


func close() -> bool:
	if stack.is_empty():
		return false
	var e: Dictionary = stack.pop_back()
	var panel: Control = e["panel"]
	_set_enabled(panel, false)
	panel.hide()
	_set_enabled(top(), true)
	var opener: Control = e["opener"]
	if opener and opener.is_visible_in_tree():
		opener.grab_focus()
	elif default_button:
		default_button.grab_focus()
	closed.emit(panel)
	return true


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and close():
		get_viewport().set_input_as_handled()
		return
	var nav := event is InputEventKey or event is InputEventJoypadButton or event is InputEventJoypadMotion
	if nav and event.is_pressed() and get_viewport().gui_get_focus_owner() == null:
		var f := _first_focusable(top())
		if f:
			f.grab_focus()
			get_viewport().set_input_as_handled()


func _input(event: InputEvent) -> void:
	# Swallow the first navigation event while nothing has focus (GUI input runs before unhandled).
	var nav := event is InputEventKey or event is InputEventJoypadButton or event is InputEventAction
	if nav and event.is_pressed() and get_viewport().gui_get_focus_owner() == null and not event.is_action_pressed("ui_cancel"):
		var f := _first_focusable(top())
		if f:
			f.grab_focus()
			get_viewport().set_input_as_handled()


func _first_focusable(root: Control) -> Control:
	if root == null:
		return null
	if root == top() and default_button and root.is_ancestor_of(default_button) and default_button.is_visible_in_tree():
		return default_button
	var q: Array = [root]
	while not q.is_empty():
		var n: Node = q.pop_front()
		if n is Control and (n as Control).focus_mode == Control.FOCUS_ALL and (n as Control).is_visible_in_tree():
			return n
		q.append_array(n.get_children())
	return null


func _set_enabled(root: Control, on: bool) -> void:
	if root == null:
		return
	var q: Array = [root]
	while not q.is_empty():
		var n: Node = q.pop_front()
		q.append_array(n.get_children())
		if not (n is Control):
			continue
		var c := n as Control
		var id := c.get_instance_id()
		if not on:
			if not _saved.has(id):
				_saved[id] = [c.focus_mode, c.mouse_filter]
			if c.has_focus():
				c.release_focus()
			c.focus_mode = Control.FOCUS_NONE
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		elif _saved.has(id):
			c.focus_mode = _saved[id][0]
			c.mouse_filter = _saved[id][1]
			_saved.erase(id)
