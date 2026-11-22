extends MarginContainer
## scenario-godot-ui 0.1 (Godot 4.7.2): keeps its content inside the display safe area (notch, home bar).
## Put it as a full-rect child of the screen root; backgrounds stay outside it, under the notch.
## DisplayServer.get_display_safe_area() is in screen pixels; this converts it to the logical canvas
## (divide by the stretch scale, subtract black-bar margins). On desktop the safe area is the whole
## screen and the margins are just `base_margin`.
## Tests set `test_insets` (physical px, [left, top, right, bottom]) instead of asking the OS.

@export var base_margin := 16
var test_insets: Array = []


func _ready() -> void:
	get_viewport().size_changed.connect(refresh)
	refresh()


func insets_px() -> Array:
	if not test_insets.is_empty():
		return test_insets
	if not (OS.has_feature("mobile") or OS.has_feature("web")):
		return [0, 0, 0, 0]
	var win := DisplayServer.window_get_size()
	var safe := DisplayServer.get_display_safe_area()
	return [safe.position.x, safe.position.y, win.x - safe.end.x, win.y - safe.end.y]


func refresh() -> void:
	var vp := get_viewport()
	var scale := 1.0
	if vp is Window:
		scale = vp.get_final_transform().get_scale().x
	elif vp is SubViewport and (vp as SubViewport).size_2d_override.x > 0:
		scale = float((vp as SubViewport).size.x) / (vp as SubViewport).size_2d_override.x
	if scale <= 0.0:
		scale = 1.0
	var ins := insets_px()
	var names := ["margin_left", "margin_top", "margin_right", "margin_bottom"]
	for i in 4:
		add_theme_constant_override(names[i], base_margin + int(ceil(float(ins[i]) / scale)))
