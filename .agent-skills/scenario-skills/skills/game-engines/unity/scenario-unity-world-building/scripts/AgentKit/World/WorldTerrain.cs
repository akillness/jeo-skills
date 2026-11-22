// scenario-unity-world-building v0.2 (2026-09-24). Terrain from code: the TerrainData route that replaces
// sculpting, painting and foliage brushes (GUI-only tools) for an agent.
//
// Job: ut_run.run_method(P, "AgentKit.World.WorldTerrain.BuildIsland", {...}) (no graphics needed)
//   1. new scene; TerrainData resolutions FIRST (heightmap 2^n+1, then size, alphamap, base map,
//      SetDetailResolution(res, 16)), because changing them later rescales or resamples content
//      (6.3 Terrain manual, Mesh/Texture Resolutions);
//   2. heights: fBm island (Lague octaves) -> droplet erosion (1025+ for erosion detail, manual) ->
//      authored inputs last (Alba levellers: village plateau; spline road corridor) -> SetHeights;
//   3. 4 TerrainLayers (sand, grass, rock, dirt; <= 4 keeps URP height-based blend in one pass) and
//      rule-based SetAlphamaps (slope, height, road mask) instead of brush mask filters;
//   4. opaque LOD trees (Alba: no alpha-tested impostors on tile-based mobile GPUs) placed on a
//      jittered grid with a forest mask, SetTreeInstances(snapToHeightmap: true);
//   5. GPU-instanced detail meshes with distinct noise seeds, InstanceCountMode, SetDetailLayer;
//   6. per-tile settings (pixel error, base map distance, detail and tree distance, grouping id);
//   7. a spline road mesh with distance-based U (Game Dev Guide), sea plane, light, camera.
// Returns resolutions, timings per stage, erosion stats, layer coverage, tree and detail counts.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world.py.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Unity.Mathematics;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Splines;
using Debug = UnityEngine.Debug;
using Object = UnityEngine.Object;

namespace AgentKit.World
{
    public static class WorldTerrain
    {
        public const string TerrainDir = WorldCommon.Root + "/Terrain";

        public static bool IsPow2Plus1(int n) => n >= 33 && ((n - 1) & (n - 2)) == 0;

        public static void BuildIsland()
        {
            AgentJob.Run(() =>
            {
                var sw = Stopwatch.StartNew();
                var stages = new Dictionary<string, object>();
                void Stage(string n) { stages[n] = Math.Round(sw.Elapsed.TotalSeconds, 2); }

                string scenePath = AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity");
                float size = AgentJob.Float("size", 1000f), height = AgentJob.Float("height", 150f);
                float sea = AgentJob.Float("sea_level", 10f), peak = AgentJob.Float("peak", 115f);
                int hres = AgentJob.Int("heightmap_res", 1025), ares = AgentJob.Int("alphamap_res", 1024);
                int bres = AgentJob.Int("basemap_res", 1024), dres = AgentJob.Int("detail_res", 1024);
                int dpp = AgentJob.Int("detail_per_patch", 16);
                int seed = AgentJob.Int("seed", 7);
                if (!IsPow2Plus1(hres)) throw new ArgumentException("heightmap_res must be 2^n + 1 (257, 513, 1025, 2049): " + hres);
                if (dpp != 16) AgentJob.Warn("detail_per_patch " + dpp + ": the 6.3 manual recommends 16 unless grass is sparse at a long Detail Distance");

                WorldCommon.EnsureFolder(Path.GetDirectoryName(scenePath));
                WorldCommon.EnsureFolder(TerrainDir);
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                // ---- 1. resolutions before any content -------------------------------------------
                var td = new TerrainData();
                td.heightmapResolution = hres;                 // first: the setter rescales size
                td.size = new Vector3(size, height, size);
                td.alphamapResolution = ares;
                td.baseMapResolution = bres;
                td.SetDetailResolution(dres, dpp);
                td.SetDetailScatterMode(DetailScatterMode.InstanceCountMode);
                // persist the TerrainData BEFORE writing layers: splat (alphamap) textures created on an
                // in-memory TerrainData are not saved with a later CreateAsset, and the terrain reloads
                // all first-layer (observed 2026-09-24: sand everywhere in a fresh editor)
                string tdPath = TerrainDir + "/Island_TerrainData.asset";
                if (AssetDatabase.LoadAssetAtPath<TerrainData>(tdPath) != null) AssetDatabase.DeleteAsset(tdPath);
                AssetDatabase.CreateAsset(td, tdPath);
                var order = new List<object> { "heightmapResolution", "size", "alphamapResolution", "baseMapResolution", "SetDetailResolution(res, 16)" };
                Stage("resolutions");

                // ---- 2. heights (metres) ---------------------------------------------------------
                var noise = NoiseSettings.Default;
                noise.seed = seed;
                noise.scale = AgentJob.Float("noise_scale", 300f);
                noise.octaves = AgentJob.Int("octaves", 6);
                noise.persistence = AgentJob.Float("persistence", 0.5f);
                noise.lacunarity = AgentJob.Float("lacunarity", 2f);
                var h = WorldNoise.Island(hres, size, noise, sea, peak, AgentJob.Float("coast_radius", 430f), AgentJob.Float("seabed", 2f));
                Stage("noise");
                float step = size / (hres - 1);
                int pitsBefore = WorldNoise.CountPits(h, sea + 1f), deepBefore = WorldNoise.CountPits(h, sea + 1f, 0.05f);
                ErosionReport er = default;
                int droplets = AgentJob.Int("erosion_droplets", 250000);
                if (droplets > 0)
                {
                    var es = ErosionSettings.Default;
                    es.seed = seed + 3; es.droplets = droplets;
                    er = WorldNoise.Erode(h, AgentJob.Float("erosion_height_scale", height), es);
                }
                int pitsAfter = WorldNoise.CountPits(h, sea + 1f), deepAfter = WorldNoise.CountPits(h, sea + 1f, 0.05f);
                Stage("erosion");

                // authored inputs after the simulation, so they stay exact (Alba features and roads)
                var plateauC = new Vector2(AgentJob.Float("plateau_x", 540f), AgentJob.Float("plateau_z", 520f));
                var plateauR = new Vector2(AgentJob.Float("plateau_rx", 90f), AgentJob.Float("plateau_rz", 75f));
                // plateau height from the land it sits in (median), never a guess that carves a crater
                float plateauH = AgentJob.Has("plateau_height") ? AgentJob.Float("plateau_height")
                    : Mathf.Max(sea + 8f, WorldNoise.MedianInEllipse(h, size, plateauC, plateauR));
                WorldNoise.Flatten(h, size, plateauC, plateauR, plateauH, 0.6f);

                // road: one spline per street (Game Dev Guide). Beach end found by marching from the
                // plateau toward the south-south-west coast until the ground reaches the beach band.
                var dir = new Vector2(-0.15f, -1f).normalized;
                var edge = plateauC + dir * plateauR.y * 0.6f;
                var beach2 = edge;
                for (float d = 0; d < size; d += 2f)
                {
                    var q = edge + dir * d;
                    if (q.x < 0 || q.y < 0 || q.x > size || q.y > size) break;
                    beach2 = q;
                    if (SampleBilinear(h, size, q.x, q.y) < sea + 2.2f) break;
                }
                string route = AgentJob.Str("road_route", "astar");
                Vector2[] knots;
                if (route == "astar")
                    knots = WorldNoise.RouteAStar(h, size, beach2, edge, 4f, 60f, AgentJob.Float("road_max_grade", 0.10f), sea + 1.5f).ToArray();
                else
                {
                    var perp = new Vector2(-dir.y, dir.x);
                    float[] lateral = { 0f, 18f, -22f, 12f, 0f };
                    knots = new Vector2[lateral.Length];
                    for (int i = 0; i < knots.Length; i++)
                        knots[i] = Vector2.Lerp(beach2, edge, (float)i / (lateral.Length - 1)) + perp * lateral[i];
                }
                var roadGo = new GameObject("Road_Main");
                var container = roadGo.AddComponent<SplineContainer>();
                var spline = container.Spline;
                spline.Clear();
                foreach (var k in knots) spline.Add(new float3(k.x, 0f, k.y), TangentMode.AutoSmooth);
                float roadLen = spline.CalculateLength(float4x4.identity);
                int samples = Mathf.Max(8, Mathf.CeilToInt(roadLen / 2f));
                var path = new Vector3[samples + 1];
                for (int i = 0; i <= samples; i++)
                {
                    var p = (Vector3)spline.EvaluatePosition((float)i / samples);
                    path[i] = new Vector3(p.x, SampleBilinear(h, size, p.x, p.z), p.z);
                }
                // profile: smoothed terrain, then a grade limiter (cut and fill) so the road never gets
                // steep; Alba routes roads with a slope-aware A* for the same reason [00:07:45]
                float gradeLimit = AgentJob.Float("road_max_grade", 0.10f);
                var ys = path.Select(p => p.y).ToArray();
                for (int pass = 0; pass < 8; pass++)
                    for (int i = 1; i < ys.Length - 1; i++) ys[i] = (ys[i - 1] + ys[i] * 2f + ys[i + 1]) * 0.25f;
                ys[0] = Mathf.Max(sea + 1.2f, ys[0]); ys[ys.Length - 1] = plateauH;
                for (int pass = 0; pass < 4; pass++)
                {
                    for (int i = 1; i < ys.Length; i++)
                    {
                        float dx = Vector2.Distance(new Vector2(path[i].x, path[i].z), new Vector2(path[i - 1].x, path[i - 1].z));
                        ys[i] = Mathf.Clamp(ys[i], ys[i - 1] - gradeLimit * dx, ys[i - 1] + gradeLimit * dx);
                    }
                    ys[ys.Length - 1] = plateauH;
                    for (int i = ys.Length - 2; i >= 0; i--)
                    {
                        float dx = Vector2.Distance(new Vector2(path[i].x, path[i].z), new Vector2(path[i + 1].x, path[i + 1].z));
                        ys[i] = Mathf.Clamp(ys[i], ys[i + 1] - gradeLimit * dx, ys[i + 1] + gradeLimit * dx);
                    }
                    ys[0] = Mathf.Max(sea + 1.2f, ys[0]);
                }
                float maxGrade = 0f, maxCut = 0f, maxFill = 0f;
                for (int i = 0; i < path.Length; i++)
                {
                    float ground = SampleBilinear(h, size, path[i].x, path[i].z);
                    maxCut = Mathf.Max(maxCut, ground - ys[i]); maxFill = Mathf.Max(maxFill, ys[i] - ground);
                    path[i].y = ys[i];
                    if (i > 0) maxGrade = Mathf.Max(maxGrade, Mathf.Abs(ys[i] - ys[i - 1]) / Mathf.Max(0.01f, Vector2.Distance(new Vector2(path[i].x, path[i].z), new Vector2(path[i - 1].x, path[i - 1].z))));
                }
                float roadHalf = AgentJob.Float("road_half_width", 3f);
                var roadMask = WorldNoise.FlattenCorridor(h, size, path, roadHalf + 0.5f, 5f);
                string heightHash = WorldNoise.Hash(h);

                // write normalized heights, [z, x]
                var hn = new float[hres, hres];
                float hmin = float.MaxValue, hmax = float.MinValue;
                for (int z = 0; z < hres; z++)
                for (int x = 0; x < hres; x++)
                {
                    float v = Mathf.Clamp(h[z, x], 0f, height);
                    hn[z, x] = v / height;
                    hmin = Mathf.Min(hmin, v); hmax = Mathf.Max(hmax, v);
                }
                td.SetHeights(0, 0, hn);
                Stage("heights");

                // ---- 3. layers and rule-based splat ------------------------------------------------
                var layers = new[]
                {
                    Layer("Sand", new Color(0.78f, 0.72f, 0.55f), new Color(0.9f, 0.85f, 0.68f), 6f, 1),
                    Layer("Grass", new Color(0.23f, 0.38f, 0.14f), new Color(0.40f, 0.52f, 0.20f), 8f, 2),
                    Layer("Rock", new Color(0.36f, 0.35f, 0.33f), new Color(0.58f, 0.56f, 0.52f), 12f, 3),
                    Layer("Dirt", new Color(0.36f, 0.27f, 0.18f), new Color(0.50f, 0.40f, 0.28f), 5f, 4),
                };
                td.terrainLayers = layers;
                var alpha = new float[ares, ares, layers.Length];
                var cover = new double[layers.Length];
                long landTexels = 0;
                var patchNoise = NoiseSettings.Default; patchNoise.seed = seed + 9; patchNoise.scale = 60f; patchNoise.octaves = 3;
                var patchOffs = WorldNoise.OctaveOffsets(patchNoise);
                for (int z = 0; z < ares; z++)
                for (int x = 0; x < ares; x++)
                {
                    float wx = (x + 0.5f) / ares * size, wz = (z + 0.5f) / ares * size;
                    float hh = SampleBilinear(h, size, wx, wz);
                    int hx = Mathf.Clamp(Mathf.RoundToInt(wx / step), 0, hres - 1), hz = Mathf.Clamp(Mathf.RoundToInt(wz / step), 0, hres - 1);
                    float slope = WorldNoise.SlopeDeg(h, hx, hz, step);
                    float road = roadMask[hz, hx];
                    float sand = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(sea + 2.0f, sea + 4.5f, hh));
                    float rock = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(28f, 40f, slope)) + Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(peak * 0.78f, peak * 0.95f, hh)) * 0.7f;
                    float dirt = Mathf.Max(road, Mathf.Clamp01((WorldNoise.Fbm(wx, wz, patchNoise, patchOffs) - 0.35f) * 2f) * 0.35f);
                    rock = Mathf.Clamp01(rock) * (1f - road);
                    sand *= (1f - road);
                    float grass = Mathf.Max(0f, 1f - sand - rock - dirt);
                    float sum = sand + grass + rock + dirt;
                    alpha[z, x, 0] = sand / sum; alpha[z, x, 1] = grass / sum; alpha[z, x, 2] = rock / sum; alpha[z, x, 3] = dirt / sum;
                    if (hh > sea) { landTexels++; for (int l = 0; l < 4; l++) cover[l] += alpha[z, x, l]; }
                }
                td.SetAlphamaps(0, 0, alpha);
                Stage("splat");

