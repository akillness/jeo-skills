# Expert notes: networking and security

Principles and judgment calls, grouped by source, with timestamps. Full source list:
[sources.md](sources.md). Lines marked [added] are this skill's own synthesis, and "live" lines were
measured in Studio 0.743 on 2026-10-18 (see [procedures.md](procedures.md)).

## Roblox Creator Docs (security, remotes, Server Authority)

Client-server boundary (create.roblox.com/docs/scripting/security/client-server-boundary):

- The server decides; the client reports intent.
- Validate in layers: context and permission, type and structure, value (range, NaN, infinity), then
  rate.
- NaN passes `typeof(v) == "number"` and fails every comparison, so range checks alone let it
  through. Reject it with `math.isfinite`.
- Exploiters send tables that mimic Instances. Check `typeof(v) == "Instance"` and
  `v:IsDescendantOf(expectedFolder)`.
- Every client-triggerable surface is attack surface: remotes, ProximityPrompt, ClickDetector,
  DragDetector.
- ProximityPrompt: only `Triggered` has a server distance check. The server accepts events while
  `Enabled` is false, and the client can change `Enabled`, `MaxActivationDistance`,
  `RequiresLineOfSight` and `HoldDuration` locally.
- ClickDetector has no server-side checks. DragDetector respects only `Enabled` and
  `PermissionPolicy`.
- An unanchored part under a prompt lets an exploiter take ownership and move the part to
  themselves, which defeats distance checks.
- Weapons: the client reports origin and hit position, never the victim. The server checks origin
  near the server character (with latency tolerance), the hit near the reported part, and
  obstruction against static geometry only, so latency never rejects valid shots.
- Purchases are proven only in `ProcessReceipt`, never by `PromptProductPurchaseFinished`.
- Rate limits: a per-user token bucket, cleared on `PlayerRemoving`. The sample
  `TokenBucket.new(5, 10)` is a burst of 5 refilled at one token per 2 s.
- Client-side rate limits help UX but are never a security control.
- The four-question test for every handler: can an exploiter call this at any distance, any time,
  any rate, with garbage arguments?

Remote events and functions (create.roblox.com/docs/scripting/events/remote, RemoteEvent and
UnreliableRemoteEvent reference):

- About 500 client-to-server requests per second per client, shared by all remotes of one type.
  RemoteEvent excess is delayed; UnreliableRemoteEvent excess is dropped.
- A RemoteEvent with no handler queues (bounded, then logs a "Remote event invocation" error). An
  UnreliableRemoteEvent discards immediately.
- UnreliableRemoteEvent payloads above 1,000 bytes are dropped, in both directions since 2025-03-12.
- `InvokeClient` yields the server until the client answers; a client that never answers hangs that
  server thread forever.
- Live: in a Studio playtest all 1,000 same-frame RemoteEvent fires arrived within 0.5 s, so the 500
  per second throttle did not show in Studio; treat it as a live-server limit.
- Live: a 980-byte random buffer arrived through an UnreliableRemoteEvent and a 1,000-byte one was
  dropped with the console message "Unreliable Event dropped as its payload is too large".
  Zero-filled buffers up to 8,000 bytes arrived, so the cap applies after compression.

Network ownership (create.roblox.com/docs/scripting/security/network-ownership, docs
physics/network-ownership):

- The owner of an assembly has full authority over its physics, including its own character.
- An owning client can teleport, fly, change WalkSpeed invisibly to other scripts, bypass
  collisions, write NaN or infinite CFrames and skew `Touched`.
- Movement checks for places without Server Authority: average over time, project on XZ, exempt
  legitimate teleports, use a leaky bucket for bursts.
- Live: after `SetNetworkOwner(nil)`, a client write of +30 studs to a crate's CFrame moved it 0
  studs on the server; while the client owned it, the server saw the full 30 studs.

Server-side detection (create.roblox.com/docs/scripting/security/server-side-detection):

- "Design > detection": validation and rate limits come first; heuristics supplement.
- Keep a per-player suspicion score; visible action needs high thresholds and varied signals.
- Honeypot remotes (never fired by the real client) and direction honeypots (server-to-client
  remotes fired by a client) are high-confidence signals.
- Ladder: silent logging, quiet mitigation (drop, clamp, resync, rubber-band), temporary
  restrictions, then visible enforcement (kick, `Players:BanAsync`).
- "Delay visible consequences to avoid teaching exploiters exactly what triggered detection."

Server Authority (create.roblox.com/docs/projects/server-authority and /techniques):

- `Workspace.AuthorityMode = Server` needs five companion settings: StreamingEnabled, SignalBehavior
  Deferred, UseFixedSimulation, NextGenerationReplication, PlayerScriptsUseInputActionSystem.
