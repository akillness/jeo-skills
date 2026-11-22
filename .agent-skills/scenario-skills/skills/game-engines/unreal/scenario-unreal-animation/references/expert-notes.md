# scenario-unreal-animation: expert notes (judgment by expert)

Principles and reasons, attributed with source and timestamp. [added] marks this skill's own
additions. Version statements follow `sources/unreal-version-deltas.md`. Notes live in
`notes/animation/`, `notes/characters/`, `notes/rigging/`.

## Greg Richardson, Epic senior technical product manager, retargeting and Sequencer (-8CQNaODNNA, UE 5.4 to 5.6)

- **Cheapest transfer first** [00:01:06]-[00:06:04]: same Skeleton with translation retargeting;
  Copy Pose From Mesh (matching names only, ignores translation retargeting, lets you add logic
  after); Set Leader Pose (children cannot animate except in a post-process AnimBP); compatible
  skeletons (Manny, UE4 mannequin, MetaHuman, Echo share a base: "highly recommend it"); only then
  IK Rig plus IK Retargeter. Reason: Fortnite and MetaHumans ship on the cheap paths, no duplicated
  animation.
- **Chains, not bones** [00:10:32], [00:13:20]: motion copied by normalized chain length, 18 source
  bones can drive 3 target bones; one source chain can feed several target chains.
- **Retarget pose drives everything** [00:07:08]-[00:08:13]: auto align, single-bone fixes, slight
  knee and elbow bend gave a clearly better result than the default starfish.
- **Exact mapping when you control names** [00:12:16]; fuzzy only for bulk or unknown skeletons.
- **FBIK adjusts, it does not create** [00:14:16]: "great for affecting an existing pose but it's
  not always the best at creating a pose from scratch". The retargeter's IK op only moves effectors,
  never solver settings [00:14:48]. Chain depth localizes a goal [00:15:55]; elbow preferred angle
  about 30 and chain depth 3 in his demo [00:15:23].
- **Contact** [00:16:29]: Blend to Source on leg IK keeps feet at source height; without it feet
  sink. Stride Warping on legs only [00:17:02].
- **Auto retarget exports have IK disabled** [00:21:26]: enable it yourself.
- **Order is yours since 5.6** [00:24:13]-[00:28:27]: "Phases are no more"; Scale Source is
  single-instance and belongs at the top; reordering can produce undesirable results.
- **Judge Scale Source by the IK goals** [00:29:14]-[00:29:47]: about 45% for the goblin, then a
  little lower, watching goals, not the silhouette; check other clips (climb).
- **Props** [00:30:23]-[00:32:42]: Pin Bones with Copy Local Position and relative scale keeps a
  hat's offset from a new head; add IK Blend to Source for hand contact, then Scale Source.
- **Additive Pose op** [00:33:16]-[00:34:21] for one-off corrections (legs spread, fingers, neck,
  head), weighted and placed where it acts (between FK and IK), instead of polluting the base pose
  or IK settings; op weighting "not quite ready" in 5.6 [00:41:00].
- **Quality habit** [00:29:47], [00:32:08], [00:32:42]: play several clips after each change, toggle
  ops to isolate effects; small residual penetration can wait, stretched limbs and floating props
  cannot.
- **Runtime cost** [00:38:46]: FBIK performance is a licensee concern; 5.7 answered with about 20%
  faster FBIK, the stretch limb solver, per-op LOD thresholds and Profile Ops (5.7 notes).

## GASP team: Caleb (senior technical designer, animation), Sam (principal animation programmer), Tony (gameplay animator) (mhVp_cC9MLc, UE 5.4)

- **Motion matching replaces transition logic, not designer control** [00:29:43]-[00:36:42]:
  Choosers decide which databases are searchable each frame; motion matching picks inside.
- **One giant database gets 60 to 70 percent, then tug-of-war** [00:29:43]-[00:31:24]: split per
  move (jumps, lands, idles, stops, walks, runs; runs into loops, pivots); stops have their own
  schema with trajectory weighted higher [00:30:50].
- **Cached state enums with last-frame values** [00:33:06]: movement mode, rotation mode, movement
  state (from future velocity), gait, stance. Nested choosers with movement-analysis getters
  (IsMoving, IsStarting, IsPivoting, just landed, just traversed) [00:34:42].
