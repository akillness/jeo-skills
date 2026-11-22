# Critique rubric: performance and release

Score your own output before calling it done. Each line is pass or fail; a fail names the fix. The
measurable lines come from `PerfProbe`, `ScriptProf`, `MicroProf`, `HeapProf`, `SceneScan`,
`PerfAudit`, the lead AgentKit `Stats`, and the live tests in [procedures.md](procedures.md).

## Blocking (any fail means not done)

| Check                  | Pass when                                                                                                                                                                                                                                    | How to measure                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Symptom reproduced     | The slow case runs in a playtest with numbers before any change                                                                                                                                                                              | A saved `PerfProbe.window` on the side that hurts (P2)                              |
| One change per run     | Each fix has its own before and after window at the same time offset                                                                                                                                                                         | Two result files that differ in one setting (P2)                                    |
| Frame gate             | p95 at most 1.2 times the frame budget and worst at most 2 times, on the side that matters (20 ms and 33.3 ms at 60 fps; healthy places read p95 17.2 to 17.4 ms, so a bare 16.7 ms gate fails them)                                         | `PerfProbe.window(...).gate` or lead `Stats.frames` (P2)                            |
| Right metric           | The claim uses the number the fix touches: Script Profiler ms per frame for scripts, physicsMs and contacts for physics, Server `DataSendKbps` (kilobytes per second) for replication, draw calls for rendering, memory categories for leaks | `rbx_perf.compare` rows past the noise floor (P2)                                   |
| Cause named            | The hot function or label is named before the fix                                                                                                                                                                                            | `ScriptProf` top function (P3) or a `debug.profilebegin` label in the MicroProfiler |
| Leak test              | Over a soak, memory category growth and unparented instances stay flat and tracked objects stay bounded                                                                                                                                      | `HeapProf.diff`, `SceneScan` unparented instances, `PerfProbe.soak` tags (P5)       |
| No server cosmetics    | No server tweens, per-frame server CFrame writes, or server-resized welded parts                                                                                                                                                             | `PerfAudit` rules `server-tween`, `server-per-frame-cframe` (P1)                    |
| Studio numbers labeled | Studio memory and fps are reported as Studio numbers, never as phone numbers; render numbers only from a window that draws (R0)                                                                                                              | Report wording; [procedures.md](procedures.md) P9 lists what needs a phone          |
| Never published        | No Publish, Publish As, restart, release or fee without the owner's go                                                                                                                                                                       | Session log                                                                         |

## Budget gates (defaults; calibrate per device class)

| Metric                 | Gate                                                                                                   | Relative to                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Scene draw calls       | 500 or fewer, UI included                                                                              | Low-end phone, worst view (McNeill)                                                                        |
| Scene triangles        | 500,000 or fewer                                                                                       | Same                                                                                                       |
| Shadow draw calls      | 3 times the scene draws or fewer                                                                       | Same                                                                                                       |
| Client memory          | Under 1.3 GB on the device                                                                             | 2 GB phone, measured on device                                                                             |
| Instances              | Under 150,000                                                                                          | Join time at about 10,000 per second                                                                       |
| Replication downstream | Under 50 KB/s per client                                                                               | Client `DataReceiveKbps` on a device; it reads 0 in a Studio playtest, so read Server `DataSendKbps` there |
| Server heartbeat       | 60 steps per second; script time per frame well under 16.7 ms                                          | Server `PerfProbe.window` dtMs and `ScriptProf` msPerFrame                                                 |
| Client crash rate      | Under 2 to 3 percent, no jump after an update                                                          | Performance dashboard                                                                                      |
| Rig rebuilds           | `updateInvalidatedFastClusters` worst frame under 4 ms; near 0 per frame while nothing spawns          | MicroProfiler on the Client in the busiest view ([memory-and-crowds.md](memory-and-crowds.md) M3)          |
| Crowd                  | Max players packed at the hub still meet the frame gate; otherwise spread players or lower max players | Crowd probe, packed against spread (M4); phone or live server for the verdict                              |

## Quality (fix before shipping a live game)

| Check             | Pass when                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labels            | Every per-frame system has a `debug.profilebegin` label named after the system                                                                                                          |
| Memory categories | Long-lived threads call `debug.setmemorycategory` with a system name                                                                                                                    |
| Batching          | Repeated props share one MeshId, material and image set (`PerfAudit.assets` draw groups, M2); no unexpected transparency on many parts                                                  |
| Physics           | Only gameplay parts are unanchored; decor has Box fidelity and CanQuery, CanTouch off                                                                                                   |
| Streaming         | StreamingEnabled with Min radius below Target radius; Persistent models are rare                                                                                                        |
| Assets            | Textures 512 or less unless they fill the screen; one size per PBR set; sounds created on demand, `AudioPlayer.AutoLoad` false for audio not needed at spawn                            |
| Client memory     | ReplicatedFirst holds the loading screen only; maps and heavy assets wait in ServerStorage; far models use SLIM, or StreamingMesh only with a target radius of 1,000 studs or more (M1) |
| Rigs              | Static NPCs have no Humanoid; out-of-range rigs are anchored with Animators stopped; NPC and pet animation plays on clients (M3)                                                        |
| Release           | ServerRestartScheduled handled; BindToClose saves; restart only outdated servers                                                                                                        |
| Phone check       | The owner ran the phone list in P9 and reported memory and frame rate                                                                                                                   |
