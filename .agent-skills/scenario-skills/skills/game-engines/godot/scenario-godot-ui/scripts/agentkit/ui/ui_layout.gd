extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): headless layout checks at many device sizes.
##
## The headless root window accepts any size (root.size = Vector2i(1080, 2400) works and applies the
## project's stretch settings; verified 2026-10-02), so layout can be tested at phone, tablet,
## ultrawide and 4K sizes with no window and no GPU. Rendering is a separate, windowed step
## (ui_capture.gd).
##
## Job use (through gd_ui.layout_matrix in Python):
##   run_script(P, "res://addons/agentkit/ui/ui_layout.gd:matrix",
##              {"scene": "res://ui/hud.tscn", "targets": [["phone_portrait", 1080, 2400], ["uhd", 3840, 2160]],
##               "min_touch_px": 96, "safe_insets": {"phone_portrait": [0, 132, 0, 102]}, "track": ["%Health"]})
## Library use inside a test:
##   var L = preload("res://addons/agentkit/ui/ui_layout.gd").new()
##   var rep: Dictionary = L.report(ui_root, get_viewport().get_visible_rect(), {"scale": 3.0})

const Stretch = preload("res://addons/agentkit/ui/ui_stretch.gd")
const INTERACTIVE := ["BaseButton", "Range", "LineEdit", "TextEdit", "ItemList", "Tree", "TabBar", "OptionButton"]
const MAX_ISSUES := 40


static func is_interactive(c: Control) -> bool:
	if c is ProgressBar:
		return false
	for k in INTERACTIVE:
		if c.is_class(k):
			return c.focus_mode == Control.FOCUS_ALL or c.focus_mode == Control.FOCUS_CLICK or c.mouse_filter != Control.MOUSE_FILTER_IGNORE
	return false


static func _visible(c: Control) -> bool:
	return c.is_visible_in_tree() and c.modulate.a > 0.01


static func _inside_scroll(c: Control) -> bool:
	var p := c.get_parent()
	while p != null:
		if p is ScrollContainer:
			return true
		p = p.get_parent()
	return false


static func _clipped_text(c: Control) -> String:
	if c is Label:
		var l := c as Label
		if l.text == "" or l.text_overrun_behavior != TextServer.OVERRUN_NO_TRIMMING or l.clip_text:
			# Trimming and clipping hide overflow on purpose; report it only if the text is cut.
			if l.text != "" and l.autowrap_mode == TextServer.AUTOWRAP_OFF and l.get_minimum_size().x > l.size.x + 0.5 and l.clip_text:
				return "clipped"
			return ""
		if l.autowrap_mode != TextServer.AUTOWRAP_OFF:
			if l.max_lines_visible >= 0 and l.get_line_count() > l.get_visible_line_count():
				return "lines_hidden"
			return ""
		# A Label always grows to its minimum size, so overflow shows as a rect past the parent.
		var parent := l.get_parent_control()
		if parent != null and l.get_global_rect().end.x > parent.get_global_rect().end.x + 0.5 and not (parent is ScrollContainer):
			return "wider_than_parent"
	elif c is Button:
		var b := c as Button
		if b.clip_text and b.get_minimum_size().x > b.size.x + 0.5:
			return "clipped"
	return ""


## Rect actually visible: clipped by every ancestor with clip_contents (ScrollContainer clips).
static func visible_rect_of(c: Control) -> Rect2:
	var r := c.get_global_rect()
	var p := c.get_parent()
	while p != null:
		if p is Control and (p as Control).clip_contents:
			r = r.intersection((p as Control).get_global_rect())
		p = p.get_parent()
	return r


static func _path(root: Node, c: Node) -> String:
	return str(root.get_path_to(c))


