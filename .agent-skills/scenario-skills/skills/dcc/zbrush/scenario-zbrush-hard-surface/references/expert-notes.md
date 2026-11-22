# Expert notes: ZBrush hard surface

The depth behind SKILL.md: principles and judgment by expert, each with its source and timestamp.
Video ids refer to notes in `notes/hard-surface/` and `notes/kitbash/`; digests are
`_digest_hard_surface_tools.md` (tools, with the addendum from the re-transcribed FOdVdgiAHWo and
FCAb-CSVCBg, which wins where it conflicts), `_digest_hard_surface_projects.md` (pipeline) and
`_digest_hard_surface_masters_plouffe.md` (visual language). Tags: [doc] Maxon documentation,
[strings] label or message found in `ZData/ZLang/english/UInterface.zsc` of the installed 2026.2.1,
[added] this skill's own inference, [verify] not confirmed.

Caption quality: several Pavlovich pistol and skull lessons are auto captions machine-translated
back to English (010, 012, 032 to 036, 039); no frame sheets exist for the Pavlovich batch.
Plouffe's stream has 35 viewed contact sheets. FOdVdgiAHWo and FCAb-CSVCBg were re-transcribed with
Whisper.

## 1. Marco Plouffe: how a surface reads as hard

Co-founder of Keos Masons, concept and 3D character artist for games and collectibles (Sideshow
Sentinel); ZBrush Masters stream hosted by Paul Gaboury, 2020, ZBrush 2020.1.1 on screen
(u75skb32GTo).

**Stance.** "Hard surface is not necessarily a technique, it's more like a result" [00:23:20].
Design organically with few constraints, then apply the language (clean surfaces, surgical edges,
bolts, separated plates) [00:22:13]-[00:23:52]. Efficiency governs: focus areas get the clean
method, a belt piece "nobody notices" stays dirty [00:19:58], [01:13:12].

**The rulebook** (this is the render critique; see `critique.md`):

| Rule                                   | Meaning                                                                                                                                                    | Source                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Straight or curved, never ambiguous    | "if you're trying to do a straight line do a straight line... but don't be in the middle"                                                                  | [00:52:55]                        |
| Edges carry the surface                | paired edges of a plane run parallel or taper at the same rate; if they diverge the plane twists and the highlight runs diagonally and dips ("wobbliness") | [00:59:02]-[01:01:47]             |
| Build: mass, edges, planes             | volume first, then insist on the edge lines, then flatten the facets                                                                                       | [00:25:02]-[00:28:00]             |
| Polish: planes, edges, corner softness | "working on the edges is less destructive to the planes than working on the planes is destructive to the edges"                                            | [00:51:13]-[00:52:20]             |
| Sharp to smooth                        | let corners get sharp, then widen chosen edges; different radii are fine if they "look planned"                                                            | [01:05:00]-[01:06:09]             |
| Wide edges catch light                 | the reason he keeps CreaseLvl 3 over a razor edge                                                                                                          | [02:19:11]                        |
| Do not mix sharp and round too close   | a sharp mask corner next to a round edge "doesn't work"                                                                                                    | [01:31:40]-[01:32:13]             |
| Mid details obey the big shapes        | small shapes repeat the angles and roundness of the large ones                                                                                             | [01:32:13]                        |
| Blur is intent, not mush               | too much blur looks "like you missed the target"                                                                                                           | [01:33:52]-[01:34:26]             |
| One cavity sells a plate               | an Orb_Cracks groove along a border reads as a separate module                                                                                             | [01:50:44]-[01:51:18]             |
| Function cues at surface level         | grilles mean heat removal, so a mainframe behind; "as long as you sell the illusion"                                                                       | [01:16:02]-[01:18:46]             |
| Detail from viewing distance           | clean at bust framing for a 1/4 statue, far less for 1/12; subdivide until pixelation disappears at the closest planned view                               | [01:10:56]-[01:13:12], [01:19:51] |

**Quick method** (dexterity on DynaMesh) [00:39:16]-[01:10:24]: DynaMesh 500 on an off-scale head,
3000 at standard scale, "as low as possible within the needs" [00:33:45]-[00:34:19]. Commit with a
navigation cage: duplicate, ZRemesher target 0.3 (about 300 polygons; defaults on screen Target 4,
Adapt on, AdaptiveSize 50, Curves Strength 50), Close Holes, regroup, Divide twice, Project All with
Dist raised until everything snaps (0.0625, Mean 25 on screen) [00:44:38]-[00:49:33], [frame
00:51:36]. hPolish without Alt digs, with Alt builds up; use Alt with a plane-sized radius next to
other planes [00:29:43]-[00:31:27]. A small radius "records brushstrokes" [00:56:36]. Clay brush
with Alt, one large stroke along a corner, gives a flat 45 degree chamfer; a bevel of the bevel plus
Smooth gives a round corner [01:06:43]-[01:09:16]. Fix wobbly planes at the edges (Move with
AccuCurve) and then re-polish [00:59:34]-[01:01:47].

