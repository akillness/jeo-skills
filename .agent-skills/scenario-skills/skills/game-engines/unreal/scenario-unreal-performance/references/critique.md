# Critique rubric: judging a capture, a diagnosis, a fix and a proof

Load at every gate. The performance engineer's output is a claim ("the market route now holds 60
fps"); this rubric checks the claim the way the source experts would. Score each line 0 (missing or
wrong), 1 (present, weak), 2 (done, with evidence). Work top-down: an early failure (a dishonest
capture) makes everything after it moot. Numbers screen, eyes decide: a quality trade is never
accepted from metrics alone (scenario-unreal-expert protocol).

## A. The capture (is the evidence honest?)

| #   | Question                                          | Check in code                                                       | Pass when                                                                                           | Fix                                             | Source                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| A1  | Cooked build, right configuration?                | run hygiene `build`                                                 | Test (source engine) or Development (Launcher, or memory traces); never Shipping, never PIE for CPU | package via scenario-unreal-pipeline-automation | NORSE [00:41:39]; PKG            |
| A2  | Target hardware, or labeled proxy?                | hygiene `device`; `diagnose_bound(context={"mac_proxy"})` caveat    | console targets measured on a devkit; Mac numbers labeled proxy                                     | ask for devkit captures                         | ARI22 [00:04:49]; STAT           |
| A3  | Fixed route, same moments?                        | route.json, bookmarks in the trace                                  | bookmarks name every over-budget frame's place                                                      | P2 route, event track                           | NORSE [00:46:19]; FFW [00:03:59] |
| A4  | Lean for budget, rich for cause?                  | `capture_plan` purpose; `named_events`                              | budget numbers from a capture without named events                                                  | two captures                                    | NORSE [00:11:27]                 |
| A5  | Dev noise removed?                                | args contain `-NoVerifyGC`, `-handleensurepercent=0` in Development | yes, or the report says why not                                                                     | relaunch                                        | NORSE [00:13:35] [00:16:23]      |
| A6  | Resolution and async compute state known?         | hygiene `dynres`, `async_compute`                                   | GPU attribution: dynres locked, async off; proof: async on, both dynres views                       | relaunch                                        | NORSE [00:44:40] [00:45:12]; LVP |
| A7  | VSync and frame caps off for headroom numbers?    | hygiene `vsync`                                                     | off for measurement; the shipping experience measured separately                                    | `r.VSync 0`, `t.MaxFPS 0`                       | TL part 3                        |
| A8  | PSO cache state known (PC, Mac, mobile)?          | hygiene `pso_cache`                                                 | a cold run exists for smoothness claims                                                             | `-clearPSODriverCache`                          | HITCH [00:35:50]; PSO            |
| A9  | Enough runs to know the spread?                   | `compare_runs` table spreads                                        | at least 3 runs each side [added]                                                                   | re-run                                          | [added]                          |
| A10 | Thermal state known on Apple and mobile hardware? | `thermal.txt` or Metal System Trace                                 | nominal through the capture                                                                         | cool down, re-run                               | MOB [00:16:44]                   |

## B. The diagnosis (is the cause named, and on the right thread?)

