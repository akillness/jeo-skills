import contextlib
import io
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_build  # noqa: E402
import pet_check  # noqa: E402
import pet_common as pc  # noqa: E402
import pet_package  # noqa: E402
import pet_preview  # noqa: E402


def quiet(fn, argv):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(argv)


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        with contextlib.redirect_stdout(io.StringIO()):
            cls.run_dir = synth.make_run(cls.tmp, version=2)
            pet_build.main([str(cls.run_dir)])
            sheet = str(cls.run_dir / "final" / "spritesheet.webp")
            pc.write_json(cls.run_dir / "qa" / "direction-semantics.json", synth.semantics())
            pet_check.main([sheet, "--run", str(cls.run_dir)])
            pet_preview.main(["gif", sheet, "--out-dir", str(cls.run_dir / "previews")])
            pet_package.main(["make", str(cls.run_dir)])
        cls.package = cls.run_dir / "package"

    def test_pet_json(self):
        manifest = pc.read_json(self.package / "blob" / "pet.json")
        self.assertEqual(
            manifest,
            {"id": "blob", "displayName": "Blob", "description": "Blob, an animated pet companion.", "spritesheetPath": "spritesheet.webp"},
        )

    def test_sheet_bytes_are_the_checked_bytes(self):
        original = (self.run_dir / "final" / "spritesheet.webp").read_bytes()
        self.assertEqual((self.package / "blob" / "spritesheet.webp").read_bytes(), original)

    def test_v1_cut_is_rows_0_to_8(self):
        v1 = pc.load_rgba(self.package / "spritesheet-v1.png")
        sheet = pc.load_rgba(self.run_dir / "final" / "spritesheet.webp")
        self.assertEqual(v1.shape[:2], (1872, 1536))
        self.assertTrue(np.array_equal(v1, sheet[:1872]))

    def test_gifs_are_packaged(self):
        self.assertTrue((self.package / "pet.gif").is_file())
        self.assertTrue((self.package / "pet-transparent.gif").is_file())

    def test_refuses_bytes_that_were_not_checked(self):
        other = self.tmp / "other.webp"
        sheet = pc.load_rgba(self.run_dir / "final" / "spritesheet.webp")
        sheet[0, 0] = (1, 2, 3, 255)
        pc.save_webp(sheet, other)
        with self.assertRaises(SystemExit):
            quiet(pet_package.main, ["make", str(self.run_dir), "--sheet", str(other)])

    def test_install_backs_up_and_needs_force(self):
        home = self.tmp / "codex"
        quiet(pet_package.main, ["install", str(self.run_dir), "--codex-home", str(home)])
        installed = home / "pets" / "blob"
        self.assertTrue((installed / "pet.json").is_file())
        self.assertTrue((installed / "spritesheet.webp").is_file())
        with self.assertRaises(SystemExit):
            quiet(pet_package.main, ["install", str(self.run_dir), "--codex-home", str(home)])
        quiet(pet_package.main, ["install", str(self.run_dir), "--codex-home", str(home), "--force"])
        self.assertTrue(list(self.package.glob("backup-blob-*")))

    def test_make_refuses_an_id_that_leaves_the_package_folder(self):
        for pet_id in ("../escape", "nested/blob", ".."):
            with self.subTest(pet_id=pet_id), self.assertRaises(SystemExit):
                quiet(pet_package.main, ["make", str(self.run_dir), "--id", pet_id])
        self.assertFalse((self.run_dir / "escape").exists())
        self.assertFalse((self.package / "nested").exists())

    def test_make_refuses_a_package_folder_that_links_elsewhere(self):
        outside = self.tmp / "make-outside"
        outside.mkdir()
        (outside / "file").write_text("kept")
        (self.package / "linked").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(SystemExit):
            quiet(pet_package.main, ["make", str(self.run_dir), "--id", "linked"])
        self.assertEqual(sorted(p.name for p in outside.iterdir()), ["file"])

    def test_install_never_replaces_a_folder_outside_the_pets_folder(self):
        # The id a hostile pet.json would carry; the Codex home already holds a pet, so pets/ exists.
        home = self.tmp / "escape-home" / ".codex"
        (home / "pets" / "pepper").mkdir(parents=True)
        kept = home.parent / ".ssh"
        kept.mkdir()
        (kept / "id_ed25519").write_text("kept")
        # What make --id ../../.ssh would have written, so install reaches the replace step.
        planted = self.package / ".." / ".." / ".ssh"
        planted.mkdir()
        pc.write_json(planted / "pet.json", {"id": "../../.ssh"})
        with self.assertRaises(SystemExit):
            quiet(pet_package.main, ["install", str(self.run_dir), "--id", "../../.ssh", "--codex-home", str(home), "--force"])
        self.assertEqual(sorted(p.name for p in kept.iterdir()), ["id_ed25519"])

    def test_install_refuses_a_pet_folder_that_links_elsewhere(self):
        home = self.tmp / "link-home"
        outside = self.tmp / "outside"
        outside.mkdir()
        (outside / "file").write_text("kept")
        (home / "pets").mkdir(parents=True)
        (home / "pets" / "blob").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(SystemExit):
            quiet(pet_package.main, ["install", str(self.run_dir), "--codex-home", str(home), "--force"])
        self.assertEqual(sorted(p.name for p in outside.iterdir()), ["file"])
        # rmtree already refuses a link; the damage was the backup copying the linked folder first.
        self.assertFalse(any((b / "file").exists() for b in self.package.glob("backup-blob-*")))


if __name__ == "__main__":
    unittest.main()
