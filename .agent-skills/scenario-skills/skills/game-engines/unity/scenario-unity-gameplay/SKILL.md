---
name: scenario-unity-gameplay
description: "Use when building or debugging Unity gameplay systems: enemy AI that patrols, chases and attacks, NavMesh baking and agents (AI Navigation 2), feet sliding on agents, state machines or behavior trees, physics projectiles that tunnel, the physics spiral, layers and the collision matrix, CharacterController vs Rigidbody characters, object pooling, 'hundreds of enemies', DOTS, Burst or Jobs decisions, Netcode for GameObjects multiplayer, audio mixers, snapshots, volume sliders and 3D combat sounds."
license: MIT
---

# Unity gameplay systems (gameplay systems programmer)

Expert gameplay work in Unity 6.3 means every system has one owner of its state, runs at a rate
someone chose, and is proven by a measurement: steps per frame, a tunneling test at the real speed,
a path query through the real door, a timed transition, the worst frame at the real agent count.
This skill carries the expert delta from the 6.3 manuals, AI Navigation 2, NGO and shipped games
(Survival Kids, Very Very Valet), with jobs and tests run in 6000.3.21f1. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Install:
`ut_gameplay.install(P)` (core AgentKit + `AgentKit.Gameplay` jobs + the `AgentKit.Gameplay.Runtime`
assembly).

## Stance (the expert delta)

1. **Fix frequency before colliders.** Physics cost multiplies with fixed steps per frame; "a call
   count close to 10 might indicate an issue" (6.3 Manual). Measured at 50 Hz: a 400 ms frame ran 17
   catch-up steps with the default 0.333 s Maximum Allowed Timestep; a 0.1 s cap gave 5 steps and a
   world at 0.25x. The cap trades the snowball for slow motion.
2. **Escalate CCD per object on observed tunneling, then leave rigid bodies.** Discrete, Continuous
   Speculative ("often the best choice"), Continuous, Continuous Dynamic last (6.3 Manual).
   Measured: every CCD mode held a static 5 cm wall to 300 m/s; against a thin dynamic plate
   Continuous tunneled from 50 m/s, Continuous Dynamic from 100. A sweep of the projectile's own
   shape (`SweepProjectile`) stopped the 300 m/s shot, and a 0.25 m sphere sweep hit a post a center
   ray missed: match the cast to the collider (LlamAcademy, fJyi7l2tWKo [00:09:54]).
3. **One writer per piece of state.** Agent plus non-kinematic Rigidbody is a race, agent plus
   enabled obstacle avoids itself, agent and animation must flow one way (AI Navigation manual).
   Measured: a main-thread write to a transform held by a running TransformAccessArray job waited
   the whole job (22 to 38 ms, vs 0.003 ms outside it) (Survival Kids, ZkvK0mX-id4 [00:26:42]).
4. **A NavMesh is proven by queries and saved as an asset.** One NavMesh Surface per agent type
   (SMWxCpLvrcc [00:06:35]); voxel 3 per agent radius, 4 to 6 indoors (manual). Measured: a door
   1.2x the agent diameter was closed at 3 voxels per radius, open at 6; stairs without a HeightMesh
   read 0.17 to 0.26 m off the treads, 0 with it; a carve reached queries one frame later.
5. **The lightest AI structure, ticked from one place.** Unstructured for 1 to 2 behaviors, FSM
   while transitions stay few (toward N squared), behavior tree for priorities, GOAP for chained
   goals (LlamAcademy, CZvfuNfdc1M [00:07:13]). Brains tick from a director; mixed object types
   register with one `UpdateHub` sorted by type (Survival Kids: same code, mean -12%, worst frame
   2.18 to 1.43 ms [00:23:59]; measured here at 1,000 and 10,000 objects: mean 7 to 14% lower).
6. **DOTS is an umbrella; measure before adopting it.** Order updates, then Burst jobs over
   NativeArrays with transforms copied out in a tiny read-only job, then fill main-thread job waits
   with Burst `.Run()` (measured: 6 to 10 ms saved of 21 to 26), and only then Entities (Survival
   Kids [00:08:49], [00:39:15]). Decide ECS early, for large CPU-driven counts, competitive netcode
   or determinism (Turbo Makes Games, Bz24Jp30nkM [00:21:58]).
