// scenario-unity-performance v0.2 (2026-09-24). Player-side frame recorder: the development-player
// measurement the experts ask for, with no Profiler window and no Editor attached.
//
// Inert unless the player is launched with -perfProbe, so it can stay in any project:
//   <Game>.app/Contents/MacOS/<Game> -batchmode -perfProbe /abs/out.csv
//       [-perfFrames 300] [-perfWarmup 60] [-perfScene <scene name>] [-perfOffscreen 1920x1080]
//       [-perfTargetFps -1] [-perfTraceGsc /abs/x.graphicsstate] [-perfWarmGsc /abs/x.graphicsstate]
//       [-perfSnapshot /abs/x.snap] [-perfShot /abs/last_frame.png] [-perfRender manual|auto] [-perfNoQuit]
//       [-perfMarkers "Spawn.Burst,Spawned Objects"] [-perfSpikeAt 60 -perfSpikeMs 100]
// Writes <out>.csv (one row per frame) and <out>.json (summary), then Application.Quit().
// v0.2 (2026-09-24 refactor): -perfMarkers records YOUR ProfilerMarkers and ProfilerCounterValues
// per frame (column mk_<name>, plus mk_<name>_calls for time markers), so a spike frame is
// attributed to the streaming or spawn system that caused it (Peter Hall _cV1B2hqXGI [00:18:39]
// to [00:19:12]: keep markers in code, Deep Profile only to find what fills a gap); physics_steps
// counts Physics.Simulate per frame (catch-up after a spike; -perfSpikeAt/-perfSpikeMs forces
// one); mesh_cook_ms is runtime MeshCollider cooking; cpu_present_wait_ms comes from
// FrameTimingManager (the Rendering Debugger's "CPU Present Wait", Oc6T4hh5gaI [frame 00:18:31]);
// the JSON lists the device (GPU name, VRAM, RAM, battery: a laptop on battery or on its
// integrated GPU measures a different machine [added]) and the largest RenderTextures.
// Nothing is formatted per frame: values go to preallocated buffers and the CSV is written once
// at the end, because a monitor that builds strings every frame pollutes its own GC reading
// (git-amend ham_w48aRJ4 [00:11:30]; observed baseline here 104 B and 2 allocations per frame).
//
// Why these choices (sources in skills/scenario-unity-performance/references/sources.md):
// - Frame budget in ms from a development player, not the Editor (profiling e-book p. 18).
// - VSync off while measuring (e-book p. 49): vSyncCount = 0, targetFrameRate from -perfTargetFps.
// - Batch mode has no screen, and a batch-mode PLAYER skips camera rendering altogether (observed:
//   0 draw calls even with a target texture): the probe submits Camera.main to an offscreen target
//   every LateUpdate (RenderPipeline.SubmitRenderRequest), -perfShot saves the last frame to LOOK at.
//   Windowed runs (no -batchmode) render normally; -perfRender auto keeps the normal path.
// - Counters are found by name through ProfilerRecorderHandle.GetAvailable, so a marker that
//   does not exist on this platform is reported "missing", never faked.
// - GC.Alloc: Count = allocations per frame; its time column exists only to show that the
//   sampled duration is artificial (e-book p. 27, Peter Hall _cV1B2hqXGI [frame 00:21:52]).
// - Shader.CreateGPUProgram / CreateGraphicsGraphicsPipelineImpl counts per frame show first-use
//   shader and PSO compiles (6.3 Manual, Warm up PSOs); GraphicsStateCollection tracing works
//   only in development players (6.3 Manual) and is experimental in 6.3.
// Frame Timing Stats must be on for "CPU Total Frame Time"/"GPU Frame Time" in a player
// (PlayerSettings.enableFrameTimingStats; PerfPlayer.BuildBenchmark sets it).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Unity.Profiling;
using Unity.Profiling.LowLevel.Unsafe;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace AgentKit.Performance
{
    public sealed class PerfProbe : MonoBehaviour
    {
        struct Col
        {
            public string column, stat, unit, field; // field: "value" or "count"
            public Col(string c, string s, string u, string f = "value") { column = c; stat = s; unit = u; field = f; }
        }

        static readonly Col[] k_Cols =
        {
            new Col("cpu_frame_ms", "CPU Total Frame Time", "ns"),
            new Col("cpu_main_frame_ms", "CPU Main Thread Frame Time", "ns"),
            new Col("cpu_render_frame_ms", "CPU Render Thread Frame Time", "ns"),
            new Col("gpu_frame_ms", "GPU Frame Time", "ns"),
            new Col("main_thread_ms", "Main Thread", "ns"),
            new Col("playerloop_ms", "PlayerLoop", "ns"),
            new Col("wait_present_ms", "Gfx.WaitForPresentOnGfxThread", "ns"),
            new Col("wait_main_cmds_ms", "Gfx.WaitForGfxCommandsFromMainThread", "ns"),
            new Col("present_frame_ms", "Gfx.PresentFrame", "ns"),
            new Col("wait_target_fps_ms", "WaitForTargetFPS", "ns"),
            new Col("gc_alloc_bytes", "GC Allocated In Frame", "bytes"),
            new Col("gc_alloc_calls", "GC.Alloc", "count", "count"),
            new Col("gc_alloc_sample_ms", "GC.Alloc", "ns"),
            new Col("gc_collect_ms", "GC.Collect", "ns"),
            new Col("gc_collect_calls", "GC.Collect", "count", "count"),
            new Col("gc_used_mb", "GC Used Memory", "mb"),
            new Col("gc_reserved_mb", "GC Reserved Memory", "mb"),
            new Col("system_used_mb", "System Used Memory", "mb"),
            new Col("total_used_mb", "Total Used Memory", "mb"),
            new Col("draw_calls", "Draw Calls Count", "count"),
            new Col("batches", "Batches Count", "count"),
            new Col("setpass_calls", "SetPass Calls Count", "count"),
            new Col("triangles", "Triangles Count", "count"),
            new Col("shader_compiles", "Shader.CreateGPUProgram", "count", "count"),
            new Col("pso_creates", "CreateGraphicsGraphicsPipelineImpl", "count", "count"),
            new Col("physics_steps", "Physics.Simulate", "count", "count"),
            new Col("mesh_cook_ms", "Physics.BakePhysXCollisionMeshData", "ns"),
            new Col("sync_read_object_ms", "Loading.ReadObject", "ns"),
            new Col("texture_memory_mb", "Texture Memory", "mb"),
            new Col("mesh_memory_mb", "Mesh Memory", "mb"),
            new Col("gfx_used_mb", "Gfx Used Memory", "mb"),
            new Col("render_textures_mb", "Render Textures Bytes", "mb"),
        };

        // -perfMarkers: user markers and counters, resolved by name like the fixed columns
        struct Extra { public string name, column; public ProfilerRecorder rec; public bool time; }
        readonly List<Extra> m_Extra = new List<Extra>();
        FrameTiming[] m_Ft = new FrameTiming[1];
        float[] m_PresentWait;
        int m_SpikeAt = -1, m_SpikeMs;

        static GraphicsStateCollection s_Trace;
        static string s_TracePath;
        static readonly Dictionary<string, object> s_Boot = new Dictionary<string, object>();

        string m_Csv;
        int m_Frames, m_Warmup, m_Seen, m_RecordStartFrame = -1;
        float[] m_WallMs;
        int m_Wall;
        ProfilerRecorder[] m_Rec;
        readonly List<string> m_Missing = new List<string>();
        RenderTexture m_RT;
        Camera m_Cam;
        bool m_Manual;
        RenderPipeline.StandardRequest m_Request = new RenderPipeline.StandardRequest();
        float m_StartTime;
        bool m_Done;

        // ------------------------------------------------------------------ command line
        public static string Arg(string flag)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++)
                if (string.Equals(a[i], flag, StringComparison.OrdinalIgnoreCase)) return a[i + 1];
            return null;
        }

        static bool Flag(string flag)
        {
            foreach (var a in Environment.GetCommandLineArgs())
                if (string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static int IntArg(string flag, int def)
        {
            var v = Arg(flag);
            return v != null && int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : def;
        }

        // ------------------------------------------------------------------ boot
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void BeforeScene()
        {
            if (string.IsNullOrEmpty(Arg("-perfProbe"))) return;
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = IntArg("-perfTargetFps", -1);
            s_Boot["graphics"] = SystemInfo.graphicsDeviceType.ToString();
            s_Boot["development"] = Debug.isDebugBuild;
            s_Boot["batchmode"] = Application.isBatchMode;
            s_Boot["frame_timing_enabled"] = FrameTimingManager.IsFeatureEnabled();
            // which machine actually ran: hybrid-graphics laptops can run on the integrated GPU,
            // and a laptop on battery throttles [added]; RAM and VRAM size the memory budget
            s_Boot["device"] = new Dictionary<string, object>
            {
                { "gpu", SystemInfo.graphicsDeviceName }, { "gpu_vendor", SystemInfo.graphicsDeviceVendor },
                { "vram_mb", SystemInfo.graphicsMemorySize }, { "ram_mb", SystemInfo.systemMemorySize },
                { "cpu", SystemInfo.processorType }, { "cores", SystemInfo.processorCount },
                { "battery", SystemInfo.batteryStatus.ToString() }, { "battery_level", SystemInfo.batteryLevel },
                { "model", SystemInfo.deviceModel },
            };
            var warm = Arg("-perfWarmGsc");
            if (!string.IsNullOrEmpty(warm))
            {
                // Warm PSOs during loading, before the first frame needs them (6.3 Manual, Warm up PSOs).
                var t0 = Time.realtimeSinceStartup;
                var gsc = new GraphicsStateCollection();
                bool loaded = gsc.LoadFromFile(warm);
                if (loaded)
                {
                    var h = gsc.WarmUp(default(Unity.Jobs.JobHandle));  // returns a JobHandle: Complete() = synchronous
                    h.Complete();
                }
                s_Boot["gsc_warmup"] = new Dictionary<string, object>
                {
                    { "file", warm }, { "loaded", loaded }, { "variants", gsc.variantCount },
                    { "graphics_states", gsc.totalGraphicsStateCount }, { "completed", gsc.completedWarmupCount },
                    { "ms", Math.Round((Time.realtimeSinceStartup - t0) * 1000.0, 2) },
                };
            }
            s_TracePath = Arg("-perfTraceGsc");
            if (!string.IsNullOrEmpty(s_TracePath))
            {
                s_Trace = new GraphicsStateCollection();
                s_Boot["trace_started"] = s_Trace.BeginTrace();  // development players only (6.3 Manual)
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AfterScene()
        {
            var csv = Arg("-perfProbe");
            if (string.IsNullOrEmpty(csv)) return;
            var go = new GameObject("AgentPerfProbe");
            DontDestroyOnLoad(go);
            go.AddComponent<PerfProbe>().Init(csv);
        }

        void Init(string csv)
        {
            m_Csv = csv;
            m_Frames = Mathf.Max(10, IntArg("-perfFrames", 300));
            m_Warmup = Mathf.Max(0, IntArg("-perfWarmup", 60));
            m_WallMs = new float[m_Frames];
            m_PresentWait = new float[m_Frames];
            m_SpikeAt = IntArg("-perfSpikeAt", -1);
            m_SpikeMs = IntArg("-perfSpikeMs", 100);
            m_StartTime = Time.realtimeSinceStartup;
            var mode = Arg("-perfRender");  // manual | auto (default: manual in batch mode)
            m_Manual = mode == "manual" || (mode != "auto" && Application.isBatchMode);
            var scene = Arg("-perfScene");
            if (!string.IsNullOrEmpty(scene) && SceneManager.GetActiveScene().name != scene)
                SceneManager.LoadScene(scene, LoadSceneMode.Single);
        }

        void Update()
        {
            if (m_Done) return;
            // Offscreen target, re-attached whenever Camera.main changes (a -perfScene switch
            // replaces the camera). Batch-mode players skip the normal camera render (observed on
            // macOS 6000.3.21f1: 0 draw calls, "kGfxThreadingModeNonThreaded"), so LateUpdate
            // submits the camera explicitly (RenderPipeline.SubmitRenderRequest).
            var cam = Camera.main;
            if (cam != null && cam != m_Cam && (m_Manual || !string.IsNullOrEmpty(Arg("-perfOffscreen"))))
            {
                if (m_RT == null)
                {
                    int w = 1920, h = 1080;
                    var size = Arg("-perfOffscreen");
                    if (!string.IsNullOrEmpty(size))
                    {
                        var p = size.ToLowerInvariant().Split('x');
                        if (p.Length == 2) { int.TryParse(p[0], out w); int.TryParse(p[1], out h); }
                    }
                    m_RT = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { name = "PerfProbeTarget" };
                    m_RT.Create();
                }
                if (m_Cam != null) m_Cam.targetTexture = null;
                m_Cam = cam;
                if (!m_Manual) m_Cam.targetTexture = m_RT;
            }
            m_Seen++;
            if (m_Seen == m_Warmup + 1) StartRecorders();
            if (m_Rec != null)
            {
                if (m_Wall < m_WallMs.Length)
                {
                    // FrameTimingManager: "CPU Present Wait" of the latest completed frame (0 when
                    // Frame Timing Stats is off or nothing presents, as in a batch-mode player)
                    FrameTimingManager.CaptureFrameTimings();
                    m_PresentWait[m_Wall] = FrameTimingManager.GetLatestTimings(1, m_Ft) > 0 ? (float)m_Ft[0].cpuMainThreadPresentWaitTime : 0f;
                    m_WallMs[m_Wall++] = Time.unscaledDeltaTime * 1000f;
                    // forced spike (physics catch-up test): the NEXT frame shows the extra steps
                    if (m_Wall - 1 == m_SpikeAt) System.Threading.Thread.Sleep(m_SpikeMs);
                }
                if (Time.frameCount - m_RecordStartFrame >= m_Frames + 1) Finish();
            }
        }

        void LateUpdate()
        {
            if (m_Done || !m_Manual) return;
            Submit();
        }

        void Submit()
        {
            if (m_Cam == null || m_RT == null) return;
            m_Request.destination = m_RT;
            if (RenderPipeline.SupportsRenderRequest(m_Cam, m_Request)) RenderPipeline.SubmitRenderRequest(m_Cam, m_Request);
            else { m_Cam.targetTexture = m_RT; m_Cam.Render(); m_Cam.targetTexture = null; }
        }

        void SaveShot(string path)
        {
            if (m_RT == null || string.IsNullOrEmpty(path)) return;
            if (m_Manual) Submit();
            var prev = RenderTexture.active;
            RenderTexture.active = m_RT;
            var tex = new Texture2D(m_RT.width, m_RT.height, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, m_RT.width, m_RT.height), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;
            var px = tex.GetPixels32();
            for (int i = 0; i < px.Length; i++) px[i].a = 255;
            tex.SetPixels32(px);
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Destroy(tex);
        }

        void StartRecorders()
        {
            var handles = new List<ProfilerRecorderHandle>();
            ProfilerRecorderHandle.GetAvailable(handles);
            var byName = new Dictionary<string, ProfilerRecorderHandle>();
            foreach (var h in handles)
            {
                var d = ProfilerRecorderHandle.GetDescription(h);
                if (!byName.ContainsKey(d.Name)) byName[d.Name] = h;
            }
            m_Rec = new ProfilerRecorder[k_Cols.Length];
            for (int i = 0; i < k_Cols.Length; i++)
            {
                if (byName.TryGetValue(k_Cols[i].stat, out var h))
                    m_Rec[i] = new ProfilerRecorder(h, m_Frames + 2, ProfilerRecorderOptions.Default | ProfilerRecorderOptions.StartImmediately);
                else if (!m_Missing.Contains(k_Cols[i].stat)) m_Missing.Add(k_Cols[i].stat);
            }
            var extra = Arg("-perfMarkers");
            if (!string.IsNullOrEmpty(extra))
            {
                foreach (var raw in extra.Split(','))
                {
                    var name = raw.Trim();
                    if (name.Length == 0) continue;
                    var col = "mk_" + name.Replace(' ', '_').Replace(',', '_');
                    var opts = ProfilerRecorderOptions.Default | ProfilerRecorderOptions.StartImmediately;
                    // a marker registered later (static field not touched yet) binds by category + name
                    var rec = byName.TryGetValue(name, out var h)
                        ? new ProfilerRecorder(h, m_Frames + 2, opts)
                        : new ProfilerRecorder(ProfilerCategory.Scripts, name, m_Frames + 2, opts);
                    m_Extra.Add(new Extra { name = name, column = col, rec = rec });
                }
            }
            m_RecordStartFrame = Time.frameCount;
        }

        static double Unit(string unit, long v)
        {
            switch (unit)
            {
                case "ns": return v / 1e6;
                case "mb": return v / 1048576.0;
                default: return v;
            }
        }

        void Finish()
        {
            m_Done = true;
            try { FinishCore(); }
            catch (Exception e)
            {
                // never leave a headless player running: report and quit
                Debug.LogError("PERF_PROBE_FAILED " + e);
                try { File.WriteAllText(Path.ChangeExtension(m_Csv, ".json"), MiniJson(new Dictionary<string, object> { { "error", e.ToString() } })); } catch (Exception) { }
                if (!Flag("-perfNoQuit")) Application.Quit(3);
            }
        }

        void FinishCore()
        {
            var cols = new List<int>();
            var data = new List<List<double>>();
            for (int i = 0; i < k_Cols.Length; i++)
            {
                var r = m_Rec[i];
                if (!r.Valid || r.Count == 0) { if (!m_Missing.Contains(k_Cols[i].stat)) m_Missing.Add(k_Cols[i].stat); data.Add(null); continue; }
                var samples = new List<ProfilerRecorderSample>(r.Capacity);
                r.CopyTo(samples);
                var list = new List<double>(samples.Count);
                foreach (var s in samples) list.Add(k_Cols[i].field == "count" ? s.Count : Unit(k_Cols[i].unit, s.Value));
                data.Add(list);
                cols.Add(i);
            }
            // user markers and counters: time markers -> ms + call count; counters -> raw value
            var extraCols = new List<KeyValuePair<string, List<double>>>();
            foreach (var e in m_Extra)
            {
                var r = e.rec;
                if (!r.Valid || r.Count == 0) { if (!m_Missing.Contains(e.name)) m_Missing.Add(e.name); continue; }
                var samples = new List<ProfilerRecorderSample>(r.Capacity);
                r.CopyTo(samples);
                bool time = r.UnitType == ProfilerMarkerDataUnit.TimeNanoseconds;
                var vals = new List<double>(samples.Count);
                foreach (var s in samples) vals.Add(time ? s.Value / 1e6 : s.Value);
                extraCols.Add(new KeyValuePair<string, List<double>>(e.column + (time ? "_ms" : ""), vals));
                if (time)
                {
                    var calls = new List<double>(samples.Count);
                    foreach (var s in samples) calls.Add(s.Count);
                    extraCols.Add(new KeyValuePair<string, List<double>>(e.column + "_calls", calls));
                }
                r.Dispose();
            }
            // Alignment (observed 6000.3.21f1): unscaledDeltaTime read at frame i+1 is the duration of
            // frame i, so frame_ms is shifted one row to line up with the recorder rows (markers, GC,
            // physics steps). FrameTimingManager-backed columns (cpu_*_frame_ms, gpu_frame_ms) still
            // lag a few frames (4 seen): attribute spikes on main_thread_ms, not on those.
            int n = m_Wall - 1;
            foreach (var i in cols) n = Math.Min(n, data[i].Count);
            foreach (var kv in extraCols) n = Math.Min(n, kv.Value.Count);
            bool presentCol = FrameTimingManager.IsFeatureEnabled();
            var sb = new StringBuilder("frame,frame_ms");
            foreach (var i in cols) sb.Append(',').Append(k_Cols[i].column);
            if (presentCol) sb.Append(",cpu_present_wait_ms");
            foreach (var kv in extraCols) sb.Append(',').Append(kv.Key);
            sb.Append('\n');
            for (int f = 0; f < n; f++)
            {
                sb.Append(f).Append(',').Append(m_WallMs[f + 1].ToString("0.####", CultureInfo.InvariantCulture));
                foreach (var i in cols) sb.Append(',').Append(data[i][f].ToString("0.####", CultureInfo.InvariantCulture));
                if (presentCol) sb.Append(',').Append(m_PresentWait[f].ToString("0.####", CultureInfo.InvariantCulture));
                foreach (var kv in extraCols) sb.Append(',').Append(kv.Value[f].ToString("0.####", CultureInfo.InvariantCulture));
                sb.Append('\n');
            }
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(m_Csv)));
            File.WriteAllText(m_Csv, sb.ToString());

            var summary = new Dictionary<string, object>(s_Boot)
            {
                { "csv", m_Csv }, { "frames", n }, { "warmup", m_Warmup }, { "scene", SceneManager.GetActiveScene().name },
                { "unity", Application.unityVersion }, { "platform", Application.platform.ToString() },
                { "screen", Screen.width + "x" + Screen.height }, { "offscreen", m_RT != null ? m_RT.width + "x" + m_RT.height : null },
                { "render_mode", m_RT == null ? "screen" : (m_Manual ? "manual SubmitRenderRequest" : "camera target") },
                { "camera", m_Cam != null ? m_Cam.name : null },
                { "missing", m_Missing }, { "seconds", Math.Round(Time.realtimeSinceStartup - m_StartTime, 2) },
                { "gc_collection_count", GC.CollectionCount(0) },
                { "markers", m_Extra.ConvertAll(x => x.name) },
                { "spike", m_SpikeAt >= 0 ? new Dictionary<string, object> { { "at_frame", m_SpikeAt }, { "ms", m_SpikeMs } } : null },
                { "physics", new Dictionary<string, object>
                    {
                        { "fixed_dt", Time.fixedDeltaTime }, { "maximum_dt", Time.maximumDeltaTime },
                        { "max_steps_per_frame", (int)Math.Ceiling(Time.maximumDeltaTime / Math.Max(1e-6f, Time.fixedDeltaTime)) },
                    } },
                { "render_textures", RenderTextureTable(10) },
            };
            if (s_Trace != null)
            {
                s_Trace.EndTrace();
                bool saved = s_Trace.SaveToFile(s_TracePath);
                summary["trace"] = new Dictionary<string, object>
                {
                    { "file", s_TracePath }, { "saved", saved }, { "variants", s_Trace.variantCount },
                    { "graphics_states", s_Trace.totalGraphicsStateCount }, { "api", s_Trace.graphicsDeviceType.ToString() },
                };
            }
            foreach (var r in m_Rec) if (r.Valid) r.Dispose();
            var shot = Arg("-perfShot");
            if (!string.IsNullOrEmpty(shot)) { SaveShot(shot); summary["shot"] = shot; }
            if (m_Cam != null) m_Cam.targetTexture = null;

            var snap = Arg("-perfSnapshot");
            if (!string.IsNullOrEmpty(snap))
            {
                // Memory Profiler capture from code (development players). Open the .snap in
                // Window > Analysis > Memory Profiler: resident vs allocated, untracked, duplicates.
                Unity.Profiling.Memory.MemoryProfiler.TakeSnapshot(snap, (path, ok) =>
                {
                    summary["snapshot"] = new Dictionary<string, object> { { "file", path }, { "ok", ok } };
                    WriteSummaryAndQuit(summary);
                }, Unity.Profiling.Memory.CaptureFlags.ManagedObjects | Unity.Profiling.Memory.CaptureFlags.NativeObjects | Unity.Profiling.Memory.CaptureFlags.NativeAllocations);
                return;
            }
            WriteSummaryAndQuit(summary);
        }

        // The Unity 6 Memory Profiler lists every render texture with its size (Peter Hall
        // _cV1B2hqXGI [00:34:02]); this is the headless version, read once at the end.
        static Dictionary<string, object> RenderTextureTable(int top)
        {
            var list = new List<KeyValuePair<long, string>>();
            long total = 0;
            foreach (var rt in Resources.FindObjectsOfTypeAll<RenderTexture>())
            {
                long b = UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(rt);
                total += b;
                list.Add(new KeyValuePair<long, string>(b, rt.name + " " + rt.width + "x" + rt.height + " " + rt.graphicsFormat + (rt.antiAliasing > 1 ? " msaa" + rt.antiAliasing : "")));
            }
            list.Sort((a, b) => b.Key.CompareTo(a.Key));
            var rows = new List<object>();
            for (int i = 0; i < list.Count && i < top; i++)
                rows.Add(new Dictionary<string, object> { { "rt", list[i].Value }, { "mb", Math.Round(list[i].Key / 1048576.0, 2) } });
            return new Dictionary<string, object> { { "count", list.Count }, { "total_mb", Math.Round(total / 1048576.0, 2) }, { "top", rows } };
        }

        void WriteSummaryAndQuit(Dictionary<string, object> summary)
        {
            File.WriteAllText(Path.ChangeExtension(m_Csv, ".json"), MiniJson(summary));
            Debug.Log("PERF_PROBE_DONE " + Path.ChangeExtension(m_Csv, ".json"));
            if (!Flag("-perfNoQuit")) Application.Quit(0);
        }

        // ------------------------------------------------------------------ tiny JSON writer
        static string MiniJson(object o)
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
                case int i: sb.Append(i.ToString(CultureInfo.InvariantCulture)); break;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); break;
                case float f: sb.Append(f.ToString("R", CultureInfo.InvariantCulture)); break;
                case double d: sb.Append(d.ToString("R", CultureInfo.InvariantCulture)); break;
                case Dictionary<string, object> dict:
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in dict) { if (!first) sb.Append(','); first = false; Write(sb, kv.Key); sb.Append(':'); Write(sb, kv.Value); }
                    sb.Append('}');
                    break;
                case System.Collections.IEnumerable e:
                    sb.Append('[');
                    bool f1 = true;
                    foreach (var x in e) { if (!f1) sb.Append(','); f1 = false; Write(sb, x); }
                    sb.Append(']');
                    break;
                default: Write(sb, o.ToString()); break;
            }
        }
    }
}
