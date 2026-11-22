# scenario-godot-multiplayer procedures (Godot 4.7.2)

Every procedure (P1 to P13 round 1, P14 round 2) ran live in Godot 4.7.2.stable on 2026-10-02
(macOS, Apple Silicon) through the scenario-godot-expert toolkit plus this skill's harness. Tests:
`tests/code/godot-multiplayer/test_multiplayer_live.py` (M0 to M13) and `test_net_offline.py` (18
checks). Evidence: `tests/live_evidence/godot-multiplayer/live_20261002-213421.json` (M0 to M12, all
pass) and `live_20261002-214101.json` (M13), with role logs in the matching `logs_*` folders.
Project: `tests/projects/godot-multiplayer/Net3D` (Base3D clone: Forward+, Jolt Physics, checked in
M0). Ports 24010 to 24099.

Setup for every procedure:

```python
import sys; sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-multiplayer/scripts"]
import gd_env, gd_run, gd_net
P = gd_env.base_project("3d", "tests/projects/godot-multiplayer/Net3D")   # once
gd_net.install_netkit(P)        # addons/agentkit (lead) + addons/agentkit/multiplayer (this skill)
```

Kit files (copied to `res://addons/agentkit/multiplayer/`): `net_util.gd` (peers, RTT, ENet byte and
throttle counters, authority report), `net_build.gd` (scenes and server preset in code),
`net_player.gd`, `net_input.gd`, `net_prop.gd`, `net_lab.gd` (the session state machine and every
measurement), `net_boot.gd` (exported-build entry point), `net_session_job.gd` (one role as an
AgentKit job), `net_audit.gd` (scene and kit audits).

---

## P1. Build replication in code (synchronizer, spawner, scenes)

Why: the Replication panel and Auto Spawn List are GUI; an agent writes `SceneReplicationConfig` in
code and saves the scene.

```gdscript
static func make_sync(sync_name: String, root_path: NodePath, props: Array) -> MultiplayerSynchronizer:
	var s := MultiplayerSynchronizer.new()
	s.name = sync_name
	s.root_path = root_path
	var cfg := SceneReplicationConfig.new()
	for p in props:                                   # [path, spawn, mode]
		var path := NodePath(str(p[0]))               # ".:position" relative to root_path
		cfg.add_property(path)
		cfg.property_set_spawn(path, bool(p[1]))
		cfg.property_set_replication_mode(path, int(p[2]))   # REPLICATION_MODE_NEVER 0, ALWAYS 1, ON_CHANGE 2
	s.replication_config = cfg
	return s

static func make_spawner(spawner_name: String, spawn_path: NodePath, scenes: Array, limit: int = 0) -> MultiplayerSpawner:
	var sp := MultiplayerSpawner.new()
	sp.name = spawner_name
	sp.spawn_path = spawn_path
	sp.spawn_limit = limit                            # 0 = unlimited (the default)
	for sc in scenes:
		sp.add_spawnable_scene(str(sc))
	return sp
```

Player scene: `CharacterBody3D` + `StateSync` (`.:position` spawn + ALWAYS, `.:peer_id` spawn
only) + child `Input` node with `InputSync` (`.:move` ALWAYS). Run: `gd_net.build_scenes(P)`, then
`gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_audit.gd:scene", {"scene": "res://net/world.tscn"})`.

Test M0. Run in Godot 4.7.2 on 2026-10-02: pass. Read back after save: spawnable
`res://net/player.tscn`, props `[.:position spawn ALWAYS, .:peer_id spawn NEVER]`; audit 4
synchronizers, 2 spawners, 0 flags; all 9 kit scripts compile, and a planted type error in
`jobs/kitcheck/broken.gd` is reported (negative control);
`physics/3d/physics_engine="Jolt Physics"`, renderer `forward_plus`.

## P2. Player authority: input-only clients (server authority) or client-owned bodies

```gdscript
# net_player.gd (excerpt). Node name = peer id, set by the server before add_child(p, true).
static var auth_mode := "server"

func _enter_tree() -> void:
	var id := str(name).to_int()                       # NOT a synced property: still 0 here on clients
	if auth_mode == "client":
		set_multiplayer_authority(id)                  # recursive: StateSync and Input follow
	else:
		$Input.set_multiplayer_authority(id)           # body and StateSync stay with the server

func _physics_process(_delta: float) -> void:
	var simulate := is_multiplayer_authority() if auth_mode == "client" else multiplayer.is_server()
	if not simulate:
		return
	var mv: Vector2 = $Input.move
	velocity = Vector3(mv.x, 0.0, mv.y) * SPEED
	move_and_slide()
```

