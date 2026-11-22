---
name: scenario-zbrush-character-creature
description: 'Use when sculpting a realistic head, face, portrait, body or creature in ZBrush (anatomy, landmarks, proportions, "the face looks off", eyes, lips, jaw), adding skin, pores, wrinkles or reptile and dragon scales with alphas, Surface Noise, layers or morph targets, planning subdivision or HD Geometry for a film close-up, reprojecting detail, sculpting cloth folds or running Dynamics cloth, growing FiberMesh fur or hair, making horns, or judging a character sculpt the way a senior character artist would.'
license: MIT
---

# Realistic characters and creatures (ZBrush 2026)

Expert level here means every form has a cause (skull, mass, tension, compression) before any pore
exists, and every detail pass is reversible, regional and judged in renders from several views and
lights. The agent works the way Kingslien and Costa do: find the upstream cause, fix it at the
lowest level that holds it, and keep detail on layers or behind a stored morph target. If a sibling
skill named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or
ask the user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed
from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).
Toolkit: [`scripts/zb_character.py`](scripts/zb_character.py) (stroke plans, ZBrush-side wrappers
via `zb_character.call(...)`, OBJ, alpha and render checks) on the lead's toolkit.

## Stance (the expert delta)

- **Cause before form, in planes.** Kingslien: cranial versus facial mass, then the Bridgeman masses
  (forehead box, flat cheek, maxilla cylinder, triangular jaw), then features sculpted through the
  forms around them (nostril through the alar facial juncture, eye through the nasojugal groove).
  "Almost everything right or wrong in this face is right or wrong back in the beginning." A region
  touched twice means replan (`MoveBudget`). His single separating lines suit synthesized strokes.
- **Detail is worthless on a weak base.** Costa: judge primaries blurred, from afar, upside down and
  under three lights from the first sketch; keep level 1 alive for likeness edits until export.
