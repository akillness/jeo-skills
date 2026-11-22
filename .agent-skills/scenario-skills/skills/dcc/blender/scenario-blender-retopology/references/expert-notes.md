# Expert notes: retopology

Principles and judgment by expert, each with its source video and timestamp (video ids in
`sources.md`). `[added]` marks my own additions or measurements; everything else is the expert's.
Snow = Julien Kaspar's "Snow - Stylized Character Retopology Live" series (#1 sXhIz-5g3Gc, #2
tRqCeWZLqQo, #3 7xMRyBHeDBo, #4 KWNcQZQkyjc, #5 8ljpBjgIST0, #6 8UqpNwkTEXA, #7 EBet5sIZcKY, Finale
FnTOVcPaWV8).

## 1. Julien Kaspar (Blender Studio): film retopology

### 1.1 The requirement map (BCON22, OLwtul3ngB8)

- Retopology is a puzzle with many valid answers; once requirements are known "it's hard to really
  go wrong" [00:04:37]. "Good" means the sculpt's forms read in both the subdivided and low version,
  loops are easy to select for riggers, and the mesh is light [00:03:31].
- Do expression tests before retopology (sculpted on temporary topology) to learn where creases form
  and how far features move [00:06:14].
- The map is drawn as Grease Pencil layers named, in his file, `edge flow`, `creases primary`,
  `creases secondary`, `articulation`, `expression bounds`, `landmarks` (layer panel visible in
  every frame from 00:00:45). What the frames show:
  - **Edge flow** (yellow, 00:07:53): a ring around each eye, a ring around the nose, rings around
    the mouth, the nasolabial loop running from over the nose around the mouth to the chin, a face
    frame from the forehead down the jaw, a ring around the ear.
  - **Primary creases** (cyan, 00:09:23): the lid creases around both eyes, the nose wing, the lip
    outline. Modeled into topology so they stay crisp [00:09:01].
  - **Secondary creases**: only in expressions; each needs one loop on it plus two proximity loops
    the rig can squeeze [00:10:11].
  - **Articulation** (purple, 00:10:53 and 00:11:38): short strokes across each lid (start, middle,
    end), across the lips, across each brow, with small boxes on the brow marking the control
    points. Tindall's model: each feature is a curve with 3 controls and 2 handles per control; eyes
    add 2 corner loops splitting top from bottom [00:11:52] [00:12:25].
  - **Expression bounds** (red, 00:13:08): one large loop from under the nose over both cheeks
    around the chin: how far the mouth corners must travel. Poles and loop direction inside it limit
    that travel [00:13:32].
  - **Landmarks** (magenta, 00:13:53): the eyebrow shapes outlined on the forehead; areas where a
    separate object (brows, horns, an ear tag) must move with the skin get matching topology
    [00:14:05].
- Style calibration (frames 00:14:38 to 00:20:38): Snow's retopo under all six layers; Rex (Sprite
  Fright) with a huge mouth ring, bounds covering the whole lower face and poles only in the cheek,
  no secondary creases because 2D creases were added by another system [00:17:26]; Anar (Heist,
  realistic) with rings and radial articulation strokes but a generic, fairly even grid, no creases,
  no landmarks [00:18:35]; a generic sculpting base mesh with even quads that can simply be
  shrinkwrapped onto a realistic sculpt [00:20:16].
- Rain's head colored by face sets per patch (00:05:17): purple eye masks, pink nose and mouth,
  orange nasolabial area, green cheeks, blue skull: patches are the unit of design. Seams (red) mark
  patch borders and articulation loops, sharps (cyan) mark crease edges, as reminders (frames
  00:00:45, 00:04:32, 00:15:23).
- Snow uses about half the polygons of Rain for the same requirements because its patches are
  tailored to its chin, ears and boxy forehead [00:15:11].
- **Live demo on the sheep character this skill is tested on** (retopo_demo.blend): stack Mirror (X,
  Clipping, Merge 0.001 m, frame 00:27:23), Shrinkwrap (Target Normal Project, Snap Mode Above
  Surface, Offset 0.001 m, plus "Smooth Factor 0.050, Repeat 1", frame 00:22:53, an option absent
  from 5.2.1), Subdivision (Catmull-Clark, viewport 1, render 2, Optimal Display on, 00:26:38),
  Solidify last (Simple, negative thickness, Offset -1, Rim Fill, 00:34:08) only to hide back faces.
  He starts with an isolated eye ring with radial spokes and marks seams on it (00:28:08 to
  00:29:38), then the mouth and nose island (00:31:08), keeps islands separate [00:36:28], relaxes
  in Sculpt Mode with the Topology-type brush (00:39:23), and adds crease loops terminated by
  diamonds on the brow (00:42:23 to 00:43:08).