- Use `time()` inside the simulation, never `tick()` or `os.clock()`. `task.spawn` keeps simulation
  restrictions; `task.defer` escapes them.
- Predicted instances replicate their first 64 attributes, with names and string values of at most
  50 characters.
- Trigger one-shot effects on state changes, never inside the simulation callback.
- Live: from the Studio MCP Edit context, `NextGenerationReplication` and `SignalBehavior` read as
  "not a valid member" and `PlayerScriptsUseInputActionSystem` as not readable by the current
  thread, so scripts cannot switch a place to Server Authority; Rojo writes all six (see procedures
  P11).
- Live (SA place, 2026-10-19): with all six settings on, a client teleport and a local WalkSpeed of
  80 moved the server character no further than an honest walk, and both were undone on the client
  too. This matches Jason's "hacks have no effect" [hb14MxhZiOU 00:03:42]. [added] Input-only
  movement also means `Humanoid:MoveTo` from the client and Studio's `character_navigation` move
  nothing, so test harnesses must hold keys.

Network Simulator (create.roblox.com/docs/studio/network-simulator):

- Latency, jitter and loss apply per direction to Studio playtests only; ping is a round trip, so
  100 ms each way adds about 200 ms.
- Every control maps to a `NetworkSettings` property (`InboundNetworkMinDelayMs` and the rest), so
  tests can set it from a plugin-level script.
- Live: `InboundNetworkLossPercent = 5` read back as 0.5, so scripted loss is capped at 0.5 percent.
  The legacy `IncomingReplicationLag` still exists and reads 0.

Replication order and deferred events (create.roblox.com/docs/scripting/attributes,
/scripting/events/deferred):

- "The Roblox Engine doesn't guarantee the order in which objects (and changes to objects) are
  replicated from the server to the client." Changes of the same type generally arrive in order; a
  property change and a remote do not.
- Under Deferred signals, `Destroy()` takes effect once the calling script yields, so removal
  handlers see an instance that is already gone.

DragDetector (create.roblox.com/docs/ui/3D-drag-detectors and the DragDetector reference):

- With `RunLocally` false (the default), the client sends `DragStart`, `DragContinue` and `DragEnd`
  to the server, and handlers belong in server Scripts.
- `PermissionPolicy` Scriptable plus `SetPermissionPolicyFunction(player, part)` is the server-side
  gate; no registered function blocks every player.

## Crusherfire, "Roblox Deferred Engine Events" (2024)

- Deferred queues handlers and runs them at the next resumption point in the same frame [xz_G2n1Q8-U
  00:00:00 to 00:01:12].
- A handler connected inside another handler misses a fire that already happened in the same chunk
  [00:03:19 to 00:05:51].
- Nested fires run breadth-first: A, B, C instead of A, C, B [00:06:06 to 00:08:52].
- `CharacterRemoving` sees `Parent` nil and no `AncestryChanged` print under Deferred; capture state
  before destroying [00:08:54 to 00:13:17].

## Suphi Kaner, "Stop Exploiters" (2021) and "Packet" (2025)

- Anything a LocalScript can do, an exploiter can do: they read your remotes and call them with any
  value [SFAwwmb8G6o 00:04:26].
- Validate in order: type, NaN, sign, integer-ness, then balance [SFAwwmb8G6o 00:11:57]. Fractions
  such as 0.00001 slip past sign checks [00:08:14].
- NaN makes balances NaN permanently; check every Vector3 component too [00:09:19, 00:11:00]. Live:
  the fuzz payloads (NaN and infinities) through a handler that only range-checked turned an
  IntValue balance into -9223372036854775808.
- `Touched` and "I touched the apple" from a client are claims; anchoring the item is not enough
  [00:12:30, 00:14:16].
- Setting the character's owner to nil stops teleports but feels "almost unacceptable" [00:19:08].
  Keep client ownership and track speed on the server instead.
- Speed tracking: last trusted position and time, cap `WalkSpeed + 5`, clamp delta time to at least
  0.01 s, return the last trusted position on a violation [00:20:09, 00:23:22, 00:26:03].
- A client holding a reference to a destroyed pickup can still fire it; check that the instance is
  still parented where it belongs, not only a debounce [00:32:35, 00:35:11].
- Failing type checks is itself a cheat signal worth logging [00:05:35].
- Do not batch into an UnreliableRemoteEvent: the 1,000-byte cap and loss multiply [WoIElUdj64A
  00:50:17].
- Cap the received buffer size on the server and range-check values after deserializing; integer
  types wrap silently (265 as U8 becomes 9) [WoIElUdj64A 00:48:10, 00:07:36].
- A response timeout (Packet uses 10 s) replaces `InvokeClient` hang risk [WoIElUdj64A 00:16:38].
- A native remote call with no values costs 14 bytes; batching 1,000 events cost about 1 KB with
  Packet versus 14 KB natively [WoIElUdj64A 00:56:49].

