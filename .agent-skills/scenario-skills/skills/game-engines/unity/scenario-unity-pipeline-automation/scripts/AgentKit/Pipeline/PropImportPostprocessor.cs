// AgentKit.Pipeline v0.1 (scenario-unity-pipeline-automation, 2026-09-24). Import rules enforced at import
// time for everything under the rules root (default Assets/Art/Props): new files, reimports, a new
// machine and CI all get the same settings, with no manual fix-up.
//
// Expert rules applied here (sources in references/expert-notes.md):
// - Importer SETTINGS in OnPreprocess* (OnPostprocess* runs after the settings were used).
// - GetVersion() bumped on every behaviour change of this file, or the cache (and Unity
//   Accelerator) keeps serving stale imports (6.3 Manual, ScriptedImporters / AssetPostprocessor).
// - Every file the rules come from is declared BEFORE it is read (context.DependsOnSourceAsset):
//   editing the rules JSON reimports exactly the governed assets (observed live, 2026-09-24).
// - Deterministic: no clocks, no Dictionary order, no AssetDatabase writes, no asset creation here
//   (creating or moving assets inside import callbacks restarts the refresh).
// - Budget checks only WARN (context.LogImportWarning): an import callback cannot refuse a file;
//   the ImportDrop job and the content tests turn warnings into verdicts.
using System.IO;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace AgentKit.Pipeline
{
    public class PropImportPostprocessor : AssetPostprocessor
    {
        // Bump on EVERY change to the behaviour below (not needed for rules-JSON edits: declared dependency).
        const uint k_Version = 3;
        public override uint GetVersion() => k_Version;

        PipelineRules RulesFor(string path)
        {
            var rules = PipelineRules.Load();
            if (rules == null || !rules.Governs(path)) return null;
            context.DependsOnSourceAsset(PipelineRules.DefaultPath);   // declare before relying on it
            return rules;
        }

        void OnPreprocessTexture()
        {
            var r = RulesFor(assetPath);
            if (r == null) return;
            var ti = (TextureImporter)assetImporter;
            var role = r.RoleOfImported(assetPath);
            if (role == "Unknown")
                context.LogImportWarning("[Pipeline] " + assetPath + ": no role suffix (" + string.Join(", ", r.SuffixRoles.ConvertAll(k => k.Key)) + ")");
            ti.textureType = role == "Normal" ? TextureImporterType.NormalMap : TextureImporterType.Default;
            ti.sRGBTexture = role != "Normal" && !r.LinearRoles.Contains(role);
            ti.mipmapEnabled = true;
            ti.streamingMipmaps = true;
            ti.alphaIsTransparency = false;
            ti.maxTextureSize = r.TextureMaxSize;
            ti.textureCompression = TextureImporterCompression.Compressed;
            // Mobile size cap only; the FORMAT (ASTC block size) is the mobile skill's call.
            foreach (var platform in new[] { "Android", "iPhone" })
            {
                var s = ti.GetPlatformTextureSettings(platform);
                s.overridden = true;
                s.maxTextureSize = r.TextureMaxSizeMobile;
                s.format = TextureImporterFormat.Automatic;
                ti.SetPlatformTextureSettings(s);
            }
        }

        void OnPreprocessModel()
        {
            var r = RulesFor(assetPath);
            if (r == null) return;
            var mi = (ModelImporter)assetImporter;
            mi.useFileScale = true;
            mi.globalScale = 1f;
            mi.bakeAxisConversion = true;           // Blender's -90 X root rotation baked into the mesh
            mi.importCameras = false;
            mi.importLights = false;
            mi.importVisibility = false;
            mi.importBlendShapes = false;
            mi.importConstraints = false;
            mi.animationType = ModelImporterAnimationType.None;
            mi.importAnimation = false;
            mi.isReadable = false;                  // halves mesh memory; the job never reads vertices at runtime
            mi.meshCompression = ModelImporterMeshCompression.Off;
            mi.meshOptimizationFlags = MeshOptimizationFlags.Everything;
            mi.importNormals = ModelImporterNormals.Import;
            mi.importTangents = ModelImporterTangents.CalculateMikk;
            mi.addCollider = false;                 // the prefab carries a BoxCollider, not a MeshCollider
            mi.generateSecondaryUV = false;         // lightmapped statics: the world-building / lighting skill
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            mi.materialLocation = ModelImporterMaterialLocation.InPrefab;   // slots remapped to M_<Name> by BuildPrefabs
        }

        void OnPostprocessModel(GameObject root)
        {
            var r = RulesFor(assetPath);
            if (r == null) return;
            int verts = 0;
            var b = new Bounds();
            bool has = false;
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (mf.sharedMesh == null) continue;
                verts += mf.sharedMesh.vertexCount;
                var wb = TransformBounds(mf.transform.localToWorldMatrix, mf.sharedMesh.bounds);
                if (!has) { b = wb; has = true; } else b.Encapsulate(wb);
            }
            if (verts > r.VertexBudget)
                context.LogImportWarning("[Pipeline] " + root.name + ": " + verts + " vertices > budget " + r.VertexBudget);
            if (has)
            {
                float maxDim = Mathf.Max(b.size.x, b.size.y, b.size.z);
                if (maxDim > r.MaxSizeM)
                    context.LogImportWarning("[Pipeline] " + root.name + ": " + maxDim.ToString("F1") + " m tall/wide > " + r.MaxSizeM + " m: centimetre export?");
                else if (maxDim < r.MinSizeM)
                    context.LogImportWarning("[Pipeline] " + root.name + ": " + maxDim.ToString("F3") + " m < " + r.MinSizeM + " m: wrong unit?");
            }
        }

        public static Bounds TransformBounds(Matrix4x4 m, Bounds local)
        {
            var c = m.MultiplyPoint3x4(local.center);
            var e = local.extents;
            var x = m.MultiplyVector(new Vector3(e.x, 0, 0));
            var y = m.MultiplyVector(new Vector3(0, e.y, 0));
            var z = m.MultiplyVector(new Vector3(0, 0, e.z));
            var ext = new Vector3(Mathf.Abs(x.x) + Mathf.Abs(y.x) + Mathf.Abs(z.x),
                                  Mathf.Abs(x.y) + Mathf.Abs(y.y) + Mathf.Abs(z.y),
                                  Mathf.Abs(x.z) + Mathf.Abs(y.z) + Mathf.Abs(z.z));
            return new Bounds(c, ext * 2f);
        }
    }
}
