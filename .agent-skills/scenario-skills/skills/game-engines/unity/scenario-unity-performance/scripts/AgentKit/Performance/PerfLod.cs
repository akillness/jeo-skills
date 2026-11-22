// scenario-unity-performance v0.1 (2026-09-24). Mesh LOD (Unity 6.2+) generation and read-back.
//
//   ut_run.run_method(P, "AgentKit.Performance.PerfLod.GenerateMeshLods",
//       {"models": ["Assets/Art/Rock.fbx"], "meshes": ["Assets/Gen/Dense.asset"], "limit": -1,
//        "min_triangles": 256, "threshold": null})
//
// - Imported models: ModelImporter.generateMeshLods = true (+ maximumMeshLod), SaveAndReimport.
// - Mesh assets (procedural, .asset): MeshLodUtility.GenerateMeshLods(mesh, limit); a negative
//   limit stops near 64 indices (6.3 API docs); the asset is saved.
// - Skipped: skinned meshes (LODs ignore skin weights and do not reduce skinning cost), meshes
//   under 256 triangles (the generator needs at least that; SpeedTutor A0b2MfHCCfU [00:02:34]),
//   assets under an LODGroup (Mesh LOD + LOD Group "not recommended", 6.3 Manual).
// - threshold sets QualitySettings.meshLodThreshold for the current quality level (higher favors
//   coarser LODs): tune it with captures along a camera path, not by number alone.
// Returns per mesh: lod count and triangles per level, plus a flag when LOD1 keeps more than 60%
// of LOD0 [added threshold]. Remember: static batching and GPU instancing always draw LOD0.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Performance
{
    public static class PerfLod
    {
        public static Dictionary<string, object> LodFacts(Mesh m)
        {
            var levels = new List<object>();
            for (int lod = 0; lod < Math.Max(1, m.lodCount); lod++)
            {
                long idx = 0;
                for (int sm = 0; sm < m.subMeshCount; sm++)
                {
                    if (m.lodCount > 1) idx += m.GetLod(sm, lod).indexCount;
                    else idx += (long)m.GetIndexCount(sm);
                }
                levels.Add(idx / 3);
            }
            var d = new Dictionary<string, object> { { "mesh", m.name }, { "lod_count", m.lodCount }, { "triangles_per_lod", levels } };
            if (levels.Count > 1 && Convert.ToInt64(levels[1]) > 0.6 * Convert.ToInt64(levels[0]))
                d["weak_simplification"] = true;
            return d;
        }

        public static void GenerateMeshLods()
        {
            AgentJob.Run(() =>
            {
                int limit = AgentJob.Int("limit", -1);
                int minTris = AgentJob.Int("min_triangles", 256);
                var results = new List<object>();
                var skipped = new List<object>();
                foreach (var o in AgentJob.List("models"))
                {
                    var path = o.ToString();
                    var imp = AssetImporter.GetAtPath(path) as ModelImporter;
                    if (imp == null) { skipped.Add(new Dictionary<string, object> { { "path", path }, { "reason", "not a model" } }); continue; }
                    imp.generateMeshLods = true;
                    if (limit >= 0) imp.maximumMeshLod = limit;
                    imp.SaveAndReimport();
                    foreach (var m in AssetDatabase.LoadAllAssetsAtPath(path).OfType<Mesh>())
                    {
                        var f = LodFacts(m); f["path"] = path; results.Add(f);
                    }
                }
                foreach (var o in AgentJob.List("meshes"))
                {
                    var path = o.ToString();
                    var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                    if (mesh == null) { skipped.Add(new Dictionary<string, object> { { "path", path }, { "reason", "no Mesh asset" } }); continue; }
                    long tris = 0;
                    for (int sm = 0; sm < mesh.subMeshCount; sm++) tris += (long)mesh.GetIndexCount(sm) / 3;
                    if (tris < minTris) { skipped.Add(new Dictionary<string, object> { { "path", path }, { "reason", "only " + tris + " triangles (< " + minTris + ")" } }); continue; }
                    if (mesh.blendShapeCount > 0 || mesh.bindposeCount > 0) { skipped.Add(new Dictionary<string, object> { { "path", path }, { "reason", "skinned or blend shapes: LOD ignores weights, skinning still deforms LOD0" } }); continue; }
                    MeshLodUtility.GenerateMeshLods(mesh, limit);
                    EditorUtility.SetDirty(mesh);
                    var f = LodFacts(mesh); f["path"] = path; results.Add(f);
                }
                AssetDatabase.SaveAssets();
                if (AgentJob.Has("threshold"))
                    QualitySettings.meshLodThreshold = AgentJob.Float("threshold", 1f);
                return new Dictionary<string, object>
                {
                    { "meshes", results }, { "skipped", skipped }, { "mesh_lod_threshold", QualitySettings.meshLodThreshold },
                    { "quality_level", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                };
            });
        }
    }
}
