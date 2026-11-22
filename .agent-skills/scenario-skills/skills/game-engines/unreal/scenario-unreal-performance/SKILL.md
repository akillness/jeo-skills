---
name: scenario-unreal-performance
description: 'Use when an Unreal Engine 5.8 project misses its frame rate or stutters: "optimize to 60 fps", "we run at 38 fps", CPU or GPU bound, game or render thread too long, hitches, traversal or shader stutter (PSO), GC spikes, camera-cut spikes, Lumen, Nanite, VSM, ray tracing, foliage, crowds or Niagara too expensive, async compute, stat unit, ProfileGPU, Unreal Insights, TraceQuery, snapshothitches, scalability and device profiles, dynamic resolution and TSR, streaming budgets, or proving a fix with before and after captures.'
license: MIT
---

# Performance engineering in Unreal Engine 5.8

Expert level here means milliseconds per stage, not frames per second: classify the bound with one
honest capture, explain the worst frame by the thread that works rather than the one that waits, fix
in the order of measured size, and prove the result with repeated runs on the same route and build,
hitches judged apart from the average. The performance engineer owns measurement, diagnosis and
proof; most fixes go back to the teammate who owns the content. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** [`scripts/ue_perf.py`](scripts/ue_perf.py) is **not yet run in Unreal**;
its pure layers pass `tests/code/unreal-performance/run_all.sh` (50 offline tests on synthetic
captures). Every UE name is [verify]; first run: `job_probe_perf.py` (procedures P0).

## Stance (the expert delta)

- **Milliseconds per stage, then the right tool.** At 60 fps the game thread, render thread and GPU
  each get 16.6 ms, pipelined game N, render N-1, GPU N-2 (W4R [00:05:17] [00:08:26]). Report ms,
  never fps (ARI22 [00:14:44]). `stat unit` classifies, Insights says where on the CPU, a GPU
  capture explains the GPU, and a sampling profiler says why when instrumentation runs out (KEN
  [00:04:04]; NORSE [00:17:30]).
- **An honest capture before any fix.** Cooked Test or Development build on target hardware, fixed
  route; lock dynamic resolution (75%) and force async compute off only to attribute passes, never
  for the proof (NORSE [00:44:40] [00:45:12]). Lean capture for "are we on budget", rich
  (`-statnamedevents`, about 20% overhead) for "why" (NORSE [00:11:27]); `-NoVerifyGC` and
  `-handleensurepercent=0` remove fake Development hitches (NORSE [00:13:35] [00:16:23]).
- **The longest bar is often a wait, and waits are budget.** Exclude idle, wait and frame-sync
  markers and follow the dependency to the working thread; a slow render frame N appears as
  game-thread waiting in frame N+1 (KEN [00:09:54] [00:16:30]). Waits on animation and movement
  finalization (about 2 ms at 300 NPCs) are reclaimable (W4R [00:16:20]).
- **Epic scalability is the 30 fps mode.** High (2) is the 60 fps level, and nothing selects the 60
  fps device profile unless you build that (OZ26 [00:11:00] [00:16:50]; LVP). The resolution chain
  (dynres 800p to 1080p, TSR to 1440p, spatial upscale to 4K) is the biggest single rendering lever
  (OZ26 [00:14:41]; W4R [00:43:08]).
- **Budget each feature, measure by delta, follow its tree.** Lumen GI plus reflections is about 4
  ms at 60 fps, read as the frame delta with Lumen off (OZ24 [00:37:55]). Nanite: budget, then
  Evaluate WPO and Pixel Programmable views, Overdraw last; a view locates, it does not prove (OZ24
  [00:29:18] [00:32:13]). VSM: chase the larger of static and dynamic invalidations (OZ24
  [00:48:59]). Async compute is an A/B per feature: about 1.5 ms overall in the Witcher demo, yet
  Lumen reflections back on graphics saved more (W4R [00:20:42] [00:21:48]).
- **Defaults favor ease; the big wins are content settings.** Complex collision everywhere, overlaps
  on load, translucency After DOF at full output resolution, DF shadows next to VSM, PDO or WPO
  foliage paying three times (VisBuffer, VSM, custom depth), overlapping shadowed local lights,
  props left Movable (NORSE [00:38:53] [00:49:03] [00:53:48] [00:49:35]; FFW [00:52:59]; ARG
  [00:11:54]).
- **Hitches are their own pass.** Hundreds of ms is almost certainly a blocking load, stopped at
  authoring by a validator; GC cost follows the UObject count; spawns are not incremental; camera
  cuts lose occlusion history; consoles have no runtime PSO hitches, PC and Mac are tested cold
  (HITCH [00:43:07] [00:45:16] [00:38:31] [00:25:08] [00:35:50]; W4R [00:44:44]; PSO blog). Dynamic
  resolution cannot fix a hitch (W4R [00:43:38]).