- **Interrupt mode** [00:37:55]-[00:40:54]: default no interrupt when databases change (a start
  database may be valid for a few frames only); force interrupt when a core state changed. Sam: the
  previous animation's database stays searchable with continuing-pose bias until interrupt flushes
  it.
- **Continuing pose bias** [00:36:43]: sticky idle delays starts.
- **Capsule-driven authoring** (Tony) [00:23:53]-[00:28:43]: easier to network, server cannot run
  animation, CMC handles root motion poorly; speeds differ per direction (faster forward than
  sideways, slower backward) [00:24:59]; export the capsule path, animate in Maya against it "as
  mechanical as possible", lock the chest (not the hips) within tolerance, 5-frame "superhuman"
  stops where the capsule-relative root stops with the capsule and the body overshoots and settles,
  stops on both feet and all phases. Separates animation bugs from system bugs. The same rule holds
  for Blender, MotionBuilder or retimed mocap [added]; `capsule_match` checks it.
- **Leg IK in GASP 5.4** [00:15:00]: feet locked to the IK foot bones only, "ground IK not in yet";
  it reads `ik_foot_l/r`, so a retargeted skeleton needs them pinned [added inference]. Slopes need
  Foot Placement or a Control Rig.
- **Root motion stays in every clip** [01:30:00]: "the root motion data of that animation is still
  incredibly important even though we're a capsule driven system".
- **Debug on the exact transition frame** (Sam) [00:41:25]-[00:49:36]: Active vs Continuing pose,
  candidates (Ctrl+A shows coverage), query drawing, Channel Breakdown; trajectory weight 10 follows
  the trajectory at the price of continuity; the real fix for gaps is data or a better query; with
  low coverage weights encode a design decision.
- **Traversal** [00:50:39]-[01:08:07]: continuous locomotion searches every frame; discrete actions
  are montages with root motion and Motion Warping; Chooser narrows by action type, speed, height,
  depth; callable Motion Match picks asset, start time and play rate; Pose Search Branch In marks
  entry frames; custom Blueprint channels read an unweighted attach bone for the ledge; warping
  absorbs the residual error. Taxonomy: mantle (land higher), hurdle (same surface), vault (landing
  unknown).
- **Extending** [01:10:23]-[01:18:49]: crouch in about five minutes by duplicating databases and
  adding Chooser rows; "no database asset provided" warning means missing rows; disable a broken
  clip, do not delete it; stops live under idle with entry speed above 10 cm/s.
- **Offset root bone** [01:51:44]-[01:55:09]: radius about 30 cm; translation Interpolate moving on
  ground, Release when stopped, falling or in montages; rotation Accumulate for turn in place.
- **Tails through locomotion** [02:14:39]-[02:22:32]: force the montage to blend out early; the tail
  is also in a locomotion database enabled when JustTraversed.
- **Blend Out Trigger Time** [02:03:01]-[02:08:44]: -1 finishes the blend at the end; 0 starts it at
  the end; the live bug was a few walk-loop frames because the root still had velocity.
- **Speeds and capture** [01:27:17]-[01:31:01], [02:11:20]: walk about 2, strafe 3.5, run 5 m/s; a
  3.5 m/s jog means redoing every pivot and transition; mocap for style, retime within reason;
  shapes (hourglass, box, prism, diamond) instead of dance cards; mirroring halves left and right
  authoring; build dense, prune to sparse, A/B.
- **Performance** [01:24:26]-[01:25:36], [01:44:17]: comparable to blend-based systems, logarithmic
  in data size, CPU only, spikier; Fortnite ships it on all platforms.
- **Multiplayer gotcha** [01:36:57]-[01:38:58]: the CMC does not replicate input acceleration, which
  trajectory prediction needs; Fortnite adds it in C++.
- **Camera before animation** [01:46:01]: strafe felt tighter only because of camera lag.
- **"There is no right way"** [02:28:07]: GASP is a way.

## Jose, Epic lead animation engineer (tNw9lD2PW3U, UE 5.4)

