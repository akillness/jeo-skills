# Procedures (scenario-unity-gameplay): agent code, each with its live test and result

All ran in Unity 6000.3.21f1 on macOS (Apple Silicon, Metal) on 2026-09-24, project
`tests/projects/unity-gameplay` (APFS clone of Base3D_URP, path with spaces), through
`tests/code/unity-gameplay/test_live_gameplay.py` (live) and `test_offline.py` (no Unity). G11 to
G16 and the claim checks in G1 and G2 were added in the v0.2 refactor (same day, after the Y8 blind
grade). Rows: `archive/tests/unity-gameplay/live_results.jsonl`; JSON artifacts next to it. The
complete C# is in `scripts/AgentKit/Gameplay/*.cs` (editor jobs) and `scripts/Runtime/*.cs` (runtime
assembly); snippets below are the parts that carry the expert rule.

Header for every procedure:

```python
import sys
sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-gameplay/scripts")
import ut_env, ut_run, ut_review, ut_stat, ut_gameplay as gp
P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")
gp.install(P)     # core AgentKit + Assets/Editor/AgentKit/Gameplay + Assets/AgentKit.Gameplay/Runtime (asmdef)
```

Runtime code cannot live in an Editor folder (MonoBehaviours there cannot be added to objects), so
`install` copies it to `Assets/AgentKit.Gameplay/Runtime/` with the asmdef
`AgentKit.Gameplay.Runtime` (references Unity.Burst, Unity.Collections, Unity.Mathematics;
autoReferenced, so editor jobs see it). Test assemblies reference it by name.

## G1. Project physics: layers, matrix, time, persisted

```python
a = ut_run.run_method(P, "AgentKit.Gameplay.GameplaySetup.ConfigurePhysics", {"fixed_dt": 0.02, "max_dt": 0.1})
# optional: {"layers": {"Environment": 8, ...}, "ignore_pairs": [["Projectile","Projectile"]], "queries_hit_triggers": False}
b = ut_run.run_method(P, "AgentKit.Gameplay.GameplaySetup.ReadPhysicsSettings")      # a NEW process: the proof
assert b["result"]["max_dt"] == a["result"]["max_dt"]
```

The rule inside (`GameplaySetup.cs`):

```csharp
Physics.IgnoreLayerCollision(layers["Projectile"], layers["Projectile"], true);      // persists
var tm = SettingsObject("ProjectSettings/TimeManager.asset");                        // Time.* statics do NOT persist
var rate = tm.FindProperty("Fixed Timestep.m_Rate");
double tps = (double)rate.FindPropertyRelative("m_Numerator").longValue / rate.FindPropertyRelative("m_Denominator").longValue;
tm.FindProperty("Fixed Timestep.m_Count").longValue = (long)System.Math.Round(0.02 * tps);   // 2,822,400 at 141,120,000/s
tm.FindProperty("Maximum Allowed Timestep").floatValue = 0.1f;
tm.ApplyModifiedPropertiesWithoutUndo();
var dm = SettingsObject("ProjectSettings/DynamicsManager.asset");
dm.FindProperty("m_AutoSyncTransforms").boolValue = false;                          // deprecated API: go through the asset
dm.ApplyModifiedPropertiesWithoutUndo();
AssetDatabase.SaveAssets();
```

Test: `test_live_gameplay.py::test_01`. Result: pass, 17.8 to 22.6 s for both jobs (runs 2 and 3);
read back 0.02 s (count 2,822,400) and 0.1 s, Enemy x Enemy and Projectile x Projectile off, layers
8 to 11 named, 0 compile warnings. First attempt with `Time.maximumDeltaTime = 0.1` only: the next
process read 0.333 (static setter not persisted).

Claim check (v0.2, `test_09`, probe `GameplayTests.Probe.StaticTimeSetter`): one job set
`Time.maximumDeltaTime = 0.2` and `Time.fixedDeltaTime = 0.025` and called
`AssetDatabase.SaveAssets()`. In that process both the statics and a `SerializedObject` on
`TimeManager.asset` read the new values (0.2 s, count 3,528,000: the live settings object changed),
yet `ReadPhysicsSettings` in the next process read the previous 0.1 s and 0.02 s: the setter change
was never written to disk. Result: pass (run 2026-09-24 20:20). The `SerializedObject` route of G1
(`ApplyModifiedPropertiesWithoutUndo` then `SaveAssets`) is the one that persists.

## G2. NavMesh baked from code, saved, validated by query, made visible

```python
arena = ut_run.run_method(P, "AgentKit.Gameplay.GameplayScenes.BuildNavArena", {"sweep": []})
r = arena["result"]
assert all(v["status"] == "PathComplete" for v in r["paths"].values()) and r["reopened"]["has_data"] and r["scene_is_text"]
sweep = ut_run.run_method(P, "AgentKit.Gameplay.GameplayScenes.BuildNavArena",
                          {"scene": "Assets/AgentKit.Gameplay/Scenes/DoorSweep.unity", "door_width": 1.2, "unsaved_trap": True})
ov = ut_run.run_method(P, "AgentKit.Gameplay.GameplayScenes.NavMeshOverlay", {})
cap = ut_run.run_method(P, "AgentKit.AgentCapture.CaptureViews", {"scene": ov["result"]["scene"], "scene_bookmarks": True}, graphics=True)
rev = ut_review.review_capture(cap)            # then OPEN rev["sheet"]
```

