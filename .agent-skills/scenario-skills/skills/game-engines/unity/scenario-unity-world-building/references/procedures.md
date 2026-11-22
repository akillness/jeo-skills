# Procedures (runner calls, engine calls, gates, live results)

Every procedure below ran in Unity 6000.3.21f1 (URP 17.3, Metal, macOS Apple Silicon) on 2026-09-24
through `tests/code/unity-world-building/test_live_world.py` (P1 to P14) and `test_live_world_v2.py`
(P15 to P24, added in v0.2 after the blind grade); each result line quotes
`archive/tests/unity-world-building/live_results.jsonl`. Full C# lives in `scripts/AgentKit/World/`
(Editor jobs, namespace `AgentKit.World`) and `scripts/Runtime/World/` (runtime assembly
`AgentKit.World.Runtime`); the excerpts here are copied from those files. Python driver:

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-world-building/scripts")
import ut_world                                   # imports ut_env, ut_run, ut_review, ut_stat from scenario-unity-expert
P = ut_world.project("<root>/tests/projects/unity-world-building")
```

## P1. Project: clone, pin packages, install the kit

```python
P = ut_world.project(dest)            # ut_env.base_project("3d", dest): cp -cR tests/projects/Base3D_URP (APFS clone)
ut_world.pin_packages(P)              # Packages/manifest.json: com.unity.probuilder 6.1.2, com.unity.splines 2.9.0, com.unity.ai.navigation 2.0.14
ut_world.install(P)                   # core AgentKit -> Assets/Editor/AgentKit/, World jobs -> .../World/, runtime -> Assets/AgentKitRuntime/World (asmdef)
ut_world.resolved_versions(P)         # after one editor start: Packages/packages-lock.json
```

Engine side: Unity resolves the manifest on launch (`Unity -batchmode -projectPath P ...`); the
first job took 23 s with the downloads. Pin explicit versions: the editor manifest's defaults can
lag the Manual. **Result (test_00_packages_pinned):** pass; manifest and lock both ProBuilder 6.1.2,
Splines 2.9.0, AI Navigation 2.0.14.

## P2. Island terrain from a procedural heightmap (resolutions first, erosion, splat, trees, details)

```python
r = ut_world.build_island(P)          # AgentKit.World.WorldTerrain.BuildIsland; args override any default below
assert r["gate"]["ok"]
```

Engine calls, in this order (from `WorldTerrain.BuildIsland`):

```csharp
var td = new TerrainData();
td.heightmapResolution = 1025;                       // FIRST: the setter rescales size; 2^n+1, 1025+ for erosion detail
td.size = new Vector3(1000f, 150f, 1000f);
td.alphamapResolution = 1024; td.baseMapResolution = 1024;
td.SetDetailResolution(1024, 16);                    // 16 per patch (6.3 recommendation)
td.SetDetailScatterMode(DetailScatterMode.InstanceCountMode);
AssetDatabase.CreateAsset(td, "Assets/World/Terrain/Island_TerrainData.asset");   // BEFORE layers and splat (see trap)

var h = WorldNoise.Island(1025, 1000f, noise, sea: 10f, peak: 115f, coastRadius: 430f, seabed: 2f);   // meters
WorldNoise.Erode(h, heightScale: 150f, ErosionSettings.Default /* 250k droplets */);               // normalized heights
WorldNoise.Flatten(h, 1000f, plateauCentre, plateauRadii, WorldNoise.MedianInEllipse(h, ...), 0.6f); // Alba leveler
// road corridor (P3), then heights / size.y into a [z, x] array:
td.SetHeights(0, 0, hn);
td.terrainLayers = new[] { sand, grass, rock, dirt };       // TerrainLayer assets, tileSize in meters; 4 = height blend OK
td.SetAlphamaps(0, 0, alpha);                                // rules: beach band, slope > 28-40 deg rock, road mask dirt, normalized
td.treePrototypes = new[] { new TreePrototype { prefab = broadleaf }, new TreePrototype { prefab = conifer } };
td.SetTreeInstances(trees.ToArray(), true);                  // jittered 11 m grid + forest noise mask, no trees on road/clearing
td.detailPrototypes = new[] { new DetailPrototype { usePrototypeMesh = true, prototype = grassTuft, useInstancing = true,
    renderMode = DetailRenderMode.VertexLit, noiseSeed = seed * 31 + 1, /* distinct per prototype */ } , /* flowers: seed * 31 + 2 */ };
