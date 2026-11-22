---
name: scenario-godot-multiplayer
description: "Use when a Godot 4 game goes online or co-op: host and join with ENet, WebSocket for a web build, RPCs (@rpc, rpc_id, any_peer), MultiplayerSpawner and MultiplayerSynchronizer, player authority, lobbies and login, a dedicated or headless server export, lag, rubber-banding, prediction or netfox, cheating, bandwidth, Steam, Nakama or WebRTC. Symptoms: players do not appear on the client, 'rpc node checksum failed', 'node not found' on an RPC, desync, the server build is huge, a client never connects."
license: MIT
---

# Godot multiplayer (network programmer)

Target: Godot 4.7.2, SceneMultiplayer over ENet and WebSocket.

Expert level here means the networked game is proven with several processes, under injected latency,
before anyone plays it: authority is a written decision per object, every client message is a
request the server checks, and replication cost is measured in KiB/s. This skill builds the
replication in code, runs a server and 2 to 3 clients headless on localhost (plus a browser client),
and passes only on numbers from those runs. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, review loop, 4.7 traps).

**Status (2026-10-02):** 16 live tests (up to 3 clients, ENet, WebSocket, exported server, headless
Chrome) and 18 offline tests pass. Evidence: `tests/live_evidence/godot-multiplayer/`.

## Stance (the expert delta)

1. **Decide authority per object before writing code.** Someone must own each object's data
   (AndrooDev, jff9oxO8v1s [00:04:01]). Client authority over the body is fine for casual co-op;
   competitive or cheat-prone games keep the body on the server and give clients their input only
   (Tamas Galffy, iP_xdJ0peFo [00:03:46, 00:06:47]; BatteryAcidDev, GqHTNmRspjU [00:00:33]).
   Deciding condition: cost of cheating against cost of input lag. Measured at 250 ms RTT: server
   authority shows your own move after 294 to 310 ms, client authority after 11 to 22 ms, and a
   client-authority cheater's 50 m jump stuck.
2. **Set authority from the node name in `_enter_tree`.** Name each player node with its peer id;
   `_enter_tree` calls `set_multiplayer_authority(name.to_int())` so it holds before `_ready`
   (Travis Hunter, tK2ACXUGcrY [00:46:16]). Do not read a spawn-synced property there: on every
   client copy measured, `peer_id` was still 0 in `_enter_tree`.
3. **Every `any_peer` RPC is a request.** Read `multiplayer.get_remote_sender_id()` first (it is 0
   after an `await`, measured), check that the sender owns the target and that the values are
   possible, then act. A forged teleport for another player and a 30 m jump were both rejected in
   the live test.
