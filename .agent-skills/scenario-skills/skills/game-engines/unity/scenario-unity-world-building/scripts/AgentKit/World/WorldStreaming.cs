// scenario-unity-world-building v0.2 (2026-09-24). Streaming decisions and evidence beyond the Editor.
//
// SceneReport: Alba's cheap analysis windows as one job (YOtDVv5-0A4 [00:28:42], frame [00:28:46]):
//   per scene GameObjects, components by type, renderers, unique meshes and materials, triangles,
//   set-dressing variety (unique rock, vegetation and prop meshes: Firewatch "if you only need three
//   rocks, don't make a fourth", ZYnS3kKTcGg [00:24:27]), and an Editor estimate of asset memory
//   (Profiler.GetRuntimeMemorySizeLong over the scene's dependencies, shared assets counted once).
//   It answers "stream at all?" first: Alba's island stayed resident with LOD and relevance systems
//   ([00:12:43]); stream only when the whole world does not fit the lowest device. The Player number
//   comes from StreamProbe ("Total Used Memory" with every chunk loaded).
// BuildProxies: a merged stand-in per chunk (one GameObject, one renderer, a submesh per material,
//   small props skipped) saved as a mesh asset and placed in the core scene; WorldStreamer shows it
//   while the chunk is unloaded, so the village seen across the island never pops (manual HLOD).
// SetProxies: proxies on or off in the saved core (before/after captures).
// MakeStreamProbeScene: the first scene of a development build that measures streaming in a Player
//   (Runtime/World/StreamProbe.cs); ut_world.stream_probe builds and runs it.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world_v2.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;
using Math = System.Math;

namespace AgentKit.World
{
    public static class WorldStreaming
    {
        public const string ProbeScene = WorldCommon.Root + "/Scenes/World_StreamProbe.unity";
        static readonly Regex Rock = new Regex("rock|stone|cliff|boulder", RegexOptions.IgnoreCase);
        static readonly Regex Veg = new Regex("tree|pine|oak|conifer|broadleaf|bush|grass|flower", RegexOptions.IgnoreCase);
        static readonly Regex Prop = new Regex("clutter|crate|bench|barrel|prop", RegexOptions.IgnoreCase);

