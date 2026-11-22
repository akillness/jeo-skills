# Expert notes: retopology, projection, UVs, maps, scale, export, cleanup

The depth behind the SKILL.md stance, by expert, with source and timestamp. Distilled from
`notes/retopology-uv/`, `notes/maps-export/`, `notes/pipeline/` (and their two digests); version
facts from `sources/zbrush-version-deltas.md`. `[added]` marks this skill's own synthesis.
Timestamps are `[hh:mm:ss]` in the named video.

## Joseph Drust (Pixologic, then Maxon; #AskZBrush presenter)

ZRemesher control (0TlG4Ex9lQA, 8D-xqasgUws, IpTYcGxxsdM, Kjce71jjWJU, N1WABlp45ts):

- ZRemesher silently obeys the scene state: only visible polygons are remeshed, and with symmetry on
  it remeshes half and mirrors it, "an implicit Mirror and Weld" [Kjce71jjWJU 00:01:11 to 00:02:07].
  The posed Earthquake came out with both arms matching. Check symmetry before every run on posed,
  scanned or asymmetric input.
- Polygroups are his preferred steering, over guide curves: "exactly the process I usually prefer"
  [IpTYcGxxsdM 00:04:02]. Clean borders come from Slice Curve or Edgeloop Masked Border (a mask
  becomes a group with support loops) [IpTYcGxxsdM 00:05:08].
- Keep Groups hides a Smooth Groups slider at 1 that rounds group borders; 0 holds them exactly, 1
  is right for ragged DynaMesh groups [8D-xqasgUws 00:02:17 to 00:03:25].
- Curves from groups: Stroke > Curve Functions with Border and Creased off, Polygroups on, Frame
  Mesh, then Keep Groups OFF and Curve Strength 100 [8D-xqasgUws 00:03:41]. Curve Strength 50 is the
  default; 100 puts loops on the curves [IpTYcGxxsdM 00:02:56].
- Iterate: aim low (Target 1, about 1,000 polygons, on a head), then Half, then fix the few badly
  served features by hand rather than raising the count [N1WABlp45ts 00:01:25 to 00:02:32].
- Partial remesh: hide all but the region, Freeze Border on, ZRemesher: the patch connects cleanly,
  but the subdivision levels are removed [0TlG4Ex9lQA 00:01:51, 00:02:26].

Reprojection (R2MzFqWMaWY, _ips3GhWI0s, nxMYYsyJt3o, NrsuP4Vj4Lg):

- Duplicate, ZRemesh the copy, divide once, Project All with only the two visible, repeat per level
  until the top is near the source count [R2MzFqWMaWY 00:02:16 to 00:03:52; _ips3GhWI0s 00:04:53].
- Dist 0.1: "usually 90% of the time just changing this distance slider here to 0.1 ... will often
  give you the result" [nxMYYsyJt3o 00:02:19].
- StoreMT before projecting; remaining spikes mean the target sits under the source. Morph-brush
  them back, raise the target with a big ClayBuildup until it engulfs the source, reproject, or
  reproject masked areas only (faster) [nxMYYsyJt3o 00:02:52 to 00:07:11].
- Geometry first, polypaint only at the last level with polypaint enabled on the target; answer No
  to the "no polypaint" note on geometry passes [_ips3GhWI0s 00:05:25 to 00:06:29].
- Decimation gives triangles for print and bake files, never rig-ready quads [_ips3GhWI0s 00:00:35].
  The level-1 ZRemesher mesh is also where UV Master can work [00:07:03].
- Freeze SubDivision Levels at the top level unlocks ZModeler, DynaMesh and ZRemesher on a
  subdivided sculpt; pressing it again rebuilds and reprojects [NrsuP4Vj4Lg 00:01:17 to 00:02:26].

Maps (n0qqpwvn-jA, 2zDAtaQqwh8, RYGkbSUaHHg, ADIRhNlvXbI):

