extends RefCounted
## scenario-godot-ui 0.1 (Godot 4.7.2): keyboard and gamepad focus checks, headless.
##
## Verified 2026-10-02: with nothing focused, ui_down pushed into the viewport does nothing (the
## docs' "grab focus at scene start" rule); after grab_focus() the same events walk a VBox and stop
## at the last button (no wrap), while ui_focus_next (Tab) wraps. Events pushed with
## Viewport.push_input() drive GUI focus in --headless.
##
## Job use: run_script(P, "res://addons/agentkit/ui/ui_focus.gd:walk",
##                     {"scene": "res://ui/main_menu.tscn", "size": [1280, 720], "steps": ["ui_down", "ui_down"]})

const Stretch = preload("res://addons/agentkit/ui/ui_stretch.gd")
const SIDES := {"left": SIDE_LEFT, "top": SIDE_TOP, "right": SIDE_RIGHT, "bottom": SIDE_BOTTOM}


static func focusables(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is Control:
			var c := n as Control
			if c.is_visible_in_tree() and c.focus_mode == Control.FOCUS_ALL:
				out.append(c)
	return out


static func push_action(vp: Viewport, action: StringName) -> void:
	var e := InputEventAction.new()
	e.action = action
	e.pressed = true
	vp.push_input(e)
	var u := InputEventAction.new()
	u.action = action
	u.pressed = false
	vp.push_input(u)


static func name_of(root: Node, c: Node) -> String:
	if c == null:
		return "null"
	return str(root.get_path_to(c)) if root.is_ancestor_of(c) or root == c else str(c.get_path())


## Static focus graph: the engine's own neighbor choice per side (explicit focus_neighbor_* or its
## geometric guess) and Tab order. Returns nodes, edges, unreachable from `start`, dead ends.
static func graph(root: Node, start: Control) -> Dictionary:
	var nodes := focusables(root)
	var edges := {}
	var dead := []
	for c in nodes:
		var e := {}
		for s in SIDES:
			var nb := (c as Control).find_valid_focus_neighbor(SIDES[s])
			e[s] = name_of(root, nb) if nb else ""
		var nx := (c as Control).find_next_valid_focus()
		e["next"] = name_of(root, nx) if nx else ""
		edges[name_of(root, c)] = e
		if e["left"] == "" and e["top"] == "" and e["right"] == "" and e["bottom"] == "":
			dead.append(name_of(root, c))
	var seen := {}
	var queue: Array = []
	if start != null:
		queue.append(name_of(root, start))
	while not queue.is_empty():
		var k: String = queue.pop_front()
		if seen.has(k) or not edges.has(k):
			continue
		seen[k] = true
		for s in ["left", "top", "right", "bottom", "next"]:
			var t: String = edges[k][s]
			if t != "" and not seen.has(t):
				queue.append(t)
	var unreachable := []
	for k in edges:
		if not seen.has(k):
			unreachable.append(k)
	return {"count": nodes.size(), "edges": edges, "reachable": seen.size(), "unreachable": unreachable, "isolated": dead}


## Job method: load a scene at a size, record the initial focus owner, push actions, record the path.
## args: scene, size [w, h], wait_frames (default 3), steps (array of action names),
##       grab (node path to focus first when the scene grabs nothing; default ""), setup (res://x.gd:method)
func walk(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "")
	if scene_path == "" or not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	await Stretch.set_device(job, job.arg("size", Vector2i(1280, 720)), -1.0, 1)
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	job.root.add_child(inst)
	var setup: String = job.arg("setup", "")
	if setup != "":
		var i := setup.rfind(":")
		var mod = load(setup.substr(0, i)).new()
		await mod.call(setup.substr(i + 1), job, inst)
	await job.wait_frames(job.arg("wait_frames", 3))
	var vp: Viewport = job.root
	var initial := vp.gui_get_focus_owner()
	var initial_name := name_of(inst, initial)
	var grab: String = job.arg("grab", "")
	if initial == null and grab != "":
		var g := inst.get_node_or_null(NodePath(grab))
		if g is Control:
			(g as Control).grab_focus()
			await job.wait_frames(1)
	var start := vp.gui_get_focus_owner()
	var path: Array = [name_of(inst, start)]
	for a in job.arg("steps", []):
		push_action(vp, StringName(str(a)))
		await job.wait_frames(1)
		path.append(name_of(inst, vp.gui_get_focus_owner()))
	var g2 := graph(inst, start)
	inst.queue_free()
	await job.wait_frames(1)
	return {"ok": true, "scene": scene_path, "initial_focus": initial_name, "start": path[0], "path": path,
			"graph": g2}
