---
name: scenario-zbrush-retopology-export
description: 'Use when a ZBrush sculpt, scan or AI-generated mesh must become production topology and files (ZRemesher and guides, the 2026 Retopo brush, reprojecting detail with Project All, rebuilding subdivision levels, UV Master or native unwrap, normal and displacement maps with Multi Map Exporter, GoZ, OBJ or FBX export, scale and axes, Decimation Master, "clean up an AI mesh in ZBrush"), or when detail is lost after ZRemesher, a map is upside down or an export arrives at the wrong size.'
license: MIT
---

# ZBrush retopology and export (pipeline sculptor)

Expert level means the sculpt leaves ZBrush as a light, clean exchange mesh at its lowest level,
detail kept on a rebuilt subdivision stack or in maps, at real size, every file proved by parsing
it. Most of it is deterministic palette work an agent does well; click-by-click topology, modifier
clicks and a few dialogs stay with a human or computer-use agent. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).

Toolkit: [`scripts/zb_retopology_export.py`](scripts/zb_retopology_export.py) (`rx`) on top of the
lead's `zb_ops`, `zb_audit` and `zb_launch`: `rx.zcall("func", ...)` inside ZBrush, audits on the
agent side. Every projection pass is the lead's safe `zb_ops.project_all` (versioned checkpoint,
nets, gate). Not yet run in ZBrush (88 offline tests pass; live tests in
[`references/procedures.md`](references/procedures.md)).

## Stance (the expert delta)

- **Set symmetry on purpose before every ZRemesher run.** With symmetry on, ZRemesher remeshes half
  and mirrors it: a silent Mirror And Weld that ruins posed or asymmetric meshes (Drust, Kjce71jjWJU
  00:01:11). `rx.zremesh` makes `symmetric` a required argument.
- **Give ZRemesher an easy problem.** A face that will animate goes in neutral, folds relaxed, the
  expression sculpted back on the new topology (Pavlovich n5_cZK-9peg 00:01:39). Ears and hands are
  remeshed alone, open borders polished first (00:44:36). Unintended holes are closed first: they
  survive and inflate the count (ZRemesher doc).
- **ZRemesher is for flow; detail comes back by projection.** Aim low (Gaboury: 5k to 18k for an
  arm, 34D6VljTjBs 00:02:18), then Project All with Dist 0.1, which fixes "90 percent" of artifacts
  (Drust nxMYYsyJt3o 00:02:19). Only source and target visible, even in Solo (Pavlovich 01:07:26).
  With Adapt on and Keep Groups, Target 5 gave 8.0k to 9.4k points (frames 00:18:50, 00:22:09);
  Adapt off hits the count.
- **Projection has danger zones:** eyes, mouth, armpits, between fingers, crotch; what is left there
  becomes hard lines in displacement (FlippedNormals Zp07GW3rND0 00:07:43). Mask an eye-interior
  group grown just past the lid; repair with the morph target or a masked reprojection, never
  smoothing (00:05:31, 00:06:36).
- **Steer with polygroups, borders smoothed first**: ZRemesher builds jagged borders into the loops
  (Pavlovich 00:05:27). Smooth Groups 0 on clean borders, 1 for ragged DynaMesh groups (Drust
  8D-xqasgUws 00:02:17). Failed eyelids, mouth corners and nostrils are deleted and rebuilt
  (Pavlovich 00:21:36); the Retopo brush's "No" answer makes a light ZRemesher mesh editable (Pablo
  Munoz Gomez, I4nePXDTrhQ 00:06:36).
- **The lowest level is the exchange mesh.** UVs are made there (Gaboury cemmalvugFk 00:00:51). Maps
  compare the current level with the top of the same SubTool, never two SubTools (Drust n0qqpwvn-jA
  00:01:14); level 1 carries forms, max-1 micro detail only (2zDAtaQqwh8 00:02:53).
- **Film displacement is a fixed recipe** (FlippedNormals -ThBTEc8L_M): Flip V on ("an absolute
  must"), Adaptive off (100 UDIMs in about 1 h, not 24 h), DpSubPix 0, 32-bit EXR, 3 Channels off,
  renderer zero value = Mid (MME doc: Mid 0 for 32-bit; FlippedNormals keep 0.5; record it).
- **Exported size = internal extent x Export Scale** (Drust n2xPrwI9o1U 00:04:19). Keep XYZ Size
  between 1 and 4 (Gallagher EXjfH_X2hkM 00:28:23). Export Scale and offsets live per SubTool, so
  the same values go on every SubTool [added].
- **A generated or scanned mesh is a form reference, not topology to repair.** DynaMesh early, after
  thickening thin shells, which DynaMesh's hole fill "shoots straight across" (Drust PrFQXjs_6_w
  00:02:53). Rebuild the stack from the cleaned DynaMesh, never the noisy original [added].

