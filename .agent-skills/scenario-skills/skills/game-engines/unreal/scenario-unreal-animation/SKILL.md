---
name: scenario-unreal-animation
description: 'Use when a UE5 task involves characters in motion: "import FBX from Maya" with a skeleton, "retarget animations", IK Rig, IK Retargeter, feet sinking or floating after retarget, mocap cleanup, Motion Matching, Pose Search, Choosers, GASP, state machine vs motion matching, root motion, offset root bone, foot IK, Control Rig, Animation Blueprint cost, "animation is expensive", budget allocator, URO, MetaHuman LODs, ML Deformer, cloth.'
license: MIT
---

# Unreal animation (technical animator)

Expert level means contact that holds on every clip the game plays, locomotion authored against the
movement model that changes category on the input frame, animation that costs a measured number of
milliseconds on the target, and clean data at the source. The agent works through data and
templates: it scripts assets, IK Rigs, retargeters, databases and settings, duplicates Epic's
AnimBPs instead of drawing graphs, measures contact numerically, then looks at frames. If a sibling
skill named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or
ask the user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed
from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** Unreal is not installed. The offline layer of
[`scripts/ue_anim.py`](scripts/ue_anim.py) passed 30 tests
(`python3 tests/code/unreal-animation/run_all.py --offline`). Every in-editor snippet is **not yet
run in Unreal**; `[verify]` names are answered by `job_00_anim_probe.py`. Import:
`sys.path[:0] = ["<skills>/scenario-unreal-animation/scripts", "<skills>/scenario-unreal-expert/scripts"]; import ue_anim as A`.

## Stance (the expert delta)

- **Cheapest transfer first, then retarget order decides contact.** Same skeleton, compatible
  skeletons, Copy Pose From Mesh or Leader Pose beat an IK Retargeter (Greg Richardson, -8CQNaODNNA
  [00:02:40]-[00:06:04]). When retargeting: a new named retarget pose (never Default) with auto
  align, snap to ground, slight knee and elbow bend; Scale Source once at the top, judged by the IK
  goals; Blend to Source on leg IK or feet sink; auto-exported retargeters have IK off (Richardson
  [00:08:13], [00:16:29], [00:21:26], [00:29:14]). Pin the IK helper bones gameplay reads
  (`ik_foot_l/r`, `ik_hand_gun`); one-off fixes go in an Additive Pose op, not the base pose
  (Richardson [00:33:16]; 5.8 retargeting doc).
- **Movement model first, then animate against it.** Tune capsule speeds, acceleration and braking
  with rough animation until it plays well, export the capsule trajectory, animate the root
  frame-exact with the chest (not the hips) within tolerance and 5-frame stops where the body
  overshoots. This separates animation bugs from system bugs (GASP team, Tony, mhVp_cC9MLc
  [00:24:25]-[00:28:43]; Dustin DeVoe, FLDXtAV7qsw [00:06:27]-[00:08:40]).
- **Motion matching is data under designer control.** Split databases by movement state, pick them
  with a Chooser on cached enums, interrupt only when a core state changed this frame, keep root
  motion enabled on every locomotion clip even when the capsule drives (GASP team
  [00:29:43]-[00:40:54], [01:30:00]). Weights encode a preference between imperfect candidates with
  low coverage (Sam [00:49:01]); they never fix a speed or coverage mismatch, and late tuning uses
  notify-state tags, not schema weights (Jose, tNw9lD2PW3U [00:18:28]; motion matching doc).
- **Small sets ship with procedural nodes.** 13 clips give a non-strafing base, 26 with strafing, 60
  to 80 with states, both feet for every start, stop and refacing start (DeVoe
  [00:11:14]-[00:14:44]); "a misnomer that you need all coverage" (GASP [01:21:06]). Sparse data
  needs Steering before Offset Root Bone, foot placement and mesh-space additives, not a state
  machine (DeVoe [00:28:19]-[00:31:40]).
- **Keep the AnimBP off the game thread, and budget root motion.** Thread-safe update, Property
  Access, fast path on every node (Matthew Lake, N_suMyUuork [00:12:44]-[00:16:53]). Root Motion
  from Everything AND from Montages Only both update the AnimGraph on the game thread (root motion
  doc; Lake [00:13:18]). Montages Only is chosen because capsule-driven locomotion networks well,
  not to save threads: budget its cost; a character with no root-motion montage can use No Root
  Motion Extraction [inference from the doc wording, verify in Insights].