The rule inside (`GameplayScenes.cs`):

```csharp
var s = go.AddComponent<NavMeshSurface>();
s.agentTypeID = 0;                                     // one surface per agent type
s.collectObjects = CollectObjects.All;
s.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
s.layerMask = 1 << envLayer;                           // never bake agents, player, projectiles
s.overrideVoxelSize = true;
s.voxelSize = NavMesh.GetSettingsByID(0).agentRadius / 3f;   // 4-6 per radius indoors
s.BuildNavMesh();
AssetDatabase.CreateAsset(s.navMeshData, sceneDir + "/" + sceneName + "/NavMesh-" + s.name + ".asset");
EditorSceneManager.SaveScene(scene, scenePath);
if (NavMesh.CalculateTriangulation().vertices.Length == 0) { s.enabled = false; s.enabled = true; }  // EnsureLoaded: see result
var path = new NavMeshPath();
NavMesh.CalculatePath(a, b, NavMesh.AllAreas, path);  // path.status == NavMeshPathStatus.PathComplete
NavMesh.SamplePosition(spawn, out var hit, 1f, NavMesh.AllAreas);
```

Test: `test_02`. Result: pass (run 3). Arena 30 x 30 m, Humanoid radius 0.5, voxel 0.167 m: bake 7.1
ms, 104 vertices / 46 triangles; all four patrol legs PathComplete (16, 7, 16, 7 m), the 1.6 m door
PathComplete (4 m), enemy to hiding spot PathComplete (33 m, 7 corners); spawns on the NavMesh
within 0.083 m; data asset `GameplayArena/NavMesh-NavSurface.asset`, scene still text, data present
after reopening. Door sweep with a 1.2 m door: PathPartial at 1, 2 and 3 voxels per radius (28, 28,
42 triangles), PathComplete at 6 (46 triangles, 4.1 ms). Unsaved-bake control: data survived the
reopen but was embedded (`data_is_asset` false) and the scene file became binary in a Force Text
project, while the control scene with an unbaked surface stayed text. Claim check (v0.2): the runner
reads the first five bytes of both files (`test_02`): the arena scene starts with `%YAML`, the
unsaved-bake scene does not (binary header); and the package source explains why the Bake button is
safe: `NavMeshAssetManager.CreateNavMeshAsset` (AI Navigation 2.0.14, Editor) does
`AssetDatabase.CreateAsset(surface.navMeshData, "<scene folder>/<scene name>/NavMesh-<surface>.asset")`,
which `BuildNavMesh()` alone never calls. Trap reproduced in runs 2 and 3: saving the new scene over
the existing `GameplayArena.unity` left the live NavMesh empty (0 triangles, every query PathInvalid
in run 2, which failed); `EnsureLoaded` re-registered it in run 3 (`reloaded_after_scene_save`
true). Overlay capture: 2 frames, no flags, saturation 0.38 and 0.46; the sheet shows the cyan
NavMesh with holes at the crates and walls and a continuous strip through the door.

## G3. Characters: CharacterController rules and the floating capsule

```python
audit = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.AuditGameplayScene", {"scene": "Assets/Scenes/Level.unity"})
[f for f in audit["result"]["findings"] if f["code"].startswith("cc.")]   # skin width, min move, step, dynamic body
t = ut_run.run_tests(P, "PlayMode", assemblies="<your PlayMode asmdef>", filter="AgentGameplay.Tests.ControllerTests")
gp.parse_metrics(t)["FloatingCapsuleSettlesRightsAndReverses"]
```

The rule inside (`FloatingCapsule.cs`, FixedUpdate):

```csharp
float x = hit.distance - rideHeight;
float relVel = Vector3.Dot(down, rb.linearVelocity) - Vector3.Dot(down, otherVel);
float spring = x * rideSpringStrength - relVel * rideSpringDamper;
if (gravityCompensation) spring -= rb.mass * Vector3.Dot(Physics.gravity, down);   // else it sags by m*g/k
rb.AddForce(down * spring);
if (hit.rigidbody != null) hit.rigidbody.AddForceAtPosition(down * -spring, hit.point);
// upright: torque toward yaw-only goal, minus angular velocity damping; rotation NOT frozen
// move: goalVel = MoveTowards(goalVel, ideal, accel * turn * dt); force = clamp((goalVel - v)/dt, maxForce * turn) * mass
```

Test: `test_05` (Play Mode, `ControllerTests`, 2 tests). Result: pass. Plain spring sag 2.452 cm vs
m*g/k = 2.453 cm; compensated: within 1 cm of the 1.2 m ride height after 0.84 s, never below 1.2 m
(no ground contact); 33.3 degree tilt from a 6 N·m·s impulse, back under 3 degrees in 0.34 s; 90%
speed in 0.14 s from rest; reversal 0.30 s with a flat curve (2.15x) and 0.22 s with the x2 reversal
curve (1.57x).

## G4. Enemy AI: code FSM, director ticks, measured transitions

