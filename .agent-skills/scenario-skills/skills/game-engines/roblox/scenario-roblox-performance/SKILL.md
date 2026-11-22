---
name: scenario-roblox-performance
description: "Use when a Roblox experience is slow, laggy, stuttering, crashing or out of memory, or before shipping or updating one: my game lags on mobile, low FPS, frame spikes, server lag or low heartbeat, physics lag, network lag or high KB/s, memory leaks or memory that keeps growing, crashes on phones, long join or load times, too many parts, instances, draw calls or triangles, MicroProfiler, Script Profiler, Luau heap, Developer Console memory, Scene Analysis, StreamingEnabled tuning, performance budgets, and publishing, releasing an update, restarting servers or rolling back a version."
license: MIT
---

# Roblox Performance and Release

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means every claim is a number from the side that hurts, taken before and after one
change, and every fix removes work instead of hiding it. Budgets come from the low-end phone, and
Studio numbers are labeled as Studio numbers. Release is part of performance: ship with a restart
plan and a rollback path, and never publish without the owner.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Budget for the low-end phone; label Studio numbers as Studio numbers.** McNeill's budget card
   targets a 2 GB phone: 500 draw calls, 500,000 triangles, 1.3 GB, 150,000 instances, 50 KB/s down
   (RDC 2024). Phones run CPU work about 4 times slower than a desktop. Studio memory "is incorrect
   in Studio, you need to test live" (McNeill). Studio runs the playtest Server and Client in one
   process, so server work shows in client frames [added, measured].
2. **Name the cause before the fix.** Label every per-frame system with `debug.profilebegin` and fix
   the longest lowest-level label (Roblox Learn, MicroProfiler). Studio's `execute_luau` reaches the
   Script Profiler, so an agent gets the same answer by code: `BasePart.CFrame [C]` and the scan
   label led the lab's server time (measured).
3. **Gate on frame consistency, compared per frame.** Fifty-nine 10 ms frames plus one 410 ms frame
   stutter at "60 fps" (Roblox Learn). Use the lead gate: p95 at most 1.2 times the budget, worst at
   most 2 times; healthy places read p95 17.2 to 17.4 ms at 60 fps. Compare script time per frame:
   per-frame work runs more often once a fix raises the frame rate [added, measured].
4. **Remove server work players never see.** "Never tween on the server" (Crusherfire). Resizing a
   welded server part re-replicates the whole assembly (McNeill and Lynn, RDC 2025). Anchoring idle
   zombies halved one game's server CPU (same talk). Anchoring is not enough when the server still
   moves the parts: anchored coins spun by the server sent 7.6 to 10 MB/s in Studio, and 12 KB/s
   once clients spun them (measured; `DataSendKbps` is in kilobytes per second).
5. **A leak is a rising floor, named by its owner.** Healthy memory is a sawtooth (Roblox Learn).
   Snapshot 3 or 4 times in the same state and trust only rows that keep rising (Crusherfire).
   Server leaks matter most, because a server outlives hundreds of players (Crusherfire). `Destroy`
   does not release a part's connections to other signals: each orb stayed in memory, unparented,
   held by its Heartbeat closure (measured).
6. **Replication is memory, bandwidth and join time.** Tags and attributes on every part replicate
   to every client: one game's crash rate rose from 3 to 4 percent to 45 percent (McNeill and Lynn).
   Each server-owned moving assembly costs about 1 KB/s, and a join replicates about 10,000
   instances per second (McNeill). Keep server-only data in Luau tables and heavy folders in
   ServerStorage; tune streaming instead of turning it off (Roblox Learn).
7. **Release is part of performance, and a person ships.** Handle `ServerRestartScheduled`, restart
   only outdated servers, and investigate a client crash rate above 2 to 3 percent after an update
   (docs). A rollback is restore, publish, restart: restoring alone publishes nothing (docs). Agents
   prepare and dry-run; the owner publishes.

## Establish first

- Symptom and side: low client frame rate, server lag (heartbeat under 60, rubber-banding for
  everyone), crashes or memory, join time, or bandwidth. One owner per symptom.
- Target devices: the lowest phone you support. Default: a 2 GB phone, 60 fps, budgets in
  [critique.md](references/critique.md).
- Live data: Performance dashboard numbers (crash rate, server memory by age, frame rate by device)
  if the game is live.
- Repro: a place or a scripted scenario that shows the problem in a playtest, with a debug spawner
  for load (N players, N NPCs, N items).
- Release state: unreleased, live with players, or mid-update; who may publish and restart (always a
  person).
- Defaults when unanswered: measure the Server and the Client, change one thing per playtest, no
  publish.

## Procedure

1. **Reproduce under load.** Goal: the slow case in a playtest, with numbers on both sides. How: a
   debug spawner driven by Workspace attributes (N players, N NPCs, N items; McNeill and Lynn), then
   `rbx_perf.measure(pt, 6)` on Server and Client at the same server `time()`
   ([P2](references/procedures.md)). GATE: baseline saved for both sides; the side that fails the
   frame gate is named.