**Clean method** (ZRemesher, Panel Loops, creases) [01:47:08]-[02:31:33]: clean the contour first
(Mask By Feature Border, invert, Deformation Polish, blur, repeat; or GroupsLoops Loops 1 or 0 with
some GPolish) [01:59:16]-[01:59:48]; ZRemesher at the lowest target (100 polygons), rerun with Adapt
off, accept about three stars [02:04:02]-[02:05:09]; a SliceCurve group line plus KeepGroups keeps
groups separate [02:06:59]-[02:08:40]; Panel Loops with everything at the minimum, Loops 1,
Thickness the only variable, Ignore Groups on; on screen Double on, Thickness 0.0046, Polish 0,
Bevel 0, Elevation -100 [02:09:12]-[02:09:43], [frame 02:14:34]; Dynamic on, Crease PG, Groups By
Normals 45 then 33 for a missed edge [02:10:14]-[02:13:01]; Polish Crisp Edges flattens everything
not creased: store a morph target, two passes, recover lines with the Morph brush; better, clean by
hand and run it once [02:14:41]-[02:16:57]; CreaseLvl default 15, at 4 razor through Dynamic levels
3 and 4, 3 kept, 2 too soft [02:18:03]-[02:19:44]; after Apply remove star pinches at a low level
with the Shift-release smart smooth, border hidden, dark polypaint and low-metal MatCap to see them,
because pinches pop under metal after the bake [02:25:59]-[02:28:48].

**Symmetry with levels** [02:00:53]-[02:03:39]: delete levels, Mirror (if the good side is wrong),
Mirror And Weld, Reconstruct Subdiv back to all levels; impossible if the mirror cut the mesh or
layers must survive.

**Budgets:** 10M polygons per SubTool, 15M to 20M only for a seamless nude; head 25M, full statue
100M to 150M [01:18:46]-[01:20:58]. Print: push the blocking inside every piece so everything
booleans into a watertight solid [02:40:38]-[02:41:45]. Games: same technique, fabric detail to
Painter, armor stays clean [01:14:21]-[01:15:28].

**For the agent:** Plouffe avoids masks and morph targets because dexterity is faster [01:03:11];
the agent has no dexterity, so it takes the clean method and checkpoints every time. Perfect half
circles come from primitives, not hand strokes [01:21:32]-[01:23:12], which suits the agent.

## 2. Michael Pavlovich: the tools

Games sculptor (Halo 4, Call of Duty, Doom), official ZBrushLIVE presenter, CGMA instructor. "Intro
to ZBrush" series (2021) and two 2024 updates.

**Dynamic Subdivision and creasing** (qeFclVta4No, 2021):

- No real levels while box modeling: ZModeler stops on a mesh with levels [00:01:03]. D toggles
  Dynamic on, Shift+D off; the first time ZBrush asks for confirmation [00:01:34].
- "My general rule is to crease first, and then add a control loop if necessary" [00:08:18]. Loops
  near a cylinder cap fix scalloping [00:08:34]-[00:09:07].
- Groups By Normals: 45 catches 90 degree edges, 60 misses some, 33 catches smaller plane changes;
  then Crease PG [00:11:10]-[00:12:15].
- CreaseLvl versus Smooth Subdiv: "If it's equal or greater, it'll always be super sharp"; he works
  at 2/3; 2/4 "is what I would bake, so you get a nice highlight on that edge"; 1/4 very soft
  [00:14:11]-[00:16:29].
- Crease PG after more modeling recreases borders you had uncreased; merge unwanted groups first or
  crease loops manually [00:16:32]-[00:17:49].
- Crease Tolerance 45 equals Group By Normals 45 plus Crease PG [00:18:05]; 22 held an arch without
  creasing its small angles; too low creases the arc [00:22:59]-[00:23:30]; arch finish 3/4
  [00:24:00].
- QGrid packs polygons on every edge, including interior edges that do not shape the silhouette;
  QGrid-only Apply has no history [00:27:54]-[00:29:26].
- Bake split: duplicate; Shift+D on one for game-res (fix over-curved edges), Apply on the other
  [00:25:50]-[00:26:20]. Sculpting with Dynamic on does almost nothing until Apply [00:26:51].

