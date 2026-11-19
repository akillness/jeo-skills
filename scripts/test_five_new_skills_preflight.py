#!/usr/bin/env python3
"""Black-box offline regressions for affectui, open-intelligent-ui, solid-glass, indra, and new-term-radar preflight helpers."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / ".agent-skills"


class FiveNewSkillsPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="five-new-skills-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "home"
        self.home.mkdir()
        self.marker = self.work / "executed"

        (self.work / "sitecustomize.py").write_text(
            f"""import sys
from pathlib import Path

MARKER = Path({repr(str(self.marker))})
HOME = Path({repr(str(self.home))}).resolve()

def hook(event, args):
    if event in ("socket.connect", "socket.getaddrinfo", "urllib.Request"):
        raise RuntimeError(f"forbidden network call: {{event}}")
    if event in ("subprocess.Popen", "os.system", "os.posix_spawn", "os.exec"):
        MARKER.write_text(event, encoding="utf-8")
        raise RuntimeError(f"forbidden subprocess call: {{event}}")
    if event == "open" and args and args[0]:
        target = str(args[0])
        for sens in (".ssh", ".aws", ".netrc", ".npmrc", ".pypirc"):
            if sens in target:
                raise RuntimeError(f"forbidden sensitive path read: {{target}}")

sys.addaudithook(hook)
""",
            encoding="utf-8",
        )

    def invoke(self, skill: str, *args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        helper = SKILLS_ROOT / skill / "scripts" / "preflight.py"
        env = {
            "PATH": f"{self.bin}{os.pathsep}/usr/bin{os.pathsep}/bin",
            "HOME": str(self.home),
            "PYTHONPATH": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            [sys.executable, str(helper), *args],
            cwd=str(self.work),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )

    def _make_exec(self, name: str) -> Path:
        p = self.bin / name
        p.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        p.chmod(0o755)
        return p

    def test_all_helpers_support_help(self) -> None:
        for skill in ("affectui", "open-intelligent-ui", "solid-glass", "indra", "new-term-radar"):
            res = self.invoke(skill, "--help")
            self.assertEqual(res.returncode, 0, msg=f"{skill} --help failed: {res.stderr}")
            self.assertFalse(self.marker.exists())

    def test_affectui_detects_react19_and_registry(self) -> None:
        self._make_exec("node")
        self._make_exec("npx")
        app = self.work / "react_app"
        (app / "components" / "ui").mkdir(parents=True)
        (app / "components" / "ui" / "tool-call-card-clean.tsx").write_text("export {};\n", encoding="utf-8")
        (app / "package.json").write_text(json.dumps({"dependencies": {"react": "^19.0.0"}}), encoding="utf-8")
        (app / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"paths": {"@/*": ["./*"]}}}), encoding="utf-8")
        (app / "components.json").write_text(
            json.dumps({"registries": {"@affectui": "https://www.affectui.com/r/{name}.json"}}),
            encoding="utf-8",
        )
        res = self.invoke("affectui", "--workspace", str(app), "--json")
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "ready")
        self.assertTrue(data["workspace"]["react_19_declared"])
        self.assertTrue(data["workspace"]["has_affectui_registry"])
        self.assertIn("tool-call-card-clean.tsx", data["workspace"]["ui_component_files"])

    def test_open_intelligent_ui_masks_env_values(self) -> None:
        self._make_exec("node")
        self._make_exec("npm")
        app = self.work / "oiu_app"
        (app / "src" / "generated").mkdir(parents=True)
        (app / "src" / "lib").mkdir(parents=True)
        (app / "src" / "lib" / "library.ts").write_text("export {};\n", encoding="utf-8")
        (app / "src" / "generated" / "spec.json").write_text("{}", encoding="utf-8")
        (app / "src" / "generated" / "system-prompt.txt").write_text("prompt", encoding="utf-8")
        (app / "package.json").write_text(
            json.dumps({"engines": {"node": ">=24"}, "dependencies": {"@openuidev/intelligent-ui-library": "^0.0.1"}}),
            encoding="utf-8",
        )
        secret_val = "sk-super-secret-value-never-print"
        (app / ".env").write_text(f"THESYS_API_KEY={secret_val}\nMODEL_PROVIDER=ollama\n", encoding="utf-8")
        res = self.invoke("open-intelligent-ui", "--workspace", str(app), "--json")
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        self.assertNotIn(secret_val, res.stdout)
        data = json.loads(res.stdout)
        self.assertTrue(data["workspace"]["env_keys_set"]["THESYS_API_KEY"])
        self.assertTrue(data["workspace"]["env_keys_set"]["MODEL_PROVIDER"])

    def test_solid_glass_checks_css_import_order(self) -> None:
        self._make_exec("node")
        self._make_exec("npx")
        app = self.work / "sg_app"
        (app / "src").mkdir(parents=True)
        (app / "package.json").write_text(
            json.dumps({"dependencies": {"react": "^19.2.0", "tailwindcss": "^4.0.0", "@base-ui/react": "^1.8.0"}}),
            encoding="utf-8",
        )
        (app / "components.json").write_text("{}", encoding="utf-8")
        (app / "src" / "index.css").write_text(
            '@import "tailwindcss";\n@import "shadcn/tailwind.css";\n@import "./solid-glass.css";\n',
            encoding="utf-8",
        )
        res = self.invoke("solid-glass", "--workspace", str(app), "--json")
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "ready")
        self.assertTrue(data["workspace"]["tailwind_v4_declared"])
        self.assertTrue(data["workspace"]["css_checks"][0]["solid_glass_after_tailwind"])

    def test_indra_validates_input_and_model_dir(self) -> None:
        self._make_exec("indra-ocr")
        pdf = self.work / "sample.pdf"
        pdf.write_bytes(b"%PDF-1.4\n")
        models = self.work / "models"
        models.mkdir()
        (models / "rec.onnx").write_bytes(b"onnx")
        res = self.invoke("indra", "--input", str(pdf), "--model-dir", str(models), "--json")
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["model_dir"]["onnx_count"], 1)
        self.assertEqual(data["input"]["extension"], ".pdf")

        bad = self.invoke("indra", "--input", "relative/sample.pdf", "--json")
        self.assertEqual(bad.returncode, 2)

    def test_new_term_radar_checks_config_and_masks_keys(self) -> None:
        self._make_exec("uvx")
        cfg = self.work / "config.json"
        cfg.write_text(
            json.dumps({"lang": "en", "sitemaps": [{"index": "https://example.com/sitemap.xml"}], "ai_answers": {"enabled": False}}),
            encoding="utf-8",
        )
        state = self.work / "state"
        secret_key = "aisa-secret-never-echo"
        res = self.invoke(
            "new-term-radar",
            "--config",
            str(cfg),
            "--state",
            str(state),
            "--json",
            extra_env={"AISA_API_KEY": secret_key},
        )
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        self.assertNotIn(secret_key, res.stdout)
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "ready")
        self.assertTrue(data["env_keys_set"]["AISA_API_KEY"])
        self.assertFalse(data["env_keys_set"]["GOANYAPI_API_KEY"])
        self.assertEqual(data["config"]["sitemap_count"], 1)

    def test_all_helpers_reject_sensitive_or_relative_paths(self) -> None:
        cases = [
            ("affectui", "--workspace"),
            ("open-intelligent-ui", "--workspace"),
            ("solid-glass", "--workspace"),
            ("indra", "--input"),
            ("new-term-radar", "--config"),
        ]
        for skill, flag in cases:
            r1 = self.invoke(skill, flag, "relative/path")
            self.assertEqual(r1.returncode, 2, msg=f"{skill} accepted relative path")
            r2 = self.invoke(skill, flag, "/tmp/.ssh/id_rsa")
            self.assertEqual(r2.returncode, 2, msg=f"{skill} accepted sensitive path")


if __name__ == "__main__":
    unittest.main()
