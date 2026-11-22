---
name: scenario-zbrush-sculpting
description: "Use when an agent sculpts organic forms in ZBrush 2026 (sculpt a head, bust or creature in ZBrush from a sphere, ZSpheres or primitives); when blocking primary and secondary forms, choosing DynaMesh, Sculptris Pro or subdivision levels, or setting ClayBuildup, Dam_Standard, Move or TrimDynamic; when using masks, polygroups, Morph Targets or layers; or when scripted strokes miss, do nothing, come out too strong or leave marks, or a re-DynaMesh does nothing or loses polygroups."
license: MIT
---

# ZBrush sculpting (core forms, scripted strokes)

Expert sculpting goes big to small with gates: light meshes raised in resolution only when the forms
ask, clay built across the form in thin low-intensity layers, sharpness last and never on weak
shapes. An agent has no pen: it uses exact operations first (primitives, ZSpheres, DynaMesh, masks
plus Deformation sliders), then strokes planned from model-space forms, aimed through the view,
measured in volume and reviewed after every pass ([`scripts/zb_sculpt.py`](scripts/zb_sculpt.py)).
If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).

## Stance (the expert delta)

- **Pressure is the hidden setting.** Henning Sanden blocks at ClayBuildup Z 20 with "maybe 30%" of
  his pen pressure (0PaYUUvgwYM 00:04:58); a scripted stroke has constant pressure. Start clay at Z
  6, refine at 2 to 1, calibrate once per session (`zs.run_calibration`), and dial a whole pass
  after review: a partial Morph value softens it, a negative one exaggerates it (Drust, B_wKwXwjcZs
  00:05:20); layer intensity does the same on levels.
- **Clay across the form, lines along it.** Henning: across puts a peak in the center that fades to
  the edges; along is "drawing the shape" (0PaYUUvgwYM 00:02:13, 00:30:39). Pablo Munoz Gomez builds
  long masses along first, then smaller strokes across, never a muscle in one stroke (tbQqC6tyDBQ
  00:06:32). Each form is a center line plus a width.
- **Standard sets edges, clay builds, ClayBuildup erases.** Standard pushes what is there, so it
  gives specificity (Henning 0PaYUUvgwYM 00:27:26); ClayBuildup replaces what is under it, never
  after detail (TpS0QdlfHWU 00:07:44). Pablo sets a hard edge with Standard at raised Z, then blends
  it with clay (tbQqC6tyDBQ 00:10:27).
- **Refine instead of smoothing, except on low-res blockouts.** Henning removes marks with passes of
  falling intensity and smooths once at "good enough" (TpS0QdlfHWU 00:22:26, 00:22:58); Pablo
  smooths freely during blockout (tbQqC6tyDBQ 00:02:29). Low-res S1: a Polish slider; skin from S2
  on: the descent.
- **DynaMesh while the forms move, levels once they settle.** A high DynaMesh early is a "lumpy
  mess" (Pablo tbQqC6tyDBQ 00:04:38) and resolution is relative to object size (FrqUnna1jns
  00:13:40). Never Divide a DynaMesh: its triangles and star poles become lumps no smoothing fixes
  (rArw79xEpvE 00:09:44). ZRemesher a copy, Divide, project.
- **Level discipline.** Big moves at SDiv 1 (at the top a push "looks very wonky"); secondary forms
  blocked at SDiv 2 or 3, then refined upward level by level; never all the work at the top (Pablo
  rArw79xEpvE 00:12:28, 00:14:16; tbQqC6tyDBQ 00:12:26). Details never change the silhouette
  (tbQqC6tyDBQ 00:13:27).
- **Strokeless first.** Pablo builds a whole blockout "without even actually using any of the
  brushes" (gitoJ7B8FmY 00:05:26). For an agent these are exact: primitives placed by number,
  ZSpheres by code, masks plus Deformation sliders, Mirror then Mirror And Weld.
- **Mid frequency is where a sculpt is won.** FlippedNormals call it the backbone of detailing;
  pores added early put you "two levels behind" (G2o6fdoACIQ 00:05:46, 00:08:17). Details "won't fix
  a weak sculpt" (Pablo tbQqC6tyDBQ 00:12:50).

## Establish first