- ZBrush maps compare the selected level with the highest level of the same SubTool: "you can't have
  a subtool that is your low resolution version and then a subtool that is your high resolution
  version" [n0qqpwvn-jA 00:01:14].
- The low level filters the content: level 1 against 6 gives wrinkles and forms, level 5 against 6
  only pores and stitching [2zDAtaQqwh8 00:02:53 to 00:04:00].
- Color ID from polygroups needs Unweld Groups Border on low poly meshes, or colors bleed across
  shared vertices [RYGkbSUaHHg 00:03:24].
- HD Geometry exports only what Sculpt HD preview shows; isolate polygroups first; Duplicate in HD
  preview converts HD levels to regular levels [ADIRhNlvXbI 00:02:45 to 00:08:52].

Scale (n2xPrwI9o1U, fiIVK6t-2x0, YrD29hiokJo):

- Imports are normalized to XYZ Size 2; the real size moves into Export Scale. Exported value = XYZ
  Size x Export Scale: 2 x 63.5 = 127 [n2xPrwI9o1U 00:04:19]. Scale = target / XYZ Size: 254 / 3.5 =
  72.57 [00:06:37].
- Check in a text editor: read the OBJ vertex coordinates [n2xPrwI9o1U 00:07:45]. The agent parses
  the file (`scale_report`) and reads ZBrush's `#Auto scale` header line.
- Known-feature sizing: a bar between the pupils at 63 mm, or a 1 inch cube, then resize everything
  with All on [fiIVK6t-2x0 00:03:27; YrD29hiokJo 00:04:16]. STL carries no unit: tell the printer
  [YrD29hiokJo 00:05:21].

Decimation (mRfA_WDvvrg): Decimation Master drops polygroups; recover them with Unweld Groups
Border, Freeze Borders, decimate, Auto Groups, Weld Points, then divide once to prove it is
watertight [00:02:35 to 00:05:04].

Scan and single-sided cleanup (PrFQXjs_6_w, udiPVJIODX0), the closest official recipe to Z6:

- Inspect with MatCap Gray and colorize off; the diffuse hides holes [PrFQXjs_6_w 00:00:09].
  Duplicate first: the untouched copy is the projection source for shape and color [00:01:15].
- Try DynaMesh 512, Blur off, Project off. Swiss cheese means the shell is too thin, not a
  resolution problem: DynaMesh's close-holes "just doesn't have anything else to do but shoot
  straight across" [00:02:21 to 00:02:53].
- Close Holes, isolate the fill polygroup, push it back to make a volume, DynaMesh again [00:03:26
  to 00:07:16]. Plug remaining holes with Unified, embedded PolySpheres, MergeDown, re-DynaMesh
  [00:07:16 to 00:10:33].
- Junk: group it, hide, Delete Hidden, re-DynaMesh [00:10:33]. Flat base: straight SliceCurve, hide
  below, Delete Hidden, re-DynaMesh [00:11:39].
- Light working mesh: DynaMesh 128 kept the silhouette at about 50k points; divide to about 3M;
  Project All Dist 0.1 with colorize on for both [00:14:58 to 00:17:42].
- Texture to geometry: Mask By Intensity, colorize off, Inflate a little [00:19:21]. BumpViewer
  shows polypaint as bump while sculpting [00:17:42].
- Close Holes is global: fills that must stay open (a fabric edge, the back of a relief) are
  isolated by polygroup and deleted [udiPVJIODX0 00:04:30].

## Paul Gaboury (Pixologic, then Maxon; #AskZBrush)

- "It's not really going to be possible to remesh with the remesher and maintain high fidelity
  detail, that's not what its goal is" [34D6VljTjBs 00:00:39]. On a 3M arm: 90k keeps a lot, 18k is
  "pretty good", 5k still enough [00:01:10 to 00:02:51].
- Project History avoids the duplicate: remesh and divide in place, Ctrl-click the detailed undo
  state, Project History with Color off [34D6VljTjBs 00:04:20 to 00:05:24]. No SDK call sets the
  history point, so the agent uses the duplicate route.
