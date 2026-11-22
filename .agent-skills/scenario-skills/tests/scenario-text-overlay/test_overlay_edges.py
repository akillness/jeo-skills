"""Validation errors, font resolution, and the browser engine driven by a stand-in browser.

The stand-in is a small Python program behind a shell wrapper: it records the page it was
given and writes a transparent PNG (or a fitted size for --dump-dom), so the browser paths run
offline and without Chrome. Font downloads use file:// URLs or a stubbed _download.
"""

import io
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest
import unittest.mock as mock
from contextlib import redirect_stderr, redirect_stdout

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-text-overlay" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

import html_render  # noqa: E402
import overlay  # noqa: E402
import pillow_render  # noqa: E402
import templating  # noqa: E402

from PIL import Image, ImageFont  # noqa: E402

FAKE_BROWSER = textwrap.dedent(
    """
    import json
    import os
    import sys
    from pathlib import Path
    from urllib.parse import urlparse
    from urllib.request import url2pathname

    args = sys.argv[1:]
    page = Path(url2pathname(urlparse(args[-1]).path))
    with open(os.environ["FAKE_BROWSER_LOG"], "a", encoding="utf-8") as log:
        log.write(json.dumps({"args": args[:-1], "page": page.read_text(encoding="utf-8")}) + "\\n")
    if "--dump-dom" in args:
        fit = os.environ.get("FAKE_BROWSER_FIT")
        if fit is not None:
            print('<html><body data-fitted-size="' + fit + '"></body></html>')
    elif not os.environ.get("FAKE_BROWSER_NO_SHOT"):
        shot = next(a.split("=", 1)[1] for a in args if a.startswith("--screenshot="))
        size = next(a.split("=", 1)[1] for a in args if a.startswith("--window-size="))
        width, height = (int(v) for v in size.split(","))
        from PIL import Image

        Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(shot)
    # The work is done before a forced failure, so a non-zero exit alone must fail the render.
    code = int(os.environ.get("FAKE_BROWSER_EXIT", "0"))
    if code:
        sys.stderr.write("stand-in browser failed\\n")
    sys.exit(code)
    """
)


def text_payload(**overrides):
    payload = {
        "text_template": "{{line}}",
        "variables": [{"key": "line", "value": "Night, distilled."}],
        "font_family": "Inter",
        "size": 40,
        "bbox": [{"x": 40, "y": 40, "w": 400, "h": 120}],
        "canvas_width": 480,
        "canvas_height": 480,
    }
    payload.update(overrides)
    return payload


def rich_payload(**overrides):
    payload = {
        "html_template": "<div>{{title}}</div>",
        "variables": [{"key": "title", "value": "Aether Bolt"}],
        "canvas_width": 320,
        "canvas_height": 160,
    }
    payload.update(overrides)
    return payload


def pillow_payload(**overrides):
    _, data = overlay.validate_payload(
        text_payload(bbox=[{"x": 40, "y": 40, "w": 300, "h": 100}], canvas_width=400, canvas_height=400)
    )
    data.update(overrides)
    return data


class ValidationEdgeTests(unittest.TestCase):
    def assertInvalid(self, payload, message):
        with self.assertRaises(SystemExit) as caught:
            overlay.validate_payload(payload)
        self.assertEqual(str(caught.exception), f"invalid payload: {message}")

    def test_payload_must_be_an_object(self):
        self.assertInvalid([text_payload()], "payload must be a JSON object")

    def test_section_object_keys_must_be_non_empty(self):
        variables = [{"key": "line", "value": {"": "x"}}]
        self.assertInvalid(text_payload(variables=variables), "variable 'line' needs non-empty string keys")

    def test_templates_must_be_non_empty_strings(self):
        self.assertInvalid(text_payload(text_template=""), "text_template must be a non-empty string")
        self.assertInvalid(rich_payload(html_template=5), "html_template must be a non-empty string")

    def test_css_must_be_a_string_and_is_kept(self):
        self.assertInvalid(rich_payload(css=["b {}"]), "css must be a string")
        _, data = overlay.validate_payload(rich_payload(css="b { color: red; }"))
        self.assertEqual(data["css"], "b { color: red; }")

    def test_css_with_a_lone_surrogate_is_rejected(self):
        self.assertInvalid(rich_payload(css="b {} \ud800"), "css contains an unpaired surrogate escape")

    def test_allowed_url_prefixes_must_be_a_list_of_strings(self):
        message = "allowed_url_prefixes must be a list of strings"
        self.assertInvalid(rich_payload(allowed_url_prefixes="https://cdn.example.com/"), message)
        self.assertInvalid(rich_payload(allowed_url_prefixes=[3]), message)


class TemplatingEdgeTests(unittest.TestCase):
    def test_an_empty_tag_is_not_a_missing_variable(self):
        self.assertEqual(templating.render_strict("a{{ }}b{{x}}", {"x": "-"}), "ab-")


class OverlayMainEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_an_unreadable_payload_is_named(self):
        missing = self.tmp / "missing.json"
        with self.assertRaises(SystemExit) as caught:
            overlay.main(["--payload", str(missing), "--out", str(self.tmp / "o.png")])
        self.assertIn(f"cannot read payload {str(missing)!r}", str(caught.exception))

        broken = self.tmp / "broken.json"
        broken.write_text("{not json", encoding="utf-8")
        with self.assertRaises(SystemExit) as caught:
            overlay.main(["--payload", str(broken), "--out", str(self.tmp / "o.png")])
        self.assertIn("cannot read payload", str(caught.exception))

    def test_browser_engine_without_a_browser_fails_with_advice(self):
        payload = self.tmp / "payload.json"
        payload.write_text(json.dumps(text_payload()), encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if k != html_render.BROWSER_ENV}
        with mock.patch.object(html_render, "_BROWSER_CANDIDATES", ()), mock.patch.dict(
            os.environ, env, clear=True
        ):
            with self.assertRaises(SystemExit) as caught:
                overlay.main(["--payload", str(payload), "--out", str(self.tmp / "o.png"), "--engine", "browser"])
        self.assertIn("no Chromium-family browser found", str(caught.exception))
        self.assertFalse((self.tmp / "o.png").exists())

    def test_script_entry_point_exits_one_on_a_missing_payload(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "overlay.py"), "--payload", str(self.tmp / "nope.json"),
             "--out", str(self.tmp / "o.png")],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot read payload", result.stderr)


class PillowFontEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def cached(self, path):
        self.addCleanup(os.unlink, path)
        return pathlib.Path(path)

    def test_download_reads_a_url(self):
        source = self.tmp / "data.bin"
        source.write_bytes(b"\x00font bytes\xff")
        self.assertEqual(pillow_render._download(source.as_uri()), b"\x00font bytes\xff")

    def test_font_url_is_downloaded_into_a_kept_file_with_its_suffix(self):
        source = self.tmp / "Brand.OTF"
        source.write_bytes(b"OTTO not really a font")
        data = pillow_payload(font_family=None, font_url=source.as_uri())
        path = self.cached(pillow_render.resolve_font_file(data))
        self.assertEqual(path.suffix, ".OTF")
        self.assertEqual(path.read_bytes(), b"OTTO not really a font")

    def test_google_font_follows_the_css_to_its_truetype_file(self):
        ttf = "https://fonts.gstatic.com/s/inter/v1/inter.ttf"
        responses = {
            html_render.google_fonts_url("Inter", 700, "italic"): f"src: url({ttf}) format('truetype');".encode(),
            ttf: b"ttf bytes",
        }
        requested = []

        def fake_download(url):
            requested.append(url)
            return responses[url]

        data = pillow_payload(font_weight=700, font_style="italic")
        with mock.patch.object(pillow_render, "_download", fake_download):
            path = self.cached(pillow_render.resolve_font_file(data))
        self.assertEqual(requested, list(responses))
        self.assertEqual(path.suffix, ".ttf")
        self.assertEqual(path.read_bytes(), b"ttf bytes")

    def test_css_without_a_truetype_url_falls_back_with_a_warning(self):
        css = b"src: url(https://fonts.gstatic.com/s/inter/v1/inter.woff2) format('woff2');"
        stderr = io.StringIO()
        with mock.patch.object(pillow_render, "_download", return_value=css), redirect_stderr(stderr):
            self.assertIsNone(pillow_render.resolve_font_file(pillow_payload()))
        self.assertIn("no TrueType URL in the css2 response", stderr.getvalue())
        self.assertIn("'Inter'", stderr.getvalue())

    def test_an_unloadable_downloaded_font_is_an_error(self):
        bad = self.tmp / "bad.ttf"
        bad.write_bytes(b"not a font")
        with self.assertRaises(SystemExit) as caught:
            pillow_render._load_font(str(bad), 20)
        self.assertEqual(str(caught.exception), f"cannot load font {str(bad)!r}")

    def test_no_system_font_uses_pillows_default_at_the_size(self):
        with mock.patch.object(pillow_render, "_SYSTEM_FONT_CANDIDATES", (str(self.tmp / "none.ttf"),)):
            font = pillow_render._load_font(None, 23)
        self.assertEqual(font.size, 23)

    def test_a_pillow_without_sized_defaults_gets_the_plain_default(self):
        plain = ImageFont.load_default()

        def old_load_default(**kwargs):
            if kwargs:
                raise TypeError("load_default() got an unexpected keyword argument 'size'")
            return plain

        with mock.patch.object(pillow_render, "_SYSTEM_FONT_CANDIDATES", ()), mock.patch.object(
            ImageFont, "load_default", old_load_default
        ):
            self.assertIs(pillow_render._load_font(None, 23), plain)

    def test_center_alignment_centers_the_ink_in_the_box(self):
        with mock.patch.object(pillow_render, "_download", side_effect=OSError("offline")), redirect_stderr(
            io.StringIO()
        ):
            image = pillow_render.render_text_payload(pillow_payload(align="center"), "mid")
        x0, _, x1, _ = image.getchannel("A").getbbox()
        self.assertLess(abs((x0 + x1) / 2 - (40 + 300 / 2)), 4)