- **Fix content before band-aids.** Async physics init, incremental GC and dynres hide growth (HITCH
  [00:22:56] [00:41:56]); throttle the one feature that spikes instead of letting dynres soften the
  whole frame (W4R [00:38:55]).

## Establish first

| Input                                  | Changes                                                                                                                     | Default when silent                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Target hardware and who captures on it | every number; this Mac cannot deploy to a devkit (platform SDK and source build, PKG)                                       | ask; meanwhile Mac numbers labeled as proxy                                        |
| Frame target, output resolution        | stage budget, resolution chain                                                                                              | 60 fps; 4K output on console                                                       |
| Dynamic resolution policy              | lock while profiling; the shipped range                                                                                     | on, 55 to 75% of the 1440p secondary (OZ26 [00:15:48])                             |
| Builds available                       | proof in Test; memory traces need Development (INS); a Launcher engine packages only DebugGame, Development, Shipping (PKG) | Test from a source engine, else Development with the noise flags                   |
| The route                              | repeatability                                                                                                               | busiest scene, crowd, combat, top traversal speed, camera cuts, as BugIt waypoints |
| Quality bar, who signs trades          | parity gate                                                                                                                 | the owner of the look (lighting, art)                                              |

## Workflow

`import ue_perf as P` (agent side). Commands go through scenario-unreal-expert's channels; packaged
builds take only launch flags and a Level Sequence event track.

0. **Probe the tools.** `job_probe_perf.py` for API names and cvars; `P.schema_probe(jsonl)` on the
   first TraceQuery output. GATE: every planned cvar printed a value; TraceQuery keys mapped.
1. **Frame the gap, write budgets.** 38 fps is 26.3 ms, 9.6 ms over 16.67.
   `P.budget_table(platform, fps, pass_budgets)` (OZ26 [00:45:55]). GATE: sources on every row,
   passes sum under the stage.
2. **Route and honest capture.** `P.route_from_bugit(log)` (or `P.route_event_track` when packaged),
   `P.capture_plan("budget", ...)`, three runs. GATE: three lean runs, spread known, identical
   hygiene.
3. **Classify.** `P.diagnose_bound(frames, 16.67, context=...)` gives bound, gap, caveats and the
   next capture; read back scalability (`P.stat_sequence("scalability_readback")`). GATE: bound
   named, gap in ms, caveats answered.
4. **Config first, one change per measurement.** Scalability 2 plus a selector that activates it;
   resolution chain (`P.day_one_60fps_cvars`, `P.device_profile_block`, `P.write_ini_section`,
   backups first); `P.day_one_engine_ini()` through `P.apply_ini_keys` (Use Simple as Complex,
   NeverUpdate overlaps while streaming); Lumen foliage threshold 0 and a roughness threshold below
   0.4 read from Performance Overview (OZ26 [00:41:56]); `r.GTSyncType 2` on Gen9; streaming under
   the 5 ms default. Log each in `P.ChangeLog`. GATE: read-back LastSetBy DeviceProfile; each change
   measured; quality trades A/B'd.
5. **Deep pass on the bound (procedures P6 to P7b).** GPU: attributed `ProfileGPU` into
   `P.gpu_pass_table`, `P.lumen_delta`, then the numbers through `P.feature_budget_check` (RT
   scene), `P.nanite_triage` and `P.vsm_triage`; async compute through
   `P.ab_plan(P.ASYNC_AB_VARIANTS)` and `P.ab_verdict`. Game thread: TraceQuery into
   `P.analyze_trace` (non-wait timers, counts against the screen, `game_wait`, `advice`),
   `P.spawn_bursts`, `dumpticks grouped`, `obj list -countsort`. Streaming: per-cell cost in World
   Partition Insights, request-to-visible latency on a top-speed traversal,
   `P.STREAMING_AB_VARIANTS` as A/B only. GATE: every over-budget bucket has a named cause, asset
   and owner.
6. **Audit and route fixes.** `P.perf_audit_level()`, `P.perf_audit_assets()` (mobility, collision
   source, WPO bounds, Displacement Fade), `P.change_requests(rows)` to owners; apply only after
   agreement. Parity from the same BugItGo views (`P.parity_pair`). GATE: every `needs_eyes` pair
   judged by eye.
