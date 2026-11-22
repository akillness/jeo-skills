# Expert notes: retopology, UVs, texel density, bake prep

The depth behind SKILL.md, by expert, with timestamps. Source notes (never edited to fit this file)
are in `notes/uv-retopology/`, `notes/modeling/` and, for the deformation test,
`notes/deformation/`; credentials and URLs in `sources.md`. [added] marks this skill's own
inference.

## 1. FlippedNormals: retopologizing a head with Quad Draw (9N4rG5qHWgk, 2018)

Henning Sanden draws, Morten Jaeger comments; both former senior film character artists (London
VFX).

Order of work

- Big to small, always: "A terrible way to work is to start too small" [00:01:05]; people have
  "thousands of polygons before they even connect them into loops" [00:00:34]. Same rule for
  drawing, sculpting and retopology [00:02:38].
- Landmarks first (nose, mouth, eyes), one area at a time, as big strips: a strip over the brow and
  around the socket, a strip for the mouth, a quad on the nose bridge, a ring around a nostril
  [00:01:36] [00:02:07]. Then main loops at low density: brow, forehead to nose, nasolabial wrapping
  the mouth, jaw, cheek toward the ear [00:02:38]. Then the rest is "a simple puzzle, because we
  already solved the main part" [00:16:31].
- Loose is recoverable, tight is not: "If something is too tight... it's incredibly difficult to go
  in and move the points" [00:02:07]. Do not commit to exact brow cuts early [00:03:09].
- Patches rarely have matching loop counts: add loops until they do [00:17:33] [00:18:05].
- Be lazy where nobody looks: top and back of the head [00:03:09].
- Recenter the middle line periodically: 39 center vertices had drifted to X 0.01; type 0 into world
  X, or the top of the head drifts [00:19:06] [00:19:37].
- Final center pass, mirror with a "pretty low" merge threshold (a high one welds what should stay
  apart), check smoothed (key 3) [00:23:46] [00:25:46] [00:26:20].

Topology rules

- Quads where it deforms; triangles only hidden (inside eye corners, ears, mouth, nostrils) or when
  one saves "five hundred more polygons"; "the absence of a triangle should not be a matter of life
  or death" [00:03:41] [00:05:00].
- N-gons are forbidden: ZBrush triangulates them on import, the model changes, blend shapes break
  [00:05:00] [00:05:31].
- Poles ("stars") are unavoidable where direction changes; place them "where deformation will be
  minimal, or maybe in folds of skin" [00:12:15] [00:12:45].
- Uniform, square polygons, but "always denser around the eyes than on the top of the head"; denser
  around nose and ears too [00:20:39] [00:21:10].
- Same loop count on upper and lower eyelids for nicer blinks [00:21:41].
- Polycount is "exactly as high as needed"; animation assets come with a spec [00:13:46] [00:14:16].
- A clean even base subdivides for resolution instead of adding loops by hand [00:17:02].
- Relax is a tool, not a strategy; clean from the start and you rarely need it [00:11:14].
- Sculpt and retopologize neutral for production [00:08:21].

Automatic topology

- Faces are always done by hand: automatic remeshers are fine for non-deforming parts (cloth
  wrinkles that will not animate), but on faces "it will look normal, but it's not... Don't mistake
  this for a completed topology" [00:09:40] [00:22:13] [00:22:44] [00:23:15].
- Reuse perfect topology: one perfect hand, ear or body transferred to every new model; production
  humanoids start from the company's base mesh [00:10:11] [00:10:43] [00:11:14].

Cavities and non-retopo modeling in the same tool set

- Eye socket border extruded inward into a pouch; nostrils extruded inward as recesses, because "the
  subsurface scattering will behave strangely if you model it as a single shape" [00:24:16]
  [00:25:16].
- Mouth bag: select the lip border loop, scale and shape the lips, extrude inward repeatedly;
  symmetry on; deleting edges or faces can break symmetry [00:26:20] [00:26:51] [00:27:22]. Even
  loops with Edit Edge Flow [00:27:53].
- Triangle clusters: triangulate the patch and delete every other edge to recover quads; one
  leftover triangle is acceptable [00:24:46].
