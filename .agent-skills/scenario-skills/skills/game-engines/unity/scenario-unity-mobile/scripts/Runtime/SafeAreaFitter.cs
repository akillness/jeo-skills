// scenario-unity-mobile v0.1 (Unity Expert Skills, 2026-09-24). Put on ONE full-stretch panel under the
// HUD canvas and parent every edge-anchored HUD element to it (Chema Damak, PLQ4ywB13eg
// [00:11:27] to [00:13:06]). Reads UnityEngine.Device.Screen (returns the Device Simulator's
// values in the Editor, the real screen in a player), re-applies when the safe area, the
// resolution or the orientation changes (rotation, Android multi-window).
// Tests and captures inject a layout with Simulate(safe, screen) instead of a device.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_safearea.py.
using UnityEngine;
using DeviceScreen = UnityEngine.Device.Screen;

namespace AgentKit.Mobile
{
    [ExecuteAlways]
    [RequireComponent(typeof(RectTransform))]
    [DisallowMultipleComponent]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        [Tooltip("Keep these edges at the screen border (for example a background strip that should run under the home indicator).")]
        public bool ignoreLeft, ignoreRight, ignoreTop, ignoreBottom;

        Rect m_LastSafe = new Rect(-1, -1, -1, -1);
        Vector2 m_LastScreen;
        ScreenOrientation m_LastOrientation;
        bool m_Simulated;
        Rect m_SimSafe;
        Vector2 m_SimScreen;

        public Rect AppliedSafeArea => m_LastSafe;
        public Vector2 AppliedScreen => m_LastScreen;

        /// <summary>Force a layout (tests, captures, Device Simulator-free checks).</summary>
        public void Simulate(Rect safe, Vector2 screen)
        {
            m_Simulated = true;
            m_SimSafe = safe;
            m_SimScreen = screen;
            Apply(true);
        }

        public void StopSimulating()
        {
            m_Simulated = false;
            Apply(true);
        }

        void OnEnable() => Apply(true);

        void Update() => Apply(false);

        public void Apply(bool force)
        {
            Rect safe;
            Vector2 screen;
            if (m_Simulated) { safe = m_SimSafe; screen = m_SimScreen; }
            else
            {
                safe = DeviceScreen.safeArea;
                screen = new Vector2(DeviceScreen.width, DeviceScreen.height);
            }
            var orientation = DeviceScreen.orientation;
            if (!force && safe == m_LastSafe && screen == m_LastScreen && orientation == m_LastOrientation) return;
            m_LastSafe = safe;
            m_LastScreen = screen;
            m_LastOrientation = orientation;

            SafeAreaMath.ToAnchors(safe, screen, out var min, out var max);
            if (ignoreLeft) min.x = 0f;
            if (ignoreBottom) min.y = 0f;
            if (ignoreRight) max.x = 1f;
            if (ignoreTop) max.y = 1f;
            var rt = (RectTransform)transform;
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }
    }
}
