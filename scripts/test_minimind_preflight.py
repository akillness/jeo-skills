#!/usr/bin/env python3
"""Black-box regressions for MiniMind offline preflight and architecture parameter estimation helper."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "minimind" / "scripts" / "preflight.py"


class MiniMindPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="minimind-preflight-")
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
        self.assertIn("Offline inventory, hardware, and configuration preflight helper", result.stdout)
        self.assertFalse(self.marker.exists())

    def test_json_output_mode(self):
        result = self.invoke("--json")
        self.assertIn(result.returncode, (0, 1))
        payload = json.loads(result.stdout)
        self.assertIn("status", payload)
        self.assertIn("python_packages", payload)
        self.assertIn("hardware", payload)
        self.assertFalse(self.marker.exists())

    def test_validates_dense_lmconfig_file(self):
        cfg = self.work / "config_26m.json"
        cfg.write_text(
            json.dumps({
                "dim": 512,
                "n_layers": 8,
                "n_heads": 8,
                "vocab_size": 6400,
                "max_seq_len": 512,
                "use_moe": False
            }),
            encoding="utf-8"
        )
        result = self.invoke("--config", str(cfg), "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertIsNotNone(payload["config_analysis"])
        stats = payload["config_analysis"]["parameter_stats"]
        self.assertEqual(stats["architecture_type"], "Dense")
        self.assertGreater(stats["estimated_params_millions"], 20.0)
        self.assertLess(stats["estimated_params_millions"], 35.0)

    def test_validates_moe_lmconfig_file(self):
        cfg = self.work / "config_moe.json"
        cfg.write_text(
            json.dumps({
                "dim": 512,
                "n_layers": 8,
                "n_heads": 8,
                "vocab_size": 6400,
                "max_seq_len": 512,
                "use_moe": True,
                "n_routed_experts": 4,
                "num_experts_per_tok": 2
            }),
            encoding="utf-8"
        )
        result = self.invoke("--config", str(cfg), "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        stats = payload["config_analysis"]["parameter_stats"]
        self.assertEqual(stats["architecture_type"], "MoE")
        self.assertGreater(stats["estimated_params_millions"], 35.0)

    def test_rejects_malformed_config_json(self):
        bad_cfg = self.work / "broken.json"
        bad_cfg.write_text("{ broken json", encoding="utf-8")
        result = self.invoke("--config", str(bad_cfg), "--json")
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "error")
        self.assertIn("invalid JSON", payload["message"])

    def test_rejects_missing_required_fields(self):
        incomplete_cfg = self.work / "incomplete.json"
        incomplete_cfg.write_text(json.dumps({"dim": 512}), encoding="utf-8")
        result = self.invoke("--config", str(incomplete_cfg), "--json")
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "error")
        self.assertIn("missing required fields", payload["message"])

    def test_rejects_relative_or_sensitive_config_path(self):
        result_rel = self.invoke("--config", "relative/config.json")
        self.assertEqual(result_rel.returncode, 2)
        self.assertIn("path must be absolute", result_rel.stderr)

        bad_dir = self.work / ".git"
        bad_dir.mkdir()
        bad_file = bad_dir / "secret_config.json"
        bad_file.write_text("{}", encoding="utf-8")
        result_sens = self.invoke("--config", str(bad_file))
        self.assertEqual(result_sens.returncode, 2)
        self.assertIn("sensitive path component", result_sens.stderr)


if __name__ == "__main__":
    unittest.main()
