// AgentKit.Pipeline v0.1 (scenario-unity-pipeline-automation, 2026-09-24). Content validation as Edit Mode tests:
// one parametric case per prefab, texture and model under the rules root (Warnecke and Fine, Unite
// 2019, wTiF2D0_vKA [00:24:28]: write a rule once, apply it to every asset). Category
// "PipelinePreBuild" = the build gate (PipelinePrebuildGate runs it synchronously before a player build).
//
// No asmdef on purpose: these compile into Assembly-CSharp-Editor next to the AgentKit, so they call
// the same rule code as the jobs. The Test Runner discovers NUnit tests there (observed on 6000.3.21f1:
// `-runTests -testPlatform EditMode` ran a [Test] from an Editor folder without asmdef). A test asmdef
// could not reference Assembly-CSharp-Editor.
//   ut_run.run_tests(P, "EditMode", categories="PipelinePreBuild")
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEngine;

namespace AgentKit.Pipeline.Tests
{
    [Category("PipelinePreBuild")]
    public class PipelineContentTests
    {
        static PipelineRules Rules => PipelineRules.Load() ?? new PipelineRules();

        static IEnumerable<TestCaseData> Assets(string filter, string prefix)
        {
            var rules = PipelineRules.Load();
            var paths = rules == null || !AssetDatabase.IsValidFolder(rules.Root)
                ? new List<string>()
                : AssetDatabase.FindAssets(filter, new[] { rules.Root }).Select(AssetDatabase.GUIDToAssetPath)
                    .Where(p => Path.GetFileName(p).StartsWith(prefix, StringComparison.Ordinal))
                    .OrderBy(p => p, StringComparer.Ordinal).ToList();
            if (paths.Count == 0) { yield return new TestCaseData("<none>").SetName(filter + "(<none>)"); yield break; }
            foreach (var p in paths) yield return new TestCaseData(p).SetName(Path.GetFileNameWithoutExtension(p));
        }

        public static IEnumerable<TestCaseData> Prefabs() => Assets("t:Prefab", "P_");
        public static IEnumerable<TestCaseData> Textures() => Assets("t:Texture2D", "T_");
        public static IEnumerable<TestCaseData> Models() => Assets("t:Model", "SM_");

        [TestCaseSource(nameof(Prefabs))]
        public void Prefab_is_valid(string path)
        {
            if (path == "<none>") Assert.Ignore("no prefabs under the rules root yet");
            var rules = Rules;
            var name = Path.GetFileNameWithoutExtension(path);
            Assert.That(rules.NamePattern.IsMatch(name.Substring(2)), name + ": name does not match " + rules.NamePattern);
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Assert.IsNotNull(go, path);
            Assert.AreEqual(PrefabAssetType.Variant, PrefabUtility.GetPrefabAssetType(go), name + ": expected a Prefab Variant of the model prefab");
            Assert.IsNotNull(go.GetComponent<BoxCollider>(), name + ": no BoxCollider on the root");
            var renderers = go.GetComponentsInChildren<Renderer>(true);
            Assert.That(renderers.Length, Is.GreaterThan(0), name + ": no renderer");
            foreach (var r in renderers)
                foreach (var m in r.sharedMaterials)
                {
                    Assert.IsNotNull(m, name + ": empty material slot on " + r.name);
                    Assert.AreEqual("Universal Render Pipeline/Lit", m.shader.name, name + ": " + m.name + " uses " + m.shader.name);
                    Assert.IsNotNull(m.GetTexture("_BaseMap"), name + ": " + m.name + " has no _BaseMap");
                    if (m.GetTexture("_BumpMap") != null) Assert.That(m.IsKeywordEnabled("_NORMALMAP"), name + ": normal map without _NORMALMAP keyword");
                }
            var c = ArtDropJobs.CheckModel(go, rules);
            Assert.IsNull(c.error, name + ": " + c.error);
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            Assert.IsNotNull(settings, "no Addressables settings");
            var e = settings.FindAssetEntry(AssetDatabase.AssetPathToGUID(path));
            Assert.IsNotNull(e, name + ": not Addressable");
            Assert.That(e.parentGroup.Name.StartsWith(rules.GroupPrefix + "_", StringComparison.Ordinal), name + ": in group " + e.parentGroup.Name);
            Assert.That(e.labels.Any(l => l.StartsWith(rules.CategoryLabelPrefix, StringComparison.Ordinal)), name + ": no " + rules.CategoryLabelPrefix + "* label");
        }

        [TestCaseSource(nameof(Textures))]
        public void Texture_follows_rules(string path)
        {
            if (path == "<none>") Assert.Ignore("no textures under the rules root yet");
            var rules = Rules;
            var ti = (TextureImporter)AssetImporter.GetAtPath(path);
            var role = rules.RoleOfImported(path);
            Assert.AreNotEqual("Unknown", role, path + ": no role suffix");
            if (role == "Normal") Assert.AreEqual(TextureImporterType.NormalMap, ti.textureType, path);
            bool linear = role == "Normal" || rules.LinearRoles.Contains(role);
            Assert.AreEqual(!linear, ti.sRGBTexture, path + ": sRGB for role " + role);
            Assert.That(ti.maxTextureSize, Is.LessThanOrEqualTo(rules.TextureMaxSize), path);
            Assert.That(ti.mipmapEnabled, path + ": mipmaps off");
        }

        [TestCaseSource(nameof(Models))]
        public void Model_import_settings(string path)
        {
            if (path == "<none>") Assert.Ignore("no models under the rules root yet");
            var mi = (ModelImporter)AssetImporter.GetAtPath(path);
            Assert.That(mi.bakeAxisConversion, path + ": bakeAxisConversion off");
            Assert.That(!mi.importCameras && !mi.importLights, path + ": cameras or lights imported");
            Assert.AreEqual(ModelImporterAnimationType.None, mi.animationType, path);
            Assert.That(!mi.isReadable, path + ": Read/Write enabled (doubles mesh memory)");
        }

        [Test]
        public void No_implicit_duplicates_across_groups()
        {
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            if (settings == null) Assert.Ignore("no Addressables settings");
            var d = AddressablesJobs.ImplicitDuplicatesCore(settings);
            var list = ((List<object>)d["assets"]).Cast<Dictionary<string, object>>().Select(x => x["asset"] + " x" + x["groups"]).ToList();
            Assert.AreEqual(0, (int)d["count"], "implicit dependencies copied into several bundles: " + string.Join(", ", list.Take(8)));
        }

        [Test]
        public void Manifest_props_are_all_accounted_for()
        {
            var props = PropsManifest.Load();
            if (props.Count == 0) Assert.Ignore("no props_manifest.json yet");
            var bad = props.Where(p => p.status == "built" && !File.Exists(p.prefab)).Select(p => p.name).ToList();
            Assert.IsEmpty(bad, "built props without a prefab file: " + string.Join(", ", bad.Take(10)));
        }
    }
}
