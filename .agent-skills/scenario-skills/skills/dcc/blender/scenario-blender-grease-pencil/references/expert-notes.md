# Expert notes: Grease Pencil (principles and judgment, by expert)

Timestamps are `[mm:ss]` into the source video (see `sources.md`). [added] marks my own additions,
[verified] a fact checked in Blender 5.2.1 by the tests under `tests/code/blender-grease-pencil/` or
the distiller probes in `archive/tests/grease_pencil/`, [inferred] an unconfirmed reading.

## Tom Viguier (technical director, Andarta Pictures): Ewilan's Quest, a 2D series in GP (BCON24, legacy GP on 3.6)

Production judgment at series scale (8 x 26 min). His tools target 3.6; the principles transfer, the
code does not.

- **Stay true to the 2D DNA.** Multiplane "like Disney's", not a 3D set: every 2D element parallel
  to the camera, the camera never shifts its axis, 3D mixed in only where it saves production time
  `[14:39] [15:12] [15:46]`. Drawing flat then spinning it in 3D "doesn't serve any purpose"
  `[14:06]`. "Sometimes keeping it simple is just the way to go" `[15:46]`.
- **Layout owns staging.** Compositing kept finding missing background pieces, forgotten cuts for
  interaction, blurred-away backgrounds and animation drawn off screen; the fix was a strong layout
  department that validates camera, depth of field, background cuts and parallax before production
  `[16:31] [17:03]`.
- **Background plates from the layout camera.** Project the camera frame onto each element's drawing
  plane, compute the plate resolution with a margin, link the painting back so one repaint updates
  every shot `[17:35] [18:08]`. Agent version [added]: `cam.data.view_frame(scene=sc)` corners
  scaled by `D / -corner.z` for a plane at distance D, transformed by `cam.matrix_world`, then
  `bx_gp.px_size(depth=D)` gives meters per pixel.
- **The rig must never block redrawing.** "At any point you could just select an element, redraw it"
  `[22:01]`. Redrawing has a subtlety deformers lack and is sometimes just as fast `[21:29]`.
  Armatures used the 3D way mean weight painting every new drawing `[22:01] [22:34]`.
- **Rig with objects.** One GP object per physical element, layers inside by graphic logic (line in
  front of color), object depth animates front/behind `[22:34] [23:41]`. A layer stack cannot
  animate depth order; 200 layers in one object is unusable `[23:06] [23:41]`. [verified] Between GP
  objects the nearer origin draws on top (default 2D stroke depth order).
- **Cutout rig build.** About 60 parented elements for a lead, mostly FK in Object mode, an operator
  slides a part in depth to put it in front; a 2D IK on an armature still manipulated in Object mode
  with IK/FK switch; controls for line thickness; materials and palettes centralized in a separate
  file `[28:42] [29:16] [29:53]`. First rig took about 100 versions `[28:09]`; lead: 3 to 4 days
  design, about 2 weeks rigging; casual: 2 days and 3 days `[46:18] [46:53]`.
- **Poses from the model sheet, validated by designers** before use `[29:53]`. Partial poses apply
  to the children of the selected object, composing from the top of the hierarchy down; master
  controllers browse pose collections with the mouse `[31:44] [32:20]`. Agent version [added]: store
  dicts of object transforms plus drawing frame numbers, apply to a subtree.
- **In-betweens.** His tool interpolates GP frames and every F-curve of the object and its children;
  manual spacing input because animators know their spacing; "clip" picks the closest drawing when
  two are too different `[26:10] [26:44] [27:15]`. Native interpolation ignores the object's own
  animation `[26:10]`.
- **Interpolation rule (Q&A).** "We do need to have the same amount of strokes and the same color of
  each stroke numbered in the order" `[45:04]`. Frame pairs are identical copies, completely
  different, or sculpted (same strokes and points), and only sculpted pairs interpolate `[45:39]`.
  Implemented as `bx_gp.match()` and `inbetween(clip=True)`.
- **Frame instances.** He wanted one drawing reused in cycles with edits propagating; the Time
  Offset workaround blocked redrawing, so every frame stayed a unique copy `[33:30] [34:03]`.
  [verified] 5.2 has it: `frames.copy(a, b, instance_drawing=True)`, `drawing.user_count == 2`.
