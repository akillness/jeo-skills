---
name: scenario-blender-sculpting
description: "Use when sculpting in Blender through Python: sculpt a head, face or bust, a stylized or cartoon character, a creature or a realistic portrait; block out from primitives; cut planes, a jaw or gonial angle, cheekbones; fix a jaw or face that looks like a ball or balloon; stylized hair clumps; eyelids; an expression or smirk; plan remesh or multires resolution; reproduce Clay Strips, Crease, Draw Sharp, Scrape, Grab or mask moves without a tablet; final clay renders; or when a sculpt operator crashes headless."
license: MIT
---

# Sculpting (heads and characters, Blender 5.2)

Expert sculpting is structure first and surface last: masses blocked with stated planes and corners,
proportions locked at low resolution, every stage judged by eye through a long lens, and appeal as
the final test, not the mesh numbers. The agent builds blockout and primary forms headless
([`scripts/bx_sculpt.py`](scripts/bx_sculpt.py): smooth-blend `Clay`, plane cuts, numpy brushes) and
does client-quality surface work with Blender's real brushes in a live GUI session (`bx_gui`). If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).

## Stance (the expert delta)

- **Planes are stated, not found.** Thelen cuts plane borders with Draw Sharp and re-cuts them
  whenever a face "looks off"; Naydenov simplifies into planes, then smooths; Reinhardt uses Scrape,
  Trim and Line Project for clean cuts. Executable form: give the plane (point + normal) to `Clay`
  half-space clips or `plane_cut` / `corner_cut`. A `flatten` or `scrape` dab fits its plane to the
  ball under it, so it follows the ball.
- **The jaw is a block with a gonial corner, the cheekbone a mass with its own lower plane.**
  Zarins: the gonial angle is the age and sex dial, steep in adult males; the widest face point is
  the top of the zygomatic arch. Naydenov: the cheekbone runs from the ear down and forward, only
  its lower edge shows. Thelen: bone plus tissue, never razor sharp.