7. **NGO 2.x has no full client-side prediction and reconciliation (no rollback-and-replay loop) and
   no server rewind.** Client anticipation (`AnticipatedNetworkVariable`,
   `AnticipatedNetworkTransform`, `OnReanticipate`) is the building block for hand-built prediction
   (NGO 2.7 manual; same text in the bundled 2.13.0 docs). Server authority by default,
   `HasAuthority` over `IsServer`, "would a late joiner need it?" decides NetworkVariable vs RPC.
8. **Every sound goes through a mixer group; distance happens at the source.** Output None (the
   default) bypasses the mixer; attenuation and distance low-pass happen at the AudioSource before
   any group (manual). Measured: Logarithmic rolloff kept attenuating past Max Distance (1/d to 40
   m), a slider on a snapshot parameter froze that group's moods until `ClearFloat`, and 60 uncapped
   looping weapon sounds erased a quiet music bed at default priority. Cap frequent sounds at 10 to
   15 and steal the oldest (git-amend, BgpqoRFCNOs [00:17:56]).

## Establish first

Ask once: genre and whether play is competitive; platforms and frame budget (default 16.67 ms
desktop, mobile x 0.65, scenario-unity-mobile); peak agents, projectiles and sounds; whether the
player pushes and is pushed by physics; animation-driven or agent-driven locomotion; multiplayer
(players, host leaving, rollback or hit rewind); existing layers, mixer and scenes; 2D or 3D
(scenario-unity-2d). Defaults: 3D URP, 50 Hz, layers Environment 8, Player 9, Enemy 10, Projectile
11 with Projectile x Projectile and Enemy x Enemy off, Humanoid agent type (radius 0.5), code FSM
enemies at 10 Hz, one mixer Master > Music, SFX, UI.

## Workflow

1. **Project physics.** `GameplaySetup.ConfigurePhysics` (layers, `Physics.IgnoreLayerCollision`,
   Time and Physics through `SerializedObject`). GATE: `ReadPhysicsSettings` in a second process
   shows the matrix, 0.02 s and the cap (measured: `Time.*` setters plus `SaveAssets` did not
   persist).
2. **Navigation.** `GameplayScenes.BuildNavArena` pattern: surface `layerMask` = Environment, voxel
   = radius/3, `BuildNavMesh()` then `AssetDatabase.CreateAsset(surface.navMeshData, ...)` as the
   Inspector Bake button does, save. Build Height Mesh when agents use stairs; NavMesh Modifier
   Remove Object on foliage; Collect Objects = Volume or Modifier-only to scope. GATE:
   `CalculatePath` PathComplete through every door, `SamplePosition` on spawns and treads, data
   present after reopening, scene still text; overlay capture opened.
3. **Characters and locomotion.** CharacterController when physics interplay is not in the design
   (skin >= max(0.01, 10% radius)); `FloatingCapsule` when it is. Agent locomotion with
   `AgentLocomotionSync`: agent drives (root motion off, speed from `deltaPosition`) or animation
   drives (`updatePosition = false`, 0.9 pull beyond the radius). GATE: 0 `cc.*` audit errors;
   `ControllerTests` numbers; drift test.
4. **AI.** `EnemyBrain` + `EnemyDirector`; perception cheapest first, then one ray on an occluder
   mask with `QueryTriggerInteraction.Ignore`, batched in `LineOfSightBatch` (RaycastCommand with
   QueryParameters) at scale; agent off before obstacle on death. GATE: `EnemyLoopTests` times
   Patrol > Chase > Attack > Search > Patrol > Dead.
5. **Projectiles, queries, pools.** Rigid projectiles: CCD by a tunneling test at the real speed and
   thickness; fast or fat shots: `SweepProjectile`. NonAlloc through `Queries` (loop on the count,
   flag a full buffer, sort when order matters); `Physics.SyncTransforms()` before querying
   colliders moved by transform. `ProjectilePool` with collectionCheck. GATE: `CcdLadderMeasured`
   and `QueryTests` at your numbers; `CountActive` back to 0.
6. **Audio.** Mixer from `GameplayAudio.CreateCombatMixer` or a template; every source routed;
   `CombatAudio` capped emitters; sliders on a parameter no snapshot drives; music priority 0;
   distance muffling with an `AudioLowPassFilter` curve. GATE: `AudioTests`, `AudioSpatialTests`
   (music band under spam), 0 `audio.*` errors; a human listening pass at caps 30, 15, 5 under
   stress, keeping the smallest that sounds full (BgpqoRFCNOs [00:17:23]).
