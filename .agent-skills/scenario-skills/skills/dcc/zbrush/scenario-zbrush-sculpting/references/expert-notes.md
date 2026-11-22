# Expert notes: core-form sculpting in ZBrush

The depth behind SKILL.md, by expert, with source and timestamp. Video ids resolve to
`https://www.youtube.com/watch?v=<id>`; the per-source notes are in `notes/sculpting/` and
`notes/fundamentals/`. "Frame" values were read from the ZBrush UI on screen; brush sizes relative
to the head were measured on frames and are approximate. [added] marks this skill's own inference or
default.

## Henning Sanden and Morten Jaeger (FlippedNormals; ex-MPC and ex-Framestore film character artists)

Sources: Learn to Sculpt Like a Pro (0PaYUUvgwYM, 2018), The Only 6 Brushes You Ever Need
(TpS0QdlfHWU, 2020), Top Tips for Sculpting (G2o6fdoACIQ, 2020), Reprojecting Details (Zp07GW3rND0,
2018).

**Pressure is the technique.** Henning blocks at ClayBuildup's default Z 20 with "maybe 30% of the
actual pressure", which is what lets strokes blend; a mouse gives "the same pressure all around",
"you need a tablet" (0PaYUUvgwYM 00:01:40, 00:04:58). This is the handicap of every scripted stroke.
Constant-pressure equivalent: Z 20 at 30 % is about Z 6; his refinement "Z 5 or even 2" at a light
hand is about Z 1 to 2 (sculpting digest inference, used as defaults in `zb_sculpt.BRUSHES`; the
live calibration replaces them).

**Across the form for clay, along for lines.** ClayBuildup strokes go perpendicular to the form so
the peak lands on its center and fades to its edges; along the form is "drawing the shape"
(0PaYUUvgwYM 00:02:13 to 00:02:45; G2o6fdoACIQ 00:10:08, 00:10:40). "I'm only going across the form
when it comes to the clay brushes"; Standard and Dam_Standard go along the line they draw
(0PaYUUvgwYM 00:30:39, 00:22:34).

**Refine, do not smooth.** Blend by crossing the join at low pressure, never Shift (0PaYUUvgwYM
00:04:58 to 00:06:37); remove stroke marks with a refinement pass at Z 5 or 2 across the form, which
also builds tertiary variation: "I don't regard it as a smoothing pass, I regard it as a refinement
pass" (00:08:51, 00:09:57). The descent on the dwarf bust: Z 23, 13, 3, 1, then 5 for touch-ups,
zooming in a little each time, "like a progressive renderer"; when the last marks need ten more
passes at 1, say "good enough" and smooth once (TpS0QdlfHWU 00:21:53 to 00:23:31, frames 00:21:27 to
00:24:09). Smoothing has legitimate jobs: destroying a sculpt to rebuild it, integrating added
volume, selectively smoothing some areas (TpS0QdlfHWU 00:11:42 to 00:12:46).

**Stage ladder with numbers on screen.** Head on a DynaMesh sphere at about 99k points (Resolution
slider 192, 98,787 points), Divide to 399,028 (SDiv 2), Divide to 1.596M (SDiv 3) for Dam_Standard
and Standard (0PaYUUvgwYM frames 00:00:45, 00:07:30, 00:18:49). Bust by DynaMesh only: 128 = 96,222
points at the end of blocking, 376 = 825,837, 648 = 2.457M (TpS0QdlfHWU frames 00:14:16, 00:18:45,
00:21:27). Points scale with Resolution squared, so `res_next = res * sqrt(target / now)` (digest
derivation; `zb_sculpt.next_dynamesh_resolution`). A PolyMesh3D sphere is 8,320 points and DynaMesh
128 gives 43,401 (TpS0QdlfHWU frames 00:08:55, 00:09:40); this install gave 43,480 [obj].

**Six brushes and their jobs** (TpS0QdlfHWU 00:01:41 to 00:16:55):

- Move (key 4): Dots, Alpha Off, Focal Shift 0, Z 51; drag clean shapes then DynaMesh, repeat
  (00:02:02, 00:02:34); brush 0.6 to 0.9 of the head for design moves, about 0.12 of the face for
  eyes (frames 00:17:15, 00:18:00).
