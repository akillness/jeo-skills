# Expert notes (scenario-unity-performance)

Principles and judgment by expert, with source and timestamp (full list: `sources.md`). Numbers are
the expert's unless marked **[observed]** (live run on this Mac, 2026-09-24) or **[added]** (this
skill's inference). Where experts disagree, the deciding condition is given.

## Peter Hall, Unity Profiler and Optimization team (_cV1B2hqXGI)

- **Budget first, in ms, per platform.** 1000 / fps; on mobile keep about 35% idle for thermals (21
  to 22 ms at 30 fps) [00:02:58]-[00:04:08]. Same rule as the profiling e-book's x 0.65 (p. 36).
- **Classify the bound before any change.** "If you speed up the GPU when your profile looks like
  this it's not going to run any faster because the thing that's holding you up is the CPU"
  [00:05:50]. Main-thread-bound signature on screen: PlayerLoop 49.55 ms, render thread 45.69 ms in
  `Gfx.WaitForGfxCommandsFromMainThread` [frame 00:18:23]. Render-thread bound (main short, render
  long, GPU starved) is the case the GPU Resident Drawer targets [00:16:21].
- **Biggest block first; Deep Profile only to see what fills an unexplained gap,** then replace it
  with a `ProfilerMarker` [00:18:05]-[00:19:12]. Keep those markers (and `ProfilerCounterValue`
  counters for object counts, docs: Adding profiler counters) in the streaming and spawn code so
  every spike frame names its system. `ProfilerCounterValue` needs the Profiling Core package
  (`com.unity.profiling.core` 1.0.3, preinstalled with 6.3, add by name) **[observed]**. PerfProbe
  `-perfMarkers` records them per frame; **[observed]** the 3,000-Instantiate burst frame was
  explained by `Spawn.Burst` with `Spawned Objects` jumping 0 to 3,000 in the same row (P13).
- **GC.Alloc sample times lie.** One frame: 54,021 allocations (207.6 MB) displayed as 1.01 ms; the
  22 `GC.Collect` they caused cost 19.97 ms, 40% of the frame [frame 00:21:52]. Read bytes, counts
  and collections. **[observed]** here: 27,055 GC.Alloc per frame displayed as 0.55 ms in a player
  capture, 573 collections for 327 ms over 226 frames; in the player with rendering off the
  allocating code cost 3.8 to 5.4 ms per frame while its GC.Alloc samples displayed 0.8 to 1.1 ms.
- **Profile Analyzer discipline:** remove FPS-wait markers, read median vs longest frame, set Top N
  to the spike count, check count as well as cost (the "gone" marker still ran 27 times), confirm
  which file is in which slot [frame 00:23:22]-[frame 00:26:52]. `PerfCapture.Analyze` reproduces
  this from a `.raw`: **[observed]** longest frame 183 ms vs median 37 ms of
  `StdRender.ApplyShader`, same 5,634 calls: per-draw state cost, not more draws.
- **Black-box an unfamiliar system by changing its inputs** (collider shapes, canvas count,
  hierarchy depth) [00:10:47]-[00:12:26].
- **Memory: resident is the number; profiling memory on a bigger device with identical content is
  fine** for sizing [00:29:07], [00:41:03]; budget about 1 GB on a 2 GB phone [00:28:34]. Graphics
  breakdown lists every render texture [00:34:02]; resident vs allocated [00:31:18]. On a mid-range
  laptop, paging or a discrete GPU running out of VRAM is a stutter cause of its own: check System
  Used Memory against RAM x 0.7 (Unity tutorial Uuzd39AjFWQ [00:03:46]) and Gfx Used Memory against
  VRAM (`ut_perf.memory_budget`, P14).
- **GPU bound: native GPU tools for timing** (RenderDoc, Xcode, Visual Studio, Arm tools); the Frame
  Debugger shows structure, never timings [frame 00:09:18] [00:09:10]-[00:10:14]. On this Mac: Xcode
  GPU frame capture / Instruments Metal System Trace; RenderDoc has no Metal backend.
