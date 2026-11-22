import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402


def peak(path):
    """Peak sample of an audio file, decoded by ffmpeg to mono 16-bit PCM, as a fraction of full scale."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-"],
                         capture_output=True, check=True).stdout
    return np.abs(np.frombuffer(raw, np.int16).astype(np.int32)).max() / 32768


@unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
class PreparedTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.project = playable.new_project(cls.tmp)
        cls.web = cls.project / "assets" / "web"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def rgba(self, name):
        return playable.rgba(self.web / name)

    def test_every_manifest_entry_is_written(self):
        man = json.loads((self.project / "assets" / "manifest.json").read_text())
        names = [f"{i['name']}.{i.get('format', 'webp')}" for i in man["images"]]
        names += [f"{a['name']}.mp3" for a in man["audio"]]
        names += [f"{f['name']}.woff2" for f in man["fonts"]]
        for name in names:
            self.assertTrue((self.web / name).is_file(), name)

    def test_plate_is_cover_cropped_to_the_exact_size(self):
        self.assertEqual(playable.image_size(self.web / "bg.webp"), (720, 1280))

    def test_blob_keeps_a_sprite_that_crosses_the_grid(self):
        # the placeholder hero is about 1030 px wide on a sheet of 512 px cells: a grid cut would clip it
        w, h = playable.image_size(self.web / "hero.webp")
        self.assertGreater(w / h, 2.2)
        w, h = playable.image_size(self.web / "piece.webp")
        self.assertAlmostEqual(w / h, 1, delta=0.1)

    def test_cut_out_sprites_are_trimmed_and_transparent_around(self):
        a = self.rgba("star.webp")[:, :, 3]
        self.assertEqual(a[0, 0], 0)
        self.assertTrue((a[0] > 8).any() or (a[:, 0] > 8).any())  # trimmed to the opaque bounds

    def test_logo_background_is_keyed_and_trimmed(self):
        a = self.rgba("logo.webp")[:, :, 3]
        h, w = a.shape
        # the teal plate is gone and the crop hugs the rounded badge (1024 x 424 on the 1536 x 1024 source)
        self.assertAlmostEqual(w / h, 1024 / 424, delta=0.1)
        self.assertEqual(a[0, 0], 0)  # outside the badge's rounded corner
        self.assertEqual(a[h // 2, w // 2], 255)

    def test_round_hud_crop_gets_an_ellipse_mask(self):
        a = self.rgba("coin.webp")[:, :, 3]
        self.assertEqual(a[0, 0], 0)
        self.assertEqual(a[a.shape[0] // 2, a.shape[1] // 2], 255)

    def test_quiet_take_is_boosted_under_the_limiter(self):
        before = peak(self.project / "assets" / "raw" / "win.wav")
        after = peak(self.web / "win.mp3")
        self.assertLess(before, 0.07)
        self.assertGreater(after, 2.5 * before)
        self.assertLessEqual(after, 0.95)

    def test_font_is_subset_to_woff2(self):
        out = self.web / "font.woff2"
        self.assertEqual(out.read_bytes()[:4], b"wOF2")
        self.assertLess(out.stat().st_size, playable.FONT.stat().st_size)

    def test_blobs_preview_lists_three_sprites_after_clearing_the_grid(self):
        out = playable.run(playable.SCRIPTS / "prep_assets.py", self.project, "--blobs", "assets/raw/sheet.png")
        self.assertIn("cleared opaque grid lines", out.stdout)
        self.assertEqual(len(re.findall(r"^\d+ \(", out.stdout, re.M)), 3)
        self.assertTrue((self.project / "assets" / "raw" / "sheet_blobs.png").is_file())

    def test_placeholders_never_overwrite_existing_files(self):
        plate = self.project / "assets" / "raw" / "plate.png"
        before = plate.stat().st_mtime_ns
        playable.run(self.project / "make_placeholders.py", self.project, "--font", playable.FONT)
        self.assertEqual(plate.stat().st_mtime_ns, before)


if __name__ == "__main__":
    unittest.main()