- Build rules from the demo: start with eyes and mouth [00:27:00]; keep top/bottom counts locked
  with a temporary 2-pole (select two verts, J, subdivide the new edge) [00:28:40]; do not push
  vertices early, jagged is fine [00:32:45]; proximity loops come later [00:35:12]; spiraling into
  the nose is acceptable [00:37:05]; treat Tindall counts as a minimum [00:37:37]; contain crease
  loops locally: bevel the crease edge, add a center loop, merge and collapse into a diamond
  [00:44:59]; poles where there is little movement, never on a crease [00:43:49]; cheeks one big
  square patch [00:48:18]; retopologize eyes in their most common state (he leans half-open) and
  hand over open/closed shape keys [00:47:10]; "even if you go a bit too high or a bit too low ...
  it doesn't quite matter" as long as key features are captured [00:49:56].

### 1.2 Setup and maintenance (Snow)

- Retopologize the most final sculpt (the expression-test head) [#1 00:06:26].
- Stack: Mirror (clip, on cage) > Shrinkwrap Target Normal Project, On Surface (he used Project
  before, "but it requires more setup") > Subdivision in object mode only [#1 00:11:32] [00:12:09].
  Apply location and rotation so the mirror plane is world X [#1 00:29:49] (the agent equivalent:
  give the cage the sculpt's matrix [added]).
- "Duplicate and apply" the Shrinkwrap regularly so real vertices sit on the surface; also before
  quitting [#1 01:31:00] [02:15:58]; twitching in Sculpt Mode means it is time [#5 00:13:09].
- One retopo object over two sculpts: two Shrinkwraps restricted by vertex groups [#5 00:56:06]. A
  "shrinkwrap" vertex group masks the inner mouth, lids and nostrils at 0; every new skin vertex
  must get weight 1 or it stops wrapping [#2 02:02:06] [#3 00:16:26]. A copy with the wrong wrap
  method makes vertices jitter [#3 00:19:30].
- Relax across the mirror seam: duplicate and apply the Mirror, keep a live Mirror with Bisect, mesh
  X symmetry on [#2 00:30:36].
- Clothing shells snap to their own inner side: pre-offset outward, then Project, both directions,
  Above Surface, Limit [#7 00:03:56] [00:48:52].
- Vanilla Blender only; F2 the one add-on [#1 00:16:11].

### 1.3 Face (Snow #1, #2)

- Plan order: edge flow, articulation counts, creases (look at the expression shape keys for
  secondary creases), then poles [#1 00:12:49] [00:33:07].
- Articulation for mouth and eyes: a middle, left, right and corner loop, each flanked by two handle
  loops; "enough loops to pull off any shape you want" [#1 00:18:34] [00:19:41]. [added arithmetic:
  about 9 radial edges per lip between corners.]
- A 2-pole at the mouth corner turns the upper-lip loop back into the lower lip so every added loop
  circles the mouth; ripped open later for the inner mouth [#1 00:22:38] [#2 01:55:24].
- Block the eye as if closed (temporarily filled) so lid loops stay symmetric [#1 00:27:00].
  Eyelids: 2 loops per lid crease plus about 4 across the lid so the closed eye keeps volume; lids
  are thick, extrude inward [#1 02:10:46] [02:11:22].
- Crease = center loop + two framing loops; "the closer they hug this edge the sharper the crease"
  [#1 00:34:37] [02:13:08]. A brow crease only needs cross-hatching loops [#1 01:15:06].
- Poles never on creases, on flat surface, framed by loops; 6-edge pole "horrendous", split into two
  5-poles [#1 00:36:27] [00:51:45].
- Loop sinks: send surplus loops into the nostril or an unseen hole [#1 01:00:34] [#2 01:14:39];
  never add loops into a finished mouth or eye [#2 00:52:35].
- Eyebrow landmark: skin loops under the brow match the eyebrow mesh loop for loop [#1 01:05:17].
- Square beats uniform: rectangles are fine if cage and subdivided shapes agree [#1 00:58:44]. Never
  subdivide the retopo to gain resolution [#1 01:26:04]. Head density deliberately high for rig
  control [#1 01:22:16].
- Loop budget out of the face: merge exiting loops into the face-framing loop (two fewer each time),
  frame the chin with rerouted loops, turn loops back before the chest [#2 00:03:03] [00:41:44]
  [00:45:54].
- Poles aligned into patches when cheap ("my own personal little OCD") [#2 00:12:57]; separate
  adjacent 5-poles [#2 00:53:13].
- Rigor scales with deformation: exact counts at mouth and eyes, ears only need non-spiraling loops,
  hidden ear parts may be messy [#2 01:33:38] [01:38:30].

### 1.4 Hair shells, eyes, reuse (Snow #3)

- Stylized hair stays a mesh; loops follow each clump's lines; start at "game asset low poly"
  minimum, every loop precious [#3 00:57:06] [01:03:11].
- A bulge needs at least one loop or the subdivided shell collapses [#3 01:05:50]; hard edges
  between volumes by bevel (two close edges crease) [#3 01:09:41]; lay out everything before
  beveling [#3 01:18:27].
- No poles on a shell's open rim; Solidify Only Rim for edge thickness [#3 00:36:54] [00:34:38]. Do
  not mirror hair clumps [#3 01:42:45].
- Cornea, not the inner eye, touches the lids [#3 00:44:18]. Teeth, tongue, eyes reused from Rain
  [#3 00:37:34].
- Triangles and n-gons: beginners never; experts where unseen or non-deforming, knowing why [#3
  01:29:54]. Games triangulate before baking because normal maps depend on the exact triangulation
  [#3 01:51:35].

### 1.5 Limbs, hands, body (Snow #4, #5)

- Separate objects per part; connecting early makes every loop run through arm, fingers and hand [#4
  00:07:28].
- Arm from an 8-vertex circle centered with the cursor snapped to Volume, "go as low as possible"
  [#4 00:06:16]; 3 loops per joint minimum [#4 00:08:01]; leg cylinder 8 then 12 [#5 01:21:00]
  [01:22:09]; knee inset twice so the sharp edge sits between two loops [#5 01:26:56].
- Fingers from a cube, 3 loops per joint plus a nail loop, linked duplicates (Alt+D) so one edit
  updates all, thumb a real copy [#4 00:29:17] [00:35:53].
- Ring counts at connections: wrist 10 vs hand 16, "six too many"; hand 18 vs arm 11 reduced by
  looping two loops back into each other; leg 12 vs body 14; foot 27 vs leg 14 [#4 01:27:33] [#5
  00:33:59] [01:45:15] [02:00:22]. Diamonds terminate loop pairs on the back of the hand, the part
  that moves least [#4 01:30:37].
- Put terminations and density where nothing moves but everything around moves (between the
  collarbones) [#5 00:58:19]. Muscles under clothes: "just a tube with a bit more definition" [#2
  00:48:03].
- His criteria: clean, all quads, subdivides well, captures forms, easy to rig; vertex count
  irrelevant [#4 00:58:52]; must also work unsubdivided [#4 01:09:22].
- Merge: Ctrl J, Bridge Edge Loops, slide one loop into the other with Auto Merge [#5 02:06:31].

### 1.6 Volume (Snow #5, #6)

- Shrinkwrapped low topology loses volume under subdivision [#5 02:08:30]. Apply Base trick:
  Multires subdivided 2 (body) or 3 (head, hair, clothes) times, Shrinkwrap after it applied onto
  the levels, Apply Base at level 0, swap for Subdivision [#5 02:09:01] [02:15:03].
- It overshoots and depends on density ("the apply base ... doesn't consistently add too much
  thickness") [#6 01:00:06]; follow with a wire-display deflate pass until the wire just touches the
  skin [#6 00:14:27]; never re-shrinkwrap after it [#6 00:20:08]; stop snapping after the volume
  pass [#5 02:14:31].
- Rebuild distorted sharp edges by dissolving and re-adding straight loops [#6 00:25:33]; leave rest
  creases softer so the rig can sharpen them [#6 00:39:00]; small lip gap, no overlap [#6 01:14:40].

### 1.7 Clothing (Snow #6, #7, Finale)

- Clothing starts as a duplicate of the body retopo so loops match and weights transfer one to one
  [#6 01:33:34] [01:44:44] [Finale 01:51:51].
- Folds: one loop per peak and valley; bevel a loop into two close loops for a crease, bevel twice
  to fan into a soft fold; diamonds split one loop into three and rejoin but stretch, so keep their
  ends off creases [#7 00:07:46] [00:08:54] [00:10:33] [00:33:42].
- Pose-independent folds modeled into the cage so animators see them unsubdivided [Finale 00:27:25].
  Triangles in pairs so they merge into quads [Finale 00:28:32].
- A 6-edge pole becomes 5, 3, 5 by extending an edge [#7 00:11:41]. Split an object for partial
  asymmetry, Mirror on the symmetric part [#7 00:32:03].
- No intersections even where the body is hidden [Finale 01:47:58]; keep an inner band at openings
  (Rain's clothes looked glued without) [Finale 01:49:42].

### 1.8 Handoff and effort (Finale, #6)

- Modifiers applied, location/rotation zero, scale 1, a material per object, `GEO-` names; the
  character must read with Subdivision hidden, "the subdivision that the riggers, the animators are
  going to use" [Finale 01:56:19] [01:58:41] [#6 01:37:02]. Rig-prep shape keys (eyes open/closed,
  pupil dilation) belong to retopology [#7 01:50:55].
- Time: about 2.5 working days for Snow; "a week at least" is normal for a main character [Finale
  00:01:16] [#5 01:34:22]. Tools will not solve the puzzle: "you still have control over where your
  poles are" [Finale 00:30:46]; semi-automatic is the likely future [#4 01:05:18].

## 2. Jonathan Lampel (BCON24, PAK5zQONgvs): why topology behaves

- Pinching comes from differences in vertex density in the subdivided result: a 3-pole makes a dense
  spot, a 5+-pole a sparse one; harmless on flat areas, harmful on curved or deforming ones
  [00:20:44] [00:21:18]. "All quads for subdiv" really means "watch your poles"; an n-gon under
  subdivision makes one N-pole plus 3-poles around it [00:19:39].
- Quads are the best default; triangles and n-gons are tools when intentional: tris are efficient
  and a triangle wedge can keep a joint's outer volume [00:10:34] [00:14:22]; n-gons are fluid and
  make good temporary blockers so loop cuts do not run around the whole model [00:16:30]; deformed
  n-gons re-triangulate and flip shading [00:17:37].
- See the density you create: wireframe at reduced opacity, Subsurf Optimal Display off [00:23:00];
  n-gons and tris then redirect loops with a light cage [00:24:08].
- Holding edges: loops; a Bevel modifier above Subsurf with even segments and Profile 1.0
  (attribute-driven since 4.3); creases for background objects (little change between 0.5 and 1,
  then a pop); double smooth (Subsurf with creases at level 1, then Subsurf without creases at
  level 2) [00:26:29] [00:29:12] [00:30:34].
- Junctions to step density down: 3-to-1 for odd counts, 2-to-1 for even, a corner variant; face
  loops running to a tail make it boxy [00:32:18] [00:32:50].
- Low poly: every edge supports the silhouette, casts a shadow, divides materials or is a UV seam,
  else delete it [00:34:32]. Triangulate before exporting to a baker [00:12:45]; Flip Quad
  Tessellation keeps the quad but changes the split [00:12:13].
- Clean-up list: non-planar and concave quads, long thin faces, overly dense geometry (the most
  common problem in RetopoFlow bug files), non-manifold, inconsistent normals, loose parts, internal
  faces [00:35:01] to [00:37:26]. Watertight is not a game requirement [00:37:59].
- Problem solving: push problems into flexible areas (n-gons, boundaries, the symmetry axis, flat or
  still areas) [00:40:04]; stash a duplicate before rebuilding so curvature survives [00:42:14];
  delete and start over, his best models were rebuilt 3 to 10 times [00:44:08]; mask unavoidable
  lumps with transferred normals from a clean duplicate [00:46:27].
- Automatic retopology works for static objects, not deforming characters or cloth, because topology
  is deciding what matters [00:09:05].

## 3. Vilem Duha (BCON23, 7AR9-LxY6AQ): fit the subdivided surface

- "Everyone is snapping the vertices to the surface ... it's kind of old school" [00:07:18]: with
  subdivision the surface shrinks inside convex areas [00:07:52]. A Shrinkwrap offset hides the
  error outside and makes cavities worse [00:08:24].
- Place control vertices so the subdivided surface fits the sculpt; moving one vertex moves its
  neighbors' limit points, so solve iteratively like a cloth simulation [00:08:58] [00:11:15]. The
  remaining error shows where loops are missing or wasted [00:11:48]. Low poly also benefits from
  vertices slightly outside [00:09:32].
- Fluent manual retopo of a complex character takes 1 to 2 hours; auto tools like QuadriFlow are for
  static assets [00:07:18].
- [added] Implemented as `R.fit_subdiv`: limit positions of cage vertices from a level-1
  limit-surface Subsurf (base vertices come first in the evaluated mesh; on the sheep QuadriFlow
  cage the limit point sat 0.08 edge lengths from its vertex on average, 1.0 at most), nearest
  sculpt point, neighbor-smoothed and clamped moves.

## 4. Dikko: face map (SwM19PgSdCM) and body layout (3WnW_ZFXudk)

- Plan before building; the analysis matters more than the build steps [face 00:00:55] [00:33:01].
- Five 5-poles around each eye mark muscle direction changes: nose bridge between the eyes, outer
  eye corner, middle of the cheek, where the nose meets the cheek, upper cheekbone; they form a
  pentagon mask [face 00:01:28]. A similar star near the jaw-mouth junction [00:02:02]; a 5-pole at
  the top corner of the upper lip [00:06:25].
- Equal spans top and bottom of lids and lips, per quadrant (example 10/10, 3 per quadrant),
  non-negotiable for rigging; exact counts are circumstantial [face 00:03:42] [00:04:16]. Spiraling
  eye or lip loops mean rebuild; the face center line is one loop with no poles [00:04:49].
- One loop over the nose around the chin (nasolabial) nests the lip loops; the cheek is the only
  plain grid; a loop frames jaw and forehead [face 00:02:34] [00:03:42]. Extrude lips as a loop,
  never a square [00:31:36]. Mouth bag toward the throat keeps lip volume [00:41:46]. Splay eyelid
  thickness edges instead of merging into a star [00:40:30].
- Shrinkwrap does not work for ears, eyes and mouths; model ears by eye against orthographic
  references; ear rebuilt three times; identical spans each side of the ear hole make Grid Fill work
  [face 00:22:02] [00:34:06] [00:35:13].
- Neck: redirect extra front edges around the neck base (a throat area), collapse at the back (merge
  3, delete 2) [face 00:48:38] [00:49:12]; few vertical neck spans [body 01:01:12]; front and back
  neck density should match [body 01:08:30].
- Body core loops first: chest loop under the breast or pectoral, over the shoulder cap, around the
  back; hip "bikini line" loop to the small of the back with a pole at the hip [body 00:01:51]
  [00:02:55] [00:04:37].
- Arm spans at least 8, 10 to 12 typical, 14 on this character; legs 18; bevel the loop at the pole
  to separate limb loops from torso loops; forearm twist topology unnecessary with twist bones [body
  00:13:47] [00:26:03] [00:27:47] [01:16:41].
- Hip cap like a shoulder cap for buttock and thigh crease; no front reduction at a female crotch
  (bulge); no abs or back muscles on an animation body [body 00:33:35] [00:09:01] [00:32:28]. Route
  every added span to where it can end; break the neck temporarily so body spans do not offset
  eyelid counts [body 00:31:22] [01:09:39]. Prefer collapsing to adding [body 01:04:04]. A triangle
  at the back of the head under hair is fine [body 01:17:14].

## 5. Nikolay Naydenov (SpeedChar, Gameloft): game character low poly

- Budget by detail and camera, not volume: head 2,000 to 3,000 tris (final 2,600), body 5,000 to
  6,000, both hands about 1,000, typical character under 10,000, this one just under 12,000 with
  weapon; face about 3x body density [ep23 00:09:58] [00:34:34] [ep26 00:33:24] [ep24 00:50:34]
  [ep35 00:06:30].
- Surround only forms that make the silhouette; small lips and creases go to the normal map [ep23
  00:34:02] [ep24 00:05:08]. Loops only where animation needs them: mouth ring, eye ring plus one
  under-eye loop for blinks, finger bends and knuckles, a small polygon between fingers [ep25
  00:10:24] [ep24 00:25:32].
- Triangles are fine wherever nothing bends; slivers collapse to triangles; cut quads yourself where
  the automatic split would be wrong [ep24 00:00:32] [00:03:06] [00:11:06] [ep26 00:10:28].
- Explode parts along one axis before baking so nothing bakes into anything else [ep23 00:01:06].
  Edit the high poly without remorse to help the low (close gaps, symmetrize the high when the low
  is mirrored) [ep26 00:02:17] [00:48:55]. Deep cavities need low-poly geometry [ep25 00:39:02].
- Very low poly: skip the Shrinkwrap, snap to faces and fit with a sculpt pass [ep23 00:24:13]. The
  fitting pass before UVs: In Front off, low in wireframe, Inflate until slightly proud; triangulate
  twisted quads along the diagonal you choose [ep35 00:10:18] [00:18:44] [00:21:30]. Perfect bakes
  do not exist at this ratio [ep35 00:22:37].
- Front matters more than back unless the camera sits behind the character [ep26 00:04:25]; keep the
  face symmetric, split asymmetric bits into separate objects [ep25 00:04:29].
- Hard edges vs UV splits were never discussed (he shades all smooth); the baking rule "every hard
  edge is a UV seam" comes from On Mars 3D [C_RqdNbYOjE 00:08:04] and Polycount (see
  scenario-blender-uv-baking).

## 6. Setup and confirmations (Jamie Dunbar, CG Boost, Grant Abbitt, Ryan King, Kenny)

- Jamie Dunbar: Shrinkwrap failure modes: inward normals, one projection direction only, stale
  positions (popping), offset distortion, subdiv interference; fixes: recalc normals, both
  directions, duplicate + apply, recreate from scratch, no Subdivision while building [l-sALvdn3FI
  00:05:22] [00:06:17] [00:15:09] [00:22:19] [00:22:50]. Do not retopologize lumps and bumps
  [00:17:15]. Auto Merge threshold scales with the model (0.01 for a 3 m character) [00:11:05].
- CG Boost: snapping handles hand-moved vertices, the Shrinkwrap catches operator-made geometry
  (loop cuts) [X2GNyEUvpD4 00:08:04]; face snapping projects from the view [00:07:02]; important
  loops first, unconnected, low resolution [00:09:36]; finalize: apply Shrinkwrap and Mirror, check
  center merges [00:13:01].
- Grant Abbitt: 4 M-triangle dragon head to about 3.5k tris for a game [6sE-p8PcHDo 00:00:31]
  [00:02:07]; apply rotation before mirroring [00:04:19]; auto retopo (Quad Remesher) gave "no edge
  flow around the eye or mouth and far too many faces under the nose", fine for bake-and-paint only
  [C249AnzAI40 00:00:32]; poles appear where two flows meet [00:05:22].
- Ryan King: the Mirror modifier can make a click select the mirrored back vertex [1myOZaxtHes
  00:07:37]; a triangle beats a 5-gon [00:14:04]; put an edge on the crease or the detail flattens
  [00:15:41]; back up before applying [00:18:39].
- Kenny: five flows drawn first (eye, mouth, ear rings, nose bridge to chin, forehead down the jaw
  over the chin), same counts top and bottom, relax after every block [7XdbJX8roCg 00:00:35]
  [00:03:51] [00:11:00].

## 7. Ground truth: Blender Studio production meshes (bx_audit, calibration file)

| Mesh              | Faces  | Quads   | e3 / e5+ poles | valence 6+ | edge CV |
| ----------------- | ------ | ------- | -------------- | ---------- | ------- |
| Rex head          | 3,890  | 99.90 % | 38 / 31        | 3          | 0.805   |
| Snow body         | 9,402  | 99.96 % | 250 / 258      | 4          | 0.765   |
| Rain body         | 16,526 | 99.98 % | 241 / 247      | 2          | 0.619   |
| Rain face demo    | 1,653  | 100 %   | 6 / 22         | 0          | 0.600   |
| Franck sheep body | 2,596  | 99.92 % | 64 / 72        | 0          | 0.491   |

Takeaways: studio topology is 99.9 %+ quads; 3- and 5-poles come in near-equal numbers; valence 6+
rare but not zero; density is deliberately uneven (edge CV 0.33 on the hand base, 0.49 on the sheep,
up to 0.8) while an unedited uniform auto-remesh reads about 0.17 to 0.27: a hint of automation,
never a pass/fail gate; even studio meshes ship small defects (Snow: 4 non-manifold edges).

## 8. Disagreements and the deciding condition

| Topic                  | Options                                                                                                                                                                                                             | Decide by                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Shrinkwrap wrap method | Target Normal Project (Kaspar Snow; also the panel in his BCON22 demo file, frame 00:22:53, though he says "Project" at [00:26:26]); Project both directions + Above Surface (Jamie); Nearest Surface Point (Dikko) | skin: Target Normal Project; clothing or double-sided: Project + Limit; Project leaves vertices whose ray misses in place     |
| Loop density           | clean dense generic (Rain) vs minimal tailored (Snow, half the faces)                                                                                                                                               | realistic or generic style: generic base; strong stylized design: tailor (Kaspar)                                             |
| Sharp edges            | loop cuts placed by hand vs Bevel                                                                                                                                                                                   | face: loop cuts (bevel destroys annotations); hair, limbs: bevel for speed (Kaspar #1, #3)                                    |
| Hard edges             | supporting loops vs crease weight                                                                                                                                                                                   | loops by default; crease for background objects or double smooth (Kaspar #5 01:41:16; Lampel)                                 |
| Triangles              | never (beginners, visible subdivided skin) vs freely (rigid, hidden, game)                                                                                                                                          | does it deform and is it seen (Kaspar, SpeedChar, Lampel, Dikko)                                                              |
| Spirals                | rebuild (eyes, lips) vs tolerated                                                                                                                                                                                   | articulation rings must close; a spiral ending in a still area is fine (Dikko, Kaspar)                                        |
| Exact loop counts      | Tindall minimum (Kaspar) vs circumstantial (Dikko)                                                                                                                                                                  | rigged expressive faces: use the minimum; always keep top = bottom                                                            |
| Surface detail         | topology (stylized film) vs displacement or normal map                                                                                                                                                              | anything in the silhouette must be geometry; concave detail may be a map (Kaspar #7 01:15:10)                                 |
| Relax                  | Relax Slide brush vs nudging                                                                                                                                                                                        | relax by default; near lids and deliberately placed loops nudge (Kaspar #6 00:26:41)                                          |
| Volume fix             | Apply Base vs manual deflate vs Displace modifier                                                                                                                                                                   | Apply Base for speed, then a manual pass; Displace for a uniform offset (Kaspar #6); headless: `fit_subdiv` [added, measured] |

## 9. The sheep experiment: what an agent reaches (tests/code/blender-retopology/test_sheep.py)

Setup [added]: input `sheep_sculpt.blend` (186,464 faces, posed, 21 % local symmetry, two 144-edge
eye holes, open smile with fused teeth, rotated 27 degrees about Z). Kaspar's retopology covers the
sculpt without its tail (sculpt area 1.015 vs 0.606 in his region), so the agent budget was
area-matched: 2,596 x 1.015 / 0.606 = 4,347 faces. The reference was used only for numbers and a
coverage mask. Metrics from `R.fidelity` (subdivision 2, % of the 0.79 m size) and
`R.topology_report`.

| Strategy                    | Faces | Mean  | p95  | Max  | Inside | Coverage p95 | Eye rings | Closed-loop edges | Spiral suspects | Self-int. |
| --------------------------- | ----- | ----- | ---- | ---- | ------ | ------------ | --------- | ----------------- | --------------- | --------- |
| Kaspar (reference)          | 2,596 | 0.24  | 0.80 | 2.58 | 47     | 0.82         | 5, 5      | 29.9 %            | 8               | 177       |
| A QuadriFlow                | 4,372 | 0.14  | 0.40 | 3.19 | 87     | 1.75         | 0, 0      | 1.6 %             | 24              | 124       |
| B A + relax                 | 4,372 | 0.14  | 0.44 | 3.19 | 87     | 2.22         | 0, 0      | 1.6 %             | 24              | 100       |
| C B + aggressive fit        | 4,372 | 0.038 | 0.19 | 3.01 | 51     | 2.12         | 0, 0      | 1.6 %             | 24              | 183       |
| C2 B + gentle fit (default) | 4,372 | 0.045 | 0.21 | 3.07 | 53     | 2.15         | 0, 0      | 1.6 %             | 24              | 158       |
| D B + Apply Base            | 4,372 | 0.11  | 0.25 | 3.01 | 15     | 2.03         | 0, 0      | 1.6 %             | 24              | 169       |
| G hybrid, aggressive fit    | 4,543 | 0.043 | 0.21 | 3.54 | 50     | 1.56         | 3, 3      | 7.2 %             | 19              | 393       |
| G2 hybrid, gentle fit       | 4,544 | 0.042 | 0.20 | 2.08 | 52     | 1.59         | 3, 3      | 5.9 %             | 22              | 178       |

Findings [added]:

1. Raw `quadriflow_remesh` refused the manifold sculpt: edges under about 1e-4 fail its manifold
   check. Scaling the copy to about 10 units fixes it. It landed 14 % under target (corrected by
   rerunning), closed the eye holes, and is not guaranteed to repeat: the sheep runs repeated
   exactly, but a unit-test sphere gave socket borders of 20, 22 and 24 edges across three runs.
   Re-measure after every remesh, never reuse counts from an earlier run.
2. QuadriFlow density is uniform: the tail, which Kaspar did not even retopologize, took a large
   share of faces while face, hooves and ears stayed coarse; the thin right ear tore into spikes.
3. Relaxing a QuadriFlow mesh did not help and shrank extremities (coverage p95 1.75 % to 2.22 %).
4. The snapped cage's subdivided surface was 87 % inside the sculpt. `fit_subdiv` brought it to 51
   to 53 % inside and cut mean error 3 to 4x; Apply Base overshot to 15 % inside, as Kaspar warns.
5. The aggressive fit crumpled the cage at features too small for its density (hooves, mouth) and
   doubled self-intersections; the clamped, smoothed fit kept the same mean error with a lower max
   and the expert's level of self-intersections. The gentle values are now the defaults.
6. Carving rings at the eyes gave 3 closed rings per eye (Kaspar: 5); a projected ellipse at the
   open, teeth-filled mouth made that area lumpier, so G2 leaves the mouth to QuadriFlow and the
   report says so.
7. Rebuilding both ears as tubes socketed into the auto base removed the tear and improved coverage
   (p95 2.3 % to 1.6 %).
8. Every agent variant beats Kaspar's mean error and none looks as good: lumps on hooves and wrists,
   pinching at joints, a less clean face, 5.9 % of edges in closed loops against 29.9 %. Mean
   distance rewards chasing sculpt noise; the matcap and wire sheets decide.
9. What stays out of reach procedurally: the articulation template with handle loops, crease loops
   placed from expression shapes, loop budgeting out of the face, pole placement by movement, the
   eyebrow landmark. These need the map (Kaspar's six layers) turned into explicit rings, which the
   building blocks support but the agent has to plan part by part.

### 9.1 The v2 tools, fresh end-to-end run [added] (`test_sheep_v2.py`, `compare/compare.md`)

- Base: QuadriFlow 3,600 faces with a head density warp of 1.4 (1.8 and a 4,000 base forced more
  reductions and left a leg socket unbuilt; no warp raised poles and coverage error).
- Face sets read as the landmark map (lip line = mouth-opening set border, eye masks, ears, hooves,
  tail pieces); limbs and the 1.05 m curled tail as geodesic socket tubes with automatic roots (0 to
  2 cm from a person's reading) and 3 rings per detected joint.
- Eyes and mouth with corner-split, geodesic rings and counts as ranges: eyes 24 (12/12), mouth 30
  (15/15) on every clean ring; a nasolabial loop around nose and mouth; the closed-mouth variant
  gives exactly two 2-poles at the lip corners.
- Result: 4,980 faces, 100 % quads, 0 six-poles, poles 5.7 % of faces (Kaspar 5.2 %, E1 4.6 %), 0
  poles on clean rings, subdivision-2 mean error 0.028 %, coverage p95 0.53 % without the teeth (E1
  0.77 %, Kaspar 0.78 % in his region), closed-loop edges 33.9 % (Kaspar 29.9 %). Subdivided, the
  eyes lose E1's rippled lids.
- Pole sources measured: forced counts 9.5 %; a face frame +64 poles; staircase cut borders about
  half their vertices. Tried and rejected: pre-cutting island holes before QuadriFlow, sharp-edge
  guidance, smoothing cut selections, filling the whole nasolabial interior with mouth rings.
- Still below Kaspar: the nose and upper-lip patch between the lip rings and the nasolabial loop is
  irregular auto quads; slight lumps at the mouth corners; no crease loops or expression-bound
  planning; eye and mouth counts above Kaspar's 18/24 (forcing them costs 40 poles).

## 10. GUI-only techniques and the headless substitute

| Technique (who)                                                                    | Substitute                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Grease Pencil requirement map (Kaspar), painted plans (Dikko), annotations (Kenny) | landmark coordinates and loop counts as data; `R.surface_point`, `R.cross_section`         |
| Poly Build, F2, extrude to cursor, Tweak drag with face snapping                   | `R.add_ring`, `R.bridge`, `R.tube`, `R.project` (nearest or along normals, never the view) |
| Relax Slide / Smooth brush on the retopo                                           | `R.relax` (or `bx_gui` with the Relax Slide asset in a live session)                       |
| Inflate/deflate against the wire-displayed sculpt                                  | `R.fit_subdiv`; game: `R.push_outside`                                                     |
| Knife re-routing, Rip with Fill for a 6-pole                                       | `bmesh.ops.connect_verts`, `bpy.ops.mesh.vert_connect_path`; `mesh.rip` fails headless     |
| Mark Seam / Sharp reminders                                                        | boolean edge attributes (`retopo_crease`), read by `R.relax` and `R.topology_report`       |
| Cursor snapped to Volume                                                           | `R.volume_center`                                                                          |
| Visual loop tracing                                                                | `R.loops_around`, `R.loop_stats`, wire sheet                                               |
| Retopology overlay, In Front, Solidify back-face trick                             | not needed headless; `overlay.show_retopology` in a GUI session                            |