- **Performance per commit** with per-system budgets, queried through Profiler APIs [00:39:27]: the
  Performance Testing package (3.5.0, preinstalled with 6.3, core from 6.6) gives sample groups per
  test (P17).

## Oliver Schnabel and Elad Damian Nachman, Unity graphics PMs (Oc6T4hh5gaI)

- **Most Unity 6 wins are settings:** Split graphics jobs, SRP Batcher + GPU Resident Drawer, PSO
  warm-up, STP, on-tile merging, batched skinning [frame 00:01:02].
- **GRD gains shrink outside stress tests and outside the Editor:** 2M instances 44 to 10 ms (4.4x);
  game project 2.07x in Editor but 1.45x standalone; Garden 1.46x on iOS A12, 1.52x on Quest 2
  [frame 00:12:41]. Expect about 1.5x frame time in a shipped game; the fixture numbers below are a
  stress case (3,000 identical spheres) and must not be quoted as a forecast. **[observed]** 3,000
  spheres, 8 materials: two Editor runs 9.46 to 3.19 ms (3.0x) and 7.93 to 5.40 ms (1.5x); two
  development-player runs 6.20 to 2.29 ms (2.7x) and 5.17 to 1.86 ms (2.8x); draw calls 5,946 to 31
  in all four. The player number is the one that repeats.
- **GPU-bound tells:** main thread in `Gfx.WaitForPresentOnGfxThread` (3.97 of 4.90 ms) [frame
  00:13:22]; Display Stats "CPU Present Wait" [frame 00:18:31].
- **Read the Rendering Debugger Display Stats first** (CPU main, CPU render, CPU Present Wait, GPU
  frame, and the per-pass GPU table under Profiling Scopes): at 4K it named PostProcessing the
  largest GPU pass, so the next step was trimming post settings [frame 00:01:47] [00:01:56].
  Headless substitute: `FrameTiming.cpuMainThreadPresentWaitTime` (PerfProbe column
  `cpu_present_wait_ms`, 0 in a batch player that never presents **[observed]**) plus the wait
  markers; the per-pass table itself needs the window or a windowed player.
- **GPU levers by what bounds it** [00:14:42], [00:26:53]: pixel bound gets STP (compute, not GLES;
  it also cuts SSAO cost [frame 00:20:34]) or **dynamic resolution when load or thermal state
  varies** (render area example 65%, FSR/DLSS/TAA/STP filters [frame 00:22:03]; visual digest: fixed
  pixel-bound device class = STP at a fixed scale, varying load = dynamic resolution); overdraw gets
  depth priming for opaques and less transparency [00:15:48]; vertex bound gets LOD, GPU occlusion,
  simpler meshes. Post-processing gets a fixed slice of the budget (console e-book p. 93). HDRP
  example of one setting: volumetric fog Manual 16.79 ms vs Balanced 2.09 ms in Nsight [frame
  00:14:28].
- **Pixel-bound test:** if lower render scale, lower texture Max Size or a trivial shader drops
  frame time, you are pixel bound; then STP, dynamic resolution, overdraw [frame 00:15:13].
  **[observed]** with real GPU time from a headless Metal System Trace (P18): the 3,000-sphere scene
  went from 2.50 ms GPU at 1080p to 3.00 ms at 4K (4x pixels, 1.2x time): the opaque pass stayed at
  2.30 ms (geometry), only SSAO scaled (1.9x), and the CPU main thread was 5.8 ms: not pixel bound,
  so render scale or STP would not have helped.
- **GPU occlusion culling only pays when vertex bound:** "if you are not bound by these vertices you
  would not win any extra performance" [00:29:04]; it adds a visibility buffer.
- **PSO stalls about 250 ms each on modern APIs;** trace a GraphicsStateCollection in a player,
  `WarmUp()` returns a JobHandle [frame 00:04:48] [frame 00:05:33].
