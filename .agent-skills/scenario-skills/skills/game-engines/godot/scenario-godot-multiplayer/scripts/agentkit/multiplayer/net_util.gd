extends RefCounted
## NetUtil (scenario-godot-multiplayer 0.1, Godot 4.7.2): transport-neutral peer creation and measurements.
##
##   const NetUtil = preload("res://addons/agentkit/multiplayer/net_util.gd")
##   var peer := NetUtil.make_server("enet", 24010, 8)       # or "websocket"
##   multiplayer.multiplayer_peer = peer
##
## Copied into a project by gd_net.install_netkit(project) (res://addons/agentkit/multiplayer/).


## Server peer for a transport: "enet" (UDP, desktop and mobile) or "websocket" (TCP, the only
## client-server transport a browser build has). Returns null and pushes an error on failure.
static func make_server(transport: String, port: int, max_clients: int = 32, bind_ip: String = "*") -> MultiplayerPeer:
	var err := OK
	match transport:
		"enet":
			var p := ENetMultiplayerPeer.new()
			err = p.create_server(port, max_clients)
			if err == OK and bind_ip != "*":
				p.set_bind_ip(bind_ip)
			if err == OK:
				return p
		"websocket":
			var w := WebSocketMultiplayerPeer.new()
			err = w.create_server(port)
			if err == OK:
				return w
		_:
			push_error("NetUtil.make_server: unknown transport " + transport)
			return null
	push_error("NetUtil.make_server(%s, %d): %s" % [transport, port, error_string(err)])
	return null


## Client peer. `address` is an IP or host name; WebSocket builds the ws:// URL (use wss:// behind TLS).
static func make_client(transport: String, address: String, port: int) -> MultiplayerPeer:
	var err := OK
	match transport:
		"enet":
			var p := ENetMultiplayerPeer.new()
			err = p.create_client(address, port)
			if err == OK:
				return p
		"websocket":
			var w := WebSocketMultiplayerPeer.new()
			var url := address if address.begins_with("ws") else "ws://%s:%d" % [address, port]
			err = w.create_client(url)
			if err == OK:
				return w
		_:
			push_error("NetUtil.make_client: unknown transport " + transport)
			return null
	push_error("NetUtil.make_client(%s, %s:%d): %s" % [transport, address, port, error_string(err)])
	return null


## Round-trip time ENet measured to the server (ms), or -1 when not ENet / not connected.
static func enet_rtt_ms(api: MultiplayerAPI, peer_id: int = 1) -> float:
	var p := api.multiplayer_peer as ENetMultiplayerPeer
	if p == null:
		return -1.0
	var pp := p.get_peer(peer_id)
	if pp == null:
		return -1.0
	return float(pp.get_statistic(ENetPacketPeer.PEER_ROUND_TRIP_TIME))


## ENet's packet throttle for one peer: 32 = every unreliable packet goes out; lower values make
## ENet DROP unreliable packets (unreliable RPCs, ALWAYS synchronizers) before they are sent. It falls
## when the measured RTT rises above its running mean (load spikes, Wi-Fi). Returns {} off ENet.
static func enet_throttle(api: MultiplayerAPI, peer_id: int) -> Dictionary:
	var p := api.multiplayer_peer as ENetMultiplayerPeer
	if p == null:
		return {}
	var pp := p.get_peer(peer_id)
	if pp == null:
		return {}
	return {"throttle": pp.get_statistic(ENetPacketPeer.PEER_PACKET_THROTTLE),
			"rtt": pp.get_statistic(ENetPacketPeer.PEER_ROUND_TRIP_TIME),
			"rtt_var": pp.get_statistic(ENetPacketPeer.PEER_ROUND_TRIP_TIME_VARIANCE)}


## Bytes sent and received by the ENet host since the last call (pop_statistic resets the counter).
## Returns {} for other transports.
static func enet_pop_bytes(api: MultiplayerAPI) -> Dictionary:
	var p := api.multiplayer_peer as ENetMultiplayerPeer
	if p == null or p.host == null:
		return {}
	return {
		"sent": p.host.pop_statistic(ENetConnection.HOST_TOTAL_SENT_DATA),
		"received": p.host.pop_statistic(ENetConnection.HOST_TOTAL_RECEIVED_DATA),
		"sent_packets": p.host.pop_statistic(ENetConnection.HOST_TOTAL_SENT_PACKETS),
		"received_packets": p.host.pop_statistic(ENetConnection.HOST_TOTAL_RECEIVED_PACKETS),
	}


## Wall clock shared by every process on one machine (seconds, microsecond resolution).
static func wall() -> float:
	return Time.get_unix_time_from_system()


## Every node under `root` whose name is auto-generated (@Class@N): these names differ between peers
## and break RPC and synchronizer paths. Fix: name nodes yourself or add_child(node, true).
static func auto_named(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if str(n.name).begins_with("@"):
			out.append(str(root.get_path_to(n)))
		for c in n.get_children():
			stack.append(c)
	return out


## Authority report for the children of a players root: name, body authority, input authority.
static func authority_report(players_root: Node, input_child: String = "Input") -> Array:
	var rows: Array = []
	for p in players_root.get_children():
		var row := {"name": str(p.name), "body": p.get_multiplayer_authority()}
		var inp := p.get_node_or_null(input_child)
		if inp:
			row["input"] = inp.get_multiplayer_authority()
		rows.append(row)
	return rows
