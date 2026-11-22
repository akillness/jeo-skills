---
name: scenario-unity-world-building
description: "Use when building a Unity 6.3 level or open world: terrain from code or heightmaps, procedural islands, erosion, splat and foliage rules, trees and grass, ProBuilder graybox, level gym, modular kit and prefab placement, set dressing, landmarks and player guidance, the island's edge, spline roads, WFC, fog, additive scene streaming, or a world that hitches, pops in, leaks memory or runs slow on mobile. Keywords: Terrain, TerrainData, ProBuilder, blockout, graybox, modular kit, NavMesh, LoadSceneAsync, open world."
license: MIT
---

# Unity world building (level and environment artist)

Expert world building is structure first, then generated content that can be regenerated, then
proof: the character fits every space, the camera fits every doorway, the player can reach every
space and walk back, the edge of the world holds content, and the worst viewpoint holds the frame
budget in a Player. An agent without a mouse does all of it through `TerrainData`, the ProBuilder
API, `PrefabUtility` and scene APIs, then checks with raycasts, NavMesh paths, captures, a profiling
tour and a Player probe. Target: Unity 6000.3.21f1, URP 17.3, ProBuilder 6.1.2, Splines 2.9.0, AI
Navigation 2.0.14. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Import its
toolkit; this skill adds [`scripts/ut_world.py`](scripts/ut_world.py), C# jobs in
[`scripts/AgentKit/World/`](scripts/AgentKit/World/) and a runtime assembly in
[`scripts/Runtime/World/`](scripts/Runtime/World/).

**Status (2026-09-24, after the blind-grade refactor):** every procedure ran in Unity 6000.3.21f1 on
this Mac except the plans marked [not run] in
[`references/procedures.md`](references/procedures.md):
`tests/code/unity-world-building/test_live_world.py` (13 live tests), `test_live_world_v2.py` (12
live tests) and `test_offline.py` (7).

## Stance (the expert delta)

1. **Lock the structure before content.** Terrain size and every texture resolution before sculpting
   (later changes rescale or resample, 6.3 Terrain manual); metrics from the character AND its
   camera before blockout, proven in a gym rebuilt whenever the controller changes (level design
   e-book, gym/zoo); the kit grid before placement (Christina Creates Games, 0o-QnNs-stc
   [00:07:35]). In code, persist the `TerrainData` asset before writing splat or the alphamaps are
   lost (observed).
2. **Author non-destructively, regenerate deterministically.** Alba renders movable features,
   levelers and roads to the heightmap and regenerates the world in ordered, skippable steps before
   play and in CI; the generated scene is checked in with `git update-index --skip-worktree` (Manesh
   Mistry, YOtDVv5-0A4 [00:06:10], [00:09:52], [00:10:05]). A PolyShape rebuilt from its footprint
   drops every later edit (ProBuilder manual; observed 12 faces back to 7): keep the recipe, not the
   edited mesh.
3. **Raw procedural output needs a second layer.** Noise needs erosion (Lague, eaXk97ujbPQ); WFC
   needs authored tiles (DV Gen, 20KHNA9jTsE [00:04:22]); roads need routing: a slope-aware A* route
   cut 2.6 m where straight knots cut a 9.1 m canyon (Alba [00:07:45]; observed).
4. **Block out with one generic piece, then bulk replace; prefab every piece and every compound.**
   One wall everywhere, then doors and windows by replacement (Christina [00:15:14]); a metric fix
   is one prefab edit (YsBniZ5ya7k [00:06:25]). In a script, record the instance override before
   replacing: `ReplacePrefabAssetOfPrefabInstance` kept 0 of 30 placements without
   `RecordPrefabInstancePropertyModifications`, 30 of 30 with it (observed; the grid audit stayed
   clean, a slot and perimeter audit caught it).
5. **The graybox exit gate is mechanical.** Doors from agent radius and camera boom, NavMesh over
   every whole floor with door leaves modified out of the bake and clutter that never splits a room,
   roofs marked Not Walkable, upper floors linked, one NavMesh Surface per area (Christina
   [00:17:12], [00:19:27]; YsBniZ5ya7k [00:15:24]); a quick bake for dark zones; landmarks and paths
   first, signs last (Adam Robinson-Yu, ZW8gWgpptI8 [00:18:37]).
