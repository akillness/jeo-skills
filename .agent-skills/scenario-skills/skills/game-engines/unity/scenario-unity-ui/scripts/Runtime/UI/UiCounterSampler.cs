// scenario-unity-ui runtime (Unity Expert Skills v0.2, 2026-09-24). Measurement instrument for Play Mode UI
// counter runs (AgentKit.UI.UIPerf.PlayModeCounters): records ProfilerRecorder values once per frame,
// tagged with UiCounterSampler.Tag so one run can compare several configurations (for example
// UitkTextureGrid stepping through 4, 8, 9 and 16 distinct textures). Names are "Category/Marker" as
// ProfilerRecorderHandle lists them in 6.3: "UI Render/Canvas.BuildBatch",
// "PlayerLoop/UIEvents.WillRenderCanvases", "UI Layout/Layout", "Render/Batches Count",
// "Render/Draw Calls Count", "PlayerLoop/PreLateUpdate.UIElementsUpdatePanels", "Render/UIR.DrawChain",
// "Render/Vertices Count", "Scripts/UIElements.UpdateRuntimeBindings", "Scripts/UIElements.UpdateLayout",
// "Scripts/UIElements.UpdateStyle", "Scripts/UIElements.UpdateRenderData" (listed by PlayModeCounters' list_markers).
// LastValue is the previous frame's value, so it is paired with the previous frame's tag.
using System.Collections.Generic;
using Unity.Profiling;
using UnityEngine;

namespace AgentUI
{
    public class UiCounterSampler : MonoBehaviour
    {
        public static int Tag;
        /// <summary>Facts a measurement driver publishes next to the counters (for example whether bindings
        /// kept updating while hidden); PlayModeCounters returns them as "extra".</summary>
        public static readonly Dictionary<string, string> Extra = new Dictionary<string, string>();
        public static UiCounterSampler Instance { get; private set; }

        public readonly List<string> Names = new List<string>();
        public readonly List<string> Units = new List<string>();   // ProfilerMarkerDataUnit per counter
        public readonly List<string> Missing = new List<string>();
        public readonly List<int> Tags = new List<int>();
        public readonly List<long[]> Rows = new List<long[]>();
        public int Frames = 120, Warmup = 30;
        public bool Done => Rows.Count >= Frames;

        ProfilerRecorder[] m_Rec;
        long[][] m_Pool;
        int m_Seen, m_PrevTag = int.MinValue;

        public static UiCounterSampler Begin(IList<string> counters, int frames, int warmup)
        {
            Extra.Clear();
            var go = new GameObject("UiCounterSampler");
            DontDestroyOnLoad(go);
            var s = go.AddComponent<UiCounterSampler>();
            s.Frames = frames; s.Warmup = warmup;
            s.m_Rec = new ProfilerRecorder[counters.Count];
            s.m_Pool = new long[frames][];
            for (int f = 0; f < frames; f++) s.m_Pool[f] = new long[counters.Count];
            s.Rows.Capacity = frames; s.Tags.Capacity = frames;
            for (int i = 0; i < counters.Count; i++)
            {
                var full = counters[i];
                int slash = full.IndexOf('/');
                var cat = new ProfilerCategory(slash > 0 ? full.Substring(0, slash) : "Render");
                var name = slash > 0 ? full.Substring(slash + 1) : full;
                s.m_Rec[i] = ProfilerRecorder.StartNew(cat, name, 1);
                s.Names.Add(full);
            }
            Instance = s;
            return s;
        }

        void LateUpdate()
        {
            m_Seen++;
            if (m_Seen > Warmup && !Done && m_PrevTag != int.MinValue)
            {
                var row = m_Pool[Rows.Count];     // preallocated: the sampler must not allocate while it measures GC
                for (int i = 0; i < m_Rec.Length; i++) row[i] = m_Rec[i].Valid ? m_Rec[i].LastValue : -1;
                Rows.Add(row);
                Tags.Add(m_PrevTag);
            }
            m_PrevTag = Tag;
            if (Done && Units.Count == 0)
                for (int i = 0; i < m_Rec.Length; i++)
                {
                    Units.Add(m_Rec[i].Valid ? m_Rec[i].UnitType.ToString() : "Undefined");
                    if (!m_Rec[i].Valid) Missing.Add(Names[i]);
                }
        }

        void OnDestroy()
        {
            if (m_Rec != null) foreach (var r in m_Rec) r.Dispose();
            if (Instance == this) Instance = null;
        }
    }
}