- **Fix mass upstream; planes only restate.** If re-cutting planes does not fix the look, the
  problem is mass or proportion (Thelen's diagnostic). Measured: plane cuts on a balloon jaw flipped
  the form metric but rendered as a gem facet; rebuilding the jaw block fixed it.
- **Low resolution as long as possible.** Abbitt: smoothing is strong only on big polygons; Thelen:
  lock proportions coarse. Symmetrize after every remesh (Keelan Jon), then a global relax (Kaspar
  FDscc66fC90 00:11:55).
- **Indicate small landmarks early** (nostrils, brows, eyes): Yan found a too-wide nose from the
  nostrils (vB7kPWjBgQI 00:05:11).
- **Stylize by consistent exaggeration** (Yan: pick it in minute one, make neighbors follow; a long
  face needs a smaller skull, not a stretch).
- **A concept head needs its cues.** Thelen: hair makes a male head read better (00:48:58);
  Naydenov: hair changes the read a lot (00:53:05). An "adventurer" with no hair or costume reads as
  a bald mannequin.
- **Asymmetry and expression live on a shape key; the basis stays neutral and symmetric** (Kaspar
  f-mx-Jfx9lA 00:09:44; Thelen 00:38:27). Expression tests expose proportion errors; fix them in the
  neutral (Kaspar 00:10:49).

## Establish first

| Input                          | Changes                                                     | Default when silent                                      |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------- |
| Who (sex, age, type, attitude) | gonial angle, brow, jaw width, shape language               | adult male, neutral basis, stated [added]                |
| Style                          | stylized: exaggeration table; realistic: canon + reference  | stylized, "abstracted enough to not be uncanny" (Kaspar) |
| Character cues                 | hair, costume, props that sell the type                     | at least hair plus one costume signifier [added]         |
| Purpose                        | still (vertex paint, decimate) vs game or film (retopology) | still; scenario-blender-retopology if animated           |
| Delivery framing               | detail frequency, expression size                           | bust fills a 1080 px frame [added]                       |
| Scale                          | nothing if sizes are fractions of head height H             | H = 0.24 m [added]                                       |
| Channel                        | headless numpy / Clay, or live GUI brushes                  | headless blockout; GUI for surface when the bridge is up |

## Workflow

0. **Design table.** `G = S.head_guides(H)`, a STYLE dict (the one or two exaggerations), the cue
   list, and the landmark points of the planes: gonion, chin bottom, cheekbone. GATE: written down.
1. **Blockout (voxel H/40).** Default for heads: `Clay`. Cranium ellipsoid clipped by skull side and
   front-taper half-spaces; a jaw `sd_round_box` BEHIND the mouth mound, clipped by side, underside
   and ramus planes through the gonion; a square chin block; cheekbone ellipsoids along the
   ear-to-cheek line with a lower plane; mouth mound; brow ridges; nose; neck leaning about 15
   degrees; ears; frontal box around the eyes. Blend big masses at 0.08 to 0.15 H, clip edges at
   0.02 to 0.03 H. Option: `union_remesh` of primitives (rounded_box is a Catmull-Clark blob that
   reads as a ball: never use it for a jaw). GATE: 1 component; `lower_face_report(head, H)["ball"]`
   False; silhouette plus 90 mm renders show a jawline and gonial corner in profile and
   three-quarter; the exaggeration visible.
2. **Primary forms (H/100 to H/110).** Rebuild the Clay at the finer voxel with landmarks: sockets
   (sphere 1.1 x eyeball, smaller than the lids), thin shell lids around separate eyeballs (Keelan
   Jon's lids from the eyeball, amVAlpxHp8k 00:37:05), nose wings tucked in, ear bowls, neck
   muscles. Hair and costume as separate Clay objects (`to_object(name, symmetric=False)` for
   anything asymmetric). GATE: profile beats; eyes not marbles or bags; hair frames the face;
   `stage_report` clean.
3. **Secondary (H/130 to H/150, `remesh_stage`).** Lines with `crease_line` (mouth, under-lip, lid
   rim) on surfaces facing the projection; nostrils from below. Restate planes with `corner_cut` /
   `plane_cut` only where the mass is right and moves stay small. GATE: under 100k faces (Abbitt),
   no scratches, cracks or rims in 90 mm renders.
4. **Surface finish (client quality): live GUI.** Real Clay Strips, Scrape, Crease Polish, Smooth
   0.2 via `bx_gui` (fixed and verified: strokes raycast onto the mesh and pass object-space
   locations; `set_view(frame=obj)` first, `view_distance` a few head heights). Headless numpy
   strokes suit blockout and primary forms, not polish. Multires only on a settled clean base
   (Henning Cmi0KoFtc-4 00:16:04).
5. **Expression.** Neutral symmetric basis; `sc = S.Sculptor(head, symmetry_x=False)`,
   `move_feature` the corner, cheek, lower lid, opposite brow;
   `S.write_shape_key(head, "Smirk", sc.co)`. Size the corner move to the delivery framing
   (Numbers). Voxel remesh drops keys: last step.
6. **Final render.** `S.final_render(objs, path, direction, lens=90, res=1600)` (cavity, framed on
   real vertices) from front, profile, three-quarter, neutral and expression; open every image.

Inside every stage: render, name ONE weakest link, fix it, re-render (Yan). A metric that passes
while the render looks wrong means the render wins.

## Numbers

| Value                   | Number                                                                                                                                                                                                           | Source                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Voxel ladder            | H/40 blockout, H/65 to H/110 primary, H/130 to H/235 secondary, about H/330 detail                                                                                                                               | Morren, Abbitt; example         |
| Faces from voxel        | about 1.5 x area / voxel^2 (`voxel_for_faces`)                                                                                                                                                                   | measured, 3 %                   |
| Example bust faces      | H/40 8k, H/110 64k, H/150 103k (with neck)                                                                                                                                                                       | measured                        |
| Face gates              | shape before 100k; detail about 500k                                                                                                                                                                             | Abbitt                          |
| Raw remesh mirror error | max 0.67 to 0.75 voxel, mean 0.05 to 0.07 voxel (nearest vertex)                                                                                                                                                 | measured                        |
| Clay blends (head)      | masses 0.08 to 0.15 H, plane clips 0.02 to 0.03 H, lids 0.012 H                                                                                                                                                  | example [added]                 |
| Jaw                     | bigonial 0.90 to 1.00 x bizygomatic (example 0.93); ramus-to-base angle 124 degrees in the example                                                                                                               | Thelen; example [added]         |
| Eyes (stylized)         | radius 0.064 H, lids 0.012 H thick, upper margin 21 degrees above center                                                                                                                                         | example; 14 degrees read sleepy |
| Hair                    | clumps 0.065 to 0.115 H radius, rising 0.8 x radius, from the hairline back; base 0.008 to 0.02 H                                                                                                                | example [added]                 |
| Corner move that reads  | about 1/8 of mouth width (8 mm on 65 mm, 0.03 H); invisible at 1/30                                                                                                                                              | measured                        |
| Pixels per mm           | bust fills 1080 px: 2.8; bust 270 px tall: 0.75                                                                                                                                                                  | measured (`framing`)            |
| Smooth strength         | 0.2 (5.2 default 0.7)                                                                                                                                                                                            | Henning                         |
| Crease resolution       | at least 3 to 4 vertices across the radius                                                                                                                                                                       | Ryan King                       |
| Review lens             | 85 to 95 mm perspective                                                                                                                                                                                          | Morren, Kaspar, Naydenov, Yan   |
| Landmarks               | eye line 0.5 H; nose bottom halfway brow to chin; lip parting 1/3 nose to chin; ear nose base to brow; width H/1.5; mouth corners under eye centers; canthal tilt about 8 degrees; neck about 15 degrees forward | Abbitt, Naydenov, Thelen        |

## Quality gates

- **Measurable:** `S.stage_report(obj, voxel)` (components 1, non_manifold 0, stretch p95/median
  under 2.5, mirror_max under 1e-4 before asymmetry). `S.lower_face_report(head, H)`: `ball` True
  means the lower face fits one sphere within 10 % and twice as well as a plane (calibrated: the
  three E2 balloon jaws 0.057 to 0.082, the baseline 0.18 to 0.20, the v2 example 0.23 to 0.26).
  `S.profile_rhythm(obj)`: chin out, in, lips out, in, nose out (a nose hanging below the nose base
  hides the lip beats). `sc.planarity(c, r)` for a stated plane.
- **Visual (the gate):** `S.long_lens_render` or `final_render` at 85 to 95 mm from front, profile,
  three-quarter and below, plus `bx_review.review(..., modes=("silhouette", "matcap"))` for the
  ortho silhouette. Order: silhouette, big planes (cavity off, or `mode="flat"`), below and above,
  lines, character read at thumbnail size. Rubric:
  [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                       | What it looks like                                       | Fix                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| rounded_box or ellipsoid jaw, heavy smoothing | balloon lower face: cheek, jaw, jowl one sphere          | Clay jaw block with stated planes; `lower_face_report` gate                                                                                   |
| Flatten or scrape dabs to "make planes"       | facets that follow the ball                              | stated planes: Clay clips, `plane_cut`, `corner_cut`                                                                                          |
| Plane cuts on a wrong mass                    | gem facet with a rim, metric passes                      | move or rebuild the mass first, then cut                                                                                                      |
| Jaw block with its front ahead of the mouth   | a mask or slab over the lower face                       | jaw behind the mound; front belongs to mound and chin                                                                                         |
| Tall jaw block, small blend                   | a panel edge across the cheek                            | low block, 0.15 H blend upward                                                                                                                |
| Socket wider than the lids                    | ring groove, eye bags                                    | socket 1.1 x eyeball, lid blend 0.012 H                                                                                                       |
| Lids reaching behind the eye equator          | sealed pocket, 3 components                              | clip lids at the eye center plane                                                                                                             |
| Uniform hair offset, or clumps on a thick cap | helmet ledge, beanie with worms                          | thin base, clumps make the volume                                                                                                             |
| Clumps starting behind the hairline           | bare headband over the forehead                          | start clumps at the hairline                                                                                                                  |
| Symmetrizing asymmetric parts                 | swept hair mirrored, center seam                         | `to_object(..., symmetric=False)`                                                                                                             |
| Crease projected across a grazing surface     | parallel cracks                                          | crease only surfaces facing the view; skip it                                                                                                 |
| Smile sculpted into the basis                 | asymmetry cannot be removed                              | neutral basis, `write_shape_key`                                                                                                              |
| Corner moved 1 to 2 mm                        | expression invisible                                     | about 1/8 of mouth width, check pixels                                                                                                        |
| No hair or costume                            | bald mannequin                                           | cue list in stage 0                                                                                                                           |
| Detail before proportions                     | lines on a wrong skull                                   | stay coarse until the gates pass                                                                                                              |
| Stroke snapped with nearest from far away     | groove on the nose tip                                   | `on_surface(p, view)`                                                                                                                         |
| Mask survived the remesh                      | a region refuses every brush                             | `remesh_stage` clears it                                                                                                                      |
| GUI strokes with the view zoomed out          | whole mesh flattened                                     | `bx_gui.set_view(frame=obj)`, check `view_distance`                                                                                           |
| Hairline as one tilted cut                    | a garrison cap from the side, vertical wall at the front | hairline as a function of azimuth (sideburn, over the ear, down to the nape), quiff ramp from the hairline over about 0.12 H [eval]           |
| Mirrored eyes                                 | no gaze, a staring or blank attitude                     | two aimed eyeballs; lid margin and brow angle are attitude dials (level brows for a neutral basis) [eval]                                     |
| Feature attached at two points                | a nose that floats in profile, see-through gaps          | ray-grid silhouette-hole probe per view; give a big nose a side wall to the cheek; `bx_audit` self-intersections after the last remesh [eval] |

## Blender 5.2 notes

- Headless CRASH (segfault): `sculpt.symmetrize`, `sculpt.mesh_filter`, `paint.mask_flood_fill`,
  `sculpt.mask_filter`, `sculpt.face_sets_create`, `sculpt.face_sets_init`, `object.voxel_remesh` in
  Sculpt Mode. Poll fails: `sculpt.brush_stroke`, `sculpt.set_pivot_position`,
  `sculpt.detail_flood_fill`, trim gestures. Work: `paint_mask_extract`, `brush.asset_activate`,
  Edit Mode `mesh.symmetrize`, `quadriflow_remesh`, multires ops.
- OpenVDB ships with Blender 5.2 (`import openvdb`): `FloatGrid.copyFromArray` + `convertToQuads`
  mesh the Clay.
- Brushes are Essentials assets; Flatten, Fill, Scrape are one Plane type; `size` is a diameter;
  Draw Sharp defaults to SUBTRACT. `sculpt_tool` is `sculpt_brush_type`.
- Voxel remesh output is flat shaded (`shade_smooth()`), keeps attributes (mask included), drops
  shape keys.
- NumPy 2 in Blender: `np.ptp(a)`, not `a.ptp()`.

## References

- [`references/procedures.md`](references/procedures.md): tested code for every stage (Clay recipe,
  planes, form check, hair, lids, expression, final render, crash matrix, brush table, GUI recipe);
  load before writing any sculpt script.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps;
  load when designing a character or choosing methods.
- `references/critique.md`: stage rubric with blockers; load at every gate.
- [`references/sources.md`](references/sources.md): the 27 source videos with best timestamps.
- Example: `tests/code/blender-sculpting/stylized_head_blockout.py` (13 s, renders in
  `stylized_head/stage_N/`); comparison: `tests/code/blender-sculpting/compare/compare_sheet.png`.
