// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). Compute shader test harness: dispatch a
// kernel headless (needs graphics: ut_run.run_method(..., graphics=True); -nographics has no GPU device)
// and compare the GPU result with a CPU reference.
//
// Job RunComputeTemplate args: compute (asset path of AgentCompute.compute), count (default 100003, deliberately
//   not a multiple of 64), bins (16), size (256), out_png.
//   SquareAdd: GraphicsBuffer (Target.Structured) filled from C# (never trust zeroed memory), dispatch
//     ceil(count / threadGroupX) groups (GetKernelThreadGroupSizes, not a hard-coded 8), readback, max abs error.
//   Histogram: RWStructuredBuffer<uint> atomics (Metal has no texture atomics), bin sum must equal count.
//   Pattern: RWTexture2D<float4> into a RenderTexture with enableRandomWrite, saved to PNG to LOOK at.
// Synchronous GetData is fine in a test; per-frame code uses AsyncGPUReadback.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Shaders
{
    public static class ComputeJobs
    {
        public static void RunComputeTemplate()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                if (!SystemInfo.supportsComputeShaders) throw new InvalidOperationException("no compute support on " + SystemInfo.graphicsDeviceType);
                var cs = AssetDatabase.LoadAssetAtPath<ComputeShader>(AgentJob.Str("compute"));
                if (cs == null) throw new ArgumentException("compute shader not found: " + AgentJob.Str("compute"));
                int count = AgentJob.Int("count", 100003), bins = AgentJob.Int("bins", 16), size = AgentJob.Int("size", 256);
                float offset = 0.25f;
                var result = new Dictionary<string, object> { { "graphics", SystemInfo.graphicsDeviceType.ToString() }, { "count", count } };

                var input = new float[count];
                var rng = new System.Random(1234);
                for (int i = 0; i < count; i++) input[i] = (float)rng.NextDouble();

                var inBuf = new GraphicsBuffer(GraphicsBuffer.Target.Structured, count, sizeof(float));
                var outBuf = new GraphicsBuffer(GraphicsBuffer.Target.Structured, count, sizeof(float));
                var binBuf = new GraphicsBuffer(GraphicsBuffer.Target.Structured, bins, sizeof(uint));
                RenderTexture rt = null;
                try
                {
                    inBuf.SetData(input);
                    outBuf.SetData(new float[count]);          // initialise: new buffers can hold garbage or NaN
                    binBuf.SetData(new uint[bins]);

                    int k = cs.FindKernel("SquareAdd");
                    cs.GetKernelThreadGroupSizes(k, out uint gx, out _, out _);
                    int groups = (int)((count + gx - 1) / gx);  // ceiling division; the kernel bounds-checks the tail
                    cs.SetBuffer(k, "_Input", inBuf);
                    cs.SetBuffer(k, "_Output", outBuf);
                    cs.SetInt("_Count", count);
                    cs.SetFloat("_Offset", offset);
                    cs.Dispatch(k, groups, 1, 1);
                    var output = new float[count];
                    outBuf.GetData(output);
                    double maxErr = 0; int nan = 0;
                    for (int i = 0; i < count; i++)
                    {
                        if (float.IsNaN(output[i]) || float.IsInfinity(output[i])) nan++;
                        maxErr = Math.Max(maxErr, Math.Abs(output[i] - (input[i] * input[i] + offset)));
                    }
                    result["square_add"] = new Dictionary<string, object>
                    {
                        { "thread_group_x", (int)gx }, { "groups", groups }, { "max_abs_error", maxErr }, { "nan_or_inf", nan },
                        { "sample", new List<object> { input[0], output[0], input[count - 1], output[count - 1] } },
                    };

                    int kh = cs.FindKernel("Histogram");
                    cs.GetKernelThreadGroupSizes(kh, out uint hx, out _, out _);
                    cs.SetBuffer(kh, "_Input", inBuf);
                    cs.SetBuffer(kh, "_Bins", binBuf);
                    cs.SetInt("_Count", count);
                    cs.SetInt("_BinCount", bins);
                    cs.Dispatch(kh, (int)((count + hx - 1) / hx), 1, 1);
                    var gpuBins = new uint[bins];
                    binBuf.GetData(gpuBins);
                    var cpuBins = new int[bins];
                    foreach (var v in input) cpuBins[Math.Min((int)(v * bins), bins - 1)]++;
                    long sum = 0; int mismatched = 0;
                    for (int b = 0; b < bins; b++) { sum += gpuBins[b]; if (gpuBins[b] != cpuBins[b]) mismatched++; }
                    result["histogram"] = new Dictionary<string, object> { { "sum", sum }, { "mismatched_bins", mismatched }, { "bins", new List<uint>(gpuBins) } };

                    int kp = cs.FindKernel("Pattern");
                    cs.GetKernelThreadGroupSizes(kp, out uint px, out uint py, out _);
                    rt = new RenderTexture(size, size, 0, RenderTextureFormat.ARGBFloat) { enableRandomWrite = true };
                    rt.Create();                                  // enableRandomWrite BEFORE Create
                    cs.SetTexture(kp, "_Target", rt);
                    cs.SetInts("_Size", size, size);
                    cs.SetFloat("_Time01", 0.25f);
                    cs.Dispatch(kp, (int)((size + px - 1) / px), (int)((size + py - 1) / py), 1);
                    var prev = RenderTexture.active;
                    RenderTexture.active = rt;
                    var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true);
                    tex.ReadPixels(new Rect(0, 0, size, size), 0, 0);
                    tex.Apply();
                    RenderTexture.active = prev;
                    var png = AgentJob.Has("out_png") ? AgentJob.ResolvePath(AgentJob.Str("out_png")) : Path.Combine(AgentJob.OutDir("compute"), "pattern.png");
                    Directory.CreateDirectory(Path.GetDirectoryName(png));
                    File.WriteAllBytes(png, tex.EncodeToPNG());
                    UnityEngine.Object.DestroyImmediate(tex);
                    result["pattern"] = new Dictionary<string, object> { { "png", png }, { "groups", new List<int> { (int)((size + px - 1) / px), (int)((size + py - 1) / py) } } };
                }
                finally
                {
                    inBuf.Release(); outBuf.Release(); binBuf.Release();   // always release GPU buffers
                    if (rt != null) { rt.Release(); UnityEngine.Object.DestroyImmediate(rt); }
                }
                return result;
            });
        }
    }
}
