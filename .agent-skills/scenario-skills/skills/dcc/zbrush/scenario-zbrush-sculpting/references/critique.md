# Critique rubric: judging core forms the way the experts do

Use at every stage gate, on the `zb_review.review()` sheet (MatCap Gray, front, right, back,
three-quarter, top) plus the extra looks listed here, and with the numbers from
`zb_sculpt.stage_gate`, `pass_report` and `compare_reviews`. Answer each line yes or no, name the
ONE weakest item, fix it, re-review. A metric that passes while the sheet looks wrong: the sheet
wins.

Masks and silhouette metrics come from the canvas PNGs (background = the vertical gradient of each
row); with MatCap Gray the bottom of a silhouette can blend into the gray end of the gradient, so
look at `zs.silhouette_mask` output once per material before trusting IoU numbers [added].

## Looks to capture (beyond the default sheet)

| Look                | How                                                                                                                      | What it shows                               | Source                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| Silhouette          | `Material:Flat Color` [verify name] or the canvas mask (`zs.silhouette_mask`), front and side                            | the design read, boxiness, missing elements | Henning G2o6fdoACIQ 00:14:09                               |
| Thumbnail           | the sheet downscaled to about 128 px (squint)                                                                            | does it read without detail                 | Pablo tbQqC6tyDBQ 00:14:05                                 |
| Grazing view        | a view 60 to 80 degrees off the surface normal of the worked area                                                        | lumps, stroke seams, bumps between forms    | Pablo 9a9S1OcYHx4 00:02:34                                 |
| Moving light        | a Standard material (BasicMaterial) with the light front, side and behind, or BPR; never a MatCap, which bakes its light | whether forms read under changing light     | Pavlovich aR02CwyPTUw 00:04:39; Costa j5XLtLMN0P8 00:19:51 |
| Perspective look    | `zs.persp_snapshot_code(path, "threequarter")` (perspective on for this render only)                                     | eye placement, eye sockets, appeal          | Henning TpS0QdlfHWU 00:17:28; Shane t_gg7MIGSDM 01:41:03   |
| Surface differences | MatCap Red Wax                                                                                                           | stroke marks, uneven surfaces               | Pavlovich aR02CwyPTUw 00:03:32                             |
| Planes              | Chrome MatCap on polished or planar areas                                                                                | waviness in planes meant to be flat         | Pavlovich aR02CwyPTUw 00:03:32                             |
| Close-up            | `Scene.capture(..., center=form, ppu=2 to 3 x)` then the canvas PNG                                                      | crease quality, mark removal                | Henning TpS0QdlfHWU 00:22:26                               |

## S0 and S1: base and primary blockout

- Silhouette reads instantly from front and side; no unintended straight runs or right-angle corners
  on an organic subject (Henning G2o6fdoACIQ 00:15:17). Judge from the side when the front is
  occluded (00:16:23).
- Proportions match the brief (limb lengths, head in the body, landmark positions from the domain
  skill).
- Every element the subject needs is present now: ears, eyes, nose, mouth, teeth, horns, accessories
  (G2o6fdoACIQ 00:02:50).
- Masses are big and simple; no small scribbles or detail (Pablo tbQqC6tyDBQ 00:02:29).
- Inserted primitives feel part of one body; no hard shading break at joins (tbQqC6tyDBQ 00:03:16).
- Measured: points inside the S1 range (not a lumpy high-resolution mesh, tbQqC6tyDBQ 00:04:38);
  `pass_report` clean for every pass; symmetric where intended (`zb_audit` symmetry_x_pct); every
  re-DynaMesh through `remesh_code` with `ok` true, and the polygroups still there when they had to
  survive (polypaint was off).

## S2: primary refinement

- Clean shapes with no ambiguous bumps ("junk sculpting", Henning TpS0QdlfHWU 00:15:51).
- Each form has a peak in its center that fades to its edges (0PaYUUvgwYM 00:02:45).
- Stroke marks falling pass after pass (Red Wax, close-ups); marks left on purpose only for a clay
  look (TpS0QdlfHWU 00:21:53).
- No stretched faces after Move passes (smeared shading along a moved area): re-DynaMesh
  (`remesh_due`).
- Eyes are spheres placed first, each turned 3 to 7 degrees outward (Costa j5XLtLMN0P8 00:29:10);
  the lids wrap the eyeball (TpS0QdlfHWU 00:18:33). Judged on the perspective look render
  (00:17:28); review sheets and strokes stay orthographic.