| #   | Question                                              | Check in code                                         | Pass when                                                                                                                                                              | Source                                                     |
| --- | ----------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| B1  | Gap stated in ms per stage?                           | `diagnose_bound` gap_ms, excess_ms                    | every stage's median vs 16.67 in the report                                                                                                                            | W4R [00:05:17]; ARI22 [00:14:44]                           |
| B2  | Bound chosen from the stages, with caveats answered?  | `bound`, `caveats`                                    | RHIT verdicts confirmed on RHI and GPU tracks; "every stage under Frame" explained                                                                                     | KEN slide [00:22:58]; STAT                                 |
| B3  | Worst frame read without waits?                       | `analyze_trace` threads wait and busy, top timers     | top timer is non-wait, non-container, by exclusive time                                                                                                                | KEN [00:09:54]                                             |
| B4  | Cross-thread cause followed?                          | `propagated`, `render_over_frames`                    | a waiting game thread is attributed to render, RHI or the worker it waits on                                                                                           | KEN [00:16:30] [00:25:56]                                  |
| B5  | Instance counts compared with the screen?             | `counts`                                              | movement, traces, AnimBP updates per frame against visible characters                                                                                                  | NORSE [00:24:20] [00:25:24]                                |
| B6  | GPU passes bucketed without double counting?          | `gpu_pass_table` buckets, same_name                   | same-name passes summed; Nanite raster in shadow depths counted as VSM                                                                                                 | FFW [00:12:15]; OZ24 [00:47:52]                            |
| B7  | Lumen judged by delta, not pass sums?                 | `lumen_delta`                                         | delta at or under 4 ms at 60 (8 at 30), or the overrun is a finding                                                                                                    | OZ24 [00:37:55]                                            |
| B8  | View modes used as locators after a measurement?      | views screenshots listed with the bucket they explain | no finding rests on a view alone                                                                                                                                       | OZ24 [00:32:13]                                            |
| B9  | Scalability level and profile verified at runtime?    | `parse_cvar_readback` LastSetBy                       | `sg.*` at 2 set by the device profile on a 60 fps console target                                                                                                       | OZ26 [00:11:00] [00:16:50]; SCAL                           |
| B10 | Hitches classified by signature, not assumed PSO?     | `analyze_trace` categories on snapshots               | each hitch group has a category, evidence timer and screenshot                                                                                                         | HITCH; PSO blog                                            |
| B11 | Niagara judged per thread against the target's cores? | `analyze_trace` niagara; `stat NiagaraOverview`       | GT, GT concurrent and RT reported; core count stated                                                                                                                   | NIA [00:04:41] [00:05:15]                                  |
| B12 | Nanite read through the tree?                         | `nanite_triage` steps                                 | budget stated; Evaluate WPO and Pixel Programmable before Overdraw; helper lanes and non-empty shading bins reported                                                   | OZ24 [00:29:18] to [00:36:46]; W4R [00:28:20]              |
| B13 | VSM read by invalidation type?                        | `vsm_triage`; `stat_sequence("vsm")` read-backs       | static vs dynamic invalidations compared; receiver mask, WPO clipmap LOD bias and 5.8 deferred invalidation budget printed; local lights crossed by characters counted | OZ24 [00:46:49] [00:48:59]; W4R [00:37:50]; AVW [00:26:25] |
| B14 | HWRT scene measured against numbers?                  | `feature_budget_check` rt_* keys                      | active instances, RT pool, scene update ms and dynamic triangles each compared, source project named                                                                   | LVP; W4R [00:29:30] to [00:32:11]                          |
| B15 | Waits and unexplained frames handled?                 | `analyze_trace` game_wait, advice                     | game-thread waits reported as reclaimable budget; unclassified slow frames sent to a sampling profiler                                                                 | W4R [00:16:20]; NORSE [00:17:30]                           |
| B16 | Camera cuts and spawns on the route?                  | `camera_cut_spikes`, `spawn_bursts`                   | every cut checked on the frames after it; spawn bursts counted per frame                                                                                               | W4R [00:44:44]; HITCH [00:25:29]                           |

## C. The fixes (right lever, right owner, one at a time?)

| #   | Question                                                   | Pass when                                                                                                                    | Source                                                  |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| C1  | Biggest measured item first, cheapest large wins early?    | changes ordered by measured ms; config-first wins before content surgery                                                     | ARI22 [00:07:46]; NORSE [00:23:46]                      |
| C2  | One change per measurement?                                | every `ChangeLog` entry has before and after ms from comparable runs                                                         | OZ digest P7.4                                          |
| C3  | Content fixed before band-aids?                            | experimental cvars (async physics init, incremental GC) only as A/B, never the shipped fix                                   | HITCH [00:22:56] [00:41:56]                             |
| C4  | The spiking feature throttled rather than the whole frame? | VSM throttling, secondary percentage, local scalability before lowering the dynres floor                                     | W4R [00:38:55] [00:43:08]                               |
| C5  | Owner in the loop?                                         | content changes sent as change requests to the owning teammate; applied only after agreement                                 | [added protocol]                                        |
| C6  | Gameplay-safe?                                             | density scaling only on non-colliding foliage; overlaps off only where no listener; collision simplification play-tested     | FFW [00:32:48]; HITCH [00:18:07]                        |
| C7  | Config written safely?                                     | ini backed up before writing; groups in `*Scalability.ini`, levels in profiles; read back after launch                       | SCAL; project rule                                      |
| C8  | Platform-correct?                                          | no PSO work for consoles; PSO strategy for PC, Mac and mobile; `r.GTSyncType` per platform                                   | PSO blog; OZ26 [00:09:27]                               |
| C9  | Async compute measured, not assumed?                       | per-feature A/B (`ab_plan(ASYNC_AB_VARIANTS)`, `ab_verdict`); a pass moved back to graphics when it measured faster          | W4R [00:20:42] [00:21:48]                               |
| C10 | Streaming judged by latency too?                           | request-to-visible frames on a top-speed traversal; Experimental streaming cvars only as A/B                                 | W4S [00:22:13] [00:35:08]; HITCH [00:12:30]             |
| C11 | Prevention in place?                                       | collision simple by default, overlaps NeverUpdate while streaming, Nanite fallbacks set, a validator for blocking-load nodes | OZ26 [00:07:23] [00:37:15]; HITCH [00:18:56] [00:45:16] |

