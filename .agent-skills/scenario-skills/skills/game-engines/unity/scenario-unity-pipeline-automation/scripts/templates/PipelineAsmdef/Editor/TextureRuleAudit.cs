// Template (scenario-unity-pipeline-automation v0.2, 2026-09-24): project-side pipeline code in its OWN Editor-only
// assembly, so a test assembly can reference it (doc-test-framework: a test assembly "can't reference the
// predefined Assembly-Csharp.dll"; the same holds for Assembly-CSharp-Editor). Installed by
// ut_pipeline.install_asmdef_template(P) into Assets/Pipeline/Editor/. Uses UnityEditor only: no AgentKit.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/test_live_checks.py asmdef.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;

namespace Game.Pipeline
{
    public static class TextureRuleAudit
    {
        /// <summary>Texture paths under a folder, ordinal order (stable test names on every machine).</summary>
        public static List<string> Textures(string folder) =>
            AssetDatabase.IsValidFolder(folder)
                ? AssetDatabase.FindAssets("t:Texture2D", new[] { folder }).Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p, StringComparer.Ordinal).ToList()
                : new List<string>();

        /// <summary>Null when the importer follows the rule, else the violation: normal maps (by suffix) are
        /// NormalMap, data maps (by suffix) linear, colour maps sRGB, max size within the budget, mipmaps on.</summary>
        public static string Check(string path, int maxSize, string[] normalSuffixes, string[] linearSuffixes)
        {
            if (!(AssetImporter.GetAtPath(path) is TextureImporter ti)) return "not a texture importer";
            var stem = System.IO.Path.GetFileNameWithoutExtension(path);
            bool Ends(string[] suffixes) => suffixes.Any(s => stem.EndsWith(s, StringComparison.OrdinalIgnoreCase));
            bool normal = Ends(normalSuffixes), linear = normal || Ends(linearSuffixes);
            if (normal && ti.textureType != TextureImporterType.NormalMap) return "normal map imported as " + ti.textureType;
            if (!normal && ti.sRGBTexture == linear) return "sRGB " + ti.sRGBTexture + " for a " + (linear ? "data" : "colour") + " map";
            if (ti.maxTextureSize > maxSize) return "maxTextureSize " + ti.maxTextureSize + " > " + maxSize;
            if (!ti.mipmapEnabled) return "mipmaps off";
            return null;
        }
    }
}
