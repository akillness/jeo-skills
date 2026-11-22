# Expert notes: principles and judgment by expert

What the sources teach beyond textbook Unity, with source and timestamp (`[hh:mm:ss]` in the video,
`frame` when only visible on screen). Notes live in `notes/world-3d/`. My additions are marked
[added]; observations on this Mac are marked [observed 2026-09-24] with the test that produced them.

## Unity Technologies, 6.3 Terrain manual and Terrain Tools 5.3 (doc)

- Resolutions and size come first: Heightmap, Control (splat) and Base Texture resolutions "Require
  resampling on change"; changing Width, Length or Height rescales existing sculpting (Terrain
  Settings reference > Mesh Resolution, Texture Resolutions).
- Heightmap resolution is 2^n + 1; "For highly detailed erosion features, use a Terrain heightmap
  resolution of 1025 or greater" (Hydraulic Erosion).
- Detail Resolution Per Patch: "The recommended value is 16. If your Detail Distance is high and
  your grass is sparse, use a higher value" (patches are culled as a unit: fewer draw calls, more
  triangles). The 2020 Inspector hint "as high as possible" is outdated (seen in smnLYvF40s4 frame
  [00:10:12]).
- Instanced detail meshes are the recommended mode; the price is no Healthy and Dry Color and no
  per-instance light probe or lightmap lighting; non-instanced details read only MainTex (Grass and
  other details).
- Two detail prototypes with the same Noise Seed get identical placement (Add Detail Mesh).
- SpeedTree ignores Tree Distance, Billboard Start, Fade Length and Max Mesh Trees; its LOD Group
  rules. A SpeedTree re-exported as fbx or obj loses wind (Tree and Detail Objects; Update imported
  trees). [observed 2026-09-24] The same held for plain LOD Group mesh trees: `treeDistance` 700 →
  350 left max batches (2820) and triangles (429,128) identical; the LOD Group cull moved them
  (`test_11_tree_distance_vs_lod_group`).
- Brush Mask Filters (Height, Slope, Aspect, Concavity, Layer) are for layer painting; on height
  tools they resample every frame and make artifacts (Brush Mask Filters).
- About 13 settings are not batchable in the Terrain Toolbox (collider, lighting, lightmapping,
  scatter mode, density scale, detail limits, motion vectors, holes compression, quality override,
  ray tracing, reconnect, heightmap I/O): set them per tile in code (Terrain Settings reference).
  `WorldTerrain.SetTerrainSettings` covers every one of them since v0.2 (Scale In Lightmap through
  the serialized `m_ScaleInLightmap`) and returns before and after.
- Bake Light Probes For Trees does nothing unless the tree prototype's renderers receive GI from
  Light Probes; Remove Light Probe Ringing (only with it) trades exactness and contrast for no light
  leaking to dark sides (Tree and Detail Objects). The scripting reference describes the property
  for Tree Editor trees [verify on your tree type]. Preserve Tree Prototype Layers when raycasts
  must tell trees from ground.
- Popping and light probe ringing need renders along an eye-height path at the Detail Distance and
  Billboard Start boundaries (How the expert judges quality). [observed 2026-09-24] `CapturePops`
  measured 0.1 to 0.3 % of pixels changing at the detail, LOD and cull boundaries of this island;
  fog 0.0015 hid almost none of it.
- Reflection probe usage per tile: Blend Probes in caves and overhangs, Blend Probes And Skybox in
  open air (Reflection probes).
- Mass Place Trees without Keep Existing Trees wipes the tile; removing a detail prototype clears
  its painted data (Mass place trees; Remove details).

## Unity Technologies, ProBuilder 6.1 and Polybrush 1.2 manuals (doc)

- The `ProBuilderMesh` is the truth: "you should never directly modify the MeshFilter.sharedMesh";
  edit, then `ToMesh()`, `Refresh()`, and in the Editor `EditorMeshUtility.Optimize(mesh, true)` for
  UV2 and shared vertices (API > Modify a Mesh).
