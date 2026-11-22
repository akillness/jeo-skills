# Expert notes: posing and 3D print

Principles and judgment by expert, with source and timestamp (`[hh:mm:ss]` in the video; doc
sections by page). Source notes live in `notes/posing/` and `notes/3d-print/` of the project; the
batch digest is `notes/posing/_digest_print_pose_render.md`. `[added]` marks this skill's own
translation for an agent without a mouse.

## Paul Gaboury (Pixologic, then Maxon, product lead; freelance toy artist for Hasbro, Disney Consumer Products, Topps), "Using ZBrush for 3D Printing", Gnomon 2020 (W9P5YmLGBj0)

- **Bounding box first.** "The number one thing if you're going to make something physical... I
  personally like to always have a bounding box" [00:21:43]. The box at the client's size stays
  SubTool number one; toggle it to see if anything clips out of the product or package box
  [02:04:45] [02:08:31].
- **Resize everything in one step.** Existing sculpt: Set Scene Scale reads the size, declare the
  unit, New Bounding Box SubTool, R on, type the new height, Resize SubTool with All [00:38:39]
  [00:41:05]. Clients shrink products late for cost: 6 in with 15 points of articulation became 4 in
  with 8 [00:39:26]; one penny per unit is real money at 500k to 1M units [02:09:04].
- **Default world is about millimeters**: the default cube reads 0.99 per side in Set Scene Scale
  [00:30:59].
- **Transpose line as a caliper** after Scale Master: major and minor ticks in the chosen unit, set
  in Preferences > Transpose Units; the line snaps to points [00:34:29] [00:35:13]. (This install
  logs Minor Ticks 10, Major 1, Calibration Distance 0.25, Units Scale 1.)
- **DynaMesh resolution is per side of the bounding box**, so it is relative to physical size
  [00:58:07] [01:01:53].
- **Hollow a light copy.** "Even for my hollowing out when I have a mesh that is 9 million, I don't
  try to hollow out that 9 million polygon mesh" [00:57:33]. Duplicate, DynaMesh 64 (too low) then
  128 (enough for a 9 in car) [00:56:58], one polygroup, a negative IMM cylinder pulled away from
  the surface so it leaves no hole, Create Shell [01:03:10] [01:05:29]; Thickness 4, then 6 for a
  thicker wall [01:10:32]. Auto Groups separates outer and inner shells, Split Groups, keep the
  inner, Polish it [01:12:44] [01:14:58], and use it as a Live Boolean subtract so the outer car
  stays untouched [01:13:48]. Do not shell thin ends: delete the inner shell there [01:15:30].
- **Cups and vents.** Slide a cutting cube through the Live Boolean like the slicer's layer slider;
  any cup is a vacuum risk on SLA: add air holes [01:34:49] [01:35:21].
- **Split for the bed**: the car body did not fit the Form 2, so two pieces with snap joints; glue
  only guarantees a clean seam [00:46:40] [00:49:27]. Snap joints double as alignment keys even if
  you glue [00:46:40].
- **Snap joint build**: IMM cylinder at the cut plane, Split Unmasked Points, Dynamic Subdivision
  with Crease tolerance 45 degrees, ZModeler loops to taper; SmoothSubdiv 4 with Crease Level 3
  gives a small fillet, equal values give razor edges [01:41:41] [01:44:55]. A slot cut in the male
  peg gives flex (deeper = more give) [01:47:38]; the socket gets play with Inflate 10, then a
  second Inflate [01:51:32]; test print in the target resin before the full job [01:53:10].
- **Stay non-destructive**: sources in folders, cut with Live Boolean start groups, Boolean Folder
  only at the end; "all the individual meshes before the booleans come together are still all
  separate" [02:05:48].
- **Decimation by eye**: "Usually a million is more than enough per mesh... I bring stuff all the
  way down to like 20,000 triangles, 10,000 triangles and it holds up really well" [01:11:40]; "If
  there's nothing changing on the model visually then it's not going to print out any differently"
  [01:12:12]. Example: 2.7M to 545k at 20 percent, no visible change [01:22:53]; 8k on a detailed
  sphere is faceted [01:28:19]. Mask regions before Decimation Master or Tessimate to keep density
  there [01:30:30] [01:32:07]. Some slicers cap polycount or file size (example 50 MB) [01:11:40].
  Decimation Master caches grow to many GB; Delete Cache at Startup is on by default [01:22:20].
