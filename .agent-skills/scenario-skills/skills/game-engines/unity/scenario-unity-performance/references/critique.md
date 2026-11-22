# Critique rubric (scenario-unity-performance)

The agent scores its own performance pass before calling it done. Each line is pass/fail with the
evidence named. A pass with no artifact (CSV, capture JSON, build report, PNG, NUnit XML) is a fail.

## 1. Measurement validity (fail any = the numbers prove nothing)

- [ ] **Budget in ms stated per platform** (16.67 at 60, 33.33 at 30; x 0.65 on mobile) and every
      verdict compared to it (`ut_stat.budget_check`).
- [ ] **Verdict numbers come from a development player** (`ut_perf.run_player` / PerfProbe CSV), not
      Editor Play mode. Editor numbers are labeled "iteration".
- [ ] **The frame was actually rendered:** `draw_calls` > 0 in the CSV and the last-frame PNG
      (`-perfShot`) opened and checked with `ut_review.image_checks` (not blank, not uniform, not
      magenta). A batch-mode player skips camera rendering unless PerfProbe submits the camera
      (observed: 0 draw calls otherwise).
- [ ] **VSync off / target frame rate unlimited while measuring** (PerfProbe does it); release
      builds get VSync back.
- [ ] **Same benchmark path, same scene, same resolution before and after.** Warm-up frames skipped
      (first-use compiles, JIT, loading).
- [ ] **Noise controlled:** on a shared machine, A/B interleaved (`ut_perf.ab_profile`, 3+ rounds,
      per-run p50, median) and the sign consistent across rounds; the load average recorded. Counts
      (draw calls, SetPass, batches, bytes, triangles) are exact; times are not.
- [ ] **Deep Profile timings never quoted.** GC.Alloc sample ms never reported as the cost of
      allocations.
- [ ] **The measuring code does not allocate or format per frame** (a monitor that builds strings
      every frame pollutes its own GC column, git-amend ham_w48aRJ4 [00:11:30]); PerfProbe's own
      baseline (104 B, 2 allocations per frame) subtracted or stated.
- [ ] **Per-frame attribution on aligned rows:** markers, GC and physics columns are compared on
      `main_thread_ms` (same recorder row); FrameTimingManager columns lag a few frames (4 observed)
      and never pin a spike to a frame.
- [ ] **The machine is the one intended:** probe JSON `device` shows the expected GPU (a hybrid
      laptop can run on its integrated GPU) and not on battery [added]; resolution is the players'
      resolution.
- [ ] **Streaming comparisons use a time-based path:** a camera that moves a fixed distance per
      frame reaches a boundary sooner after a speed-up, giving async loads less time, which can
      create or hide a hitch between before and after [added]. Frame-based paths are fine for steady
      per-frame cost; time-based (or event-aligned by boundary crossing) for loading hitches.

## 2. Diagnosis

- [ ] **Bound named with evidence before the first fix:** FrameTimingManager CPU vs GPU from a
      windowed player, or wait markers from a capture (`PerfCapture.Analyze`:
      `Gfx.WaitForGfxCommandsFromMainThread` = main bound, `Gfx.WaitForPresentOnGfxThread` + present
      waits = GPU), or render counters (SetPass in the thousands = render-state bound).
- [ ] **Top costs attributed in ms from a capture or markers,** not guessed: top self markers,
      longest vs median frame with counts.
- [ ] **Hitches attributed by marker** (Mono.JIT, Shader.CreateGPUProgram,
      SerializedFile::ReadObject, GC.Collect, Instantiate/CloneObject) before a fix is chosen.
- [ ] **Allocations located per block** (AllocScope, `Is.Not.AllocatingGCMemory()`, allocation call
      stacks), including hidden ones (closures created at scope entry, boxing, array-valued APIs).
- [ ] **Every spike frame explained** by a recorded cost (`ut_perf.attribute_spikes`: your
      `-perfMarkers` columns, GC.Collect, shader compiles, MeshCollider cooking, synchronous
      ReadObject, physics steps); streaming and spawn systems carry their own ProfilerMarkers and
      counters; `unexplained` is 0 or each remaining spike has a capture.
- [ ] **GPU-bound frames read before any lever:** CPU Present Wait / wait markers, pixel-bound test,
      then timings from a native GPU profiler (Xcode Metal capture here; PIX, Nsight, RenderDoc on
      Windows). The Frame Debugger is structure only.
- [ ] **Memory and VRAM on the target class:** System Used Memory p95 under RAM x 0.7 (0.5 on 2 GB
      phones, 0.8 dedicated devices), Gfx Used Memory against VRAM on discrete GPUs, largest
      RenderTextures listed (`ut_perf.memory_budget`).
