# Expert notes: deformation (skinning, Skin Tools, shapes, correctives, face, ML Deformer)

Load when a decision needs the reasoning behind a rule, when experts disagree, or when judging a
result the way a named expert would. Timestamps are `[hh:mm:ss]` in the source video; "Help" is the
Autodesk Maya 2027 Help (full list in `sources.md`). [added] marks this skill's own additions;
[verify] marks names not yet confirmed in Maya 2027.

## 1. Viktoras Makauskas (author of ngSkinTools, now Skin Tools in Maya 2027): full-body layer skinning

- **Throw away the default layer.** Initialize layers, discard the layer holding every influence,
  rebuild region by region, each on its own layer stacked over the torso: torso, shoulders, upper
  arm, forearm, hand, thumb, fingers, head, legs, feet [00:01:11].
- **Block 100% first.** Select the region's joints, Assign from Closest Joint: every vertex 100% on
  its closest joint [00:01:41]; Replace brush at intensity 1 for blocking; hold S to sample an
  influence (ngSkinTools2 shortcut [verify in 2027]) [00:01:55]; Screen projection where strokes
  must reach back faces [00:02:28].
- **Raw weights are a rig diagnostic.** "When you're posing pay attention at the deformation with
  raw weights: it should look relatively close to your expected final result; if it looks way off
  there might be some underlying issues with the rig itself" [00:08:27]. A wrist bump "really needs
  the joint pivot adjusted" [00:15:39]; smoothing the neck instead of fixing the rig: "don't do this
  in production" [00:20:33].
- **Calisthenics:** select all controls, key them every 10 frames, a pose on every second key, so
  the character goes to a pose and back to bind [00:03:01] [00:03:58]. One motion per test: his
  first forearm test bent and lowered the arm at once and had to be rebuilt [00:10:36]. Very extreme
  and "weird" poses expose errors and the distribution between joints [00:15:11] [00:16:14].
- **Fill, then mask.** On a limb layer, fill the whole layer with that region's joints, then paint
  the layer mask; the chapter title calls it "very important" [00:07:57] [00:08:12]. "Mask is not an
  actual influence in the skin cluster; instead it will define the transparency of the layer"
  [00:08:46]. He polishes the mask mostly with Smooth, checking every pose [00:09:18].
- **Twist distribution is judged by eye.** Three twist joints in the upper arm and three in the
  forearm [00:07:57] [00:10:10]; bicep volume loss fixed by more weight on the middle twist joint
  [00:09:44]; more weight on the first forearm twist for less twisting near the elbow [00:13:24]. He
  has seen people "take out their calculators and do the math" and does not [00:11:31].
- **Smoothing is not free.** A "pretty strong" smooth pass while scrubbing the calisthenics
  [00:04:11]; flooding smooth on low-density fingers lost too much volume [00:18:35]; instead smooth
  the middle loops and use Sharpen, "an opposite of smooth brush" [00:18:51]. The foot became
  rubbery: a soft-shaped Add brush restores rigidity [00:23:31].
- **Multi-shell geometry:** volume smoothing makes a necklace and the body agree [00:05:33]; it also
  fixes body geometry poking through the shirt [00:06:24]; deselect the shirt so only the body
  smooths and the armpit sticks to the shirt [00:07:18]; select only the necklace vertices so the
  neck weights stay untouched [00:21:29].
- **Debug by toggling layers:** an artifact that appears with one layer enabled belongs to that
  layer [00:13:54].
- **Done means an animator played with it** [00:25:02].

## 2. Mitchell Jao (character animator, Blue Sky, Blizzard, Disney): region layers and proxy transfer

Captions are machine-translated; quotes are approximate.

- **Normalization is the root difficulty of vanilla painting:** removing weight sends it to a joint
  you did not choose [00:02:25] [00:04:34]. Vanilla discipline: lock everything but the two joints
  you trade between, add to the one you work on, smooth only between the two unlocked joints
  [00:05:08] [00:05:41].
- **Bind method barely matters** when everything is repainted; he binds only the joints he wants,
  max-influence maintenance off [?] [00:09:01] [00:09:33]. Default weights: "Obviously, terrible.
  We're going to overwrite all of this" [00:10:07].
