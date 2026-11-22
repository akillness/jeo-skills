// AgentKit.Pipeline v0.2 (scenario-unity-pipeline-automation, 2026-09-24). Build side: a pre-build gate that
// runs the content tests synchronously and refuses a player build without current Addressables
// content, with build scenes that hard-reference Addressable content, or (release builds launched
// with -agentRelease) with debug defines; Build Profile creation on 6.3; the smoke boot scene; a CI entry point.
//
//   AgentKit.Pipeline.PipelineBuild.CreateBuildProfile   {path, target, template?, scenes?, defines?}
//                                                         (template: public CopyAsset route; else 6.3 internal API)
//   AgentKit.Pipeline.PipelineBuild.EnsureSmokeScene     {scene?}
//   AgentKit.Pipeline.PipelineBuild.BuildFromCommandLine  (no AgentKit args: -buildOutput <path>, active profile
//                                                         or -buildTarget; for `unity build --execute-method`)
// Gate rules (Warnecke and Fine, Unite 2019, wTiF2D0_vKA [00:15:59], [00:31:43]): Edit Mode only,
// runSynchronously, a small category, BuildFailedException on failure, and a log line on success too.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/test_live_build.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.Build;
using UnityEditor.Build.Profile;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.SceneManagement;

namespace AgentKit.Pipeline
{
    /// <summary>Runs before every PLAYER build (context callbacks also fire for AssetBundle builds:
    /// BuildPipeline.isBuildingPlayer tells them apart).</summary>
    public class PipelinePrebuildGate : IPreprocessBuildWithContext
    {
        public int callbackOrder => 10;

        public void OnPreprocessBuild(BuildCallbackContext context)
        {
            if (!BuildPipeline.isBuildingPlayer) return;
            var rules = PipelineRules.Load();
            if (rules == null || !rules.PrebuildGate) return;
            if (Environment.GetEnvironmentVariable("AGENTKIT_SKIP_GATE") == "1") { Debug.LogWarning("AGENT_GATE {\"skipped\":true}"); return; }
            // release checks only when the build was launched as a release (-agentRelease): dev builds may carry debug defines
            var report = Evaluate(rules, PipelineChecks.BuildScenes(), AgentJob.HasArg("-agentRelease"), true, out var problems);
            var line = "AGENT_GATE " + AgentJson.Serialize(report);
            if (problems.Count > 0)
            {
                Debug.LogError(line);
                throw new BuildFailedException("Pipeline pre-build gate: " + string.Join(" | ", problems));
            }
            Debug.Log(line);                        // silence is not a signal: log the pass too
        }

        /// <summary>The gate's checks, callable from a job (PipelineProbes, CI dry runs) as well as from the build
        /// callback: 1. Addressables content present unless the player build builds it; 2. no build scene
        /// hard-references Addressable content; 3. release builds: no forbidden defines, scenes, not Development;
        /// 4. the content tests of the gate category, synchronously (Edit Mode only).</summary>
        public static Dictionary<string, object> Evaluate(PipelineRules rules, IList<string> scenes, bool release, bool runTests, out List<string> problems)
        {
            var report = new Dictionary<string, object> { { "target", EditorUserBuildSettings.activeBuildTarget.ToString() }, { "release", release } };
            problems = new List<string>();
            var config = PipelineChecks.LoadConfig();

            // 1. Addressables content must exist for this target when the player build will not build it
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            if (settings != null && settings.groups.Any(g => g != null && g.entries.Count > 0))
            {
                bool buildsWithPlayer = settings.BuildAddressablesWithPlayerBuild == AddressableAssetSettings.PlayerBuildOption.BuildWithPlayer ||
                                        (settings.BuildAddressablesWithPlayerBuild == AddressableAssetSettings.PlayerBuildOption.PreferencesValue &&
                                         EditorPrefs.GetBool(AddressablesBuildPreferenceKey, true));
                var dir = Addressables.BuildPath;                       // Library/com.unity.addressables/aa/<platform folder, e.g. OSX>
                bool hasCatalog = Directory.Exists(dir) && Directory.GetFiles(dir, "catalog*.*").Length > 0;
                report["content_dir"] = dir;
                report["addressables_built_with_player"] = buildsWithPlayer;
                report["content_present"] = hasCatalog;
                if (!buildsWithPlayer && !hasCatalog) problems.Add("no Addressables content for " + EditorUserBuildSettings.activeBuildTarget + " in " + dir + ": run BuildContent first");
            }

            // 2. build scenes must not reference Addressable content (it would load twice and bypass the bundles)
            if (config.HardReferenceCheck)
            {
                var hr = PipelineChecks.HardReferencesCore(scenes, settings, rules.Root);
                report["hard_references"] = hr["addressable_refs"];
                report["hard_shader_references"] = hr["addressable_shader_refs"];     // warning only: shader duplicated player/bundles
                report["scenes"] = scenes.ToList();
                if ((int)hr["addressable_refs"] > 0)
                    problems.Add(hr["addressable_refs"] + " Addressable asset(s) hard-referenced by build scenes: " +
                                 string.Join("; ", ((List<object>)hr["scenes"]).Cast<Dictionary<string, object>>()
                                     .Where(r => r.ContainsKey("addressable_refs") && (int)r["addressable_refs"] > 0)
                                     .Select(r => r["scene"] + " -> " + string.Join(", ", (List<string>)r["addressable_sample"]))));
            }

            // 3. release builds: forbidden defines, empty scene list, Development flag
            if (release)
            {
                var rc = PipelineChecks.ReleaseCheckCore(null, config.ReleaseForbiddenDefines);
                report["release_problems"] = rc["problems"];
                problems.AddRange((List<string>)rc["problems"]);
            }

            // 4. the content tests of the gate category, synchronously
            if (runTests)
            {
                var collector = ScriptableObject.CreateInstance<GateCallbacks>();
                collector.hideFlags = HideFlags.HideAndDontSave;
                var api = ScriptableObject.CreateInstance<TestRunnerApi>();
                api.RegisterCallbacks(collector);
                try
                {
                    api.Execute(new ExecutionSettings(new Filter { testMode = TestMode.EditMode, categoryNames = new[] { rules.PrebuildTestCategory } })
                    {
                        runSynchronously = true,
                    });
                }
                finally { api.UnregisterCallbacks(collector); }
                report["tests_total"] = collector.total;
                report["tests_failed"] = collector.failed.Count;
                if (collector.total == 0) problems.Add("gate ran 0 tests in category " + rules.PrebuildTestCategory);
                if (collector.failed.Count > 0) problems.Add(collector.failed.Count + " content test(s) failed: " + string.Join("; ", collector.failed.Take(5)));
                UnityEngine.Object.DestroyImmediate(collector);
            }
            report["ok"] = problems.Count == 0;
            report["problems"] = problems;
            return report;
        }

