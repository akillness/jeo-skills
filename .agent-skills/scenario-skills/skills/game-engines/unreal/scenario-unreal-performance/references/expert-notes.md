# Expert notes: principles and judgment by expert

Distilled from `notes/optimization/`, `notes/profiling/`, `notes/packaging/`, the Niagara
optimization digest and note, and the Lumen/VSM performance note. Codes as in `sources.md`.
Timestamps point into the talk; a slide or frame timestamp is marked "slide" or "frame". [added]
marks this skill's own inference. Status of anything that touches a UE name: [verify] on 5.8.

## Matt Oztalay, Epic DevRel: "Start your project at 60 fps and keep it there" (OZ26, UE 5.8)

- **Day zero, first changelist.** Frame target and its config go in CL1; retrofitting device
  profiles mid-production is much harder [00:05:36] [00:16:18].
- **Defaults are for beginners.** A 60 fps project turns expensive things off by default and opts
  in: complex collision, WPO evaluation on primitives [00:07:54] [00:08:25] [00:08:56].
- **Three settings and a bonus:** block UMG property bindings (they run every frame) [00:06:21]
  [00:06:52]; default collision to simple so queries do not hit 2M-triangle Megascans fallbacks
  [00:07:23]; an empty editor startup map [00:07:54]; `r.GTSyncType` 0 PC, 1 mobile, 2 Gen9 consoles
  [00:08:56] [00:09:27].
- **Everyone looks at High.** Epic scalability is the 30 fps mode; set every group to 2 in
  `DefaultEditorSettings.ini` so the team judges the 60 fps game [00:11:00] [00:12:01].
- **Something must select the profile.** The engine does not activate a 60 fps device profile by
  itself: selector plugin, Lyra's local settings, selector modules [00:16:50] [00:17:21].
- **Secondary scaling above all.** Render resolution-dependent work at 800p to 1080p, TSR to 1440p,
  spatial upscale to 4K with UI at full size; TSR works up to about 2x [00:13:38] [00:14:10]
  [00:14:41]. His profile: dynres 55 to 75 percent "my 800 to 1080 of 1440", frame budget 16 or
  16.66 [00:15:48]. He says 75 for the secondary percentage; 1440/2160 is 66.67 [added arithmetic].
- **Streaming:** the default AddToWorld budget is 5 ms, "a lot out of 16"; put reduced budgets in
  device profiles [00:25:25]. "Use it, please": FastGeo, because a static mesh actor still costs an
  actor and a component [00:23:19]. Packed Level Actors are actors: their bounds choose the cell, so
  an oversized PLA is always loaded [00:24:54].
- **Nanite and materials:** set fallback LODs on every Nanite mesh (they feed ray tracing, complex
  collision, HLOD, non-Nanite platforms) [00:37:15]; cap WPO with max displacement, Displacement
  Fade on every tessellated material, WPO disable and pixel programmable distances [00:37:47]
  [00:38:17]; fewer shading bins through Custom Primitive Data and MPCs [00:38:48]; 5.8 per-instance
  usage flags cut permutations [00:39:20].
- **Lumen:** HWRT is the confident path; content often sits near roughness 0.35 while the trace
  threshold is 0.4, so nearly every pixel traces dedicated reflection rays: lower it, foliage to 0
  [00:41:25] [00:41:56].
- **VSM:** projection cost follows light softness and SMRT settings; caching helps but is not the
  whole answer; resolution LOD bias per device profile [00:42:56] [00:43:27]. MegaLights: overlap
  mostly costs noise, not time; non-MegaLights shadowed lights stay expensive [00:42:26] [00:42:56].
- **Keep it:** validators and asset reference restrictions at creation [00:46:25]; daily automated
  performance tests (UAT, Gauntlet, Horde dashboard) [00:47:43]; budgets defined early: fps, VSync
  miss percentage, dynres, ms per system [00:45:55].

## Matt Oztalay: "Optimizing UE5" (OZ24, UE 5.4)

