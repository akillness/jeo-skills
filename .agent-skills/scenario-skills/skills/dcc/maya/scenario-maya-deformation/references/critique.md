# Critique: how the character TD judges a skin, a corrective or a face

Load before calling any deformation stage done, and when reading a `deformation_test` report or a
ROM contact sheet. Numbers first, then eyes (scenario-maya-expert protocol); experts judge in
motion, at extremes, one motion at a time (Makauskas [00:04:11] [00:10:36]; Widup [00:27:41]).

## 1. Review protocol

1. `S.weights_verdict(S.audit_weights(...))`: no `error:` line. Weights that do not sum to 1 or
   exceed the cap make every later judgment meaningless.
2. `S.deformation_test(...)` on the calisthenics: read `verdict`, then the per-pose numbers of the
   worst poses.
3. Look at the same poses: `S.pose_snapshots` + `mx_review.review` headless (clay and wire, front
   and three-quarter), or a playblast in the GUI. Same cameras for every iteration so before and
   after compare (digest playblast recipe).
4. Change one thing (a mask range, a twist distribution, a corrective), re-run 2 and 3, keep the
   change only if the numbers and the images both improve.
5. Last: pose it like an animator, combining extremes ("weird poses", Makauskas [00:16:14]; "in
   animator shoes" [00:25:02]).

## 2. Reading the numbers (and their traps)

| Report item                        | What it means                                                        | Trap                                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cross_talk.count > 0`             | vertices with no weight on any moved joint moved                     | Impossible for pure skinning: a Delta Mush, wrap, ML Deformer or blend shape is leaking, or the wrong joint moved. Error, not warning.                                                                    |
| `pinch` (edge ratio < 0.7)         | compression, usually the inside of a bend                            | Rigid 100% weights show NO pinch: the pieces pass through each other. Always read `folds` and `collapsed_faces` too [added, measured offline].                                                            |
| `stretch` (> 1.3)                  | the outside of a bend, or a hard weight boundary                     | Smoothing lowers the worst stretch but can multiply pinched edges at deep bends: compare severity (`edge_ratio_min`, `edge_ratio_max`), not only counts.                                                  |
| `folds`                            | faces folding onto each other (dihedral >= 120 deg from a flat rest) | Some creases fold by design (finger crease, Jao's fold layer [00:26:09]); judge the region.                                                                                                               |
| `sections.area_ratio` < 0.7        | candy wrapper at a twist                                             | Linear skinning at 50/50 and 90 deg twist keeps 50% of the area; DQ keeps 100% [measured offline]. A section that is not closed (`error`) means the plane cut other geometry: restrict with `influences`. |
| `volume_ratio` off by > 10%        | a region lost or gained volume around its bone                       | Approximate for open regions; trust the sign and the trend between iterations, not the exact value [added].                                                                                               |
| `rigid` > 5%                       | a rigid part (sole, palm, skull) stretches                           | Makauskas restores rigidity with a soft Add brush, not with more smoothing [00:23:31].                                                                                                                    |
| `penetration.increase`             | clothing or accessory vertices went inside the body                  | Fix with body-driven weights on the shell (copy_nearest, remap), then volume smoothing restricted to the shell (Makauskas [00:05:33] [00:21:29]).                                                         |
| `unused_influences`                | joints with no weight                                                | Fine for engine skeletons that must keep the joint (game export) and for helper joints; otherwise remove them (speed, Help).                                                                              |
| heat map: a joint with zero weight | the joint is outside the mesh                                        | The Help says outside joints emit no heat; move the joint inside or weight it by hand.                                                                                                                    |

Thresholds are this toolkit's defaults ([added]); a production can tighten them. Never report a pass
on counts alone.

## 3. Region by region: what the experts look at

| Region                   | Look at (visual)                                                                                                                                                                            | Measure                                                                      | Usual fix, in order                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Spine and torso          | smooth bend and twist falloff, rib cage not dragged by the arm                                                                                                                              | pinch, stretch, `volume_ratio` per spine joint                               | joint placement; torso layer smoothing                                                                               |
| Clavicle and shoulder    | shrug shape, deltoid mass, armpit, neck not moving too much (Jao [00:14:59]; Makauskas [00:05:52])                                                                                          | sections across the upper arm; stretch at the armpit; cross talk on the neck | clavicle layer with its own mask (Jao [00:16:06]); correctives for overhead poses (Help PSD)                         |
| Elbow                    | crease placement, bicep volume, twist not concentrated at the elbow (Makauskas [00:09:44] [00:13:24])                                                                                       | folds and pinch inside, `volume_ratio` of the upper arm                      | twist distribution, then an elbow corrective; topology if loops run along the limb (antCGi x07 [00:10:27])           |
| Forearm and wrist        | candy wrapper, wrist bump (pivot), twist mid-forearm (antCGi x07 [00:11:04])                                                                                                                | forearm mid section area and perimeter                                       | twist joints evenly weighted (Jao), DQ or weight-blended skinning, joint pivot before weights (Makauskas [00:15:39]) |
| Hand, thumb, fingers     | palm and thumb interaction, finger volume, crease in the crease (Makauskas [00:17:53]; Jao [00:26:09])                                                                                      | pinch at knuckles, `volume_ratio` per finger                                 | sharper weights, smooth only middle loops (Makauskas [00:18:51])                                                     |
| Hip, groin, knee         | bend while lifting the foot, groin collapse, thigh pushing the belly (Maya LC [00:02:40]; Widup [00:02:50])                                                                                 | pinch and folds at the groin, knee section                                   | correctives (Help lists groin and knee), separate wrap drivers on film rigs (Widup)                                  |
| Foot                     | not rubbery, sole rigid (Makauskas [00:23:31])                                                                                                                                              | `rigid` on sole vertices                                                     | soft Add to the foot joint, fewer shared weights                                                                     |
| Neck and head            | neck and head junction, accessories follow the neck (Makauskas [00:20:24] [00:21:29])                                                                                                       | cross talk on the head when the arm moves                                    | fix the rig first; necklace-only volume smoothing                                                                    |
| Clothing and accessories | stays glued, no body poke-through (Makauskas [00:06:24])                                                                                                                                    | `penetration` per pose                                                       | shell weights from the body; volume smoothing limited to the shell                                                   |
| Face                     | mouth corners without pinch, cheek squash in the smile, lids over the eyeball, sticky lips, texture stretch with real textures (Burton [01:08:45] [00:37:23]; antCGi [00:47:19] [01:10:47]) | split sum error, lip distance at neutral > 0, joint and shape counts         | topology and texture fixes before weights (Burton [00:30:17])                                                        |

## 4. Scoring rubric (0 to 3 each)

1. **Weights hygiene:** 0 unnormalized or empty rows; 1 clean sums but tiny weights and over-cap
   vertices; 2 pruned and capped for the target; 3 plus mirror error < 0.01 and unused influences
   explained.
2. **Source soundness:** 0 smoothing hides pivot or topology faults; 1 faults known but unreported;
   2 blocked weights looked close to the goal before smoothing (Makauskas [00:08:27]); 3 plus each
   remaining fault attributed to rig, topology or correctives with evidence (identical weights on
   two topologies, antCGi x07 [00:16:24]).
3. **ROM quality:** 0 no ROM test; 1 a ROM with combined motions; 2 one motion per segment,
   extremes, verdict read and worst poses fixed; 3 plus weird poses, clothing and animator-style
   play, no unexplained warning.
4. **Twist and volume:** 0 candy wrapper visible; 1 twist joints present but weighted at the ends; 2
   even twist, section area above 0.7 at 90 degrees; 3 plus volume within 10% at elbow, knee and
   fingers.
5. **Correctives:** 0 none where the ROM needs them; 1 correctives that show at rest, or readers
   that cannot see a controller-driven joint; 2 pre or post chosen for the right reason (mesh wrong:
   pre; one posed result: post, Transform Space when one joint owns it, Tangent Space across
   joints), 0 at rest and 1 at the pose reached through the controls; 3 plus mirrored, extremes
   first, drivers inspectable (`S.joint_drive` reported), residual reported.
6. **Regenerability:** 0 only in the scene; 1 weights exported; 2 plan or layers exported (JSON),
   master shapes kept; 3 a rebuild from data reproduces the weights (import diff < 1e-4).
7. **Handoff:** 0 layers still on, source overwritten; 1 layers deleted, no report; 2
   `mx_validate(profile="rig")` clean, weights JSON, ROM sheet looked at; 3 plus the list of what
   was not verified.

A stage passes at 2 on every line; a hero asset needs 3 on lines 2 to 5.

## 5. Self-critique questions before reporting

- Did I look at a render or playblast of the worst three poses, or only at numbers?
- Is any warning explained by a design choice (fold layer, crease) rather than ignored?
- Would the result survive a mesh update from the modeler (weights and masks regenerable) and a
  joint move from the rigger?
- Did I change the cap, the skinning method or the deformer order after the last ROM run? Then run
  it again.
- Did I state which checks ran headless, which in the GUI, and which not at all?
