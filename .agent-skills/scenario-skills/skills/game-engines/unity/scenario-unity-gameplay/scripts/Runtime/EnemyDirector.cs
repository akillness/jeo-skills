// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). One manager ticks every brain at
// a fixed rate, staggered round-robin, instead of N Update() calls every frame. Optional Burst
// path: a read-only TransformAccessArray job copies positions and forwards, then a Burst
// IJobParallelFor runs perception stages 1 and 2 (range + FOV) for every agent; brains only
// raycast when the job marked them as candidates.
// Patterns from Survival Kids (Unite 2025, ZkvK0mX-id4): update registered objects from one place
// [00:19:40]; build the TransformAccessArray once and rebuild only when the set changes, never from
// FindObjectsByType [00:32:10]; copy out of transforms in a tiny read-only job [00:33:49]; schedule
// early, complete late, and always Complete() before reading [00:36:30].
// Modes: EveryFrame (brains tick themselves in Update, the naive baseline), Sliced (director at
// tickHz), SlicedBurst (Sliced + the Burst prefilter). One type here; for many objects of mixed types
// use UpdateHub (UpdateHub.cs), which sorts registered objects by type (Survival Kids [00:22:55]).
using System.Collections.Generic;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Jobs;

namespace AgentKit.Gameplay
{
    public enum DirectorMode { EveryFrame, Sliced, SlicedBurst }

    [DefaultExecutionOrder(-100)]
    public class EnemyDirector : MonoBehaviour
    {
        public DirectorMode mode = DirectorMode.Sliced;
        [Tooltip("Brain ticks per second per agent in the sliced modes")]
        public float tickHz = 10f;
        public ObstacleAvoidanceType avoidance = ObstacleAvoidanceType.LowQualityObstacleAvoidance;
        public Transform target;

        readonly List<EnemyBrain> m_Brains = new List<EnemyBrain>();
        int m_Cursor;
        float m_Carry;
        bool m_Dirty = true;

        TransformAccessArray m_Taa;
        NativeArray<float3> m_Pos, m_Fwd;
        NativeArray<byte> m_Candidate;
        JobHandle m_Handle;
        bool m_Scheduled;

        public int Count => m_Brains.Count;

        void Start()
        {
            m_Brains.Clear();
            m_Brains.AddRange(FindObjectsByType<EnemyBrain>(FindObjectsSortMode.None)); // once, at start (never per frame)
            foreach (var b in m_Brains)
            {
                b.selfTick = mode == DirectorMode.EveryFrame;
                b.Agent.obstacleAvoidanceType = avoidance;
                if (target != null && b.target == null) b.target = target;
            }
            // Survival Kids sorted registered objects by type for cache locality; one type here.
            m_Dirty = true;
        }

        public void Register(EnemyBrain b) { if (!m_Brains.Contains(b)) { m_Brains.Add(b); m_Dirty = true; } }
        public void Unregister(EnemyBrain b) { if (m_Brains.Remove(b)) m_Dirty = true; }

        void Update()
        {
            if (mode == DirectorMode.EveryFrame || m_Brains.Count == 0) return;
            long t0 = AIBudget.Begin();
            if (mode == DirectorMode.SlicedBurst && m_Scheduled)
            {
                m_Handle.Complete();                 // always complete before reading, even if the job looks done
                m_Scheduled = false;
                for (int i = 0; i < m_Brains.Count && i < m_Candidate.Length; i++) m_Brains[i].prefilter = m_Candidate[i];
            }
            // how many brains to tick this frame so each gets tickHz ticks per second
            m_Carry += m_Brains.Count * tickHz * Time.deltaTime;
            int n = Mathf.Min(m_Brains.Count, (int)m_Carry);
            m_Carry -= n;
            float now = Time.time;
            for (int k = 0; k < n; k++)
            {
                if (m_Cursor >= m_Brains.Count) m_Cursor = 0;
                var b = m_Brains[m_Cursor++];
                if (b != null && b.isActiveAndEnabled) { b.Tick(now); AIBudget.Ticks++; }
            }
            AIBudget.Add(System.Diagnostics.Stopwatch.GetTimestamp() - t0);
        }