- Standard (2): pushes and pulls what is there, so it enhances existing detail; Z 25 then 21 then 11
  on the head, about 1 to 2 % of head width (0PaYUUvgwYM frames 00:27:33 to 00:30:32; TpS0QdlfHWU
  00:03:55).
- Dam_Standard (5, B D S): Dots, Focal Shift -14, Zsub; "maybe 15, ten points below where it starts"
  (0PaYUUvgwYM 00:18:42, frame 00:19:34) or 33 for big cuts (TpS0QdlfHWU frame 00:05:54); soft,
  harder, softer, harder, with small overlaps, never "ticka ticka" constant lines (0PaYUUvgwYM
  00:20:55 to 00:21:29); bigger brush for a more voluminous cut, Alt for a sharp ridge (TpS0QdlfHWU
  00:06:18).
- ClayBuildup (3): FreeHand, Focal Shift -56, Alpha 06 (Henning) or Alpha Off (Morten), never the
  default square alpha (TpS0QdlfHWU 00:07:18, 00:08:04); it replaces what is under it, so never
  after pores (00:07:44).
- Smooth and Smooth Stronger (Shift): Smooth Stronger for very dense meshes where Smooth does
  nothing, about Z 30 for an in-between that also cuts planes; one click destroys a low-res mesh
  (00:13:15 to 00:14:53).
- TrimDynamic (6, B T D): FreeHand, Alpha Off, Focal Shift -56, Z 43, Zsub; early, not final;
  removes "junk sculpting" (00:15:19 to 00:15:51); as the Shift brush it "forces me to think about
  shape" (00:16:24).

**Frequencies.** Mid frequency is "the backbone of the detailing step" and the one most artists skip
(G2o6fdoACIQ 00:05:46); two beginner signatures: "semi smooth with details" (secondary smoothed
away) and primary forms plus "crazy alphas" (mid frequency skipped) (0PaYUUvgwYM 00:11:04,
00:11:35). If you wonder whether to add pores, "you're two levels behind" (G2o6fdoACIQ 00:08:17).
Add every needed element early, the troll's teeth change the whole read (00:02:50). Break symmetry
in the mid-frequency stage (00:06:19).

**Contrast and dominance.** Carve deeper than feels right; shading, SSS and soft light eat sharpness
(0PaYUUvgwYM 00:19:49 to 00:20:22). A contrast stage after secondary: sharp cuts next to soft areas,
"like a white thing next to a black thing" (00:23:39 to 00:24:46). Do not detail everything: soften
some wrinkles back, keep dominant ones (00:25:18 to 00:25:49). "Coloring inside the lines": build
volume between two Dam_Standard cuts (00:26:22).

**Eyes.** On the dwarf bust Henning moves the eyes a bit in "making sure perspective is on",
sharpens cartoony eyes into realistic ones with Move (brush about 0.12 of the face), raises DynaMesh
to 376, forces the upper and lower lids in with Dam_Standard and moves them out "so they conform to
an eyeball", then smooths the area a little (TpS0QdlfHWU 00:17:28 to 00:18:33, frames 00:17:15,
00:18:45). For an agent: eyeball spheres first, strokes planned orthographic, the look judged on a
perspective render (P17).

**Silhouette as a metric.** Keep the Silhouette thumbnail on (TpS0QdlfHWU, every frame); "the less
your silhouette changes between the different levels, the more solid your design" (G2o6fdoACIQ
00:17:27); judge from the side when the body hides the front (00:16:23); no unintended straight
lines or right angles (00:15:17).

**Reprojection.** Subdivide the new low-res to "a few million", about 3M; at the top level Store MT,
then New Layer, then Project All with PA Blur lowered (Zp07GW3rND0 00:01:02 to 00:02:47); repair
with the Morph brush, not smoothing (00:04:27, 00:06:36); eyes protected with an eye-interior
polygroup grown past the lid (00:05:31); danger zones: eyes, mouth, armpits, between fingers, crotch
(00:07:10). Stop the concept sculpt before micro detail if retopology is coming (00:08:22). Owned
downstream by scenario-zbrush-retopology-export; this skill only uses it to get subdivision levels
for S3.