        const string AddressablesBuildPreferenceKey = "Addressables.BuildAddressablesWithPlayerBuild";

        class GateCallbacks : ScriptableObject, ICallbacks
        {
            public int total;
            public List<string> failed = new List<string>();
            public void RunStarted(ITestAdaptor testsToRun) { }
            public void RunFinished(ITestResultAdaptor result) { }
            public void TestStarted(ITestAdaptor test) { }
            public void TestFinished(ITestResultAdaptor result)
            {
                if (result.HasChildren) return;
                total++;
                if (result.TestStatus == TestStatus.Failed) failed.Add(result.Name + ": " + (result.Message ?? "").Split('\n')[0]);
            }
        }
    }

    public static class PipelineBuild
    {
        // ================================================================ Build Profiles on 6.3
        /// <summary>Creates a Build Profile asset. 6.3 has no public creation API (BuildProfile.CreateBuildProfile
        /// is 6.5+). Routes, most robust first: (1) "template": copy a committed profile of the same platform with
        /// the public AssetDatabase.CopyAsset (new GUID) and edit its public scenes and defines; (2) the internal
        /// BuildProfile.CreateInstance(BuildTarget, StandaloneBuildSubtarget) that the Build Profiles window uses
        /// (found by reflection on 6000.3.21f1; can vanish in any update, so the result says route "internal").
        /// Other public routes: File > Build Profiles > Add Build Profile, `unity build --create-profile`.</summary>
        public static void CreateBuildProfile()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path") ?? throw new ArgumentException("path (Assets/Settings/Build Profiles/<Name>.asset) required");
                if (!Enum.TryParse(AgentJob.Str("target", "StandaloneOSX"), true, out BuildTarget target)) throw new ArgumentException("unknown target");
                var template = AgentJob.Str("template");
                var existing = AssetDatabase.LoadAssetAtPath<BuildProfile>(path);
                bool created = false;
                string route = "existing";
                if (existing == null && !string.IsNullOrEmpty(template))
                {
                    if (AssetDatabase.LoadAssetAtPath<BuildProfile>(template) == null) throw new FileNotFoundException("template Build Profile not found: " + template);
                    ArtDropJobs.EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
                    if (!AssetDatabase.CopyAsset(template, path)) throw new IOException("AssetDatabase.CopyAsset failed: " + template + " -> " + path);
                    existing = AssetDatabase.LoadAssetAtPath<BuildProfile>(path);
                    created = true;
                    route = "template";
                }
                if (existing == null)
                {
                    var m = typeof(BuildProfile).GetMethod("CreateInstance", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public, null,
                        new[] { typeof(BuildTarget), typeof(StandaloneBuildSubtarget) }, null);
                    if (m == null) throw new MissingMethodException("BuildProfile.CreateInstance(BuildTarget, StandaloneBuildSubtarget) not found: pass a template, or create the profile in File > Build Profiles / `unity build --create-profile`");
                    existing = (BuildProfile)m.Invoke(null, new object[] { target, StandaloneBuildSubtarget.Player });
                    ArtDropJobs.EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
                    AssetDatabase.CreateAsset(existing, path);
                    created = true;
                    route = "internal";
                    AgentJob.Warn("created through the INTERNAL BuildProfile.CreateInstance: commit this asset and use it as the template next time");
                }
                var scenes = AgentJob.List("scenes").Select(Convert.ToString).ToList();
                if (scenes.Count > 0)
                {
                    existing.overrideGlobalScenes = true;
                    existing.scenes = scenes.Select(s => new EditorBuildSettingsScene(s, true)).ToArray();
                }
                var defines = AgentJob.List("defines").Select(Convert.ToString).ToArray();
                if (AgentJob.Has("defines")) existing.scriptingDefines = defines;
                EditorUtility.SetDirty(existing);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "path", path }, { "created", created }, { "route", route }, { "target", target.ToString() },
                    { "scenes", existing.GetScenesForBuild().Select(s => s.path).ToList() }, { "defines", existing.scriptingDefines },
                    { "override_scenes", existing.overrideGlobalScenes },
                };
            });
        }

        // ================================================================ smoke scene
        public static void EnsureSmokeScene()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("scene", "Assets/Scenes/Boot.unity");
                var type = Type.GetType("AgentAddressablesSmoke, Assembly-CSharp");
                if (type == null) throw new InvalidOperationException("AgentAddressablesSmoke not compiled: ut_pipeline.install(P, runtime=True)");
                bool created = !File.Exists(path);
                var scene = created ? EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single) : EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
                var go = scene.GetRootGameObjects().FirstOrDefault(g => g.GetComponent(type) != null);
                bool changed = created;
                if (go == null)
                {
                    go = new GameObject("AgentAddressablesSmoke");
                    go.AddComponent(type);
                    changed = true;
                }
                if (changed)
                {
                    ArtDropJobs.EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
                    EditorSceneManager.SaveScene(scene, path);
                }
                var list = EditorBuildSettings.scenes.ToList();
                if (!(list.Count == 1 && list[0].path == path && list[0].enabled))
                    EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(path, true) };
                return new Dictionary<string, object> { { "scene", path }, { "created", created }, { "build_scenes", EditorBuildSettings.scenes.Select(s => s.path).ToList() } };
            });
        }

        // ================================================================ CI entry point
        /// <summary>For `unity build --execute-method AgentKit.Pipeline.PipelineBuild.BuildFromCommandLine`
        /// or raw -executeMethod: builds the active Build Profile (launch with -activeBuildProfile) or the
        /// active target (launch with -buildTarget) to -buildOutput, writes agent_build_report.json beside
        /// it, exits 1 unless the BuildReport says Succeeded. Never switches the platform itself.</summary>
        public static void BuildFromCommandLine()
        {
            int code = 1;
            try
            {
                var outPath = AgentJob.CommandLineValue("-buildOutput") ?? AgentJob.CommandLineValue("-out") ?? AgentBuild.DefaultOut(EditorUserBuildSettings.activeBuildTarget);
                outPath = AgentJob.ResolvePath(outPath);
                Directory.CreateDirectory(Path.GetDirectoryName(outPath.TrimEnd('/')) ?? ".");
                var profile = BuildProfile.GetActiveBuildProfile();
                BuildReport report;
                string[] scenes;
                var target = EditorUserBuildSettings.activeBuildTarget;
                if (profile != null)
                {
                    scenes = profile.GetScenesForBuild().Select(s => s.path).ToArray();
                    report = BuildPipeline.BuildPlayer(new BuildPlayerWithProfileOptions { buildProfile = profile, locationPathName = outPath, options = BuildOptions.None });
                }
                else
                {
                    scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
                    report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = scenes, locationPathName = outPath, target = target, targetGroup = BuildPipeline.GetBuildTargetGroup(target) });
                }
                var summary = AgentBuild.Summarize(report, outPath, scenes, target);
                summary["profile"] = profile != null ? AssetDatabase.GetAssetPath(profile) : null;
                var dir = outPath.EndsWith(".app") || File.Exists(outPath) ? Path.GetDirectoryName(outPath) : outPath;
                File.WriteAllText(Path.Combine(dir, "agent_build_report.json"), AgentJson.Serialize(summary, true));
                Debug.Log("AGENT_BUILD " + AgentJson.Serialize(new Dictionary<string, object> { { "result", summary["result"] }, { "total_size_mb", summary["total_size_mb"] }, { "profile", summary["profile"] } }));
                code = report.summary.result == BuildResult.Succeeded ? 0 : 1;
            }
            catch (Exception e) { Debug.LogException(e); code = 1; }
            if (Application.isBatchMode) EditorApplication.Exit(code);
        }
    }
}