        void LateUpdate()
        {
            if (mode != DirectorMode.SlicedBurst || m_Brains.Count == 0 || target == null) return;
            long t0 = AIBudget.Begin();
            if (m_Dirty) Rebuild();
            var eye = new float3(0f, m_Brains[0].eyeHeight, 0f);
            var copy = new CopyPoseJob { pos = m_Pos, fwd = m_Fwd };
            var h = copy.ScheduleReadOnly(m_Taa, 64);
            var tp = target.position + Vector3.up * m_Brains[0].targetAimHeight;
            var pre = new PerceptionPrefilterJob
            {
                pos = m_Pos, fwd = m_Fwd, eyeOffset = eye, target = tp,
                rangeSq = m_Brains[0].sightRange * m_Brains[0].sightRange,
                cosHalfFov = math.cos(math.radians(0.5f * m_Brains[0].fovDeg)),
                candidate = m_Candidate,
            };
            m_Handle = pre.Schedule(m_Brains.Count, 32, h);  // completed next Update (one frame of latency is fine for senses)
            JobHandle.ScheduleBatchedJobs();
            m_Scheduled = true;
            AIBudget.Add(System.Diagnostics.Stopwatch.GetTimestamp() - t0);
        }

        void Rebuild()
        {
            DisposeNative();
            var ts = new Transform[m_Brains.Count];
            for (int i = 0; i < ts.Length; i++) ts[i] = m_Brains[i].transform;
            m_Taa = new TransformAccessArray(ts);
            m_Pos = new NativeArray<float3>(ts.Length, Allocator.Persistent);
            m_Fwd = new NativeArray<float3>(ts.Length, Allocator.Persistent);
            m_Candidate = new NativeArray<byte>(ts.Length, Allocator.Persistent);
            m_Dirty = false;
        }

        void DisposeNative()
        {
            if (m_Scheduled) { m_Handle.Complete(); m_Scheduled = false; }
            if (m_Taa.isCreated) m_Taa.Dispose();
            if (m_Pos.IsCreated) m_Pos.Dispose();
            if (m_Fwd.IsCreated) m_Fwd.Dispose();
            if (m_Candidate.IsCreated) m_Candidate.Dispose();
        }

        void OnDestroy() { DisposeNative(); }
        void OnDisable() { DisposeNative(); m_Dirty = true; }
    }

    [BurstCompile(CompileSynchronously = true)]
    public struct CopyPoseJob : IJobParallelForTransform
    {
        [WriteOnly] public NativeArray<float3> pos;
        [WriteOnly] public NativeArray<float3> fwd;

        public void Execute(int index, TransformAccess t)
        {
            if (!t.isValid) return;
            pos[index] = t.position;
            fwd[index] = math.mul(t.rotation, new float3(0f, 0f, 1f));
        }
    }

    /// <summary>Perception stages 1 and 2 (squared range, horizontal FOV cone) for every agent.</summary>
    [BurstCompile(CompileSynchronously = true)]
    public struct PerceptionPrefilterJob : IJobParallelFor
    {
        [ReadOnly] public NativeArray<float3> pos;
        [ReadOnly] public NativeArray<float3> fwd;
        public float3 eyeOffset;
        public float3 target;
        public float rangeSq;
        public float cosHalfFov;
        [WriteOnly] public NativeArray<byte> candidate;

        public void Execute(int i)
        {
            float3 eye = pos[i] + eyeOffset;
            float3 to = target - eye;
            if (math.lengthsq(to) > rangeSq) { candidate[i] = 0; return; }
            float2 f = fwd[i].xz, d = to.xz;
            float lf = math.length(f), ld = math.length(d);
            if (lf < 1e-3f || ld < 1e-3f) { candidate[i] = 1; return; }
            candidate[i] = (byte)(math.dot(f / lf, d / ld) >= cosHalfFov ? 1 : 0);
        }
    }
}
