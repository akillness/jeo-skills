extends RefCounted
## scenario-godot-architecture AgentKit: write the InputMap into project.godot from one table.
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/setup_input.gd:apply",
##                     args={"source": "res://core/input/input_actions.gd"})
##
## `source` is a script with a static defaults() -> Dictionary {action: [InputEvent, ...]} and an
## optional DEADZONE constant. ProjectSettings.save() rewrites the whole file: it drops the header
## comment and any key equal to its engine default (viewport 1152x648, renderer forward_plus were
## removed in a 4.7.2 run), so audit the project afterwards. Close the GUI editor first.


func apply(job) -> Dictionary:
	var source: String = job.arg("source", "res://core/input/input_actions.gd")
	var scr: Script = load(source)
	if scr == null:
		return {"ok": false, "error": "cannot load " + source}
	var table: Variant = scr.call(&"defaults")
	if not (table is Dictionary):
		return {"ok": false, "error": source + " defaults() did not return a Dictionary"}
	var consts := scr.get_script_constant_map()
	var deadzone: float = float(job.arg("deadzone", float(consts.get("DEADZONE", 0.2))))
	var written: Array[String] = []
	var problems: Array[String] = []
	var actions: Dictionary = table
	for action: Variant in actions:
		var events: Array = []
		for e: Variant in actions[action]:
			if e is InputEvent:
				events.append(e)
			else:
				problems.append("%s: not an InputEvent: %s" % [action, str(e)])
		ProjectSettings.set_setting("input/" + str(action), {"deadzone": deadzone, "events": events})
		written.append(str(action))
	if job.arg("remove_unlisted", false):
		for p: Dictionary in ProjectSettings.get_property_list():
			var n: String = p["name"]
			if n.begins_with("input/") and not n.begins_with("input/ui_") and not (n.substr(6) in written):
				ProjectSettings.set_setting(n, null)
	var err := ProjectSettings.save()
	InputMap.load_from_project_settings()
	var check := {}
	for a: String in written:
		check[a] = InputMap.action_get_events(a).size() if InputMap.has_action(a) else -1
	return {"ok": err == OK and problems.is_empty(), "error": error_string(err) if err != OK else "",
			"actions": written, "events_per_action": check, "deadzone": deadzone, "problems": problems}
