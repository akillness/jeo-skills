// scenario-unity-ui AgentKit (Unity Expert Skills v0.1, 2026-09-24). Project setup for UI work, headless.
//
// Jobs:
//   AgentKit.UI.UISetup.ImportTmpEssentials   async (quit=False). Imports "TMP Essential Resources"
//       from the com.unity.ugui 2.0 package (TextMeshPro lives inside uGUI in Unity 6) into
//       Assets/TextMesh Pro, the step the "Import TMP Essentials" dialog does in the GUI.
//       Observed 2026-09-24 (6000.3.21f1): TMP_PackageResourceImporter.ImportResources(true, false,
//       false) does nothing in batch mode: it looks for the package with
//       Path.GetFullPath("Packages/com.unity.ugui"), which is not a folder for a built-in package
//       (it lives in Library/PackageCache/com.unity.ugui@<hash>). This job resolves the real
//       path through PackageManager.PackageInfo and waits for importPackageCompleted.
//       Without the essentials TMP_Settings.instance is null and TMP_Settings.defaultFontAsset
//       throws a NullReferenceException (observed); TMP text renders nothing.
//   AgentKit.UI.UISetup.Status   sync: TMP settings, default font, fallback lists, UI packages.
//   AgentKit.UI.UISetup.AddScenesToBuild   args: scenes [paths] -> EditorBuildSettings.scenes (the list
//       SceneManager.LoadScene and Play Mode tests read in the Editor; a Build Profile with its own
//       scene list overrides it for that profile's builds: scenario-unity-pipeline-automation owns profiles).
using System;
using System.Collections.Generic;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEngine;

namespace AgentKit.UI
{
    public static class UISetup
    {
        public static string UguiPackagePath()
        {
            var info = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.unity.ugui");
            if (info == null) throw new InvalidOperationException("com.unity.ugui not found in this project");
            return info.resolvedPath;
        }

        public static bool TmpReady()
        {
            return TMP_Settings.LoadDefaultSettings() != null;
        }

        public static void ImportTmpEssentials()
        {
            AgentJob.Run(() =>
            {
                AgentJob.BeginAsync();
                if (TmpReady())
                {
                    AgentJob.Succeed(Status_());
                    return null;
                }
                var pkg = Path.Combine(UguiPackagePath(), "Package Resources", "TMP Essential Resources.unitypackage");
                if (!File.Exists(pkg)) throw new FileNotFoundException(pkg);
                int ticks = 0;
                AssetDatabase.ImportPackageCallback done = null;
                AssetDatabase.ImportPackageFailedCallback failed = null;
                EditorApplication.CallbackFunction watchdog = null;
                void Cleanup()
                {
                    AssetDatabase.importPackageCompleted -= done;
                    AssetDatabase.importPackageFailed -= failed;
                    EditorApplication.update -= watchdog;
                }
                done = name =>
                {
                    Cleanup();
                    AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                    var st = Status_();
                    st["imported_package"] = name;
                    if (!TmpReady()) AgentJob.Fail("package imported but TMP Settings still missing", st);
                    else AgentJob.Succeed(st);
                };
                failed = (name, err) => { Cleanup(); AgentJob.Fail("import failed: " + name + ": " + err); };
                watchdog = () => { if (++ticks > 6000) { Cleanup(); AgentJob.Fail("import timed out"); } };
                AssetDatabase.importPackageCompleted += done;
                AssetDatabase.importPackageFailed += failed;
                EditorApplication.update += watchdog;
                AssetDatabase.ImportPackage(pkg, false);
                return null;
            });
        }

        public static void AddScenesToBuild()
        {
            AgentJob.Run(() =>
            {
                var list = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
                foreach (var o in AgentJob.List("scenes"))
                {
                    var path = o.ToString();
                    if (AssetDatabase.LoadAssetAtPath<SceneAsset>(path) == null) throw new FileNotFoundException(path);
                    if (!list.Exists(s => s.path == path)) list.Add(new EditorBuildSettingsScene(path, true));
                }
                EditorBuildSettings.scenes = list.ToArray();
                return new Dictionary<string, object> { { "scenes", list.ConvertAll(s => (object)s.path) } };
            });
        }

        public static void Status()
        {
            AgentJob.Run(() => Status_());
        }

        static Dictionary<string, object> Status_()
        {
            var s = TMP_Settings.LoadDefaultSettings();
            var r = new Dictionary<string, object>
            {
                { "tmp_settings", s != null ? AssetDatabase.GetAssetPath(s) : null },
                { "ugui_package", UguiPackagePath() },
            };
            if (s != null)
            {
                r["default_font"] = TMP_Settings.defaultFontAsset != null ? AssetDatabase.GetAssetPath(TMP_Settings.defaultFontAsset) : null;
                var fb = new List<string>();
                if (TMP_Settings.fallbackFontAssets != null)
                    foreach (var f in TMP_Settings.fallbackFontAssets) fb.Add(f != null ? f.name : null);
                r["general_fallbacks"] = fb;
                r["default_sprite_asset"] = TMP_Settings.defaultSpriteAsset != null ? TMP_Settings.defaultSpriteAsset.name : null;
                r["missing_glyph_char"] = TMP_Settings.missingGlyphCharacter;
            }
            return r;
        }
    }
}