## Pablo Munoz Gomez (3D concept artist and educator, ZBrushGuides founder, Maxon ZBrushLIVE host)

Sources: Understanding ZBrush's Logic Parts 1 to 8 (NckHjyO6GNk, RABWfzWNw0c, gitoJ7B8FmY,
mVp_jNfEI3I, FrqUnna1jns, 9a9S1OcYHx4, rArw79xEpvE, VRisbJQAaZw, 2025), Dos and Don'ts when
Sculpting (tbQqC6tyDBQ, 2025, ZBrush 2025.3).

**Blockout without brushes.** A whole blockout with primitives and the Gizmo, "without even actually
using any of the brushes" (gitoJ7B8FmY 00:05:26): cylinders with Gizmo deformers (Smooth, Taper,
Bend Arc), Duplicate, Mirror And Weld, MergeDown (RABWfzWNw0c 00:09:18 to 00:24:19). Parts built in
their own tools, MergeVisible (a new tool), then Append (gitoJ7B8FmY 00:03:31, 00:04:11). For an
agent the Gizmo deformers are GUI-only; the scripted equivalents are Tool > Deformation sliders on a
SubTool made for the part and Tool > Geometry X/Y/Z Position and XYZ Size.

**ZSpheres for proportion and silhouette only** (tbQqC6tyDBQ 00:01:13): 66 spheres on the creature,
Adaptive Skin with DynaMesh Resolution 0 (Density 2 on screen, 5,994 points; frame 00:01:58), or
Density 1 for a light skin (gitoJ7B8FmY 00:17:35 to 00:18:12). "Don't crank up the DynaMesh
resolution too high, at least not too early because then you're gonna get this lumpy mess"
(tbQqC6tyDBQ 00:04:38).

**Light meshes, raised in steps.** DynaMesh per SubTool at 64 to 128 (80 most often, 28k to 43k
points), merge, DynaMesh 256 for transitions (366,728 points) (tbQqC6tyDBQ frames 00:05:55 to
00:11:55). DynaMesh resolution is relative to the object's size: the same value gives more detail on
a bigger object (FrqUnna1jns 00:13:40); powers of two after 128, 256 (9a9S1OcYHx4 00:10:11); raise
it before cutting sharp Dam_Standard lines. Intersecting parts always fuse; separate polygroups plus
Groups keep them apart (FrqUnna1jns 00:15:39, 00:16:16). Merge is not DynaMesh (00:23:25). A faint
mask eats the re-DynaMesh gesture (00:07:28).

**Never Divide a DynaMesh to detail.** 390,000 to 1.5M to 6M of triangles and star poles that no
smoothing fixes; ZRemesher first (rArw79xEpvE 00:09:44 to 00:11:28). ZRemesher target is in
thousands and approximate: 5 gave 4,963, 1 gave about 2,700 on a small horn (00:03:16, 00:05:12).
Sketch to clean: store the history point, ZRemesher 5, Divide until the top level has at least the
sketch's points (745,000 against 400,000), Project History (VRisbJQAaZw 00:16:51 to 00:19:13);
scripted substitute: Duplicate plus Project All.

**Level discipline.** ZRemesher when the form is settled, DynaMesh while it is not (rArw79xEpvE
00:05:50). Big moves at SDiv 1; at the top level a Move push "looks very wonky" (00:12:28 to
00:13:05); block secondary forms at SDiv 2 or 3 and refine upward, smoothing and refining at each
level, because detailing only at the top shows where strokes start and stop (00:13:42 to 00:15:28);
do not stay at the highest level for everything (tbQqC6tyDBQ 00:12:26). Dam_Standard on levels: a
larger size at lower intensity, smoothed right after each stroke (rArw79xEpvE 00:15:41). Agent form:
`zs.level_for` and `zs.set_level_code` (P15).

