# Expert notes (scenario-unity-gameplay): principles and judgment by source

Attributed claims with timestamps or doc sections; `[added]` marks this skill's own additions;
`[measured]` marks a number we measured in Unity 6000.3.21f1 on this Mac (Apple Silicon, Metal,
batch mode) on 2026-09-24, with the test that produced it (`tests/code/unity-gameplay/`, results in
`archive/tests/unity-gameplay/`). Editor numbers are for comparison; verdicts come from a
development player on the target device.

## 1. Physics

### Unity 6.3 Manual (physics optimization pages)

- **Frequency first.** Physics cost is driven by how many fixed steps run per rendered frame. "A
  call count close to 10 might indicate an issue" (Profiler, CPU Usage, `Physics.Processing` /
  `Physics.Simulate` Calls column). First fix: reduce the frequency, then find the heavy frame that
  started it; a heavy graphics frame can cause more physics calls later (Understand physics
  performance issues). Pxs = solver, ScScene = broad/narrow phase and integration.
- **The spiral of doom:** a long frame forces catch-up steps, each step makes the frame longer.
  Maximum Allowed Timestep caps physics time per frame "but the simulation can appear to slow down"
  (Mitigate escalating physics simulation load). Default Fixed Timestep 0.02 (50 Hz); 35 ms of logic
  at 50 Hz means 2 steps.
  - `[measured]` (`PhysicsTests.CatchUpStepsAndMaximumAllowedTimestep`, 50 Hz): 5 ms frames 0.27
    steps per frame; 35 ms 1.82 (max 2); 100 ms 5; 400 ms frames with the default cap 0.333 s: 17
    steps per frame and game time at 0.83x real time; the same 400 ms frames with the cap at 0.1 s:
    5 steps and game time at 0.25x (four-times slow motion). The cap trades a snowballing frame for
    a slower world.
- **Manual stepping:** `Physics.simulationMode = SimulationMode.Script`, then
  `Physics.Simulate(fixedStep)` or `PhysicsScene.Simulate`, never `Time.deltaTime` (variable steps
  tunnel and jitter); calling Simulate while the mode is still FixedUpdate simulates twice (Manually
  set physics simulation).
- **Query-only games:** Simulation Mode Script plus one `Physics.SyncTransforms()` per frame before
  queries; `Physics.autoSyncTransforms` is deprecated in 6.3 (Optimize physics for query-only; [asm]
  obsolete message).
- **Cheapest first, escalate per object on evidence:** Discrete, primitive colliders, sleeping on,
  Interpolate None; per-body `Rigidbody.solverIterations` instead of the global value (Adjust solver
  iterations).
- **CCD ladder:** Discrete (default) -> Continuous Speculative ("often the best choice for CCD",
  static and dynamic) -> Continuous (sweep, static and kinematic only) -> Continuous Dynamic only as
  a last resort for critical object-on-object tunneling (Optimize collision detection modes).
  - `[measured]` (`PhysicsTests.CcdLadderMeasured`, 5 cm wall, 5 cm ball, 50 Hz): Discrete first
    tunneled a static wall at 20 m/s (caught at 5, 10 and, by phase luck, 50; tunneled at 100 and
    300); Speculative, Continuous and Continuous Dynamic stopped every shot on the static wall up to
    300 m/s. Against a thin DYNAMIC plate (Rigidbody, position frozen, Discrete): Continuous
    tunneled from 50 m/s, Continuous Dynamic from 100 m/s, Speculative held to 100 and tunneled
    at 300. Sweep CCD protects against static geometry, not against an ordinary dynamic body; for
    fast shots against moving targets use raycast or sweep projectiles [added].
- **Interpolation:** only when you see jitter; Interpolate lags one step (accurate, varying
  velocity), Extrapolate overshoots collisions (constant velocity only); with either on, direct
  transform writes are ignored unless followed by `Physics.SyncTransforms` (Apply interpolation to a
  Rigidbody).
- **Moving colliders:** a static collider moved often between steps wants a kinematic Rigidbody;
  never add a Rigidbody only to move something that needs no simulation (Move static colliders).
  Unity's video adds: moving static colliders is fine in 3D since Unity 5 but still costly in 2D
  (pTz3LMQpvfA [00:07:26]).
