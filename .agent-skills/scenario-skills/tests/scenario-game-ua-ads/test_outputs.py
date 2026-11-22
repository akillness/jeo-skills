"""No script writes over one of its own inputs: each refuses, exit 2, before doing any work."""

import shutil
import tempfile
import unittest
from pathlib import Path

import helpers


class OutputIsInputTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def file(self, name, data=b"keep me"):
        path = self.dir / name
        path.write_bytes(data)
        return path

    def assertRefusedAndKept(self, result, *kept):
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("error:", result.stderr)
        for path, data in kept:
            self.assertEqual(path.read_bytes(), data, path)

    def test_put_parts_refuses_an_output_that_is_the_file_or_the_parts(self):
        clip = self.file("clip.mp4")
        parts = self.file("parts.json", b'["https://bucket.s3.amazonaws.com/up?X-Amz-Signature=s1"]')
        for out in (clip, parts):
            with self.subTest(out=out.name):
                result = helpers.run("put_parts.py", clip, parts, "-o", out)
                self.assertRefusedAndKept(result, (clip, b"keep me"), (parts, parts.read_bytes()))

    def test_build_passes_never_writes_over_its_plan(self):
        plan = self.file("plan.json", b'{"duration": 15}')
        for args in (["picture", plan, "-o", plan], ["simulate", plan, "-o", plan],
                     ["sound", plan, "asset_x", "-o", plan]):
            with self.subTest(args=args[0]):
                self.assertRefusedAndKept(helpers.run("build_passes.py", *args), (plan, b'{"duration": 15}'))
        # sound writes cues.json beside its payload: a plan named cues.json in that folder is refused
        cues_plan = self.file("cues.json", b'{"duration": 15}')
        result = helpers.run("build_passes.py", "sound", cues_plan, "asset_x")
        self.assertRefusedAndKept(result, (cues_plan, b'{"duration": 15}'))

    def test_check_take_refuses_to_write_over_the_take(self):
        take = self.file("take.mp4")
        for args in (["sheet", take, take], ["action", take, take, "--at", "1", "--box", "0", "0", "8", "8"],
                     ["ends", take, take], ["motion", take, "-o", take], ["motion", take, "--sheet", take]):
            with self.subTest(args=args):
                self.assertRefusedAndKept(helpers.run("check_take.py", *args), (take, b"keep me"))

    def test_make_patch_refuses_an_out_that_is_one_of_its_inputs(self):
        board = self.file("board.png")
        for out in ("board.png", "config.json"):
            with self.subTest(out=out):
                config = helpers.write_json(self.dir / "config.json", {"source": "board.png", "out": out})
                data = config.read_bytes()
                self.assertRefusedAndKept(helpers.run("make_patch.py", config), (board, b"keep me"), (config, data))


if __name__ == "__main__":
    unittest.main()
