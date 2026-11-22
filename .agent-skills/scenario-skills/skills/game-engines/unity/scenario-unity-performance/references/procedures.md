# Procedures (copyable, each with its live test and result)

All run in Unity 6000.3.21f1 on macOS 26.5.1 (Apple M5 Max, Metal) on 2026-09-24, project
`tests/projects/unity-performance` (APFS clone of Base3D_URP; path with spaces). P12 to P17 were
added in the v0.2 refactor the same day (points a blind grade found missing); the project then also
carries three packages preinstalled with 6.3 and added by name: `com.unity.project-auditor` 1.0.2,
`com.unity.test-framework.performance` 3.5.0, `com.unity.profiling.core` 1.0.3. Live suite:
`tests/code/unity-performance/test_live_perf.py` (steps named below), results appended to
`archive/tests/unity-performance/live_results.jsonl`, outputs in
`archive/tests/unity-performance/out/`. The machine was shared with other agents during the run
(load average 40 to 210): counts are exact, times are indicative, which is why P1 has an interleaved
A/B mode.

Test fixture (`tests/code/unity-performance/unity/`): 3,000 spinning URP Lit spheres (515 vertices
each), each with a per-object `Update` that allocates (string concatenation, `new List`, LINQ with a
captured local, boxing) and a `MaterialPropertyBlock` tint. Fixes applied one at a time and saved as
separate scenes: `no_alloc`, `manager` (one loop over a `Transform[]`), `burst`
(IJobParallelForTransform), `materials` (8 Material Variants instead of the MPB), then the GPU
Resident Drawer.

Header for every snippet:

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-performance/scripts")
import ut_perf                      # imports ut_env, ut_run, ut_stat from scenario-unity-expert/scripts
from ut_perf import ut_env, ut_run, ut_stat
P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")
ut_perf.install(P)                  # core AgentKit + Assets/Editor/AgentKit/Performance + Assets/AgentKitRuntime/Performance (asmdef)
```

## P1. Editor Play-mode profile, one fix at a time, before/after

```python
a = ut_perf.profile(P, "Assets/Scenes/Stage0.unity", frames=300, warmup=60, label="before")
b = ut_perf.profile(P, "Assets/Scenes/Stage1.unity", frames=300, warmup=60, label="after")
cmp = ut_perf.compare(a["csv"], b["csv"])         # ut_stat.compare_frames per column
print(ut_perf.compare_line(cmp))                   # "cpu_frame_ms 39.7 -> 41.0 (3.3%); ... gc_alloc_bytes ... (-95.6%)"
# times on a noisy machine: interleave A,B,A,B,A,B; per-run p50; median; sign must agree every round
ab = ut_perf.ab_profile(P, sceneA, sceneB, rounds=3, frames=200, render=False)   # render=False isolates scripts
ab["delta_pct"], ab["consistent"], ab["load_avg_1m"]
```

Unity call:
`Unity -batchmode -projectPath P -executeMethod AgentKit.AgentProfile.PlayModeTimings -agentJob <dir>`
(no `-quit`, graphics on); Play mode entered with `EditorApplication.EnterPlaymode()`,
`Camera.main.targetTexture` = offscreen RT when `render=True`, counters through `ProfilerRecorder`.

Test: steps `profile` and `ab`. Result: pass. Rendered ladder (Editor, 300 frames each, mean): slow
39.7 ms, 5,946 draw calls = batches = SetPass, GC 1.36 MB/frame; no_alloc 41.0 ms (GC -95.6%, frame
time unchanged: the frame was bound by render state); manager 55.9 and burst 59.3 (noise from a load
average near 110, not the fix); materials 9.46 ms, SetPass 33; GPU Resident Drawer 3.19 ms, 31 draw
calls. A second full run (heavier load) gave slow 63.4, no_alloc 63.8, manager 53.0, burst 53.8,
materials 7.9, GRD 5.4 ms: identical counts, different times (GRD 3.0x in one run, 1.5x in the
other), which is why Editor times are for iteration only. Interleaved A/B with rendering off (3
rounds, sign consistent): slow to no_alloc 4.48 to 1.90 ms (-58%); no_alloc to manager 1.88 to 0.81
ms (-57%); manager to Burst 0.90 to 1.30 ms (+44%, load average 93 to 122) but 0.90 to 0.50 ms
(-44%) at load 37 to 53; one root per object instead of one parent (the console e-book says smaller
hierarchies multithread better) gave no consistent difference at 3,000 transforms (sign flipped
between rounds: no claim). `Render Thread` counter missing in the Editor.

## P2. Draw-call configuration: audit, then the GPU Resident Drawer

```python
au = ut_run.run_method(P, "AgentKit.Performance.PerfRendering.Audit", {"scene": "Assets/Scenes/X.unity"})
au["result"]["config"]["brg_variants"], au["result"]["findings"]      # perf.* findings, core format
g = ut_run.run_method(P, "AgentKit.Performance.PerfRendering.EnableGpuResidentDrawer",
                      {"assets": ["Assets/Settings/PC_RPAsset.asset"], "occlusion": False})   # dry_run=True to preview