**Live Boolean** (HXnKnrhlFpA, 2021): main body on top, cutters below [00:00:33]; cutters inherit
Dynamic smoothing and scallop, so crease them by tolerance [00:01:30]-[00:01:42]; DSDiv before Make
Boolean Mesh or the result is faceted; output is a new UMesh tool [00:02:31]-[00:03:00]; inputs
"nice and crispy with very hard edges" let ZRemesher Detect Edges at Half rebuild clean quads
[00:03:00]-[00:03:31]; duplicates revert to Union [00:05:01]; a union part pushed too deep is sewn
to the body; Start groups or folders keep it separate [00:06:31]-[00:07:30]; the folder menu has
Boolean With DSDiv [00:09:00]-[00:10:00].

**Clip, Trim, Slice** (03BMMabyK8U; FOdVdgiAHWo re-transcribed):

- Clip pushes polygons, never cuts topology [03BMM 00:00:16].
- Never Clip past the widest part of the form: it leaves "that residual ring around the object"
  [FOdV 00:03:56]. Use Trim, or Slice plus Del Hidden plus Close Holes.
- "Clip works across an axis. Slice and trim do not"; Mirror And Weld after Slice or Trim, with
  Deformation Mirror first when the cut is on +X [FOdV 00:06:20]-[00:07:59].
- Drag direction picks the Clip side [FOdV 00:02:51].
- Slice cuts a perfectly straight line with untidy topology: treat it as a group divider, then
  ZRemesher [FOdV 00:05:46].
- Trim is Slice, isolate, Del Hidden, Close Holes [FOdV 00:08:35]-[00:10:10].
- The manual straight-cap route is "a lot of steps"; he uses Live Boolean instead [03BMM 00:03:37].
  The video description now points to Knife.

**Knife and Split To Parts** (8LNjAkqr_lI, 2024): prepare the base first (Make PolyMesh3D, ZRemesher
Half + Detect Edges + Adaptive Size 0, Divide 4 times, Delete Lower) [00:04:04]-[00:05:09]; Split To
Parts leaves no gap, BRadius leaves a gap of Draw Size and does not mirror [00:01:34],
[00:05:31]-[00:06:15]; after cuts ZRemesher Keep Groups on, Detect Edges off, Smooth Groups 0
[00:10:14]; invisible floating debris makes ZRemesher fail [00:10:46]-[00:11:58]; Crease PG alone
looks "very CG, very sharp", so 2/3 [00:13:19]; Crease Unmasked (2024) creases only the unmasked
region [00:16:54].

**ZModeler** (XcR5TzvIaoc, qob31SzC754): QMesh, not Extrude, is the default polygon action (snaps,
stays welded, deletes on a negative drag, stitches) [XcR5 00:04:33]-[00:15:05]; X symmetry overrides
the PolyGroup All target [00:10:42]; Mirror And Weld makes groups identical on both sides
[00:11:14]; Inset Equidistant adds edges on messy topology, Legacy keeps straight lines
[00:20:55]-[00:22:34]; Insert EdgeLoop plus Alt deletes loops [qob3 00:00:27]; Insert Multiple
EdgeLoops with Interactive Elevation makes fillets [00:02:16]; Optimal Curvature and Resolution
match bridges to the surrounding edge length [00:06:04]; temporary Dynamic thickness (Smooth 0,
Thickness above 0) makes single-sided edges pickable [00:04:24]. 2026.0 adds creasing on Insert
EdgeLoop (Crease or Do Not Crease, default Do Not Crease) and Inset (Crease New Edges for a crisp
inset with supported borders, Crease Inner Poly for a rounded one), replacing the
alternate-polygroup plus Crease PG pass (Maxon, 6KZiNEO65YY [00:01:06]-[00:02:44]); Plouffe's 2020
trick of inserting loops and inflating them because Inset and Extrude erased creases (u75skb32GTo
[02:20:17]-[02:21:25]) is superseded by these options. 2026.2.1 adds Bevel edge modes (All, Outer,
Inner Edges [strings]) and fixes ZModeler defaulting to Extrude instead of QMesh (release notes).
For the agent the options are Space-menu state: save them in a brush or preset once, then replay
with one canvas input (procedures P14) [added].

**ZRemesher on hard surface** (6PtmKtr1kx0): smooth polygroup borders first, because ZRemesher "is
going to look at all of these aliased lines and try and build those in" [00:07:56]; Slice-curve
group lines place loops better than the guides brush [00:06:48]; Adaptive Size 0 keeps quads even
[00:08:59]; detail comes back with Divide plus Project All, never re-sculpted [00:10:04]-[00:10:35];
Remesh By Union welds parts without changing their surface [00:12:12]-[00:12:44].