- **Clean at the source, throttle what is unseen.** Stripping twist, face and deformation tracks and
  Maya helper curves cut storage 71% and memory 90% on one clip; import defaults set project-wide,
  not per asset (Lake [00:05:15]-[00:07:21]). Only Tick Pose When Rendered as the project default,
  budget allocator or URO (never both), one LOD Settings asset with hysteresis (Lake [00:21:13];
  AnimBP doc).
- **Control Rig: Construction caches, Forwards Solve per frame.** Profile before converting to C++
  (60 µs graph vs 10 to 16 µs rig unit); FBIK adjusts a pose, it does not create one; exclude bones
  instead of locking them; a Backwards Solve makes a rig bakeable (Stéphane Biava, XYMad1EutcA
  [00:10:08]; LEGO Fortnite tech animator, kO6pz8ADgcU [00:12:04]).
- **Never ship the cinematic MetaHuman.** About 800 MB cooked vs about 60 MB Optimized High;
  audition LODs at the game camera from LOD 2 on PS5-class; Mac renders cards only (DeVoe,
  tTgMafRAM7A [00:15:16], [00:23:34]).

## Establish first

| Input                                                       | Changes                                                                    | Default when silent                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform, frame budget, characters on screen                | budgets, LODs, allocator, runtime vs offline retarget                      | console-class 60 fps; animation share from scenario-unreal-performance                                                                                                                                                                                                                  |
| Multiplayer, hero fidelity                                  | capsule vs root-motion-driven                                              | multiplayer: capsule driven, root motion in montages; single-player hero needing planted refacing turns: evaluate root-motion-driven through the root motion attribute (Jose [00:33:25]-[00:34:29]); Mover 5.8 adds ChaosMover trajectory prediction, still heading out of Experimental |
| Movement model: speeds per direction, acceleration, braking | timing of every clip                                                       | GASP speeds when reusing GASP data; tune before authoring                                                                                                                                                                                                                               |
| Clip set: GASP, mocap, hand-keyed, count                    | motion matching vs state machine                                           | motion matching with procedural nodes; state machine plus warping (Lyra) only for explicit per-state control                                                                                                                                                                            |
| Gameplay needs                                              | strafing and states multiply content (each state almost doubles it, DeVoe) | orient-to-movement, walk, run, jump                                                                                                                                                                                                                                                     |
| Skeleton contract from the DCC                              | chains, IK bones, root                                                     | scenario-maya-rigging `game_skeleton_check` clean                                                                                                                                                                                                                                       |

## Workflow

1. **Probe once per engine.** `job_00_anim_probe.py` headless. GATE: `probe.json` lists IK Rig,
   retargeter, Pose Search, AnimPose, Interchange, MetaHuman names and whether 5.8
   `BlueprintGraphEditor` exists.
2. **Receive and audit the character.** `A.import_character` / `A.import_animations` (explicit
   options on either importer), then `A.import_audit(A.skeletal_mesh_facts(mesh))`: one root, unused
   bones (5.8 Bone Count Reduction), influences over 8, units. Set project-wide import defaults
   once: `A.apply_ini_plan(cfg, A.import_defaults_plan())` for the legacy importer, the project
   pipeline in the Interchange Import Content stack. GATE: no error; mesh looked at in a neutral lit
   preview.
3. **Choose the transfer.** `A.transfer_method(source, target)`. GATE: method and reason written
   down.
4. **IK Rigs.** `A.create_ik_rig` (5.8 template splits Leg at the ankle and adds Foot chains),
   `A.biped_chain_plan` for custom names. GATE: `A.chain_map_check` clean.
5. **Retargeter, built once, then templated.** `A.create_retargeter`; op settings once in the GUI,
   saved as `RTG_Template`; Pin Bones from
   `A.ik_bone_pin_plan(bones, A.mannequin_bone_map(bones, parents))`. GATE:
   `A.op_stack_check(ops, proportions_differ=True, target_ik_bones=..., runtime=..., profile_ops_us=...)`
   clean; `A.retarget_log_check` on the Retarget Output Log clean; LOD thresholds and Profile Ops
   for any runtime retargeter.
6. **Batch retarget and clean.** `A.batch_retarget(..., retain_additive=True)`; mocap through its
   own retargeter (Filter Bones, Generate From Target Pelvis); `A.anim_content_audit`,
   `A.ensure_root_motion`, `A.strip_curves`. GATE: `A.compare_contact` on walk, run, turn, crouch,
   jump, a contact clip and a mocap clip; `A.root_motion_check`; contact frames looked at side and
   front.
