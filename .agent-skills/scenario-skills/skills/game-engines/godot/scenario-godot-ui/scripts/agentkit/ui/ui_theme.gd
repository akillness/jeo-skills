extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): build a game Theme in code (the theme editor is a visual editor).
##
##   const UITheme = preload("res://addons/agentkit/ui/ui_theme.gd")
##   var theme := UITheme.build({"accent": Color("f2b33d"), "body": 28})
##   ResourceSaver.save(theme, "res://ui/theme/game_theme.tres")
##   ProjectSettings.set_setting("gui/theme/custom", "res://ui/theme/game_theme.tres")   # then save()
##
## Type variations (Theme.set_type_variation) carry the second looks: TitleLabel, HudValue, HudLabel,
## PrimaryButton, HudPanel, TrailBar. A node selects one with theme_type_variation = &"HudValue";
## a misspelt name silently falls back to the base type (audit with check_variations()).

const DEFAULT := {
	"bg": Color("10131c"), "panel": Color("1b2030"), "panel_border": Color("3a4360"),
	"text": Color("f2f4f8"), "text_dim": Color("aab3c5"), "accent": Color("f2b33d"),
	"accent_text": Color("10131c"), "danger": Color("e0484f"), "ok": Color("49c47a"),
	"body": 28, "small": 22, "title": 64, "hud": 34, "corner": 10, "border": 2, "focus_border": 4,
	"pad_x": 24, "pad_y": 14, "separation": 14, "font": "",
}