**Gizmo deformers** (FCAb-CSVCBg, re-transcribed): deformers run along the Gizmo axis, so split an
IMM insert into its own SubTool first (Split Unmasked Points) and the Gizmo aligns to the part
[00:01:09]-[00:01:45]; Bend Curve: set the curve axis first, then Curve Resolution
[00:01:45]-[00:02:20]; commit with W or gear > Accept [00:02:20].

**IMM, NanoMesh, IMM strokes** (U5u3RpI9In4, QGNn1-ey6ME, wnONEaRVhYU):

- IMM capture: "how you capture them is important". Orientation comes from the camera, names from
  SubTools, Unify first [U5u3 00:15:04]-[00:19:08].
- Ctrl while dragging snaps an IMM to the brush size [U5u3 00:12:30].
- Projection Strength 100 conforms a plate; low keeps its shape [U5u3 00:10:56].
- A low-res DynaMesh fuses small parts [U5u3 00:03:58].
- Keep repeated hardware as NanoMesh, so "the art director says... no problem" is one Edit Mesh
  swap. Fix the swapped scale with Unify [QGNn 00:12:26]-[00:13:32], [00:17:56].
- Levels block IMM insertion: keep a hidden level-free placeholder SubTool at the top [QGNn
  00:14:07]-[00:15:46].
- LazyStep is the spacing: 1 overlaps half, 2 touches (his guess: primitives are 2 units), 2.5 for
  rivets, 0.4 for tubes; 0 breaks the Dots stroke [wnON 00:03:43]-[00:05:25], [00:22:20].
- Ghost transparency lets a run pass over earlier parts [wnON 00:17:30]. Curve Mode handles tapers
  and swaps [wnON 00:19:37]-[00:21:47].

## 3. Michael Pavlovich: projects (skull 2020, pistol 2017)

- **Exploration resolution:** skull at 128 and 96 too low for hard surface, 176 the "happy medium";
  do not re-project while designing [1iJ_sO1U0V4 00:01:03]-[00:02:07].
- **Brushes:** hPolish keeps edges (Preserve Edge in Brush > Samples), TrimDynamic "will absolutely
  destroy an edge", which is how to bevel; oversize polish brushes; BackfaceMask on for thin parts
  [qBi-JF23r4Y 00:01:00]-[00:03:34], [00:07:32].
- **Detail where the bake shows it:** fill cavities nobody sees and paint dark AO; at 512 to 2048
  maps perfect sub-D does not pay; "if it's gonna save you days of work later to put in an extra
  hour and a half... do that" [max2JumNDp4 00:01:06], [00:05:14]-[00:05:48].
- **Slice + DynaMesh Groups** makes perfectly fitting embedded panels; regroup and remesh to weld
  leftovers [Yprguxci8NY 00:01:05]-[00:02:43].
- **Masks:** jagged mask borders become aliased polygroups; clean with Edgeloop Masked Border or
  Mask By Feature plus Polish By Features [MteQbBFxgqk 00:02:06]-[00:03:12]. A curve IMM along a
  framed border, set subtractive, is a live cut line [00:03:12]-[00:04:17].
- **Close Holes** on complex openings needs a few Bridge Edges at the major turns on half the model,
  then Mirror And Weld; Polish By Features near a straight cut damaged it [16AAIFE9CRc
  00:00:34]-[00:02:46], [00:11:45].
- **Lightweighting:** plan pockets in Polypaint, mask by Polypaint per color; "in a production
  setting... I would absolutely boolean those little back notches" [FAFtW_8zB5Q 00:00:00],
  [00:11:28].
- **Panel seams:** a three-part curve InsertMesh (Tri Parts, Weld Points, creased, Imbed 0) along a
  framed polygroup border, subtracted live; build the path from a slice or a ZRemeshed strip snapped
  back with Project All [FM3uQJy1GUY 00:01:03]-[00:05:51].
- **Screw port across a seam:** one sliced sphere, half merged into part A, half subtractive on part
  B; Crease PG plus two Divides on the halves before remeshing [cw449pmS64g 00:01:06]-[00:04:34].
- **Blocking a weapon:** break the concept into base shapes; model only the base in ZModeler and
  boolean the cut-ins later [TANNfCLxFx4 00:01:13]. A perfectly round barrel fixes the gun's width
  [00:04:54]. Cylinders with 8, 12, 16, 24 or 32 sides keep a vertex line on both axes [00:06:44].
- **Clip trap:** ClipCurve plus DynaMesh leaves thin stretched strips; TrimCurve removes material
  [GrIf_eeq6K0 00:02:07]-[00:02:37].
- **Vents:** ArrayMesh is "my preferred method because less destructive"; instances and the Live
  Boolean update live; Repeat 4 to 5 with a negative Z offset; a rounded, creased cutter pushed
  deeper widens its chamfer; watch wall thickness [x1gN9-SocYY 00:08:35]-[00:12:19].