- Why Maya over TopoGun or 3D-Coat for retopo: the general modeling tools are there [00:24:16].

On screen (Maya 2018): Make Live, Quad Draw with Auto-weld 10, Relax Auto-Lock, Extend Edge, Quad
Strip Width 20, symmetry off while drawing (frame f_00045). Hotkeys in gui-paths.md.

Agent translation [added]: the order becomes data: a landmark map and ring counts before geometry;
"reuse perfect topology" becomes `fit_template`; the recenter habit becomes `snap_center` in every
pass; the triangle policy becomes the cavity spheres in `retopo_report`.

## 2. Jessica Dru Johnson: performance topology for animators (ZiYEO49B768, CG Futures 2018)

Senior Cinematic Artist, Blizzard in-game cinematics (StarCraft 2, WoW, Diablo 3, Overwatch). Signal
between [01:10:50] and [01:34:12].

- Topology is production problem solving for the people downstream, "eat your vegetables"
  [01:10:50]; ask riggers and animators; her rules are her pipeline's ("a Disney style... and a
  Pixar style... both are completely valid") [01:11:57].
- Isolation: a loop around every part that must act independently tells the rigger where one control
  ends [01:13:39] [01:14:11]. Face isolation set: whole face, muzzle, mouth, nose, eyes, ears,
  brows; isolate heavy brows so they do not fight the eyes [01:26:20] [01:26:54].
- Consistent parallel loops; a loop "spiraling down the arm" causes artifacts and muddy weights;
  concentric loops let riggers say "this joint affects exactly to here and no further" [01:12:33]
  [01:21:55].
- Avoid shearing: quads should lengthen or shorten with the motion; shearing is a quad moving
  contrary to the motion, flickering between its two triangulations or collapsing; most visible on
  the cheek and jaw side [01:13:06] [01:13:39]. Fix: one loop perfectly flat from lip corner
  straight back to the jaw corner ("I just scale it in Z") [01:30:10] [01:30:42]. She finds
  collapses by playing the rig: bends, thumb and wrist rotations, lid closes, lip seal, jaw open
  [01:20:16].
- Agent translation [added]: the shear score compares each quad's corner angles at the pose with
  rest (topology digest P7 step 5): the largest corner-angle change, skew-dominant when it exceeds
  the largest log edge ratio. Measured offline: on a jaw hinge, quads along the hinge line shear 4
  to 6 degrees on average, a grid turned 15 degrees 16 to 24, turned 45 degrees every quad; on a
  limb, a linear blend shears the inner half of perfect rings anyway (a fifth to a third of the band
  at 90 degrees), so shear convicts face hinges, and limbs are judged by their loops (antCGi,
  section 3).
- Rule of threes at joints: "one edge loop for control, two edge loops for support"; a bend needs at
  least the one [01:15:18] [01:15:51].
- Bony forms get an inset: kneecap, elbow (one extrude around it after the arm tube), knuckles (one
  inset gives three loops, then three loops per knuckle), knee-like isolation per knuckle for a hero
  hand [01:14:44] [01:16:27] [01:17:01] [01:17:34] [01:18:06].
- Thumb: a loop all around plus an inward inset isolates it; without the palm-line isolation it
  "collapses and shears" [01:18:38] [01:20:49].
- Wrist: no fancy topology, one extra loop into the arm tube [01:21:23].
- Shoulder: her animators prefer a plain tube over deltoid isolation and shape anatomy with rig
  controls; the secret is the back: isolate the scapula, the loop runs to the elbow and stops
  [01:24:07] [01:24:41].
- Mouth: concentric circles, a double circle at the lip edge, lengthwise loops meeting at one center
  point so lips seal, modeled flat [01:28:31] [01:29:03]. Eyes like mouths: loops line up so the lid
  closes fully [01:30:42] [01:31:15].
- Engine limits are topology constraints: 4 bone influences per vertex; one extra mouth-corner span
  needed 5 [00:44:17] [00:59:24].
- Standardized base topology: face skinning from three days to 30 minutes plus finesse [00:58:51];
  animators start on temp meshes and transfer [01:08:13].
