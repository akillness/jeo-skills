# Critique rubric: judge a hard-surface part like the experts do

Run in this order, every shading pass and before delivery:

1. `r = HS.shading_audit(ob); v = HS.verdict(r)`: what code can see.
2. `HS.review([ob], out, views=("front","threequarter","top","low"), modes=("matcap","hsgrey","reflect","wire"))`:
   open the sheet.
3. One `HS.closeup(ob, point, radius, path, mode="shiny")` per cut, per union, per corner where
   three bevels meet. Radius about 2 to 3 times the feature. Open each.
4. Score the table below. Report every line that is not a pass, with its number or image.

The verdict and the eye must agree. A clean verdict with an ugly closeup means a defect the code
does not measure (write it down); an ugly verdict with a clean closeup means a threshold or a false
positive (say which).

## Rubric

| #   | Criterion                        | What the experts look at                                                                                                                                         | Code check                                                                                  | Pass                                                         |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Scale applied                    | even bevel widths on every axis (du Mont [00:05:28], Gambrell [00:04:29])                                                                                        | `r["scale_applied"]`, cutters `scale_applied`                                               | all true                                                     |
| 2   | Stack order                      | cut edges beveled, WN at the bottom, mirror above WN (Ryuu [00:26:26])                                                                                           | `r["stack_problems"]`                                                                       | empty                                                        |
| 3   | Flat faces read flat             | no gradient smear in a shiny matcap at any angle (Gambrell [00:00:33])                                                                                           | `r["normals"]["smear_faces"]`, `r["nonplanar_base_faces"]`                                  | 0 and 0                                                      |
| 4   | Every hard edge catches light    | continuous bevel highlight, no razor edge (Gambrell [00:16:31])                                                                                                  | `smoothed_hard_edges` 0; clamp ratio < 0.1                                                  | closeups show a highlight on every edge                      |
| 5   | Bevel width constant around cuts | the bevel does not narrow near a cut (du Mont [00:29:45])                                                                                                        | `r["clamp"]`, `r["clamp_culprits"]`, `sliver_report`                                        | ratio < 0.1                                                  |
| 6   | Cutter hygiene                   | smooth, applied, wire, in Cutters, no coincident faces (Gambrell [00:25:26], Ryuu [00:05:09])                                                                    | `r["cutters"]` (coplanar, near-parallel, thin wall, narrow gap, near-miss, rounding facets) | every flag false, `pokes_out` true                           |
| 7   | Result is solid                  | no holes, no red faces in Face Orientation (Ryuu [00:21:11])                                                                                                     | `eval_non_manifold_edges`, `booleans[*].changes_mesh`                                       | 0, all true                                                  |
| 8   | Cuts on curves                   | no stretch at the corners of a cut on a curved skin (Gambrell [00:01:39])                                                                                        | `r["cuts_on_curvature"]` is a prompt, not a fail                                            | closeup clean, or `transfer_normals` added and closeup clean |
| 9   | Corners                          | Arc miters read round, no pinch where bevels meet (Gambrell [00:18:28], Ryuu [00:22:49])                                                                         | `folded_edges` 0                                                                            | closeup                                                      |
| 10  | SubD surface (School B)          | no pinching in a rotated shiny matcap, square quads, holding edges spaced (rileyb3d [00:06:00], PzThree [00:03:15])                                              | `r["subd_cage"]`, `bx_audit` quads %                                                        | no pinch in closeups                                         |
| 11  | Design                           | clusters vs calm areas, alignment with neighbors, functional logic, transition parts at intersections (Ryuu [00:28:37], Gambrell [00:34:15], du Mont [00:39:36]) | none                                                                                        | a reason for every detail                                    |
| 12  | Silhouette at use distance       | the part reads from the gameplay or shot camera (Augusto [00:14:12])                                                                                             | none                                                                                        | silhouette row reads                                         |
| 13  | Game (if asked)                  | tri budget, triangles only, custom normals survive, bake clean (Gambrell [00:21:15], Augusto [00:11:48])                                                         | `HS.tri_count`, `game_version` checks                                                       | within budget                                                |

## Triage: symptom to cause