- Re-entering the shape or PolyShape tool discards later extrusions and cuts: lock footprints before
  detailing (components note).
- Architecture on the grid with 90 and 45 degree angles; Insert Edge Loop over Connect Edges (no
  T-junctions) (Modeling tips).
- Black faces: disable Auto Lightmap UVs first, then Weld at 0.01 or 0.0001; spotty lightmaps =
  missing UV2 (Troubleshooting).
- Bezier shapes and Boolean are experimental: keep them out of automated pipelines (Create meshes,
  Warning).
- Polybrush is deprecated from 6.3 and "is not compatible with Terrains" (About Polybrush).
- [observed 2026-09-24, v0.2] The re-entry rule holds for scripts:
  `PolyShape.CreateShapeFromPolygon` after an `Extrude` took the mesh from 12 faces back to the
  footprint's 7 (top 5 m back to 3 m); replaying the recorded operations restored 12
  (`test_23_polyshape_rebuild`).
- [observed 2026-09-24] 6.1.2 facts the docs and videos get wrong: `PivotLocation` is `Center` and
  `FirstVertex` (bounds min), not "First Corner"; `ShapeGenerator` assigns no material from script
  (`BuiltinMaterials.defaultMaterial` is the Shader Graph "ProBuilder6/Standard Vertex Color", which
  shows vertex colors in URP with no support-sample import); `using UnityEngine.ProBuilder;` makes
  `Math` ambiguous (CS0104); ProBuilder meshes are driven properties: a prefab asset stores none (71
  of 71 null), instances rebuild in `Awake`; `ToMesh()` drops UV2, so re-run `Optimize` after any
  rebuild (`test_02_village_blockout`).

## Unity Technologies, multi-scene editing and streaming (doc)

- The active scene receives instantiated objects and supplies RenderSettings, LightmapSettings and
  occlusion settings; additive loads never change it; it does not decide what renders
  (SetActiveScene).
- `allowSceneActivation = false` freezes progress at 0.9 and stalls the whole AsyncOperation queue,
  unloads and Addressables loads included (allowSceneActivation; Addressables Warning). [observed
  2026-09-24] A queued `UnloadSceneAsync` stayed at progress 0 for one real second (16,742 to 37,092
  frames in batch Play mode) with its objects alive, while `Scene.isLoaded` already read false
  (`HeldActivationStallsTheWholeQueue`).
- `UnloadSceneAsync` frees GameObjects, not assets; call `Resources.UnloadUnusedAssets` (Single
  loads do it) (UnloadSceneAsync). [observed] meshes 52 → 134 → 134 → 52 across load, unload, sweep.
- `backgroundLoadingPriority` is a per-frame main-thread integration budget (Low 2 ms, BelowNormal
  4, Normal 10, High 50) and "has no effect in the Editor" (backgroundLoadingPriority). The quality
  gate is the "Application.Integrate Assets in Background" marker within that budget in a built
  Player, and memory back near baseline after unload plus sweep (How the expert judges quality).
  [observed 2026-09-24] In batch Editor Play mode the `ProfilerRecorder` memory counters read 0 MB
  and the marker 0 ms: `StreamProbe` measures both in a development Player (`test_30`): Low priority
  kept the marker at 1.13 ms per frame for a village chunk that took 371 ms over 22 frames, High
  loaded it in 34 ms over 2 frames; memory returned to 1.2 % over baseline after the sweep. A marker
  recorder built from a handle needs `ProfilerRecorderOptions.StartImmediately`, or it reads 0.
- Scene names are case-insensitive, first build-list match wins: load by full path or build index
  (LoadSceneAsync).
- Addressable assets dropped into a non-Addressable scene are copied into built-in scene data; use
  `AssetReference` fields and read the Build Layout Report; Editor play loads Addressable scenes
  from the AssetDatabase even with Use Existing Build (Addressables).

## Unity, "Introduction to Game Level Design" e-book (2022 LTS)