- **Cross-object masks were a slow hack** (generate a layer in one object from another, boolean it,
  use as a mask), used only for cast shadows and reflections `[34:18] to [35:58]`. 5.2 still masks
  only within one object [inferred]: keep parts that must mask each other as layers of one object.
- **Hybrid 3D where it pays:** reusable spider legs from many angles, horses cut into layers with
  holdout planes and reprojected so puppet parts interleave `[36:21] to [37:30]`. Turnarounds that
  are too fluid start "mimicking 3D, which is not the point at all" `[32:57]`. Smears are just
  drawings `[44:27]`.

## Grant Abbitt (educator, gamedev.tv): GP drawing for absolute beginners (4.4, GP v3)

- **The canvas is the camera**; when the view drifts, snap back to camera view
  `[01:26] [03:41] [03:52]`.
- **Materials are paint buckets.** "It's really important to understand that these are kind of like
  paint buckets" `[12:08]`: one edit recolors every stroke; delete unused materials to keep the
  palette clean `[12:39]`.
- **Know the active layer and lock the rest.** "It is very important to know which layer you're
  drawing on" `[11:01]`; erasers and sculpt affect every unlocked layer `[09:20] [19:14] [19:46]`.
- **Overlap then trim.** "A lot of time it's very useful when you're drawing to purposely overlap
  and then you can go in and cut those" `[10:29]`. [verified GUI] `bx_gp.gui_trim` cut an overshoot
  exactly at the crossing.
- **Brush identity.** Pencil: pressure on strength and radius; Ink Pen: pressure on size only, "that
  nice cartoony look" `[02:36] [04:55]`. [verified] bundled assets: Pen no pressure, Ink Pen radius
  only, Pencil both.
- **Shadow layer recipe.** Separate layer above Fills and below Lines `[15:25] [15:58]`, painted
  first in a contrasting temp color (blue) so it is visible over black lines `[18:08]`, masked by
  the Fills layer `[18:40]`, Multiply with lowered opacity so the exact color matters less: "the
  multiply is a bit nicer because it just darkens" `[20:18] [20:38]`. Reshape with sculpt Grab,
  others locked `[20:38]`. [verified by render]
- **Fix curves with Grab**, the most useful sculpt brush; Smooth is "a little bit awkward"
  `[08:48] [09:20]`. Headless equivalent: `bx_gp.grab`.
- **Erasing fills:** Point eraser beats Dissolve on fills; check leftovers in Edit mode
  `[09:58] [19:14]`.
- **Judging:** toggle layer visibility to see what lives where `[06:32]`, zoom for gaps between fill
  and line after sculpting `[21:11]`, check framing by rendering `[24:26]`.
