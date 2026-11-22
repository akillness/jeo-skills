---
name: scenario-maya-fx
description: 'Use when a Maya task involves simulation or procedural effects: nCloth or Nucleus (a cape, skirt, flag or garment on an animated character, cloth through the body, jittery or stretchy cloth), nParticles, Bifrost graphs (Aero smoke, dust puff, mist, fire, liquids, MPM cloth, snow, sand, "Bifrost smoke"), MASH scattering or motion graphics, sim caches (nCache, Alembic, OpenVDB, file_cache, USD) or FX delivered to lighting or a game engine (flipbook sprites).'
license: MIT
---

# Maya FX (Nucleus, Bifrost, MASH, caches)

An expert FX TD fixes scale and inputs before touching a knob, changes few settings one at a time,
never judges a live solve, and proves the result on the cache in numbers (penetration, stretch,
pops, convergence) and in renders from the shot camera. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

**Status (2026-09-24):** Maya 2027 is not installed. The pure-Python layer of
[`scripts/mx_fx.py`](scripts/mx_fx.py) passed offline (`tests/code/maya-fx/test_fx_offline.py`);
every Maya call is **not yet run in Maya**; names marked [verify] are answered by
`job_00_fx_probe.py` (`python3 tests/code/maya-fx/run_all.py`).

## Stance (the expert delta)

- **Scale before anything.** Nucleus and Bifrost compute in meters whatever Maya's unit: Space Scale
  and `scene_units_in_meters` 0.01 in a cm scene, or a 182 cm character is 182 m to the solver (2027
  Help; SARKAMARI [00:29:22]; Stamatelos [00:30:21]). MPM `detail_size` is in meters, so a unit
  change silently changes resolution (Gast [00:07:29]).
- **Never simulate the production mesh.** Duplicate the skinned body and garment, drive the
  duplicates with a blend shape at weight 1, hide the originals (SARKAMARI [00:10:04]).
- **Give the solver a clean start.** Hold 25 frames, blend 25 frames into the first pose, action at
  0, Nucleus start -50 (SARKAMARI [00:05:26]); Julan: A-pose at 0, walk by 24.
- **Substeps before stiffness.** Collision iterations below the substep count do nothing; high
  stretch resistance at low substeps cannot converge (2027 Help, Tips). SARKAMARI's remaining
  penetration vanished at 30 substeps and 35 iterations, with Space Scale moved to 0.25 in the same
  pass [00:29:22] [00:29:57].
- **Cache, judge the cache, render the cache.** nCache before every playblast; the render scene
  holds Alembics only (SARKAMARI [00:19:32], [00:40:07]).
- **Bifrost fails silently.** Unpulled outputs are never computed, empty arrays are valid data,
  mismatched arrays truncate (Jason E3aOt5wuvoo [00:22:49]; Nordenstam [00:38:11]; graph doc). A sim
  solves only forward from its own start frame: default 1, and it must exist in the timeline (sim
  guide; Nordenstam [00:56:23]).
- **Do not simulate what you do not need.** Start a snowball at the collider with its impact
  velocity (Gast [00:55:18]); layer garments through Alembic colliders (SARKAMARI [00:32:06]);
  coarse background sources (Stamatelos [00:21:25]).
- **One change per run, logged** (Jason cd3HgvM8sXg [00:21:43]); `mx_fx.set_attrs` returns the log.

## Establish first

| Input                         | Why it changes the plan                                          | Default when silent                                      |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Shot range, fps, action start | pre-roll, cache range, handles                                   | 24 fps, pre-roll 50 frames before the action             |
| Character delivery            | sim duplicates need a skinned or cached body                     | referenced rig or Alembic from scenario-maya-animation   |
| Linear unit and real size     | solver scale                                                     | cm, real size checked with `mx_fx.scale_report`          |
| Destination                   | film (Arnold, VDB, Alembic) vs game (sprites, baked meshes, USD) | Arnold film                                              |
| Camera and motion blur        | what penetration is acceptable                                   | shot camera, blur on                                     |
| Fabric or material            | preset, stiffness                                                | cape: heavy denim values [added pick]; dust: Aero smooth |
| Budget                        | substeps, resolution, sim time per frame                         | first pass 10/12, detail 0.1; final 30/35                |

## Workflow

1. **Scale and inputs.** `mx_fx.scale_report(meshes, expected_size_m=...)`; if the model is not real
   size, fix the asset (Julan [00:02:02]). Record any deliberate non-physical scale (SARKAMARI's
   0.25 on a 182 cm character) with `art_choice=True`. GATE: no error line.
