"""The template's own scripts, run from the skill folder: make_placeholders.py and the qa_bot.py policies."""

import importlib.util
import shutil
import sys
import tempfile
import unittest
import wave
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402

PLACEHOLDERS = playable.TEMPLATE / "make_placeholders.py"
AUDIO = ("pop.wav", "payoff.wav", "win.wav", "fail.wav", "music.mp3")


def load_bot():
    """A fresh copy of the template's qa_bot module, so each test starts with its pacing state reset."""
    spec = importlib.util.spec_from_file_location("template_qa_bot", playable.TEMPLATE / "qa_bot.py")
    bot = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bot)
    return bot


def snap(pieces=(), phase="play"):
    return {"phase": phase, "pieces": [{"x": x, "y": y} for x, y in pieces], "empty": {"x": 7, "y": 9}}


class QaBotTests(unittest.TestCase):
    def setUp(self):
        self.bot = load_bot()

    def test_active_waits_for_play_and_a_piece(self):
        s = snap([(10, 300)])
        self.assertIsNone(self.bot.active(s, 0.3))
        self.assertIsNone(self.bot.active(snap([(10, 300)], phase="end"), 1.0))
        self.assertIsNone(self.bot.active(snap([]), 1.0))
        self.assertEqual(self.bot.active(snap([(10, 300)], phase="wait"), 1.0), {"click": (10, 300)})

    def test_active_taps_the_highest_piece_first(self):
        self.assertEqual(self.bot.active(snap([(10, 300), (20, 100), (30, 200)]), 1.0), {"click": (20, 100)})

    def test_active_keeps_its_pace_and_restarts_with_a_new_run(self):
        s = snap([(10, 300)])
        self.assertIsNotNone(self.bot.active(s, 1.0))
        self.assertIsNone(self.bot.active(s, 1.0 + self.bot.PACE / 2))
        self.assertIsNotNone(self.bot.active(s, 1.0 + self.bot.PACE))
        # the next run's clock starts again near 0
        self.assertIsNotNone(self.bot.active(s, 0.5))

    def test_fail_plays_slowly_and_taps_the_empty_spot_without_pieces(self):
        self.assertEqual(self.bot.fail(snap([]), 1.0), {"click": (7, 9)})
        self.assertIsNone(self.bot.fail(snap([(10, 300)]), 1.0 + self.bot.FAIL_PACE / 2))
        self.assertEqual(self.bot.fail(snap([(10, 300)]), 1.0 + self.bot.FAIL_PACE), {"click": (10, 300)})
        self.assertIsNone(self.bot.fail(snap([(10, 300)]), 0.2))
        self.assertIsNone(self.bot.fail(snap([(10, 300)], phase="end"), 9.0))

    def test_the_two_players_pace_independently(self):
        s = snap([(10, 300)])
        self.assertIsNotNone(self.bot.active(s, 1.0))
        self.assertIsNotNone(self.bot.fail(s, 1.0))

    def test_storyboards_follow_qa_trigger_contract(self):
        boards = self.bot.STORYBOARD + self.bot.STORYBOARD_IDLE
        names = [n for n, _ in boards]
        # each name becomes qa/story_<name>.png, so a duplicate would overwrite a frame
        self.assertEqual(len(names), len(set(names)))
        for name, trig in boards:
            self.assertEqual(len({"time", "event", "snap"} & set(trig)), 1, name)
            for want in trig.get("data", {}).values():
                if isinstance(want, dict):
                    self.assertLessEqual(set(want), {">=", ">", "<=", "<", "!=", "=="}, name)
        self.assertEqual(self.bot.CTA_WAIT, "endcard")
        self.assertLessEqual(set(self.bot.COMPARE), set(names))


class MakePlaceholdersTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.project = self.tmp / "demo"
        self.raw = self.project / "assets" / "raw"

    @unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
    def test_writes_every_placeholder_from_scratch(self):
        out = playable.run(PLACEHOLDERS, self.project, "--font", playable.FONT)
        self.assertIn("placeholders ready in", out.stdout)
        self.assertEqual(playable.image_size(self.raw / "plate.png"), (1152, 2048))
        shot = playable.rgba(self.project / "intake" / "screenshot.png")
        self.assertEqual(tuple(shot[10, 600, :3]), (40, 90, 170))  # the HUD band
        self.assertEqual(tuple(shot[120, 70, :3]), (255, 200, 40))  # the coin prep_assets crops
        logo = playable.rgba(self.project / "intake" / "logo.png")
        self.assertEqual(logo.shape[:2], (1024, 1536))
        self.assertEqual(tuple(logo[0, 0, :3]), (11, 82, 97))
        sheet = playable.rgba(self.raw / "sheet.png")
        self.assertEqual(sheet.shape[:2], (1024, 1536))
        self.assertEqual(sheet[5, 5, 3], 0)
        self.assertEqual(sheet[100, 512, 3], 238)  # the opaque cell border prep_assets must clear
        for name, seconds in (("pop.wav", 0.35), ("payoff.wav", 2.0), ("win.wav", 2.0), ("fail.wav", 1.5)):
            with wave.open(str(self.raw / name)) as w:
                self.assertAlmostEqual(w.getnframes() / w.getframerate(), seconds, delta=0.01, msg=name)
        self.assertGreater((self.raw / "music.mp3").stat().st_size, 0)
        self.assertEqual((self.raw / "hud-font.ttf").read_bytes(), playable.FONT.read_bytes())
        self.assertEqual((self.raw / "hud-font-OFL.txt").read_bytes(),
                         playable.FONT.with_name("OFL.txt").read_bytes())

    def test_keeps_existing_files_and_survives_an_unreadable_font(self):
        self.raw.mkdir(parents=True)
        Image.new("RGB", (300, 600), (200, 20, 20)).save(self.raw / "plate.png")
        for name in AUDIO:
            (self.raw / name).write_bytes(b"supplied " + name.encode())
        before = {p.name: p.read_bytes() for p in self.raw.iterdir()}
        font = self.tmp / "fonts" / "Broken.ttf"
        font.parent.mkdir()
        font.write_bytes(b"not a font")
        playable.run(PLACEHOLDERS, self.project, "--font", font)
        for name, data in before.items():
            self.assertEqual((self.raw / name).read_bytes(), data, name)
        # the screenshot is drawn over the existing plate: same size, plate color under the HUD band
        shot = playable.rgba(self.project / "intake" / "screenshot.png")
        self.assertEqual(shot.shape[:2], (600, 300))
        self.assertEqual(tuple(shot[590, 150, :3]), (200, 20, 20))
        self.assertEqual(playable.image_size(self.project / "intake" / "logo.png"), (1536, 1024))
        self.assertEqual(playable.image_size(self.raw / "sheet.png"), (1536, 1024))
        self.assertEqual((self.raw / "hud-font.ttf").read_bytes(), b"not a font")
        self.assertFalse((self.raw / "hud-font-OFL.txt").exists())


if __name__ == "__main__":
    unittest.main()