**Brushes by profile** (9a9S1OcYHx4): Standard rounded and raised (stacked Standard strokes are the
beginner's lumpiness, 00:02:34); Clay flat strips; ClayBuildup fast mass, gentle with soft pressure
(00:04:31); Dam_Standard a knife (00:06:10); Alt inverts any brush (00:07:15); Inflate along
normals, re-DynaMesh after (00:11:33, 00:15:06); Pinch for crisp edges, rarely on organic work
(00:15:20). Move vs Move Topological: Move Topological follows connectivity, not color (mVp_jNfEI3I
00:10:21, 00:13:58); a bigger Move brush is easier than a tiny one (00:08:48). Symmetry fix when the
wrong side is the reference: Deformation > Mirror, then Mirror And Weld (9a9S1OcYHx4 00:09:35);
Local Symmetry is global and must be off before Mirror And Weld (gitoJ7B8FmY 00:10:22).

**Stroke building.** Low intensity, many short strokes: "from left to right multiple times, with
multiple separate strokes", then smaller strokes perpendicular; never a muscle in one hard stroke
(tbQqC6tyDBQ 00:05:22 to 00:06:32). ClayBuildup on screen: Imbed 20, LazyMouse on, LazyRadius 1,
Roll Dist about 6, Focal Shift -56 (frame 00:05:55). Keep surfaces clean at all times and smooth
constantly during blockout (00:06:47); early cuts are guides that may go away (00:08:12). Sharp
masks, not blurred ones, for Move edits, then re-DynaMesh and smooth (00:09:09, 00:09:46). Standard
at raised Z to set an edge, then blend with clay (00:10:27).

**Gates.** "The details won't fix a weak sculpt... They will just highlight them" (tbQqC6tyDBQ
00:12:50); details do not change the silhouette, a good sculpt "should already look strong... even
without the details" (00:13:27, 00:14:05). Feature details first by hand (scars, deep creases,
strong folds), texture brushes around them, fading at transitions (00:15:19 to 00:18:00). Evenly
distributed quads are enough for sculpting, printing and concepts; perfect loops are for animation
(00:11:43).

**SubTools and merges** (Logic Parts 2 and 3). Symmetry is stored per SubTool: "the important thing
about symmetry is that it is connected to the sub tool that you're working on", so re-check it after
every SubTool change (RABWfzWNw0c 00:27:02). MergeDown merges the selected SubTool into the one
below and shows a confirmation he keeps on as a safety net (00:24:19, 00:24:54); MergeVisible
creates a new Tool and leaves the working Tool with separate pieces (gitoJ7B8FmY 00:03:31). Merging
is not DynaMesh: re-DynaMesh to fuse (FrqUnna1jns 00:23:25).

**Polypaint judgment** (Logic Part 8): judge colors on a flat material (SkinShade4), because shiny
or tinted MatCaps lie about hue and value, and paint at the highest level (All High) for paint
resolution (VRisbJQAaZw 00:23:40 to 00:24:54). Owned by scenario-zbrush-paint-render; listed here
because a remesh or projection decides whether the paint survives.

**Sculptris Pro** is "an exploration tool rather than a polishing tool", also for local detail
without raising the whole DynaMesh; Subdivide Size 0.045 jumped a mesh to 3.4M polygons (VRisbJQAaZw
00:10:41, 00:13:49). Dynamic Subdiv: edit the cage low, see it high; Apply makes real levels
(00:02:20, 00:04:08).

## Michael Pavlovich (Director of Character, Weapon and Vehicle Art, Certain Affinity; ZBrushLIVE host)

Sources: Intro to ZBrush 005, 010, 015, 017, 019, 021, 026, 029, 030 (rEIoFEEgS80, 1sYMoWz_Mk4,
AdkZe1yKFTU, aR02CwyPTUw, 8kWFv1cZlCE, 5JM1fb7wnTM, TjGlVX4w1nM, 9qLbeAapUH0, bBHqeaKNOzg; 2021).

- **Stroke settings decide whether a scripted stroke behaves like a hand stroke** (AdkZe1yKFTU).
  Standard has LazyMouse on at radius 1, which swallows taps and short strokes; he turns it off for
  dots, pores and veins and uses radius about 27 for designed lines (00:03:31, 00:05:05).
  ClayBuildup resets to LazyStep 0.1, LazyRadius 1, "just enough to smooth out the stroke"
  (00:10:33); stepping fix order: LazyStep down, Roll Distance up (4), Mouse Avg last (00:11:06,
  00:18:37). Stroke Jitter and Brush Imperfection are global and follow you onto every brush
  (00:09:52). Crisp stamps come from Focal Shift -100 (00:08:17). Replay Last (1) strengthens the
  last stroke in place (00:16:21).