2. **Pick the system** (options keyed to the brief):

   | Effect                                     | Default              | Alternative and when                                                                                                   |
   | ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | Cape, garment on a character               | nCloth               | Bifrost MPM cloth when it must tear, live in a Bifrost graph, or go to a game via USD (Jason hmuWr2nWSms, yo6y7cANfX0) |
   | Dust puff, smoke, mist                     | Bifrost Aero         | add MPM sand or snow for dirt clumps; nParticles for grit (doc-level only)                                             |
   | Snow, sand, mud impact                     | MPM granular         | none in the sources                                                                                                    |
   | Scatter, crowds of copies, motion graphics | MASH (Repro)         | Instancer for speed; Bifrost `scatter_points` for USD point instancers                                                 |
   | Liquids                                    | `basic_liquid_graph` | legacy Bifrost Fluids is gone                                                                                          |

3. **Prepare cloth inputs.** Topology gate
   `mx_fx.cloth_topology_verdict(mx_audit.audit(garment), expected_border_loops=1)`: evenly spaced
   quads (cross links need quads), manifold, single-sided, holes sealed (SARKAMARI [00:03:05]).
   Pre-roll `mx_fx.add_preroll(ctrls, action_start, rest=bind_pose)`; duplicates at the bind frame
   with `mx_fx.sim_duplicate`. GATE: verdict clean, the duplicate follows the original within 0.01
   cm.
4. **Build.**
   - nCloth: `mx_fx.build_cloth_rig(garment_SIM, body_SIM, action_start, preset=...)`: one nucleus,
     Space Scale for the unit, start at the pre-roll, first pass substeps 10 / iterations 12, preset
     values, thin cloth and collider. Pin a cape collar with an input-attract lock map (value 1 plus
     Input Attract Method "Lock values of 1.0 or greater", Collide Last Threshold 1.0, [added]
     recipe from the doc) or Point to Surface with Exclude Collisions (SARKAMARI [00:23:40]),
     members on the input mesh (output-mesh members risk a DG loop, doc;
     `point_to_surface(..., cloth=)` rewrites them). GATE: `rig["verdict"]` has no error.
   - Bifrost: start from `basic_*_graph` and Explode (Stamatelos [00:39:07]); script it with
     `mx_fx.BifrostGraph` (logs every VNN call) or reuse a GUI Echo All Commands log. Hide what you
     bring in (Jason). Open or flat emitters (ring, ground patch) need Shell, closed ones Solid
     (Stamatelos [00:10:40]). Set the sim's start frame. GATE: `aero_source_verdict(...)` on
     `emitter_facts(mesh)` and `sim_range_verdict(...)` clean; every output pulled; point or voxel
     count above 0 on every frame.
   - MASH: `mx_fx.mash_network(sources, geometry="Repro")` [verify MASH.api]; unit-size sources
     (Waters). GATE: `mx_fx.mash_cache_reasons(mx_fx.mash_inventory(waiter))` read.
5. **First pass cheap, then cache.** Low resolution (Aero detail 0.1, cloth first pass), frames
   evaluated in order from the start frame (`mx_fx.run_sim`, `step_frames`), every frame played in
   the GUI. After a `geo_detail_size` or `time_step_size` change, or a compound created or exploded,
   re-run from the start (sim guide). GATE: nothing non-finite, no empty frame.