## Jason Knight and Brian Neeler (Roblox), Drew Hamilton, Server Authority talks (2026)

- The client sends only inputs; the server simulates; the client predicts; other players are always
  50 to 100 ms in the past [hb14MxhZiOU 00:01:00, 00:09:06].
- With Authority on, speed and fly hacks have no effect on the server; the hacker sees only their
  own glitching [hb14MxhZiOU 00:03:42].
- Three rules: the simulation runs on client and server, all update logic lives in
  `RunService:BindToSimulation`, and 100 percent of touched data is synchronized (InputActions,
  attributes, ValueBase) [9IqNHhYXK0s 00:07:14].
- Failure list: unsynchronized Lua state (an upvalue read inside the simulation), effects inside the
  simulation that replay on resimulation, predicting too much [9IqNHhYXK0s 00:21:46, 00:22:15].
- Around 10,000 predicted instances, the system adds input latency; keep the predicted set small
  [9IqNHhYXK0s 00:22:51].
- Test loop: the visualizer (Ctrl or Cmd+Shift+F6) plus simulated latency (60 ms, 10 ms jitter); aim
  for 100 percent prediction success [9IqNHhYXK0s 00:10:06].
- Migrate the character controller first [9IqNHhYXK0s 00:15:12].
- Only attributes and physical properties roll back [-DJy_CfK2Vk 00:01:57].

## ev1, Inspire 2026 (two years on server-authoritative projects)

- Server Authority is not an anti-cheat by itself: camera control, ESP and aimbots remain
  [v_yyUwr0p2Q 00:05:50, 00:31:23].
- Roblox's feature has no lag compensation; rewind in Luau, or check claimed hits against a
  plausibility cone of about 10 degrees [00:12:51, 00:35:46].
- Trust only the look direction from the client (camera in first person, mouse in third person)
  [00:35:46].
- Server Authority fits competitive games best; social and simulator games mostly gain anti-fling
  [00:32:31].
- A 60 Hz simulation step, or 30 Hz to trade precision for player count [00:36:53].

## GnomeCode, "Securing Against Exploiters" (2023)

- Price tables live on the server; negative amounts are the first exploit to try [2jvahdJnQRI
  00:03:01].
- Pickups: add a server distance check such as `(root - item).Magnitude < 5` [00:08:35].
- NPCs and pickups: `SetNetworkOwner(nil)` right after parenting [00:06:52].
- With ownership shown, zombies and coins inside the player's owned sphere moved on the server when
  the client dragged them [00:06:20].
- For movement flags, teleport back instead of banning, because lag causes false positives
  [00:22:40].
- Dated: `RaycastFilterType.Blacklist` and `tick()`; use `ExcludeInstances` and `time()`.

## Steven (Roblox Learn), Stewiepfing, Ludius, BrawlDev

- Default to a reliable RemoteEvent; use unreliable only for frequent, small, loss-tolerant,
  cosmetic data [n5uOVlCIUjI; jRl5msZxcqk].
- Test under 200 ms latency, 10 percent drop and 10 percent reorder [n5uOVlCIUjI 00:07:56]. Live:
  scripted loss caps at 0.5 percent, so higher loss needs the GUI or an external tool.
- Outdated: the 900-byte unreliable cap [n5uOVlCIUjI]; the docs say 1,000 and the live probe dropped
  a 1,000-byte random buffer while 980 arrived.
- Server rate limiter: last-fire time per player with `os.clock()`, cleared on PlayerRemoving
  [3L2a9mrOyFk 00:06:55].
- Bandwidth targets: Roblox suggests 50 KB/s; Stewiepfing aims for 25 KB/s (opinion) [3L2a9mrOyFk
  00:03:12]. Send on change, not on a timer [00:12:52].
- Ludius prefers client-side hit casting plus a server distance check for feel [vu-ZOoTjR-E].
  Deciding condition: casual game, accept it; competitive, validate origin, cone and obstruction or
  rewind.
- "Unreliable is not secure" [jRl5msZxcqk] is wrong: both remote types need identical validation.

## Judgment calls [added]

- Movement: new competitive game, Server Authority; existing casual place with client-owned
  characters, MoveGuard with rubber-band and no kick.
- Hit validation: rewind window `[now - min(ping + 0.1, 0.4), now]` over server-recorded positions;
  a cone check when there is no history. Live: at 100 ms each way, rewind kept the hit rate at the
  baseline while the same check without rewind rejected swings (P8).
- Enforcement: honeypots alone justify enforce (two distinct reasons in one fire); argument failures
  add 1 each; floods add 1 only when more than 50 calls are dropped within one second, so an
  autoclicker never escalates.