g["result"]["changes"]      # before -> after for every setting; "after" is a fresh audit
# revert: {"mode": "Disabled"} restores static batching
```

What the job sets (6.3 Manual, URP 17.3 source; the API names below are not in the notes, which mark
this step [verify]: they compiled and ran in 6000.3.21f1 **[observed]**):
`EditorGraphicsSettings.batchRendererGroupShaderStrippingMode = KeepAll` (SerializedObject
`m_BrgStripping` fallback); `UniversalRenderPipelineAsset.useSRPBatcher = true`,
`gpuResidentDrawerMode = InstancedDrawing`, `gpuResidentDrawerEnableOcclusionCullingInCameras` only
if asked; every `UniversalRendererData` of those assets to `ForwardPlus` (or `DeferredPlus` from
Deferred); `PlayerSettings.SetStaticBatchingForPlatform(target, false)`. The audit also flags:
renderers with an edit-time MPB, URP materials with `enableInstancing`, Batching Static objects with
GRD, LPPV, Mesh LOD under an LODGroup, more than one screen camera. v0.2 adds: per-renderer GRD
eligibility with the reason (`scene.grd_eligibility`, finding `perf.grd_fallout`, see P12); graphics
jobs per platform read through the internal
`GetGraphicsJobsForPlatform`/`GetGraphicsJobModeForPlatform` (finding `perf.graphics_jobs_split` for
a Windows or Android ship target not on Split; pass `platforms`); the active Build Profile
(`perf.platform_profile_shared`); Log/Warning stack traces (`perf.release_stack_traces`);
`asyncUploadBufferSize` over 32 MB (`perf.async_upload_buffer`); Mipmap Streaming, Shader Variant
Loading chunk settings, Prebake Collision Meshes; per camera `layerCullDistances` and occlusion
culling, baked occlusion data size, MeshColliders with prebake off (`perf.mesh_collider_cooking`).

Test: steps `setup`, `scenes`, `profile`, `player`. Result: pass. Template audit: BRG variants
`KeepIfEntitiesGraphics`, static batching on for macOS, PC renderer Forward+, Mobile renderer
Forward (a GRD toggle alone would do nothing). Enable changed exactly three settings. Draw calls
5,946 to 31 (Editor and player). The audit of the slow scene found 0 MPB: the tint is set in
`Start()` at runtime, which only P9's lint catches. Scene still using MPB with GRD on: 5,946 draw
calls, 49.1 to 47.9 ms in the player (no gain).

## P3. Benchmark player, run headless, frame times and a frame to look at

```python
b = ut_perf.build_player(P, "Builds/macOS/Bench.app", scenes=[...], development=True, backend="Mono2x")
b["result"]["total_time_s"], b["result"]["output_on_disk_mb"]
r = ut_perf.run_player(P + "/Builds/macOS/Bench.app", "/abs/out/run.csv", frames=300, warmup=60,
                       scene="Stage4", shot="/abs/out/run.png")
r["summary"]["budget"], r["summary"]["columns"]["draw_calls"], r["probe"]["render_mode"]
ut_perf.player_bound(r)          # CPU vs GPU from FrameTimingManager columns (windowed players only)
```

Unity calls: build
`Unity -batchmode -nographics -quit -buildTarget StandaloneOSX -executeMethod AgentKit.Performance.PerfBuild.Build`
(`StandaloneOSX` is the BuildTarget enum name, accepted and used here; the 6.3 command-line page
lists the short name `osxuniversal`; both select the macOS player) (`BuildPipeline.BuildPlayer`,
`PlayerSettings.enableFrameTimingStats = true`, settings restored after); run
`<Game>.app/Contents/MacOS/<Game> -batchmode -logFile <log> -perfProbe <csv> -perfFrames 300 -perfWarmup 60 -perfScene <name> -perfShot <png>`.
PerfProbe (`scripts/Runtime/Performance/PerfProbe.cs`) is inert without `-perfProbe`; it sets VSync
off, finds counters by name (`ProfilerRecorderHandle.GetAvailable`), records
`CPU Total/Main/Render Thread Frame Time`, `GPU Frame Time`, `Main Thread`, wait markers,
`GC Allocated In Frame`, `GC.Alloc` count and sample time, `GC.Collect`, memory, draw calls,
batches, SetPass, triangles, `Shader.CreateGPUProgram`, writes CSV + JSON and quits (also on error).

Test: step `player`. Result: pass. First try without manual submit: 0 draw calls and 0.33 ms frames:
a batch-mode player skips camera rendering (log: `kGfxThreadingModeNonThreaded`); PerfProbe now
submits `Camera.main` each LateUpdate (`RenderPipeline.SubmitRenderRequest`) and saves the last
frame; 8 shots checked (saturation 0.24, no flags) and the contact sheet opened. Development Mono
players (319.6 MB universal app; first build 102 s, incremental 8 to 26 s), two full runs: slow 58.3
/ 60.3 ms mean, 300/300 frames over 33 ms; materials 6.2 / 5.2 ms (SetPass 33); materials + GRD 2.29
/ 1.86 ms (31 draw calls): the GRD gain held at 2.7x / 2.8x in the player while the Editor swung
between 1.5x and 3.0x. GPU frame time is reported on only 10 of 300 frames in batch mode (no
present): GPU numbers need a windowed player [not run: it opens a window on the user's screen].
Third run with PerfProbe v0.2 (same day, after the refactor): slow 38.6 ms, materials 4.90 ms,
materials + GRD 2.56 ms (1.9x this time; 5,946 to 31 draw calls again): the player gain moved
between 1.9x and 2.8x across three runs while counts never changed. The manual submit adds
`RenderTarget.GrabPixels` (about 1 to 2 ms per frame at 1080p, seen in P4): compare runs made the
same way.

## P4. Profiler capture from a player, read like Profile Analyzer

```python
c = ut_perf.capture_player(app, "/abs/out/cap.raw", frames=200, warmup=30, scene="Stage0")
a = ut_perf.analyze_capture(P, c["raw"], skip=5, top=12, markers=["BehaviourUpdate"])
res = a["result"]
res["bound"], res["bound_frames"], res["frame_ms"]          # FPS waits removed
res["gc"]                    # alloc calls/frame, alloc SAMPLE ms/frame, collect calls and ms
res["longest_vs_median"]     # markers ranked by self-time delta, with counts
res["top_self_markers"]
```

Unity calls: player `-profiler-enable -profiler-log-file <raw> -profiler-capture-frame-count <N>`
(development builds; 6.3 Manual table);
`Unity -batchmode -nographics -executeMethod AgentKit.Performance.PerfCapture.Analyze`:
`ProfilerDriver.LoadProfile(path, false)`, `ProfilerDriver.GetRawFrameDataView(frame, thread)`,
`RawFrameDataView.GetSampleName/GetSampleTimeMs/GetSampleChildrenCount(Recursive)`; self time =
sample minus direct children. Bound rules: render thread mostly in
`Gfx.WaitForGfxCommandsFromMainThread` = main bound; main in `Gfx.WaitForPresentOnGfxThread` with
`Gfx.PresentFrame`/`*WaitForLastPresent` = GPU bound; main waiting with a busy render thread =
render-thread bound; `WaitForTargetFPS` = headroom.

Profiler memory: `maxUsedMemory` defaults to 16 MB in players and 256 MB in the Editor (6.3 Manual;
the e-book's 128/512 MB is older): raise it for long or deep captures on a device.

Marker names: the docs describe native traces (`SerializedFile::ReadObject`, SetPass counts); a
Unity Profiler capture of a 6.3 player names the same work differently. **[observed]** in these
captures: `StdRender.ApplyShader` (per-draw material state on the non-SRP-Batcher path) and
`ReadObjectFromSerializedFile` (synchronous object read); the ProfilerRecorder name is
`Loading.ReadObject` (PerfProbe v0.2 column `sync_read_object_ms`). Search by substring, and list
`wait_markers_seen` before trusting a rule.

Test: step `capture`. Result: pass; 548.6 MB `.raw` for 230 frames (budget disk), 226 frames
analyzed: mean 66.1 ms, p50 56.6, max 202.2; `StdRender.ApplyShader` 43.9 ms self per frame (the
non-SRP-Batcher path the MPB forces), longest frame 183 vs median 37 ms of it with the same 5,634
calls; 27,055 `GC.Alloc` per frame displayed as 0.55 ms; 573 `GC.Collect` = 327 ms over the capture,
max 12.4 ms in a frame; `StressSpinner.Update` 4.9 ms self (second run: mean 57.4, p50 52.8 ms, same
27,055 allocations per frame). No wait markers in a batch-mode player (no render thread, no
present): bound fell back to "main"; wait-marker classification needs a windowed player.

## P5. Garbage collection: find it, prove zero

```python
csv = ut_perf.profile(P, scene)["csv"]                                   # or a player CSV from P3
ut_stat.gc_check(ut_stat.read_frame_csv(csv)["gc_alloc_bytes"], max_bytes_per_frame=1024)  # Editor never 0 (88-296 B seen); 0 in the player
t = ut_run.run_tests(P, "EditMode", filter="PerfTests")                  # allocation gate as tests
```

```csharp
// EditMode test (tests/code/unity-performance/unity/Tests/EditMode/AllocationTests.cs)
using Is = UnityEngine.TestTools.Constraints.Is;
Assert.That(() => { sys.Tick(1); }, Is.Not.AllocatingGCMemory());
Assert.AreEqual(0, AgentKit.Performance.AllocScope.Measure(() => sys.Tick(2)));   // count per block, any code
// the hidden allocation: the closure object is created at SCOPE ENTRY, before the early return
void Update() { transform.Rotate(0, s, 0); if (!allocate) return;
                int threshold = Time.frameCount & 3; n = list.Where(x => x > threshold).Count(); }
