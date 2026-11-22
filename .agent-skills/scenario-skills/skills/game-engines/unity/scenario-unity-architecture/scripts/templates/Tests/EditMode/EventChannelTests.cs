// EditMode tests of the event-channel debug plan and of the listener rules (procedures.md A11):
// RaiseDebug sends the serialized debug value, counts and the "logRaises" log line; listeners iterate
// backwards so a response can unregister itself; the custom inspector binds to every channel type; and
// the allocation per call of a channel Raise versus a persistent UnityEvent Invoke is MEASURED on this
// editor (Hipple, raQ3iHhE_Kk [00:32:15], said in 2017 that UnityEvents allocate on every invoke).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Text.RegularExpressions;
using Game.EditorTools;
using Game.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public sealed class EventHitCounter : MonoBehaviour
    {
        public int Hits;
        public void Hit() { Hits++; }
    }

    public class EventChannelTests
    {
        [Test]
        public void RaiseDebug_SendsTheDebugValue_CountsAndLogs()
        {
            var ch = ScriptableObject.CreateInstance<FloatEventChannel>();
            ch.name = "EVT_Test";
            var so = new SerializedObject(ch);
            so.FindProperty("debugValue").floatValue = 42f;
            so.FindProperty("logRaises").boolValue = true;
            so.ApplyModifiedPropertiesWithoutUndo();
            float got = 0f;
            ch.Register(v => got = v);
            LogAssert.Expect(LogType.Log, new Regex(@"\[EVT_Test\] raised to 1 listener\(s\)"));
            ch.RaiseDebug();
            Assert.AreEqual(42f, got);
            Assert.AreEqual(1, ch.RaiseCount);
            Assert.AreEqual(1, ch.ListenerCount);
            UnityEngine.Object.DestroyImmediate(ch);
        }

        [Test]
        public void A_ListenerMayUnregisterItself_WhileBeingRaised()
        {
            var ch = ScriptableObject.CreateInstance<VoidEventChannel>();
            int a = 0, b = 0, c = 0;
            Action<Unit> self = null;
            ch.Register(_ => a++);
            self = _ => { b++; ch.Unregister(self); };
            ch.Register(self);
            ch.Register(_ => c++);
            ch.Raise();
            ch.Raise();
            Assert.AreEqual(2, a, "earlier listener still called");
            Assert.AreEqual(1, b, "self-removing listener called once");
            Assert.AreEqual(2, c, "later listener not skipped");
            UnityEngine.Object.DestroyImmediate(ch);
        }

        [Test]
        public void TheCustomInspector_BindsToEveryChannelType()
        {
            foreach (var ch in new EventChannelBase[] { ScriptableObject.CreateInstance<VoidEventChannel>(),
                                                        ScriptableObject.CreateInstance<FloatEventChannel>(),
                                                        ScriptableObject.CreateInstance<StringEventChannel>() })
            {
                var ed = UnityEditor.Editor.CreateEditor(ch);
                Assert.IsInstanceOf<EventChannelEditor>(ed, ch.GetType().Name);
                UnityEngine.Object.DestroyImmediate(ed);
                UnityEngine.Object.DestroyImmediate(ch);
            }
        }

        // GC.GetAllocatedBytesForCurrentThread returned 0 for everything on 6000.3.21f1 (Mono), observed. The
        // managed heap size (GC.GetTotalMemory) moves in blocks of several KB, so N is large: 10,000 calls give a
        // resolution under 1 byte per call. No collection may run during the measurement (retried).
        static object s_Sink;

        static long AllocatedBy(Action body, int n)
        {
            body();                                                   // warm-up: first-call caches
            for (int attempt = 0; attempt < 8; attempt++)
            {
                GC.Collect();
                GC.WaitForPendingFinalizers();
                int gcBefore = GC.CollectionCount(0);
                long before = GC.GetTotalMemory(false);
                for (int i = 0; i < n; i++) body();
                long after = GC.GetTotalMemory(false);
                if (GC.CollectionCount(0) == gcBefore) return Math.Max(0, after - before);
            }
            return -1;                                                // a collection hit every attempt
        }

        [Test]
        public void Allocation_ChannelRaise_Versus_PersistentUnityEvent()
        {
            const int N = 10000;
            long calibration = AllocatedBy(() => { s_Sink = new byte[1000]; }, 100);
            Debug.Log("[EventAlloc] calibration: 100 x new byte[1000] measured " + calibration + " bytes");
            Assert.GreaterOrEqual(calibration, 50000, "the heap-size measurement does not see allocations here");

            var ch = ScriptableObject.CreateInstance<VoidEventChannel>();
            int n = 0;
            ch.Register(_ => n++);
            long channel = AllocatedBy(() => ch.Raise(), N);

            var go = new GameObject("UnityEventTarget");
            var target = go.AddComponent<EventHitCounter>();
            var persistent = new UnityEvent();
            UnityEditor.Events.UnityEventTools.AddVoidPersistentListener(persistent, target.Hit);
            persistent.SetPersistentListenerState(0, UnityEventCallState.EditorAndRuntime);   // default RuntimeOnly: silent in Edit mode
            long unityEvent = AllocatedBy(() => persistent.Invoke(), N);

            var runtime = new UnityEvent();
            runtime.AddListener(target.Hit);
            long runtimeListener = AllocatedBy(() => runtime.Invoke(), N);

            Debug.Log(string.Format("[EventAlloc] heap growth over {0} calls: channel Raise {1} B ({2:0.###} B/call), persistent UnityEvent {3} B ({4:0.###} B/call), runtime UnityEvent listener {5} B ({6:0.###} B/call); persistent target hits {7}",
                N, channel, channel / (double)N, unityEvent, unityEvent / (double)N, runtimeListener, runtimeListener / (double)N, target.Hits));
            Assert.Less(channel / (double)N, 1.0, "a channel Raise with C# listeners must not allocate per call");
            Assert.AreEqual(2 * (N + 1), target.Hits, "both UnityEvents reached the target");
            UnityEngine.Object.DestroyImmediate(go);
            UnityEngine.Object.DestroyImmediate(ch);
        }
    }
}