- **Split graphics jobs:** Split is the default on DX12 (Windows, Xbox), Vulkan (Android) and
  consoles [00:03:04]; DX12 Split 217 fps vs Native 161 vs Legacy 199, plain DX12 176 and DX11 177
  [frame 00:03:52]; the SRP Batcher multithreads only with graphics jobs on DX12, Vulkan or console
  APIs (6.3 Manual table). On a DX12 PC target, Split is the setting to confirm, not a late lever.
  **[observed]** the 6.3 URP 3D template has no per-platform override
  (`m_BuildTargetGraphicsJobs: []`) and the engine defaults read: Windows (DX12 first) on, Split;
  macOS and iOS (Metal) off, Native; Android (Vulkan first) off, Native, so an Android target needs
  the setting confirmed and A/B tested (scenario-unity-mobile); the per-platform getters
  (`GetGraphicsJobsForPlatform`, `GetGraphicsJobModeForPlatform`) are internal in 6000.3.21f1, which
  is why `PerfRendering.Audit` reads them by reflection (P2).
- **Mobile: bandwidth is heat;** on-tile deferred beat Forward+ on a Mali G57 (25.3 to 30.2 fps)
  [frame 00:18:31]. Deciding condition vs GRD (needs Forward+ or Deferred+): light count and whether
  GRD matters; A/B on the device (scenario-unity-mobile owns it).

## Nicolas Borromeo, Unity consultant (CmD8MVGkDxQ)

- **Deep Profile timings are "completely irrelevant"** [00:04:38]; for native cost, sample
  (Instruments, Superluminal); for script cost, instrument [00:05:11]-[00:07:20].
- **Runtime MeshCollider cooking:** activating a GameObject was slow because the native MeshCollider
  Awake cooked the physics mesh [00:06:16]. Prefab colliders cook when instantiated or activated
  unless Prebake Collision Meshes is on (Code Monkey 2gP-2rQ3o_Q [00:10:25]); runtime meshes:
  `Physics.BakeMesh` in a job (console e-book p. 113). **[observed]** marker
  `Physics.BakePhysXCollisionMeshData` (PerfProbe column `mesh_cook_ms`); numbers in P13.
- **Shader hitches show as `Shader.CreateGPUProgram` on the render thread;** log compiled variants,
  build an SVC; on DX12/Vulkan (and Metal) the driver compiles per pipeline state, so trace PSOs
  (GraphicsStateCollection) [00:11:14]-[00:14:35]. **[observed]** Metal player: 18 first-use
  compiles in frame 0 cold (twice, so not a disk cache), 0 after warming 10 PSOs in 3.6 ms during
  loading. The first frame stayed about 250 ms: the capture put it on `Mono.JIT` (204 ms) and FMOD
  init (87 ms). Attribute before you fix.
- **MaterialPropertyBlocks exclude renderers from the SRP Batcher;** thousands of materials sharing
  a variant are fine [00:16:16]-[00:16:49]. **[observed]** 3,000 MPB-tinted spheres: 5,946 SetPass
  calls, 58 ms player frame; the same scene with 8 Material Variants: 33 SetPass, 6.2 ms. With GRD
  on, the MPB scene did not change (49.1 to 47.9 ms): GRD cannot take MPB renderers.
- **"Same mesh more than 100 times: GPU instancing"** [00:17:22] predates the 6.3 table. Deciding
  condition: GameObjects in URP/HDRP 6.3 go to SRP Batcher + GRD with the material checkbox off;
  non-GameObject masses use `Graphics.RenderMeshInstanced`/`RenderMeshIndirect`; under 256 vertices,
  one combined buffer (6.3 Manual).
- **Each extra camera costs its preparation, which can exceed its rendering;** if unavoidable, a
  lean renderer [00:20:12]-[00:21:20].