// fix: move the captured local and the lambda into their own method or block
```

Retired check: the log line `gc.editor_slow_vs_fixed` (2026-09-24 20:03:46, ok false) in
`archive/tests/unity-performance/live_results.jsonl` is stale. It gated the Editor at 0 B per frame,
which the Editor never reaches (88 to 296 B seen); it was replaced by `gc.editor_three_stages` (1 KB
per frame in the Editor, 0 B judged in the player), which passed at 20:10:56, 20:42:41 and 20:45:36
(the 20:31:06 fail was the intermediate 256 B limit). The log keeps every line; read the latest line
per test name, and a retirement marker row was appended.

Test: steps `gc`, `player`, `capture`. Result: pass. EditMode 3/3, stable over 5 runs once the
measured delegates were warmed (one run in three failed before: the first call of a lambda inside
the measurement can allocate) (clean tick 0 allocations by both methods; garbage tick counted;
`StringBuilder.Append(int)` allocates on this Mono runtime: the first "clean" tick used it and
failed the constraint). Editor gc_check at 1 KB/frame: slow fail (1.36 MB p50), no_alloc fail
(60,168 to 60,296 B = 20.1 B per object), manager pass (168 to 296 B: the Editor is never at 0).
Player with camera rendering off (`-perfRender auto`), slow vs no_alloc (they differ only by the
allocating lines), 2 rounds in each of two runs: 5.0 to 6.6 ms vs 1.0 to 1.4 ms, so the allocating
code cost 3.8 to 5.4 ms per frame while its 27,000 GC.Alloc samples displayed 0.8 to 1.1 ms, plus
1.1 to 1.5 ms per frame of `GC.Collect`. Observed in the rendered player: slow 1.36 MB and 26,912
allocations per frame; no_alloc still 60 KB = 3,002 allocations per frame: 20 bytes per spinner from
the closure created at scope entry (identical in the Editor, so not an Editor artifact); manager and
later stages 104 B/frame (2 allocations: engine/probe baseline). In the Editor (rendering off,
interleaved) the same removal saved 2.6 ms per frame.

## P6. Shader and PSO warm-up with GraphicsStateCollection

```python
gsc = "/abs/out/bench_metal.graphicsstate"                 # one per graphics API and platform
cold = ut_perf.run_player(app, "/abs/out/trace.csv", frames=120, warmup=0, scene="Stage4", trace_gsc=gsc)
cold["probe"]["trace"]                                      # saved, variants, graphics_states, api
ut_run.run_method(P, "AgentKit.Performance.PerfShaders.InspectGraphicsState", {"file": gsc}, graphics=True)
ctl  = ut_perf.run_player(app, "/abs/out/cold.csv", frames=120, warmup=0, scene="Stage4")   # control
warm = ut_perf.run_player(app, "/abs/out/warm.csv", frames=120, warmup=0, scene="Stage4", warm_gsc=gsc)
sum(ut_stat.read_frame_csv(warm["csv"])["shader_compiles"])  # must be 0 in gameplay frames
```

Where to warm: in a loading sequence (application start or scene load behind a loading screen),
never while a gameplay area streams in: the 6.3 page recommends loading sequences, and
`WarmUpProgressively(count, dependency)` creates a set number of PSOs per call so the warm-up can
spread over loading frames without blocking (Manual, Warm up PSOs). APIs without PSOs (DX11, OpenGL
ES) warm a ShaderVariantCollection built from a Log Shader Compilation playthrough instead
(`ShaderVariantCollection.WarmUp()`; P15 builds it). One collection per graphics API and platform: a
Metal trace does not warm DX12.

```csharp
// PerfProbe, RuntimeInitializeLoadType.BeforeSceneLoad (development player for tracing):
var trace = new GraphicsStateCollection(); trace.BeginTrace();      // ... at the end: EndTrace(); SaveToFile(path)
var gsc = new GraphicsStateCollection(); gsc.LoadFromFile(path);    // shipping: during loading
gsc.WarmUp(default(JobHandle)).Complete();                          // or WarmUpProgressively(n, default)
```

Test: step `gsc`. Result: pass. Metal player: trace saved 10 variants / 10 graphics states (158,737
bytes; URP Lit 3, SSAO 4, CoreBlit 2, Skybox 1); cold run 18 `Shader.CreateGPUProgram` in frame 0,
cold control again 18 (no disk cache hides it), warmed run 0, warm-up of 10 PSOs 3.6 ms at load
(second full run: 18 / 18 / 0, 3.2 ms). First frames stayed 200 to 280 ms in all three runs; the
capture of the warmed start attributed the first frame to `Mono.JIT` 204 ms (3,587 samples; 177 ms
in the second run), `Init FMOD` 87 ms, `Application.WaitForAsyncOperationToComplete` 44 ms,
`ReadObjectFromSerializedFile` 24 ms. `CreateGraphicsGraphicsPipelineImpl` did not resolve as a
recorder on Metal (reported missing). Rerun with PerfProbe v0.2: 18 / 18 / 0 compiles, warm-up 3.57
ms, first frame again on `Mono.JIT` (199 ms, 3,618 samples) and FMOD init (65 ms).

## P7. Build size breakdown, IL2CPP settings per build

```python
b = ut_perf.build_player(P, "Builds/macOS/Size.app", scenes=[...], development=False,
                         backend="IL2CPP", stripping="Minimal", il2cpp_codegen="OptimizeSpeed")