7. **Scale.** `BuildCrowdScene` at the real count, `AgentProfile.PlayModeTimings`, `AIBudgetMeter`,
   `JobWaitMeter`; `PerceptionBenchmark`, `ProximityBenchmark`, `dots_gate` and `proximity_gate`
   before any DOTS proposal. GATE: p95 AND the worst frame; editor numbers confirmed in a
   development player with Profile Analyzer and the native device profiler (Survival Kids
   [00:10:27]; scenario-unity-performance).
8. **Netcode scoping (multiplayer only).** `ut_gameplay.netcode_fit`, authority and tick sheet,
   prediction proven in Edit Mode with `NetSim` before NGO wiring. GATE: reconciliation tests green;
   the design says what must be hand-built.

## Numbers

| Value                                                                                                         | Relative to                | Source                                                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| 0.02 s (50 Hz); 1/60 for one step per 60 fps frame                                                            | Fixed Timestep             | Manual; pTz3LMQpvfA [00:01:22]                                                 |
| 0.333 s default (about 16 steps at 50 Hz); 0.1 s = 5 steps                                                    | Maximum Allowed Timestep   | measured                                                                       |
| near 10 calls per frame = problem                                                                             | `Physics.Processing` Calls | Manual                                                                         |
| Discrete tunnels above about (thickness + 2r + 0.02) / dt                                                     | 50 Hz                      | `discrete_tunnel_speed`; measured 20 m/s, 5 cm wall                            |
| skin >= max(0.01, 0.1 x radius); step 0.1 to 0.4 m; min move 0                                                | 2 m CharacterController    | Manual                                                                         |
| sag = m x g / k; x2 acceleration on reversals                                                                 | floating capsule           | measured; Toyful [00:05:32]                                                    |
| 3 voxels per radius; 4-6 interiors; >8 rarely helps; door >= about 1.5x agent diameter                        | agent radius               | manual; measured                                                               |
| drift pull 0.9 x delta when drift > agent radius (measured max 0.41 to 0.45 m at r 0.4, 1.84 m without)       | animation-driven agent     | AI Navigation manual                                                           |
| carve seen next frame; Carve Only Stationary re-carves after 0.5 s still (measured 0.50 to 0.61 s)            | NavMesh Obstacle           | manual; measured                                                               |
| AI slice 0.10-0.15 ms (Update) vs about 0.01 ms (10 Hz director)                                              | 200 agents, Editor         | measured                                                                       |
| Burst parallel slower than managed at 200 agents, faster from 2,000                                           | perception prefilter       | measured                                                                       |
| brute force 7-8 ns managed, 1.2-1.5 ns Burst per item-query pair; grid 0.3-1.3 ms vs 14-15 ms at 10,000 x 200 | proximity queries          | measured (Survival Kids KD tree: 5 ms to 0.08 ms, 20 queries over 1,000 items) |
| 200 ms noticed; FPS < 100 ms; 30 Hz tick; update rate > fire rate                                             | netcode                    | NGO manual                                                                     |
| 32 real / 512 virtual voices; priority 0-256, default 128                                                     | Audio settings             | measured; manual                                                               |
| gain = min/d past Max Distance (Logarithmic); 0 at Max Distance (Linear)                                      | 3D rolloff                 | measured                                                                       |
| low-pass cutoff curve 22000 to 10 Hz, needs an Audio Low Pass Filter                                          | distance muffling          | Manual; measured 8 kHz at 8 m: 0.03x                                           |
| slider 0.0001..1 -> 20 log10(v); 10-15 instances per frequent sound                                           | mixer, voices              | DU7cgVsU2rM [00:14:30]; BgpqoRFCNOs [00:17:56]                                 |

## Quality gates

- **Measurable:** `compile_errors == []`; settings read back in a new process; `AuditGameplayScene`
  0 errors (the negative control flags every seeded trap); suites green with `GAMEPLAY_METRICS`
  parsed; CCD and sweep tests at the real speed; pools back to baseline; crowd CSV at the real count
  with p95, worst frame and AI slice; `code_audit` 0 errors.
- **Visual:** NavMesh overlay and crowd captures pass `ut_review.image_checks` and were opened;
  controller and locomotion feel judged from frames when feel is the brief.

## Common mistakes

