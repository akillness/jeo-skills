// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). Shader cost measured as GPU time, not
// instruction count (Ben Cloward, E82XxlXMJs4 [00:17:26]: instruction counts are "relatively worthless"
// for comparing shaders; loops count at max trip count, float4 costs about 4x float, sin is 4x a multiply
// on Radeon).
//
// Job MeasureFullscreenCost (needs graphics: ut_run.run_method(..., graphics=True)):
//   args: materials[] (full-screen materials whose pass uses Core RP Blit.hlsl Vert, e.g. an SRP Blit shader),
//         baseline (material path, a trivial shader; its time is subtracted), width 1920, height 1080,
//         format (ARGBHalf), draws (per sample, default 20), samples (default 9), pass (0),
//         precision_model ("PlatformDefault" | "Unified", optional, v0.2): Player setting Shader Precision Model for
//         the run (restored after). With PlatformDefault a desktop build compiles `half` as float, so a half vs
//         float A/B on this Mac only means something under Unified (or on the mobile device itself).
//   Each sample records `draws` full-screen triangles of one material into an offscreen target, executes the
//   command buffer, then blocks on a 1-pixel AsyncGPUReadback: wall time from submit to readback is
//   GPU-bound once draws x pixels dominate. Materials are measured interleaved, round by round (noise and
//   thermal drift hit all alike). Give the probe shaders additive blending (Blend One One) so no draw
//   overwrites the previous one. Reports median ms per full-screen draw, minus the baseline, and ns per pixel. When SystemInfo.supportsGpuRecorder, the "AgentCost" sampler's GPU time is reported too
//   (often 0 in batch mode: the recorder updates at the end of a player-loop frame).
// This is an A/B tool on THIS Mac (Apple Silicon, Metal): ranks two shader versions at a fixed resolution.
// Target-device budgets still come from a development player on the device (Xcode Metal capture on
// iOS and macOS, Mali Offline Compiler or Android GPU Inspector on Android).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py (stage cost; v0.2 adds precision_model).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;

namespace AgentKit.Shaders
{
    public static class GpuCostJobs
    {
        static readonly int BlitScaleBias = Shader.PropertyToID("_BlitScaleBias");

        static double Median(List<double> v)
        {
            var s = v.OrderBy(x => x).ToList();
            return s.Count == 0 ? 0 : (s.Count % 2 == 1 ? s[s.Count / 2] : 0.5 * (s[s.Count / 2 - 1] + s[s.Count / 2]));
        }

        static CommandBuffer Record(Material m, int pass, RenderTexture rt, int draws)
        {
            var cmd = new CommandBuffer { name = "AgentCost" };
            cmd.SetRenderTarget(rt);
            cmd.ClearRenderTarget(false, true, Color.black);
            cmd.SetGlobalVector(BlitScaleBias, new Vector4(1, 1, 0, 0));
            cmd.BeginSample("AgentCost");
            for (int i = 0; i < draws; i++)
                cmd.DrawProcedural(Matrix4x4.identity, m, pass, MeshTopology.Triangles, 3, 1);
            cmd.EndSample("AgentCost");
            return cmd;
        }

        static double Time(CommandBuffer cmd, RenderTexture rt)
        {
            var sw = Stopwatch.StartNew();
            Graphics.ExecuteCommandBuffer(cmd);
            AsyncGPUReadback.Request(rt, 0, 0, 1, 0, 1, 0, 1).WaitForCompletion();   // blocks until the GPU finished
            sw.Stop();
            return sw.Elapsed.TotalMilliseconds;
        }

        static Dictionary<string, object> Stats(List<double> times)
        {
            return new Dictionary<string, object>
            {
                { "median_ms_per_sample", Math.Round(Median(times), 4) },
                { "min_ms_per_sample", Math.Round(times.Min(), 4) },
                { "max_ms_per_sample", Math.Round(times.Max(), 4) },
                { "samples", times.Select(t => (object)Math.Round(t, 3)).ToList() },
            };
        }