td.SetDetailLayer(0, 0, 0, grassCounts); td.SetDetailLayer(0, 0, 1, flowerCounts);
var go = Terrain.CreateTerrainGameObject(td);
var t = go.GetComponent<Terrain>();
t.materialTemplate = terrainLit;          // "Universal Render Pipeline/Terrain/Lit", _TERRAIN_BLEND_HEIGHT with <= 4 layers
t.heightmapPixelError = 5; t.basemapDistance = 400; t.drawInstanced = true; t.detailObjectDistance = 80;
t.groupingID = 1; t.allowAutoConnect = true; t.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox;
```

Trees are opaque geometry with a 2-level `LODGroup` (`LOD0` trunk + lumpy canopy, `LOD1` low poly,
cull at 4.5% screen height), materials with GPU instancing: Alba's mobile rule, no alpha test.
Details are crossed-quad tufts with a two-sided opaque URP Lit material. Noise parameters that
matter (Lague): octaves 6, persistence 0.5, lacunarity 2, scale 300 m, per-octave offsets within
±10,000, world-space sampling (chunks meet at seams), `Clamped()` = OnValidate. **Result
(test_01_island):** pass in 20.0 s (generation 6.3 s: noise 0.4 s, erosion 3.4 s, splat 0.4 s;
erosion took up to 7.3 s in other runs while six editors shared the machine); 1000 x 150 x 1000 m,
heightmap 1025 (0.977 m per sample), heights 1.9 to 71.0 m, land 61%; land coverage sand 10.7%,
grass 86.6%, rock 0.7%, dirt 2.0%; 1,333 trees (8.26 per 1,000 m² inside the forest mask); 600,846
grass and 8,462 flower instances; erosion 250k droplets, max change 1.92 m, deep pits (> 5 cm) 0 →
357; detail seeds 218 and 219. **Traps observed:** (1) with `CreateAsset` after `SetAlphamaps` the
splat was lost: a fresh editor loaded the terrain 100% sand (AuditTerrain `world.splat_lost`); after
the fix grass 53% of all texels. (2) Erosion on heights in meters per cell with Lague's parameters:
deep pits 1,429; on normalized heights 357; 600k droplets 232.

## P3. Road on a spline: slope-aware route, grade limit, corridor, road mesh

Part of BuildIsland (`road_route="astar"` default, `"straight"` for comparison):

```csharp
var knots = WorldNoise.RouteAStar(h, 1000f, beach, plateauEdge, cell: 4f, slopeWeight: 60f, maxGrade: 0.10f, minHeight: sea + 1.5f).ToArray();
var spline = roadGo.AddComponent<SplineContainer>().Spline;             // Splines 2.9.0, one spline per street
foreach (var k in knots) spline.Add(new float3(k.x, 0f, k.y), TangentMode.AutoSmooth);
float len = spline.CalculateLength(float4x4.identity);
// sample every 2 m with spline.EvaluatePosition(t), smooth the terrain profile, then clamp |dy| <= 0.10 * dx forward and back
var mask = WorldNoise.FlattenCorridor(h, 1000f, path, halfWidth + 0.5f, shoulder: 5f);   // cut and fill; mask paints dirt, excludes trees and grass
var mesh = WorldTerrain.RoadMesh(path, halfWidth: 3f, lift: 0.06f);   // V across 0..1, U = cumulative meters / 4 (no squashing)
```

**Result (test_01_island):** A* route 923.7 m, 39 knots, max grade 0.10, max cut 2.55 m, max fill
0.46 m. Same endpoints with straight knots (run 2026-09-24 19:31): 437.4 m, max cut 9.13 m (a canyon
in the C_Road capture). The EditMode test `AStarRoadAvoidsSteepGround` passes (the route detours
through a pass instead of climbing a 30 m ridge). Junctions (not built here): one spline per street,
junction meshes from spline ends sorted around the centroid with Bezier corners (Game Dev Guide);
URP decals on a road Rendering Layer. [not run]

## P4. Heightmap files: 16-bit RAW export and import

```python
r = ut_world.raw_roundtrip(P)         # WorldTerrain.ExportRaw then WorldTerrain.ImportRaw into a new TerrainData and scene
assert r["gate"]["ok"]                # identical height hash and resolution
```

```csharp
ushort v = (ushort)Mathf.RoundToInt(Mathf.Clamp01(h[z, x]) * 65535f);        // export, little-endian, row 0 = z 0
int r = Mathf.RoundToInt(Mathf.Sqrt(bytes.Length / 2f));                      // import: (2^n+1)^2 samples, 2 bytes each
int v = big ? (bytes[i] << 8) | bytes[i + 1] : bytes[i] | (bytes[i + 1] << 8);
h[flip ? r - 1 - z : z, x] = v / 65535f;
td.heightmapResolution = r; td.size = new Vector3(size, height, size); AssetDatabase.CreateAsset(td, path); td.SetHeights(0, 0, h);
```

GUI twin: Terrain Settings > Import Raw (Depth 16, Byte Order, Flip Vertically). World Machine, Gaea
and Houdini export this format. **Result (test_12_raw_heightmap_roundtrip):** pass; 1025² samples,
2,101,250 bytes, export hash `e368f404e4db504d` = import hash, new scene
`Assets/World/Scenes/World_RawImport.unity`.

## P5. ProBuilder graybox of a village from a plan in meters, with the NavMesh gate

```python
r = ut_world.build_village(P, plan=[{"name": "House_A", "x": -34, "z": -14, "w": 8, "d": 6, "storeys": 1, "door": "E"}, ...],
                           metrics={"agent_radius": 0.5, "agent_height": 2.0, "storey": 3, "wall": 0.2, "grid": 1})