7. **Hitch pass.** `capture_plan("hitch")` cold then warm (cold only off-console);
   `P.hitch_snapshots(dir)`, each through `P.analyze_trace`; `P.camera_cut_spikes` on the route's
   cuts; unclassified frames go to a sampling profiler. GATE: zero snapshots on the cold route, no
   blocking load in gameplay, GC events under 2 ms, UObjects under 500k.
8. **Prove and guard.** Same route, build, device; three runs each; async compute as chosen; DRS
   locked and as shipped. `P.compare_runs` then `P.write_proof_report`. Guard with a nightly
   automated performance test trended in Horde (OZ26 [00:47:43]). GATE: verdict `stable_at_target`,
   "not tested" filled in.

## Numbers

| Item                     | Value                                                                                                                                                                      | Relative to, source                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Stage budget             | 16.67 ms each (33.3 at 30)                                                                                                                                                 | game, render, GPU, W4R [00:05:17]                     |
| Lumen GI and reflections | about 4 ms at 60, 8 at 30                                                                                                                                                  | frame delta, console High, OZ24 [00:37:55]; LVP       |
| Roughness threshold      | 0.4 default vs content near 0.35; 0.4 vs none 3x faster, imperceptible                                                                                                     | OZ26 [00:41:56]; W4R [00:33:42]                       |
| HWRT scene               | under about 100,000 active instances (consoles, LVP); Witcher: near field about 150 m, RT pool about 400 MB, update 0.5 ms async, about 40,000 dynamic triangles per frame | PS5, W4R [00:29:30] [00:30:37]                        |
| Async compute            | about 1.5 ms saved overall; reflections faster on graphics                                                                                                                 | PS5, W4R [00:20:42] [00:21:48]                        |
| Deep-water Lumen cull    | over 1 ms                                                                                                                                                                  | PS5, W4R [00:35:18]                                   |
| Resolution chain         | primary 800p to 1080p, secondary 1440p (66.67% of 4K), dynres 55 to 75%; secondary saved about 1 ms                                                                        | W4R [00:43:08]; OZ26 [00:15:48]                       |
| Streaming                | 5 ms engine default; 2.5 to 1.5 ms unified (40% less latency); 0.8 ms final; 51 frames request to visible in their example                                                 | OZ26 [00:25:25]; W4S [00:22:13] [00:23:55] [00:32:18] |
| Crowd                    | 300 to 200 NPCs: game thread 11.5 ms, 5 ms headroom                                                                                                                        | PS5, W4R [00:16:53]                                   |
| UObjects, GC             | under 500k good, over 1M wrong; GC 1 ms fine, 2 ms isolate, 10 ms investigate                                                                                              | HITCH [00:39:06] [00:39:39]                           |
| Spawns                   | one complex actor per frame                                                                                                                                                | low-end targets, HITCH [00:25:29]                     |

## Quality gates

