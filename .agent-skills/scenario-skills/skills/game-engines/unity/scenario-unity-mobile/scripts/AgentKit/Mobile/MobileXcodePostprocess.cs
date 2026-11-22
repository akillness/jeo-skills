// scenario-unity-mobile v0.1 (Unity Expert Skills, 2026-09-24). Xcode edits after an iOS build, never by
// hand in the generated folder (Data and Libraries are regenerated every build; Append keeps only
// Classes, and only for the same Unity iOS version: 6.3 Manual).
// Config: Assets/AgentMobile/ios_postprocess.json (optional, explicit so nothing is added silently)
//   { "plist": { "KEY": "string" | true | 1 }, "unityframework_frameworks": ["StoreKit.framework"] }
// Writes <build>/agent_xcode_postprocess.json: both target GUIDs and what changed.
// Target rule (6.3 Manual): app-level settings go to GetUnityMainTargetGuid() (Unity-iPhone),
// runtime, plug-in and framework links to GetUnityFrameworkTargetGuid(); mixing them up is the
// classic link error. 6.4 moves runtime libraries into UnityRuntime.framework: re-check scripts
// that touch Libraries/ when upgrading.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_ios_build.py.
#if UNITY_IOS
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.iOS.Xcode;

namespace AgentKit.Mobile
{
    public sealed class MobileXcodePostprocess : IPostprocessBuildWithReport
    {
        public const string ConfigPath = "Assets/AgentMobile/ios_postprocess.json";
        public int callbackOrder => 900;

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.iOS) return;
            var outDir = report.summary.outputPath;
            var result = new Dictionary<string, object>();
            var projPath = PBXProject.GetPBXProjectPath(outDir);
            var proj = new PBXProject();
            proj.ReadFromFile(projPath);
            string main = proj.GetUnityMainTargetGuid(), fw = proj.GetUnityFrameworkTargetGuid();
            result["main_target_guid"] = main;
            result["framework_target_guid"] = fw;
            var changes = new List<object>();
            Dictionary<string, object> cfg = null;
            if (File.Exists(ConfigPath)) cfg = AgentJson.ParseObject(File.ReadAllText(ConfigPath));
            if (cfg != null && cfg.TryGetValue("unityframework_frameworks", out var fws) && fws is List<object> list)
            {
                foreach (var name in list)
                {
                    proj.AddFrameworkToProject(fw, name.ToString(), false);
                    changes.Add("UnityFramework += " + name);
                }
                proj.WriteToFile(projPath);
            }
            var plistPath = Path.Combine(outDir, "Info.plist");
            if (cfg != null && cfg.TryGetValue("plist", out var pl) && pl is Dictionary<string, object> keys && File.Exists(plistPath))
            {
                var doc = new PlistDocument();
                doc.ReadFromFile(plistPath);
                foreach (var kv in keys)
                {
                    if (kv.Value is bool b) doc.root.SetBoolean(kv.Key, b);
                    else if (kv.Value is double d) doc.root.SetInteger(kv.Key, (int)d);
                    else doc.root.SetString(kv.Key, kv.Value?.ToString());
                    changes.Add("Info.plist " + kv.Key);
                }
                doc.WriteToFile(plistPath);
            }
            result["changes"] = changes;
            result["config"] = cfg != null ? ConfigPath : null;
            File.WriteAllText(Path.Combine(outDir, "agent_xcode_postprocess.json"), AgentJson.Serialize(result, true));
        }
    }
}
#endif
