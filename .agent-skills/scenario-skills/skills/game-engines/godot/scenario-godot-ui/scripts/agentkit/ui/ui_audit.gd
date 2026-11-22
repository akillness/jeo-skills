extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): static audit of a UI scene (headless, no rendering).
##
## Job use: run_script(P, "res://addons/agentkit/ui/ui_audit.gd:scene", {"scene": "res://ui/hud.tscn", "hud": true})
## Each flag names the node and the fix. Defaults behind the flags, read from the 4.7.2 binary on
## 2026-10-02: mouse_filter is STOP on Control, ColorRect, Panel, PanelContainer, ProgressBar and
## Button, PASS on containers and TextureRect, IGNORE on Label; TextureRect.expand_mode defaults to
## KEEP_SIZE; Label.focus_mode is NONE; RichTextLabel.focus_mode is ACCESSIBILITY.

const UITheme = preload("res://addons/agentkit/ui/ui_theme.gd")


static func _flag(out: Array, kind: String, node: String, fix: String, extra: Dictionary = {}) -> void:
	var d := {"kind": kind, "node": node, "fix": fix}
	d.merge(extra)
	out.append(d)


## Audit a node tree. opts: hud (bool: the tree overlays gameplay, so clicks must reach the game),
## max_fonts (default 3).
static func audit_tree(root: Node, opts: Dictionary = {}) -> Dictionary:
	var flags: Array = []
	var hud: bool = opts.get("hud", false)
	var styleboxes := {}
	var fonts := {}
	var overrides := 0
	var stack: Array = [root]
	var buttons := 0
	var focusable := 0
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if not (n is Control):
			continue
		var c := n as Control
		var where := str(root.get_path_to(c))
		# 1. Overlays that eat the game's mouse and touch input
		if hud and c.mouse_filter == Control.MOUSE_FILTER_STOP and not (c is BaseButton or c is Range or c is LineEdit or c is ScrollContainer):
			var full := c.anchor_left == 0.0 and c.anchor_top == 0.0 and c.anchor_right == 1.0 and c.anchor_bottom == 1.0
			_flag(flags, "hud_blocks_input" if full else "hud_stop_filter", where,
					"mouse_filter = MOUSE_FILTER_IGNORE (STOP swallows clicks before _unhandled_input)")
		# 2. TextureRect sizing inside containers
		if c is TextureRect and c.get_parent() is Container:
			var tr := c as TextureRect
			if tr.expand_mode == TextureRect.EXPAND_KEEP_SIZE and tr.texture != null and maxf(tr.texture.get_width(), tr.texture.get_height()) > 128:
				_flag(flags, "icon_keep_size", where, "expand_mode = EXPAND_IGNORE_SIZE + custom_minimum_size, stretch_mode = STRETCH_KEEP_ASPECT_CENTERED",
						{"texture_px": tr.texture.get_size()})
			if tr.expand_mode == TextureRect.EXPAND_IGNORE_SIZE and tr.custom_minimum_size == Vector2.ZERO and tr.size_flags_horizontal & Control.SIZE_EXPAND == 0:
				_flag(flags, "icon_collapses", where, "give custom_minimum_size or SIZE_EXPAND (IGNORE_SIZE reports a minimum of 0)")
		# 3. Grow direction for right, bottom or centre anchored controls outside containers
		if not (c.get_parent() is Container) and c != root:
			if c.anchor_left >= 0.5 and c.anchor_left == c.anchor_right and c.grow_horizontal == Control.GROW_DIRECTION_END and (c is Label or c is Button or c is Container):
				_flag(flags, "grows_offscreen_x", where, "grow_horizontal = GROW_DIRECTION_BEGIN (or BOTH when centred): longer text grows past the right edge")
			if c.anchor_top >= 0.5 and c.anchor_top == c.anchor_bottom and c.grow_vertical == Control.GROW_DIRECTION_END and (c is Label or c is Button or c is Container):
				_flag(flags, "grows_offscreen_y", where, "grow_vertical = GROW_DIRECTION_BEGIN (or BOTH when centred)")
		# 4. Focus and accessibility
		if c is BaseButton:
			buttons += 1
			var label := ""
			if c is Button:
				label = (c as Button).text
			if c.focus_mode == Control.FOCUS_NONE or c.focus_mode == Control.FOCUS_CLICK:
				_flag(flags, "not_pad_reachable", where, "focus_mode = FOCUS_ALL so keyboard and gamepad reach it")
			if label.strip_edges() == "" and c.accessibility_name == "":
				_flag(flags, "no_accessible_name", where, "set accessibility_name (icon-only buttons are read as 'button')")
		if c.focus_mode == Control.FOCUS_ALL:
			focusable += 1
		if c is Label and c.has_meta("critical") and c.focus_mode == Control.FOCUS_NONE:
			_flag(flags, "critical_label_unreadable", where, "focus_mode = FOCUS_ACCESSIBILITY so a screen reader can reach it")
		# 5. Theme overrides and shared styleboxes
		for p in c.get_property_list():
			var pn: String = p["name"]
			if pn.begins_with("theme_override_") and c.get(pn) != null:
				overrides += 1
				var v = c.get(pn)
				if v is StyleBox:
					var id := (v as StyleBox).get_instance_id()
					if not styleboxes.has(id):
						styleboxes[id] = []
					styleboxes[id].append(where)
				if v is Font:
					fonts[(v as Font).get_instance_id()] = true
	for id in styleboxes:
		if styleboxes[id].size() > 1:
			_flag(flags, "shared_stylebox_override", ",".join(styleboxes[id]), "one StyleBox resource on several nodes: editing one edits all (duplicate() or move it to the theme)")
	var max_fonts: int = opts.get("max_fonts", 3)
	if fonts.size() > max_fonts:
		_flag(flags, "too_many_fonts", str(root.name), "keep two or three fonts (title, body, numbers)", {"fonts": fonts.size()})
	if buttons > 0 and focusable == 0:
		_flag(flags, "no_focusable", str(root.name), "nothing can take focus: pad and keyboard do nothing")
	var by_kind := {}
	for f in flags:
		by_kind[f["kind"]] = by_kind.get(f["kind"], 0) + 1
	return {"flags": flags, "by_kind": by_kind, "theme_overrides": overrides, "buttons": buttons, "focusable": focusable}


## Job method. args: scene, hud (bool), theme (res:// path to check variations against; default the
## project theme), size [w, h].
func scene(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "")
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	job.root.size = job.arg("size", Vector2i(1280, 720))
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	job.root.add_child(inst)
	await job.wait_frames(2)
	var rep := audit_tree(inst, {"hud": job.arg("hud", false), "max_fonts": job.arg("max_fonts", 3)})
	var themes: Array = [ThemeDB.get_project_theme(), ThemeDB.get_default_theme()]
	var tp: String = job.arg("theme", "")
	if tp != "" and ResourceLoader.exists(tp):
		themes.append(load(tp))
	var stack: Array = [inst]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is Control and (n as Control).theme != null:
			themes.append((n as Control).theme)
	var missing := UITheme.check_variations(inst, themes)
	for m in missing:
		rep["flags"].append({"kind": "unknown_variation", "node": m["node"], "fix": "variation '%s' is not in any applied theme: it silently falls back to the base type" % m["variation"]})
		rep["by_kind"]["unknown_variation"] = rep["by_kind"].get("unknown_variation", 0) + 1
	rep["ok"] = true
	rep["scene"] = scene_path
	rep["project_theme"] = str(ProjectSettings.get_setting("gui/theme/custom", ""))
	inst.queue_free()
	await job.wait_frames(1)
	return rep
