import contextlib
import io
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageSequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_build  # noqa: E402
import pet_common as pc  # noqa: E402
import pet_preview  # noqa: E402


def total_ms(path):
    with Image.open(path) as image:
        return sum(frame.info["duration"] for frame in ImageSequence.Iterator(image))


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        with contextlib.redirect_stdout(io.StringIO()):
            cls.run_dir = synth.make_run(cls.tmp, version=2)
            pet_build.main([str(cls.run_dir)])
            cls.sheet = str(cls.run_dir / "final" / "spritesheet.webp")
            pet_preview.main(["gif", cls.sheet, "--out-dir", str(cls.tmp / "gifs")])

    def test_every_gif_is_written(self):
        names = {path.name for path in (self.tmp / "gifs").glob("*.gif")}
        expected = {f"{job}.gif" for job in pc.STANDARD}
        expected |= {"pet.gif", "pet-transparent.gif", "idle-jump-idle.gif", "look-loop.gif"}
        self.assertEqual(names, expected)

    def test_pet_gif_plays_every_state_twice_then_the_look_loop(self):
        standard = sum(sum(durations) for job, _, durations in pc.ROWS if not job.startswith("look-"))
        looks = sum(sum(durations) for job, _, durations in pc.ROWS if job.startswith("look-"))
        self.assertEqual(total_ms(self.tmp / "gifs" / "pet.gif"), 2 * standard + looks)
        self.assertEqual(total_ms(self.tmp / "gifs" / "jumping.gif"), 2 * sum(pc.ROWS[4][2]))

    def test_soft_background_and_transparent_versions(self):
        with Image.open(self.tmp / "gifs" / "pet.gif") as image:
            self.assertEqual(image.convert("RGB").getpixel((0, 0)), pc.parse_key(pet_preview.SOFT))
        with Image.open(self.tmp / "gifs" / "pet-transparent.gif") as image:
            self.assertEqual(image.info.get("transparency"), 255)
            rgba = image.convert("RGBA")
            self.assertEqual(rgba.getpixel((0, 0))[3], 0)
            self.assertEqual(rgba.getpixel((96, 150))[3], 255)

    def test_contact_and_look_sheets(self):
        out = self.tmp / "contact.png"
        with contextlib.redirect_stdout(io.StringIO()):
            pet_preview.main(["contact", self.sheet, "--out", str(out)])
            pet_preview.main(["looks", self.sheet, "--out", str(self.tmp / "looks.png")])
        with Image.open(out) as image:
            self.assertEqual(image.size, (8 * 96, 11 * (104 + pet_preview.LABEL_H)))
        with Image.open(self.tmp / "looks.png") as image:
            self.assertEqual(image.size, (1536, 5 * (208 + pet_preview.LABEL_H)))

    def test_looks_needs_v2(self):
        v1 = self.tmp / "v1.png"
        synth.save(pc.load_rgba(self.sheet)[:1872], v1)
        with self.assertRaises(SystemExit):
            pet_preview.main(["looks", str(v1), "--out", str(self.tmp / "x.png")])


if __name__ == "__main__":
    unittest.main()
