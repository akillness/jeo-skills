extends Node
## NetLab (scenario-godot-multiplayer 0.1, Godot 4.7.2): one role of a measured multiplayer session.
##
## Lives at /root/World/NetLab on every peer (same path everywhere, so its RPCs resolve).
## start(cfg) runs a server or a client; `finished(result)` fires with the measurements.
## Driven by net_session_job.gd (agent runs) or net_boot.gd (exported builds).
##
## cfg keys (defaults in DEFAULTS): role, transport (enet|websocket), address, port, auth (server|client),
## host_player, lobby_size, min_clients, duration, leave_at, connect_delay, move_delay, index, cheat_at,
## ping_every, sample_hz, server_timeout, client_timeout, props, prop_scene, prop_interval,
## props_private, prop_moving, password, auth_timeout, send_auth, server_relay, bw_every, enet_throttle, trace,
## capture_at, capture_out.

signal finished(result: Dictionary)

const NetUtil = preload("res://addons/agentkit/multiplayer/net_util.gd")
const NetPlayer = preload("res://addons/agentkit/multiplayer/net_player.gd")
const NetProp = preload("res://addons/agentkit/multiplayer/net_prop.gd")
const PLAYER_SCENE := "res://net/player.tscn"
const OMEGA := TAU / 4.0  ## clients steer around a circle in 4 s

const DEFAULTS := {
	"role": "server", "transport": "enet", "address": "127.0.0.1", "port": 24010, "max_clients": 32,
	"auth": "server", "host_player": false, "lobby_size": 2, "min_clients": -1, "duration": 4.0,
	"leave_at": 0.0, "connect_delay": 0.0, "move_delay": 0.5, "index": 0, "cheat_at": 0.0,
	"ping_every": 0.25, "sample_hz": 30.0, "server_timeout": 40.0, "client_timeout": 30.0,
	"props": 0, "prop_scene": "res://net/prop_always.tscn", "prop_interval": 0.0, "props_private": 0,
	"prop_moving": true, "password": "", "auth_timeout": 3.0, "send_auth": true, "server_relay": true,
	"bw_every": 1.0, "enet_throttle": "", "trace": true, "capture_at": 0.0, "capture_out": "captures/observer.png",
}

var cfg: Dictionary = {}
var role := ""
var job: Object = null   ## the AgentKit job, when run through net_session_job.gd (captures)
var players: Node3D
var props_root: Node3D
var sm: SceneMultiplayer

var events: Array = []
var traj: Array = []
var bandwidth: Array = []
var rtts: Array = []
var max_extent: Dictionary = {}
var appeared: Dictionary = {}
var removed: Dictionary = {}
var connected_at: Dictionary = {}
var disconnected_at: Dictionary = {}
var ready_peers: Dictionary = {}
var authority_rows: Array = []
var enter_checks: Array = []
var spawned_signals := 0
var despawned_signals := 0
var props_seen_max := 0
var players_seen_max := 0
var my_id := 0
var match_started := false
var match_start_wall := 0.0      ## local wall time when this peer started the match
var match_start_server := 0.0    ## server wall time sent with start_match
var input_start_wall := -1.0
var first_move_wall := -1.0
var start_pos := Vector3.ZERO
var cheat_done := false
var cheat_after: Dictionary = {}
var capture_result: Dictionary = {}

var _t0 := 0.0
var _frames := 0
var _pframes := 0
var _sample_acc := 0.0
var _bw_acc := 0.0
var _ping_acc := 0.0
var _done := false
var _finishing := false
var _connected := false
var _ever_connected := 0


func cfgv(key: String) -> Variant:
	return cfg.get(key, DEFAULTS.get(key))


func event(e: Dictionary) -> void:
	e["t"] = snappedf(NetUtil.wall() - _t0, 0.001)
	events.append(e)