- **Queries:** NonAlloc variants with a preallocated buffer, sized to the profiled maximum: extra
  hits are silently dropped; batch many queries with `RaycastCommand.ScheduleBatch` and `Complete()`
  late (Optimize raycasts). LlamAcademy: results are unordered, sort by `hit.distance`; always pass
  a distance to `...All` casts (fJyi7l2tWKo [00:16:01], [00:05:00]); choose the cast shape that
  matches the moving collider, a capsule bullet uses CapsuleCast (fJyi7l2tWKo [00:09:54]). Unity:
  results beyond the buffer are dropped (10 found of 11) (pTz3LMQpvfA [00:09:45]); in 6.3
  `RaycastCommand` takes `QueryParameters` (mask, triggers, backfaces); the pre-2022 layerMask
  constructor is still documented (pTz3LMQpvfA Outdated; doc-unity6-physics Outdated). [added] loop
  on the returned count instead of clearing the buffer; log when count == buffer length
  (`Queries.*`).
  - `[measured]` (`QueryTests`): 12 colliders in range, an 8-slot `OverlapSphereNonAlloc` returned 8
    with no error (flagged once by `Queries`); `RaycastNonAlloc` through six plates returned
    distances 3.98, 2.98, 1.98, 6.98, 5.98, 4.98 (unordered); a center ray passed a post 0.15 m off
    its lane while a 0.25 m sphere sweep hit it, and a capsule sweep (r 0.1) hit a post 0.08 m off
    where its center ray missed; a 5 cm `SweepProjectile` at 300 m/s stopped on the thin dynamic
    plate every CCD mode tunnels. `LineOfSightBatch` (RaycastCommand + QueryParameters) matched
    `Physics.Raycast` on 200 and 2,000 rays (0 mismatches); main-thread cost 0.020 to 0.026 ms
    schedule + 0.034 to 0.044 ms complete vs a 0.129 to 0.134 ms loop at 200, 0.17 to 0.19 + 0.06 to
    0.09 ms vs 0.46 to 0.95 ms at 2,000.
- **Transform sync:** `Physics.autoSyncTransforms` is deprecated in 6.3, not just off by default
  ([asm] "has been deprecated please use Physics.SyncTransforms instead"); call
  `Physics.SyncTransforms()` after moving colliders by transform and before a same-frame query
  (Optimize transform value syncing).
  - `[measured]` (`QueryTests.MovedStaticColliderNeedsSyncTransforms`): a static box moved out of a
    ray by its transform was still hit in the same frame, and missed after
    `Physics.SyncTransforms()`.
- **Collision callbacks:** Reuse Collision Callbacks on (default); never store the `Collision`
  (Optimize collision callbacks).
- **Mesh colliders:** non-convex only on static geometry; dynamic concave shapes as compound
  primitives; keep Prebake Collision Meshes on; `Physics.BakeMesh` at load time or in jobs (the int
  overload is obsolete in 6.3, use the EntityId overload [asm]).
- **Layer Collision Matrix:** enable only pairs the game needs (projectiles vs projectiles off);
  verify broad phase pairs fall in the Physics Profiler module (Use the layer collision matrix).
  - `[measured]` `Physics.IgnoreLayerCollision` from an editor job persisted to
    `ProjectSettings/DynamicsManager.asset` (read back in a second process), and
    `PhysicsTests.LayerMatrixFromProjectSettings` saw two Projectile-layer bodies pass through each
    other while a projectile hit the Enemy layer once (Health 100 -> 75).
- **Defaults read from 6000.3.21f1** `[measured]` (probe job): Queries Hit Triggers ON (settles the
  LlamAcademy "ignored for most projects" claim: pass `QueryTriggerInteraction` explicitly), Maximum
  Allowed Timestep 0.3333, Sleep Threshold 0.005, Default Solver Iterations 6 (velocity 1), Default
  Contact Offset 0.01, Bounce Threshold 2, broad phase Sweep and Prune, Auto Sync Transforms off,
  Reuse Collision Callbacks on.
- **Settings persistence** `[measured]`: `Time.maximumDeltaTime = 0.1` in an editor job changed the
  running editor only (0.333 again in the next process); writing `TimeManager.asset` through
  `SerializedObject` persisted. The docs digest had this as [verify] (Disagreements, Physics
  settings persistence); the control run is in procedures.md G1 (`test_09`:
  `Time.maximumDeltaTime = 0.2` and `Time.fixedDeltaTime = 0.025` plus `AssetDatabase.SaveAssets()`
  in one process: the statics and even a `SerializedObject` on TimeManager.asset read the new values
  there, and the next process read 0.1 s and 0.02 s again: nothing reached disk). Fixed Timestep is
  stored as a rational: `Fixed Timestep.m_Count` at `m_Rate` 141,120,000 ticks per second (default
  count 2,822,399 = 0.019999992 s; 0.02 exactly = 2,822,400).

### Unity performance tips video (pTz3LMQpvfA)

- Order: frequency, then colliders, then bodies, then queries [00:00:48]. Fixed step 1/60 for a 60
  Hz game to keep one step per frame [00:01:22]. Predictable spikes can be stepped manually
  [00:02:37]. Clean procedural meshes can skip cleaning, welding and faster-simulation cooking; keep
  Fast Midphase [00:03:59].