assert r["gate"]["ok"]                # doors fit the agent, every building reachable, audit clean, UV2 everywhere
```

Engine calls (`WorldBlockout`):

```csharp
using Math = System.Math;                           // UnityEngine.ProBuilder also defines Math (CS0104)
var pb = ShapeGenerator.GenerateCube(PivotLocation.FirstVertex, new Vector3(len, h, 0.2f));   // FirstVertex = bounds min corner
pb.GetComponent<MeshRenderer>().sharedMaterial = BuiltinMaterials.defaultMaterial;          // none is assigned from script
foreach (var f in pb.faces) pb.SetFaceColor(f, WallColor);                                   // legend, shown by the default Shader Graph
pb.ToMesh(); pb.Refresh(); EditorMeshUtility.Optimize(pb, true);                            // UV2 + shared vertices
pb.gameObject.AddComponent<MeshCollider>().sharedMesh = pb.GetComponent<MeshFilter>().sharedMesh;
// a door wall = left jamb + right jamb + lintel (no Boolean: experimental); names carry sizes: BO_WallS_w8_h2.8_t0.2_L
var asset = PrefabUtility.SaveAsPrefabAssetAndConnect(go, "Assets/World/Blockout/Prefabs/PF_" + go.name + ".prefab", InteractionMode.AutomatedAction);
// asset = the prefab ASSET root; go is the connected instance. Rebuild after prefab calls (ToMesh + Refresh + Optimize):
WorldBlockout.RebuildAll(go);
var surf = navGo.AddComponent<NavMeshSurface>();     // Unity.AI.Navigation 2.0.14
surf.collectObjects = CollectObjects.Volume; surf.size = new Vector3(120, 30, 120); surf.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
Physics.SyncTransforms(); surf.BuildNavMesh(); AssetDatabase.CreateAsset(surf.navMeshData, "Assets/World/Nav/NavMesh_Village.asset");
NavMesh.SamplePosition(plaza, out var start, 3f, NavMesh.AllAreas);
NavMesh.CalculatePath(start.position, interior, NavMesh.AllAreas, path);     // PathComplete for every building
```

A summit landmark (`BO_Watchtower`, 9 stories = 27 m) is placed on the highest terrain point
(`summit_tower`, `summit_storeys`). From a plan image instead: place a quad at 10 m = 100 px
(Rotation X 90, Scale 100 x 100, Position Z 50) for a human, and give the agent the plan as data;
image sampling at a known px-per-meter is possible [not run]. **Result (test_02_village_blockout):**
pass; 5 buildings + watchtower, 112 ProBuilder pieces, material "ProBuilderDefault /
ProBuilder6/Standard Vertex Color", doors 1.4 x 2.4 m fit the 0.5/2.0 agent, NavMesh bake 0.02 s
(150 triangles, 71 meshes + terrain collected), paths House_A 18.9 m, House_B 18.3, House_C 30.8,
Tavern 34.0, BellTower 11.6 (all PathComplete); audit 0 findings; prefab assets hold 71 of 71 null
meshes (driven), scene instances 0. **Traps observed:** the returned value of
`SaveAsPrefabAssetAndConnect` is the asset (first run: all edits went to the asset, targets at local
coordinates, PathInvalid); `ToMesh()` after `Optimize` dropped UV2 on 71 pieces until `RebuildAll`
re-ran Optimize.

## P6. Modular prefab kit on a grid: generic walls, bulk replace, variants, clutter

```python
r = ut_world.build_kit(P, town=[{"name": "KitHouse_A", "x": 0, "z": 0, "w": 3, "d": 2, "storeys": 2, "door": "W", "door_cell": 0, "variant": "Plaster"}, ...])
assert r["gate"]["ok"]
```

Engine calls (`WorldKit`):

```csharp
// kit pieces: ProBuilder boxes -> CombineMeshes -> Mesh asset (ProBuilder "Export > Asset"), pivot at the corner, 2.5 m grid
kit["Wall"] = Piece("PF_Kit_Wall_2.5x3m", timber, true, B(0, 0, 0, 2.5f, 3f, 0.2f));
kit["WallDoor"] = Piece("PF_Kit_WallDoor_2.5x3m", timber, true, B(0,0,0,0.55f,2.4f,0.2f), B(1.95f,0,0,0.55f,2.4f,0.2f), B(0,2.4f,0,2.5f,0.6f,0.2f));
var inst = (GameObject)PrefabUtility.InstantiatePrefab(basePrefab); inst.GetComponent<MeshRenderer>().sharedMaterial = plaster;
PrefabUtility.SaveAsPrefabAsset(inst, ".../PF_Kit_Wall_2.5x3m_Plaster.prefab");            // an instance saved = Prefab Variant
// walls: S yaw 0 at (i*2.5, y, 0); N yaw 180 at ((i+1)*2.5, y, D); W yaw 90 at (0, y, (j+1)*2.5); E yaw -90 at (W, y, j*2.5): thickness inward
go.transform.localPosition = p; go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
PrefabUtility.RecordPrefabInstancePropertyModifications(go.transform);                    // a script move is not an override until recorded
var lp = go.transform.localPosition; var lr = go.transform.localRotation;
PrefabUtility.ReplacePrefabAssetOfPrefabInstance(go, doorOrWindowPrefab, new PrefabReplacingSettings {
    objectMatchMode = ObjectMatchMode.ByHierarchy, prefabOverridesOptions = PrefabOverridesOptions.KeepAllPossibleOverrides },
    InteractionMode.AutomatedAction);                                                      // bulk replace
