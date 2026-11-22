"""Scaffolding preserves dependency locks, checks every download, and stops on installation failures."""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video"
SCAFFOLD = (SKILL / "scripts/scaffold.sh").read_text()
FONTS_REV = re.search(r"^FONTS_REV=([0-9a-f]{40})$", SCAFFOLD, re.M)[1]
FONT_BASE = f"https://raw.githubusercontent.com/google/fonts/{FONTS_REV}/ofl/"
# path under ofl/ -> (pinned sha256, destination under assets/fonts/)
FONTS = {
    path: (sha, dest)
    for path, sha, dest in re.findall(r"^(\S+) ([0-9a-f]{64}) (\S+)$", SCAFFOLD.split("<<'FONTS'")[1], re.M)
}


class ScaffoldTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.song = self.root / "song.wav"
        self.song.write_bytes(b"song")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        self.log = self.root / "calls.jsonl"
        self.env = {
            **os.environ,
            "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
            "SCAFFOLD_TEST_LOG": str(self.log),
            "SCAFFOLD_TEST_SUMS": json.dumps({FONT_BASE + path: sha for path, (sha, _) in FONTS.items()}),
        }
        # curl writes the URL it fetched as the file, and sha256sum reports the pinned sum for exactly
        # that content, so a file the server changed (SCAFFOLD_TEST_TAMPER) gets its real, wrong sum.
        for tool in ("npm", "uv", "curl", "uname", "sha256sum"):
            path = bin_dir / tool
            path.write_text(
                f"#!{sys.executable}\n"
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "tool = Path(sys.argv[0]).name\n"
                "with open(os.environ['SCAFFOLD_TEST_LOG'], 'a') as log:\n"
                "    log.write(json.dumps([tool, *sys.argv[1:]]) + '\\n')\n"
                "if tool == 'uname':\n"
                "    print(os.environ.get('SCAFFOLD_TEST_OS', 'Linux') if sys.argv[1] == '-s' else os.environ.get('SCAFFOLD_TEST_ARCH', 'x86_64'))\n"
                "elif tool == 'curl':\n"
                "    url = next(a for a in sys.argv[1:] if a.startswith('https://'))\n"
                "    tampered = os.environ.get('SCAFFOLD_TEST_TAMPER') and url.endswith(os.environ['SCAFFOLD_TEST_TAMPER'])\n"
                "    Path(sys.argv[sys.argv.index('-o') + 1]).write_text('tampered' if tampered else url)\n"
                "elif tool == 'sha256sum':\n"
                "    import hashlib\n"
                "    content = Path(sys.argv[1]).read_text()\n"
                "    sums = json.loads(os.environ['SCAFFOLD_TEST_SUMS'])\n"
                "    print(sums.get(content) or hashlib.sha256(content.encode()).hexdigest(), sys.argv[1])\n"
                "elif tool == 'npm':\n"
                "    sys.exit(int(os.environ.get('SCAFFOLD_TEST_NPM_EXIT', '0')))\n"
                "elif tool == 'uv' and sys.argv[1] == 'venv':\n"
                "    if Path('.venv').exists() and os.environ.get('UV_VENV_CLEAR') != '1':\n"
                "        sys.exit('error: A virtual environment already exists at `.venv`')\n"
                "    python = Path('.venv/bin/python')\n"
                "    python.parent.mkdir(parents=True, exist_ok=True)\n"
                "    python.write_text('#!/bin/sh\\nprintf \\'[\\\"python\\\"]\\\\n\\' >> \\\"$SCAFFOLD_TEST_LOG\\\"\\n')\n"
                "    python.chmod(0o755)\n"
            )
            path.chmod(0o755)

    def run_scaffold(self):
        return subprocess.run(
            ["bash", str(SKILL / "scripts/scaffold.sh"), str(self.song)],
            cwd=self.project,
            env=self.env,
            capture_output=True,
            text=True,
        )

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_new_project_uses_shipped_lock_and_repeat_run_preserves_customizations(self):
        result = self.run_scaffold()
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in ("package.json", "package-lock.json"):
            target = self.project / name
            self.assertEqual(target.read_bytes(), (SKILL / "assets/npm" / name).read_bytes())
            content = json.loads(target.read_text())
            content["name"] = "custom-project"
            target.write_text(json.dumps(content))
        result = self.run_scaffold()
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in ("package.json", "package-lock.json"):
            self.assertEqual(json.loads((self.project / name).read_text())["name"], "custom-project")
        npm_calls = [call for call in self.calls() if call[0] == "npm"]
        self.assertEqual(npm_calls, [["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]] * 2)

    def test_incomplete_dependency_pair_fails_before_copying_project_files(self):
        for name in ("package.json", "package-lock.json"):
            with self.subTest(name=name):
                target = self.project / name
                target.write_text("{}")
                result = self.run_scaffold()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Keep both", result.stderr)
                self.assertEqual(list(self.project.iterdir()), [target])
                target.unlink()

    def test_failed_npm_install_stops_before_python_setup(self):
        self.env["SCAFFOLD_TEST_NPM_EXIT"] = "1"
        result = self.run_scaffold()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[0] == "uv" for call in self.calls()))

    def test_fonts_come_from_the_pinned_commit_with_their_licenses(self):
        result = self.run_scaffold()
        self.assertEqual(result.returncode, 0, result.stderr)
        urls = [call[-3] for call in self.calls() if call[0] == "curl"]
        self.assertEqual(sorted(urls), sorted(FONT_BASE + path for path in FONTS))
        for path, (_, dest) in FONTS.items():
            self.assertEqual((self.project / "assets/fonts" / dest).read_text(), FONT_BASE + path)
        self.assertEqual(len(list((self.project / "assets/fonts/licenses").glob("*-OFL.txt"))), 8)
        self.assertEqual(list((self.project / "assets/fonts").rglob("*.part")), [])
        declared = re.findall(r"/assets/fonts/([^\"]+)", (SKILL / "assets/engine/index.html").read_text())
        self.assertEqual(sorted(set(declared)), sorted(d for _, d in FONTS.values() if not d.startswith("licenses/")))

    def test_checksum_mismatch_installs_nothing_and_stops(self):
        self.env["SCAFFOLD_TEST_TAMPER"] = "anton/Anton-Regular.ttf"
        result = self.run_scaffold()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Checksum mismatch for anton/Anton-Regular.ttf", result.stderr)
        fonts = self.project / "assets/fonts"
        self.assertFalse((fonts / "Anton.ttf").exists())
        self.assertEqual(list(fonts.rglob("*.part")), [])
        self.assertFalse(any(call[0] in ("npm", "uv") for call in self.calls()))

    def test_existing_fonts_are_kept_without_downloading(self):
        fonts = self.project / "assets/fonts"
        fonts.mkdir(parents=True)
        (fonts / "Anton.ttf").write_text("project copy")
        result = self.run_scaffold()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((fonts / "Anton.ttf").read_text(), "project copy")
        self.assertFalse(any(call[0] == "curl" and call[-3].endswith("Anton-Regular.ttf") for call in self.calls()))

    def test_python_installs_the_platform_lock_with_hashes_and_wheels_only(self):
        for system, arch, lock in (("Linux", "x86_64", "linux-x86_64"), ("Darwin", "arm64", "macos-arm64")):
            with self.subTest(system=system):
                self.env.update(SCAFFOLD_TEST_OS=system, SCAFFOLD_TEST_ARCH=arch)
                self.log.unlink(missing_ok=True)
                result = self.run_scaffold()
                self.assertEqual(result.returncode, 0, result.stderr)
                installs = [call for call in self.calls() if call[:3] == ["uv", "pip", "install"]]
                self.assertEqual(len(installs), 1)
                install = installs[0]
                self.assertIn("--require-hashes", install)
                self.assertEqual(install[install.index("--only-binary") + 1], ":all:")
                self.assertEqual(install[install.index("-r") + 1], str(SKILL / f"assets/python/{lock}.txt"))
                self.assertEqual(len([a for a in install if not a.startswith("-")]), 6, install)
                # Nothing but the lock installs into .venv (ensurepip would add unlocked pip).
                self.assertFalse(any(call[0] == "python" for call in self.calls()))

    def test_unlocked_platform_stops_before_touching_the_project(self):
        for system, arch in (("Linux", "aarch64"), ("Darwin", "x86_64"), ("MINGW64_NT", "x86_64")):
            with self.subTest(system=system, arch=arch):
                self.env.update(SCAFFOLD_TEST_OS=system, SCAFFOLD_TEST_ARCH=arch)
                result = self.run_scaffold()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("No locked Python environment", result.stderr)
                self.assertEqual(list(self.project.iterdir()), [])

if __name__ == "__main__":
    unittest.main()
