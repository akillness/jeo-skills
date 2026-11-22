// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Measures the two job-system rules an
// agent cannot see without a Profiler Timeline (Survival Kids, Unite 2025, ZkvK0mX-id4):
//  1. "Just don't do transforms on the main thread while you're using transform access arrays"
//     [00:26:42]: a main-thread write to a transform held by a running TransformAccessArray job waits
//     for that job. TransformWriteWhileJobRuns times the write (in the array) against a control write
//     (a transform outside it) while the same job runs.
//  2. Fill main-thread stalls (WaitForJobGroupID) with Burst .Run() work: "free performance"
//     [00:39:15]-[00:39:46]. StallFill times Complete() alone, a Burst .Run() alone, and the .Run()
//     done while the workers are busy, before Complete().
// Also: copy transforms out in a tiny read-only job, then do the math on NativeArrays [00:33:49];
// build the TransformAccessArray from your own list, never from FindObjectsByType<Transform>
// [00:32:10]; Complete() before reading, even if the job looks finished [00:36:30].
using System.Collections.Generic;
using System.Diagnostics;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Jobs;

namespace AgentKit.Gameplay
{
    public static class JobStallProbe
    {
        [BurstCompile(CompileSynchronously = true)]
        public struct BusyJob : IJobParallelFor
        {
            public NativeArray<float> data;
            public int work;
            public void Execute(int i)
            {
                float x = data[i];
                for (int k = 0; k < work; k++) x = math.sin(x) * 0.5f + 0.25f;
                data[i] = x;
            }
        }

        [BurstCompile(CompileSynchronously = true)]
        public struct BusySingleJob : IJob
        {
            public NativeArray<float> data;
            public int work;
            public void Execute()
            {
                for (int i = 0; i < data.Length; i++)
                {
                    float x = data[i];
                    for (int k = 0; k < work; k++) x = math.cos(x) * 0.5f + 0.25f;
                    data[i] = x;
                }
            }
        }

        /// <summary>A deliberately slow read-only transform job (copies positions after busy math).</summary>
        [BurstCompile(CompileSynchronously = true)]
        public struct SlowCopyJob : IJobParallelForTransform
        {
            [WriteOnly] public NativeArray<float3> pos;
            public int work;
            public void Execute(int index, TransformAccess t)
            {
                if (!t.isValid) return;
                float x = index;
                for (int k = 0; k < work; k++) x = math.sin(x) * 0.5f + 0.25f;
                pos[index] = (float3)t.position + new float3(0f, x * 1e-9f, 0f);
            }
        }

        static double Ms(long t0) => (Stopwatch.GetTimestamp() - t0) * 1000.0 / Stopwatch.Frequency;

        /// <summary>transforms: the set given to the job; outsider: a transform not in the set.
        /// Returns ms for the in-set write, the outsider write, and the job length.</summary>
        public static Dictionary<string, object> TransformWriteWhileJobRuns(Transform[] transforms, Transform outsider, int work)
        {
            var taa = new TransformAccessArray(transforms);
            var pos = new NativeArray<float3>(transforms.Length, Allocator.TempJob);
            try
            {
                var job = new SlowCopyJob { pos = pos, work = work };
                job.ScheduleReadOnly(taa, 1).Complete();                 // warm-up (Burst compile)

                long t0 = Stopwatch.GetTimestamp();
                job.ScheduleReadOnly(taa, 1).Complete();
                double jobMs = Ms(t0);

                var h = job.ScheduleReadOnly(taa, 1);
                JobHandle.ScheduleBatchedJobs();
                t0 = Stopwatch.GetTimestamp();
                outsider.position += Vector3.right * 0.001f;             // control: not in the array
                double outsiderMs = Ms(t0);
                bool runningBefore = !h.IsCompleted;
                t0 = Stopwatch.GetTimestamp();
                transforms[transforms.Length - 1].position += Vector3.right * 0.001f;   // in the array
                double inSetMs = Ms(t0);
                bool doneAfterWrite = h.IsCompleted;
                h.Complete();
                return new Dictionary<string, object>
                {
                    { "job_ms", System.Math.Round(jobMs, 4) }, { "write_outsider_ms", System.Math.Round(outsiderMs, 4) },
                    { "write_in_array_ms", System.Math.Round(inSetMs, 4) }, { "job_running_before_write", runningBefore },
                    { "job_done_after_write", doneAfterWrite }, { "transforms", transforms.Length },
                };
            }
            finally { pos.Dispose(); taa.Dispose(); }
        }

        /// <summary>Big parallel job on the workers vs a smaller Burst job on the main thread.</summary>
        public static Dictionary<string, object> StallFill(int bigCount, int bigWork, int smallCount, int smallWork, int repeats = 20)
        {
            var big = new NativeArray<float>(bigCount, Allocator.TempJob);
            var small = new NativeArray<float>(smallCount, Allocator.TempJob);
            try
            {
                var bj = new BusyJob { data = big, work = bigWork };
                var sj = new BusySingleJob { data = small, work = smallWork };
                bj.Schedule(bigCount, 16).Complete(); sj.Run();          // warm-up
                double wait = 0, run = 0, fill = 0;
                for (int r = 0; r < repeats; r++)
                {
                    long t0 = Stopwatch.GetTimestamp();
                    bj.Schedule(bigCount, 16).Complete();                // main thread waits (WaitForJobGroupID)
                    wait += Ms(t0);
                    t0 = Stopwatch.GetTimestamp();
                    sj.Run();                                            // main-thread Burst work alone
                    run += Ms(t0);
                    t0 = Stopwatch.GetTimestamp();
                    var h = bj.Schedule(bigCount, 16);
                    JobHandle.ScheduleBatchedJobs();
                    sj.Run();                                            // done inside the wait
                    h.Complete();
                    fill += Ms(t0);
                }
                wait /= repeats; run /= repeats; fill /= repeats;
                return new Dictionary<string, object>
                {
                    { "complete_wait_ms", System.Math.Round(wait, 4) }, { "run_alone_ms", System.Math.Round(run, 4) },
                    { "run_inside_wait_ms", System.Math.Round(fill, 4) }, { "sequential_sum_ms", System.Math.Round(wait + run, 4) },
                    { "saved_ms", System.Math.Round(wait + run - fill, 4) },
                    { "workers", Unity.Jobs.LowLevel.Unsafe.JobsUtility.JobWorkerCount },
                };
            }
            finally { big.Dispose(); small.Dispose(); }
        }
    }
}