- **Budget first.** "What's your Nanite budget?" before debugging Nanite [00:29:18].
- **Nanite decision tree:** VisBuffer, split fixed-function from programmable raster
  (`r.Nanite.ShowMeshDrawEvents 1`, needed only up to 5.4), then Evaluate WPO, Pixel Programmable,
  then fixed-function and overdraw; base pass over budget means shading bins (NaniteStats, total
  minus empty) or expensive materials [00:29:52] to [00:36:46].
- **A view is a locator, not a verdict:** overdraw white pixels do not mean a problem [00:32:13];
  real causes are long thin triangles and interpenetrating meshes; greebles on flat surfaces are
  fine [00:32:46] to [00:36:03].
- **Lumen budget by delta:** turn GI and reflections off; the frame should be about 4 ms faster at
  60 fps, 8 at 30; pass sums mislead because Lumen runs async on consoles [00:37:22] [00:37:55]
  [00:38:27].
- **Shrink the Lumen scene:** take objects out with Visible in Ray Tracing off and Affect Dynamic
  Indirect Lighting off [00:38:27]. Affect Distance Field Lighting only matters for software tracing
  [added, from LVP's SWRT section].
- **Reflections:** Performance Overview view, foliage threshold 0, lower threshold (0.2 tried),
  clamp puddle roughness in the material; wet weather silently lowers roughness [00:39:00] to
  [00:40:40].
- **VSM starts at the Nanite VisBuffer** (same raster) [00:47:52]; half a long shadow animating =
  WPO disable distance with a too-low clipmap LOD bias
  (`r.Shadow.Virtual.Clipmap.WPODisableDistance.LodBias`, 2 to 4 typical) [00:46:49]. Read pages and
  invalidations on screen (`r.ShaderPrintEnable 1`, `r.Shadow.Virtual.ShowStats 2`) and decide
  whether to chase static or dynamic invalidation [00:48:59]; objects past their WPO disable
  distance return to static caching [00:43:59] [00:44:33].
- **Virtual textures:** SVT saves memory for a marginal cost, RVT saves time for memory [00:07:59];
  right-size pools from high water marks (Hillside: 2,000 MB pool, 95 MB needed) [00:15:47]; mapped
  requests climbing in a static scene = thrashing [00:20:54].

## Kevin (Epic) and CD Projekt Red: "Road to 60 fps", Witcher 4 demo (W4R, UE 5.6, PS5)

- **Budget per stage:** 16.6 ms to simulate, 16.6 to prepare, 16.6 to render, pipelined game N,
  render N-1, GPU N-2 so one-frame open-world hitches are absorbed [00:05:17] [00:08:26].
- **Get work off named threads:** Mass ticking, parallel animation (400 graphs, 54 ms of worker
  work, 2.6 ms GT finalization), parallel Mover, parallel RHI translation [00:12:30] to [00:15:14];
  about 2 ms of GT waits on finalization is reclaimable budget [00:16:20].
- **Crowd count is the big CPU lever:** 300 to 200 NPCs gave an 11.5 ms game frame with 5 ms
  headroom [00:16:53] [00:17:27].
- **Async compute is per content:** A/B it (1.5 ms saved overall), but moving Lumen reflections back
  to graphics saved time; disable async to read passes [00:20:42] [00:21:48].
- **Nanite hygiene:** helper lanes near zero, avoid programmable materials, tight tessellation
  displacement, Nanite mask view "green is good" [00:27:48] to [00:29:24].
- **HWRT budget:** near field about 150 m, RT pool about 400 MB (peak 300), scene updates about 0.5
  ms async, dynamic triangles staggered near 40,000 per frame for the nearest characters only, trees
  not animated in the RT scene, lower landscape LOD in RT with time-sliced updates, skin cache tied
  to RT updates, foliage RT proxies down to 225 triangles (fine for indirect light and occlusion),
  static occlusion-only far field [00:29:30] to [00:32:11].
- **Roughness threshold 0.4 vs none:** about 3x faster, imperceptible [00:33:42]. Single Layer Water
  traces dedicated rays and lights what is underneath: the opaque-depth cutoff saved over 1 ms in
  deep water, nothing in shallow creeks (setting name not given) [00:34:47] [00:35:18].
- **VSM:** receiver masks (pages split into 64 tiles; default for directional lights since 5.7),
  static caching of distant non-animating trees, runtime bounds for non-Nanite skinned meshes
  recomputed in the skin cache [00:37:50] to [00:39:27].
- **Throttle the feature, not the frame:** VSM throttling beats dynres absorbing shadow spikes
  [00:38:55]; secondary screen percentage saved about 1 ms at 4K [00:43:08].
- **Hitches are separate:** dynres only looks at past frames; camera cuts lose occlusion history, so
  prime it (5.7 `r.Nanite.PrimeHZB`, Experimental) and check the Nanite overdraw view on the frame
  after a cut [00:43:38] [00:44:44] [00:45:16].

## Richard Malo (Epic) and CD Projekt Red: streaming for dense worlds (W4S, UE 5.4 to 5.6)

- **Streaming is a budget respected in all cases** [00:04:07]; three separate budgets waste time,
  unified 2.5 to 1.5 ms gave 40% less latency, final demo 0.8 ms [00:19:58] [00:23:55] [00:32:18].
- **Measure latency in frames** (51 frames request to visible in the example) and test with a drone
  at top speed that blocks on slow loading [00:22:13] [00:33:26] [00:35:08].
- **Attack order:** component count (ISM cell transformer), async physics state (three 5.6
  experimental cvars), concurrent levels, unified budget, FastGeo (91% of components converted),
  texture streaming registration (Simple Streamable Asset Manager, worth it even without FastGeo)
  [00:12:38] to [00:40:11].
- **Actor descriptor mutators** assign grids by folder, tag or bounds without checking content out,
  so splits can be A/B tested [00:06:19] [00:07:29]. Transformers are unvalidated: add logging
  [00:13:11].

## Ari Arnbjörnsson and Matt Oztalay: "Profiling with Purpose", Norse (NORSE, UE 5.6, Xbox Series X)

- **"Give us captures":** Insights for CPU, a GPU capture tool for GPU (PIX, Razor or the platform
  tool on a devkit) [00:05:47] [00:06:29] [00:42:12].
- **When Insights cannot explain a hitch, sample:** run a sampling profiler alongside it (PIX for
  Windows, Superluminal, vendor tools on consoles, mobile and XR); sampling in Insights was beta in
  5.7 and 5.8 lists a Windows-only `StackSampling` channel [00:17:30] to [00:18:58].
- **Launch flags:** `-trace=default,task` [00:08:37]; `-statnamedevents` about 20% overhead, off for
  "are we on target" [00:11:27]; `-NoVerifyGC` (GC verification doubles GC in Development)
  [00:13:35]; `-DPCVars=` beats `-ExecCmds` for cvars (before init, even read-only) [00:14:13];
  `-LogCmds="LogGarbage verbose"` [00:15:18]; `-handleensurepercent=0` (each ensure about 1 s,
  invisible in Insights) [00:16:23].
- **The loop:** click a bar over the line, find why, fix, next; every line green is a stutter-free
  60 [00:29:20] [00:29:51]. Fattest block first [00:23:46]; count calls per frame against what is on
  screen: 500 raycasts, CharacterMovement ticking for enemies of later encounters (2.5 to 0.5 ms),
  SetGender on 60 characters when 2 are present [00:24:20] to [00:26:25].
- **Named events reveal hidden redundancy:** 16 identical downward raycasts per character in an
  AnimBP, 90% of its time [00:12:28]. MetaHuman LOD0 is for virtual production: LOD1 at most in
  games (a 5.1 ms head AnimBP on tiny characters) [00:28:14] [00:28:49].
- **Physics and streaming:** complex collision is on for every mesh and built from LOD0 or the whole
  Nanite mesh without fallbacks [00:38:20] [00:38:53]; a WP cell took 23 s to add; ISMs with many
  physics instances make 26 to 28 ms frames because streaming checks its budget only after batches
  [00:30:55] [00:33:06]; PrePhysics to DuringPhysics is "a bandage on an infection" [00:30:22].
- **GPU capture hygiene:** lock dynres (`r.DynamicRes.TestScreenPercentage 75`),
  `r.RDG.AsyncCompute 0` "so there's nowhere to hide", `r.RHISetGPUCaptureOptions 1` [00:43:17] to
  [00:45:45]. Triage: one big number, many little numbers, numbers where they should not be
  [00:47:25].
- **GPU culprits:** translucency After DOF renders at full output resolution even at 75% dynres
  [00:48:38] [00:49:03]; overlapping shadowed lights appear in VSM projection mask bits [00:49:35];
  96 Niagara readbacks hide in Visibility Commands (2 ms, ocean off screen) [00:51:16]; custom depth
  drawing programmable Nanite content [00:52:44]; masked foliage pays in VisBuffer, VSM and custom
  depth [00:53:48]; masked never falls back to fixed function, opaque plus WPO disable distance
  does; crop tightly and use the Pixel Programmable Disable Distance [00:54:22] [00:54:57].
- **Repeatability:** save files, BugIt/BugItGo, a cinematic timestamp jump [00:45:47] [00:46:19]. GC
  heuristic: about 100k UObjects normal, 500k to 1M wrong [00:15:51].

## Ari Arnbjörnsson: "The Great Hitch Hunt" (HITCH, UE 5.5 and 5.6, 18 studios)

- **What, why, how; never random checkboxes** [00:03:32] to [00:04:40]. Every hitch family can
  happen during level streaming [00:07:04].
- **Static geometry should not be actors:** 198,777 actors in an outliner [00:07:34]; PLA first,
  PCG, ISM tools, foliage, the WP ISM cell transformer (PIE and cook time, originals gone at
  runtime) [00:08:40] to [00:11:26].
- **Physics:** Nanite detail does not transfer to physics [00:14:39]; one ISM component with
  thousands of complex-collision instances hitches whatever the budget [00:15:12]; Use Simple as
  Complex by default and batch-update old meshes [00:15:58]; shape order sphere, capsule, box,
  convex [00:16:30]; `DefaultUpdateOverlapsMethodDuringLevelStreaming=NeverUpdate` [00:18:56];
  "Chaos is slow" means check the Chaos Visual Debugger [00:21:20].
- **Band-aids hide growth:** async physics init and incremental reachability spread cost; test as
  A/B, do not ship them yet [00:22:56] [00:41:56].
- **Spawning is not incremental:** one complex spawn per frame on low end, "Tick Animation On
  Skeletal Mesh Init", per-type pools [00:25:08] to [00:27:26].
- **PSO:** any PC or mobile game on DX12, Vulkan or Metal needs a strategy (slide [00:32:34]);
  precaching since 5.3, loading screen until `NumPrecompilesRemaining()` is 0 [00:33:33]; precaching
  compiles 3 to 5 times the used permutations, a bundle only brings it to 2 to 4 [00:35:14]
  [00:35:50]; always test with `-clearPSODriverCache` [00:35:50].
- **GC:** thresholds under 500k good, over 1M to 2M wrong; GC 1 ms fine, 2 ms isolate, 10 ms
  investigate; `obj list -countsort`; manual GC at still moments [00:39:06] [00:39:39] [00:40:11].
- **Blocking loads:** hundreds of ms up to a second "is almost certainly this"; signature
  `LoadClassAsset_Blocking` > `LoadObject` > `LoadPackageInternal` > `FlushAsyncLoading` [00:43:07]
  [00:45:50]; ban the nodes with validators (CommonValidators) [00:45:16].
- **Content:** tick less, LOD everything, significance; BeginPlay is incremental for streamed levels
  [00:47:14] to [00:48:27].

## Ari Arnbjörnsson: "Maximizing your game's performance" (ARI22, UE 5.0/5.1)

- **The budget is money:** consoles can spend almost all of it, PC needs leeway, mobile needs
  thermal and battery leeway [00:04:49] to [00:05:53].
- **Profile twice, fix once;** stop when the offender no longer shows up [00:09:51] [00:19:14];
  report in ms, "milliseconds are always true" [00:14:44].
- **Cases:** shadowed point lights with 5,000-unit radii (frame to 12.96 ms, visually identical
  after radius 100 and shadows off) [00:17:33] to [00:18:40]; a sync load after an async level load
  caused a 3 s `FlushAsyncLoading` [00:22:47] [00:27:22]; translucent fog at opacity 0.01 took 136
  ms After DOF [00:31:07]; leaks found in under a minute with a memory trace and
  `gc.CollectGarbageEveryFrame 1` [00:35:40] [00:37:17]. `WaitUntilComplete` bumps priority without
  a full flush [00:28:17].

## Ken Kuwano, Epic Games Japan: "Mastering performance analysis with Unreal Insights" (KEN, UE 5.6)

- **stat unit detects, Insights explains;** task graph and I/O bottlenecks do not show in stat unit
  (slide [00:35:51]).
- **Reading order:** Frames panel, sort by time, longest thread, longest non-wait marker, Timers and
  Callees [00:07:37] to [00:12:09]. Exclude idle and wait markers [00:09:54]: a 286 ms tick was 280
  ms of Frame Sync while the RHI thread spent 193 ms in `DeleteRHIResources` (slide [00:09:24]).
- **Cross-frame propagation:** render frame 600 at 51.9 ms makes game frame 601 show 34.5 ms of
  `GameThreadWaitForTask` [00:16:30].
- **One recipe per question:** game thread `cpu,frame,assetloadtime -statnamedevents`; render
  `cpu,frame,rendercommands,rhicommands,rdg`; GPU `cpu,gpu,frame`; workers `cpu,frame,task`; context
  switches (Windows admin); I/O `cpu,file,assetloadtime,loadtimes,iostore` (slides [00:10:22] to
  [00:31:46]).
- **GPU:** fix resolution and disable async compute to measure a pass [00:20:10]; GPU Wait is not
  idle work; long waits mean the CPU is not feeding it [00:21:19]. Render thread longer than GPU =
  render-thread bound [00:18:09].
- **Loading:** the game thread never reads files; look at AsyncLoadingThread, IoDispatcher,
  IoService and the package table [00:31:53] [00:33:39]. Prefer mature features: "new features may
  not be optimized yet" (slide [00:38:48]).

## Tom Looman: Far Far West GPU pass and articles (FFW, TL; UE 5.7 and 5.8)

- **Know what drives a pass** before judging its number [00:04:59]; sum same-name timers per frame
  ("Decals" appears twice) [00:10:37] [00:12:15]; a long compute block can be a wait [00:07:00].
- **Nanite "gets murdered" by non fixed-function content** [00:22:44]: PDO removal took VisBuffer
  5.5 to 3.7 ms [00:21:43]; masked to opaque where the mesh follows the leaf, fixing alpha fringes
  [00:25:31]; pixel programmable distance pops on loose silhouettes (birch at 2,000 units)
  [00:30:49]; density scaling only on non-colliding foliage, set on the foliage type [00:32:48]
  [00:35:58].
- **Decals** cost by screen coverage, double with emissive, full cost from the first faded-in pixel
  [00:39:12] [00:40:45]; `r.Decal.FadeScreenSizeMult`, `r.DetailMode` [00:43:26] [00:44:28].
- **Defaults "to be easy, not fast":** DF shadows next to VSM (`r.DistanceFieldShadowing 0`)
  [00:52:59]; SLW on a mega plane never culls (0.3 ms invisible) and its depth prepass is on
  whenever VSM is supported [00:54:06] [00:56:17]; turning a feature off project-wide also removes
  shaders and PSOs [00:59:21]. Near a release, stay off experimental features [00:15:55].
- **5.8 highlights (TL part 2):** snapshot hitches, World Partition Insights, UObject Count counter,
  `stat unit` VRAM, ProfileGPU pipe waits and `r.ProfileGPU.TableFormatting 0`, Lumen Lite at
  Medium, MegaLights Production Ready, VSM deferred invalidation budget, Nanite pixel programmable
  distance on foliage types, FastGeo still Experimental.
- **Part 3 (UE4-era checklist):** find the bottleneck first; packaged build, `r.vsync 0`,
  `t.maxfps 0`; `r.ScreenPercentage 20` and `pause` splits; `dumpticks grouped`, `listtimers`; much
  of the rest (stationary lights, occlusion queries, CSM) does not apply to Nanite, Lumen and VSM
  content.

## Matthew Campbell, Obsidian: Avowed GPU retrospective (AVW, UE 5.3.2, Xbox Series S)

- **Local-light VSMs and moving characters:** every dynamic object crossing a shadowed local light
  invalidates its pages; the static/dynamic cache split fixes it at double the VSM memory,
  unaffordable on console. Ray tracing pays only for visible pixels and was already paid for by HW
  Lumen; the more characters inside local lights, the more ray-traced shadows win [00:26:25]
  [00:26:57] [00:31:42]. Their local-light pass was a custom engine change; in stock 5.8 the
  comparable options are per-light ray-traced shadows or MegaLights [added, verify].
- **Penumbra costs:** soft VSM shadows sample the map several times; they exposed a smaller source
  radius for 60 Hz modes [00:24:24] [00:26:01].
- **Honest profiling:** dynamic resolution off during development, async compute off when timing a
  pass, fixed benchmark hardware [00:38:05] to [00:39:10].

## Alexis Argyriou, The Bureau: lighting that scales (ARG, UE 5.3)

- **Mobility audit first:** nearly 1,000 "static" meshes (a whole building) were Movable or
  Stationary, the main cause of the worst spot's 20 percent drop [00:09:42] [00:11:54].
- **Hidden shadowed lights in effects:** Niagara systems casting shadowed lights (embers, fire,
  marketplace effects) [00:12:28].

## Adam Kiraly, Tanglewood: "Optimizing Niagara" (NIA)

- **Optimize the world, not the effect;** Effect Types are the backbone and the first fix: 227 to
  103 active systems, RT 5.07 to 1.51 ms, "looks exactly the same" (frame [00:20:58]; [00:21:21]).
- **Read GT Concurrent against the target's core count** (he limits affinity to 4 cores) [00:04:41]
  [00:05:15]; every GPU system costs a render-thread dispatch, visible or not [00:05:47]; no named
  events, no Niagara in Insights [00:10:52].
- **Presets:** one-shot (Spawn Only, Kill and Clear, instant cull, cap 15) and persistent critical
  (Continuous, Asleep, 1 s delayed cull, cap 5) [00:22:26] to [00:25:07]; significance refresh
  spiked about 30 ms with 7,000 systems on one type [00:19:44]; lightweight footsteps GT 1,387 to
  271 us (frame [00:39:43]); Data Channels for high-volume impacts [00:45:15].

## Paul, Epic mobile TPM: platform-native tools (MOB, UE 5.8)

- **Insights finds where, the platform tool finds why** [00:06:00]; sampling for your own functions,
  vendor GPU tools for limiters [00:07:05].
- **Metal System Trace** shows shader compiles, drawable waits, GPU performance state and thermal
  state [00:14:06] to [00:18:17]; know the thermal state during every capture [00:16:44].

## Epic documentation

- **PSO blog and docs (PSO):** consoles have no PSO hitches (one GPU); precaching is primary since
  5.2; `r.PSOPrecache.Validation` 1 shippable, 2 detailed; `stat PSOPrecache`;
  `-clearPSODriverCache -corelimit=8 -processaffinity=8`; runtime hitch threshold 20 ms; Fortnite
  precaches about 30,000 PSOs and uses about 10,000; keeping PSOs alive can cost over 1 GB.
- **Scalability and device profiles (SCAL):** groups map to `[Group@Level]` sections; change
  contents in `*Scalability.ini`, select levels in profiles; typing a name without a value prints
  the value and where it was last set; printed per-level values are UE4-era, read
  `BaseScalability.ini`.
- **Lumen and VSM performance (LVP):** Epic = 30 fps console, High = 60, Medium = Lumen Lite, Low =
  no Lumen, each about half the cost of the level above; about 4 ms at 1080p for 60 fps; under 100k
  RT instances; profile with async compute off, ship with it on; VSM depth cost is the fight,
  projection is a quality slider; SSR swap saved 1 ms on Series S.
- **Insights reference (INS):** channel table (ContextSwitch Windows and consoles only; memory
  callstacks not listed for Mac); memory tracing from process start in Development builds;
  `Trace.Bookmark`, `Trace.Screenshot`, `Trace.SnapshotFile`; store at `~/UnrealEngine/UnrealTrace`
  on macOS.
- **Stat fundamentals (STAT):** Frame close to Game or Draw names the bound; GPU and RHIT follow
  Frame; visible section count is the render thread's main driver; `stat startfile` is legacy.
- **Packaging (PKG):** cook by the book for performance tests; Test keeps profiling tools with all
  optimizations; a project-only (Launcher) engine offers DebugGame, Development and Shipping for
  Game; Shipping strips stats and profiling.
- **Animation Budget Allocator (anim docs,
  `sources/docs/animation-characters__animbp-architecture-performance.md`):** use it instead of URO;
  `a.Budget.Enabled` is on by default and acts only on components registered with the budgeter
  (Enable Animation Budget node, Auto Register); `a.Budget.Debug.Enabled` toggles the overlay.
- **Dynamic resolution mode [added, engine knowledge, verify]:** `r.DynamicRes.OperationMode 2`
  enables it regardless of GameUserSettings; 1 follows GameUserSettings and can leave the safety net
  off. The OZ26 and W4R profiles use 2.
- **`stat unit` VRAM (TL part 2):** used and budget, on discrete GPUs only, so of little use on a
  console or Apple Silicon.

## Disagreements and the condition that decides

| Topic                                  | Position A                                              | Position B                                                                            | Deciding condition                                                    |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Named events                           | "More data is never bad" (ARI22 [00:20:53])             | about 20% overhead (NORSE [00:11:27])                                                 | "on budget?" lean, "why?" rich                                        |
| Async compute while profiling          | off, nowhere to hide (NORSE [00:45:12])                 | keep on, read graphics and compute tracks (FFW [00:06:30])                            | attribution vs real frame time; proof always with async on            |
| Resolution while profiling             | lock dynres at 75% (NORSE [00:44:40])                   | native, no upscaler (FFW [00:01:03])                                                  | console ships with DRS; PC upscaling is a user option                 |
| Where to profile                       | cooked build on target (NORSE [00:41:39])               | editor fine for a GPU look (FFW [00:02:19])                                           | CPU and Blueprint need cooked; GPU triage in editor, confirm cooked   |
| Masked foliage                         | crop and pixel programmable distance (NORSE [00:54:57]) | pops on loose silhouettes; remodel, opaque, or non-Nanite (FFW [00:30:49] [01:02:37]) | silhouette quality and whether assets can be remodeled                |
| Nanite Foliage (voxels, skeletal wind) | Witcher 4 uses it (W4R [00:24:32])                      | avoid near release, experimental (FFW [00:15:55])                                     | risk tolerance and ship date                                          |
| FastGeo status in 5.8                  | beta, "use it" (OZ26 [00:04:00] [00:23:19])             | still Experimental (TL part 2; rn58)                                                  | plugin browser in the installed engine                                |
| Async compute placement                | all Lumen async when overlap is blocked (LVP)           | reflections back to graphics saved time (W4R [00:21:48])                              | whether graphics has work to overlap: A/B only                        |
| What absorbs GPU spikes                | dynres (OZ26 device profile)                            | throttle the spiking feature (W4R [00:38:55])                                         | broad gradual variation vs one feature spiking                        |
| PSO bundle with precaching             | small bundle for early global PSOs (PSO doc)            | "might not be worth it" (HITCH [00:35:50])                                            | scope: global graphics PSOs vs general content                        |
| Detail streaming                       | many finer grids by mutators (W4S [00:08:04])           | runtime hierarchical PCG (OZ26 [00:22:48])                                            | hand-built kit content vs procedural scatter                          |
| Experimental helpers                   | try edit/cook-time ones (HITCH [00:11:57])              | prefer mature features (KEN slide [00:38:48])                                         | runtime vs edit/cook time, and status in the installed version        |
| Budget use                             | consoles spend almost all (ARI22 [00:04:49])            | hit target at 75% dynres (NORSE [00:44:40])                                           | fixed hardware vs headroom policy                                     |
| Local-light shadows                    | VSM (default)                                           | ray traced when characters move through the lights (AVW [00:26:25] [00:31:42])        | number of movers inside shadowed local lights and VSM memory headroom |