| Input                                   | What it changes                                                                                                                                                              | Default when the brief is silent |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Subject                                 | base route and point ladder (`STAGES[...]["points"]`): head, creature                                                                                                        | head bust from a sphere          |
| Purpose                                 | concept: stop at S3 or S4, even quads suffice (tbQqC6tyDBQ 00:11:43); film or game: retopology before micro detail (Zp07GW3rND0 00:08:22); print: scenario-zbrush-pose-print | concept                          |
| Style                                   | realistic: scenario-zbrush-character-creature; stylized: scenario-zbrush-stylized                                                                                            | neutral forms                    |
| Forms list                              | `zs.Form` center lines plus widths, from the brief and the domain skill's proportions                                                                                        | none: ask the domain skill       |
| Head width in model units (`ref_width`) | every brush size                                                                                                                                                             | model width in the front view    |
| Views                                   | front is measured [obj]; others need the live_04 convention                                                                                                                  | front                            |

## Workflow

Every pass: `Scene.capture`, plan (`clay_pass`, `move_pass`, `crease_pass`), `preview_plan` (look at
it), `run_plan`, `pass_report`, `zb_review.review`, then name the ONE weakest item and fix it. Save
a versioned ZTL at every gate.

0. **Session.** `zb_launch.start()`, neutral state (P1), calibration (P2). Every pass turns
   perspective (`Draw:Perspective`) and LazyMouse off: its radius swallows the start of a
   synthesized path (Pavlovich AdkZe1yKFTU 00:03:31). GATE: document zoom 1, calibration present or
   the v02 prior noted.
1. **S0 base.** One of: a sphere DynaMesh at 128 (about 43k points); a ZSphere armature
   (`zsphere_code`) with an Adaptive Skin at Density 1 or 2 and DynaMesh Resolution 0 (Pablo), then
   DynaMesh 64; primitives appended and placed with Geometry Position and Size (P3). GATE: the
   silhouette reads front and side; points within S0.
2. **S1 primary blockout.**
   - Move then re-DynaMesh (`move_pass`, `remesh_due`, then `remesh_code`, P16: Draw mode, mask
     cleared, polypaint off so polygroups survive, proof that it remeshed).
   - Clay across the forms (`clay_pass`, preset `clay_block`); sockets as carve forms (`sign=-1`);
     TrimDynamic planes (`preset="trim"`). Symmetry on: plans cover the +X half.

   GATE: `stage_gate("S1")` passes; the sheet shows right proportions, every element present
   (G2o6fdoACIQ 00:02:50), big simple masses.

3. **S2 primary refinement.**
   - Resolution up: head by the square law (`next_dynamesh_resolution`) toward 400k to 800k points;
     creature: MergeDown the pieces (in place; MergeVisible makes a new Tool; its confirmation may
     block the bridge [verify], so ZTL first), DynaMesh 256.
   - Descent passes Z 6, 3, 2, 1, zooming in on each region (`descent`, P7); TrimDynamic on junk
     bumps.
   - Eyes (P17): eyeball spheres placed by number, each turned 3 to 7 degrees outward (Costa
     j5XLtLMN0P8 00:29:10); lids cut with Dam_Standard, then moved out so they wrap the ball
     (Henning TpS0QdlfHWU 00:18:33). Henning shapes them with perspective on (00:17:28): strokes
     stay orthographic, the read is `persp_snapshot_code`.
   - Checkpoint risky passes and dial them (P8) before any re-DynaMesh, ZRemesher or Divide: a
     point-count change destroys the Morph Target, and `dial_code(..., expect_points=)` refuses.

   GATE: clean shapes under Red Wax, no stretched faces, stroke marks falling.

4. **Leave DynaMesh** when the forms are settled and S3 needs levels, retopology is coming, or later
   big changes must survive detail. Henning's DynaMesh-only ladder to 648 suits a concept still:
   state which route and why. Levels (P11): versioned ZTL, Duplicate, ZRemesher the copy, Divide
   until `projection_ready`, then the toolkit's `zb_ops.project_all(checkpoint=...)`, which carries
   the safe order (versioned save, StoreMT and a New Layer at the top level, PA Blur lowered, a
   gate, `morph_repair`); never re-implement it.

   GATE: target points at least the sketch's, volume within 1 % [added], the sheet unchanged, eyes
   and mouth checked level by level (repair: scenario-zbrush-retopology-export).

5. **S3 secondary.**
   - On levels (P15): `level_for("secondary")` (SDiv 2 or 3), then `"refine"` one level up at a
     time; big fixes return to `level_for("big")` = SDiv 1; the top level only for tertiary and
     layers.
   - Symmetry off for the asymmetry pass; `pattern="two_direction"` on long masses; preset
     `clay_secondary`.

   GATE: `mirror_asymmetry` above zero, the mid band above S2, the sculpt reads at thumbnail size
   without detail.