- **Masks as the bridge to deterministic operations** (8kWFv1cZlCE): a mask plus Tool > Deformation
  Inflate is "one of my favorites"; blur the mask first for falloff (00:17:10, 00:17:44); mask then
  Polish or Smooth, or Color > Fill Object, instead of strokes (00:20:38, 00:21:11). DynaMesh
  without Colorize on loses the polypaint (00:20:06). Edge-respecting masks: Depth Mask on the mask
  brush with tiny non-zero depths (00:14:48); ZBrush 2026.2.1 ships a Toggle Mask Depth macro
  (InnerDepth -0.01, OuterDepth 0.01).
- **Polygroups as selection sets** (5JM1fb7wnTM): Groups By Normals Max Angle 90 behaves like Auto
  Groups on a cylinder, about 48 splits caps from sides (00:02:30); Ctrl+W is Group Masked Clear
  Mask (00:03:33).
- **Gizmo for almost everything, Transpose for exact axes** (9qLbeAapUH0 00:14:08, 00:16:14). Since
  2022 the Gizmo deforms softly unless Focal Shift is -100 (Gizmo doc).
- **Materials for judging** (aR02CwyPTUw): MatCap Gray to sculpt (00:01:26); Red Wax to enhance
  surface differences, Chrome for polished surfaces (00:03:32); a Standard material with the light
  moved front, side and behind to see whether forms read (00:04:39).
- **Files and names** (rEIoFEEgS80, bBHqeaKNOzg): Tool > Save As for .ZTL, Ctrl+S saves a project;
  the top SubTool takes the file name. Owned by scenario-zbrush-expert.
- **Rhythm** (1sYMoWz_Mk4 00:02:50 to 00:05:01): carve with Dam_Standard, build with Clay, smooth,
  trim, Move, Ctrl+drag re-DynaMesh, carve again; check each brush's Z before using it (00:03:54).

## Kris Costa (former lead creature modeler at ILM; portrait instructor), Realism Idealized (j5XLtLMN0P8, ZBrush Summit 2021)

- Primary, secondary and tertiary are a matter of viewing distance: eyelids are primary when you
  work on the eye, a "fractal progression" (00:08:12 to 00:10:25). Sketch primary and secondary
  together to catch the expression, then fix proportions through the lower levels without touching
  it (00:11:12).
- Only ClayBuildup for forms: it "respects the boundaries between the different forms"; Standard
  only for veins (00:12:58 to 00:13:38). Subtle forms in very thin layers at ClayBuildup 2 or 3;
  forms must not "scream" (00:16:13 to 00:17:12).
- Judge under physically accurate renders with several lights from the first sketch; a volume right
  under one light looks off under another (00:18:46 to 00:19:51). Asymmetry is "the only way" to
  capture likeness (00:35:03).
- Eyes placed straight ahead at 90 degrees look cross-eyed: rotate each outward 3 to 7 degrees (the
  kappa angle), about 5 on average, more for a wall-eyed look; eyeball about 24 mm (00:29:10 to
  00:30:16, 00:39:06). `zs.eye_rotation` carries the range.

## Joseph Drust (Pixologic, #AskZBrush) and Outpost VFX

- Morph Target stores every vertex of the SubTool; the Morph slider blends back globally, partial
  values soften a too-strong pass, negative values exaggerate; a mask limits it; the Morph brush
  reverts locally with crisp edges (B_wKwXwjcZs 00:00:41 to 00:05:20). One target per SubTool, point
  count must not change (Morph Targets doc).
- Outpost VFX 17 Pro Tips (2022): primary before secondary before tertiary, silhouette checked
  constantly (tip 1); two or three brushes learned deeply (tip 3); test alpha depth on a layer and
  dial it (tip 5); Morph Target to recover volume lost when smoothing thin parts (tip 7); add one or
  two subdivision levels to test sharper detail on a DynaMesh without committing (tip 9);
  BackfaceMask on thin meshes, in Brush > Auto Masking per the 2026 docs (tip 11).

## Maxon documentation (help.maxon.net, 2026)