- ProjectionShell for wildly different shapes: drag it until only the target color shows (Inner
  turns on), Dist to the maximum 1, "like a fishing line" [pQbPtH0p5Bg 00:02:30 to 00:03:02].
- UVs belong on the lowest level; UV Master's Work on Clone, Unwrap, Copy UVs, select the original,
  Paste UVs [cemmalvugFk 00:00:51, 00:04:00 to 00:07:28]. AUV, GUV and PUV tiles fill space but are
  unreadable for a painter [00:01:25 to 00:03:30].

## Ian Robinson (Maxon; #AskZBrush)

- Decimation Master's Use and Keep Polypaint is off by default; enable it before pre-processing;
  presets pre-process and decimate in one click [bVX9utHc_ZI 00:01:17, 00:02:15].
- Scale Master: New Bounding Box SubTool, Set Scene Scale, type the size, Resize Subtool with All,
  Export to Unit Scale [bICt_XruvQM]. The dialogs make it a human route; the agent does the Export
  Scale arithmetic.

## Michael Pavlovich (games sculptor: Halo 4, Call of Duty, Doom; Maxon ZBrushLIVE host)

Topology, face and body (n5_cZK-9peg, ZBrush 2023):

- ZRemesher gives even quads but not reliable loops at eyes, mouth, nose points and lip corners;
  past a point "it's easier to just build what I need to rather than trying to finagle ZRemesher"
  [00:06:00], so delete those regions and rebuild them [00:21:36, 00:22:40].
- Give ZRemesher an easier problem: neutral expression, folds smoothed away, the smile sculpted back
  later on the new topology [00:01:39 to 00:02:46].
- Concentric polygroup rings around eyes and mouth, most important areas first, then fill the blanks
  [00:06:32, 00:08:55].
- Smooth the group borders before remeshing, because ZRemesher builds aliased borders into the flow:
  Shift with Weighted Smooth Mode 6 (Groups Border), or the button route Mask By Feature (Groups),
  Grow Mask, invert, Polish By Features [00:05:27, 00:07:48, 00:15:18]. `rx.polish_band` is the
  button route.
- Smooth Groups 0 once borders are smooth; the default 1 "melts" the mesh [00:17:08].
- Numbers he read on screen: Target 5, Adaptive Size 0 gave about 8k points, 21 gave 9,397, 5 gave
  8,551 (7 s) on a grouped head of 169,089 points [frames 00:18:28 to 00:22:09]. Adaptive Size 0
  hits the count and even quads but fails on tight turns [00:17:40, 00:18:13].
- Store a projectable state before any topology change and project back after every ZRemesher,
  Smooth Groups, density or smoothing pass: they all shrink the surface [00:03:31, 00:22:05,
  01:03:12]. `rx.zremesh` returns the shrink ratio.
- Ears and hands remeshed as separate SubTools, their open borders polished first (Mask By Feature
  Border, Grow, invert, Polish By Features open circle), stitched back where deformation is low
  [00:44:36 to 00:47:31].
- Freeze Border re-welds separately remeshed parts exactly, "probably not great for animation"
  [01:03:44 to 01:04:17]. [added] Remesh the whole limb to the wanted density first, then split and
  Freeze Border, or the frozen border keeps a dense DynaMesh ring.
- Polypaint density read on screen: white = 1 (neutral), Color Density 2 picks pink for more
  polygons, 0.25 light blue for fewer; Colorize on to see it; start from a white fill [01:01:32 to
  01:02:38]. This settles the ZRemesher doc's contradictory paragraphs.
- Groups place loops, polypaint sets density: the arm went from 11,384 to 2,780 points with 2x
  density on the hand [frames 01:02:44, 01:03:29].
- Alt+ZRemesher switches the midline algorithm; compare nape and brow at low targets (1k, 1.5k) with
  a snapshot [00:48:31, 00:49:05].
