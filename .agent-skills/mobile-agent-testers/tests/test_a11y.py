"""scripts/a11y.py: the accessibility line printed under each screen's element list."""
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import a11y  # noqa: E402

# Android, 1080x2400 at 420 dpi: 1 dp = 2.625 px, so 48 dp = 126 px.
ANDROID_SCREEN = """<hierarchy rotation="0">
<node class="android.widget.FrameLayout" bounds="[0,0][1080,2400]" clickable="false">
  <node class="android.view.View" clickable="true" bounds="[0,0][1080,2400]" />
  <node class="android.widget.ImageButton" clickable="true" content-desc="" text="" bounds="[950,150][1030,230]" />
  <node class="android.widget.Button" clickable="true" text="Send" bounds="[100,600][980,760]" />
  <node class="android.widget.ImageView" clickable="true" content-desc="Edit" bounds="[100,800][163,863]" />
  <node class="android.widget.FrameLayout" clickable="true" bounds="[100,900][400,1100]">
    <node class="android.widget.TextView" text="Row with child text" bounds="[110,910][390,1090]" />
  </node>
  <node class="androidx.recyclerview.widget.RecyclerView" scrollable="true" bounds="[0,1200][1080,2000]">
    <node class="android.widget.LinearLayout" clickable="true" bounds="[0,1200][1080,1260]"><node text="Cut row" bounds="[0,1200][1080,1260]"/></node>
    <node class="android.widget.LinearLayout" clickable="true" bounds="[0,1300][1080,1500]"><node text="Full row" bounds="[0,1300][1080,1500]"/></node>
  </node>
  <node class="android.widget.Switch" checkable="true" clickable="true" text="" bounds="[900,2100][1000,2160]" />
  <node class="android.widget.Button" clickable="true" enabled="false" text="" bounds="[10,2200][60,2250]" />
</node></hierarchy>"""

IOS_SCREEN = [{"type": "Application", "frame": {"x": 0, "y": 0, "width": 375, "height": 667}, "children": [
    {"type": "Button", "AXLabel": "", "frame": {"x": 330, "y": 50, "width": 30, "height": 30}},
    {"type": "Button", "AXLabel": "Back", "frame": {"x": 0, "y": 44, "width": 80, "height": 44}},
    {"type": "Button", "AXLabel": "Close", "frame": {"x": 20, "y": 100, "width": 28, "height": 28}},
    {"type": "Switch", "AXLabel": "", "AXValue": "1", "frame": {"x": 300, "y": 200, "width": 51, "height": 31}},
    {"type": "Cell", "frame": {"x": 0, "y": 300, "width": 375, "height": 44}, "children": [
        {"type": "StaticText", "AXLabel": "Wi-Fi", "frame": {"x": 16, "y": 310, "width": 100, "height": 20}}]},
    {"type": "ScrollView", "frame": {"x": 0, "y": 400, "width": 375, "height": 200}, "children": [
        {"type": "Button", "AXLabel": "Half visible", "frame": {"x": 100, "y": 580, "width": 100, "height": 30}}]},
    {"type": "Keyboard", "frame": {"x": 0, "y": 450, "width": 375, "height": 217}, "children": [
        {"type": "Button", "AXLabel": "q", "frame": {"x": 3, "y": 460, "width": 31, "height": 42}}]},
]}]


def ios_app(*children):
    return [{"type": "Application", "frame": {"x": 0, "y": 0, "width": 375, "height": 667}, "children": list(children)}]


def button(label, x, y, w, h, **extra):
    return {"type": "Button", "AXLabel": label, "frame": {"x": x, "y": y, "width": w, "height": h}, **extra}


class AndroidCheck(unittest.TestCase):
    def setUp(self):
        self.line = a11y.android(ET.fromstring(ANDROID_SCREEN), 420, 1080, 2400)

    def test_full_line(self):
        self.assertEqual(self.line, "accessibility check (confirm on the screenshot): "
                         "2 controls with no name at (990,190) (950,2130); "
                         "3 touch targets under 48 dp: 30x30 dp at (990,190), "
                         "\"Edit\" 24x24 dp at (131,831), 38x23 dp at (950,2130)")

    def test_name_can_come_from_a_child(self):
        self.assertNotIn("(250,1000)", self.line)

    def test_skips_full_screen_scrim_disabled_button_and_rows_cut_by_the_list(self):
        for centre in ("(540,1200)", "(35,2225)", "(540,1230)"):
            self.assertNotIn(centre, self.line)

    def test_clean_screen_passes(self):
        clean = ET.fromstring('<hierarchy><node clickable="true" text="OK" bounds="[100,100][500,300]"/></hierarchy>')
        self.assertIsNone(a11y.android(clean, 420, 1080, 2400))

    def test_same_bounds_counted_once(self):
        nested = ET.fromstring('<hierarchy><node clickable="true" bounds="[10,10][60,60]">'
                               '<node clickable="true" bounds="[10,10][60,60]"/></node></hierarchy>')
        self.assertTrue(a11y.android(nested, 160, 1080, 2400).endswith(": 1 control with no name at (35,35)"))

    def test_long_lists_are_shortened(self):
        nodes = "".join(f'<node clickable="true" bounds="[{x},10][{x + 40},50]"/>' for x in range(0, 600, 100))
        line = a11y.android(ET.fromstring(f"<hierarchy>{nodes}</hierarchy>"), 160, 1080, 2400)
        self.assertIn("6 controls with no name at (20,30) (120,30) (220,30) (320,30) and 2 more", line)


class IosCheck(unittest.TestCase):
    def test_full_line(self):
        self.assertEqual(a11y.ios(IOS_SCREEN, 375, 667), "accessibility check (confirm on the screenshot): "
                         "2 controls with no name at (345,65) (326,216); "
                         "2 touch targets under 44 pt: 30x30 pt at (345,65), \"Close\" 28x28 pt at (34,114)")

    def test_keyboard_keys_are_ignored(self):
        self.assertNotIn("(18,481)", a11y.ios(IOS_SCREEN, 375, 667))

    def test_button_cut_by_a_scroll_view_is_ignored(self):
        self.assertIsNone(a11y.ios(ios_app({"type": "ScrollView", "frame": {"x": 0, "y": 400, "width": 375, "height": 200},
                                            "children": [button("Half", 100, 580, 100, 30)]}), 375, 667))

    def test_disabled_and_off_screen_controls_are_ignored(self):
        self.assertIsNone(a11y.ios(ios_app(button("", 10, 10, 20, 20, enabled=False),
                                           button("", 10, 900, 20, 20)), 375, 667))

    def test_switch_size_is_not_flagged(self):
        line = a11y.ios(ios_app({"type": "Switch", "AXLabel": "Wi-Fi", "frame": {"x": 300, "y": 200, "width": 51, "height": 31}}),
                        375, 667)
        self.assertIsNone(line)

    def test_clean_screen_passes(self):
        self.assertIsNone(a11y.ios(ios_app(button("Continue", 20, 600, 335, 50)), 375, 667))


if __name__ == "__main__":
    unittest.main()