- **Assign from Closest Joint maps upwards along the chain**, "exactly what you want from FK joints"
  [00:10:39]; flood Smooth several times [00:11:44].
- **One layer per decision:** a clavicle layer filled 100% everywhere and masked to the arm and
  shoulder keeps the spine weights consistent; trading weight between chest joints on one layer
  "gets very dirty" [00:13:19] [00:16:06]. Shrug art-directed with Smooth and Scale, neck kept still
  [00:14:59].
- **Even twist, directed mask.** Five twist joints per section on his rig [00:17:13]; flood smooth
  until the twist gradation is even; weights outside the arm do not matter because the mask zeroes
  them [00:18:20] [00:18:51]; most time goes into the mask [00:20:36]. "You make the twists in the
  layer and give them even weight, and then, with the mask, you artistically direct the shape of the
  elbow" [00:22:19]. Softening twists later does not disturb the elbow: "work in a very modular way"
  [00:25:00].
- **Hard 100% weights can be right** where the rig has one joint per section and moves smoothly
  itself (eyelids) [00:28:22]. Metacarpals: four joints weighted evenly [00:25:00]. Finger "fold"
  layer: the finger bends in the crease, not above it [00:26:09].
- **Layers are an authoring convenience:** the result is a normal skinCluster and the tool can leave
  the scene [00:31:18]; export layers to JSON to keep the layered work [00:31:49].
- **Proxy weights:** loft a surface along lip joints, weight it 100% per joint, copy onto a
  duplicate of the main mesh (the transfer ignores topology, which is the point), export that layer,
  import it on the main mesh by vertex ID, then paint the mask there [00:33:09] [00:34:47]
  [00:36:26]. Split upper and lower lip proxies or the lips stay stuck [00:37:00]. Change the lip
  joint count, rebuild the proxy, keep the mask work [00:39:49].

## 3. Maya Learning Channel: Skin Tools quick start (Maya 2027 UI)

- Skin Tools works on an already bound mesh [00:00:03]; Initialize Skin Layers [00:00:29]; per-layer
  influences isolate edits to that layer ("your edits only affect the left leg") [00:00:58]; Assign
  From Closest Joint for a quick start [00:01:17].
- Screen projection for the rough pass through the limb, Surface to refine [00:01:32]; Replace to
  paint, Smooth to refine [00:01:32]; mirror via Set Weights > Common Settings > Mirror and Paint >
  Interactive Mirror [00:02:02].
- Test with the real controls: lift the foot, look for areas that "pinch, collapse, or stretch"
  [00:02:25] [00:02:40]. Refine with selection-limited Smooth applied repeatedly (grow selection,
  Set Weights > Smooth > Apply) [00:02:48].

## 4. Maya Learning Channel (Matt Chan): multiple skinClusters and UV Pin on a face

- Several skinClusters keep compound effects "orderly and separate" (squash and stretch under facial
  tweaks) [00:01:03]; controls drive joints through Offset Parent Matrix [00:01:37].
- Selection order is data: bind and pin in the same order so pin i pairs with control group i
  [00:01:57] [00:07:36]. The second bind asks to create a second cluster [00:02:37].
- Copy weights cluster to cluster from a reference head (Copy Skin Weights options, Skin Cluster
  source and target) instead of repainting [00:04:03] [00:05:16].
- **Cycle escape:** the pins must read skinCluster1.outputGeometry (squash only), not the final mesh
  the controls deform: "the controls need to know how the face looks, but the face needs to know
  where the controls are" [00:06:27] [00:07:01].
- **Double transform fix:** connect each control group's inverse matrix into the matching
  bindPreMatrix of skinCluster2 [00:08:22] [00:08:57]. [added] This is exact only when the tweak
  joint sits at its group's origin at rest; `test_multi_skin.py` measures it (region moves once, not
  twice).

## 5. Antony Ward (antCGi, games veteran): blend shape face and the lip generator; base mesh deformation testing

Blend shape face (RbQM82Ta6zE):

- **Joints for rotation, shapes for flesh:** blend shapes are linear, "they don't work well on an
  eyeball"; eyes, lids and jaw stay on joints [00:01:38] [00:02:13]. Separate the head from the body
  so shapes only compute head vertices [00:03:12].
