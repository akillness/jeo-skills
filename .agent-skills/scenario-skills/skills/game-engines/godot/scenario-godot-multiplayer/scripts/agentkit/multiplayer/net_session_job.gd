extends "res://addons/agentkit/agent_job.gd"
## One role of a NetLab session as an AgentKit job (scenario-godot-multiplayer 0.1, Godot 4.7.2).
## Run through gd_net.session(); every job argument is a NetLab cfg key (see net_lab.gd), plus
##   world: scene to load at /root/World (default res://net/world.tscn)
##   expect_errors: true when the run provokes engine errors on purpose (auth failures, bad RPCs)


func run() -> Dictionary:
	expect_errors = arg("expect_errors", false)
	# Two peers leaving in the same server frame log this once (ENet peer already reset while
	# SceneMultiplayer still sends to it; observed 4.7.2, harmless). Whitelisted by exact text only.
	# The WebSocket server logs the same race as 'Condition "ready_state != STATE_OPEN" is true'.
	if arg("ignore_disconnect_race", true):
		ignore_patterns.append("Unable to send packet on channel 0, max channels: 0")
		ignore_patterns.append("Condition \"ready_state != STATE_OPEN\" is true. Returning: FAILED")
	for p in arg("ignore", []):
		ignore_patterns.append(str(p))
	var world := await load_scene(arg("world", "res://net/world.tscn"), 1)
	if world == null or str(world.name) != "World":
		return {"ok": false, "error": "world scene must load with root name World (RPC paths)"}
	var lab := world.get_node("NetLab")
	lab.job = self
	var cfg := args.duplicate()
	cfg.erase("world")
	cfg.erase("expect_errors")
	lab.start(cfg)
	var res: Dictionary = await lab.finished
	return res
