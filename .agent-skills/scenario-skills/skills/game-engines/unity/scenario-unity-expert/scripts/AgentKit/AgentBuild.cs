// AgentKit v0.1 (Unity Expert Skills, 2026-09-24). Player builds with a BuildReport summary.
//
// Launch through ut_run.build(project, target, ...), which passes -buildTarget <T> at launch:
// "Target-switch APIs silently do nothing in batch mode" (6.3 Manual: SetActiveBuildProfile,
// SwitchActiveBuildTargetAsync, BuildPlayerOptions.target in a running batch session), so one
// Unity process per target, the platform fixed on the command line. Profile builds also get
// -activeBuildProfile <asset>, whose defines are compiled before -executeMethod runs.
//
// Job: AgentKit.AgentBuild.Build   args: target (BuildTarget name), out (player path, relative
//      to the project), profile (Build Profile asset path, optional), options ["Development",
//      "DetailedBuildReport", ...], development (bool), detailed (bool), scenes (optional list)
// Result: result, platform, output_path, total_size_mb (BuildReport), output_on_disk_mb (folder
//         or .app on disk), total_time_s, errors, warnings, error_messages, steps (top 12 by
//         duration), largest_files (top 15), scenes, web (compression, wasm files) for WebGL.
// Also writes <out folder>/agent_build_report.json. Exit code 1 when the build did not succeed.
// Run in Unity 6000.3.21f1 on 2026-09-24: macOS (Mono) and Web builds, tests/code/unity-expert/test_live_build.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Profile;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace AgentKit
{
    public static class AgentBuild
    {
        public static void Build()
        {
            AgentJob.Run(() =>
            {
                var targetName = AgentJob.Str("target", EditorUserBuildSettings.activeBuildTarget.ToString());
                if (!Enum.TryParse(targetName, true, out BuildTarget target))
                    throw new ArgumentException("unknown BuildTarget '" + targetName + "'");
                if (EditorUserBuildSettings.activeBuildTarget != target)
                    AgentJob.Warn("active target is " + EditorUserBuildSettings.activeBuildTarget + ", not " + target +
                                  ": launch with -buildTarget (ut_run.build does); a switch inside a batch job does not take effect");
                var group = BuildPipeline.GetBuildTargetGroup(target);
                if (!BuildPipeline.IsBuildTargetSupported(group, target))
                    throw new InvalidOperationException("build support for " + target + " is not installed (Unity Hub > Installs > Add modules)");

                var opts = BuildOptions.None;
                foreach (var o in AgentJob.List("options"))
                    if (Enum.TryParse(o.ToString(), true, out BuildOptions bo)) opts |= bo;
                if (AgentJob.Bool("development")) opts |= BuildOptions.Development;
                if (AgentJob.Bool("detailed")) opts |= BuildOptions.DetailedBuildReport;

                var outRel = AgentJob.Str("out") ?? DefaultOut(target);
                var outPath = AgentJob.ResolvePath(outRel);
                Directory.CreateDirectory(Path.GetDirectoryName(outPath.TrimEnd('/')) ?? ".");

                BuildReport report;
                string[] scenes;
                var profilePath = AgentJob.Str("profile");
                if (!string.IsNullOrEmpty(profilePath))
                {
                    var profile = AssetDatabase.LoadAssetAtPath<BuildProfile>(profilePath);
                    if (profile == null) throw new FileNotFoundException("Build Profile not found: " + profilePath);
                    scenes = profile.GetScenesForBuild().Select(s => s.path).ToArray();
                    report = BuildPipeline.BuildPlayer(new BuildPlayerWithProfileOptions
                    {
                        buildProfile = profile, locationPathName = outPath, options = opts,
                    });
                }
                else
                {
                    scenes = AgentJob.List("scenes").Select(s => s.ToString()).ToArray();
                    if (scenes.Length == 0) scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
                    if (scenes.Length == 0) throw new InvalidOperationException("no scenes: pass args.scenes or enable scenes in the build list");
                    report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                    {
                        scenes = scenes, locationPathName = outPath, target = target, targetGroup = group, options = opts,
                    });
                }
                var summary = Summarize(report, outPath, scenes, target);
                try
                {
                    var dir = Directory.Exists(outPath) && !outPath.EndsWith(".app") ? outPath : Path.GetDirectoryName(outPath);
                    File.WriteAllText(Path.Combine(dir, "agent_build_report.json"), AgentJson.Serialize(summary, true));
                }
                catch (Exception e) { AgentJob.Warn("could not write agent_build_report.json: " + e.Message); }
                if (report.summary.result != BuildResult.Succeeded)
                {
                    AgentJob.Fail("build " + report.summary.result + ": " + string.Join(" | ", ((List<object>)summary["error_messages"]).Take(3)), summary);
                    return null;
                }
                return summary;
            });
        }

        public static string DefaultOut(BuildTarget t)
        {
            var name = PlayerSettings.productName.Replace(' ', '_');
            switch (t)
            {
                case BuildTarget.StandaloneOSX: return "Builds/macOS/" + name + ".app";
                case BuildTarget.WebGL: return "Builds/Web";
                case BuildTarget.Android: return "Builds/Android/" + name + (EditorUserBuildSettings.buildAppBundle ? ".aab" : ".apk");
                case BuildTarget.iOS: return "Builds/iOS";
                case BuildTarget.StandaloneWindows64: return "Builds/Windows/" + name + ".exe";
                default: return "Builds/" + t + "/" + name;
            }
        }

        public static Dictionary<string, object> Summarize(BuildReport report, string outPath, string[] scenes, BuildTarget target)
        {
            var s = report.summary;
            var errors = new List<object>();
            var warnings = 0;
            var steps = new List<Dictionary<string, object>>();
            foreach (var st in report.steps)
            {
                int e = 0, w = 0;
                foreach (var m in st.messages)
                {
                    if (m.type == LogType.Error || m.type == LogType.Exception) { e++; if (errors.Count < 20) errors.Add(m.content.Length > 400 ? m.content.Substring(0, 400) : m.content); }
                    else if (m.type == LogType.Warning) { w++; warnings++; }
                }
                steps.Add(new Dictionary<string, object>
                {
                    { "name", st.name }, { "depth", st.depth }, { "duration_s", Math.Round(st.duration.TotalSeconds, 2) }, { "errors", e }, { "warnings", w },
                });
            }
            List<Dictionary<string, object>> files = new List<Dictionary<string, object>>();
            int fileCount = 0;
            try
            {
                var fl = report.GetFiles();
                fileCount = fl.Length;
                files = fl.OrderByDescending(x => x.size).Take(15).Select(x => new Dictionary<string, object>
                {
                    { "path", x.path.Replace(outPath, "<out>") }, { "role", x.role }, { "size_mb", Math.Round(x.size / 1048576.0, 3) },
                }).ToList();
            }
            catch (Exception) { }
            double onDisk = PathSizeMb(outPath);
            var res = new Dictionary<string, object>
            {
                { "result", s.result.ToString() },
                { "platform", s.platform.ToString() },
                { "output_path", s.outputPath },
                { "total_size_mb", Math.Round(s.totalSize / 1048576.0, 3) },
                { "total_size_bytes", (long)s.totalSize },
                { "output_on_disk_mb", onDisk },
                { "total_time_s", Math.Round(s.totalTime.TotalSeconds, 1) },
                { "errors", s.totalErrors },
                { "warnings", s.totalWarnings },
                { "message_warnings", warnings },
                { "error_messages", errors },
                { "options", s.options.ToString() },
                { "build_started", s.buildStartedAt.ToString("o") },
                { "scenes", scenes },
                { "file_count", fileCount },
                { "largest_files", files },
                { "steps", steps.OrderByDescending(x => (double)x["duration_s"]).Take(12).ToList() },
                { "scripting_backend", PlayerSettings.GetScriptingBackend(NamedBuildTarget.FromBuildTargetGroup(BuildPipeline.GetBuildTargetGroup(target))).ToString() },
                { "unity", Application.unityVersion },
            };
            if (target == BuildTarget.WebGL)
            {
                var buildDir = Path.Combine(outPath, "Build");
                var web = new Dictionary<string, object>
                {
                    { "compression", PlayerSettings.WebGL.compressionFormat.ToString() },
                    { "decompression_fallback", PlayerSettings.WebGL.decompressionFallback },
                    { "exception_support", PlayerSettings.WebGL.exceptionSupport.ToString() },
                    { "data_caching", PlayerSettings.WebGL.dataCaching },
                    { "memory_size_mb_max", PlayerSettings.WebGL.maximumMemorySize },
                    { "code_optimization", SafeWebCodeOptimization() },
                };
                if (Directory.Exists(buildDir))
                    web["files"] = Directory.GetFiles(buildDir).Select(p => new Dictionary<string, object>
                    {
                        { "name", Path.GetFileName(p) }, { "size_mb", Math.Round(new FileInfo(p).Length / 1048576.0, 3) },
                    }).ToList();
                web["build_folder_mb"] = PathSizeMb(buildDir);
                res["web"] = web;
            }
            return res;
        }

        static string SafeWebCodeOptimization()
        {
            try
            {
                var t = Type.GetType("UnityEditor.WebGL.UserBuildSettings, UnityEditor.WebGL.Extensions");
                var p = t?.GetProperty("codeOptimization");
                return p != null ? p.GetValue(null)?.ToString() : "n/a";
            }
            catch (Exception) { return "n/a"; }
        }

        public static double PathSizeMb(string path)
        {
            try
            {
                if (File.Exists(path)) return Math.Round(new FileInfo(path).Length / 1048576.0, 3);
                if (!Directory.Exists(path)) return 0;
                long total = 0;
                foreach (var f in Directory.GetFiles(path, "*", SearchOption.AllDirectories)) total += new FileInfo(f).Length;
                return Math.Round(total / 1048576.0, 3);
            }
            catch (Exception) { return -1; }
        }

        /// <summary>Lists the project's Build Profile assets and the active one (read-only).
        /// 6.3 has no public API to create a profile (BuildProfile.CreateBuildProfile arrives in
        /// 6.5): create them in File > Build Profiles, or with `unity build --create-profile`.</summary>
        public static void ListProfiles()
        {
            AgentJob.Run(() =>
            {
                var list = new List<object>();
                foreach (var g in AssetDatabase.FindAssets("t:BuildProfile"))
                {
                    var p = AssetDatabase.GUIDToAssetPath(g);
                    var bp = AssetDatabase.LoadAssetAtPath<BuildProfile>(p);
                    list.Add(new Dictionary<string, object>
                    {
                        { "path", p }, { "name", bp ? bp.name : null },
                        { "defines", bp ? bp.scriptingDefines : null },
                        { "override_scenes", bp && bp.overrideGlobalScenes },
                    });
                }
                var active = BuildProfile.GetActiveBuildProfile();
                return new Dictionary<string, object>
                {
                    { "profiles", list }, { "active", active ? AssetDatabase.GetAssetPath(active) : "platform profile (" + EditorUserBuildSettings.activeBuildTarget + ")" },
                };
            });
        }
    }
}