- **Additivity:** "blend shapes are additive ... we will get double movement"; corner vertices are
  excluded from lip shapes that corner shapes own [00:08:58] [00:09:31]. Wide plus smile overshoots:
  replace the smile with a pure raise [00:52:53].
- **Generator:** one master shape, section heads chained with blend shapes ("using blend shapes to
  create blend shapes"), complementary per-loop weights (0.8/0.2, then 0.2/0.4/0.7 against
  0.8/0.6/0.3) so the sections at 1 equal the master; check each section alone for leaks under the
  nose and on the chin; keep the generator hidden, never delete it [00:20:32] [00:23:36] [00:30:38]
  [00:31:59] [00:32:35] [00:38:39].
- Build one side, Mirror Target (direction minus, Object X) or Duplicate plus Flip Target [00:42:14]
  [00:44:22]. Exaggerate shapes slightly for the animator [00:46:43]; check the engine's shape limit
  early [01:07:58]. Negative weights sometimes give the opposite shape for free, "this doesn't
  always work" [01:11:57].
- Soft selection falloff Surface, not Volume, or both lips move [00:07:22]; Edit must be on (red) or
  edits land on the wrong target [00:04:51].

Base mesh deformation testing (x07USYlvu2o, modeling series):

- Test deformation before texturing [00:00:00]; anchor root joint so the body does not follow the
  shoulder [00:03:34]; Weight Distribution Neighbors "makes painting weights more predictable"
  [00:04:12]; paint in a deformed pose [00:05:16].
- **Who fixes it:** at a clean elbow "the topology is okay so it would need something extra in the
  rig" (correctives) [00:10:27]; at wrist and ankle the loops run the wrong way and must be rebuilt
  [00:11:04] [00:17:37]; "reworking the topology would be much better" than corrective shapes when
  flow is the cause [00:16:24].
- Delete Non-Deformer History, never History, on a skinned mesh [00:12:41]; unbind with Delete
  history to return to the default pose [00:13:49]. Face tests with joints because blend shapes
  break when topology changes [00:19:00]. Studios keep a ROM file of simple to extreme poses
  [00:21:10].

## 6. Josh Burton (facial rigger, Midway; Morpheus rig): facial rigging judgment

- Two families: blend shape rigs (cinematics, Morpheus) and joint rigs, "typically ... with video
  game projects ... because game engines seem to prefer that" [00:13:03] [00:13:35]; joints riding
  on shapes is "more of a film kind of workflow" [01:02:31].
- **Budget first:** "what's our joint budget and what kind of range of motion are you going to get
  out of this character" [00:35:45]; 24 face joints on his current-gen asset; with few joints, cheek
  joints beat a centerline lip joint because cheek squash sells the smile [00:36:51] [00:37:23].
- **Lips slightly parted in the base mesh** made skinning "night and day easier"; coincident lip
  vertices break weight mirroring and wraps [00:26:21] [00:29:33] [01:09:51].
- **Rotation-only joints:** exact eyeball pivot (no translation needed) [00:48:33] [00:49:07]; lower
  lip and tongue under the jaw for the free ride [00:49:42]; joints oriented along muscle paths,
  centerline joints world oriented [00:50:09] [00:50:45].
- **Transferable SDK faces:** off-hierarchy joints, a rest pose at zero; snap joints to a new head,
  reset the rest, reuse every pose: about 1.5 days per new head [00:38:46] [00:39:19] [01:12:19].
- **Influences:** he wrote a tool to find vertices over the cap; Unreal mobile allowed 2 per vertex,
  and 4 across the centerline was already "nightmarish" [00:51:19] [00:51:55].
- **Asset checks:** no baked shadows at lids, lips, nostrils; brow textures inside plausible bounds;
  loops that follow the face; mouth cavity, teeth and gum clearance; mouth corners checked before
  sign-off [00:30:17] [00:31:24] [00:33:03] [00:34:38] [01:08:45]. Mesh edits while rigged: skin a
  polyUnite of the pieces [00:52:27]. Additive corrective by subtracting the base motion (abSymMesh)
  [00:18:46]. Keep a reset head [00:13:35].