## D. The proof (does the claim hold?)

| #   | Question                                           | Check in code                                                              | Pass when                                                         | Source                           |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| D1  | Same route, build, device and settings both sides? | `compare_runs` gate G4                                                     | pass                                                              | NORSE [00:45:47]                 |
| D2  | Every frame under budget on the lean route?        | G1                                                                         | max at or under target (or p99, stated as the weaker gate)        | NORSE [00:29:51]                 |
| D3  | No hitches?                                        | G2                                                                         | zero frames over two budgets and zero snapshots on the cold route | W4R [00:44:11]; rn58             |
| D4  | Each stage under budget?                           | G3                                                                         | game, draw and GPU medians under target                           | W4R [00:05:17]                   |
| D5  | Delta larger than noise?                           | table `within_noise` False                                                 | pass                                                              | [added]                          |
| D6  | Visual parity reviewed by eye?                     | G5; `parity_pair` needs_eyes pairs reviewed                                | every trade accepted or invisible                                 | ARI22 [00:18:05]; FFW [00:21:43] |
| D7  | Shipping view reported?                            | after runs with dynres as shipped; `dynres_mean`                           | mean screen percentage stated; headroom shown with dynres locked  | NORSE [00:44:40]                 |
| D8  | Regression guard in place?                         | nightly automated route test handed to scenario-unreal-pipeline-automation | exists or listed as open                                          | OZ26 [00:47:43]                  |

## E. The report (does it match reality?)

- States the verdict first, then the gap closed per change with its owner.
- Lists what was not tested: other hardware, GPUs, drivers, thermals over time, other scenes, cold
  PSO cache where relevant, console builds when only a Mac ran.
- Separates measured numbers from source figures (a Witcher 4 PS5 number is context, not this game's
  result).
- Marks every UE name, flag and cvar that was not confirmed on the installed engine as [verify].

## Reviewing an answer to "38 fps to a stable 60" (scenario U9)

A complete answer, in this order: the gap in ms and why fps is the wrong unit; the honest capture
(cooked build on the devkit, route, lean and rich captures, dynres lock and async compute for
attribution only, dev-noise flags, the Mac being a proxy); classification with `stat unit` then
Insights, waits excluded and cross-frame propagation; config-first wins (Epic to High, the 60 fps
device profile actually selected, resolution chain with secondary 1440p, Lumen roughness and foliage
thresholds, GTSyncType, streaming budgets); GPU suspects with their measurement (Lumen delta, RT
instances, pool, update ms, near and far field, VSM depth and projection read by invalidation type
with WPO foliage, receiver masks and overlapping lights, the Nanite tree with Overdraw last,
translucency After DOF, decals, deep water, DF shadows, Niagara readbacks, async compute A/B per
feature); CPU suspects (crowd count and significance, game-thread waits as budget, animation budget,
AnimBP redundancy, MetaHuman LODs, collision and overlaps, streaming components and latency, GC by
UObject count, blocking loads, spawn bursts); a separate hitch pass (snapshothitches, signatures,
camera cuts, a sampling profiler for what Insights cannot explain; no PSO work on a console); proof
with repeated runs, percentiles and VSync-miss share, zero hitches, visual parity, and a nightly
guard. Missing any of the first three sections is a fail regardless of how good the suspect list is.