res = b["result"]; bd = res["breakdown"]
res["output_on_disk_mb"], res["total_size_mb"], res["total_time_s"], res["steps"][:3]
print(ut_perf.size_table(bd))                       # packed assets by category
bd["top_assets"], bd["files_by_role"]               # biggest sources; GameAssembly vs data vs managed DLLs
ut_perf.parse_log_build_report(ut_run.read_text(b["log"]))["categories"]   # the Editor.log Build Report block
ut_perf.app_breakdown(P + "/Builds/macOS/Size.app", top=6)   # what the shipped bytes are
```

Unity calls: `PlayerSettings.SetScriptingBackend(NamedBuildTarget, ...)`,
`SetManagedStrippingLevel`, `SetIl2CppCodeGeneration`, `BuildPipeline.BuildPlayer`, then
`BuildReport.packedAssets[].contents[]` (`sourceAssetPath`, `type`, `packedSize`) and
`BuildReport.GetFiles()` (`role`, `size`); settings restored afterwards.

Test: step `size`. Result: pass, three release builds of the same scene (universal x86_64 + arm64
macOS apps, load average 120 to 210 during the builds):

| Build                                               | Shipped .app on disk | BuildReport totalSize | Build time (first / rerun) | Biggest files in the .app                                                         |
| --------------------------------------------------- | -------------------: | --------------------: | -------------------------: | --------------------------------------------------------------------------------- |
| IL2CPP, Minimal, Optimize for runtime speed         |             177.9 MB |              1,908 MB |              441 s / 187 s | GameAssembly.dylib 95.2 MB, UnityPlayer.dylib 61.7 MB, global-metadata.dat 7.9 MB |
| IL2CPP, High, Optimize for code size and build time |             110.5 MB |                675 MB |               97 s / 108 s | UnityPlayer.dylib 61.7 MB, GameAssembly.dylib 30.7 MB, global-metadata.dat 5.0 MB |
| Mono release                                        |             116.3 MB |              116.3 MB |               163 s / 45 s | UnityPlayer.dylib 61.8 MB, libmonobdwgc 6.7 MB, mscorlib.dll 4.4 MB               |

Packed assets were 8.1 MB in all three (Textures 6.4 MB, of which the built-in splash logo 2.67 MB;
Shaders 1.1 MB; the Editor.log block agreed: Textures 6.4, Shaders 1.0, Levels 1.4). BuildReport
`totalSize` and the log's "Complete build size" (1,945.6 MB) count IL2CPP's
`<Name>_BackUpThisFolder_ButDontShipItWithYourGame` folder (1.7 GB of symbols and generated C++):
judge size on `output_on_disk_mb`, never ship that folder (nor `_BurstDebugInformation_DoNotShip`).
A development Mono app was 319.6 MB (development UnityPlayer.dylib alone 248 MB): never size a
development build. Settings restored after each build.

## P8. Mesh LOD generation and read-back

```python
g = ut_run.run_method(P, "AgentKit.Performance.PerfLod.GenerateMeshLods",
                      {"models": ["Assets/Art/Rock.fbx"], "meshes": ["Assets/Gen/Dense.asset"], "limit": -1})
g["result"]["meshes"]        # lod_count, triangles_per_lod, weak_simplification flag
before = ut_perf.profile(P, scene, label="lod_before"); after = ut_perf.profile(P, scene, label="lod_after")
ut_perf.compare(before["csv"], after["csv"], columns=["triangles", "cpu_frame_ms"])
```

Unity calls: `ModelImporter.generateMeshLods`/`maximumMeshLod` + `SaveAndReimport()`;
`MeshLodUtility.GenerateMeshLods(mesh, limit)` for mesh assets; `Mesh.lodCount`,
`Mesh.GetLod(submesh, lod).indexCount`; `QualitySettings.meshLodThreshold`.

Test: step `lod`. Result: pass. A procedural 18,432-triangle sphere asset:
`MeshLodUtility.GenerateMeshLods(mesh, -1)` produced 9 levels, 18,432 / 9,211 / 4,798 / 2,494 /
1,279 / 640 / 319 / 202 / 150 triangles (about half per level, down to the floor). 400 copies 250 m
from the camera, Editor Play mode: Triangles Count 14.75 M to 0.26 M per frame (-98.3%), draw calls
unchanged (807), CPU time within noise: Mesh LOD cuts geometry and GPU vertex/pixel work, not draw
calls or CPU culling. Threshold tuning still needs captures along a camera path.

## P9. Static lint of hot paths

```python
res = ut_perf.lint_scripts(P + "/Assets")            # excludes Editor/, Tests/, AgentKit
[f for f in res["findings"] if f["severity"] == "error"]
```

Rules inside `Update`/`LateUpdate`/`FixedUpdate`/`OnGUI`/`On*Stay`: new collections, LINQ, string
building, array-valued APIs, scene-wide Find, GetComponent, Debug.Log, allocating physics queries,
Instantiate/Destroy, `Renderer.material`, string-keyed Animator setters, SendMessage, empty bodies.
Anywhere: MaterialPropertyBlock, `enableInstancing = true`, runtime assembly scans, synchronous
loads, `GC.Collect`/`UnloadUnusedAssets`, `new WaitForSeconds`, `AddComponent<MeshCollider>` (v0.2:
runtime cooking). Triage by call frequency (Code Monkey on Project Auditor); for the package-grade
static pass, run Project Auditor (P16).

Test: step `lint` + `test_offline.py`. Result: pass; the fixture flagged `perf.alloc.collection`,
`perf.alloc.linq`, `perf.alloc.string`, `perf.mpb` (3 errors, 5 warnings); a clean manager loop
gives no error or warning; commented-out code ignored; line numbers point at the call.

## P10. Loading hitch: one frame, spread, or InstantiateAsync

```python
r = ut_perf.run_player(app, "/abs/out/hitch_sync.csv", frames=150, warmup=30,
                       extra=["-burst", "sync", "-burstAt", "60", "-burstCount", "3000"])
