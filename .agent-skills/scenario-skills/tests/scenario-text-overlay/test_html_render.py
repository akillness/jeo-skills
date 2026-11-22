import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stderr

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-text-overlay" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

import html_render  # noqa: E402
import overlay  # noqa: E402

from PIL import Image  # noqa: E402

BROWSER = html_render.find_browser()


class AssembleHtmlTests(unittest.TestCase):
    def test_shell_is_deterministic(self):
        self.assertEqual(
            html_render.assemble_html("<b>x</b>"),
            "<!doctype html><html><head>"
            '<meta charset="utf-8">'
            "<style>html, body { margin:0; padding:0; background: transparent; }</style>"
            "</head><body><b>x</b></body></html>",
        )

    def test_payload_css_comes_after_the_reset(self):
        document = html_render.assemble_html("x", "b { color: red; }")
        reset_at = document.index("background: transparent")
        css_at = document.index("b { color: red; }")
        self.assertLess(reset_at, css_at)


class GoogleFontsUrlTests(unittest.TestCase):
    def test_url_shape(self):
        self.assertEqual(
            html_render.google_fonts_url("Playfair Display", 700, "italic"),
            "https://fonts.googleapis.com/css2"
            "?family=Playfair+Display:ital,wght@1,700&display=block",
        )
        self.assertIn(":ital,wght@0,400", html_render.google_fonts_url("Inter", 400, "normal"))

    def test_literal_plus_is_percent_encoded(self):
        self.assertIn("family=A%2BB:", html_render.google_fonts_url("A+B", 400, "normal"))


class TextLayerHtmlTests(unittest.TestCase):
    def payload(self, **overrides):
        payload = {
            "font_family": "Inter",
            "font_url": None,
            "font_weight": 500,
            "font_style": "normal",
            "color": "#FFFFFF",
            "align": "center",
            "line_height": 1.2,
            "letter_spacing": 0.0,
            "overflow": "wrap",
            "bbox": [{"x": 40, "y": 60, "w": 400, "h": 120}],
        }
        payload.update(overrides)
        return payload

    def test_box_and_escaping(self):
        document = html_render.text_layer_html(self.payload(), "AT&T <live>", 40)
        self.assertIn("left:40px; top:60px;", document)
        self.assertIn("width:400px;", document)
        self.assertIn("AT&amp;T &lt;live&gt;", document)
        self.assertIn("fonts.googleapis.com/css2?family=Inter", document)

    def test_clip_wraps_in_a_hidden_overflow_box(self):
        document = html_render.text_layer_html(self.payload(overflow="clip"), "x", 40)
        self.assertIn("height:120px; overflow:hidden;", document)

    def test_font_url_becomes_a_font_face(self):
        payload = self.payload(font_family=None, font_url="https://example.com/brand.woff2")
        document = html_render.text_layer_html(payload, "x", 40)
        self.assertIn("@font-face", document)
        self.assertIn("https://example.com/brand.woff2", document)
        self.assertIn("font-display: block", document)

    def test_measure_page_waits_for_fonts_and_records_fit(self):
        document = html_render.text_layer_html(self.payload(), "x", 40, measure=True)
        self.assertIn("document.fonts.ready", document)
        self.assertIn("data-fitted-size", document)


class FindBrowserTests(unittest.TestCase):
    def test_explicit_missing_browser_errors(self):
        with self.assertRaises(SystemExit):
            html_render.find_browser("/nonexistent/browser-binary")

    def test_no_candidates_returns_none(self):
        original = html_render._BROWSER_CANDIDATES
        html_render._BROWSER_CANDIDATES = ("/nonexistent/browser-binary",)
        try:
            self.assertIsNone(html_render.find_browser())
        finally:
            html_render._BROWSER_CANDIDATES = original


class WarnRemoteUrlsTests(unittest.TestCase):
    def warnings_for(self, document, prefixes=()):
        stream = io.StringIO()
        with redirect_stderr(stream):
            html_render.warn_remote_urls(document, prefixes)
        return stream.getvalue()

    def test_quiet_hosts_pass_silently(self):
        document = '<link href="https://fonts.googleapis.com/css2?family=Inter">'
        self.assertEqual(self.warnings_for(document), "")

    def test_unknown_and_insecure_urls_warn(self):
        document = '<img src="https://cdn.example.com/a.png"><img src="http://x.test/b.png">'
        warnings = self.warnings_for(document)
        self.assertIn("cdn.example.com", warnings)
        self.assertIn("http://x.test", warnings)

    def test_caller_prefix_hosts_pass_silently(self):
        document = '<img src="https://cdn.example.com/a.png">'
        warnings = self.warnings_for(document, ("https://cdn.example.com/assets/",))
        self.assertEqual(warnings, "")