```python
arena = "Assets/AgentKit.Gameplay/Scenes/GameplayArena.unity"     # built by G2 (in the build scene list)
t = ut_run.run_tests(P, "PlayMode", assemblies="AgentGameplay.PlayModeTests", filter="AgentGameplay.Tests.EnemyLoopTests")
m = gp.parse_metrics(t)["PatrolDetectChaseAttackSearchDie"]    # latencies, sequence, timestamped transitions
```

The rules inside (`EnemyBrain.cs`, `EnemyDirector.cs`, `Perception.cs`):

```csharp
bool candidate = Perception.InRangeAndFov(eye, transform.forward, aim, sightRange, fovDeg);      // no physics
bool sees = candidate && !Physics.Raycast(eye, dir, dist, occluders, QueryTriggerInteraction.Ignore); // occluders only
if (a.pathPending) return;                                      // no distance check on a stale path
if (now - lastRepath < repathInterval && (dest - lastTarget).sqrMagnitude < repathDist * repathDist) return; // no per-frame SetDestination
// death: agent off FIRST, then the carve-only-stationary obstacle
agent.isStopped = true; agent.enabled = false; obstacle.carving = true; obstacle.carveOnlyStationary = true; obstacle.enabled = true;
// director: carry += count * tickHz * deltaTime; tick (int)carry brains round-robin; brains' own Update is off
```

Test: `test_05` (`EnemyLoopTests`). Result: pass. 3 waypoint arrivals in 11.4 s at 2 m/s with the
player hidden (no detection through the 3 m divider); player placed 6 m ahead: Chase on the next
tick (1.8 to 9.8 ms over three runs), Attack 0.44 s later at 2.00 m; 4 attacks and 40 damage in 3 s
(0.8 s cooldown); player hidden again: Search after exactly 1.0 s (lose-sight time), Patrol after
2.5 s (search time); Kill(): agent disabled, carving obstacle enabled. Sequence
Patrol>Chase>Attack>Chase>Search>Patrol>Dead.

## G5. Projectiles: CCD measured, layer matrix, pooled

```python
t = ut_run.run_tests(P, "PlayMode", assemblies="AgentGameplay.PlayModeTests", filter="AgentGameplay.Tests.PhysicsTests")
m = gp.parse_metrics(t)
m["CcdLadderMeasured"]["first_tunnel_speed"]        # per mode, static wall vs dynamic plate
gp.discrete_tunnel_speed(thickness=0.05, radius=0.05)   # 8.5 m/s: the line above which Discrete CAN tunnel at 50 Hz
```

The rules inside (`Projectile.cs`, `ProjectilePool.cs`):

```csharp
var pool = new ObjectPool<Projectile>(Create, p => p.gameObject.SetActive(true),
    p => { p.Body.linearVelocity = Vector3.zero; p.Body.angularVelocity = Vector3.zero; p.gameObject.SetActive(false); },
    p => Destroy(p.gameObject), collectionCheck: true, defaultCapacity: 64, maxSize: 512);
public void Despawn() { if (!m_Live) return; m_Live = false; pool.Release(this); }   // hit and lifetime both call it
body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;          // after a Discrete tunneling test
body.position = pos; body.linearVelocity = dir * speed;                              // Unity 6 names
```

Test: `test_05` (`PhysicsTests`, 4 tests). Result: pass.

- CCD (5 cm wall, 5 cm ball, 50 Hz, 1.2 s): Discrete tunneled at 20, 100, 300 m/s (caught at 5, 10
  and 50: phase-dependent); Speculative, Continuous and Continuous Dynamic stopped all static-wall
  shots to 300 m/s (Speculative at 300 bounced back, 2 contacts). Thin dynamic plate: Discrete
  tunneled from 50, Continuous from 50, Continuous Dynamic from 100, Speculative only at 300.
- Layer matrix read from project settings: two Projectile bodies crossed head-on with 0 contacts;
  one hit on the Enemy layer (Health 100 -> 75).
- Pool: prewarm 32; the same instance came back with velocity 0 after `Release`; a second `Release`
  threw `InvalidOperationException`; 40 shots peaked at 40 active and all 40 returned within 0.8 s
  (hit or lifetime).
- Catch-up (`StepProbe`): burn 5 / 35 / 100 / 400 ms per frame -> 0.27 / 1.82 / 5 / 16.8 steps per
  frame with the 0.333 s cap (game time 1.00 / 1.00 / 1.00 / 0.83 of real time); 400 ms with the 0.1
  s cap -> 5 steps, game time 0.25.

## G6. Audio: mixer from code, snapshots, the SetFloat trap, pooled capped SFX

```python
m = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudio.CreateCombatMixer",
    {"path": "Assets/AgentKit.Gameplay/Resources/CombatMixer.mixer", "groups": ["Music", "SFX", "UI"],
     "snapshots": {"Explore": {"Music": 0, "SFX": -10}, "Combat": {"Music": -12, "SFX": 0}}})   # overwrite=True to regenerate
t = ut_run.run_tests(P, "PlayMode", assemblies="AgentGameplay.PlayModeTests", filter="AgentGameplay.Tests.AudioTests")
```

The rules inside (`GameplayAudio.cs`: internal `UnityEditor.Audio.AudioMixerController` through
reflection; `MixerControl.cs`, `CombatAudio.cs`, `SoundEmitter.cs`):