## 7. Todd Widup (film rigging supervisor): layered film rig and the ML Deformer (Maya 2025.2)

- **Layered hybrid:** a segmented low-res cage with correctives drives a continuous low mesh by
  proximity wraps, legs and torso as separate wrap drivers so the thigh can push the belly without
  interference, then mid and high resolution [00:02:17] [00:03:23] [00:04:00]. Keep the control rig
  light so slowness comes only from deformation [00:05:39].
- **Delete Delta Mush before training** so the ML learns the skinCluster alone [00:07:55]. Control
  Collector gets the joints that drive the mesh, not animator controls [00:10:08] [00:10:41].
- **Pose coverage is the lever:** about 30 degree steps per axis per joint (range -30 to 90 gives 5
  poses), 1,500 to 2,000 random poses for a full character [00:15:50] [00:16:22]; one joint at a
  time, because cross talk is the typical failure [00:27:41]; 12 to 20 arm poses wanted, a 13 to 15
  pose shoulder set generalized well [00:37:08] [00:39:55]. "It is what you feed it" [00:35:58].
- **Settings seen:** first run batch 128 to 256, epochs 1,000 to 2,000, validation 0.2 to 0.4,
  dropout 0.05, principal shapes 40 at 95% [00:21:25] to [00:24:49]. A bigger network (around 10
  layers, up to 4096 neurons [?]) bulged and cross-talked; 5 layers fixed it [00:31:13] [00:32:32].
  Final arm: epochs 3,000, validation 0.3, 5 layers, dropout 0.10, principal shapes limit 40 at 97%,
  only 15 needed [00:42:10] [00:42:44] (batch size and neuron counts are garbled in captions).
- Autodesk's test: about 17 fps with the full rig to almost 60 fps with the ML Deformer [00:42:44].
  Uses: crowds, background characters, maybe hero with time [00:44:23].

## 8. Darren Rudy (EA principal technical artist): game PSD with secondary joints in Bifrost

- **PSD for games is secondary joints driven by poses** [00:14:18]: driver graph (swing-twist
  decomposition of a matrix) > pose graph (a driver range remapped to 0..1, e.g. 0 to 4.83, into
  named poses like arm abduction) > per-region secondary graphs where each secondary joint blends
  per-pose transforms [00:16:28] [00:18:38] [00:20:47]. "It's never at a pose, it's always at a
  percentage" [00:21:20]. Artists tune by moving pose locators live, even between poses [00:22:27].
- **Shareable deformation:** a common skeleton in structure and position; secondary joints placed by
  ratios and raycasts (e.g. 50% between clavicle and arm, then a ray to the trapezius) so they
  transfer across morphologies [00:06:39] [00:10:22]; blend two authored weight maps by body type
  [00:11:28].
- **LOD every secondary joint** at design time (Switch and PS5 cannot run the same thing)
  [00:38:41]. Maya node PSD ran at 4 fps; the Bifrost port at 60 fps [00:37:35] [00:38:07]. Code
  builds structure, compounds hold logic [00:32:44]. Skinning itself: procedural first, then manual
  art direction [00:48:26].

## 9. Autodesk Maya 2027 Help (authority for 2027 behavior)

Skinning and Skin Tools (`sources/docs/deformation__skinning-skin-tools-2027.md`):

- Heat Map "generally gives better default results"; only influences inside the mesh emit heat, so
  end joints outside get nothing. Geodesic Voxel handles non-manifold, non-watertight, intersecting,
  multi-piece meshes, needs every joint inside and outward front faces, treats several meshes as one
  volume, and must be followed by `geomBind` when created with `bindMethod=3`.
- Linear skinning gives the "bow tie" or "candy wrapper" at twisting wrists and elbows; dual
  quaternion preserves volume; weight blended mixes per joint.
- Bind pose blockers: constraints, expressions, keyed IK; Modify > Evaluate Nodes > Ignore All, Go
  To Bind Pose, Evaluate All.
- `skinCluster`: `normalizeWeights` 0 none, 1 interactive, 2 post ("default" on the command page;
  the Prune page calls Interactive the default mode); editing `maximumInfluences` or `dropoffRate`
  in edit mode loses custom weights; `heatmapFalloff` 0 smooth (many small weights) to 1 (closest
  joint dominates); `multi` allows a second cluster; `removeUnusedInfluence` query counts all-zero
  influences; `dumpInfo` returns a Python dict.