2. **Audit statically.** Goal: costly patterns and counts before playtesting. How:
   `rbx_perf.audit_place(path)` in Lune; `PerfAudit.all(game)` in Edit (P1). GATE: every warn fixed
   or justified in one line; counts inside the Numbers table.
3. **Name the cause.** Goal: the function, label or asset that owns the cost. How:
   `rbx_perf.script_profile(s, side)` in the playtest; `MicroProf.capture` for labels in Edit;
   `SceneScan.all()` for triangles, instances and script memory (P3, P6). GATE: the top function or
   label is named with its ms per frame.
4. **Fix one thing per playtest.** Goal: a proven gain, nothing else changed. How: flip one
   attribute, measure at the same offset, `rbx_perf.compare(before, after)` with its 5 percent noise
   floor. Patterns in P4. GATE: the metric the fix touches improves past the noise floor; no other
   metric gets worse; the frame gate holds on the side that hurts.
5. **Soak for leaks.** Goal: memory that never comes down, with its owner. How: `PerfProbe.soak`,
   `HeapProf.diff` and `SceneScan` UnparentedInstances on the Server over 20 s or more, leak path on
   and off (P5). GATE: memory category growth and unparented instances stay flat; tracked objects
   stay bounded.
6. **Check scene, draws and streaming.** Goal: the worst view fits the phone budget. How: Client
   `Stats.SceneDrawcallCount` and `SceneTriangleCount`, the batching probe (P7), streaming radii in
   the project file (P8). GATE: draw calls, triangles and instances inside the Numbers table at the
   worst view.
7. **Hand the phone list to the owner.** Goal: device numbers Studio cannot give. How: the list in
   P9 and the GUI paths in [gui-paths.md](references/gui-paths.md). GATE: memory and frame rate from
   a real phone, or the report says "Studio only".
8. **Release.** Goal: an update players survive, with a way back. How: the restart handler (P10),
   saves from scenario-roblox-data, ShipCheck from scenario-roblox-tooling; the owner publishes and
   restarts outdated servers. GATE: handler tested in a playtest; the owner's go recorded; the agent
   never publishes.

## Numbers

| Value                        | Number                                                                                                 | Relative to                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Scene draw calls             | 500 or fewer, UI included                                                                              | low-end phone, worst view (McNeill) |
| Scene triangles              | 500,000 or fewer                                                                                       | same                                |
| Shadow draw calls            | up to 3 times the scene draws                                                                          | same                                |
| Client memory                | under 1.3 GB; ejections start past about 66 percent of 2 GB                                            | 2 GB phone, on device (McNeill)     |
| Instances                    | under 150,000; about 10,000 per second on join                                                         | join time (McNeill)                 |
| Replication down             | under 50 KB/s                                                                                          | per client (McNeill; Crusherfire)   |
| Server-owned moving assembly | about 1 KB/s each                                                                                      | McNeill                             |
| Phone CPU                    | about 4 times a desktop                                                                                | 10 ms desktop is about 40 ms        |
| Frame gate                   | p95 at most 1.2 x budget (20 ms), worst at most 2 x (33.3 ms); healthy places read p95 17.2 to 17.4 ms | 60 fps (lead gate)                  |
| Server memory                | 6.25 GiB plus 100 MiB per player; keep under half                                                      | docs                                |
| Client crash rate            | investigate above 2 to 3 percent                                                                       | docs                                |
| BulkMoveTo                   | 0.255 ms against 0.49 ms of per-part writes                                                            | Crusherfire's spinner               |
| Lab, all fixes               | Server script 12.0 to 0.36 ms per frame; server sends 6,526 to 11 KB/s; HUD instances 6,002 to 302     | Studio 0.743, desktop, one process  |

## Quality gates

Measurable:

- Frame gate on the side that hurts, from `PerfProbe.window(...).gate` or the lead `Stats.frames`.
- `rbx_perf.compare` rows past the noise floor for the metric each fix touches, with one result file
  per variant.
- `PerfAudit` 0 warn findings, or each one justified.
- Soak: memory category growth and unparented instances flat; tracked objects bounded.
- `SceneScan` and Client `Stats`: draw calls, triangles and instances inside the Numbers table.
- Every per-frame system carries a `debug.profilebegin` label; long-lived threads set
  `debug.setmemorycategory`.
- Restart handler connected in a playtest; P9 phone numbers reported by the owner or marked "Studio
  only".

Visual: a playtest capture through `rbx_review` of the worst view before and after
(`rbx_review.contact_sheet`), and the MicroProfiler or Script Profiler capture taken by hand when a
claim cites it ([gui-paths.md](references/gui-paths.md)). The full rubric is in
[critique.md](references/critique.md).

## Common mistakes