Input goes to the server only: in `_ready`, the owning client sets
`InputSync.public_visibility = false` and `set_visibility_for(1, true)`.

Test M1 (and M4 for client mode). Run on 2026-10-02: pass. Authority report on the server and every
client: body 1, input = peer id, for all 3 players. `peer_id` read in `_enter_tree`: equal to the id
on the server, 0 on all 6 client copies (spawn properties arrive after `_enter_tree`).

## P3. Session: server plus 3 clients, lobby gate, late join, leave

```python
roles = [gd_net.role("server", role="server", port=24010, lobby_size=2, min_clients=3, server_timeout=20),
         gd_net.role("c1", role="client", port=24010, index=0, delay_s=0.3, duration=4.0, cheat_at=2.0),
         gd_net.role("c2", role="client", port=24010, index=1, delay_s=0.3, duration=4.0, leave_at=2.5),
         gd_net.role("c3", role="client", port=24010, index=2, delay_s=1.8, duration=3.0)]
s = gd_net.session(P, roles, timeout=60)
```

Server side (net_lab.gd): spawn on `peer_connected` (a listen-server host gets no `peer_connected`
for itself: spawn id 1 by hand), free on `peer_disconnected`; clients RPC `player_ready` to the
server, which starts the match when `lobby_size` peers are ready and sends `start_match` at once to
late joiners.

Test M1. Run on 2026-10-02: pass, 5.5 s. Every peer saw 3 players; the late joiner (1.5 s later) saw
all 3; c2's node removed on c1 when c2 left; RPC RTT 16 to 19 ms, ENet RTT 15 to 23 ms, input to
visible motion 47 to 52 ms, c1 as seen by c2: 20 ms behind the server, 0.065 m mean error. Two
clients leaving in one server frame log "Unable to send packet on channel 0, max channels: 0" once
(reproduced: same frame fails, staggered passes); the session job whitelists that exact text.

## P4. RPC rules: validation, sender id, checksum, relay

```gdscript
@rpc("any_peer", "call_remote", "reliable")
func request_teleport(target: Vector3) -> void:
	if not multiplayer.is_server():
		return
	var sender := multiplayer.get_remote_sender_id()          # before any await
	var accepted := sender == str(name).to_int() and target.distance_to(position) <= MAX_STEP
	if accepted:
		position = target
```

Static checks: `gd_net.rpc_audit(root)` (unvalidated `any_peer`, sender read after `await`, channel
not last, Godot 3 names) and `gd_net.rpc_pair_check(server_script, client_script)`
(`engine_checksum_fails` says which differences the engine logs).

Test M2 (fixtures `tests/code/godot-multiplayer/fixtures/rpc/`, one server, two clients, each rule
in its own error window). Run on 2026-10-02: pass.

- `call_local` runs locally and remotely. Sender id before `await`: the client id; after: 0.
- Authority RPC from a client:
  `RPC 'server_only' is not allowed on node /root/RpcLab/Match from: <id>. Mode is "authority", authority is 1.`
- Non-RPC method: caller logs `Unable to get the RPC configuration for the function "plain_method"`.
- `Object` argument: NO error; the server receives `<EncodedObjectAsID#...>`.
- Extra RPC on one side: "The rpc node checksum failed" on both sides, the call still runs. Shifted
  names (server `a`,`b`, client `b`): the client calls `b`, the server runs `a`.
- Argument count differs: no checksum error, `Method expected 2 argument(s), but called with 0`.
  Mode differs: no checksum error, rejected as not allowed. Transfer mode and `call_local` differ:
  no error, runs. Declaration order differs: works.
- `server_relay = false`: clients know only peer 1; `rpc_id(other_client)` logs
  `Attempt to call RPC with unknown peer ID`. Offline: 18/18, including the pair-check verdicts
  matching these live results.

## P5. Authentication (password, timeout)