| Symptom (shiny matcap, orbit)                                | First test                                      | Cause                                                                                      | Fix                                                                          | Source / evidence                                                          |
| ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Gradient smear on large flat faces next to bevels            | `smear_faces` > 0; toggle Harden / WN           | averaged normals                                                                           | Harden Normals on the micro bevel; WN last                                   | Gambrell svS9 [00:02:42]; measured 12.0 to 0.02 degrees                    |
| Stretch in a corner, WN and Harden change nothing            | `nonplanar_base_faces`                          | face not planar                                                                            | `HS.flatten_faces`                                                           | Gambrell qB1e [00:01:06]                                                   |
| Faceting everywhere after Shade Smooth                       | `smoothed_hard_edges`                           | smoothing across hard edges                                                                | micro bevel, Smooth by Angle, or WN Keep Sharp                               | Gambrell 1qVb [00:07:23]                                                   |
| Facets on cut walls                                          | `eval_flat_shaded_faces`, cutter `smooth` false | flat-shaded cutter                                                                         | smooth the cutter                                                            | Gambrell 1qVb [00:25:26], Ryuu [00:10:42]                                  |
| Cut edges sharp, rest beveled                                | `stack_problems`                                | boolean below the bevel                                                                    | `HS.order_stack`                                                             | Ryuu [00:26:26]                                                            |
| Bevels narrower everywhere after a new cut                   | `clamp_probe` ratio, `clamp_culprits`           | a near-miss, thin wall, groove under 2x width, or rounding facets at the bevel angle limit | move the cutter clearly away or exactly on; widen the feature; more segments | du Mont [00:20:18]; verified clamp 1.38, 1.36, 0.47, 1.90, 0.45, 3.8       |
| Notch or bump in a bevel next to a cut                       | `cutter_report.thin_wall_*`                     | wall thinner than 2x width                                                                 | move or shrink the cut                                                       | verified on the eye-socket wedge                                           |
| Streaks and black patches around a round cut on a round part | `eval_non_manifold_edges`                       | cutter facets in phase with the target facets                                              | half-segment phase                                                           | verified: 10 non-manifold edges                                            |
| Part vanishes or gets holes after a boolean                  | `boolean_report(ob, try_solvers=True)`          | broken operand (open or flipped)                                                           | repair the operand, return to EXACT                                          | Ryuu [00:15:13]; verified: EXACT 19 non-manifold, MANIFOLD skipped the cut |
| Glitch that Float fixes                                      | `coplanar_faces`                                | coincident faces                                                                           | offset the cutter or keep EXACT                                              | Gambrell 1qVb [00:26:33] is outdated; verified Float 16 non-manifold       |
| Stretch at the corners of a cut on a curve                   | `cuts_on_curvature` + closeup                   | beveled n-gons on curvature                                                                | end the cut on a flat area; `HS.transfer_normals`                            | Gambrell qB1e [00:02:45]; verified p95 2.79 to 0.34 on a sphere            |
| Butterfly streak on a mirror seam                            | closeup of the seam                             | mirror + boolean normals                                                                   | `HS.mirror_seam_fix`                                                         | Gambrell qB1e [00:06:57] (not reproduced here)                             |
| SubD pinch                                                   | shiny closeup, rotate the view                  | loops too close, stretched pole                                                            | space and align loops, tighten around the pole                               | rileyb3d [00:06:00], Gambrell svS9 [00:13:41]                              |
| SubD artifact from nowhere                                   | turn subdivision off, look at the cage          | interior face or bad routing                                                               | route the loop through                                                       | Gambrell svS9 [00:14:44]                                                   |
| Distortion around an inset circle                            | closeup                                         | no border ring                                                                             | outset a ring around it                                                      | PzThree [00:42:25]                                                         |
| UV stretch along bevels on subD                              | checker texture                                 | odd segments or wrong UV Smooth                                                            | even segments, Keep Corners, apply the bevel before seams                    | Lampel [00:11:15]                                                          |
| Cuts disappeared on a copy                                   | `booleans[*].changes_mesh` false                | copy moved away from shared cutters                                                        | keep in place, or collapse then move                                         | verified in test_03                                                        |

## Design critique (no metric, still required)

- **Big, medium, small** (rileyb3d [00:01:01]): primary silhouette first, secondary cut-ins,
  tertiary details last. Tertiary detail on a weak primary is a fail.
- **Detail placement**: clusters where the eye should go, calm areas elsewhere (room for decals or
  serials), each detail aligned to a neighbor's edge or axis (Ryuu [00:28:37], Gambrell [00:35:21]).
  Random scatter reads as noise.
- **Function**: panels, fasteners, vents and joints should suggest how the object is built and moves
  (du Mont annotating the concept [00:47:13], PzThree [00:54:14]).
- **Intersections**: a perfect intersection of two parts looks fake; add a collar, grommet or
  chamfer (du Mont [00:39:36]).
- **Scale**: detail size follows real size (Augusto [00:24:31]); bevel width follows real size and
  viewing distance.
- **Chamfers**: planar shifts that catch light add read; too many identical bevels read as CG (Ryuu
  [00:33:05]).

## Delivery statement

State: school used and why; stack per object; verdict lines left and why; tris per object (render
and game); which closeups were looked at; what was not verified (for example: mirror seam fix not
reproduced, bake not done).
