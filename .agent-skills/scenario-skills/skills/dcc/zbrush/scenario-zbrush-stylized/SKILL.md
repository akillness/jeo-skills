---
name: scenario-zbrush-stylized
description: "Use when sculpting a stylized or cartoon character, bust, collectible or toy in ZBrush (Overwatch, Fortnite, Disney look), judging shape language (S and C curves, parallel lines, 70/30, silhouette read at a distance), exaggerating proportions on purpose, keeping stylized planes crisp through subdivision, sculpting stylized hair (chunky clumps, curve tube strands, ClayPolish), or designing a figure for toy production (articulation, wall thickness, scale)."
license: MIT
---

# ZBrush stylized characters and collectibles

Expert stylized work is anatomy simplified on purpose: real landmarks and proportions as the
baseline, a few named exaggerations, and shape-language rules an agent can measure on a silhouette.
Curves are the agent's best tool: strands, clumps, straps and scarf tails come from computed 3D
paths, so a "tweak" regenerates a path instead of sculpting it. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).

## Stance (the expert delta)

- **Shane Olson:** stylizing is not "an excuse to do bad anatomy". Block a stylized skeleton by the
  bony landmarks that touch the surface (hip point, knee, both ankle bones, elbow, clavicle tops,
  base-of-neck vertebra, sacral triangle, skull) and drop bones that never show. Every departure
  from real proportion is a named knob measured against the real value (the knee halves the leg,
  hands land at mid-thigh); move knobs carefully, because motion exposes them.
- **Guillaume Tiberghien (Keos Masons):** "simple is hard". Add anatomy, then simplify. Stylized
  means clear directional planes chipped like wood or rock, changes of direction creased so they
  stay straight when subdivided, and forms tucked into each other for small contact shadows. No
  color until the modeling is tight.
- **Rakan Khamash (Blizzard):** shape language is a rule set, not taste. S and C curves, no parallel
  lines, no 50/50 splits (push 70/30), flare at the top and taper at the bottom, rest areas next to
  detail, and "say it or don't": the character must read from the back of the room. The blockout is
  90 to 95% of the low poly.
- **Cedric Seaut (Keos Masons):** start from silhouettes; a lineup of several designs forces
  distinct shapes.
- **Pablo Munoz Gomez:** plan hair chunks before sculpting, then carve one long stroke per clump
  from one angle. DynaMesh a little above the picker's value, Polish 2 and ClayPolish get you "80%
  there".
- **Dan Eder:** hair chunks are rig sections. Lay one tube strand per clump on a temporary mass, one
  polygroup per strand, front to back. Never Smooth a strand. Build a parted style without symmetry,
  then mirror it. Switch MatCaps to find gaps.
- **Paul Bennett (Hasbro):** a toy is a product. Sculpt the neutral standing design with no joints
  first; articulation is spheres and discs camouflaged by the costume; walls never below 1 mm; fuse
  flyaways; no closed loops such as touching fingers; state the file scale (104% for PVC shrink).

## Establish first

| Input     | Changes                                                                                       | Default when the brief is silent                      |
| --------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Purpose   | game (loops, budget, rigged hair), collectible or toy (walls, parts, scale), concept or still | portfolio still                                       |
| Reference | concept image, turnaround, style (Overwatch chunky, Disney round)                             | none: real baseline plus only the named exaggerations |
| Hair      | strands (rigged or per-chunk retopology) or one sculpted mesh                                 | sculpted mesh (Pablo)                                 |
| Budget    | triangles per hero and per hair version                                                       | none for stills; Blizzard's hero was 16k [unit ?]     |
| Scale     | print height or toy line (6 in, 3.75 in)                                                      | a 200 mm ruler SubTool anyway (Shane)                 |
| Symmetry  | symmetric design or not                                                                       | symmetric, then a deliberate asymmetry pass           |

## Workflow