```gdscript
# server
sm.auth_timeout = 1.5                       # default 3.0
sm.auth_callback = func(id: int, data: PackedByteArray) -> void:
	if data.get_string_from_utf8() == PASSWORD: sm.complete_auth(id)
	else: sm.disconnect_peer(id)
# client: needs its own auth_callback or peer_authenticating never fires
sm.auth_callback = func(_id: int, _data: PackedByteArray) -> void: pass
sm.peer_authenticating.connect(func(id: int) -> void:
	sm.send_auth(id, PASSWORD.to_utf8_buffer())
	sm.complete_auth(id))
```

Test M3. Run on 2026-10-02: pass. Good client joined and played; wrong password: `auth_failed` on
the client, never `peer_connected` on the server. Silent client (no `auth_callback`): it emitted
`connected_to_server` on its own side at once, then was kicked 1.50 s after `authenticating` (the
timeout); meanwhile the server logged `Condition "len < 2 || ... != SYS_COMMAND_AUTH" is true` for
its packets.

## P6. Client authority versus server authority under a cheat

`role(..., auth="client")` on every role. The cheat sequence (net_lab `_cheat`): a legal 0.3 m
teleport, a teleport for another player, a 30 m teleport, then a direct local write of 50 m.

Test M4 vs M1. Run on 2026-10-02: pass. Server authority: 1 accepted, 2 rejected, the local write
overwritten within 0.4 s. Client authority: the local write stuck (position 49.6, 51.1) and the
server tracked the cheater at 51.9 m.

## P7. Latency injection and measurement

```python
with gd_net.UdpLagProxy(24041, 24040, rtt_ms=250, jitter_ms=30, loss=0.05) as px:
    s = gd_net.session(P, roles)            # clients connect to 24041
d = gd_net.replication_delay(server_traj, observer_traj, pid)   # delay_ms, err_now_mean_m, err_now_p95_m
```

`TcpLagProxy` does the same for WebSocket. Both run in the Python process, no root, localhost only.
Offline: 80 ms RTT target measured 93 ms through an echo server, TCP 60 ms measured 74 ms (proxy
overhead about 6 ms per direction).

Test M5. Run on 2026-10-02: pass.

| Case                           | RPC RTT | ENet RTT | Remote view delay | Remote error mean | Own input to motion                     |
| ------------------------------ | ------- | -------- | ----------------- | ----------------- | --------------------------------------- |
| no proxy                       | 17 ms   | 22 ms    | 20 ms             | 0.07 m            | 48 to 51 ms                             |
| 100 ms                         | 120 ms  | 121 ms   | 70 ms             | 0.22 m            | 148 to 171 ms                           |
| 250 ms                         | 269 ms  | 274 ms   | 150 ms            | 0.44 m            | 301 to 310 ms                           |
| 250 ms, 30 ms jitter, 5 % loss | 303 ms  | 286 ms   | 170 ms            | 0.47 m            | 319 to 328 ms (84 datagrams dropped)    |
| 250 ms, client authority       | 268 ms  | 273 ms   | 140 ms            | 0.46 m            | 11 ms (second client 197 ms in one run) |

## P8. Bandwidth: modes, intervals, frame rate, visibility

Server KiB/s from `ENetConnection.pop_statistic(HOST_TOTAL_SENT_DATA)` per second
(`net_util.enet_pop_bytes`), first second skipped. Private props: `public_visibility = false` plus
`set_visibility_for(first_peer, true)`.

Test M8 (50 props, 1 client, 4 s). Run on 2026-10-02: pass.

| Case                                | Server KiB/s |
| ----------------------------------- | ------------ |
| ALWAYS, moving, 60 fps              | 72.6         |
| ALWAYS, idle, 60 fps                | 72.6         |
| ON_CHANGE, moving                   | 98 to 101    |
| ON_CHANGE, idle                     | 2.3          |
| ALWAYS, `replication_interval` 0.05 | 21 to 22     |
| ALWAYS, uncapped headless (145 fps) | 160 to 175   |

Visibility: 50 props, 25 private and visible only to the first client: c1 saw 50, c2 saw 25.

