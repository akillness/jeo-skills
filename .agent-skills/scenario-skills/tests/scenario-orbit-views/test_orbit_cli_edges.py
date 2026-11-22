import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import compose_layout as cl  # noqa: E402
import match_view as mv  # noqa: E402
import render_grounded as rg  # noqa: E402


def cli(script, *args):
    return subprocess.run([sys.executable, str(SCRIPTS / script), *map(str, args)],
                          capture_output=True, text=True, encoding="utf-8")


class TempDirCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)


class ComposeLayoutCliTests(TempDirCase):
    def test_smaller_clay_pass_is_scaled_to_the_plate(self):
        Image.new("RGB", (64, 64), (0, 0, 255)).save(self.dir / "bg_00.png")
        Image.new("RGBA", (32, 32), (200, 0, 0, 255)).save(self.dir / "clay_00.png")
        out = cl.compose(self.dir / "bg_00.png", self.dir / "clay_00.png")
        self.assertEqual(out.size, (64, 64))
        self.assertEqual(out.getpixel((60, 60)), (200, 0, 0))

    def test_named_keys_only(self):
        for key in ("00", "04"):
            Image.new("RGB", (16, 16)).save(self.dir / f"bg_{key}.png")
            Image.new("RGBA", (16, 16)).save(self.dir / f"clay_{key}.png")
        run = cli("compose_layout.py", self.dir, "04")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("wrote 1 layouts", run.stdout)
        self.assertEqual(sorted(p.name for p in self.dir.glob("layout_*")), ["layout_04.jpg"])

    def test_usage_and_empty_folder_fail(self):
        with self.assertRaises(SystemExit) as caught:
            cl.main([])
        self.assertIn("compose_layout.py renders/", str(caught.exception.code))
        Image.new("RGB", (16, 16)).save(self.dir / "bg_00.png")
        with self.assertRaises(SystemExit) as caught:
            cl.main([str(self.dir)])
        self.assertIn("no bg_<key>.png + clay_<key>.png pairs", str(caught.exception.code))


class MatchViewCliTests(TempDirCase):
    def test_empty_mask_normalizes_to_a_blank_canvas(self):
        canvas = mv.normalise(np.zeros((40, 40), bool), size=50)
        self.assertEqual(canvas.shape, (50, 100))
        self.assertFalse(canvas.any())

    def test_cli_prints_the_top_rows_best_first(self):
        src = Image.new("RGB", (128, 128), (230, 230, 230))
        ImageDraw.Draw(src).rectangle((40, 20, 88, 108), fill=(40, 90, 160))
        src.save(self.dir / "src.png")
        views = []
        for i, box in enumerate([(10, 50, 118, 78), (44, 24, 84, 104), (30, 30, 98, 98)]):
            im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
            ImageDraw.Draw(im).rectangle(box, fill=(90, 90, 90, 255))
            im.save(self.dir / f"v{i}.png")
            views.append({"az": -20 + 20 * i, "el": 10 * i, "file": str(self.dir / f"v{i}.png")})
        (self.dir / "cameras.json").write_text(json.dumps({"views": views}), encoding="utf-8")
        run = cli("match_view.py", self.dir / "src.png", self.dir / "cameras.json", "--top", "2")
        self.assertEqual(run.returncode, 0, run.stderr)
        lines = run.stdout.splitlines()
        self.assertEqual(len(lines), 2)
        self.assertRegex(lines[0], r"^iou 0\.\d{3}  az \+0  el 10$")
        buf = io.StringIO()
        with redirect_stdout(buf):
            mv.main([str(self.dir / "src.png"), str(self.dir / "cameras.json")])
        self.assertEqual(len(buf.getvalue().splitlines()), 3)

    def test_usage_without_two_paths(self):
        with self.assertRaises(SystemExit) as caught:
            mv.main(["only-one.png"])
        self.assertIn("match_view.py source.png", str(caught.exception.code))


class StudioShadowCliTests(TempDirCase):
    def test_cli_writes_the_frame_and_reports_the_check(self):
        clay = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        draw = ImageDraw.Draw(clay)
        draw.rectangle((20, 70, 110, 100), fill=(0, 0, 0, 120))
        draw.rectangle((50, 20, 70, 90), fill=(100, 100, 100, 255))
        clay.save(self.dir / "clay.png")
        cut = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        ImageDraw.Draw(cut).rectangle((52, 22, 68, 88), fill=(200, 40, 40, 255))
        cut.save(self.dir / "cut.png")
        run = cli("studio_shadow.py", self.dir / "clay.png", self.dir / "cut.png", self.dir / "out.png",
                  "--size", "64", "--strength", "1.0")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("covers 100% of the clay body, 0% outside it, corners clear", run.stdout)
        with Image.open(self.dir / "out.png") as out:
            self.assertEqual((out.size, out.mode), ((64, 64), "RGBA"))

    def test_opaque_corners_are_flagged(self):
        Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(self.dir / "clay.png")
        Image.new("RGBA", (32, 32), (9, 9, 9, 255)).save(self.dir / "cut.png")
        run = cli("studio_shadow.py", self.dir / "clay.png", self.dir / "cut.png", self.dir / "out.png", "--size", "32")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("100% outside it, corners OPAQUE", run.stdout)

    def test_usage_without_three_paths(self):
        run = cli("studio_shadow.py", "clay.png", "cut.png")
        self.assertEqual(run.returncode, 1)
        self.assertIn("studio_shadow.py clay_00.png cut_00.png out_00.png", run.stderr)


class RenderGroundedArgTests(unittest.TestCase):
    def test_flag_without_value_and_missing_required_paths_fail(self):
        with self.assertRaises(SystemExit) as caught:
            rg.parse_args(["--glb", "m.glb", "--out"])
        self.assertEqual(caught.exception.code, "missing value for --out")
        with self.assertRaises(SystemExit) as caught:
            rg.parse_args(["--pano", "p.png", "--out", "o"])
        self.assertEqual(caught.exception.code, "--glb and --out are required")

    def test_cli_validates_arguments_before_needing_blender(self):
        run = cli("render_grounded.py", "--", "--glb", "m.glb", "--out", "o")
        self.assertEqual(run.returncode, 1)
        self.assertIn("--pano is required unless --search", run.stderr)


if __name__ == "__main__":
    unittest.main()