        // ------------------------------------------------------------------ report
        public static void SceneReport()
        {
            AgentJob.Run(() =>
            {
                var paths = AgentJob.List("scenes").Select(o => o.ToString()).ToList();
                if (paths.Count == 0) paths = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToList();
                int top = AgentJob.Int("top", 12);
                var world = new Dictionary<int, long>();          // instance id -> bytes, shared assets once
                var rows = new List<object>();
                foreach (var path in paths)
                {
                    var s = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
                    var roots = s.GetRootGameObjects();
                    var all = roots.SelectMany(r => r.GetComponentsInChildren<Transform>(true)).ToList();
                    var comps = roots.SelectMany(r => r.GetComponentsInChildren<Component>(true)).Where(c => c != null).GroupBy(c => c.GetType().Name)
                        .OrderByDescending(g => g.Count()).Take(top).ToDictionary(g => g.Key, g => (object)g.Count());
                    var renderers = roots.SelectMany(r => r.GetComponentsInChildren<Renderer>(true)).ToList();
                    var meshes = roots.SelectMany(r => r.GetComponentsInChildren<MeshFilter>(true)).Where(f => f.sharedMesh).Select(f => f.sharedMesh).ToList();
                    long tris = 0; foreach (var m in meshes) for (int i = 0; i < m.subMeshCount; i++) tris += m.GetIndexCount(i) / 3;
                    var uniqueMeshes = meshes.Distinct().ToList();
                    var mats = renderers.SelectMany(r => r.sharedMaterials).Where(m => m).Distinct().ToList();
                    var terrains = roots.SelectMany(r => r.GetComponentsInChildren<Terrain>(true)).ToList();
                    // tree prototypes count as unique vegetation meshes too
                    var treeNames = terrains.SelectMany(t => t.terrainData.treePrototypes).Where(p => p.prefab).Select(p => p.prefab.name).Distinct().ToList();
                    var deps = EditorUtility.CollectDependencies(roots.Cast<Object>().ToArray())
                        .Where(o => o is Mesh || o is Texture || o is Material || o is TerrainData || o is AudioClip).Distinct().ToList();
                    long bytes = 0;
                    foreach (var d in deps) { long b = Profiler.GetRuntimeMemorySizeLong(d); bytes += b; world[d.GetInstanceID()] = b; }
                    foreach (var m in uniqueMeshes) if (!world.ContainsKey(m.GetInstanceID())) { long b = Profiler.GetRuntimeMemorySizeLong(m); world[m.GetInstanceID()] = b; bytes += b; }
                    rows.Add(new Dictionary<string, object>
                    {
                        { "scene", path }, { "game_objects", all.Count }, { "components_top", comps }, { "renderers", renderers.Count },
                        { "unique_meshes", uniqueMeshes.Count }, { "unique_materials", mats.Count }, { "shaders", mats.Select(m => m.shader ? m.shader.name : "none").Distinct().ToList() },
                        { "triangles", tris }, { "terrains", terrains.Count },
                        { "dressing_variety", new Dictionary<string, object> {
                            { "rock_meshes", uniqueMeshes.Count(m => Rock.IsMatch(m.name)) },
                            { "vegetation_meshes", uniqueMeshes.Count(m => Veg.IsMatch(m.name)) + treeNames.Count },
                            { "prop_meshes", uniqueMeshes.Count(m => Prop.IsMatch(m.name)) } } },
                        { "asset_mb_editor_estimate", Math.Round(bytes / 1048576.0, 2) },
                    });
                }
                double totalMb = world.Values.Sum() / 1048576.0;
                float budget = AgentJob.Float("memory_budget_mb", 0f);
                var res = new Dictionary<string, object>
                {
                    { "scenes", rows }, { "world_asset_mb_editor_estimate", Math.Round(totalMb, 2) },
                    { "note", "Editor sizes (readable CPU copies, editor-only data): an upper-bound estimate; the Player number is StreamProbe Total Used Memory" },
                };
                if (budget > 0f) { res["memory_budget_mb"] = budget; res["fits_resident"] = totalMb <= budget; }
                return res;
            });
        }

