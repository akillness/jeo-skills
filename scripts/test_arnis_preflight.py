#!/usr/bin/env python3
"""Black-box regressions for Arnis offline preflight, bounding box parsing, and palette validation helper."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "arnis" / "scripts" / "preflight.py"


class ArnisPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="arnis-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "home"
        self.home.mkdir()
        self.marker = self.work / "executed"

        # Audit hook to enforce strict offline and no-credential-read contracts in the child
        (self.work / "sitecustomize.py").write_text(
            "import os, sys\n"
            "home = os.environ['HOME'] + os.sep\n"
            "def reject(reason):\n"
            "    with open(os.environ['PREFLIGHT_MARKER'], 'a') as stream:\n"
            "        stream.write(reason + '\\n')\n"
            "    raise RuntimeError(reason)\n"
            "def guard(event, args):\n"
            "    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.spawn'):\n"
            "        reject('forbidden operation: ' + event)\n"
            "    if event == 'open' and isinstance(args[0], (str, bytes, os.PathLike)):\n"
            "        target = os.fsdecode(args[0])\n"
            "        if 'SECRET' in target:\n"
            "            reject('forbidden secret read')\n"
            "sys.addaudithook(guard)\n",
            encoding="utf-8",
        )

    def invoke(self, *args, path=None, cwd=None):
        env = {
            "PATH": str(self.bin) if path is None else path,
            "HOME": str(self.home),
            "PYTHONPATH": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PREFLIGHT_MARKER": str(self.marker),
        }
        return subprocess.run(
            [sys.executable, str(HELPER), *args],
            cwd=cwd or self.work,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def test_help_flag_zero_exit(self):
        result = self.invoke("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Offline inventory, bounding-box validation", result.stdout)
        self.assertFalse(self.marker.exists())

    def test_json_output_mode(self):
        result = self.invoke("--json")
        self.assertIn(result.returncode, (0, 1))
        payload = json.loads(result.stdout)
        self.assertIn("status", payload)
        self.assertIn("cli", payload)
        self.assertFalse(self.marker.exists())

    def test_discovers_binary_in_path(self):
        fake_arnis = self.bin / "arnis"
        fake_arnis.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_arnis.chmod(0o755)

        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["cli"]["arnis"], str(fake_arnis))

    def test_validates_valid_bounding_box(self):
        bbox_arg = "126.97,37.56,127.00,37.58"
        result = self.invoke("--bbox", bbox_arg, "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertIsNotNone(payload["bbox_analysis"])
        fp = payload["bbox_analysis"]["estimated_minecraft_footprint"]
        self.assertGreater(fp["width_blocks"], 1000)
        self.assertGreater(fp["height_blocks"], 1000)
        self.assertGreater(fp["total_chunks"], 100)

    def test_rejects_invalid_bounding_box(self):
        # min_lon > max_lon
        bad_bbox = "127.00,37.56,126.97,37.58"
        result = self.invoke("--bbox", bad_bbox, "--json")
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "error")
        self.assertIn("must be less than", payload["message"])

    def test_validates_custom_palette_json(self):
        palette_file = self.work / "palette.json"
        palette_file.write_text(
            json.dumps({
                "name": "test_urban",
                "materials": {
                    "brick": "minecraft:bricks",
                    "road": "minecraft:gray_concrete",
                    "water": "minecraft:water"
                }
            }),
            encoding="utf-8"
        )
        result = self.invoke("--palette", str(palette_file), "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertIsNotNone(payload["palette_analysis"])
        self.assertEqual(payload["palette_analysis"]["total_material_mappings"], 3)

    def test_rejects_malformed_palette_json(self):
        bad_palette = self.work / "bad.json"
        bad_palette.write_text("{ broken json", encoding="utf-8")
        result = self.invoke("--palette", str(bad_palette), "--json")
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "error")
        self.assertIn("invalid JSON", payload["message"])

    def test_rejects_relative_or_sensitive_path(self):
        result_rel = self.invoke("--palette", "relative/palette.json")
        self.assertEqual(result_rel.returncode, 2)
        self.assertIn("path must be absolute", result_rel.stderr)

        bad_dir = self.work / ".git"
        bad_dir.mkdir()
        bad_file = bad_dir / "secret.json"
        bad_file.write_text("{}", encoding="utf-8")
        result_sens = self.invoke("--palette", str(bad_file))
        self.assertEqual(result_sens.returncode, 2)
        self.assertIn("sensitive path component", result_sens.stderr)


if __name__ == "__main__":
    unittest.main()