- **Invisible UI still costs fill:** alpha-0 and covered menus are drawn; disable, do not fade to 0
  [00:24:38].
- **Quad overdraw and polygon density:** GPUs shade 2x2 pixel quads (for derivatives), so a
  one-pixel triangle costs four pixel shader invocations; dense meshes seen small re-shade pixels
  many times; LOD cuts pixel cost more than vertex cost, and at 4K modern GPUs are pixel bound
  [00:26:52]-[00:28:31]. The console e-book: "the bottleneck is not usually polygon count on modern
  GPUs, but rather polygon density" (p. 29). `ut_perf.density_check` flags more than one triangle
  per rendered pixel [added threshold]; **[observed]** 400 dense spheres at 1080p: 7.1 triangles per
  rendered pixel before Mesh LOD, 0.12 after (Triangles Count sums every pass, so compare before and
  after).
- **Untracked is usually not resident** (0.75 GB untracked, 140 MB resident) [00:32:22].
  **Fragmentation:** small allocations share 4 KB blocks; a survivor pins its block; initialize
  long-lived managers together, watch Managed > Reserved [00:37:22]-[00:40:42].
- **Allocation call stacks find the real allocator** (Hierarchy blamed `RaceStatsPlayer.Update`, the
  stack showed `String.Format` elsewhere) [00:41:15].
- **Addressables duplication:** shared non-addressable dependencies copied per bundle,
  scene-in-player plus addressable copy, addressables in Resources [00:42:21]-[00:46:15]. When areas
  stream, a duplicate is loaded and held once per area: a load-time and memory cost, detected with
  the Addressables Build Report, Memory Profiler potential duplicates or UnityDataTool.
  `PerfAudit.BundleDuplicates` does the dependency check headless (P16).
- **Shader variants: log, collect, warm, strip.** Log Shader Compilation in a development build,
  play everything, convert the log to a ShaderVariantCollection, WarmUp before gameplay
  [00:12:20]-[00:12:54]; on DX12/Vulkan (and Metal) warm traced PSOs instead [00:12:54]-[00:14:35].
  **Shader memory:** a loaded shader keeps all its variants in RAM until compiled; Player Settings >
  Shader Variant Loading caps it (too low re-reads from disk); better, strip with
  `IPreprocessShaders` against the used set [00:46:49]-[00:48:28]. P15 runs the whole chain.

## Jason Booth (NAVbI1HIzCE)

- **Data layout first; the gains compound.** 200,000 objects: MonoBehaviour Update 27 ms, manager 6
  ms, array of structs 1.7 ms, Burst job 0.25 ms, SoA with shared config 0.13 ms
  [00:06:38]-[00:15:49]. **[observed]** at 3,000 objects (Editor, rendering off, 3 interleaved
  rounds): per-object Update 1.88 ms to manager 0.81 ms. The Burst job over a TransformAccessArray
  measured 0.41 ms at load average about 50 but 1.30 ms at about 110, while the single-thread loop
  stayed near 0.9 ms: jobs need free cores; measure on the target.
- **Amortization is not optimization:** "it's just spreading the work around" [00:18:17]. Strip it
  to see the real cost: KSP2's time-sliced LOD hid 1,800 ms per boundary crossing [00:20:26].
  Deciding condition vs "time-slice heavy work" (console e-book p. 38): fix structure first; spread
  only after the unamortized cost is known and reduced, and only when the visual or gameplay cost is
  acceptable.
- **Pack for bandwidth, not memory** [00:49:57]; the array is "your one and only data structure"
  [00:54:23].
- **Shader branches are good when coherent and when they skip texture fetches** (864 to 14-52
  samples per pixel) [00:36:44]-[00:39:44]. Borromeo says prefer keywords over plain `if`
  [00:30:09]: deciding condition = coherence and payoff; keywords when constant per material or
  build (scenario-unity-shaders owns it).

## Richard Fine, Unity (0y3erF2tzbI)

