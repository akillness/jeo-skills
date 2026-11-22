// scenario-unity-performance v0.1 (2026-09-24). Counts managed allocations made by one block of code.
//
// Pattern from git-amend (ham_w48aRJ4 [00:01:09]-[00:02:45]), modeled on Unity's own test helper
// behind Is.Not.AllocatingGCMemory(): a Recorder on the built-in "GC.Alloc" sampler, disabled
// while it is configured, filtered to the current thread, then each sample = one allocation.
//
//   using (var a = AllocScope.Begin()) { system.Tick(); }   // a.Count after Dispose
//   int n = AllocScope.Measure(() => system.Tick());          // same, one line
//
// Count is a number of allocations, not bytes, and never a time: GC.Alloc samples carry an
// artificial duration (Unity profiling e-book p. 27). Editor numbers include Editor-only
// allocations (GetComponent allocates in the Editor, not in players: 6.3 Manual).
// Web has no worker threads: thread filtering is skipped there.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance (EditMode test).
using System;
using UnityEngine.Profiling;

namespace AgentKit.Performance
{
    public sealed class AllocScope : IDisposable
    {
        Recorder m_Recorder;
        public int Count { get; private set; } = -1;

        AllocScope()
        {
            m_Recorder = Recorder.Get("GC.Alloc");
            m_Recorder.enabled = false;          // clean slate: setup allocations are not counted
#if !UNITY_WEBGL || UNITY_EDITOR
            m_Recorder.FilterToCurrentThread();  // other threads (jobs, loading) excluded
#endif
            m_Recorder.enabled = true;
        }

        public static AllocScope Begin() => new AllocScope();

        public int Stop()
        {
            if (m_Recorder == null) return Count;
            m_Recorder.enabled = false;
#if !UNITY_WEBGL || UNITY_EDITOR
            m_Recorder.CollectFromAllThreads();
#endif
            Count = m_Recorder.sampleBlockCount;  // one sample per managed allocation
            m_Recorder = null;
            return Count;
        }

        public void Dispose() => Stop();

        public static int Measure(Action body)
        {
            var scope = new AllocScope();
            body();
            return scope.Stop();
        }
    }
}
