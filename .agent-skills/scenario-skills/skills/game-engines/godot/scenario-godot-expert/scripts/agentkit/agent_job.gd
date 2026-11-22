extends SceneTree
## AgentKit job base (scenario-godot-expert 0.1, Godot 4.7.2).
##
## Run through gd_run.run_script(), or by hand:
##   godot --headless --path <project> --script res://my_job.gd -- --agent-args '{"n": 3}'
##
## Write a job by extending this script and overriding run():
##   extends "res://addons/agentkit/agent_job.gd"
##   func run() -> Dictionary:
##       var scene := await load_scene("res://main.tscn")
##       return {"ok": true, "children": scene.get_child_count()}
##
## Or call a method of any RefCounted module without writing a job:
##   --script res://addons/agentkit/agent_job.gd -- --agent-call res://addons/agentkit/agent_audit.gd:project
## The module method receives this job (a SceneTree) and returns a Dictionary.
##
## The job always ends with one stdout line `AGENT_RESULT {json}`, writes the same JSON to
## --agent-result <path> when given, and quits: exit 0 when ok, 1 when not ok, 124 on timeout.
## Errors logged while the job runs (parse, script, shader, engine) are captured with a Logger
## (OS.add_logger, Godot 4.5+) and make the job fail unless `expect_errors` is set.

const VERSION := "0.1"

var args: Dictionary = {}
var out_dir: String = ""
var result_path: String = ""
var job_timeout: float = 300.0
var call_spec: String = ""
## Set true in jobs that provoke errors on purpose (they are still reported).
var expect_errors: bool = false
## Extra keys merged into the final result (see note()).
var notes: Dictionary = {}
## Substrings of message or engine file that mark a logged error as benign (reported apart, never
## failing the job). Headless runs add "servers/rendering/dummy/": the dummy renderer has no
## textures, so editor saves log 'Parameter "t" is null' while generating thumbnails (4.7.2).
var ignore_patterns: Array[String] = []

var _finished := false
var _t0_usec := 0
var _logger: _Capture


class _Capture extends Logger:
	var mutex := Mutex.new()
	var errors: Array = []
	var warnings: Array = []

	func _log_error(function: String, file: String, line: int, code: String, rationale: String,
			editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
		var kinds := ["error", "warning", "script", "shader"]
		var e := {
			"type": kinds[error_type] if error_type >= 0 and error_type < kinds.size() else str(error_type),
			"message": rationale if rationale != "" else code,
			"code": code,
			"function": function,
			"file": file,
			"line": line,
		}
		if not script_backtraces.is_empty() and not script_backtraces[0].is_empty():
			var bt: ScriptBacktrace = script_backtraces[0]
			e["script_file"] = bt.get_frame_file(0)
			e["script_line"] = bt.get_frame_line(0)
		mutex.lock()
		if error_type == 1:
			if warnings.size() < 200:
				warnings.append(e)
		elif errors.size() < 200:
			errors.append(e)
		mutex.unlock()

	func _log_message(_message: String, _error: bool) -> void:
		pass


func _initialize() -> void:
	_t0_usec = Time.get_ticks_usec()
	_parse_cmdline()
	_logger = _Capture.new()
	OS.add_logger(_logger)
	if job_timeout > 0.0:
		create_timer(job_timeout, true, false, true).timeout.connect(_on_timeout)
	# Nodes added during _initialize are not inside the tree yet (verified 4.7.2): wait one frame.
	await process_frame
	var res = await run()
	if _finished:
		return
	if res == null:
		finish({"ok": false, "error": "run() returned null: a script error aborted it, or it has no return"})
	elif res is Dictionary and (res as Dictionary).is_empty():
		# A script error aborts a typed `run() -> Dictionary` and it returns {} (verified 4.7.2): with
		# expect_errors set, that used to pass as ok true. An empty result is always a failure.
		finish({"ok": false, "aborted": true, "error": "run() returned an empty Dictionary: a script error aborted it (return at least {\"ok\": true})"})
	elif res is Dictionary:
		finish(res)
	else:
		finish({"ok": true, "value": res})


## Override in a job. Default: dispatch --agent-call <res://module.gd:method>.
func run() -> Dictionary:
	if call_spec == "":
		return {"ok": false, "error": "no run() override and no --agent-call given"}
	var idx := call_spec.rfind(":")
	if idx <= 6:
		return {"ok": false, "error": "--agent-call must look like res://path.gd:method, got " + call_spec}
	var path := call_spec.substr(0, idx)
	var method := call_spec.substr(idx + 1)
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "module not found: " + path}
	var scr = load(path)
	if scr == null or not (scr is Script):
		return {"ok": false, "error": "cannot load module " + path + " (parse error?)"}
	var target: Object = scr.new()
	if not target.has_method(method):
		return {"ok": false, "error": "%s has no method %s" % [path, method]}
	var r = await target.call(method, self)
	if r == null:
		return {"ok": false, "error": "%s:%s returned null (script error?)" % [path, method]}
	if r is Dictionary and (r as Dictionary).is_empty():
		return {"ok": false, "aborted": true, "error": "%s:%s returned an empty Dictionary (a script error aborted it?)" % [path, method]}
	if r is Dictionary:
		return r
	return {"ok": true, "value": r}