- Project All reads every SubTool whose eye is on, even in Solo mode [01:07:26]. Project History
  needs no second SubTool [01:08:33].
- DynaMesh and color (Masking Basics, 8kWFv1cZlCE, `notes/sculpting/`): his polypaint was lost
  because he re-DynaMeshed without Colorize on [00:20:06]. The DynaMesh doc states the other half:
  with polypaint on, DynaMesh keeps polypaint INSTEAD of polygroups ("PolyGroups > Important"). On
  an AI or scan mesh the choice is made on purpose: `dynamesh_keep(keep="groups")` keeps the part
  groups, and color returns by projection from the raw copy. scenario-zbrush-sculpting owns the
  general rule.
- Materials (aR02CwyPTUw, `notes/sculpting/`): MatCaps bake their lighting; to judge whether forms
  read under changing light, use a Standard material and move the light front, side and behind
  [00:04:07, 00:04:39]; Red Wax "will really enhance differences between your surfaces" [00:03:32].
  Used in the cleanup critique.
- Borrowed topology: wrap a base head (DemoHead) with Dynamics shrink-wrap: Gravity off, Contract
  with C Amount 0.03 (head) or 0.29 (arm), CollisionVolume Resolution 291, Inflate 0, then Project
  All [00:54:08 to 00:55:14]; Wrap or ZWrap are faster third-party tools [00:52:23].
- Camera-projection brushes (ZProject, HistoryRecall) need a straight-on view and symmetry off
  [00:57:02, 00:57:33].

UVs with crease seams (cvqoVUX5aBw, ZBrush 2023):

- Auto Seams makes one island with no overlap, fine when only maps matter [00:02:12]. Explicit
  seams: consolidate polygroups to the islands you want, Crease PG, Unwrap with Crease Edges
  [00:02:44 to 00:04:23]. Hands pelt-map and tails unwrap into circles until extra seams are creased
  with ZModeler Crease Shortest Path [00:04:23 to 00:08:11]. "Creases do not cut until you unwrap
  again" [00:08:11].
- "You generally want to put your UV seams where the camera is not going to see it" [00:06:00].
- Layout edits on a UV Master clone: Gizmo moves of isolated groups with symmetry off; islands
  outside 0 to 1 are rescaled on the next Flatten [00:08:11 to 00:09:51].

## Pablo Munoz Gomez (ZBrushGuides founder, Maxon ZBrushLIVE presenter, Retopo brush beta tester)

The 2026 Retopo brush (I4nePXDTrhQ, ZBrush 2026.1.1):

- It is "literally just a brush" that combines ZSphere topology, the Topology brush and ZModeler
  [00:00:38]. Its job: a clean quad mesh when ZRemesher's result is not what you want [00:03:01].
- First click: Yes creates a new retopo SubTool (for a dense sculpt); No converts the current mesh,
  right for a light ZRemesher result that is "99 percent ready"; No on a dense mesh "is gonna be
  pretty heavy and it's gonna potentially crash" [00:05:59 to 00:07:09].
- Points project onto every visible SubTool: leave the eyes visible to wrap head and eyes as one
  mesh [00:08:33].
- "The only thing that you really need to remember when working with this brush is the spacebar":
  the normal size grabs and moves, the Space size connects points into polygons [00:12:46,
  00:05:23].
- Loops first, then fill; smooth (Shift, Smooth Retopo) only at the end [00:16:26, 00:19:13].
  Patches (228 bundled) save hours on humanoids; stylized and exaggerated characters are done by
  hand [00:04:09, 00:29:03].
