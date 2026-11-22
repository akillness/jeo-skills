// scenario-unity-ui runtime (Unity Expert Skills v0.2, 2026-09-24). Finds WHO keeps invalidating a UI Toolkit
// panel: an IDebugPanelChangeReceiver registered on the PanelSettings logs every visual-tree change
// (element + VersionChangeType). Nicolas Borromeo (Unity, bECmaYIvZJg [00:42:04], [frame 00:42:19])
// shows the same receiver; the callback fires only in the editor and development builds, so this
// component compiles to nothing in a release player.
// Use: add next to a UIDocument (or set panelSettings), let the screen idle for N frames, read
// ChangesPerFrame and Top(): an idle HUD should report 0; a bound label that changes every frame shows
// up by name. Counting only (no Debug.Log, no stack traces) so it can stay on during a counter run.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    public class PanelChangeLog : MonoBehaviour
#if UNITY_EDITOR || DEVELOPMENT_BUILD
        , IDebugPanelChangeReceiver
#endif
    {
        public PanelSettings panelSettings;       // null = this GameObject's UIDocument.panelSettings
        public bool recording = true;

        readonly Dictionary<string, int> m_ByElement = new Dictionary<string, int>();
        readonly Dictionary<VersionChangeType, int> m_ByType = new Dictionary<VersionChangeType, int>();
        int m_Total, m_FramesSeen, m_LastFrame = -1;

        public int Total => m_Total;
        public int FramesSeen => m_FramesSeen;
        public float ChangesPerFrame => m_FramesSeen > 0 ? (float)m_Total / m_FramesSeen : 0f;

        void OnEnable()
        {
            if (panelSettings == null && TryGetComponent<UIDocument>(out var doc)) panelSettings = doc.panelSettings;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (panelSettings != null) panelSettings.SetPanelChangeReceiver(this);
#endif
        }

        void OnDisable()
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (panelSettings != null) panelSettings.SetPanelChangeReceiver(null);
#endif
        }

        void Update() { if (recording) m_FramesSeen++; }

        public void ResetCounts()
        {
            m_ByElement.Clear(); m_ByType.Clear(); m_Total = 0; m_FramesSeen = 0;
        }

        public void OnVisualElementChange(VisualElement element, VersionChangeType changeType)
        {
            if (!recording) return;
            m_Total++;
            m_LastFrame = Time.frameCount;
            var key = element == null ? "<null>" : (string.IsNullOrEmpty(element.name) ? element.GetType().Name : element.name);
            m_ByElement.TryGetValue(key, out var n); m_ByElement[key] = n + 1;
            // VersionChangeType is a flags enum: count each flag once
            foreach (VersionChangeType flag in System.Enum.GetValues(typeof(VersionChangeType)))
                if (flag != 0 && (changeType & flag) == flag) { m_ByType.TryGetValue(flag, out var m); m_ByType[flag] = m + 1; }
        }

        /// <summary>The elements that changed most, "name:count", most frequent first.</summary>
        public List<string> Top(int n = 5)
        {
            var list = new List<KeyValuePair<string, int>>(m_ByElement);
            list.Sort((a, b) => b.Value.CompareTo(a.Value));
            var outList = new List<string>();
            for (int i = 0; i < list.Count && i < n; i++) outList.Add(list[i].Key + ":" + list[i].Value);
            return outList;
        }

        public List<string> Types()
        {
            var outList = new List<string>();
            foreach (var kv in m_ByType) outList.Add(kv.Key + ":" + kv.Value);
            outList.Sort();
            return outList;
        }
    }
}