1. **Design sheet.** Write each knob as a number against its real value (a big nose: `nose_third`,
   brow to nose base over a third of the face, real 1.0; a heavy brow: brow depth; long shins:
   `femur_tibia`). Take each value from the concept; without one, push the named feature until it
   survives the 64 to 128 px thumbnail read, and record it. Write the three reads (Rakan): the
   silhouette idea, the secondary shapes that carry intent, the tertiary detail. Plan hair chunks
   and the part line. GATE: every knob has a target and a reason.
2. **Silhouette first.** Block two or three primitive variants (scenario-zbrush-sculpting) and
   render them with `zb_review.review`. GATE: `lineup()` IoU under 0.85 between variants [added];
   the chosen one reads at 64 to 128 px (`squint()`).
3. **Stylized skeleton by landmarks.** Perspective off for everything orthographic (Shane: it skews
   masking, clipping and mirroring). Rules:
   - cranium plus jaw, split at the eye line; jaw corner under the ear at mid head depth;
   - head sides: from the top the head is not parallel-sided, so clip the cranium sides until the
     head narrows toward the face (Shane 02:00:26), then give each side an arc, not a flat plane
     (02:11:58). Agent: a two-point ClipCurve stroke in the orthographic top view or Deformation
     Taper on the cranium SubTool (both [verify]), then a Move or clay pass for the arc;
   - eyes: eyeball spheres first, lids wrapping them, each turned a few degrees outward
     (scenario-zbrush-sculpting P17); the outer corner well behind the inner one (check from the
     top);
   - pelvis leaning forward, ribcage leaning back, femur angled in, tibia straight. GATE:
     `head_checks` and `body_checks` on `subtool_boxes()` pass, or each failure is a recorded
     deliberate break; `head_taper()` on a top render of the cranium alone; front and side ortho
     renders against the concept; a three-quarter perspective look render
     (`zb_sculpt.persp_snapshot_code`) for the eye sockets.
4. **Merge and plane.**
   - DynaMesh the blockout at 128 to 256 (`remesh_code`, scenario-zbrush-sculpting); cut planes with
     broad hPolish or TrimDynamic strokes (forgiving, so scripted strokes work); tuck forms into
     each other. ClayPolish works as a global planar filter [added for forms; Pablo uses it on
     hair].
   - Keep the planes through subdivision (Guillaume 00:46:42 to 00:47:50): ZRemesher the merged
     parts for a sculptable topology, then crease the plane borders so they "remain straight" when
     subdivided: `crease_planes` (Groups By Normals, Crease PG, CreaseLvl), then Divide by level
     discipline (scenario-zbrush-sculpting P15). Creases are edge tags: any later DynaMesh or
     ZRemesher needs them again [added]. GATE: `shape_language()` on front, side and three-quarter
     silhouettes: no parallel pairs, straight fraction at most 0.25, noise at most 4 flips per 1000
     px (defaults [added]); no `band_breaks()` break in the 45 to 55% band; no dips under MatCap
     Metal01 (Plouffe); after Divide the creased borders stay crisp in a grazing view.
5. **Secondary shapes and props (scarf, straps, belts).**
   - Rings and bands from scenario-zbrush-sculpting, knots and buckles off-center (70/30).
   - Tails and straps as curve ribbons: `lay_strands` with `sides=0` (Curve Flat, Pavlovich) or 4
     for a strap; paths from `march_strand` with gravity, bent into an S.
   - Folds only where pressure or joints put them (Rakan). A scarf that needs weight gets a Dynamics
     cloth drape (scenario-zbrush-character-creature), then its folds restated. GATE: each tail
     classifies S or C in the front view (`classify_polyline`); no parallel tails (`strand_report`).
