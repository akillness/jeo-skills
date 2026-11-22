# Critique rubric: what the experts look at

Use at every gate. Each section has the numbers (from the `rx` checks on exported files) and the
look (from `zb_review.review` sheets). A stage passes when every "must" holds; "watch" items go into
the report. Thresholds marked [added] are this skill's defaults, meant to be overridden by the
brief.

How to take the sheets:

- Loops: `rx.zcall("set_polyframe", True)`,
  `zb_review.review(dir, views=("front", "right", "threequarter", "back"))`, then Polyframe off.
  Groups: the same with the lines off if the Line switch is reachable [verify]; else judge group
  colors in the default Polyframe.
- Surfaces: MatCap Gray (the review default). Cleanup: also `rx.zcall("set_display", double=True)`
  and once with Double off to reveal back faces.
- Comparison views: identical transform for both states (the review uses fixed view triples), one
  sheet per state, side by side.

## 1. Low mesh topology (after ZRemesher or a manual pass)

Must (numbers: `rx.topo_report` + `rx.retopo_verdict`):

- Face count inside `expected_band` of the target, or the budget (game: `budget_tris`).
- Deforming mesh (rig, film): quads at least 98 percent [added], zero n-gons (ZBrush triangulates
  n-gons and blend shapes break: scenario-maya-retopology-uv), no non-manifold or flipped edges.
- Holes only where intended (eyes, mouth, neck cut): `boundary_loops` count = expected.
- One shell per SubTool unless parts are separate on purpose.
- Symmetric subjects: mirror match at least 99 percent [added] and a center line in one piece
  (Mirror And Weld repairs it: Pavlovich n5 00:41:14).
- Ring groups (when groups were exported with Grp on): `ring_ok` true for eye and mouth rings, rows
  as the brief (game head 3 to 4 loops around each opening, film 5 to 8 [added, generalist
  defaults]).
- Shrink ratio after ZRemesher recorded; when `snap_back` is true, the level-1 snap-back pass
  (`project_stack(..., levels=0)`) ran before this judgment (Pavlovich n5 00:22:05, 01:03:12).
- The mesh in the scene is the Retry variant that was chosen: `confirm_retry(pick, faces_now)` true
  (the sweep otherwise leaves its last variant).
- Hole count uses `openings_closed`: 0 after DynaMesh or Close Holes, else the intended openings.
- Ears and hands remeshed apart and merged back with Weld: no boundary loop left along the seams.

Look (Polyframe sheet, front, side, three-quarter; close-ups of eyes, mouth corners, nostrils, ears,
nape):

- Concentric loops around eyes and mouth, "just concentric edge rings around the eyes and mouth so
  that they animate" (Pavlovich n5 00:06:32). The outer mouth loop continues up the nasolabial fold
  [added].
- Loops perpendicular to bend axes at elbows, knees, wrists, fingers; closed rings on limbs, no
  spirals (a closed guide curve cures them: ZRemesher doc Spirals).
- Poles (valence 3 and 5) between rings and out of deforming areas; mouth corners carry continuous
  lip loops; a fan at a mouth corner is a delete-and-rebuild, not a fix (Pavlovich n5 00:19:04 to
  00:22:40).
- Even polygon size across the skull; density raised where curvature needs it (hands, face) and
  lower on broad areas (Pavlovich n5 01:02:38).
- Hard surface: loops held along hard edges, no polygons bridging a crease (Drust IpTYcGxxsdM
  00:03:16).
- "Only your eyes can tell you which topology will better suit your needs" (ZRemesher doc): compare
  Retry variants on the same view before choosing.
- Face that will animate: the input was neutral (no smile, folds relaxed), so the loops follow the
  rig, not the expression (Pavlovich n5 00:01:39 to 00:02:46).
- Center line at nape and brow: if it wanders, request the Alt+ZRemesher variant from computer use
  and compare both sheets plus `centre_line_components` and `symmetry_x_pct` (Pavlovich n5 00:48:31
  to 00:49:05).

Common verdicts: ragged loops around group borders = borders not smoothed (`polish_band("groups")`);
mirrored pose = symmetry was on; eaten fingers = Adaptive Size too low or no density (Pavlovich n5
01:00:48).