```csharp
var ctl  = CreateMixerControllerAtPath(path);                         // Master + one snapshot
var grp  = ctl.CreateNewGroup("Music", false); ctl.AddChildToParent(grp, ctl.masterGroup);
ctl.AddExposedParameter(new AudioGroupParameterPath(grp, grp.GetGUIDForVolume()));   // then rename to "MusicVol"
ctl.CloneNewSnapshotFromTarget(false);                                 // second snapshot, renamed "Combat"
grp.SetValueForVolume(ctl, snapshot, -12f);
// runtime, public API only:
mixer.FindSnapshot("Combat").TransitionTo(0.6f);
mixer.SetFloat("MasterVol", 20f * Mathf.Log10(Mathf.Clamp(slider, 0.0001f, 1f)));   // a parameter NO snapshot drives
source.outputAudioMixerGroup = mixer.FindMatchingGroups("SFX")[0];     // Output None bypasses the mixer
// frequent sounds: queue of (emitter, playId) handles; at the cap, steal the oldest VALID handle
```

Tests: `test_03` (mixer job) and `test_05` (`AudioTests`, 2 tests). Result: pass. Mixer created with
groups Master, Music, SFX, UI, exposed MasterVol, MusicVol, SFXVol, UIVol, snapshots Explore and
Combat, all found by the runtime API. Explore read Music 0 / SFX -10; Combat after 0.6 s: -12 / 0,
and -6.0 dB halfway; after `SetFloat("MusicVol", -3)` a transition to Explore left Music at -3 while
SFX went to -10; `ClearFloat` put Music back to 0; MasterVol at 0.5 read -6.02 dB and stayed there
through a Combat transition that moved Music to -12; a misspelled name returned false. Audio runs in
batch mode here (48 kHz stereo output). Frequent sound: 60 plays, cap 12 held, 48 stolen, 12
emitters in the pool, all routed to SFX, all returned 1 s later, no double-release exception.

## G7. 200 agents: crowd scene, whole-frame profile, the AI slice

```python
rows = []
for mode, avoid in [("EveryFrame", "High"), ("Sliced", "High"), ("Sliced", "Low"), ("SlicedBurst", "Low")]:
    b = ut_run.run_method(P, "AgentKit.Gameplay.GameplayScenes.BuildCrowdScene", {"count": 200, "mode": mode, "avoidance": avoid})
    r = ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings",
                          {"scene": b["result"]["scene"], "frames": 300, "warmup": 120, "width": 1280, "height": 720},
                          quit=False, graphics=True, timeout=900)
    rows.append(gp.crowd_row(mode + "/" + avoid, r, gp.read_ai_budget(P)))       # AIBudgetMeter JSON
ut_stat.summarize_csv(r["result"]["csv"], target_ms=ut_stat.fps_to_ms(60))["budget"]
```

Test: `test_07`. Result: pass (run 3; each variant profiled twice because up to six editors from
other agents shared the Mac). 200 agents placed, 300 frames after 120 warm-up, 1280 x 720 offscreen
target, 443 draw calls, GC 168 to 248 B per frame (Editor baseline).

| Variant (director / avoidance) | CPU frame p50, two runs | p95, two runs | AI slice mean (our code) | brain ticks          |
| ------------------------------ | ----------------------- | ------------- | ------------------------ | -------------------- |
| EveryFrame / High              | 2.21, 2.20 ms           | 5.8, 6.2 ms   | 0.105, 0.151 ms          | 84,400               |
| Sliced 10 Hz / High            | 1.94, 2.22 ms           | 2.7, 5.3 ms   | 0.008, 0.009 ms          | about 2,500          |
| Sliced 10 Hz / Low             | 2.40, 2.23 ms           | 3.3, 4.4 ms   | 0.010, 0.012 ms          | about 2,500 to 2,900 |
| SlicedBurst 10 Hz / Low        | 1.90, 1.88 ms           | 3.3, 2.5 ms   | 0.016, 0.016 ms          | about 1,900 to 2,400 |

Reading: ticking brains from the director at 10 Hz cut our AI time 10 to 15x (0.10 to 0.15 ms ->
about 0.01 ms per frame), but the whole frame (navigation crowd, rendering, engine) is about 2 ms
and its run-to-run spread (1.94 vs 2.22 ms for the same variant) is larger than the variant
differences, so avoidance quality made no measurable difference at this count in the Editor. The
Burst prefilter made our slice LARGER (0.016 vs 0.010 ms): at 200 agents the job costs more than the
work (G8). Budget verdict on Sliced/Low: pass, p95 3.1 ms of 16.67, 0 hitches. An earlier run with
less contention read 1.70 / 1.43 / 1.90 / 1.50 ms p50 in the same order. Crowd capture opened: 200
red capsules in a grid, the pillar ring, the blue target. Confirm in a development player on the
target device before quoting any of these as a verdict.

## G8. Is Burst worth it here? Measure at the real count

```python
r = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.PerceptionBenchmark", {"counts": [200, 2000, 20000, 200000], "iterations": 200})
gp.dots_gate(entity_count=200, main_thread_ai_ms=<AI slice from G7>, frame_budget_ms=16.67)
```

