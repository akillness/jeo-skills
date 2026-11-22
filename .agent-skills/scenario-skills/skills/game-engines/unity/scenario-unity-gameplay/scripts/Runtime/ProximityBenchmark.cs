// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). "Is anything near me?" at scale,
// without triggers. Survival Kids (Unite 2025, ZkvK0mX-id4): triggers and colliders pay transform
// sync for every moving collider [00:43:04]; a brute-force loop over your own list (sqrMagnitude)
// was 0.24 ms per query over about 1,000 items (5 ms for 20 queries) and a per-frame Burst KD tree
// answered the 20 queries in 0.08 ms, built in 0.11 ms on 5 workers [00:44:11]-[00:47:25].
// This file compares, on the same NativeArrays: a managed brute-force loop, a Burst brute-force job
// (.Run on the main thread), and a uniform grid (cell = query radius) rebuilt every call in a Burst
// job then queried in a Burst IJobParallelFor [added: a grid instead of the talk's Megacity KD tree;
// same idea, rebuild per frame in a job, query where the win is]. Results are checked for equality.
using System.Diagnostics;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;

namespace AgentKit.Gameplay
{
    public static class ProximityBenchmark
    {
        public struct Result
        {
            public int items, queries, iterations;
            public double managedMs, burstBruteMs, gridBuildMs, gridQueryMs;   // mean per iteration, all queries
            public bool match;
            public int totalFound;
        }

        /// <summary>Exact cell key for |cell| &lt; 32768 on x and z (a 2D grid on the ground plane).</summary>
        public static int CellKey(float3 p, float invCell)
        {
            int x = (int)math.floor(p.x * invCell) + 32768, z = (int)math.floor(p.z * invCell) + 32768;
            return (x & 0xFFFF) | (z << 16);
        }

        [BurstCompile(CompileSynchronously = true)]
        public struct BuildGridJob : IJob
        {
            [ReadOnly] public NativeArray<float3> items;
            public float invCell;
            public NativeParallelMultiHashMap<int, int> grid;
            public void Execute()
            {
                grid.Clear();
                for (int i = 0; i < items.Length; i++) grid.Add(CellKey(items[i], invCell), i);
            }
        }

        [BurstCompile(CompileSynchronously = true)]
        public struct QueryGridJob : IJobParallelFor
        {
            [ReadOnly] public NativeArray<float3> items;
            [ReadOnly] public NativeArray<float3> queries;
            [ReadOnly] public NativeParallelMultiHashMap<int, int> grid;
            public float radius, invCell;
            [WriteOnly] public NativeArray<int> found;
            public void Execute(int q)
            {
                float3 p = queries[q];
                float r2 = radius * radius;
                int cx = (int)math.floor(p.x * invCell), cz = (int)math.floor(p.z * invCell), n = 0;
                for (int dz = -1; dz <= 1; dz++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int key = ((cx + dx + 32768) & 0xFFFF) | ((cz + dz + 32768) << 16);
                        if (grid.TryGetFirstValue(key, out int idx, out var it))
                        {
                            do { if (math.distancesq(items[idx], p) <= r2) n++; }
                            while (grid.TryGetNextValue(out idx, ref it));
                        }
                    }
                found[q] = n;
            }
        }

        [BurstCompile(CompileSynchronously = true)]
        public struct BruteJob : IJob
        {
            [ReadOnly] public NativeArray<float3> items;
            [ReadOnly] public NativeArray<float3> queries;
            public float radius;
            [WriteOnly] public NativeArray<int> found;
            public void Execute()
            {
                float r2 = radius * radius;
                for (int q = 0; q < queries.Length; q++)
                {
                    int n = 0; float3 p = queries[q];
                    for (int i = 0; i < items.Length; i++) if (math.distancesq(items[i], p) <= r2) n++;
                    found[q] = n;
                }
            }
        }

        public static Result Run(int items, int queries, float radius = 5f, float worldSize = 100f, int iterations = 100, uint seed = 7)
        {
            var rng = new Random(seed);
            var pos = new NativeArray<float3>(items, Allocator.TempJob);
            var qs = new NativeArray<float3>(queries, Allocator.TempJob);
            var fA = new NativeArray<int>(queries, Allocator.TempJob);
            var fB = new NativeArray<int>(queries, Allocator.TempJob);
            var fC = new NativeArray<int>(queries, Allocator.TempJob);
            var grid = new NativeParallelMultiHashMap<int, int>(items, Allocator.TempJob);
            var managedPos = new UnityEngine.Vector3[items];
            try
            {
                float h = worldSize * 0.5f;
                for (int i = 0; i < items; i++) { pos[i] = new float3(rng.NextFloat(-h, h), 0f, rng.NextFloat(-h, h)); managedPos[i] = pos[i]; }
                for (int q = 0; q < queries; q++) qs[q] = new float3(rng.NextFloat(-h, h), 0f, rng.NextFloat(-h, h));
                float inv = 1f / radius;
                var build = new BuildGridJob { items = pos, invCell = inv, grid = grid };
                var query = new QueryGridJob { items = pos, queries = qs, grid = grid, radius = radius, invCell = inv, found = fC };
                var brute = new BruteJob { items = pos, queries = qs, radius = radius, found = fB };
                // warm-up: Burst compilation and managed JIT
                Managed(managedPos, qs, radius, fA); brute.Run(); build.Run(); query.Schedule(queries, 8).Complete();

                var sw = Stopwatch.StartNew();
                for (int it = 0; it < iterations; it++) Managed(managedPos, qs, radius, fA);
                double managed = sw.Elapsed.TotalMilliseconds / iterations;
                sw.Restart();
                for (int it = 0; it < iterations; it++) brute.Run();
                double bruteMs = sw.Elapsed.TotalMilliseconds / iterations;
                double buildMs = 0, queryMs = 0;
                for (int it = 0; it < iterations; it++)
                {
                    sw.Restart(); build.Schedule().Complete(); buildMs += sw.Elapsed.TotalMilliseconds;
                    sw.Restart(); query.Schedule(queries, 8).Complete(); queryMs += sw.Elapsed.TotalMilliseconds;
                }
                bool match = true; int total = 0;
                for (int q = 0; q < queries; q++) { if (fA[q] != fB[q] || fA[q] != fC[q]) match = false; total += fA[q]; }
                return new Result
                {
                    items = items, queries = queries, iterations = iterations,
                    managedMs = managed, burstBruteMs = bruteMs, gridBuildMs = buildMs / iterations, gridQueryMs = queryMs / iterations,
                    match = match, totalFound = total,
                };
            }
            finally
            {
                pos.Dispose(); qs.Dispose(); fA.Dispose(); fB.Dispose(); fC.Dispose(); grid.Dispose();
            }
        }

        // what a "pretty optimal" gameplay loop looks like: your own list, sqrMagnitude against r squared
        static void Managed(UnityEngine.Vector3[] items, NativeArray<float3> qs, float radius, NativeArray<int> found)
        {
            float r2 = radius * radius;
            for (int q = 0; q < qs.Length; q++)
            {
                UnityEngine.Vector3 p = qs[q]; int n = 0;
                for (int i = 0; i < items.Length; i++) if ((items[i] - p).sqrMagnitude <= r2) n++;
                found[q] = n;
            }
        }
    }
}
