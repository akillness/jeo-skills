// AgentKit.Web optional job (scenario-unity-web skill, 2026-09-24): deferred content through Addressables on
// the Web. Needs com.unity.addressables (2.9.1 ran here); installed only by
// ut_web.install_runtime(P, addressables=True), so projects without the package still compile.
//
// Job: AgentKit.Web.WebAddressablesJobs.SetupDeferredGroup (launch with build_target="WebGL")
//   args: address (default "DeferredProp"), group (default "WebDeferred"), compression (LZ4 |
//         Uncompressed; LZMA is refused: "Decompressing this format (1) isn't supported" on the Web),
//         texture_size (default 1024), scene (default Assets/Scenes/WebDemo.unity)
//   Creates a prefab with a noise texture (stands in for late content), puts it in a local
//   Addressables group (bundles end up in StreamingAssets/aa/WebGL and download only when the game
//   asks), adds AgentWeb.WebDeferredAddressable to the "WebBridge" object, and builds the content
//   (AddressableAssetSettings.BuildPlayerContent). Returns the bundle files and sizes.
// Authoring Addressables layouts, profiles and CCD belongs to scenario-unity-pipeline-automation; this job
// only proves the Web rules (LZ4, deferred after gameplay start, served next to the build).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py test_13.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Build;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AddressableAssets;

namespace AgentKit.Web
{
    public static class WebAddressablesJobs
    {
        public static void SetupDeferredGroup()
        {
            AgentJob.Run(() =>
            {
                var address = AgentJob.Str("address", "DeferredProp");
                var groupName = AgentJob.Str("group", "WebDeferred");
                var compName = AgentJob.Str("compression", "LZ4");
                if (compName.Equals("LZMA", StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException("LZMA bundles fail on the Web (\"Decompressing this format (1) isn't supported\"): use LZ4");
                var compression = (BundledAssetGroupSchema.BundleCompressionMode)Enum.Parse(typeof(BundledAssetGroupSchema.BundleCompressionMode), compName, true);
                int size = AgentJob.Int("texture_size", 1024);
                const string dir = "Assets/AgentWebDeferred";
                Directory.CreateDirectory(dir);

                // late content: a noise texture on a cube prefab
                var texPath = dir + "/DeferredNoise.png";
                var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
                var rnd = new System.Random(11);
                var px = new Color32[size * size];
                for (int i = 0; i < px.Length; i++) px[i] = new Color32((byte)rnd.Next(256), (byte)rnd.Next(256), (byte)rnd.Next(256), 255);
                tex.SetPixels32(px);
                File.WriteAllBytes(texPath, tex.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(tex);
                AssetDatabase.ImportAsset(texPath, ImportAssetOptions.ForceSynchronousImport);
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                var mat = new Material(shader) { name = "DeferredNoise" };
                var loaded = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
                if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", loaded); else mat.mainTexture = loaded;
                var matPath = dir + "/DeferredNoise.mat";
                AssetDatabase.DeleteAsset(matPath);
                AssetDatabase.CreateAsset(mat, matPath);
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.name = "DeferredProp";
                go.GetComponent<Renderer>().sharedMaterial = mat;
                var prefabPath = dir + "/DeferredProp.prefab";
                PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
                UnityEngine.Object.DestroyImmediate(go);

                // Addressables: local group, LZ4, entry with a stable address
                var settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
                var group = settings.FindGroup(groupName) ?? settings.CreateGroup(groupName, false, false, true, null,
                    typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
                var schema = group.GetSchema<BundledAssetGroupSchema>();
                schema.Compression = compression;
                schema.BuildPath.SetVariableByName(settings, AddressableAssetSettings.kLocalBuildPath);
                schema.LoadPath.SetVariableByName(settings, AddressableAssetSettings.kLocalLoadPath);
                var entry = settings.CreateOrMoveEntry(AssetDatabase.AssetPathToGUID(prefabPath), group);
                entry.address = address;
                EditorUtility.SetDirty(settings);
                EditorUtility.SetDirty(group);
                AssetDatabase.SaveAssets();

                // loader on the WebBridge object of the demo scene
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/WebDemo.unity");
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var bridge = GameObject.Find("WebBridge");
                if (bridge == null) throw new InvalidOperationException("no WebBridge object in " + scenePath + " (run WebJobs.SetupDemo)");
                var loaderType = Type.GetType("AgentWeb.WebDeferredAddressable, Assembly-CSharp");
                if (loaderType == null) throw new InvalidOperationException("AgentWeb.WebDeferredAddressable not compiled: ut_web.install_runtime(P, addressables=True)");
                var comp = bridge.GetComponent(loaderType) ?? bridge.AddComponent(loaderType);
                var so = new SerializedObject(comp);
                so.FindProperty("address").stringValue = address;
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);

                // content build (the player build then copies it into StreamingAssets/aa)
                AddressableAssetSettings.BuildPlayerContent(out AddressablesPlayerBuildResult result);
                var files = new List<object>();
                var buildRoot = Addressables.BuildPath;
                if (Directory.Exists(buildRoot))
                    foreach (var f in Directory.GetFiles(buildRoot, "*", SearchOption.AllDirectories))
                        files.Add(new Dictionary<string, object> { { "path", f.Replace(AgentJob.ProjectRoot + "/", "") }, { "bytes", new FileInfo(f).Length } });
                if (!string.IsNullOrEmpty(result.Error)) AgentJob.Fail("Addressables build failed: " + result.Error, new Dictionary<string, object> { { "files", files } });
                return new Dictionary<string, object>
                {
                    { "group", group.Name }, { "compression", schema.Compression.ToString() }, { "address", entry.address },
                    { "build_path", buildRoot }, { "duration_s", Math.Round(result.Duration, 2) }, { "files", files },
                    { "load_path", schema.LoadPath.GetValue(settings) },
                };
            });
        }
    }
}
