---
name: scenario-unity-performance
description: "Use when a Unity 6.3 game is slow or stutters: low fps, frame spikes, hitches when entering areas or on first effects, GC spikes, too many draw calls or SetPass calls, CPU vs GPU bound questions, Profiler, Profile Analyzer, Memory Profiler, Frame Debugger or Project Auditor work, GPU Resident Drawer or SRP Batcher setup, LOD and Mesh LOD, shader warm-up and variants, memory or VRAM budgets, IL2CPP and build size, or proving a fix with numbers from a player."
license: MIT
---

# Unity performance (performance engineer)

Expert performance work is a measurement discipline: a budget in milliseconds, the bounding thread
named before any change, the biggest measured cost fixed first, structure before tuning, and every
fix proven with before/after numbers from a development player. An agent does all of it headless:
`AgentProfile` in Editor Play mode to iterate, `PerfProbe` in a batch-mode player for verdicts,
`PerfCapture` to attribute costs from a Profiler capture, `metal_trace` for GPU time, `PerfBuild`
for size. Target: Unity 6000.3.21f1, URP 17.3, macOS Apple Silicon. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps, `ut_*` toolkit).

## Stance (the expert delta)

1. **Name the bound before touching anything.** "If you speed up the GPU when your profile looks
   like this it's not going to run any faster" (Peter Hall, Unity Profiler team, _cV1B2hqXGI
   [00:05:50]). Observed: removing 1.36 MB of garbage per frame did not move a frame bound by 5,946
   SetPass calls. GPU bound needs GPU timing; the Frame Debugger has none (Hall [frame 00:09:18]).
2. **Players decide, the Editor iterates.** The authority is a development build on the lowest
   target device (profiling e-book p. 18). GRD: 4.4x in a 2M-instance stress test, 2.07x in the
   Editor but 1.45x standalone in a real game (Oc6T4hh5gaI [frame 00:12:41]); here the Editor swung
   1.5x to 3.0x, players 1.9x to 2.8x on a stress fixture. Forecast about 1.5x.
3. **GC.Alloc sample time is not the cost.** Unity records only timestamp and size (e-book p. 27):
   54,021 allocations shown as 1.01 ms caused 19.97 ms of `GC.Collect` (Hall [frame 00:21:52]).
   Observed: 27,000 allocations per frame displayed 0.8 to 1.1 ms; the allocating code cost 3.8 to
   5.4 ms. Count bytes and calls, measure collections, target 0 B per gameplay frame, and keep the
   probe itself allocation-free (git-amend ham_w48aRJ4 [00:11:30]).
4. **6.3 URP draw calls = SRP Batcher + GPU Resident Drawer; the 2024 advice is Built-in-only.**
   Material "Enable GPU Instancing" off, static batching off, no MaterialPropertyBlock (6.3 Manual
   table). GRD silently does nothing unless BatchRendererGroup Variants = Keep All and every
   renderer of the URP asset is Forward+ or Deferred+ (URP 17.3 source, observed). Then prove
   coverage: GRD draws are named "Hybrid Batch Group" in the Frame Debugger (GUI editor only), each
   other draw is a renderer that fell out (MPB, LPPV, realtime GI, non-DOTS shader, skinned; 6.3
   Manual); headless, check eligibility per renderer after `Start`.
5. **Data layout first; spreading work over frames hides cost.** 200,000 objects: MonoBehaviour
   Update 27 ms to 0.13 ms through manager, structs, Burst, SoA; "it's just spreading the work
   around" (Jason Booth, NAVbI1HIzCE [00:06:38]-[00:18:17]).
6. **Attribute every hitch before fixing it, with markers kept in code.** Streaming and spawn
   systems carry their own ProfilerMarkers and counters; Deep Profile only finds what fills a gap
   (Hall [00:18:39]-[00:19:12]). Compiles show as `Shader.CreateGPUProgram` (warm a traced
   GraphicsStateCollection during loading, Nicolas Borromeo CmD8MVGkDxQ [00:11:14]-[00:14:35]); here
   warm-up removed all 18 first-use compiles, yet the first frame stayed about 250 ms on `Mono.JIT`.
7. **Resident memory kills, untracked usually does not.** 0.75 GB untracked was 140 MB resident
   (Borromeo [00:32:22]); Editor memory is about 5x the player's (Uuzd39AjFWQ [00:10:03]). On a
   laptop, paging and VRAM overflow are stutter causes of their own.