- **Cutter numbers:** QGrid on a cylinder facets; Smooth 3 / CreaseLvl 2 is his cutter default, 4
  and 3 or 4 tighter; crease open ends by hiding the rest and pressing Crease; DynaMesh off on
  cutters [KroRw6dFs10 00:01:00]-[00:02:39], [00:07:15]. For an agent the DynaMesh-off rule guards
  against nothing (it matters because a human Ctrl+drag remeshes), but it costs nothing [added].
- **Start groups:** any SubTool without its own Start group is unioned into the main part on Make
  Boolean Mesh; DSDiv on [Ab0ixptmNeA 00:00:00]-[00:01:07].
- **UMesh part cleanup:** Group By Normals, ZRemesher Keep Groups, Smooth Groups 0, Target "Same",
  Adaptive Size a bit lower [QbEHsPGNnlY 00:00:33].
- **Quick game low poly:** find the lowest DynaMesh resolution that gives a gap-free shell (1000 on
  the pistol), apply it to every SubTool, then one Decimate All percentage (25,000 of 1.671M; he set
  1.4 and got about 23k); keep animated parts separate; he calls it hasty [VfUqkvHymeQ
  00:00:32]-[00:02:37]; [h5gsm_-6df4 00:00:31]-[00:01:01].
- **DCC and bake:** ZBrush units make tiny edges zero-length in Maya cleanup, so scale up first; 4
  px padding at 2048 [iWq7dFxf55I 00:02:54]-[00:03:56]. Bake by mesh name, Polypaint as the ID map;
  rebake ID alone if it fails [te7lV_EpGQ0 00:00:00]-[00:00:33].

## 4. Mike Klimer (Bungie, Destiny 2 weapons, ZBrush Summit 2017)

Senior hard-surface artist at Bungie, previously The Division (08crkU999Fs; self-introduced).

- **Function and manufacturing:** "anybody can take 50 different parts... dynamesh it into something
  and then call it a sci-fi weapon"; ask how the round or energy travels, how it is milled or
  molded, where mold lines and injection points go [00:22:18]-[00:23:59].
- **Player camera:** first person and ADS get the effort; the harsh wide angle turns stacked small
  shapes into clutter ("six rat butts"), so simplify [00:11:57], [01:16:23]-[01:17:31].
- **Validate twice:** a 500 to 600 up to 30k to 40k polygon block in engine with the rig and hands;
  then a decimated high (9M points to under 1M) with the animation, before the low poly and textures
  [00:16:27]-[00:17:32], [00:36:13]-[00:36:45].
- **Micro detail after sign-off, on layers:** negative strength carves in, duplicating doubles
  strength, layers do not survive added or removed geometry [00:29:36]-[00:34:30], [00:49:08].
  Consequence for the agent [added]: layers come after the last boolean, remesh, Panel Loops or
  Apply, and `layer_safe` compares the point, face and level counts recorded at layer creation.
- **Mask refinement by repetition:** blur, invert, blur, invert gives every corner the same fillet
  radius and removes stray bits; group borders are cleaned with the SmoothGroups brush instead of
  border loops, because a layer cannot survive added geometry [00:46:21]-[00:49:42]. Scripted as
  `mask_fillet`; Polish By Groups is the stroke-free stand-in for SmoothGroups [added].
- **Consistency is a rule:** repeated cut angles all the same (22.5 degrees), one fastener type per
  family, one artist per weapon suite [00:29:04], [01:00:37]-[01:01:10], [00:57:03].
- **Canvas areas:** leave big open areas on base weapons so shaders, decals and camo read
  [00:37:54].
- **Bevels:** plan them in the low-poly block with ZModeler ("the easier way"); he brute-forces at
  6M points [01:08:20]. His own ZRemesher plus auto-reduction low poly was "the nastiest mesh I've
  ever shipped" [01:22:43].

## 5. Henry Chervenka (3D Dynamic Studios, ZBrush Summit 2023)

CEO of 3D Dynamic Studios, hard-surface instructor (PGX39tnEf3Y).

- Two phases: shape and proportion first, "I don't care about topology"; then topology [00:05:05].
- Start every project the same way: Unify (about 2 units at world center, then scale up a little), Z
  forward, perspective off for Clip, Trim, Knife and Slice [00:08:24]-[00:10:33].