6. **S4 contrast.** Dam_Standard along the creases (`crease_pass`), deeper than feels right
   (0PaYUUvgwYM 00:19:49); Standard at raised Z on lids, lips and brow edges (`preset="standard"`),
   blended with clay; `fill_between` two cuts. GATE: shape IoU against S3 of at least 0.98 [added];
   crease depth varies along the line.
7. **Hand off** S5 and S6 to the domain skill with the P14 package.

## Numbers

| Value              | Number                                                                                                                                       | Relative to                                                                                                                      | Source                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Scripted Z, clay   | block 6, refine 2, finish 2; descent 6, 3, 2, 1                                                                                              | expert Z times 0.3 pressure                                                                                                      | Henning 00:04:58; digest derivation        |
| Brush diameter     | clay block 15 to 35 %, secondary 10 to 15 %, refine 3 to 8 %, Dam 3 to 7 %, Standard 1 to 2 %, Move design 60 to 90 %, Move local 10 to 15 % | head width in view (Draw Size is canvas pixels: `zb_sculpt` converts through ppu); clay kept within 0.5 to 1.0 of the form width | FlippedNormals frames; digest T1           |
| ClayBuildup        | FreeHand, Focal -56, Alpha 06 or Off; Imbed 20, Roll Dist about 6                                                                            |                                                                                                                                  | Henning; Morten; Pablo frame 00:05:55      |
| Dam_Standard       | Dots, Focal -14, Zsub, Z 15 (33 for big cuts)                                                                                                | "ten below where it starts"                                                                                                      | 0PaYUUvgwYM 00:18:42; TpS0QdlfHWU          |
| Move / TrimDynamic | Focal 0, Z 51 / Focal -56, Z 43 lowered, Zsub                                                                                                |                                                                                                                                  | TpS0QdlfHWU frames                         |
| Head point ladder  | 43k sphere, 96k to 99k S1, 400k to 826k S2, 1.6M to 2.46M S3 and S4                                                                          | points                                                                                                                           | FlippedNormals frames                      |
| Creature ladder    | skin 6k, pieces 28k to 43k (DynaMesh 64 to 128), merged 256 = 367k, SDiv 5 = 3.8M                                                            | points                                                                                                                           | Pablo tbQqC6tyDBQ frames                   |
| DynaMesh           | points grow with resolution squared; limits: details safe in a 1024 cube, cap 2048 (about 24M polys)                                         | bbox longest side; per SubTool                                                                                                   | TpS0QdlfHWU ladder; DynaMesh doc           |
| Divide, ZRemesher  | x4 per level; target in thousands, 5 gave 4,963                                                                                              |                                                                                                                                  | Pablo rArw79xEpvE 00:03:16                 |
| SDiv per operation | big moves 1; secondary 2 or 3; tertiary and layers top                                                                                       | levels of the stack                                                                                                              | Pablo rArw79xEpvE 00:12:28, 00:14:16       |
| Projection         | target points at or above the sketch's (745k vs 400k); FlippedNormals about 3M                                                               |                                                                                                                                  | VRisbJQAaZw 00:17:24; Zp07GW3rND0 00:01:02 |
| Eye angle          | 3 to 7 degrees outward each, about 5                                                                                                         | straight ahead                                                                                                                   | Costa j5XLtLMN0P8 00:29:10                 |
| Pass gates         | dead strokes up to 10 %; re-DynaMesh at 1.5 x edge cv; Polish drift 2 %                                                                      |                                                                                                                                  | [added]                                    |

## Quality gates

- **Measured:** `pass_report` after every pass (dead strokes, volume sign, view drift, pivot shift,
  settings not found); `remesh_code(...)["ok"]`; points against `STAGES` and the SDiv for the
  operation; `stage_gate` (budget, big Move above SDiv 1, shape IoU, asymmetry, bands);
  `zb_audit.verdict(..., "sculpt")`; `remesh_due`, Polish drift, `projection_ready`.
- **Seen:** the review sheet in MatCap Gray (front, right, back, three-quarter, top); Flat Color
  silhouettes and the sheet at thumbnail size; a grazing view, Red Wax for marks, a Standard
  material under a moving light (MatCaps bake their light) or BPR for form reading; the perspective
  look render for eyes; the stage checklist in [`references/critique.md`](references/critique.md).
  Never call a stage done without looking at its sheet.

