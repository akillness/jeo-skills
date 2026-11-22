---
name: scenario-zbrush-paint-render
description: "Use when polypainting in ZBrush (skin color zones, fills, cavity or AO passes, Spotlight), baking polypaint to a texture or vertex color, rendering a ZBrush model with BPR or Redshift, making render passes, a turntable or portfolio shots, or when paint looks like uniform beige or clown makeup, is blurry, is hidden under a texture or in Redshift, or a render is noisy, clipped, orthographic or bruised."
license: MIT
---

# ZBrush paint and render (texture and presentation artist)

Expert paint in ZBrush is observation made systematic: color zones placed by what lies under the
skin, pushed enough to survive the shader, judged on neutral and flat views, and baked at a
resolution the mesh can hold. For an agent without a tablet most of it is buttons: fills at a chosen
intensity through generated masks, zone images projected onto the mesh, and renders that are both
measured and looked at. If a sibling skill named here is missing from your available skills, load it
with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).

## Stance (the expert delta)

- **Paint last, at the top level.** Polypaint is one color per vertex: a lower level paints blurry,
  adding levels afterwards breaks it, and the map follows the point count (about 4M points per 2K
  map; 4K is wasted there) (FlippedNormals).
- **Judge on neutral and flat.** SkinShade4 or MatCap White01, plus Flat Color. A tinted MatCap
  makes you overcompensate and the export looks wrong elsewhere (FlippedNormals, Pablo).
- **Structure before beauty.** Start with a pure yellow, red and blue zone map placed by anatomy:
  bone and fat yellow, thin tissue red, hollows blue, more blue low on a man. Then cover it with
  skin color at low opacity so the zones shimmer through (Pablo). For an agent this is also the
  route that can be checked in numbers.
- **Masks are "the real trick" (Pablo):** generator, Mask Adjust, Inverse, color through the mask.
  The agent's big soft brush is FillObject at low RGB Intensity through the inverted mask: it scales
  with RGB Intensity (FlippedNormals), Pavlovich fills through an inverted AO mask, and the tooltip
  reads "Fill 3D Object Masked".
- **Saturation is the stylization dial (Pablo); paint to be diluted (FlippedNormals).** Shaders wash
  polypaint out. Pick the final renderer before deciding how far to push, and keep realistic skin
  under the middle of the picker.
- **Contrast directs the eye.** The strongest value or saturation contrast goes to the eyes, and the
  eyes and mouth get the most time (FlippedNormals).
- **Small and fast, then big and slow (Pavlovich).** Test small at a high Error Threshold, compare
  renders side by side, and rebuild the beauty from passes instead of re-rendering.
- **Visibility traps (Maxon docs).** A displayed texture hides polypaint. In Redshift only Polypaint
  materials show paint (Use Material Color 0, white Base), SSS Weight 1 hides it, and MatCaps show
  no texture.

## Establish first

| Input                                                                                | Changes                                                  | Default when the brief is silent                                                                                                                    |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose: game albedo, film lookdev reference, stills, color print, concept paintover | whether painted shadow is allowed; map size; deliverable | presentation stills, color kept as polypaint                                                                                                        |
| Renderer                                                                             | materials, passes, turntable route                       | BPR. Redshift is a separate application and `mx1 product list` shows it uninstalled on this Mac (2026-09-24); ask before installing it              |
| Style                                                                                | saturation target, zone simplification                   | the upstream skill's style: scenario-zbrush-character-creature is realistic, scenario-zbrush-stylized is stylized                                   |
| Subject: sex, age, build, skin tone                                                  | zone layout and hues                                     | ask once; if still silent, assume an adult of average build with light skin and say so                                                              |
| Color deliverable                                                                    | UVs, map size, Flip V                                    | vertex color; add a texture only when UVs exist                                                                                                     |
| Images                                                                               | document size, views, turntable                          | 1920 x 1080 (Pavlovich); front, three-quarter, profile and back; turntable 36 frames for review, 180 (Movie default) at 30 fps for delivery [added] |

## Workflow

Toolkit: [`scripts/zb_paint.py`](scripts/zb_paint.py), ZBrush-side functions through
`zp.remote("name", ...)`; full code in [`references/procedures.md`](references/procedures.md). Save
a versioned ZTL after every stage: there is no undo control.

1. **Preflight.** `paint_state()` (level, points, UVs, texture display),
   `recommend_map_size(points)`, `texture_off()`, save a ZTL. GATE: top level,
   `map_budget(points, side)` passes, v001 on disk. Divide now if needed, never after painting.
2. **Setup and base.** `set_paint_mode("rgb")` (Zadd and Zsub off), `fill(colour, 100)`: a dull skin
   base (FlippedNormals, doc) or pure yellow for the zone route (Pablo). GATE: the Flat front shows
   the fill color; Colorize reads on.