| Mistake                                                                            | Symptom                                      | Fix                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Gating on fps or Studio memory                                                     | Numbers that phones never show               | Frame-time p95 and worst; the P9 phone list                          |
| Comparing ms per second after a fix                                                | Per-frame work looks worse once fps rises    | Compare ms per frame                                                 |
| Gating on `Stats.HeartbeatTime`, Client `DataReceiveKbps` or `FrameTime` in Studio | Swings of 8 to 100 ms; 0 KB/s; 323 ms frames | Heartbeat dt, Server `DataSendKbps`, physics counts, Script Profiler |
| Two changes in one playtest                                                        | No change can be credited                    | One attribute per run                                                |
| Windows taken at different times                                                   | Leaks make later runs heavier                | Wait for the same server `time()`                                    |
| Anchoring but still moving parts on the server                                     | MB/s of replication                          | Move cosmetics on clients                                            |
| `Destroy` without releasing outside connections                                    | Unparented parts and table entries climb     | Disconnect in `Destroying:Once`                                      |
| Reading `gcinfo()` from `execute_luau`                                             | About 0.9 MB: the injected chunk's heap      | `HeapProf` memory categories                                         |
| Server tweens or resizing welded parts                                             | Replication spikes                           | Client-side tweens and resizes                                       |
| Tags or attributes on every part                                                   | Memory and crash rate rise                   | Server data in Luau tables                                           |
| Reading render stats from a covered Studio window                                  | Counters frozen at one value                 | Put parts in view and check the counters move first                  |
| Grid cells keyed by `Vector2`                                                      | Every lookup misses                          | `Vector3` or number keys                                             |
| Publishing to test a fix                                                           | Players get an unproven build                | Owner publishes; Version History restore, publish, restart           |

## Handoffs

- Receives from scenario-roblox-environment: EnvAudit counts and per-model streaming modes
  (environment owns per-model modes; streaming settings are decided here).
- Receives from scenario-roblox-luau: Bench and Parallel results, native candidates and leak slopes.
- Receives from scenario-roblox-gameplay: NPC bench numbers; from scenario-roblox-vfx-audio:
  emitter, beam and flipbook counts; from scenario-roblox-networking: payload sizes and send rates.
- Delivers to scenario-roblox-luau: the leaking function or hot loop. Cleanup code (`Leak`, class
  template), native code and Actors live there.
- Delivers to scenario-roblox-tooling: the go for a release. ShipCheck, Saved versions, Open Cloud
  publishing and `:restartServers` automation live there; agents run dry runs only.
- Delivers to scenario-roblox-data: the restart plan, so `BindToClose` and session saves fit the 30
  s shutdown budget.
- Delivers to scenario-roblox-ui, scenario-roblox-assets and scenario-roblox-animation: UI draw
  calls, texture or mesh budgets and rig timers (`updateInvalidatedFastClusters`) that failed a
  gate.

## Current Roblox notes

- `ScriptProfilerService` and `HeapProfilerService` are PluginSecurity. Studio's `execute_luau`
  reaches both on the playtest Server and Client; a game Script gets "lacking capability Plugin"
  (measured, [P3](references/procedures.md)).
- `SceneAnalysisService` exposes the Scene Analysis window as six queries. It answered in Edit, on
  the playtest Server and on the Client, and a game Script can call it (measured).
- Draw calls and triangles are script-readable on the Client through `Stats.SceneDrawcallCount` and
  `SceneTriangleCount`. They froze when the Studio window stopped drawing 3D (measured).
- Streaming is on for new places. Its Workspace settings are NotScriptable for game scripts and
  absent from the type definitions. From `execute_luau` only `StreamingEnabled` reads and writes;
  the radii fail with "is not a valid member of Workspace" (measured). Set them in the Properties
  panel or the Rojo project.
- `RunService.PreRender` replaces `RenderStepped`. `Lighting.LightingStyle` replaces `Technology`
  (Future is Realistic plus PrioritizeLightingQuality). 4K textures are live since 2026-01-30.
- Publishing needs the Maturity and Compliance questionnaire, and the place publishing API cannot
  update SurfaceAppearance, unions, EditableImage, EditableMesh or BaseWrap content.
- `require("@rbx/LibMP")` exposes the MicroProfiler to `execute_luau` and the command bar (MCP skill
  `rbx-perf-profiling`). Edit snapshots hold full frames; playtest snapshots held 0 to 128 frames,
  fewer on heavy scenes (measured).

## References

- [references/expert-notes.md](references/expert-notes.md): principles and judgment by expert, with
  timestamps and live measurements.
- [references/procedures.md](references/procedures.md): full code for stages P1 to P10, each with
  its test id and live result.
- [references/critique.md](references/critique.md): pass and fail rubric and the budget gate table.
- [references/memory-and-crowds.md](references/memory-and-crowds.md): client memory composition,
  asset and batching audit (`PerfAudit.assets`), character and pet cost
  (`updateInvalidatedFastClusters` over 4 ms), crowds that streaming cannot help.
- [references/gui-paths.md](references/gui-paths.md): MicroProfiler, Developer Console, Scene
  Analysis, dashboard and release menus, with scripted substitutes.
- [references/sources.md](references/sources.md): every doc and video, with credentials and
  timestamps.
- [scripts/rbx_perf.py](scripts/rbx_perf.py): kit runner, offline audit, lab attributes, Server and
  Client windows, compare with a noise floor, profiler wrappers.
- [scripts/agentkit/performance/](scripts/agentkit/performance/): `PerfProbe`, `ScriptProf`,
  `MicroProf`, `HeapProf`, `SceneScan`, `PerfAudit`, `lune_perf_audit.luau`.
