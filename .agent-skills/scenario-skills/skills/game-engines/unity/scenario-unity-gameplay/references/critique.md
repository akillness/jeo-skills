# Critique rubric (scenario-unity-gameplay): how the agent judges its own gameplay work

Score each line pass / fix / not applicable, with the evidence next to it (job id, test name,
number, frame). A line without evidence is a fix. Work is not done while any "must" line is a fix.

## A. Measured (must)

1. **Compile health:** zero `compile_errors` and no new CS0618 warnings in the envelope of the last
   job (a single error in any assembly, including a test, aborts every batch job: observed in this
   skill's own run).
2. **Physics frequency:** steps per frame stay at 1 to 2 under the target load (`StepProbe` or the
   Profiler Calls column); the Maximum Allowed Timestep choice is written down with its consequence
   (default 0.333 = up to 16 catch-up steps at 50 Hz; 0.1 = 5 steps and a slower world).
3. **Settings persisted:** a second process reads back the layer matrix, Time and Physics values
   (`ReadPhysicsSettings`), because static setters on `Time` do not persist from an editor job.
4. **CCD per object, justified:** no Continuous Dynamic without a written reason; fast projectiles
   either raycast/sweep or Continuous Speculative with a tunneling test at their real speed and wall
   thickness (`CcdLadderMeasured` pattern).
5. **One motion authority per object:** audit shows 0 `nav.agent_dynamic_body`,
   `nav.agent_and_obstacle`, `nav.root_motion_and_agent`, `cc.with_dynamic_body`.
6. **NavMesh valid by query, not by eye:** `CalculatePath` PathComplete between every designer
   waypoint pair and through every door that must be open; `SamplePosition` on spawns; NavMeshData
   saved as an asset (`nav.data_not_asset` = 0) and the scene file still text.
7. **Voxel size stated relative to the agent radius** (3 per radius default, 4 to 6 interiors);
   doors narrower than about 1.5x the agent diameter tested at the chosen voxel size (a 1.2x door
   was closed at 3 per radius).
8. **AI behavior measured:** a Play Mode test records every state transition with timestamps and
   asserts the sequence and the latencies the design asks for (detect, attack, give up, return).
9. **Budget for N agents:** an AgentProfile CSV at the real agent count (200 here) with
   `ut_stat.budget_check` against the frame budget, plus the AI slice (`AIBudgetMeter`) so the
   report says where the milliseconds go (our code vs navigation vs rendering).
10. **DOTS decision backed by a number:** the managed vs Burst comparison at the real count, and the
    gate (`ut_gameplay.dots_gate`) quoted. No Entities proposal for a GameObject game without a
    measured main-thread bottleneck at scale.
11. **No per-frame churn:** pooled projectiles and sounds, `CountActive` back to baseline after a
    burst, collectionCheck on in development, velocity reset on release; zero allocating queries in
    hot paths (`ut_gameplay.code_audit` info lines reviewed).
12. **Audio routing:** 0 `audio.no_mixer_group`, exactly one enabled AudioListener, every exposed
    name used in code returns true from `SetFloat`, player volume on a parameter no snapshot drives,
    frequent sounds capped (10 to 15) with oldest-steal.
13. **Netcode scoped honestly:** the design sheet says whether it needs prediction/rollback or
    server rewind; if yes, NGO is not presented as providing them (it has client anticipation, not a
    rollback-and-replay loop, and no server rewind); authority, tick rate and RPC-vs-NetworkVariable
    choices are written with their reason.
14. **Worst frame reported:** every crowd or stress verdict quotes p95 AND the worst frame
    (`cpu_frame_max`), and says that the verdict comes from a development player with Profile
    Analyzer over many frames and the platform's native profiler (Survival Kids [00:10:27],
    [00:23:59]); Editor numbers are trends.
15. **Queries honest:** NonAlloc callers loop on the returned count and flag a full buffer
    (`Queries.Truncations` = 0 at the profiled maximum); results sorted when order matters; the cast
    shape matches the moving collider (`SweepProjectile` or `Queries.SweepShape` for fat or fast
    shots); colliders moved by transform are synced (`Physics.SyncTransforms()`) before a same-frame
    query; batched rays use `QueryParameters`.