## Common mistakes

| Mistake                                                 | What it looks like                                  | Fix                                                                |
| ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Expert Z as a script Z (ClayBuildup 20)                 | harsh ridges, one-stroke muscles                    | Z 6, calibrate, dial the pass                                      |
| Clay dragged along the form                             | drawn grooves, no volume                            | `clay_pass` hatches across                                         |
| Stroke starting off the model                           | strokes change nothing, the view may turn           | plans clip to the canvas mask; re-capture                          |
| LazyMouse left on                                       | stroke starts missing, short strokes dead           | `pass_spec` default `lazymouse=False`                              |
| Smoothing marks away on skin                            | "semi smooth with details", volume loss             | descent passes; Polish only low-res or at a lower SDiv             |
| ClayBuildup over finished detail                        | lines and pores erased                              | Standard for edges; clay before detail                             |
| Dividing a DynaMesh                                     | lumps, star poles                                   | ZRemesher, Divide, `project_all`                                   |
| Big Move at the top level                               | wonky lumps                                         | `level_for("big")`, then back up                                   |
| Re-DynaMesh with a mask on or in Move mode              | nothing remeshes (the gesture only clears the mask) | `remesh_code`                                                      |
| DynaMesh with polypaint on                              | polygroups gone after the remesh                    | `keep="groups"` (Colorize off), or `"polypaint"`: never both       |
| Morph dial after a remesh or Divide                     | the target is gone                                  | dial first; `expect_points`                                        |
| Symmetry assumed after a SubTool change                 | the stroke lands on one side                        | it is per SubTool (Pablo RABWfzWNw0c 00:27:02): every pass sets it |
| `Brush:Smooth` picked as the brush                      | nothing smooths (it only becomes the Shift brush)   | Deformation Polish, lower SDiv                                     |
| Mirror And Weld with LSym on, or the bad side as source | mirrors locally or copies the bad side              | LSym off; Deformation Mirror first (9a9S1OcYHx4 00:09:35)          |

## Handoffs

- **Receives:** from scenario-zbrush-expert a session, brief and versioned ZTL; from
  scenario-zbrush-retopology-export a cleaned AI or scan mesh (scenario-3d meshes arrive this way);
  from domain skills proportions and the forms list.
- **Delivers** the P14 package (versioned ZTL, `stats()`, last sheet, forms as JSON, calibration,
  gate): realistic S3 or S4 forms on levels to scenario-zbrush-character-creature; shape-language
  work and hair to scenario-zbrush-stylized; organic bases to scenario-zbrush-hard-surface; a
  finished sculpt to scenario-zbrush-retopology-export.

## ZBrush 2026 notes

- Perspective is `Draw:Perspective` (installed commands.xml); `Transform:Persp` does not exist
  (`zs.PERSP_PATHS`). PolyFrame is `Transform: Pf`.
- `Brush:Dam_Standard` does not resolve [v03]; `zb_ops.select_brush("Dam_Standard")` finds
  DamStandard.
- Smooth brushes only bind to Shift and `press_key` does not work: Zsub replaces Alt, Deformation
  Polish replaces Shift, Masking buttons and Mask Changed Points [verify] replace Ctrl gestures.
- No undo control (`merge_undo` is a stub): Morph Target or layer per pass, versioned ZTLs per
  stage.
- Gizmo deformers and Transpose drags are GUI-only; the Gizmo deforms softly unless Focal Shift is
  -100. Local Symmetry follows the Gizmo: off before Mirror And Weld.
- Sculptris Pro: no levels; Dots, FreeHand and Spray only. Chisel's default stroke changed in
  2025.1: every pass sets its stroke type.

## References

- [`references/procedures.md`](references/procedures.md): bridge code per step (P0 to P17) with its
  live test. Load before writing bridge code.
- [`references/expert-notes.md`](references/expert-notes.md): the experts in depth and the
  disagreement table. Load when choosing between approaches.
- `references/critique.md`: per-stage rubric, AI-mesh judgment, stroke-plan review. Load at every
  gate.
- [`references/gui-paths.md`](references/gui-paths.md): hotkeys, palette paths and brush settings
  (computer-use agent).
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps.
- `scripts/zb_sculpt.py`: stages, presets, Scene, generators, calibration, pass execution, remesh,
  levels, review metrics. Tests: `tests/code/zbrush-sculpting/` (offline passed; live not yet run in
  ZBrush).
