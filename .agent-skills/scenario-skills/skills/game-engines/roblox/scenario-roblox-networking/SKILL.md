---
name: scenario-roblox-networking
description: "Use when securing a Roblox experience against exploiters or designing its networking: RemoteEvent, RemoteFunction or UnreliableRemoteEvent design, validating remote arguments on the server, remote spam and rate limits, speed hacks, teleport or fly hacks, kill aura or hitbox abuse, hit validation under lag, network ownership and fling exploits, ProximityPrompt or ClickDetector abuse, honeypots, kick and ban policy, Server Authority (AuthorityMode) setup, bandwidth or payload size problems, or after an exploit (free items, infinite money, duplicated items)."
license: MIT
---

# Roblox Networking and Security

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means every client-triggerable action is attacker input: the server owns state,
checks each call in a fixed order, and proves it by firing hostile arguments from a playtest client.
Detection supplements validation, and visible consequences come late, from varied signals.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Remotes carry intent, never results.** The client names an item, and the server prices it. A
   weapon reports origin and hit point, never the victim or the damage (Creator Docs, client-server
   boundary; GnomeCode).
2. **Check in a fixed order: rate, then arguments, then context.** The docs list context, type,
   value and rate; running the rate limit first is cheapest [added]. NaN passes
   `typeof(v) == "number"` and fails every comparison, so use `math.isfinite` (Creator Docs; Suphi
   Kaner). Live, NaN and infinity payloads through a handler that only range-checked set an IntValue
   balance to -9223372036854775808.
3. **An Instance argument is a claim.** Check `typeof` and `IsDescendantOf(expectedFolder)`: a table
   can mimic an Instance, and a client can replay a destroyed pickup it still references (Creator
   Docs; Suphi Kaner).
4. **Every client-triggerable surface is a remote.** ProximityPrompt checks distance on `Triggered`
   only and ignores `Enabled`. ClickDetector has no server checks. `Touched` reports the client's
   physics (Creator Docs; Suphi Kaner).
5. **Movement: Server Authority for new competitive games, a server MoveGuard for existing casual
   places.** The deciding condition is genre plus whether you can adopt fixed simulation,
   InputActions and streaming (Creator Docs; Jason Knight, Roblox). Server Authority does not stop
   ESP, aimbots or camera abuse (ev1).
6. **Validate hits against what the attacker saw.** Roblox has no built-in lag compensation (ev1).
   Rewind server-recorded positions over `[now - min(ping + 0.1, 0.4), now]` [added], or use a cone
   of about 10 degrees (ev1). Obstruction uses static geometry only (Creator Docs).
7. **Consequences climb a ladder and arrive late.** Keep a decaying suspicion score, require two
   distinct reasons before enforcement, and delay visible action randomly by 20 to 90 s [added
   numbers]. Honeypot remotes and direction honeypots are high-confidence signals (Creator Docs,
   server-side detection). For movement, rubber-band instead of kicking, because lag causes false
   positives (GnomeCode).
8. **UnreliableRemoteEvent only for frequent cosmetic data under 1,000 bytes.** The cap is 1,000
   bytes (Creator Docs); the 900 figure in a 2025 Roblox Learn video is outdated, and live a
   980-byte random buffer arrived while 1,000 was dropped. Both remote types need identical
   validation.

## Establish first

- `Workspace.AuthorityMode`: Automatic means client-owned characters (MoveGuard applies); Server
  means the engine simulates them. `rbx_net.audit_place(place)` reads all six settings offline.
- Stakes: competitive or casual, live or prototype. A prototype can defer honeypots and the ladder,
  never validation.
- Remote inventory: name, direction, frequency, payload size, and what server value each handler
  writes.
- Interactive surface: prompts, ClickDetectors, DragDetectors, `Touched` pickups, and whether their
  parents are unanchored.
- Enforcement policy: kick, `Players:BanAsync`, or mitigation only; who handles appeals
  (`Net.reset`).
