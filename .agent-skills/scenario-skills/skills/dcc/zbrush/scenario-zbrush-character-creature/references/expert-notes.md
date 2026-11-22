# Expert notes: realistic characters and creatures

The depth behind SKILL.md: principles and judgment by expert, with source and timestamp. Notes live
in the project's `notes/anatomy/`, `notes/character/`, `notes/creature/` and `notes/hair-fibers/`
(digests `_digest_face_anatomy_cloth_visual.md`, `_digest_character_creature_studio.md`,
`_digest_realism_portrait_skin_visual.md`, `_digest_fibermesh_dynamics.md`). Timestamps are from the
videos; doc sections are named. Numbers read off frames are marked "frame"; [?] means the frame was
hard to read; [added] marks this skill's own inference.

## 1. The head and face

### Ryan Kingslien, "Common Mistakes When Sculpting The Face" (6wiDxO-ZADg, ZBrush 2021.6.2)

**Principles**

- **Efficiency is the measure of learning.** Count your moves in the Undo History and cut them: the
  head wedge went from 48 moves to 13, with a 16-move target (00:20:29-00:24:47, 00:28:04). A region
  touched twice is a red flag: go back and solve it upstream (00:21:01, 00:27:32).
- **The first separation.** It is the cranial mass versus the facial mass, and it comes before the
  ears, the SCM, the frontal eminence or the orbit (00:31:15-00:34:15). The profile becomes "a
  little bit like a Pacman" (00:34:15).
- **Bridgeman's masses**, one per step (00:38:12-00:47:17):
  - the flat of the cheek going back in space;
  - the triangular jaw, with its back sculpted;
  - the forehead box, broken down and separated from the round cranium, cut with TrimAdaptive
    (frame: Z 100, Focal Shift -83);
  - the maxilla cylinder, "the shape everybody misses": a line from beside the nose toward the jaw,
    dug in ("you can always put it back in"), the column rounded, the chin dug, the jaw separated.
    Round or square masses change the character (00:47:17).
- **Structure before fat.** Fat pads are elements sculpted into each other (00:48:39, 01:46:50).
- **Nose.** The bridge is smaller than the base whatever the nose type; widen the base, lift the
  bottom; the procerus rounds the root into a "capital" (00:49:45-00:50:59). Sculpt the nostril
  around it, through the alar facial juncture triangle, with Imbed lowered, "without touching the
  nostril" (00:54:07-00:57:33). A form-clue line around the wing marks the turn into shadow: draw
  it, then trim it (00:59:02-00:59:34).
- **Eye.**
  - The eyeball sits high in the orbit ("up, protected") (01:05:21).
  - The infraorbital margin curls into the orbit at both ends; from below it shows "a one curve and
    a two curve" (01:06:02-01:07:39).
  - The nasojugal groove has real depth (01:04:49).
  - Only the upper lid is drawn, as one simplified line with a small gap, tucked up underneath
    (01:28:37-01:30:33).
  - Deep-set eyes read without a caruncula (the Prague bronze, 01:27:25).
- **Brow.** A mark and carve at the external angular process, beveling the edge of the forehead box,
  with a small male "hook", then the temporal line (01:09:55-01:11:45).
- **Mouth.** Muzzle; mouth line (Standard, Dots, Z 25, frame); lip planes first, even if they look
  like Dr Doom; lower-lip columns; depressor anguli nodule; the marionette line tucks the lower lip;
  a line separating a bundle of upper-lip fibers; then the five pillows (01:12:20-01:18:32). The
  mouth corner is a donut: radiate strokes out, turn Sculptris Pro off, blend chin and depressor
  with Inflat at Z 10 (01:19:45-01:21:56).
- **Cheek.** Don't resolve the cheek: move the surrounding edges together; trim a malar band back
  for cheekbones (01:23:54-01:25:44).
- **Nasolabial area.** Planes delimited from both sides, connected, blended, trough kept; nostrils
  tucked under (01:33:42-01:36:13).
- **Planes over curves.** "Stay with the planes until you know what the next plane is, don't just
  put a tumor in there" (01:09:00). "Humans don't understand curves ... we understand planes"
  (01:34:15).

**Numbers**

- Primitive of 1,538 points (frame 00:16:08). The whole block-in stays under about 354k points with
  Sculptris Pro (frames 00:35:12-01:35:29).
- Move: Dots, Z 51, Focal Shift 0, Draw Size 1.8 to 33 (frames).
- RK_BallStylus (his own Gumroad brush, not shipped): FreeHand, Z 20, Focal Shift -56 (frames).

**Agent reading [added]**

- His decisive moves are single lines: the best stroke-synthesis targets.
- Sculptris Pro needs a mesh without levels.
- Morph targets replace his Undo History as the restore point, because `merge_undo` is not
  implemented.

### Kris Costa, Realistic Portraiture (Lfen-BSwWcE, 2018) and Realism Idealized (j5XLtLMN0P8, 2021)

**Principles**

- **Primaries first.** "Detail is nothing if you don't have a solid mesh base" (Lfen 00:28:17).
  Primaries are what scans hand you and why scans teach nothing (00:36:48).
- **The hierarchy is context.** Primary, secondary and tertiary depend on the region you approach: a
  "fractal progression" (j5 00:08:12-00:10:25).