7. **Movement model and authored clips.** Tune the movement component per gait and direction; export
   the capsule trajectory (5.6+ Rewind Debugger > Trajectories export, else Take Recorder) to
   scenario-maya-animation or scenario-blender-animation. GATE: `A.capsule_match` (root on the path,
   chest within tolerance, root stops with the capsule) and `A.speed_parity` on returned clips.
8. **Locomotion architecture.** `A.decide_locomotion(...)`. Motion matching: migrate GASP,
   `A.motion_matching_coverage` (foot pairs, capture shapes), `A.database_plan`, duplicate schemas
   and databases, then remap every mannequin bone name:
   `A.schema_bone_check(A.schema_facts(s)["bones"], bones, bone_map)`, Pose History bones in the
   GUI; tags, notify filtering, repetition guards. Procedural nodes: `A.procedural_order_check`,
   `A.offset_root_bone_modes`. GATE: zero "no database" warnings cycling every state in PIE; Rewind
   Debugger read on each transition frame; starts, stops, pivots at 0.25 timescale from a still
   camera.
9. **Root motion and montages.** `A.root_motion_mode_check(mode, multiplayer, montage_root_motion)`;
   `A.montage_blend_out_check`; traversal tails through a JustTraversed database. GATE: no root
   velocity in the blend-out window; `show collision` capsule stays with the mesh; game thread
   measured.
10. **Foot IK.** GASP 5.4 leg IK only locks feet to the IK foot bones, no ground adaptation [verify
    current GASP]; slopes and stairs need Foot Placement or a Control Rig with FBIK
    (`A.fbik_foot_defaults(mannequin_like=False)` re-derives the knee axis). Sequencer shots:
    `CR_GroundAlignment` on the mannequin, then retarget. GATE: stairs and 30 degree slope captures,
    foot gap per frame, no pop, no jitter.
11. **Performance pass.** `A.anim_ini_plan`, `A.animbp_settings`, `A.compile_and_scan`,
    `A.allocator_config_check`, `A.lod_settings_check`. GATE: `stat anim`, `stat unit`, Insights
    before and after on the same path.
12. **Deliver** per Handoffs, with what was not verified.

## Numbers

| Value                                                                                      | Relative to                             | Source                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------- |
| GASP speeds: walk about 2, strafe 3.5, run 5 m/s                                           | movement model and clips                | GASP team [01:27:17]             |
| Capsule stop 5 frames; offset root radius about 30 cm                                      | capsule                                 | GASP team [00:27:38], [01:52:15] |
| Steering desired facing 0.5 s ahead                                                        | trajectory                              | Jose [00:29:50]                  |
| Notify Recency Time Out 0.2 s; weights example Pose 1, Trajectory 3                        | Motion Matching node, schema            | motion matching doc              |
| Minimal sets 13, 26, 60 to 80 clips (GASP over 500)                                        | locomotion                              | DeVoe                            |
| `a.Budget.BudgetMs` 1.0 (default), 1.5, 2.0, 2.5                                           | game thread, ViewDistanceQuality 0 to 3 | AnimBP doc                       |
| Max bone influences 8 (LOD0), 4, 1 (last)                                                  | skeletal LODs                           | Lake; Biava                      |
| FBIK: pelvis stiffness 0.8, knee preferred Z 45, ankle -70..70                             | mannequin joint axes                    | Control Rig doc                  |
| Filter Bones: Responsiveness 0.3 to 0.8, Velocity Cutoff 15 to 30 Hz, under frame rate / 2 | mocap                                   | retargeting doc                  |
| MetaHuman pose drivers 1.4 ms PS5 before 5.6, about 0.4 ms after                           | per character                           | DeVoe                            |
| Contact tolerances 1 to 2 cm; root on capsule 2 cm; chest 30 cm                            | planted frames, authored clips          | [added] defaults                 |

No source gives a per-character ms budget: take the animation share from
scenario-unreal-performance.

## Quality gates

- **Code:** the `A.*` checks of each Workflow gate, summarized by `verdict(issues)` with no error.
- **Engine numbers:** `stat anim`, `stat unit`, Insights (animation channel, game-thread AnimGraph
  update), stat group PoseSearch (5.8 names), `a.Budget.Debug.Enabled 1`, Retarget Profile Ops.