- `copySkinWeights`: `surfaceAssociation` defaults to closestComponent on the command page while the
  UI default is Closest point on surface; `influenceAssociation` defaults to closestJoint;
  `mirrorMode` defaults to XY; `mirrorInverse` flips the direction (positive to negative by
  default).
- Copy needs overlapping, similar meshes; UV space for different proportions; weight maps are UV
  based and need non-overlapping UVs. Adding an influence object alters nearby weights: export, add,
  import, then paint.
- **Skin Tools:** scriptable through `ngSkinTools2.api` (Developer Help, "Skin Tools Python API":
  "meant to be used primarily from the UI. However, it is possible to access some of its
  functionality from Python"; the C++ plug-in commands are "not intended to be used directly").
  Layers exist only after explicit initialization; masks are grayscale alphas; layer groups share
  one mask (hands, feet); Interactive Mirror, Mirror tab, or Mirror effect applied on write (not
  visible while painting); Max Influences in the Effects tab is post-process (not visible while
  painting); Prune from the Skin menu hits all layers, from the Tools tab the active layer only.
  While layers exist, the classic Paint Skin Weights, Set Max Influences, Hammer, Paste, Move
  Weights to Influences, Import Weight Maps, Mirror Skin Weights, Substitute Geometry and Normalize
  are blocked, and Copy Skin Weights is unavailable. Skin > Smooth Skin Weights uses the Skin Tools
  algorithm (temporary layer, single layer, or an error with several layers). Delete Skin Layers
  keeps the evaluated weights, "useful when finalizing a rig before handing it off to animation".
  The paint preference defaults to the classic tool.

Blend shapes, PSD, deformers (`sources/docs/deformation__blendshapes-psd-deformers.md`):

- Pre-deformation corrective: "like fixing the original character's mesh", holds in other poses.
  Post-deformation: Tangent Space (local vertex frame, not UVs) or Transform Space (a joint's space,
  faster, bounded by the joint's envelope).
- PSD: problems at shoulder, underarm, knee, groin; build extremes first, then in-betweens, or mark
  poses Independent; three neutral poses; Regularization "usually somewhere between 0.01 and 1.0"
  (the same page later suggests "something like 0.001" for wobbliness: start at 0.01 and test);
  weights far outside 0..1 mean inputs beyond the stored poses or Gaussian falloffs too big (add a
  pose, or Auto-adjust Gaussian Falloff); Euler Twist for a wrist twisting about the forearm;
  controller-driven joints need their driving attributes before neutral poses; mirroring needs
  case-sensitive R_/L_ names.
- Delta Mush is a low-pass filter usable for "paint free skinning"; Tension preserves relative edge
  lengths; Proximity Wrap drivers must line up with targets at bind, ProxNet avoids double
  deformation; Morph keeps legacy CPU deformers from blocking GPU evaluation.
- ML Deformer: anything ranked above it in the deformation stack is not approximated; Target Morph
  toggles target and ML; training downloads Python modules into
  `<MAYA_APP_DIR>/mlDeformer/<version>/Lib/site-packages`; Principal Shapes analysis tells how many
  shapes reach an accuracy.

## 10. From the rigging and modeling digests (upstream facts this skill relies on)

- A skinCluster only consumes influence world matrices and bind pre-matrices; the bind pose is data
  you can reset, never a reason to rebuild joints (Fragapane, rfLEBgOEW1A [01:22:26] [01:35:18]).
- Twist joints: first upper-arm and thigh twist at the top stays with the shoulder or hip, twist
  distributes along the bone (antCGi, fGacyVzJGIU [00:20:47]); twist is judged mid-limb, not at
  shoulder and wrist (antCGi, x07USYlvu2o [00:08:40]).
- Model gate: cm, feet at 0, centered on X, frozen, symmetric pieces combined for weight mirroring,
  arms raised enough to paint under (antCGi, e74KphYwMww).

## 11. Disagreements and deciding conditions

| Topic                   | Position A                                                                            | Position B                                                                                                                | Decide by                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Face: shapes or joints  | Shapes plus joint eyes and jaw (antCGi); shape rigs for cinematics (Burton)           | Joint faces for games (Burton); secondary joints for PSD in engine (Rudy)                                                 | Runtime and budget (joints, shapes, influences), need for sculpted detail. Film layers joints on shapes (Burton [01:02:31]).                                                 |
| Smooth vs 100% weights  | Smooth, then shape (Makauskas)                                                        | 100% per section where one joint per section and the rig moves smoothly (Jao eyelids, proxies)                            | Joint density and whether the joints' own motion is smooth.                                                                                                                  |
| Influence cap timing    | Off at bind, paint freely (Jao)                                                       | Hard 2 to 4 for games (Burton)                                                                                            | Enforce the platform cap at the end: Skin Tools Effects tab or `prune_and_limit`.                                                                                            |
| Twist weighting         | Per pose by eye (Makauskas)                                                           | Even, then leave it and shape the mask (Jao)                                                                              | Both reject calculators; Jao's split needs a mask to carry the shape. `chain_ramp` gives Jao's even start.                                                                   |
| Delta Mush              | "Paint free skinning" and shot fixes (Help)                                           | Delete before ML training (Widup)                                                                                         | Whether the smoothing is part of the look you want learned or baked.                                                                                                         |
| Pre vs post corrective  | Pre fixes the base mesh (Help)                                                        | Post fixes one pose (Help)                                                                                                | Is the mesh itself wrong, or must the fix hold in neighboring poses (pre)? Or only the posed result (post)?                                                                  |
| Post target space       | Transform Space: faster, corrections stay within the selected joint's envelope (Help) | Tangent Space: the surface's local vertex frame, not UVs (Help)                                                           | One joint owns the fix: Transform. The fix crosses joints or must follow the surface: Tangent [added reading].                                                               |
| PSD on a driven joint   | Pose Editor defaults: neutral poses at creation (Help)                                | Controller-driven joints: no neutral poses first, controller attributes in Driver Settings, then Add Neutral Poses (Help) | Is the joint moved by IK, constraints or an OPM blend (`S.joint_drive`)? Then the controller order, pose through the controls, and node readers on `dagLocalMatrix` [added]. |
| Pose data               | PSD: extremes first (Help)                                                            | ML: 30 degree steps, 1,500 to 2,000 poses (Widup)                                                                         | Few poses per interpolator vs a learned global approximation.                                                                                                                |
| Vanilla vs layers       | Lock discipline (Jao)                                                                 | Layers remove the bookkeeping (Jao, Makauskas)                                                                            | Layers block classic tools in 2027: script plain clusters, or delete layers before classic operations.                                                                       |
| Topology vs correctives | Rework loops (antCGi wrist, ankle)                                                    | Correctives at a clean hinge (antCGi elbow, knee)                                                                         | Swap topology under identical weights: if it deforms better, it was topology.                                                                                                |

## 12. Measured in this skill's offline tests [added, run 2026-09-24 without Maya]

- Linear skinning at 50/50 weights under a 90 degree twist keeps cos 45 = 0.707 of the radius: the
  mid-forearm section keeps 50% of its area and 71% of its perimeter; dual quaternion keeps 100%
  (`test_mx_skin_offline.py`, `candy_wrap` note).
- 100% closest-bone weights at a 110 degree elbow do not compress any edge: the pieces pass through
  each other (3.9x stretch outside, folds and collapsed faces inside). Edge ratios alone miss that;
  folds and collapsed faces catch it.
- Smoothing the same elbow lowers the worst stretch (3.9 to 1.5) but collapses the inner elbow
  (minimum edge ratio 0.19): at deep bends more smoothing is not the fix; a corrective or volume
  preservation is.

## 13. Gaps (no source in this project)

- FACS shape sets and their combination correctives.
- Film influence counts and film skinning review criteria from a creature TD.
- Hip, groin and buttock specifics (only "lift the foot and watch the bend", groin listed as a PSD
  area, thigh pushing the belly).
- Behavior of the Skin Tools API on a live 2027 install (the Developer Help pages were fetched on
  2026-09-24 and name `ngSkinTools2.api`, but nothing has been imported or run yet).