@unittest.skipIf(os.name == "nt", "the stand-in browser is a POSIX shell wrapper")
class StandInBrowserTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        program = self.tmp / "fake_browser.py"
        program.write_text(FAKE_BROWSER, encoding="utf-8")
        self.browser = self.tmp / "fake-browser"
        self.browser.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{program}" "$@"\n', encoding="utf-8")
        self.browser.chmod(self.browser.stat().st_mode | stat.S_IXUSR)
        self.log = self.tmp / "calls.jsonl"
        env = mock.patch.dict(os.environ, {"FAKE_BROWSER_LOG": str(self.log)})
        env.start()
        self.addCleanup(env.stop)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8").splitlines()]

    def run_main(self, payload):
        path = self.tmp / "payload.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        out = self.tmp / "out.png"
        with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
            overlay.main(["--payload", str(path), "--out", str(out), "--browser", str(self.browser)])
        return out

    def test_an_explicit_browser_path_is_used(self):
        self.assertEqual(html_render.find_browser(str(self.browser)), str(self.browser))

    def test_rich_layer_screenshot_carries_the_scale_and_the_payload(self):
        payload = rich_payload(css="div { color: red; }", device_scale_factor=2.0)
        out = self.run_main(payload)
        with Image.open(out) as image:
            self.assertEqual((image.mode, image.size), ("RGBA", (320, 160)))
            self.assertEqual(json.loads(image.text[overlay.PAYLOAD_TEXT_CHUNK_KEYWORD]), payload)
        (call,) = self.calls()
        self.assertIn("--force-device-scale-factor=2.0", call["args"])
        self.assertIn("--window-size=320,160", call["args"])
        self.assertIn("<div>Aether Bolt</div>", call["page"])
        self.assertIn("div { color: red; }", call["page"])

    def test_shrink_renders_at_the_size_the_measuring_page_found(self):
        with mock.patch.dict(os.environ, {"FAKE_BROWSER_FIT": "17"}):
            self.run_main(text_payload(overflow="shrink"))
        measure, shot = self.calls()
        self.assertIn("--dump-dom", measure["args"])
        self.assertIn("data-fitted-size", measure["page"])
        self.assertIn("font-size:17px", shot["page"])
        self.assertNotIn("data-fitted-size", shot["page"])

    def test_shrink_with_no_fitting_size_fails_before_the_screenshot(self):
        with mock.patch.dict(os.environ, {"FAKE_BROWSER_FIT": "-1"}):
            with self.assertRaises(SystemExit) as caught:
                self.run_main(text_payload(overflow="shrink"))
        self.assertEqual(
            str(caught.exception),
            f"text cannot fit in bbox (400x120) even at size {html_render.MIN_SHRINK_SIZE}",
        )
        self.assertEqual(len(self.calls()), 1)

    def test_a_failing_screenshot_reports_the_exit_code_and_stderr(self):
        shot = self.tmp / "shot.png"
        with mock.patch.dict(os.environ, {"FAKE_BROWSER_EXIT": "3"}):
            with self.assertRaises(SystemExit) as caught:
                html_render.screenshot(str(self.browser), "<p>x</p>", shot, 10, 10)
        self.assertTrue(shot.is_file())
        self.assertIn("browser screenshot failed (exit 3)", str(caught.exception))
        self.assertIn("stand-in browser failed", str(caught.exception))

    def test_a_screenshot_that_writes_no_file_fails(self):
        with mock.patch.dict(os.environ, {"FAKE_BROWSER_NO_SHOT": "1"}):
            with self.assertRaises(SystemExit) as caught:
                html_render.screenshot(str(self.browser), "<p>x</p>", self.tmp / "shot.png", 10, 10)
        self.assertIn("browser screenshot failed (exit 0)", str(caught.exception))

    def test_a_measurement_without_a_fitted_size_fails(self):
        with self.assertRaises(SystemExit) as caught:
            html_render.fitted_size(str(self.browser), "<p>x</p>")
        self.assertIn("browser measurement failed (exit 0)", str(caught.exception))

    def test_a_failing_measurement_is_refused_even_with_a_fitted_size(self):
        with mock.patch.dict(os.environ, {"FAKE_BROWSER_FIT": "17", "FAKE_BROWSER_EXIT": "2"}):
            with self.assertRaises(SystemExit) as caught:
                html_render.fitted_size(str(self.browser), "<p>x</p>")
        self.assertIn("browser measurement failed (exit 2)", str(caught.exception))
        self.assertIn("stand-in browser failed", str(caught.exception))

    def test_a_hung_browser_times_out_with_a_message(self):
        timeout = subprocess.TimeoutExpired(cmd="browser", timeout=120)
        with mock.patch.object(html_render.subprocess, "run", side_effect=timeout):
            with self.assertRaises(SystemExit) as caught:
                html_render.fitted_size(str(self.browser), "<p>x</p>")
        self.assertEqual(str(caught.exception), "browser timed out rendering the page (120s)")


if __name__ == "__main__":
    unittest.main()