- "A good topology is just whatever works for whatever you're doing" [00:32:18].
- Pablo also sets the production order behind this skill: topology, UVs and export last
  (Understanding ZBrush's Logic), and ZRemesher 5 gave 4,963 [rArw79xEpvE 00:03:16].
- Level discipline (Logic Part 7): big changes at SDiv 1, secondary forms at SDiv 2 or 3, then up;
  moving large forms or detailing only at the top level are two beginner mistakes [rArw79xEpvE
  00:12:28 to 00:14:16]. The rebuilt stack is handed over with that rule.
- Projection density (Logic Part 8): the target's top level needs at least the source's point count,
  "as long as it's more or slightly more than that, we will be able to recover all those details"
  (745k against a 400k DynaMesh) [VRisbJQAaZw 00:17:24]. Sculptris Pro adds resolution only where a
  small detail needs it, instead of raising a whole DynaMesh [00:10:41, 00:11:53]: the local-rebuild
  tool for a damaged region of a cleaned AI mesh.
- MergeVisible creates a NEW tool and leaves the working tool intact; MergeDown merges inside the
  tool [gitoJ7B8FmY 00:03:31, 00:04:11]. Cleanup merges down (`merge_down_run`, `merge_into`).

## FlippedNormals (Henning Sanden and Morten Jaeger, ex-MPC and ex-Framestore film artists)

ZBrush to Arnold, 32-bit displacement with UDIMs (-ThBTEc8L_M, ZBrush 4R8, Maya 2018):

- A 2M sculpt cannot be rigged; the low mesh plus a displacement map carries the detail [00:03:00].
  MME does every SubTool and UDIM unattended [00:04:09].
- Most switches are wrong by default for film: Flip V on ("an absolute must") [00:06:13], Adaptive
  off ("the quality difference is so negligible"; 100 UDIMs in about 1 h versus 24 h) [00:08:12],
  DpSubPix 0 [00:08:45], SmoothUV on if the renderer smooths UVs [00:09:52], Mid 0.5 [00:10:01],
  32Bit and exr on [00:10:34], 3Channels off [00:11:08], Map Border at maximum [00:05:41], SubDiv
  level 1 (the level the rig uses) [00:07:40].
- Merge Maps could not output EXR in 2018; they give each object its own UDIM tiles instead
  [00:04:43, 00:11:08]. Later builds fixed MME merging with UDIMs (2021.7.1) [verify EXR plus Merge
  Maps on 2026].
- UDIM file names with a dot after the DM suffix so the files form a sequence [00:13:50].
- Switch MT was "currently broken" in 2018 [00:07:09]; the 2026 doc documents it [verify].
- Export the low mesh with Grp off, or Maya splits it [00:15:08].
- Arnold: File node Filter off, UV Tiling Mode UDIM (Mari); Catmull-Clark about 3 iterations; Auto
  Bump; zero value matched to Mid (the video description corrects the field to Scalar Zero Value)
  [00:17:29 to 00:20:35].
- "Most times you have issues with displacement ... simply just caused by bad geometry in ZBrush"
  [00:21:41].

Reprojecting details (Zp07GW3rND0, 2018; `notes/sculpting/`), the production view of Project All:

- Routine work, done "all the time" whenever topology or reduction changes [00:00:03]. Subdivide the
  new low mesh to "a few million", about 3M [00:01:02].
- Order at the highest level: Store MT, then a New Layer, then Project All: "It's important that you
  do all of this on the highest level" [00:02:13, 00:02:47]. PA Blur lowered for a clean source.
  Staged alternative when the shapes differ a lot: step down to level 1 and project upward level by
  level, fixing gross mismatches low [00:03:17, 00:03:49]. `project_stack(order="top_first")` is
  this order; the lead's `zb_ops.project_all` sets the same two nets.
- Danger zones: parts that sit close together grab the wrong surface: eyes, mouth, armpits, between
  the fingers, the crotch [00:01:41, 00:07:10]; artifacts left there become hard lines in
  displacement maps "down the pipe" [00:07:43].
- Eyes: keep a polygroup inside the eye, grow it to just outside the lid, mask by it, reproject
  [00:05:31, 00:06:03]. `protect_isolated` is the scripted half; isolating the group is a Ctrl+Shift
  click.
- Repair with the Morph brush back to the stored target, not smoothing: "you're never gonna be able
  to smooth these kind of things out properly"; rogue vertices "go to infinity" [00:04:27,
  00:06:36]. Local reprojection: mask, invert, project only there [00:09:27].