- **Asymmetry lives in the big forms.** FlippedNormals break symmetry in the mid-frequency pass; J
  Hill again in the last 25 percent (nose tip off the axis, one ear, a lip corner, one eye's scale);
  Lazov pushes the whole creature from a stored morph target. Creature big forms: skull mass, one
  orbit rim, the jaw corner, a nostril, a horn's angle. Scars and broken scales come on top, never
  instead.
- **Skin: scale first, regions second, breakup third.** J Hill sets pore scale globally for age and
  sex first; lids and lips stay clean; even skin between details reads as plastic. Lines lie across
  the compression, in short connected segments (Costa: wrinkles connect pores, perpendicular to the
  circular muscles). Cracks on horns and tusks go large to small in stages (Starkie).
- **Scales follow the anatomy; alphas never finish a surface.** Henning Sanden: generic tile, mid
  value 50, tested on the model at least three times while you build it, then a hand unify pass;
  smooth inside a scale, never across its border. Starkie: a close-up hero gets individual scales
  (he gives no numbers). Berger: story, then biology, then cool; reference animals blended with no
  seams.
- **Sharp enough to survive the render.** FlippedNormals: carve deeper than feels right, because SSS
  and soft light eat sharpness; J Hill: only the sharp detail survives in the highlights. Over
  finished detail ClayBuildup erases what is under it: enhance with Standard, make directional
  passes with Elastic.
- **Folds and poses have causes.** Grassetti: every fold starts at a tension point, ends in another
  fold or an edge, is heavier near the tension; tightness picks drop, zigzag, X or Y. Eaton: only
  the force chain is tense; active muscles run straight between landmarks; scapula about 30 degrees
  at 90 degrees of arm elevation.
- **Agent limits [added].** Transfer well: palette operations, feature masks plus Deformation
  sliders, layers and morph targets, two-point alpha stamps, short lines, spray loops, curves-API
  horns. Stay weak: Costa's thin ClayBuildup layering, groom and Morph-brush feel, anything needing
  Ctrl or Shift held, and HD Geometry (the A key cannot be sent). Say so in the report.

## Establish first

| Input                 | Changes                            | Default when silent                                                                                             |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Purpose and shot      | stack, map path                    | film close-up still, 32-bit displacement into Maya/Arnold [added]                                               |
| Driver                | stack route                        | SDK only: regular levels, no HD; computer use: HD split                                                         |
| Subject and reference | canon, blend                       | human: A4S canon, Costa's millimeters; creature: two or three animals blended (Berger)                          |
| Age, sex, weight      | pore scale, fat pads, gonial angle | adult, written down first                                                                                       |
| Pose                  | symmetry strategy                  | neutral: symmetric until the mid-frequency pass; posed: symmetry off (Eaton)                                    |
| Base mesh             | where detail starts                | ZRemeshed quads with UVs and interior polygroups (eyes, mouth, nostrils) from scenario-zbrush-retopology-export |

## Workflow

0. **Brief and maps.** Design pyramid (Berger); rest versus rich zones (Lazov); scale flow over the
   anatomy (Henning). GATE: all three written down.
1. **Masses** (from scenario-zbrush-sculpting, or skull first here, Lazov). Head: cranial versus
   facial mass, then Bridgeman masses on a stroke budget (Kingslien: 16 Move strokes; C2). Creature:
   skull, jaw hinge, horns (C17), open and closed mouth on layers (Berger). Figure: landmarks first
   (Eaton). GATE: sheet with front, profile, three-quarter and below (`view_facing("-Y")`);
   `head_ratio_check` or `scapula_check` passes or the deviation is deliberate; no retouched region.
2. **Face critique pass** in Kingslien's order ([`references/critique.md`](references/critique.md)).
   The first failing step is the fix: a separating line (C3), a masked move (C4) or plane strokes.
   GATE: `face_report` moves the right way against the previous stage.
3. **Topology, stack, projection.** Detail only on a clean, UV'd base. Choose the route before the
   first Divide (C5): SDK only, `subdiv_plan(route="regular")` to about 20 to 25M, micro detail in a
   tiled map at render; computer use, 3 to 4 regular levels (top 1 to 2M) then 3 to 4 DivideHD.
   Never add HD over a 6 or 7-level stack: you cannot go below the HD entry (J Hill). Reproject with
   `zb_ops.project_all` (checkpoint, morph target and top-level layer built in), eye, mouth and
   nostril interiors masked first; then walk every level (C19). GATE: `stack_check` ok;
   `spike_report` ok in every danger-zone group; points per level logged.
4. **Secondary forms:** folds, wrinkles, fat pads, lids, lips; Costa's thin ClayBuildup (Z 2 to 3,
   many short strokes), Kingslien's lines; symmetry off for the big-form mid-frequency pass. Cloth:
   plan folds (C13) or simulate, then sculpt (C14, C15). GATE: blurred and thumbnail renders; no
   form "screams".
5. **Tertiary detail, one layer per frequency** (`layer_new`, agent-side ledger). Aim first:
   `aim_at` the region, stamps inside `region_on_canvas` (C9). Pore or scale bed: Surface Noise (C7)
   or alpha stamps (C8, C9), each alpha tested on the model while built. Wrinkles across the
   compression (C10); cracks with `crack_tree`, largest first; breakup (C11); hand unify. GATE:
   raking close-ups; `alpha_check` (and `dots_check` if dots were used); no tiling; lids and lips
   clean; each layer seen at intensity 0 and 1.
6. **Asymmetry pass (C12)**, big forms first. GATE: `asymmetry_report` finds at least two big-form
   regions broken; posed figures skip it.
7. **Fur and hair (C16).** Mask, preset from a file, Preview, Accept, Fast Preview PRE Vis 6 to 8.
   GATE: coverage render with a contrasting fill.
8. **Final review and handoff (C20).** Costa's eight steps under three lights, upside down, blurred;
   `eye_report`; `detail_survival` on the SSS render; `map_request_check`; versioned ZTL. GATE:
   scorecard passes, or open items listed.