@unittest.skipUnless(BROWSER, "no Chromium-family browser installed")
class BrowserRenderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())

    def run_main(self, payload, name="out.png"):
        payload_path = self.tmp / "payload.json"
        payload_path.write_text(json.dumps(payload), encoding="utf-8")
        out = self.tmp / name
        with redirect_stderr(io.StringIO()):
            overlay.main(["--payload", str(payload_path), "--out", str(out)])
        return Image.open(out)

    def rich_payload(self, **overrides):
        payload = {
            "html_template": (
                '<div style="width:100%; height:100%; display:flex; align-items:center;'
                " justify-content:center; font-family:sans-serif; font-size:48px;"
                ' color:#FF00AA;">{{title}}</div>'
            ),
            "variables": [{"key": "title", "value": "Aether Bolt"}],
            "canvas_width": 400,
            "canvas_height": 200,
        }
        payload.update(overrides)
        return payload

    def test_rich_render_is_transparent_rgba_at_canvas_size(self):
        image = self.run_main(self.rich_payload())
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (400, 200))
        for corner in [(0, 0), (399, 0), (0, 199), (399, 199)]:
            self.assertEqual(image.getpixel(corner)[3], 0)
        self.assertIsNotNone(image.getchannel("A").getbbox())
        recovered = json.loads(image.text[overlay.PAYLOAD_TEXT_CHUNK_KEYWORD])
        self.assertEqual(recovered["variables"][0]["value"], "Aether Bolt")

    def test_device_scale_factor_scales_pixels(self):
        image = self.run_main(self.rich_payload(device_scale_factor=2.0))
        self.assertEqual(image.size, (800, 400))

    def text_payload(self, **overrides):
        payload = {
            "text_template": "{{line}}",
            "variables": [{"key": "line", "value": "one reason to buy stated plainly " * 4}],
            "font_family": "sans-serif",
            "size": 36,
            "color": "#FFFFFF",
            "bbox": [{"x": 40, "y": 40, "w": 300, "h": 100}],
            "canvas_width": 400,
            "canvas_height": 400,
        }
        payload.update(overrides)
        return payload

    def test_clip_keeps_ink_inside_the_box(self):
        image = self.run_main(self.text_payload(overflow="clip"), "clip.png")
        x0, y0, x1, y1 = image.getchannel("A").getbbox()
        self.assertGreaterEqual(x0, 40)
        self.assertGreaterEqual(y0, 40)
        self.assertLessEqual(x1, 40 + 300)
        self.assertLessEqual(y1, 40 + 100)

    def test_long_word_breaks_inside_the_box(self):
        payload = self.text_payload(
            variables=[{"key": "line", "value": "unbreakablesupercalifragilistic" * 2}],
            overflow="shrink",
            size=60,
        )
        image = self.run_main(payload, "longword.png")
        x0, _, x1, _ = image.getchannel("A").getbbox()
        self.assertGreaterEqual(x0, 40)
        self.assertLessEqual(x1, 40 + 300 + 2)

    def test_shrink_fits_the_box(self):
        image = self.run_main(self.text_payload(overflow="shrink", size=200), "shrink.png")
        x0, y0, x1, y1 = image.getchannel("A").getbbox()
        self.assertGreaterEqual(y0, 40)
        self.assertLessEqual(y1, 40 + 100 + 2)

    def test_shrink_that_cannot_fit_fails(self):
        payload = self.text_payload(
            overflow="shrink", bbox=[{"x": 40, "y": 40, "w": 60, "h": 8}]
        )
        with self.assertRaises(SystemExit):
            self.run_main(payload, "nofit.png")

    def test_fitted_size_reports_no_fit_as_negative(self):
        payload = {
            "font_family": "sans-serif",
            "font_url": None,
            "font_weight": 400,
            "font_style": "normal",
            "color": "#FFFFFF",
            "align": "left",
            "line_height": 1.2,
            "letter_spacing": 0.0,
            "overflow": "shrink",
            "bbox": [{"x": 0, "y": 0, "w": 40, "h": 6}],
        }
        text = "far too many words for a tiny box " * 3
        measure = html_render.text_layer_html(payload, text, 100, measure=True)
        self.assertEqual(html_render.fitted_size(BROWSER, measure), -1)


if __name__ == "__main__":
    unittest.main()
