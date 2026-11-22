// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Line-of-sight rays for many agents
// as one RaycastCommand batch, scheduled this frame and completed next frame (6.3 Manual, Use batch
// queries; Unity pTz3LMQpvfA [00:10:48]-[00:11:55]: schedule early, Complete late). Unity 6 form:
// RaycastCommand(from, direction, QueryParameters, distance), where QueryParameters carries the layer
// mask, the trigger rule and the backface flags; the pre-2022 constructor with a layerMask argument
// is still documented but QueryParameters is the current one (pTz3LMQpvfA Outdated; doc-unity6-physics
// Outdated). One frame of sensing latency is fine for AI [added].
using System;
using System.Collections.Generic;
using Unity.Collections;
using Unity.Jobs;
using UnityEngine;

namespace AgentKit.Gameplay
{
    public sealed class LineOfSightBatch : IDisposable
    {
        NativeArray<RaycastCommand> m_Commands;
        NativeArray<RaycastHit> m_Hits;
        JobHandle m_Handle;
        int m_Count;
        bool m_Scheduled;

        public int Count => m_Count;
        public bool Scheduled => m_Scheduled;

        public LineOfSightBatch(int capacity)
        {
            m_Commands = new NativeArray<RaycastCommand>(capacity, Allocator.Persistent);
            m_Hits = new NativeArray<RaycastHit>(capacity, Allocator.Persistent);
        }

        /// <summary>One ray per eye toward its target, occluders only, triggers ignored.</summary>
        public void Schedule(IReadOnlyList<Vector3> eyes, IReadOnlyList<Vector3> targets, int occluderMask, int minCommandsPerJob = 32)
        {
            Complete();
            m_Count = Mathf.Min(eyes.Count, m_Commands.Length);
            var qp = new QueryParameters(occluderMask, false, QueryTriggerInteraction.Ignore, false);
            for (int i = 0; i < m_Count; i++)
            {
                var d = targets[i] - eyes[i];
                float dist = d.magnitude;
                m_Commands[i] = new RaycastCommand(eyes[i], dist > 1e-5f ? d / dist : Vector3.forward, qp, dist);
            }
            m_Handle = RaycastCommand.ScheduleBatch(m_Commands.GetSubArray(0, m_Count), m_Hits.GetSubArray(0, m_Count), minCommandsPerJob, 1, default);
            JobHandle.ScheduleBatchedJobs();
            m_Scheduled = true;
        }

        /// <summary>Always before reading, even if the job looks finished (Survival Kids [00:36:30]).</summary>
        public void Complete()
        {
            if (!m_Scheduled) return;
            m_Handle.Complete();
            m_Scheduled = false;
        }

        /// <summary>True when nothing on the occluder mask blocked ray i. Call Complete() first.</summary>
        public bool Visible(int i)
        {
            if (m_Scheduled) throw new InvalidOperationException("Complete() before reading results");
            return m_Hits[i].collider == null;
        }

        public void Dispose()
        {
            Complete();
            if (m_Commands.IsCreated) m_Commands.Dispose();
            if (m_Hits.IsCreated) m_Hits.Dispose();
        }
    }
}