## Numbers

| Item                | Value                                                                                                                                                      | Source                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Stack, SDK only     | regular to about 20 to 25M (6,240 faces reach 25.5M at SDiv 7); "40 million is high"; micro detail tiled at render                                         | J Hill; Costa         |
| Stack, computer use | 3 to 4 regular levels, top 1 to 2M, then 3 to 4 DivideHD (Costa: 1.1M top, 3 DivideHD, 70M); HD ceiling 1 billion, so 3 DivideHD over 16M is already at it | Costa; J Hill; HD doc |
| Reprojection        | target at about 3M; Store MT and a layer at the top level; PA Blur lowered                                                                                 | FlippedNormals        |
| Face block-in       | under about 360k points with Sculptris Pro                                                                                                                 | Kingslien             |
| Head canon          | crown to hairline 1/6 H, then thirds of 5/6 H; eyes at 1/2 H                                                                                               | Anatomy For Sculptors |
| Portrait scale      | head 229 mm, eyeball 24 mm, IPD 63 mm, eyes 3 to 10 degrees outward                                                                                        | Costa                 |
| Wrinkles            | Standard + Alpha 39, sharpened curve; fine: Standard, Spray, Alpha 60, Z 3                                                                                 | Costa; J Hill         |
| Pores               | DragRect, Focal Shift -100, one size per zone; Surface Noise strength negative                                                                             | Costa; J Hill         |
| Alpha tile          | plane, Smt off, about 1M polys (a 1K map), document 1024, perspective off, +50/-50 dots taller than any detail, MidValue 50; tested at 11, 26, 41 minutes  | Henning               |
| Folds               | Standard Z 25 valleys, Clay Z 80 ridges, big Move for sag, SDiv 2 to 4 first                                                                               | Grassetti (frames)    |
| Cloth               | Gravity 1 to 2.5; iterations 100 to 1000; Firmness 1 to 2 silky, 5 to 6 leather; collision about 1024; Extract Thick 0.01 cloth, 0.03 leather              | Pavlovich; Maxon docs |
| Fur                 | Max Fibers 11 (thousands), Segments 6, PRE Vis 6 to 8, Profile 1                                                                                           | Pablo; FiberMesh docs |
| Horns               | detail straight, radial counts 8, 5, 3, then bend; decimate a copy to 20 % (arrays 5 % then 1 %); curve Res 10, Imbed 0                                    | Pablo                 |

## Quality gates

- **Measured:** `stack_check`; points per level and layer count; `spike_report` per polygroup at
  every level; `head_ratio_check` within 5 percent of H [added]; `face_report` deltas;
  `mirror_deviation` and `asymmetry_report`; `alpha_check`, `dots_check`; fold `free_endpoints` = 0,
  `evenness` > 0; area drift under 5 percent after a sim [added]; `eye_report`; `detail_survival`
  ratio at least 0.5 [added]; `map_request_check`; volume before and after every stroke batch.
- **Seen:** `zb_review.review` sheets in MatCap Gray (front, profile, three-quarter, below, back),
  raking close-ups per region and per danger zone after projection, `blurred`, `thumbnail`,
  `upside_down`, and the three-light SSS render (highlights keep the sharp detail).
  `references/critique.md` says what to look for.

## Common mistakes

