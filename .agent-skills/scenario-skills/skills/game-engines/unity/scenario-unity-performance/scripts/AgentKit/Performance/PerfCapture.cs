// scenario-unity-performance v0.1 (2026-09-24). Reads a Profiler capture (.raw from a player launched with
// -profiler-enable -profiler-log-file x.raw -profiler-capture-frame-count N, or a .data saved from
// the Profiler window) in a batch editor and returns what an expert reads off the Timeline and
// Profile Analyzer: frame statistics without the FPS-wait markers, the bounding thread per frame
// from the wait markers, GC.Alloc counts next to their (artificial) sample time and the real
// GC.Collect cost, and the markers that make the longest frame differ from the median frame.
//
//   ut_run.run_method(P, "AgentKit.Performance.PerfCapture.Analyze",
//                     {"capture": "/abs/cap.raw", "skip": 5, "top": 12, "markers": ["MySystem.Update"]})
//
// Bound rules (profiling e-book p. 24-33; Peter Hall _cV1B2hqXGI [frame 00:18:23]; Unity graphics
// PMs Oc6T4hh5gaI [frame 00:13:22]; Nicolas Borromeo CmD8MVGkDxQ [00:23:33]):
//   render thread mostly in Gfx.WaitForGfxCommandsFromMainThread      -> "main" (main-thread bound)
//   main thread mostly in Gfx.WaitForPresentOnGfxThread and the render
//     thread in Gfx.PresentFrame or a *WaitForLastPresent* marker     -> "gpu"
//   main in Gfx.WaitForPresentOnGfxThread, render thread busy          -> "render" (render-thread bound)
//   main mostly in WaitForTargetFPS                                    -> "headroom" (capped)
// Marker names differ per platform and graphics API: the result lists which were seen.
// Profile Analyzer discipline (Hall [frame 00:23:22]-[frame 00:26:52]): remove FPS-wait time, read
// median vs longest frame, check marker COUNT as well as cost.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor.Profiling;
using UnityEditorInternal;

namespace AgentKit.Performance
{
    public static class PerfCapture
    {
        const string WaitPresent = "Gfx.WaitForPresentOnGfxThread";
        const string WaitMain = "Gfx.WaitForGfxCommandsFromMainThread";
        const string PresentFrame = "Gfx.PresentFrame";
        const string TargetFps = "WaitForTargetFPS";

        class Frame
        {
            public int index;
            public double frameMs, mainMs, renderMs, waitPresent, waitMain, present, targetFps, lastPresent;
            public double gcAllocMs, gcCollectMs;
            public int gcAllocCount, gcCollectCount, shaderCompiles;
            public Dictionary<string, double> self = new Dictionary<string, double>();
            public Dictionary<string, int> counts = new Dictionary<string, int>();
            public Dictionary<string, double> total = new Dictionary<string, double>();
        }

        public static void Analyze()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.ResolvePath(AgentJob.Str("capture"));
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) throw new FileNotFoundException("capture not found: " + path);
                ProfilerDriver.ClearAllFrames();
                if (!ProfilerDriver.LoadProfile(path, false)) throw new InvalidOperationException("ProfilerDriver.LoadProfile failed: " + path);
                int first = ProfilerDriver.firstFrameIndex, last = ProfilerDriver.lastFrameIndex;
                int skip = AgentJob.Int("skip", 5);
                var extra = AgentJob.List("markers").Select(m => m.ToString()).ToList();
                var frames = new List<Frame>();
                var threadsSeen = new HashSet<string>();
                var markersSeen = new HashSet<string>();
                for (int fi = first + skip; fi <= last; fi++)
                {
                    var fr = new Frame { index = fi };
                    for (int ti = 0; ti < 256; ti++)
                    {
                        using (var v = ProfilerDriver.GetRawFrameDataView(fi, ti))
                        {
                            if (v == null || !v.valid) break;
                            var tn = v.threadName;
                            threadsSeen.Add(tn);
                            bool main = tn == "Main Thread", render = tn == "Render Thread";
                            if (!main && !render) continue;
                            if (main) fr.frameMs = v.frameTimeMs;
                            Walk(v, fr, main, markersSeen, extra);
                        }
                    }
                    frames.Add(fr);
                }
                if (frames.Count == 0) throw new InvalidOperationException("no frames after skip in " + path);

