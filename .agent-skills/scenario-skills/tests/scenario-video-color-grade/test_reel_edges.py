"""Showreel pieces in-process, plus the CLI branches the end-to-end suite leaves out.

The in-process tests need only Pillow and numpy; the runs need ffmpeg.
"""

import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image, ImageFont

import helpers

showreel = helpers.load("showreel")
render_looks = helpers.load("render_looks")
grade = helpers.load("grade")
media = helpers.load("media")

HAS_MONO = any(Path(p).is_file() for p, _ in showreel.MONO)
BG = np.array((8, 8, 12))


def write_logo(path, gap):
    """A white logo: a square icon, then a wordmark bar, separated by a gap or touching."""
    logo = Image.new("RGBA", (400, 100), (0, 0, 0, 0))
    icon_end = 60
    word_start = icon_end + (120 if gap else 0)
    logo.paste((255, 255, 255, 255), (0, 20, icon_end, 80))
    logo.paste((255, 255, 255, 255), (word_start, 35, 400, 65))
    logo.save(path)
    return path


class FontAndPanelTests(unittest.TestCase):
    def test_load_font_falls_back_to_the_default_font(self):
        font = showreel.load_font([("/nonexistent/font.ttf", 0)], 40)
        default = ImageFont.load_default()
        self.assertEqual(font.getlength("fallback"), default.getlength("fallback"))

    def test_render_looks_font_falls_back_when_no_candidate_loads(self):
        default = ImageFont.load_default()
        real = ImageFont.truetype

        def no_files(font, *args, **kwargs):
            # load_default() itself goes through truetype() with an in-memory font.
            if isinstance(font, str):
                raise OSError("missing")
            return real(font, *args, **kwargs)

        with mock.patch.object(render_looks.ImageFont, "truetype", side_effect=no_files):
            font = render_looks.font(30, bold=True)
        self.assertEqual(font.getlength("fallback"), default.getlength("fallback"))

    @unittest.skipUnless(HAS_MONO, "needs a monospace system font")
    def test_long_names_get_the_largest_font_that_fits_the_panel(self):
        panel = showreel.Panel(1920, 1080, "COLOR GRADE")
        limit = panel.PW - 96 * panel.s
        name = "an unusually long look name for the panel"
        font = panel.name_font(name)
        self.assertLess(font.size, int(34 * panel.s))
        self.assertLessEqual(font.getlength(name), limit)
        self.assertGreater(showreel.load_font(showreel.MONO, font.size + 1).getlength(name), limit)
        self.assertIs(panel.name_font(name), font)
        self.assertEqual(panel.name_font("Warm").size, int(34 * panel.s))


class WipeTests(unittest.TestCase):
    def setUp(self):
        self.old = np.zeros((4, 200, 3), np.uint8)
        self.new = np.full((4, 200, 3), 255, np.uint8)

    def test_ends_return_the_untouched_frames(self):
        self.assertIs(showreel.wipe(self.old, self.new, -0.5, 200), self.old)
        self.assertIs(showreel.wipe(self.old, self.new, 1.0, 200), self.new)

    def test_halfway_the_new_grade_covers_the_left_side(self):
        out = showreel.wipe(self.old, self.new, 0.5, 200)
        self.assertEqual(out.dtype, np.uint8)
        self.assertEqual(out.shape, self.old.shape)
        self.assertTrue((out[:, :40] == 255).all())
        self.assertTrue((out[:, 170:] == 0).all())
        # The edge sits at x=100: half blended, then lifted by the highlight line.
        self.assertGreater(out[0, 100, 0], 128)
        self.assertLess(out[0, 100, 0], 255)


