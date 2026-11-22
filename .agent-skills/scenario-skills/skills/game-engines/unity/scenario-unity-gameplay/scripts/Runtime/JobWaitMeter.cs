// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Main-thread time spent waiting on
// jobs, per frame, without a Profiler window: the "WaitForJobGroupID" marker (category Jobs) read
// through a ProfilerRecorder. Survival Kids looks for these stalls in the Timeline and fills them
// with Burst .Run() work ("free performance", ZkvK0mX-id4 [00:39:15]); in batch mode an agent has no
// Timeline, so this meter gives the number.
// Measured in 6000.3.21f1 batch Play mode (Profiler off): LastValue and Count stayed 0 and
// CurrentValue kept ACCUMULATING across frames (31.4 ms after one stalled frame, then 169 and 299 ms
// means over later frames), so the meter reads CurrentValue at the very end of each frame (LateUpdate,
// order 10001) and keeps the difference from the previous reading. Waits after LateUpdate (rendering
// jobs) land in the next frame's number: this is a gameplay-code gauge, not a Timeline.
using System.Collections.Generic;
using System.Linq;
using Unity.Profiling;
using Unity.Profiling.LowLevel.Unsafe;
using UnityEngine;

namespace AgentKit.Gameplay
{
    [DefaultExecutionOrder(10001)]
    public class JobWaitMeter : MonoBehaviour
    {
        public const string Marker = "WaitForJobGroupID";
        public readonly List<float> frameMs = new List<float>(1024);
        public bool Available { get; private set; }

        ProfilerRecorder m_Rec;
        long m_Prev;

        void OnEnable()
        {
            frameMs.Clear();
            var handles = new List<ProfilerRecorderHandle>();
            ProfilerRecorderHandle.GetAvailable(handles);
            foreach (var h in handles)
            {
                if (ProfilerRecorderHandle.GetDescription(h).Name != Marker) continue;
                m_Rec = new ProfilerRecorder(h, 1, ProfilerRecorderOptions.Default);
                m_Rec.Start();
                m_Prev = m_Rec.CurrentValue;
                Available = true;
                break;
            }
        }

        void LateUpdate()
        {
            if (!Available || !m_Rec.Valid) return;
            long now = m_Rec.CurrentValue;
            long delta = now >= m_Prev ? now - m_Prev : now;      // a reset (flushed frame) restarts from 0
            m_Prev = now;
            frameMs.Add(delta / 1e6f);
        }

        void OnDisable()
        {
            if (m_Rec.Valid) m_Rec.Dispose();
            Available = false;
        }

        public float MeanMs(int skip = 0) => frameMs.Count > skip ? frameMs.Skip(skip).Average() : 0f;
        public float MaxMs(int skip = 0) => frameMs.Count > skip ? frameMs.Skip(skip).Max() : 0f;
    }
}