- Do not take a concept sculpt to final micro detail before retopology: tight areas get destroyed
  and must be resculpted [00:02:13, 00:08:22]; a proper sculpting pass follows reprojection
  [00:08:55].

ZBrush to Substance Painter (p56N-dN11zY, 2019):

- For offline work, skip the low poly: Decimation Master 150k with Keep UVs, MergeVisible with UV
  on, paint the decimated high directly, no normal map [00:00:42 to 00:02:59].
- Polygroups become texture sets (Export Polygroups as Mats) [00:03:46]; smooth normals on export or
  every baked map inherits faceting [00:06:03].
- ID map from polypaint: MME Texture From Polypaint, SubTools off, Flip V on [00:09:45 to 00:10:51].
- In 2026.2+ the Substance Bridge replaces the manual FBX route for most cases (version deltas); the
  decisions (UVs kept, polygroups as sets, smooth normals, ID from polypaint) still apply.

## Laura Gallagher (Outgang; former Lead Character Artist at Eidos Montreal, Guerrilla Games)

Units and scale (EXjfH_X2hkM, ZBrush 2021):

- "ZBrush doesn't really have internally a concept of centimeters or inches or meters, it's just
  units" [00:04:27]. Every primitive fits a 2 x 2 x 2 box [00:07:21].
- Two scale problems: exported size (Tool > Export > Scale) and internal size (XYZ Size about 2)
  [00:38:11]. Keep internal size "within the same order of amplitude essentially as two": 1 to 4 are
  fine, 0.1, 10 or 20 are not [00:28:23 to 00:28:55].
- DynaMesh resolution subdivides the scene's unit space, not the object [00:11:41 to 00:14:22].
- Export Scale also drives the transpose-line readout: measure first, export second [00:19:46 to
  00:22:27]. Rule of thumb: Export Scale about half the real longest dimension; a 180 cm character
  reads Export Scale 90 [00:26:16, 00:28:55]. Scale 0 means never set [00:24:03].
- Offsets are internal units: Y Offset 1 stands a 2-unit model on Maya's grid [00:33:04, 00:33:40].
- Unify is fine for simple objects but can "screw up everything" with layers and morph targets;
  rescale a complex character by Save As then MultiAppend into a correctly scaled tool [00:27:16,
  00:38:48 to 00:44:24].
- Relying on Scale Master without understanding the model gets you into trouble [00:45:17].

## Maxon documentation (help.maxon.net, 2026 help)

- ZRemesher: prepare the input (a level that holds the shape, a decimated copy above about 8M
  vertices, Close Holes, Fix Mesh); Adaptive Size default 50; Adapt off to hit the count; Curve
  Strength "the higher you set this slider, the fewer Curves you should draw"; Fast Retry keeps its
  cache for target, Adapt, Keep Polypaint, Detect Edges, Freeze Groups, Freeze Borders, Adaptive
  Size, curves, Use Polypaint and symmetry, and discards it for any sculpt, Smooth Groups, Keep
  Creases or Keep Groups change; retopology over retopology improves flow; Legacy mode "has been
  removed" per the 4.0 page, while the reference page and the 2026.2.1 UI strings still list it.
- Retopo brush (2026.1): manual topology is for deforming areas with prescribed loops; a 100k+ head
  needs about 10,000 to 20,000 polygons for animation; "A common mistake is creating retopology
  that's still too dense to be useful"; hide the reference and look for triangles and broken loops.
- Projection and subdivision: Project All works between different topologies "broadly similar in
  shape", best with only source and target visible; Dist maximum 1; positive ProjectionShell turns
  Inner on; Close Holes only without levels; Divide adds a level only when nothing is masked or
  hidden; Reproject Higher Subdiv from three or more levels below the top.
