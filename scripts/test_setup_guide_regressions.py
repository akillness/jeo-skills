#!/usr/bin/env python3
"""Offline black-box regressions for the setup guide and jeo-skill router."""

from __future__ import annotations

import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "setup-all-skills-prompt.md"
ROUTER = ROOT / ".agent-skills/jeo-skill/scripts/jeo-skill.py"
ROUTER_SCRIPTS = ROUTER.parent


def guide_block(heading: str, index: int = 0) -> str:
    """Extract a bash/sh fence from a named guide section at test time."""
    text = GUIDE.read_text(encoding="utf-8")
    section = text.split(heading, 1)[1]
    fences = re.findall(r"```(?:bash|sh)\n(.*?)\n```", section, flags=re.S)
    if index >= len(fences):
        raise AssertionError(f"missing fence {index} under {heading!r}")
    return fences[index]


def run_block(code: str, env: dict[str, str], cwd: Path) -> subprocess.CompletedProcess[str]:
    """Run one guide block in a bounded, isolated bash process."""
    return subprocess.run(
        ["/bin/bash", "-c", code],
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
        check=False,
    )


def tree_snapshot(root: Path) -> tuple[tuple[str, str, bytes | str], ...]:
    rows: list[tuple[str, str, bytes | str]] = []
    for path in sorted(root.rglob("*")):
        relative = str(path.relative_to(root))
        if path.is_symlink():
            rows.append((relative, "link", os.readlink(path)))
        elif path.is_dir():
            rows.append((relative, "dir", ""))
        else:
            rows.append((relative, "file", path.read_bytes()))
    return tuple(rows)