        public static void MeasureFullscreenCost()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                int w = AgentJob.Int("width", 1920), h = AgentJob.Int("height", 1080);
                int draws = AgentJob.Int("draws", 100), samples = AgentJob.Int("samples", 11), pass = AgentJob.Int("pass", 0);
                var fmt = (RenderTextureFormat)Enum.Parse(typeof(RenderTextureFormat), AgentJob.Str("format", "ARGBHalf"));
                var rt = new RenderTexture(w, h, 0, fmt) { name = "AgentCostRT" };
                rt.Create();
                // The editor compiles shaders asynchronously and draws a placeholder meanwhile: early samples would
                // time the placeholder. Compile synchronously for the measurement, restore afterwards.
                bool wasAsync = ShaderUtil.allowAsyncCompilation;
                ShaderUtil.allowAsyncCompilation = false;
                var prevPrecision = PlayerSettings.GetShaderPrecisionModel();
                var precisionArg = AgentJob.Str("precision_model");
                if (!string.IsNullOrEmpty(precisionArg))
                    PlayerSettings.SetShaderPrecisionModel((ShaderPrecisionModel)Enum.Parse(typeof(ShaderPrecisionModel), precisionArg));
                Recorder rec = null;
                if (SystemInfo.supportsGpuRecorder) { rec = Recorder.Get("AgentCost"); rec.enabled = true; }
                var results = new Dictionary<string, object>();
                try
                {
                    // Interleave materials round by round (A B C A B C ...) so machine noise and thermal drift hit all
                    // of them alike; three discarded warm-up rounds (PSO creation, caches); median per material.
                    var paths = new List<string>();
                    var basePath = AgentJob.Str("baseline");
                    if (!string.IsNullOrEmpty(basePath)) paths.Add(basePath);
                    paths.AddRange(AgentJob.List("materials").Select(Convert.ToString));
                    var cmds = new List<CommandBuffer>();
                    foreach (var p in paths)
                    {
                        var m = AssetDatabase.LoadAssetAtPath<Material>(p);
                        if (m == null) throw new ArgumentException("material not found: " + p);
                        var sp = AssetDatabase.GetAssetPath(m.shader);
                        if (!string.IsNullOrEmpty(precisionArg) && sp.StartsWith("Assets"))   // recompile under the chosen model
                            AssetDatabase.ImportAsset(sp, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                        cmds.Add(Record(m, pass, rt, draws));
                    }
                    var times = paths.Select(_ => new List<double>()).ToList();
                    var recMs = paths.Select(_ => new List<double>()).ToList();
                    try
                    {
                        for (int round = -3; round < samples; round++)
                            for (int i = 0; i < cmds.Count; i++)
                            {
                                double t = Time(cmds[i], rt);
                                if (round < 0) continue;
                                times[i].Add(t);
                                if (rec != null && rec.gpuElapsedNanoseconds > 0) recMs[i].Add(rec.gpuElapsedNanoseconds / 1e6);
                            }
                    }
                    finally { foreach (var cmd in cmds) cmd.Release(); }
                    double baseMs = 0;
                    int first = 0;
                    if (!string.IsNullOrEmpty(basePath))
                    {
                        results["baseline"] = Stats(times[0]);
                        baseMs = Median(times[0]);
                        first = 1;
                    }
                    var list = new List<object>();
                    for (int i = first; i < paths.Count; i++)
                    {
                        var r = Stats(times[i]);
                        double net = Math.Max(0, Median(times[i]) - baseMs);
                        r["material"] = paths[i];
                        r["net_ms_per_fullscreen_draw"] = Math.Round(net / draws, 5);
                        r["net_ns_per_pixel"] = Math.Round(net * 1e6 / ((double)draws * w * h), 5);
                        r["gpu_recorder_ms"] = recMs[i].Count > 0 ? (object)Math.Round(Median(recMs[i]), 4) : null;
                        list.Add(r);
                    }
                    results["materials"] = list;
                }
                finally
                {
                    ShaderUtil.allowAsyncCompilation = wasAsync;
                    if (!string.IsNullOrEmpty(precisionArg)) PlayerSettings.SetShaderPrecisionModel(prevPrecision);
                    if (rec != null) rec.enabled = false;
                    rt.Release();
                    UnityEngine.Object.DestroyImmediate(rt);
                }
                results["resolution"] = new List<int> { w, h };
                results["draws_per_sample"] = draws;
                results["gpu"] = SystemInfo.graphicsDeviceName;
                results["graphics"] = SystemInfo.graphicsDeviceType.ToString();
                results["supports_gpu_recorder"] = SystemInfo.supportsGpuRecorder;
                results["precision_model"] = string.IsNullOrEmpty(precisionArg) ? prevPrecision.ToString() : precisionArg;
                return results;
            });
        }
    }
}