3. **Zone map.** Parts (eyes, scarf, teeth, clothes): `fill_subtools`. Polygroups: review with
   `polypaint_from_polygroups()`, fill exactly with `zone_fill_by_split()` (Duplicate, Groups Split,
   fill each piece, Project All back with Colorize on). Anatomy on one mesh: `skin_zone_plan` →
   `zone_image` → `polypaint_from_image` (planar UVs, before real UVs); synthesized Color Spray
   strokes as the fallback. GATE: `skin_zone_checks(stage="zones")`: forehead yellower than midface,
   midface redder, a man's lower third bluer, each by at least one JND (2.3 Lab); visually a clown
   on purpose (Pablo), every zone on its anatomy.
4. **Cover and breakup.** Skin color at 20 to 40 percent over the zones (doc RGB about 30; Pablo's
   low-opacity cover); breakup from zone-image noise or Color Spray strokes. GATE:
   `stage="covered"`: no clown (at most 5 percent of skin pixels above saturation 0.75 [added]),
   speckle present.
5. **Mask passes** with `mask_pass`: cavity darker and redder at 20 to 40 percent; PeaksAndValleys
   (PVRange 14) or Smoothness with a pale warm fill; `ao_plugin` mask with a purple-red undertone
   (ping after). Pablo's Adjust Colors is a dialog [verify live_p06]; a low fill through the same
   mask replaces it. Mask data cannot be read: prove a mask with `mask_coverage(masked, cleared)`.
   GATE: each pass shifts the region statistics a little, together they read as skin, back of the
   head included.
6. **Focus and finish.** Eyes: an iris image (dark ring, lighter bottom, darker top, lighter toward
   the pupil) projected onto the eye SubTool, then slight divergence; lips; selective darkening only
   where light never reaches unless the renderer adds no AO; a 5 to 10 percent wash for realism.
   GATE: final `skin_zone_checks` with eye contrast, then the Flat, SkinShade4 and MatCap White01
   sheets (`paint_review`) judged with [`references/critique.md`](references/critique.md).
7. **Deliver the color.** `texture_from_polypaint(path, side, flip_v=True)` needs UVs (UV Master on
   a clone, Paste UVs keeps polypaint); or OBJ vertex color; or Substance Bridge Send PolyPaint.
   GATE: map budget passes, an asymmetric mark lands where expected, file on disk.
8. **Render.** Save, `set_document_size` (small for tests; Resize clears the canvas, the function
   redraws), `render_setup` (perspective, shadows, AO), `bpr_render` or `paint_views(..., "bpr")`
   for matched views. GATE: `render_checks` pass and the renders were looked at at 100 percent.
9. **Passes and turntable.** `export_bpr_pass` (may open a dialog); clown pass by
   `subtool_solo_views` plus `id_pass` (paint and polygroups untouched); `composite` (shadow and AO
   Multiply through the mask); `turntable_frames` in short chunks, `assemble_turntable`. GATE: every
   frame upright with constant framing; the composite beats the beauty toggled against it.
10. **Portfolio and report.** Gray form views (`colorize_all(False)`, `zb_review.review`, restore),
    albedo and beauty views, ID pass, turntable, one sheet. Report what was measured, what was only
    looked at, what did not run.

## Numbers

| Value                                                                                          | Relative to               | Source                                |
| ---------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| About 4M points per 2K map; 2K = 4M pixels, about 3M usable at 70 percent UV coverage          | map side vs vertex count  | FlippedNormals 00:30:32; doc          |
| FillObject at N percent RGB Intensity = N percent blend                                        | the current color         | FlippedNormals 00:02:51               |
| Zones at RGB about 30, wash about 10; cover Draw Size 150, zones 100 or less                   | brush strokes             | doc Painting a Head                   |
| PVRange 14                                                                                     | Mask PeaksAndValleys      | Pablo 01:26:37                        |
| Map Border high (frames 4 and 16), FlipV on                                                    | Multi Map Exporter        | FlippedNormals 00:31:22               |
| 1920 x 1080 final; 1280 x 720 or 720 x 405 tests; 3200 x 2133 postcard; inches x 300 ppi print | document                  | Pavlovich; doc                        |
| Error Threshold 0.01 final, 1 tests (4 s vs 9 s); Progressive 64, 25 with denoise              | Redshift                  | Pavlovich 040h 00:44:03               |
| Main light 0.1 (never 0) with an HDRI; EXR gamma 2.2; macOS Redshift gamma 1.8                 | Light, Background         | Pavlovich 00:23:12; doc               |
| Crease Level one below SmoothSubdiv (3 and 4)                                                  | soft edge highlight       | Pavlovich 00:21:26                    |
| Movie Turntable 180 frames by default                                                          | Movie > Modifiers         | Pavlovich FvpG 00:19:56               |
| Realistic mean HSV saturation < 0.5                                                            | skin regions, Flat render | Pablo 01:10:30 (middle of the picker) |
| 1 JND = 2.3 Lab; clown share 5 percent; L* span 50; clipping 0.5 percent; noise sigma 2        | gates                     | [added], calibrate on live renders    |

## Quality gates