func start(c: Dictionary) -> void:
	cfg = DEFAULTS.duplicate()
	for k in c:
		cfg[k] = c[k]
	role = str(cfg["role"])
	_t0 = NetUtil.wall()
	NetPlayer.auth_mode = str(cfg["auth"])
	NetProp.moving = bool(cfg["prop_moving"])
	players = get_node("../Players")
	props_root = get_node("../Props")
	sm = multiplayer as SceneMultiplayer
	sm.server_relay = bool(cfg["server_relay"])   # set before the peer is assigned
	players.child_entered_tree.connect(_on_player_entered)
	players.child_exiting_tree.connect(_on_player_exiting)
	var spawner := get_node_or_null("../PlayerSpawner") as MultiplayerSpawner
	if spawner:
		spawner.spawned.connect(func(_n: Node) -> void: spawned_signals += 1)
		spawner.despawned.connect(func(_n: Node) -> void: despawned_signals += 1)
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	if role == "server":
		_start_server()
	else:
		_start_client()


# ------------------------------------------------------------------ server

func _start_server() -> void:
	var peer := NetUtil.make_server(str(cfg["transport"]), int(cfg["port"]), int(cfg["max_clients"]))
	if peer == null:
		_finish({"ok": false, "error": "create_server failed on port %d" % int(cfg["port"])})
		return
	if str(cfg["password"]) != "":
		sm.auth_timeout = float(cfg["auth_timeout"])
		sm.auth_callback = _server_auth
		sm.peer_authenticating.connect(func(id: int) -> void: event({"type": "authenticating", "peer": id}))
		sm.peer_authentication_failed.connect(func(id: int) -> void: event({"type": "auth_failed", "peer": id}))
	multiplayer.multiplayer_peer = peer
	_connected = true
	my_id = 1
	event({"type": "listening", "transport": cfg["transport"], "port": cfg["port"]})
	if bool(cfg["host_player"]):
		_spawn_player(1)   # a listen server gets no peer_connected for itself
	for i in range(int(cfg["props"])):
		var prop: Node3D = (load(str(cfg["prop_scene"])) as PackedScene).instantiate()
		prop.name = "P%d" % i
		prop.position = Vector3(float(i % 10) * 1.5, 0.5, floorf(i / 10.0) * 1.5)
		props_root.add_child(prop, true)
		var ps := prop.get_node("PropSync") as MultiplayerSynchronizer
		ps.replication_interval = float(cfg["prop_interval"])
		ps.delta_interval = float(cfg["prop_interval"])
		if i >= int(cfg["props"]) - int(cfg["props_private"]):
			ps.public_visibility = false


func _server_auth(id: int, data: PackedByteArray) -> void:
	var ok := data.get_string_from_utf8() == str(cfg["password"])
	event({"type": "auth_payload", "peer": id, "accepted": ok})
	if ok:
		sm.complete_auth(id)
	else:
		sm.disconnect_peer(id)


func _spawn_player(id: int) -> void:
	if players.has_node(str(id)):
		return
	var p: CharacterBody3D = (load(PLAYER_SCENE) as PackedScene).instantiate()
	p.name = str(id)
	p.set("peer_id", id)
	var i := players.get_child_count()
	p.position = Vector3(cos(i * TAU / 8.0) * 4.0, 0.0, sin(i * TAU / 8.0) * 4.0)
	players.add_child(p, true)


func _on_peer_connected(id: int) -> void:
	connected_at[id] = snappedf(NetUtil.wall() - _t0, 0.001)
	event({"type": "peer_connected", "peer": id})
	if role != "server":
		return
	_ever_connected += 1
	if str(cfg["enet_throttle"]) != "":
		# "interval,acceleration,deceleration" for ENetPacketPeer.throttle_configure; deceleration 0
		# keeps the throttle at its start value, so unreliable packets are never dropped by ENet.
		var enet := multiplayer.multiplayer_peer as ENetMultiplayerPeer
		var parts := str(cfg["enet_throttle"]).split(",")
		if enet and enet.get_peer(id) and parts.size() == 3:
			enet.get_peer(id).throttle_configure(int(parts[0]), int(parts[1]), int(parts[2]))
	_spawn_player(id)
	if int(cfg["props_private"]) > 0 and _ever_connected == 1:
		for c in props_root.get_children():
			var ps := c.get_node("PropSync") as MultiplayerSynchronizer
			if not ps.public_visibility:
				ps.set_visibility_for(id, true)