Anomaly (open): in 4 of 20 ALWAYS runs, during a period of machine load average 17 to 24, the server
sent about 10 packets/s instead of about 68 for the whole run (down to 0.6 to 2.5 KiB/s). The one
collapse recorded with throttle stats showed `ENetPacketPeer.PEER_PACKET_THROTTLE` at 0 in every
window (ENet drops unreliable packets when the throttle is low) while RTT stayed at 20 ms. Not
reproduced in 42 later runs at load 6 to 16. The test now retries a collapsed ALWAYS case once and
records the failed attempt. `role(..., enet_throttle="5000,2,0")` calls
`throttle_configure(5000, 2, 0)` (deceleration 0) on each new peer; it held the throttle at 32 in 14
runs, but whether it prevents the collapse is not proven. Until it is: watch `enet_throttle()` in
long sessions, and do not size bandwidth from one run.

## P9. WebSocket transport and a browser client

```gdscript
var w := WebSocketMultiplayerPeer.new()
w.create_server(port)                         # server
w.create_client("ws://127.0.0.1:%d" % port)   # client; wss:// behind a TLS proxy in production
multiplayer.multiplayer_peer = w
```

Browser build: `gd_run.ensure_preset(PW, "Web", "Web")` (single-threaded by default in the lead's
presets), export, then replace `"args":[]` in `index.html` with
`["--", "--client", "--transport=websocket", "--port=24065", ...]`; `net_boot.gd` reads them with
`OS.get_cmdline_user_args()`. Serve the folder, open it in headless Chrome (Playwright,
`channel="chrome"`), read `AGENT_RESULT` from the console.

Tests M9 and M13. Run on 2026-10-02: pass. WebSocket direct: RTT 16 ms, input to motion 46 ms, cheat
sequence 1 accepted 2 rejected; through `TcpLagProxy` at 100 ms: RTT 120 ms, remote view delay 75
ms. Browser: Compatibility renderer on WebGL 2, single-threaded, joined the headless server next to
a native client, saw 2 players, RTT 17 ms; the screenshot `web_client_20261002-214101.png` shows
both players. Export 40 MB, of which wasm 39.5 MB (10.1 MB gzip -9).

## P10. Dedicated server export and detection

```python
gd_net.server_preset(PX, "Server Linux", "Linux")      # writes the keys below
gd_net.server_preset(PX, "Server macOS", "macOS")
gd_run.export(PX, "Client macOS", "builds/client_pack.zip", pack=True)
gd_run.export(PX, "Server macOS", "builds/server_pack.zip", pack=True)
gd_net.pack_report("builds/server_pack.zip")
```

```ini
export_filter="customized"
dedicated_server=true
customized_files={ "res://": "strip" }      # add "res://path": "keep" for files the server reads pixels from
```

Detection in the build (`net_boot.gd`): `OS.has_feature("dedicated_server")`, else
`"--server" in OS.get_cmdline_user_args()`; `DisplayServer.get_name() == "headless"` is reported,
never used alone (every agent run is headless). macOS export needs
`rendering/textures/vram_compression/import_etc2_astc=true` and a re-import (scenario-godot-expert).

Test M10. Run on 2026-10-02: pass. Client pack 3.27 MB with the 3.15 MB noise `.ctex`; server pack
0.11 MB, no `.ctex` (scenes 19.9 KB to 13.8 KB). Linux server 73.5 MB, macOS server zip 59.4 MB. The
exported macOS server, started with only `-- --port=24070 --lobby_size=2`, reported
`dedicated_server_feature` true, display `headless`, audio `Dummy`, `--headless` absent, template
build; it hosted two editor-run clients (both saw 2 players, cheat 1 accepted 2 rejected) and
exited 0.

## P11. Server and client in one process (tests, tools)

```gdscript
var s_api := SceneMultiplayer.new()
var c_api := SceneMultiplayer.new()
get_tree().set_multiplayer(s_api, ^"/root/Server")     # each branch has its own API
get_tree().set_multiplayer(c_api, ^"/root/Client")     # paths inside both branches must match
# teardown: close peers, set OfflineMultiplayerPeer, free branch contents, frame,
# set_multiplayer(null, path), then free the branches
```

Test M11 (`fixtures/inproc/`). Run on 2026-10-02: pass. Connected in 4 to 16 ms; the client's RPC
reached the server branch and the echo came back (41 to 42); a spawner in the server branch
replicated a crate to the client branch. Wrong teardown orders logged "The multiplayer instance
isn't currently active", then "Node not found: /root/Server", then "Attempt to disconnect a
nonexistent connection ... visibility_changed".

## P12. Look at the replicated world