fr = ut_stat.read_frame_csv(r["csv"])["frame_ms"]; med = ut_stat.stats(fr)["p50"]
max(fr), sum(max(0, x - med) for x in fr)       # peak and total excess: spreading lowers the first, not the second
```

Attribution: wrap the spawn or streaming code in a ProfilerMarker and a counter and read them per
frame (P13): the burst frame then names its system instead of being inferred from timing.

Test: step `hitch`. Result: pass (3 interleaved rounds after one discarded launch, medians; the
empty scene runs at 0.5 ms, the 3,000 spawned spheres then render at about 4.4 ms). Instantiate
3,000 prefabs (sphere + SphereCollider) in one frame: that frame 22.3 ms, excess over steady 25 ms.
Spread 300 per frame: peak 7.5 ms, excess 17 ms spread over 10 frames (same order of total work,
lower peak). `Object.InstantiateAsync`: the call frame 2.9 ms, but the integration landed 5 to 29
frames later as a 17 to 83 ms frame: the hitch moved, it did not vanish, and the objects appeared
late. The first launch after a fresh build paid 212 ms for the same burst (cold file and Metal
caches): discard the first launch of every new build. Rerun with PerfProbe v0.2 and the instrumented
fixture: sync burst frame 22.5 ms median; spread peak 11.4 ms; `InstantiateAsync` call frame 3.8 ms
with the late integration spike 37 to 118 ms, 4 to 65 frames later: same conclusions.

## P11. Memory: runtime counters and a snapshot from the player

```python
r = ut_perf.run_player(app, "/abs/out/mem.csv", frames=120, warmup=60, scene="Stage4", snapshot="/abs/out/stage4.snap")
r["probe"]["snapshot"]                                  # {"file", "ok"}; open in Window > Analysis > Memory Profiler
c = r["summary"]["columns"]; c["system_used_mb"], c["gc_reserved_mb"], c["gc_used_mb"]
```

Unity call:
`Unity.Profiling.Memory.MemoryProfiler.TakeSnapshot(path, callback, CaptureFlags.ManagedObjects | NativeObjects | NativeAllocations)`
in the player (core API; reading `.snap` files needs the Memory Profiler package window).

Budget verdict, VRAM and render textures: P14.

Test: step `memory`. Result: pass; 30.2 MB `.snap` written by the player (open it in the Memory
Profiler window for resident vs allocated, untracked, duplicates; not analyzed headless). Player
counters, materials scene with a 1080p offscreen target: System Used Memory 888 MB, Total Used
Memory (Unity-tracked) 208 MB, GC reserved 4.5 MB, used 3.4 MB. The same scene in Editor Play mode:
System Used Memory 2,050 MB (2.3x): size memory in the player.

## P12. GPU Resident Drawer coverage: which renderers fell out, and why

```python
au = ut_run.run_method(P, "AgentKit.Performance.PerfRendering.Audit", {"scene": S, "platforms": ["StandaloneOSX", "StandaloneWindows64"]})
el = au["result"]["scene"]["grd_eligibility"]      # eligible, ineligible, ineligible_by_reason, samples
fd = ut_perf.frame_debug(P, S, warmup=30, details=8)   # Frame Debugger through its internal utility (Play mode)
fd["result"]["hybrid_batch_group_draws"], fd["result"]["objects_behind_other_draws"], fd["result"]["runtime_property_blocks"]
```

Static check (`PerfRendering.GrdEligibility`, 6.3 Manual "Make a GameObject compatible with the GPU
Resident Drawer"): not a Mesh Renderer, edit-time MaterialPropertyBlock, Light Probes = Use Proxy
Volume, realtime GI (Contribute GI with Enlighten realtime on), a shader without the
`DOTS_INSTANCING_ON` keyword, an `OnRenderObject`/`OnWillRenderObject` component, under Disallow GPU
Driven Rendering. A MaterialPropertyBlock set by a script in `Start` is invisible to it: the runtime
check counts `Renderer.HasPropertyBlock()` in Play mode. The engine makes the final call (the
renderer filter is native in core RP 17.3); the documented proof is the Frame Debugger: GRD draws
are named "Hybrid Batch Group", every other draw of a scene object is a renderer that fell out.

Test: step `grd`. Fixture `PerfGrdMix`: 400 eligible spheres plus five groups of 10 that fall out
for one reason each (runtime MPB, SkinnedMeshRenderer, LPPV, `Unlit/Color` shader, `OnRenderObject`
component). Results, run in Unity 6000.3.21f1 on 2026-09-24:

- Static audit: pass. 410 eligible, 40 ineligible: `not_mesh_renderer:SkinnedMeshRenderer` 10,
  `lppv` 10, `shader_without_dots_instancing:Unlit/Color` 10, `render_callback:StressRenderCallback`
  10; the 10 runtime-MPB spheres count as eligible because their MPB is set in `Start` (as
  designed). Finding `perf.grd_fallout` raised with GRD on. URP Lit carries `DOTS_INSTANCING_ON`.
- Frame Debugger: **not runnable in a batch editor** **[observed]**:
  `FrameDebuggerUtility.locallySupported` is false and no event is captured in 300 ticks, with or
  without explicit `Camera.Render()` (`SetEnabled(Boolean enabled, Int32 remotePlayerGUID)`, target
  -1). The job therefore returns the runtime eligibility; the event list with "Hybrid Batch Group"
  needs a GUI editor (the window, gui-paths.md, or this job through ut_live into an open editor)
  [not run here: it would open a window on the user's screen].
- Runtime eligibility (Play mode, after `Start`): pass. Materials scene 3,000 eligible, 0 out; mixed
  scene 400 eligible, 50 out with all five reasons including `property_block` 10; the MPB-tinted
  scene 3,000 out, all `property_block`, which matches the player: GRD on left that scene at 5,946
  draw calls (P2).

## P13. Spike attribution with your own markers; physics catch-up; MeshCollider cooking; logging cost

```csharp
// in the streaming / spawn system, kept in the shipped code (Begin/End compile out of release; Auto() returns null there)
static readonly ProfilerMarker k_Spawn = new ProfilerMarker(ProfilerCategory.Scripts, "Spawn.Burst");   // no '/' in names
static readonly ProfilerCounterValue<int> k_Spawned = new ProfilerCounterValue<int>(ProfilerCategory.Scripts,
    "Spawned Objects", ProfilerMarkerDataUnit.Count, ProfilerCounterOptions.FlushOnEndOfFrame);   // com.unity.profiling.core 1.0.3