- **Every reference hop is a probable cache miss (180+ cycles);** two bools behind references can
  cost three misses [00:11:40]; store hot values in the component (about 3x) [00:12:12].
- **Unity 6.3 GC is Boehm:** non-generational, non-moving; incremental mode adds a write barrier to
  every reference write and a final stop-the-world pass when mutation outpaces rescanning
  [00:17:55]-[00:19:28]. Web has no incremental GC.
- **The Asset GC is separate and non-incremental;** it runs on `Resources.UnloadUnusedAssets` and
  every non-additive scene load [00:22:05]-[00:23:07].
- **SoA and hot/cold splits:** reading 12 bytes of a 200-byte struct wastes 52 of 64 bytes per line
  [00:33:30]. "Don't optimize the 1% while a 15% item waits" [00:35:34].

## Unity e-books and 6.3 Manual (docs)

- **The authority is a development build on the lowest-spec target** (e-book p. 18); Editor memory
  is inflated (textures forced read/write, p. 44); `GetComponent` allocates in the Editor only
  (Manual).
- **Zero gameplay allocations, then incremental GC off and `GC.Collect` hidden in loads** saves up
  to about 1 ms per frame on CPU-bound projects (e-book p. 69; Manual). Deciding condition: only if
  gameplay truly allocates nothing; Web has no incremental GC; A/B the same section.
- **6.3 URP/HDRP decision table:** SRP Batcher on, GRD on, material GPU Instancing off ("extra
  shader variants"), static batching off ("isn't compatible with the BRG API or GPU Resident
  Drawer"); Built-in keeps static batching (Manual). The 2024 console e-book's "enable instancing,
  mark Batching Static" is Built-in-only now.
- **GRD prerequisites:** BRG Variants Keep All, SRP Batcher, Instanced Drawing, Forward+; per
  object: Mesh Renderer, no MPB, no LPPV, static GI only, DOTS-instancing shader, no OnRenderObject
  (Manual). **[observed]** URP 17.3 checks EVERY renderer in the asset's list (one Forward renderer
  disables GRD for the asset) and accepts Deferred+ too; the template ships BRG variants on
  KeepIfEntitiesGraphics, so a fresh project's GRD toggle does nothing.
- **[observed] `StringBuilder.Append(int)` allocates on Unity's Mono** (it formats through
  `int.ToString()`): an "allocation-free" tick that used it failed `Is.Not.AllocatingGCMemory()`;
  appending digits by hand passed.
- **Every array-valued Unity API returns a new copy** (`mesh.vertices[i]` in a loop copies per
  iteration) (Manual). **[observed]** a capturing lambda allocates its closure at scope entry:
  `if (!allocate) return;` placed before a LINQ query with a captured local still allocated 20 bytes
  per call (3,000 calls, 60 KB per frame, in the Editor and in the player).
- **Cameras:** each active camera reruns culling, sorting, batching; up to 1 ms CPU on mobile even
  rendering nothing (console e-book p. 89).
- **Physics spiral of death:** a 40 ms spike with a 20 ms fixed step runs two steps next frame;
  raise the fixed step on low-end, cap Maximum Allowed Timestep (console e-book p. 110-111;
  scenario-unity-gameplay owns the settings). Unity's walkthrough shows the same catch-up from
  spawning many rigidbodies per frame (xjsqv8nj0cw [00:10:23]). Check it, do not assume it: count
  `Physics.Simulate` per frame (PerfProbe `physics_steps`) under a forced spike (`-perfSpikeAt`);
  Maximum Allowed Timestep is a deliberate trade between simulation catch-up and frame time.
- **Deep profiling:** slow, memory hungry, "works best for small games" (Manual).
  `ProfilerMarker.Auto()` cannot compile out (returns null); no `/` in names; no `await`/`yield` in
  a marked scope (Manual).
