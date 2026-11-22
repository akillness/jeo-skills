// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). What runs under the splash screen.
//
// Job: AuditStartup  args: scene (default: first enabled build scene), resources_info (300), resources_warn (1000)
// Expert basis (Unity Enterprise Support, j4YAY36xjwE [00:04:26] to [00:05:32], [00:33:26], [00:33:59]):
// two project costs run while the splash is up: the Resources folder index (every file under any
// Resources folder is indexed at launch; thousands of files cost hundreds of ms on slow devices) and
// loading plus Awake of the first scene. The 300 / 1000 file thresholds are [added]. Android: Unity
// reports "fully drawn" before the first scene's Awake, so a loader scene needs
// StartupReport.Interactive() (DiagnosticsReporting.CallReportFullyDrawn) on the real interactive
// frame (6.3 Manual, Optimize application startup times); the code side is ut_mobile.code_scan.
// Measure the real time to first frame on a device (Instruments Time Profiler on iOS, Android vitals
// startup on Android); this job only lists the causes an agent can see in the project.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_assets.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.Mobile
{
    public static class MobileStartup
    {
        static readonly string[] EarlyCallbacks = { "Awake", "OnEnable", "Start" };

        public static void AuditStartup()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                int infoAt = AgentJob.Int("resources_info", 300), warnAt = AgentJob.Int("resources_warn", 1000);

                // 1. Resources index: files (not .meta) under every Assets/**/Resources folder
                var resFolders = Directory.GetDirectories("Assets", "Resources", SearchOption.AllDirectories)
                    .Select(d => d.Replace('\\', '/')).Where(d => !d.Contains("/Editor/")).ToList();
                int resFiles = 0;
                var perFolder = new Dictionary<string, object>();
                foreach (var d in resFolders)
                {
                    int n = Directory.GetFiles(d, "*", SearchOption.AllDirectories).Count(p => !p.EndsWith(".meta") && !Path.GetFileName(p).StartsWith("."));
                    perFolder[d] = n;
                    resFiles += n;
                }
                if (resFiles >= warnAt)
                    f.Add("warn", "mobile.startup.resources_index", "Assets/**/Resources", resFiles + " files under Resources: all indexed at launch, under the splash", "remove temporary and debug assets; move the rest to Addressables or AssetBundles");
                else if (resFiles >= infoAt)
                    f.Add("info", "mobile.startup.resources_index", "Assets/**/Resources", resFiles + " files under Resources (indexed at every launch)", "keep Resources for the few assets needed at boot");

                // 2. First scene: MonoBehaviours whose Awake/OnEnable/Start run before the first frame
                var scene = AgentJob.Str("scene") ?? EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).FirstOrDefault();
                var early = new List<object>();
                int objects = 0;
                if (!string.IsNullOrEmpty(scene))
                {
                    var sc = EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                    foreach (var root in sc.GetRootGameObjects())
                        foreach (var mb in root.GetComponentsInChildren<MonoBehaviour>(true))
                        {
                            objects++;
                            if (mb == null) continue;
                            var t = mb.GetType();
                            var asm = t.Assembly.GetName().Name;
                            if (asm.StartsWith("Unity.") || asm.StartsWith("UnityEngine")) continue;   // engine and package components
                            var cbs = EarlyCallbacks.Where(n => t.GetMethod(n, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic) != null).ToList();
                            if (cbs.Count > 0) early.Add(new Dictionary<string, object> { { "object", mb.gameObject.name }, { "type", t.FullName }, { "callbacks", cbs } });
                        }
                    if (early.Count > 0)
                        f.Add("info", "mobile.startup.first_scene_callbacks", scene, early.Count + " project components run Awake/OnEnable/Start in the first scene, under the splash",
                              "keep the first scene a light loader; move SDK init and data parsing after the first interactive frame (then StartupReport.Interactive())");
                }
                return new Dictionary<string, object>
                {
                    { "resources_files", resFiles }, { "resources_folders", perFolder }, { "scene", scene }, { "scene_components", objects },
                    { "early_callbacks", early }, { "splash_screen", PlayerSettings.SplashScreen.show },
                    { "findings", f.items }, { "counts", f.Counts() },
                };
            });
        }
    }
}