The job compares the same range + FOV prefilter as a managed loop, a Burst job on the main thread
(`.Run`) and a Burst `IJobParallelFor` (`.Schedule(n, 64).Complete()`), all on NativeArrays,
`[BurstCompile(CompileSynchronously = true)]` so the first call is not the managed fallback. Test:
`test_08`. Result: pass (17 job workers on this Mac, Burst enabled, results identical across the
three paths). Mean per call, 200 iterations:

| Agents  | Managed loop        | Burst `.Run` (main thread) | Burst parallel `.Schedule` + `Complete`                      |
| ------- | ------------------- | -------------------------- | ------------------------------------------------------------ |
| 200     | 0.0064 to 0.0084 ms | 0.0007 to 0.0010 ms        | 0.022 to 0.023 ms (slower than managed: scheduling overhead) |
| 2,000   | 0.060 to 0.078 ms   | 0.0055 to 0.0068 ms        | 0.020 to 0.023 ms                                            |
| 20,000  | 0.64 to 0.81 ms     | 0.059 to 0.069 ms          | 0.025 to 0.026 ms (24x to 33x)                               |
| 200,000 | 6.75 to 8.73 ms     | 0.57 to 0.64 ms            | 0.074 to 0.090 ms (91x to 97x)                               |

(ranges = runs 2 and 3.) Reading: at 200 agents the whole prefilter costs 6 to 8 microseconds
managed; a parallel job costs more than it saves at 200 and wins from 2,000 (the crossover lies
between), as the Entities manual warns ("scheduling overhead"); Burst on the main thread is 9x to
14x the managed loop at every size (the Survival Kids `.Run()` path). Combined with the AI slice of
G7 (about 0.01 ms per frame for 200 sliced brains), `gp.dots_gate(200, 0.01, 16.67)` returns
"managed". Editor numbers with safety checks; confirm in a player.

## G9. Gameplay audit (scene) and code audit (text)

```python
a = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.AuditGameplayScene", {"scene": "Assets/Scenes/Level.unity"})
print("\n".join(gp.summarize_audit(a)))
c = gp.code_audit(P)            # tutorial traps: rb.velocity, drag, PhysicMaterial, autoSimulation, Simulate(deltaTime),
                                # FindObjectOfType, PlayClipAtPoint, legacy Input, [ServerRpc], deprecated Lobby/Relay packages
```

Test: `test_06` (live) and `test_offline.py::test_code_audit_fixture`. Result: pass. A seeded bad
scene (`GameplayProbe.BuildBadScene`) was flagged with every planted trap: `nav.agent_dynamic_body`,
`nav.agent_and_obstacle`, `cc.skin_width`, `cc.min_move`, `physics.concave_dynamic`,
`physics.ccd_dynamic`, `audio.no_mixer_group`, `audio.listeners` (plus `nav.no_surface` and the
`physics.queries_hit_triggers` info); the arena scene had 0 warnings and errors; the code audit
found 0 errors over the project's 32 C# files, and all 13 expected rules fired on the tutorial
fixture offline.

v0.2 rules: scene audit `physics.many_moving_triggers` (100 or more trigger colliders on moving
objects: proximity through triggers pays transform sync for each; the bad scene now seeds 120
kinematic trigger pickups); code audit `physics.auto_sync_on`, `jobs.taa_find_objects`,
`jobs.schedule_no_complete`, `physics.raycastcommand_legacy`, `domain.static_instance_no_reset`,
`physics.nonalloc_count_ignored` (fixture `TutorialJobs.cs.txt`, all 19 rules fire offline). `//`
comments are blanked before matching, so a comment that names a trap is not reported. Live (run
2026-09-24 20:14): the bad scene raised all nine expected codes including
`physics.many_moving_triggers`; the arena scene 0 warnings and errors; `code_audit` 0 errors, 0
warnings over the project's 50 C# files.

## G10. Netcode logic before netcode: prediction and reconciliation in Edit Mode

```python
t = ut_run.run_tests(P, "EditMode", assemblies="<your EditMode asmdef>")   # NetSim is pure C#: no NGO, no network
```

The rule inside (`NetSim.cs`):

```csharp
public NetInput Predict(float move, float dt) { var i = new NetInput { seq = nextSeq++, move = move }; pending.Add(i); x = NetModel.Step(x, move, dt); return i; }
public void OnServerState(NetState s, float dt)
{
    pending.RemoveAll(p => p.seq <= s.lastSeq);                 // acknowledged by the server
    float replay = s.x;
    foreach (var p in pending) replay = NetModel.Step(replay, p.move, dt);   // replay the rest from the authoritative state
    x = replay;
}
// server: if (i.seq <= lastSeq) return; clamp |move| <= 1 (never trust the client); step on its own tick
```

Test: `test_04` (`GameplayLogicTests`, 6 tests: also perception math, dB mapping, the ObjectPool
double-release trap). Result: pass, 6/6 in about 18 s including the editor start. At 30 Hz with 3
ticks one way: 0 corrections and 0 backward snaps for the reconciling client, exact final equality;
the naive snapping client jumped backward; a server-only wall at x = 5 was corrected and the client
converged on 5; 60 of 60 hacked inputs (move = 3) clamped. Unchecked pool: a double release handed
the same object to two owners.