static func _box(bg: Color, border: Color, bw: int, corner: int, pad_x: int, pad_y: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(bw)
	sb.set_corner_radius_all(corner)
	sb.content_margin_left = pad_x
	sb.content_margin_right = pad_x
	sb.content_margin_top = pad_y
	sb.content_margin_bottom = pad_y
	sb.anti_aliasing = true
	return sb


static func build(overrides: Dictionary = {}) -> Theme:
	var s := DEFAULT.duplicate()
	s.merge(overrides, true)
	var t := Theme.new()
	if str(s["font"]) != "" and ResourceLoader.exists(str(s["font"])):
		t.default_font = load(str(s["font"]))
	t.default_font_size = int(s["body"])
	# Button and its states. Focus is drawn on top of the state box: make it thick and high-contrast.
	t.set_stylebox("normal", "Button", _box(s["panel"], s["panel_border"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	t.set_stylebox("hover", "Button", _box(s["panel"].lightened(0.12), s["accent"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	t.set_stylebox("pressed", "Button", _box(s["accent"].darkened(0.2), s["accent"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	t.set_stylebox("disabled", "Button", _box(s["panel"].darkened(0.3), s["panel_border"].darkened(0.3), s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	var focus := _box(Color(0, 0, 0, 0), s["accent"], s["focus_border"], s["corner"] + 2, 0, 0)
	focus.draw_center = false
	focus.expand_margin_left = 3
	focus.expand_margin_right = 3
	focus.expand_margin_top = 3
	focus.expand_margin_bottom = 3
	t.set_stylebox("focus", "Button", focus)
	for c in ["font_color", "font_hover_color", "font_focus_color"]:
		t.set_color(c, "Button", s["text"])
	t.set_color("font_pressed_color", "Button", s["accent_text"])
	t.set_color("font_disabled_color", "Button", s["text_dim"].darkened(0.3))
	# Labels and panels
	t.set_color("font_color", "Label", s["text"])
	t.set_stylebox("panel", "PanelContainer", _box(s["panel"], s["panel_border"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	t.set_stylebox("panel", "Panel", _box(s["panel"], s["panel_border"], s["border"], s["corner"], 0, 0))
	t.set_constant("separation", "VBoxContainer", int(s["separation"]))
	t.set_constant("separation", "HBoxContainer", int(s["separation"]))
	for m in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		t.set_constant(m, "MarginContainer", int(s["pad_x"]))
	# Sliders, option buttons, check buttons reuse Button looks where the type falls back.
	t.set_stylebox("focus", "HSlider", focus)
	t.set_stylebox("focus", "OptionButton", focus)
	t.set_stylebox("focus", "CheckButton", focus)
	t.set_stylebox("slider", "HSlider", _box(s["panel_border"], s["panel_border"], 0, 4, 0, 4))
	t.set_stylebox("grabber_area", "HSlider", _box(s["accent"], s["accent"], 0, 4, 0, 4))
	t.set_stylebox("grabber_area_highlight", "HSlider", _box(s["accent"].lightened(0.2), s["accent"], 0, 4, 0, 4))
	# TabContainer tabs are touch targets too (the internal TabBar is not a child the tree walk sees).
	for st in ["tab_selected", "tab_unselected", "tab_hovered", "tab_focus"]:
		var tb := _box(s["panel"] if st == "tab_selected" else s["bg"], s["accent"] if st == "tab_selected" else s["panel_border"], s["border"], s["corner"], s["pad_x"], 24)
		if st == "tab_focus":
			tb = focus
		t.set_stylebox(st, "TabContainer", tb)
	t.set_color("font_selected_color", "TabContainer", s["accent"])
	t.set_color("font_unselected_color", "TabContainer", s["text_dim"])
	t.set_color("font_hovered_color", "TabContainer", s["text"])
	# ProgressBar: dark track, accent fill
	t.set_stylebox("background", "ProgressBar", _box(s["bg"].darkened(0.2), s["panel_border"], 1, 4, 0, 0))
	t.set_stylebox("fill", "ProgressBar", _box(s["ok"], s["ok"], 0, 4, 0, 0))
	# Variations
	t.set_type_variation("TitleLabel", "Label")
	t.set_font_size("font_size", "TitleLabel", int(s["title"]))
	t.set_color("font_color", "TitleLabel", s["accent"])
	t.set_type_variation("HudLabel", "Label")
	t.set_font_size("font_size", "HudLabel", int(s["small"]))
	t.set_color("font_color", "HudLabel", s["text_dim"])
	t.set_type_variation("HudValue", "Label")
	t.set_font_size("font_size", "HudValue", int(s["hud"]))
	t.set_color("font_outline_color", "HudValue", Color(0, 0, 0, 1))
	t.set_constant("outline_size", "HudValue", 6)
	t.set_type_variation("PrimaryButton", "Button")
	t.set_stylebox("normal", "PrimaryButton", _box(s["accent"], s["accent"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	t.set_stylebox("hover", "PrimaryButton", _box(s["accent"].lightened(0.15), s["text"], s["border"], s["corner"], s["pad_x"], s["pad_y"]))
	for c in ["font_color", "font_hover_color", "font_focus_color", "font_pressed_color"]:
		t.set_color(c, "PrimaryButton", s["accent_text"])
	t.set_type_variation("HudPanel", "PanelContainer")
	var hp := _box(Color(s["bg"], 0.55), Color(s["panel_border"], 0.8), 1, s["corner"], 12, 8)
	t.set_stylebox("panel", "HudPanel", hp)
	t.set_type_variation("HealthBar", "ProgressBar")
	t.set_stylebox("background", "HealthBar", StyleBoxEmpty.new())
	t.set_stylebox("fill", "HealthBar", _box(s["ok"], s["ok"], 0, 4, 0, 0))
	t.set_type_variation("TrailBar", "ProgressBar")
	t.set_stylebox("fill", "TrailBar", _box(s["danger"], s["danger"], 0, 4, 0, 0))
	t.set_meta("palette", s)
	return t


## WCAG 2.x contrast ratio between two opaque colors (1 to 21). Body text target 4.5, large text 3.
static func contrast(a: Color, b: Color) -> float:
	var la := _lum(a)
	var lb := _lum(b)
	return (maxf(la, lb) + 0.05) / (minf(la, lb) + 0.05)


static func _lin(c: float) -> float:
	return c / 12.92 if c <= 0.04045 else pow((c + 0.055) / 1.055, 2.4)


static func _lum(c: Color) -> float:
	return 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b)


static func _bg_of(t: Theme, item: String, type: String) -> Color:
	var sb := t.get_stylebox(item, type)
	if sb is StyleBoxFlat:
		return (sb as StyleBoxFlat).bg_color
	return Color(0, 0, 0, 0)


## Text-on-box contrast for the theme's own pairs, worst first. `under` is the color behind
## transparent boxes (the screen background).
static func contrast_report(t: Theme, under: Color) -> Array:
	var pairs := [
		["Button normal", "font_color", "Button", "normal", "Button"],
		["Button hover", "font_hover_color", "Button", "hover", "Button"],
		["Button pressed", "font_pressed_color", "Button", "pressed", "Button"],
		["Button disabled", "font_disabled_color", "Button", "disabled", "Button"],
		["PrimaryButton normal", "font_color", "PrimaryButton", "normal", "PrimaryButton"],
		["Label on panel", "font_color", "Label", "panel", "PanelContainer"],
		["HudLabel on HudPanel", "font_color", "HudLabel", "panel", "HudPanel"],
		["TitleLabel on screen", "font_color", "TitleLabel", "", ""],
	]
	var out: Array = []
	for p in pairs:
		var fg := t.get_color(p[1], p[2])
		var bg := under if p[3] == "" else _bg_of(t, p[3], p[4])
		bg = under.lerp(Color(bg, 1.0), bg.a)
		out.append({"pair": p[0], "ratio": snappedf(contrast(fg, bg), 0.01), "fg": fg.to_html(false), "bg": bg.to_html(false)})
	out.sort_custom(func(a, b): return a["ratio"] < b["ratio"])
	return out


## Every theme_type_variation used under `root` must exist in one of the themes that apply to it.
static func check_variations(root: Node, themes: Array) -> Array:
	var missing: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is Control and (n as Control).theme_type_variation != &"":
			var v := (n as Control).theme_type_variation
			var found := false
			for th in themes:
				if th is Theme and ((th as Theme).is_type_variation(v, (th as Theme).get_type_variation_base(v)) or (th as Theme).get_type_list().has(v)):
					found = true
			if not found:
				missing.append({"node": str(root.get_path_to(n)), "variation": str(v)})
	return missing