class SetupGuideRegressions(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-setup-guide-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name).resolve()
        self.home = self.work / "home"
        self.project = self.work / "project"
        self.home.mkdir()
        self.project.mkdir()
        source_router = Path(os.environ.get("SETUP_GUIDE_ROUTER_SOURCE", str(ROUTER)))
        self.router_scripts = source_router.parent

    def env(self, **overrides: str) -> dict[str, str]:
        """Build subprocess environments without inheriting provider secrets."""
        result = {
            "PATH": os.defpath,
            "LANG": "C.UTF-8",
            "TMPDIR": str(self.work),
            "HOME": str(self.home),
            "USER_HOME": str(self.home),
            "HTTPS_PROXY": "http://127.0.0.1:9",
            "https_proxy": "http://127.0.0.1:9",
            "HTTP_PROXY": "http://127.0.0.1:9",
            "http_proxy": "http://127.0.0.1:9",
            "NO_PROXY": "",
            "no_proxy": "",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        result.update(overrides)
        return result

    def run_router(self, router: Path, args: list[str], cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(router), *args],
            cwd=cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=60,
            check=False,
        )

    def install_router_copy(self) -> Path:
        scripts = self.home / ".agents/skills/jeo-skill/scripts"
        scripts.mkdir(parents=True)
        for source in self.router_scripts.glob("*.py"):
            shutil.copy2(source, scripts / source.name)
        return scripts / "jeo-skill.py"

    @staticmethod
    def catalog(names: list[str]) -> dict[str, object]:
        return {
            "version": "fixture",
            "skills": [
                {"name": name, "category": "fixture", "subcategory": "tests", "description": "fixture"}
                for name in names
            ],
            "categories": {"fixture": {}},
        }

    def test_router_catalog_resolution_ignores_home_legacy_catalog_but_uses_project_catalog(self) -> None:
        router = self.install_router_copy()
        legacy = self.home / ".agent-skills/skills.json"
        legacy.parent.mkdir(parents=True)
        legacy.write_text(json.dumps(self.catalog(["legacy-only"])), encoding="utf-8")
        cache = self.home / ".cache/jeo-skill/skills.json"
        cache.parent.mkdir(parents=True)
        cache_names = ["cache-one", "cache-two"]
        cache.write_text(json.dumps(self.catalog(cache_names)), encoding="utf-8")
        env = self.env(PATH="/usr/bin:/bin")

        result = self.run_router(router, ["list", "--json"], self.home, env)
        self.assertEqual(result.returncode, 0, result.stdout)
        names = [row["name"] for row in json.loads(result.stdout)]
        self.assertEqual(set(names), set(cache_names))
        self.assertNotIn("legacy-only", names)

        project_names = ["project-one", "project-two", "project-three"]
        project_catalog = self.project / ".agent-skills/skills.json"
        project_catalog.parent.mkdir(parents=True)
        project_catalog.write_text(json.dumps(self.catalog(project_names)), encoding="utf-8")
        result = self.run_router(router, ["list", "--json"], self.project, env)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual({row["name"] for row in json.loads(result.stdout)}, set(project_names))

    def test_step_one_uses_home_for_skills_root_and_deduplicates_local_bin(self) -> None:
        block = guide_block("## Step 1 — Detect OS, prerequisites, and coding agents")
        base_path = "/usr/bin:/bin:/usr/sbin:/sbin"
        result = run_block(block + '\nprintf \'PATH=%s\\n\' "$PATH"', self.env(PATH=base_path), self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn(f"home={self.home}", result.stdout)
        self.assertIn(f"skills_root={self.home / '.agents/skills'}", result.stdout)
        path_line = next(line for line in result.stdout.splitlines() if line.startswith("PATH="))
        self.assertTrue(path_line.startswith(f"PATH={self.home / '.local/bin'}:"), path_line)

        already_present = f"{self.home / '.local/bin'}:{base_path}"
        result = run_block(block + '\nprintf \'PATH=%s\\n\' "$PATH"', self.env(PATH=already_present), self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        path_line = next(line for line in result.stdout.splitlines() if line.startswith("PATH="))
        self.assertEqual(path_line.count(str(self.home / ".local/bin")), 1, path_line)

    def test_step_one_inside_aside_runtime_uses_login_home(self) -> None:
        runtime_home = self.work / "acct/.aside/runtime/home"
        runtime_home.mkdir(parents=True)
        block = guide_block("## Step 1 — Detect OS, prerequisites, and coding agents")
        result = run_block(
            block,
            self.env(HOME=str(runtime_home), USER_HOME=str(runtime_home), PATH="/usr/bin:/bin:/usr/sbin:/sbin"),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        login_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
        self.assertIn(f"home={login_home}", result.stdout)
        self.assertIn(f"skills_root={login_home / '.agents/skills'}", result.stdout)

    def knowledge_function(self) -> str:
        block = guide_block("### Knowledge pipeline hooks (llm-wiki + graphify, per-repo vault)")
        match = re.search(r"(?ms)^secure_kp_hooks\(\) \{.*?^\}\n", block)
        self.assertIsNotNone(match)
        return match.group(0)

    def knowledge_call(self, settings: Path, wrapper: Path, ingest: Path, before: str = "UserPromptSubmit", after: str = "Stop") -> subprocess.CompletedProcess[str]:
        code = self.knowledge_function() + f'\nsecure_kp_hooks "$SETTINGS" "$WRAPPER" {before} {after}\n'
        return run_block(
            code,
            self.env(
                SETTINGS=str(settings),
                WRAPPER=str(wrapper),
                KP_INGEST=str(ingest),
                USER_HOME=str(self.home),
            ),
            self.work,
        )

    def test_knowledge_pipeline_writer_preserves_wrappers_merges_hooks_idempotently_and_handles_gemini(self) -> None:
        ingest = self.home / ".agents/hooks/ingest-prompt.py"
        ingest.parent.mkdir(parents=True)
        ingest.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        ingest.chmod(0o700)

        customized = self.home / ".claude/hooks/llm-wiki-ingest.sh"
        customized.parent.mkdir(parents=True)
        customized_bytes = b"#!/bin/sh\ncustom wrapper\n"
        customized.write_bytes(customized_bytes)
        settings = self.home / ".claude/settings.json"
        result = self.knowledge_call(settings, customized, ingest)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(customized.read_bytes(), customized_bytes)
        self.assertIn("kept existing wrapper", result.stdout)

        settings.write_text(json.dumps({
            "env": {"value": "값-보존"},
            "unrelated": {"keep": True},
            "hooks": {
                "UserPromptSubmit": [{"hooks": [{"type": "command", "command": 'bash "$HOME/.claude/hooks/llm-wiki-ingest.sh"'}]}],
                "Stop": [{"hooks": [{"type": "command", "command": "existing-stop"}]}],
            },
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        result = self.knowledge_call(settings, customized, ingest)
        self.assertEqual(result.returncode, 0, result.stdout)
        data = json.loads(settings.read_text(encoding="utf-8"))
        user_commands = [hook["command"] for entry in data["hooks"]["UserPromptSubmit"] for hook in entry["hooks"]]
        stop_commands = [hook["command"] for entry in data["hooks"]["Stop"] for hook in entry["hooks"]]
        wrapper_command = f'bash "{customized}"'
        self.assertEqual(sum(command.replace("$HOME", str(self.home)).replace("~/", str(self.home) + "/").find(str(customized)) >= 0 for command in user_commands), 1)
        self.assertEqual(sum(command == wrapper_command for command in stop_commands), 1)
        self.assertIn("existing-stop", stop_commands)
        self.assertEqual(data["env"]["value"], "값-보존")
        self.assertTrue(data["unrelated"]["keep"])
        raw_settings = settings.read_bytes()
        self.assertIn("값-보존".encode(), raw_settings)
        self.assertNotIn(b"\\u", raw_settings)

        before_bytes = settings.read_bytes()
        before_stat = settings.stat()
        result = self.knowledge_call(settings, customized, ingest)
        self.assertEqual(result.returncode, 0, result.stdout)
        after_stat = settings.stat()
        self.assertEqual(settings.read_bytes(), before_bytes)
        self.assertEqual(after_stat.st_mtime_ns, before_stat.st_mtime_ns)
        self.assertEqual(after_stat.st_ino, before_stat.st_ino)

        missing_wrapper = self.home / ".gemini/hooks/llm-wiki-ingest.sh"
        gemini_settings = self.home / ".gemini/settings.json"
        result = self.knowledge_call(gemini_settings, missing_wrapper, ingest, "BeforeAgent", "AfterAgent")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(stat.S_IMODE(missing_wrapper.stat().st_mode), 0o700)
        self.assertIn(f'INGEST="{ingest}"', missing_wrapper.read_text(encoding="utf-8"))
        gemini = json.loads(gemini_settings.read_text(encoding="utf-8"))
        for event in ("BeforeAgent", "AfterAgent"):
            self.assertEqual(len(gemini["hooks"][event]), 1)
            entry = gemini["hooks"][event][0]
            self.assertEqual(entry["matcher"], "")
            self.assertEqual(entry["hooks"][0]["name"], "llm-wiki-ingest")

    def write_python_stub(self, path: Path, source: str) -> None:
        path.write_text(f"#!{sys.executable}\n" + source, encoding="utf-8")
        path.chmod(0o700)

    def test_aside_mcp_block_preserves_jsonc_and_uses_only_supported_opencode_registration(self) -> None:
        block = guide_block("### Aside browser skill and MCP wiring", 1)
        opencode = self.work / "bin/opencode"
        aside = self.work / "bin/aside"
        opencode.parent.mkdir()
        self.write_python_stub(opencode, r'''import json, os, sys
args = sys.argv[1:]
if args == ["--version"]:
    print(os.environ["OPENCODE_STUB_VERSION"])
else:
    with open(os.environ["OPENCODE_STUB_LOG"], "a", encoding="utf-8") as output:
        output.write(json.dumps(args) + "\n")
''')
        self.write_python_stub(aside, "raise SystemExit(0)\n")
        config = self.home / ".config/opencode/opencode.json"
        config.parent.mkdir(parents=True)
        config_bytes = b"// preserve this comment\n{\"servers\": {},}\n"
        config.write_bytes(config_bytes)
        log = self.work / "opencode.log"
        env = self.env(
            PATH=f"{self.work / 'bin'}:/usr/bin:/bin",
            USER_HOME=str(self.home),
            XDG_CONFIG_HOME=str(self.home / ".config"),
            OPENCODE_STUB_VERSION="opencode v2.0.32",
            OPENCODE_STUB_LOG=str(log),
        )
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(config.read_bytes(), config_bytes)
        calls = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(calls, [["mcp", "add", "aside", "--global", "--", str(aside), "mcp"]])

        config.write_text('{"mcp": {"servers": {"aside": {}}}}\n', encoding="utf-8")
        log.write_text("", encoding="utf-8")
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8"), "")

        config.write_text('{"servers": {}}\n', encoding="utf-8")
        log.write_text("", encoding="utf-8")
        env["OPENCODE_STUB_VERSION"] = "1.18.18"
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8"), "")
        self.assertIn("manual follow-up", result.stdout)

    def test_ouroboros_block_uses_isolated_mcp2_uvx_and_skips_existing_registration(self) -> None:
        block = guide_block("### Ouroboros (`ooo`) MCP server")
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        uvx_log = self.work / "uvx.log"
        uv_log = self.work / "uv.log"
        claude_log = self.work / "claude-add.log"
        self.write_python_stub(self.work / "bin/uvx", f'''import json, os, sys
with open({str(uvx_log)!r}, "a", encoding="utf-8") as output:
    output.write(json.dumps(sys.argv[1:]) + "\\n")
if sys.argv[1:] and sys.argv[-1] == "--version":
    print("ouroboros fixture")
''')
        self.write_python_stub(self.work / "bin/uv", f'''import json, sys
with open({str(uv_log)!r}, "a", encoding="utf-8") as output:
    output.write(json.dumps(sys.argv[1:]) + "\\n")
''')
        self.write_python_stub(self.work / "bin/claude", f'''import json, os, sys
args = sys.argv[1:]
if args[:2] == ["mcp", "get"]:
    raise SystemExit(0 if args[2] in os.environ.get("CLAUDE_STUB_EXISTING", "").split() else 1)
if args[:2] == ["mcp", "add"]:
    with open({str(claude_log)!r}, "a", encoding="utf-8") as output:
        output.write(json.dumps(args) + "\\n")
''')
        env = self.env(PATH=f"{bin_dir}:/usr/bin:/bin", CLAUDE_STUB_EXISTING="")
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        uv_calls = [json.loads(line) for line in uv_log.read_text(encoding="utf-8").splitlines()]
        self.assertIn(["tool", "install", "ouroboros-ai[all]"], uv_calls)
        uvx_calls = [json.loads(line) for line in uvx_log.read_text(encoding="utf-8").splitlines()]
        self.assertIn(["--isolated", "--from", "ouroboros-ai[mcp]", "ouroboros", "--version"], uvx_calls)
        add_calls = [json.loads(line) for line in claude_log.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(add_calls, [["mcp", "add", "ooo", "-s", "user", "--", str(self.work / "bin/uvx"), "--isolated", "--from", "ouroboros-ai[mcp]", "ouroboros", "mcp", "serve"]])

        claude_log.write_text("", encoding="utf-8")
        env["CLAUDE_STUB_EXISTING"] = "ouroboros"
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(claude_log.read_text(encoding="utf-8"), "")

    def test_step_four_d_reports_only_stale_opencode_shadowing_without_writes(self) -> None:
        block = guide_block("### Step 4D — OpenCode (all modes when detected)")
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        opencode = bin_dir / "opencode"
        self.write_python_stub(opencode, 'if __import__("sys").argv[1:] == ["--version"]: print("opencode v2.0.32")\n')
        shared = self.home / ".agents/skills"
        opencode_skills = self.home / ".config/opencode/skills"
        for name in ("jeo-skill", "same", "stale"):
            (shared / name).mkdir(parents=True)
            (shared / name / "SKILL.md").write_bytes(f"shared {name}\n".encode())
        opencode_skills.mkdir(parents=True)
        (opencode_skills / "same").mkdir()
        (opencode_skills / "same/SKILL.md").write_bytes((shared / "same/SKILL.md").read_bytes())
        (opencode_skills / "stale").mkdir()
        (opencode_skills / "stale/SKILL.md").write_bytes(b"different shadow\n")
        before = tree_snapshot(self.work)
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                USER_HOME=str(self.home),
                SKILLS_ROOT=str(shared),
                XDG_CONFIG_HOME=str(self.home / ".config"),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        stale = str(opencode_skills / "stale")
        self.assertEqual(result.stdout.count(stale), 1, result.stdout)
        self.assertNotIn(str(opencode_skills / "same"), result.stdout)
        self.assertEqual(tree_snapshot(self.work), before)


if __name__ == "__main__":
    unittest.main()