## G11. One update hub, sorted by type, safe with domain reload off

For many objects of several kinds (turrets, pickups, doors, critters) that each did work in
`Update`. The enemy director (G4) stays the tick for brains; the hub is for everything else.

```csharp
public class Turret : MonoBehaviour, IManualUpdate
{
    void OnEnable()  { UpdateHub.SafeRegister(this); }     // refused and counted if already registered
    void OnDisable() { UpdateHub.SafeUnregister(this); }   // no-op if the hub was destroyed first
    public void ManualUpdate(float dt) { /* was Update() */ }  // no Update(): the engine cannot call it twice
}
// UpdateHub.cs: [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
//               static void ResetStatics() { Instance = null; UpdateRegistry.ResetStaticKeys(); }
// UpdateRegistry.cs: Register/Unregister only set a dirty flag; Tick sorts by concrete type once, then
//                    updates; removal during a tick leaves a hole compacted after it (no double update)
```

```python
r = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.UpdateOrderBenchmark", {"counts": [1000, 10000], "ticks": 300})
```

Tests: `test_04` (`RegistryAndCouplingTests.RegistryLifecycleRules`), `test_10`
(`HubAndJobsTests.HubTicksOnceAndSurvivesTeardown`), `test_11` (benchmark). Result: pass. Edit Mode:
double registration and double removal refused and counted (1 each), one lazy sort for four
registrations, an object removed during a tick never updated again, `SafeUnregister` with no hub a
no-op. Play Mode: 50 objects ticked exactly once per hub tick over 10 frames, a second hub refused
with an error, the hub destroyed before its objects without an exception. Benchmark (same objects,
sorted by type vs shuffled registration order, Editor Mono JIT): two runs (standalone, then
`test_11` at 20:21):

| Objects (4 types) | Sorted by type: mean / median / worst tick         | Shuffled: mean / median / worst tick               | Mean change    |
| ----------------- | -------------------------------------------------- | -------------------------------------------------- | -------------- |
| 1,000             | 0.039 / 0.038 / 0.196 ms; 0.037 / 0.035 / 0.165 ms | 0.042 / 0.041 / 0.066 ms; 0.043 / 0.039 / 0.229 ms | -6.8%; -13.6%  |
| 10,000            | 0.401 / 0.410 / 0.447 ms; 0.414 / 0.392 / 3.196 ms | 0.464 / 0.475 / 1.955 ms; 0.480 / 0.444 / 3.927 ms | -13.5%; -13.7% |

Reading: the same objects doing the same work ran 7 to 14% faster on average when updated grouped by
type, close to Survival Kids' 12%; the worst tick was lower in 3 of 4 comparisons, but single worst
ticks are noisy on a shared Mac. Editor Mono JIT numbers: confirm on the target (IL2CPP, device CPU)
before quoting.

## G12. Jobs without Entities: the TransformAccessArray rules, stalls and the job-wait meter

```csharp
// build the TAA from your own list, once or when the set changes (EnemyDirector.Rebuild), never FindObjectsByType<Transform>
m_Taa = new TransformAccessArray(myTransforms);
var h = new CopyPoseJob { pos = m_Pos, fwd = m_Fwd }.ScheduleReadOnly(m_Taa, 64);   // tiny read-only copy-out
m_Handle = new PerceptionPrefilterJob { ... }.Schedule(count, 32, h);                // math on NativeArrays
JobHandle.ScheduleBatchedJobs();
// ... other main-thread work; never write those transforms here: the write waits for the job ...
new MainThreadBurstJob { ... }.Run();      // fills the wait instead of idling in Complete()
m_Handle.Complete();                       // always, before reading, even if the job looks finished
```

```python
# batch-mode gauge of main-thread job waits: add JobWaitMeter to the scene, profile, read meter.frameMs
gp.dots_gate(entity_count=5000, main_thread_ai_ms=4.0, frame_budget_ms=16.67, main_thread_wait_ms=2.0)["notes"]
```

Test: `test_10` (`HubAndJobsTests.TransformWriteWaitsForTaaJob`,
`BurstRunInsideCompleteWaitIsNearlyFree`). Result: pass. TAA write (64 transforms, three runs each
in two sessions): the write to a transform in the array took 21.7 to 38.4 ms, the length of the
running job (23.3 to 37.0 ms), while a write outside the array took 0.002 to 0.003 ms (two outliers
of 4.1 and 21.8 ms under contention from other editors; the test compares medians). Stall fill (big
job 4,096 x 2,000 on 17 workers, main-thread Burst job 256 x 2,000): `Complete()` alone 10.3 to 12.6
ms, `.Run()` alone 10.9 to 13.0 ms, `.Run()` placed between `Schedule` and `Complete()` 13.3 to 16.3
ms in total instead of 21.1 to 25.7 ms in sequence (6.3 to 10.3 ms saved). `JobWaitMeter` read 14.25
and 14.63 ms per frame against 14.07 and 14.83 ms timed `Complete()` calls, and 0 once the stall was
removed. The `WaitForJobGroupID` marker (category Jobs) was found by
`ProfilerRecorderHandle.GetAvailable`; with the Profiler off, `LastValue` and `Count` stayed 0 and
`CurrentValue` accumulated across frames, so `JobWaitMeter` differences `CurrentValue` in a
LateUpdate at execution order 10001. Worker idle time (the gray Timeline gaps) is not scripted: read
the Timeline in a GUI session.

