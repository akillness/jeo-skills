# Expert notes (scenario-maya-fx)

The depth behind SKILL.md: what each source believes, with timestamps (`[hh:mm:ss]`) or doc
sections. Distilled notes live in `notes/fx/` and `notes/motion-graphics/`; this file keeps the
judgment an agent needs. [added] marks inferences of this skill; [?] marks values garbled by auto
captions.

## Reza Sarkamari: nCloth for character animation (RhAxSgPpZww, 2020)

VFX trainer at ILM, previously Sony Pictures Imageworks. Trousers then shirt on a mocap character.

- **Bad input makes nCloth impossible**: retopologize Marvelous Designer garments to evenly spaced
  quads, a few triangles under the armpit at most, single-sided (wrap the double-sided render mesh
  afterwards), no non-manifold (Mesh > Cleanup with Nonmanifold, Faces with holes, Concave faces
  reports nothing), seal pockets and zippers [00:01:20] [00:02:28] [00:03:05] [00:03:41] [00:04:53].
- **Pre-roll of 50 frames**: still from -50 to -25, into the first pose from -25 to 0, action at 0;
  cloth needs 25 to 50 frames to settle; Nucleus start frame -50; Play every frame [00:05:26]
  [00:06:00] [00:18:59].
- **Clean sim rig**: group the rig, skin the clothes to the skeleton, duplicate body and clothes,
  unlock their transforms, blend shape each original onto its duplicate at weight 1, hide the
  originals; never put Nucleus nodes on the character group [00:07:09] to [00:13:08].
- **Defaults to distrust**: substeps 3 and iterations 4 are "way too low" (first pass 10 and 12
  [?]); friction and damp defaults "always too high"; thickness too big (check Solver Display =
  Collision Thickness; about 0.025 [?] on cloth and body) [00:18:26] [00:20:47] [00:24:16]
  [00:25:23].
- **Attachment**: Point to Surface on the top two waistband loops, Exclude Collisions on to push out
  interpenetration [00:22:27] [00:23:40].
- **Stretch and compression move together** ("if you double this double the next one"): trousers 80
  and 20, shirt 40 and 15, from the T-shirt preset's 35 and 10 [00:24:50] [00:34:15].
- **Hard-surface knobs stay at zero on garments**: rigidity, restitution angle and tension
  [00:24:50].
- **Paint regional behavior, then Smooth and Flood**: rest length 0.9 where tighter, 0.5 against
  bunching, input attract around a rigid collar and shoulders (0.7 [?]), damp in bunching regions
  [00:27:36] [00:34:51] [00:38:23].