- **Visual (ue_review):** contact frames side and front, native in the middle, 0.25 timescale
  locomotion, stairs and slopes, LOD at distance. Score with
  [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                                          | What it looks like                                  | Fix                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Animation imported without the target skeleton                   | clip does not play; stray `<Mesh>_Skeleton`         | always pass the skeleton                                                          |
| No Blend to Source on leg IK                                     | feet sink on shorter targets                        | Blend to Source; Scale Source at the top if hands over-reach                      |
| IK helper bones not pinned                                       | leg or weapon IK reads a reference-pose bone        | Pin Bones per `ik_bone_pin_plan`                                                  |
| Batch with an auto-generated retargeter                          | IK off, override sets ignored                       | hand-built retargeter                                                             |
| Clips authored before the movement model is tuned                | every clip retimed; animation and system bugs mixed | model first, `capsule_match`                                                      |
| Duplicated GASP schema on a custom skeleton                      | channels read missing mannequin bones, poor picks   | `schema_bone_check`, schema skeleton, mirror table rebuilt                        |
| One big database, weights tuned                                  | starts improve, stops break                         | split by state, Chooser, interrupt on core state change                           |
| State machine chosen because the set is small                    | stiff transitions                                   | minimal set plus procedural nodes                                                 |
| Steering after Offset Root Bone, or none, with keyboard input    | selection thrashes                                  | Steering first, only while moving or in air                                       |
| Montages Only picked "to keep the graph on workers"              | unbudgeted game-thread cost                         | both modes run the graph on the game thread; budget, or No Root Motion Extraction |
| Blend Out Trigger Time -1 with root still moving                 | walk-loop frames after traversal                    | trigger 0, or root motion ends earlier                                            |
| Allocator node without `a.Budget.Enabled`, or allocator plus URO | no effect, confusing throttling                     | both switches on; never both systems                                              |
| Offset root bone near walls                                      | mesh clips into walls                               | smaller radius near walls or collision-aware trajectory                           |

## Handoffs

- **Receives** from scenario-maya-rigging, scenario-maya-animation, scenario-blender-rigging,
  scenario-blender-animation through scenario-unreal-pipeline-automation: FBX 2020.2, cm, one root
  at the origin, joints only, one clip per file, `game_skeleton_check` JSON. Blender files come from
  scenario-blender-export's `unreal_skeletal` preset.
- **Delivers to scenario-maya-animation or scenario-blender-animation:** exported capsule
  trajectory, speed, acceleration and braking per direction, stop spec, chest tolerance, clip list
  with both feet.
- **Delivers to scenario-unreal-gameplay:** character Blueprint child (GASP or Lyra), AnimBP
  variable contract (gait, stance, movement mode, rotation mode), montages with warp targets,
  movement model values, note that CMC input acceleration needs C++ replication for multiplayer
  trajectories.
- **Delivers to scenario-unreal-cinematics:** retargeted clips, bakeable Control Rigs,
  `CR_GroundAlignment` guidance, MetaHuman Cine tier only for pre-rendered shots.
- **Asks scenario-unreal-performance** for the animation budget and target captures.

## UE 5.8 notes

- Retargeter: op stack (5.6), Override Sets replace Retarget Profiles, foot definition and floor
  constraint, Blend to Source, Scale Goals, Offset Goals as separate Run IK Rig sub-ops; resave
  pre-5.8 retargeters.
- Pose Search: `DatabaseAnimationAssets` (5.7), Chooser-column databases default to Brute Force,
  `...FromContext` channel getters, renamed stats, "Block Transition In".
- `unreal.BlueprintGraphEditor` is the 5.8 route for Blueprint graph edits; whether it reaches
  AnimGraph nodes is [verify]: try on a copy, else templates and computer use.
- Interchange: production ready for asset import (5.5), default for FBX level import (5.6), dialog
  reworked (5.8); the FBX asset-import default is [verify], so pass options for both importers.
- Control Rig: Construction Event, Physics Beta, Dynamics Experimental; `FSmartName` and 5.0 to 5.6
  anim APIs removed.
- MetaHuman: `ConvertLegacyDNAAssets -DryRun` first; face MetaHuman Animator on macOS, body Windows
  only.
- Experimental, fallback required: Animation Mixer, Direct Mesh Controls, uFBX, MetaHuman Crowd,
  MotionMatchMulti. Mover still Experimental.

## References

- [`references/procedures.md`](references/procedures.md): full code per stage, test path, status;
  before any scripted step.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert, disagreements and
  deciding conditions.
- `references/critique.md`: the self-review rubric; at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): editors, menus, settings for a computer-use
  agent.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