8. **Counts are exact, times drift [added, observed].** On a shared machine (load average 50 to 210
   here), interleave A/B runs and require a consistent sign.

## Establish first

Target platforms and min-spec device per tier; frame budget (16.67 ms desktop, mobile x 0.65);
resolution and quality tier; what may change (code only, or art, design, feel); a repeatable
benchmark, time-based when judging streaming (a fixed step per frame reaches boundaries sooner after
a speed-up) [added]; scripting backend and build type; the machine actually measured (discrete GPU,
on power; probe JSON `device`) [added]. Defaults: PC-tier URP asset, 60 fps, 1920x1080, development
Mono player for iteration, IL2CPP release for size.

## Workflow

1. **Budget and benchmark.** GATE: a baseline CSV.
2. **Iterate in the Editor.** `ut_perf.profile` (render=False isolates scripts), `ab_profile` for
   time deltas. GATE: numbers labeled "Editor, iteration".
3. **Static baseline.** `PerfRendering.Audit` (batching, GRD eligibility per renderer, graphics jobs
   per platform, Build Profile, stack traces, upload buffer, culling), `lint_scripts`, Project
   Auditor (`project_auditor`, Major first, `triage_auditor` keeps per-frame lines),
   `PerfAudit.AudioImport`, `bundle_duplicates`. GATE: findings triaged by call frequency.
4. **Measure the player.** `build_player(development=True)`,
   `run_player(..., shot=png, markers=[...])`. GATE: `draw_calls` > 0, PNG opened, `budget_check`.
5. **Classify the bound.** Capture wait markers (`capture_player`, `analyze_capture`), longest vs
   median frame. GPU: `metal_trace` + `metal_gpu_frames` (GPU busy and per-pass ms; Rendering
   Debugger Display Stats in the GUI), then the pixel-bound test (4K vs 1080p, render scale). GATE:
   bound named with a number.
6. **Attribute.** `attribute_spikes` (your markers, GC.Collect, compiles, MeshCollider cooking,
   synchronous reads, physics steps), `physics_catchup`, `memory_budget`, `density_check`,
   allocations per block (`AllocScope`, `Is.Not.AllocatingGCMemory()`), GRD coverage
   (`PerfFrameDebug.Capture` or the window). GATE: top three costs named, no unexplained spike.
7. **Fix one thing at a time, structure first.** Scripts: allocations, managers, then Burst. Render
   CPU: Material Variants, SRP Batcher shaders, `EnableGpuResidentDrawer`, one camera, Split
   graphics jobs on DX12/Vulkan. GPU: dynamic resolution or STP, depth priming and less
   transparency, LOD where triangles are pixel-sized, post-processing on a fixed slice; shadows with
   scenario-unity-rendering-lighting. Hitches: async loads, prewarmed pools, PSO warm-up in loading,
   baked MeshColliders, audio load types, no duplicated bundle dependencies. GATE: `compare_line`
   shows the target down, nothing else up, image parity.
8. **Ship config.** IL2CPP release, stripping and code generation chosen, variants stripped against
   the used set (P15), flags through `BuildPlayerOptions` (platform profiles share settings). GATE:
   build succeeded, size explained, smoke run clean.
9. **Guard.** Allocation tests and Performance Testing sample groups per commit, lint on changed
   scripts. GATE: tests pass.

## Numbers

