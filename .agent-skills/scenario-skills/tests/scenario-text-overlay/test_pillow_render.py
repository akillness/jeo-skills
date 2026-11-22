"""Pillow fallback renderer tests: layout, font resolution, and the font cache.

Runs offline: font downloads are stubbed, so system fonts or Pillow's default render.
Needs Pillow (requirements.txt).
"""

import errno
import gc
import io
import os
import pathlib
import sys
import tempfile
import unittest
import unittest.mock as mock
import warnings
import weakref
from contextlib import redirect_stderr

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-text-overlay" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

import pillow_render  # noqa: E402


def offline(url):
    raise OSError("offline test")


def payload(**overrides):
    data = {
        "text_template": "{{line}}",
        "font_family": "Inter",
        "font_url": None,
        "font_weight": 400,
        "font_style": "normal",
        "size": 36,
        "color": "#FFFFFF",
        "align": "left",
        "line_height": 1.2,
        "letter_spacing": 0.0,
        "overflow": "wrap",
        "bbox": [{"x": 40, "y": 40, "w": 300, "h": 100}],
        "canvas_width": 400,
        "canvas_height": 400,
    }
    data.update(overrides)
    return data


class PillowRenderTests(unittest.TestCase):
    def setUp(self):
        self.original_download = pillow_render._download
        pillow_render._download = offline

    def tearDown(self):
        pillow_render._download = self.original_download

    def render(self, data, text):
        with redirect_stderr(io.StringIO()):
            return pillow_render.render_text_payload(data, text)

    def test_canvas_is_transparent_rgba(self):
        image = self.render(payload(), "Night, distilled.")
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (400, 400))
        self.assertEqual(image.getpixel((0, 0))[3], 0)
        self.assertIsNotNone(image.getchannel("A").getbbox())

    def test_clip_keeps_ink_inside_the_box(self):
        long_text = "one reason to buy stated plainly " * 6
        image = self.render(payload(overflow="clip"), long_text)
        x0, y0, x1, y1 = image.getchannel("A").getbbox()
        self.assertGreaterEqual(x0, 40)
        self.assertGreaterEqual(y0, 40)
        self.assertLessEqual(x1, 40 + 300)
        self.assertLessEqual(y1, 40 + 100)

    def test_shrink_fits_the_box_height(self):
        long_text = "one reason to buy stated plainly " * 6
        image = self.render(payload(overflow="shrink", size=200), long_text)
        _, y0, _, y1 = image.getchannel("A").getbbox()
        self.assertGreaterEqual(y0, 40)
        self.assertLessEqual(y1, 40 + 100 + 2)

    def test_shrink_that_cannot_fit_fails(self):
        data = payload(overflow="shrink", bbox=[{"x": 0, "y": 0, "w": 30, "h": 5}])
        with self.assertRaises(SystemExit):
            self.render(data, "far too many words for a tiny box " * 3)

    def test_alignment_moves_the_ink(self):
        left = self.render(payload(align="left"), "hi")
        right = self.render(payload(align="right"), "hi")
        self.assertLess(
            left.getchannel("A").getbbox()[0], right.getchannel("A").getbbox()[0]
        )

    def test_letter_spacing_widens_the_line(self):
        plain = self.render(payload(), "WIDE")
        spaced = self.render(payload(letter_spacing=8.0), "WIDE")
        plain_width = plain.getchannel("A").getbbox()[2]
        spaced_width = spaced.getchannel("A").getbbox()[2]
        self.assertGreater(spaced_width, plain_width + 16)

    def test_long_word_breaks_inside_the_box(self):
        image = self.render(
            payload(overflow="clip"), "unbreakablesupercalifragilistic" * 3
        )
        x0, _, x1, _ = image.getchannel("A").getbbox()
        self.assertGreaterEqual(x0, 40)
        self.assertLessEqual(x1, 40 + 300)

    def test_newlines_are_preserved(self):
        one = self.render(payload(), "a")
        two = self.render(payload(), "a\nb")
        self.assertGreater(
            two.getchannel("A").getbbox()[3], one.getchannel("A").getbbox()[3]
        )