6. **Measure and look.**
   `rep = mx_fx.sim_report(cloth_out, body_SIM, start, end, action_start=..., thickness=...)`,
   `rep["convergence"] = mx_fx.convergence_test(...)`, `mx_fx.sim_verdict(rep, budget_spf=...)`
   (adds the doc's Timing Output gate: solve seconds per frame against the brief). Then look:
   headless
   `mx_review.review([cloth_out, body_SIM], out, views=("side","back","threequarter"), modes=("clay",), focus=fixed)`
   at the action start, the peak and the last frame; GUI `mx_review.playblast` from the shot camera;
   volumes with `mx_fx.volume_review` (Arnold, tricubic). Judge with
   [`references/critique.md`](references/critique.md).
7. **Triage in this order** (never stiffen first): scale; start state (pre-roll, Push Out, Crossover
   Push with Trapped Check); substeps with iterations above; thickness down, Self Collide Width
   Scale up; stretch and compression together (SARKAMARI [00:24:50]); Bend Solver High Quality for
   flips; Collide Last Threshold 1.0 when attract or rigidity drags cloth through; lower Strength on
   popping constraints; "frame change too large" means play from the start or cache (2027 Help).
   Leftover pokes: a sculpted corrective on the cached mesh, or accepted under blur (SARKAMARI
   [00:37:12]). Aero detail: 2027 sharpening (`aero_refinement_settings`, low amount), adaptivity
   bounds, or `post_refine_aero` on the cache (frames in order, original sources and colliders)
   before lowering detail size everywhere (sim guide).
8. **Final cache and deliver.** Final pass settings, nCache from the nucleus start
   (`ncache_verdict`: mcc stops at 2 GB, use mcx; positions only, so the cloth transform must stay
   still), disable the nucleus, Alembic of cloth and body over the shot range with UVs and color
   sets (`mx_fx.alembic_export`); Bifrost `file_cache` with only the properties the renderer needs;
   a cache-only render scene. GATE: `mx_fx.alembic_check` and `file_sequence_report` clean, a look
   at the cache.

## Numbers

| Value                                                                                                     | Relative to                                                          | Source                |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------- |
| Space Scale, `scene_units_in_meters` 0.01                                                                 | cm scene                                                             | 2027 Help; Stamatelos |
| Nucleus 3 / 4 (presets), 10 / 12 first pass, 30 / 35 final                                                | substeps / max collision iterations                                  | doc; SARKAMARI        |
| Pre-roll hold 25 + blend 25, start -50                                                                    | action at 0                                                          | SARKAMARI             |
| Trousers friction 0.1, stretch 80, compression 20, damp 0.4 then 0.2, mass 0.8                            | T-shirt preset 0.3 / 35 / 10 / 0.8 / 0.6                             | SARKAMARI; doc        |
| Loose shirt stretch 40, compression 15, mass 0.2, damp 0.3                                                | same                                                                 | SARKAMARI             |
| Rest length 0.9 tight, 0.5 bunching; attract 0.7 [?] collar                                               | painted regions                                                      | SARKAMARI             |
| Collide Last Threshold 1.0 (default 0.2)                                                                  | attract or rigidity in use                                           | doc                   |
| Aero ambient 20, source 580, buoyancy -9.81                                                               | rise comes from the difference                                       | Stamatelos            |
| Aero detail 0.1 preview, 0.05 default, 0.025 fine                                                         | Absolute mode (world units); Relative keeps the voxel count constant | Jason; Stamatelos     |
| MPM `initial_firmness` about v squared (10 m/s: 100)                                                      | impact speed                                                         | Gast                  |
| MPM cloth area preservation 0.1 (0 = stiffest), vibration speed +10 steps, collision max speed about half | cloth                                                                | Jason                 |
| Sprites 64 frames x 512 px, 8 x 8 on 4096; density 0.005 for the SDF                                      | flipbook                                                             | Jason                 |

## Quality gates

- **In code:** `cloth_topology_verdict`, `scale_report`, `nucleus_verdict` (iterations above
  substeps, scale, pre-roll), `sim_verdict` (zero penetrating vertices after the action, stretch
  under 1.10 x rest [added], pops, settle, standoff, convergence, solve time), `alembic_check`
  (range, one mesh, vertex count), `file_sequence_report` (every frame, no runaway growth),
  `sim_range_verdict` (cache and review reach the shot end), `ncache_verdict`, `mash_cache_reasons`,
  `overlaps` (instances), `sprite_framing`, `usd_check_unreal`.
- **Visual:** cloth weight and swing against reference at the character's speed, folds, armpit and
  back view with smooth preview, collar stiffness, garment stays on the shoulders, penetration
  visible in the shot camera or hidden by blur (SARKAMARI [00:36:39], [00:37:46]); smoke rises,
  breaks up, dissipates, no disappearing voxels, stepped trails or collider gap, judged in the
  render (Stamatelos; sim guide); MPM crack pattern, piece size, debris; MASH jitter while scrubbing
  a deforming mesh (Waters [00:03:53]).

## Common mistakes

| Mistake                                                                          | Looks like                                          | Fix                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Space Scale 1 in a cm scene                                                      | slow, floaty giant cloth                            | 0.01, or record an art choice                                                                |
| Iterations at or below substeps                                                  | extra steps change nothing                          | iterations above substeps                                                                    |
| No pre-roll, sim starts on the action                                            | explosion or intersection at frame 1                | hold plus blend, start -50                                                                   |
| Alembic range starts after the nucleus start                                     | solver jumps, cloth pops or freezes [added, verify] | cache first, or export from the start frame                                                  |
| Thick cloth for self collisions                                                  | bloated cloth standing off the body                 | thin cloth, Self Collide Width Scale                                                         |
| Bifrost output not pulled                                                        | object vanishes, no error                           | route feedback and debug nodes to the output                                                 |
| Stepping from after the sim's start frame, or a start frame outside the timeline | first frames do not solve, or nothing happens       | step from the start frame (`sim_range_verdict`)                                              |
| Absolute resolution with a small detail size                                     | voxel count explodes, Maya hangs                    | Relative, or an `aero_source_verdict` estimate under budget (Stamatelos [00:12:48])          |
| Dust sourced hot                                                                 | rises as a plume instead of spreading               | temperature at ambient 20, initial speed and inherit velocity [added from Stamatelos' knobs] |
| Uniform smoke source                                                             | lumpy mushroom cloud                                | `vary_source_property`, noise-deformed emitter, turbulence, dissipation (Jason)              |
| Relative collider detail on a big ground                                         | gap under smoke or snow                             | smaller collider detail, `link_collider_detail` (MPM)                                        |
| MPM pin plus direct make-to-simulate link                                        | cloth simulated twice                               | remove the direct link                                                                       |
| Face-area MASH scatter on a skinned mesh                                         | points jitter                                       | Mesh from Points, skin, copy weights, Vertex + Flood                                         |
| Animated Time Scale without Simulated Time                                       | catch-up burst                                      | Simulated Time, then bake                                                                    |

## Handoffs

- **Receives from scenario-maya-animation:** a referenced rig or an Alembic of the character, the
  approved shot range and fps, bind pose available (for the pre-roll), `validate(profile="shot")`
  clean. Asks for pre-roll room before the action if the timeline starts on it.
- **Delivers to scenario-maya-lighting-rendering:** a new scene version `<shot>_fx_render_v###.ma`
  holding only caches; Alembics `<asset>_<fx>_v###.abc` (UVs, color sets, shot range plus handles)
  and the body they collided with (SARKAMARI [00:39:34]); VDB sequences with only density and
  velocity (plus temperature for fire); Bifrost caches `.bob` for resumable work; `sim_report.json`,
  the review sheet or playblast looked at, and what was not verified. Units cm, Y-up; frame range
  stated.
- **Delivers to scenario-maya-pipeline-scripting (games):** flipbook passes (emission,
  volume_direct, tangent-space normals) with `sprite_framing` clean, baked Alembic or USD meshes
  checked by `usd_check_unreal`, low resolution for engines (Jason yo6y7cANfX0 [00:05:09]).
- **Asks scenario-maya-rigging** for a closed, simplified collider proxy when the render body is
  open or heavy.

## Maya 2027 notes

- Bifrost 3.0 (3.1.0.8 in 2027.1) is always installed; async evaluation; Batch Execute and Write
  State; node search. Legacy Bifrost Fluids is gone: `basic_liquid_graph`.
- MPM 2027: `link_collider_detail`, `max_voxel_movement` retries, `lag_colliders`,
  `initial_firmness`.
- Bifrost doc names disagree (`simulate_liquid(s)`, `liquid_solver_settings` vs `_properties`,
  `geo_volume_mode` given to both Solid/Shell and Absolute/Relative): read ports with
  `BifrostGraph.find_port`.
- nCloth Bend Solver default is High Quality. Cached Playback can cache dynamics in memory; files on
  disk remain the handoff.
- MASH: Signal replaced Noise and Trig, Strength replaced Mute, nodes act on TRS, Repro is the
  default, Delay offsets transform animation.
- Alembic is Ogawa only. AbcExport's `-j` string splits on spaces [added, verify]: `alembic_export`
  writes to a space-free temp path first.

## References

- [`references/procedures.md`](references/procedures.md): full code for every stage (cloth, Bifrost,
  MPM, caches, VDB review, sprites, USD, MASH). Load before scripting.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  and the choices where experts disagree. Load when a setting needs a reason.
- `references/critique.md`: the rubric to judge a sim, cache or scatter. Load before calling an
  effect done.
- [`references/gui-paths.md`](references/gui-paths.md): menus and hotkeys for a computer-use agent,
  plus the Echo All Commands discovery path.
- [`references/sources.md`](references/sources.md): every source, credential, URL and best
  timestamps.
- `scripts/mx_fx.py`: the toolkit (docstring lists every function). Tests: `tests/code/maya-fx/`.