go.transform.localPosition = lp; go.transform.localRotation = lr;                          // belt and braces
// clutter: Physics.Raycast down onto the floor, pivot on hit.point, random yaw, reject Physics.OverlapBox hits other than the floor
// compound prefabs: each finished house -> SaveAsPrefabAssetAndConnect, kit pieces stay nested prefabs
```

**Trap found in v0.2 (P15):** the v0.1 run above replaced without recording the overrides; every
replaced window and door wall came back at the house origin (24 stacked pieces, 28 perimeter holes),
while the grid, story and yaw audit reported 0 findings and the E_KitTown capture showed open wall
cells. The v0.1 "Result" line below is therefore wrong about the walls; P15 holds the corrected run.
Hierarchy: `KitTown/KitHouse_X/Level_n/{Floor, Walls, Doorways, Decoration}` + `Roof`; houses built
at their own zero, then moved. **Result (test_03_kit_town):** pass; 144 architecture instances, 30
replacements (doors and windows), 6 Prefab Variants, 18 clutter items placed (3 rejected by overlap,
0 without a hit), audit: 0 off-grid, 0 off-story, 0 bad yaw, 0 hovering, 0 overlapping, 0 unlinked.

## P7. Landmarks, sightlines, bookmarks, spawn, fog

```python
r = ut_world.setup_views(P)          # WorldScenes.SetupViews
assert r["gate"]["ok"]               # every anchor guided (sees a landmark or stands on the main path), spawn sees and faces one
ut_world.set_atmosphere(P, fog=False)                    # layout captures
ut_world.set_atmosphere(P, fog=True, density=0.0015)     # look captures
```

```csharp
AgentCapture.SaveBookmark("B_Beach", eye, farLandmarkTop, 60f);          // AgentView_* disabled cameras
var hits = Physics.RaycastAll(anchor, dir / dist, dist, ~0, QueryTriggerInteraction.Ignore).Where(h => !own.Contains(h.collider));
// blocked: raise the target in 2 m steps until clear -> "extra_height_needed_m"
RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared; RenderSettings.fogDensity = 0.0015f;
sky.SetColor("_GroundColor", fogColor);                                   // Skybox/Procedural: the sea horizon dissolves
```

**Result (test_04_views_and_sightlines):** pass; 7 bookmarks, 6 tour anchors, guided 6/6, landmark
visible from 6/6, spawn dot 1.0, fog visibility 0.57 at 500 m and 0.105 at 1 km. The loop that got
there (runs 19:26 to 19:35): bell tower alone visible from 3/6 anchors (beach needed +40 m, road +42
m, forest +34 m); a 12 m summit watchtower gave 4/6 with the beach needing +12 m; 24 m needed +2 m
more; 27 m passed.

## P8. Captures you look at (fog off for layout, fog on for look)

```python
c0 = ut_world.capture(P, label="layout_fog_off")   # AgentKit.AgentCapture.CaptureViews: bookmarks + Z_TopDown ortho (250 m up, far 600), graphics=True
c1 = ut_world.capture(P, label="look_fog_on")
# OPEN c0["review"]["sheet"] and c1["review"]["sheet"]; ut_review.compare(aerial_off, aerial_on)
```

**Result (test_05_captures_fog_off_and_on):** pass; 8 frames each, no blank, black, white or magenta
flags; A_Aerial saturation 0.462 → 0.181 with fog, D_Plaza 0.434 → 0.430, E_KitTown 0.405 → 0.401
(eye level barely changes); aerial mean abs diff 0.194. Sheets looked at: island ring of sand,
winding road, village and kit town on the plateau, bell tower and watchtower readable; the first
aerial (without fog) showed a hard gray horizon band, fixed by the fog-matched sky. Evidence:
`archive/tests/unity-world-building/evidence/contact_fog_off.png`, `contact_fog_on.png`.

## P9. Terrain audit in a fresh editor (desktop and mobile)

```python
a = ut_world.audit(P)                 # WorldTerrain.AuditTerrain: findings format of AgentAudit
m = ut_world.audit(P, mobile=True)    # adds world.foliage_alpha_clip_mobile on alpha-tested tree materials
```

Checks: heightmap 2^n+1 (1025+ with erosion), patch 16, Draw Instanced, instanced detail meshes,
distinct detail seeds, `DetailPrototype.Validate`, tree LOD Groups, SpeedTree distance note, height
blend with more than 4 layers, alphamap weights sum to 1, splat not 100% first layer, grouping IDs.
**Result (test_06_terrain_audit_fresh_editor):** pass; desktop 0/0/0, mobile 0/0/0 (opaque trees);
coverage of all texels sand 45.1% (includes the seabed), grass 53.2%, rock 0.45%, dirt 1.3%. The
same audit on the pre-fix terrain returned 1 error `world.splat_lost` (19:21).

## P10. Additive streaming: core + chunks, PlayMode tests with timings

```python
s = ut_world.split_streaming(P)       # WorldScenes.SplitForStreaming
r = ut_world.streaming_tests(P)       # ut_run.run_tests(P, "PlayMode", filter="AgentWorld"), timings JSON
```

```csharp
EditorSceneManager.SaveScene(island, "Assets/World/Scenes/World_Core.unity", true);     // copy, then open the core
var chunk = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
SceneManager.MoveGameObjectToScene(villageRoot, chunk); EditorSceneManager.SaveScene(chunk, chunkPath);
SceneManager.SetActiveScene(core);                                                      // core owns lighting and fog
EditorBuildSettings.scenes = new[] { core, village, kit, island }.Select(p => new EditorBuildSettingsScene(p, true)).ToArray();
// runtime (WorldStreamer): LoadSceneAsync(path, Additive) with activation NOT held; UnloadSceneAsync(path);
// every 2 unloads Resources.UnloadUnusedAssets(); Application.backgroundLoadingPriority = ThreadPriority.Low
```

The PlayMode tests (`tests/code/unity-world-building/unity/Tests/PlayMode/StreamingTests.cs`): load
and unload two chunks with wall-clock timings, the held-activation stall, `WorldStreamer` by
distance, and (v0.2) `ScanOnStartPreventsDoubleLoad` and `ProxyStandsInWhileChunkIsUnloaded`. **v0.2
result (run 20:45):** PlayMode 5/5; a chunk already open plus a streamer with the Start scan = 1
copy, without it = 2 copies (the double load of zObWVOv1GlE [00:11:21]); proxy active while the
chunk is out, hidden once it is in, back before it leaves; the Editor's `ProfilerRecorder` "Total
Used Memory" read 0 MB and the Integrate marker 0 ms in batch Play mode (recorder valid): memory and
integration are Player measurements (P23). **Result (test_07_split_streaming,
test_09_playmode_streaming):** split pass (chunks 71 and 162 renderers, 0 lights in chunks, core
active, unique names); PlayMode 3/3 in 16.4 s: village load 75 ms, unload 1.8 ms; kit town load 64
ms, unload 1.2 ms (batch `-nographics`, no GPU upload; the same loads took 200 to 2,750 ms in
earlier runs while other editors loaded the machine: compare loads within one run, measure in a
Player); meshes 52 → 134 → 134 after unload → 52 after `UnloadUnusedAssets`; core stayed active,
`new GameObject` landed in the core; held activation: progress 0.90, the queued unload still at
progress 0 after 1 s (26,451 frames) with its root alive while `Scene.isLoaded` read false;
WorldStreamer loaded both chunks (55 and 63 ms) and unloaded them 600 m away, then swept assets.
**Trap observed:** batch Play mode runs unpaced frames (thousands per second): frame-count guards
ended the first stall test before the load reached 0.9; use wall-clock waits.

## P11. Automated tour profile with a budget check

```python
t = ut_world.tour_profile(P, target_fps=60)   # AgentKit.AgentProfile.PlayModeTimings (quit=False, graphics=True) on the island
t["budget"]                                   # ut_stat.budget_check(cpu_frame_ms, 16.67, skip=5)
t["tour"]                                     # ut_world.tour_budget(report): per-anchor p50/p95/max, worst heading, batches, triangles
```

`ProfileTour` (runtime) teleports `Camera.main` to each `TourAnchor_*`, turns 8 headings x 12
frames, records `ProfilerRecorder` "CPU Total Frame Time", "Batches Count", "Draw Calls Count",
"Triangles Count" and writes JSON; AgentProfile records the whole run (600 frames after a 60-frame
warm-up) with the camera rendering to an offscreen target (batch Play mode has no Game view).
**Result (test_10_tour_profile, 20:14, six editors running on the machine):** pass; 595 frames, CPU
frame mean 4.07 ms, p50 2.85, p95 12.79 (budget 16.67), max 138.9 ms, 4 hitches over 33 ms; per
anchor p95 Beach 8.6, Road 13.1, Plaza 5.7, KitTown 13.4 (worst, heading 119 degrees), Forest 12.4,
Hilltop 9.6 ms, all pass; max batches 1,811 (Forest), mean 1,048; max triangles 407,260; "Render
Thread" counter missing in the Editor (AgentKit reports it). The run just before, under the same
load, gave Forest p95 30.4 ms and Plaza 26.9 ms (tour verdict fail) with identical batches and
triangles: in the Editor judge counts, and repeat the ms verdict in a development player on the
device.

## P12. Distance levers for LOD trees (measure, change, re-measure, look)

```python
ut_world.set_terrain_settings(P, tree_distance=350)   # WorldTerrain.SetTerrainSettings (before/after on record)
ut_world.set_tree_lods(P, lod0=0.18, cull=0.08)        # WorldTerrain.SetTreeLods: LoadPrefabContents, SetLODs, SaveAsPrefabAsset, RefreshPrototypes
t = ut_world.tour_profile(P); c = ut_world.capture(P)  # numbers AND frames
```

**Result (runs 20:01 to 20:07, and test_11_tree_distance_vs_lod_group at 20:14):** `treeDistance`
700 → 400 (cull 0.03): max batches 2,820 → 2,820, max triangles 429,128 → 429,128; `treeDistance`
700 → 350 (cull 0.045): batches 1,811 → 1,811, triangles 407,260 → 407,260 (ignored both times;
batches can jitter by 2 between runs). LOD cull 0.03 → 0.08: max batches 2,820 → 1,091, mean 1,461 →
475, p95 CPU 9.8 → 6.5 ms, but the aerial and hilltop captures lost the distant forests (fail on
look, `evidence/contact_fog_on_lodcull008.png`). Cull 0.045: max batches 1,811 to 1,813, mean 1,048,
forests intact (`contact_fog_on_lodcull0045.png`), kept as the default. **Decisive check (v0.2,
`test_26`):** the tour's max counts could hide a change in far views, so the same 8 bookmarks were
captured with `treeDistance` 700 and 60 m (fog off): mean absolute difference 0.0 on every frame,
trees still visible 260 m below the aerial camera. `treeDistance` does not cull these LOD Group mesh
trees (the manual states it for SpeedTree; observed here for plain LOD Group prefabs).

## P13. WFC and graph generators under the Test Framework

```csharp
var rules = new WfcRules(new[] { "grass", "tree", "bigtree", "sand", "water" }, new[] { 4f, 2f, 1f, 2f, 3f });
foreach (var m in rules.modules) rules.Allow(m, m);
rules.Allow("grass", "tree").Allow("tree", "bigtree").Allow("sand", "grass").Allow("water", "sand");
var res = Wfc.Solve(rules, 16, 16, seed);          // min-domain collapse, propagation, restart on contradiction
Assert.AreEqual(0, Wfc.Violations(rules, res.grid));
```

**Result (test_08_editmode_generators):** EditMode 6/6 in v0.1, 8/8 with the two `WorldGuideTests`
of v0.2 (P18): island determinism, clamps, world-space seams (per-chunk normalization opens a seam >
0.01), erosion bounded and reproducible (257², 40k droplets, 0.56 s, deep pits 0 → 17), A* road
detour, WFC 500 seeds 0 violations 0 failures 0 restarts (this rule set never contradicts: arc
consistency suffices for a chain of rules), 1.1 to 1.3 ms per 16 x 16 solve. Graph dungeons
(Delaunay + MST + 12.5% loops + cost-shaped A*, Vazgriz): described in `expert-notes.md`, not
implemented here [not run].

## P14. Chunked procedural worlds and runtime meshes (plan)

For endless or very large generated worlds: a viewer-centered chunk grid with
`Dictionary<Vector2Int, Chunk>`, nearest-edge visibility (`Bounds.SqrDistance`), pooled chunks,
world-space noise (P13 seam test), meshes through the advanced Mesh API in Burst jobs
(`Mesh.AllocateWritableMeshData`, `SetSubMesh(..., DontRecalculateBounds | DontValidateIndices)`,
UInt32 indices above 65,535 vertices). Terrain tiles instead of meshes: 257 or 513 heightmaps with a
shared Grouping ID and Auto Connect. [not run: the live tests cover one 1 km tile and scene
streaming]

---

## v0.2 procedures (added 2026-09-24 after the Y2 blind grade)

## P15. Kit placement integrity (replace without losing the placement; compound prefabs)

```python
r = ut_world.build_kit(P)             # gate adds no_stacked_pieces and no_missing_walls
a = ut_world.audit_kit(P)             # WorldKit.AuditKitTown on any kit already in a scene (built by hand too)
```

Audit additions (`WorldKit.AuditKit`): `world.kit_stacked` (two pieces of one type on the same
position and yaw), `world.kit_missing_wall` (distinct wall slots per story < 2 x (cells wide + cells
deep), the story size read from its Floor container) and `world.clutter_blocks_door` (clutter inside
the 1.2 m clear zone of a doorway). Clutter scatter now rejects items in a door's clear zone and
items that split the room: `WorldKit.FloorConnected` floods a 0.1 m grid of the free floor (interior
minus walls and clutter, each inflated by the agent radius, 0.5 m for agent type 0) from the door's
inside point and requires >= 95 % [added] reached. Each finished house is saved with
`SaveAsPrefabAssetAndConnect`; its kit pieces stay nested prefab instances (Christina's prebuilt
compounds, 0o-QnNs-stc [00:08:17]). **Result (runs 20:40 to 21:05):** the v0.1 kit audited 29 errors
(24 stacked, 28 missing walls); `ReplacePrefabAssetOfPrefabInstance` kept 0 of 30 placements with or
without `PrefabReplacingSettings { ByHierarchy, KeepAllPossibleOverrides }`, and 30 of 30 once
`RecordPrefabInstancePropertyModifications(transform)` ran after each placement; rebuilt kit: 144
pieces, 30 replacements, 0 stacked, 0 missing, 0 findings; house prefabs hold 52, 48 and 62 nested
kit instances. With the walls fixed, the NavMesh gate (P16) found two rooms split by clutter (25 %
and 46 % of the floor reachable); the scatter rules above then rejected 6 door-zone and 9
room-splitting candidates, placed the same 18 items, and left 98.6 %, 100 % and 96.2 % of the floors
connected (grid estimate).

## P16. Kit NavMesh gate (door leaves, roofs, upper floors, overlapping surfaces)

```python
n = ut_world.kit_nav_gate(P)          # WorldNav.KitNavGate; gate from the job
```

```csharp
var leaf = (GameObject)PrefabUtility.InstantiatePrefab(leafPrefab, doorway.parent);          // PF_Kit_DoorLeaf in every doorway
surf.collectObjects = CollectObjects.Volume; surf.useGeometry = NavMeshCollectGeometry.PhysicsColliders; surf.buildHeightMesh = true;
surf.BuildNavMesh();                                                                         // 1: leaves baked as walls
leaf.AddComponent<NavMeshModifier>().ignoreFromBuild = true; surf.BuildNavMesh();           // 2: doors open again
var m = roof.AddComponent<NavMeshModifier>(); m.overrideArea = true; m.area = NavMesh.GetAreaFromName("Not Walkable");   // 3
var link = stairs.AddComponent<NavMeshLink>(); link.startPoint = ...; link.endPoint = ... + Vector3.up * 2.95f; link.bidirectional = true; link.UpdateLink();  // 4
```

Each ground floor is sampled on a 0.5 m grid at floor height; the reachable share of those NavMesh
samples from the street is the room's score (gate >= 0.9 [added]); a door passage check runs from 1
m outside to 1 m inside every opening. Islands = connected components of
`NavMesh.CalculateTriangulation()` inside the volume (vertices welded at 1 cm), each probed with
`CalculatePath` from the street and classified by the collider under it (Roof, Level_n > 0, ground).
Other surfaces whose volume overlaps are disabled for the gate and reported. Agent type 0 (Humanoid:
radius 0.5, height 2, climb 0.75, slope 45, voxel 0.167). **Result (run 21:05):** closed leaves
baked: 0/3 houses reachable, every door impassable; with the modifier: 3/3, every door passable,
floors 100 % reachable; 3 roof islands until the roofs were Not Walkable, then 0; 2 upper floors
unreachable until the stairs links, then both `PathComplete`; the village surface overlapped and was
disabled for the gate. **Traps observed:** (1) the village surface, baked before the kit town
existed, overlapped it; queries mixed both data sets and reported PathPartial into houses whose
doors were open (its stale terrain polygons ran under the new floors). (2) On the v0.1 kit the
closed doors "did not" cut the NavMesh: the path entered through the wall holes left by the replace
trap (P15), found by printing the path corners. (3) One target point per room lies: a single
interior point came back PathPartial while the door was open, because clutter had split the room;
sample the whole floor.

## P17. Gym for the character and its camera

```python
ut_world.gym_is_stale(P, metrics)     # True: never built, or the controller changed since the last build
y = ut_world.build_gym(P, {"radius": 0.4, "height": 1.8, "slope": 45, "step": 0.3, "jump": 2.5,
                           "cam_pivot": 1.6, "cam_shoulder": 0.5, "cam_boom": 3.5, "cam_pitch": 20, "cam_radius": 0.2})