# ------------------------------------------------------------------ helpers for jobs

## Typed argument lookup: the default's type decides the conversion (int, float, bool, Array, String).
func arg(name: String, default: Variant = null) -> Variant:
	if not args.has(name):
		return default
	var v = args[name]
	match typeof(default):
		TYPE_INT:
			return int(v)
		TYPE_FLOAT:
			return float(v)
		TYPE_BOOL:
			if v is bool:
				return v
			return str(v).to_lower() in ["1", "true", "yes", "on"]
		TYPE_STRING:
			return str(v)
		TYPE_VECTOR2I:
			if v is Array and v.size() >= 2:
				return Vector2i(int(v[0]), int(v[1]))
		TYPE_VECTOR2:
			if v is Array and v.size() >= 2:
				return Vector2(float(v[0]), float(v[1]))
		TYPE_VECTOR3:
			if v is Array and v.size() >= 3:
				return Vector3(float(v[0]), float(v[1]), float(v[2]))
	return v


## Absolute path for an output file: absolute paths and res:// or user:// paths pass through,
## relative ones land in out_dir (default <project>/.agent_out, which holds a .gdignore).
func out_path(rel: String) -> String:
	var p := rel
	if not (rel.is_absolute_path() or rel.begins_with("res://") or rel.begins_with("user://")):
		var base := out_dir if out_dir != "" else ProjectSettings.globalize_path("res://.agent_out")
		p = base.path_join(rel)
	var dir := p.get_base_dir()
	if dir.begins_with("res://") or dir.begins_with("user://"):
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	else:
		DirAccess.make_dir_recursive_absolute(dir)
	return p


## Instantiate a scene under root, wait `frames` process frames, return its root node (or null).
func load_scene(path: String, frames: int = 1) -> Node:
	if not ResourceLoader.exists(path):
		push_error("load_scene: no scene at " + path)
		return null
	var ps = load(path)
	if not (ps is PackedScene):
		push_error("load_scene: not a PackedScene: " + path)
		return null
	var node: Node = ps.instantiate()
	root.add_child(node)
	if node is Node3D or node is Node2D or node is Control:
		current_scene = node
	await wait_frames(frames)
	return node


func wait_frames(n: int = 1) -> void:
	for i in range(max(n, 0)):
		await process_frame


func wait_physics_frames(n: int = 1) -> void:
	for i in range(max(n, 0)):
		await physics_frame


func wait_seconds(s: float) -> void:
	await create_timer(s, true, false, true).timeout


## Add a key to the final result.
func note(key: String, value: Variant) -> void:
	notes[key] = value


func is_headless() -> bool:
	return DisplayServer.get_name() == "headless"


## Errors captured so far (each: type, message, code, function, file, line, script_file, script_line).
func captured_errors() -> Array:
	_logger.mutex.lock()
	var e := _logger.errors.duplicate()
	_logger.mutex.unlock()
	return e


func captured_error_count() -> int:
	_logger.mutex.lock()
	var n := _logger.errors.size()
	_logger.mutex.unlock()
	return n


## Print AGENT_RESULT, write the result file, quit. Safe to call once; later calls are ignored.
## code < 0 picks 0 when ok and 1 otherwise. Code after finish() in the same frame still runs:
## `finish(...)` then `return {}`.
func finish(data: Dictionary = {}, code: int = -1) -> void:
	if _finished:
		return
	_finished = true
	var payload: Dictionary = data.duplicate(true)
	for k in notes:
		if not payload.has(k):
			payload[k] = notes[k]
	if not payload.has("ok"):
		payload["ok"] = true
	_logger.mutex.lock()
	var all_errs: Array = _logger.errors.duplicate()
	var warns: Array = _logger.warnings.duplicate()
	_logger.mutex.unlock()
	OS.remove_logger(_logger)
	var pats: Array[String] = ignore_patterns.duplicate()
	if is_headless():
		pats.append("servers/rendering/dummy/")
	var errs: Array = []
	var benign: Array = []
	for e in all_errs:
		var hit := false
		for pat in pats:
			if str(e.get("message", "")).contains(pat) or str(e.get("file", "")).contains(pat):
				hit = true
				break
		if hit:
			benign.append(e)
		else:
			errs.append(e)
	payload["captured_errors"] = errs.slice(0, 50)
	payload["benign_errors"] = benign.slice(0, 20)
	payload["captured_warnings"] = warns.slice(0, 20)
	payload["captured_error_count"] = errs.size()
	if not errs.is_empty() and not expect_errors and payload["ok"]:
		payload["ok"] = false
		if not payload.has("error"):
			payload["error"] = "%d error(s) logged during the job, first: %s" % [errs.size(), errs[0]["message"]]
	payload["job"] = {
		"script": (get_script() as Script).resource_path,
		"call": call_spec,
		"args": args,
		"expect_errors": expect_errors,
		"agentkit": VERSION,
		"godot": Engine.get_version_info().get("string", ""),
		"renderer": RenderingServer.get_current_rendering_method(),
		"display": DisplayServer.get_name(),
		"frames_drawn": Engine.get_frames_drawn(),
		"elapsed_s": float(Time.get_ticks_usec() - _t0_usec) / 1e6,
	}
	var text := JSON.stringify(to_json_safe(payload))
	if result_path != "":
		var p := result_path
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(p.get_base_dir()))
		var f := FileAccess.open(p, FileAccess.WRITE)
		if f:
			f.store_string(text)
			f.close()
	print("AGENT_RESULT " + text)
	if code < 0:
		code = 0 if payload["ok"] else 1
	quit(code)