## 2. Character controllers

### Unity 6.3 Manual (CharacterController)

- A kinematic-style capsule, not a physics body: slides on walls, climbs steps below Step Offset,
  walks slopes within Slope Limit; it does not react to forces and pushes Rigidbodies only through
  `OnControllerColliderHit`. If the player must be affected by physics, use a Rigidbody.
- Numbers: about 2 m tall for a human; Step Offset 0.1 to 0.4; Slope Limit "often 90 works best";
  Skin Width above 0.01 and above 10% of the radius ("If your character gets stuck it is most likely
  because your Skin Width is too small"); Min Move Distance 0. Editing properties in the Inspector
  during play recreates the controller and drops trigger contacts.

### iHeartGameDev (e94KggaEAr4) and Brackeys (_QajrabyTJc)

- The decision is physics interplay: CharacterController and kinematic bodies are not moved by
  forces; a dynamic body is (e94KggaEAr4 [00:05:15]). No option is complete: budget custom work
  either way [00:07:04]. The CC will not slide off steep slopes; a dynamic body slides and will not
  stop without damping [00:06:21].
- Brackeys' FPS base: yaw on the body, clamped pitch on the camera, gravity integrated in a velocity
  reset to -2 when grounded (not 0) [00:19:32], jump velocity sqrt(h x -2 x g) [00:21:39], gravity
  doubled for feel [00:21:07]. Brackeys keeps Slope Limit 45; the manual says 90 often works best:
  decide by whether steep slopes must block movement.
- Flaws a reviewer flags [added, from the note]: mouse delta times deltaTime (frame-rate dependent),
  unnormalized diagonals, two `Move` calls per frame, legacy `Input.GetAxis` (fails in 6.3
  templates: Input System only).

### Toyful Games, Very Very Valet (qdskE8PJy6Q)

- The character is a floating capsule: clearance over bumps, no friction losses, slope stickiness
  from a down ray longer than the ride height, and the spring reaction applied to the body below
  (landing on a car bounces it) [00:00:24]-[00:02:28].
- Do not freeze rotation: "Any tilt from collisions ... is ignored, which ruins the charm"; keep
  upright with a damped torque spring [00:02:28].
- Goal velocity moves toward the ideal velocity limited by acceleration; the force needed to reach
  it in one physics step is clamped to a max force, so mass matters when pushing
  [00:03:58]-[00:05:00]. One acceleration for start and reversal makes a 180 degree turn take twice
  as long; scale acceleration and max force by up to x2 on reversals [00:05:00]-[00:06:03]. Coyote
  time, jump buffering and analog jump are the cheap responsiveness wins [00:06:13].
- `[measured]` (`ControllerTests`): a plain ride spring sags by m*g/k (2.45 cm measured vs 2.45
  predicted at k = 400, m = 1); with gravity compensation it settles within 1 cm of the ride height
  in 0.84 s and never touches the ground; a 6 N·m·s side impulse tilted it 33 degrees and the torque
  spring brought it under 3 degrees in 0.34 s; reversal to 90% speed took 2.15x the start time with
  a flat turn curve and 1.57x with the x2 reversal curve.

## 3. AI navigation (AI Navigation 2.0)

### Package manual

- Global (A* over polygons, a corridor) vs local (steer to the next corner, RVO avoidance): most
  bugs ask one to solve the other (Inner Workings).
- Voxels: 3 per agent radius by default, 1 to 2 for big open areas, 4 to 6 for tight interiors, more
  than 8 rarely helps; voxel height is half the width; bake time is proportional to voxels (About
  Voxels). Tile size 256 voxels by default; 64 to 128 speeds up carving in obstacle-heavy scenes and
  keeps runtime-bake memory low (NavMesh Surface, Advanced).
  - `[measured]` (`BuildNavArena` sweep, agent radius 0.5 from the Humanoid agent type): a 1.2 m
    door (1.2x the agent diameter) was CLOSED at 1, 2 and 3 voxels per radius (PathPartial) and open
    only at 6; a 1.6 m door was open at 3. Bake of a 30 x 30 m arena: 7.6 to 9.6 ms at 3 per radius,
    3.8 ms extra work at 6 per radius in the sweep.
- Carving is for obstacles that stop and block; moving things use local avoidance; Carve Only
  Stationary (default) suits physics props; carve on move with a threshold for big slow movers (a
  tank); queries see a carve change one frame late (About NavMesh Obstacles; Logic for moving
  NavMesh Obstacles, Note).
  - `[measured]` (`NavExtrasTests.CarveReachesQueriesOneFrameLater`, arena door): a carving obstacle
    placed in the door left `CalculatePath` PathComplete in the same frame and PathPartial one frame
    later; destroying it reopened the door one frame later; with Carve Only Stationary the door
    stayed open while the obstacle moved and closed 0.50 to 0.61 s after it stopped (Time To
    Stationary 0.5 s). So a death carve reaches neighbors' queries next frame: repath then, not in
    the same frame.
- Area cost multiplies distance, must be larger than 1.0, treat costs as hints; Not Walkable always
  wins on overlaps; big polygons next to tiny ones give paths that are not the shortest (Areas and
  Costs).
- Mixing: agent + non-kinematic Rigidbody is a race condition (Is Kinematic on); agent + obstacle
  both enabled makes the agent avoid itself (swap them on death); agent + root motion must flow one
  way (Use NavMesh Agent with Other Components). Player agent: low priority number so it brushes
  through crowds; drive it through `velocity` so others predict it.
- Lower obstacle avoidance Quality when there are many agents (NavMesh Agent reference); Auto
  Braking off for patrol points.

### Unity AI Navigation 2.0 video (SMWxCpLvrcc)

- No bake in the Navigation window in 2.0: bake per NavMesh Surface, one surface per agent type
  [00:01:30], [00:06:35]; HeightMesh so agents step on stairs instead of ramps [00:05:27]; scope
  with Collect Objects = Modifier Component Only or Volume [00:09:41], [00:10:47]; Remove Object for
  foliage, Override Area Not Walkable for props [00:09:08]. When the agent moves the character,
  Apply Root Motion off; match agent speed to the animation in `OnAnimatorMove`:
  `agent.speed = animator.deltaPosition.magnitude / Time.deltaTime` [00:03:30], [00:04:34].
  - `[measured]` (`NavExtrasTests.HeightMeshStairsAndBakeScoping`, runtime bake of six 0.25 m
    steps): without a HeightMesh `SamplePosition` on the treads read 0.17 to 0.26 m below them (mean
    0.22 m: a ramp), with Build Height Mesh 0.00 m on every tread; Collect Objects = Volume (20 x 20
    m) left the ground outside the volume off the NavMesh; a 1.2 m bush cut a hole until a NavMesh
    Modifier with `ignoreFromBuild` (Inspector: Remove Object) made its center walkable.

### Coupling navigation and animation (AI Navigation 2.0 manual, Coupling recipe)

- "Information should always flow in one direction" (NavMesh Agent and Animator). Animation follows
  agent: agent owns the transform, blend-tree parameters from the agent's local velocity (0.15 s
  low-pass, move threshold 0.5 u/s, transition about 0.10 s, a run-on-the-spot center clip against
  foot sliding). Agent follows animation (better feet, worse avoidance):
  `agent.updatePosition = false`, root motion moves the character with y from `agent.nextPosition`,
  and when drift exceeds the agent radius pull the character
  (`transform.position = agent.nextPosition - 0.9f * worldDelta`) or the agent
  (`agent.nextPosition = transform.position + 0.9f * worldDelta`); which is better depends on the
  case.
  - `[measured]` (`NavExtrasTests.AnimationDrivenAgentDriftStaysNearRadius`, `AgentLocomotionSync`):
    with synthetic root motion 30% faster than a 2 m/s agent (radius 0.4), drift reached 1.84 m in 3
    s without the pull and stayed at 0.41 to 0.45 m with it (36 corrections); in agent-drives mode a
    0.05 m root step at 0.02 s set `agent.speed` to 2.5.