- NanoMesh when instances must follow faces (treads, bolts), with even face sizes; ArrayMesh for
  patterns, Convert To NanoMesh for rotation variation [00:10:33]-[00:24:18]. Bolts on a wheel: a
  Fastener IMM turned into a NanoMesh brush, NanoMesh Rotation and Rotation Variation for realistic
  random angles [00:17:55]-[00:19:39]. No face where a bolt goes: drag a plane, split it off,
  Dynamic off, draw the NanoMesh on it, Show Placement off [00:20:15]-[00:21:24]. The ArrayMesh
  route without any drag: duplicate a SubTool, pick the fastener brush, Modify Topology > Mesh From
  Brush, ArrayMesh (Reset, Lock Position, Lock Size, TransPose, Repeat, Rotate Z Amount 360), then
  Convert To NanoMesh [00:21:24]-[00:24:18]; scripted as `fastener_from_brush`,
  `array_mesh(rotate=[0, 0, 360])`, `array_commit("nano")`, `nanomesh_set(ZRVar=...)`.
- ZRemesher "the less information we give it as far as geometry the better... the more information
  you give it as far as instructions the better": delete holes and hidden bottoms, keep bevels tight
  not round, polygroups, Keep Groups, Smooth Groups 0, Adaptive Size 25 [00:32:14]-[00:37:48];
  off-center symmetric parts through the Gizmo's Remesh by ZRemesher [00:36:07].
- Clean topology without volume loss: Store Morph Target, smooth or polish, Project Morph
  [00:24:52]-[00:27:11].
- Macros are the most underused speed tool; his Mask Border Polish is mask by border, invert, blur,
  Polish By Features about three times, clear [00:04:00], [00:48:52].

## 6. Polycount author (ProBoolean plus DynaMesh, 2016)

Game hard-surface artist (unverified identity). Keep the model procedural in the DCC; ZBrush only
makes the high poly with DynaMesh (256 in his example) plus Polish; the low poly is the same boolean
stack with fewer segments; cylinders at 36 minimum, 108 to 140 for large ones; "ZB [provides] the
'minimum' edge width. Any chamfers that need to be specifically larger I'll do with boolean
subtractions." His claim that modeling in ZBrush "backfires" on revisions predates Live Boolean with
ArrayMesh and Start groups.

## 7. Maxon documentation (rules the experts assume)

- **Live Boolean** [doc]: no coplanar faces, watertight volumes, consistent density, low Dynamic
  Subdivision (DSDiv makes long thin polygons); processed top to bottom, the first SubTool Add or
  Start, only visible SubTools; unsupported: HD geometry, 3D primitives, render-time objects,
  partially visible meshes (hidden openings are closed); removed: UVs, textures, levels (cannot be
  reconstructed), creases, layers, masks; polygroups and polypaint propagate; smooth before the
  boolean. Show Coplanar before, Show Issues after. 2026.2.1 strings add two blocking notes: a
  coplanar warning with "Do you really want to launch Boolean whatever?", and "Every input SubTool
  must be a valid Solid" [strings].
- **Dynamic Subdivision** [doc]: QGrid, then Flat, then Smooth, whatever order you set them; each
  step x4; Apply: QGrid 1 + Flat 1 + Smooth 3 gives 5 levels; Smooth turns a triangle into three
  quads on the first level; D and Shift+D step classic levels when they exist.