                // ---- 4. trees: opaque geometry with LODs -------------------------------------------
                var broadleaf = TreePrefab("Broadleaf", false);
                var conifer = TreePrefab("Conifer", true);
                td.treePrototypes = new[] { new TreePrototype { prefab = broadleaf }, new TreePrototype { prefab = conifer } };
                td.RefreshPrototypes();
                var trees = new List<TreeInstance>();
                float cell = AgentJob.Float("tree_cell", 11f);                 // 1 tree per cell at full density
                var forest = NoiseSettings.Default; forest.seed = seed + 21; forest.scale = 140f; forest.octaves = 4;
                var forestOffs = WorldNoise.OctaveOffsets(forest);
                var rng = new System.Random(seed + 5);
                float forestArea = 0f;
                for (float cz = cell * 0.5f; cz < size; cz += cell)
                for (float cx = cell * 0.5f; cx < size; cx += cell)
                {
                    float wx = cx + ((float)rng.NextDouble() - 0.5f) * cell * 0.9f;
                    float wz = cz + ((float)rng.NextDouble() - 0.5f) * cell * 0.9f;
                    float hh = SampleBilinear(h, size, wx, wz);
                    if (hh < sea + 4f || hh > peak * 0.92f) continue;
                    int hx = Mathf.Clamp(Mathf.RoundToInt(wx / step), 0, hres - 1), hz = Mathf.Clamp(Mathf.RoundToInt(wz / step), 0, hres - 1);
                    if (WorldNoise.SlopeDeg(h, hx, hz, step) > 30f) continue;
                    if (roadMask[hz, hx] > 0.01f) continue;
                    float pdx = (wx - plateauC.x) / (plateauR.x + 25f), pdz = (wz - plateauC.y) / (plateauR.y + 25f);
                    if (pdx * pdx + pdz * pdz < 1f) continue;                  // village clearing
                    float f = WorldNoise.Fbm(wx, wz, forest, forestOffs);
                    if (f < 0.02f) continue;                                    // forest mask: clusters, not spray
                    forestArea += cell * cell;
                    bool high = hh > sea + (peak - sea) * 0.45f;
                    int proto = high ? (rng.NextDouble() < 0.8 ? 1 : 0) : (rng.NextDouble() < 0.2 ? 1 : 0);
                    float hs = 0.8f + (float)rng.NextDouble() * 0.45f;
                    trees.Add(new TreeInstance
                    {
                        position = new Vector3(wx / size, hh / height, wz / size),
                        prototypeIndex = proto,
                        heightScale = hs,
                        widthScale = hs * (0.85f + (float)rng.NextDouble() * 0.3f),    // Lock Width to Height off, within limits
                        rotation = (float)(rng.NextDouble() * Math.PI * 2),
                        color = Color.Lerp(Color.white, new Color(0.85f, 0.9f, 0.8f), (float)rng.NextDouble()),
                        lightmapColor = Color.white,
                    });
                }
                td.SetTreeInstances(trees.ToArray(), true);
                Stage("trees");

