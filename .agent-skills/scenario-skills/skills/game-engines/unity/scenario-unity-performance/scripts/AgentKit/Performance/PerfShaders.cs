// scenario-unity-performance v0.2 (2026-09-24). Shader and PSO warm-up support on the Editor side.
//
//   ut_run.run_method(P, "AgentKit.Performance.PerfShaders.InspectGraphicsState",
//                     {"file": "/abs/Bench.graphicsstate"}, graphics=True)
//   ut_run.run_method(P, "AgentKit.Performance.PerfShaders.SetLogShaderCompilation", {"on": true})
//
// Workflow (Nicolas Borromeo CmD8MVGkDxQ [00:11:14]-[00:14:35]; Unity graphics PMs Oc6T4hh5gaI
// [frame 00:05:33]; 6.3 Manual "Trace and manage PSO data collections", "Warm up PSOs"):
// 1. Hitch = Shader.CreateGPUProgram (variant compile) or CreateGraphicsGraphicsPipelineImpl (PSO)
//    on first use. On Metal, Vulkan and DX12 the driver compiles per pipeline state, so a
//    ShaderVariantCollection warm-up alone misses states: trace a GraphicsStateCollection.
// 2. Trace in a DEVELOPMENT player (tracing is not supported in release players), one collection
//    per graphics API and platform: BeginTrace at startup, EndTrace + SaveToFile at the end
//    (PerfProbe -perfTraceGsc does this). The API is experimental in 6.3.
// 3. Ship the .graphicsstate (for example StreamingAssets), then during loading
//    LoadFromFile + WarmUp (JobHandle; Complete() for synchronous) or WarmUpProgressively(n).
// 4. Prove it: zero Shader.CreateGPUProgram / PSO-creation samples in gameplay frames.
// Log Shader Compilation (GraphicsSettings.logWhenShaderIsCompiled) lists compiled variants in the
// player log: the input for a ShaderVariantCollection and for IPreprocessShaders stripping.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

namespace AgentKit.Performance
{
    public static class PerfShaders
    {
        public static void InspectGraphicsState()
        {
            AgentJob.Run(() =>
            {
                var file = AgentJob.ResolvePath(AgentJob.Str("file"));
                if (string.IsNullOrEmpty(file) || !File.Exists(file)) throw new FileNotFoundException("no .graphicsstate at " + file);
                var gsc = new GraphicsStateCollection();
                bool ok = gsc.LoadFromFile(file);
                var variants = new List<GraphicsStateCollection.ShaderVariant>();
                gsc.GetVariants(variants);
                var shaders = variants.Where(v => v.shader != null).GroupBy(v => v.shader.name)
                    .Select(g => (object)new Dictionary<string, object> { { "shader", g.Key }, { "variants", g.Count() } })
                    .OrderByDescending(d => (int)((Dictionary<string, object>)d)["variants"]).Take(20).ToList();
                return new Dictionary<string, object>
                {
                    { "file", file }, { "loaded", ok }, { "bytes", new FileInfo(file).Length },
                    { "variants", gsc.variantCount }, { "graphics_states", gsc.totalGraphicsStateCount },
                    { "graphics_api", gsc.graphicsDeviceType.ToString() }, { "platform", gsc.runtimePlatform.ToString() },
                    { "quality_level", gsc.qualityLevelName }, { "version", gsc.version }, { "by_shader", shaders },
                    { "editor_api", SystemInfo.graphicsDeviceType.ToString() },
                };
            });
        }