- **The last 30 percent** [00:02:12]: removing the black box, handing control to designers.
- **Responsiveness by design** [00:14:27]-[00:14:59]: in Fortnite a Chooser forced the start
  database on the frame the player pressed move.
- **Late tuning with notify-state tags** [00:18:28]-[00:20:42]: Override Continuing Pose Cost Bias
  (protect refacing starts), Exclude From Database, Block Transition (In since 5.5); never retune a
  schema that affects a whole database late.
- **Trajectory shaping** [00:09:48]-[00:11:57]: generate idle and turn-in-place trajectories
  differently, post-process with collision, expose future velocity, blend time bound per movement
  mode; On Motion Matching State Updated reads the selected database.
- **Pose History** [00:09:15]: thigh, spine and pelvis besides the feet; default schema Pose channel
  = left and right foot position and velocity [00:05:16]. All of these are mannequin names to remap
  on another skeleton.
- **Warp per animation inside the blend stack** [00:27:34]-[00:30:58]; disable orientation warping
  by clip curves on pivot corners; steering toward the facing 0.5 s ahead; switch steering setups by
  database tags.
- **Offset root bone limits** [00:32:07]-[00:33:11]: the mesh can leave the capsule and clip into
  walls (reduce the offset near walls, trace, or bend the trajectory); optional: without it,
  slightly more sliding and model and animation drift apart.
- **Root motion attribute** [00:31:31]-[00:34:29]: legacy root motion does not flow through the
  graph; the attribute does; root-motion-driven characters suit single player.
- **Own characters** [00:34:40]-[00:37:28]: runtime retarget for prototyping, offline batch for
  shipping at the cost of rebuilding the AnimBP; judge side by side with the native in the middle.

## Dustin DeVoe, Epic senior technical animator (FLDXtAV7qsw, UE 5.5 to 5.6; tTgMafRAM7A, UE 5.5 to 5.6)

Motion matching with little data:

- **Myths** [00:03:15], [00:15:17]: no need for 500 clips or dance cards; hand-keyed and stylized
  sets work.
- **Movement model first** [00:06:27]-[00:08:40]: tune capsule speeds, acceleration, deceleration
  with rough animation ("if it feels good with rough visuals then you're on the right track");
  decide root-motion-driven vs capsule-driven early, authoring clips with root motion so they serve
  both [00:07:33]; export the trajectory (5.6 Rewind Debugger Trajectories export, earlier Take
  Recorder); animate against it.
- **Clean, centered root** [00:09:07]-[00:10:12]: spine_05 above the root; non-bipeds drive the root
  from the center of mass [00:38:21].
- **Schema measures only what matters** [00:10:24]: trajectory 1.0 with 5 samples, pelvis group
  channel 0.1.
- **Minimal sets** [00:11:14]-[00:14:44]: 13 non-strafing (the on-screen list shows 12: idle, run
  loop, starts and stops on each foot, arcs, refacing 90 and 180 on each foot), 26 with strafing, 60
  to 80 with states (one fifth of GASP). Left and right foot variants matter most with digital
  input.
- **Procedural nodes make sparse data ship** [00:28:19]-[00:34:19]: steering before offset root bone
  [00:31:40], foot placement with foot-lock curves, mesh-space additive leans and look-at.
- **Stitching** [00:15:32]-[00:25:44]: Chooser Player stitch database with a gameplay-set stitch
  time (Experimental on screen).
- **Quadrupeds** [00:39:28]: separate front-feet and back-feet channels.

Performant MetaHumans:

- **Never export the cinematic MetaHuman** [00:15:16]: about 800 MB vs about 60 MB Optimized High.
- **Context first** [00:12:55]-[00:14:34]: hero, squad, crowd, distance, platform; "no magic
  button".
- **Profile on target** [00:17:43]-[00:22:44]: Development for the picture, Test plus Insights for
  accuracy; `stat anim` first, `stat unit` to find the bottleneck, `stat gpu` to catch a cinematic
  export; statnamedevents inflates cost.