## S3: secondary (mid frequency)

- Shapes within shapes: how skin wraps around mouth and eyes, fat pads, muscle transitions (Henning
  0PaYUUvgwYM 00:14:18; G2o6fdoACIQ 00:05:13).
- Symmetry broken on purpose (front mirror difference above zero: `mirror_asymmetry`) (G2o6fdoACIQ
  00:06:19; Costa 00:35:03).
- Not "semi smooth with details" and not "primary forms plus crazy alphas" (0PaYUUvgwYM 00:11:04 to
  00:11:35).
- Forms collide and ripple together in an expression (Costa 00:11:54); nothing "screams" (00:16:40).
- The sculpt reads strongly at thumbnail size without any detail (Pablo tbQqC6tyDBQ 00:14:05).
- The work sat at the right level: secondary forms at SDiv 2 or 3 and refined upward, big fixes at
  SDiv 1, nothing done only at the top; no visible stroke starts and ends (Pablo rArw79xEpvE
  00:12:28 to 00:14:16; tbQqC6tyDBQ 00:12:26).
- A Morph Target dialed in this stage was stored after the last remesh or Divide (`expect_points`
  passed).
- Measured: mid band (`band_energy`) up against S2 in the same view; fine band not above the mid
  band.

## S4: contrast

- Sharp where reality is sharp (lids, lips, nasal wings, deep folds), deeper than feels right
  (0PaYUUvgwYM 00:19:49 to 00:20:22); hard edges set with Standard and blended with clay (Pablo
  tbQqC6tyDBQ 00:10:27), no ClayBuildup over finished detail (TpS0QdlfHWU 00:07:44).
- Crease lines vary in weight and overlap; not one constant line (00:20:55). Measured in live_s03 as
  depth variation along the crease.
- Soft areas next to sharp ones; the eye goes to what is different (00:24:46).
- Dominance: some folds lead, others are softened back (00:25:49).
- Measured: silhouette shape IoU against S3 at or above 0.98 [added]: detail stages do not change
  the outline (Pablo tbQqC6tyDBQ 00:13:27).

## S5 and S6 (owned by the domain skills; the checks this skill still runs)

- Details sit on mid forms, never on flat unbroken forms (G2o6fdoACIQ 00:07:45).
- Feature details first (scars, deep creases), texture around them, fading at transitions (Pablo
  tbQqC6tyDBQ 00:15:19 to 00:18:00).
- Skin reads as skin, not clay; one light smooth at the end at most (TpS0QdlfHWU 00:22:58).
- Hierarchy: quiet areas and focus areas (detail density not uniform).

## Judging a cleaned AI or scan mesh as "forms worth detailing" (scenario Z6)

After scenario-zbrush-retopology-export has repaired, separated and remeshed the parts:

- The AI tell is gone: noise and lumps spread evenly everywhere, forms that neither begin nor end. A
  professional base has a hierarchy of big, medium and small shapes with quiet areas (Henning
  0PaYUUvgwYM 00:25:18).
- Every form has a clear start and end: tucks and overlaps (brow over eye, lip over teeth), clean
  creases where forms meet, not mushy blends [added wording of the digest checks].
- Planes are stated where the design wants them (brow, cheek, jaw planes: TrimDynamic or hPolish
  passes), not balloon surfaces.
- Fused parts are separate SubTools or separated by clean creases; no bridges between close parts
  (DynaMesh fuses intersections, Pablo FrqUnna1jns 00:15:39).
- The silhouette still carries the character's appeal in identical views against the raw import
  (`compare_reviews` of the raw and cleaned review folders).
- Measured: `zb_audit.verdict(..., "sculpt")` clean; one shell per SubTool unless intended; edge
  length cv near a fresh DynaMesh value; volume change against the raw mesh explained (smoothing
  costs volume).

## Stroke-plan review (before sending a pass)

Open `zs.preview_plan` output and check:

- Clay strokes cross the form (perpendicular to its center line); line brushes follow it.
- Brush circles are about the form's width at S1 and S2, smaller for refinement; nothing large at
  the top level.
- No stroke crosses the symmetry plane with symmetry on; strokes stay inside the model and away from
  the silhouette edge.
- The worked surface faces the camera (no "faces away" warning); otherwise pick `best_view`.