- **Only ZBrush and PreForm** for any print job [02:07:25].
- Agent translation [added]: the height becomes an export scale (`set_export_scale`, the state Scale
  Master's Resize with All plus Unify leaves: real size in the Export Scale, doc); the bounding box
  stays a SubTool (`brief_box`) gated by `zb_print.envelope`; the caliper becomes `zb_print.caliper`
  (ends snap to vertices, as the line snaps to points), `check_scale` and `thickness`; the shell
  chain becomes `hollow_copy` (copy moved to the end so MergeDown takes the insert),
  `keep_inner_shell`, a Live Boolean subtract and `outer_drift`; the joint test print stays
  physical; the cup preview stays a slicer check.

## Paul Bennett (Hasbro sculpture department, Star Wars Black Series), ZBrush Summit 2019 (P08kuTIRziE)

- **Every sculpt is a product for injection molding**: undercuts, walls, tooling and plastic shape
  it from the start [00:01:12]. About $10,000 per tool, about $100,000 of tooling for one 6 in
  figure [00:02:13].
- **Walls**: "You really don't want to go any lower than a millimeter" [00:10:57]; 0.85 mm at the
  shoulder was flagged and fixed by inflating inward, taking volume from the hidden shoulder ball:
  "Fix it, but don't change it from the outside" [00:16:46]. Edges at least 0.5 mm after trimming
  [00:48:28]; about 0.2 mm floats away on the Formlabs tray [00:11:31]. Short shots: features too
  small for plastic to fill [00:03:21].
- **Offsets**: "For something like Formlabs we generally look at it like a 0.12 millimeter offset on
  most things" [00:37:55]. He duplicates the part, Inflates it, measures with the Transpose line
  until it reads 0.12 mm (Inflate 2 in his ZTool, 1 gave about half) and uses it as the cutter
  [00:53:04] [00:56:20]. Appending into a ZTool with another unit space breaks the calibrated value
  [00:56:51]. Without offsets, "20 discs to sand" [00:37:55].
- **Scale**: actor height / 12 plus 4 percent for a 6 in figure (PVC shrink), / 18 for 3.75 in
  [00:12:54] [00:17:51] [00:57:52]; say which scale a file is at when trading files [00:17:51].
  Height read with 3D Print Hub Update Size Ratio: 151.6 mm [00:17:17].
- **Articulation is spheres and cylinders**: "All articulation, all of it, boils down to either a
  sphere or a cylinder" [00:07:36]. Primitives at the dead center of the sphere so the Gizmo rotates
  about the right axis [00:40:08]; pegs into "the meat", mushroom heads so they cannot pull out
  [00:40:42]; a backstop against hyperextension [00:45:09]; elbow over 90 degrees minimum, 115
  target [00:08:40] [01:06:02]; double joints give range but can look "run over by a truck"
  [01:06:33]; pilot holes for prototype pins [01:18:03]. Factory ball joints trap the ball nearly to
  the stem: thinner stems keep range [01:03:51].
- **Decimate high-res parts almost immediately** once happy, then engineer on the decimated mesh
  with Live Boolean or polygroups [00:25:28]. Keep Live Boolean hierarchies to one or two operations
  [00:47:15].
- **Molding checks that also help prints**: touching fingers make a closed loop the mold cannot
  release [00:19:34]; hair as a separate keyed part for undercut detail, flyaway strands fused
  because of minimum wall [00:20:41]; Group Front from the view of one mold half shows the parting
  line [01:24:32].
- **Sculpt the standing pose the toy ships in**, likeness first, joints cut after [00:19:34]
  [00:33:06]. Camouflage joints: pull the costume over, project the cloth detail onto the disc
  [00:45:42] [01:12:39]. Collisions show with Polyframe fill colors or flipped normals [01:09:16].
  Axis memory: switch to the Transpose line before changing SubTool, the Gizmo then adopts the
  line's position [01:10:26].
- **Detail at real size**: viewed at the figure's size, detail that cannot be captured at 6 in
  (eyelashes) is backfilled or left to deco (tampo or inkjet) [00:09:47] [00:36:15]; the Move brush
  with Backface Masking thickens an edge without disturbing the inside surface [00:51:53].
- Agent translation [added]: primitive pegs are sized exactly with Geometry Size sliders (clearance
  = 2 x 0.12 mm on diameter), and the offset is measured with `zb_print.clearance` instead of the
  Transpose line; Inflate calibration stays for sculpted cutters; "don't change it from the outside"
  becomes the `outer_drift` gate on every wall fix.

## Alex Carratala (sculptor of about 90 mm collectibles, Kimera Models), 80.lv interview 2023

- Pose at the very start on a mannequin with clay chunks; "A good silhouette is the result of proper
  posing, not something you can work on upfront" (Tips on Silhouettes); zero symmetry except mech
  parts and props (step 3).
- Keep shapes sharp and raw, smooth at the very end (step 4); sculpt with the cuts in mind (step 5):
  "I cut the piece, decimate every part resulting, I scale the model into real scale, and send them
  in STL to the client" (step 6). Kits range from 7 to more than 32 parts; price the engineering
  stage separately (Rules and Intricacies).
- Over-sculpting for the scale is the usual failure: remind yourself of the final size daily (Rules
  and Intricacies).

## Pablo Munoz Gomez (concept and character artist, Pablander Academy, ZBrushLIVE), "A very cool trick to pose characters in and outside ZBrush" 2021 (oxyKKr4aHPY)

- "The proper method is to go to the lowest subdivision level" [00:07:44]; "What you want to achieve
  in the posing stage is as little distortion as possible" [00:08:49]. Wrong way at level 5 with a
  careless mask: stretched and overlapping polygons, seen with Polyframe, fill off, Skin material
  [00:06:40].
- Mask, BlurMask several times [00:04:26], unlock the Gizmo pivot with Alt, place it at the joint
  [00:05:00], rotate, then Smooth and Move the transition before clearing the mask, flip the mask
  and do the other side [00:07:44] [00:08:16]: the order matters, the mask protects the rest of the
  limb while the seam evens out. Bent arms bulge, stretched ones do not: re-volume after [00:09:55].
- Beyond a few SubTools, masking each is "very boring": Transpose Master [00:13:26] [00:14:00]. In
  the TPose mesh, Auto Groups gives one group per disconnected piece, so hard-surface plates are
  isolated, inverted and masked whole, then the rest is shown and refined [00:15:37] [00:16:14]
  [00:16:46]: the plates move rigidly with their segment instead of being cut by the bend. Move
  Topological (B, M) moves only the connected piece under the cursor and clears intersections
  between pieces [00:17:24] [00:17:56]; missing groups are made by hiding edge loops then Auto
  Groups [00:18:30]. TPose>SubT transfers "in two seconds" and every level keeps its detail
  [00:21:51].
- **External pose** [00:25:28] to [00:44:44]: export level 1 as OBJ, rig in Mixamo or pose bones in
  Blender, export only the mesh with modifiers applied, then on a clone at the highest level: new
  layer (records), level 1, Import. "You must use the same mesh or the same object you exported"
  [00:39:55]; importing at the wrong level replaces the SubTool and kills its levels [00:40:59].
  Layers only record at the highest level [00:45:23]; layers interpolate linearly, so refine detail
  on a pose-only layer [00:50:20]; one layer per pose lets a studio compare poses in one file
  [00:50:54].
- Agent translation [added]: this is route A of the skill, with `same_order` and the point guard in
  `import_pose` replacing "hope it matches", and `rigid_delta` checking each bone angle. Auto Groups
  becomes `zb_print.loose_pieces` on the export (the Grps segment groups survive), rigid weights to
  one bone per piece, and the gates `rigid_pieces` and `follows`; Move Topological becomes
  `piece_interference` plus a nudge in the rig plan or a synthesized Move Topological stroke; the
  seam cleanup under the mask becomes a Corrective Smooth on the joint bands in Blender, or Polish
  while a mask is still on.

## Michael Pavlovich (Director of Character, Weapon and Vehicle Art, Certain Affinity; ZBrushLIVE), "Proxy Pose ZBrush 2023.1 with ZSphere Rigging" (irnuxmVuF1Y)

- For organic meshes a ZSphere rig behaves like smooth bind and saves most masking [00:00:31]. Proxy
  Pose with defaults on the heavy DynaMesh [00:00:00]; Make PolyMesh3D gives an exact copy with the
  same vertex order [00:01:03] [00:08:00].
- Rig: root at the hips, a very small draw size so one ZSphere does not grab its neighbors
  [00:02:01] [00:02:32]; "The location of the ZSpheres is more important, because that is where
  their active influence is" [00:03:36]. Separate skull and jaw, an extra neck sphere, stop at the
  wrist for a character and use masks for fingers [00:04:38] [00:05:41].
- Select Mesh picks the copy, Bind Mesh [00:08:00] [00:09:02]. Test every chain: lats pulled by the
  arm (add chest ZSpheres off the spine), tail stretching with the legs (add a tail chain), missing
  wrist [00:09:33] to [00:12:50].
- Pose from the center, parents first, balance and weight, then wrists, fingers, jaw [00:13:26]
  [00:14:29]; "Overall, I just stick to the rotations" (moving or scaling bones stretches
  non-uniformly) [00:13:58].
- Adaptive Skin Density 1 and DynaMesh Resolution 0 keep the bound vertex order; Overwrite Pose
  picks the only mesh with a matching order; exiting Proxy Pose puts the pose on the high DynaMesh
  [00:15:50] to [00:16:53]. "The order of the vertices is very important. You must not violate it"
  [00:08:31].
- Agent translation [added]: the SDK's `add_zsphere` / `set_zsphere` inside `edit_zsphere` place
  joints by numbers (joint centers from polygroup borders) and forward kinematics rotates chains;
  whether a bound mesh follows is live_p02.

## Marco Plouffe (co-founder and art director of Keos Masons; sculptor for Sideshow, Prime 1, XM Studios), Outgang excerpt 2022 (lakCNFUOQlI)

- Pose the blockout early (1 to 2 hours), polish in the symmetrical A pose, final pose last (1 to 3
  days with fixes) [00:14:44] [00:26:18]: "I see a lot of people posing characters and the pose
  destroys the entire work" [00:25:45]. Pose the connected central section first, then everything on
  top of it [00:26:51].
- Blockout on one SubTool, polygroups per section (even the foot), three polypaint tones for layers
  of the design [00:09:14] [00:15:59]. In Transpose Master, group all armor plates of a segment
  together, the anatomy under it in its own group, subgroups for thigh and tibia [00:27:24].
- **Equal lowest-level resolution**: press All Low, compare the square sizes of parts that move
  together, delete a lower level or go up one to match [00:28:30] [00:29:36], because "The spread of
  the blur depends on the size of your polygon" [00:30:08]. Better: paint the mask by hand with
  light pressure (falloff independent of density) [00:30:41].
- Plan mechanical joint axes with helper "calculation meshes" before posing [00:31:44]. "Just keep
  your primitive shapes unstretched... a lot can actually be bent and stretched and you're not going
  to see it" [00:33:55]; re-place IMM bolts on the bent surface [00:33:23].
- Final viewing distance decides subdivision [00:18:51]; polished focus areas next to rough ones
  [00:23:15]; hidden areas get first-try design [00:23:48]; a series of statues must read as a
  lineup [00:07:34].
- Agent translation [added]: `preflight_tpose` reports the level-1 edge-length spread; hand-painted
  gradient masks are the one expert technique here the agent cannot reproduce, so equalizing density
  matters more for it than for Plouffe.

## Maxon documentation (ZBrush 2026 online help, pages from 4R6 to 2023)

- **Posing** (`sources/docs/paint-pose-render-print__posing-transpose-master-zsphere-rig.md`): Gizmo
  topology masking with Ctrl-drag (auto-blurred, best on clean topology); in Gizmo mode Ctrl+click a
  polygroup masks everything else; Transform All Selected SubTools with Ctrl+Shift+click selection;
  action line with Shift for 15 degree steps; TPoseMesh warnings: "Make sure that no SubTools are
  partially hidden" (Vertex Mismatch) and "It is best to avoid using the Gizmo3D modifiers to pose
  your model as the point order can be changed" (SubTools destroyed on transfer); Transpose Master
  options Grps, Layer, ZSphere Rig, StoreTM and PasteTM Rig; data saved in the ZPR since 4R6, so
  save the project to continue posing next session (Saving/Loading); clean project tip: save the
  tool as ZTL, load DefaultCube.ZPR, Load Tool, then pose, which avoids transferring onto the wrong
  model when parts of it also exist as separate tools (Tips; the 2026.2.1 install has
  DefaultProject.ZPR and Cube.ZPR, not DefaultCube.ZPR, local check); Expert Tip: for dense meshes
  without levels, ZRemesher, levels and projection first. Proxy Pose: Reduction Amount, Keep Details
  (set before entering), Polish, Freeze Border, Keep Current, Overwrite Pose, Proxy Groups.
- **3D print** (`sources/docs/paint-pose-render-print__3d-print-hub-scale-decimation.md`): "ZBrush
  does not natively work with units"; "The STL file format maintains scale but doesn't internally
  specify units"; preparing the model (watertight, outward normals, polycount, supported, no fragile
  ropes, hollow and cut to save cost); Scale Master (Set Scene Scale converts to mm, Unify to XYZ
  Size 2 with the real size in the Export Scale, Resize with All, New Bounding Box Subtool, Export
  to Unit Scale); 3D Print Hub (Update Size Ratios, size basis visible SubTools, Use Size of
  Selected Subtool, Move Bounding Axis to Origin, STL binary default, VRML carries color, OBJ
  textures only, Export to Separate Files); PolyPaint From Thickness (Min 1, Max 5 once scaled; red
  under the minimum; fix with Inflate or ClayBuildup with Backface Masking); Draw Draft Analysis and
  MaskByDraft; Decimation Master (unique names, pre-process then decimate, 40 to 100 percent near
  identical, masks move density not count, polygroups lost, caches, per-SubTool quality).