- DynaMesh is "a concept creation tool and not intended for highly detailed sculpting"; quit it when
  detailing starts. Details survive a remesh inside a 1024 cube; the cap is a 2048 cube, about 24M
  polygons per SubTool; low resolution tolerates bigger pushes. Remesh only in Draw mode with the
  mask cleared. DynaMesh deletes UVs and keeps polypaint instead of polygroups when polypaint is on.
- Sculptris Pro works only without subdivision levels, not on primitives or ZSpheres, only with
  Dots, FreeHand and Spray strokes; slowdown from about 200k to 4M triangles; decimate to 20 %.
- Divide adds a level only when nothing is masked or hidden; smoothing scale is set by the
  subdivision level (smooth big forms low, return up).
- Clicking a Smooth brush only binds it to Shift; it cannot be the active sculpting brush.
- Layer brush sculpts at constant depth after a fresh Store MT; LazyMouse non-buildup needs Chisel
  or Layer, LazyMouse on and a Morph Target.
- Tool > Deformation sliders act on global axes and apply once per set; masks restrict them; Gizmo
  deformers need a mesh without subdivision levels.
- Masking modifies "all editing (sculpting) actions, whether applied directly or adjusted in the
  Deformation sub-palette"; Mask Changed Points and Groups Changed Points turn a stroke's footprint
  into a mask or a group (2021.7).
- ZSpheres are the only geometry the Python SDK can read and write point by point (`add_zsphere`
  inside `edit_zsphere`, SDK modeling docs); curves built with `add_curve_point` live in the tool's
  coordinate system, not canvas space (SDK example).

## Where the experts disagree, and the deciding condition

| Choice                           | Positions                                                                                                                                                                                  | Decide by                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoothing                        | Pablo smooths constantly in blockout, Move plus Smooth (tbQqC6tyDBQ 00:02:29); Henning resculpts, smooths only to destroy or at "good enough" (0PaYUUvgwYM 00:05:32; TpS0QdlfHWU 00:22:58) | low-res blockout: smooth freely (agent: Polish slider); organic skin from S2 on: resculpt; dense meshes: Smooth Stronger at about 30                                             |
| First remesh route               | Pablo: light skin, low DynaMesh per piece, merge, 256, ZRemesher, SDiv 5; Henning: DynaMesh ladder to 648, or Divide the sphere mesh                                                       | limbs from ZSpheres: Pablo; a head sketch from a sphere: DynaMesh ladder; levels needed for big later changes: ZRemesher plus projection                                         |
| Clay stroke direction            | Henning across only; Pablo along first, then smaller across                                                                                                                                | both finish across; along-first suits long masses (limbs, neck, muscles)                                                                                                         |
| ClayBuildup alpha                | Henning Alpha 06, Morten no alpha, Pablo keeps the alpha with Roll Dist about 6                                                                                                            | Alpha 06 to build with texture, Alpha Off for the last passes                                                                                                                    |
| Dam_Standard Z                   | 15 (0PaYUUvgwYM frame 00:19:34) vs 33 (TpS0QdlfHWU frame 00:05:54)                                                                                                                         | fine carving on a dense mesh low, big cuts higher [inferred in the digest]                                                                                                       |
| Order of primary and secondary   | Henning, Pablo: gate strictly; Costa: sketch both together, then fix proportions low                                                                                                       | a portrait's expression: Costa; a design from scratch: gate                                                                                                                      |
| Brush set                        | six stock brushes (Henning) vs stock plus custom detail packs (Pablo)                                                                                                                      | stock for forms; custom brushes only around feature details                                                                                                                      |
| Perspective                      | Henning shapes the eyes with perspective on (TpS0QdlfHWU 00:17:28); Shane keeps it off almost always, it skews masking, clipping and mirroring (t_gg7MIGSDM 01:41:03)                      | aimed strokes, masks and measurements orthographic; perspective only for a look render (`persp_snapshot_code`) [added]                                                           |
| Stay on DynaMesh or go to levels | Henning's bust stays DynaMesh to 648 (TpS0QdlfHWU frames 00:14:16 to 00:21:27); Pablo ZRemeshes and divides once the form is settled (rArw79xEpvE 00:05:50)                                | concept still with no later big changes: DynaMesh ladder; levels needed for big later changes, retopology or detail past the 648 rung (2.46M points): ZRemesher, Divide, project |