- **Order** [00:22:58]-[00:34:07]: audition LODs (start at LOD 2 on PS5-class), component toggles,
  pose drivers (0.4 ms in RigLogic from 5.6 vs 1.4 ms PS5 and 8 to 12 ms Switch before), no face on
  crowds, recompute tangents only when the face deforms, influences down to about 12 for non-hero,
  Material Parameter Caching on custom materials (else a game-thread hitch), fewer thicker strands.

## Matthew Lake, technical animator, PS5 titles (N_suMyUuork, UE 5.3 to 5.4)

- **Defaults favor working fast, not running fast** [00:19:38]-[00:20:41]: flip them project-wide,
  opt back in per case.
- **Measure first** [00:01:16]-[00:04:09]: `stat anim`, `showdebug animation`, Size Map in memory
  mode, `memreport -full`, Control Rig profiler, Insights with the Animation channel.
- **Content audit** [00:04:09]-[00:07:52]: strip face, twist and deformation joints and Maya helper
  curves before import: 71% less storage, 90% less memory on a 200-frame clip; track count as a
  health signal (66 right, 89 and 159 wrong); change import defaults in config.
- **LODs** [00:08:27]-[00:12:15]: shared LOD Settings data asset, hysteresis, bone lists (remove
  listed early, keep listed late), influences 8, 4, 1, `a.VisualizeLODs`.
- **AnimBP** [00:12:44]-[00:16:53]: multithreaded update, thread-safe update, fast path, node
  functions; root motion from everything OR from montages puts the graph on the game thread
  [00:13:18] (the doc says the same): Montages Only does not keep it on workers, so it is chosen for
  capsule-driven networking and budgeted; AND/OR and math on pins leave the fast path.
- **Import defaults in config** [00:06:50]: Delete existing curves and Do not import curves with
  zero values set as defaults (he edits the engine's BaseEditorPerProjectUserSettings.ini, FBX anim
  sequence import data section), not per asset.
- **Graph** [00:16:53]-[00:19:38]: node LOD thresholds, grouped space conversions, flat top-level
  state machines reused through cached poses.
- **Tick and update** [00:19:38]-[00:25:12]: Only Tick Pose When Rendered as the project default
  (not placed Skeletal Mesh Actors), No Skeleton Update for rooms, URO (hard to see with
  interpolation up to about 10 to 15 skips), budget allocator demo 100 characters from 4 to 5 ms to
  1 ms.
- **References** [00:39:09]-[00:44:36]: hard references to unrelated heavy classes cost memory (a
  vehicle variable adds 100 MB); logic-only master Blueprints.

## Sir Wade Neistadt, animator and trainer (Cc1YgOxdNI8, UE 5.8.0)

- **Unreal is a keyframing tool now** [00:06:04]-[00:09:50]: live Control Rig, layers, time warp and
  constraints in one Level Sequence (5.8).
- **Stepped timing** [00:07:08]-[00:10:54]: Time Warp track, Filter > Bake at 2, 3 or 4, keys to
  Constant; 5.8.0 bug: interpolation only by right-click on the key.
- **Constraints are not Maya constraints** [00:14:04]-[00:23:18]: active from the creation frame,
  bottom of the stack wins (no weight blend), compensation keys hold world position, disable with
  the Active key (X deletes), retime by deleting and re-keying (the handle eats keys), animate on
  top of a constrained object.
- **Poses from mocap** [00:27:42]-[00:31:28]: override layer below at weight 0, pass-through keys at
  golden frames, weight 1, stepped keys.
- **Ground alignment** [00:37:32]-[00:40:14]: CR_GroundAlignment on the mannequin, then retarget; it
  fails above expected foot height and off ledges.
- **Mouse mocap** [00:54:23]: Smart Snap keys to whole frames.

## Stéphane Biava, Epic solution architect (XYMad1EutcA, UE 5.7 to 5.8)

- **Influences** [00:02:30]-[00:03:34]: 8 per vertex by default; more in the DCC gives render-only
  artifacts; unlimited influences through the project threshold plus 16-bit weights.
- **Remove unused bones** [00:04:38]-[00:05:09]; procedural bones in the Construction Event.
- **Counts** [00:05:40]-[00:06:43]: many skeletal meshes and active Control Rigs per frame cost;
  800+ MetaHuman morphs fine for linear content, not a game default.
