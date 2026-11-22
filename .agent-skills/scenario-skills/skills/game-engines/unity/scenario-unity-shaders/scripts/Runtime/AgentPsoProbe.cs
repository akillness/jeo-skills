// AgentKit.Rendering v0.2 (scenario-unity-shaders skill, 2026-09-24). PSO warm-up with GraphicsStateCollection
// (Unity 6, experimental API, UnityEngine.Experimental.Rendering) plus the proof that it worked.
//
// Shipping use: put the component in the boot or loading scene, `content` = the gameplay root, inactive in
// the scene. On Start it loads StreamingAssets/<folder>/<platform>_<api>.graphicsstate (ONE collection per
// graphics API and platform: 6.3 Manual, "Trace a new PSO data collection"), refuses a collection traced on
// another API or platform, warms it up (all at once, or warmupPerFrame PSOs per frame behind the loading
// screen), then activates `content`.
//
// Test probe (development player, command line):
//   <player> -agentPso trace|cold|warm -agentPsoOut /abs/out.json [-agentPsoFile /abs/x.graphicsstate]
//            [-agentPsoFrames 60] [-logFile /abs/player.log]
//   trace: BeginTrace at boot, EndTrace + SaveToFile after the gameplay frames (tracing needs a development build).
//   cold : no warm-up.   warm: LoadFromFile + warm-up before gameplay.
//   ship : the shipping path (the file for THIS platform and API found in StreamingAssets/<folder>/), probed.
//   Every mode counts the samples of the Shader.CreateGPUProgram and CreateGraphicsGraphicsPipelineImpl markers
//   (6.3 Manual, "Warm up PSOs") during the gameplay frames with ProfilerRecorder, logs AGENT_PSO
//   gameplay_start / gameplay_end around them (so "Compiled Shader:" lines from Log Shader Compilation can be
//   counted in the player log), lists the marker names this platform registers, writes JSON and quits.
// Without -agentPso only the shipping behaviour runs. Run in Unity 6000.3.21f1 on 2026-09-24:
// tests/code/unity-shaders/test_live_pso.py (macOS development player, Metal).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Unity.Profiling;
using Unity.Profiling.LowLevel.Unsafe;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

namespace AgentKit.Rendering
{
    public class AgentPsoProbe : MonoBehaviour
    {
        [Tooltip("Gameplay root, inactive in the scene: activated after the warm-up.")]
        public GameObject content;
        [Tooltip("0 = WarmUp everything in one frame; N > 0 = WarmUpProgressively(N) per frame (smoother loading screen).")]
        public int warmupPerFrame = 0;
        [Tooltip("Folder under StreamingAssets holding <platform>_<api>.graphicsstate files.")]
        public string folder = "PSO";
        [Tooltip("Frames rendered before content activates (the engine's own passes create their PSOs here).")]
        public int loadingFrames = 5;

        // GPU program creation, then PSO creation: CreateGraphicsGraphicsPipelineImpl is the 6.3 Manual's name (Vulkan,
        // DX12); on Metal it does not exist and PSOs show as CreateGraphicsPipelineAsync /
        // GpuProgramMetal.CreateCachedPipelineAsync (observed on 6000.3.21f1, macOS player).
        static readonly string[] k_Markers = { "Shader.CreateGPUProgram", "CreateGraphicsGraphicsPipelineImpl",
                                               "CreateGraphicsPipelineAsync", "GpuProgramMetal.CreateCachedPipelineAsync" };
        static readonly string[] k_Discover = { "GPUProgram", "Pipeline", "PSO", "GraphicsState", "WarmUp", "Shader.Create" };

        readonly Dictionary<string, object> m_Report = new Dictionary<string, object>();

        public static string CollectionName(RuntimePlatform platform, GraphicsDeviceType api, string quality = null)
        {
            var n = platform + "_" + api;
            if (!string.IsNullOrEmpty(quality)) n += "_" + new string(quality.Where(char.IsLetterOrDigit).ToArray());
            return n + ".graphicsstate";
        }