## Layout report for one already laid-out UI tree.
## view: the logical visible rect (get_viewport().get_visible_rect()).
## opts: scale (physical px per logical px), min_touch_px (physical, 0 = off), safe (Rect2 in logical px),
##       track (array of node paths or %Unique names whose rects are returned).
func report(root: Node, view: Rect2, opts: Dictionary = {}) -> Dictionary:
	var scale: float = float(opts.get("scale", 1.0))
	var min_touch: float = float(opts.get("min_touch_px", 0.0))
	var safe: Rect2 = opts.get("safe", view)
	var issues: Array = []
	var counts := {"offscreen": 0, "outside_safe": 0, "small_target": 0, "text": 0, "overlap": 0, "collapsed": 0}
	var interactive: Array = []
	var stack: Array = [root]
	var controls := 0
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for ch in n.get_children():
			stack.append(ch)
		if not (n is Control):
			continue
		var c := n as Control
		if not _visible(c):
			continue
		controls += 1
		var r := c.get_global_rect()
		var where := _path(root, c)
		var scrolled := _inside_scroll(c)
		var has_content := (c is Label and (c as Label).text != "") or (c is TextureRect and (c as TextureRect).texture != null) or (c is Button and ((c as Button).text != "" or (c as Button).icon != null))
		if has_content and (r.size.x < 1.0 or r.size.y < 1.0) and c.get_parent() is Container:
			counts["collapsed"] += 1
			issues.append({"kind": "collapsed", "node": where, "rect": r})
		if r.size.x <= 0.0 or r.size.y <= 0.0:
			continue
		if not scrolled and not view.grow(0.5).encloses(r):
			counts["offscreen"] += 1
			issues.append({"kind": "offscreen", "node": where, "rect": r})
		elif not scrolled and (is_interactive(c) or has_content) and not safe.grow(0.5).encloses(r) and c != root:
			counts["outside_safe"] += 1
			issues.append({"kind": "outside_safe", "node": where, "rect": r})
		var t := _clipped_text(c)
		if t != "":
			counts["text"] += 1
			issues.append({"kind": "text_" + t, "node": where, "rect": r})
		if c is TabContainer and min_touch > 0.0 and (c as TabContainer).tabs_visible:
			var tb: TabBar = (c as TabContainer).get_tab_bar()
			if tb.size.y * scale < min_touch - 0.5:
				counts["small_target"] += 1
				issues.append({"kind": "small_target", "node": where + ":tabs", "physical_px": tb.size * scale})
		if is_interactive(c) and visible_rect_of(c).get_area() > 1.0:
			interactive.append(c)
			if min_touch > 0.0 and minf(r.size.x, r.size.y) * scale < min_touch - 0.5:
				counts["small_target"] += 1
				issues.append({"kind": "small_target", "node": where, "physical_px": r.size * scale})
	for i in range(interactive.size()):
		for j in range(i + 1, interactive.size()):
			var a: Control = interactive[i]
			var b: Control = interactive[j]
			if a.is_ancestor_of(b) or b.is_ancestor_of(a):
				continue
			var ov := visible_rect_of(a).intersection(visible_rect_of(b))
			if ov.get_area() > 1.0:
				counts["overlap"] += 1
				issues.append({"kind": "overlap", "node": _path(root, a), "other": _path(root, b), "area": ov.get_area()})
	var tracked := {}
	for p in opts.get("track", []):
		var tn := root.get_node_or_null(NodePath(str(p)))
		if tn is Control:
			tracked[str(p)] = (tn as Control).get_global_rect()
		else:
			tracked[str(p)] = null
	var total := 0
	for k in counts:
		total += counts[k]
	return {"controls": controls, "interactive": interactive.size(), "counts": counts, "issue_count": total,
			"issues": issues.slice(0, MAX_ISSUES), "tracked": tracked, "view": view}


## Hand emulated notch insets (physical px) to every node that reads them (safe_area.gd has
## `test_insets` and `refresh()`), so the scene's own safe-area code is what gets tested.
static func apply_insets(root: Node, insets: Array) -> int:
	var n := 0
	var stack: Array = [root]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		for c in x.get_children():
			stack.append(c)
		if "test_insets" in x:
			x.set("test_insets", insets.duplicate() if insets.size() >= 4 else [0, 0, 0, 0])
			if x.has_method("refresh"):
				x.call("refresh")
			n += 1
	return n


