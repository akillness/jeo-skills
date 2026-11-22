import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

SCRIPT = Path(__file__).resolve().parents[2] / "skills/scenario-game-assets/scripts/build_isometric_templates.py"
SPEC = importlib.util.spec_from_file_location("isometric_cli_templates", SCRIPT)
templates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(templates)


class IsometricCliTests(unittest.TestCase):
    def test_an_unknown_shape_is_refused(self):
        with self.assertRaisesRegex(ValueError, "octagon"):
            templates.geometry("octagon")

    def test_cli_writes_the_bundle_into_a_new_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bases" / "v1"
            r = subprocess.run([sys.executable, "-B", str(SCRIPT), str(out)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["tag"], "skill:scenario-game-assets:isometric")
            files = {entry["file"] for t in manifest["templates"] for entry in t["files"].values()}
            self.assertEqual(files | {"contact-sheet.png"}, {p.name for p in out.glob("*.png")})
            with Image.open(out / "contact-sheet.png") as sheet:
                self.assertEqual(sheet.size, (1440, 960))


if __name__ == "__main__":
    unittest.main()