## 2. Projection (rebuilt subdivision stack)

Must (`rx.projection_from_stack(ps)` or `rx.projection_verdict` on exports):

- Level-1 point count unchanged by projection.
- Top-level bbox within 0.5 percent of the source per axis [added from the retopology digest
  checklist]; volume within 2 percent [added].
- Top level holds at least half the source points, or the detail is softer (Drust R2MzFqWMaWY
  00:02:16).
- Only source and target were visible during every Project All (the `show_only` result;
  `exclusive=True` in `zb_ops.project_all`).
- Every pass gate clean: `ps["pass_problems"]` empty (point count kept, no vertex outside the
  visible bbox); a versioned checkpoint ZTL exists before each pass.
- Color pass: Colorize was on for source and target (`colorize_was` recorded), polypaint projected
  on the last level only (Drust PrFQXjs_6_w 00:16:35, _ips3GhWI0s 00:05:57).
- Before any bake: no morph target left (`morph_target_present()` false after
  `drop_morph_target()`).

Look (same view, source alone, then target alone at its top level; then both visible):

- No spikes, no speckled holes of detail (Dist too small: Drust nxMYYsyJt3o 00:02:19).
- Crisp edges and pores kept; smeared areas where the target sat under the source (Drust 00:03:57:
  toggle both visible to see where).
- Step down the levels: level 1 clean and even, each level adds detail without pinching (Gaboury
  34D6VljTjBs 00:05:24).
- Danger zones at every level, zoomed: eyes, mouth, armpits, between the fingers, crotch
  (FlippedNormals Zp07GW3rND0 00:07:10). Anything busted there becomes a hard line in the
  displacement "down the pipe" (00:07:43): fix it before maps.
- Eyelids kept their pre-projection shape where the eye-interior mask was (the mask state cannot be
  read: this view is the check).
