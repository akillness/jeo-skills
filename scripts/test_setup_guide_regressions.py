#!/usr/bin/env python3
"""Offline black-box regressions for the setup guide and jeo-skill router."""

from __future__ import annotations

import json
import os
import pty
from pathlib import Path
import pwd
import re
import shutil
import shlex
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


    def test_jev_block_selects_detected_hosts_with_isolated_profiles_and_respects_opt_out(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        setup.chmod(0o700)
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        detected = ("claude", "codex", "opencode", "cursor", "agy", "kimi", "pi", "crush", "jeo", "gjc", "jeopi", "omp", "antigravity", "aside")
        for name in detected:
            self.write_python_stub(bin_dir / name, "raise SystemExit(0)\n")
        log = self.work / "jev-setup.log"
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        mapping.write_text(json.dumps({
            "claude": {"profile": "mapped-claude"},
        }), encoding="utf-8")
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEO_SKILLS_ASIDE_ACCOUNT="0",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        calls = log.read_text(encoding="utf-8").splitlines()
        expected = {
            "claude": ("mapped-claude", "claude-code"),
            "codex": ("codex", "codex"),
            "opencode": ("opencode", "opencode"),
            "cursor": ("cursor", "cursor"),
            "agy": ("agy", "agy"),
            "kimi": ("kimi", "kimi"),
            "pi": ("pi", "pi"),
            "crush": ("crush", "crush"),
            "jeo": ("jeo", "jeo"),
            "gjc": ("gjc", "gjc"),
            "jeopi": ("jeopi", "jeopi"),
            "omp": ("omp", "omp"),
            "antigravity": ("antigravity", "antigravity"),
            "aside": ("aside-u0", "aside"),
        }
        self.assertEqual(len(calls), len(expected), result.stdout)
        for profile, agent in expected.values():
            self.assertIn(f"--profile {profile} --agent {agent} --mode api", calls)
        self.assertEqual({call.split('--agent ', 1)[1].split(' --mode ', 1)[0] for call in calls}, {agent for _, agent in expected.values()})

        log.unlink()
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEO_SKILLS_AGENT="codex",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile codex --agent codex --mode api"])

        log.unlink()
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEO_SKILLS_AGENT="claude",
                JEV_AGENT="codex",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile codex --agent codex --mode api"])

        log.unlink()
        result = run_block(block, self.env(PATH=f"{bin_dir}:/usr/bin:/bin", JEO_SKILLS_JEV="skip", JEV_SETUP_LOG=str(log)), self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(log.exists(), "opt-out must not invoke setup")


    def test_jev_block_does_not_auto_select_grok_without_explicit_request(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        bin_dir = self.work / "grok-only-bin"
        bin_dir.mkdir()
        self.write_python_stub(bin_dir / "grok", "raise SystemExit(0)\n")
        fetch_log = self.work / "fetch.log"
        curl = bin_dir / "curl"
        curl.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$JEV_FETCH_LOG\"\n"
            "exit 91\n",
            encoding="utf-8",
        )
        curl.chmod(0o700)
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEV_FETCH_LOG=str(fetch_log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(fetch_log.exists(), "Grok alone must not trigger remote Jev setup")
        self.assertFalse((self.home / ".agents/jev/agents.json").exists())
        self.assertRegex(result.stdout.lower(), r"detect|host|skip|warning")
    def test_jev_block_skips_ambiguous_custom_profile_and_warns_without_detected_host(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        setup.chmod(0o700)
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        for name in ("claude", "codex"):
            self.write_python_stub(bin_dir / name, "raise SystemExit(0)\n")
        log = self.work / "jev-setup.log"
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEO_SKILLS_JEV_PROFILE="shared-profile",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(log.exists(), "one custom profile must not be shared by multiple detected hosts")
        self.assertRegex(result.stdout.lower(), r"multiple|ambiguous|profile|skip")

        (bin_dir / "claude").unlink()
        (bin_dir / "codex").unlink()
        log.unlink(missing_ok=True)
        result = run_block(
            block,
            self.env(PATH=f"{bin_dir}:/usr/bin:/bin", JEO_SKILLS_JEV="api", JEV_SETUP_LOG=str(log)),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(log.exists(), "no detected host must not invoke setup")
        self.assertRegex(result.stdout.lower(), r"detect|host|skip|warning")

        (bin_dir / "claude").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        (bin_dir / "claude").chmod(0o700)
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEV_PROFILE="legacy-profile",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile legacy-profile --agent claude-code --mode api"])

        log.unlink()
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEO_SKILLS_JEV_PROFILE="preferred-profile",
                JEV_PROFILE="legacy-profile",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile preferred-profile --agent claude-code --mode api"])

    def test_jev_block_supports_primary_and_supported_hosts_with_canonical_mappings(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        setup.chmod(0o700)
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        hosts = ("jeo", "gjc", "jeopi", "omp", "agy", "crush", "antigravity", "opencode", "kimi")
        for name in hosts:
            self.write_python_stub(bin_dir / name, "raise SystemExit(0)\n")
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        mapped = {name: {"profile": f"mapped-{name}"} for name in hosts}
        mapping.write_text(json.dumps(mapped), encoding="utf-8")
        log = self.work / "jev-setup.log"
        env = self.env(PATH=f"{bin_dir}:/usr/bin:/bin", JEO_SKILLS_JEV="api", JEV_SETUP_LOG=str(log))

        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        calls = log.read_text(encoding="utf-8").splitlines()
        self.assertEqual(
            {tuple(shlex.split(call)[1::2]) for call in calls},
            {(f"mapped-{host}", host, "api") for host in hosts},
        )
        self.assertEqual(len(calls), len(hosts))

        aliases = {
            "claude-code": ("claude", "claude-code"),
            "jeo-code": ("jeo", "jeo"),
            "oh-my-pi": ("omp", "omp"),
            "kimi-code-cli": ("kimi", "kimi"),
            "antigravity-cli": ("agy", "agy"),
        }
        mapping.write_text(json.dumps({canonical: {"profile": f"alias-{canonical}"}
                                       for canonical, _destination in aliases.values()}), encoding="utf-8")
        for alias, (canonical, destination) in aliases.items():
            with self.subTest(alias=alias):
                log.unlink(missing_ok=True)
                result = run_block(block, {**env, "JEV_AGENT": alias}, self.work)
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual(
                    log.read_text(encoding="utf-8").splitlines(),
                    [f"--profile alias-{canonical} --agent {destination} --mode api"],
                )
        self.write_python_stub(bin_dir / "grok", "raise SystemExit(0)\n")
        mapping.write_text(json.dumps({"grok": {"profile": "mapped-grok"}}), encoding="utf-8")
        log.unlink(missing_ok=True)
        result = run_block(block, {**env, "JEV_AGENT": "grok"}, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile mapped-grok --agent grok --mode api"])

    def test_jev_block_rejects_mapping_symlink_and_nonregular_path_before_side_effects(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        bin_dir = self.work / "mapping-guard-bin"
        bin_dir.mkdir()
        self.write_python_stub(bin_dir / "claude", "raise SystemExit(0)\n")
        fetch_log = self.work / "fetch.log"
        curl = bin_dir / "curl"
        curl.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$JEV_FETCH_LOG\"\n"
            "exit 91\n",
            encoding="utf-8",
        )
        curl.chmod(0o700)
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        target = self.work / "outside-agents.json"
        target_bytes = b'{"claude":{"profile":"outside"}}\n'
        target.write_bytes(target_bytes)
        env = self.env(
            PATH=f"{bin_dir}:/usr/bin:/bin",
            JEO_SKILLS_JEV="api",
            JEV_FETCH_LOG=str(fetch_log),
        )
        mapping.symlink_to(target)
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(mapping.is_symlink())
        self.assertEqual(target.read_bytes(), target_bytes)
        self.assertFalse(fetch_log.exists(), "symlink mapping must be rejected before fetch/setup")
        self.assertFalse((self.home / ".agents/jev/jev-plugin.mjs").exists())

        mapping.unlink()
        mapping.mkdir()
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(mapping.is_dir())
        self.assertEqual(target.read_bytes(), target_bytes)
        self.assertFalse(fetch_log.exists(), "non-regular mapping must be rejected before fetch/setup")
        self.assertFalse((self.home / ".agents/jev/jev-plugin.mjs").exists())

    def test_jev_block_binds_real_controller_profiles_after_successful_setup(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        bin_dir = self.work / "real-jev-bin"
        bin_dir.mkdir()
        node = shutil.which("node")
        if node is None:
            self.skipTest("Node.js is required for the real controller binding smoke")
        (bin_dir / "node").symlink_to(node)
        hosts = ("codex", "claude", "jeo", "gjc", "jeopi", "pi", "omp", "agy", "kimi", "opencode", "cursor", "crush", "antigravity")
        for name in hosts:
            self.write_python_stub(bin_dir / name, "raise SystemExit(0)\n")
        self.write_python_stub(bin_dir / "npx", '''import os
from pathlib import Path
home = Path(os.environ["HOME"])
for relative in (
    ".claude/skills", ".codex/skills", ".agents/skills", ".gemini/config/skills",
    ".gemini/antigravity-cli/skills", ".kimi/skills", ".grok/skills", ".opencode/skills",
    ".omp/skills", ".pi/agent/skills", ".config/crush/skills", ".config/jeo/skills",
    ".gjc/agent/skills", ".config/omp/skills", ".config/antigravity/skills",
):
    destination = home / relative / "jev-control-plane"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "SKILL.md").write_text("fixture\\n", encoding="utf-8")
raise SystemExit(0)
''')
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        preserved = {
            "codex": {"profile": "codex-existing", "native": "native-codex", "scope": "project"},
            "jeopi": {"profile": "jeopi-existing", "native": "native-jeopi", "scope": "global"},
            "other": {"profile": "other-existing", "native": "native-other", "scope": "project"},
        }
        mapping.write_text(json.dumps(preserved), encoding="utf-8")
        env = self.env(
            PATH=f"{bin_dir}:{os.defpath}",
            JEO_SKILLS_JEV="systemone",
            JEV_SYSTEMONE_ENDPOINT="http://127.0.0.1:1/v1/systemone",
            JEV_SYSTEMONE_MODEL="fixture-systemone-model",
        )
        result = run_block(block, env, ROOT)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue((self.home / ".agents/jev/jev-plugin.mjs").is_file(), result.stdout)

        after = json.loads(mapping.read_text(encoding="utf-8"))
        self.assertEqual(after["other"], preserved["other"])
        expected_profiles = {
            host: ("codex-existing" if host == "codex" else "jeopi-existing" if host == "jeopi" else host)
            for host in hosts
        }
        for host, profile in expected_profiles.items():
            self.assertIn(host, after, result.stdout)
            self.assertEqual(after[host]["profile"], profile)
            if host in preserved:
                self.assertEqual(after[host]["native"], preserved[host]["native"])
                self.assertEqual(after[host]["scope"], preserved[host]["scope"])
            status = subprocess.run(
                [str(node), str(self.home / ".agents/jev/jev-plugin.mjs"), "status", "--agent", host],
                cwd=ROOT,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=30,
                check=False,
            )
            self.assertEqual(status.returncode, 0, status.stdout)
            report = json.loads(status.stdout)
            self.assertEqual(report["agent"], host)
            self.assertEqual(report["profile"], profile)
            self.assertTrue(report["profilePresent"])
        self.assertNotIn("JEV_PROFILE", env)
        self.assertNotIn("--profile", status.args)


    def test_jev_block_uses_canonical_aside_mapping_key_for_selected_account(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        setup.chmod(0o700)
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        mapping.write_text(json.dumps({"aside": {"profile": "aside-private"}}), encoding="utf-8")
        log = self.work / "jev-setup.log"
        result = run_block(
            block,
            self.env(
                PATH="/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEV_AGENT="aside",
                JEO_SKILLS_ASIDE_ACCOUNT="0",
                JEV_SETUP_LOG=str(log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["--profile aside-private --agent aside --mode api"])

    def test_jev_block_rejects_unselected_profile_collision_but_allows_independent_override(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        setup.chmod(0o700)
        bin_dir = self.work / "collision-bin"
        bin_dir.mkdir()
        self.write_python_stub(bin_dir / "agy", "raise SystemExit(0)\n")
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        original = {"kimi": {"profile": "agy", "native": "native-kimi", "scope": "global"}}
        mapping.write_text(json.dumps(original), encoding="utf-8")
        setup_log = self.work / "collision-setup.log"
        curl_log = self.work / "collision-fetch.log"
        env = self.env(
            PATH=f"{bin_dir}:/usr/bin:/bin",
            JEO_SKILLS_JEV="api",
            JEV_AGENT="agy",
            JEV_SETUP_LOG=str(setup_log),
            JEV_FETCH_LOG=str(curl_log),
        )
        shared = {
            "agy": {"profile": "shared", "native": "native-agy", "scope": "global"},
            "kimi": {"profile": "shared", "native": "native-kimi", "scope": "global"},
        }
        mapping.write_text(json.dumps(shared), encoding="utf-8")
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(setup_log.exists(), result.stdout)
        self.assertFalse(curl_log.exists(), result.stdout)
        self.assertEqual(json.loads(mapping.read_text(encoding="utf-8")), shared)
        mapping.write_text(json.dumps(original), encoding="utf-8")
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(setup_log.exists(), result.stdout)
        self.assertFalse(curl_log.exists(), result.stdout)
        self.assertEqual(json.loads(mapping.read_text(encoding="utf-8")), original)

        setup_log.unlink(missing_ok=True)
        result = run_block(
            block,
            {**env, "JEO_SKILLS_JEV_PROFILE": "agy-independent"},
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            setup_log.read_text(encoding="utf-8").splitlines(),
            ["--profile agy-independent --agent agy --mode api"],
        )
        after = json.loads(mapping.read_text(encoding="utf-8"))
        self.assertEqual(after["kimi"], original["kimi"])
        self.assertEqual(after.get("agy"), None)

    def test_jev_block_preserves_tty_stdin_for_setup_child(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        setup = self.work / "jev/jev-setup.sh"
        setup.parent.mkdir(parents=True)
        tty_log = self.work / "jev-tty.log"
        argv_log = self.work / "jev-setup.log"
        setup.write_text(
            "#!/bin/sh\n"
            "if [ -t 0 ]; then printf 'tty\\n' > \"$JEV_TTY_LOG\"; else printf 'notty\\n' > \"$JEV_TTY_LOG\"; fi\n"
            "printf '%s\\n' \"$*\" > \"$JEV_SETUP_LOG\"\n",
            encoding="utf-8",
        )
        setup.chmod(0o700)
        env = self.env(
            PATH="/usr/bin:/bin",
            JEO_SKILLS_JEV="api",
            JEV_AGENT="jeopi",
            JEO_SKILLS_JEV_PROFILE="pty-profile",
            JEV_TTY_LOG=str(tty_log),
            JEV_SETUP_LOG=str(argv_log),
        )
        master, slave = pty.openpty()
        process = subprocess.Popen(
            ["/bin/bash", "-c", block],
            cwd=self.work,
            env=env,
            stdin=slave,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        os.close(slave)
        try:
            output, _ = process.communicate(timeout=60)
        finally:
            os.close(master)
        self.assertEqual(process.returncode, 0, output)
        self.assertEqual(tty_log.read_text(encoding="utf-8").strip(), "tty")
        self.assertEqual(argv_log.read_text(encoding="utf-8").splitlines(), ["--profile pty-profile --agent jeopi --mode api"])

    def test_jev_block_rejects_invalid_or_shared_mappings_before_setup_and_fetch(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        for name in ("jeo", "gjc"):
            self.write_python_stub(bin_dir / name, "raise SystemExit(0)\n")
        curl_log = self.work / "curl.log"
        curl = bin_dir / "curl"
        curl.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_FETCH_LOG\"\nexit 91\n", encoding="utf-8")
        curl.chmod(0o700)
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        setup_log = self.work / "jev-setup.log"
        cases = (
            ("malformed-json", "{not-json"),
            ("non-object", "[]"),
            ("non-object-entry", json.dumps({"jeo": "profile", "gjc": {"profile": "gjc"}})),
            ("invalid-profile", json.dumps({"jeo": {"profile": "BAD"}, "gjc": {"profile": "gjc"}})),
            ("shared-profile", json.dumps({"jeo": {"profile": "shared"}, "gjc": {"profile": "shared"}})),
        )
        for name, contents in cases:
            with self.subTest(case=name):
                mapping.write_text(contents, encoding="utf-8")
                setup_log.unlink(missing_ok=True)
                curl_log.unlink(missing_ok=True)
                result = run_block(
                    block,
                    self.env(
                        PATH=f"{bin_dir}:/usr/bin:/bin",
                        JEO_SKILLS_JEV="api",
                        JEV_SETUP_LOG=str(setup_log),
                        JEV_FETCH_LOG=str(curl_log),
                    ),
                    self.work,
                )
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertFalse(setup_log.exists(), result.stdout)
                self.assertFalse(curl_log.exists(), result.stdout)

        mapping.write_text(json.dumps({"jeo": {"profile": "jeo"}}), encoding="utf-8")
        result = run_block(
            block,
            self.env(
                PATH=f"{bin_dir}:/usr/bin:/bin",
                JEO_SKILLS_JEV="api",
                JEV_AGENT="unsupported-host",
                JEV_SETUP_LOG=str(setup_log),
                JEV_FETCH_LOG=str(curl_log),
            ),
            self.work,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(setup_log.exists(), result.stdout)
        self.assertFalse(curl_log.exists(), result.stdout)
        self.assertRegex(result.stdout.lower(), r"unknown|supported|skip|warning")
        for retired in ("gemini", "gemini-cli"):
            with self.subTest(retired=retired):
                setup_log.unlink(missing_ok=True)
                curl_log.unlink(missing_ok=True)
                retired_result = run_block(
                    block,
                    self.env(
                        PATH=f"{bin_dir}:/usr/bin:/bin",
                        JEO_SKILLS_JEV="api",
                        JEV_AGENT=retired,
                        JEV_SETUP_LOG=str(setup_log),
                        JEV_FETCH_LOG=str(curl_log),
                    ),
                    self.work,
                )
                self.assertEqual(retired_result.returncode, 0, retired_result.stdout)
                self.assertFalse(setup_log.exists(), retired_result.stdout)
                self.assertFalse(curl_log.exists(), retired_result.stdout)
                self.assertRegex(retired_result.stdout.lower(), r"unknown|supported|skip|warning")

        for account in (None, "bad/account"):
            with self.subTest(account=account):
                setup_log.unlink(missing_ok=True)
                curl_log.unlink(missing_ok=True)
                aside_env = self.env(
                    PATH=f"{bin_dir}:/usr/bin:/bin",
                    JEO_SKILLS_JEV="api",
                    JEV_AGENT="aside",
                    JEV_SETUP_LOG=str(setup_log),
                    JEV_FETCH_LOG=str(curl_log),
                )
                if account is not None:
                    aside_env["JEO_SKILLS_ASIDE_ACCOUNT"] = account
                aside_result = run_block(block, aside_env, self.work)
                self.assertEqual(aside_result.returncode, 0, aside_result.stdout)
                self.assertFalse(setup_log.exists(), aside_result.stdout)
                self.assertFalse(curl_log.exists(), aside_result.stdout)
                self.assertRegex(aside_result.stdout.lower(), r"account|invalid|skip|warning")

    def test_jev_block_downloaded_setup_receives_same_explicit_argv_and_removes_owned_temp(self) -> None:
        block = guide_block("### Jev control-plane harness (System One)")
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        self.write_python_stub(bin_dir / "jeopi", "raise SystemExit(0)\n")
        mapping = self.home / ".agents/jev/agents.json"
        mapping.parent.mkdir(parents=True)
        mapping.write_text(json.dumps({"jeopi": {"profile": "mapped-jeopi"}}), encoding="utf-8")
        setup_log = self.work / "jev-setup.log"
        fetch_log = self.work / "curl.log"
        env = self.env(
            PATH=f"{bin_dir}:/usr/bin:/bin",
            JEO_SKILLS_JEV="api",
            JEV_AGENT="jeopi",
            JEO_SKILLS_JEV_PROFILE="explicit-jeopi",
            JEV_SETUP_LOG=str(setup_log),
            JEV_FETCH_LOG=str(fetch_log),
        )
        local_setup = self.work / "jev/jev-setup.sh"
        local_setup.parent.mkdir(parents=True)
        local_setup.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n", encoding="utf-8")
        local_setup.chmod(0o700)
        expected = "--profile explicit-jeopi --agent jeopi --mode api"
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(setup_log.read_text(encoding="utf-8").splitlines(), [expected])

        local_setup.unlink()
        setup_log.unlink()
        curl = bin_dir / "curl"
        curl.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" > \"$JEV_FETCH_LOG\"\n"
            "out=''\n"
            "while [ \"$#\" -gt 0 ]; do\n"
            "  if [ \"$1\" = -o ]; then out=$2; shift 2; else shift; fi\n"
            "done\n"
            "cat > \"$out\" <<'SETUP'\n"
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$JEV_SETUP_LOG\"\n"
            "SETUP\n",
            encoding="utf-8",
        )
        curl.chmod(0o700)
        result = run_block(block, env, self.work)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(setup_log.read_text(encoding="utf-8").splitlines(), [expected])
        fetch_args = shlex.split(fetch_log.read_text(encoding="utf-8").strip())
        self.assertIn("-o", fetch_args)
        downloaded = Path(fetch_args[fetch_args.index("-o") + 1])
        self.assertFalse(downloaded.exists(), "guide must remove its private downloaded setup script")

    def test_real_config_only_profiles_install_isolated_harness_and_reject_missing_profile_fallback(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("Node.js is required for the installed harness smoke")
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        (bin_dir / "node").symlink_to(node)
        legacy = self.home / ".agents/jev/.env"
        legacy.parent.mkdir(parents=True)
        legacy.write_text(
            "JEV_MODE=systemone\n"
            "JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:1/v1/systemone\n"
            "JEV_SYSTEMONE_MODEL=legacy-model\n",
            encoding="utf-8",
        )
        profiles = ("jeo", "gjc", "jeopi", "pi", "codex", "claude", "agy", "kimi", "grok", "opencode", "cursor", "crush", "omp", "antigravity")
        env = self.env(PATH=f"{bin_dir}:{os.defpath}")
        for profile in profiles:
            result = subprocess.run(
                [
                    "/bin/bash", str(ROOT / "jev/jev-setup.sh"),
                    "--config-only", "--profile", profile, "--agent", profile,
                    "--mode", "systemone", "--endpoint", "http://127.0.0.1:1/v1/systemone",
                    "--model", f"{profile}-model",
                ],
                cwd=self.work,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=60,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout)

        installed = self.home / ".agents/jev"
        self.assertTrue((installed / "jev-harness.mjs").is_file())
        self.assertTrue((self.home / ".agents/rules/jev-control-plane.md").is_file())
        for profile in profiles:
            base = (installed / "profiles" / f"{profile}.env").read_text(encoding="utf-8")
            backend = (installed / "profiles" / f"{profile}.systemone.env").read_text(encoding="utf-8")
            self.assertIn("JEV_ENABLED=false", base)
            self.assertIn("JEV_MODE=systemone", base)
            self.assertIn(f"JEV_SYSTEMONE_MODEL={profile}-model", backend)
            status = subprocess.run(
                [str(bin_dir / "node"), str(installed / "jev-harness.mjs"), "--profile", profile, "status"],
                cwd=self.work,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=20,
                check=False,
            )
            self.assertEqual(status.returncode, 2, status.stdout)
            report = json.loads(status.stdout)
            self.assertEqual(report["profile"], profile)
            self.assertFalse(report["enabled"])
            self.assertIn("disabled", report["hint"].lower())

        missing = subprocess.run(
            [str(bin_dir / "node"), str(installed / "jev-harness.mjs"), "--profile", "missing", "status"],
            cwd=self.work,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
            check=False,
        )
        self.assertEqual(missing.returncode, 2, missing.stdout)
        missing_report = json.loads(missing.stdout)
        self.assertEqual(missing_report["profile"], "missing")
        self.assertFalse(missing_report["enabled"])
        self.assertNotEqual(missing_report["default"], "systemone", "missing profile must not borrow legacy configuration")

    def test_readme_profile_entrypoints_have_live_links_and_explicit_guards(self) -> None:
        documents = (
            (ROOT / "README.md", "### Jev profiles follow", "## 📚 Skills List", "harness"),
            (ROOT / "README.ko.md", "### Jev 에이전트별 프로필과 활성화 경계", "## 📚 스킬 목록", "harness"),
            (ROOT / "README.es-ES.md", "### Perfiles de Jev por agente", "## 📚 Lista de Habilidades", "harness"),
            (ROOT / "jev/README.md", "## Configuration and setup", "## Settings", "plugin"),
        )
        link_sections = (
            (ROOT / "README.md", "### Jev profiles follow", "## 📚 Skills List"),
            (ROOT / "README.ko.md", "### Jev 에이전트별 프로필과 활성화 경계", "## 📚 스킬 목록"),
            (ROOT / "README.es-ES.md", "### Perfiles de Jev por agente", "## 📚 Lista de Habilidades"),
            (ROOT / "jev/README.md", "## Optional setup", "### Backend alternatives"),
        )
        for path, start, end, kind in documents:
            text = path.read_text(encoding="utf-8")
            section = text.split(start, 1)[1].split(end, 1)[0]
            fences = re.findall(r"```(?:bash|sh)\n(.*?)\n```", section, flags=re.S)
            if kind == "harness":
                status_block = next((fence.strip() for fence in fences
                                     if "jev-harness.mjs" in fence and re.search(r"\bstatus\b", fence)), None)
                self.assertIsNotNone(status_block, path)
                status_text = status_block or ""
                self.assertRegex(status_text, r"\$\{JEV_PROFILE:\?")
            else:
                status_fence = next((fence for fence in fences
                                     if "jev-plugin.mjs" in fence and re.search(r"\bstatus\b", fence)), None)
                self.assertIsNotNone(status_fence, path)
                status_text = status_fence or ""
                self.assertRegex(status_text, r"\$\{JEV_AGENT:\?")
                self.assertRegex(status_text, r"\$\{JEV_PROFILE:\?")
            self.assertIn("--profile", status_text)
            missing = run_block(status_text, self.env(PATH="/usr/bin:/bin"), self.work)
            self.assertNotEqual(missing.returncode, 0, f"{path} must guard missing profile variables")

        for path, start, end in link_sections:
            text = path.read_text(encoding="utf-8")
            section = text.split(start, 1)[1].split(end, 1)[0]
            links = re.findall(r"\]\(([^)]+)\)", section)
            self.assertTrue(links, f"{path} profile guidance must retain source links")
            for target in links:
                target_path = target.split("#", 1)[0]
                if not target_path or target_path.startswith(("http://", "https://", "mailto:")):
                    continue
                self.assertTrue((path.parent / target_path).is_file(), f"broken source link in {path}: {target}")

    def test_readme_profile_status_entrypoints_use_selected_installed_profiles(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("Node.js is required for the installed harness smoke")
        bin_dir = self.work / "readme-bin"
        bin_dir.mkdir()
        (bin_dir / "node").symlink_to(node)
        legacy = self.home / ".agents/jev/.env"
        legacy.parent.mkdir(parents=True)
        legacy.write_text(
            "JEV_ENABLED=true\n"
            "JEV_MODE=systemone\n"
            "JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:1/v1/systemone\n"
            "JEV_SYSTEMONE_MODEL=legacy-model\n",
            encoding="utf-8",
        )
        profiles = ("codex", "claude", "jeo", "jeopi")
        env = self.env(PATH=f"{bin_dir}:{os.defpath}")
        for profile in profiles:
            result = subprocess.run(
                [
                    "/bin/bash", str(ROOT / "jev/jev-setup.sh"),
                    "--config-only", "--profile", profile, "--agent", profile,
                    "--mode", "systemone", "--endpoint", "http://127.0.0.1:1/v1/systemone",
                    "--model", f"{profile}-model",
                ],
                cwd=self.work,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=60,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout)

        installed = self.home / ".agents/jev"
        jeopi_base = installed / "profiles" / "jeopi.env"
        jeopi_base.write_text(
            jeopi_base.read_text(encoding="utf-8").replace("JEV_ENABLED=false", "JEV_ENABLED=true"),
            encoding="utf-8",
        )
        selected = ("codex", "claude", "jeo")
        documents = (
            (ROOT / "README.md", "### Jev profiles follow", "## 📚 Skills List", "harness"),
            (ROOT / "README.ko.md", "### Jev 에이전트별 프로필과 활성화 경계", "## 📚 스킬 목록", "harness"),
            (ROOT / "README.es-ES.md", "### Perfiles de Jev por agente", "## 📚 Lista de Habilidades", "harness"),
            (ROOT / "jev/README.md", "## Configuration and setup", "## Settings", "plugin"),
        )
        for path, start, end, kind in documents:
            text = path.read_text(encoding="utf-8")
            section = text.split(start, 1)[1].split(end, 1)[0]
            fences = re.findall(r"```(?:bash|sh)\n(.*?)\n```", section, flags=re.S)
            if kind == "harness":
                status_block = next(fence.strip() for fence in fences
                                    if "jev-harness.mjs" in fence and re.search(r"\bstatus\b", fence))
            else:
                status_fence = next(fence for fence in fences
                                    if "jev-plugin.mjs" in fence and re.search(r"\bstatus\b", fence))
                guard = next(line.strip() for line in status_fence.splitlines()
                             if line.strip().startswith(":") and "JEV_AGENT" in line)
                status_line = next(line.strip() for line in status_fence.splitlines()
                                   if "jev-plugin.mjs status" in line)
                status_block = f"{guard}\n{status_line}"
            self.assertIn("--profile", status_block)
            for profile in selected:
                with self.subTest(document=path.name, profile=profile):
                    command_env = dict(env, JEV_PROFILE=profile, JEV_AGENT=profile)
                    result = run_block(status_block, command_env, self.work)
                    self.assertEqual(result.returncode, 2 if kind == "harness" else 0, result.stdout)
                    report = json.loads(result.stdout.splitlines()[-1] if kind == "plugin" else result.stdout)
                    self.assertEqual(report["profile"], profile)
                    self.assertFalse(report["enabled"])
                    self.assertNotIn("jeopi-model", result.stdout)
                    self.assertNotIn("legacy-model", result.stdout)
                    if kind == "plugin":
                        self.assertEqual(report["agent"], profile)
                        self.assertTrue(report["profilePresent"])

if __name__ == "__main__":
    unittest.main()