        public static void SetLogShaderCompilation()
        {
            AgentJob.Run(() =>
            {
                bool before = GraphicsSettings.logWhenShaderIsCompiled;
                GraphicsSettings.logWhenShaderIsCompiled = AgentJob.Bool("on", true);
                UnityEditor.AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "before", before }, { "after", GraphicsSettings.logWhenShaderIsCompiled } };
            });
        }

        // v0.2: the used-variant list from a "Log Shader Compilation" playthrough, turned into a
        // ShaderVariantCollection (Borromeo CmD8MVGkDxQ [00:12:20]: log, play everything, convert,
        // WarmUp; the same list is the allowlist for IPreprocessShaders stripping [00:48:28]).
        // The SVC is the warm-up for APIs without PSOs (DX11, OpenGL ES) and the stripping input
        // everywhere; on Metal, Vulkan and DX12 warm the traced GraphicsStateCollection instead.
        //   ut_run.run_method(P, "AgentKit.Performance.PerfShaders.SvcFromLog",
        //                     {"log": "/abs/Player.log", "out": "Assets/Perf/Used.shadervariants"})
        static readonly System.Text.RegularExpressions.Regex k_LogLine = new System.Text.RegularExpressions.Regex(
            @"(?:Compiled [Ss]hader|Uploaded shader variant to the GPU driver|Created GPU program for shader):?\s*(?<shader>[^,]+),\s*pass:\s*(?<pass>[^,]*),\s*stage:\s*(?<stage>[^,]+),\s*keywords\s*(?<kw>.*?)(?:,\s*time:.*)?$");

        public static void SvcFromLog()
        {
            AgentJob.Run(() =>
            {
                var log = AgentJob.ResolvePath(AgentJob.Str("log"));
                if (string.IsNullOrEmpty(log) || !File.Exists(log)) throw new FileNotFoundException("no player log at " + log);
                var outPath = AgentJob.Str("out", "Assets/Perf/UsedVariants.shadervariants");
                var entries = new Dictionary<string, HashSet<string>>();   // "shader|pass" -> keyword sets
                int lines = 0;
                foreach (var line in File.ReadLines(log))
                {
                    var m = k_LogLine.Match(line.Trim());
                    if (!m.Success) continue;
                    lines++;
                    var kw = m.Groups["kw"].Value.Trim();
                    if (kw.StartsWith("<no keywords>") || kw == "<none>") kw = "";
                    // 6000.3.21f1 prints "Uploaded shader variant to the GPU driver: <Shader> (instance 0x15A), pass: ..., time: 56 ms"
                    var shaderName = System.Text.RegularExpressions.Regex.Replace(m.Groups["shader"].Value, @"\s*\(instance [^)]*\)\s*$", "").Trim();
                    var key = shaderName + "|" + m.Groups["pass"].Value.Trim();
                    if (!entries.TryGetValue(key, out var set)) entries[key] = set = new HashSet<string>();
                    set.Add(string.Join(" ", kw.Split(new[] { ' ' }, System.StringSplitOptions.RemoveEmptyEntries).OrderBy(x => x)));
                }
                var svc = new ShaderVariantCollection();
                int added = 0, failed = 0;
                var missingShaders = new HashSet<string>();
                var fails = new List<string>();
                foreach (var kv in entries)
                {
                    var parts = kv.Key.Split('|');
                    var shader = Shader.Find(parts[0]);
                    if (shader == null) { missingShaders.Add(parts[0]); continue; }
                    foreach (var kws in kv.Value)
                    {
                        var keywords = kws.Length == 0 ? new string[0] : kws.Split(' ');
                        bool ok = false;
                        foreach (var pt in new[] { PassType.ScriptableRenderPipeline, PassType.ScriptableRenderPipelineDefaultUnlit, PassType.Normal, PassType.ShadowCaster })
                        {
                            try { ok = svc.Add(new ShaderVariantCollection.ShaderVariant(shader, pt, keywords)); if (ok) break; }
                            catch (System.ArgumentException) { }
                        }
                        if (ok) added++; else { failed++; if (fails.Count < 10) fails.Add(kv.Key + " [" + kws + "]"); }
                    }
                }
                Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(AgentJob.ProjectRoot, outPath)));
                UnityEditor.AssetDatabase.DeleteAsset(outPath);
                UnityEditor.AssetDatabase.CreateAsset(svc, outPath);
                UnityEditor.AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "log", log }, { "log_lines_matched", lines }, { "shader_passes", entries.Count },
                    { "variants_added", added }, { "variants_failed", failed }, { "failed_samples", fails },
                    { "missing_shaders", missingShaders.ToList() }, { "svc", outPath },
                    { "svc_shaders", svc.shaderCount }, { "svc_variants", svc.variantCount },
                };
            });
        }
    }

    /// <summary>v0.2: build-time shader variant report, and opt-in stripping against a used-variant
    /// ShaderVariantCollection. Inert unless the build process has AGENTKIT_SHADER_REPORT (a JSON
    /// path) or AGENTKIT_SHADER_STRIP_SVC (an SVC asset path) in its environment:
    ///   ut_run.run_method(P, "AgentKit.Performance.PerfBuild.Build", {...}, env={"AGENTKIT_SHADER_REPORT": "/abs/variants.json",
    ///                     "AGENTKIT_SHADER_STRIP_SVC": "Assets/Perf/UsedVariants.shadervariants"})
    /// Stripping touches ONLY shaders that appear in the SVC (a shader absent from it is kept whole)
    /// and only SRP/forward passes whose keyword set is absent; every other pass is kept. Loaded
    /// shaders keep all their variants in RAM until compiled (Borromeo CmD8MVGkDxQ [00:46:49]), so
    /// the variant count is a memory and build-time number, not only a disk number.</summary>
    public class PerfShaderVariantReport : UnityEditor.Build.IPreprocessShaders, UnityEditor.Build.IPostprocessBuildWithReport
    {
        public int callbackOrder => 100;
        static Dictionary<string, int[]> s_Counts;          // shader -> {in, kept}
        static Dictionary<string, HashSet<string>> s_Allow;  // shader -> "pass|sorted keywords"
        static bool s_Init;

        static void Init()
        {
            if (s_Init) return;
            s_Init = true;
            s_Counts = new Dictionary<string, int[]>();
            var svcPath = System.Environment.GetEnvironmentVariable("AGENTKIT_SHADER_STRIP_SVC");
            if (string.IsNullOrEmpty(svcPath)) return;
            var svc = UnityEditor.AssetDatabase.LoadAssetAtPath<ShaderVariantCollection>(svcPath);
            if (svc == null) { Debug.LogWarning("[AgentKit] strip SVC not found: " + svcPath); return; }
            s_Allow = new Dictionary<string, HashSet<string>>();
            var so = new UnityEditor.SerializedObject(svc);
            var shaders = so.FindProperty("m_Shaders");
            for (int i = 0; i < shaders.arraySize; i++)
            {
                var el = shaders.GetArrayElementAtIndex(i);
                var sh = el.FindPropertyRelative("first").objectReferenceValue as Shader;
                if (sh == null) continue;
                var set = new HashSet<string>();
                var variants = el.FindPropertyRelative("second.variants");
                for (int v = 0; v < variants.arraySize; v++)
                {
                    var kw = variants.GetArrayElementAtIndex(v).FindPropertyRelative("keywords").stringValue ?? "";
                    set.Add(string.Join(" ", kw.Split(new[] { ' ' }, System.StringSplitOptions.RemoveEmptyEntries).OrderBy(x => x)));
                }
                s_Allow[sh.name] = set;
            }
        }

        static bool Enabled => !string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("AGENTKIT_SHADER_REPORT"))
                               || !string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("AGENTKIT_SHADER_STRIP_SVC"));

        public void OnProcessShader(Shader shader, UnityEditor.Rendering.ShaderSnippetData snippet, IList<UnityEditor.Rendering.ShaderCompilerData> data)
        {
            if (!Enabled) return;
            Init();
            if (!s_Counts.TryGetValue(shader.name, out var c)) s_Counts[shader.name] = c = new int[2];
            c[0] += data.Count;
            // only passes that were logged at runtime can be judged; shadow, depth and meta passes are kept
            bool judge = s_Allow != null && s_Allow.TryGetValue(shader.name, out var allow)
                         && (snippet.passType == PassType.ScriptableRenderPipeline || snippet.passType == PassType.ScriptableRenderPipelineDefaultUnlit);
            if (judge)
            {
                allow = s_Allow[shader.name];
                for (int i = data.Count - 1; i >= 0; i--)
                {
                    var kws = data[i].shaderKeywordSet.GetShaderKeywords().Select(k => k.name).OrderBy(x => x);
                    if (!allow.Contains(string.Join(" ", kws))) data.RemoveAt(i);
                }
            }
            c[1] += data.Count;
        }

        public void OnPostprocessBuild(UnityEditor.Build.Reporting.BuildReport report)
        {
            var path = System.Environment.GetEnvironmentVariable("AGENTKIT_SHADER_REPORT");
            if (string.IsNullOrEmpty(path) || s_Counts == null) return;
            var rows = s_Counts.OrderByDescending(kv => kv.Value[0]).Select(kv =>
                "{\"shader\":\"" + kv.Key.Replace("\"", "'") + "\",\"variants_in\":" + kv.Value[0] + ",\"variants_kept\":" + kv.Value[1] + "}");
            File.WriteAllText(path, "{\"stripping\":" + (s_Allow != null ? "true" : "false") + ",\"total_in\":" + s_Counts.Values.Sum(v => v[0])
                + ",\"total_kept\":" + s_Counts.Values.Sum(v => v[1]) + ",\"shaders\":[" + string.Join(",", rows) + "]}");
            s_Init = false; s_Counts = null; s_Allow = null;
        }
    }
}