`role("obs", role="client", headless=False, capture_at=2.5, capture_out="captures/observer.png")`: a
windowed client (160x90 window) renders the world camera into a 960x540 SubViewport through
`agent_capture.gd`.

Test M12. Run on 2026-10-02: pass. `observer_20261002-213421_0.png`, opened: three capsules in three
peer colors on the floor, positions matching the server trajectories.

## P13. Static audits before any run

`gd_net.rpc_audit(project_root)`,
`gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_audit.gd:scene", {"scene": ...})`,
`net_audit.gd:kit` (compiles each kit script from source with `GDScript.reload()`; loading the
running script with `CACHE_MODE_IGNORE` failed with "Bad address index").

Tests: offline 18/18 and M0. Run on 2026-10-02: pass.

## Not yet run (and why)

- netfox prediction and rollback, Godot Rollback Netcode: third-party addons not installed here; API
  names come from 2024 and 2026 videos.
- GodotSteam / SteamMultiplayerPeer: needs the Steam client, an app id and two accounts.
- Nakama, Colyseus, Photon, W4: need a backend server or an account.
- WebRTC P2P (Tube, webrtc-native): needs the native extension and a signalling or tracker server;
  only the "no extension" behavior was measured.
- Editor Debug > Customize Run Instances with a `dedicated_server` feature tag and the Network
  Profiler: GUI only (`gui-paths.md`).
- Cloud deployment (EC2, security groups, `wss://` behind Caddy): costs money and needs credentials;
  ask first.
- Android `INTERNET` permission: no device build here.

## P14. Round 2 (after blind grading): checksum rerun, connection events, spawn_limit, assert in release

Run in Godot 4.7.2 on 2026-10-02 with
`python3 tests/code/godot-multiplayer/test_multiplayer_live.py --only M0,M2,M14` and `--only M15`.
Evidence: `live_20261002-223951.json` (M0, M2 pass), `live_20261002-224028.json` (M14 pass),
`live_20261002-225044.json` (M15 pass).

M2 rerun (fixtures unchanged): every case as in P4. A name missing or shifted is the only thing that
logs "The rpc node checksum failed"; mode differences log "not allowed" per call; argument count
logs "Method expected 2 argument(s), but called with 0"; transfer mode and `call_local` differences
run without any error. The docs' wider checksum description does not match 4.7.2.

M14 (`fixtures/conn/conn_job.gd`, server plus c1 at 0.3 s and c2 at 1.2 s, ENet port 24080):

```gdscript
spawner.spawn_path = NodePath("..")
spawner.spawn_function = _spawn_fn            # returns a new Node3D named "S%d", not in the tree
spawner.spawn_limit = 2
multiplayer.connected_to_server.connect(func() -> void: my_id = multiplayer.get_unique_id())   # clients only
multiplayer.peer_connected.connect(func(id: int) -> void: if id != 0: register(id))
# server, once both clients are in:
for i in 3:
	var n := spawner.spawn(i)                   # third call: "Spawn limit reached!", returns null
```

| Peer      | `peer_connected` ids in order | `connected_to_server` | spawned (signal)       |
| --------- | ----------------------------- | --------------------- | ---------------------- |
| server    | c1, c2                        | never                 | (spawns S0, S1 itself) |
| c1        | 1, c2                         | yes                   | S0, S1                 |
| c2 (late) | 1, c1                         | yes                   | S0, S1                 |

After the server left, both clients had no spawned children left and `get_unique_id()` returned 0.
`application/run/flush_stdout_on_print` read false (default). The snippet lines above also ran
verbatim headless (`fixtures/assert/p14_snippet.gd` via `p14_main.gd`, server peer, no clients):
`spawn` returned `[true, true, false]` with "Spawn limit reached!", an emitted `peer_connected(0)`
was filtered and `peer_connected(7)` registered.

M15 (`fixtures/assert/assert_probe.gd` as an autoload in
`tests/projects/godot-multiplayer/Round2Assert`):

```gdscript
func _ready() -> void:
	assert(_start_server())          # _start_server() sets started = true
	print("ASSERT_PROBE started=", started, " debug_build=", OS.is_debug_build())
```

Editor (debug) run: `started=true debug_build=true`. Release macOS export (`gd_run.export`, template
4.7.2): `started=false debug_build=false`. The fix, run headless:
`var err := peer.create_server(port)` then `if err != OK: push_error(error_string(err))` printed
`err=0 OK`.