### Agent-side facts (this skill)

- `[measured]` `NavMeshSurface.BuildNavMesh()` without
  `AssetDatabase.CreateAsset(surface.navMeshData, ...)` still reloaded, because the data was
  embedded in the scene, and the saved scene file silently became BINARY in a Force Text project
  (control scene with an unbaked surface stayed text; runner-side check of the file header: the trap
  scene does not start with `%YAML`, the arena scene does). Save the NavMeshData as an asset next to
  the scene, as the Inspector Bake button does: the package's editor code
  (`NavMeshAssetManager.CreateNavMeshAsset`, AI Navigation 2.0.14) calls
  `AssetDatabase.CreateAsset(surface.navMeshData, "<scene folder>/<scene name>/NavMesh-<surface>.asset")`,
  which `BuildNavMesh()` alone never does. The notes expected `BuildNavMesh` + `SaveScene` to write
  the asset and marked it [verify] (SMWxCpLvrcc and doc-ai-navigation-2, Agent translation): the
  editor says otherwise.
- `[measured]` saving a newly built scene over an existing scene file
  (`EditorSceneManager.SaveScene(scene, existingPath)`) left the live NavMesh empty in two runs (0
  triangles, every `CalculatePath` PathInvalid) although the saved data was complete on reopen. The
  jobs call `EnsureLoaded` (toggle the surface when the triangulation is empty) before querying and
  report when it was needed (`reloaded_after_scene_save`).