- **Scale and substeps are the real fix**: Space Scale 0.25 "for now" on a 182 cm character (an art
  choice; the doc's physical value is 0.01), substeps 30 and iterations 35: "reducing scene scale
  and increasing substeps truly works" [00:29:22] [00:29:57] [00:30:36].
- **Cache before judging**: nCache > Create New Cache before every playblast [00:19:32].
- **Layering**: export the trousers to Alembic (UV Write, Write Color Sets), turn off their nCloth
  and constraints, import the cache as a passive collider, then simulate the shirt [00:31:10]
  [00:32:06] [00:32:38].
- **Residual artifacts are fixed downstream**: a sculpted corrective in the Shape Editor, motion
  blur, reversed normals for a shading artifact [00:37:12] [00:37:46].
- **Render scene of Alembics only**: no skeleton, skin, Nucleus or constraints [00:40:07].
- **Judge like this**: cached playblast after each change against the previous one, wrinkles,
  armpit, back view, smooth preview, reference at the same speed [00:25:56] [00:36:39] [00:37:12].

## Konstantinos (Kosta) Stamatelos: Bifrost Aero master class (U_CqI5R3Ibw, 2019)

Bifrost designer of the simulation graphs and workflows.

- **The graph reads as a sentence**: object, source_air, simulate_aero, output; one Bifrost object
  wire through every node [00:04:18] [00:07:36].
- **Physically accurate default, art direction on top** [00:03:09].
- **Scale is huge**: 1 Maya unit is 1 m; a 6 m emitter looks slow and majestic, a lighter needs
  small geometry or `scene_units_in_meters` 0.01 [00:28:43] [00:29:15] [00:29:49] [00:30:21].
- **Relative resolution is the default on purpose**: constant voxel count whatever the emitter size;
  Absolute on a big emitter can hang Maya [00:11:08] [00:12:48].
- **`geo_detail_size` and `fluid_detail_size` are independent**: a dense emitter mesh can be
  voxelized coarsely [00:09:34] [00:10:07]. Solid for closed meshes, Shell for open ones [00:10:40].
- **Rise comes from temperature difference**: source 580 against ambient 20 with buoyancy -9.81
  [00:08:30]. A near-ambient source does not rise [added inference, the basis of the dust recipe].
- **Moving emitters**: inherit velocity passes inertia, negative gives thrust; trail smoothness
  removes stepped trails [00:16:51] [00:17:23].
- **Local versus global knobs**: temperature, density, resolution, start frame per source; ambient,
  buoyancy, style, speed, units on the solver [00:25:59] [00:33:04].
- **Mixed resolutions**: background sources coarser; where plumes mix, the finer detail wins
  [00:21:25] [00:23:39].
- **Globals**: velocity smoothness is a fix for jagged motion, not a default; kill voxel fog
  threshold decides whether thin mist survives [00:27:36] [00:28:43].
- **Style**: smooth (linear, relaxed, cigarette), wispy, fluffy (billowy), busy (chaotic); same rise
  speed, different dynamic; judged with side-by-side playblasts [00:30:50] to [00:33:04].
- **Accuracy**: raise max steps or lower time step size only when the fluid itself is fast (big
  initial speed, very hot, expanding combustion), not because the emitter moves [00:33:29]
  [00:34:03].
- **Collisions**: the gap between smoke and collider is the collider's voxel size; lower its detail
  size [00:37:40]. Master start frame also moves colliders: turn it off after debugging [00:24:44]
  [00:37:04].
- **Template**: `basic_aero_graph`, explode, L: the minimum for any Aero sim, the base of every
  Browser example [00:39:07].

## Ted Gast: Bifrost MPM master class (GGnyd4zD5pY, 2020)

Jixie Effects, developer of the MPM solver. Snow and sand; captions machine-garbled, terms mapped to
2027 names.

- **Particles carry state, a grid computes forces**; plasticity is forgetting deformation outside
  the yield surface [00:00:27] [00:33:34].
- **Fix the collider gap first**: relative collider resolution on a large plane floats particles;
  feed colliders the solver detail size in absolute mode (2027: `link_collider_detail`) [00:02:39]
  [00:04:33].
- **Detail size is in meters**: change `scene_units_in_meters` and re-set it [00:07:29] [00:08:32].
- **Do not simulate the flight**: start the snowball just above the collider with its impact
  velocity [00:55:18] [00:55:49].
- **Initial firmness about v squared** (speed 10, firmness 100); for a drop, height times gravity;
  "a guideline, not a strict rule" [00:56:53] [00:57:24].
- **Tension capacity about cohesion x firmness, shear capacity about friction x firmness**; cohesion
  sets piece size, friction sets sliding and shear breakup [00:58:29] [01:04:21] [01:08:12].
- **Debris is negative firmness**; negative initial firmness makes loose grains that firm up only
  when compacted [00:47:06] [00:47:41].
- **Snow model covers dirt and clay** [00:38:34]. Volume preservation 0, 0.5, 1 goes from balanced
  to liquid-like [00:21:12] [00:23:22].
- **Diagnose by state colors** (debris, undeformed, deformed, compacting, decompacting) and predict
  plasticity changes on a cached elastic bump test [00:49:39] [01:05:59].
- **Judge**: crack pattern (a clean crack down the center, half sliding off), piece size, debris
  amount, healing by compaction [00:59:33] [01:09:18].

## Jason Brown: Bifrost Bootcamp (Maya Learning Channel, 2023)

Autodesk Bifrost compound developer (per manifest).

- **Basics (nFBkBQnHdjQ)**: data flows left to right, typed; an input is a live link to the Maya
  object, so hide it [00:03:45]; get, modify, set positions is the atom [00:11:02]; an empty array
  empties the geometry without an error [00:11:02]; watchpoints show size and range [00:08:57].
- **Compounds (ao3uLbqzRCI)**: expose only artist controls, name ports, group, limit ranges, keep a
  pasted backup before editing [00:04:28] [00:08:20] [00:09:25].
- **Scattering (ifSJalXbGfI)**: tune on points, judge on instances [00:27:49]; transfer_properties
  carries normals and UVs [00:03:59]; density weights accept a value, array, property name or field,
  and at or below 0 means no points (push the fcurve to -0.5 for a hard exclusion) [00:19:25]
  [00:23:24]; blue noise is the working default [00:15:34]; randomize rotation in local space
  [00:35:43]; Alpha Cut chokes the viewport with thousands of alpha leaves, use Object Sorting
  [00:07:38]; assign the Maya shader inside the graph for Arnold [00:39:20].
- **Simulations (E3aOt5wuvoo)**: a solver takes its output as its next input; feedback ports in
  pairs, explicit types, one time node [00:06:22] [00:09:11]; an unpulled feedback output killed the
  whole solver silently [00:22:49]; random per point needs index seeds, per frame a frame seed;
  integer frame math [00:27:19] [00:38:00].
- **Aero smoke (cd3HgvM8sXg)**: change one thing at a time, reset, replay 20 to 60 frames
  [00:21:43]; vary the source heavily (vary_source_property, noise-displaced emitter) [00:06:30]
  [00:10:24]; detail 0.05 default, 0.1 preview, 0.025 fine, Absolute mode [00:05:23] [00:13:12];
  dissipation 0.3 on fog density [00:14:48]; wind speed from abs(noise), direction from a baseline
  vector plus turbulence [00:17:51] [00:18:57]; simulate 300 to 500 frames and cut [00:26:08]; cache
  only voxel_fog_density and voxel_velocity [00:28:35]; a cache needs assign_material to display
  [00:29:07].
- **Sprites (bp9ydYUCmx8)**: render passes, not a beauty: emission, lit smoke (volume_direct),
  normals for relighting [00:01:31] [00:10:38]; normals = SDF gradient from density thresholded at
  0.005, remap -1..1 to 0..1, tangent space [00:02:31] [00:03:35] [00:04:40]; cache in stages
  [00:03:03]; render the VDB through an Arnold Volume: "faster, looks better, easier" [00:05:21]; 64
  frames, 512 px, 4K sheet [00:09:32]; the effect must never leave the cell: check early and late
  frames [00:18:34].
- **MPM cloth (hmuWr2nWSms)**: segments are a speed dial [00:01:47]; area preservation inverted (0
  strongest), 0.1 to start [00:06:03] [00:17:20]; vibration speed is stiffness, guess then +10
  [00:07:42]; collision max speed follows it [00:08:16]; rest shape as a wrinkle generator
  [00:21:58]; field-driven tear threshold [00:25:45]; "change settings until it looks right"
  [00:30:47].
- **Flag to Unreal (yo6y7cANfX0)**: pole as constraint with bounding box shape, not sphere ("I found
  out the hard way"), and as collider [00:01:02]; very high vibration speed, collision max speed
  about half [00:01:34]; low resolution for engines [00:05:09]; animated USD is written on the last
  frame, park the timeline at the start afterwards [00:07:38] [00:08:15].
- **USD traps (QMx97b19oHk)**: meters per unit and up axis Z for Unreal [00:11:25]; set fps
  explicitly [00:16:50]; unique prim names, triangulate, recompute normals [00:05:20]; RGB display
  color plus separate opacity [00:14:10]; Unreal drops USD points and curves (2023) [00:23:22];
  `primvars:normals` renders slightly wrong, rename to `normals` [00:29:40].

## Marcus Nordenstam: Bifrost visual programming masterclass (rUY9pO7UCjs, 2020)

Bifrost Product Manager, Autodesk.

- **A mesh is arrays**: point_position, face_vertex, face_offset (cumulative sum of counts with a
  leading 0) [00:07:34] [00:13:29].
- **Different-size arrays truncate silently**; set the iteration target so each iteration sees its
  element [00:38:11] [00:38:45].
- **Coincident points need index seeds** or they move together [00:16:55].
- **Feedback ports only as typed pairs on a compound** [00:49:42] [00:54:48]; **the start frame must
  exist in the timeline** (his sim did nothing from frame 0) [00:56:23].
- **Test each stage in isolation with a simple driver** (noise) before building on it [00:16:16]
  [00:41:54].

## Thorn Julan: Marvelous Designer and Maya (5LH76F48Jpk, 2020)

Credentials unverified. The only round-trip source.

- Same units and real-world size in both apps [00:01:28] [00:02:02]; garments on a neutral A-pose at
  0 with a 24-frame transition into the walk [00:02:33] [00:03:05]; record range equal to the
  animation [00:07:42]; tack at shoulders and waist [00:07:10]; export Ogawa, not HDF5 [00:10:25];
  Set to Face then Soften Edge after import [00:11:03]. An agent cannot drive MD: nCloth is its
  path.

## Ian Waters: MASH (2016 to 2017)

Creator of MASH (Mainframe North, then Autodesk). Lessons recorded in Maya 2016 Ext 2 and 2017; the
2027 doc lists what changed.

- **Repro first, Instancer for speed** (200k to 12k polys shown) [GzXUcjz-M4E 00:00:33] [00:03:22];
  several inputs need an ID node [00:02:15]; proxies back to high res before rendering [00:05:38];
  LOD needs a camera; frustum culling needs a border [00:06:41] [00:07:41]; networks nest
  [00:11:18].
- **Scatter on deforming meshes**: plain Scatter clumps but is stable, face-area Scatter is even but
  jitters; freeze with Mesh from Points, skin, copy weights, Vertex + Flood, Calculate Rotation off
  [5UDr_nK9PSs 00:02:47] [00:03:53] [00:08:33] [00:10:00]; contain volume points with border size or
  a Visibility falloff shaped by the skin [00:12:52] [00:14:35]; edge scaling needs a source of
  scale 1 and height 1 [00:16:45].
- **Falloffs**: Add mode is a simulation, cache it [_amRXvLVJmg 00:02:31]; CPV needs three switches
  and did not survive Alembic in 2016 [00:04:06] [00:04:31]; particles can be falloff shapes, Repro
  meshes can be colliders [00:08:01] [00:08:33].
- **Time node**: turn the source loop off, stagger over the cycle length; animating Time Scale
  without Simulated Time makes a catch-up burst; Simulated Time must be baked [xeSxL472d8Q 00:01:06]
  [00:01:37] [00:03:25] [00:03:44].
- **Python node**: recreated every evaluation, persist in attributes as JSON; `py_` attributes with
  min and max on the Python node itself; `md.setPointCount`, `md.getFalloff(0)`, `md.setData()`;
  OpenMaya 2.0 [ij5ke9ftyH8 00:03:18] [00:05:29] [00:06:39] [00:14:25] [00:14:58].
- **Placer**: unit-size sources, size from the Placer's random scale, paint big then small,
  reactivate the tool [Qb2ZGa0JBns 00:04:13] [00:05:52] [00:02:29].
- **World ecosystem**: model size must equal the measured footprint (wrong sizes intersect or kill a
  genotype), seed count sets dominance versus mixing, Refresh after genotype edits, deterministic,
  about 2 s per update [wloCNbLRetQ 00:16:06] [00:23:19] [00:24:55] [00:12:22].
- **Dynamics caching**: Repro via Alembic, Instancer via the Waiter's Cache Creator; networks
  sharing a solver must all be dynamic while any one is cached [Jv_rgrcd3C0 00:00:35] [00:03:31]
  [00:07:03].

## Autodesk Maya 2027 Help

- **nCloth, Nucleus, nCache** (`notes/fx/fx-groom__ncloth-nucleus-reference...`): computed in
  meters, Space Scale 0.01 for cm; the minimum number of collision iterations equals the substeps;
  high stretch resistance at low substeps cannot resolve stretch; cross links only on quads;
  compression above stretch keeps cloth soft but unstretchy; shear usually 0; rigidity or deform
  resistance instead of huge bend resistance for speed; Collide Last Threshold 1.0 when attract or
  rigidity drags cloth through (below 0.2 useless); lock input attract values of 1 or more to make
  vertices passive; Self Collide Width Scale instead of thick cloth; Push Out Radius is not a
  thickness; Crossover Push with Trapped Check for start interpenetration; Point to Surface needs
  Tangent Strength above 0 to collide, lower Strength on long links; constraint sets on the input
  mesh; tear versus shatter at Bend Resistance 0.2; gravity direction, not a rotated nucleus; mcx
  beyond 2 GB; caches hold positions only; disable the nucleus to scrub; "frame change too large"
  means play from the start or cache; presets assume substeps 3, iterations 4, Space Scale 1.
- **Bifrost graph fundamentals**: pure data flow; unpulled nodes do not execute (watchpoints empty,
  dump_object and file nodes silent); missing properties return empty arrays; truncation on size
  mismatch; feedback needs an input that changes every frame; custom sims step only when frame =
  last cached + 1; file_cache tokens and `####` padding; Write State plus Batch Execute avoids
  overwrites; directories must exist.
- **Bifrost simulation guide**: shared skeleton (sources, colliders, influences, settings,
  simulate); 1 unit = 1 m; every sim starts at frame 1 by default and frames before it are free for
  setup (Considerations); Absolute resolution with a small detail size can explode memory and time,
  and `aero_refinement_settings` sharpening (low amount), `aero_adaptivity_settings` bounds,
  `boost_detail_with_points` or `post_refine_aero` (on a cache, frames in order, original sources
  and colliders, detail not fed back) are the cheaper routes to detail (Increase detail,
  Adaptivity); a mesh with no thickness or not watertight needs Shell (Troubleshoot liquid); low
  resolution first; judge artifacts in the render, try tricubic first; soot is fog density; liquids:
  emitter overlaps the container, kill planes, Shell for thin meshes, surface tension 0.073; MPM
  pin: remove the direct make-to-simulate link or the cloth simulates twice; collider Volume and
  `lag_colliders` for leaks; `link_collider_detail`; `max_voxel_movement` retries mean lower
  `time_step_size`; Lazy file_cache is scrubbable and resumable; resume from a `*` cache with
  `set_initial_state`; `geo_detail_size` and `time_step_size` need a restart, and creating or
  exploding a compound resets its feedback caches (Considerations). Name clash: the Increase detail
  page calls the Absolute / Relative switch `geo_volume_mode`, the liquid page and Stamatelos use
  that name for Solid / Shell; read the ports.
- **MASH**: Waiter plus Distribute plus Repro or Instancer; start with Repro; cache Flight, Spring,
  Trails, velocity effects and Add-mode falloffs; deforming objects in dynamic networks only use
  their start shape; Time offsets component animation, Delay transform animation; Signal and
  Strength replaced Noise, Trig and Mute.

## Where the experts disagree (deciding conditions)

| Choice                         | Option A                                          | Option B                                                                                   | Decide by                                                                                                    |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Nucleus Space Scale in cm      | 0.01, physical (doc)                              | 0.25 on a 182 cm character (SARKAMARI)                                                     | Start physical; move away only as a recorded art choice, and re-tune stretch                                 |
| Layered garments               | sequential through Alembic colliders (SARKAMARI)  | one nucleus with collision layers (doc)                                                    | sequential when the outer layer rests on the inner; simultaneous when they push each other                   |
| Where cloth simulates          | Marvelous Designer, Alembic back (Julan)          | nCloth in Maya (SARKAMARI)                                                                 | the agent has no MD: nCloth; per-shot art direction favors nCloth anyway                                     |
| nCloth versus MPM cloth        | nCloth with painted maps, constraints, nCache     | MPM cloth (Jason)                                                                          | tearing, a Bifrost pipeline or a game USD export favor MPM                                                   |
| Bifrost resolution mode        | Relative (Stamatelos)                             | Absolute on colliders fed the solver detail (Gast); Absolute on sources (Jason's cauldron) | Relative for presets and unknown sizes; Absolute or `link_collider_detail` for big colliders and known sizes |
| Friction and damp on garments  | lower than presets: 0.1, 0.4 then 0.2 (SARKAMARI) | preset values (doc)                                                                        | lively loose garments lower; heavy stiff materials keep presets                                              |
| Aero style                     | smooth or wispy                                   | fluffy or busy                                                                             | haze, dust, steam versus billowing plumes; global to the sim                                                 |
| MPM firmness                   | high for chunks that crack (Gast)                 | low or negative for powder (Gast; doc)                                                     | impact energy (v squared) for chunks; powder low                                                             |
| Solver reset rule              | frame >= start takes feedback (Jason)             | frame == start takes initial (Nordenstam)                                                  | the doc rule for anything evaluated out of order: step only at last cached + 1                               |
| file_cache mode                | Write then Read by hand (Jason)                   | Lazy or Write State + Batch Execute (doc)                                                  | Lazy for resumable scrubbing; Write State when existing caches must be safe                                  |
| Cache properties               | fog density and velocity only (Jason)             | `*` (doc, resume)                                                                          | will the cache feed a solver again                                                                           |
| Bake instances                 | bake for some renders (Jason)                     | point instancer for USD games (Jason)                                                      | destination                                                                                                  |
| Tuning discipline              | one change at a time                              | two on the same compound once expert (Jason)                                               | an agent stays at one change per run and logs it                                                             |
| MASH scatter on a skinned mesh | Scatter (stable, clumps)                          | face area (even, jitters) or bake-then-skin                                                | static mesh: face area; deforming: bake then skin                                                            |
| MASH environment               | Placer painting                                   | World ecosystem                                                                            | hero areas painted (GUI), large natural areas simulated                                                      |

## Gaps (no source covers them)

- A cape, long skirt or flag on a character with nCloth: the cape procedure is assembled from
  SARKAMARI's garment recipe and the doc [added].
- An Aero dust or impact puff: assembled from Stamatelos' knobs [added]; Aero Part 2 (influences,
  source variation) was announced, not in the set.
- nParticles for grit or debris: doc only.
- MASH.api and openMASH names: no source documents the scripted network builder.
- Headless evaluation of Bifrost and MASH by stepping `currentTime` in mayapy: untested anywhere.