## G13. "Is anything near me?" without triggers: brute force, Burst, grid

```python
gp.proximity_gate(items=1000, queries_per_frame=20)     # own list + sqrMagnitude
gp.proximity_gate(items=10000, queries_per_frame=200)   # grid or KD tree rebuilt per frame in a Burst job
r = ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.ProximityBenchmark",
                      {"cases": [[1000, 20], [10000, 200]], "radius": 5, "iterations": 100})
```

The rule inside (`ProximityBenchmark.cs`): the grid is rebuilt every call in a Burst `IJob`
(`NativeParallelMultiHashMap`, cell = query radius, exact 16-bit cell keys) and queried in a Burst
`IJobParallelFor` over the 3 x 3 neighbor cells; results must equal both brute-force paths. Test:
`test_11`. Result: pass, all results identical. Two runs (standalone, then `test_11`):

| Items x queries (r 5 m, 100 x 100 m)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Managed brute force | Burst brute force (`.Run`) | Burst grid build + query                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------- | ----------------------------------------------------------------- |
| 1,000 x 20                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 0.141, 0.165 ms     | 0.028, 0.030 ms            | 0.042, 0.033 ms                                                   |
| 10,000 x 200                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 13.98, 14.66 ms     | 2.38, 2.75 ms              | 0.30, 1.29 ms (the parallel query was slower under load in run 2) |
| 200 x 200                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 0.278 ms            | 0.048 ms                   | 0.034 ms                                                          |
| Reading: brute force costs a constant per item-query pair (7.0 ns managed, 1.2 to 1.4 ns Burst on this Mac, Editor), which `proximity_gate` uses; below a few tens of thousands of pairs a managed loop over your own array is fine; at 10,000 x 200 the grid wins by 47x over managed and 8x over Burst brute force. Triggers were not benchmarked here; the transform-sync argument is the talk's (ZkvK0mX-id4 [00:43:04]), and the scene audit flags 100 or more moving triggers. |

## G14. Queries: NonAlloc counts, shape sweeps, batched sight with QueryParameters, SyncTransforms

```csharp
int n = Queries.OverlapSphere(pos, 5f, m_Buffer, mask, QueryTriggerInteraction.Ignore, "melee");   // flags n == m_Buffer.Length
for (int i = 0; i < n; i++) { /* m_Buffer[i] only */ }
int k = Queries.RaycastAll(eye, dir, 30f, m_Hits, mask, QueryTriggerInteraction.Ignore, sortByDistance: true);
Queries.SweepShape(projectileCollider, from, velocity * Time.fixedDeltaTime, out var hit, mask);    // Sphere/Capsule/BoxCast by collider type
var shot = GetComponent<SweepProjectile>(); shot.Launch(muzzle, dir * 300f);                        // no Rigidbody, collider disabled
var qp = new QueryParameters(occluders, false, QueryTriggerInteraction.Ignore, false);
m_Commands[i] = new RaycastCommand(eye, dir, qp, dist);                                              // LineOfSightBatch
RaycastCommand.ScheduleBatch(cmds, hits, 32, 1, default);    // Complete next frame, before reading
box.transform.position = p; Physics.SyncTransforms();         // before a same-frame query on a moved collider
```

Test: `test_10` (`QueryTests`, 4 tests). Result: pass. (run 2026-09-24 20:20 and earlier runs): 12
colliders in range and an 8-slot buffer: 8 returned with no error, flagged once by `Queries` (a
32-slot call not flagged); raw `RaycastNonAlloc` distances unordered in every run (for example 1.98,
2.98, 6.98, 3.98, 4.98, 5.98), sorted by `Queries.RaycastAll(sortByDistance: true)`. A static box
moved out of a ray by its transform was still hit in the same frame and missed after
`Physics.SyncTransforms()`. Center ray 0 hits vs 0.25 m sphere sweep 1 hit on a post 0.15 m off the
lane; capsule ray 0 vs capsule sweep (r 0.1) 1 on a post 0.08 m off; a 5 cm `SweepProjectile` at 300
m/s stopped on the thin dynamic plate (x 29.93, plate face at 29.975). `LineOfSightBatch` agreed
with `Physics.Raycast` on every ray (0 mismatches of 200 and 2,000); main-thread cost at 200 rays
0.020 to 0.026 ms schedule + 0.034 to 0.044 ms complete vs a 0.129 to 0.134 ms loop; at 2,000 rays
0.167 to 0.195 + 0.059 to 0.094 ms vs 0.46 to 0.95 ms. Completing next frame (as `EnemyDirector`
does for its prefilter) removes most of the complete cost.

## G15. NavMesh details: carve timing, HeightMesh, bake scoping, Remove Object, locomotion coupling