- Metrics before production, derived from the character: crouch cover height from crouched model
  height and capsule; a later change breaks every placed cover object (Metrics).
- Gyms test doorways "for camera height and side clearance", winding paths, slope granularity,
  unclimbable slopes, triggers and jump distances; rebuild the gym when the controller changes
  (gym/zoo). [observed 2026-09-24] `WorldGym.BuildGym` with a 0.4 x 1.8 m capsule: doors from 1.0 m
  pass the NavMesh, but a 3.5 m boom at 20 degrees is blocked at 80 % of sampled positions through a
  1.4 x 2.4 m door and 27 % through 2 x 3 m; ramps fail at the slope limit itself (45) in the
  NavMesh and the CharacterController alike; Build Height Mesh halves the stairs height error (0.132
  to 0.063 m).
- Blockout legibility: names with purpose and size (`P_GenericWall_200x300cm`), a shared color
  legend, TextMeshPro notes readable in a build (White-boxing).
- Rule of three, then subvert (The rule of three). Spawn facing the intended direction (Spawn
  points). Test every checkpoint for soft-locks (Avoid soft-locking).
- Procedural levels need readable rules, landmarks and automated runs over several hundred
  generations per rule change (Procedural level design; Automated testing).

## Unity official, "ProBuilder for gray-boxing" (YsBniZ5ya7k, 2023)

- Trace a scaled plan: 10 m squares = 100 px, 1000 px image on a 100 x 100 quad (Rotation X 90,
  Position Z 50), 1 m snap; floors 10 x 0.1 x 10, walls 0.1 x 10 x 10 [00:03:21], frame [00:04:26].
- Prefab each unique piece at once; the column fix (3 x 3) is one edit [00:06:25], [00:09:12].
- The graybox is done only after the mechanic test (jump), AI through doors on a NavMesh (exclude
  notes and the player from the bake), and a quick GPU bake at 2 texels per unit to find dark zones
  [00:13:38], [00:15:24], [00:16:46].
- Symmetric multiplayer map: duplicate the half with Z scale -1 [00:12:45].
- A layout floor takes "an hour or two"; the same change on finished art costs about a week
  [00:07:33], [00:09:44].

## Christina Creates Games, modular asset packs (0o-QnNs-stc, 2025)

- Kit grid from the kit: walls 2.5 x 3, slim 1.25, floors 2.5 x 2.5; one story at a time to avoid
  switching snap increments; stories at Y 3 (or 4.5 with half walls) [00:07:35], [00:18:53].
- Hierarchy by small logical units: house at world zero, per story Floor, Walls, Doorways,
  Decoration; duplicate a floor container for the next story [00:10:22], [00:11:30].
- Outline with one generic wall, then bulk replace the selection (Ctrl-drag, "replace") [00:15:14],
  [00:16:19].
- Stealth clutter rule: every room answers "where can the player hide", with quick exits; too many
  colliders make movement unfun [00:18:20], [00:18:53]. [observed 2026-09-24] For an agent of radius
  0.5 m, six scattered crates left 25 % of a 2 x 3 cell room reachable from its open door; the
  scatter now keeps a 1.2 m door zone and rejects any item that disconnects the floor (flood fill
  with obstacles inflated by the radius). Door frames can cut the NavMesh [00:17:12]; her workaround
  (disable the door container for the bake) suits waypoint guards; NavMesh Modifier is the AI
  Navigation tool for it [added]. With NavMesh, enable Build Height Mesh for stories [00:19:27].
- Prebuild compound prefabs (container plus contents at zero, roof plus overhang, filled shelves) so
  they snap like walls [00:08:17], [00:20:09], [00:05:37].
- [observed 2026-09-24, v0.2] The scripted bulk replace needs the placement recorded:
  `ReplacePrefabAssetOfPrefabInstance` kept 0 of 30 script placements (with or without
  `PrefabReplacingSettings`) and 30 of 30 after
  `PrefabUtility.RecordPrefabInstancePropertyModifications(transform)`; the v0.1 kit shipped with
  every window and door wall at the house origin while its grid audit stayed clean
  (`test_20_kit_placement`). A second NavMesh Surface baked before the kit existed overlapped it and
  answered queries with stale polygons (`test_21_kit_nav_gate`).