- **Control Rig routine** [00:07:31]-[00:11:42]: Execution Stack, stepping, profiling, move data
  gathering into Construction and cache it, functions for repeated patterns, C++ rig units last.
- **Sequencer-proof IK/FK** [00:14:50]-[00:16:26]: fully conditioned on the switch or it jitters.
- **Spherical Pose Reader** [00:21:20] instead of AnimBP pose drivers; **modularity** levels:
  function variants, Modular Rig, data-driven rigs through Asset User Data [00:22:55]-[00:30:21];
  **Control Rig Dynamics** (5.8, 3 nodes) [00:30:37].
- **Constraints to bones or spawnables** [00:40:46]-[00:41:49]; shift constrained keys from the
  timeline, not the section panel [00:42:20].
- **AutoBake** heavy shots to linked sequences (flame icon, 5.8) [00:43:26]-[00:45:01].

## Epic senior technical animator, LEGO Fortnite, ex-Weta (kO6pz8ADgcU, UE 5.4; name uncertain in captions)

- **Event stack, not a dependency graph** [00:02:10]: iterative solving without scripts.
- **Iterative solve with early exit** [00:04:55]-[00:09:21]: three vector-math steps, Max Iterations
  and Tolerance; complex poses 3 or 4 iterations.
- **Profile before C++** [00:09:51]-[00:12:36]: 60 µs graph vs 10 to 16 µs C++ for the leg solve;
  convert only hot runtime functions.
- **Data-driven rigs** [00:12:52]-[00:16:39]: Import Skeleton first in Construction, per-mesh config
  in Asset User Data; one rig drove 100+ props.
- **Live IK/FK matching and proxy controls** [00:17:15]-[00:29:48]; Backwards Solve in every module
  [00:46:21]; Modular Rigging used in production though Experimental [00:46:55].

## Raffaele Fragapane and Matt Stoneham, Epic (OmMi6E0EkQw, GDC 2023)

- **ROM is the most critical element** [00:37:21], [00:51:40]: models interpolate well, extrapolate
  badly; cover every joint's extremes on all three axes [00:52:34]; the 20 vs 70 degree clavicle
  collapse [00:53:04].
- **Training sims without dynamics** [00:37:52]-[00:39:20]: 7 frames animate-in plus 3 settle per
  random pose.
- **Minimal inputs** [00:45:44]-[00:46:46]: 91 to 25 animated to 15 without twist; keep twist joints
  in the linear-skinned mesh so deltas stay small (lossy compression) [00:57:28].
- **Local Neural Morph by default** [00:39:28]-[00:41:26]; global needs about 50% more data; nearest
  neighbor for garments.
- **Budget** [00:33:32]: about 0.1 ms CPU plus 1 ms GPU on PS5 for the hero.

## Epic Games China technical artist, Chaos support (wq0lY7vhF5w, UE 5.6; name uncertain)

- **Budget, stability, realism, in that order** [00:20:43].
- **Panel cloth over legacy section cloth** [00:01:42]; separate coarse sim mesh, adaptive remesh on
  the max distance mask [00:05:17]-[00:06:58]; Proxy Deformer selection sets for overlaps
  [00:06:58].
- **Fabric feel from stretch, bending, buckling** [00:08:31]-[00:14:18]; never copy numbers across
  projects.
- **Cheap anti-clipping** [00:21:54]-[00:26:14]: backstop radius grows with distance, speed-driven
  backstop for skirts, geodesic tethers with filtered ends; clip-free at 1 or 2 substeps.
- **Kinematic collider only near and where capsules fail** [00:28:33]-[00:29:41]; sphere self
  collision for games [00:29:46].

## Epic documentation (5.8 pages)

- AnimBP: Event Graph is usually the most expensive part; pull with Property Access; root motion
  blocks the parallel update; the allocator over URO; FParallelAnimationCompletionTask is the
  expected remaining game-thread work; allocator needs both the node and `a.Budget.Enabled`;
  compression changes need Compress.