## Where they disagree, and what decides

| Choice                 | Option A                                                             | Option B                                                                                                            | Deciding condition                                                                                         |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| When to pose           | first, on a mannequin, no symmetry (Carratala)                       | A pose polish, blockout posed early, final pose last (Plouffe); standing pose forever for articulated toys (Hasbro) | static miniature where the pose is the design, versus a many-part statue, versus a toy that ships standing |
| Keep symmetric editing | pose on a 3D Layer, detail on a neutral layer (Munoz Gomez)          | pose baked, asymmetric finishing in the pose (Plouffe)                                                              | alternate poses or late symmetric edits wanted                                                             |
| Posing engine          | Transpose Master on SubTools with levels (Munoz Gomez, Plouffe, doc) | Proxy Pose plus ZSphere rig on DynaMesh (Pavlovich)                                                                 | does the sculpt have levels and several SubTools?                                                          |
| Rig                    | in ZBrush masks                                                      | external auto-rig and bones, imported on a layer (Munoz Gomez)                                                      | extreme or many poses, numeric control; for this agent, route A by default [added]                         |
| Mask softness          | BlurMask passes (Munoz Gomez)                                        | hand-painted gradient (Plouffe)                                                                                     | mixed level-1 densities favor painted masks; the agent equalizes densities instead [added]                 |
| Decimation depth       | about 1M per mesh, down to 10k to 20k if unchanged (Gaboury)         | a fixed point budget per SubTool (a ZBrushCentral user: 75k)                                                        | slicer caps, print scale, FDM versus resin                                                                 |
| Hollowing              | Create Shell on a 128 copy, inner shell subtracted (Gaboury)         | in the slicer (Gaboury concedes Cura works [01:19:03])                                                              | designed drain and vent placement, thin ends solid, client wants hollow files                              |
| Wall number            | 1 mm floor (Hasbro, doc example)                                     | Create Shell Thickness 4 to 6 (Gaboury)                                                                             | Gaboury's number is DynaMesh-relative: convert by measuring                                                |
| Joint                  | single elbow, about 115 degrees                                      | double elbow or knee, more range                                                                                    | looks versus range and pin space (Hasbro)                                                                  |