- Material variety through an automator that makes Prefab Variants [00:24:22]. Floating clutter is
  her open question [00:06:10]: raycast placement is the 6.3 answer (Polybrush deprecated) [added].

## Unity official, "How to work with multiple scenes" (zObWVOv1GlE, 2020)

- A persistent GamePlay scene plus additive level parts [00:04:20]; distance loaders for open maps,
  trigger loaders for interiors and mazes, since distance loads parts behind walls [00:10:06].
- Scan already-open scenes in Start so a part opened in the Editor does not load twice [00:11:21].
  The video streams by GameObject name; the docs say load by path (contradiction resolved for the
  docs). [observed 2026-09-24] `ScanOnStartPreventsDoubleLoad`: 1 copy with the scan, 2 without.

## Manesh Mistry, ustwo games, "Making Alba" (YOtDVv5-0A4, Unite 2022)

- Non-destructive terrain: ridge, valley and leveler features with anchors, rendered to a heightmap;
  inputs never ship [00:06:10], frame [00:07:42].
- World generation steps (slide): scene setup, terrain (feature meshes, heightmap with roads, biome
  foliage, splat, snap objects), move-blocking colliders, foliage audio map, sea, bake NavMesh,
  lightmaps, occlusion [00:10:05]; skippable; Jenkins regenerates before device builds [00:10:56];
  generated scene marked `git update-index --skip-worktree` [00:09:52].
- Roads: waypoints, 3D A* with a slope cost so the road never gets overly steep; roads drive
  heightmap flattening and splat [00:07:45], [00:08:18].
- "Transparency of any kind breaks hidden surface removal on tile-based renderers": impostors 23.3%
  (7.12 ms) of a 32.5 ms iPad Mini 4 frame; fix with opaque geometric foliage, transferred normals
  and InstaLOD LOD chains [00:20:14], [00:21:20], frame [00:19:53].
- Spikes and worst cases over averages; automated profiling: teleport to anchors, 360 degree turns
  in third and first person, Jenkins emails graphs [00:15:23], [00:29:46].
- Profile Analyzer for proof: capture about 200 frames, find the expensive markers statistically,
  change one thing, capture 200 more and compare [00:17:00]. `ut_world.compare_runs` is the scripted
  form (medians, p95, Mann-Whitney p [added]).
- They did not stream: "we didn't think we were making an open-world game until there essentially
  was an open-world game in front of us"; the island stayed resident with LOD and relevance
  [00:12:43]. Decide streaming from memory, not from the word "open world" (`scene_report`: this
  island 11 MB).
- Import rules enforced by AssetPostprocessors (ASTC, mesh compression, keyframe reduction) so
  memory settings do not depend on memory [00:28:23] (scenario-unity-pipeline-automation writes
  them).
- One distance-and-angle relevance service, Burst: several ms to under 1 ms [00:23:47]. Never render
  the world twice on low end: cubemap plus blurred skybox for the photo mode [00:26:02], [00:27:06].
  Cache `.gameObject` and `.transform` getters [00:24:49].
- Parallel terrain ownership has seam costs; low-res inputs driving high-res output make tools scary
  late [00:11:27].

## Adam Robinson-Yu, "A Short Hike" postmortem (ZW8gWgpptI8, GDC 2020)

- Guidance ladder: landmarks and curiosity first, breadcrumbs and paths that always lead back,
  inclines toward the goal, signs last ("people don't really like reading in games") [00:18:37],
  [00:19:10], frame [00:18:58].
- Natural gates (cliffs tied to an ability) instead of literal gates [00:19:47]. Playtest the
  world's edge first: players swam around the mountain; add a cave and content there [00:16:54],
  [00:17:58]; the early map marked the backside "Boring" [frame 00:17:47]. [observed 2026-09-24]
  `audit_guidance` on this island: 32 of 36 coast bearings had no point of interest within 150 m
  (one empty arc of 2,512 m of a 2,829 m coast); `fill_coast` placed placeholder coves until the
  longest arc passed (`test_24`).