                // --- per-frame bound (Hall / e-book rules)
                var bounds = new Dictionary<string, int> { { "main", 0 }, { "gpu", 0 }, { "render", 0 }, { "headroom", 0 }, { "unknown", 0 } };
                var workMs = new List<double>();
                foreach (var f in frames)
                {
                    string b;
                    double ft = Math.Max(f.frameMs, 0.001);
                    if (f.targetFps > 0.5 * ft) b = "headroom";
                    else if (f.waitMain > 0.5 * ft) b = "main";
                    else if (f.waitPresent > 0.3 * ft && (f.present + f.lastPresent) > 0.5 * f.waitPresent) b = "gpu";
                    else if (f.waitPresent > 0.3 * ft) b = "render";
                    else if (f.mainMs > 0) b = "main";
                    else b = "unknown";
                    bounds[b]++;
                    workMs.Add(f.frameMs - f.targetFps);  // Profile Analyzer "Remove FPS Wait"
                }
                var sorted = frames.Select((f, i) => new { f, w = workMs[i] }).OrderBy(x => x.w).ToList();
                var median = sorted[sorted.Count / 2];
                var longest = sorted[sorted.Count - 1];
                int top = AgentJob.Int("top", 12);
                var diff = longest.f.self.Keys.Union(median.f.self.Keys)
                    .Select(k => new
                    {
                        k,
                        l = longest.f.self.TryGetValue(k, out var a) ? a : 0,
                        m = median.f.self.TryGetValue(k, out var b2) ? b2 : 0,
                        lc = longest.f.counts.TryGetValue(k, out var c1) ? c1 : 0,
                        mc = median.f.counts.TryGetValue(k, out var c2) ? c2 : 0,
                    })
                    .OrderByDescending(x => x.l - x.m).Take(top)
                    .Select(x => (object)new Dictionary<string, object>
                    {
                        { "marker", x.k }, { "longest_self_ms", R(x.l) }, { "median_self_ms", R(x.m) }, { "delta_ms", R(x.l - x.m) },
                        { "longest_count", x.lc }, { "median_count", x.mc },
                    }).ToList();
                var topSelf = frames.SelectMany(f => f.self).GroupBy(kv => kv.Key)
                    .Select(g => new { g.Key, ms = g.Sum(kv => kv.Value) / frames.Count })
                    .OrderByDescending(x => x.ms).Take(top)
                    .Select(x => (object)new Dictionary<string, object> { { "marker", x.Key }, { "mean_self_ms", R(x.ms) } }).ToList();
                var custom = new Dictionary<string, object>();
                foreach (var m in extra)
                {
                    var vals = frames.Select(f => f.total.TryGetValue(m, out var t) ? t : 0).OrderBy(x => x).ToList();
                    custom[m] = new Dictionary<string, object>
                    {
                        { "mean_ms", R(vals.Average()) }, { "p50_ms", R(vals[vals.Count / 2]) }, { "max_ms", R(vals.Last()) },
                        { "calls_total", frames.Sum(f => f.counts.TryGetValue(m, out var c) ? c : 0) },
                    };
                }
                var ws = workMs.OrderBy(x => x).ToList();
                return new Dictionary<string, object>
                {
                    { "capture", path }, { "frames", frames.Count }, { "first_frame", first }, { "last_frame", last },
                    { "frame_ms", new Dictionary<string, object>
                        {
                            { "mean", R(workMs.Average()) }, { "p50", R(ws[ws.Count / 2]) }, { "p95", R(ws[Math.Min(ws.Count - 1, (int)(ws.Count * 0.95))]) },
                            { "max", R(ws.Last()) }, { "min", R(ws.First()) }, { "fps_wait_removed", true },
                        } },
                    { "bound_frames", bounds },
                    { "bound", bounds.OrderByDescending(kv => kv.Value).First().Key },
                    { "wait_markers_ms_mean", new Dictionary<string, object>
                        {
                            { WaitPresent, R(frames.Average(f => f.waitPresent)) }, { WaitMain, R(frames.Average(f => f.waitMain)) },
                            { PresentFrame, R(frames.Average(f => f.present)) }, { "WaitForLastPresent*", R(frames.Average(f => f.lastPresent)) },
                            { TargetFps, R(frames.Average(f => f.targetFps)) },
                        } },
                    { "gc", new Dictionary<string, object>
                        {
                            { "alloc_calls_per_frame", R(frames.Average(f => (double)f.gcAllocCount)) },
                            { "alloc_sample_ms_per_frame", R(frames.Average(f => f.gcAllocMs)) },
                            { "collect_calls_total", frames.Sum(f => f.gcCollectCount) },
                            { "collect_ms_total", R(frames.Sum(f => f.gcCollectMs)) },
                            { "collect_ms_max_frame", R(frames.Max(f => f.gcCollectMs)) },
                            { "note", "GC.Alloc sample time is artificial (Unity records timestamp and size only): judge counts, bytes and GC.Collect ms" },
                        } },
                    { "shader_compiles_total", frames.Sum(f => f.shaderCompiles) },
                    { "median_frame", median.f.index }, { "longest_frame", longest.f.index },
                    { "longest_vs_median", diff }, { "top_self_markers", topSelf }, { "custom_markers", custom },
                    { "threads_seen", threadsSeen.Take(40).ToList() },
                    { "wait_markers_seen", markersSeen.ToList() },
                };
            });
        }

        static double R(double v) => Math.Round(v, 4);

        static void Walk(RawFrameDataView v, Frame fr, bool main, HashSet<string> seen, List<string> extra)
        {
            int n = v.sampleCount;
            for (int i = 0; i < n; i++)
            {
                var name = v.GetSampleName(i);
                double t = v.GetSampleTimeMs(i);
                int children = v.GetSampleChildrenCount(i);
                double childMs = 0;
                int j = i + 1;
                for (int c = 0; c < children && j < n; c++)
                {
                    childMs += v.GetSampleTimeMs(j);
                    j += v.GetSampleChildrenCountRecursive(j) + 1;
                }
                double self = Math.Max(0, t - childMs);
                string key = (main ? "" : "[RT] ") + name;
                fr.self[key] = (fr.self.TryGetValue(key, out var s) ? s : 0) + self;
                fr.counts[key] = (fr.counts.TryGetValue(key, out var cc) ? cc : 0) + 1;
                if (extra.Contains(name)) fr.total[name] = (fr.total.TryGetValue(name, out var tt) ? tt : 0) + t;
                if (i == 0) { if (main) fr.mainMs = t; else fr.renderMs = t; }
                switch (name)
                {
                    case WaitPresent: if (main) fr.waitPresent += t; seen.Add(name); break;
                    case WaitMain: if (!main) fr.waitMain += t; seen.Add(name); break;
                    case PresentFrame: if (!main) fr.present += t; seen.Add(name); break;
                    case TargetFps: if (main) fr.targetFps += t; seen.Add(name); break;
                    case "GC.Alloc": fr.gcAllocCount++; fr.gcAllocMs += t; break;
                    case "GC.Collect": fr.gcCollectCount++; fr.gcCollectMs += t; break;
                    case "Shader.CreateGPUProgram": fr.shaderCompiles++; break;
                    default:
                        if (!main && name.EndsWith("WaitForLastPresent")) { fr.lastPresent += t; seen.Add(name); }
                        break;
                }
            }
        }
    }
}
