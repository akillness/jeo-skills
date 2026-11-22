# scenario-godot-multiplayer expert notes

Claims by expert, with video id and timestamp. "Verified" means a live run in Godot 4.7.2 on
2026-10-02 (test id in brackets, details in `procedures.md`). My own additions are marked [added].

## Authority and trust

- **Authority is the first concept.** Multiplayer is maintaining one shared world state; someone
  owns each object's data (AndrooDev, jff9oxO8v1s [00:00:00, 00:04:01]).
- **Three models, shown live** (Tamas Galffy, netfox author, iP_xdJ0peFo [00:03:46, 00:06:47,
  00:11:32]): client authority (responsive, trivially cheatable), server authority with inputs only
  (cheat-proof, laggy), prediction plus reconciliation (both). Verified [M4, M5]: client authority
  moved the owner's capsule 11 to 22 ms after input at 250 ms RTT and kept a 50 m self-teleport;
  server authority took 294 to 328 ms and overwrote the same write within 0.4 s.
- **Clients own inputs, not bodies**, or they can state where they are or their health
  (BatteryAcidDev, GqHTNmRspjU [00:00:33, 00:01:04, 00:09:40]). AndrooDev gives clients their bodies
  for casual co-op (jff9oxO8v1s [00:05:23, 00:07:04]; wgIqB6JNcro [00:03:34]). Deciding condition:
  does cheating matter, and how much input lag the genre tolerates.
- **A dedicated server stops speed hacks and infinite health, not wall hacks or aimbots**; interest
  management with server line-of-sight checks reduces data leaks (Luke Stampfli, MfjEB1cowsE
  [00:18:55]; Galffy [00:53:28]). [added] Verified tool: private synchronizer visibility (M8: the
  second client never received the 25 private props).
- **Server-side damage needs no RPC**; only feedback to the shooter does
  (`register_hit.rpc_id(source)`) (AndrooDev, wgIqB6JNcro [00:39:08, 00:41:23]).

## Authority mechanics

- **Wrap the player; set authority in `_enter_tree` from `name.to_int()`** so it holds before
  anything runs and recurses to children (Travis Hunter, tK2ACXUGcrY [00:46:16, 00:48:38]). If
  authority stays 1 everywhere, the manager instantiated the unwrapped scene; diagnose in the Remote
  tree [00:52:03]. Verified [M1]: a spawn-synced `peer_id` read in `_enter_tree` was 0 on every
  client copy; the name was right.
- **Everything is local until replicated**; connecting transfers nothing, not even authority (Davide
  Di Staso, nyKBuM9Y_-Q [00:06:55]).
- **The host gets no `peer_connected` for itself**: spawn id 1 by hand; on a dedicated server skip
  the host player (Hunter, tK2ACXUGcrY; FinePointCGI, e0JLO_5UgQo; BatteryAcidDev, jgJuX04cq7k).
  Verified [M1]: the dedicated server spawned only the 3 clients.
- **Client info goes in `connected_to_server`, not `peer_connected`**, and server-only broadcasts
  are guarded with `is_server()` or late joiners create duplicates (FinePointCGI, e0JLO_5UgQo
  [00:22:50]; pA9RGn87Uag [00:46:29]). Ignore peer id 0 (phantom player) (pA9RGn87Uag [00:47:31]).
  Verified [M14, round 2]: `connected_to_server` fired on both clients and never on the server; a
  client joining second got `peer_connected` for 1 and for the first client (docs: once per existing
  peer, server included); no event carried id 0, but `get_unique_id()` read 0 on both clients once
  the server had left, which is where a phantom 0 comes from.
- **Runtime nodes with auto names (`@RigidBody3D@2`) break synchronizers and RPC paths** (Hunter,
  tK2ACXUGcrY [01:25:43]); use `add_child(node, true)` (Godot docs, High-level multiplayer).
  Verified: `add_child(Node.new())` gives `@Node@2`; with `true`, `Node` and `Node3D2`. `net_audit`
  flags `@` names.

## RPCs

- **Defaults**: `@rpc` alone = authority, call_remote, reliable, channel 0; `transfer_channel` must
  be the last argument (Godot docs). `gd_net.rpc_audit` flags a channel not last.
- **`get_remote_sender_id()` returns 0 after an `await`** (MultiplayerAPI docs). Verified [M2]:
  before the await the client id, after it 0.
- **Checksum.** The docs say the checksum covers every `@rpc` of the script with its declaration,
  and that argument lists are not compared. Verified [M2]: only the NAMES matter. Extra or shifted
  names log "The rpc node checksum failed" on both sides and the call still runs, possibly the WRONG
  method (client `b` ran server `a`). Different mode, `call_local` or transfer mode: no checksum
  error. Different argument count: no checksum error, "Method expected 2 argument(s), but called
  with 0". Round 2 rerun (2026-10-02, `live_20261002-223951.json`): same result for every case; the
  mode case logs only "RPC 'd' is not allowed ... Mode is \"authority\"". A blind grader marked the
  names-only line wrong from the docs; the engine disagrees with the docs here, so the skill keeps
  the measured behavior and names the disagreement.