```

34 lanes in `Assets/World/Scenes/World_Gym.unity` (ProBuilder, color legend, names with sizes):
doorways (widths 0.8 to 2.0 at 2.4 m; heights 2.1 to 3.0), ramps 10 to 60 degrees, steps 0.1 to 0.6
m, stairs (rise 0.2, tread 0.3), gaps 1 to 3.5 m. Per lane: NavMesh built with the character's
metrics (`NavMesh.GetSettingsByID(0)` with agentRadius, agentHeight, agentSlope, agentClimb, then
`NavMeshBuilder.BuildNavMeshData`), a `CharacterController` pushed up each ramp and step in the
editor (`Move` works in edit mode), a camera boom sphere-cast through each doorway at 5 lateral
offsets x 6 distances past the door, NavMeshLinks for gaps within the jump distance, and the stairs
height error with and without `buildHeightMesh`. **Result (gym run 20:39, default rig):** narrowest
passing door 1.0 m (0.8 m = 2 x radius fails); ramps pass to 40 degrees and fail at 45 in both the
NavMesh and the controller; steps pass to 0.3 m; gaps up to 2.5 m pass through jump links; stairs
height error 0.132 m mean (0.262 max) without the height mesh, 0.063 m (0.20) with it; camera boom
blocked at 100 % of samples for 0.8 and 1.0 m doors, 80 % at 1.4 x 2.4 m, 60 % at 1.4 x 2.7, 47 % at
1.4 x 3.0, 27 % at 2 x 3 m: no doorway lets a 3.5 m boom through untouched, so interiors need their
own camera (or accepted pull-in). The shorter rig is in the v0.2 result line.

## P18. Guidance: the coast, walking back, false peaks

```python
g = ut_world.audit_guidance(P, slope_limit_deg=45, poi_radius=150, max_empty_arc=300)
f = ut_world.fill_coast(P)            # audit -> add_coast_content(arcs) -> re-audit, until the gate passes
```

`Runtime/World/WorldGuide.cs` (pure C#, EditMode-tested): `Reachable` (flood fill from the spawn
with the slope limit), `Coast` (36 bearings, march in from the sea to the first land cell:
climbable, walks back, nearest POI; empty arcs with midpoints), `Peaks` (local maxima with
prominence from a widest-path search to the summit). The job adds landmark visibility from each
shore point at eye height. POIs: BO_ buildings, landmarks, kit houses, road ends, POI_ and LM_
objects (tour anchors excluded). `AddCoastContent` places placeholder cairns (`POI_Cove_n`, yellow
pole) 12 m inland at each midpoint. **Result (audit run 20:42, before any fill):** coast 2,829 m on
36 bearings, all climbable, 0 water-only pockets, 32 of 36 bearings with no POI within 150 m,
longest empty arc 2,512 m (one arc round the whole island except the road's beach), landmark visible
from 12/36 shore points, 17/17 POIs walk back, 3 false peaks (prominence 17.7, 11.6, 9.7 m). The
fill loop result is in the v0.2 result line. EditMode `WorldGuideTests` 2/2 on a synthetic island
(sea cliff sector not climbable, gentle shores walk back, a second POI splits the empty coast into 2
arcs, a 30 m hill found as a false peak with 8 to 25 m prominence).

## P19. Per-tile settings the Toolbox cannot batch, and the v0.2 terrain findings

```python
ut_world.set_terrain_settings(P, reflection_probe_usage="BlendProbesAndSkybox", bake_light_probes_for_trees=True,
    dering_light_probes_for_trees=True, preserve_tree_prototype_layers=True, min_detail_limit=0, max_complexity_limit=0,
    tree_motion_vectors="PerObjectMotion", holes_compression=True, ignore_quality_settings=False, scale_in_lightmap=0.5, reconnect=True)