func _on_peer_disconnected(id: int) -> void:
	disconnected_at[id] = snappedf(NetUtil.wall() - _t0, 0.001)
	event({"type": "peer_disconnected", "peer": id})
	if role != "server":
		return
	ready_peers.erase(id)
	var n := players.get_node_or_null(str(id))
	if n:
		n.queue_free()


## Lobby gate: each client reports ready; the match starts when lobby_size peers are ready.
## Peers that report later (late join) get start_match at once.
@rpc("any_peer", "call_remote", "reliable")
func player_ready() -> void:
	if role != "server":
		return
	var id := multiplayer.get_remote_sender_id()
	ready_peers[id] = true
	event({"type": "ready", "peer": id})
	if match_started:
		start_match.rpc_id(id, match_start_server)
	elif ready_peers.size() >= int(cfg["lobby_size"]):
		match_started = true
		match_start_wall = NetUtil.wall()
		match_start_server = match_start_wall
		event({"type": "match_start", "ready": ready_peers.keys()})
		start_match.rpc(match_start_server)


@rpc("authority", "call_remote", "reliable")
func start_match(server_wall: float) -> void:
	match_started = true
	match_start_wall = NetUtil.wall()
	match_start_server = server_wall
	event({"type": "start_match_received", "server_wall_delta_ms": snappedf((match_start_wall - server_wall) * 1000.0, 0.01)})


@rpc("any_peer", "call_remote", "reliable")
func ping(t_usec: int) -> void:
	if role != "server":
		return
	pong.rpc_id(multiplayer.get_remote_sender_id(), t_usec)


@rpc("authority", "call_remote", "reliable")
func pong(t_usec: int) -> void:
	rtts.append(snappedf((Time.get_ticks_usec() - t_usec) / 1000.0, 0.01))


# ------------------------------------------------------------------ client

func _start_client() -> void:
	var delay := float(cfg["connect_delay"])
	if delay > 0.0:
		await get_tree().create_timer(delay).timeout
	if str(cfg["password"]) != "" and bool(cfg["send_auth"]):
		# A client needs an auth_callback too, or peer_authenticating never fires (docs).
		sm.auth_callback = func(_id: int, _data: PackedByteArray) -> void: pass
		sm.peer_authenticating.connect(_client_authenticating)
	sm.peer_authentication_failed.connect(func(id: int) -> void: event({"type": "auth_failed", "peer": id}))
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void:
		event({"type": "connection_failed"})
		_finish({"ok": false, "error": "connection_failed"}))
	multiplayer.server_disconnected.connect(func() -> void:
		event({"type": "server_disconnected"})
		if not _finishing:
			_finish_client("server_disconnected"))
	var peer := NetUtil.make_client(str(cfg["transport"]), str(cfg["address"]), int(cfg["port"]))
	if peer == null:
		_finish({"ok": false, "error": "create_client failed"})
		return
	multiplayer.multiplayer_peer = peer
	event({"type": "connecting", "port": cfg["port"]})


func _client_authenticating(id: int) -> void:
	event({"type": "authenticating", "peer": id})
	sm.send_auth(id, str(cfg["password"]).to_utf8_buffer())
	sm.complete_auth(id)


func _on_connected() -> void:
	_connected = true
	my_id = multiplayer.get_unique_id()
	event({"type": "connected_to_server", "id": my_id})
	player_ready.rpc_id(1)


func _client_tick(delta: float) -> void:
	if not _connected or not match_started:
		return
	var since := NetUtil.wall() - match_start_wall
	if float(cfg["leave_at"]) > 0.0 and since >= float(cfg["leave_at"]):
		_finish_client("left")
		return
	if since >= float(cfg["duration"]):
		_finish_client("duration")
		return
	_ping_acc += delta
	if _ping_acc >= float(cfg["ping_every"]):
		_ping_acc = 0.0
		ping.rpc_id(1, Time.get_ticks_usec())
	var own := players.get_node_or_null(str(my_id)) as Node3D
	if own == null:
		return
	var tau := since - float(cfg["move_delay"])
	if tau >= 0.0:
		var phase := float(int(cfg["index"])) * TAU / 3.0
		if input_start_wall < 0.0:
			input_start_wall = NetUtil.wall()
			start_pos = own.position
		own.get_node("Input").set("move", Vector2(cos(OMEGA * tau + phase), sin(OMEGA * tau + phase)))
	if input_start_wall > 0.0 and first_move_wall < 0.0 and own.position.distance_to(start_pos) > 0.02:
		first_move_wall = NetUtil.wall()
	var cheat_at := float(cfg["cheat_at"])
	if cheat_at > 0.0 and not cheat_done and since >= cheat_at:
		cheat_done = true
		_cheat(own)