using (k_Spawn.Auto()) { /* spawn or stream */ }  k_Spawned.Value = count;
```

```python
r = ut_perf.run_player(app, "/abs/out/burst.csv", frames=120, warmup=30, markers=["Spawn.Burst", "Spawned Objects"])
a = ut_perf.attribute_spikes(r["csv"])            # spike frames on main_thread_ms, each with what explains it
p = ut_perf.run_player(app, "/abs/out/spike.csv", frames=120, warmup=30, spike_at=60, spike_ms=100)
ut_perf.physics_catchup(p["csv"], spike_at=60)    # Physics.Simulate steps per frame
```

PerfProbe v0.2 columns: `mk_<name>_ms` and `mk_<name>_calls` for time markers, `mk_<name>` for
counters, `physics_steps` (`Physics.Simulate` count), `mesh_cook_ms`
(`Physics.BakePhysXCollisionMeshData`), `sync_read_object_ms` (`Loading.ReadObject`). Alignment
**[observed]**: `unscaledDeltaTime` read at frame i+1 is the duration of frame i, so v0.2 shifts
`frame_ms` one row to line up with the recorder rows; the FrameTimingManager-backed columns
(`cpu_*_frame_ms`, `gpu_frame_ms`) lag a few frames (the 57 ms burst frame appeared 4 rows later in
`cpu_main_frame_ms`): attribute on `main_thread_ms`.

Test: step `hitch2` (Burst.app rebuilt with PerfProbe v0.2 and the instrumented `StressBurst`; one
discarded launch). Results, run in Unity 6000.3.21f1 on 2026-09-24:

- Attribution: pass. The burst frame (3,000 Instantiate) was 57.1 ms on the main thread:
  `Spawn.Burst` 26.9 ms (1 call), 4 `Shader.CreateGPUProgram` (first use of the sphere material: a
  warm-up gap), `GC.Collect` 0.37 ms, `Spawned Objects` 0 to 3,000 on that row; the next frame (12.4
  ms) ran 3 physics steps of catch-up; one early 10 ms frame stayed unexplained (reported, not
  hidden). That first run exposed the row alignment: the 57.1 ms showed on the next row of
  `frame_ms`, so v0.2 now shifts it and `attribute_spikes` reads `main_thread_ms`. Rerun with the
  aligned probe (second build): burst frame 22.8 ms on the main thread, `Spawn.Burst` 13.0 ms, 4
  shader compiles, `GC.Collect` 0.49 ms, next frame one physics step, unexplained 0.
- Physics catch-up: pass. Empty scene at about 0.5 ms per frame (a physics step every 40 frames); a
  forced 100 ms stall at frame 60 made frame 61 run 5 `Physics.Simulate` steps (102 ms / 20 ms fixed
  step), then back to 0 or 1; Maximum Allowed Timestep 0.333 s allows up to 17 per frame. With real
  physics cost per step, that is the spiral the console e-book describes (p. 110-111).
- MeshCollider cooking: pass, 3 interleaved rounds, twice. 40 objects, each with its own 8,000 to
  9,800-triangle mesh and a MeshCollider added at the burst frame:
  `Physics.BakePhysXCollisionMeshData` 68 to 80 ms in that frame (median worst frame 87.1 ms);
  second run 54 to 72 ms (worst frame 63.5 ms); third run (EntityId overload) 48 to 62 ms (worst
  frame 60.2 ms, prebaked 4.9 ms). The same meshes baked with `Physics.BakeMesh(meshIds[i], false)`
  over a `NativeArray<EntityId>` (`mesh.GetEntityId()`; in 6.3 the `int` overload is obsolete,
  CS0618 **[observed]**) in an `IJobParallelFor` during `Start`: 0 ms of cooking at the burst, worst
  frame 5.4 to 6.4 ms: the cost moved to loading, on worker threads.
- Logging cost: pass, 3 rounds, twice, development Mono player. 200 `Debug.Log` per frame: median
  frame 7.09 / 7.20 ms with Log stack traces ScriptOnly (the template default) vs 1.30 / 1.11 ms
  with None vs 0.52 / 0.58 ms without logging: 33 us per call vs 2.6 to 3.9 us (third run 31.5 vs
  2.6 us). Release fix: `[Conditional("ENABLE_LOG")]` wrapper, stack traces None (console e-book p.
  41-42).

## P14. Memory and VRAM budget, render textures, triangle density

```python
r = ut_perf.run_player(app, "/abs/out/mem.csv", frames=120, warmup=30, scene="Stage4", shot="/abs/out/mem.png")
ut_perf.memory_budget(r, fraction=0.7)          # System Used Memory p95 vs RAM x fraction; Gfx Used Memory vs VRAM; top RenderTextures
ut_perf.density_check(r["csv"], 1920, 1080)     # triangles per rendered pixel (gate 1.0 [added])
```

The probe JSON carries the device (`gpu`, `vram_mb`, `ram_mb`, `battery`) and a render texture table
read once at the end (`Resources.FindObjectsOfTypeAll<RenderTexture>()` with
`Profiler.GetRuntimeMemorySizeLong`), the headless form of the Unity 6 Memory Profiler graphics
breakdown (Hall _cV1B2hqXGI [00:34:02]). Fraction by device class: 0.5 on 2 GB phones (Hall
[00:28:34]), 0.7 general (Uuzd39AjFWQ [00:03:46]), 0.8 dedicated devices (e-book p. 41). On Apple
Silicon, RAM and VRAM are one unified pool (`vram_mb` reports the GPU's working-set limit); on a
discrete laptop GPU, compare Gfx Used Memory with VRAM: overflow pages over the bus and shows as
stutter.

Test: steps `shaders` (materials scene, new probe) and `density` (Mesh LOD CSVs from P8). Result:
pass. Device read from the player: Apple M5 Max, 49,152 MB RAM, `vram_mb` 38,338 (unified memory),
charging. System Used Memory p95 879 to 885 MB against a 34,406 MB budget (0.7); Gfx Used Memory 136
MB; 15 RenderTextures, 104.8 MB: two 1080p D32S8 depth targets (camera depth attachment and depth
texture) 19.8 MB each, the probe's own target 17.8 MB, the 2048 shadow map 8 MB, SSAO targets. At 4K
the depth targets became 79.1 MB each (gputrace run). Density: Mesh LOD scene 14.75 M triangles =
7.11 per pixel before (fail), 0.26 M = 0.12 after (pass); materials scene 4.56 M = 2.2 per pixel
counting every pass, 1.1 with `passes=2` (3,000 visible spheres of 768 triangles each, main plus
shadow pass): the fixture is dense on purpose, and the GPU trace (P18) shows its main pass does not
scale with pixels.

## P15. Shader variants: log, collect, count, strip

```python
ut_run.run_method(P, "AgentKit.Performance.PerfShaders.SetLogShaderCompilation", {"on": True})     # development builds only
b = ut_perf.build_player(P, "Builds/macOS/Game.app", scenes, development=True, env={"AGENTKIT_SHADER_REPORT": "/abs/out/variants.json"})
r = ut_perf.run_player(app, "/abs/out/play.csv", scene=..., shot="/abs/out/full.png")       # play everything that matters
ut_run.run_method(P, "AgentKit.Performance.PerfShaders.SvcFromLog", {"log": r["log"], "out": "Assets/Perf/Used.shadervariants"})
b2 = ut_perf.build_player(P, "Builds/macOS/GameStripped.app", scenes, development=True,
                          env={"AGENTKIT_SHADER_REPORT": "/abs/out/stripped.json", "AGENTKIT_SHADER_STRIP_SVC": "Assets/Perf/Used.shadervariants"})