| Value                                                                          | Relative to                                                                      | Source                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------- |
| 16.67 / 33.33 ms; x 0.65 mobile                                                | frame budget at 60 / 30 fps; thermal headroom                                    | profiling e-book p. 9, 36    |
| 0 B                                                                            | managed allocation per gameplay frame                                            | 6.3 Manual; e-book p. 66     |
| up to about 1 ms                                                               | per-frame cost of incremental GC write barriers                                  | e-book p. 69                 |
| 4.4x / 2.07x / 1.45x                                                           | GRD gain: 2M-instance stress / game in Editor / same game standalone             | Oc6T4hh5gaI [frame 00:12:41] |
| 217 / 199 / 176 / 161 fps                                                      | DX12 Split / Legacy / plain DX12 / Native graphics jobs                          | Oc6T4hh5gaI [frame 00:03:52] |
| 256 vertices                                                                   | below it GPU instancing is inefficient: combine instead                          | 6.3 Manual                   |
| about 250 ms                                                                   | one PSO creation stall                                                           | Oc6T4hh5gaI [frame 00:04:48] |
| 4 pixel invocations                                                            | per one-pixel triangle (2x2 quads); gate 1 triangle per rendered pixel [added]   | CmD8MVGkDxQ [00:27:26]       |
| 48.55 of 80 ms                                                                 | per-frame Debug.Log in a development frame                                       | xjsqv8nj0cw [00:10:23]       |
| < 200 / > 400 KB                                                               | audio: Decompress On Load / Streaming                                            | console e-book p. 104-105    |
| up to 1 ms                                                                     | CPU per extra active camera on mobile                                            | console e-book p. 89         |
| up to 10 s                                                                     | startup added by Autoconnect Profiler                                            | e-book p. 47                 |
| 50% / 70% / 80% of RAM                                                         | memory budget: 2 GB phones / general / dedicated devices                         | Hall; Unity tutorial; e-book |
| 5,946 to 33 SetPass; 58-60 to 5.2-6.2 ms                                       | 3,000 spheres, MPB tint to 8 Material Variants, dev player                       | observed                     |
| 18 to 0                                                                        | first-use `Shader.CreateGPUProgram` after warming 10 PSOs (3.6 ms at load)       | observed                     |
| 177.9 / 110.5 / 116.3 MB                                                       | macOS app: IL2CPP Minimal + speed / IL2CPP High + size / Mono                    | observed                     |
| 14.75 M to 0.26 M triangles (7.1 to 0.12 per pixel)                            | 400 dense meshes after Mesh LOD, draw calls unchanged                            | observed                     |
| 57.1 ms frame = `Spawn.Burst` 26.9 ms + 4 compiles; next frame 3 physics steps | burst of 3,000 Instantiate read through its own marker                           | observed                     |
| 48-80 ms vs 0 ms                                                               | MeshCollider cooking at spawn vs `Physics.BakeMesh` in a job at load (40 meshes) | observed                     |
| 33 us vs 2.6-3.9 us                                                            | per `Debug.Log`, stack traces ScriptOnly vs None (dev player)                    | observed                     |
| 2.5 vs 5.8 ms; 1.2x at 4x pixels                                               | GPU busy vs CPU main (Metal System Trace); 4K vs 1080p: not pixel bound          | observed                     |
| 1,944 to 1,002 KB                                                              | two bundles sharing a texture: implicit copies vs a shared bundle                | observed                     |

## Quality gates

- **Measurable:** player `budget_check` pass (p95 under budget, no gameplay hitch); `gc_check` pass
  in the player; `attribute_spikes` unexplained = 0; `physics_steps` at most 1 outside a forced
  spike; `memory_budget` pass; `density_check` pass; `PerfRendering.Audit` counts.error == 0 and
  every GRD fallout explained; 0 `Shader.CreateGPUProgram` after loading; no new Major Project
  Auditor issue in your code; IL2CPP build within budget.
- **Visual:** the player's last frame (`-perfShot`) and Editor captures from the same bookmarks
  before and after, `ut_review.compare`, contact sheet opened; no blank, uniform or magenta frame.

## Common mistakes

| Mistake                                                | What it looks like                                      | Fix                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Optimizing the side that is not bound                  | fewer allocations, same frame time                      | classify first (wait markers, GPU busy, SetPass)                      |
| Trusting Editor numbers or one run                     | "3x faster" gone in the player                          | player CSV; `ab_profile` with consistent sign                         |
| Benchmarking a batch-mode player that renders nothing  | 0.3 ms frames, 0 draw calls                             | PerfProbe submit + `-perfShot`                                        |
| GRD on, nothing changes                                | draw calls unchanged                                    | Keep All, Forward+/Deferred+, static batching off, fallouts fixed     |
| MaterialPropertyBlock for per-object color             | SetPass = draw calls; `StdRender.ApplyShader` dominates | Material Variants; `unity_RendererUserValue` with GRD                 |
| Reading GC.Alloc ms as the cost                        | "allocations cost 0.5 ms"                               | count and bytes, `GC.Collect` ms, A/B                                 |
| A monitor that formats strings each frame              | GC column never 0                                       | preallocated buffers, write once (PerfProbe)                          |
| Closure in a rarely taken branch                       | allocations with the feature off                        | move captured locals into the branch                                  |
| Deep Profile to find a spike                           | inflated small functions                                | markers and counters kept in code, `-perfMarkers`                     |
| GPU tuned from the Frame Debugger                      | guessed timings                                         | `metal_trace` (PIX, Nsight on Windows)                                |
| Fixed render scale on a laptop                         | fine cold, hitches when hot or loaded                   | dynamic resolution; STP at a fixed scale only for a fixed pixel bound |
| Warm-up assumed to fix a first-frame hitch             | still 250 ms                                            | capture: JIT means IL2CPP, loading means async                        |
| Frame-spreading as the fix                             | lower peak, same total                                  | measure unamortized first, fix structure                              |
| MeshCollider added at runtime                          | spawn spike, `Physics.BakePhysXCollisionMeshData`       | `Physics.BakeMesh` in a job, Prebake Collision Meshes                 |
| Development flag set through `EditorUserBuildSettings` | every platform profile changed                          | `BuildPlayerOptions` or a build profile asset                         |
| Sizing from BuildReport `totalSize`                    | 1.9 GB for a 178 MB app                                 | shipped folder on disk                                                |
| `InstantiateAsync` as a hitch fix                      | 17 to 83 ms frame later                                 | pool and prewarm behind a transition                                  |
| Benchmarking the first launch of a new build           | 212 vs 22 ms                                            | discard the first launch                                              |