- Motion matching: few samples and channels; weights cannot fix data mismatch (5 vs 4 m/s);
  locomotion databases require Enable Root Motion; notify filtering 0.2 s; default Pose channel
  names `foot_l`/`foot_r` (replace on other skeletons); node guards Pose Jump Threshold Time, Pose
  Reselect History, Search Throttle Time; GASP functions: steering only when moving or in air (idles
  slide), offset root translation half-life fast when stopped, Offset Root Bone has no collision
  checks.
- Retargeting Pin Bones: weapon IK bone snaps are fixed by pinning (`ik_hand_weapon` to `hand_r`);
  Pin Bones plus Scale Source for different heights; Retarget Output Log clean; Profile Ops and
  per-op LOD thresholds for runtime.
- Root motion (verbatim): "When either Root Motion from everything or Root Motion from Montages is
  enabled, the Animation Graph is updated on the Game Thread instead of a Worker Thread."
- Retargeting: Retarget Pose op first; batch with an existing retargeter; FK Translation Mode None
  best in most cases; per-op LOD thresholds; Override Sets replace profiles.
- Control Rig: FBIK as a procedural adjustment tool; exclude bones rather than lock; Backwards Solve
  needed to bake; modules single-threaded and slightly slower.
- MetaHuman: LODSync, DNA and face LOD counts match, neck features cost most, cards only on Mac.

## Disagreements and deciding conditions

| Topic                                 | Position A                                                                           | Position B                                                                                                   | Decide by                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion matching vs state machine      | GASP: data, not transitions                                                          | Lyra: state machines, layers, warping; Caleb liked "total control"                                           | coverage and responsiveness vs explicit per-state control; hybrid allowed; not performance (`A.decide_locomotion`)                                                                                                                                                               |
| Capsule vs root-motion-driven         | capsule: networking, CMC limits (GASP)                                               | root motion attribute: planted refacing turns, "significantly more efficiently" (Jose [00:33:25]-[00:34:29]) | multiplayer or many characters: capsule, root motion in montages; single-player hero: evaluate root-motion-driven; Mover 5.8 ChaosMover adds trajectory prediction for motion matching, still heading out of Experimental [verify 5.8 maturity]; decide early (DeVoe [00:07:33]) |
| Root Motion Mode and threads          | doc and Lake: Everything and Montages Only both run the AnimGraph on the game thread | grader note (U5): engine behavior may be narrower than the doc wording                                       | budget it as the doc says; settle in the installed engine with an Insights trace under each mode                                                                                                                                                                                 |
| Dense vs sparse                       | GASP 500+                                                                            | DeVoe 13, 26, 60 to 80                                                                                       | memory and capture budget; start dense if you have it, prune, A/B                                                                                                                                                                                                                |
| One vs many databases                 | doc: more data, more fidelity                                                        | GASP: split                                                                                                  | prototype: one; production: split plus Chooser                                                                                                                                                                                                                                   |
| URO interpolation                     | Lake: on, hides 10 to 15 skips                                                       | doc: 15 Hz and under with interpolation off                                                                  | mid-distance quality vs tight game thread; allocator decides under budget                                                                                                                                                                                                        |
| URO vs allocator                      | Lake demos both                                                                      | doc: allocator                                                                                               | variable crowds or hard ms budget: allocator; never both                                                                                                                                                                                                                         |
| Runtime vs offline retarget           | GASP runtime with Override Sets                                                      | offline export, AnimBP rebuild                                                                               | number of target skeletons and memory vs per-frame cost on target                                                                                                                                                                                                                |
| Graph vs C++ rig units                | LEGO: convert only hot functions                                                     | Biava: C++ as the last step                                                                                  | many instances under a tight budget: measure, then convert                                                                                                                                                                                                                       |
| Influences                            | unlimited for MetaHuman Animator fidelity                                            | about 12 for render cost                                                                                     | close-up hero vs game and crowd                                                                                                                                                                                                                                                  |
| Cloth solver                          | PBD, sphere self collision                                                           | XPBD, point-face                                                                                             | game vs cinematic, multi-layer garments                                                                                                                                                                                                                                          |
| Control Rig Physics vs Dynamics (5.8) | Physics Beta, richer                                                                 | Dynamics Experimental, about 5x faster                                                                       | in-game cosmetic chains: Dynamics with fallback; authored physics: Physics                                                                                                                                                                                                       |