ut_perf.read_variant_report("/abs/out/stripped.json")      # variants in / kept per shader; then run it and compare images
```

Borromeo's chain (CmD8MVGkDxQ [00:12:20]-[00:12:54], [00:46:49]-[00:48:28]): the log of compiled
variants from a thorough playthrough is the warm-up list on APIs without PSOs
(`ShaderVariantCollection.WarmUp()` on DX11, GLES) and the allowlist for `IPreprocessShaders`
stripping everywhere, which also cuts the RAM a loaded shader holds for its variants (Player
Settings > Shader Variant Loading caps that RAM, too low re-reads from disk).
`PerfShaderVariantReport` is inert unless the build process has one of the two variables; it strips
only SRP passes of shaders that appear in the SVC and keeps shadow, depth and meta passes. The
playthrough must cover every quality level, platform keyword set and effect the build ships, or
stripping removes a variant a player needs (magenta or missing objects): always run the stripped
build and compare images.

Test: step `shaders`. Result: pass on the rerun (the first run failed: 6000.3.21f1 logs
`Uploaded shader variant to the GPU driver: Universal Render Pipeline/Lit (instance 0x15A), pass: ShadowCaster, stage: vertex, keywords <no keywords>, time: 0.75 ms`,
and the "(instance ...)" suffix broke `Shader.Find`; the parser strips it now **[observed]**). The
development build of the materials scene compiled 1,376 variants (UberPost 433, FinalPost 98,
UIRDefault 80, URP Lit 76, CoreBlit 56). The playthrough logged 20 uploads (10 shader passes, 4
shaders; the log also gives each upload's time: 56 ms for the first Lit ShadowCaster vertex upload
after a fresh build, 0.75 ms on a later launch); `SvcFromLog` added 8 variants (4 SSAO/CoreBlit blur
passes did not map to a PassType and stayed out). Stripped build: 1,326 variants kept (-50: only SRP
passes of the 4 logged shaders are judged; UberPost was never logged, so it stayed whole), 315.5 to
315.2 MB, same draw calls, 0 runtime compiles, and the image matched the unstripped build (PSNR 51.3
dB, 0.016% of pixels moved by noise). A real project gains more once its playthrough covers the
post-processing and quality levels it ships; the order does not change: log, collect, strip, run,
compare.

## P16. Static baseline: Project Auditor, audio import, duplicated bundle dependencies

```python
pa = ut_perf.project_auditor(P, categories=["Code", "ProjectSetting"], out="/abs/out/audit.projectauditor")
tri = ut_perf.triage_auditor(pa["result"], P)          # hot: Major/Critical code issues on per-frame lines; package issues counted apart
ut_run.run_method(P, "AgentKit.Performance.PerfAudit.AudioImport", {"folder": "Assets", "spatial": ["Assets/Audio/Engine.wav"]})
ut_perf.bundle_duplicates(P)                            # AssetBundle names, or groups=ut_perf.addressables_groups(P)
```

Project Auditor 1.0.2 is a package in 6.3 (preinstalled, add
`"com.unity.project-auditor": "1.0.2"`), built in from 6.4; `PerfAudit.ProjectAuditor` calls it by
reflection (`new ProjectAuditor().Audit(AnalysisParams)`, `Report.Save`, `GetAllIssues`) so the file
compiles without it. `BundleDuplicates` walks direct dependencies from each group's explicit assets
and stops at assets explicit in another group (a bundle reference): anything reached from two groups
is copied into both. It also lists player scenes that ship a bundled asset and bundled assets under
Resources/. `addressables_groups` reads the Addressables group YAML offline (no package needed).

Test: step `audit`. Results, run in Unity 6000.3.21f1 on 2026-09-24:

- Project Auditor: pass, 69.9 s headless (52.8 s on the rerun) (Code and ProjectSetting): 17,901
  code issues (package code included) and 17 settings issues; by severity 59 Major, 5,329 Moderate,
  12,530 Info. Triage kept 7 Major issues on per-frame lines of the fixture (LINQ `Where`/`Count`,
  boxing, `Object.name` in `StressSpinner.Update`; `AddComponent` in the burst branch of
  `StressBurst.Update`) and set 21 Major issues aside as cold (for example PerfProbe's end-of-run
  boxing, which runs once): Code Monkey's frequency rule, mechanical.
- Audio: pass. Default import of three clips (43 KB, 86 KB, 2,067 KB stereo): all Decompress On
  Load, Load In Background off; findings `perf.audio_long_not_streamed` (the 2 MB loop),
  `perf.audio_decompress_large`, `perf.audio_foreground_load`, `perf.audio_spatial_stereo` (declared
  3D and stereo).
- Bundles: pass (second run; the first failed on the test itself: a bundle output folder named like
  a bundle, "shared", conflicts with the manifest bundle name, **[observed]**). Two area prefabs in
  two AssetBundles sharing one non-bundled 1024x1024 texture and material: the audit found 3
  duplicates, `SharedAlbedo.png`, `SharedMat.mat` and the URP `Lit.shader` each pulled into both
  bundles; built bundles 951.6 KB each (1,944.5 KB total with core RP's own 41.3 KB bundle). With
  texture and material in their own "shared" bundle: 0 duplicates, areaa and areab 3.2 KB each,
  shared 954 KB, total 1,001.7 KB (-48%). The project ships one package bundle name
  (`unifiedraytracing`, core RP): never clear bundle names project-wide.

## P17. Performance Testing gate per commit

```csharp
// Tests/PerfBench (asmdef references Unity.PerformanceTesting; package com.unity.test-framework.performance 3.5.0)
[Test, Performance] public void StructOfArrays_3000() {
    Measure.Method(() => { for (int i = 0; i < N; i++) yaw[i] += speed * 0.016f; })
        .WarmupCount(5).MeasurementCount(20).IterationsPerMeasurement(10)
        .SampleGroup(new SampleGroup("tick", SampleUnit.Microsecond)).Run(); }