- `[measured]` the Scene view NavMesh overlay does not exist in batch mode:
  `NavMesh.CalculateTriangulation()` drawn as a bright unlit mesh and captured top-down is the
  visual substitute (104 vertices, 46 triangles for the arena, contact sheet reviewed).

### Agent code hygiene found while building this skill

- `[measured]` a MonoBehaviour declared in a file with another name (AIBudgetMeter inside
  AIBudget.cs) could be added by an editor job, but the saved scene referenced its script by an
  in-file id (`m_Script: {fileID: 2094546470}`, no GUID) and the component never ran in Play mode:
  no OnEnable, no output. One MonoBehaviour per file, file named after the class. The core scene
  audit did not flag it; the symptom is a component that silently does nothing.
- `[measured]` a compile error in a test-only file (a tuple array losing its element names,
  `CS1061`) aborted every batch job of the project, jobs and tests alike (the lead's trap O3), and
  `Object` or `Debug` become ambiguous (`CS0104`) as soon as `using System;` or
  `using System.Diagnostics;` sits next to `using UnityEngine;`: qualify `UnityEngine.Object` /
  `UnityEngine.Debug`.

## 4. AI structure

### LlamAcademy (CZvfuNfdc1M)

- Pick the simplest framework the behavior needs: unstructured for 1 to 2 behaviors [00:00:59]; FSM
  cost is its transition count, toward N squared for responsive AI (10 states, about 100
  transitions) [00:07:13]; behavior trees move control flow into parents but need an editor and a
  runtime debugger [00:11:02]; GOAP only for chained goals, cap plan depth and blackboard facts
  [00:15:41]. Debuggability is a selection criterion [00:07:45].

### git-amend behavior trees (lusROFJ3_t8)

- Nodes return Success, Failure, Running; Sequence resets on Failure, Selector resets on Success and
  exhaustion, PrioritySelector re-sorts lazily after Reset [00:08:32], [00:11:54], [00:15:02];
  leaves wrap an IStrategy so behaviors are swappable [00:03:22]; no distance checks while the agent
  computes its path [00:05:56]. Gaps [added, from the note]: no tick-rate limit, no blackboard,
  ActionStrategy returning Success after SetDestination completes before arrival.

### Built here

- `[measured]` (`EnemyLoopTests`): the code FSM enemy detected a player stepping 6 m in front of it
  on the next brain tick (1.8 to 9.8 ms over three runs), reached attack range 0.44 s later (stopped
  at 2.00 m), landed 4 attacks in 3 s (cooldown 0.8 s, 40 damage), fell back to Search exactly 1.0 s
  after losing sight and to Patrol 2.5 s later, and on death disabled its agent before enabling a
  carve-only-stationary obstacle. Sequence: Patrol>Chase>Attack>Chase>Search>Patrol>Dead.

## 5. When DOTS is worth it

### Survival Kids, Unite 2025 (ZkvK0mX-id4)

- DOTS is an umbrella: Systems, Burst, Jobs, Collections and TransformAccessArray work without
  Entities [00:08:49]; install Entities only to get system groups [00:14:19].
- Update order is a performance lever: MonoBehaviour Update runs in an effectively random order
  (creation and component order) [00:12:06]; register similar objects with one system and sort by
  type; same algorithms, 12% faster mean and median, worst frame 2.18 -> 1.43 ms
  [00:22:55]-[00:24:32]. Mark dirty and sort lazily [00:22:22]. Pays at scale, when many objects of
  a class do similar work on shared memory [00:20:47].
- Lifecycle of that system: static `Instance` set on create, cleared on destroy [00:16:58]; with
  domain reload off (he urges it) reset the static in
  `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]` [00:17:31],
  [00:18:04]; `Register` / `Unregister` guarded with asserts because double registration and double
  removal happen more than you expect, removal by swap-back [00:18:35]; objects register in Awake
  and unregister in OnDestroy after checking the system still exists, since teardown order is not
  guaranteed [00:19:07]; rename `Update` to `ManualUpdate` behind an interface so the engine cannot
  call it twice, and any object can register [00:19:40]-[00:20:47].
  - `[measured]` (`UpdateHub` / `UpdateRegistry`): 50 registered objects ticked exactly once per hub
    tick over 10 frames; a second hub was refused; destroying the hub before its objects raised no
    exception (`SafeUnregister`); double registration and double removal were refused and counted
    (Edit Mode). `UpdateOrderBenchmark` (four object types, shuffled registration, Editor Mono, 300
    ticks, two runs): grouping by type cut the mean tick 6.8% and 13.6% at 1,000 objects and 13.5%
    and 13.7% at 10,000; the worst tick was lower in 3 of 4 comparisons (table in procedures.md
    G11).
- Typical Unity games are main-thread bound with idle workers: read the Timeline for gray (idle)
  worker gaps against a saturated main thread before choosing jobs [00:25:37]; move pure transform
  math to Burst jobs. Never touch TAA transforms on the main thread while the job runs ("the
  transform system will block the main thread") [00:26:42]; never fill a TAA with
  `FindObjectsByType<Transform>`, keep your own list and rebuild only when the set changes
  [00:32:10]; copy out in a tiny read-only job (`ScheduleReadOnly`, large batch size is fine)
  [00:33:49]; always `Complete()` before reading, even if the Profiler shows the job done
  [00:36:30]; schedule early, complete late, with other work in between [00:37:34]; fill
  `WaitForJobGroupID` stalls with Burst `.Run()` ("free performance") [00:39:15], [00:39:46].
  - `[measured]` (`HubAndJobsTests`, `JobStallProbe`): a main-thread write to the last of 64
    transforms held by a running read-only TAA job took 21.7 to 38.4 ms (the job's length) while a
    write to a transform outside the array took 0.002 to 0.003 ms; a Burst `.Run()` of about 11 to
    13 ms placed between `Schedule` and `Complete()` of a 10 to 13 ms parallel job cost 13 to 16 ms
    in total instead of 21 to 26 ms in sequence. The `WaitForJobGroupID` marker (category Jobs) is
    readable by `ProfilerRecorder` in batch Play mode, but with the Profiler off `LastValue` and
    `Count` stayed 0 and `CurrentValue` accumulated across frames; `JobWaitMeter` differences it at
    the end of each frame and read 14.25 and 14.63 ms per frame against 14.07 and 14.83 ms timed
    `Complete()` calls, and 0 once the stall was gone.
- Replace trigger or brute-force proximity at scale with a per-frame Burst KD tree: every moving
  collider costs transform sync [00:43:04]; a "pretty optimal" loop over your own list with
  sqrMagnitude was 0.24 ms per query over 1,000 items (about 5 ms for 20; the first query about 4x
  slower, cold cache) [00:43:37]-[00:44:43]; the KD tree answered 20 queries in 0.08 ms, built in
  0.11 ms on 5 workers, about 4 KB per 1,000 capacity; `GetEntriesInRange` returns the closest N,
  not sorted [00:45:18]-[00:48:34].
  - `[measured]` (`ProximityBenchmark`, radius 5 m over 100 x 100 m, Editor): managed brute force
    cost a constant 7.0 to 8.3 ns per item-query pair (0.14 to 0.17 ms at 1,000 x 20, 14.0 to 14.7
    ms at 10,000 x 200), Burst brute force 1.2 to 1.5 ns (0.03 ms, 2.4 to 2.7 ms), and a Burst grid
    rebuilt every call 0.03 to 0.04 ms and 0.30 to 1.29 ms (build 0.01 to 0.06 ms; the parallel
    query slowed under load). Our managed loop over a Vector3 array is far faster per query than the
    talk's 0.24 ms (a Switch 2 game measured on a PC dev build, over GameObjects): the gate is the
    pair count on your target, not the talk's number. [added: a grid instead of the Megacity KD
    tree; same idea]
- Profile everything: the Profiler, the Profile Analyzer package over many frames (median, mean and
  the WORST frame per marker, compare two captures) and the platform's native profilers on device
  (PIX, Nintendo CPU profiler, Superluminal); PC dev-build numbers are not representative
  [00:09:55], [00:10:27], [00:23:27].

### Turbo Makes Games (Bz24Jp30nkM, transcript)

- Decide ECS early: it is the core architecture and hard to switch to later [00:21:58]. ECS for
  large CPU-controlled entity counts, competitive multiplayer (Netcode for Entities),
  performance-critical devices, or a deliberate data-oriented design [00:22:33]-[00:23:05]; not for
  a first game, not because it is new: GameObjects have more resources, assets and hireable
  developers [00:23:46]. Jobs and Burst give great results without ECS, but Netcode for Entities and
  DOTS physics require it [00:24:57]; job scheduling and main-thread sync cost something [00:26:06].

### Entities 1.4 and job system manuals

- Main-thread `foreach` is right for prototypes, tiny data no job touches, and main-thread-only
  work; many tiny jobs cost more than they save; a system marker larger than its jobs means
  scheduling overhead (Job scheduling overhead). Complete as late as possible, always (Complete the
  job). Chunks are 16 KiB, at most 128 entities; each tag component doubles archetype permutations;
  enabling an enableable component on 1M entities costs 0.03 ms vs 3.5 ms for the best bulk add and
  170 ms for per-entity ECB commands.
- `[measured]` 200 NavMesh agents with code-FSM brains (procedures.md G7, Editor, shared Mac): the
  whole CPU frame was about 2 ms in every variant; our AI code was 0.10 to 0.15 ms per frame when
  every brain ticked in Update and about 0.01 ms when a director ticked them at 10 Hz; a Burst
  prefilter job raised our slice to 0.016 ms. Perception prefilter micro-benchmark (G8): managed
  0.006 to 0.008 ms at 200 agents, Burst `.Run` about 9x faster at every size, Burst parallel slower
  than managed at 200 (0.022 ms of scheduling) and 33x to 97x faster at 20,000 to 200,000. At 200
  enemies the expert answer is structure and tick rate, not DOTS.

## 6. Netcode (NGO 2.x) scoping

### NGO 2.7 manual

- "Netcode for GameObjects doesn't support full client-side prediction and reconciliation, but it
  does support client anticipation"; "There's no server side rewind implementation right now".
  Settle this before a design commits to competitive shooter mechanics. Checked against the 2.13.0
  package bundled with 6000.3.21f1 (`Documentation~/advanced-topics/client-anticipation.md`,
  `learn/dealing-with-latency.md`): same sentences, plus "a simplified model that lacks the full
  rollback-and-replay prediction loop" and "the global OnReanticipate callback is likely the ideal
  place to incorporate your rollback and replay logic"; `AnticipatedNetworkVariable<T>`,
  `AnticipatedNetworkTransform`, `NetworkBehaviour.OnReanticipate(double)` and the
  `NetworkManager.OnReanticipate` event exist in its source. So "NGO has no client prediction" is an
  overstatement: it has anticipation, not a prediction loop.
- Server authority by default, client authority only for what the server cannot correct ("Can the
  server correct me on this?"); write against `HasAuthority`, not `IsServer`; under distributed
  authority every NetworkVariable is owner-write.
- RPC vs NetworkVariable: "Should a player joining mid-game get that information?" yes ->
  NetworkVariable. NetworkVariables are eventually consistent and two are not guaranteed to arrive
  together.
- RPCs and `OnValueChanged` run in EarlyUpdate, before FixedUpdate; dirty variables send in
  PostLateUpdate; the authority instance of a networked Rigidbody is non-kinematic, the others
  kinematic.
- Numbers: users notice about 200 ms; FPS under 100 ms, RTS up to 500 ms; Boss Room settled on 30
  Hz, synced position x/z and rotation y with half floats; the update rate must exceed the fire rate
  (10 Hz fails at 750 RPM).

### Gambetta (Fast-Paced Multiplayer)

- Never trust the client: send inputs, not results (I). Predict locally, reconcile by resetting to
  the last authoritative state and replaying unacknowledged inputs keyed by sequence numbers (II).
  Predict cosmetics, confirm consequences. Show others in the past by interpolation (III). Rewind to
  the shooter's view for hits (IV).

### Unity networking concepts (kVt0I6zZsf0) and git-amend (-lGsuCEWkM0, dxwEeYtf0O0)

- Default NGO sync components are server authoritative: a non-host client's own movement snaps back
  until input goes to the server by RPC [00:14:10], [00:17:24]; owner authority "usually acceptable
  only in a casual co-op or non-competitive setting" [00:16:50].
- git-amend's prediction: tick counter on every input and state [00:08:36]; scale by the tick
  interval, not deltaTime [00:16:51]; compare the client's buffered state at the same tick
  [00:22:21]. Gaps an expert fixes (note, [added]): it is owner authority with a 10-unit threshold,
  not server authority; replay does not step physics; `Physics.Simulate` on the default scene per
  input moves the whole world; one reliable RPC per tick.
- Multiplayer Services Sessions replace hand-written Lobby + Relay; remove the deprecated packages
  and fix asmdef references (dxwEeYtf0O0 [00:07:48]).
- `[measured]` (`GameplayLogicTests`, Edit Mode, pure C#): with 100 ms one way at 30 Hz, a
  reconciling client ended exactly on the server state with 0 visible corrections and 0 backward
  snaps; a naive client snapping to server states jumped backward; a server-only wall at x = 5 was
  corrected by replay and the client converged on 5; a client sending move = 3 was clamped on all 60
  inputs.

## 7. Audio

### Unity 6.3 Manual (audio)

- Output None (the default) bypasses every mixer; route every source to a group. Distance
  attenuation, Doppler and the reverb-zone send happen at the source, before the mixer (Relationship
  to 3D spatial attenuation). Snapshots capture volume, pitch, send, wet mix and effect parameters.
  One Audio Listener per scene. Logarithmic rolloff for localized sounds; Linear makes sounds feel
  present everywhere. Web supports mixers only partially.
- Distance curves: the Low-Pass cutoff curve (22000 to 10 Hz) exists only when an Audio Low Pass
  Filter is on the same GameObject (Distance functions): distance muffling is a per-source
  component, not a mixer-group effect, which would muffle every sound of the group alike [derived].
  - `[measured]` (`AudioSpatialTests.DistanceMufflingNeedsLowPassFilter`, 8 kHz tone, Max Distance
    10): a fixed 500 Hz cutoff kept 0.0004x of the level; with `customCutoffCurve` linear from 1 to
    0.02 over distance / Max Distance, the tone kept 1.00x at 1 m and 0.03x at 8 m relative to the
    unfiltered level at the same distance, while the `cutoffFrequency` property still read 22000
    (the curve does not write the property).
- Max Distance under Logarithmic rolloff is contested: the 6.3 Manual says Logarithmic ignores it,
  the script reference says attenuation stops there (3D Sound settings; [asm]).
  - `[measured]` (`AudioSpatialTests.RolloffBeyondMaxDistanceMeasured`, listener RMS, min 1, max
    10): Logarithmic gain 1, 0.50, 0.20, 0.10, 0.05, 0.025 at 1, 2, 5, 10, 20, 40 m (min/d, still
    falling past Max Distance: the Manual is right for 6000.3.21f1); Linear 1, 0.89, 0.56, 0, 0, 0
    (silent at Max Distance). Output sample rate read 48,000 in one session and 24,000 in later
    ones; the gains did not change, but single readings dropped to 0 while the device restarted, so
    the test keeps the maximum of three windows.
- Import: Decompress On Load for small SFX (Vorbis decompressed is about 10x its compressed size,
  ADPCM about 3.5x), Compressed In Memory for medium clips (defaults to Decompress On Load on
  Chromium browsers), Streaming for music and long ambience (about 200 KB overhead each). Priority 0
  most important, 256 least, default 128; 0 for music (AudioSource reference table).
- [asm] `AudioMixer.SetFloat`: once called, "mixer snapshots will no longer control the exposed
  parameter" until `ClearFloat`; returns false on a missing name.
  - `[measured]` (`AudioTests.SnapshotsSetFloatTrapAndUserVolume`): Explore (Music 0, SFX -10) ->
    Combat (Music -12, SFX 0) over 0.6 s read Music -6.0 dB halfway (linear in dB) and -12 at the
    end; after `SetFloat("MusicVol", -3)` a transition back to Explore left Music at -3 while SFX
    moved to -10; `ClearFloat` returned Music to 0; a player slider on MasterVol (0.5 -> -6.02 dB)
    survived a Combat transition that still moved Music to -12; `SetFloat` on a misspelled name
    returned false.
- `[measured]` the mixer (groups Music, SFX, UI; exposed MasterVol, MusicVol, SFXVol, UIVol;
  snapshots Explore and Combat) was authored from code through the internal
  `UnityEditor.Audio.AudioMixerController` (reflection) in 6000.3.21f1; there is no public editor
  API for it.

### git-amend audio pooling (BgpqoRFCNOs) and Sasquatch B Studios (DU7cgVsU2rM)

- Pool emitters instead of sounds on projectiles (they die with them) or `PlayClipAtPoint` (one
  GameObject per call) [00:00:37]; the real limit is the voice budget (32 real voices by default):
  cap frequent sounds per definition and steal the OLDEST; raising Max Real Voices to fit a spammy
  weapon is the mistake [00:15:12]; tune the cap BY EAR at stress: 30 sounded like 90, 15 the same,
  5 audibly thin, so 10 to 15 [00:15:43]-[00:17:56]. Culling goes by Priority, then loudness
  [00:14:40]. An agent cannot hear: it plans the listening pass for a human and runs a proxy.
  - `[measured]` proxy (`AudioSpatialTests.QuietMusicUnderWeaponSpam`, 32 real voices, a 2D music
    bed at volume 0.3, 60 looping 3D weapon tones at 1 to 3 m, music band read from
    `AudioListener.GetSpectrumData`): music at default priority 128 vanished (-82 to -84 dB:
    virtualized); at priority 0 it stayed audible (-8.5 to -12 dB under the summed spam); with only
    12 weapon voices (the cap) it kept its level (0.0 dB).
- `PlayClipAtPoint` also cannot be routed to a mixer group, so volume sliders never reach it
  (DU7cgVsU2rM [00:03:00]). Sliders 0.0001 to 1, `SetFloat(name, Mathf.Log10(v) * 20)`
  [00:14:00]-[00:14:30].
- [added] the steal queue must hold generation-checked handles: a pooled emitter that finished and
  was reused is a stale reference (stopping it cuts the wrong sound or releases twice).
  - `[measured]` (`AudioTests.FrequentSoundCapStealsOldest`): 60 plays of one frequent sound with a
    cap of 12: 12 live at most, 48 stolen, 12 pooled emitters in total, all routed to SFX, all back
    in the pool 1 s later, no double-release exception with collectionCheck on.