- **Objects are not serializable** (docs). Verified [M2]: with `allow_object_decoding` false
  (default) there is NO error; the receiver gets `EncodedObjectAsID`. A silent bug: send ids or
  paths.
- **Host mode recursion**: do not call the broadcast again from the host's own path (FinePointCGI,
  e0JLO_5UgQo [00:42:32]).
- **`server_relay`** (default true) lets clients address each other through the server. Verified
  [M2]: with false, clients know only peer 1 and `rpc_id(other_client)` errors "Attempt to call RPC
  with unknown peer ID".

## Replication

- **ALWAYS for players, ON_CHANGE for rare changes, since On Change adds acknowledgement traffic**
  (Hunter, tK2ACXUGcrY). Verified [M8]: ON_CHANGE cost 98 to 101 KiB/s for 50 moving props against
  72.6 for ALWAYS, and 2.3 KiB/s when idle; ALWAYS idle still cost 72.6.
- **`replication_interval` applies to ALWAYS, `delta_interval` to ON_CHANGE; 0 means every network
  frame** (MultiplayerSynchronizer docs). Verified [M8]: interval 0.05 gave 21 to 22 KiB/s (about 30
  % of 60 fps). [added] A headless server runs uncapped (145 fps here): 160 to 175 KiB/s for the
  same props, so cap it.
- **Position sync**: sync `position` directly vs a custom `sync_position` with lerp on remote peers
  (FinePointCGI, e0JLO_5UgQo [00:57:04]; Hunter) vs netfox `TickInterpolator` (GqHTNmRspjU
  [00:21:24]). Lerp hides jitter but adds delay; competitive games prefer prediction.
- **Replicate intent, not animation**: a bool "door open" plus local animation; send a seed, not a
  generated array (Hunter, tK2ACXUGcrY [01:17:02, 01:36:30]).
- **Bandwidth by visibility**: toggle per-enemy visibility from a VisibleOnScreenNotifier; 100
  zombies cost 120 to 180 in the Network Profiler before (Di Staso, nyKBuM9Y_-Q [00:14:29,
  00:15:04]). Verified mechanism [M8].
- **Idle players need no sync**: send only above a velocity threshold; delay the broadcast 0.5 s
  after join (FinePointCGI, pA9RGn87Uag [00:42:16, 00:25:43]).
- **Late join**: let the spawner and synchronizer resend state (Di Staso, nyKBuM9Y_-Q [00:12:56])
  rather than manual RPC sync (pA9RGn87Uag, which needs it for a Nakama bridge). Verified [M1]: a
  client joining 1.5 s late saw all 3 players with no extra code.
- **Levels as spawner-driven scenes** (Spawn Path = Level node, limit 1, levels in the spawn list)
  instead of per-peer `change_scene` (Di Staso, nyKBuM9Y_-Q [00:11:31, 00:12:23]). Not run here.

## Latency, prediction, rollback

- **Test with latency and with three players** (Galffy, iP_xdJ0peFo [00:09:58, 00:42:31]). Verified
  harness [M5]: `UdpLagProxy` numbers in `procedures.md` P7.
- **Time synchronization is the core concept**: timestamp packets by tick, be N ticks ahead (100 ms
  ping at 40 Hz = 4 ticks), extrapolate remote objects (Stampfli, MfjEB1cowsE [00:12:42]; Galffy
  [00:22:44] on drift and time stretching).
- **netfox recipe**: input gathered on the network tick, `_rollback_tick(delta, tick, is_fresh)`,
  `NetworkTime.physics_factor` around `move_and_slide()`, `TickInterpolator`, `teleport()` on
  respawn, `is_on_floor()` unreliable in rollback (BatteryAcidDev, GqHTNmRspjU [00:06:58, 00:13:29,
  00:15:05, 00:18:55, 00:21:24, 00:26:34]; Galffy [00:28:00, 00:29:12]). Do not write rollback-owned
  state from RPCs (Galffy [00:32:17]). Small proof of concept first (GqHTNmRspjU [00:34:53]). Not
  run here.
- **Deterministic rollback** needs same state plus same input; floats, unordered iteration and
  unseeded random desync; one-way latency is half the ping (David Snopek, zvqQPbT8rAE [00:10:40,
  00:01:14]). Deciding condition vs netfox: deterministic for 2 to 8 players and many units
  (fighting, RTS-like); netfox stated fit for about 4 to 16 players, action pacing (iP_xdJ0peFo).