- Deliver a neutral face (flat lids, flat mouth) even if it "looks super peaceful" [01:00:30].
- Map exotic anatomy onto known joints (wings are arms and hands) [01:22:26].
- Silhouette separates a cinematic from a game character; armor plates can slide, keep the torso
  together for bone budgets [00:44:17] [00:45:27].
- Scope by performance: a background character may get textures and no modeling [01:33:28].

## 3. antCGi (Antony Ward): base mesh, deformation tests, model evaluation

Game-industry veteran, author of Game Character Development with Maya (book verified; the studio
list, Infogrames/Atari and EA, is per the manifest and not independently verified). Sources:
-mWWeFv07SI, QW8w15J00Ok, RlNnp4qQIrU, x07USYlvu2o (#ModelingInMaya), e74KphYwMww (#RiggingInMaya).

- Low to high, always reversible: low-division primitives (cylinders 12 x 8 torso, 8 x 6 limbs),
  loops only when shape needs them (-mWWeFv07SI [00:05:28] [00:18:44]).
- A pole on the chest or any deforming surface kinks: bevel the loop open and reroute (QW8w15J00Ok
  [00:09:58] [00:10:29]).
- Mirror with a custom threshold of 0.001, Border merge, minus direction; automatic thresholds eat
  center topology; after every mirror, hunt stray center vertices (QW8w15J00Ok [00:02:24] [00:02:56]
  [00:03:29]).
- Red symmetry components mean one-sided edits; undo can silently break symmetry (QW8w15J00Ok
  [00:06:09]).
- A Relax error is a topology error: Cleanup (non-manifold), then look for split vertices
  (QW8w15J00Ok [00:13:13]).
- Match loop counts before joining parts; add loops on the sparser part (-mWWeFv07SI [00:27:43]).
- Mouth-corner loop runs higher and back under the cheek and around the side of the head: blend
  shapes need it (RlNnp4qQIrU [00:09:32] [00:23:15]). Upper and lower lids and lips carry the same
  loop count ([00:05:22] [00:12:00]). Lids are modeled over eyeballs placed in the scene, never in
  the abstract: they "need to sit over the top of the eyeballs" (RlNnp4qQIrU [00:08:24]); blink
  loops come later ([00:19:46]): rotating the lid joint moves a sparse lid down "a little flat" and
  it pops through the cornea; more lid loops give a curve over the eye (x07USYlvu2o [00:15:18]
  [00:15:50]). Agent translation [added]: `lid_check` measures lid-to-eyeball clearance at vertices
  and edge midpoints at rest and on a full blink about the eyeball center (chords are what cut the
  cornea; offline, 2 or 3 loops fail while every vertex stays outside, 4 and more pass).
- Neck: build the sternocleidomastoid (clavicle to the back of the skull) into the flow; route
  middle-neck edges into the center line and the clavicle (RlNnp4qQIrU [00:37:43] [00:39:08]).
- Loops run across the wrist and around the ankle, not from the front of the ankle down to the heel
  (x07USYlvu2o [00:11:04] [00:17:37]).
- Separate topology faults from rigger faults: loops along the limb are topology; volume loss at a
  clean hinge is correctives; prove it by swapping topology under identical weights (x07USYlvu2o
  [00:10:27] [00:16:24]). He says both at the elbow: "topology is okay" on the test arm, then an
  updated elbow deforms better with the same weights on the full rig; the deciding test is the swap.
  Knees, elbows and buttocks need correctives and extra joints in the walk-to-run tests, not
  modeling changes ([00:20:21]); the hip crease wants an edge moved across a quad and a pole removed
  ([00:17:03]).
- The deformation test (x07USYlvu2o): test before texturing, even when deformation was kept in mind
  ([00:00:00]); a throwaway chain with a root joint at the center so the body does not follow the
  shoulder ([00:03:34]); bind with Neighbors weight distribution ([00:04:12]); paint in a deformed
  pose ([00:05:16]); floods by vertex selection, then Smooth ([00:05:49] [00:06:57]); twist is not
  judged at the shoulder or wrist, roll joints mid-limb take it ([00:08:40] [00:11:04]); topology
  can be edited on the skinned mesh, then Delete by Type > Non-Deformer History, never History
  ([00:11:37] [00:12:41]); unbind with Delete history, not Bake history ([00:13:49]); face tests
  with joints, because blend shapes break when topology changes ([00:19:00]); look for "surface
  artifacts, pinching or unnatural creases" ([00:18:08]); studios use a ROM file of poses from
  simple to extreme ([00:21:10]); then UVs ([00:22:18]).
- Agent translation [added]: `deform_test` replaces the painted bind with proxy weights computed
  from positions (identical for any topology, which makes the swap test exact), poses a copy,
  measures area ratio, flips, shear and the joint loop against an ideal ring, and classifies each
  bend; `compare_variants` is the swap test. The skinned ROM stays scenario-maya-deformation's. In
  Maya 2027 a hand-made test bind should not initialize Skin Tools layers (the DefTest note;
  maya-version-deltas § 2.3 lists the classic tools they block).
- Model evaluation before rigging (e74KphYwMww): units cm, scale to spec, feet on the floor,
  centered on X, frozen, pivots, eyes looking dead ahead (rotate back, mirror values, freeze),
  topology review with wireframe on shaded (mouth open with a mouth bag, loops around lids and lips,
  edges on muscle lines, no scattered triangles in deforming areas, knuckle loops), relaxed A-pose
  with arms raised and palms down, symmetric parts combined for mirrored weights [00:02:52] to
  [00:25:47]. Relax moves UVs: restore with Transfer Attributes from a backup, UV Sets All, Sample
  space World [00:19:21] to [00:20:38]. Game optimization never justifies sacrificing deformation
  [00:22:50].

## 4. Paul H. Paulino: finding the texel density (iL2iXizf9xM, 2020)

Texture artist (Weta, ILM, Scanline, Method; later Principal Texture Artist at Epic Games).

- The most important input is how close the camera gets; it "must be as accurate as possible to
  avoid redoing some of your work" [00:01:30].
- Two failures: blurred textures (too little) and far more UDIMs than needed (pipeline cost)
  [00:00:00] [00:00:33]. "It's always better to have more than the opposite but... avoid going
  overboard" [00:03:04].
- Method: resolution gate and gate mask, 1920 x 1080 ("call it 2k"), about 85 mm so the lens does
  not distort close up [00:02:02]; frame the reference piece as close as the camera gets; the
  mouthpiece covers about a quarter of the frame, about 500 px, rounded to 512; double it: at least
  1K for that piece in its UV tile [00:02:33] [00:03:04]. "It doesn't have to be 100% perfect, this
  is just an estimate."
- Size the reference shell with Measure (one shell at a time: Measure is unreliable with several)
  [00:03:38] [00:04:11]; check with a labeled checker; Texel Density Get on the reference, Set on
  everything [00:04:44].
- Shells that do not fit a tile get cut across UDIMs [00:04:44]. Mentor Justin Holt's trick: halve
  an odd cloth shell and paint its tile at 8K while the rest stays 4K; density stays consistent and
  the seams follow the real garment [00:05:16] [00:05:48].
- Studio styles differ: fewer UDIMs at 8K or more at 4K or 2K; he prefers more UDIMs, "a personal
  preference" [00:05:48] [00:06:20].
- Resolution test: project a high-res texture and bake at the planned distance (Mari); blurred means
  more density [00:06:33] [00:07:06].
- Agent translation: `density_from_camera` (projection math plus the 2x and power-of-two rule),
  `udim_estimate`, `udim_table` with per-tile resolution, `checker_review` close-up as the Maya
  substitute for the Mari test.

## 5. Maya Learning Channel: UV mapping a game character (s_KLbTUdKms, 2017)

Autodesk official; presenter not named.

- Cut seams in the 3D view, not the UV Editor: "it can be very difficult to see what's going on" in
  2D [00:01:06]. Shift-drag constrains a cut to one loop; Ctrl-drag sews a wrong cut [00:02:37].
- A bad unfold means not enough seams: "it doesn't have enough seams to lie flat yet" [00:02:07].
- Head: neck-base loop, slits along the bottom and top, inside the mouth; Orient to Edges along V
  [00:01:37] [00:02:37] [00:03:10].
- Arms with Symmetry Object X: the loop where the arm meets the shirt, the wrist, a seam along the
  back of the arm through the elbow [00:03:36].
- Straighten UVs on a whole shell rotated ~15° gives "this mess" (it straightens everything within
  30° on a loop); instead align the top border to its highest UV, same for the bottom, pin both,
  Optimize Tool on the interior [00:04:13] [00:04:49] [00:05:19]. "Unwrapping meshes is often a
  balancing act between keeping regular shapes and avoiding too much distortion" [00:05:53].
- Unpin, Symmetrize the other arm by picking an edge on the line of symmetry [00:06:17]. Hands:
  halve and planar-project each half in Y [00:06:17]. Torso seams at the waist and under the
  armpits; legs along the rear and inner leg, boot top, soles [00:07:29] [00:08:05].
- Checker: "as long as the checker map pattern is roughly even around the body, then we're in the
  clear" [00:09:51].
- Layout, then Texel Density Get from the manually sized torso and Set on all; scale the head up
  "since it'll be the focal point"; Layout again with Shell Padding [00:10:22] [00:10:57].
- Stack mirrored shells (arm, hand, boot) after density is set; UV Snapshot for painting [00:11:32].

## 6. Maya 2027 Help: retopology and UVs (saved docs)

Retopology (Quad Draw, Retopologize, Make Live):

- Make Live a reference first; several live objects are allowed; without one Quad Draw snaps to the
  grid. Symmetric Quad Draw only on a 100% symmetric mesh (lamina faces otherwise). Auto-weld has no
  effect while Soft Selection is on. Fix the live mesh's normals rather than relying on Snap to
  Backfaces.
- Retopologize: all quads; organic defaults; hard surface Regularity 1, Uniformity 1, Anisotropy 0;
  Preprocess Mesh (on by default) smooths and loses detail, meant for 100k+ triangle noisy input,
  "not intended for use with low resolution meshes with clean geometry"; Keep Original renames the
  input `<name>_original`; Target Face Count is a target, detail wins; Tolerance under 10% is slow;
  Pause the node while editing several attributes; "Ignoring this step will likely result in
  polyRetopo executing again" (delete history); "You can not perform retopologize on half a mesh";
  feature preservation by hard edges (too many make it very slow), edges by angle (ignores explicit
  hard edges within the tolerance) or edge component tags (comma lists, `<name>*` wildcards; with
  Keep Original, tag edits update the result live).
- Preparing: Separate, soften all but full feature loops, Cleanup (more than 4 sides, concave,
  holed, non-planar, lamina, non-manifold, zero-length edges, zero-area faces, invalid components),
  split faces with non-consecutive duplicate vertices, Merge with a tiny threshold, Remesh to even
  the spread, delete history. Scans: internal faces make non-manifold vertices and the Cleanup/Merge
  loop; watertight required; Fill Hole on non-manifold geometry makes it worse; scanners mark all
  edges hard. UVs (UV mapping tips, UV Toolkit, Unfold3D, Layout, Texel Density):
- Three strategies. Heavily optimized (real-time): density varies a lot, stretch "on purpose where
  it's needed", mirrorable shells stacked, shells straight along U or V, odd shapes cut, border
  shells straightened to pack; mobile may collapse a shell to a line (gradient) or point (flat
  color). Technical (pre-rendered): "all your shells have the same Texel Density", eradicate
  stretch, multi-tile; procedural textures may make UVs unnecessary, check with the art director.
  Continuous (organic characters, trees): fewer seams, preserved density.
- Optimizations: start uniform, then scale by visibility and distance (FPS iron sights highest);
  stacked shells receive the same AO; keep a logo unstacked (even add geometry to cut it out); cut
  the mesh in half before layout to ease symmetry mapping; largest and oddest shells first; 2:1 or
  4:1 maps are fine; memory cost = channels, pixels and above all map count; atlases for
  environments.
- Shell spacing: 2 px to the border and 4 px between shells on the final texture; "every LOD/Mipmap
  step requires double the shell spacing": 2048 used down to 512 needs 16 px between shells and 8 px
  to the border.
- Unfold3D is the default; unselected UVs pinned automatically (Legacy pins selected only); refuses
  non-manifold; receives a triangulated mesh (non-planar faces can create hidden non-manifold cases:
  triangulate and run Cleanup in select mode to find them). Room space default 2 px: "avoid
  increasing this value past its default" (slow, distorting). Very high Iterations can give
  undesirable results. Organic shapes suit unfolding; walls and bottles are better planar or
  cylindrical.
- Layout: Packing Resolution 256, Iterations 1, Rotation Steps 90, Shell Pre-Rotation and Pre-Scale
  options, Padding in pixels or UVs, Shell Distribution Distribute (Tiles U, V) or Shell Centers,
  Scale Mode Uniform (default), Non-Uniform, Off. Fur needs non-overlapping UVs.
- Texel Density: Map Size first ("used to calculate the texel density base value"), Get, Set.
  Measure: U, V, Pixel Distance (several map sizes), Angle Between.
- Symmetrize cannot create UVs; it needs an edge on the line of symmetry. Lightmaps: duplicate the
  set, uniform density, Unstack, cut and unstack again if overlaps remain. Transfer UVs from a
  smoothed duplicate (Average Vertices) to map wrinkled meshes.

## 7. On Mars 3D: high to low poly (YDu9pYMkkSM, 2021, Maya 2020)

Aunmar Mohammed, games artist (self-reported credits, unverified).

- Protect the silhouette first; every kept edge shapes the outline, supports a bake on curvature, or
  serves the UVs [00:01:16] [00:06:54] [00:23:06].
- Budget from screen coverage before optimizing: hero grenade seen large, target about 25k tris (20k
  great, push at 30k); secondary at 10 to 15% of the screen much less; background 5k to 10k;
  "polygons" in captions is roughly half the triangle count [00:03:47] [00:04:21] [00:04:55]
  [00:21:31].
- Derive the low from the SubD cage: duplicate, strip holding loops and bevels, keep silhouette
  edges [00:05:18] [00:05:50].
- Triangles are "completely fine" to terminate loops [00:10:29].
- Round high corners need a radius of real edges on the low; two to three edges were too few
  [00:12:50] [00:25:29].
- Subdivision shrinks the surface; Deform > Shrink Wrap the low onto the high and the bake needs no
  custom cage [00:14:31] [00:17:45] [00:18:16].
- Checks: flat-black silhouettes (Use All Lights with no lights) and contrasting materials on
  overlapping high and low [00:01:16] [00:07:27]. Agent translation [added]: `overlap_review`
  renders both silhouettes from the same cameras and writes a diff image (red where the high pokes
  out of the low), with the differing-pixel share per view.

## 8. Polycount wiki: topology, poly count, normal maps, UVs

Community reference (Eric Chadwick, Joe Wilson and others).

- "Poly count" means triangles; vertex count matters more: UV seams, hard edges and material changes
  duplicate vertices; a hard edge on a UV seam costs nothing extra.
- For most meshes, "the best results usually come from adding hard edges where ever there are UV
  seams"; mechanical bends over about 45° get hard edges.
- Triangulate before baking and export that triangulation; mirror the triangulation too.
- Mirroring: lay out one half, mirror and weld, move the mirrored UVs exactly 1 unit (or any whole
  number), "use the complete mirrored model to bake the normal map, not just the unique half";
  center mirror seams show, offset mirroring hides them.
- The closer the low's shape to the high, the better the bake; keep the low contiguous; floaters for
  normal maps, a separate non-shadow-casting object for AO.
- UV readability: islands upright, recognizable, panels on pixel rows; straight shell borders help
  LODs; pad enough for downsampling; UDIM is film and TV, not games.
- Poles make dimples when subdivided: flat areas away from deformation. Density where curvature is.

## 9. Supporting modeling sources

- Mario Elementza (_bpsEd_5IW4, hard surface): adjacent quads never double in size ("minimal is fine
  as long as it's not double") [00:08:31]; minimum density = the narrowest feature [00:17:19];
  cylinders in multiples of 4 sides aligned to cuts [01:12:04]; cap revolution shapes with quads
  [01:14:16]. Use when judging Retopologize output on props.
- Pixar OpenSubdiv tips: regular faces, few extraordinary vertices, triangles and pentagons "used
  sparingly", avoid high valence (GPU hard limit about 27). Use for film cages that subdivide at
  render.

## 10. Disagreements and the deciding condition

| Question                           | Positions                                                                                                                                                                                         | Decide by                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Triangles                          | FlippedNormals: hidden triangles fine in cavities or to save hundreds of polygons, never on deforming areas; antCGi converts every one on a sculpt base; On Mars and Polycount: fine on game lows | deforming region or cavity; sculpt base, subdivided cage or triangulated game low |
| Manual or automatic topology       | Maya Help offers Retopologize for whole meshes; FlippedNormals only for non-deforming parts, never faces                                                                                          | does the part deform, and is it seen close                                        |
| Uniform or varied density (retopo) | FlippedNormals uniform but denser at eyes, nose, ears; Retopologize Face Uniformity 0 adaptive to 1 uniform                                                                                       | deformation and shape complexity per region                                       |
| Deltoid isolation or tube shoulder | Jessica's animators prefer the tube and rig controls; other pipelines isolate anatomy                                                                                                             | what the rig does: shape by controls, keep the tube                               |
| Uniform or varied texel density    | film and technical: one density (Paulino, Maya Help); games: uniform, then bias the focal shell (MLC)                                                                                             | pre-rendered vs real-time and the texture memory budget                           |
| Stacking mirrored shells           | games stack (MLC, Maya Help); film does not (every surface unique) [added inference]                                                                                                              | unique bakes, AO differences, logos                                               |
| Seam count                         | game character: many seams by body part so shells straighten and pack (MLC); continuous organic: as few as possible (Maya Help)                                                                   | painted in 3D (few seams fine) or packed tightly (straight shells)                |
| Fewer 8K UDIMs or more 4K/2K       | studio preference; Paulino prefers more tiles, avoids 8K for speed                                                                                                                                | studio pipeline; artist speed                                                     |
| Topology rework or correctives     | antCGi: loops along the limb are topology, volume loss at a clean hinge is correctives                                                                                                            | swap topology under identical weights                                             |

## 11. What the tutorials show that is different in Maya 2027

- Maya 2018 UI and the "sRGB gamma" view transform (FlippedNormals, Paulino): 2027 uses OCIO v2 ACES
  defaults; the Quad Draw concepts and options are unchanged.
- "UV Texture Editor" and "Create UVs": now the UV Editor, UV Toolkit and UV menu; the UV Toolkit is
  standard, not "new".
- Relax is Optimize > Legacy (relax); Unfold3D is the default for Unfold, Optimize and Layout.
- Not in the videos: Retopologize (`polyRetopo`), Remesh, Flow Retopology (cloud, included from 2026
  with 50 jobs per month, Mesh > Flow Retopology from 2027.1, sign-in and network).
- Texel Density needs Map Size first; Measure has Pixel Distance.
- ZRemesher (FlippedNormals' automatic example) is ZBrush, not Maya.
- Deform > Shrink Wrap (On Mars) still exists; this skill uses closest-point projection instead
  because the deformer's attribute names are unverified [added].
- Not in the videos, useful for a broken source: Mesh > Booleans Volume mode with a Voxel size
  (2026) rebuilds a watertight mesh from a voxel volume (it needs a second input); Mesh > Remesh
  evens the spread before Retopologize (maya-version-deltas § 2.1; Maya 2027 Help, Preparing a
  mesh).
- Deformation test in 2027 (antCGi's lesson predates it): once Skin Tools layers are initialized,
  Paint Skin Weights opens Skin Tools and classic tools such as Mirror, Copy and Normalize Skin
  Weights are blocked; the DefTest note advises leaving layers uninitialized on a throwaway bind so
  the classic tools and `skinPercent` floods keep working; Smooth Skin Weights uses the Skin Tools
  algorithm by default and errors on a multi-layer cluster; Rigid Bind menus are gone; `dgaTension`
  (2026.3) gives per-vertex stretch against a reference mesh, visualized by `dgaVisualizer`
  (maya-version-deltas § 2.3; What's New in Maya 2026). Arnold `normal_map` gained a MikkTSpace
  tangent mode in MtoA 5.6.1.1 (maya-version-deltas § 2.5), so the bake package names its tangent
  basis.