Measurable: stage medians and every lean-route frame under 16.67 ms (NORSE [00:29:51]), percentiles
and VSync-miss share (OZ26 [00:45:55]); zero hitch snapshots cold; no unexplained `over` in
`P.feature_budget_check`; every changed cvar read back; deltas beyond run-to-run spread, same
hygiene. Visual: same-camera pairs for every trade; hitch-snapshot screenshots; views as locators
only. Full rubric: [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                 | What it looks like                                                   | Fix                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Profiling PIE                           | Blueprint and CPU costs inflated                                     | cooked Test build; editor for GPU triage only (FFW [00:04:29])                                                             |
| GPU ms with dynres on                   | GPU stays near budget while resolution drops                         | lock 75% (NORSE [00:44:40])                                                                                                |
| Async compute taken as given            | pass sums above the frame; a pass with nothing to overlap costs more | `r.RDG.AsyncCompute 0` only to attribute; per-feature A/B (W4R [00:21:48])                                                 |
| Blaming the longest bar                 | 34 ms of GameThreadWaitForTask                                       | follow to render, RHI or worker (KEN [00:16:30])                                                                           |
| Epic scalability on a 60 fps target     | `sg.*` print 3                                                       | level 2 in device profiles and editor settings (OZ26 [00:12:01])                                                           |
| `sg.ResolutionQuality=2`                | 2% resolution                                                        | it is a percentage [added]                                                                                                 |
| TSR straight to 4K                      | post passes at 4K                                                    | 1440p secondary, spatial upscale (W4R [00:42:33])                                                                          |
| Nanite Overdraw view first              | chasing white pixels                                                 | budget, Evaluate WPO, Pixel Programmable, Overdraw last (OZ24 [00:32:13])                                                  |
| Half a long shadow animates             | WPO foliage shadow split at a clipmap                                | raise `r.Shadow.Virtual.Clipmap.WPODisableDistance.LodBias` (OZ24 [00:46:49])                                              |
| VSM local lights over moving characters | dynamic pages invalidated every frame                                | A/B ray-traced shadows for those lights (AVW [00:26:25])                                                                   |
| Rain or deep water                      | Lumen reflection and water cost climb                                | re-read Performance Overview in rain, clamp roughness; water opaque-depth cutoff (OZ24 [00:40:40]; W4R [00:35:18])         |
| PSO blamed, or tested warm              | wrong fix; stutter "fixed" on the second run                         | classify by trace signature; cold runs with `-clearPSODriverCache`; consoles skip (PSO blog; HITCH [00:35:50])             |
| A wave spawned in one frame             | SpawnActor spike                                                     | cap per frame, Tick Animation On Skeletal Mesh Init, per-type pools (HITCH [00:25:29] [00:27:26])                          |
| Camera-cut spike                        | overdraw on the frame after a cut                                    | `r.Nanite.PrimeHZB` (5.7) [verify] (W4R [00:44:44])                                                                        |
| Many changes, one measurement           | gains cannot be attributed                                           | `ChangeLog`, one change per run                                                                                            |
| Density scaling on colliding foliage    | gameplay changes                                                     | non-colliding types only (FFW [00:32:48])                                                                                  |
| Complex collision by default            | per-poly queries on 2M-triangle fallbacks                            | Use Simple as Complex on day one, batch-update old meshes, Nanite fallbacks (OZ26 [00:07:23] [00:37:15]; HITCH [00:15:58]) |
| "Static" props left Movable             | a 20% drop from about 1,000 meshes                                   | mobility audit (ARG [00:11:54])                                                                                            |

## Handoffs

Receives builds and routes from scenario-unreal-pipeline-automation, content from every teammate.
Delivers a diagnosis report plus JSON change requests with measured deltas and parity screenshots:

- scenario-unreal-world-building: component counts, Packed Level Actors, ISM cell transformer,
  FastGeo, HLOD, mobility, collision, foliage distances.
- scenario-unreal-materials: masked, PDO and WPO Nanite materials, max WPO displacement,
  Displacement Fade, shading bins, After DOF translucency, decals.
- scenario-unreal-lighting-rendering: Lumen thresholds, RT scene and far field, Lumen Lite, VSM
  settings, ray-traced local shadows, DF shadows; signs off quality trades.
- scenario-unreal-gameplay: ticks, significance, spawns and pools, blocking loads, overlaps, UObject
  counts.
- scenario-unreal-animation: Animation Budget Allocator (registered components), AnimBP redundancy,
  MetaHuman LODs, crowd counts.
- scenario-unreal-vfx: Effect Types, pooling, Data Channels, GPU readbacks, shadowed lights in
  effects.
- scenario-unreal-cinematics: camera-cut hitches, cinematic scalability.
- scenario-unreal-pipeline-automation: device profiles, validators (blocking-load nodes, binding
  rule), nightly perf test.

## UE 5.8 notes

- New tools: `snapshothitches -start|-stop` (needs `stat default`), TraceQuery JSONL (schema
  [verify]), UObject Count counter, World Partition Insights (Spatial Profiler), `stat unit` VRAM on
  discrete GPUs only, ProfileGPU pipe waits and `r.ProfileGPU.TableFormatting 0` (rn58; TL part 2).
- Lumen Lite Beta at Medium; MegaLights Production Ready; VSM deferred invalidation budget; receiver
  masks default for directional lights since 5.7; Nanite Pixel Programmable Distance on foliage
  types; `r.Nanite.PrimeHZB` since 5.7.
- FastGeo and the 5.6 streaming cvars still Experimental (check the plugin browser).
- Mac: Apple Silicon only; Nanite and VSM Beta, Lumen HWRT and MegaLights Experimental (M2+);
  Insights has no ContextSwitch and no listed memory callstacks; GPU "why" in Xcode and Instruments
  (MOB).

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  disagreements and deciding conditions.
- [`references/procedures.md`](references/procedures.md): P0 to P11 plus P5b, P6b (suspect trees),
  P7b (streaming), P9b (camera cuts), with full code, test path and status.
- `references/critique.md`: rubric for captures, diagnoses, fixes and proof.
- [`references/gui-paths.md`](references/gui-paths.md): Insights, editor and Xcode paths for a
  computer-use agent.
- [`references/sources.md`](references/sources.md): sources, credentials, best timestamps, revision
  history.
- `scripts/ue_perf.py`: plans, A/B plans, trace analysis, suspect trees, parsers, config writers,
  proof, audits.