- **Measurable:** `paint_state` (top level, Rgb on, Zadd off, texture off); `map_budget`;
  `mask_coverage` above 0 before a masked fill; `skin_zone_checks` on a front Flat render with
  `head_regions_front()` or regions projected from landmarks; `render_checks` (framing, value span,
  clipping, noise); `upright_score` on turntable frames with a top marker; files on disk with sizes.
- **Visual:** Flat, SkinShade4 and MatCap White01 sheets in five views for color, and the BPR or
  Redshift beauty for the final read. Check each at 100 percent for breakup and edges, and as a
  thumbnail for zones and values. Look for beige or clown, lips, eye focus, the back of the head,
  bruises, cut shadows and grain. The rubric is `references/critique.md`.

## Common mistakes

| Mistake                                              | Looks like                                             | Fix                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Painting below the top level, or dividing afterwards | blurry, pixelated paint; artifacts                     | paint last at the top level; divide first                                                  |
| Judging on a tinted MatCap                           | colors fine in ZBrush, wrong elsewhere                 | SkinShade4, MatCap White01, Flat Color                                                     |
| Mrgb left on while painting                          | the review MatCap no longer shows; material painted in | Rgb only while painting; M or Mrgb fills only for render materials, on a saved ZTL [added] |
| Gray sheet of a painted model                        | color shows on MatCap Gray                             | `colorize_all(False)`, then restore                                                        |
| Texture displayed                                    | new paint invisible                                    | `texture_off()`                                                                            |
| Raw cavity mask                                      | harsh rings                                            | Mask Adjust with Blur; low intensity                                                       |
| Mask By AO on millions of polygons                   | slow, inaccurate                                       | the Ambient Occlusion plugin                                                               |
| UV Master on the painted original                    | polypaint erased                                       | Work on Clone, Copy UVs, Paste UVs                                                         |
| 4K map on 4M points                                  | wasted map, soft texels                                | `recommend_map_size`                                                                       |
| Redshift with a preset material or SSS Weight 1      | paint gone                                             | Polypaint material, Use Material Color 0, white Base                                       |
| Smooth Surface on low-poly hard parts                | shading bruises                                        | off; creases with Dynamic Subdivision                                                      |
| Orthographic beauty render                           | flat, technical look                                   | perspective on                                                                             |
| Movie > Turntable from a script                      | cannot stop; asks about an existing movie              | scripted frames plus `assemble_turntable`                                                  |
| Adding degrees for each frame                        | flips past 90 degrees                                  | absolute triples from `turntable_rotations`                                                |

## Handoffs

- **Receives:** from scenario-zbrush-sculpting, scenario-zbrush-character-creature or
  scenario-zbrush-stylized, a final versioned ZTL at its top level with `stats()` and its last
  review sheet, plus eyes and parts as named SubTools. From scenario-zbrush-hard-surface, parts as
  SubTools with creases. From scenario-zbrush-pose-print, a posed ZTL (paint with symmetry before
  posing when possible [added]).
- **Delivers to scenario-zbrush-retopology-export:** the painted ZTL, the map side from
  `recommend_map_size`, and either the exported color map (`texture_from_polypaint`) or a request
  for UVs on a clone before the bake. Multi Map Exporter's Texture from Polypaint runs in that
  skill's map batch.
- **Delivers to the user:** the beauty renders, gray and albedo sheets, passes and composite, the
  turntable MP4 or GIF, the portfolio sheet and the ZTL path, with what was verified.
- **Sister teams:** scenario-blender-texturing-shading and scenario-maya-expert for lookdev with
  vertex color or maps; scenario-zbrush-automation for batch renders.

## ZBrush 2026 notes

- Redshift needs its separate application; AOVs with OIDN since 2025.1, Cinema 4D-matched materials
  since 2025.2. BPR is unchanged.
- Substance Bridge (2026.2) sends polypaint to Painter as a fill layer; its Force UV Auto-Unwrap
  strips every SubTool's UVs.
- Movies: MP4 (MOV on macOS), resized above 4095 px. Mask by Smoothness fixed in 2024; ZRemesher
  Keep Polypaint since 2023; Ambient Occlusion plugin since 2021.6.
- `zb_paint.PATHS` tags each path; many are [strings] (label exists in this build) or [verify]. Run
  `live_p01_paint_paths.py` first: `set()` on a missing path is silent.
- Nothing in `zb_paint` has run in ZBrush yet; 36 offline tests pass; live tests
  `tests/code/zbrush-paint-render/live_p01` to `p06`.

## References

- `references/procedures.md`: full bridge code for every stage. Load before writing any paint or
  render code.
- `references/critique.md`: the rubric, the Z1 and Z2 finishing test cases, and the two evaluation
  prompts. Load at every gate.
- [`references/expert-notes.md`](references/expert-notes.md): the depth by expert with timestamps,
  the disagreements and what transfers without a tablet. Load when a decision is not covered here.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, hotkeys and settings for a human
  or computer-use agent. Load for Spotlight, dialogs and GUI-only steps.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs and
  timestamps.