- **Sketch, then fix by resolution.** Sketch primary and secondary together to catch the expression,
  then fix proportions through the lower levels without touching it (j5 00:10:40-00:11:45).
- **ClayBuildup only** ("it respects the boundaries between the different forms"), at intensity 2 to
  3 in very thin layers; forms must not "scream"; Standard only for veins (j5 00:12:58-00:17:12).
- **Collision and ripple.** A smile lifts the nose corner, the nasolabial and the lower lid into a
  squint. Age shrinks fat pads and reveals the zygomatic and the skull. Never show every muscle
  flexed (j5 00:11:54-00:15:17).
- **Evaluate physically.** Accurate renders under several lights from the first sketch: "a volume
  correct under one light is off under another" (j5 00:18:46-00:19:51). Turn the model upside down
  to "press the reset button in your brain" (Lfen 00:29:26).
- **Pores** (Lfen 00:31:18-00:39:01):
  - a pore is a star-shaped "quilted button"; some are cuts with no depth;
  - pores stay symmetric until all are placed, then symmetry goes off for wrinkles and
    characteristic features (00:34:04);
  - single-pore stamps on hero zones, multi-pore stamps on the forehead and neck;
  - one size per zone, rotation varied by alternating drag direction and dragging diagonally.
- **Wrinkles connect pores** (Lfen 00:45:09-00:47:26): short segments, never one long line, broken
  by stepping sideways, perpendicular to the circular muscles. The brush is Standard with Alpha 39
  and a sharpened curve; not Dam_Standard, which pinches and distorts the motion.
- **Directional pass with a cloned Elastic.** Spray, Alpha 16, intensity about 20 to 30 [?], because
  Standard "obliterates" finished pores on repeated passes (j5 00:51:50-00:52:22).
- **Leather micro texture.** Spray in small circles at low intensity without revisiting; then Inflat
  at 1 to 2 with a big draw size (Lfen 00:42:21-00:44:37).
- **Skin by region** (j5 00:40:24-00:42:33):
  - around the mouth, micro wrinkles perpendicular to the orbicularis oris: vertical at the lips,
    then diagonal, then horizontal toward the chin;
  - lip-edge wrinkles grow into lip lines;
  - nose: shallow pores, blackheads, peach fuzz;
  - cheeks, muzzle and chin: pores spread out;
  - forehead: horizontal lines. Wrinkles are "a memory of the facial expression".
- **Likeness.** Asymmetry "is the only way you're going to be able to actually capture likeness" (j5
  00:35:03). Gaze slightly up and aside; eyes rotated outward (j5 00:28:36-00:30:16).
- **Keep level 1 alive.** Likeness edits happen on the primaries for months (Lfen 00:20:37).

**Numbers**

- Useful Measurements slide (j5 00:38:12): head 229 mm, eyeball 24 mm, pupillary distance 63 mm,
  eyes 3 to 10 degrees outward, about 5.
- Stack: 17,328 points at level 1 to 1.108M at level 4, then 3 DivideHD, about 70M for head and
  torso (Lfen 00:17:53-00:18:25; frames). A whole face in HD at about 40 to 45M (j5 00:48:33).
- Multi Map Exporter, from frames 00:20:31-00:23:31:
  - 8192, Border 4, FlipV, Switch MT on;
  - SubDiv 2, Adaptive, DPSubPix 4, SmoothUV;
  - Mid 0, 32-bit, EXR, Scale 1. Five 8K UDIMs export in 7.5 minutes (00:18:58).
- Switch MT trick after an external base edit: delete the morph targets, StoreMT at level 2, Switch,
  Import, no Divide, export with Switch MT on (Lfen 00:22:17-00:23:59). He suspects newer builds no
  longer need it [verify].

**Hand-off to paint-render**

- Blackheads are brown, never black.
- Redness comes from micro veins.
- Paint the albedo to be desaturated before SSS.
- A painted micro-displacement control map is black on lids and lips (Lfen 00:40:07, 00:51:22,
  01:10:58; j5 00:49:06-00:56:54).

### Anatomy For Sculptors (Uldis Zarins and team, blog articles)

- **Head canon.** Cut the top sixth (crown to hairline), split the rest into thirds, then split the
  lower third in three; the eye line sits at half the head height ("Adding detail").
- **Skull.** Braincase to face about 60/40 in adults. The widest head point is the parietal
  eminence, the widest face point the zygomatic arch (except very brachycephalic heads).
- **Sex differences.** Males: stronger brow, flatter back-slanted forehead, square chin, steeper
  gonial angle. Females: more vertical forehead, rounder orbits, narrower jaw, softer temporal line.
  These are averages, "not rules or ideals".
- **Hand.** Length equals chin to hairline in adults; the middle finger is half the hand; the nail
  is half the distal phalanx. Fingers are square, not cylinders, joined by webbing; knuckles never
  align.
- **Deltoid and hips.** The deltoid tuberosity sits a bit above mid-humerus (Eaton agrees). The butt
  is never wider than the hips (greater trochanter).
- **Landmarks by body type.** Bony landmarks are depressions on a muscular body and protrusions on a
  lean one.

## 2. Skin detail

### J Hill, "Sculpting Skin Details" (HlHoIGE2Ocs, ZBrush 2021)