- UV Master: a creator, not an editor: "Seams can be attracted, restricted, but not exactly placed";
  100k to 150k polygons; Work on Clone whenever more than one click; Protect counts from 70 percent
  intensity; a closed protected ring forces a seam; control maps bind to the Tool name; Flatten
  cannot make multi-tile UVs.
- Multi Map Exporter: Mid 0.5 for 16-bit, "for 32 bit maps best results are with a setting of 0",
  Scale 1 for 32-bit; Get Scale and the lower value for 16-bit; Tangent for anything animated; back
  up before running (ESC can lose UVs); Merge Maps needs equal sizes.
- Decimation Master: options, pre-process, decimate; edits after pre-processing are ignored; masks
  move polygons, not the count; polygroups are not kept; Keep UVs costs 50 percent more memory;
  unique SubTool names.
- Export, GoZ, FBX, Substance Bridge: GoZ needs unique names across all loaded Tools and sends the
  lowest level; FBX axis presets with "If in doubt then MayaYUp"; Substance Bridge Low & High plus
  Auto-Bake, and "Force UV Auto-Unwrap is a global setting"; Scale Master: "Subtools function best
  in ZBrush when their XYZ Size is set to 2"; SubTool Master ScaleOffset resets Export Scale and
  offsets for all SubTools (so they are per-SubTool values).

## Polycount wiki (game-art practitioners)

- Bake from high to low with rays from outside; decimate ZBrush highs first: "Sculpting tools like
  Zbrush create triangles smaller than the bake pixels" (Baking Workflow 8).
- Triangulate the low poly before baking and keep that triangulation in the engine; split UVs at
  every hard edge; explode or bake-group intersecting parts; do not rotate or mirror UVs after
  baking.
- Flat normal color is 128, 128, 255; bake 16-bit, reduce to 8-bit last; re-normalize after edits;
  displacement needs 16 or 32-bit.
- "It is best to assume all tutorials are incorrect, until you can verify the results yourself": the
  reason for the live_rx_04 calibration fixture.

## Disagreements and the deciding condition

