// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Design tokens for agent-built UI.
// Palette discipline (Game Dev Guide, HwdweCX5aMI [frame 00:04:48]): a neutral base carries most of
// the area, one accent marks selection and the primary action, text is light on dark (or dark on
// light), never saturated on saturated. Hexes are from the flat UI "British" palette he uses
// ([frame 00:04:30]). Spacing and type scales are [added] (8 px grid), in reference pixels at the
// 1920 x 1080 reference resolution. Contrast of every text/background pair is checked by
// ut_ui.contrast_ratio (WCAG 2.x formula, [added]) in tests/code/unity-ui/test_offline.py.
using UnityEngine;

namespace AgentUI
{
    public static class UiTheme
    {
        // neutrals (most of the screen)
        public static readonly Color Background = Hex("#2f3640");   // charcoal "Electromagnetic"
        public static readonly Color Surface = Hex("#353b48");      // raised panel "Chain Gang Grey"
        public static readonly Color SurfaceSunken = Hex("#232830"); // [added] darker well for sliders
        public static readonly Color Text = Hex("#f5f6fa");         // "Lynx White"
        public static readonly Color TextMuted = Hex("#dcdde1");    // "Hint of Pensive"
        // one accent for selection and primary action; its darker twin for pressed
        public static readonly Color Accent = Hex("#40739e");       // "Seabrook" dark (5.0:1 with Text)
        public static readonly Color AccentPressed = Hex("#487eb0"); // "Seabrook"
        // status colours, small areas only
        public static readonly Color Positive = Hex("#44bd32");
        public static readonly Color Warning = Hex("#e1b12c");
        public static readonly Color Danger = Hex("#c23616");

        // spacing scale (reference px) [added]
        public const float S1 = 8, S2 = 16, S3 = 24, S4 = 32, S6 = 48, S8 = 64;
        // type scale (reference px) [added]: one title level, one heading, body, caption
        public const float Title = 96, Heading = 48, Body = 36, Caption = 26;
        // interactive height (reference px). With CanvasDeviceScale 1.35 on handhelds this is 119 px on a
        // 1080 x 1920 phone, above a 7 mm target at 420 dpi (116 px) [added, checked by the capture job].
        public const float ControlHeight = 88;

        public static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }

        public static Color WithAlpha(Color c, float a) { c.a = a; return c; }
    }
}