        static string Arg(string flag)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == flag) return a[i + 1];
            return null;
        }

        IEnumerator Start()
        {
            string mode = Arg("-agentPso");
            string outPath = Arg("-agentPsoOut");
            int frames = int.TryParse(Arg("-agentPsoFrames"), out var f) ? f : 60;
            string shipped = Path.Combine(Application.streamingAssetsPath, folder,
                             CollectionName(Application.platform, SystemInfo.graphicsDeviceType));
            string file = (mode == null || mode == "ship") ? shipped : (Arg("-agentPsoFile") ?? shipped);
            m_Report["mode"] = mode ?? "ship";
            m_Report["api"] = SystemInfo.graphicsDeviceType.ToString();
            m_Report["platform"] = Application.platform.ToString();
            m_Report["quality"] = QualitySettings.names[QualitySettings.GetQualityLevel()];
            m_Report["development"] = Debug.isDebugBuild;
            m_Report["unity"] = Application.unityVersion;
            m_Report["file"] = file;
            if (content) content.SetActive(false);

            GraphicsStateCollection trace = null;
            if (mode == "trace")
            {
                trace = new GraphicsStateCollection();
                m_Report["trace_started"] = trace.BeginTrace();       // false in a non-development player
            }
            for (int i = 0; i < loadingFrames; i++) yield return null;   // loading screen frames

            if (mode == "warm" || ((mode == null || mode == "ship") && File.Exists(file)))
                yield return WarmUp(file);

            var recorders = StartRecorders(frames + 8);
            Debug.Log("AGENT_PSO gameplay_start");
            if (content) content.SetActive(true);
            float worst = 0f;
            for (int i = 0; i < frames; i++)
            {
                yield return null;
                worst = Mathf.Max(worst, Time.unscaledDeltaTime);
            }
            Debug.Log("AGENT_PSO gameplay_end");
            m_Report["gameplay_frames"] = frames;
            m_Report["gameplay_worst_frame_ms"] = Math.Round(worst * 1000.0, 2);
            var markers = new Dictionary<string, object>();
            long pipelines = 0;
            var pipelineMarkers = new List<object>();
            foreach (var kv in recorders)
            {
                var r = kv.Value;
                long count = 0, ns = 0;
                bool valid = r.Valid;
                if (valid)
                    for (int i = 0; i < r.Count; i++) { var s = r.GetSample(i); count += s.Count; ns += s.Value; }
                markers[kv.Key] = new Dictionary<string, object> { { "valid", valid }, { "count", count }, { "ms", Math.Round(ns / 1e6, 3) } };
                if (kv.Key == k_Markers[0])
                {
                    m_Report["gameplay_create_gpu_program"] = count;
                    m_Report["gameplay_create_gpu_program_ms"] = Math.Round(ns / 1e6, 3);
                }
                else if (valid) { pipelines += count; pipelineMarkers.Add(kv.Key); }
                r.Dispose();
            }
            m_Report["gameplay_markers"] = markers;
            m_Report["gameplay_create_pipeline"] = pipelineMarkers.Count > 0 ? (object)pipelines : null;   // null = no PSO marker on this API
            m_Report["pipeline_markers"] = pipelineMarkers;
            m_Report["marker_names"] = DiscoverMarkers();

            if (trace != null)
            {
                trace.EndTrace();
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                bool saved = trace.SaveToFile(file);
                m_Report["trace"] = new Dictionary<string, object>
                {
                    { "saved", saved }, { "file", file }, { "variants", trace.variantCount },
                    { "graphics_states", trace.totalGraphicsStateCount }, { "api", trace.graphicsDeviceType.ToString() },
                    { "platform", trace.runtimePlatform.ToString() }, { "quality", trace.qualityLevelName },
                    { "bytes", saved && File.Exists(file) ? new FileInfo(file).Length : 0 },
                };
            }
            if (!string.IsNullOrEmpty(outPath))
            {
                File.WriteAllText(outPath, ToJson(m_Report));
                Application.Quit(0);
            }
        }

        IEnumerator WarmUp(string file)
        {
            var info = new Dictionary<string, object> { { "file", file } };
            m_Report["warmup"] = info;
            var gsc = new GraphicsStateCollection();
            bool loaded = File.Exists(file) && gsc.LoadFromFile(file);
            info["loaded"] = loaded;
            if (!loaded) yield break;
            info["collection_api"] = gsc.graphicsDeviceType.ToString();
            info["collection_platform"] = gsc.runtimePlatform.ToString();
            info["variants"] = gsc.variantCount;
            info["graphics_states"] = gsc.totalGraphicsStateCount;
            bool match = gsc.graphicsDeviceType == SystemInfo.graphicsDeviceType && gsc.runtimePlatform == Application.platform;
            info["api_match"] = match;
            if (!match) { Debug.LogWarning("AgentPsoProbe: collection traced on " + gsc.graphicsDeviceType + "/" + gsc.runtimePlatform + ", running " + SystemInfo.graphicsDeviceType + "/" + Application.platform + ": skipped"); yield break; }
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int steps = 0;
            if (warmupPerFrame <= 0) { gsc.WarmUp(default).Complete(); steps = 1; }
            else
                while (!gsc.isWarmedUp && steps < 100000)
                {
                    gsc.WarmUpProgressively(warmupPerFrame, default).Complete();
                    steps++;
                    yield return null;                                      // one loading-screen frame per batch
                }
            sw.Stop();
            info["warmed_up"] = gsc.isWarmedUp;
            info["completed"] = gsc.completedWarmupCount;
            info["frames"] = steps;
            info["ms"] = Math.Round(sw.Elapsed.TotalMilliseconds, 2);
        }

        static Dictionary<string, ProfilerRecorder> StartRecorders(int capacity)
        {
            var handles = new List<ProfilerRecorderHandle>();
            ProfilerRecorderHandle.GetAvailable(handles);
            var res = new Dictionary<string, ProfilerRecorder>();
            var opts = ProfilerRecorderOptions.Default | ProfilerRecorderOptions.StartImmediately;
            foreach (var name in k_Markers)
            {
                var h = handles.FirstOrDefault(x => ProfilerRecorderHandle.GetDescription(x).Name == name);
                res[name] = h.Valid ? new ProfilerRecorder(h, capacity, opts)
                                    : ProfilerRecorder.StartNew(ProfilerCategory.Render, name, capacity, opts);
            }
            return res;
        }

        static List<object> DiscoverMarkers()
        {
            var handles = new List<ProfilerRecorderHandle>();
            ProfilerRecorderHandle.GetAvailable(handles);
            return handles.Select(h => ProfilerRecorderHandle.GetDescription(h))
                          .Where(d => k_Discover.Any(k => d.Name.IndexOf(k, StringComparison.OrdinalIgnoreCase) >= 0))
                          .Select(d => (object)(d.Category.Name + "/" + d.Name)).Distinct().OrderBy(x => x).Take(80).ToList();
        }

        // Small JSON writer (no package dependency in the player).
        static string ToJson(object o)
        {
            var sb = new StringBuilder();
            Write(sb, o);
            return sb.ToString();
        }

        static void Write(StringBuilder sb, object o)
        {
            switch (o)
            {
                case null: sb.Append("null"); break;
                case string s: sb.Append('"').Append(s.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append('"'); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case IDictionary<string, object> d:
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in d) { if (!first) sb.Append(','); first = false; Write(sb, kv.Key); sb.Append(':'); Write(sb, kv.Value); }
                    sb.Append('}');
                    break;
                case IEnumerable<object> list:
                    sb.Append('[');
                    bool f1 = true;
                    foreach (var x in list) { if (!f1) sb.Append(','); f1 = false; Write(sb, x); }
                    sb.Append(']');
                    break;
                case IFormattable n: sb.Append(n.ToString(null, CultureInfo.InvariantCulture)); break;
                default: Write(sb, o.ToString()); break;
            }
        }
    }
}