6. **Players test the edge first; guide with a ladder.** On an island they swim out and around: put
   content and a way back on every stretch of coast, not walls ([00:16:54], [00:17:58]). Landmarks,
   breadcrumbs, paths that lead back, inclines toward the goal, signs last; false peaks need a
   reason. Here 32 of 36 coast bearings had nothing within 150 m (observed).
7. **Stream only what does not fit, around a persistent core, and judge it in a Player.** Alba kept
   its island resident with LOD and relevance systems ([00:12:43]). The core owns RenderSettings,
   lightmaps and fog; load by path; never hold `allowSceneActivation = false` in play (it froze a
   queued unload for a second, observed); sweep assets after unloads; show a merged proxy while a
   visible chunk is out. `backgroundLoadingPriority` and the Integrate marker only mean something in
   a built Player (6.3 Scripting API; Editor counters read 0 here).
8. **Profile the worst viewpoint, compare statistics, fix on the device's terms.** Teleport to
   anchors, turn 360 degrees, keep the worst heading (Alba [00:29:46]); compare about 200 frames per
   side (Profile Analyzer, [00:17:00]). On tile-based mobile GPUs opaque LOD foliage beats
   alpha-tested impostors (7.12 of 32.5 ms, [00:20:14]); Firewatch's distance alpha cutoff is a PC
   and console choice (Jane Ng, ZYnS3kKTcGg [00:20:29]). LOD Group trees ignore
   `Terrain.treeDistance` (60 m and 700 m gave identical frames, observed): the LOD Group is the
   lever.

## Establish first

Platform and budget (default desktop 60 fps = 16.67 ms; mobile 30 fps: 65 % of the 33.3 ms frame =
21.7 ms, scenario-unity-expert); memory of the lowest device (decides whether to stream at all);
world size and traversal speed; the character (radius, height, slope limit, step, jump distance) and
its camera (pivot, shoulder offset, boom, pitch); art style and fog language; content source
(authored, procedural, mixed) and who paints; whether the user's editor holds the project
(`ut_env.project_lock`). Defaults: URP, 1 km terrain, heightmap 1025, 1 m graybox grid, 2.5 m kit
grid, story 3 m, capsule 0.4 x 1.8 m, slope 45, step 0.3, jump 2.5 m [added].

## Workflow

Each stage is one `ut_world` call; engine calls, arguments and recorded results are in
`references/procedures.md`.

1. **Spec.** Metrics, resolutions, grids, budgets, anchors, memory budget. GATE: every later check
   has a number.
2. **Terrain.** `build_island` (resolutions first, fBm, erosion, levelers, A* road, rule splat, LOD
   trees, instanced details), `raw_roundtrip` for DCC heightmaps, `set_terrain_settings` for the
   per-tile settings the Toolbox cannot batch. GATE: 2^n+1, patch 16, distinct detail seeds, road
   grade <= 10 %, `audit` 0 errors in a fresh editor.
3. **Gym, then graybox.** `build_gym(P, metrics)` (`gym_is_stale` after any controller change), then
   `build_village`. GATE: the door size passes the NavMesh and its camera clip fraction is known;
   `PathComplete` into every building; UV2 everywhere; names carry sizes.
4. **Kit.** `build_kit` then `kit_nav_gate`. GATE: grid, story, yaw, slot and perimeter audit clean;
   door leaves ignored by the bake; no roof islands; upper floors linked.
5. **Guidance.** `setup_views` (bookmarks, anchors, sightlines, spawn), `audit_guidance`,
   `fill_coast` until the longest empty arc passes. GATE: every anchor sees a landmark or stands on
   the main path; every POI walks back; spawn dot >= 0.7.
6. **Look.** `capture` fog off (layout) and fog on (look), `capture_pops` at the detail, LOD and
   cull distances. Open every sheet; judge with [`references/critique.md`](references/critique.md).
   GATE: no blank, black, white or magenta frame; pop sizes recorded.