- **Outdated in 5.2:** his fill workflow (fill-only material, Fill tool double tap, holdout "Eraser
  Fill" material for holes) `[11:34] to [15:00]` is replaced by per-stroke `fill_id`, real holes and
  the Delaunay fill solver (5.1, 5.2).

## Falk David, Rik Schutte, Pablo Fournier (Blender developers and Studio animators): GP3 updates and showcase (BCON24, 4.3)

### Falk David (led the GP3 rewrite)

- "All of Grease Pencil is now attributes" on point and curve domains, layers can carry custom
  attributes, which is what makes Geometry Nodes possible `[07:20] [07:53]`.
- **Why fill left the material:** "during rendering we don't actually know if a stroke is going to
  be filled or not because materials can for example be overridden at the object level" `[44:29]`;
  stroke vs fill belongs to the geometry or the draw tool `[09:34] [10:08]`. Shipped in 5.1.
- **Holdout is a render trick** that also hides what is behind; real holes are the fix
  `[48:28] [49:02]`. Fill tools were "one of the weakest" `[09:34]`.
- **Line Art's future is nodes:** "the answer is nodes" `[50:05]`.
- Onion skin is object-relative and skips modifiers and texturing `[42:52] [43:24]`. `bx_gp.onion`
  renders ghosts with both.

### Rik Schutte (Studio animator)

- **Block in 3D first**, then draw over it for perspective, timing and volume `[14:41] [15:14]`.
- A pixel-art hybrid was only partially successful because GP has its own renderer
  `[15:47] [16:53]`. Smoke as a simple line with a modifier stack; sets are "smoke and mirrors" that
  fall apart off camera `[20:30] [22:13]`.
- On unfinished software: reorder tasks and keep a triaged bug log with pictures `[21:41] [24:29]`.
- Project Gold: match the painted stroke's texture, transparency and color to the render first, then
  animate splashes frame by frame, flipping frames because onion skin ignored texturing
  `[26:48] [27:21] [27:53]`.

### Pablo Fournier (Studio animator, NPR cowboy)

- **Kill the blobby 3D shadows:** create all materials first, a light and a shadow material per
  part; redraw shadows as blocky designed shapes on top of what the light gives
  `[32:25] [33:00] [33:33]`.
- **Duplicate the stroke object per body part** so each part stays trackable `[33:00]`; strokes are
  reusable across similar poses with touch-ups `[34:39]`.
- **Sticky strokes fail two ways:** points drawn over an occluder stick to the occluder; points off
  the mesh "go to oblivion" `[35:44] [36:16]`. [verified] `bx_gp.project_to_surface` returns both
  lists (`missed`, `captured`).
- **"The solution is dissolving the points, not delete them"** `[36:48]`: deleting breaks the
  stroke. `bx_gp.dissolve` keeps continuity.
- **Fills are flat:** a big fill on a curved surface pokes through; pushing offsets cascades until
  "everything was like 5 km away"; use many small fills `[37:23] [37:57] [38:31]`.
- Line Art plus noise and envelope modifiers; where it misbehaves, draw over it `[39:47] [40:20]`.

## Michael Weigl (TD, Filmakademie Baden-Wuerttemberg): bridging GP and Geometry Nodes for 2.5D (BCON25)

- **Readability and artistic agency** are the two goals of 2.5D motion graphics `[05:55] [06:29]`.
- **Motion beats surface:** "we can polish an image to be perfect in like a still, but the moment we
  start moving the 3D object we suddenly don't read the strokes and shapes anymore but the motion"
  `[07:03]`. Deconstruct surface and motion.
- **Work with the medium:** forcing 2D toward 3D or the reverse makes workload grow "exponentially"
  `[05:04] [07:35] [08:06]`.
- **Sorting:** raw 3D depth makes strokes on one surface intersect, per-stroke z-sort destroys the
  artist's layers; group strokes into parts that cannot intersect (mesh islands), z-sort groups,
  never sort inside a group `[12:27] [13:00] [13:33] [14:02]`. Agent substitutes: separate GP
  objects per group (object depth decides, verified), `grease_pencil.stroke_depth_order = '3D'` when
  intersections are acceptable, `drawing.reorder_strokes` inside a drawing.
- **Canvases carry drawings like textures:** "just imagine that the grease pencil you draw are just
  like textures and they come with always meshes" `[24:21]`; stages can always add canvases and
  drawings `[16:10] [16:43]`.
- **LOD by camera distance** keeps drawn detail density coherent, "very important for stylized
  rendering" `[19:10]`. [verify] not built in bx_gp.
- **Procedural output stays editable:** bake to layers, edit any stroke, "not in a black box, not
  pixel based" `[19:42] [21:39]`. [verified] applying a GN modifier bakes into a layer named
  `Layer`.
- **Lighting:** "it's stylized rendering, you don't need more than one bounce" `[28:13]`; shading
  approximated once per stroke `[35:09]`. `bx_gp.relight` is a one-pass per-point diffuse version
  [verified by render].
- Detail only where displayed: "you only need to add as much detail and work into anything as you
  want to display" `[27:06]`. Natural phenomena (water) can be fully procedural; guide curves would
  fight constant change `[34:36] [35:09]`.

## Elijah Sheffield (3D motion designer): GP quick start, hybrid motion graphics (2025, GP v3)

- **"Lazy artist":** meshes as shape layers, Line Art outlines, drawn details and effects only
  `[00:00] [06:17] [06:50]`.
- **Predictable color:** EEVEE, Standard instead of AgX, flat or toon shader, white world: "we just
  want really predictable colors to come out of our viewport" `[01:56] [02:29] [05:45] [07:55]`.
- **Scene numbers:** 1080 x 1920, 12 fps (hand-crafted jitter, fewer drawings), 60 frames, ortho
  camera scale 8, passepartout 1 `[02:29] [03:01] [05:45] [43:05]`.
- **No facets:** Subdivision level 2, 3 where facets still show; edge-only meshes render only
  through Line Art `[09:00] [11:42] [12:15] [14:26]`.
- **Match the drawn line to Line Art:** Pen brush (constant width) and adjust size by eye
  `[22:34] [25:17]`. [verified] Line Art modifier `radius` equals line width, so a drawn stroke of
  radius r matches Line Art radius 2r.
- **Draw on surfaces:** placement Surface, not Origin, or strokes land behind the mesh
  `[22:34] [23:08]`. Headless: `project_to_surface`.
- **First key lands on the current frame:** scrub back and the drawing vanishes; move it to the
  start `[24:11] [24:43]`. `bx_gp.report` flags it.
- **Stabilizer on demand** (hold Shift), not always on `[25:50] [26:23]`.
- **Additive vs replacement keys:** additive for features that must stay put (face during a blink),
  replacement for effects `[34:23] [35:28] [47:01]`. **Blink** at frame 6 with onion skin, open key
  duplicated after, repeated about every second `[36:01] to [38:45]`.
- **Timing variety:** duplicate and offset repeated hits so they look random `[43:05] to [45:53]`;
  heavier lines at impact where momentum peaks `[46:28]`. Ending an effect: he keys an off-canvas
  dot, "there's definitely a better way" `[47:33]`: an empty key (`bx_gp.end_exposure`) [verified].
- **Strokes as blob-brush shapes:** "think of the strokes not so much like a pencil stroke ... but
  more like a blob brush stroke in Illustrator" `[23:40]`. "Draw from the shoulder. Don't draw from
  the elbow." `[31:21]`.
- Parent drawn details to the meshes they decorate `[49:16]`.

## Where experts disagree, and the deciding condition

| Question                        | Positions                                                                                         | Decide by                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiplane flats or 3D canvases | Tom: flats parallel to a fixed-axis camera. Weigl, Pablo: draw on real meshes                     | 2D cinematic language and TV budget: multiplane. Relighting, painterly NPR, big camera moves: canvases, with a TD per style (Weigl `[29:54]`) |
| How characters move             | Tom: object cutout + redraw + sculpt. Pablo: strokes stuck to a deforming mesh. Weigl: procedural | Artists must redraw freely: no armature weights on drawings. Character is a 3D rig: stick strokes to the mesh                                 |
| Additive or replacement key     | Elijah uses both                                                                                  | Does the new drawing keep most of the previous one                                                                                            |
| Brush                           | Pen constant (Elijah) vs Ink Pen pressure (Grant)                                                 | Match the existing line system (Line Art means Pen)                                                                                           |
| Line Art or drawn outline       | Line Art + noise/envelope (Rik, Pablo, Elijah), overdraw its errors (Pablo), nodes (Falk)         | Clean mesh shapes: procedural. Designed outlines: drawn                                                                                       |
| Removing points                 | Point eraser on fills (Grant), Dissolve in Edit mode (Pablo)                                      | Keep the stroke continuous either way                                                                                                         |
| Procedural vs artist input      | Weigl's generators vs Tom's refusal of anything blocking redraw                                   | Natural phenomena procedural, characters drawable                                                                                             |

## Outdated content vs 5.2 (do not follow)

- Material-driven fill and the holdout eraser fill (Grant, Elijah): use `fill_id`, holes by shared
  id, `hide_stroke` (5.1); `show_stroke`/`show_fill` raise a deprecation warning [verified].
- Legacy GP (Tom): `GPENCIL`, `frame.strokes`, `grease_pencil_modifiers` gone; his add-ons need 3.6
  `[48:37]`.
- Line Art "thickness" (Elijah's 60): property is `radius`, in meters, meaning line width
  [verified].
- 4.3 roadmap items (Falk) shipped: Stroke/Fill/Both draw option and holes (5.1), Pen tool (5.0),
  Delaunay fill default and draw-tool curve type (5.2). EEVEE rendering of GP with node materials
  not in 5.2 [inferred].
- Onion skin gained "active object only" (4.5); world-space onion skin not in release notes through
  5.2 [inferred].