4. **The RPC checksum compares method names only, whatever the docs say.** The high-level docs say
   it covers every `@rpc` declaration and skips arguments; two live runs in 4.7.2 (M2, round 1 and
   round 2) disagree. A name missing on one side logs "The rpc node checksum failed" on both sides
   and RPCs are matched by sorted index: the client called `b` and the server ran `a`. A different
   mode only fails per call ("not allowed"), a different argument count fails per call ("expected 2
   argument(s)"), different `call_local` or transfer mode passes silently. Keep server and client on
   one script per node path (one codebase: Davide Di Staso, nyKBuM9Y_-Q).
5. **Test with latency and three players.** Localhost hides every latency bug; two players hide what
   a bystander sees (Galffy, iP_xdJ0peFo [00:09:58, 00:42:31]). `gd_net.UdpLagProxy` adds delay,
   jitter and loss on localhost without root.
6. **Replication cost is a design input.** ALWAYS sends every network frame whether or not the value
   changed; ON_CHANGE is reliable and costs more than ALWAYS while values move (measured: 72.6
   against 100 KiB/s for 50 moving props). A headless server is uncapped: 145 fps here, 2.2 to 2.4
   times the bandwidth of 60 fps. Cap it (`--max-fps`, `Engine.max_fps`) or set
   `replication_interval`. Cut by visibility (Di Staso [00:14:29]).
7. **Know which connection event fires where.** On a joining client, `peer_connected` fires once per
   existing peer, server id 1 included; `connected_to_server` fires on clients only, so send client
   info there, not from `peer_connected` (docs delta 7; FinePointCGI e0JLO_5UgQo [00:22:50]). After
   the server leaves, `get_unique_id()` reads 0: skip id 0 in registries and spawn loops
   (pA9RGn87Uag [00:47:31]). All measured (M14).
8. **The server stops speed hacks, not wall hacks.** Server authority blocks impossible moves and
   infinite health; it does not stop wall hacks or aimbots, because every client still receives
   everyone's position. Interest management (synchronizer visibility, server line-of-sight checks)
   limits the leak (MfjEB1cowsE [00:18:55]; iP_xdJ0peFo [00:53:28]).
9. **The dedicated server is the same project exported in "dedicated server" mode.** That mode adds
   the `dedicated_server` feature, which forces headless display and dummy audio even without
   `--headless` (measured on the exported macOS binary), and Strip Visuals removed the 3.1 MB
   texture from the server pack (BatteryAcidDev, jgJuX04cq7k [00:04:47]).

## Establish first

Genre and player count; who may cheat (competitive, co-op, friends only); platforms (browser means
WebSocket or WebRTC, no ENet); topology (dedicated server, listen server, relay or P2P); a backend
already chosen (Steam, Nakama, Colyseus, own server); hosting budget (cloud costs money: ask before
any deployment); tick and target RTT (default 60 Hz server, play tested at 100 and 250 ms).
Defaults: one project, server authority with input-only clients for anything competitive, ENet for
desktop and mobile, WebSocket behind TLS (`wss://`) for the web.

## Workflow

1. **Network design note.** Per object: owner, what replicates (synchronizer property and mode),
   what is an event (RPC with mode, transfer and channel), what a client may request. Streams of
   unreliable_ordered updates get their own transfer channel, channel last in `@rpc` (docs deltas 4,
   5); idle players send nothing below a velocity threshold (pA9RGn87Uag [00:42:16]). GATE: no
   object without an owner; no client-owned health, score or inventory unless the brief accepts
   cheating.
2. **Build the replication in code.** `gd_net.install_netkit(P)`, then
   [`net_build.gd`](scripts/agentkit/multiplayer/net_build.gd) (`make_sync`, `make_spawner`) writes
   scenes with `SceneReplicationConfig` set in code; the Replication panel is for humans
   ([`references/gui-paths.md`](references/gui-paths.md)). Players: name = peer id,
   `add_child(node, true)`, authority in `_enter_tree`. GATE: `net_audit.gd:scene` has no flags
   (root paths resolve, no Object or RID property, no `@Node@2` names, intervals match modes).
3. **Session test on localhost.** `gd_net.session(P, roles)` runs a server and 2 to 3 clients, each
   in its own APFS clone, all machine slots held first. Cover the lobby gate, a late joiner, a
   leaver, cheat RPCs, and a password through `auth_callback` plus `complete_auth` on both sides
   (P5). GATE: every client sees every player, the late joiner sees all, the leaver's node is freed
   everywhere, authority report correct, forged RPCs rejected, logs clean.
4. **Latency pass.** Rerun through `UdpLagProxy` at 100 and 250 ms, then 250 ms with 30 ms jitter
   and 5 % loss; `replication_delay()` measures how far behind the server truth a remote client
   shows a player. GATE: the numbers fit the genre, or prediction is planned (netfox or own).
5. **Bandwidth pass.** Server KiB/s per client from ENet counters (`bandwidth` in the result), per
   mode, interval and visibility. GATE: under the budget at max players, fps capped.
6. **Web and transports.** Same session with `transport="websocket"`; for a browser build, export
   Web and run the client in headless Chrome (procedure P9). WebSocket is TCP: "unreliable" RPCs
   arrive reliable and ordered, with head-of-line blocking under loss; WebRTC gives unreliable
   browser channels but needs signalling, STUN/TURN and webrtc-native on desktop (WebRTC doc;
   wgIqB6JNcro [00:19:35]). An HTTPS page needs `wss://`. A background tab stops `_process` and the
   socket drops: build reconnect (web doc). GATE: the browser client joins, sees all players, RTT
   measured.
7. **Dedicated server.** `gd_net.server_preset()`, export, compare client and server packs
   (`pack_report`), run the exported binary without `--headless` and connect clients. Set
   `application/run/flush_stdout_on_print=true` for systemd or journald logs (docs delta 12; default
   false, measured). GATE: `dedicated_server` feature true, display `headless`, no client textures
   in the pack, exit 0.
8. **Look.** A windowed observer client captures the replicated world (`capture_at`); open it. GATE:
   players where the server says, colors per peer, nothing missing.

## Harness in one call

```python
import sys; sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-multiplayer/scripts"]
import gd_net
gd_net.install_netkit(P); gd_net.build_scenes(P)          # res://net/world.tscn, player.tscn, props
roles = [gd_net.role("server", role="server", port=24010, lobby_size=2),
         gd_net.role("c1", role="client", port=24011, index=0, delay_s=0.3, cheat_at=2.0),
         gd_net.role("c2", role="client", port=24011, index=1, delay_s=0.3)]
with gd_net.UdpLagProxy(24011, 24010, rtt_ms=100, jitter_ms=0, loss=0.0):
    s = gd_net.session(P, roles)                            # one APFS clone and one Godot per role
s["roles"]["c1"]["result"]["rtt_median_ms"]                 # every NetLab number is in AGENT_RESULT
```

Your own game uses the same pattern: a job script per role (`role(name, script=...)`), user args
after `--`, `AGENT_RESULT` printed by each process. Keep ports unique per project; two roles never
share a project folder.

## Prediction, rollback and backends (not run here)

netfox gives server authority with client prediction and rollback: input gathered on the network
tick, logic in `_rollback_tick`, `NetworkTime.physics_factor` around `move_and_slide`,
`TickInterpolator` for display (GqHTNmRspjU [00:06:58, 00:18:55, 00:21:24]; iP_xdJ0peFo [00:28:00]).
Prove it on a small prototype first: it is opinionated (GqHTNmRspjU [00:34:53]). Deterministic
input-only rollback fits fighting and RTS-like games with 2 to 8 players (David Snopek,
zvqQPbT8rAE). Steam (GodotSteam, SteamMultiplayerPeer), Nakama, Colyseus and WebRTC P2P swap the
peer and lobby calls; authority, spawner and synchronizer code stays the same (Gwizz, fUBdnocrc3Y;
AndrooDev, wgIqB6JNcro [00:07:18]). None of these ran here: they need a third-party addon, an
account or a signalling server. Verify against the installed release before quoting an API.

## Numbers

| Value                                         | Measured here (2026-10-02, M-series Mac, localhost)                                                        | Relative to                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| RPC round trip, no proxy                      | 16 to 19 ms                                                                                                | 60 fps both ends; one frame each way dominates        |
| ENet RTT statistic                            | 15 to 23 ms                                                                                                | same                                                  |
| Own input to visible motion, server authority | 47 to 52 ms                                                                                                | about 3 frames                                        |
| Remote view behind server truth               | 20 to 30 ms, 0.07 m error at 3 m/s                                                                         | no proxy                                              |
| Same at 100 / 250 ms RTT                      | 70 to 80 / 150 to 155 ms; 0.22 / 0.44 m                                                                    | `UdpLagProxy`, adds about 6 ms per direction          |
| 50 props, ALWAYS, 60 fps                      | 72.6 KiB/s, moving or idle                                                                                 | 1 client                                              |
| ON_CHANGE moving / idle                       | 98 to 101 / 2.3 KiB/s                                                                                      | same                                                  |
| ALWAYS, `replication_interval` 0.05           | 21 to 22 KiB/s                                                                                             | same                                                  |
| ALWAYS, uncapped headless server (145 fps)    | 160 to 175 KiB/s                                                                                           | same                                                  |
| `auth_timeout` default; kick of a silent peer | 3.0 s; 1.50 s after setting 1.5                                                                            | server                                                |
| Web export, single-thread                     | 40 MB, wasm 39.5 MB (10.1 MB gzip)                                                                         | handoff to scenario-godot-performance-export          |
| Dedicated server pack / client pack           | 0.11 / 3.27 MB (3.1 MB texture stripped)                                                                   | same project                                          |
| `spawn_limit`                                 | 0 = unlimited (default); limit 2: third `spawn()` logs "Spawn limit reached!", returns null, clients get 2 | M14; raise it to max players (jgJuX04cq7k [00:18:34]) |

## Quality gates

- Measurable: `net_audit` flags empty; every role `ok` with no unexpected engine error;
  `players_seen_max` equals the player count everywhere; authority body 1, input = peer; teleport
  counts as expected; RTT and `replication_delay` at 100 and 250 ms; KiB/s per mode; `rpc_audit`
  reviewed, `rpc_pair_check` ok; exported server boot dict correct.
- Visual: observer capture shows every player; under 250 ms no streak after a teleport; the browser
  screenshot shows the replicated players.

## Common mistakes

| Mistake                                                                             | What it looks like                                      | Fix                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Players spawned only on the server without a spawner, or spawner `spawn_path` empty | client sees nobody                                      | `MultiplayerSpawner` with `spawn_path` and the scene in its list; server calls `add_child`     |
| Authority read from a synced property in `_enter_tree`                              | authority 1 everywhere on clients                       | authority from `name.to_int()`                                                                 |
| Runtime node without `add_child(node, true)`                                        | `@Node@2` names, "node not found" on RPC                | readable names                                                                                 |
| `await` before `get_remote_sender_id()`                                             | sender 0, validation passes or fails wrongly            | read the sender first                                                                          |
| RPC added on the server script only                                                 | checksum error, the wrong method runs                   | one script, or `rpc_pair_check`                                                                |
| Object or Resource as RPC argument                                                  | no error; receiver gets `EncodedObjectAsID`             | send ids, paths or plain data                                                                  |
| Client owns its body in a competitive game                                          | speed and teleport hacks stick                          | input-only authority plus server simulation                                                    |
| Headless server not capped                                                          | 2.4 times the bandwidth                                 | `--max-fps 60` or intervals                                                                    |
| `server_relay` turned off for a P2P-style feature                                   | "Attempt to call RPC with unknown peer ID"              | keep relay on, or route through the server                                                     |
| Freeing a networked branch in the wrong order                                       | "isn't currently active", "Node not found"              | offline peer, free contents, drop custom API, free branch                                      |
| Server export in normal mode                                                        | full-size pack, window opens                            | dedicated server export mode, Strip Visuals                                                    |
| Server start inside `assert()`                                                      | works from the editor; the release export never listens | `var err := peer.create_server(port)`, then check `err` (M15: assert body stripped in release) |
| Client info sent from `peer_connected`, or id 0 registered                          | duplicate nodes on late joiners, a phantom player       | `connected_to_server`; skip id 0                                                               |
| Client and server on different Godot versions                                       | connection or protocol failures                         | same 4.7.2 build (protocol changed in 4.3)                                                     |

## Handoffs

- Receives: the game scene and player controller from scenario-godot-gameplay and
  scenario-godot-3d-world or scenario-godot-2d; architecture rules from scenario-godot-architecture.
- Delivers: network design note, kit scenes or scripts, session evidence JSON, server preset; the
  web build size and headers go to scenario-godot-performance-export, CI jobs to
  scenario-godot-pipeline-automation, lobby screens to scenario-godot-ui.

## Godot 4.7 notes

- `get_rpc_config` became `get_node_rpc_config` (4.5); `@rpc` tables live on
  `Script.get_rpc_config()`.
- `auth_timeout` is the property; the docs page spells `auth_timout`.
- 4.7.2 fixed peers that stopped replicating after deleting a spawner-spawned node.
- Godot 3 names (`NetworkedMultiplayerENet`, `remote`, `rset`, `get_rpc_sender_id`) do not exist;
  `gd_net.rpc_audit` flags them.
- WebRTC on desktop needs the webrtc-native extension: `initialize()` returns OK and only logs an
  error without it (measured).
- Open: under heavy machine load, 4 of 20 ALWAYS runs sent about 10 packets/s instead of 68 (ENet
  throttle at 0). Log `NetUtil.enet_throttle()` in long sessions (P8).
- Two peers leaving in one server frame log "Unable to send packet on channel 0" (ENet) or
  `ready_state != STATE_OPEN` (WebSocket); harmless, whitelisted by exact text.

## References

- [`references/procedures.md`](references/procedures.md): P1 to P14 with code, test ids and results.
- [`references/expert-notes.md`](references/expert-notes.md): claims by expert with timestamps and
  verified corrections.
- [`references/critique.md`](references/critique.md),
  [`references/gui-paths.md`](references/gui-paths.md) (Replication panel, Run Instances, Network
  Profiler), [`references/sources.md`](references/sources.md).
- [`scripts/gd_net.py`](scripts/gd_net.py),
  [`scripts/agentkit/multiplayer/`](scripts/agentkit/multiplayer/): the harness and kit.