func _on_timeout() -> void:
	finish({"ok": false, "timed_out": true, "error": "job timeout after %.0f s" % job_timeout}, 124)


func _parse_cmdline() -> void:
	var ua := OS.get_cmdline_user_args()
	var i := 0
	while i < ua.size():
		var a: String = ua[i]
		var nxt: String = ua[i + 1] if i + 1 < ua.size() else ""
		var has_val := nxt != "" and not nxt.begins_with("--")
		match a:
			"--agent-args":
				var parsed = JSON.parse_string(nxt)
				if parsed is Dictionary:
					for k in parsed:
						args[k] = parsed[k]
				else:
					push_error("--agent-args is not a JSON object: " + nxt)
				i += 2
				continue
			"--agent-result":
				result_path = nxt
				i += 2
				continue
			"--agent-out":
				out_dir = nxt
				i += 2
				continue
			"--agent-timeout":
				job_timeout = float(nxt)
				i += 2
				continue
			"--agent-call":
				call_spec = nxt
				i += 2
				continue
		if a.begins_with("--"):
			var key := a.substr(2)
			if key.contains("="):
				args[key.get_slice("=", 0)] = key.substr(key.find("=") + 1)
				i += 1
			elif has_val:
				args[key] = nxt
				i += 2
			else:
				args[key] = true
				i += 1
		else:
			i += 1


# ------------------------------------------------------------------ JSON helpers (static)

## Convert any Variant into JSON-safe data: vectors and colors become arrays, transforms become
## dictionaries, objects become {class, path} or their node path, NaN and INF become strings.
static func to_json_safe(v: Variant) -> Variant:
	match typeof(v):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_STRING:
			return v
		TYPE_FLOAT:
			if is_nan(v):
				return "nan"
			if is_inf(v):
				return "inf" if v > 0 else "-inf"
			return v
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(v)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return [v.x, v.y]
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return [v.x, v.y, v.z]
		TYPE_VECTOR4, TYPE_VECTOR4I, TYPE_QUATERNION:
			return [v.x, v.y, v.z, v.w]
		TYPE_COLOR:
			return [v.r, v.g, v.b, v.a]
		TYPE_RECT2, TYPE_RECT2I:
			return {"position": [v.position.x, v.position.y], "size": [v.size.x, v.size.y]}
		TYPE_AABB:
			return {"position": to_json_safe(v.position), "size": to_json_safe(v.size)}
		TYPE_BASIS:
			return [to_json_safe(v.x), to_json_safe(v.y), to_json_safe(v.z)]
		TYPE_TRANSFORM3D:
			return {"basis": to_json_safe(v.basis), "origin": to_json_safe(v.origin)}
		TYPE_TRANSFORM2D:
			return {"x": to_json_safe(v.x), "y": to_json_safe(v.y), "origin": to_json_safe(v.origin)}
		TYPE_DICTIONARY:
			var d := {}
			for k in v:
				d[str(k)] = to_json_safe(v[k])
			return d
		TYPE_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, \
		TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_VECTOR2_ARRAY, \
		TYPE_PACKED_VECTOR3_ARRAY, TYPE_PACKED_COLOR_ARRAY, TYPE_PACKED_VECTOR4_ARRAY:
			var a := []
			for x in v:
				a.append(to_json_safe(x))
			return a
		TYPE_PACKED_BYTE_ARRAY:
			return {"bytes": v.size()}
		TYPE_OBJECT:
			if v == null or not is_instance_valid(v):
				return null
			if v is Node:
				return str(v.get_path()) if v.is_inside_tree() else v.name
			if v is Resource:
				return {"class": v.get_class(), "path": v.resource_path}
			return {"class": v.get_class()}
	return str(v)


static func save_json(path: String, data: Variant) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(to_json_safe(data), "  "))
	f.close()
	return true