| Mistake                                                  | What it looks like                        | Fix                                                                  |
| -------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Continuous Dynamic on every fast body                    | CPU grows, still tunnels a dynamic plate  | Speculative first; `SweepProjectile`                                 |
| thin ray for a fat projectile                            | misses what its radius touches            | sweep the collider's shape (`Queries.SweepShape`)                    |
| NonAlloc loop over the buffer                            | stale or silently dropped hits, unordered | loop on the count; flag count == length; sort                        |
| `Physics.autoSyncTransforms = true`                      | hidden sync before every query, CS0618    | one `Physics.SyncTransforms()` before the query                      |
| `Time.maximumDeltaTime = x` in an editor job             | back to 0.333 next launch                 | `SerializedObject` on TimeManager.asset                              |
| `BuildNavMesh()` then save the scene                     | data embedded, scene file turns binary    | `AssetDatabase.CreateAsset(surface.navMeshData)` first               |
| querying after saving over an existing scene             | NavMesh empty, paths invalid              | `GameplayScenes.EnsureLoaded`                                        |
| stairs without a HeightMesh                              | agents glide up a ramp                    | Build Height Mesh, rebake                                            |
| repath in the frame an obstacle carves                   | route through the new body                | query next frame                                                     |
| agent and animation both move the character              | foot sliding, jitter                      | one way: `AgentLocomotionSync`                                       |
| static singleton, domain reload off                      | last session's hub, double updates        | reset in `SubsystemRegistration`; `SafeUnregister`                   |
| TransformAccessArray from `FindObjectsByType<Transform>` | frame cost grows with the scene           | own list, rebuild on change                                          |
| writing TAA transforms while the job runs                | main thread stalls for the job            | copy out read-only; write after `Complete()`                         |
| triggers for "anything near me" at scale                 | transform sync on every mover             | own list, Burst, then grid (`proximity_gate`)                        |
| MonoBehaviour in a file with another name                | silently absent after a scene save        | one MonoBehaviour per file                                           |
| `PlayClipAtPoint` for combat sounds                      | sliders do nothing                        | pooled emitters routed to a group                                    |
| low-pass "distance" effect on the SFX group              | every sound muffled alike                 | `AudioLowPassFilter` curve per source                                |
| trusting Max Distance to silence a Logarithmic source    | still audible far away (1/d)              | Linear or custom curve, or cull by distance                          |
| "NGO has client prediction" in a plan                    | promised loop does not exist              | anticipation plus hand-built reconciliation, or Netcode for Entities |

## Handoffs

- **Receives:** code structure, services and Input System actions from scenario-unity-architecture;
  levels on the Environment layer from scenario-unity-world-building; animated characters from
  scenario-unity-animation; frame budgets from scenario-unity-performance.
- **Delivers:** locomotion velocity, state parameters and the chosen coupling to
  scenario-unity-animation; hit events to scenario-unity-vfx; health and slider hooks to
  scenario-unity-ui (`MixerControl.SetUserVolume`); crowd CSVs, AI slice and job waits to
  scenario-unity-performance; 2D physics to scenario-unity-2d; audio limits to scenario-unity-mobile
  and scenario-unity-web. Packet: scene, job ids, audit JSON, test metrics, CSV verdicts, Verified
  and Assumed.

## Unity 6.3 notes

- 3D physics: `linearVelocity`, `linearDamping`, `PhysicsMaterial`, `Physics.simulationMode`;
  `Physics.autoSyncTransforms` deprecated (not just off); `RaycastCommand` takes `QueryParameters`;
  `Physics.BakeMesh(int...)` obsolete.
- AI Navigation 2.0.14: bake per NavMesh Surface (no Bake in the Navigation window); OffMesh Link
  deprecated.
- Entities 1.4.8 (core from 6.4); 6.5 removes `Entities.ForEach`; 6.6 makes Burst built in and new
  projects skip domain reload on Play.
- NGO 2.13.0 bundled, 1.x deprecated; `[Rpc(SendTo.Server)]`; override `OnUpdate`, not
  `NetworkTransform.Update`; Multiplayer Services replaces Lobby and Relay.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by source, timestamps,
  measured numbers.
- [`references/procedures.md`](references/procedures.md): procedures as code with live tests and
  results (G1 to G16).
- [`references/critique.md`](references/critique.md): the self-review rubric.
- [`references/gui-paths.md`](references/gui-paths.md): windows and menus for the same procedures.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, revision
  history.
- [`scripts/ut_gameplay.py`](scripts/ut_gameplay.py): install, numbers, gates (DOTS, proximity,
  netcode, AI structure), rolloff model, metrics, code audit.
- [`scripts/AgentKit/Gameplay/`](scripts/AgentKit/Gameplay/): editor jobs.
  [`scripts/Runtime/`](scripts/Runtime/): brains, director, hub, queries, sweeps, coupling, Burst
  jobs, meters, pools, audio, controller, netcode model.