## Establish first

| Input                 | Changes                                       | Default when the brief is silent                                                                                      |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Destinations          | mesh type, maps, units, axis                  | Maya: OBJ level 1 quads in cm + 32-bit EXR displacement, Mid 0.5                                                      |
| Deforms? face, joints | exact loops (human Retopo pass), neutral face | yes for characters; an expression goes back to scenario-zbrush-character-creature (neutral version, or its layer off) |
| Budget                | ZRemesher target, Adapt                       | rig or film body 15k to 25k quads [added]; animated head 10k to 20k (Retopo doc); game from the brief                 |
| Posed or asymmetric   | symmetry off                                  | symmetric only if unposed and designed symmetric                                                                      |
| Real size             | Export Scale                                  | 180 cm human (Gallagher's example)                                                                                    |
| Maps and tiles        | MME preset, UDIM plan                         | one 4096 tile per SubTool; UDIM layouts come from Maya or Blender                                                     |
| Source type           | route                                         | levels: a level under 2M; none: DynaMesh copy; AI or scan: cleanup first                                              |

## Workflow

1. **Preflight, checkpoint.** `rx.zcall("preflight", 180.0)`; `zb_ops.save_ztl`. GATE: flags
   resolved (over 8M vertices, XYZ Size outside 1 to 4, Export Scale 0, duplicate names).
2. **ZRemesher input.** `remesh_input("auto", max_points=2_000_000)` duplicates the sculpt and hides
   the original (the projection source); `fill_holes=True` adds Close Holes and Fix Mesh when holes
   are unintended. DynaMesh and Close Holes also shut eye sockets and mouth bags: `openings_closed`
   sets the hole gate (0, else the intended openings). GATE: copy under 8M vertices, source intact,
   face neutral.
3. **Guides.** Polygroups by buttons (Auto Groups, Groups By Normals, From Polypaint); a mask a
   human drew becomes a group with support loops through Edgeloop Masked Border (Drust IpTYcGxxsdM
   00:05:08); `polish_band("groups")`. Ears and hands: own SubTools (Groups Split, Split Hidden),
   `polish_band("border")`, own runs (hand Adaptive Size about 14: Pavlovich 00:59:42), then
   `merge_down_run(..., weld=True)`; Freeze Border only where borders must re-weld exactly, after
   remeshing the whole limb, at a cost to animation (01:03:44). GATE: Polyframe sheet shows closed,
   smooth rings; no seam loops after the re-join.
4. **ZRemesher.** `zremesh(target_k, symmetric, keep_groups=True, smooth_groups=0)` (Half, Same,
   Double off), then `retry(adaptive_size=...)` over 0, 5, 21. Keep Groups, Keep Creases, Smooth
   Groups or a sculpt break the Retry cache. The sweep leaves the LAST variant: `pick_retry`,
   `retry(**pick["retry"])`, `confirm_retry`. Optional Half pass with Adapt off, or a retopology
   over the retopology (Drust R2MzFqWMaWY 00:01:44). Poor center line at nape or brow:
   Alt+ZRemesher, a modifier click `press` cannot send: ask computer use, compare
   `centre_line_components` (Pavlovich 00:48:31). When `snap_back` is true,
   `project_stack(copy, source, levels=0, checkpoint=ztl)` before judging (00:22:05). GATE:
   `in_band`; `topo_report` + `retopo_verdict(purpose="rig", expected_holes=...)` on a Grp-on QA
   export; loops follow forms. Failed orifices: the script stops for a human Retopo pass.
5. **Rebuild the stack.** `project_stack(target, source, checkpoint=ztl)`: two visible, Dist 0.1,
   level 1 then Divide + Project All per level up to half the source count, a morph target per pass,
   color last with Colorize on for both SubTools (Drust PrFQXjs_6_w 00:16:35). Danger zones or a
   film face: `order="top_first", stop_after="nets"` (divisions, then StoreMT and a layer at the
   top: FlippedNormals 00:02:13), a human isolates the eye-interior group,
   `protect_isolated(grow=1)`, `project_levels(..., nets_done=True)`. GATE: `projection_from_stack`
   (level 1 unchanged, bbox 0.5 percent, volume 2 percent [added]); same-view sheet plus danger-zone
   close-ups per level. Busted areas: `zb_ops.morph_repair`; a target inside the source: masked
   Inflate, or ProjectionShell with Inner and Dist 1 (Gaboury pQbPtH0p5Bg 00:02:30). Then
   `drop_morph_target()`: bakes refuse a stored morph target, a possible map base (Drust 2zDAtaQqwh8
   00:01:44) [verify].
6. **UVs at level 1** (they carry through the levels, Gaboury cemmalvugFk 00:03:30). Quick:
   `zb_ops.uv_unwrap("native")`. Explicit seams: `unwrap_creases()` (Pavlovich cvqoVUX5aBw). Painter
   islands: `uvmaster_roundtrip()`. Eyes get their own simple UVs. GATE: `uv_verdict` on the Txr
   export; seams hidden, face uncut.
7. **Maps.** `mme_create_all(dir, name, settings="arnold")` or `bake_normal_map` /
   `bake_displacement_map`. GATE: `map_verdict` per file (size, bits, flat at Mid, normal flat at
   128/128/255: Polycount); orientation calibrated once per build (live_rx_04 fixture).
8. **Scale, names, export.** `set_export_scale(180, axis=1)` (every SubTool);
   `set_export_switches(quads=True, uvs=True, groups=False)`;
   `export_subtools(dir, level="lowest")`. FBX: ZScript could not suppress its options window,
   Python is unverified (Maxon forum), AppleScript System Events clicks ZBrush dialogs on this Mac
   [verify for it]; default: OBJ, converted by scenario-maya-expert or scenario-blender-expert.
   GATE: `obj_header` reads the Export Scale back from `#Auto scale` (written by 2026.2.1, lead v03
   export); `scale_report` passes (1 percent, feet at 0, centered).
9. **Handoff.** `handoff_report(json, ...)`: meshes, maps, unit, axis, Mid and scale, normal
   convention, audits, sheets, not-verified list.

### Generated or scanned mesh (Z6)

1. GLB from scenario-3d: `glb_to_obj`, `triage_ai_mesh(obj, expected_parts)`, then
   `orient_for_import`: it rotates only a Z-up hint, centers only an off-center mesh (glTF is Y-up)
   and names the file to import.
2. `import_mesh` (Weld; Tri2Quad rebuilds quads from AI triangles [verify range]); raw ZTL;
   `duplicate_keep()`: the copy is the form and color source, tracked by name (`index_of`), since
   splits and merges renumber SubTools.
3. `fix_mesh`; `split_parts`, `hide_small_parts(protect_names=[raw])`. Fused parts of different
   colors: `color_to_groups`, Groups Split [added]; else scenario-3d segmentation or human
   SliceCurve cuts.
4. `close_holes` per part. Swiss cheese after DynaMesh means too thin: thicken first.
5. `merge_down_run` the parts of one body inside the Tool (Drust 00:09:27).
   `dynamesh_keep(res, keep="groups")`: with polypaint on, DynaMesh keeps paint INSTEAD of
   polygroups (DynaMesh doc; general rule: scenario-zbrush-sculpting). Blur 0, Project off. Residual
   holes: `hole_plugs(obj)` on an export, `plug_hole(center, diameter)`, `merge_into(body, [plug])`,
   re-DynaMesh (Drust PrFQXjs_6_w 00:07:16). Polish; Mirror And Weld if symmetric. Local rebuilds:
   Sculptris Pro (scenario-zbrush-sculpting).
6. GATE: `cleanup_verdict(raw, clean)` (closed, manifold, shells, bbox 2 percent, roughness at most
   0.8x raw [added]); MatCap Gray sheet, Double on, Colorize off for the sheet only (`set_display`
   returns the old value).
7. ZRemesher per part (5 to 20 thousand), snap back, project geometry from the cleaned DynaMesh,
   then color only from the raw copy: `project_levels(..., geometry=False, color_last=True)`
   [verify]. Hand to scenario-zbrush-sculpting (big changes at SDiv 1, secondary at 2 to 3).

## Numbers

| Value                                                                | Relative to           | Source                      |
| -------------------------------------------------------------------- | --------------------- | --------------------------- |
| ZRemesher target in thousands; 5 gave 4,963                          | Target Polygons Count | Pablo rArw79xEpvE 00:03:16  |
| Adaptive Size 50 default; 0 even quads, 5 to 21 curvy; hand about 14 | density               | ZRemesher doc; Pavlovich n5 |
| Color Density 2 = more (pink), 0.25 = fewer (blue), white neutral    | polypaint density     | Pavlovich n5 01:01:32       |
| XYZ Size 1 to 4; imports normalized to 2                             | internal size         | Gallagher; Drust            |
| Export Scale = target / internal extent (180 / 2 = 90)               | units                 | Drust; Gallagher 00:28:55   |

## Per-target settings

| Target            | Mesh                                                          | Displacement                                                              | Normal                                             |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Maya + Arnold     | OBJ level 1, Qud, Txr, Grp off; cm                            | 32-bit EXR, Mid 0.5 = Scalar Zero Value, Catmull-Clark about 3, Auto Bump | tangent, OpenGL [added]                            |
| Unreal, Unity     | triangulated, FBX via Maya or Blender; cm, meters [added]     | none                                                                      | engine tangent basis; Unreal DirectX green [added] |
| Substance Painter | Substance Bridge Low & High, Auto-Bake, Force Auto-Unwrap off | none                                                                      | baked by Painter                                   |
| Blender           | OBJ; meters                                                   | 32-bit EXR, Midlevel = Mid [added]                                        | OpenGL; game bakes with scenario-blender-uv-baking |

Redshift, vector displacement and full rows: `rx.RENDERERS`, `references/procedures.md`.

## Quality gates

- Code, on every exported file: `topo_report`, `projection_verdict`, `uv_report`, `scale_report`,
  `map_verdict`, `names_report`, `cleanup_verdict`.
- Visual (`zb_review.review` sheets): Polyframe front, side and three-quarter for loops; source and
  target at one view after projection, plus danger-zone close-ups at every level; MatCap Gray with
  Double on for cleanup. Judge with [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                             | Looks like                                | Fix                                                 |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| Symmetry left on                    | posed limbs come out mirrored             | `zremesh(symmetric=False)`                          |
| Remeshing a smiling face            | loops follow the smile, not the rig       | neutral first, expression back on the new mesh      |
| Retry sweep left as is              | kept mesh is not the chosen one           | `pick_retry`, retry back, `confirm_retry`           |
| Dist too small                      | holes of detail, speckles                 | Dist 0.1; engulf the source                         |
| Smoothing projection spikes         | rogue vertices stay                       | morph target, masked reprojection                   |
| Colorize off on one side            | projected color missing                   | `color_last=True` turns both on                     |
| Morph target left at bake           | map against the wrong base [verify]       | `drop_morph_target()`                               |
| SDK normal bake on defaults         | world-space map                           | `create_normal_map(..., local_coordinates=True)`    |
| OBJ Grp on for Maya                 | mesh split in parts                       | Grp off (FlippedNormals 00:15:08)                   |
| Export Scale on one SubTool only    | eyes float off the head                   | `set_export_scale(..., all_subtools=True)`          |
| Unify on a character with layers    | layers and morphs break                   | MultiAppend into a scaled tool (Gallagher 00:27:16) |
| Polypaint on at an AI-mesh DynaMesh | part polygroups gone                      | `dynamesh_keep(keep="groups")`                      |
| MergeVisible during cleanup         | new Merged_ Tool without the color source | `merge_down_run` in the Tool                        |

## Handoffs

- **Receives** from scenario-zbrush-sculpting, scenario-zbrush-character-creature,
  scenario-zbrush-stylized, scenario-zbrush-hard-surface: a versioned ZTL with named SubTools,
  `stats()` and the last sheet; from scenario-3d: GLB or OBJ.
- **Delivers** to scenario-maya-retopology-uv and scenario-maya-rigging: level-1 OBJ per SubTool,
  cm, Y-up, centered, feet at 0, eyes separate; to scenario-maya-lookdev: maps plus
  `handoff_report`; to scenario-blender-uv-baking or Substance: low and decimated high with matching
  names; to scenario-zbrush-paint-render: the stack with UVs; to scenario-zbrush-pose-print: a
  closed copy.

## ZBrush 2026 notes

- Retopo brushes (2026.1); UV Master with Polygroups fixed in 2026.2.0; Substance Bridge (2026.2)
  labels "Auto-Bake", "Force Auto-Unwrap" [uistr]: Force Auto-Unwrap is global and strips good UVs.
- SDK: `press()` takes no modifier (Alt-clicks go to computer use); `create_normal_map()` defaults
  to world space.
- macOS: Control+W makes a polygroup; Command+W quits ZBrush (version deltas 3.13).
- A partial ZRemesh with Freeze Border deletes the subdivision levels (Drust 0TlG4Ex9lQA 00:02:26):
  `freeze_levels()` around it.

## References

- `references/procedures.md`: full bridge procedures (Z4, Z6, maps per target, fixtures), test
  paths, path evidence. Load before running a stage.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert with timestamps and
  the deciding conditions. Load when choosing between routes.
- `references/critique.md`: the review rubric (loops, projection, UVs, maps, scale, cleanup). Load
  at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, hotkeys and Retopo brush gestures
  for a human or computer-use agent.
- [`references/sources.md`](references/sources.md): every source with credential, URL and best
  timestamps.