## Agent additions used in this skill [added]

- Export scale as the dialog-free scale route, gated by the OBJ height; `#Auto scale` header
  equality across parts.
- Wall and feature thickness by ray casting on the OBJ (the Ray method; ZBrush's own From Thickness
  offers Ray and Ball in 2026.2.1) with thin spots clustered for the review.
- Clearance measured between peg and socket exports; Inflate calibration as a least-squares slope
  with a linearity check.
- Keys at the section's pole of inaccessibility; two keys on elongated sections; peg length bounded
  by the socket side's depth minus the wall.
- Balance as center of mass over the footprint's convex hull (a proxy for Plouffe's "steady on its
  feet").
- Joint centers from polygroup borders; per-segment rigid fits (Kabsch) to check angles; edge-length
  ratios to find stretch.
- Sealed-cavity detection from shell orientation; for resin a failure until a drain exists.
- Refactor pass 2026-09-24, after the Z5 blind grade: a point-order guard before TPose>SubT
  (face-list hash of the rest and posed TPose exports), `clean_project` and `save_project`, loose
  pieces and rigid-piece checks, `follows` (a carried part against its carrier's transform), a full
  rigid placement (three one-axis rotations plus a measured translation), `piece_interference`,
  `brief_box` and `envelope`, `caliper`, `hollow_copy` and `keep_inner_shell`, `outer_drift`, masks
  before Pre-process.