ut_world.audit(P)
```

Also: `collider_enabled`, `scatter_mode`, `ray_tracing`, `grouping_id`, `auto_connect`,
`contribute_gi`, `draw_trees_and_foliage`, `draw_heightmap`; before and after of every property is
returned. `bake_light_probes_for_trees` also sets `MeshRenderer.receiveGI = LightProbes` on the tree
prefabs (the option does nothing otherwise, 6.3 Terrain Settings reference). Scale In Lightmap is
the serialized `m_ScaleInLightmap`. New findings: `world.detail_instanced_color` (Healthy and Dry
Color ignored by instanced details, no probe or lightmap lighting either),
`world.detail_instanced_unlit_gi`, `world.tree_probes_receive_gi`, `world.reflection_probes`,
`world.tree_lod_group_distances`. **Result (test_25):** see the v0.2 result line. The lighting
effect itself needs a bake [not run here: scenario-unity-rendering-lighting owns the GPU bake].

## P20. Pop captures at the detail, LOD and cull distances

```python
q = ut_world.capture_pops(P)          # WorldTerrain.CapturePops (graphics) + ut_review.compare per pair; OPEN q["sheet"]
```

A fixed eye-height camera faces the densest forest from a distance equal to each boundary (on land
first, else a swimmer's eye over the sea); each pair renders the boundary just beyond and just short
of the target (detail distance x1.1 and x0.9; `QualitySettings.lodBias` x1.15 and /1.15 for the tree
LOD switch and cull, distance = LOD size x bias / (2 tan(fov/2) x threshold)), fog off and fog on.
**Result (run 20:44):** lodBias 2, tree LOD size 9.35 m, thresholds 0.18 and 0.045: detail pop at 80
m changes 0.095 % of pixels (fog 0.091 %), tree LOD0 to LOD1 at 90 m 0.27 % (0.26 %), tree cull at
360 m seen from the sea 0.096 % (mean difference 0.00032 clear, 0.0002 with fog). Fog at density
0.0015 leaves 98.6 % visibility at 80 m: it hides almost none of these pops; they stay small because
the tufts and trees are small at those distances.

## P21. Stream at all? Scene report

```python
r = ut_world.scene_report(P, memory_budget_mb=512)     # WorldStreaming.SceneReport over the build list
```

Per scene: GameObjects, top components, renderers, unique meshes and materials, triangles,
set-dressing variety (unique rock, vegetation and prop meshes: "if you only need three rocks, don't
make a fourth", ZYnS3kKTcGg [00:24:27]), and an Editor estimate of asset memory
(`Profiler.GetRuntimeMemorySizeLong` over `EditorUtility.CollectDependencies`, shared assets once).
**Result (run 20:44):** core 9.69 MB (terrain data), village chunk 0.85 MB, kit chunk 0.06 MB, whole
world 11.31 MB against an example 512 MB budget [added]: this island fits resident; streaming its
two chunks saves under 1 MB (Alba's answer: keep it resident, use LOD and relevance). The Player
figure is P23.

## P22. Proxies for unloaded chunks

```python
ut_world.build_proxies(P, min_size=1.2)   # WorldStreaming.BuildProxies: merged stand-in per chunk in the core
ut_world.set_proxies(P, on=False)         # for before/after captures
```

Per chunk: renderers grouped by material, merged (`CombineMeshes`, UInt32 indices) into one mesh
asset with one submesh per material, props under 1.2 m skipped, placed under `Proxies` in the core;
`StreamedChunk.proxy` shows it while the chunk is unloaded (`WorldStreamer.Start`, `Load`,
`Unload`). **Result (run 20:44):** village 71 renderers to 1 (832 triangles, 1 submesh), kit town
162 renderers to 1 (2,952 of 2,988 triangles, 6 submeshes, 3 props skipped); PlayMode proxy test
pass (P10). The capture comparison is in the v0.2 result line.

## P23. Streaming measured in a development Player

```python
s = ut_world.stream_probe(P, priorities=("Low", "High"), snapshots=True)
s["verdict"]                           # probe_verdict: Integrate ms vs budget, hitches, memory back to baseline
```

`WorldStreaming.MakeStreamProbeScene` writes `World_StreamProbe.unity` (a `StreamProbe` component),
`ut_run.build(P, "macos", development=True, scenes=[probe, core, chunks])`, then the Player runs
headless (`-batchmode -logFile ... -streamProbeOut ...`): it loads the core, finds the
"Application.Integrate Assets in Background" marker by name (`ProfilerRecorderHandle.GetAvailable`),
and per priority loads each chunk by path with activation not held, recording per frame the frame
time and the marker's time, then unloads, sweeps and records "Total Used Memory", "Texture Memory",
"Mesh Memory"; with `snapshots=True` it writes Memory Profiler snapshots at the baseline and after
the last sweep (`MemoryProfiler.TakeSnapshot`; open both in Window > Analysis > Memory Profiler >
Compare). **Result (runs 20:54 to 20:58, macOS development Player, 327 MB build, 7.6 min first
build):** the first probe read 0 ms for every marker (PlayerLoop included) because
`new ProfilerRecorder(handle, 1)` does not start recording (`ProfilerRecorderOptions.Default` lacks
`StartImmediately`; `StartNew` starts); `probe_verdict` now returns "no-marker-data" when the marker
never sampled. Fixed run: Low priority, village chunk 370.7 ms over 22 frames, max Integrate 1.13 ms
per frame (budget 2), kit chunk 150.9 ms over 9 frames (0.10 ms); High priority, both chunks 34 ms
over 2 frames (0.49 and 0.10 ms); max frame 16.88 ms at a 60 fps cap, no hitch; "Total Used Memory"
184.6 MB baseline, 188.5 loaded, 186.9 after unload and sweep (1.2 % over baseline, inside the 5 %
tolerance [added]); Memory Profiler snapshots 22.2 and 22.4 MB written. In the final suite run
(21:13, warm file cache) the same village load took 34 ms over 2 frames at Low (max Integrate 0.50
ms) and 41 ms at High: load times swing with the cache, the per-frame Integrate figure is the stable
gate. With chunks this small neither priority hitches on this Mac; the device run decides.

## P24. Offline helpers: before/after statistics, generated-scene hygiene

```python
c = ut_world.compare_runs(before_csv, after_csv, frames=200)   # medians, p95, IQR, Mann-Whitney p per column
ut_world.mark_generated(repo, ["Assets/World/Scenes/World_Island.unity"])       # git update-index --skip-worktree
ut_world.mark_generated(repo, [...], on=False)                                   # before committing an intended regeneration
```

`compare_runs` takes the last 200 frames after a skip on each side (Alba's Profile Analyzer habit,
YOtDVv5-0A4 [00:17:00]) and calls a column changed when p < 0.01 and the median moved at least 1 %
[added]. The GUI twin is Window > Analysis > Profile Analyzer > Compare (package 1.4.0). **Result
(test_offline.py):** noise is not a change, a 1 ms shift is (p < 1e-6), identical columns give p =
1; skip-worktree hides the regenerated scene from `git status` and unmarking shows it again; a
folder that is not a repository is refused. Live use: `test_31` (v0.2 result line).

### v0.2 result line (final run)

Final run 2026-09-24 21:00 to 21:14, `test_live_world.py` 13/13 then `test_live_world_v2.py` 12/12,
`test_offline.py` 7/7, zero C# compile errors:

- P15: 30 of 30 replacements kept their placement; 0 stacked, 0 missing walls, 0 findings; house
  prefabs 52, 48, 62 nested instances; clutter 18 placed (6 door-zone and 9 room-splitting
  candidates rejected).
- P16: closed leaves 0/3 houses; modifier 3/3 with every floor 100 % reachable; roof islands 3 then
  0; 2 upper floors linked (`PathComplete`); the village surface overlapped and was set aside for
  the gate.
- P17: default rig as recorded above; shorter interior rig (boom 2 m, pitch 10): camera blocked at
  67 % (0.8 and 1.0 m doors), 30 % (1.4 x 2.4 m), 17 % (2 x 2.4 m and 2 x 3 m); still no door fully
  clear; `gym_is_stale` True after the rig change.
- P18: fill loop 2,512 m, then 1,127, 480 and 163 m in 3 rounds (7 placeholder coves); 19/19 POIs
  walk back; warnings left for the human: landmark seen from 12/36 coast points, 3 false peaks.
- P19: every setting read back as set (Scale In Lightmap 0.5, tree motion vectors PerObjectMotion,
  ray tracing on); 2 tree prefabs switched to Receive GI Light Probes; audit 0 errors, 0 warnings. A
  fresh island shows 2 `world.tree_probes_receive_gi` warnings: new terrains have Bake Light Probes
  For Trees on while plain MeshRenderer trees receive GI from lightmaps, so the default does
  nothing.
- P12 decisive: `treeDistance` 60 vs 700 m gave mean absolute difference 0.0 on all 8 bookmarks.
- P20: as recorded above (0.095 %, 0.27 %, 0.096 % of pixels; fog changes them by under 0.01 point).
- P21: world 13.1 MB (Editor estimate), fits the example 512 MB budget.
- P22: from the hilltop, the core without proxies differs from the full island on 1.10 % of pixels,
  with proxies on 0.009 %; aerial 0.096 % vs 0.003 %.
- P23: verdict pass (marker sampled, Low max Integrate 0.50 ms, memory back within tolerance).
- P24 live: the tour with trees and foliage off: median batches 1,154 to 62 (-94.6 %), triangles
  333,022 to 100,894 (-69.7 %), CPU frame 2.50 to 1.20 ms (-52 %), all p < 0.01 over 200 frames per
  side: trees and grass are most of this island's draw cost (Editor counts; the millisecond share
  needs the device).
