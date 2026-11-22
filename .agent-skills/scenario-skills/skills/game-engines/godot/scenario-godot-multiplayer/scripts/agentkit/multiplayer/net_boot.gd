extends Node
## NetBoot (scenario-godot-multiplayer 0.1): starts NetLab in an EXPORTED build, from the main scene.
##
## Server detection, in this order (Godot docs, "Exporting for dedicated servers"):
##   OS.has_feature("dedicated_server")   the preset's export mode is "Export as dedicated server"
##   "--server" in OS.get_cmdline_user_args()   a flag after `--` (editor runs, plain exports)
##   DisplayServer.get_name() == "headless" is reported, never used alone: every agent run is headless.
## Clients: `-- --client --port=24070 --address=127.0.0.1`. Other user args: --duration=, --lobby_size=,
## --result=<file> (also writes the AGENT_RESULT JSON there). Idle when none of these is present, so the
## scene is safe to load in agent jobs and in the editor.

const AgentJob = preload("res://addons/agentkit/agent_job.gd")

var _result_path := ""


func _ready() -> void:
	var ua := OS.get_cmdline_user_args()
	var dedicated := OS.has_feature("dedicated_server")
	var want_server := dedicated or "--server" in ua
	var want_client := "--client" in ua
	if not (want_server or want_client):
		return
	var cfg := {"role": "server" if want_server else "client"}
	for a in ua:
		if a.begins_with("--") and a.contains("="):
			var k := a.substr(2, a.find("=") - 2)
			var v := a.substr(a.find("=") + 1)
			if k == "result":
				_result_path = v
			elif v.is_valid_int():
				cfg[k] = v.to_int()
			elif v.is_valid_float():
				cfg[k] = v.to_float()
			else:
				cfg[k] = v
	var lab := get_node("../NetLab")
	lab.set_meta("boot", {
		"dedicated_server_feature": dedicated,
		"server_flag": "--server" in ua,
		"display": DisplayServer.get_name(),
		"audio_driver": AudioServer.get_driver_name(),
		"headless_arg": "--headless" in OS.get_cmdline_args(),
		"template": OS.has_feature("template"),
		"debug_build": OS.is_debug_build(),
		"executable": OS.get_executable_path(),
		"godot": Engine.get_version_info().get("string", ""),
	})
	lab.finished.connect(_on_finished)
	lab.start(cfg)


func _on_finished(res: Dictionary) -> void:
	res["boot"] = get_node("../NetLab").get_meta("boot", {})
	res.erase("traj")
	var text := JSON.stringify(AgentJob.to_json_safe(res))
	if _result_path != "":
		var f := FileAccess.open(_result_path, FileAccess.WRITE)
		if f:
			f.store_string(text)
			f.close()
	print("AGENT_RESULT " + text)
	get_tree().quit(0 if res.get("ok", false) else 1)