## Safe area insets [left, top, right, bottom] in physical px -> logical Rect2 inside the view.
static func safe_rect(view: Rect2, insets: Array, stretch: Dictionary) -> Rect2:
	if insets.size() < 4:
		return view
	var s: float = stretch["scale"]
	var m: Vector2 = stretch["margin"]
	var l := maxf(0.0, float(insets[0]) - m.x) / s
	var t := maxf(0.0, float(insets[1]) - m.y) / s
	var rr := maxf(0.0, float(insets[2]) - m.x) / s
	var b := maxf(0.0, float(insets[3]) - m.y) / s
	return Rect2(view.position + Vector2(l, t), view.size - Vector2(l + rr, t + b))


## Job method: instantiate a UI scene and report its layout at each target size (headless).
## args: scene, targets [[name, w, h], ...], factor (UI scale, default project),
##       min_touch_px (number, or {target_name: px} so only touch devices are held to it),
##       safe_insets {name: [l, t, r, b]} (physical px), locale, pseudo (bool), expansion (float),
##       track [paths], setup (res://x.gd:method called with (job, instance) before measuring).
func matrix(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "")
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var locale: String = job.arg("locale", "")
	if locale != "":
		TranslationServer.set_locale(locale)
	if job.arg("pseudo", false):
		ProjectSettings.set_setting("internationalization/pseudolocalization/expansion_ratio", job.arg("expansion", 0.3))
		TranslationServer.pseudolocalization_enabled = true
		TranslationServer.reload_pseudolocalization()
	var factor: float = job.arg("factor", -1.0)
	var targets: Array = job.arg("targets", [["hd", 1280, 720]])
	var insets: Dictionary = job.arg("safe_insets", {})
	var ps := Stretch.project_settings()
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	job.root.add_child(inst)
	var setup: String = job.arg("setup", "")
	if setup != "":
		var i := setup.rfind(":")
		var mod = load(setup.substr(0, i)).new()
		await mod.call(setup.substr(i + 1), job, inst)
	if _ui_root(inst) == null:
		return {"ok": false, "error": "no Control in " + scene_path}
	var out := {}
	var worst := 0
	for t in targets:
		var name := str(t[0])
		var size := Vector2i(int(t[1]), int(t[2]))
		var dev: Dictionary = await Stretch.set_device(job, size, factor, 1)
		apply_insets(inst, insets.get(name, []))
		await job.wait_frames(2)
		var st := Stretch.compute(size, ps["base"], ps["mode"], ps["aspect"], ps["stretch"],
				factor if factor > 0.0 else ps["factor"])
		var view: Rect2 = job.root.get_visible_rect()
		var safe := safe_rect(view, insets.get(name, []), st)
		var mt = job.args.get("min_touch_px", 0.0)
		var min_touch: float = float(mt.get(name, 0.0)) if mt is Dictionary else float(mt)
		var rep := report(inst, view, {"scale": dev["scale"], "min_touch_px": min_touch,
				"safe": safe, "track": job.arg("track", [])})
		rep["physical"] = size
		rep["scale"] = dev["scale"]
		rep["logical"] = view.size
		rep["safe"] = safe
		rep["stretch_math_logical"] = st["logical"]
		out[name] = rep
		worst = maxi(worst, int(rep["issue_count"]))
	inst.queue_free()
	await job.wait_frames(1)
	if job.arg("pseudo", false):
		TranslationServer.pseudolocalization_enabled = false
	return {"ok": true, "scene": scene_path, "targets": out, "max_issues": worst, "locale": TranslationServer.get_locale(),
			"pseudo": job.arg("pseudo", false), "stretch": ps}


static func _ui_root(n: Node) -> Control:
	if n is Control:
		return n as Control
	for c in n.get_children():
		var r := _ui_root(c)
		if r != null:
			return r
	return null