## What not to change without sign-off

Game feel (fixed timestep, Maximum Allowed Timestep, animation timing, input, AI ticks); art
direction (texture sizes, lights, LOD thresholds, render scale) without before/after captures; the
pipeline, engine version or an ECS rewrite; incremental GC off unless gameplay allocates 0 B in the
player and an A/B shows the gain; `asyncUploadBufferSize` raised blindly (never returned, console
e-book p. 31); VSync off in release; the benchmark path between before and after.

## Handoffs

- **Receives:** the brief in numbers from scenario-unity-expert; systems code from
  scenario-unity-architecture and scenario-unity-gameplay; pipeline assets from
  scenario-unity-rendering-lighting; shaders from scenario-unity-shaders; effects from
  scenario-unity-vfx; UI from scenario-unity-ui; bundles and Addressables from
  scenario-unity-pipeline-automation.
- **Delivers:** the bound, attributed costs, before/after tables, CSVs, traces, PNGs: variant
  stripping to scenario-unity-shaders, lighting, shadow and post cuts to
  scenario-unity-rendering-lighting, overdraw budgets to scenario-unity-vfx and scenario-unity-ui,
  physics settings to scenario-unity-gameplay, duplicate fixes, CI perf tests and build profiles to
  scenario-unity-pipeline-automation, device and thermal validation to scenario-unity-mobile, Web
  limits to scenario-unity-web.

## Unity 6.3 notes

- SRP Batcher + GRD + GPU occlusion (the 17.3 URP asset holds the occlusion flag); dynamic batching
  deprecated in 6.5, obsolete in 6.6.
- Split graphics jobs is the default on DX12/Vulkan/consoles (Oc6T4hh5gaI [00:03:04]); the 6.3 URP
  template reads Windows on/Split, Android off/Native, Metal off/Native; per-platform getters are
  internal (observed).
- `GraphicsStateCollection` is experimental, traces only in development players; WebGPU tracing in
  6.4. `FrameDebuggerUtility` is internal.
- Profile Analyzer 1.4.0, Memory Profiler 1.1.12, Project Auditor 1.0.2 (built in from 6.4),
  Performance Testing 3.5.0 (core in 6.6) and Profiling Core 1.0.3 (needed for
  `ProfilerCounterValue`) are preinstalled packages added by name.
- Mesh LOD is 6.2+. `Physics.BakeMesh(int, bool)` is obsolete: pass `mesh.GetEntityId()`. 6.3 runs
  Boehm (non-generational); CoreCLR is future work.

## References

- [`references/procedures.md`](references/procedures.md): eighteen procedures with full calls, each
  with its live test and recorded result.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  disagreements and deciding conditions.
- [`references/critique.md`](references/critique.md): the rubric for judging a performance pass.
- [`references/gui-paths.md`](references/gui-paths.md): Profiler, Frame Debugger, Rendering
  Debugger, Project Auditor and settings paths.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs, best
  timestamps and revision history.
- [`scripts/ut_perf.py`](scripts/ut_perf.py) (runner side),
  [`scripts/AgentKit/Performance/*.cs`](scripts/AgentKit/Performance/) (Editor jobs),
  [`scripts/Runtime/Performance/*.cs`](scripts/Runtime/Performance/) (PerfProbe, AllocScope).
