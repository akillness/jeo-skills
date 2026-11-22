// scenario-unity-mobile v0.1 (Unity Expert Skills, 2026-09-24). Pure safe-area math, no scene access,
// so EditMode tests can prove it at any notch layout without a device or the Device Simulator.
//
// Conventions (Unity 6.3 Scripting API, Screen.safeArea): pixels, origin BOTTOM-LEFT, relative
// to the Player window (not the physical screen). With PlayerSettings.Android.renderOutsideSafeArea
// off, Unity shrinks the window and safeArea == Rect(0, 0, Screen.width, Screen.height).
// UI Toolkit panels use a TOP-LEFT origin: top = Screen.height - safeArea.yMax (the 6.3 doc's
// one-line flip, Screen.height - safeArea.y, gives the BOTTOM edge; the test SafeAreaMathTests
// .UiToolkitFlipUsesYMax proves it).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_safearea.py.
using UnityEngine;

namespace AgentKit.Mobile
{
    public static class SafeAreaMath
    {
        /// <summary>Normalized anchors for a full-stretch RectTransform that must cover the safe
        /// area: anchorMin = safe.min / screen, anchorMax = safe.max / screen, clamped to 0..1.</summary>
        public static void ToAnchors(Rect safe, Vector2 screen, out Vector2 anchorMin, out Vector2 anchorMax)
        {
            if (screen.x <= 0f || screen.y <= 0f)
            {
                anchorMin = Vector2.zero;
                anchorMax = Vector2.one;
                return;
            }
            var s = Clamp(safe, screen);
            anchorMin = new Vector2(s.xMin / screen.x, s.yMin / screen.y);
            anchorMax = new Vector2(s.xMax / screen.x, s.yMax / screen.y);
        }

        /// <summary>Insets in pixels from each screen edge: x = left, y = right, z = top, w = bottom.</summary>
        public static Vector4 Insets(Rect safe, Vector2 screen)
        {
            var s = Clamp(safe, screen);
            return new Vector4(s.xMin, screen.x - s.xMax, screen.y - s.yMax, s.yMin);
        }

        /// <summary>Safe area in a TOP-LEFT origin (UI Toolkit panel space before panel scaling):
        /// x = safe.x, y = screenHeight - safe.yMax, same width and height.</summary>
        public static Rect ToTopLeft(Rect safe, float screenHeight)
        {
            return new Rect(safe.x, screenHeight - safe.yMax, safe.width, safe.height);
        }

        /// <summary>True when the rect (screen pixels, bottom-left origin) lies fully inside the
        /// safe area and touches no cutout.</summary>
        public static bool IsClear(Rect uiRect, Rect safe, Rect[] cutouts)
        {
            if (uiRect.xMin < safe.xMin - 0.5f || uiRect.yMin < safe.yMin - 0.5f ||
                uiRect.xMax > safe.xMax + 0.5f || uiRect.yMax > safe.yMax + 0.5f)
                return false;
            if (cutouts != null)
                foreach (var c in cutouts)
                    if (c.Overlaps(uiRect)) return false;
            return true;
        }

        /// <summary>True when the safe area covers the whole screen (no notch, or the Player window
        /// already excludes it because Render outside safe area is off): the fitter does nothing.</summary>
        public static bool IsFullScreen(Rect safe, Vector2 screen)
        {
            var i = Insets(safe, screen);
            return i.x < 0.5f && i.y < 0.5f && i.z < 0.5f && i.w < 0.5f;
        }

        public static Rect Clamp(Rect r, Vector2 screen)
        {
            float xMin = Mathf.Clamp(r.xMin, 0f, screen.x), yMin = Mathf.Clamp(r.yMin, 0f, screen.y);
            float xMax = Mathf.Clamp(r.xMax, xMin, screen.x), yMax = Mathf.Clamp(r.yMax, yMin, screen.y);
            return Rect.MinMaxRect(xMin, yMin, xMax, yMax);
        }
    }
}