## Topology, transports, backends

- **One project, one codebase** for client and server (Di Staso, nyKBuM9Y_-Q; BatteryAcidDev,
  sT0UPlJ2cpc; jgJuX04cq7k).
- **Dedicated vs alternatives**: dedicated for fast, physics-heavy games; WebSocket plus serverless
  rooms for turn-based or card games (sT0UPlJ2cpc; Nightpath Studios with Colyseus, 9QtQ5iXj2U0);
  relay with client-owned objects for casual shooters (Stampfli, MfjEB1cowsE, a Photon engineer:
  vendor bias declared).
- **P2P mesh** only for 2 peers (Stampfli) against WebRTC mesh demos with per-object authority
  (AndrooDev, jff9oxO8v1s; wgIqB6JNcro). Deciding condition: web reach and zero server cost vs NAT
  failures (no TURN means some players cannot connect). Avoid UPnP; punch-through fails behind VPNs,
  CGNAT, mobile carriers, school firewalls (Galffy [00:45:25]; Stampfli [00:07:20]).
- **WebRTC needs the native extension on desktop** ("no default WebRTC extension configured") and
  Tube is not in the AssetLib for 4.7 (AndrooDev, wgIqB6JNcro [00:19:35, 00:04:32]). Verified:
  without the extension `WebRTCPeerConnection.initialize()` returns OK and only logs "Required
  virtual method WebRTCPeerConnectionExtension::_initialize must be overridden".
- **Steam**: everything else (authority, spawner) is identical to ENet; only the peer and lobby
  calls change (Gwizz, fUBdnocrc3Y). The custom engine build in that video is replaced by the
  GodotSteam GDExtension today [unverified here].
- **Browser** [added, verified M9 and M13]: WebSocket works from a single-threaded web export in
  headless Chrome against a headless server; ENet is not available in browsers.

## Dedicated server

- **Export Mode "Export as dedicated server"**, run the console binary, skip the host player, Strip
  Visuals except what the server reads, re-export after code changes, `chmod +x` on Linux, UDP rule
  scoped to your IP (BatteryAcidDev, jgJuX04cq7k [00:00:35, 00:04:47, 00:06:30, 00:16:15]). Verified
  [M10]: the mode adds `dedicated_server`, which forces headless display and Dummy audio without
  `--headless`; Strip Visuals removed the 3.1 MB texture.
- **Raise `spawn_limit` past 2** (jgJuX04cq7k [00:18:34]). Correction: 2 was that project's value;
  the engine default is 0, unlimited (ClassDB, verified). Verified [M14]: with `spawn_limit = 2` the
  third `spawn()` logged "Spawn limit reached!" and returned null; both clients received exactly 2.
- **`flush_stdout_on_print` for service logs** (exporting docs, delta 12). Verified [M14]: default
  false in 4.7.2.
- **Never start the server inside `assert()`** [added from round-1 grading]. Verified [M15]: the
  assert body ran in the editor (debug) and did not run in a release macOS export (`started=false`,
  `OS.is_debug_build()` false).
- **Keep the server build free of client assets and watch its size early** (sT0UPlJ2cpc [00:26:17]).
  Verified [M10]: pack report per extension.
- **Run Instances in 4.3+ have Feature Tags and Launch Arguments**: tag one instance
  `dedicated_server` and branch on `OS.has_feature("dedicated_server")` (Di Staso, nyKBuM9Y_-Q
  [00:08:33]). [added] `main.cpp` forces headless when the build carries the `dedicated_server`
  feature (read in source, measured on the export in M10); whether an editor run instance with that
  tag does the same was not checked. GUI path only, not run.
- **Same Godot version on both ends**: the SceneMultiplayer protocol changed in 4.3 (version
  deltas).

## Corrections found by the live tests (also in tests/OPEN_ISSUES.md)

1. `spawn_limit` default is 0 (unlimited), not 2.
2. Docs spell `auth_timout`; the property is `auth_timeout` (default 3.0).
3. The RPC checksum covers names only, not declarations (docs say otherwise; rerun in round 2, same
   result); a shifted name runs the wrong method.
4. Object RPC arguments fail silently (`EncodedObjectAsID`), no error.
5. WebRTC without the extension: error logged, `OK` returned.
6. Two peers leaving in one frame log one harmless error (ENet and WebSocket texts differ).
7. A client without `auth_callback` emits `connected_to_server` on its own side, then is kicked at
   `auth_timeout`.
8. Round 2: `get_unique_id()` returns 0 after the server disconnects (phantom id 0 source); a set
   `spawn_limit` makes extra `spawn()` calls return null with "Spawn limit reached!"; `assert()`
   bodies are stripped from release exports.