- Defaults when unanswered: every remote through `Net.bind`, one honeypot, `Net.serverOnly` on
  server-to-client remotes, enforcement as a dry run during tests.

## Procedure

Run each stage through the toolkit; full code and test results are in
[procedures.md](references/procedures.md). Status: 24 live tests pass in Studio 0.743 (arena rerun
and Server Authority place on 2026-10-19). Keep `NetKit` (`Guard`, `RateLimit`, `Suspicion`, `Net`,
`HitCheck`, `MoveGuard`) as ModuleScripts under one server folder. `rbx_net.kit_tree(project_dir)`
gives the Rojo fragment for a test place; in a user's repository, `rbx_net.vendor_kit(repo, dest)`
copies the modules in and returns paths inside it.

1. **Audit.** Goal: a list of every remote, handler and interactive instance with findings. How:
   `rbx_net.audit_place(place)` offline (Lune), then
   `rbx_net.run(studio, "return NetAudit.run(game, Audit)", kit=["NetAudit"], lead_kit=["Audit"])`
   in Edit. GATE: zero errors; every warning fixed or justified; live tally equals offline tally.
2. **Validate and limit.** Goal: no handler runs on bad arguments or at flood rates. How:
   `Net.bind(remote, {args = {Guard...}, limit = {capacity, perSecond}, handler = fn})` for every
   client-to-server remote; idempotent handlers on the server clock. GATE: the audit shows no
   `handler-unvalidated`, `nan-unsafe`, `trusted-value` or `no-rate-limit` finding.
3. **Hits.** Goal: claims checked against history. How: a 1 s `HitCheck.History` per target pushed
   every Heartbeat, `HitCheck.melee` and `HitCheck.ranged` with `ExcludeInstances` or
   `IncludeInstances` for static walls. GATE: out-of-reach, fake-origin, through-wall and offset
   shots rejected; valid shots hit.
4. **Movement.** Goal: speed and teleport hacks neutralized without false positives. How: Server
   Authority (Rojo writes the settings, stage P11), or `MoveGuard.start` with
   `MoveGuard.grace(player, s)` before every server teleport; `enforce = false` only logs, then
   measures from where the character stands. GATE: honest walk 0 flags; client teleport and local
   WalkSpeed changes rubber-banded (live: WalkSpeed 80 for 2.5 s netted 12.6 studs on the server).
   Under Server Authority, live: W held 2 s moved the server character 32.4 studs, a client teleport
   0, local WalkSpeed 80 then W 32.0.
5. **Ownership and surfaces.** Goal: no client-owned part decides an outcome. How:
   `SetNetworkOwner(nil)` on unanchored pickups, NPC roots and prompt parents; `Net.prompt`
   re-checks distance, state and rate; a distance check in `MouseClick`; `Net.touch` for `Touched`
   pickups (toucher, `CanTouch`, distance, MoveGuard reach, shared limiter). GATE: a client CFrame
   write moves nothing on the server.
6. **Exploit tests from the Client.** Goal: proof, not intent. How: in a `Playtest`,
   `rbx_net.fuzz(pt, path, gap=...)`, a same-frame spam, a honeypot fire, then `rbx_net.net_log(pt)`
   in the Server data model. Include a deliberately vulnerable remote as a negative control. GATE:
   balances and health unchanged, `ok_<Remote>` equals the valid-case count, no server script error,
   the negative control pays out. A `Touched` pickup has no remote: use `exploit_case` with a client
   teleport onto the part, then a `Net.touch` part and a bare `Touched` part side by side (P6).
7. **Detection and consequences.** Goal: high-confidence signals, delayed action. How:
   `Net.init({enforce = ..., enforceDelay = {20, 90}})`, `Net.honeypot`, `Net.serverOnly`. GATE: one
   honeypot fire reaches `enforce` with a scheduled delay; a flood alone stays below `restrict`.