```csharp
surface.buildHeightMesh = true;                           // stairs: agents follow treads, not a ramp
surface.collectObjects = CollectObjects.Volume; surface.size = new Vector3(20, 10, 20);   // or MarkedWithModifier
bush.AddComponent<NavMeshModifier>().ignoreFromBuild = true;   // Inspector: Mode = Remove Object (foliage)
surface.BuildNavMesh(); AssetDatabase.CreateAsset(surface.navMeshData, path);             // editor bake (G2)
// carve: queries in the same frame still see the old NavMesh; repath next frame
var sync = gameObject.AddComponent<AgentLocomotionSync>();
sync.authority = LocomotionAuthority.AgentDrives;         // root motion off; OnAnimatorMove: agent.speed = deltaPosition.magnitude / dt
sync.authority = LocomotionAuthority.AnimationDrives;     // updatePosition = false; 0.9 pull when drift > agent radius
sync.ApplyAuthority();
```

Test: `test_10` (`NavExtrasTests`, 3 tests: the arena scene of G2 and a runtime bake 500 m away).
Result: pass. Carve: in the arena door, the same-frame query stayed PathComplete and turned
PathPartial one frame later; destroying the obstacle reopened the door one frame later; a new
obstacle with Carve Only Stationary carved on the next frame (it never moved), stayed open while
moved out and back, and re-carved 0.50 to 0.61 s after stopping (Time To Stationary 0.5 s).
HeightMesh: six 0.25 m steps, `SamplePosition` on the treads 0.17 to 0.26 m low without it (mean
0.22 m: a ramp), 0.00 m with Build Height Mesh. Scoping: with Collect Objects = Volume (20 x 20 m)
the ground outside the volume stayed off the NavMesh. Remove Object: the bush center was not on the
NavMesh, then was after `ignoreFromBuild = true`. Coupling (radius 0.4, agent 2 m/s, synthetic root
motion 30% faster): drift 1.84 m after 3 s without the pull, at most 0.41 to 0.45 m with it (36
corrections); agent-drives mode set `agent.speed` to 2.5 from a 0.05 m root step at 0.02 s,
`updatePosition` true.

## G16. Spatial audio measured at the listener: rolloff past Max Distance, distance muffling, music under spam

```csharp
AudioListener.GetOutputData(buf, channel);                       // RMS at the listener, both channels
AudioListener.GetSpectrumData(spec, 0, FFTWindow.BlackmanHarris); // one band per source frequency (music 220 Hz, weapons 3 kHz)
var lp = source.gameObject.AddComponent<AudioLowPassFilter>();    // distance muffling lives on the source
lp.customCutoffCurve = AnimationCurve.Linear(0f, 1f, 1f, 0.02f);  // x = distance / maxDistance
music.priority = 0;                                              // never virtualized by weapon spam
```

```python
gp.rolloff_gain(20, min_distance=1, max_distance=10, mode="Logarithmic")   # 0.05: still attenuating past Max Distance
```

Test: `test_10` (`AudioSpatialTests`, 3 tests; tones generated with `AudioClip.Create`, a dedicated
listener 1 km up, other listeners disabled). Result: pass. Rolloff (min 1, max 10, listener RMS, max
of three windows): Logarithmic gain 1, 0.50, 0.20, 0.10, 0.05, 0.025 at 1, 2, 5, 10, 20, 40 m, so it
keeps attenuating past Max Distance as min/d (the 6.3 Manual's "ignored" is what 6000.3.21f1 does;
the script reference's "stops attenuation" is not, for Logarithmic); Linear 1, 0.89, 0.56, 0, 0, 0.
One earlier Linear reading was 0 at 5 m and the first reading of a session was 0 in the muffling
test: this Mac's output device restarted (48,000 then 24,000 Hz) and dropped single windows, hence
the three-window maximum and the end-of-test baseline. Muffling (8 kHz tone): a fixed 500 Hz cutoff
kept 0.0004x; the distance curve kept 1.00x at 1 m and 0.03x at 8 m of the unfiltered level at the
same distance, with `cutoffFrequency` still reading 22000. Music under spam (32 real voices, music
volume 0.3, 60 looping 3D weapon tones): 220 Hz band -82 to -84 dB at priority 128 (virtualized),
-8.5 to -12 dB at priority 0, 0.0 dB with 12 weapon voices. A human listening pass still picks the
frequent-sound cap (30, 15, 5 at stress, BgpqoRFCNOs [00:17:23]); the spectrum band is the automated
proxy for "music and UI stay audible".

## What did not run here, and why

- NGO itself, Multiplayer Play Mode, Multiplayer Services sessions: the package is not installed in
  the test project, and sessions need a linked Unity Cloud project and network; NGO facts are from
  the 2.7 manual, the logic is proven in `NetSim`.
- Entities (ECS): not installed; the DOTS decision here is backed by Burst jobs without Entities
  (the Survival Kids path) and the manual's numbers.
- Unity Behavior graphs, ducking and send effects in the mixer, NavMesh Links: GUI-authored or not
  needed by the tested scenes; their GUI paths are in gui-paths.md. (HeightMesh on stairs now runs,
  G15.)
- Worker idle time in the Timeline, Profile Analyzer comparisons and native device profilers: GUI or
  device tools; `JobWaitMeter` covers the main-thread wait in batch mode.
- The frequent-sound cap by ear: an agent cannot listen; G16 is the proxy, a human decides.
- Device numbers: all timings are Editor Play mode on an Apple Silicon Mac; confirm in a development
  player on the target device (scenario-unity-performance).