                // ---- 5. details: instanced meshes, distinct seeds ---------------------------------
                var grassProto = DetailPrefab("GrassTuft", new Color(0.33f, 0.5f, 0.18f), 0.45f, 0.5f);
                var flowerProto = DetailPrefab("FlowerTuft", new Color(0.85f, 0.75f, 0.25f), 0.3f, 0.3f);
                td.detailPrototypes = new[]
                {
                    new DetailPrototype { usePrototypeMesh = true, prototype = grassProto, useInstancing = true, renderMode = DetailRenderMode.VertexLit,
                        minWidth = 0.8f, maxWidth = 1.4f, minHeight = 0.7f, maxHeight = 1.3f, noiseSeed = seed * 31 + 1, noiseSpread = 0.3f,
                        alignToGround = 0.6f, positionJitter = 0.8f, holeEdgePadding = 0f },
                    new DetailPrototype { usePrototypeMesh = true, prototype = flowerProto, useInstancing = true, renderMode = DetailRenderMode.VertexLit,
                        minWidth = 0.8f, maxWidth = 1.2f, minHeight = 0.8f, maxHeight = 1.2f, noiseSeed = seed * 31 + 2, noiseSpread = 0.5f,
                        alignToGround = 0.6f, positionJitter = 0.8f, holeEdgePadding = 0f },
                };
                var protoErrors = new List<object>();
                foreach (var dp in td.detailPrototypes) if (!dp.Validate(out var msg)) protoErrors.Add(msg);
                var grassLayer = new int[dres, dres];
                var flowerLayer = new int[dres, dres];
                long grassCount = 0, flowerCount = 0;
                var dn = NoiseSettings.Default; dn.seed = seed + 33; dn.scale = 25f; dn.octaves = 2;
                var dnOffs = WorldNoise.OctaveOffsets(dn);
                for (int z = 0; z < dres; z++)
                for (int x = 0; x < dres; x++)
                {
                    float wx = (x + 0.5f) / dres * size, wz = (z + 0.5f) / dres * size;
                    int ax = Mathf.Clamp((int)((float)x / dres * ares), 0, ares - 1), az = Mathf.Clamp((int)((float)z / dres * ares), 0, ares - 1);
                    if (alpha[az, ax, 1] < 0.6f) continue;                       // grass layer only
                    int hx = Mathf.Clamp(Mathf.RoundToInt(wx / step), 0, hres - 1), hz = Mathf.Clamp(Mathf.RoundToInt(wz / step), 0, hres - 1);
                    if (roadMask[hz, hx] > 0f || WorldNoise.SlopeDeg(h, hx, hz, step) > 25f) continue;
                    float pdx = (wx - plateauC.x) / plateauR.x, pdz = (wz - plateauC.y) / plateauR.y;
                    if (pdx * pdx + pdz * pdz < 1f) continue;                  // no grass through building floors
                    float n = WorldNoise.Fbm(wx, wz, dn, dnOffs);
                    int g = n > 0.25f ? 3 : n > 0.0f ? 2 : n > -0.2f ? 1 : 0;
                    grassLayer[z, x] = g; grassCount += g;
                    if (n > 0.45f) { flowerLayer[z, x] = 1; flowerCount++; }
                }
                td.SetDetailLayer(0, 0, 0, grassLayer);
                td.SetDetailLayer(0, 0, 1, flowerLayer);
                Stage("details");

                // ---- 6. assets, terrain object, per-tile settings ---------------------------------
                EditorUtility.SetDirty(td);
                AssetDatabase.SaveAssets();
                var terrainGo = Terrain.CreateTerrainGameObject(td);
                terrainGo.name = "Terrain_Island";
                var terrain = terrainGo.GetComponent<Terrain>();
                terrain.materialTemplate = TerrainMaterial(layers.Length);
                terrain.heightmapPixelError = AgentJob.Float("pixel_error", 5f);
                terrain.basemapDistance = AgentJob.Float("basemap_distance", 400f);
                terrain.drawInstanced = true;
                terrain.detailObjectDistance = AgentJob.Float("detail_distance", 80f);
                terrain.detailObjectDensity = 1f;
                terrain.treeDistance = AgentJob.Float("tree_distance", 700f);
                terrain.treeBillboardDistance = 150f;       // ignored by LOD Group trees and SpeedTree (their LOD Group rules)
                terrain.treeCrossFadeLength = 10f;
                terrain.treeMaximumFullLODCount = 50;
                terrain.groupingID = 1;
                terrain.allowAutoConnect = true;
                terrain.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox; // open air (caves: BlendProbes)
                terrain.shadowCastingMode = ShadowCastingMode.On;
                GameObjectUtility.SetStaticEditorFlags(terrainGo, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);

                // road mesh on the flattened corridor (distance-based U, V across)
                roadGo.transform.position = Vector3.zero;
                var roadMesh = RoadMesh(path, roadHalf, 0.06f);
                roadMesh = WorldCommon.SaveMesh(roadMesh, TerrainDir + "/Road_Main_Mesh.asset");
                roadGo.AddComponent<MeshFilter>().sharedMesh = roadMesh;
                roadGo.AddComponent<MeshRenderer>().sharedMaterial = WorldCommon.LitMaterial(TerrainDir + "/Materials/M_Road.mat", new Color(0.42f, 0.34f, 0.25f),
                    WorldCommon.NoiseTexture(TerrainDir + "/Textures/T_Road.png", new Color(0.35f, 0.28f, 0.2f), new Color(0.5f, 0.42f, 0.32f), 8f, 12), 0.1f);

                // sea, sun, sky, camera
                var seaGo = GameObject.CreatePrimitive(PrimitiveType.Plane);
                seaGo.name = "Sea";
                Object.DestroyImmediate(seaGo.GetComponent<Collider>());
                seaGo.transform.position = new Vector3(size * 0.5f, sea, size * 0.5f);
                seaGo.transform.localScale = new Vector3(size * 2f, 1f, size * 2f);       // 20 km of water: the edge stays past the far plane
                seaGo.GetComponent<MeshRenderer>().sharedMaterial = WorldCommon.LitMaterial(TerrainDir + "/Materials/M_Sea.mat", new Color(0.12f, 0.33f, 0.45f), null, 0.85f);
                var sun = new GameObject("Sun", typeof(Light)).GetComponent<Light>();
                sun.type = LightType.Directional;
                sun.intensity = 1.3f;
                sun.color = new Color(1f, 0.95f, 0.86f);
                sun.shadows = LightShadows.Soft;
                sun.transform.rotation = Quaternion.Euler(38f, -40f, 0f);
                RenderSettings.sun = sun;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.55f, 0.64f, 0.78f);
                RenderSettings.ambientEquatorColor = new Color(0.44f, 0.47f, 0.45f);
                RenderSettings.ambientGroundColor = new Color(0.24f, 0.22f, 0.19f);
                var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
                camGo.tag = "MainCamera";
                var cam = camGo.GetComponent<Camera>();
                cam.farClipPlane = 3000f; cam.nearClipPlane = 0.2f; cam.fieldOfView = 60f;
                camGo.AddComponent<UniversalAdditionalCameraData>();
                var beach = path[0];
                camGo.transform.position = new Vector3(beach.x, beach.y + 1.7f, beach.z - 8f);
                camGo.transform.rotation = Quaternion.LookRotation(new Vector3(plateauC.x, plateauH + 8f, plateauC.y) - camGo.transform.position);

                // heightmap preview PNG for review
                string png = Path.Combine(AgentJob.OutDir("previews"), "heightmap.png");
                WriteHeightPng(hn, png, 512, hmin / height, hmax / height);
                if (!EditorSceneManager.SaveScene(scene, scenePath)) throw new InvalidOperationException("SaveScene failed: " + scenePath);
                AssetDatabase.SaveAssets();
                Stage("saved");