- **Mesh Integrity** [doc reference]: Check Mesh and Fix Mesh after heavy topology operations; the
  2026.2.1 strings show the check answers through a note ("completed successfully" or "failed ...
  Please 'Fix Mesh'"), so the agent measures the same things with `hygiene` on an OBJ export
  [added].
- **Hard-surface tools** [doc]: Clip moves polygons and never changes topology; Trim caps flat;
  Slice adds a cut and groups, no symmetry, no levels; Knife cuts and closes with quads, works with
  symmetry, cannot cut holes through the middle; BevelPro bevels along group borders; Panel Loops
  with Loops, Double, Append, Inner, Thickness, Polish, Bevel, Elevation, Bevel Profile, Ignore
  Groups, no levels; ZRemesher on hard surfaces wants a higher target, Keep or Freeze Groups, Frame
  Mesh curves at Curves Strength 100.
- **ZModeler** [doc]: PolyMesh3D only, no levels for topology actions, quads and triangles only,
  every action replays on a click; QMesh fuses and deletes itself on a negative drag; an EdgeLoop
  stops at odd-valence vertices, a PolyLoop continues.
- **Gizmo deformers** [doc]: only on meshes without levels; parametric primitives replace the
  SubTool unless it is fully masked; Flatten's Slice Topology adds a creased loop that "drastically"
  improves Dynamic Subdivision results.
- **IMM, ArrayMesh, NanoMesh** [doc]: an IMM stores meshes as seen on screen; save the brush or lose
  it; Mesh Fusion needs open borders and no DynaMesh mode; ArrayMesh stages, pivot, TransPose mode,
  Convert To NanoMesh; NanoMesh placement by polygroup, Edit Mesh, several indices.

## 7b. Handoff features added from 2023 to 2026.2 (`sources/zbrush-version-deltas.md`)

- **Substance Bridge** (2026.2.0, VD 3.6): Texture > Substance Bridge > Send to Painter with All,
  Visible or Active; Subdivision Level Current or Low & High; Auto-Bake Maps; Smooth Normals; Send
  PolyPaint as a fill layer; Texture Sets per SubTool or per PolyGroup. Force UV Auto-Unwrap is
  global and strips existing UVs from every SubTool; each send creates a new Painter project, with
  no incremental update; Auto-Bake with all options on did not trigger on Mac before 2026.2.1. It
  supersedes the manual low and high export of Pavlovich's 2017 bake lesson for quick bakes
  (te7lV_EpGQ0 Outdated). For hard surface [added]: Low & High reads each SubTool's own lowest and
  highest level, so the `bake_split` copy (Apply) carries both; after Apply with QGrid 0 level 1 is
  the Dynamic cage (DSUB Apply rule). Checked by `bridge_preflight`.
- **Native Unwrap** (2023, VD 3.5): Tool > UV Map > Create (Unwrap) with Auto Seams, Creased Edges
  and Symmetry; "Creased PG Unwrap" was fixed in 2026.1.2. On a hard-surface cage the polygroups
  already are the crease plan, so Crease PG seams fall on the hard edges [added];
  scenario-zbrush-retopology-export's `unwrap_creases` runs it.
- **Retopo brush** (2026.1, VD 3.5): a manual low poly inside ZBrush; the first click asks Yes or
  No; a SubTool with levels cannot become the retopo mesh. Stroke-driven: a GUI step.
- **Knife and Split To Parts** (2021.7 to 2024, VD 3.4) replace most Slice and Trim panel routines;
  Knife cannot cut holes.

## 8. Disagreements and deciding conditions

| Choice                      | Option A                                                    | Option B                                                                                                             | Deciding condition                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Edge hold                   | crease (Crease PG, tolerance)                               | control loop                                                                                                         | crease by default; loop when the falloff must be local or survive outside ZBrush (Pavlovich)                                                                                                     |
| CreaseLvl gap               | 2 below (Pavlovich bake 2/4, the wider edge)                | 1 below (Pavlovich arches 3/4; Plouffe keeps CreaseLvl 3 over 4 and 2, smoothing level not stated; the tighter edge) | render both under metal at the planned distance, keep the widest edge that still reads intended                                                                                                  |
| Where the base is modeled   | DCC booleans, ZBrush for the high (Polycount; Bungie's Lee) | all in ZBrush (Pavlovich, Chervenka)                                                                                 | frequent revisions and a low poly from the same stack: DCC; exploratory or curved: ZBrush. For the agent: ZBrush primitives plus Live Boolean, or a DCC block when ZModeler-style edits dominate |
| Commit booleans             | DynaMesh high plus Polish (fast, destructive)               | Make Boolean Mesh with DSDiv and Start groups                                                                        | concept or quick bake: DynaMesh; parts that go on to ZRemesher or a low poly: Make Boolean Mesh                                                                                                  |
| Repeats                     | ArrayMesh                                                   | NanoMesh                                                                                                             | linear or radial pattern: ArrayMesh; follows faces or needs variation: NanoMesh (or ArrayMesh then Convert)                                                                                      |
| Game low poly               | fused DynaMesh shell plus one Decimate All                  | dedicated low poly with UVs                                                                                          | static prop or deadline: quick; animated parts, LODs, clean shading: dedicated                                                                                                                   |
| Panel lines                 | Orb_Cracks by hand (Plouffe)                                | curve IMM seam or boolean, or Painter (Pavlovich, Bungie)                                                            | agent: reproducible seams or Panel Loops; fine lines likely to change: texture                                                                                                                   |
| How much function           | "sell the illusion" (Plouffe)                               | ground every part (Klimer)                                                                                           | first-person hero weapons and families: Klimer; collectibles, armor, concept: Plouffe                                                                                                            |
| Scale                       | proportion only, fix later (Pavlovich pistol)               | physically correct in the block (Klimer)                                                                             | rigged game asset: correct scale; concept: proportion; always Unify for tool behavior                                                                                                            |
| ZRemesher role              | a cage for projection (Plouffe 0.3, 100)                    | final topology (Pavlovich, Chervenka)                                                                                | output subdivided again: lowest workable cage; game low poly: the others' settings                                                                                                               |
| Mask refinement             | blur then sharpen, one-sided blur (Plouffe)                 | blur, invert, blur, invert (Klimer)                                                                                  | deliberate soft and crisp sides: Plouffe; uniform fillets: Klimer                                                                                                                                |
| Fitted parts (visor, hatch) | Knife with Split To Parts (Pavlovich 2024)                  | Slice plus DynaMesh Groups (Pavlovich skull 033)                                                                     | a freehand outline: Knife (GUI); for the agent, one cutter used twice (Intersect and Subtract Start groups, `fitted_split_groups`) or DynaMesh Groups on a group outline [added]                 |
| Chamfer width               | Polish or DynaMesh minimum (Polycount)                      | Crease Bevel, BevelPro or a boolean chamfer                                                                          | any width the brief fixes or repeats: Crease Bevel or booleans; free sculpted bevels: Plouffe's Clay Alt or TrimDynamic (Plouffe digest, Bevel making)                                           |
| Star pinch cleanup          | smart smooth at a low level, border hidden (Plouffe)        | StoreMT, smooth or polish, Project Morph (Chervenka)                                                                 | a few local pinches: smart smooth (GUI); whole-surface cleanup without volume loss: the morph route (Plouffe digest)                                                                             |
| Painter handoff             | Substance Bridge Low & High plus Auto-Bake (2026.2)         | OBJ per part plus an external bake by mesh name (Pavlovich 2017)                                                     | a quick bake from ZBrush with polypaint IDs: Bridge; a DCC low poly, custom cages or an engine-specific tangent basis: OBJ and scenario-zbrush-retopology-export [added]                         |

## 9. Where generic ZBrush advice goes wrong (baseline Z3, `tests/baseline/answers.md`)

- QGrid 1 with Coverage on a helmet shell: QGrid facets curved spans (Pavlovich qeFclVta4No
  [00:22:59]); use Smooth Subdiv with Crease Tolerance.
- "CreaseLvl 2 to 3" without its relation to Smooth Subdiv: the gap, not the value, sets the edge
  (qeFclVta4No [00:15:27]).
- Groups By Normals at 30 degrees: the experts start at 45 and drop to 33 only for missed edges.
- Scale Master to 1 unit = 1 cm before modeling: tools behave on Unified size (Chervenka
  [00:08:56]); set export scale at the end (iWq7dFxf55I).
- FBX via FBX ExportImport: its options window blocks a script (lead traps); export OBJ per part.
- `Tool:NanoMesh:Convert to real mesh` does not exist: the labels are `m.One To Mesh`,
  `m.All To Brush` or Convert BPR To Geo [strings].
- Mirroring without the negative-to-positive rule loses the edited side (Pavlovich 8LNjAkqr_lI
  [00:06:49]).
- Nothing about Start groups, DSDiv, coplanar faces, debris or ZRemesher after the boolean: the four
  things that break the pipeline in practice.
- UV Master with polygroups on the game low poly: the experts do hard-surface game UVs in a DCC
  (Klimer [01:02:54]; Chervenka [00:17:21]).
- Checking a stroke start with `pixol_pick` depth: depth (component 1) is broken in the SDK stub.
- No visual language: nothing checks straight versus curved, plane highlights or edge width.

Generic claims found wrong in the blind Z3 grade (`tests/grading/Z3_grade.md`), useful for any
hard-surface plan:

- "Make Boolean Mesh at a resolution": no such control. DSDiv carries the Dynamic smoothing; without
  it the faceted cage is booleaned (Ab0ixptmNeA [00:00:00]-[00:00:33]). Resolution belongs to Remesh
  All. The result is triangulated only where the operation happened (LB doc Data Preservation).
- An Intersect operand keeps only the overlap (x1gN9-SocYY [00:13:49]; LB doc operators): on a shell
  it deletes everything else. Polygroups at a cut come from the operands.
- Creases set before a boolean are removed by it and must be restored (LB doc "Removed: creased
  edges"); a cage taken "before Dynamic" does not contain cuts made later on the UMesh.
- Panel Loops Elevation: positive is raised, negative recessed (HS doc Panel Loops; Plouffe -100).
- Boolean analysis lives in Render > Render Booleans (Show Coplanar, Show Issues), not in Tool >
  SubTool.
- A NanoMesh brush is made with Brush > Create > Create NanoMesh Brush and is a ZModeler brush, not
  an IMM mode (QGNn1-ey6ME [00:09:21]-[00:10:28]).
- 4/3 is not wider than 4/2: the closer CreaseLvl sits to SmoothSubdiv, the tighter the edge
  (qeFclVta4No [00:15:27]-[00:16:29]; Plouffe [02:18:03]-[02:19:11]).
- The NanoMesh insert click is not GUI-only: the shipped Create Instance Subtool macro applies a
  Nano with one scripted click at the center of a front-facing plane (QGNn1-ey6ME Agent
  translation), [verify] from Python.