- **Startup and loading traces:** `UnityLoadApplication` (first scene Awake),
  `SerializedFile::ReadObject` on the main thread = synchronous load (Manual). **[observed]** first
  player frame: `Mono.JIT` 204 ms (3,587 samples), FMOD init 87 ms, `ReadObjectFromSerializedFile`
  24 ms: IL2CPP removes the JIT part.
- **IL2CPP for shipping, Mono for iteration;** IL2CPP builds only on the target's OS; "Optimize for
  code size and build time" for CI; stripping Minimal is the IL2CPP default, Low is marked for
  deprecation, High needs link.xml/[Preserve] and a smoke test (Manual).
- **Build Profiles shared-settings trap:** with a PLATFORM profile active, an
  `EditorUserBuildSettings` change (Development, connectProfiler) applies to every platform profile;
  with a build profile active, only to that profile (6.3 Manual, Shared build settings note).
  Scripted benchmark builds pass flags through `BuildPlayerOptions` (PerfBuild) or use a dedicated
  build profile asset. **[observed]** the test project runs with a platform profile active
  (`BuildProfile.GetActiveBuildProfile()` null); PerfBuild reports it.
- **Logging cost:** a per-frame `Debug.Log` cost 48.55 ms of an 80 ms development-build frame
  (xjsqv8nj0cw [00:10:23]-[00:10:55]); wrap logs in `[Conditional("ENABLE_LOG")]`, remove the define
  for release, set Log and Warning stack traces to None (console e-book p. 41-42). Measured cost per
  call in P13.
- **Audio load type by clip size** (console e-book p. 104-105): under 200 KB Decompress On Load (or
  Compressed In Memory with ADPCM); 200 KB and up Compressed In Memory (memory first) or Decompress
  On Load (CPU first); over 350 to 400 KB Streaming (about 200 KB overhead per stream); 3D sources
  mono. `PerfAudit.AudioImport` checks it (P16).
- **Texture uploads:** `QualitySettings.asyncUploadBufferSize` about the size of the largest texture
  if uploads stall, but the ring buffer is never returned; Mipmap Streaming (Unity 6 name of Texture
  Streaming) for 3D textures (console e-book p. 31-32). Audited in P2.
- **Culling levers:** per-layer `Camera.layerCullDistances` (32 layers, 0 = far plane) and baked
  occlusion culling (Occluder/Occludee Static; it costs CPU, disk and RAM, so verify the GPU gain)
  (console e-book p. 86-87). Audited per camera in P2. **[observed]** same scene, universal macOS
  app: IL2CPP Minimal + runtime speed 177.9 MB (441 s), IL2CPP High + code size 110.5 MB (97 s),
  Mono release 116.3 MB; packed assets only 8.1 MB of it (the splash logo alone 2.67 MB).
  BuildReport `totalSize` said 1,907.8 MB because it counts the IL2CPP backup folder (symbols,
  generated C++) that must never ship.
- **Mesh LOD (6.2+):** geometry only, index-buffer LODs, ignored by static batching, GPU instancing,
  particles, VFX Graph, Entities Graphics; skinned meshes still deform LOD0; cross-fade needs GRD;
  do not combine with LOD Group (Manual). SpeedTutor adds: 256-triangle minimum, about 64 floor,
  about half per level [00:02:34]. **[observed]** an 18,432-triangle mesh got 9 levels down to 150
  triangles (each about half); 400 copies at 250 m: 14.75 M to 0.26 M triangles per frame, draw
  calls unchanged.
- **Loading hitches and frame spreading [observed]:** 3,000 Instantiate calls in one frame cost a
  22.3 ms frame; 300 per frame kept the peak at 7.5 ms for about the same total (Booth's point: the
  work is spread, not removed); `Object.InstantiateAsync` made the call frame 2.9 ms but its
  integration landed 5 to 29 frames later as a 17 to 83 ms frame. Pools prewarmed behind a
  transition remove the work from gameplay (Weimann; 6.3 Manual).

## Educators (Tarodev, git-amend, Code Monkey, Jason Weimann, Unity tutorials)