func _cheat(own: Node3D) -> void:
	var legit_target := own.position + Vector3(0.3, 0.0, 0.0)
	own.rpc_id(1, "request_teleport", legit_target)                         # small, own body: accepted
	for p in players.get_children():
		if p != own:
			p.rpc_id(1, "request_teleport", (p as Node3D).position + Vector3(0.3, 0.0, 0.0))   # someone else's body
			break
	own.rpc_id(1, "request_teleport", own.position + Vector3(30.0, 0.0, 0.0))  # too far
	own.position = Vector3(50.0, 0.0, 50.0)                                    # local write (a speed hack)
	event({"type": "cheat_sent", "auth": cfg["auth"]})
	await get_tree().create_timer(0.4).timeout
	if is_instance_valid(own):
		cheat_after = {"own_position_0_4s": own.position, "overwritten": own.position.length() < 20.0}


# ------------------------------------------------------------------ shared

func _on_player_entered(n: Node) -> void:
	appeared[str(n.name)] = snappedf(NetUtil.wall() - _t0, 0.001)
	players_seen_max = maxi(players_seen_max, players.get_child_count())
	# authority and spawn-state checks, read once the node is ready
	await get_tree().process_frame
	if is_instance_valid(n):
		enter_checks.append({"name": str(n.name), "peer_id_at_enter": n.get("peer_id_at_enter"),
				"body_authority": n.get_multiplayer_authority(),
				"input_authority": n.get_node("Input").get_multiplayer_authority()})


func _on_player_exiting(n: Node) -> void:
	removed[str(n.name)] = snappedf(NetUtil.wall() - _t0, 0.001)


func _process(_delta: float) -> void:
	_pframes += 1


func _physics_process(delta: float) -> void:
	if role == "" or _done:
		return
	_frames += 1
	var elapsed := NetUtil.wall() - _t0
	if role == "server":
		_server_tick(delta, elapsed)
	else:
		if not _connected and elapsed > float(cfg["client_timeout"]) + float(cfg["connect_delay"]):
			_finish({"ok": false, "error": "client never connected"})
			return
		_client_tick(delta)
	_sample(delta)
	var cap_at := float(cfg["capture_at"])
	if cap_at > 0.0 and match_started and capture_result.is_empty() and job != null \
			and NetUtil.wall() - match_start_wall >= cap_at:
		capture_result = {"pending": true}
		_capture()


func _server_tick(delta: float, elapsed: float) -> void:
	_bw_acc += delta
	if _bw_acc >= float(cfg["bw_every"]):
		var b := NetUtil.enet_pop_bytes(multiplayer)
		if not b.is_empty():
			b["t"] = snappedf(elapsed, 0.01)
			b["window_s"] = snappedf(_bw_acc, 0.001)
			b["peers"] = multiplayer.get_peers().size()
			var th := {}
			for pid in multiplayer.get_peers():
				th[str(pid)] = NetUtil.enet_throttle(multiplayer, pid)
			b["throttle"] = th
			bandwidth.append(b)
		_bw_acc = 0.0
	if match_started and authority_rows.is_empty() and NetUtil.wall() - match_start_wall > 1.0:
		authority_rows = NetUtil.authority_report(players)
	var min_clients := int(cfg["min_clients"])
	if min_clients < 0:
		min_clients = int(cfg["lobby_size"])
	if _ever_connected >= min_clients and multiplayer.get_peers().is_empty() and not _finishing:
		_finishing = true
		await get_tree().create_timer(0.3).timeout
		_finish_server("all clients left")
		return
	if elapsed > float(cfg["server_timeout"]) and not _finishing:
		_finishing = true
		_finish_server("server_timeout")