6. **Hair.** Strands for rigged or game hair; the sculpted mesh for stills, prints and single
   meshes. Both plan paths on an OBJ export of the mass (P3 to P5).
   - Plan: `roots_along` the part line and hairline, `directions_away` from the part, `plan_strands`
     with alternating C and S bends and `vary()` lengths; draw it with `overlay_paths` on front,
     right and top renders and look at it (Pablo polypaints chunks; Dan paints sections on the
     concept).
   - Sculpted (Pablo, P4): `scalp_shell`; fat CurveTubes per chunk, DynaMesh a few hundred to fuse;
     one `stroke_from_view` ClayBuildup stroke per clump from its `best_view` (`sculptris=True`);
     Dam_Standard Zsub along each `crevice_path`; `rebalance`; `finish_hair`.
   - Strands (Dan, P5): a tiny dummy SubTool inside the head (Pablo); one CurveTube per strand,
     front to back, more lift in front; Auto Groups; `strand_mesh_report`; mirror a parted style
     after. GATE: the plan shows no parallel neighbors and designed kinds read in the right and top
     views; hair reads at a squint; the five review views (top shows the parting) under two MatCaps
     show no gaps or clipping; rest areas stay calm.
7. **Asymmetry, value, color handoff.**
   - Deliberate asymmetry pass: knot, fringe, a brow.
   - Guillaume's grayscale read (`value_check`): no pure black or white, strongest contrast at the
     face; before color, only darker lashes and pupils.
   - A material ID plan with distinct colors per material; polypaint at the top level, judged on the
     flat SkinShade4, since MatCaps lie about hue and value (Pablo VRisbJQAaZw 00:23:40, 00:24:54).
8. **Product constraints (toy or collectible).**
   - `toy_scale` (height / 12 plus 4% for 6 in; / 18 for 3.75 in);
   - `feature_check` of strands and thin forms at print scale (1 mm walls, 0.5 mm trimmed edges);
   - hair a separate part keyed to the head, flyaways fused, strands bunched for repeatable paint;
     no closed loops, slits in skirts. Do not over-sculpt past what the print size shows (Carratala,
     90 mm).

## Numbers

| Value                                                                                                            | Relative to                 | Source                                   |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------- |
| knee at half the leg; hands at mid-thigh; jaw corner at 0.5 of head depth                                        | real baseline for knobs     | Shane                                    |
| eye line 0.5 of head height; face thirds equal within about 5% of head height                                    | real head                   | Anatomy For Sculptors (character digest) |
| outer canthus behind inner by at least 0.10 of head depth                                                        | starting threshold          | stylized digest [added]                  |
| head sides from the top: taper (narrow / wide width) at most 0.95; side sag at least 0.01 of depth               | `head_taper` defaults       | Shane rule, thresholds [added]           |
| 70/30, never 50/50; flag 0.45 to 0.55                                                                            | break position along a span | Rakan; band [added]                      |
| blockout = 90 to 95% of the low poly; 16k hero budget incl. two hairstyles                                       | game character              | Rakan                                    |
| hair DynaMesh: 128 shell; 440 blocking; 1416 refined; 1032 to 1784 detailing; re-DynaMesh at 2.4M to 2.6M points | Pablo's head, his machine   | Pablo frames                             |
| Deformation Polish 2; ClayPolish Max 25, Min 0, Sharp 0, Soft 0, RSharp and RSoft about 5                        | finishing                   | Pablo frame                              |
| Curve Tube Brush Modifier 20 default, 4 square, 0 flat; Z Intensity 34 flattens                                  | tube profile                | IMM doc, Pavlovich                       |
| strand about 3 to 4 polygons across                                                                              | game strand                 | Dan frame                                |
| 1 mm wall (0.85 flagged), 0.5 mm edge, 0.12 mm fit offset, elbow 115 degrees                                     | toy production              | Bennett                                  |

## Quality gates

- **In code:** `head_checks` and `body_checks` pass or are deliberate; `head_taper` on the top view;
  `split_check` on the brow line, scarf band and part; `shape_language` flags empty on three
  silhouettes; no 50/50 `band_breaks`; `lineup` IoU; `strand_report` without parallel pairs and with
  designed kinds per view; `strand_mesh_report` with one shell per strand and faces within budget;
  points after every DynaMesh; `feature_check` in mm for toys.