class EndCardTests(unittest.TestCase):
    W, H = 640, 360

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def frames(self, gap, credit="Made by Test Studio", n=40):
        logo = write_logo(self.dir / f"logo{int(gap)}.png", gap)
        return list(showreel.endcard(self.W, self.H, n, logo, credit))

    def credit_center(self, frame):
        # The credit sits above the logo; the logo's top edge is well below row 110.
        rows = frame[:110].astype(int)
        ink = np.abs(rows - BG).max(2) > 40
        xs = np.nonzero(ink)[1]
        self.assertGreater(len(xs), 0, "no credit text drawn")
        return (xs.min() + xs.max()) / 2

    def test_fades_in_from_the_background_and_out_to_it(self):
        frames = self.frames(gap=False, credit="")
        self.assertEqual(len(frames), 40)
        for frame in frames:
            self.assertEqual((frame.shape, frame.dtype), ((self.H, self.W, 3), np.uint8))
        self.assertTrue((frames[0] == BG).all())
        self.assertGreater(frames[30][self.H // 2 - 30].max(), 200)  # the logo, fully in
        self.assertLessEqual(np.abs(frames[-1].astype(int) - BG).max(), 6)

    def test_credit_fades_in_with_the_logo(self):
        first = list(showreel.endcard(self.W, self.H, 40, None, "Made by Test Studio"))[0]
        self.assertTrue((first == BG).all())

    def test_credit_is_partly_in_halfway_through_its_fade(self):
        frames = list(showreel.endcard(self.W, self.H, 60, None, "Made by Test Studio"))
        mid, full = (int(frames[i].max()) for i in (15, 30))
        self.assertGreater(mid, BG.max() + 20)
        self.assertLess(mid, full - 40)

    def test_credit_centers_on_a_solid_logo(self):
        center = self.credit_center(self.frames(gap=False)[30])
        self.assertLess(abs(center - self.W / 2), 4)

    def test_credit_shifts_toward_the_wordmark_of_an_icon_plus_wordmark_logo(self):
        center = self.credit_center(self.frames(gap=True)[30])
        self.assertGreater(center, self.W / 2 + 8)

    def test_credit_alone_sits_at_mid_height(self):
        frame = list(showreel.endcard(self.W, self.H, 40, None, "Credit only"))[30]
        ink_rows = np.nonzero((np.abs(frame.astype(int) - BG).max(2) > 40).any(1))[0]
        self.assertGreater(len(ink_rows), 0)
        self.assertLess(ink_rows.max(), self.H // 2)


class ShowreelArgumentTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        (self.dir / "looks.json").write_text("{}", encoding="utf-8")

    def main_error(self, *args):
        argv = ["showreel.py", "--renders", str(self.dir), "--looks", str(self.dir / "looks.json"), *args]
        stderr = io.StringIO()
        with mock.patch.object(sys, "argv", argv), redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
            showreel.main()
        self.assertEqual(caught.exception.code, 2)
        return stderr.getvalue()

    def test_an_existing_output_is_kept_without_force(self):
        out = self.dir / "reel.mp4"
        out.write_bytes(b"keep me")
        self.assertIn("refusing to overwrite", self.main_error("--out", str(out)))
        self.assertEqual(out.read_bytes(), b"keep me")

    def test_a_missing_logo_is_named(self):
        message = self.main_error("--out", str(self.dir / "reel.mp4"), "--logo", str(self.dir / "nope.png"))
        self.assertIn("logo not found", message)


class GradeCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_wrong_arguments_print_the_usage(self):
        result = helpers.run("grade.py", "only-one-arg", cwd=self.dir)
        self.assertEqual(result.returncode, 1)
        self.assertIn("usage: python3 grade.py", result.stderr)

    def test_writes_one_cube_per_look(self):
        looks = {"_readme": "skipped", "00_identity": {"name": "Identity", "ops": []},
                 "01_mono": {"ops": [{"op": "mono"}]}}
        (self.dir / "looks.json").write_text(json.dumps(looks), encoding="utf-8")
        result = helpers.run("grade.py", "looks.json", "luts", cwd=self.dir)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("wrote 2 LUTs", result.stdout)
        self.assertEqual(sorted(p.name for p in (self.dir / "luts").iterdir()), ["00_identity.cube", "01_mono.cube"])

        identity = (self.dir / "luts/00_identity.cube").read_text(encoding="utf-8").splitlines()
        self.assertEqual(identity[:2], ['TITLE "Identity"', "LUT_3D_SIZE 33"])
        self.assertEqual(len(identity), 2 + 33 ** 3)
        self.assertEqual(identity[2], "0.000000 0.000000 0.000000")
        self.assertEqual(identity[3], "0.031250 0.000000 0.000000")  # red runs fastest
        self.assertEqual(identity[-1], "1.000000 1.000000 1.000000")

        mono = (self.dir / "luts/01_mono.cube").read_text(encoding="utf-8").splitlines()
        self.assertEqual(mono[0], 'TITLE "01_mono"')
        for line in mono[2:]:
            r, g, b = line.split()
            self.assertTrue(r == g == b, line)


class SmallBranchTests(unittest.TestCase):
    def test_an_empty_key_keeps_nothing(self):
        spatial = helpers.load("spatial")
        w = np.zeros(32 * 18)
        kept, sizes = spatial.clean(w, 32, 18, min_area=0.01)
        self.assertEqual(sizes, [])
        self.assertEqual(kept.shape, w.shape)
        self.assertFalse(kept.any())

    def test_inspect_frame_keeps_an_existing_image_without_force(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        (tmp / "grid.jpg").write_bytes(b"keep me")
        result = helpers.run("inspect_frame.py", "grid", "clip.mp4", "grid.jpg", cwd=tmp)
        self.assertEqual(result.returncode, 2)
        self.assertIn("refusing to overwrite grid.jpg", result.stderr)
        self.assertEqual((tmp / "grid.jpg").read_bytes(), b"keep me")


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class MediaTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_probe_counts_frames_when_the_container_does_not_store_them(self):
        clip = self.dir / "clip.mkv"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=64x36:rate=24:duration=1", "-c:v", "libx264", str(clip)], check=True)
        info = media.probe(clip)
        self.assertEqual((info["w"], info["h"], info["frames"], info["audio"]), (64, 36, 24, False))

    def test_mask_frames_reads_every_frame_to_the_end(self):
        mask = self.dir / "mask.mp4"
        helpers.make_mask(mask)
        masks = list(media.mask_frames(mask, 96, 54))
        self.assertEqual(len(masks), 24)
        for m in masks:
            self.assertEqual((m.shape, m.dtype), ((54, 96), np.bool_))
            self.assertTrue(m[20:35, 35:55].all())
            self.assertFalse(m[:5].any())


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class ShowreelRunTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        (self.dir / "renders").mkdir()
        looks = {"00_ungraded": {"name": "Ungraded"}, "01_warm": {"name": "Warm", "settings": "warmth +20"}}
        (self.dir / "looks.json").write_text(json.dumps(looks), encoding="utf-8")

    def reel(self, *args):
        result = helpers.run("showreel.py", "--renders", "renders", "--looks", "looks.json",
                             "--out", "reel.mp4", *args, cwd=self.dir)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.dir / "reel.silent.mp4").exists())
        return self.dir / "reel.mp4"

    def test_long_segments_grid_labels_and_a_logo_end_card(self):
        helpers.make_clip(self.dir / "renders/00_ungraded.mp4", audio=False)
        helpers.make_clip(self.dir / "renders/01_warm.mp4", audio=False)
        write_logo(self.dir / "logo.png", gap=True)
        reel = self.reel("--size", "160x90", "--intro", "0", "--seg", "2", "--grid", "2", "--end", "2",
                         "--logo", "logo.png")
        self.assertEqual(helpers.frame_count(reel), 48 * 3)  # one look, the grid, the end card
        info = media.probe(reel)
        self.assertEqual((info["w"], info["h"], info["audio"]), (160, 90, False))

    def test_a_portrait_source_defaults_to_a_portrait_reel(self):
        helpers.make_clip(self.dir / "renders/00_ungraded.mp4", size="54x96", audio=False)
        reel = self.reel("--order", "99_absent", "--intro", "0.25")
        self.assertEqual(helpers.frame_count(reel), 6)
        info = media.probe(reel)
        self.assertEqual((info["w"], info["h"]), (1080, 1920))


if __name__ == "__main__":
    unittest.main()