- **Micro-optimizations are noise at realistic call counts** (3,700 transform calls under 1 ms;
  53,000 `Camera.main` calls 8 ms) but scene-wide Find is catastrophic (4,300 calls, 18 s); NonAlloc
  is slower per call but garbage-free; benchmarks do not transfer across platforms (WebGL reversed
  the Editor ranking) (Tarodev, Xd4UhJufTx4 [00:02:28], [00:05:56], [00:08:56], [00:12:30]).
- **Count allocations per block, not per frame:** Recorder "GC.Alloc", disable,
  `FilterToCurrentThread`, enable; `sampleBlockCount` = allocations (git-amend, ham_w48aRJ4
  [00:01:09]). This skill's `AllocScope` and Unity's `Is.Not.AllocatingGCMemory()` agree
  **[observed]**: clean tick 0, garbage tick counted.
- **Project Auditor is the static baseline;** findings ignore call frequency, so fix Major first
  [00:05:06] and triage the rest by how often the code runs (Code Monkey, 2gP-2rQ3o_Q [00:04:34]);
  the profiling e-book asks for no new Major issue per check-in (p. 78-80). Package 1.0.2 in 6.3
  (preinstalled, add by name), built in from 6.4. `PerfAudit.ProjectAuditor` runs it headless and
  `ut_perf.triage_auditor` marks issues inside per-frame methods (P16).
- **A monitor that formats strings every frame pollutes its own GC reading** (git-amend ham_w48aRJ4
  [00:11:30]): PerfProbe fills preallocated buffers and writes the CSV once at the end;
  **[observed]** its own baseline is 104 B and 2 allocations per frame.
- **Pools stop allocating only once they have inactive objects;** `defaultCapacity` does not
  prewarm; `maxSize` bounds what is kept, not what is created (Weimann, mRh2DA1Uzo8 [00:09:24],
  [00:17:52], [00:23:08]).
- **Editor memory about 5x the player's** (2.68 GB vs 0.52 GB resident); subtract a blank-scene
  baseline (Unity tutorial, Uuzd39AjFWQ [00:10:03]-[00:11:02]). Per-frame `Debug.Log` cost 48.55 ms
  of an 80 ms dev-build frame (xjsqv8nj0cw [00:10:23]).

## Disagreements and deciding conditions

| Choice                  | A                                                                  | B                                                         | Decide by                                                                                              |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Material GPU Instancing | enable for many copies (console e-book 2024; Borromeo "100 times") | off in URP/HDRP (6.3 Manual)                              | pipeline: Built-in = enable; URP/HDRP = SRP Batcher + GRD                                              |
| Static batching         | mark Batching Static (console e-book)                              | off with GRD (6.3 Manual)                                 | GRD on or off; memory (static batching duplicates vertex data); Mesh LOD (static batching forces LOD0) |
| Incremental GC          | on (default) reduces spikes                                        | off with zero allocations saves up to 1 ms (e-book p. 69) | whether gameplay allocates (prove with gc_check in a player); Web has none                             |
| Memory budget           | 50% of RAM on 2 GB phones (Hall)                                   | 70% (Unity tutorial) / 80% (e-book)                       | device RAM class and OS reserve                                                                        |
| Autoconnect Profiler    | on for interactive attach (tutorials)                              | off, +10 s startup (e-book p. 47)                         | interactive session vs startup timing or headless capture; `SendToEditor` needs it on                  |
| Frame spreading         | time-slice heavy work (console e-book p. 38)                       | hides cost (Booth)                                        | only after the unamortized cost is measured and reduced                                                |
| Shader `if`             | keywords (Borromeo)                                                | coherent dynamic branches (Booth)                         | coherence and what the branch skips                                                                    |
| Where to profile memory | min-spec device (both digests)                                     | bigger device, same content (Hall)                        | timing and residency on the device; sizing anywhere with identical content and quality level           |