        // ------------------------------------------------------------------ proxies
        public static void BuildProxies()
        {
            AgentJob.Run(() =>
            {
                var core = EditorSceneManager.OpenScene(WorldScenes.Core, OpenSceneMode.Single);
                var streamer = Object.FindFirstObjectByType<WorldStreamer>();
                if (streamer == null) throw new InvalidOperationException("no WorldStreamer in the core: run SplitForStreaming");
                float minSize = AgentJob.Float("min_size", 1.2f);
                var proxies = core.GetRootGameObjects().FirstOrDefault(g => g.name == "Proxies") ?? new GameObject("Proxies");
                SceneManager.MoveGameObjectToScene(proxies, core);
                string dir = WorldCommon.EnsureFolder(WorldCommon.Root + "/Proxies");
                var rows = new List<object>();
                foreach (var c in streamer.chunks)
                {
                    var chunk = EditorSceneManager.OpenScene(c.scenePath, OpenSceneMode.Additive);
                    var rs = chunk.GetRootGameObjects().SelectMany(r => r.GetComponentsInChildren<MeshRenderer>(false)).Where(r => r.enabled).ToList();
                    long trisBefore = 0; int skipped = 0;
                    var byMat = new Dictionary<Material, List<CombineInstance>>();
                    foreach (var r in rs)
                    {
                        var mf = r.GetComponent<MeshFilter>();
                        if (mf == null || mf.sharedMesh == null) continue;
                        var m = mf.sharedMesh;
                        for (int i = 0; i < m.subMeshCount; i++) trisBefore += m.GetIndexCount(i) / 3;
                        if (r.bounds.size.magnitude < minSize) { skipped++; continue; }   // props vanish at proxy distance
                        var mats = r.sharedMaterials;
                        for (int i = 0; i < m.subMeshCount && i < mats.Length; i++)
                        {
                            if (!byMat.TryGetValue(mats[i], out var list)) byMat[mats[i]] = list = new List<CombineInstance>();
                            list.Add(new CombineInstance { mesh = m, subMeshIndex = i, transform = r.localToWorldMatrix });
                        }
                    }
                    var parts = new List<CombineInstance>(); var partMats = new List<Material>(); var temp = new List<Mesh>();
                    foreach (var kv in byMat)
                    {
                        var pm = new Mesh { indexFormat = IndexFormat.UInt32 };
                        pm.CombineMeshes(kv.Value.ToArray(), true, true, false);
                        parts.Add(new CombineInstance { mesh = pm, transform = Matrix4x4.identity }); partMats.Add(kv.Key); temp.Add(pm);
                    }
                    var name = "Proxy_" + Path.GetFileNameWithoutExtension(c.scenePath).Replace("World_Chunk_", "");
                    var merged = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                    merged.CombineMeshes(parts.ToArray(), false, false, false);
                    merged.RecalculateBounds();
                    foreach (var t in temp) Object.DestroyImmediate(t);
                    var asset = WorldCommon.SaveMesh(merged, dir + "/" + name + ".asset");
                    EditorSceneManager.CloseScene(chunk, true);
                    var old = proxies.transform.Find(name);
                    if (old) Object.DestroyImmediate(old.gameObject);
                    var go = new GameObject(name);
                    go.transform.SetParent(proxies.transform, false);
                    go.AddComponent<MeshFilter>().sharedMesh = asset;
                    var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterials = partMats.ToArray();
                    GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
                    c.proxy = go;
                    long trisAfter = 0; for (int i = 0; i < asset.subMeshCount; i++) trisAfter += asset.GetIndexCount(i) / 3;
                    rows.Add(new Dictionary<string, object> { { "chunk", c.scenePath }, { "proxy", name }, { "mesh", dir + "/" + name + ".asset" },
                        { "renderers_before", rs.Count }, { "renderers_after", 1 }, { "submeshes", asset.subMeshCount }, { "skipped_small", skipped },
                        { "triangles_before", trisBefore }, { "triangles_after", trisAfter }, { "vertices", asset.vertexCount } });
                }
                EditorUtility.SetDirty(streamer);
                WorldCommon.Save(core);
                return new Dictionary<string, object> { { "core", core.path }, { "proxies", rows } };
            });
        }

        public static void SetProxies()
        {
            AgentJob.Run(() =>
            {
                var core = EditorSceneManager.OpenScene(WorldScenes.Core, OpenSceneMode.Single);
                bool on = AgentJob.Bool("on", true);
                var streamer = Object.FindFirstObjectByType<WorldStreamer>();
                int n = 0;
                foreach (var c in streamer.chunks) if (c.proxy) { c.proxy.SetActive(on); n++; }
                WorldCommon.Save(core);
                return new Dictionary<string, object> { { "on", on }, { "proxies", n } };
            });
        }

        // ------------------------------------------------------------------ player probe scene
        public static void MakeStreamProbeScene()
        {
            AgentJob.Run(() =>
            {
                var s = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var go = new GameObject("StreamProbe");
                var p = go.AddComponent<StreamProbe>();
                p.corePath = WorldScenes.Core;
                var chunks = AgentJob.List("chunks").Select(o => o.ToString()).ToList();
                p.chunkPaths = chunks.Count > 0 ? chunks : new List<string> { WorldScenes.ChunkVillage, WorldScenes.ChunkKit };
                var pr = AgentJob.List("priorities").Select(o => o.ToString()).ToList();
                if (pr.Count > 0) p.priorities = pr;
                // a camera so the probe scene itself renders nothing expensive before the core loads
                new GameObject("ProbeCamera", typeof(Camera));
                if (!EditorSceneManager.SaveScene(s, ProbeScene)) throw new InvalidOperationException("save failed " + ProbeScene);
                var build = new List<object> { ProbeScene, WorldScenes.Core };
                build.AddRange(p.chunkPaths);
                return new Dictionary<string, object> { { "scene", ProbeScene }, { "build_scenes", build }, { "priorities", p.priorities } };
            });
        }
    }
}
