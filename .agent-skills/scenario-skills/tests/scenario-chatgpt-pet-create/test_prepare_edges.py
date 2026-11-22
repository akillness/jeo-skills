import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
from edge_fixtures import init_run, quiet  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_prepare  # noqa: E402


class InitEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)

    def fails(self, argv, message):
        with self.assertRaises(SystemExit) as caught:
            quiet(pet_prepare.main, ["init", "--out", str(self.tmp / "run"), *argv])
        self.assertIn(message, str(caught.exception.code))

    def test_names_without_letters_or_digits(self):
        self.fails(["--name", "!!!"], "--id or --name must contain letters or digits")

    def test_unknown_only_job(self):
        self.fails(["--name", "Pip", "--only", "idle,dancing"], "unknown job 'dancing' for a v2 sheet")

    def test_a_failed_split_summary(self):
        pc.write_json(self.tmp / "split" / "summary.json", {"ok": False})
        self.fails(["--name", "Pip", "--from-split", str(self.tmp / "split")], "the split summary is not ok")

    def test_reference_count_and_existence(self):
        ref = self.tmp / "ref.png"
        synth.save(synth.sprite(60), ref)
        self.fails(["--name", "Pip", *["--reference", str(ref)] * 7], "at most 6 reference images")
        self.fails(["--name", "Pip", "--reference", str(self.tmp / "missing.png"), "--force"], "reference not found")

    def test_a_manual_key_is_named_when_it_is_a_candidate(self):
        _, out = quiet(pet_prepare.main, ["init", "--name", "Pip", "--chroma-key", "#00ffff", "--out", str(self.tmp / "a")])
        self.assertEqual(pc.read_json(self.tmp / "a" / "request.json")["chroma_key"], {"name": "cyan", "hex": "#00FFFF", "selection": "manual"})
        quiet(pet_prepare.main, ["init", "--name", "Pip", "--chroma-key", "#123456", "--out", str(self.tmp / "b")])
        self.assertEqual(pc.read_json(self.tmp / "b" / "jobs.json")["chroma_key"], "#123456")
        self.assertEqual(pc.read_json(self.tmp / "b" / "request.json")["chroma_key"]["name"], "#123456")

    def test_text_key_avoids_both_pink_and_green(self):
        self.assertEqual(pet_prepare.text_key("a pink frog with green spots"), ("cyan", (0, 255, 255)))
        self.assertEqual(pet_prepare.text_key("a violet moth"), ("green", (0, 255, 0)))
        self.assertEqual(pet_prepare.text_key("a gray cat"), ("magenta", (255, 0, 255)))

    def test_resolve_jobs_keeps_sheet_order_without_duplicates(self):
        self.assertEqual(pet_prepare.resolve_jobs("look-10, idle, idle", 2), ["idle", "look-10"])
        self.assertEqual(pet_prepare.resolve_jobs(None, 1), list(pc.STANDARD))


class PixelEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)
        self.run_dir = init_run(self.tmp, 1, "--pixel")

    def pixel(self, arr, *extra):
        synth.save(arr, self.tmp / "snapped.png")
        return quiet(pet_prepare.main, ["pixel", str(self.run_dir), "--snapped", str(self.tmp / "snapped.png"), *extra])

    def test_nothing_left_after_the_key(self):
        with self.assertRaises(SystemExit) as caught:
            self.pixel(synth.strip([np.zeros((20, 20, 4), np.uint8)], margin=6))
        self.assertIn("no pixels left after removing the background", str(caught.exception.code))

    def test_every_color_carries_the_key_hue(self):
        block = np.zeros((30, 30, 4), np.uint8)
        block[...] = (150, 20, 150, 255)
        with self.assertRaises(SystemExit) as caught:
            self.pixel(synth.strip([block], margin=6))
        self.assertIn("every snapped color carries the key's hue", str(caught.exception.code))

    def test_palette_is_capped_by_colors(self):
        pet = synth.sprite(60, tag=(200, 60, 30))
        self.pixel(synth.strip([pet], margin=6))
        self.assertEqual(len(pc.read_json(self.run_dir / "pixel.json")["palette"]), 3)
        self.pixel(synth.strip([pet], margin=6), "--colors", "2")
        self.assertEqual(len(pc.read_json(self.run_dir / "pixel.json")["palette"]), 2)

    def test_an_existing_base_reference_is_kept_once_as_the_source(self):
        base = self.run_dir / "references" / "base.png"
        synth.save(synth.sprite(80), base)
        original = base.read_bytes()
        self.pixel(synth.strip([synth.sprite(60)], margin=6))
        source = self.run_dir / "references" / "base-source.png"
        self.assertEqual(source.read_bytes(), original)
        self.assertNotEqual(base.read_bytes(), original)
        self.pixel(synth.strip([synth.sprite(50)], margin=6))
        self.assertEqual(source.read_bytes(), original)
        self.assertTrue(pc.read_json(self.run_dir / "request.json")["pixel"])


if __name__ == "__main__":
    unittest.main()