func _sample(delta: float) -> void:
	_sample_acc += delta
	if _sample_acc < 1.0 / float(cfg["sample_hz"]):
		return
	_sample_acc = 0.0
	var t := snappedf(NetUtil.wall(), 0.0001)
	for p in players.get_children():
		var pos := (p as Node3D).position
		var nm := str(p.name)
		max_extent[nm] = maxf(float(max_extent.get(nm, 0.0)), maxf(absf(pos.x), absf(pos.z)))
		if bool(cfg["trace"]):
			traj.append([t, nm.to_int(), snappedf(pos.x, 0.0001), snappedf(pos.z, 0.0001)])
	props_seen_max = maxi(props_seen_max, props_root.get_child_count())
	if role != "server" and match_started and authority_rows.is_empty() and NetUtil.wall() - match_start_wall > 1.0:
		authority_rows = NetUtil.authority_report(players)


func _capture() -> void:
	var cap = load("res://addons/agentkit/agent_capture.gd").new()
	var world := get_parent()
	var r: Dictionary = await cap.capture_node(job, world, str(cfg["capture_out"]), Vector2i(960, 540), "Camera3D", 4)
	capture_result = r


func _finish_client(reason: String) -> void:
	if _finishing:
		return
	_finishing = true
	event({"type": "client_end", "reason": reason})
	var rtt_enet := NetUtil.enet_rtt_ms(multiplayer)
	var names: Array = []
	for p in players.get_children():
		names.append(str(p.name))
	var res := _common()
	res["reason"] = reason
	res["enet_rtt_ms"] = rtt_enet
	res["players_final"] = names
	res["input_to_motion_ms"] = snappedf((first_move_wall - input_start_wall) * 1000.0, 0.01) if first_move_wall > 0.0 else -1.0
	res["cheat_after"] = cheat_after
	if not capture_result.is_empty() and capture_result.has("pending"):
		await get_tree().create_timer(1.0).timeout
	res["capture"] = capture_result
	if multiplayer.multiplayer_peer:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	await get_tree().process_frame
	res["ok"] = true
	_finish(res)


func _finish_server(reason: String) -> void:
	event({"type": "server_end", "reason": reason})
	var res := _common()
	res["reason"] = reason
	res["ever_connected"] = _ever_connected
	res["ready_peers"] = ready_peers.keys()
	var accepted := 0
	var rejected := 0
	for e in events:
		if e.get("type", "") == "teleport_request":
			if e.get("accepted", false):
				accepted += 1
			else:
				rejected += 1
	res["teleport_accepted"] = accepted
	res["teleport_rejected"] = rejected
	if multiplayer.multiplayer_peer:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	res["ok"] = true
	_finish(res)


func _common() -> Dictionary:
	var elapsed := NetUtil.wall() - _t0
	var sorted_rtts := rtts.duplicate()
	sorted_rtts.sort()
	var props_now := props_root.get_child_count()
	return {
		"role": role, "id": my_id, "transport": cfg["transport"], "auth": cfg["auth"], "t0_wall": _t0,
		"match_started": match_started, "match_start_wall": match_start_wall, "match_start_server": match_start_server,
		"events": events, "connected_at": connected_at, "disconnected_at": disconnected_at,
		"appeared": appeared, "removed": removed, "players_seen_max": players_seen_max,
		"spawned_signals": spawned_signals, "despawned_signals": despawned_signals,
		"authority": authority_rows, "enter_checks": enter_checks, "max_extent": max_extent,
		"rtt_ms": sorted_rtts, "rtt_median_ms": sorted_rtts[int(sorted_rtts.size() * 0.5)] if not sorted_rtts.is_empty() else -1.0,
		"bandwidth": bandwidth, "props_seen_max": props_seen_max, "props_final": props_now,
		"physics_hz": snappedf(_frames / maxf(elapsed, 0.001), 0.1),
		"process_fps": snappedf(_pframes / maxf(elapsed, 0.001), 0.1), "elapsed_s": snappedf(elapsed, 0.001),
		"peers_final": Array(multiplayer.get_peers()), "auto_named": NetUtil.auto_named(get_parent()),
		"traj": traj,
	}


func _finish(res: Dictionary) -> void:
	if _done:
		return
	_done = true
	if not res.has("events"):
		res["events"] = events
	finished.emit.call_deferred(res)   # deferred: a failure inside start() still reaches an await