- Silent repetition: five toy shovels, the first pickup removes the rest; tutorial signs only if the
  skill was not used [00:21:11], [00:21:42].
- Low-res look: 384 x 216 ARGB32, Point, Clamp, upscaled; flat mostly unlit shading so lighting
  noise does not become pixel noise; post order fog, edge detection, blue shadows [frame 00:05:44],
  [00:06:28], [00:07:37].
- Build the hardest, most constrained area first; build tools only when the workflow demands them
  [00:24:26], [00:13:30].

## Jane Ng, Campo Santo, "The Art of Firewatch" (ZYnS3kKTcGg, GDC 2015)

- Gradient fog from an RGBA strip sampled by distance, as a fullscreen blend, debugged with a garish
  reference strip; single-color fog cannot make graphic depth layers [00:12:40], [00:13:12].
- Fog simplifies texture noise, not silhouettes: raise foliage alpha cutoff with distance [00:20:29]
  (PC and console; alpha test is the mobile trap above).
- Detail budget as language: world assets get shape only, narrative props get texture detail
  [00:25:17], [00:25:50]. "If you only need three rocks, don't make a fourth one" [00:24:27]; rock
  modules readable from 360 degrees [00:22:10]. Trees 20 to 30 m tall need detail only on the lower
  branches the player reaches [00:19:18].
- Color script in passes: rough script, block world, playtest scale and pacing, paint over
  screenshots, then full art [00:16:13], [00:16:47]. Palette changes through trigger volumes and an
  interpolation manager [00:10:10].
- Shape the landscape to funnel the eye with natural elements only [00:18:10].

## Unity official, "Terrain Tools landscape pass" (smnLYvF40s4, 2021)

- Macro forms with a huge weak brush (about 330 at 0.012), details small (about 45 at 0.022), 16-bit
  brushes against staircasing [frame 00:02:43], [00:02:13].
- Fix the layer palette before painting: reordering layers corrupts the splat; save palettes as
  profiles [00:04:23]. Height-based blend supports 4 layers in one splat map [00:04:23].
- "Think like nature": moss in shade, rock in basins, cliff material on steep faces, dirt on paths
  with damp edges [00:06:00], [00:06:32]. Tiling per layer matched to the material's real scale
  (snow 10 m vs dirt 100 m) [frame 00:05:30].
- 1,500 to 2,000 trees "for a healthy forest on this much land" [00:07:36] (area unit garbled: read
  as about 250,000 m² [?]); Mass Place defaults to 10,000 [frame 00:07:55]. Wind low, "otherwise it
  will look like a hurricane simulation" [00:10:49].
- 2020 URP bounce-light fix for black tree shadows (two child directionals, 0.75, no shadows) [frame
  00:08:40]; in 6.3 test APV or probes for trees first [added].

## Sebastian Lague, procedural landmass and erosion (MRNFcywkUSA 2016, xlSkYjiE-Ck 2016, eaXk97ujbPQ 2019)

- Octaves: amplitude x persistence, frequency x lacunarity; remap Perlin to -1..1 before summing;
  clamp in `OnValidate` (octaves >= 0, lacunarity >= 1, persistence 0..1) [00:01:42], [00:02:16],
  [00:10:09].
- Keep Perlin offsets within about ±100,000 or `Mathf.PerlinNoise` returns a constant [00:07:20].
- Per-map min/max normalization breaks chunk seams (the series later goes global) [added; confirmed
  by `FbmSamplesInWorldSpaceSoChunksMeetAtSeams`].
- Chunk visibility uses the distance to the nearest bounds edge (`Bounds.SqrDistance`); hide last
  update's visible chunks first [xlSkYjiE-Ck 00:10:04], [00:14:02].
