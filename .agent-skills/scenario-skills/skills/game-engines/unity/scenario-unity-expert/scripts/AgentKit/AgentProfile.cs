// AgentKit v0.1 (Unity Expert Skills, 2026-09-24). Play-mode frame timings to CSV through
// ProfilerRecorder, in a batch editor, with no Profiler window.
//
// Job (async: launch WITHOUT -quit and WITH graphics):
//   ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings",
//                     {"scene": "Assets/Scenes/X.unity", "frames": 300, "warmup": 60}, quit=False, graphics=True)
// Flow: open the scene, EditorApplication.EnterPlaymode(); entering Play mode reloads the domain
// (default "Reload Domain and Scene"), so the job state lives in SessionState and an
// [InitializeOnLoad] driver resumes it; after `warmup` frames it starts ProfilerRecorders with
// capacity `frames`, waits until they are full, writes one CSV row per frame, exits Play mode and
// then the editor (AgentJob.Succeed -> EditorApplication.Exit(0)).
// Counters (names as ProfilerRecorder exposes them in 6.3; any that do not resolve are reported
// under "missing_counters", never faked): Main Thread (ns), Render Thread (ns), GC Allocated In
// Frame (bytes), GC Reserved Memory, System Used Memory, Draw Calls Count, SetPass Calls Count,
// Batches Count, Triangles Count, Vertices Count.
// Caveat, from the performance e-books: Editor Play mode numbers are for iteration only; the
// authoritative measurement is a development player on the lowest target device.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-expert/test_live_toolkit.py.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Unity.Profiling;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit
{
    public static class AgentProfile
    {
        public const string StateKey = "AgentKit.Profile.State";

        public struct Counter
        {
            public string column, category, name, unit;
            public Counter(string column, ProfilerCategory cat, string name, string unit)
            { this.column = column; category = cat.Name; this.name = name; this.unit = unit; }
        }

        public static readonly Counter[] DefaultCounters =
        {
            new Counter("main_thread_ms", ProfilerCategory.Internal, "Main Thread", "ns"),
            new Counter("render_thread_ms", ProfilerCategory.Internal, "Render Thread", "ns"),
            new Counter("gc_alloc_bytes", ProfilerCategory.Memory, "GC Allocated In Frame", "bytes"),
            new Counter("gc_reserved_mb", ProfilerCategory.Memory, "GC Reserved Memory", "mb"),
            new Counter("system_used_mb", ProfilerCategory.Memory, "System Used Memory", "mb"),
            new Counter("draw_calls", ProfilerCategory.Render, "Draw Calls Count", "count"),
            new Counter("setpass_calls", ProfilerCategory.Render, "SetPass Calls Count", "count"),
            new Counter("batches", ProfilerCategory.Render, "Batches Count", "count"),
            new Counter("triangles", ProfilerCategory.Render, "Triangles Count", "count"),
            new Counter("vertices", ProfilerCategory.Render, "Vertices Count", "count"),
            new Counter("cpu_frame_ms", ProfilerCategory.Internal, "CPU Total Frame Time", "ns"),
            new Counter("cpu_main_frame_ms", ProfilerCategory.Internal, "CPU Main Thread Frame Time", "ns"),
            new Counter("gpu_frame_ms", ProfilerCategory.Internal, "GPU Frame Time", "ns"),
        };

        public static void PlayModeTimings()
        {
            AgentJob.Run(() =>
            {
                AgentJob.BeginAsync();
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var state = new Dictionary<string, object>
                {
                    { "phase", "entering" },
                    { "frames", AgentJob.Int("frames", 300) },
                    { "warmup", AgentJob.Int("warmup", 60) },
                    { "target_fps", AgentJob.Float("target_fps", 60f) },
                    { "csv", AgentJob.Has("out_csv") ? AgentJob.ResolvePath(AgentJob.Str("out_csv")) : Path.Combine(AgentJob.OutDir(), "frame_timings.csv") },
                    { "scene", EditorSceneManager.GetActiveScene().path },
                    { "started", DateTime.UtcNow.ToString("o") },
                    // Batch mode has no Game view, so on-screen cameras never render in Play mode
                    // (observed 2026-09-24: draw calls 0). render=true gives the main camera an
                    // offscreen target for the recording, which the player loop renders every frame.
                    { "render", AgentJob.Bool("render", true) },
                    { "width", AgentJob.Int("width", 1920) },
                    { "height", AgentJob.Int("height", 1080) },
                };
                SessionState.SetString(StateKey, AgentJson.Serialize(state));
                AgentProfileDriver.Hook();
                EditorApplication.EnterPlaymode();
                return null;
            });
        }
    }

    [InitializeOnLoad]
    static class AgentProfileDriver
    {
        static ProfilerRecorder[] s_Rec;
        static int s_StartFrame = -1, s_RecordFrom = -1;
        static bool s_Hooked;
        static Dictionary<string, object> s_State; // cached: re-reading SessionState every tick allocates
        static RenderTexture s_RT;
        static Camera s_Cam;
        static readonly List<string> s_Missing = new List<string>();

        static AgentProfileDriver()
        {
            if (!string.IsNullOrEmpty(SessionState.GetString(AgentProfile.StateKey, ""))) Hook();
        }

        public static void Hook()
        {
            if (s_Hooked) return;
            s_Hooked = true;
            EditorApplication.update += Tick;
        }

        static void Save(Dictionary<string, object> st)
        {
            s_State = st;
            SessionState.SetString(AgentProfile.StateKey, AgentJson.Serialize(st));
        }

        static void Tick()
        {
            if (s_State == null)
            {
                var raw = SessionState.GetString(AgentProfile.StateKey, "");
                if (string.IsNullOrEmpty(raw)) { EditorApplication.update -= Tick; s_Hooked = false; return; }
                s_State = AgentJson.ParseObject(raw);
            }
            var st = s_State;
            var phase = st["phase"] as string;
            try
            {
                if (phase == "entering" && EditorApplication.isPlaying)
                {
                    if (s_StartFrame < 0) s_StartFrame = Time.frameCount;
                    int warm = (int)AgentJson.ToDouble(st["warmup"]);
                    if (s_RT == null && st.TryGetValue("render", out var rr) && rr is bool rb && rb && Camera.main != null)
                    {
                        s_Cam = Camera.main;
                        s_RT = new RenderTexture((int)AgentJson.ToDouble(st["width"], 1920), (int)AgentJson.ToDouble(st["height"], 1080), 24);
                        s_Cam.targetTexture = s_RT;
                    }
                    if (Time.frameCount - s_StartFrame >= warm)
                    {
                        AgentBridge.Paused = true;
                        Start((int)AgentJson.ToDouble(st["frames"]));
                        s_RecordFrom = Time.frameCount;
                        st["phase"] = "recording";
                        Save(st);
                    }
                }
                else if (phase == "recording")
                {
                    if (!EditorApplication.isPlaying) throw new InvalidOperationException("left Play mode while recording");
                    if (s_Rec == null) throw new InvalidOperationException("recorders lost (domain reload while recording?)");
                    int frames = (int)AgentJson.ToDouble(st["frames"]);
                    var main = s_Rec[0];
                    if (main.Valid && main.Count < frames && Time.frameCount - s_RecordFrom < frames * 4) return;
                    if (!main.Valid && Time.frameCount - s_RecordFrom < frames) return;
                    var summary = WriteCsv((string)st["csv"], frames, (float)AgentJson.ToDouble(st["target_fps"], 60));
                    summary["rendered_offscreen"] = s_RT != null;
                    summary["render_size"] = s_RT != null ? new[] { s_RT.width, s_RT.height } : null;
                    foreach (var r in s_Rec) r.Dispose();
                    s_Rec = null;
                    ReleaseTarget();
                    AgentBridge.Paused = false;
                    st["phase"] = "exiting";
                    st["summary"] = summary;
                    Save(st);
                    EditorApplication.ExitPlaymode();
                }
                else if (phase == "exiting" && !EditorApplication.isPlaying && !EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    SessionState.EraseString(AgentProfile.StateKey);
                    EditorApplication.update -= Tick;
                    s_Hooked = false;
                    s_State = null;
                    AgentJob.Succeed(st["summary"]);
                }
            }
            catch (Exception e)
            {
                SessionState.EraseString(AgentProfile.StateKey);
                EditorApplication.update -= Tick;
                s_Hooked = false;
                s_State = null;
                AgentBridge.Paused = false;
                ReleaseTarget();
                if (s_Rec != null) foreach (var r in s_Rec) r.Dispose();
                s_Rec = null;
                if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                AgentJob.Fail("profile: " + e.Message, null, e);
            }
        }

        static void ReleaseTarget()
        {
            if (s_Cam != null) s_Cam.targetTexture = null;
            if (s_RT != null) { s_RT.Release(); UnityEngine.Object.DestroyImmediate(s_RT); }
            s_RT = null; s_Cam = null;
        }

        static void Start(int frames)
        {
            s_Missing.Clear();
            var cs = AgentProfile.DefaultCounters;
            s_Rec = new ProfilerRecorder[cs.Length];
            for (int i = 0; i < cs.Length; i++)
            {
                var cat = new ProfilerCategory(cs[i].category);
                s_Rec[i] = ProfilerRecorder.StartNew(cat, cs[i].name, frames);
            }
        }

        static double ToUnit(AgentProfile.Counter c, long v)
        {
            switch (c.unit)
            {
                case "ns": return v / 1e6;           // -> ms
                case "mb": return v / 1048576.0;     // bytes -> MB
                default: return v;
            }
        }

        static Dictionary<string, object> WriteCsv(string path, int frames, float targetFps)
        {
            var cs = AgentProfile.DefaultCounters;
            var cols = new List<List<double>>();
            var valid = new List<int>();
            for (int i = 0; i < cs.Length; i++)
            {
                var r = s_Rec[i];
                if (!r.Valid || r.Count == 0) { s_Missing.Add(cs[i].category + "/" + cs[i].name); cols.Add(null); continue; }
                var samples = new List<ProfilerRecorderSample>(r.Capacity);
                r.CopyTo(samples);
                var ci = cs[i];
                cols.Add(samples.Select(s => ToUnit(ci, s.Value)).ToList());
                valid.Add(i);
            }
            int n = valid.Count > 0 ? valid.Min(i => cols[i].Count) : 0;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var sb = new StringBuilder("frame," + string.Join(",", valid.Select(i => cs[i].column)) + "\n");
            for (int f = 0; f < n; f++)
            {
                sb.Append(f);
                foreach (var i in valid) sb.Append(',').Append(cols[i][f].ToString("0.####", CultureInfo.InvariantCulture));
                sb.Append('\n');
            }
            File.WriteAllText(path, sb.ToString());
            var summary = new Dictionary<string, object>
            {
                { "csv", path }, { "frames", n }, { "requested_frames", frames }, { "target_fps", targetFps },
                { "budget_ms", Math.Round(1000.0 / targetFps, 3) }, { "missing_counters", new List<string>(s_Missing) },
                { "graphics", SystemInfo.graphicsDeviceType.ToString() }, { "editor_play_mode", true },
            };
            foreach (var i in valid)
            {
                var v = cols[i].Take(n).OrderBy(x => x).ToList();
                if (v.Count == 0) continue;
                summary[cs[i].column] = new Dictionary<string, object>
                {
                    { "mean", Math.Round(v.Average(), 4) }, { "p50", Math.Round(v[v.Count / 2], 4) },
                    { "p95", Math.Round(v[Math.Min(v.Count - 1, (int)(v.Count * 0.95))], 4) },
                    { "max", Math.Round(v[v.Count - 1], 4) }, { "min", Math.Round(v[0], 4) },
                };
            }
            if (valid.Contains(2))
                summary["frames_with_gc_alloc"] = cols[2].Take(n).Count(x => x > 0);
            return summary;
        }
    }
}
