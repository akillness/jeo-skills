import contextlib
import io
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_prepare  # noqa: E402


def quiet(fn, *args):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args)


class InitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)

    def init(self, *extra, out="run"):
        quiet(pet_prepare.main, ["init", "--name", "Biscuit", "--out", str(self.tmp / out), *extra])
        run = self.tmp / out
        return run, pc.read_json(run / "request.json"), pc.read_json(run / "jobs.json")["jobs"]

    def test_text_only_defaults(self):
        run, req, jobs = self.init("--notes", "a small orange fox")
        self.assertEqual(req["pet_id"], "biscuit")
        self.assertEqual(req["version"], 2)
        self.assertEqual(req["chroma_key"]["hex"], "#FF00FF")
        ids = [job["id"] for job in jobs]
        self.assertEqual(ids, ["base", *pc.STANDARD, "look-cardinals", "look-9", "look-10"])
        self.assertTrue((run / "generated").is_dir() and (run / "package").is_dir())

    def test_pink_pet_gets_another_key(self):
        _, req, _ = self.init("--notes", "a pink axolotl")
        self.assertEqual(req["chroma_key"]["name"], "green")

    def test_reference_colors_pick_the_key(self):
        ref = self.tmp / "ref.png"
        synth.save(synth.sprite(120, color=(250, 20, 235)), ref)
        run, req, jobs = self.init("--reference", str(ref))
        self.assertNotEqual(req["chroma_key"]["name"], "magenta")
        self.assertEqual(req["references"], ["references/user-01.png"])
        self.assertTrue((run / "references" / "user-01.png").is_file())
        self.assertIn("references/user-01.png", jobs[0]["references"])

    def test_v1_has_no_look_jobs(self):
        _, _, jobs = self.init("--version", "1")
        self.assertEqual(len(jobs), 10)

    def test_job_graph_and_sizes(self):
        _, _, jobs = self.init()
        by_id = {job["id"]: job for job in jobs}
        self.assertEqual(by_id["running-left"]["depends_on"], ["base", "running-right"])
        self.assertIn("generated/running-right.png", by_id["running-left"]["references"])
        self.assertEqual(by_id["look-10"]["depends_on"], ["look-cardinals", "look-9"])
        self.assertIn("generated/look-9.png", by_id["look-10"]["references"])
        self.assertEqual(by_id["running-right"]["sizes"][pet_prepare.SUNBURST], {"width": 3584, "height": 1200})
        self.assertEqual(by_id["running-right"]["sizes"][pet_prepare.NANO_BANANA], {"aspectRatio": "8:1"})
        self.assertEqual(by_id["waving"]["sizes"][pet_prepare.SUNBURST], {"width": 1792, "height": 608})
        self.assertEqual(by_id["waving"]["sizes"][pet_prepare.NANO_BANANA], {"aspectRatio": "4:1"})
        self.assertEqual(by_id["base"]["sizes"][pet_prepare.SUNBURST], {"width": 1024, "height": 1024})

    def test_prompts_name_the_key_and_the_frame_count(self):
        _, _, jobs = self.init()
        waving = next(job for job in jobs if job["id"] == "waving")
        self.assertIn("exactly 4 full-body poses", waving["prompt"])
        self.assertIn("#FF00FF", waving["prompt"])
        self.assertIn("#FF00FF", waving["retry_prompt"])
        for job in jobs:
            self.assertNotIn("{", job["prompt"])
        self.assertIn("Style:", waving["retry_prompt"])
        self.assertTrue(waving["retry_prompt"].startswith("Exactly 4 poses"))

    def test_refuses_a_used_folder(self):
        self.init()
        with self.assertRaises(SystemExit):
            self.init()
        self.init("--force")

    def test_note_appends_to_the_named_jobs(self):
        run, _, _ = self.init()
        quiet(pet_prepare.main, ["note", str(run), "--jobs", "look-9,look-10", "--text", "The ears lead the turn."])
        jobs = {job["id"]: job for job in pc.read_json(run / "jobs.json")["jobs"]}
        self.assertTrue(jobs["look-9"]["prompt"].endswith("The ears lead the turn."))
        self.assertNotIn("ears", jobs["idle"]["prompt"])
        with self.assertRaises(SystemExit):
            pet_prepare.main(["note", str(run), "--jobs", "nope", "--text", "x"])

    def test_from_split_redoes_only_the_named_rows(self):
        import pet_frames

        sheet = np.zeros((1872, 1536, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(1)):
            for col in range(frames):
                pet = synth.sprite(150)
                pc.cell(sheet, row, col)[40:190, 40 : 40 + pet.shape[1]] = pet
        synth.save(sheet, self.tmp / "sheet.png")
        quiet(pet_frames.main, ["split", str(self.tmp / "sheet.png"), "--out", str(self.tmp / "split")])
        run, req, jobs = self.init("--from-split", str(self.tmp / "split"), "--only", "waving")
        self.assertEqual([job["id"] for job in jobs], ["waving"])
        self.assertEqual(jobs[0]["depends_on"], [])
        self.assertIn("references/rows/waving.png", jobs[0]["references"])
        self.assertEqual(req["version"], 1)
        self.assertTrue((run / "references" / "base.png").is_file())
        _, _, jobs = self.init("--from-split", str(self.tmp / "split"), "--version", "2", "--only", "look", out="up")
        self.assertEqual([job["id"] for job in jobs], ["look-cardinals", "look-9", "look-10"])
        _, _, jobs = self.init("--from-split", str(self.tmp / "split"), "--change", "add a red scarf", out="look")
        self.assertEqual(jobs[0]["kind"], "edit")
        self.assertIn("add a red scarf", jobs[0]["prompt"])


class LookRedoTests(unittest.TestCase):
    def test_a_look_row_redo_references_only_files_that_will_exist(self):
        import pet_frames

        tmp = synth.tmpdir(self)
        sheet = np.zeros((2288, 1536, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(2)):
            for col in range(frames):
                pet = synth.sprite(150)
                pc.cell(sheet, row, col)[40:190, 40 : 40 + pet.shape[1]] = pet
        synth.save(sheet, tmp / "sheet.png")
        quiet(pet_frames.main, ["split", str(tmp / "sheet.png"), "--out", str(tmp / "split")])
        quiet(pet_prepare.main, ["init", "--from-split", str(tmp / "split"), "--only", "look-10", "--out", str(tmp / "run")])
        job = pc.read_json(tmp / "run" / "jobs.json")["jobs"][0]
        self.assertEqual(job["references"], ["references/base.png", "references/rows/look-9.png", "references/rows/look-10.png"])
        self.assertEqual(job["depends_on"], [])
        self.assertNotIn("four poses shows", job["prompt"])
        self.assertIn("first half of the sweep", job["prompt"])
        for ref in job["references"]:
            self.assertTrue((tmp / "run" / ref).is_file(), ref)

    def test_no_current_row_keeps_the_neighbor_but_drops_the_broken_row(self):
        import pet_frames

        tmp = synth.tmpdir(self)
        sheet = np.zeros((2288, 1536, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(2)):
            for col in range(frames):
                pet = synth.sprite(150)
                pc.cell(sheet, row, col)[40:190, 40 : 40 + pet.shape[1]] = pet
        synth.save(sheet, tmp / "sheet.png")
        quiet(pet_frames.main, ["split", str(tmp / "sheet.png"), "--out", str(tmp / "split")])
        args = ["init", "--from-split", str(tmp / "split"), "--only", "look-10,jumping", "--no-current-row", "--out", str(tmp / "run")]
        quiet(pet_prepare.main, args)
        jobs = {job["id"]: job for job in pc.read_json(tmp / "run" / "jobs.json")["jobs"]}
        self.assertEqual(jobs["look-10"]["references"], ["references/base.png", "references/rows/look-9.png"])
        self.assertNotIn("current version of this row", jobs["look-10"]["prompt"])
        self.assertEqual(jobs["jumping"]["references"], ["references/base.png"])

    def test_a_full_look_stage_chains_its_own_strips(self):
        tmp = synth.tmpdir(self)
        quiet(pet_prepare.main, ["init", "--name", "Bit", "--out", str(tmp / "run")])
        jobs = {job["id"]: job for job in pc.read_json(tmp / "run" / "jobs.json")["jobs"]}
        self.assertEqual(jobs["look-9"]["references"], ["references/base.png", "generated/look-cardinals.png"])
        self.assertEqual(jobs["look-10"]["depends_on"], ["look-cardinals", "look-9"])
        self.assertIn("four poses shows", jobs["look-10"]["prompt"])


class PixelTests(unittest.TestCase):
    def test_grid_palette_and_enlarged_reference(self):
        tmp = synth.tmpdir(self)
        run = tmp / "run"
        quiet(pet_prepare.main, ["init", "--name", "Bit", "--pixel", "--out", str(run)])
        snapped = synth.strip([synth.sprite(60)], margin=6)
        synth.save(snapped, tmp / "snapped.png")
        quiet(pet_prepare.main, ["pixel", str(run), "--snapped", str(tmp / "snapped.png")])
        pixel = pc.read_json(run / "pixel.json")
        self.assertEqual(pixel["grid"], 2)
        box = pc.bbox(pc.visible(synth.sprite(60)))
        self.assertEqual(pixel["native_size"][1], box[3] - box[1])
        self.assertLessEqual(len(pixel["palette"]), 16)
        reference = pc.load_rgba(run / "references" / "base.png")
        self.assertGreaterEqual(reference.shape[0], 480)

    def test_key_blends_stay_out_of_the_palette(self):
        tmp = synth.tmpdir(self)
        run = tmp / "run"
        quiet(pet_prepare.main, ["init", "--name", "Bit", "--pixel", "--out", str(run)])
        pet = synth.sprite(60, color=(40, 160, 60))
        ring = pc.dilate(pet[..., 3] > 0, 1) & ~(pet[..., 3] > 0)
        pet[ring] = (45, 21, 50, 255)  # a dark outline blended with the magenta background
        synth.save(synth.strip([pet], margin=6), tmp / "snapped.png")
        quiet(pet_prepare.main, ["pixel", str(run), "--snapped", str(tmp / "snapped.png")])
        palette = pc.read_json(run / "pixel.json")["palette"]
        self.assertNotIn("#2D1532", palette)
        self.assertIn("#28A03C", palette)

    def test_rejects_an_image_that_is_not_downsized(self):
        tmp = synth.tmpdir(self)
        run = tmp / "run"
        quiet(pet_prepare.main, ["init", "--name", "Bit", "--pixel", "--out", str(run)])
        synth.save(synth.strip([synth.sprite(300)]), tmp / "big.png")
        with self.assertRaises(SystemExit):
            quiet(pet_prepare.main, ["pixel", str(run), "--snapped", str(tmp / "big.png")])


if __name__ == "__main__":
    unittest.main()