```

```python
t = ut_run.run_tests(P, "EditMode", filter="PerfBench")    # never -quit with -runTests
# sample groups: lines "##performancetestresult2:{json}" in the NUnit XML output (Median, Min, Max, Samples)
```

Per-commit tracking with per-system budgets (Hall _cV1B2hqXGI [00:39:27]; profiling e-book p. 88).
Editor numbers trend and catch regressions; budget verdicts still come from the same tests run in a
player on the reference hardware (`-runTests -testPlatform <player target>`) or from PerfProbe. The
package is preinstalled with 6.3 (add by name) and becomes core in 6.6; `Measure.Frames()` and
`Measure.ProfilerMarkers(...)` cover PlayMode frames and your markers.

Test: step `perftest`. Result: pass, 2/2 in 18 s: 3,000 per-object class ticks 52.7 us per sample of
10 iterations (min 52.5, max 54.8) vs the same work as a flat array 27.7 us (27.6 to 27.9), 20
samples each; the sample groups parsed from the XML.

## P18. GPU time without a window: Metal System Trace of the player

```python
t = ut_perf.metal_trace(app, "/abs/out/xctrace/stage.trace", seconds=12, scene="Stage4", frames=200, warmup=30,
                        extra=["-perfOffscreen", "1920x1080"])
g = ut_perf.metal_gpu_frames(t["trace"])       # gpu_busy_ms (union of Vertex/Fragment/Compute per frame), passes_ms_per_frame
```

When the bound is the GPU, timings come from the platform's GPU profiler, never from the Frame
Debugger (Hall [frame 00:09:18]; console e-book p. 76). On this Mac,
`xcrun xctrace record --template 'Metal System Trace'` runs headless against a batch-mode player and
`xctrace export` gives the `metal-gpu-intervals` table: GPU busy per frame and GPU time per labeled
command buffer (URP pass names such as `RenderLoop.DrawSRPBatcher`, `SSAO`,
`Shadows.DrawSRPBatcher`), which is the Rendering Debugger's per-pass table without the window. The
trace holds every GPU client on the machine (WindowServer, other editors): `metal_gpu_frames` keeps
the player's process. Windows: PIX, Nsight or RenderDoc (GUI). Pixel-bound test with real GPU time:
the same scene at 1080p and 4K offscreen.

Test: step `gputrace` (and a first manual trace of the materials scene). Result: pass, run in Unity
6000.3.21f1 players on 2026-09-24 (Xcode 26.6 xctrace, no window). Materials scene, 3,000 spheres,
development player without GRD: GPU busy p50 2.50 ms at 1080p against a CPU main thread of 5.8 ms:
CPU bound, as the wait markers say. Per pass at 1080p: `RenderLoop.DrawSRPBatcher` 2.30 ms, `SSAO`
0.70, `Shadows.DrawSRPBatcher` 0.14, `CopyColor` 0.06, `BlitFinalToBackBuffer` 0.06. Same scene at
4K offscreen (4x pixels, depth targets 79 MB each): GPU busy 3.00 ms (1.2x): the opaque pass stayed
at 2.30 ms (geometry-bound: 4.56 M triangles), SSAO scaled 1.9x. Verdict of the pixel-bound test:
not pixel bound, so resolution levers would not help here; geometry (LOD) and the CPU would. An
earlier pass gave 2.23 vs 2.27 ms with the same per-pass pattern. A first attempt of the rerun
reused the previous trace path: `xctrace` refuses an existing output, so `metal_trace` now moves old
traces aside.