16. **Jobs follow the rules:** TransformAccessArray built from an owned list and rebuilt only on
    change, transforms copied out read-only, no main-thread writes to them while the job runs,
    `Complete()` before every read; main-thread job waits measured with `JobWaitMeter` and filled
    with Burst `.Run()` before adding workers.
17. **Navigation details verified:** HeightMesh on surfaces with stairs (tread error measured with
    `SamplePosition`), foliage marked Remove Object, bakes scoped (Volume or Modifier-only), no
    same-frame repath after a carve, one-way locomotion coupling with drift measured (under about
    the agent radius when animation drives).
18. **Spatial audio measured, not assumed:** distance muffling through an `AudioLowPassFilter` curve
    on the source (not a group effect), Max Distance behavior taken from `ut_gameplay.rolloff_gain`
    (Logarithmic keeps attenuating past it), music at priority 0, and the music band checked under
    weapon spam (`AudioSpatialTests`); the cap chosen by a human listening pass at 30, 15 and 5.

## B. Visual (must look, then judge)

1. A top-down capture of the NavMesh overlay (cyan triangulation) opened: coverage reaches every
   room, doors show a continuous strip, props cut holes, no islands where agents spawn.
2. A capture of the gameplay scene at the profiled agent count opened: the agents exist where
   expected, nothing magenta, `image_checks` flags clean.
3. For controllers: frame sequences or a recorded path show no oscillation at rest and a believable
   tilt and recovery on impact (the numbers from `ControllerTests` support the look; they do not
   replace it when feel is the brief).

## C. Judgment (should)

1. Structure matches behavior count (LlamAcademy): no behavior tree for a two-state enemy, no
   10-state FSM with 80 hand-written transitions.
2. Brains tick at a fixed rate from one director (5 to 10 Hz is enough for most perception) instead
   of N `Update` calls with a raycast each [added]; SetDestination only when the target moved or on
   an interval. Mixed object types (turrets, pickups, doors) register with one `UpdateHub` sorted by
   type, with statics reset in `SubsystemRegistration` and `SafeUnregister` in teardown.
3. Proximity ("is anything near me?") chosen with `ut_gameplay.proximity_gate`: own list, then
   Burst, then a grid or KD tree rebuilt per frame; never trigger colliders on hundreds of movers.
4. Avoidance quality lowered for crowds (the manual's advice), measured before and after.
5. Character controller choice follows physics interplay: CharacterController when pushing and being
   pushed is not in the design, floating Rigidbody when it is (and then no frozen rotation,
   gravity-compensated ride spring, forces in FixedUpdate).
6. Every expert number quoted carries its reference ("relative to agent radius", "at 50 Hz", "on
   this Mac in the Editor") and every non-run step is listed under Assumed.

## D. Red flags (automatic fix)

- `rb.velocity`, `drag`, `PhysicMaterial`, `Physics.autoSimulation`, `FindObjectOfType`,
  `Input.GetAxis`, `[ServerRpc]` in new code.
- `Physics.Simulate(Time.deltaTime)`.
- `AudioSource.PlayClipAtPoint` in a project with volume sliders.
- A NavMesh "verified" only by a screenshot, or baked without saving the data asset.
- A crowd performance claim from a scene with nothing rendering (draw calls 0) or from a 10-agent
  test extrapolated to 200.
- "Client-side prediction with NGO" presented as a built-in feature.
- A MonoBehaviour whose file name differs from its class name (it will not survive a scene save).
- NavMesh queries run right after a bake and save without checking the triangulation is non-empty.
- `FindObjectsByType<Transform>` feeding a TransformAccessArray; a scheduled job never completed;
  `Physics.autoSyncTransforms = true`; a NonAlloc call whose count is thrown away (all flagged by
  `code_audit`).
- A static `Instance` with no `SubsystemRegistration` reset (flagged by `code_audit`).
- A stress verdict with only a mean or p95 and no worst frame.
