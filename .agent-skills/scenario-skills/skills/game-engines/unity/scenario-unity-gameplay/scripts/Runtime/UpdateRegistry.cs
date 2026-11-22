// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). A plain C# update registry: every
// registered object is updated from one place, grouped by concrete type, instead of N
// MonoBehaviour.Update calls in engine order. UpdateHub.cs wraps one in a scene singleton; Edit Mode
// tests and benchmarks drive this class directly.
// Survival Kids (Unite 2025, ZkvK0mX-id4): Update runs in an effectively random order (creation and
// component order) [00:12:06]; updating objects of the same kind together keeps their code and shared
// data hot; same algorithms, only reordered: mean and median 12% faster, worst frame 2.18 -> 1.43 ms
// [00:22:55]-[00:24:32]. Rules built in:
//  - IManualUpdate.ManualUpdate, never Update, so the engine cannot call it a second time [00:19:40];
//    any object can register, not only MonoBehaviours [00:20:47];
//  - Register / Unregister refuse and count double registration and double removal ("happen more
//    than you expect") [00:18:35]; removal by swap-back;
//  - register or unregister only sets a dirty flag; the sort runs once, lazily, at the start of the
//    next tick [00:22:22];
//  - objects removed during a tick are skipped for the rest of that tick; objects added during a
//    tick start next tick [added].
using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace AgentKit.Gameplay
{
    /// <summary>Implemented instead of Update() by anything the hub ticks.</summary>
    public interface IManualUpdate
    {
        void ManualUpdate(float dt);
    }

    public sealed class UpdateRegistry
    {
        struct Entry
        {
            public int key;
            public IManualUpdate item;
        }

        static readonly Dictionary<Type, int> s_TypeKeys = new Dictionary<Type, int>();
        static readonly Comparison<Entry> s_ByKey = (a, b) => a.key.CompareTo(b.key);

        /// <summary>Called from UpdateHub.ResetStatics (SubsystemRegistration): the type keys are static.</summary>
        public static void ResetStaticKeys() { s_TypeKeys.Clear(); }

        static int KeyOf(IManualUpdate u)
        {
            var t = u.GetType();
            if (!s_TypeKeys.TryGetValue(t, out var k)) { k = s_TypeKeys.Count; s_TypeKeys.Add(t, k); }
            return k;
        }

        readonly List<Entry> m_Items;
        readonly HashSet<IManualUpdate> m_Members = new HashSet<IManualUpdate>();
        readonly List<IManualUpdate> m_PendingAdd = new List<IManualUpdate>();
        bool m_Dirty, m_Ticking, m_HasHoles;

        /// <summary>Group by concrete type (the Survival Kids heuristic). false = registration order.</summary>
        public bool sortByType = true;
        public int Count => m_Members.Count;
        public int DoubleRegistrations { get; private set; }
        public int DoubleRemovals { get; private set; }
        public int Sorts { get; private set; }
        public long Ticks { get; private set; }
        public double LastTickMs { get; private set; }

        public UpdateRegistry(int capacity = 256) { m_Items = new List<Entry>(capacity); }

        /// <summary>false (and counted) when already registered: the caller has a lifecycle bug.</summary>
        public bool Register(IManualUpdate u)
        {
            if (u == null) return false;
            if (!m_Members.Add(u)) { DoubleRegistrations++; return false; }
            if (m_Ticking) m_PendingAdd.Add(u);
            else { m_Items.Add(new Entry { key = KeyOf(u), item = u }); m_Dirty = true; }
            return true;
        }

        /// <summary>false (and counted) when not registered: double removal or never registered.</summary>
        public bool Unregister(IManualUpdate u)
        {
            if (u == null || !m_Members.Remove(u)) { DoubleRemovals++; return false; }
            int pa = m_PendingAdd.IndexOf(u);
            if (pa >= 0) { m_PendingAdd.RemoveAt(pa); return true; }
            for (int i = 0; i < m_Items.Count; i++)
            {
                if (!ReferenceEquals(m_Items[i].item, u)) continue;
                if (m_Ticking) { m_Items[i] = new Entry { key = m_Items[i].key, item = null }; m_HasHoles = true; }
                else { int last = m_Items.Count - 1; m_Items[i] = m_Items[last]; m_Items.RemoveAt(last); m_Dirty = true; }
                break;
            }
            return true;
        }

        public bool Contains(IManualUpdate u) => u != null && m_Members.Contains(u);

        public void Tick(float dt)
        {
            long t0 = Stopwatch.GetTimestamp();
            if (m_Dirty)
            {
                if (sortByType) { m_Items.Sort(s_ByKey); Sorts++; }
                m_Dirty = false;
            }
            m_Ticking = true;
            try
            {
                for (int i = 0; i < m_Items.Count; i++)
                {
                    var it = m_Items[i].item;
                    if (it != null) it.ManualUpdate(dt);
                }
            }
            finally
            {
                m_Ticking = false;
                if (m_HasHoles)
                {
                    m_Items.RemoveAll(e => e.item == null);
                    m_HasHoles = false;
                    m_Dirty = true;
                }
                if (m_PendingAdd.Count > 0)
                {
                    foreach (var u in m_PendingAdd) m_Items.Add(new Entry { key = KeyOf(u), item = u });
                    m_PendingAdd.Clear();
                    m_Dirty = true;
                }
            }
            Ticks++;
            LastTickMs = (Stopwatch.GetTimestamp() - t0) * 1000.0 / Stopwatch.Frequency;
        }

        /// <summary>Order the next tick will use (type key per slot), for tests.</summary>
        public List<int> OrderKeys()
        {
            var l = new List<int>(m_Items.Count);
            foreach (var e in m_Items) if (e.item != null) l.Add(e.key);
            return l;
        }
    }
}
