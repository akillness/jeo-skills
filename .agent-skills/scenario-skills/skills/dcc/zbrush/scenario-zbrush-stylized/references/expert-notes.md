# Expert notes: stylized characters, stylized hair, toys and collectibles

Principles and judgment by expert, each with its source and timestamp. Paraphrased from the project
notes (`notes/stylized/`, `notes/hair-fibers/VJ2nMJRtIwQ`, `notes/character/FRZtVXpAokc` and
`_digest_character_creature_studio.md`, `notes/3d-print/P08kuTIRziE`). "[added]" marks this skill's
own additions. Brush settings quoted from video frames are readouts, not narration.

## Shane Olson: stylized anatomy from a skeleton of primitives (ZBrushLIVE, 4R8, t_gg7MIGSDM)

Credential: stylized character sculptor and teacher (3D Character Workshop); says he worked at
Disney Interactive on Disney Infinity [00:04:54], unverified beyond the stream.

- Stylizing is not "an excuse to do bad anatomy" [01:11:09]. He models from a strong stylized
  reference and exaggerates on purpose.
- Keep the bony landmarks that touch the surface: the hip bone point ("the thing I care about is
  this dot" [01:10:33]), the knee diamond, both ankle bones, the elbow, the clavicle tops, the
  base-of-neck vertebra, the sacral triangle and the skull [00:15:02], [01:50:21]. Bones that never
  show are not modeled [01:14:54].
- The proportion knobs have a real baseline:
  - the knee halves the leg [00:25:08];
  - real hands land at mid-thigh [00:26:01];
  - the forearm against the upper arm, huge calves, four or five digits, two or three phalanges
    [00:26:01], [00:30:08], [00:45:11], [02:47:44].
- "Be careful" moving knobs: motion reveals them [00:25:43]. Tron-style proportions look odd
  standing and great moving [00:29:02].
- Posture of the masses: the pelvis leans forward and the ribcage leans back [00:59:24]; the femur
  angles toward the knee and the tibia stays straight [00:21:39].
- Head block [02:00:26]-[02:11:58]:
  - cranium and jaw split at the eye line;
  - the jaw corner ends under the ear, around mid depth, and starts the cheekbone and socket line;
  - from the top, the outer eye corner sits well behind the inner;
  - the side of the head is an arc; clip the sides so the head tapers. From the top, "a lot of
    people think it's just straight like this but it's actually like this": he clips the cranium
    sides in the top view ("that's probably too much"), and later pulls the cranium out at the back
    because "the side of your head isn't a perfect plane either" [02:00:26]-[02:00:59], [02:11:58].
    Agent form: `head_taper` on a top render (taper and side arc) [added metric].
- Finger cross-section is a character decision: square (Wreck-It Ralph), round (Joy), flat inside
  and round on top (Stitch) [02:22:56]. Build hands from the fingertips inward [02:43:22].
- Perspective off almost always. ZBrush perspective is a skew, and it breaks side-view masking,
  clipping and mirroring [01:41:03]-[01:43:25]. Turn it on for three-quarter screenshots and posing;
  the old default of about 60 matches no lens [01:41:39].
- A 200 mm ruler SubTool in every file gives the front, the cross-app scale and the print box
  [01:50:21].
- Blockout reuse: a fresh blockout per character, reuse only within a line, shared hands and face
  layouts because rigs are shared [01:05:39].
- Mirror And Weld with the center line on the wrong side of the axis gives a tripled center line;
  move the model first, with local symmetry off [01:54:40].
- Volume-keeping smooth: start a Shift stroke, then release Shift while dragging [01:08:43]. The
  agent cannot hold Shift: use Deformation Polish [added].

## Keos Masons: Cedric Seaut, Guillaume Tiberghien, Marco Plouffe (ZBrush Summit 2019, UthCuDB1IEQ)

Credentials: Keos Masons, outsourcing studio for character modeling and design. Guillaume did
Fortnite at Epic for more than a year; Marco did Sideshow collectibles.

- **Cedric:**
  - Silhouettes first, whatever the project [00:08:31].
  - Lineups of several characters focus on content, not details, and build a coherent universe
    [00:10:46].
  - Lineup themes: size (big, thin, small), roles (scout, transporter, chief), constraints (fly,
    swim, run, dig) [00:12:28].
  - Setup [00:19:41]: low DynaMesh spheres, SnakeHook, Solo mode, arrow keys between SubTools.
  - Color changes personality, so do not stay gray too long in design exploration [00:18:36].
  - Variations in stages D1 to D7 over about a month [00:26:55].
- **Guillaume:**
  - Start from three primitives, not a base body, to avoid an inherited anatomy [00:43:05];
    production usually starts from a base.
  - Reduce each part to its simplest form, like a wooden mannequin; relationships between forms
    matter more than prettiness [00:43:48].
  - Clear directional planes, chipped like wood or rock [00:45:33].
  - Crease the direction changes: "the power of creases" [00:46:42]. Order on the leg: parts built
    from SubTools, DynaMeshed together, then ZRemesher for a topology he can sculpt on ("ZRemesher
    got really really good"), and "I creased my edges to make sure that when I'll subdivide those
    things will remain straight" [00:46:42]-[00:47:50]. Agent form: `crease_planes` after ZRemesher,
    before Divide (P9).
  - Forms tuck into each other for contact shadows [00:47:50].
  - No color until the modeling is tight, except darker lashes and pupils [00:48:59]. When color
    comes, Pablo Munoz Gomez paints at the top level and judges on a flat material (SkinShade4),
    because tinted MatCaps lie about hue and value (Logic Part 8, VRisbJQAaZw [00:23:40],
    [00:24:54]).
  - "Simple is hard": add anatomy, then scale back and simplify [00:55:57].
  - Grayscale value check, no pure black or white, the biggest contrast where attention should go,
    usually the face [00:58:45]-[00:59:53].
  - Material ID polypaint with very distinct colors [00:54:14].
  - A cornea mesh gives the eyes life [00:55:57].
  - Pose a mannequin first, open the negative spaces, contrapposto [00:52:21].
- **Marco:**
  - Spend effort where the viewer looks; prints need everything [01:13:44].
  - Strip old detail back to a pure shape before polishing; hPolish with Alt; ZRemesh before the
    final polish [01:19:22]-[01:22:51].
  - A shiny metal MatCap finds dips; keep corner radii consistent [01:25:05].

## Rakan Khamash: shape language for game characters (Blizzard, ZBrush Summit 2023, FRZtVXpAokc)

Credential: senior character artist on Overwatch 2, owner of the hero Illari, now at Epic Games.

- "Say it or don't": readable from distance, "talking to the back of the room" [00:02:16],
  [00:05:00].
- Rules:
  - S and C curves;
  - no parallel lines ("we hate parallel lines");
  - no noisy curves;
  - 70/30, never 50/50, "as much as you can push it";
  - flare at the top, taper at the bottom;
  - "crashing angles" [00:06:07]-[00:08:53], [00:16:37].
- Balance detail with rest: one arm armored, the other nearly bare [00:06:40].
- Hierarchy of reads:
  - silhouette first;
  - secondary shapes push intent (Widowmaker sharp, Doomfist chunky);
  - tertiary shapes specify it [00:08:53]-[00:10:32].
  - Intent reaches the screws: random and spiky for Junkrat, clean for Sojourn [00:03:22].
- The blockout is 90 to 95% of the low poly [00:21:37]. Test it in animation poses and reshape
  pieces that clip [00:12:09].
- Design for the rig: skins share the hero's topology and loop counts, and straps follow loops
  [00:11:04].
- Floaters for anything you may change [00:13:48]; floater variants kept in an IMM brush to scroll
  through options [00:13:16]-[00:16:03].
- Folds are never random: pressure and joints decide them, mostly V shapes [00:20:28]. Fold brushes
  are sculpted on a plane and stamped [00:21:00].
- Polypaint the design on the approved nude body, decimate keeping polypaint, and trace the borders
  in the low poly [00:37:33].
- Hair as its own stage; he regrets keeping everything in one SubTool [00:38:42]-[00:39:49].
- Budget "I think 16k" for Illari including both hairstyles; the unit is not stated [00:42:31].
- Agent translation [added, from the Overwatch note]:
  - thumbnails 64 to 128 px tall with IoU between siblings;
  - flag breaks between 0.45 and 0.55;
  - contour curvature analysis for straight runs.
  - `shape_language`, `band_breaks` and `lineup` implement these.

## Pablo Munoz Gomez: sculpted stylized hair (2023, WFqyj6lKgik)

Credential: concept and character artist, ZBrushLIVE presenter, founder of ZBrushGuides and the
Pablander Academy.

- Four stages (setup, blockout, sculpting, detailing), one SubTool kept per stage for comparison and
  undo insurance [00:02:44]-[00:03:36].
- The workflow matters more than the brushes. His Surface Blocking, Standard Blocking and Standard
  Refiner can be replaced by ClayBuildup, Standard with more intensity, and Dam_Standard [00:01:43].
- Scalp shell [00:03:36]-[00:12:59]:
  - duplicate the head, perspective off;
  - lasso the scalp and Del Hidden;
  - Dynamic Subdiv Dynamic on, SmoothSubdiv 0, Thickness up (readout near 0.18), Offset -100 (inward
    only), Apply;
  - DynaMesh 128, one polygroup;
  - Deformation Inflate 1, then 3 (value or three applications [?]);
  - Move with AccuCurve pushes the hairline back;
  - symmetry off for an asymmetric style;
  - Standard Refiner with Sculptris Pro cuts the part.
- Plan chunks on the reference: squint, mark, even polypaint each chunk a saturated color
  [00:15:24]-[00:18:56]. "If you get this block out of these secondary shapes done correctly, then
  the next step is going to be so much easier" [00:20:00]. Work the back and how lines meet there
  [00:17:12].
- Blocking [00:20:42]-[00:24:00]:
  - Surface Blocking with Sculptris Pro, filling zones along the flow, alternating add and subtract;
  - frame readout: FreeHand, Focal Shift -12, Z Intensity 100, DynaMesh 440;
  - points went from 278k up by about 10k per stroke; the prepared blockout sits near 790k.
- One long stroke from a good angle: "find a nice angle and do a single motion"; rotating mid-stroke
  kinks it [00:26:10]-[00:26:40]. Volume first, crevices last [00:26:40].
- Standard Blocking readout: Focal Shift 14, Z Intensity 25 [00:25:41]. Standard Refiner readout:
  Focal Shift -49, Z Intensity 30, Zsub [00:27:11]-[00:28:41].
- Re-DynaMesh when Sculptris Pro gets heavy, about 2.4M to 2.6M points; the readout shows 1416
  [00:28:56].
- Alt raises single strands as highlights [00:29:27]. Balance rest and detail areas, since "too many
  lines" is a failure [00:30:32].
- Detailing [00:32:42]-[00:35:33]:
  - big Move nudges that keep the flow;
  - DynaMesh Resolution Picker, then "a bit higher" (readouts 1032 and 1784);
  - Deformation Polish 2;
  - ClayPolish (Max 25, Min 0, Sharp 0, Soft 0, RSharp and RSoft about 5);
  - clear the mask ClayPolish leaves, or the next brush seems dead;
  - "80% there".
- Inserted strands [00:35:46]-[00:42:15]:
  - an appended QCube shrunk inside the hair, so curve strands land in a dummy SubTool;
  - CurveAlpha or other curve brushes;
  - a custom four-strand alpha from cylinders cut level with KnifeCurve;
  - Bend End and Lock End on, repel 0 [verify names];
  - Auto Groups, then Move Topological per strand.

## Dan Eder: stylized game hair with curve tube strands (Stylized Station 2020, VJ2nMJRtIwQ)

Credential: senior 3D character artist for games, known for stylized women with long hair. The video
is mostly a time-lapse; its knowledge comes from frames.

- Plan the sections on the concept, each painted a flat color [frame 00:01:26]. Chunks are rig
  chains [00:01:05].
- The blockout "just needs to serve a purpose" [00:01:38]:
  - spheres plus DynaMesh 128;
  - Move, Smooth, Pinch only;
  - low resolution, not pretty, clean silhouette curves from every angle.
- DE_HairTubes (by Dylan Ekren, third party) is a curve brush, "a wire holding your shape together"
  [00:02:51].
  - Root and tip come out inverted on release: set the width falloff in Stroke > Curve Modifiers
    [00:03:23].
  - "Always check the curve step value before you start" [00:03:23]; the readout shows about 0.6
    [?].
- Strands [00:03:55]-[00:13:29]:
  - front to back;
  - one polygroup (or SubTool) per strand;
  - repetition is fine at placement, variation comes later;
  - "Use move, inflate, pinch and snake hooks ... Do not use smooth"; "keep everything round, clean
    and sharp".
- Center-parted hair: no symmetry, then SubTool Master mirror, which keeps polygroups [00:26:38].
- Clean-up [00:26:57]-[00:27:46]:
  - close unintended gaps and keep clipping low;
  - "Constantly switch up the materials";
  - ZModeler edge loops where a strand needs them;
  - strands are about 3 to 4 polygons across.
- Braids [00:40:19]-[00:42:21]:
  - BadKing braid brush (third party);
  - split the three plaits, crease loops;
  - Frame Mesh with only Creased on;
  - tube brush on each curve, lower Brush > Depth.
- Reviews in his frames: front, three-quarter, side, top (parting), back, through the braids.

## Michael Pavlovich: Curve Flat (2021, goZavCi515k)

Credential: Director of Character, Weapon and Vehicle Art at Certain Affinity, ZBrushLIVE host.

- Curve Tube's Brush Modifier is the number of sides (20 default). 4 makes a square. 0 is Curve
  Flat, the hair card. The strap is 4 with a lower Z Intensity (34 against 100)
  [00:01:31]-[00:02:50].
- Tap off to commit (it deletes the curve), then draw the next one. Curve Res 3 adds spans; tap on a
  curve to update it with new settings [00:02:50]-[00:03:31].
- Gradient polypaint along the curve [00:04:00]. Since 2021.6 the modifier value equals the division
  count [00:05:18].

## Paul Bennett: toy production (Hasbro Star Wars Black Series, ZBrush Summit 2019, P08kuTIRziE)

Credential: digital product designer in the Hasbro sculpture department.

- Every sculpt must survive injection molding: undercuts, walls, tooling and plastic choice shape it
  from the start [00:01:12].
  - Undercuts lock the part in steel; add draft, or slides at a cost [00:02:13].
  - Features below a size floor short-shot [00:03:21].
- All articulation reduces to spheres and flat cylinders (discs), cut in with booleans and tested
  [00:07:36].
  - Fix manufacturing problems invisibly: thicken inward and take volume from hidden areas
    [00:16:46].
  - Camouflage joints with costume detail projected onto the disc [00:44:07], [01:12:39].
- Sculpt the likeness first in the neutral standing pose the toy ships in, with no joints; build
  folds for standing [00:19:34], [00:33:06]. Decimate early and engineer on the decimated mesh
  [00:25:28].
- Hair:
  - a separate part keyed to the head allows more undercut and detail;
  - flyaways are fused because of the minimum wall;
  - bunch strands so painters can repeat them identically [00:20:41]-[00:30:22].
- Fingers touching (thumb to middle finger) make a closed loop the mold cannot release [00:19:34].
  Skirts need slits [00:18:30].
- Numbers:
  - wall 1 mm, 0.85 mm flagged [00:10:57], [00:16:46]; about 0.2 mm floats away on the Formlabs tray
    [00:11:31];
  - edges at least 0.5 mm [00:48:28];
  - fit offset 0.12 mm, Inflate 2 in his ZTool, so calibrate per ZTool [00:37:55], [00:56:20];
  - scale: height / 12 plus 4 percent for 6 in, / 18 for 3.75 in [00:12:54], [00:17:51], [00:57:52];
  - elbow at least 90 degrees, 115 degrees targeted [01:06:02].
- Package fit is "the money part" [00:34:10]. Parts must assemble without thought, at 10,000 per day
  on one line [00:38:29].
- "The process revealed the solution": articulation has no roadmap, only rules and tests [00:22:17].

## Alex Carratala: miniatures and collectibles (80.lv, 2023)

About 90 mm collectibles. Pose first on a mannequin, no symmetry except props, and cut lines in
mind. Over-sculpting beyond what 90 mm can show is the usual failure; remember the final size daily.
Cut, decimate each part, scale to real size, STL.

## Anatomy For Sculptors (via the character digest)

- Crown to hairline is 1/6 of head height; the rest splits into three equal thirds (hairline to
  brow, brow to nose base, nose base to chin), and the eyes sit at half the head height.
- The adult hand equals chin to hairline; the middle finger is half the hand.
- The note's own agent rule: for stylized characters, "know which ratio you are breaking, not to
  keep all of them". The 5 percent tolerance is [added].

## Disagreements and deciding conditions

| Choice               | Option A                                                                                              | Option B                                                                        | Deciding condition                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stylized hair        | one DynaMesh sculpt carved with Sculptris Pro strokes, ClayPolish finish (Pablo)                      | separate curve-tube strands, one polygroup each, on a temporary mass (Dan)      | rigged or dynamic game hair, or per-chunk retopology: strands. Concept, print, still, single mesh: sculpt. Pablo's hybrid adds curve strands in a dummy SubTool for depth. |
| Hair symmetry        | off, then mirror (Dan, center part)                                                                   | off for good (Pablo, asymmetric style)                                          | the design's symmetry; mirroring a parted style after building is safer than symmetric strokes                                                                             |
| Perspective          | off almost always (Shane)                                                                             | on once the hair blockout exists (Pablo)                                        | orthographic for masking, clipping, mirroring and measuring; perspective for appeal                                                                                        |
| Color early or late  | early in design lineups (Cedric), polypaint the blockout to read it (Rakan)                           | none until the modeling is tight (Guillaume)                                    | design exploration uses color; production modeling and anatomy approval stay gray                                                                                          |
| Base mesh or scratch | base body in production (Guillaume concedes it [00:43:05]; Marco starts from a human base [01:06:58]) | primitives from scratch (Guillaume, Shane per new character)                    | production with shared rigs: base; new design or practice: scratch, reuse only within a line                                                                               |
| Joints in the design | none until the design is approved (Bennett)                                                           | articulation planned from the start as spheres and discs (Bennett, engineering) | design stage first, engineering on the decimated approved sculpt; the design must leave room for discs                                                                     |
| Straight lines       | never parallel, flare or taper them (Rakan)                                                           | hard-surface panels and bust cuts are straight by nature                        | measure with `shape_language(ignore_bottom_frac=...)`; accept straight runs that are cuts or hard parts, never twins                                                       |
| Head sides           | clipped flat so the head tapers (Shane [02:00:26])                                                    | an arc, not a perfect plane (Shane [02:11:58])                                  | both, in that order: clip for the taper, then pull an arc into each side (`head_taper` checks both)                                                                        |
| Plane breaks         | chipped with brushes on the DynaMesh (Guillaume [00:45:33])                                           | creased edges so subdivision keeps them (Guillaume [00:47:16])                  | both: chip on the DynaMesh, crease after ZRemesher, before Divide                                                                                                          |