- **Scans or hand work.** Studios with the camera on the skin use photo scans (ZWrap, Mari); hand
  sculpting is for personal hyper-real work (00:00:33-00:02:13). Use reference of the same age and
  sex, and test on a patch when unsure (00:05:26).
- **Stack split.** 3 to 4 regular levels plus 3 to 4 HD, not 6 or 7 regular plus 1 or 2 HD, because
  "you are not able to go below where you started": inside HD the lowest level you can step to is
  the HD entry, and smoothing needs lower levels. A 6,240-face base reaches 25.5M at SDiv 7, and one
  HD level on top of that is 102M; games stop at 20 to 40M, "40 million is high"
  (00:10:37-00:13:22). Real-time work does not need 100M: tiling detail textures carry the sharpness
  (00:11:10-00:11:43). [added] Each level multiplies by 4, so HD over a deep regular stack explodes:
  3 DivideHD over 16M reaches the 1 billion HD ceiling.
- **HD regions behave like new meshes.** UVs differ, the morph target must be stored again on every
  entry, layers do not survive leaving HD, symmetry does not work. Aim front-on and slightly forward
  for a "butterfly" region covering both sides (00:12:16-00:14:26).
- **Pore bed.** A custom 16-bit tiling height map in Surface Noise (NoiseMaker), Mix Basic Noise 0,
  strength negative so pores go in (frames: Noise Scale 1, alpha scale about 0.015 [?], Strength
  about -0.02 [?]). Preview in 3D, then Apply; female means smaller pores (00:14:31-00:15:38). "If
  you were to do the wrong scale in the beginning then everything would be off" (00:15:05).
- **HD projection.** In HD the noise projects from the camera at the moment you pressed A: re-aim
  per area. The Morph brush blends seams, varies pore depth and removes pores around eyes and lips
  (00:15:38-00:16:42).
- **Heavy then dial back.** Store MT, go too strong, Switch, paint back with the Morph brush (set to
  Spray for breakup) (00:17:05-00:20:21).
- **Fine wrinkles** follow the compression, circular around the eyes (00:17:38-00:18:10).
  Default-brush recipe (frame 00:08:53): Standard, Spray, Alpha 60, Z 3, LazyStep 0.02.
- **Not plastic.** Beat the surface up with push and pull at several sizes including medium: "the
  skin shouldn't feel perfectly smooth" (00:18:10-00:19:14).
- **Elastic at very low intensity** builds volume between wrinkles; Clay smooths them away
  (00:20:21-00:20:53).
- **Crisp lines.** Dam_Standard or a smallest-line brush for memory creases (nasolabial, frown,
  surprise) (00:21:17).
- **Nose.** Shallower, sparser pores than the cheeks; a polished tip; clogged pores as bumps with
  DragDot so the highlight breaks; horizontal wrinkles where the tip meets the bridge
  (00:22:16-00:23:54).
- **Lips** (00:24:10-00:27:23; frame 00:25:36: Dots, LazyStep 0.04, LazyRadius 4, Z 33):
  - Dam_Standard sections, then sprayed vertical and horizontal cues;
  - "catching arc" lines in alternating directions and lengths with Y shapes;
  - volume between the deep lines;
  - medium folds strong enough to break the silhouette;
  - fully asymmetric.
- **Smoothing at a lower level** softens forms and keeps the sharp detail: use it to fade pores out
  of the soft eye skin (00:27:57-00:28:31).
- **Body skin** carries fine wrinkles and breakup, few deep pores (00:29:03).
- **Asymmetry in the last 25 percent**, on big forms: nose tip off the Z axis, one ear, a lip
  corner, the septum, one eye's scale (00:29:42-00:30:47).
- **Export and render.** Multi Map Exporter captures HD detail: 8K, 32-bit EXR displacement, an 8K
  normal map that is very clean "because it's baking to itself" (00:33:16-00:33:48). In the SSS
  render only the sharp detail survives in the highlights (00:34:53).

### Kris Costa on skin

See section 1: pores, wrinkles, Elastic and Spray.

## 3. Bodies and poses

### Scott Eaton, Dynamic Figure Sculpture (Ale6SXXbJMM, Summit 2015)

- **Why anatomy.** Anatomy is "the tool to give you the ability to stylize realistically"
  (00:06:28).
