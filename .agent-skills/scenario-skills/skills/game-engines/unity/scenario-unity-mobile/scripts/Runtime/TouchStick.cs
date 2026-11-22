// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Touch input on Input System 1.20.
//
// Two routes (deciding condition: gamepad parity and zero code vs custom activation zones):
// 1. OnScreenStick / OnScreenButton emit a virtual Gamepad, so gameplay bound to <Gamepad>/...
//    actions needs no touch code (Input System team, ptvjumIHxYg [00:22:13]); build it with
//    AgentKit.Mobile.MobileTouch.BuildTouchHud.
// 2. This FloatingTouchStick: EnhancedTouch finger events, one tracked finger, left-half
//    activation, start clamped on screen, knob normalized to -1..1 (LlamAcademy, MKnLPA5hnPA
//    [00:07:31] to [00:10:52]). His math needs a Constant Pixel Size canvas; this version converts
//    finger positions into canvas space [added], so it works under Constant Physical Size, the
//    scaler the Input System team recommends for thumb controls.
// Never poll Touchscreen.current in Update (misses short taps, 6.3 docs); enable EnhancedTouch
// explicitly; TouchSimulation only in the Editor.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_touch.py (EditMode + InputTestFixture).
using UnityEngine;
using UnityEngine.InputSystem.EnhancedTouch;
using ETouch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace AgentKit.Mobile
{
    /// <summary>Hide the touch HUD only for a REAL gamepad. An OnScreenStick or OnScreenButton adds its
    /// own virtual Gamepad (InputSystem.AddDevice from managed code, so InputDevice.native is false,
    /// tagged with the usage "OnScreen": Input System 1.20 OnScreenControl source), so "hide the HUD
    /// when a Gamepad connects" on onDeviceChange would fire on the game's own HUD. Excluding the
    /// "OnScreen" usage is the test (native alone would also reject gamepads added by tests or
    /// remapping tools). PlayMode TouchInputTests.VirtualGamepadIsNotARealGamepad.</summary>
    public static class TouchControlsVisibility
    {
        public static bool IsReal(UnityEngine.InputSystem.InputDevice d)
        {
            if (d == null) return false;
            foreach (var u in d.usages) if (u == "OnScreen") return false;
            return true;
        }

        public static bool RealGamepadConnected()
        {
            foreach (var g in UnityEngine.InputSystem.Gamepad.all) if (IsReal(g)) return true;
            return false;
        }

        public static bool ShowTouchControls() => !RealGamepadConnected();
    }

    public static class FloatingStickMath
    {
        /// <summary>Clamp the stick centre so the whole stick stays inside the area (canvas units).</summary>
        public static Vector2 ClampStart(Vector2 pos, Vector2 stickSize, Vector2 area)
        {
            float hx = stickSize.x * 0.5f, hy = stickSize.y * 0.5f;
            return new Vector2(Mathf.Clamp(pos.x, hx, Mathf.Max(hx, area.x - hx)), Mathf.Clamp(pos.y, hy, Mathf.Max(hy, area.y - hy)));
        }

        /// <summary>Knob offset limited to radius, and the normalized value (-1..1 per axis).</summary>
        public static Vector2 Knob(Vector2 finger, Vector2 origin, float radius, out Vector2 value)
        {
            var d = finger - origin;
            if (radius <= 0f) { value = Vector2.zero; return Vector2.zero; }
            if (d.magnitude > radius) d = d.normalized * radius;
            value = d / radius;
            return d;
        }
    }

    public sealed class FloatingTouchStick : MonoBehaviour
    {
        public RectTransform area;          // full-screen RectTransform of the touch canvas (or the safe-area panel)
        public RectTransform stick;         // ring, anchored bottom-left of `area`, pivot centre
        public RectTransform knob;          // child of stick, anchored centre
        public Vector2 stickSize = new Vector2(300, 300);
        [Range(0f, 1f)] public float activationWidth = 0.5f;   // left half by default
        public Camera uiCamera;             // null for Screen Space - Overlay
        public bool simulateTouchInEditor = true;   // mouse as touch in the Editor (Input Debugger checkbox equivalent)

        public Vector2 Value { get; private set; }
        public bool Active => m_Finger != null;
        Finger m_Finger;

        void OnEnable()
        {
            EnhancedTouchSupport.Enable();
#if UNITY_EDITOR
            if (simulateTouchInEditor) UnityEngine.InputSystem.EnhancedTouch.TouchSimulation.Enable();
#endif
            ETouch.onFingerDown += OnDown;
            ETouch.onFingerMove += OnMove;
            ETouch.onFingerUp += OnUp;
            if (stick) stick.gameObject.SetActive(false);
        }

        void OnDisable()
        {
            ETouch.onFingerDown -= OnDown;
            ETouch.onFingerMove -= OnMove;
            ETouch.onFingerUp -= OnUp;
#if UNITY_EDITOR
            if (simulateTouchInEditor) UnityEngine.InputSystem.EnhancedTouch.TouchSimulation.Disable();
#endif
            EnhancedTouchSupport.Disable();
            Release();
        }

        bool ToArea(Vector2 screen, out Vector2 local)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(area, screen, uiCamera, out local)) return false;
            local -= area.rect.min;   // origin at the area's bottom-left corner, canvas units
            return true;
        }

        public void OnDown(Finger f)
        {
            if (m_Finger != null || area == null) return;
            if (!ToArea(f.screenPosition, out var p)) return;
            if (p.x < 0f || p.y < 0f || p.x > area.rect.width * activationWidth || p.y > area.rect.height) return;  // left part of the area only
            m_Finger = f;
            Value = Vector2.zero;
            if (stick)
            {
                stick.gameObject.SetActive(true);
                stick.sizeDelta = stickSize;
                stick.anchoredPosition = FloatingStickMath.ClampStart(p, stickSize, area.rect.size);
            }
            if (knob) knob.anchoredPosition = Vector2.zero;
        }

        public void OnMove(Finger f)
        {
            if (f != m_Finger || stick == null) return;
            if (!ToArea(f.screenPosition, out var p)) return;
            var offset = FloatingStickMath.Knob(p, stick.anchoredPosition, stickSize.x * 0.5f, out var v);
            if (knob) knob.anchoredPosition = offset;
            Value = v;
        }

        public void OnUp(Finger f)
        {
            if (f == m_Finger) Release();
        }

        void Release()
        {
            m_Finger = null;
            Value = Vector2.zero;
            if (knob) knob.anchoredPosition = Vector2.zero;
            if (stick) stick.gameObject.SetActive(false);
        }
    }
}
