"""new_film.sh with stub node, npm, uv, python3 and curl: what it copies, installs, refuses and resumes."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import media

ENGINE = sorted(p.name for p in (media.SKILL / "assets" / "engine").iterdir())

STUB = r'''#!{python}
import json, os, sys
from pathlib import Path

tool, args = Path(sys.argv[0]).name, sys.argv[1:]
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps({{"tool": tool, "args": args, "cwd": os.getcwd()}}) + "\n")

def venv(path):
    py = Path(path) / "bin" / "python"
    py.parent.mkdir(parents=True, exist_ok=True)
    py.write_text("#!/bin/sh\n[ \"$1\" = -c ] && exit ${{FAKE_VENV_OLD:-0}}\nexit 0\n")
    py.chmod(0o755)

if tool == "node":
    print(os.environ.get("FAKE_NODE_MAJOR", "22"))
elif tool == "npm":
    sys.exit(int(os.environ.get("FAKE_NPM_EXIT", "0")))
elif tool == "uv" and args[0] == "venv":
    venv(args[2])
elif tool == "python3" and args[:2] == ["-m", "venv"]:
    venv(args[2])
elif tool == "python3" and args[0] == "-c":
    sys.exit(int(os.environ.get("FAKE_PY_OLD", "0")))
'''

FONTS_STUB = """#!/usr/bin/env bash
echo "get_fonts $1" >>"$FONTS_LOG"
mkdir -p "$1/fonts" && echo font >"$1/fonts/Archivo.ttf"
"""


class NewFilmTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        # a copy of the skill whose font step is a stub: the real one is test_get_fonts.py's subject
        self.skill = root / "skill"
        shutil.copytree(media.SKILL, self.skill, ignore=shutil.ignore_patterns("__pycache__"))
        (self.skill / "scripts" / "get_fonts.sh").write_text(FONTS_STUB)
        self.bin = root / "bin"
        self.bin.mkdir()
        for tool in ("node", "npm", "uv", "curl", "python3"):
            self.stub(tool)
        self.log = root / "calls.jsonl"
        self.fonts_log = root / "fonts.log"
        self.env = {
            "PATH": f"{self.bin}{os.pathsep}/usr/bin{os.pathsep}/bin",
            "HOME": str(root),
            "STUB_LOG": str(self.log),
            "FONTS_LOG": str(self.fonts_log),
        }
        self.film = root / "my-film"

    def stub(self, tool):
        path = self.bin / tool
        path.write_text(STUB.format(python=sys.executable))
        path.chmod(0o755)

    def scaffold(self, *args, folder=None):
        cmd = ["bash", str(self.skill / "scripts" / "new_film.sh"), str(folder or self.film), *args]
        return subprocess.run(cmd, env=self.env, capture_output=True, text=True, cwd=self.tmp.name)

    def calls(self, tool=None):
        if not self.log.exists():
            return []
        rows = [json.loads(line) for line in self.log.read_text().splitlines()]
        return [r for r in rows if tool is None or r["tool"] == tool]

    def assert_same(self, a, b):
        self.assertEqual(Path(a).read_bytes(), Path(b).read_bytes(), f"{a} differs from {b}")

    def test_a_new_folder(self):
        r = self.scaffold()
        self.assertEqual(r.returncode, 0, r.stderr)
        for name in ENGINE:
            self.assert_same(self.film / name, self.skill / "assets" / "engine" / name)
        self.assert_same(self.film / "spec.js", self.skill / "assets" / "examples" / "starter" / "spec.js")
        for name in ("package.json", "package-lock.json"):
            self.assert_same(self.film / name, self.skill / "assets" / "npm" / name)
        for d in ("audio/sfx", "art", "out"):
            self.assertTrue((self.film / d).is_dir(), d)
        npm = self.calls("npm")
        self.assertEqual([c["args"] for c in npm], [["ci", "--ignore-scripts", "--no-audit", "--no-fund"]])
        self.assertEqual(os.path.realpath(npm[0]["cwd"]), os.path.realpath(self.film))
        uv = [c["args"] for c in self.calls("uv")]
        self.assertEqual(uv[0], ["venv", "-q", f"{self.film}/.venv", "--python", "3.12"])
        self.assertEqual(uv[1], ["pip", "install", "-q", "--python", f"{self.film}/.venv/bin/python", "-r", f"{self.skill}/assets/requirements.txt"])
        self.assertEqual(self.fonts_log.read_text().split(), ["get_fonts", str(self.film)])
        self.assertIn("film folder ready", r.stdout)

    def test_another_example(self):
        r = self.scaffold("--example", "tour")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assert_same(self.film / "spec.js", self.skill / "assets" / "examples" / "tour" / "spec.js")
        self.assert_same(self.film / "logo.svg", self.skill / "assets" / "examples" / "tour" / "logo.svg")

    def test_an_unknown_example(self):
        for name in ("nope", "../engine", ""):
            with self.subTest(name=name):
                r = self.scaffold("--example", name)
                self.assertEqual(r.returncode, 1)
                self.assertIn("unknown example", r.stderr)
                self.assertIn("kaiju-postal starter tour", r.stderr)
                self.assertFalse(self.film.exists())

    def test_usage(self):
        r = subprocess.run(["bash", str(self.skill / "scripts" / "new_film.sh")], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("usage: new_film.sh <folder>", r.stderr)
        r = self.scaffold("--fast")
        self.assertEqual(r.returncode, 1)
        self.assertIn("usage:", r.stderr)

    def test_refuses_a_folder_in_use(self):
        self.film.mkdir()
        (self.film / "notes.txt").write_text("mine")
        r = self.scaffold()
        self.assertEqual(r.returncode, 1)
        self.assertIn("is not empty", r.stderr)
        self.assertIn("--force", r.stderr)
        self.assertEqual([p.name for p in self.film.iterdir()], ["notes.txt"])
        self.assertEqual(self.calls(), [])

    def test_force_refreshes_the_engine_and_keeps_the_film(self):
        self.assertEqual(self.scaffold().returncode, 0)
        (self.film / "blocks.js").write_text("// edited")
        (self.film / "spec.js").write_text("// my film")
        (self.film / "custom.js").write_text("// my block")
        pkg = json.loads((self.film / "package.json").read_text())
        pkg["name"] = "my-film"
        (self.film / "package.json").write_text(json.dumps(pkg))
        r = self.scaffold("--force")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assert_same(self.film / "blocks.js", self.skill / "assets" / "engine" / "blocks.js")
        self.assertEqual((self.film / "spec.js").read_text(), "// my film")
        self.assertEqual((self.film / "custom.js").read_text(), "// my block")
        self.assertEqual(json.loads((self.film / "package.json").read_text())["name"], "my-film")
        self.assertEqual(len(self.calls("npm")), 2)
        # the venv is kept, its packages reinstalled
        self.assertEqual([c["args"][0] for c in self.calls("uv")], ["venv", "pip", "pip"])

    def test_resumes_after_a_failed_install(self):
        self.env["FAKE_NPM_EXIT"] = "1"
        r = self.scaffold()
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.calls("uv"), [])
        self.assertIn("stopped while installing Playwright", r.stderr)
        self.assertIn(f"new_film.sh {self.film} --force", r.stderr)
        self.env["FAKE_NPM_EXIT"] = "0"
        r = self.scaffold("--force")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.film / ".venv" / "bin" / "python").exists())
        self.assertEqual(self.fonts_log.read_text().split(), ["get_fonts", str(self.film)])

    def test_an_incomplete_package_pair(self):
        self.film.mkdir()
        (self.film / "package.json").write_text("{}")
        r = self.scaffold("--force")
        self.assertEqual(r.returncode, 1)
        self.assertIn("Keep both", r.stderr)
        self.assertEqual([p.name for p in self.film.iterdir()], ["package.json"])

    def test_an_old_node(self):
        self.env["FAKE_NODE_MAJOR"] = "18"
        r = self.scaffold()
        self.assertEqual(r.returncode, 1)
        self.assertIn("Node 18 is too old", r.stderr)
        self.assertFalse(self.film.exists())

    def test_without_uv_python3_must_be_3_12(self):
        (self.bin / "uv").unlink()
        self.env["FAKE_PY_OLD"] = "1"
        r = self.scaffold()
        self.assertEqual(r.returncode, 1)
        self.assertIn("Python 3.12 or newer is needed", r.stderr)
        self.assertFalse(self.film.exists())
        self.env["FAKE_PY_OLD"] = "0"
        r = self.scaffold()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(["-m", "venv", f"{self.film}/.venv"], [c["args"] for c in self.calls("python3")])

    def test_an_old_venv_stops_the_scaffold(self):
        self.env["FAKE_VENV_OLD"] = "1"
        r = self.scaffold()
        self.assertEqual(r.returncode, 1)
        self.assertIn("older than 3.12", r.stderr)
        self.assertIn("--force", r.stderr)
        self.assertFalse(self.fonts_log.exists())


if __name__ == "__main__":
    unittest.main()