- Erosion guards: never erode more than the height drop to the next position; deposit when over
  capacity or moving uphill [eaXk97ujbPQ 00:02:12], [00:02:45]. 70,000 droplets on 255² took about
  0.75 s (2019) [00:03:49]. [observed 2026-09-24] Lague's parameters on heights in meters per cell
  eroded about 10x too hard (deep pits 1,429 vs 357 on the normalized scale); 600k droplets left
  fewer deep pits (232) than 250k (357).

## DV Gen, Wave Function Collapse (20KHNA9jTsE, 2022)

- Authored 3D tiles plus WFC beat custom marching cubes for artistic control and texturing
  [00:04:22], [00:05:27].
- Collapse the smallest-domain cell next, propagate to neighbors' neighbors [00:07:36]; directional
  rules (rivers flow south) are easy [00:09:16]; one module with random mesh variants rather than
  one module per variant [00:09:49]. Contradictions are not covered: restart with the next seed
  [added].

## Game Dev Guide (Matt), spline roads (ZiHH_BvjoGk, 2023)

- One spline per street, junctions built afterwards from spline ends (Burnout Paradise) [00:04:24],
  [00:07:58]; curved corners by a quadratic Bezier with a per-edge strength [00:10:57], [00:13:19].
- Road U by cumulative distance, V across; junctions in world UVs; road and junction submeshes
  [00:14:16]. URP decals project on everything until they share a Rendering Layer with the road
  [00:15:48].

## Vazgriz, procedural 3D dungeons (rBY2Dzej03A, 2021)

- Delaunay for candidate corridors, MST for guaranteed reachability, 12.5% of the leftover edges for
  loops [00:01:04], [00:02:42]; A* cost shaping (existing hallway cheap, rooms expensive)
  [00:02:42]; stairs need per-node path history, not the closed set [00:07:00]. Re-check
  connectivity after carving (a failed MST edge breaks the guarantee) [added].

## Jasper Flick, Catlike Coding, procedural meshes (doc, 2020.3)

- The advanced Mesh API writes into native mesh memory inside Burst jobs; you own bounds,
  `SetSubMesh(..., DontRecalculateBounds | DontValidateIndices)` and
  `[NativeDisableContainerSafetyRestriction]` on aliased streams; UInt32 indices above 65,535
  vertices; tangent w = -1 (Generating a Quad; Bounds; Normal Mapping). Use it for runtime chunk
  meshes; the editor jobs here use the simple API for small meshes.

## Where experts disagree, and the deciding condition

| Choice              | Option A                                            | Option B                                                      | Deciding condition                                                            |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| terrain authoring   | brushes (smnLYvF40s4, A Short Hike)                 | regenerated features (Alba)                                   | solo or small scope paints; a team that moves areas late regenerates          |
| texturing           | hand painting with mask filters                     | slope and height rules plus stamps                            | rules when shapes change often                                                |
| far foliage         | impostors, distance alpha cutoff (Firewatch)        | opaque LOD geometry (Alba)                                    | tile-based mobile GPU vs desktop and console                                  |
| mechanic vs metrics | tune the jump to the graybox (YsBniZ5ya7k)          | lock metrics first (e-book)                                   | whether the controller is still in flux                                       |
| streaming           | distance loaders                                    | trigger loaders                                               | open ground vs interiors and mazes                                            |
| streaming at all    | stream chunks                                       | keep it resident with LOD and relevance (Alba did not stream) | memory on the lowest device (`scene_report`, then `stream_probe` in a Player) |
| NavMesh and doors   | disable the door container for the bake (Christina) | NavMesh Modifier on door leaves                               | waypoint or stationary guards vs agents that path through doors               |
| doorway size        | from the capsule (e-book metrics)                   | from the camera boom too (gym)                                | first person vs third person camera                                           |
| road system         | tiles                                               | splines with built junctions                                  | grid games vs organic roads                                                   |
| level generator     | WFC (local rules)                                   | graph (Delaunay + MST)                                        | texture-like layouts vs guaranteed connectivity                               |