8. **Latency.** Goal: valid play survives real ping. How: `rbx_net.set_latency(studio, 100, 100)` in
   Edit before Play, last-moment swings at a moving target. GATE: rewind hit rate at least 0.8. Live
   at 202 ms ping: rewind 13 of 13, no rewind 0 of 13 (three runs). Trigger the swings close to
   reach plus slack: with 0.2 s of margin left, the no-rewind rate swung from 31 to 92 percent
   between runs.
9. **Bandwidth.** Goal: small, on-change traffic. How: `rbx_net.payload_probe` before choosing
   unreliable delivery; pack with `buffer`; sequence numbers on streams. GATE: payloads measured
   under the cap; stream accepted count equals sent.

## Numbers

| Value                   | Relative to                                                             | Source                                                                                      |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1,000 bytes             | UnreliableRemoteEvent payload after compression; a lone buffer fits 996 | Docs; live: random 980 arrived, 1,000 "went over by: 4 bytes"                               |
| About 500 per second    | Client-to-server requests per client, per remote type                   | RemoteEvent reference; not observed in a Studio playtest (live: 1,000 arrived within 0.5 s) |
| Burst 5, 1 per 2 s      | Docs token bucket sample `TokenBucket.new(5, 10)`                       | Docs                                                                                        |
| 50 dropped calls in 1 s | Flood flag threshold, once per window                                   | [added]                                                                                     |
| WalkSpeed + 5 studs/s   | MoveGuard allowed XZ speed, dt clamp 0.01 s                             | Suphi Kaner                                                                                 |
| 6 studs, leak 0.5/s     | MoveGuard burst bucket                                                  | [added]                                                                                     |
| 0.1 s interp, 0.4 s cap | Rewind window `[now - min(ping + 0.1, 0.4), now]`                       | [added]                                                                                     |
| About 10 degrees        | Hit plausibility cone                                                   | ev1                                                                                         |
| 1, 3, 6, 10             | Suspicion levels log, mitigate, restrict, enforce; half-life 120 s      | [added]                                                                                     |
| 20 to 90 s              | Random delay before visible enforcement                                 | [added]                                                                                     |
| 64, 50 chars            | Replicated attributes per predicted instance; name and string length    | Docs                                                                                        |
| 0.5 percent             | Highest scripted packet loss (`5` reads back `0.5`)                     | live                                                                                        |
| 50 KB/s                 | Roblox's send and receive target per client (Stewiepfing aims for 25)   | Stewiepfing                                                                                 |

## Quality gates

Measurable:

- Audit: zero errors; every warning resolved or written down with a reason.
- Fuzz: every hostile case lands in `args_<Remote>` or `rate_<Remote>`; balances, health and pickups
  unchanged.
- Spam: 1,000 same-frame reward fires grant once; purchases never exceed the bucket.
- Hits, movement, ownership, prompts: verdict counters match the test cases (procedures P4 to P6).
- Console during the fuzz: no `ServerScriptService.<script>:<line>` error from your handlers.
- Latency: hit rate at 100 ms each way within 0.2 of the baseline.
- Types: zero errors on both Luau solvers, `luau-lsp analyze` with and without
  `--flag:LuauSolverV2=true`, with a sourcemap built by `rojo sourcemap --include-non-scripts`
  (scenario-roblox-tooling gate).

Visual:

- A client capture during play with no flags from `rbx_review.image_checks`.
- For Server Authority, the visualizer under simulated latency (GUI only,
  [gui-paths.md](references/gui-paths.md)).

Score the result with [critique.md](references/critique.md) before calling it done.

## Common mistakes

