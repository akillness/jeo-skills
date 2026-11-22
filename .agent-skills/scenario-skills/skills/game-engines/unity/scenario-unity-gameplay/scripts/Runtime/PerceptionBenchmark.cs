// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). The "is Burst worth it here?"
// micro-benchmark: the same perception prefilter (range + FOV) over N agents as a managed loop,
// a Burst job run on the main thread (.Run, the Survival Kids "fill the WaitForJobGroupID gap"
// path) and a Burst IJobParallelFor on the workers (.Schedule + Complete). Data in NativeArrays
// for all three so only the execution changes. Editor numbers carry job safety checks and are
// for comparison only; confirm in a development player (scenario-unity-performance).
using System.Diagnostics;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;

namespace AgentKit.Gameplay
{
    public static class PerceptionBenchmark
    {
        public struct Result
        {
            public int agents, iterations, candidates;
            public double managedMs, burstRunMs, burstParallelMs;   // mean per iteration
            public bool resultsMatch;
        }

        public static Result Run(int agents, int iterations, uint seed = 1234)
        {
            var rng = new Random(seed);
            var pos = new NativeArray<float3>(agents, Allocator.TempJob);
            var fwd = new NativeArray<float3>(agents, Allocator.TempJob);
            var candA = new NativeArray<byte>(agents, Allocator.TempJob);
            var candB = new NativeArray<byte>(agents, Allocator.TempJob);
            var candC = new NativeArray<byte>(agents, Allocator.TempJob);
            try
            {
                for (int i = 0; i < agents; i++)
                {
                    pos[i] = new float3(rng.NextFloat(-50f, 50f), 0f, rng.NextFloat(-50f, 50f));
                    float a = rng.NextFloat(0f, 2f * math.PI);
                    fwd[i] = new float3(math.sin(a), 0f, math.cos(a));
                }
                var job = new PerceptionPrefilterJob
                {
                    pos = pos, fwd = fwd, eyeOffset = new float3(0f, 1.5f, 0f), target = new float3(3f, 1f, -2f),
                    rangeSq = 15f * 15f, cosHalfFov = math.cos(math.radians(55f)), candidate = candA,
                };
                // warm up: forces Burst compilation (CompileSynchronously) and JIT of the managed path
                job.Run(agents); Managed(pos, fwd, job, candB); job.candidate = candC; job.Schedule(agents, 64).Complete();

                var sw = Stopwatch.StartNew();
                for (int it = 0; it < iterations; it++) Managed(pos, fwd, job, candB);
                double managed = sw.Elapsed.TotalMilliseconds / iterations;

                job.candidate = candA;
                sw.Restart();
                for (int it = 0; it < iterations; it++) job.Run(agents);
                double run = sw.Elapsed.TotalMilliseconds / iterations;

                job.candidate = candC;
                sw.Restart();
                for (int it = 0; it < iterations; it++) job.Schedule(agents, 64).Complete();
                double par = sw.Elapsed.TotalMilliseconds / iterations;

                bool match = true; int count = 0;
                for (int i = 0; i < agents; i++)
                {
                    if (candA[i] != candB[i] || candA[i] != candC[i]) match = false;
                    count += candA[i];
                }
                return new Result { agents = agents, iterations = iterations, candidates = count,
                    managedMs = managed, burstRunMs = run, burstParallelMs = par, resultsMatch = match };
            }
            finally
            {
                pos.Dispose(); fwd.Dispose(); candA.Dispose(); candB.Dispose(); candC.Dispose();
            }
        }

        static void Managed(NativeArray<float3> pos, NativeArray<float3> fwd, PerceptionPrefilterJob j, NativeArray<byte> outp)
        {
            for (int i = 0; i < pos.Length; i++)
            {
                float3 eye = pos[i] + j.eyeOffset;
                float3 to = j.target - eye;
                if (math.lengthsq(to) > j.rangeSq) { outp[i] = 0; continue; }
                float2 f = fwd[i].xz, d = to.xz;
                float lf = math.length(f), ld = math.length(d);
                if (lf < 1e-3f || ld < 1e-3f) { outp[i] = 1; continue; }
                outp[i] = (byte)(math.dot(f / lf, d / ld) >= j.cosHalfFov ? 1 : 0);
            }
        }
    }
}