7. **Stream (only if needed).** `scene_report` first; then `split_streaming`, `build_proxies`,
   `streaming_tests`, `stream_probe`. GATE: PlayMode 5/5; Player Integrate marker within the
   priority budget; memory back to baseline after the sweep.
8. **Tour.** `tour_profile`, `compare_runs` before and after each change. GATE: `budget_check` pass
   per anchor; counts decide in the Editor, milliseconds on the device.

## Numbers

| Value                   | Relative to                                                                  | Source                       |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------- |
| 2^n+1 (513, 1025, 2049) | heightmap; 1025+ for erosion                                                 | 6.3 Terrain manual           |
| 16                      | Detail Resolution Per Patch (more only for sparse far grass)                 | 6.3 manual                   |
| 4                       | terrain layers per splat map with height blend                               | smnLYvF40s4 [00:04:23]       |
| 2 / 4 / 10 / 50 ms      | Integrate budget per frame, Low / BelowNormal / Normal / High, Player only   | 6.3 Scripting API            |
| 2.5 x 3 m, Y = 3 n      | kit wall, story                                                              | 0o-QnNs-stc [00:07:35]       |
| 1.0 m                   | narrowest door for a 0.4 m capsule (0.8 fails)                               | gym, observed                |
| 80 % / 27 %             | camera boom (3.5 m, 20 degrees) blocked through a 1.4 x 2.4 m / 2 x 3 m door | gym, observed                |
| 40 pass, 45 fail        | ramp degrees at slope limit 45, NavMesh and CharacterController agree        | gym, observed                |
| 0.13 to 0.06 m          | NavMesh height error on stairs without / with Build Height Mesh              | gym, observed                |
| 0.5 to 1.13 of 2 ms     | Player Integrate max per frame at Low (village chunk, 34 to 371 ms loads)    | stream_probe, observed       |
| 7.12 of 32.5 ms         | impostor foliage GPU cost, iPad Mini 4                                       | YOtDVv5-0A4 frame [00:19:53] |
| ~200 frames             | per side of a before/after comparison                                        | YOtDVv5-0A4 [00:17:00]       |
| 150 m, 300 m            | POI radius, longest empty coast arc (defaults to tune)                       | [added]                      |

## Quality gates

- **Measurable:** envelope `ok`, zero compile errors; terrain audit 0 errors (desktop and
  `mobile=True`); blockout, kit slot and perimeter audits clean; kit NavMesh gate; gym table;
  guidance gate; NUnit EditMode 8/8 and PlayMode 5/5; Player probe verdict; `budget_check` per
  anchor; `compare_runs` p-values.
- **Visual:** fog-off, fog-on, pop and proxy sheets opened; `ut_review` flags none; before/after
  from the same bookmarks; detail reads as language: generic rocks and trees shape-only, narrative
  props detailed, no fourth rock if three suffice (Firewatch, ZYnS3kKTcGg [00:24:27], [00:25:50]).

## Common mistakes