| Topic                         | Position A                                                  | Position B                                                                                             | Decide by                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 32-bit displacement Mid       | MME doc: Mid 0, Scale 1                                     | FlippedNormals: Mid 0.5, renderer zero 0.5                                                             | either, if the renderer zero value matches and the handoff records it; 0.5 keeps maps readable and layerable                        |
| ZRemesher steering            | Drust, Pavlovich: polygroups                                | ZRemesher doc: curves at strength 100, fewer at high strength                                          | agent: polygroups (buttons); hard surface: Group By Normals + Keep Groups + Frame Mesh; exact organic loops: human curves or Retopo |
| ZRemesher target              | Gaboury: as low as the silhouette allows                    | ZRemesher doc: not low for hard surface; Retopo doc: 10k to 20k animated head                          | sculpt base low; hard surface higher; animation mesh from the rig and budget                                                        |
| Adapt                         | doc: on for quality                                         | Drust: off for Half passes                                                                             | off when the count must be predictable (budgets, halving); on for shape                                                             |
| Detail transfer               | duplicate + Project All per level (doc, Drust)              | Freeze Subdivision Levels (Drust, doc) or Project History (Gaboury, Pavlovich)                         | agent: duplicate route (no SDK call for the history point); existing stack with base edits: Freeze                                  |
| Project Dist                  | 0.1 (Drust)                                                 | 1 with ProjectionShell and Inner (Gaboury)                                                             | same shape, new topology: 0.1; very different shapes: shell + Inner + 1                                                             |
| Decimate or ZRemesh           | Drust: decimation for print and bake files, never rigging   | FlippedNormals: decimated high straight to Painter for film                                            | realtime or rigging: ZRemesher + maps; offline texturing, print, previews: decimate                                                 |
| Seams                         | UV Master attracts and protects, cannot place exactly (doc) | Pavlovich: explicit creases                                                                            | games and 2D painting: creases; organic speed: UV Master with polygroups and AO attract                                             |
| Relaxing UVs                  | Drust: Polish a flattened clone with borders masked         | UV Master doc: smoothing distorts UVs against the geometry                                             | mask borders, check with a checker, prefer re-unwrapping with existing seams                                                        |
| Painter handoff               | FlippedNormals 2019: decimate, merge, FBX                   | Substance Bridge 2026.2: Low & High, Auto-Bake                                                         | ZBrush 2026.2+ with a real low poly: Bridge; film high-poly painting: the decimate route                                            |
| Scale fixing                  | Gallagher: the arithmetic, not Scale Master blindly         | Robinson, Drust: Scale Master                                                                          | scripts: arithmetic (no dialogs); humans and print: Scale Master; complex mis-scaled tool: MultiAppend                              |
| Manual topology tool          | Pavlovich 2023: ZSphere topology, Topology brush, ZModeler  | Pablo 2026: Retopo brush                                                                               | 2026.1+: Retopo brush; Topology brush for a quick strip                                                                             |
| Smooth Groups                 | 0 on pre-smoothed borders (Pavlovich)                       | 1 for ragged DynaMesh groups (Drust)                                                                   | pre-smoothed: 0; ragged and no time: 1, then project back                                                                           |
| Symmetry while retopologizing | Pavlovich: X symmetry on throughout                         | Pablo: optional, Mirror And Weld at the end                                                            | symmetric volume: either; posed or asymmetric: off, never Mirror And Weld                                                           |
| Projection order              | Drust: divide once, project, repeat per level               | FlippedNormals: divide to about 3M first, nets at the top, project in one go or staged from level 1 up | default per_level; top_first when zones need a mask (masks block Divide) or one layer should hold the whole projection              |
| Top-level density             | Pablo: at least the source's points                         | Drust: divide until close to the source; digest: within a factor of about 2                            | `top_ratio=1.0` for full detail capture; 0.5 when memory is the limit, reported as softer detail                                    |
| Hole plugs                    | Drust: PolySpheres placed by hand, MergeDown, re-DynaMesh   | Close Holes and decide per fill group (scan-cleanup agent translation)                                 | Close Holes first; plugs where a fill fails, placed from the OBJ's boundary loops (`hole_plugs`, `plug_hole`) [added]               |

## What an agent can and cannot do here [added]

- Deterministic and strong: every ZRemesher option, Retry sweeps, visibility control, projection
  loops, native and UV Master unwraps, Crease PG seams, MME and Tool palette bakes, Export Scale and
  offsets, OBJ exports, Decimation Master, Close Holes, Fix Mesh, Split To Parts, MergeVisible,
  DynaMesh, Polish, Mirror And Weld, Polygroups From Polypaint, Mask By Intensity + Inflate, and
  every check on the files.
- New since the Z4 and Z6 grades [added]: Retry sweeps that end on the chosen variant
  (`pick_retry`), level-1 snap-backs, color passes with Colorize on both sides, DynaMesh that keeps
  groups on purpose, in-Tool merges by name (`merge_into`), plugs placed from the file
  (`hole_plugs`), masks for danger zones once a zone is isolated (`protect_isolated`).
- Weak or human: ZRemesherGuide curves, lasso and pen masks for face rings, isolating a polygroup
  (Ctrl+Shift click) before `protect_isolated`, neutralizing an expression
  (scenario-zbrush-character-creature), Retopo brush gestures and patches, ZModeler Crease Shortest
  Path and edge fixes, Protect and Attract painting, Transpose pushes (thickening a fill),
  PolySphere plug placement, Undo History Ctrl-clicks, Alt-clicks (alternative midline), FBX
  options, GoZ's first app chooser, anything inside Painter.
- The honest report names which of the weak steps the brief needed and who should do them.
