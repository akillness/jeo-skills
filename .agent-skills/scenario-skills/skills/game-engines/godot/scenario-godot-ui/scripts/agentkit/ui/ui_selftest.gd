extends RefCounted
## scenario-godot-ui 0.1: compile every script of the UI kit in one run (agent_audit.gd:scripts skips
## res://addons/agentkit/). Job use: run_script(P, "res://addons/agentkit/ui/ui_selftest.gd:compile")

func compile(job) -> Dictionary:
	job.expect_errors = true
	var root: String = job.arg("root", "res://addons/agentkit/ui")
	var files: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var d: String = stack.pop_back()
		for f in DirAccess.get_files_at(d):
			if f.ends_with(".gd") and f != "ui_selftest.gd":   # reloading the running module breaks the call
				files.append(d.path_join(f))
		for s in DirAccess.get_directories_at(d):
			stack.append(d.path_join(s))
	var failed: Array = []
	for f in files:
		var before: int = job.captured_error_count()
		var s = ResourceLoader.load(f, "GDScript", ResourceLoader.CACHE_MODE_IGNORE)
		var errs: Array = job.captured_errors().slice(before)
		if s == null or not errs.is_empty():
			var msgs: Array = []
			for e in errs.slice(0, 5):
				msgs.append("%s:%s %s" % [e.get("file", ""), e.get("line", ""), e["message"]])
			failed.append({"path": f, "errors": msgs})
	return {"ok": failed.is_empty(), "checked": files.size(), "failed": failed}
