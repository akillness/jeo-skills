// scenario-unity-performance v0.2 (2026-09-24). Player builds for measurement and for size work:
// scripting backend, stripping and IL2CPP code generation per build, Frame Timing Stats on for
// benchmark players, and a size breakdown from the BuildReport (what the Build Report section of
// the Editor.log shows, as data).
//
// Launch through ut_run with the platform fixed at launch (switches inside a batch job do nothing):
//   ut_run.run_method(P, "AgentKit.Performance.PerfBuild.Build",
//       {"target": "StandaloneOSX", "out": "Builds/macOS/Bench.app", "scenes": [...],
//        "development": true, "backend": "Mono2x"|"IL2CPP", "stripping": "Minimal"|"Medium"|"High",
//        "il2cpp_codegen": "OptimizeSpeed"|"OptimizeSize", "frame_timing": true, "restore": true},
//       build_target="StandaloneOSX", timeout=3600)
// Result: AgentBuild.Summarize(...) (result, total_size_mb, output_on_disk_mb, total_time_s, steps,
// largest_files) + "breakdown": packed asset bytes by type and the top source assets, and output
// files by role (managed DLLs, IL2CPP GameAssembly, data files).
//
// Expert rules behind the options (sources in references/sources.md):
// - IL2CPP for shipped players (startup, runtime speed); Mono for local iteration (6.3 Manual;
//   console/PC e-book p. 50). IL2CPP players build only on the target's OS (macOS here).
// - "Optimize for code size and build time" for CI and dev builds; "runtime speed" for release.
// - Managed Stripping: Minimal is the IL2CPP default, Low is "marked for future deprecation",
//   High only with a smoke test and link.xml / [Preserve] (6.3 Manual).
// - Benchmark players: Development Build, Autoconnect Profiler OFF (it adds up to 10 s of startup,
//   profiling e-book p. 47), Frame Timing Stats ON (FrameTimingManager / "GPU Frame Time").
// Settings changed for one build are restored afterwards unless restore=false.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace AgentKit.Performance
{
    public static class PerfBuild
    {
        public static void Build()
        {
            AgentJob.Run(() =>
            {
                var targetName = AgentJob.Str("target", EditorUserBuildSettings.activeBuildTarget.ToString());
                if (!Enum.TryParse(targetName, true, out BuildTarget target))
                    throw new ArgumentException("unknown BuildTarget '" + targetName + "'");
                if (EditorUserBuildSettings.activeBuildTarget != target)
                    AgentJob.Warn("active target is " + EditorUserBuildSettings.activeBuildTarget + ": launch with -buildTarget " + target);
                var group = BuildPipeline.GetBuildTargetGroup(target);
                var nbt = NamedBuildTarget.FromBuildTargetGroup(group);

                // --- remember, then apply the per-build settings
                var prevBackend = PlayerSettings.GetScriptingBackend(nbt);
                var prevStrip = PlayerSettings.GetManagedStrippingLevel(nbt);
                var prevCodegen = PlayerSettings.GetIl2CppCodeGeneration(nbt);
                var prevTiming = PlayerSettings.enableFrameTimingStats;
                var applied = new Dictionary<string, object>();
                if (AgentJob.Has("backend"))
                {
                    var b = (ScriptingImplementation)Enum.Parse(typeof(ScriptingImplementation), AgentJob.Str("backend"), true);
                    PlayerSettings.SetScriptingBackend(nbt, b);
                    applied["backend"] = b.ToString();
                }
                if (AgentJob.Has("stripping"))
                {
                    var s = (ManagedStrippingLevel)Enum.Parse(typeof(ManagedStrippingLevel), AgentJob.Str("stripping"), true);
                    PlayerSettings.SetManagedStrippingLevel(nbt, s);
                    applied["stripping"] = s.ToString();
                }
                if (AgentJob.Has("il2cpp_codegen"))
                {
                    var c = (Il2CppCodeGeneration)Enum.Parse(typeof(Il2CppCodeGeneration), AgentJob.Str("il2cpp_codegen"), true);
                    PlayerSettings.SetIl2CppCodeGeneration(nbt, c);
                    applied["il2cpp_codegen"] = c.ToString();
                }
                PlayerSettings.enableFrameTimingStats = AgentJob.Bool("frame_timing", true);

                var opts = BuildOptions.None;
                if (AgentJob.Bool("development")) opts |= BuildOptions.Development;
                if (AgentJob.Bool("detailed")) opts |= BuildOptions.DetailedBuildReport;
                foreach (var o in AgentJob.List("options"))
                    if (Enum.TryParse(o.ToString(), true, out BuildOptions bo)) opts |= bo;
                var scenes = AgentJob.List("scenes").Select(s => s.ToString()).ToArray();
                if (scenes.Length == 0) scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
                if (scenes.Length == 0) throw new InvalidOperationException("no scenes: pass args.scenes");
                var outPath = AgentJob.ResolvePath(AgentJob.Str("out") ?? AgentBuild.DefaultOut(target));
                Directory.CreateDirectory(Path.GetDirectoryName(outPath.TrimEnd('/')) ?? ".");

                var usedBackend = PlayerSettings.GetScriptingBackend(nbt).ToString();
                var usedStrip = PlayerSettings.GetManagedStrippingLevel(nbt).ToString();
                var usedCodegen = PlayerSettings.GetIl2CppCodeGeneration(nbt).ToString();
                BuildReport report;
                try
                {
                    report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                    {
                        scenes = scenes, locationPathName = outPath, target = target, targetGroup = group, options = opts,
                    });
                }
                finally
                {
                    if (AgentJob.Bool("restore", true))
                    {
                        PlayerSettings.SetScriptingBackend(nbt, prevBackend);
                        PlayerSettings.SetManagedStrippingLevel(nbt, prevStrip);
                        PlayerSettings.SetIl2CppCodeGeneration(nbt, prevCodegen);
                        PlayerSettings.enableFrameTimingStats = prevTiming;
                        AssetDatabase.SaveAssets();
                    }
                }
                var summary = AgentBuild.Summarize(report, outPath, scenes, target);
                summary["applied"] = applied;
                // Summarize reads PlayerSettings after the restore: report what the build used
                summary["scripting_backend"] = usedBackend;
                summary["managed_stripping"] = usedStrip;
                summary["il2cpp_code_generation"] = usedCodegen;
                // BuildReport.totalSize (and the Editor.log "Complete build size") include IL2CPP's
                // <Name>_BackUpThisFolder_ButDontShipItWithYourGame folder (symbols, generated C++):
                // judge size on output_on_disk_mb, the shipped player (observed 1,907.8 MB vs 177.9 MB)
                summary["size_note"] = "use output_on_disk_mb; total_size_mb counts non-shipped IL2CPP backup and debug folders";
                summary["breakdown"] = Breakdown(report, AgentJob.Int("top", 15));
                // v0.2: which Build Profile was active. With a platform profile active, an
                // EditorUserBuildSettings change applies to all platform profiles (6.3 Manual,
                // Shared build settings); this job passes flags through BuildPlayerOptions instead.
                try
                {
                    var bp = Type.GetType("UnityEditor.Build.Profile.BuildProfile, UnityEditor.CoreModule");
                    var act = bp?.GetMethod("GetActiveBuildProfile", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)?.Invoke(null, null) as UnityEngine.Object;
                    summary["active_build_profile"] = act != null ? AssetDatabase.GetAssetPath(act) : "(platform profile: shared settings)";
                }
                catch (Exception) { summary["active_build_profile"] = "?"; }
                if (report.summary.result != BuildResult.Succeeded)
                {
                    AgentJob.Fail("build " + report.summary.result, summary);
                    return null;
                }
                return summary;
            });
        }

        static string Category(string path, Type type)
        {
            var t = type != null ? type.Name : "";
            if (t.Contains("Texture") || t == "Sprite" || t == "Cubemap") return "Textures";
            if (t == "Mesh") return "Meshes";
            if (t == "Shader" || t == "ComputeShader" || t == "ShaderVariantCollection") return "Shaders";
            if (t == "AnimationClip" || t.Contains("Animator") || t == "Avatar") return "Animations";
            if (t == "AudioClip") return "Sounds";
            if (t == "Font" || t == "TMP_FontAsset") return "Fonts";
            if (t == "MonoScript") return "Scripts (metadata)";
            if (t == "Material") return "Materials";
            if (string.IsNullOrEmpty(path) || path.StartsWith("Resources/unity_builtin_extra") || path.StartsWith("Library/unity default resources"))
                return "Built-in resources";
            return "Other assets";
        }

        public static Dictionary<string, object> Breakdown(BuildReport report, int top = 15)
        {
            var byCat = new Dictionary<string, ulong>();
            var byType = new Dictionary<string, ulong>();
            var bySource = new Dictionary<string, ulong>();
            ulong packedTotal = 0;
            foreach (var pa in report.packedAssets)
            {
                foreach (var c in pa.contents)
                {
                    var tn = c.type != null ? c.type.Name : "?";
                    var cat = Category(c.sourceAssetPath, c.type);
                    byCat[cat] = (byCat.TryGetValue(cat, out var v1) ? v1 : 0) + c.packedSize;
                    byType[tn] = (byType.TryGetValue(tn, out var v2) ? v2 : 0) + c.packedSize;
                    var src = string.IsNullOrEmpty(c.sourceAssetPath) ? "(built-in)" : c.sourceAssetPath;
                    bySource[src] = (bySource.TryGetValue(src, out var v3) ? v3 : 0) + c.packedSize;
                    packedTotal += c.packedSize;
                }
            }
            var byRole = new Dictionary<string, long>();
            try
            {
                foreach (var f in report.GetFiles())
                    byRole[f.role] = (byRole.TryGetValue(f.role, out var v) ? v : 0) + (long)f.size;
            }
            catch (Exception) { }
            double Mb(double b) => Math.Round(b / 1048576.0, 3);
            List<object> Table<T>(Dictionary<string, T> d, Func<T, double> val, int n) =>
                d.OrderByDescending(kv => val(kv.Value)).Take(n)
                 .Select(kv => (object)new Dictionary<string, object> { { "name", kv.Key }, { "mb", Mb(val(kv.Value)) } }).ToList();
            return new Dictionary<string, object>
            {
                { "packed_assets_mb", Mb(packedTotal) },
                { "by_category", Table(byCat, x => (double)x, 20) },
                { "by_type", Table(byType, x => (double)x, 15) },
                { "top_assets", Table(bySource, x => (double)x, top) },
                { "files_by_role", Table(byRole, x => (double)x, 20) },
            };
        }
    }
}