| Mistake                                                       | What it looks like                                                  | Fix                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `CreateAsset(terrainData)` after `SetAlphamaps`               | terrain all first layer in a fresh editor                           | asset first, then layers                                                                                |
| `ReplacePrefabAssetOfPrefabInstance` after an unrecorded move | replaced walls stacked at the house origin, holes; grid audit clean | `RecordPrefabInstancePropertyModifications` after placing; restore the transform; slot audit            |
| two NavMesh Surfaces over one area                            | paths "complete" through walls on the stale surface                 | one surface per area; rebake overlaps                                                                   |
| closed door leaves baked                                      | rooms unreachable                                                   | `NavMeshModifier.ignoreFromBuild` on leaves                                                             |
| clutter placed without the agent radius                       | door open, room split: 25 % of a floor reachable (observed)         | keep door zones clear; reject items that disconnect the floor; sample the whole floor                   |
| roofs and upper floors in the bake                            | unreachable islands                                                 | roof area Not Walkable; stairs or `NavMeshLink`                                                         |
| door sized from the capsule only                              | camera snaps in at every doorway                                    | measure the boom in the gym; interior camera                                                            |
| editing a PolyShape again                                     | extrusions gone                                                     | lock footprints; replay a recipe                                                                        |
| tuning `treeDistance` for LOD trees                           | no change at all                                                    | tune the LOD Group, capture the cull                                                                    |
| Healthy/Dry Color on instanced details                        | no color variation                                                  | vary color in the shader                                                                                |
| Bake Light Probes For Trees (on by default) alone             | no effect                                                           | tree renderers receive GI from Light Probes                                                             |
| holding activation to preload                                 | unloads freeze                                                      | load immediately, gate only a loading screen                                                            |
| no Start scan in a streamer                                   | a chunk opened in the Editor loads twice (1 vs 2 copies, observed)  | scan loaded scenes in `Start`                                                                           |
| streaming or memory judged in the Editor                      | counters 0, priority ignored                                        | `stream_probe` in a development Player                                                                  |
| `new ProfilerRecorder(handle)` for a marker                   | 0 ms forever                                                        | add `ProfilerRecorderOptions.StartImmediately` (or `StartNew`); treat a never-sampled marker as no data |
| per-system GPU ms from `FrameTimingManager`                   | "terrain 2 ms" that is the whole frame                              | toggle the system and diff, or a GPU capture                                                            |
| judging layout through fog or top-down ortho                  | washed aerial; trees culled by LOD                                  | fog-off aerial captures                                                                                 |

## Handoffs

- **Receives** assets from scenario-3d, scenario-textures, scenario-skyboxes and
  scenario-blender-expert; the character controller and camera rig from scenario-unity-gameplay and
  scenario-unity-animation (Cinemachine); input from scenario-unity-architecture.
- **Delivers** to scenario-unity-rendering-lighting: scenes with static flags, UV2, the core as
  lighting owner, one APV Baking Set with the core and every chunk, baked (and occlusion) with all
  scenes open [not run here], fog baseline, probe settings per tile; to scenario-unity-shaders: the
  Firewatch gradient-strip fog as a fullscreen pass spec, grass color variation in the detail
  shader; to scenario-unity-performance: tour CSV and JSON, `compare_runs`, the Player probe, the
  LOD finding, GPU Resident Drawer candidates among chunk props (Forward+, SRP Batcher, Mesh
  Renderers only, deltas section 5); to scenario-unity-mobile: `audit(mobile=True)`, streaming
  priorities; to scenario-unity-gameplay: NavMesh surfaces, links, gym table, spawn points; to
  scenario-unity-pipeline-automation: Addressable scenes, build list, import rules as
  `AssetPostprocessor`s.
- Packet: project, channel, scenes, the gates with numbers, all sheets, open issues.

## Unity 6.3 notes

- Polybrush is deprecated and never worked on Terrain: scatter by raycast. ProBuilder 6.1.2: no
  window (Scene view tool context), `PivotLocation.FirstVertex` (the docs' "First Corner"), default
  material is a vertex-color Shader Graph.
- Terrain Tools 5.3.2 bundled; Splines 2.9.0; AI Navigation 2.0.14 (NavMesh Surface, Modifier, Link,
  Build Height Mesh); Build Profiles share `EditorBuildSettings.scenes`; Memory Profiler 1.1.12 and
  Profile Analyzer 1.4.0 are packages.
- `FindObjectsByType` needs a sort mode (obsolete in 6.4); 6.6 new projects enter Play mode without
  domain reload.

## References

- `references/procedures.md`: 24 procedures with full calls, live test paths and recorded results.
- [`references/expert-notes.md`](references/expert-notes.md): principles and judgment by expert,
  with source and timestamp.
- `references/critique.md`: rubric for terrain, gym, blockout, kit, guidance, atmosphere, streaming,
  performance.
- [`references/gui-paths.md`](references/gui-paths.md): Terrain Toolbar, ProBuilder tool context,
  Splines, NavMesh, multi-scene, profiling windows.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs, best
  timestamps, revision history.