class ResolveFontTests(unittest.TestCase):
    def setUp(self):
        self.original_download = pillow_render._download
        pillow_render._download = offline

    def tearDown(self):
        pillow_render._download = self.original_download

    def test_woff_font_url_is_rejected(self):
        data = payload(font_family=None, font_url="https://example.com/brand.woff2")
        with self.assertRaises(SystemExit):
            pillow_render.resolve_font_file(data)

    def test_offline_google_font_falls_back_with_a_warning(self):
        stream = io.StringIO()
        with redirect_stderr(stream):
            self.assertIsNone(pillow_render.resolve_font_file(payload()))
        self.assertIn("system font", stream.getvalue())


class CacheFontTests(unittest.TestCase):
    """_cache_font keeps the file, closes its handle, and raises a failed write.

    The spy wraps tempfile.NamedTemporaryFile, so a rewrite to another temp API fails it
    even when it leaks nothing.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # _cache_font writes into tempfile's default directory; point it at a private one.
        patcher = mock.patch.object(pillow_render.tempfile, "tempdir", self.tmp.name)
        patcher.start()
        self.addCleanup(patcher.stop)

    def leaks(self, call):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            call()
            gc.collect()
        return [
            str(w.message)
            for w in caught
            if issubclass(w.category, ResourceWarning) and self.tmp.name in str(w.message)
        ]

    def spy_handles(self, fail_write=False, keep=True):
        """Record each NamedTemporaryFile handle _cache_font opens.

        keep=False records weak references, so a dropped handle can still be collected.
        fail_write=True makes write raise ENOSPC, as a full disk would.
        """
        handles = []
        real = tempfile.NamedTemporaryFile

        def spy(*args, **kwargs):
            handle = real(*args, **kwargs)
            if fail_write:
                handle.write = mock.Mock(side_effect=OSError(errno.ENOSPC, "No space left"))
            handles.append(handle if keep else weakref.ref(handle))
            return handle

        patcher = mock.patch.object(pillow_render.tempfile, "NamedTemporaryFile", spy)
        patcher.start()
        self.addCleanup(patcher.stop)
        return handles

    def test_returns_a_kept_file_with_the_suffix_and_exact_bytes(self):
        data = b"\x00\x01FONTDATA\xff"
        path = pillow_render._cache_font(data, ".otf")
        self.assertEqual(os.path.dirname(path), self.tmp.name)
        self.assertTrue(path.endswith(".otf"))
        self.assertEqual(pathlib.Path(path).read_bytes(), data)

    def test_success_closes_the_handle(self):
        handles = self.spy_handles()
        paths = []
        # The spy keeps the handle alive, so leaks() only sees other files left open.
        self.assertEqual(
            self.leaks(lambda: paths.append(pillow_render._cache_font(b"ttf", ".ttf"))), []
        )
        self.assertEqual(len(handles), 1)
        self.assertTrue(handles[0].closed)
        self.assertTrue(os.path.exists(paths[0]))

    def test_write_failure_raises_and_closes_the_handle(self):
        handles = self.spy_handles(fail_write=True)
        with self.assertRaises(OSError) as raised:
            pillow_render._cache_font(b"ttf", ".ttf")
        self.assertEqual(raised.exception.errno, errno.ENOSPC)
        self.assertEqual(len(handles), 1)
        self.assertTrue(handles[0].closed)
        # A failed write may leave an empty file behind; the temp dir cleanup removes it.
        left = os.listdir(self.tmp.name)
        self.assertLessEqual(len(left), 1)
        self.assertTrue(all(name.endswith(".ttf") for name in left))

    @unittest.skipUnless(
        sys.version_info >= (3, 14),
        "Python 3.13 and older drop an unclosed temp file without a ResourceWarning",
    )
    def test_write_failure_leaks_no_handle(self):
        handles = self.spy_handles(fail_write=True, keep=False)

        def failing_write():
            with self.assertRaises(OSError):
                pillow_render._cache_font(b"ttf", ".ttf")

        self.assertEqual(self.leaks(failing_write), [])
        self.assertEqual(len(handles), 1)


if __name__ == "__main__":
    unittest.main()
