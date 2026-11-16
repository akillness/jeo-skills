#!/usr/bin/env python3
"""Black-box regressions for PMTiles offline preflight and binary header inspection helper."""

import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "pmtiles" / "scripts" / "preflight.py"


def build_synthetic_pmtiles_header(
    min_zoom=0, max_zoom=14, tile_type=1, tile_comp=2, internal_comp=2
) -> bytes:
    """Constructs a valid 127-byte PMTiles v3 header for testing."""
    magic = b"PMTiles"
    version = 3
    root_dir_offset = 127
    root_dir_length = 500
    json_meta_offset = 627
    json_meta_length = 200
    leaf_dirs_offset = 827
    leaf_dirs_length = 0
    tile_data_offset = 827
    tile_data_length = 100000
    addressed_tiles_count = 1000
    tile_entries_count = 850
    tile_contents_count = 800
    clustered = 1

    # Bounds: Seoul area (lon 126.9780, lat 37.5665)
    min_lon = int(126.76 * 10000000)
    min_lat = int(37.42 * 10000000)
    max_lon = int(127.18 * 10000000)
    max_lat = int(37.70 * 10000000)
    center_zoom = 10
    center_lon = int(126.978 * 10000000)
    center_lat = int(37.5665 * 10000000)

    header_tail = struct.pack(
        "<QQQQQQQQQQQBBBBBBiiiiBii",
        root_dir_offset,
        root_dir_length,
        json_meta_offset,
        json_meta_length,
        leaf_dirs_offset,
        leaf_dirs_length,
        tile_data_offset,
        tile_data_length,
        addressed_tiles_count,
        tile_entries_count,
        tile_contents_count,
        clustered,
        internal_comp,
        tile_comp,
        tile_type,
        min_zoom,
        max_zoom,
        min_lon,
        min_lat,
        max_lon,
        max_lat,
        center_zoom,
        center_lon,
        center_lat,
    )
    return magic + bytes([version]) + header_tail


class PMTilesPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="pmtiles-preflight-")
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
        self.assertIn("Offline inventory and binary header inspection for PMTiles", result.stdout)
        self.assertFalse(self.marker.exists())

    def test_json_output_mode(self):
        result = self.invoke("--json")
        self.assertIn(result.returncode, (0, 1))
        payload = json.loads(result.stdout)
        self.assertIn("status", payload)
        self.assertIn("cli", payload)
        self.assertIn("python_modules", payload)
        self.assertFalse(self.marker.exists())

    def test_discovers_binary_in_path(self):
        fake_pmtiles = self.bin / "pmtiles"
        fake_pmtiles.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_pmtiles.chmod(0o755)

        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["cli"]["pmtiles"], str(fake_pmtiles))

    def test_validates_synthetic_pmtiles_archive_header(self):
        archive_file = self.work / "test_map.pmtiles"
        archive_file.write_bytes(build_synthetic_pmtiles_header(min_zoom=0, max_zoom=14, tile_type=1))

        result = self.invoke("--archive", str(archive_file), "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertIsNotNone(payload["archive"])
        arch = payload["archive"]
        self.assertEqual(arch["spec_version"], 3)
        self.assertEqual(arch["tile_type"], "MVT")
        self.assertEqual(arch["zoom"]["min"], 0)
        self.assertEqual(arch["zoom"]["max"], 14)
        self.assertAlmostEqual(arch["bounds"]["min_lon"], 126.76, places=2)

    def test_rejects_corrupted_magic_bytes(self):
        bad_file = self.work / "corrupt.pmtiles"
        header = build_synthetic_pmtiles_header()
        bad_header = b"BADTILE" + header[7:]
        bad_file.write_bytes(bad_header)

        result = self.invoke("--archive", str(bad_file), "--json")
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "error")
        self.assertIn("magic bytes", payload["message"])

    def test_rejects_relative_or_sensitive_archive_path(self):
        result_rel = self.invoke("--archive", "relative/map.pmtiles")
        self.assertEqual(result_rel.returncode, 2)
        self.assertIn("path must be absolute", result_rel.stderr)

        bad_dir = self.work / ".git"
        bad_dir.mkdir()
        bad_path = bad_dir / "secret.pmtiles"
        bad_path.write_bytes(b"")
        result_sens = self.invoke("--archive", str(bad_path))
        self.assertEqual(result_sens.returncode, 2)
        self.assertIn("sensitive path component", result_sens.stderr)


if __name__ == "__main__":
    unittest.main()