- [ ] **Physics catch-up checked, not assumed:** `physics_steps` at most 1 per frame in normal play
      and back to 1 within a few frames after a forced spike (`ut_perf.physics_catchup`).
- [ ] **Static baseline taken:** Project Auditor Major/Critical list, code issues triaged hot vs
      cold (`ut_perf.triage_auditor`); lint on hot paths.

## 3. Fix quality

- [ ] **One change per measurement,** each with a before/after line (`ut_perf.compare_line`).
- [ ] **Structure before tuning:** data layout, allocation removal, batching compatibility before
      thresholds and micro-optimizations. No amortization before the unamortized cost is known.
- [ ] **6.3 URP draw-call setup correct:** SRP Batcher on; GRD with BRG Keep All and every renderer
      Forward+/Deferred+ (`PerfRendering.Audit` counts.error == 0); material instancing off; static
      batching off with GRD; no MaterialPropertyBlock on GRD/SRP Batcher renderers (lint: no
      `perf.mpb`).
- [ ] **GRD coverage known, not assumed:** `scene.grd_eligibility` names the renderers that cannot
      use it and why; draws outside "Hybrid Batch Group" explained (Frame Debugger window or
      `PerfFrameDebug.Capture` where it captures); realistic expectation stated (about 1.45x frame
      time in a standalone game, 4.4x only in a 2M-instance stress test, Oc6T4hh5gaI [frame
      00:12:41]).
- [ ] **Split graphics jobs confirmed on a DX12/Vulkan ship target** (`config.graphics_jobs`), A/B
      in a player.
- [ ] **Density judged:** triangles per rendered pixel (`ut_perf.density_check`); LOD chosen by
      pixel cost, not only vertex count.
- [ ] **Each "optional" feature kept only with a measured gain:** GPU occlusion culling, Burst jobs
      at small counts, frame spreading, incremental GC off, a raised `asyncUploadBufferSize`, a
      fixed render scale (dynamic resolution when the laptop's load or thermal state varies).
- [ ] **Visual parity checked** for any change that can alter the image (materials, LOD thresholds,
      render scale, shadow distance): same bookmarks, `ut_review.compare`, contact sheet opened.
- [ ] **No gameplay or art-direction change applied silently** (fixed timestep, spawn rates, light
      counts, texture sizes): presented as options with their cost.

## 4. Shipping configuration

- [ ] **IL2CPP release build succeeds** with the chosen stripping level and a smoke run of the
      player (no MissingMethodException / TypeLoadException in the log).
- [ ] **Build size broken down** (PerfBuild `breakdown`: categories, top assets, files by role) and
      within the budget; the biggest line explained.
- [ ] **Release hygiene:** Development Build, Autoconnect Profiler and Deep Profiling off; no
      per-frame `Debug.Log`; Frame Timing Stats only if a runtime scaler reads it.
- [ ] **PSO warm-up (if hitches came from compiles):** a GraphicsStateCollection per graphics API
      traced in a development player, warmed during loading (never during gameplay streaming;
      `WarmUpProgressively` to spread it), gameplay frames with 0 `Shader.CreateGPUProgram`; on
      DX11/GLES a ShaderVariantCollection from a Log Shader Compilation playthrough.
- [ ] **Shader variants counted and stripped against the used set** where build size or shader
      memory matters (P15), with an image check of the stripped build.
- [ ] **Assets streamed per area are not duplicated** across bundles or between player and bundles
      (`PerfAudit.BundleDuplicates`), long audio streams, short audio decompresses
      (`PerfAudit.AudioImport`), runtime MeshColliders baked off the main thread.
- [ ] **Build Profile known:** benchmark and release flags passed through `BuildPlayerOptions` or a
      dedicated build profile, never by editing `EditorUserBuildSettings` on an active platform
      profile (it changes every platform profile).

## 5. Report

- [ ] Each step names its Unity call (`ut_perf.profile` (AgentProfile.PlayModeTimings),
      `PerfBuild.Build` (BuildPipeline.BuildPlayer), PerfProbe command line, ...).
- [ ] **Verified** list: what ran, numbers, artifacts. **Assumed** list: what did not run (GPU
      timings in batch mode, device runs, windowed captures) and why.
- [ ] A table: change, metric, before, after, delta, visual impact, decision.

## Scoring

- All of section 1 and 2 pass: the diagnosis is trustworthy. Any section 1 fail: redo the
  measurement before writing conclusions.
- A fix without a before/after line is not a fix; a GRD claim without draw calls before/after is not
  a GRD claim.