| Mistake                                                            | Symptom                                    | Fix                                                            |
| ------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| Range check without `math.isfinite`                                | Balance becomes NaN or INT64_MIN           | `Guard.num`, `Guard.int`, `Guard.vec3`                         |
| Client sends price, damage or amount                               | Free items, infinite money                 | Client names the item; server looks it up                      |
| Debounce as the only pickup guard                                  | Duplicated pickups from replays            | `Guard.inst(folder)`, destroy on grant                         |
| Rate limit on the client only                                      | Remote spam still lands                    | Server bucket per UserId, cleared on PlayerRemoving            |
| Kick on one movement flag                                          | Laggy players kicked                       | Rubber-band, score, two reasons, delay                         |
| No grace on server teleports                                       | Your own teleport flags players            | `MoveGuard.grace(player, s)` first                             |
| Unanchored prompt parent                                           | Prompt used from anywhere                  | `SetNetworkOwner(nil)` or anchor                               |
| `InvokeClient` for answers                                         | Server thread hangs forever                | RemoteEvent request and reply with a timeout                   |
| Batching into an UnreliableRemoteEvent                             | Silent drops past 1,000 bytes              | Reliable for batches; measure with `payload_probe`             |
| Hits checked at "now" only                                         | Valid hits rejected under lag              | Rewind window or cone                                          |
| Raycast against moving players for walls                           | Lag rejects real shots                     | Static geometry only                                           |
| LocalScript under ReplicatedStorage as loader                      | Client code never runs                     | Script with `RunContext` Client                                |
| Server Authority test driven by `MoveTo` or `character_navigation` | Nothing moves, so every hack looks blocked | Hold keys (`Playtest.press`); prove an honest walk moves first |

## Handoffs

- Receives from scenario-roblox-architecture: the remote list, folder layout and where state lives.
- Receives from scenario-roblox-gameplay: hitbox, projectile and ability rules to validate.
- Delivers to scenario-roblox-data: validated, finite, size-checked values before any save, plus
  trade and purchase atomicity questions.
- Delivers to scenario-roblox-monetization: grants only from `ProcessReceipt`; the `purchase-signal`
  finding.
- Delivers to scenario-roblox-performance: payload sizes, send rates and the Server Authority
  simulation budget.
- Asks scenario-roblox-luau for buffer packing and Parallel Luau questions, and
  scenario-roblox-tooling for CI wiring of the offline audit.

## Current Roblox notes

- Server Authority reached full release on 2026-07-09. `AuthorityMode` Server sets StreamingEnabled,
  Deferred signals, UseFixedSimulation, NextGenerationReplication and
  PlayerScriptsUseInputActionSystem.
- Scripts cannot read or set those settings from Studio's MCP context ("lacking capability
  RobloxScript"); write them in the Rojo project or the Properties panel. Check them by behavior:
  Deferred signals, input-only movement.
- Inside `BindToSimulation`, use `time()`; `task.defer` leaves the simulation step; effects belong
  in RenderStepped, not in the simulation.
- `RaycastParams.ExcludeInstances` and `IncludeInstances` replace `FilterDescendantsInstances` and
  `FilterType` (2026-04-07); `Blacklist` and `Whitelist` are gone.
- The Network Simulator is in beta and drives `NetworkSettings`; the legacy `IncomingReplicationLag`
  still exists but is not the tool.
- Yielding APIs carry the `Async` suffix (`BanAsync`, `UnbanAsync`, `GetBanHistoryAsync`).

## References

- [references/expert-notes.md](references/expert-notes.md): principles and judgment by expert, with
  timestamps and live measurements.
- [references/procedures.md](references/procedures.md): full code for stages P1 to P11 with test ids
  and live results; loose-part and detector checks (P6), the Server Authority migration list (P11)
  and ordering traps.
- [references/critique.md](references/critique.md): pass and fail rubric for your own output.
- [references/gui-paths.md](references/gui-paths.md): Studio menus for the same tasks, with scripted
  substitutes.
- [references/sources.md](references/sources.md): every doc and video, with credentials and
  timestamps.
- [scripts/rbx_net.py](scripts/rbx_net.py): audit, kit tree, fuzz, payload probe, latency and NetLog
  helpers.
- [scripts/agentkit/networking/](scripts/agentkit/networking/): `Guard`, `RateLimit`, `Suspicion`,
  `Net`, `HitCheck`, `MoveGuard`, `Exploit`, `NetAudit`, `lune_net_audit.luau`.