- Repairs were made with the morph target or a masked reprojection, not smoothing ("you're never
  gonna be able to smooth these kind of things out properly", 00:06:36).
- For film: the low level plus displacement rendered (BPR with the map applied, or the renderer)
  matches the sculpt at grazing light [added from FlippedNormals -ThBTEc8L_M 00:20:35].

## 3. UVs

Must (`rx.uv_report` + `rx.uv_verdict` on a Txr export at level 1):

- UVs present on every face; inside 0 to 1, or exactly the planned UDIM tiles.
- Overlap under 0.5 percent of used texels [added] (the raster counts shared border texels);
  mirrored stacking only when planned (Polycount: offset copies by whole tiles for bakes).
- No flipped-winding islands unless mirrored on purpose.
- Texel density spread (`texel_density_cv`) recorded; games often want it even [added], film per
  UDIM plan.
- Polygons under 150k at level 1 when UV Master was used (UV Master doc).

Look (New From UV Check texture on the model, Morph UV or Flatten sheet; Check Seams front and
back):

- No red in New From UV Check (overlaps) (Pavlovich cvqoVUX5aBw 00:01:06).
- Readable islands: head, hands, feet recognizable (Gaboury cemmalvugFk 00:05:05); no seam across
  the face or between the eyes (UV Master doc Tutorial).
- Seams "where the camera is not going to see it" (Pavlovich 00:06:00): inner arms, under the chin
  line, behind the ears, the back.
- Hands and tails flattened without twisting (Pavlovich 00:04:23).
- Checker squares even, not stretched (UV Master doc, Tutorial conclusion).

## 4. Maps

Must (`rx.map_info` + `rx.map_verdict` per file; one set per UDIM tile):

- Resolution equals the map size; one file per map type per tile; tile numbers from 1001.
- Displacement: 32-bit float EXR, one channel (3 Channels off), flat areas at Mid (0 or 0.5 as
  recorded).
- Normal: 8-bit RGB after a 16-bit bake, flat areas near (128, 128, 255) (Polycount); tangent space
  for anything that deforms (MME doc); world space only for static objects.
- Orientation: the live_rx_04 fixture decided Flip V and the green convention for this build; the
  handoff states the convention (OpenGL or DirectX) and FlipG.
- No NaN pixels.

Look (open the files, and apply them back when possible):

- Frequency as intended: level-1 displacement shows forms and wrinkles, a max-1 normal shows only
  pores and stitches (Drust 2zDAtaQqwh8 00:03:27).
- A gray displacement at 0.5 with the face readable (FlippedNormals 00:02:27); black maps are Mid 0
  (expected) or a failed bake.
- Seams: no step where UV islands meet; the Map Border was high enough (FlippedNormals 00:05:41).
- In the renderer: no swelling (zero value mismatch), no stair steps (DpSubPix or subdivision
  iterations too low), no seams at grazing light.

## 5. Scale, axes, names, files

Must:

- `rx.obj_header`: `#Auto scale` equals the Export Scale set, on every file; `#Auto offset` as
  planned.
- `rx.scale_report`: size within 1 percent of the brief in destination units; lowest point at 0 when
  feet go on the ground; centered in X and Z [added tolerances].
- All SubTools registered: union bbox of every exported part matches, eyes sit in their sockets (the
  same Export Scale and offsets on every SubTool).
- `rx.names_report`: unique, alphanumeric or underscore names (GoZ, Decimation Master).
- Grp off for Maya deliveries (one group per file); Qud for rigging, Tri for a baked game mesh; Txr
  on when UVs exist.
- Internal XYZ Size stayed in 1 to 4 (Gallagher).

Look:

- A primitive toggled against the model occupies the same box in ZBrush (Gallagher 00:30:32); in the
  destination app, a reference box of the intended size (receiving skill).

## 6. Cleaned generated or scanned mesh (Z6)

Must (`rx.cleanup_verdict(raw, clean)` + `rx.triage_ai_mesh` on the result):

- No holes (unless an opening is designed), no non-manifold or flipped edges, `solid` true.
- Shells = the intended parts; junk gone or hidden.
- Silhouette kept: bbox per axis within 2 percent of the raw mesh (5 percent while parts are still
  merged and polished) [added]; volume change under 5 percent [added].
- Surface noise down: `roughness_index` at most 0.8 x the raw value at similar density [added].
- Symmetric designs: mirror match at least 99 percent after Mirror And Weld.
- Part groups survived the DynaMesh: a Grp-on QA export (`obj_header(...)["group_lines"]`) still
  shows more than one group when parts were grouped, i.e. `dynamesh_keep(keep="groups")` ran with
  polypaint off (DynaMesh doc, PolyGroups > Important).
- The raw copy is still in the Tool, found by name (`index_of`), with its polypaint: it is the color
  source.

Look (MatCap Gray, colorize off, Double on, then off; front, back, both sides, three-quarter, top
and underside; Drust PrFQXjs_6_w 00:00:42, 00:03:26):

- Silhouette matches or improves on the source from every view; nothing lost at thin parts (fingers,
  horns, tails).
- Primary forms read without noise; lumps gone; transitions deliberate rather than mushy.
- Former seams between fused parts smooth; parts that should be separate are separate SubTools with
  closed ends.
- No floating junk, no back faces showing through the front.
- Stepping through the rebuilt levels shows a clean progression (PrFQXjs_6_w 00:17:42).
- Forms under a moving light: switch to a Standard material and move the light front, side and
  behind; a MatCap has its lighting baked in and hides planes (Pavlovich aR02CwyPTUw 00:04:07,
  00:04:39). Red Wax exaggerates surface differences (00:03:32).
- The rebuilt stack is ready for the sculptor's level discipline: big corrections at SDiv 1,
  secondary forms at SDiv 2 to 3 (Pablo rArw79xEpvE 00:12:28 to 00:14:16).
- Then the forms themselves, judged with the sculpting skills' critique (big to small, planes,
  rhythm): this skill hands a clean base, not a finished design.

## 7. The report

Must:

- Every stage lists its numbers, the sheet path and pass or fail.
- Anything done by a human or not done (face rings, Retopo passes, FBX options, GoZ first run,
  Painter) is named.
- Values the receiver needs are written in `handoff_report`: unit, axis, Export Scale, displacement
  Mid and scale, normal convention, map list per tile.
- Every snippet that has not run in ZBrush is labeled "not yet run in ZBrush".