| Mistake                         | Looks like                                                              | Fix                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Features on an undivided egg    | no facial plane in profile                                              | cranial versus facial mass, Bridgeman masses (C2)                                    |
| Eye centered in the orbit       | straight rim, lumps under the eye                                       | eye high, margin hooked into the orbit, check from below (C3)                        |
| HD on a deep regular stack      | 6 or 7 regular levels then HD; no smoothing room; 1 billion faces       | route chosen first, `stack_check` (C5)                                               |
| Projecting without nets         | spikes in lids, lips, nostrils, fingers; hard lines in the displacement | `project_all` nets, interiors masked, level walk; `morph_repair`, never smooth (C19) |
| Symmetry broken only in details | scars on a mirrored skull                                               | move the big forms (C12)                                                             |
| Uniform detail                  | plastic, noisy, no rest                                                 | region map; lids and lips clean; beat-up at three sizes                              |
| Alpha built blind               | soft, tiled, bordered on the model                                      | test on the model while building; dots taller than any detail; hand unify (C8)       |
| ClayBuildup over finished pores | detail erased                                                           | Standard to enhance, Elastic for direction                                           |
| Micro detail too soft           | gone in the SSS render                                                  | carve deeper; `detail_survival`                                                      |
| One long wrinkle line           | drawn, not skin                                                         | short connected segments across the compression (C10)                                |
| Lone or even folds              | dangling ends, ladder of copies                                         | termination and unevenness rules (C13)                                               |
| Sim stretch or ghost collider   | long polygons at contacts; cloth hugging nothing                        | more iterations or less gravity; Recalc after visibility changes                     |
| Fibers lost                     | groom vanished, FiberUV grayed                                          | neutral settings before a groom; groom first, Divide last                            |

## Handoffs

- **Receives** from scenario-zbrush-sculpting: a versioned ZTL with the primary forms, polygroups
  per region, `stats()` and the last sheet. From scenario-zbrush-retopology-export: the clean quad
  base with UVs (UDIMs), interior polygroups for eyes, mouth and nostrils, and the projected stack
  (`rx.project_stack`).
- **Delivers** to scenario-zbrush-retopology-export: the detailed ZTL with level 1 intact, eyes as
  separate SubTools, layers baked or the ledger, a morph target at the export level, and a map
  request that passes `map_request_check` (Adaptive identical across maps, SubDiv below the top, Mid
  equal to the renderer's zero, UDIM tile names with a dot, Merge Maps off with EXR; Costa's film
  values in [`references/procedures.md`](references/procedures.md) C20). UVs relaid outside ZBrush
  come back by Store MT, Switch, Import at the export level, no Divide, Switch MT on (Costa). To
  scenario-zbrush-paint-render: the same ZTL, region polygroups, grayscale approval renders and the
  three-light SSS request.
- **Related:** scenario-zbrush-stylized, scenario-zbrush-pose-print, scenario-maya-groom (XGen).

## ZBrush 2026 notes

- Not scriptable: HD entry (A key; `press_key` "does not work"), layer names (the macros rename
  through ZFileUtils), mask painting, Shift-smoothing, the NoiseMaker window (set once by computer
  use, save a .ZNM).
- `Brush:Dam_Standard` does not resolve on 2026.2.1: select brushes through `zb_ops.select_brush`,
  run `brush_check` once per session. Orb_Cracks, RK_ and Antro_ brushes do not ship: Dam_Standard,
  Slash3, ClayBuildup, TrimAdaptive stand in.
- Since 2026.1 custom alphas and brushes live in the Asset Directory (`alpha_library_dir()`).
  NoiseMaker 2.0 (2026.0) rotates a tiling alpha to follow each region's flow. Redshift inside
  ZBrush runs the SSS check; Substance Bridge (2026.2) is the Painter route.
- Decimate a duplicate, never the master (`rx.decimate_copy`); a scripted pre-process may end the
  calling script [verify].
- Unconfirmed: layer intensity path, NoiseMaker blocking, scripted Run Simulation stop (live_c01,
  c03, c05).

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  conflicts with their deciding condition. Load when planning a stage.
- `references/procedures.md`: bridge procedures C1 to C20, full code, live tests. Load before
  writing bridge code.
- `references/critique.md`: Kingslien's face checklist, Costa's evaluation, skin, creature,
  projection, cloth and fur rubrics. Load at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, hotkeys, brushes, settings for a
  computer-use agent.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, best timestamps,
  revision log.