- **Visual:** `zb_review.review` under MatCap Gray plus Metal01 (dips) or another MatCap (hair gaps,
  Dan); `squint` at 64 and 128 px; `annotate_shape`; the plan overlay before hair is laid; the
  perspective look for appeal; top view for the parting and head sides; the back of the head
  finished too.

## Common mistakes

| Mistake                                   | Looks like                           | Fix                                                       |
| ----------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Uniform exaggeration                      | every feature big, nothing reads     | one or two named knobs; the rest at baseline              |
| Eye corners on one plane                  | flat mask face from the top          | pull the outer canthus back (`canthus_recess`)            |
| Parallel head sides, or a flat side plane | boxy or balloon cranium from the top | clip the sides, keep an arc (`head_taper`)                |
| Planes lost after Divide                  | mushy, rounded stylized planes       | `crease_planes` after ZRemesher, before Divide            |
| Parallel limb or strap edges              | tube legs, boring pants              | flare the top, taper the bottom                           |
| 50/50 splits                              | scarf or belt exactly mid-span       | move to 70/30 (`split_check`)                             |
| Detail everywhere                         | noisy contour, no rest               | keep calm zones (Pablo, Rakan)                            |
| Hair as one lump or thousands of strands  | no chunks at a squint                | plan the big chunks first, then one strand or clump each  |
| Strands pushed and smoothed by strokes    | soft, kinked strands                 | regenerate the path and re-lay; Dan never smooths strands |
| ClayPolish mask left on                   | the next brush "does nothing"        | `finish_hair` clears the mask                             |
| Toy with flyaways or touching fingers     | breaks, won't release from the mold  | fuse, separate, check at 1 mm                             |

## Handoffs

- **Receives:** primitive and DynaMesh forms from scenario-zbrush-sculpting (versioned ZTL,
  `stats()`, review sheet); cloth drapes and realistic anatomy from
  scenario-zbrush-character-creature.
- **Delivers:** to scenario-zbrush-paint-render the tight sculpt, value targets and material ID
  plan; to scenario-zbrush-pose-print the neutral design without joints, a part and joint plan
  (spheres and discs), hair as a keyed part, the scale factor and file percentage; to
  scenario-zbrush-retopology-export strand hair with one group per strand (rig chains), chunk
  polygroups, faces per strand, loop-aligned design lines (Rakan).

## ZBrush 2026 notes

- Curve Flat and Curve Flat Snap ship (2021.6.3), Bend is split into Bend Start and End, IMM brushes
  take any stroke (2024), and curve brush geometry bugs were fixed in 2026.2.1.
- Pablo's hair brushes and DE_HairTubes are third party: stand-ins are ClayBuildup, Standard,
  Dam_Standard and CurveTube; custom brushes load from the Asset Directory `LightBox/Brushes`.
- The curve API takes tool-space points and cannot read curves back; `curves_to_ui` alone may not
  build the mesh (Maxon's example): live_01 measures the apply and the axis mapping.
- Perspective is `Draw:Perspective` (installed commands.xml, no `Transform:Persp`); `PATHS` tries
  the installed ids first. The Gizmo is the default and Local Symmetry follows it. Cmd+W quits
  ZBrush on macOS.

## References

- [`references/procedures.md`](references/procedures.md): bridge code per stage. Load before running
  anything.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps;
  disagreements and deciding conditions.
- [`references/critique.md`](references/critique.md): the self-review rubric.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, brushes, settings, hotkeys
  (computer-use agent).
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps.
- [`scripts/zb_stylized.py`](scripts/zb_stylized.py): the module; reach its ZBrush side with
  `zb_stylized.call()`, not `zb_launch.call`. Tests: `tests/code/zbrush-stylized/`.