                var check = new TerrainData[] { td };
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "terrain_data", tdPath },
                    { "order", order },
                    { "size", td.size }, { "heightmap_res", td.heightmapResolution }, { "heightmap_pow2_plus_1", IsPow2Plus1(td.heightmapResolution) },
                    { "metres_per_height_sample", Math.Round(step, 3) },
                    { "alphamap_res", td.alphamapResolution }, { "basemap_res", td.baseMapResolution },
                    { "detail_res", td.detailResolution }, { "detail_per_patch", td.detailResolutionPerPatch }, { "detail_scatter_mode", td.detailScatterMode.ToString() },
                    { "height_range_m", new List<object> { Math.Round(hmin, 2), Math.Round(hmax, 2) } },
                    { "erosion", new Dictionary<string, object> { { "droplets", er.droplets }, { "seconds", Math.Round(er.seconds, 2) }, { "max_change_m", Math.Round(er.maxChangeMetres, 3) }, { "pits_before", pitsBefore }, { "pits_after", pitsAfter }, { "pits_5cm_before", deepBefore }, { "pits_5cm_after", deepAfter } } },
                    { "height_hash", heightHash },
                    { "layers", layers.Select(l => l.name).ToList() },
                    { "layer_coverage", Enumerable.Range(0, layers.Length).ToDictionary(i => layers[i].name, i => (object)Math.Round(cover[i] / Math.Max(1.0, landTexels), 4)) },
                    { "land_fraction", Math.Round(landTexels / ((double)ares * ares), 4) },
                    { "trees", trees.Count }, { "tree_prototypes", td.treePrototypes.Select(p => p.prefab.name).ToList() },
                    { "trees_per_1000m2_in_forest", forestArea > 0 ? Math.Round(trees.Count / forestArea * 1000.0, 2) : 0 },
                    { "detail_instances", new Dictionary<string, object> { { "grass", grassCount }, { "flower", flowerCount } } },
                    { "detail_proto_errors", protoErrors },
                    { "detail_seeds", td.detailPrototypes.Select(d => (object)d.noiseSeed).ToList() },
                    { "road", new Dictionary<string, object> { { "length_m", Math.Round(roadLen, 1) }, { "max_grade", Math.Round(maxGrade, 3) }, { "grade_limit", gradeLimit }, { "route", route }, { "max_cut_m", Math.Round(maxCut, 2) }, { "max_fill_m", Math.Round(maxFill, 2) }, { "knots", knots.Length }, { "beach_end", WorldCommon.V(path[0]) }, { "plateau_end", WorldCommon.V(path[path.Length - 1]) } } },
                    { "plateau", new Dictionary<string, object> { { "centre", new List<object> { plateauC.x, plateauC.y } }, { "height", plateauH } } },
                    { "terrain_settings", new Dictionary<string, object> { { "pixel_error", terrain.heightmapPixelError }, { "basemap_distance", terrain.basemapDistance }, { "draw_instanced", terrain.drawInstanced }, { "detail_distance", terrain.detailObjectDistance }, { "tree_distance", terrain.treeDistance }, { "grouping_id", terrain.groupingID } } },
                    { "heightmap_png", png },
                    { "stages_s", stages },
                };
            });
        }

        // ------------------------------------------------------------------ helpers
        public static float SampleBilinear(float[,] h, float size, float wx, float wz)
        {
            int res = h.GetLength(0);
            float fx = Mathf.Clamp(wx / size * (res - 1), 0, res - 1.001f), fz = Mathf.Clamp(wz / size * (res - 1), 0, res - 1.001f);
            int x = (int)fx, z = (int)fz;
            float tx = fx - x, tz = fz - z;
            return Mathf.Lerp(Mathf.Lerp(h[z, x], h[z, x + 1], tx), Mathf.Lerp(h[z + 1, x], h[z + 1, x + 1], tx), tz);
        }

        static TerrainLayer Layer(string name, Color a, Color b, float tile, int seed)
        {
            string path = TerrainDir + "/Layers/TL_" + name + ".terrainlayer";
            WorldCommon.EnsureFolder(TerrainDir + "/Layers");
            var tex = WorldCommon.NoiseTexture(TerrainDir + "/Textures/T_" + name + ".png", a, b, 6f + seed, seed);
            var layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(path);
            if (layer == null) { layer = new TerrainLayer(); AssetDatabase.CreateAsset(layer, path); }
            layer.diffuseTexture = tex;
            layer.tileSize = new Vector2(tile, tile);   // metres: tuned to the material's real scale
            layer.smoothness = name == "Rock" ? 0.15f : 0.05f;
            layer.metallic = 0f;
            EditorUtility.SetDirty(layer);
            return layer;
        }

        static Material TerrainMaterial(int layerCount)
        {
            string path = TerrainDir + "/Materials/M_TerrainLit.mat";
            WorldCommon.EnsureFolder(TerrainDir + "/Materials");
            var shader = Shader.Find("Universal Render Pipeline/Terrain/Lit");
            if (shader == null) throw new InvalidOperationException("URP Terrain/Lit shader not found");
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null) { mat = new Material(shader); AssetDatabase.CreateAsset(mat, path); }
            // height-based blend supports 4 layers in one splat map; more layers must turn it off
            bool heightBlend = layerCount <= 4;
            mat.SetFloat("_EnableHeightBlend", heightBlend ? 1f : 0f);
            if (heightBlend) mat.EnableKeyword("_TERRAIN_BLEND_HEIGHT"); else mat.DisableKeyword("_TERRAIN_BLEND_HEIGHT");
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        /// <summary>Opaque, pure-geometry tree with two LODs (Alba [00:21:20]: no alpha cutout, real LOD
        /// chain). LOD0 trunk + canopy, LOD1 a low-poly canopy, culled below 4.5 % screen height.</summary>
        public static GameObject TreePrefab(string kind, bool conifer)
        {
            string dir = WorldCommon.Root + "/Foliage";
            string path = dir + "/PF_Tree_" + kind + ".prefab";
            WorldCommon.EnsureFolder(dir);
            var bark = WorldCommon.LitMaterial(dir + "/M_Bark.mat", new Color(0.30f, 0.22f, 0.15f), null, 0.1f);
            var leaves = WorldCommon.LitMaterial(dir + "/M_Leaves_" + kind + ".mat", conifer ? new Color(0.12f, 0.26f, 0.13f) : new Color(0.22f, 0.40f, 0.14f), null, 0.15f);
            var lod0 = WorldCommon.SaveMesh(TreeMesh(conifer, true), dir + "/Mesh_Tree_" + kind + "_LOD0.asset");
            var lod1 = WorldCommon.SaveMesh(TreeMesh(conifer, false), dir + "/Mesh_Tree_" + kind + "_LOD1.asset");
            var root = new GameObject("PF_Tree_" + kind);
            var r0 = MeshChild(root, "LOD0", lod0, new[] { bark, leaves });
            var r1 = MeshChild(root, "LOD1", lod1, new[] { bark, leaves });
            var lg = root.AddComponent<LODGroup>();
            // cull at 4.5 % screen height: measured compromise on the 1 km island (0.03 -> 2820 max batches,
            // 0.08 -> 1091 but bald hills in the captures, 0.045 -> 1813 with forests intact)
            lg.SetLODs(new[] { new LOD(0.18f, new Renderer[] { r0 }), new LOD(AgentJob.Float("tree_cull", 0.045f), new Renderer[] { r1 }) });
            lg.RecalculateBounds();
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab;
        }

        static Renderer MeshChild(GameObject root, string name, Mesh mesh, Material[] mats)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = mats;
            return r;
        }

        /// <summary>Trunk (submesh 0) plus canopy (submesh 1). Built from arithmetic, not from assets,
        /// so the kit has no external dependency. Heights in metres (tree about 9 to 11 m).</summary>
        static Mesh TreeMesh(bool conifer, bool detailed)
        {
            int seg = detailed ? 10 : 5;
            var v = new List<Vector3>(); var n = new List<Vector3>(); var trunk = new List<int>(); var canopy = new List<int>();
            // trunk: open cylinder r=0.25, h=3.5
            Ring(v, n, trunk, 0f, 3.5f, 0.28f, 0.2f, seg);
            if (conifer)
            {
                // two stacked cones
                Cone(v, n, canopy, 2.0f, 7.5f, 2.4f, seg);
                if (detailed) Cone(v, n, canopy, 5.5f, 10.5f, 1.6f, seg);
            }
            else
            {
                // lumpy sphere canopy: UV sphere with per-vertex radial noise (detailed) or an octahedron-ish ball
                Ball(v, n, canopy, new Vector3(0, 6.2f, 0), new Vector3(3.2f, 2.8f, 3.2f), detailed ? 10 : 4, detailed ? 14 : 6, detailed);
            }
            var m = new Mesh { name = "Tree" };
            m.SetVertices(v); m.SetNormals(n);
            m.subMeshCount = 2;
            m.SetTriangles(trunk, 0); m.SetTriangles(canopy, 1);
            m.RecalculateBounds();
            return m;
        }

        static void Ring(List<Vector3> v, List<Vector3> n, List<int> t, float y0, float y1, float r0, float r1, int seg)
        {
            int b = v.Count;
            for (int i = 0; i <= seg; i++)
            {
                float a = i * Mathf.PI * 2 / seg;
                var d = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                v.Add(d * r0 + Vector3.up * y0); n.Add(d);
                v.Add(d * r1 + Vector3.up * y1); n.Add(d);
            }
            for (int i = 0; i < seg; i++)
            {
                int k = b + i * 2;
                t.AddRange(new[] { k, k + 1, k + 2, k + 1, k + 3, k + 2 });
            }
        }

        static void Cone(List<Vector3> v, List<Vector3> n, List<int> t, float y0, float y1, float r, int seg)
        {
            int b = v.Count;
            float slope = r / (y1 - y0);
            for (int i = 0; i <= seg; i++)
            {
                float a = i * Mathf.PI * 2 / seg;
                var d = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                var nn = (d + Vector3.up * slope).normalized;
                v.Add(d * r + Vector3.up * y0); n.Add(nn);
                v.Add(Vector3.up * y1); n.Add(nn);
            }
            for (int i = 0; i < seg; i++) { int k = b + i * 2; t.AddRange(new[] { k, k + 1, k + 2 }); }
            // underside cap
            int c = v.Count; v.Add(Vector3.up * y0); n.Add(Vector3.down);
            for (int i = 0; i <= seg; i++) { float a = i * Mathf.PI * 2 / seg; v.Add(new Vector3(Mathf.Cos(a) * r, y0, Mathf.Sin(a) * r)); n.Add(Vector3.down); }
            for (int i = 0; i < seg; i++) t.AddRange(new[] { c, c + 1 + i, c + 2 + i });
        }

        static void Ball(List<Vector3> v, List<Vector3> n, List<int> t, Vector3 c, Vector3 r, int rings, int seg, bool lumpy)
        {
            int b = v.Count;
            for (int i = 0; i <= rings; i++)
            {
                float phi = Mathf.PI * i / rings;
                for (int j = 0; j <= seg; j++)
                {
                    float th = Mathf.PI * 2 * j / seg;
                    var d = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    float k = lumpy ? 1f + 0.12f * Mathf.Sin(th * 3f + phi * 2f) * Mathf.Sin(phi * 3f) : 1f;
                    v.Add(c + Vector3.Scale(d, r) * k); n.Add(d);
                }
            }
            for (int i = 0; i < rings; i++)
            for (int j = 0; j < seg; j++)
            {
                int a0 = b + i * (seg + 1) + j, a1 = a0 + seg + 1;
                t.AddRange(new[] { a0, a0 + 1, a1, a0 + 1, a1 + 1, a1 });
            }
        }

        /// <summary>Crossed-quad tuft (three quads), two-sided opaque material: grass that needs no
        /// alpha test (mobile-safe), instanced by the terrain detail system.</summary>
        static GameObject DetailPrefab(string name, Color color, float h, float w)
        {
            string dir = WorldCommon.Root + "/Foliage";
            string path = dir + "/PF_" + name + ".prefab";
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            for (int q = 0; q < 3; q++)
            {
                float a = q * Mathf.PI / 3f;
                var d = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * (w * 0.5f);
                var nn = Vector3.Cross(d.normalized, Vector3.up);
                int b = v.Count;
                v.Add(-d); v.Add(d); v.Add(d * 0.3f + Vector3.up * h); v.Add(-d * 0.3f + Vector3.up * h);
                for (int i = 0; i < 4; i++) n.Add((nn + Vector3.up * 0.8f).normalized);
                t.AddRange(new[] { b, b + 2, b + 1, b, b + 3, b + 2 });
            }
            var m = new Mesh { name = name };
            m.SetVertices(v); m.SetNormals(n); m.SetTriangles(t, 0); m.RecalculateBounds();
            var mesh = WorldCommon.SaveMesh(m, dir + "/Mesh_" + name + ".asset");
            var go = new GameObject("PF_" + name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = WorldCommon.LitMaterial(dir + "/M_" + name + ".mat", color, null, 0.1f, twoSided: true);
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            return prefab;
        }

        /// <summary>Road strip along a polyline: V 0..1 across, U = cumulative distance / 4 m, so the
        /// texture never squashes with the sample count (Game Dev Guide, ZiHH_BvjoGk [00:14:16]).</summary>
        public static Mesh RoadMesh(Vector3[] path, float halfWidth, float lift)
        {
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var t = new List<int>();
            float u = 0f;
            for (int i = 0; i < path.Length; i++)
            {
                var fwd = (path[Mathf.Min(i + 1, path.Length - 1)] - path[Mathf.Max(i - 1, 0)]); fwd.y = 0; fwd.Normalize();
                var right = Vector3.Cross(Vector3.up, fwd).normalized;
                if (i > 0) u += Vector3.Distance(path[i], path[i - 1]) / 4f;
                var p = path[i] + Vector3.up * lift;
                v.Add(p - right * halfWidth); uv.Add(new Vector2(u, 0));
                v.Add(p + right * halfWidth); uv.Add(new Vector2(u, 1));
                if (i > 0) { int k = v.Count - 4; t.AddRange(new[] { k, k + 1, k + 2, k + 1, k + 3, k + 2 }); }
            }
            var m = new Mesh { name = "Road" };
            if (v.Count > 65535) m.indexFormat = IndexFormat.UInt32;
            m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }

        /// <summary>Grayscale preview, stretched to [lo, hi] for display (not the stored range).</summary>
        static void WriteHeightPng(float[,] hn, string path, int outRes, float lo, float hi)
        {
            int res = hn.GetLength(0);
            var tex = new Texture2D(outRes, outRes, TextureFormat.RGB24, false);
            var px = new Color[outRes * outRes];
            for (int y = 0; y < outRes; y++)
            for (int x = 0; x < outRes; x++)
            {
                float v = Mathf.InverseLerp(lo, hi, hn[y * (res - 1) / (outRes - 1), x * (res - 1) / (outRes - 1)]);
                px[y * outRes + x] = new Color(v, v, v);
            }
            tex.SetPixels(px); tex.Apply();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
        }

        // ------------------------------------------------------------------ RAW heightmaps
        /// <summary>Export the heights of the scene's terrain as a 16-bit little-endian RAW file
        /// (the format Terrain Settings > Import Raw, World Machine, Gaea and Houdini exchange).
        /// args: scene, path (project-relative or absolute). Row 0 = z 0 (no vertical flip).</summary>
        public static void ExportRaw()
        {
            AgentJob.Run(() =>
            {
                WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var td = WorldCommon.FindTerrain().terrainData;
                int r = td.heightmapResolution;
                var h = td.GetHeights(0, 0, r, r);
                var bytes = new byte[r * r * 2];
                for (int z = 0; z < r; z++)
                for (int x = 0; x < r; x++)
                {
                    ushort v = (ushort)Mathf.RoundToInt(Mathf.Clamp01(h[z, x]) * 65535f);
                    int i = (z * r + x) * 2;
                    bytes[i] = (byte)(v & 0xFF); bytes[i + 1] = (byte)(v >> 8);      // little-endian
                }
                var path = AgentJob.ResolvePath(AgentJob.Str("path", "Library/AgentKit/island_1025.raw"));
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllBytes(path, bytes);
                return new Dictionary<string, object> { { "path", path }, { "resolution", r }, { "bytes", bytes.Length }, { "size", td.size }, { "hash", HashNorm(h, td.size.y) } };
            });
        }

        /// <summary>Import a 16-bit RAW heightmap into a NEW TerrainData (resolution from the file
        /// size, which must be (2^n+1)^2 x 2 bytes) and a new scene. args: path, size, height,
        /// flip (vertical flip), big_endian, scene. The import route for DCC heightmaps.</summary>
        public static void ImportRaw()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.ResolvePath(AgentJob.Str("path", "Library/AgentKit/island_1025.raw"));
                var bytes = File.ReadAllBytes(path);
                int r = Mathf.RoundToInt(Mathf.Sqrt(bytes.Length / 2f));
                if (r * r * 2 != bytes.Length || !IsPow2Plus1(r)) throw new ArgumentException("RAW must be 16-bit (2^n+1)^2 samples: " + bytes.Length + " bytes");
                bool flip = AgentJob.Bool("flip", false), big = AgentJob.Bool("big_endian", false);
                var h = new float[r, r];
                for (int z = 0; z < r; z++)
                for (int x = 0; x < r; x++)
                {
                    int i = (z * r + x) * 2;
                    int v = big ? (bytes[i] << 8) | bytes[i + 1] : bytes[i] | (bytes[i + 1] << 8);
                    h[flip ? r - 1 - z : z, x] = v / 65535f;
                }
                var scenePath = AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_RawImport.unity");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var td = new TerrainData();
                td.heightmapResolution = r;                                             // resolution first, then size
                float size = AgentJob.Float("size", 1000f), height = AgentJob.Float("height", 150f);
                td.size = new Vector3(size, height, size);
                string tdPath = TerrainDir + "/RawImport_TerrainData.asset";
                if (AssetDatabase.LoadAssetAtPath<TerrainData>(tdPath) != null) AssetDatabase.DeleteAsset(tdPath);
                AssetDatabase.CreateAsset(td, tdPath);
                td.SetHeights(0, 0, h);
                EditorUtility.SetDirty(td);
                var go = Terrain.CreateTerrainGameObject(td);
                go.name = "Terrain_RawImport";
                go.GetComponent<Terrain>().materialTemplate = AssetDatabase.LoadAssetAtPath<Material>(TerrainDir + "/Materials/M_TerrainLit.mat");
                EditorSceneManager.SaveScene(scene, scenePath);
                AssetDatabase.SaveAssets();
                var back = td.GetHeights(0, 0, r, r);
                return new Dictionary<string, object> { { "scene", scenePath }, { "resolution", r }, { "size", td.size }, { "hash", HashNorm(back, td.size.y) }, { "flip", flip }, { "big_endian", big } };
            });
        }

        static string HashNorm(float[,] h01, float height)
        {
            var m = new float[h01.GetLength(0), h01.GetLength(1)];
            for (int z = 0; z < m.GetLength(0); z++) for (int x = 0; x < m.GetLength(1); x++) m[z, x] = Mathf.Round(h01[z, x] * 65535f) / 65535f * height;
            return WorldNoise.Hash(m);
        }

        // ------------------------------------------------------------------ per-tile settings
        /// <summary>Set per-tile Terrain settings on every tile of a scene: the scripted Terrain Toolbox,
        /// including the settings the Toolbox cannot batch (6.3 Terrain Settings reference: Reconnect,
        /// Ray Tracing, Minimum Detail Limit, Maximum Complexity Limit, Detail Density Scale, Tree Motion
        /// Vectors, Detail Scatter Mode, Compress Holes Texture, Lighting, Lightmapping, Ignore Quality
        /// Settings, Terrain Collider). args (all optional): scene, tree_distance, detail_distance,
        /// pixel_error, basemap_distance, detail_density, cast_shadows, draw_trees_and_foliage,
        /// draw_heightmap, reflection_probe_usage (BlendProbes | BlendProbesAndSkybox | Off | Simple),
        /// bake_light_probes_for_trees (also sets the tree prefabs' Receive GI to Light Probes, without
        /// which the option does nothing), dering_light_probes_for_trees, preserve_tree_prototype_layers,
        /// collider_enabled, scatter_mode (InstanceCountMode | CoverageMode), ignore_quality_settings,
        /// min_detail_limit, max_complexity_limit, tree_motion_vectors (a TreeMotionVectorModeOverride name),
        /// holes_compression, ray_tracing, grouping_id, auto_connect, reconnect, contribute_gi,
        /// scale_in_lightmap. Returns before/after of every property so the change is on record.</summary>
        public static void SetTerrainSettings()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var rows = new List<object>();
                var prefabsFixed = new List<object>();
                foreach (var t in Object.FindObjectsByType<Terrain>(FindObjectsSortMode.None))
                {
                    var before = Snapshot(t);
                    Undo.RecordObject(t, "Agent: terrain settings");
                    var td = t.terrainData;
                    if (AgentJob.Has("tree_distance")) t.treeDistance = AgentJob.Float("tree_distance");
                    if (AgentJob.Has("detail_distance")) t.detailObjectDistance = AgentJob.Float("detail_distance");
                    if (AgentJob.Has("pixel_error")) t.heightmapPixelError = AgentJob.Float("pixel_error");
                    if (AgentJob.Has("basemap_distance")) t.basemapDistance = AgentJob.Float("basemap_distance");
                    if (AgentJob.Has("detail_density")) t.detailObjectDensity = AgentJob.Float("detail_density");
                    if (AgentJob.Has("cast_shadows")) t.shadowCastingMode = AgentJob.Bool("cast_shadows") ? ShadowCastingMode.On : ShadowCastingMode.Off;
                    if (AgentJob.Has("draw_trees_and_foliage")) t.drawTreesAndFoliage = AgentJob.Bool("draw_trees_and_foliage");
                    if (AgentJob.Has("draw_heightmap")) t.drawHeightmap = AgentJob.Bool("draw_heightmap");
                    if (AgentJob.Has("reflection_probe_usage")) t.reflectionProbeUsage = (ReflectionProbeUsage)Enum.Parse(typeof(ReflectionProbeUsage), AgentJob.Str("reflection_probe_usage"), true);
                    if (AgentJob.Has("bake_light_probes_for_trees"))
                    {
                        t.bakeLightProbesForTrees = AgentJob.Bool("bake_light_probes_for_trees");
                        if (t.bakeLightProbesForTrees) prefabsFixed.AddRange(TreeReceiveGIProbes(td));
                    }
                    if (AgentJob.Has("dering_light_probes_for_trees")) t.deringLightProbesForTrees = AgentJob.Bool("dering_light_probes_for_trees");
                    if (AgentJob.Has("preserve_tree_prototype_layers")) t.preserveTreePrototypeLayers = AgentJob.Bool("preserve_tree_prototype_layers");
                    if (AgentJob.Has("ignore_quality_settings")) t.ignoreQualitySettings = AgentJob.Bool("ignore_quality_settings");
                    if (AgentJob.Has("min_detail_limit")) t.heightmapMinimumLODSimplification = AgentJob.Int("min_detail_limit");
                    if (AgentJob.Has("max_complexity_limit")) t.heightmapMaximumLOD = AgentJob.Int("max_complexity_limit");
                    if (AgentJob.Has("tree_motion_vectors")) t.treeMotionVectorModeOverride = (TreeMotionVectorModeOverride)Enum.Parse(typeof(TreeMotionVectorModeOverride), AgentJob.Str("tree_motion_vectors"), true);
                    if (AgentJob.Has("ray_tracing")) t.enableHeightmapRayTracing = AgentJob.Bool("ray_tracing");
                    if (AgentJob.Has("grouping_id")) t.groupingID = AgentJob.Int("grouping_id");
                    if (AgentJob.Has("auto_connect")) t.allowAutoConnect = AgentJob.Bool("auto_connect");
                    if (AgentJob.Has("reconnect") && AgentJob.Bool("reconnect")) Terrain.SetConnectivityDirty();
                    if (AgentJob.Has("scatter_mode")) td.SetDetailScatterMode((DetailScatterMode)Enum.Parse(typeof(DetailScatterMode), AgentJob.Str("scatter_mode"), true));
                    if (AgentJob.Has("holes_compression")) td.enableHolesTextureCompression = AgentJob.Bool("holes_compression");
                    if (AgentJob.Has("collider_enabled")) { var tc = t.GetComponent<TerrainCollider>(); if (tc) { Undo.RecordObject(tc, "Agent: terrain collider"); tc.enabled = AgentJob.Bool("collider_enabled"); } }
                    if (AgentJob.Has("contribute_gi"))
                    {
                        var f = GameObjectUtility.GetStaticEditorFlags(t.gameObject);
                        f = AgentJob.Bool("contribute_gi") ? f | StaticEditorFlags.ContributeGI : f & ~StaticEditorFlags.ContributeGI;
                        GameObjectUtility.SetStaticEditorFlags(t.gameObject, f);
                    }
                    if (AgentJob.Has("scale_in_lightmap"))
                    {
                        var so = new SerializedObject(t);
                        var sp = so.FindProperty("m_ScaleInLightmap");
                        if (sp != null) { sp.floatValue = AgentJob.Float("scale_in_lightmap"); so.ApplyModifiedPropertiesWithoutUndo(); }
                        else AgentJob.Warn("m_ScaleInLightmap not found on Terrain: set Scale In Lightmap in Terrain Settings > Lightmapping");
                    }
                    EditorUtility.SetDirty(t); EditorUtility.SetDirty(td);
                    rows.Add(new Dictionary<string, object> { { "terrain", t.name }, { "before", before }, { "after", Snapshot(t) } });
                }
                WorldCommon.Save(scene);
                return new Dictionary<string, object> { { "scene", scene.path }, { "terrains", rows }, { "tree_prefabs_receive_gi_set_to_light_probes", prefabsFixed } };
            });
        }

        static Dictionary<string, object> Snapshot(Terrain t)
        {
            var td = t.terrainData; var tc = t.GetComponent<TerrainCollider>();
            var so = new SerializedObject(t); var sil = so.FindProperty("m_ScaleInLightmap");
            return new Dictionary<string, object>
            {
                { "tree_distance", t.treeDistance }, { "detail_distance", t.detailObjectDistance }, { "pixel_error", t.heightmapPixelError },
                { "basemap_distance", t.basemapDistance }, { "detail_density", t.detailObjectDensity }, { "cast_shadows", t.shadowCastingMode.ToString() },
                { "draw_trees_and_foliage", t.drawTreesAndFoliage }, { "draw_heightmap", t.drawHeightmap }, { "reflection_probe_usage", t.reflectionProbeUsage.ToString() },
                { "bake_light_probes_for_trees", t.bakeLightProbesForTrees }, { "dering_light_probes_for_trees", t.deringLightProbesForTrees },
                { "preserve_tree_prototype_layers", t.preserveTreePrototypeLayers }, { "ignore_quality_settings", t.ignoreQualitySettings },
                { "min_detail_limit", t.heightmapMinimumLODSimplification }, { "max_complexity_limit", t.heightmapMaximumLOD },
                { "tree_motion_vectors", t.treeMotionVectorModeOverride.ToString() }, { "ray_tracing", t.enableHeightmapRayTracing },
                { "grouping_id", t.groupingID }, { "auto_connect", t.allowAutoConnect }, { "scatter_mode", td.detailScatterMode.ToString() },
                { "holes_compression", td.enableHolesTextureCompression }, { "collider_enabled", tc != null && tc.enabled },
                { "contribute_gi", (GameObjectUtility.GetStaticEditorFlags(t.gameObject) & StaticEditorFlags.ContributeGI) != 0 },
                { "scale_in_lightmap", sil != null ? (object)sil.floatValue : null },
            };
        }

        /// <summary>Bake Light Probes For Trees does nothing unless the tree prototype's renderers receive
        /// GI from Light Probes (6.3 Terrain Settings reference): set it on the prefabs.</summary>
        static List<object> TreeReceiveGIProbes(TerrainData td)
        {
            var done = new List<object>();
            foreach (var tp in td.treePrototypes)
            {
                if (tp.prefab == null) continue;
                var path = AssetDatabase.GetAssetPath(tp.prefab);
                var root = PrefabUtility.LoadPrefabContents(path);
                int changed = 0;
                foreach (var r in root.GetComponentsInChildren<MeshRenderer>(true))
                    if (r.receiveGI != ReceiveGI.LightProbes) { r.receiveGI = ReceiveGI.LightProbes; changed++; }
                if (changed > 0) PrefabUtility.SaveAsPrefabAsset(root, path);
                PrefabUtility.UnloadPrefabContents(root);
                done.Add(new Dictionary<string, object> { { "prefab", path }, { "renderers_changed", changed } });
            }
            td.RefreshPrototypes();
            return done;
        }

        /// <summary>Retune the LOD Group of every tree prototype prefab (LoadPrefabContents, SetLODs,
        /// SaveAsPrefabAsset, RefreshPrototypes). For LOD Group trees this is the distance lever:
        /// Terrain.treeDistance did not change batches or triangles here (observed 2026-09-24), the
        /// same rule the manual states for SpeedTree. args: scene, lod0 (screen height of the LOD0 to
        /// LOD1 switch), cull (screen height where the tree disappears).</summary>
        public static void SetTreeLods()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                float lod0 = AgentJob.Float("lod0", 0.18f), cull = AgentJob.Float("cull", 0.045f);
                var done = new List<object>();
                foreach (var t in Object.FindObjectsByType<Terrain>(FindObjectsSortMode.None))
                {
                    foreach (var tp in t.terrainData.treePrototypes)
                    {
                        var path = AssetDatabase.GetAssetPath(tp.prefab);
                        var root = PrefabUtility.LoadPrefabContents(path);
                        var lg = root.GetComponent<LODGroup>();
                        if (lg == null) { PrefabUtility.UnloadPrefabContents(root); continue; }
                        var lods = lg.GetLODs();
                        var before = lods.Select(l => (object)Math.Round(l.screenRelativeTransitionHeight, 3)).ToList();
                        if (lods.Length >= 2) { lods[0].screenRelativeTransitionHeight = lod0; lods[lods.Length - 1].screenRelativeTransitionHeight = cull; }
                        lg.SetLODs(lods);
                        PrefabUtility.SaveAsPrefabAsset(root, path);
                        PrefabUtility.UnloadPrefabContents(root);
                        done.Add(new Dictionary<string, object> { { "prefab", path }, { "before", before }, { "after", new List<object> { lod0, cull } } });
                    }
                    t.terrainData.RefreshPrototypes();
                    t.Flush();
                }
                WorldCommon.Save(scene);
                return new Dictionary<string, object> { { "trees", done } };
            });
        }

        // ------------------------------------------------------------------ audit
        /// <summary>Terrain audit in the core findings format: heightmap 2^n+1 (1025+ with erosion),
        /// detail patch 16, instancing, distinct detail seeds, tree LOD Groups, SpeedTree distance trap,
        /// alpha-clipped foliage on mobile, layer count vs height blend, alphamap weights, grouping.
        /// args: scene, mobile (bool), erosion (bool).</summary>
        public static void AuditTerrain()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) WorldCommon.OpenScene(scenePath);
                bool mobile = AgentJob.Bool("mobile", false);
                var f = new AgentAudit.Findings();
                var terrains = Object.FindObjectsByType<Terrain>(FindObjectsSortMode.None);
                if (terrains.Length == 0) f.Add("error", "world.no_terrain", scenePath, "no Terrain in the scene", "run BuildIsland");
                var groups = new HashSet<int>();
                var coverage = new Dictionary<string, object>();
                int treeCount = 0;
                foreach (var t in terrains)
                {
                    var td = t.terrainData; var p = t.name;
                    groups.Add(t.groupingID);
                    treeCount += td.treeInstanceCount;
                    if (!IsPow2Plus1(td.heightmapResolution))
                        f.Add("error", "world.heightmap_res", p, "heightmap resolution " + td.heightmapResolution + " is not 2^n + 1", "use 257, 513, 1025 or 2049 before sculpting");
                    else if (AgentJob.Bool("erosion", false) && td.heightmapResolution < 1025)
                        f.Add("warn", "world.erosion_res", p, "erosion detail wants heightmap 1025 or more (6.3 manual)", "raise the resolution before sculpting");
                    if (td.detailResolutionPerPatch != 16)
                        f.Add("warn", "world.detail_patch", p, "Detail Resolution Per Patch " + td.detailResolutionPerPatch + " (recommended 16)", "keep 16 unless grass is sparse at a long Detail Distance");
                    if (!t.drawInstanced) f.Add("warn", "world.draw_instanced", p, "Draw Instanced is off", "terrain.drawInstanced = true");
                    var seeds = new HashSet<int>();
                    foreach (var d in td.detailPrototypes)
                    {
                        string dn = d.prototype ? d.prototype.name : d.prototypeTexture ? d.prototypeTexture.name : "?";
                        if (d.usePrototypeMesh && !d.useInstancing) f.Add("warn", "world.detail_instancing", p + "/" + dn, "detail mesh without GPU instancing", "DetailPrototype.useInstancing = true (the recommended mode)");
                        if (!seeds.Add(d.noiseSeed)) f.Add("error", "world.detail_seed", p + "/" + dn, "two detail prototypes share noise seed " + d.noiseSeed + ": identical placement", "give each prototype its own noiseSeed");
                        if (!d.Validate(out var msg)) f.Add("error", "world.detail_invalid", p + "/" + dn, msg, "fix the prototype");
                        if (d.usePrototypeMesh && d.useInstancing && d.healthyColor != d.dryColor)
                            f.Add("info", "world.detail_instanced_color", p + "/" + dn, "Healthy and Dry Color are ignored for GPU-instanced detail meshes, which also get no light probe or lightmap lighting", "put colour variation in the detail shader (noise by world position); judge instanced grass after the bake in a capture");
                    }
                    bool lightmapped = (GameObjectUtility.GetStaticEditorFlags(t.gameObject) & StaticEditorFlags.ContributeGI) != 0;
                    if (lightmapped && td.detailPrototypes.Any(d => d.usePrototypeMesh && d.useInstancing))
                        f.Add("info", "world.detail_instanced_unlit_gi", p, "terrain contributes GI but its instanced details get no lightmap or per-instance probe lighting", "expect grass brighter or darker than the baked ground: compare a capture after the bake, tint in the shader");
                    if (t.bakeLightProbesForTrees)
                        foreach (var tp in td.treePrototypes.Where(x => x.prefab))
                            if (tp.prefab.GetComponentsInChildren<MeshRenderer>(true).Any(r => r.receiveGI != ReceiveGI.LightProbes))
                                f.Add("warn", "world.tree_probes_receive_gi", p + "/" + tp.prefab.name, "Bake Light Probes For Trees is on but the tree renderers do not receive GI from Light Probes: the option does nothing", "MeshRenderer.receiveGI = LightProbes on the prefab (SetTerrainSettings bake_light_probes_for_trees does it)");
                    f.Add("info", "world.reflection_probes", p, "Reflection Probes: " + t.reflectionProbeUsage + (t.bakeLightProbesForTrees ? ", tree light probes baked" + (t.deringLightProbesForTrees ? " with ringing removal" : " (ringing removal off)") : ""), "Blend Probes for caves and overhangs, Blend Probes And Skybox in open air; Remove Light Probe Ringing trades contrast for no light leaking onto dark sides");
                    if (td.treePrototypes.Any(x => x.prefab && x.prefab.GetComponent<LODGroup>() != null))
                        f.Add("info", "world.tree_lod_group_distances", p, "tree prototypes with LOD Groups: Tree Distance " + t.treeDistance + " m and Billboard Start do not cull them (observed: 700 vs 60 m gave identical captures)", "tune the prefab LOD Group (SetTreeLods) and check captures at the cull distance (CapturePops)");
                    foreach (var tp in td.treePrototypes)
                    {
                        if (tp.prefab == null) { f.Add("error", "world.tree_missing", p, "tree prototype without prefab", ""); continue; }
                        var src = AssetDatabase.GetAssetPath(tp.prefab);
                        bool speedTree = src.EndsWith(".spm") || src.EndsWith(".st") || src.EndsWith(".st9") || tp.prefab.GetComponentsInChildren<Renderer>().Any(r => r.sharedMaterials.Any(m => m && m.shader && m.shader.name.Contains("SpeedTree")));
                        var lg = tp.prefab.GetComponent<LODGroup>();
                        if (lg == null && tp.prefab.GetComponent<MeshRenderer>() != null)
                            f.Add("warn", "world.tree_no_lod", p + "/" + tp.prefab.name, "tree without LOD Group", "add LODs (InstaLOD, DCC, or generated) before scattering thousands");
                        if (speedTree)
                            f.Add("info", "world.speedtree_distances", p + "/" + tp.prefab.name, "SpeedTree ignores Tree Distance, Billboard Start, Fade Length and Max Mesh Trees", "tune its LOD Group; keep .spm/.st sources (fbx re-export loses wind)");
                        if (mobile)
                            foreach (var r in tp.prefab.GetComponentsInChildren<Renderer>(true))
                            foreach (var m in r.sharedMaterials)
                                if (m && (m.IsKeywordEnabled("_ALPHATEST_ON") || m.renderQueue == (int)RenderQueue.AlphaTest || (m.HasProperty("_AlphaClip") && m.GetFloat("_AlphaClip") > 0.5f)))
                                    f.Add("error", "world.foliage_alpha_clip_mobile", AssetDatabase.GetAssetPath(m), "alpha-tested foliage on a mobile target: breaks hidden surface removal on tile-based GPUs (Alba: impostors were the top GPU cost, 7.12 ms of 32.5)", "opaque geometric foliage with LODs, or accept after a device capture");
                    }
                    int layers = td.terrainLayers.Length;
                    var mat = t.materialTemplate;
                    bool hb = mat && (mat.IsKeywordEnabled("_TERRAIN_BLEND_HEIGHT") || (mat.HasProperty("_EnableHeightBlend") && mat.GetFloat("_EnableHeightBlend") > 0.5f));
                    if (hb && layers > 4) f.Add("error", "world.height_blend_layers", p, layers + " layers with height-based blend (limit 4, one splat map)", "turn height blend off or keep 4 layers");
                    if (layers > 4) f.Add("info", "world.layers_passes", p, layers + " terrain layers: each extra group of 4 adds a splat pass", "keep 4 per tile where possible");
                    // alphamap weights must sum to 1 (sampled)
                    var am = td.GetAlphamaps(0, 0, td.alphamapWidth, td.alphamapHeight);
                    int bad = 0, samples = 0;
                    for (int z = 0; z < td.alphamapHeight; z += 17)
                    for (int x = 0; x < td.alphamapWidth; x += 17)
                    {
                        float s = 0; for (int l = 0; l < layers; l++) s += am[z, x, l];
                        samples++; if (Mathf.Abs(s - 1f) > 0.01f) bad++;
                    }
                    var cov = new double[layers];
                    for (int z = 0; z < td.alphamapHeight; z += 4)
                    for (int x = 0; x < td.alphamapWidth; x += 4)
                        for (int l = 0; l < layers; l++) cov[l] += am[z, x, l];
                    double tot = cov.Sum();
                    coverage[p] = Enumerable.Range(0, layers).ToDictionary(i => td.terrainLayers[i] ? td.terrainLayers[i].name : "layer" + i, i => (object)Math.Round(cov[i] / Math.Max(1e-9, tot), 4));
                    if (layers > 1 && cov[0] / Math.Max(1e-9, tot) > 0.999)
                        f.Add("error", "world.splat_lost", p, "splat is 100% first layer: alphamaps not persisted", "AssetDatabase.CreateAsset(terrainData) before SetAlphamaps, then SaveAssets");
                    if (bad > 0) f.Add("warn", "world.alphamap_sum", p, bad + " of " + samples + " sampled texels do not sum to 1", "normalize weights before SetAlphamaps");
                    if (t.terrainData.detailPrototypes.Length > 0 && t.detailObjectDistance > 150f)
                        f.Add("info", "world.detail_distance", p, "Detail Distance " + t.detailObjectDistance + " m", "check cost; pop-in hides with fog");
                }
                if (groups.Count > 1) f.Add("warn", "world.grouping", "scene", "tiles use " + groups.Count + " grouping IDs", "same Grouping ID + Auto Connect so neighbours stitch");
                return new Dictionary<string, object>
                {
                    { "terrains", terrains.Length }, { "trees", treeCount }, { "mobile", mobile }, { "layer_coverage_all_texels", coverage },
                    { "counts", f.Counts() }, { "findings", f.items },
                };
            });
        }

        // ------------------------------------------------------------------ popping
        /// <summary>Popping measured, not guessed (6.3 Terrain manual, "Needs a render": capture at eye
        /// height at the Detail Distance and Billboard Start boundaries; videos digest: pop-in hidden by fog
        /// or LOD). A fixed eye-height camera looks at the densest forest; for each boundary the job renders
        /// the frame with the boundary just beyond and just short of the target (detail distance x1.1 and
        /// x0.9; QualitySettings.lodBias x1.15 and /1.15 for the tree LOD switch and the tree cull), fog off
        /// and fog on. ut_review.compare of each pair = what pops when the camera crosses that distance.
        /// args: scene, width, height, fog_density (0.0015), eye (1.7). Needs graphics.</summary>
        public static void CapturePops()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var t = WorldCommon.FindTerrain();
                var td = t.terrainData;
                int w = AgentJob.Int("width", 960), h = AgentJob.Int("height", 540);
                float eye = AgentJob.Float("eye", 1.7f), fov = 60f;
                var outDir = AgentJob.OutDir("pops");
                var forest = WorldScenes.DensestTreeSpot(t);
                var target = WorldCommon.Ground(t, forest.x, forest.z) + Vector3.up * 5f;
                // tree LOD distances from the prefab LOD Group (size x mean instance height scale)
                var proto = td.treePrototypes.Select(p => p.prefab).FirstOrDefault(p => p && p.GetComponent<LODGroup>());
                var lg = proto ? proto.GetComponent<LODGroup>() : null;
                float hs = td.treeInstanceCount > 0 ? td.treeInstances.Average(i => i.heightScale) : 1f;
                float bias = QualitySettings.lodBias * t.treeLODBiasMultiplier;
                float Dist(float screenHeight) => lg ? lg.size * hs * bias / (2f * Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * screenHeight) : -1f;
                var lods = lg ? lg.GetLODs() : new LOD[0];
                var boundaries = new List<(string name, float dist)> { ("detail", t.detailObjectDistance) };
                if (lods.Length >= 2) boundaries.Add(("tree_lod0_to_lod1", Dist(lods[0].screenRelativeTransitionHeight)));
                if (lods.Length >= 1) boundaries.Add(("tree_cull", Dist(lods[lods.Length - 1].screenRelativeTransitionHeight)));
                var cam = new GameObject("PopCam", typeof(Camera)) { hideFlags = HideFlags.HideAndDontSave }.GetComponent<Camera>();
                cam.fieldOfView = fov; cam.nearClipPlane = 0.2f; cam.farClipPlane = 3000f;
                cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
                var rows = new List<object>();
                float detail0 = t.detailObjectDistance, bias0 = QualitySettings.lodBias; bool fog0 = RenderSettings.fog; float dens0 = RenderSettings.fogDensity;
                Physics.SyncTransforms();
                try
                {
                    foreach (var (name, dist) in boundaries)
                    {
                        if (dist <= 0f) continue;
                        // pick a bearing with open sight from eye height to the target: on land first, then a
                        // swimmer's or boat's eye over the sea (an island's far views are seen from the water too)
                        Vector3 pos = Vector3.zero; bool found = false; string from = null;
                        var seaGo = GameObject.Find("Sea");
                        float seaY = seaGo ? seaGo.transform.position.y : float.NegativeInfinity;
                        for (int pass = 0; pass < 2 && !found; pass++)
                        for (int b = 0; b < 32 && !found; b++)
                        {
                            float a = b * 11.25f * Mathf.Deg2Rad;
                            var p2 = new Vector3(target.x + Mathf.Sin(a) * dist, 0f, target.z + Mathf.Cos(a) * dist);
                            var local = p2 - t.transform.position;
                            bool onMap = local.x >= 0 && local.z >= 0 && local.x <= td.size.x && local.z <= td.size.z;
                            var g = onMap ? WorldCommon.Ground(t, p2.x, p2.z) : new Vector3(p2.x, seaY, p2.z);
                            bool overSea = g.y < seaY + 0.5f;
                            if (pass == 0 && (!onMap || overSea)) continue;
                            if (pass == 1 && !overSea) continue;
                            var e = (overSea ? new Vector3(p2.x, seaY, p2.z) : g) + Vector3.up * eye; var d = target - e;
                            if (Physics.Raycast(e, d.normalized, d.magnitude * 0.85f)) continue;
                            pos = e; found = true; from = overSea ? "sea" : "land";
                        }
                        if (!found) { rows.Add(new Dictionary<string, object> { { "boundary", name }, { "distance_m", Math.Round(dist, 1) }, { "error", "no open viewpoint at this distance" } }); continue; }
                        cam.transform.position = pos;
                        var look = target - pos; look.y = 0f;
                        cam.transform.rotation = Quaternion.LookRotation(look.normalized + Vector3.down * 0.02f);
                        var shots = new Dictionary<string, object>();
                        foreach (var fog in new[] { false, true })
                        {
                            RenderSettings.fog = fog; RenderSettings.fogDensity = AgentJob.Float("fog_density", 0.0015f);
                            foreach (var side in new[] { "near", "far" })
                            {
                                // "near": the boundary lies just beyond the target (it is drawn); "far": just short of it (it pops)
                                if (name == "detail") { t.detailObjectDistance = side == "near" ? dist * 1.1f : dist * 0.9f; QualitySettings.lodBias = bias0; }
                                else { t.detailObjectDistance = detail0; QualitySettings.lodBias = side == "near" ? bias0 * 1.15f : bias0 / 1.15f; }
                                var path = Path.Combine(outDir, $"pop_{name}_{(fog ? "fog" : "clear")}_{side}.png");
                                AgentCapture.RenderCamera(cam, w, h, path, 4);
                                shots[(fog ? "fog_" : "clear_") + side] = path;
                            }
                        }
                        rows.Add(new Dictionary<string, object> { { "boundary", name }, { "distance_m", Math.Round(dist, 1) }, { "camera", WorldCommon.V(pos) }, { "viewpoint", from }, { "target", WorldCommon.V(target) }, { "shots", shots } });
                    }
                }
                finally
                {
                    t.detailObjectDistance = detail0; QualitySettings.lodBias = bias0; RenderSettings.fog = fog0; RenderSettings.fogDensity = dens0;
                    Object.DestroyImmediate(cam.gameObject);
                }
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "lod_bias", bias0 }, { "tree_lod_bias_multiplier", t.treeLODBiasMultiplier }, { "tree_lod_size_m", lg ? Math.Round(lg.size * hs, 2) : 0 },
                    { "lod_thresholds", lods.Select(l => (object)Math.Round(l.screenRelativeTransitionHeight, 3)).ToList() }, { "boundaries", rows }, { "out_dir", outDir },
                };
            });
        }
    }
}