- **Force chain.** In a dynamic pose only the muscles in the force chain are tense; antagonists are
  relaxed "like a marshmallow". The error is a striated "super bodybuilder deltoid"
  (00:13:39-00:15:29, 00:28:42). Tension can change within one muscle (the rear deltoid "like a
  belt") and between sides (the side lifting more weight) (00:14:56, 00:28:56).
- **Base and stack.** A sparse posed quad base with one loop per finger joint. Divide with smoothing
  off for the first two levels so knuckles do not become "sausage fingers", about 6 levels and 1.7M
  for a full figure (00:32:01-00:33:08).
- **Reversible edits.** Store a morph target on the smooth divided mesh. Put proportion changes on
  layers: a head scaled up 20 percent, dialed back to 15 with the layer (00:33:33-00:34:39).
- **Landmarks first, then connect the dots.** The landmarks: sternum, clavicle (an elongated weak
  S), acromion, spine of the scapula, C7, iliac crest, PSIS, ASIS, deltoid insertion
  (00:35:59-00:44:08). Resolve the humerus, then the scapula (about 30 degrees at 90 degrees of
  elevation), then the back muscles (00:39:23-00:39:55).
- **Active muscles run point to point.** Check the construction from under the armpit
  (00:54:07-00:54:39). ClayTubes strokes follow the fibers (00:49:05). Smooth with Smooth
  Directional in the same direction (01:09:27); it ships in `Lightbox/Brushes/Smooth` (local
  2026-09-24).
- **Volume at low levels.** Change volumes at low levels by moving a few vertices, not at the top
  (00:47:27-00:48:00).
- **Symmetry on posed figures.** Sculpt them without symmetry; use Posable Symmetry for the face and
  for toe curls (00:36:34).

## 4. Creatures

### Zachary Berger, Avatar: The Way of Water (PcuC8K-bz44, Summit 2023)

- **The pyramid.** Story at the base, then biology and ecosystem ("these are not monsters they are
  animals"), then appeal for ages 8 to 80 (00:04:24-00:06:01).
- **References.** Blend many reference animals so no seam shows (00:03:52, 00:12:33). An Earth-like
  metaphor at the broad strokes, alien details up close (00:14:13).
- **Three approvals.** Form and anatomy, color and pattern, bioluminescence, each separate. Present
  grayscale when only anatomy is discussed (00:06:33, 00:37:47).
- **Layers as design tools.** Jaw articulation; always open and closed mouth states; an evolution
  between an old and a new head so the director can stop "in between" (00:13:39, 00:18:05,
  00:20:53).
- **Three versions.** What was asked, what the designers pitch, and one pushed too far (00:16:59).
- **Readability.** Schooling creatures need a silhouette that survives repetition (00:33:48). Reds
  vanish first underwater, oranges and blues survive (00:41:07). Too intricate patterns go noisy
  (00:55:43).
- **Brushes.** Four: Dam_Standard, Standard, Move, ClayBuildup (00:45:35).

### Henning Sanden, creature scale alphas from scratch (TuRIf92oMCY, FlippedNormals 2025)

- **Flow.** Scales flow with the anatomy: triceps into forearm, crossover patterns on the forearm,
  another direction on the thigh (00:00:34-00:01:38).
- **Hand work and alphas.** Hand sculpting belongs in hero areas; an alpha speeds coverage, but
  "there's no way to get this perfect with just alphas" (00:01:38, 00:03:52).
- **The tile.** A plane with Smt off, about 1M polys ("a million polies is equivalent to a 1K map"),
  on a layer (00:02:11-00:02:47).
  - Rough in the directionality with a clay brush; keep sizes uniform and the pattern generic, or it
    tiles visibly (00:03:20-00:04:25, 00:18:38).
  - Keep everything inside the borders (00:06:04).
  - Smooth, then Dam_Standard for separation: broken lines of varying weight (00:06:36-00:08:16).
- **Smoothing is blurring.** Smooth inside each scale, never across the separating lines
  (00:20:47-00:21:19).
- **Photos lie about height.** Shadows become recesses and speculars become bumps; use photos as a
  template only (00:17:33-00:18:05).
- **Test on the model early.** At 11, 26 and 41 minutes: Document 1024 x 1024, perspective off,
  Actual, GrabDoc, DragRect, Focal Shift -100 (00:14:15-00:15:21).
- **Mid value 50 calibration.** Mask a small circle in one corner and Inflate it to +50, typed, not
  dragged; do the same at -50 in another corner. The dots must be taller and deeper than anything in
  the alpha. Grab, set MidValue 50, paint the dots out (00:25:09-00:27:51). The agent substitute is
  `recenter_alpha`, which rescales so the flat border sits at 0.5 [added].
- **Applying it.** DragRect on a fresh layer; Focal Shift -100 for the full tile or 0 for a faded
  edge (00:27:51-00:28:23).
- **Unify.** A hand pass so individual scales fit (00:28:55-00:29:29). Mid-frequency: mask scale
  groups, blur, invert, blur, Inflate some scales out; Alt on the border to break it
  (00:30:02-00:30:35).
- **Cost.** About 1 hour per alpha; one to two weeks of alpha making for five characters (00:10:27,
  00:11:32). A whole creature at about 21M polys, where a 1K alpha is already overkill (00:08:49).

### Luke Starkie, God of War: Ragnarok creatures (Maxon interview 2023)

- **Head first.** The head is the focal point; its aesthetic sets the body.
- **Tusks and spikes.** Cracks in stages with Orb Cracks and Dam_Standard, main shapes split into
  secondary ones, Clay brushes for a bone and rock feel with hard broken edges, small Orb Cracks
  last. Orb brushes are a third-party pack, not in the 2026.2.1 install (local 2026-09-24): use
  Dam_Standard, Slash3 and TrimDynamic.
- **Wrinkles by hand.** From elephant and rhino reference: a modified Standard and a low-intensity
  ClayBuildup, then alphas only to break big wrinkles into smaller ones.
- **No numbers.** The interview gives no brush values. A low ClayBuildup intensity in numbers is
  Costa's (Z 2 to 3, j5XLtLMN0P8 00:12:58-00:17:12), not Starkie's: attribute it that way.
- **Hero scales.** On the close-up Nidhogg every scale was made by hand, each slotted next to
  another with no overlaps, after alphas "didn't feel right".
- **Anatomy first.** "Once you memorize those shapes, you can play around with anatomy freely."

### Marko Lazov, creature concept speed sculpt (AQsmWcXLxk8, Summit 2025)

- **Start.** Skull first (00:15:58). DynaMesh 128 plus Sculptris Pro whenever topology degrades
  (00:17:07).
- **Don't get attached.** Smooth an hour away and redo it (00:29:38).
- **Mask by Cavity, then a light Inflate** pulls detail on cheekbones and forehead. Mask, invert,
  Inflate gives happy accidents (00:22:37-00:25:56).
- **Detail zones.** Green rich zones and red rest zones painted before detailing (00:31:12).
- **Silhouette window** open constantly (00:28:36).
- **Asymmetric growths.** Duplicate a shell, inflate it inward, sculpt growths on it, DynaMesh them
  in (00:41:03).
- **Asymmetry pass.** Store MT, push and pull, restore parts with the Morph brush with symmetry off
  (00:56:58). "Asymmetry is the best thing for a creature" (00:58:04).
- **Eyes.** A Toy Plastic sphere, black painted on the upper part as fake occlusion
  (00:43:15-00:45:59).
- **Edit mode.** He dropped out of Edit mode into 2.5D near the end; the agent must check Edit
  before strokes (00:58:04).

### Pablo Munoz Gomez, four ways to create horns (TN9ARiC_82w, 2022)

- **Detail straight, then bend.** Detail a straight tube with radial symmetry, then bend it into a
  horn; keep a straight master and duplicate it for each variant (00:23:04, 00:28:42). Odd radial
  counts layered 8, 5, 3 look less regular (00:21:49).
- **Decimate before arraying.** 850k to 42k (5 %) to 8k (1 %) for arrays; a single horn at 20 %
  (00:05:14-00:06:22, 00:23:34).
- **Curve IMM.** Stretch on, curve Resolution 10, max bend 45 to 50, Size falloff flipped, Imbed 0,
  Lock Start (00:13:24-00:17:21).
- **Deformers.** They "deal with the volume and not necessarily the continuity of the topology".
  Keep the gizmo aligned to the straight horn for Bend Curve; 5 or 6 points are enough
  (00:25:29-00:26:48).
- **Spiral3D.** Parametric thickness, coverage, radius and twist, then Make PolyMesh3D
  (00:29:23-00:32:39).

## 5. Cloth

### Rafael Grassetti, how to sculpt cloth folds (gNx4v0WVVHo, 2020)

- **Tension first.** Every fold starts at a tension point; think first about "how this actually
  falls down from this tension point" (00:00:31). Mark tension points with small spheres (frames
  00:00:45, 00:03:00, 00:07:32).
- **Termination.** "You should never have a fold that just by itself terminates by itself"
  (00:02:35).
- **Unevenness.** Near the tension, folds are heavier, thicker and overlapping; they relax further
  away (00:03:08).
- **Four types by tightness.** Loose gives drop or curtain folds; two holds give diaper or zigzag;
  tight compressed fabric gives X; a split tension line gives Y. Types morph along a sleeve
  (00:04:26-00:06:36).
- **Brushes** (frames): Standard (Dots, Z 25) "deforms the edges and pulls to the front", pushed in
  for drops; Clay (Z 80) for X ridges and elbow rolls; Move (Draw Size about 372, Z 51) for the edge
  sag; Smooth (Z 100, Focal Shift -55) to fade.
- **Density.** Planes at SDiv 2 to 4, the sleeve at DynaMesh 32 first. Folds come out "way too big"
  on the first pass: subdivide and split (00:08:14-00:08:47).
- **Read reference as tension points plus fold types.** A tight T-shirt splits Y folds from the
  armpit; a loose shirt is a ladder of drops tied by zigzags; a rolled sleeve makes X diamonds
  (00:08:50-00:11:36).
- **Simulation.** It is fine when faster, but "none of those softwares will get you a hundred
  percent there" (00:12:06).

### Michael Pavlovich, Dynamics lessons (m5O_sBag_iA, F7bcjQAK0Wc, s2qVeTnx89M, gyaMwGSsrb8, nqoCyOME8Jo; ZBrush 2021)

- **What the solver does.** It keeps edge lengths and surface area on every movement. Stretch means
  too little computation for the movement: raise Simulation Iterations or lower Gravity Strength or
  brush speed. "Iterations high, speed low" for tight fabric (m5O 00:14:54-00:20:55).
- **Iterations stiffen.** Very high iterations with high Firmness never compresses (m5O 00:20:24).
- **Fabric weight.** Firmness 1 is silky, 2 soft, 4 medium, 5 to 6 leather (m5O 00:17:59-00:19:48).
- **Defaults.** Gravity Strength 10 and iterations 100 on screen in 2021; clean drapes at gravity 1,
  or at gravity 10 with iterations 1000 on simple meshes (F7bc 00:03:34-00:05:09). The 2026 doc says
  iterations default 50.
- **Simulate low, preview high.** Simulate the low-resolution mesh and preview with Dynamic Subdiv;
  Apply only when the drape is right (m5O 00:05:18).
- **The collision volume** is a voxel copy of every visible, non-active SubTool, held in memory
  until Recalc or until CollisionVolume goes off (nqoC 00:01:10-00:04:10).
  - Resolution: 16 unusable, 128 blocky, about 1024 good, 2048 available (nqoC 00:07:17-00:09:54).
  - Close holes on a duplicate collider (nqoC 00:01:58).
  - Collision Inflate: 0 touches, about 0.9 keeps clear; Dynamic Thickness Offset 100 makes the
    simulated surface the inside (nqoC 00:06:08-00:07:17).
- **Inflate versus Expand.** Inflate follows normals; Expand and Contract act on edges and fight the
  solver to make wrinkles. Axis toggles are world axes. Masking pins (s2qV 00:00:32-00:10:26).
- **Leftover switches.** Everything switched on in Dynamics also runs during cloth brushes and
  TransposeCloth: a leftover Contract collapses the mesh (s2qV 00:14:26; gyaM 00:00:31).
- **Cloth brushes.** ClothPinchTrails needs Trails 10 to 16 (1 fades, 100 is too strong) (gyaM
  00:03:09). Uniform dimples: ClothDimple on DragDot, then wiggle in place (gyaM 00:12:34).

### Maxon docs: Dynamics, cloth brushes, Mesh Extract

- **Stopping and pinning.** Stop a simulation with a click in the document or the Spacebar; mask,
  then resume: masks fix areas in place.
- **Limits.** Max Simulation Points defaults to 250 (thousands).
- **Morph target as area reference.** A stored morph target is the surface area to maintain.
- **MDD.** Record Deformation Animation writes an MDD file.
- **Extract.** Thick 0.01 for cloth, 0.03 for leather; clear the mask on the source afterwards.

## 6. Fur and hair

### Pablo Munoz Gomez, FiberMesh for hair and fur (lgTA_ebLGDw, 2020)

- **Groom or settings, not both.** Grooming overrides twist, revolve radius and gravity (00:01:24,
  00:05:47).
- **See what you groom.** White base and tip colors; FillObject the fibers in a contrasting color to
  expose gaps (00:06:53-00:09:32). For shimmering fibers, Document > Double then AAHalf (00:07:24).
- **Creature fur.** Max Fibers 11 (thousands), Segments 6; Fast Preview with PRE Vis 6 to 8 grooms
  through guides (00:08:28-00:10:04).
- **Masks select clumps.** Masking any point masks the whole fiber, so masks plus Ctrl+W make clump
  and parting polygroups (00:12:11-00:13:16).

### Maxon FiberMesh docs and Pavlovich hair simulation (QCcDTuDT2HM)

- **Mask drives growth.** Mask intensity modulates density and length. Fibers take color from
  PolyPaint only. Generate in several passes.
- **What survives Accept.** Preview settings stop mattering after Accept, except the BPR options.
- **Profile 1** while working; get volume from BPR Sides or Dynamic Thickness.
- **Topology changes convert.** Subdividing or slicing turns a FiberMesh into a polymesh, and
  FiberUV grays out.
- **Human head.** 80k to 140k hairs.
- **Before a hair simulation.** Pin the roots with Mask By Fibers (FiberMask with a root-only
  profile), then CollisionVolume against the head, Self Collision 1 and a slightly lower Collision
  Inflate (QCcD 00:03:23-00:04:37).
- **Cards.** FiberMesh can make hair cards (Width Profile max, Coverage max, Profile 1, BPR Sides
  2); every fiber is UV'd root to tip (QCcD 00:00:00-00:02:09, 00:07:01).
- **Custom strands.** Swap fibers for designed strands with Frame Mesh plus an IMM curve brush, or
  MicroMesh plus Convert BPR To Geo (QCcD 00:14:12, 00:17:00).
- **Curve Flat** is Curve Tube with Brush Modifier 0: the scriptable hair-card route through the
  curves API (goZavCi515k 00:02:20-00:02:50).

## 7. Game production rules (Rakan Khamash, Overwatch 2, FRZtVXpAokc, Summit 2023)

- **Readability.** "Say it or don't": readable from the back of the room (00:02:16, 00:05:00).
- **The blockout** is 90 to 95 percent of the low poly (00:21:37).
- **Shape language.** S and C curves; no parallel lines; no noisy curves; 70/30, never 50/50; flare
  at the top, taper at the bottom (00:06:07-00:08:53, 00:16:37).
- **Rest areas.** An armored arm next to a bare one (00:06:40).
- **Rig first.** Skins share the hero's face topology and loop counts; straps snap to loops
  (00:11:04-00:11:37).
- **Floaters** for anything that may change (00:13:16).
- **Folds** only where pressure and joints demand; fold brushes sculpted on a plane and stamped
  (00:19:55-00:21:00).
- **Design on the body.** Polypaint the design on the nude body, decimate with polypaint kept, and
  trace the color borders as topology (00:37:33).
- **1:1 bakes.** Project the high poly onto the final low-poly face with polygroups per loop
  (00:41:27-00:42:31).
- **Wear physics.** Dirt from the bottom up; chips at the first contact point, never mid-panel
  (00:25:34-00:26:42).

## 8. Projection, frequency stages, sharpness and brush order (FlippedNormals)

### Henning Sanden and Morten Jaeger, "Reprojecting Details" (Zp07GW3rND0, 2018)

- **Both nets first, at the top level.** Store Morph Target, then a new Layer, then Project All:
  "It's important that you do all of this on the highest level" (00:02:13, 00:02:47). PA Blur
  lowered. Target subdivided to "a few million", about 3M (00:01:02).
- **Danger zones.** Parts that sit close together (eyes, mouth, armpits, fingers) grab the wrong
  surface (00:01:41). Keep a polygroup inside the eye, grow it a little past the lid, mask by it,
  then project (00:05:31-00:06:03); pre-shape the high-res where it differs a lot (the stomach), or
  project in stages from the lowest level upward (00:03:17).
- **Walk every level.** Toggle the layer and step through the levels (00:03:49). Armpits, between
  the fingers, butt and crotch fail most; artifacts there become hard lines in displacement maps
  "down the pipe" (00:07:10-00:07:43).
- **Repair without smoothing.** Rogue vertices "go to infinity"; smoothing "doesn't work" on busted
  areas: Morph brush back to the stored target, or mask, invert and reproject locally (00:04:27,
  00:06:36, 00:09:27).
- **Timing.** Stop the concept sculpt before micro detail when retopology is coming (00:08:22).
- Agent reading [added]: `spike_report` per polygroup at each level replaces the eye on spikes; the
  eye-interior mask is a MaskLasso polygon from `region_on_canvas` [verify] or a computer-use
  polygroup isolation.

### "Top Tips for Sculpting" (G2o6fdoACIQ, 2020)

- **Never skip a frequency.** The mid-frequency pass, "shapes within shapes", is the backbone of
  detailing; pores before it look like decoration on a statue (00:05:13-00:05:46, 00:08:17).
- **Symmetry breaks at the mid-frequency stage**, on the big shapes (the mouth), before any pore
  (00:06:19).
- **Silhouette stability.** The less the silhouette changes between later stages, the more solid the
  design (00:17:27).

### "Learn to Sculpt Like a Pro" (0PaYUUvgwYM) and "The Only 6 Brushes You Need" (TpS0QdlfHWU)

- **Carve deeper than feels right.** Shading, subsurface scattering and soft light eat sharpness
  later (0P 00:19:49-00:20:22). J Hill says the same from the render side: only the sharp detail
  survives in the SSS highlights (HlHoIGE2Ocs 00:34:53).
- **Brush order.** ClayBuildup replaces what is under it; Standard pushes and pulls what is there.
  ClayBuildup belongs before pores, Standard after (TpS0 00:03:55, 00:07:44). Costa: repeated
  Standard passes also "obliterate" finished pores, so his directional pass uses a cloned Elastic on
  Spray with Alpha 16 (j5XLtLMN0P8 00:51:50-00:52:22); J Hill builds volume between lines with
  Elastic at very low intensity, because Clay smooths them away (00:20:21-00:20:53).

## 9. Maxon docs that set the rules

- **3D Layers.**
  - New layers only at the top level; Record turns on by itself and can only be turned off at the
    top level.
  - Intensity 1 as sculpted, above 1 exaggerates, negative inverts, always 1 while recording.
  - Bake All bakes at current intensities. A single-layer bake (StoreMT, delete, Switch) loses
    polypaint and masking: Split first.
  - Erase layer content locally: hide the layer, StoreMT, unhide, paint with the Morph brush.
- **Morph Targets.** One per SubTool; destroyed by topology changes; the typical use is restoring
  the base right before map generation.
- **Surface Noise.**
  - It is a render effect until Apply To Mesh, and it shows only with Quick 3D Edit on.
  - Keep Strength low; SNorm 100 at high scale and strength; divide enough before applying.
  - NoiseMaker Mask Mixing: Magnify by Mask and Strength by Mask.
  - NoiseMaker settings save and load as files; since 2026.0 NoiseMaker rotates, scales and offsets
    the alpha, so a scale tile can follow each region's flow.
  - Open NoisePlug with Strength at 0.5 or -0.5 to see the preview; Snake Skin needs Scale
    Variability and "especially some Amplitude"; UV projection can show seams.
- **Alphas.** Flattened 16-bit grayscale without compression. GrabDoc makes a true 16-bit alpha from
  canvas depth.
- **HD Geometry.** Up to 1 billion polygons (the ceiling that 3 DivideHD over a 16M regular stack
  already reaches).
  - Only the region is live, sized by MaxPolyPerMesh (100 at startup on this Mac, Activity log
    2026-09-24; units [verify]).
  - BPR renders HD with Render Properties > HDGeometry.
  - XTractor captures detail into alphas with the G key: GrabDoc on a plane is the scriptable
    substitute.
- **Displacement.** Mid 50 by default (0 for 32-bit, per the Multi Map Exporter doc); normal and
  displacement maps must share the Adaptive setting.
- **Multi Map Exporter.** UV tile ID format UDIM (Mari numbering) and UDIM output lists since
  2021.7; Merge Maps writes TIFF, so it is off with EXR and each object gets its own tile
  (FlippedNormals -ThBTEc8L_M 00:04:43-00:05:41, 00:11:08; [verify on 2026]); a dot before the tile
  number makes the files an image sequence (00:06:36); ESC during export can lose the UVs: save
  first (MME doc Warning).
- **Decimation Master.** Decimate a duplicate, never the master; the result reflects the model as it
  was at pre-process time; a scripted Pre-process ended the calling ZScript in a forum report, so
  run it as its own bridge call [verify] (Decimation doc).

## 10. Disagreements and deciding conditions

| Choice                              | Positions                                                                                                                                                                                                                                                            | Decide by                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hand scales, alphas or procedural   | Starkie: every scale by hand on a close-up hero; Henning: custom alpha plus a mandatory unify pass; docs: NoiseMaker Scales and Snake Skin                                                                                                                           | hero close-up with budget: by hand (per-scale stamps for the agent). Coverage seen closer than gameplay: alpha plus unify. Tertiary, previews, concept: procedural                                                                                                                                                             |
| Pore bed                            | Costa: hand stamps, one size per zone; J Hill: Surface Noise tiling map, then hand fill and Morph-brush variation                                                                                                                                                    | scale uncertain or agent-driven: Surface Noise first (a slider) [added]; authorship on hero zones: stamps                                                                                                                                                                                                                      |
| Wrinkle brush                       | Costa: Standard + sharpened Alpha 39 (Dam_Standard pinches); J Hill: Dam_Standard for lip sections and crisp memory creases                                                                                                                                          | soft wrinkles grown from pores: Standard. Deep crisp creases standing above the rest: Dam_Standard or a tiny line brush                                                                                                                                                                                                        |
| Stack                               | Costa and J Hill: regular to 1 to 2M, then HD; J Hill for games: regular only to 20 to 40M                                                                                                                                                                           | decided before the first Divide by the driver: a computer-use agent and a film close-up: 3 to 4 regular + 3 to 4 HD from the start. Bridge only: regular to about 20 to 25M, micro detail as a tiled map at render (Costa's own last step, Lfen 01:11:31) [added default]. Never HD over 6 or 7 regular levels (`stack_check`) |
| Displacement Mid                    | Costa: Mid 0 with 32-bit for Arnold; J Hill's panel appears 0.5 [?]; MME doc: 0.5 for 16-bit, 0 for 32-bit                                                                                                                                                           | the renderer's zero decides; record it with the map                                                                                                                                                                                                                                                                            |
| Export level                        | Costa: level-2 mesh, exporter SubDiv 2; J Hill: SDiv 3 with an 8K normal in Marmoset                                                                                                                                                                                 | match the exporter's SubDiv to the mesh the renderer receives                                                                                                                                                                                                                                                                  |
| Detail strength control             | J Hill: heavy then back with the Morph brush; Costa: thin layers at low intensity                                                                                                                                                                                    | subtle secondary forms: build up slowly; uncertain tertiary, and inside HD where layers do not survive: heavy then back                                                                                                                                                                                                        |
| Symmetry                            | Eaton: none on posed figures, Posable Symmetry for face and toes; FlippedNormals: broken at the mid-frequency pass; J Hill: big forms in the last 25 percent; Lazov: symmetric, then Morph-brush asymmetry; Costa: pores symmetric until placed, wrinkles asymmetric | posed: asymmetric from the start; neutral or concept: big forms broken at mid-frequency and again late, pores may stay mirrored until placed                                                                                                                                                                                   |
| Displacement Adaptive               | Costa: Adaptive on, DPSubPix 4; FlippedNormals: Adaptive off, "negligible" gain for a huge time cost (100 UDIMs: about 1 hour versus 24)                                                                                                                             | many UDIMs or iteration speed: off. Few tiles and a hero still: on. Either way identical in the normal map that combines with it (HD doc)                                                                                                                                                                                      |
| Switch MT after an external UV edit | Costa: Store MT, Switch, Import, no Divide, Switch MT on, or big forms leak into the displacement; FlippedNormals: Switch MT "currently broken" in their build                                                                                                       | test it on one tile in 2026 before relying on it [verify]; if it leaks, re-import and re-project instead                                                                                                                                                                                                                       |
| Smoothing                           | Kingslien: Shift-smooth lumps under Sculptris Pro; Grassetti: smooth to fade folds; Henning: smoothing is blurring, inside scales only; J Hill: smooth at a lower level                                                                                              | block-in lumps: smooth. Detailed surfaces: resculpt, or smooth at a lower level or under a cavity mask                                                                                                                                                                                                                         |
| Simulate or sculpt cloth            | Kingslien lists a Marvelous recipe; Grassetti: sim if faster, finish by sculpting                                                                                                                                                                                    | drape and garment volume: sim. Hero folds and views without reference: sculpt. Both: sim base, sculpt pass                                                                                                                                                                                                                     |
| Scapula                             | Eaton: about 30 degrees at 90 degrees of elevation; A4S: rotation only above shoulder level                                                                                                                                                                          | use Eaton's number near horizontal arms; read A4S as "obvious above shoulder level"                                                                                                                                                                                                                                            |
| Color early or late                 | Lazov and Blizzard paint early to read the design; Berger and the Keos team keep anatomy approvals gray                                                                                                                                                              | design exploration: color; anatomy approval: gray                                                                                                                                                                                                                                                                              |
