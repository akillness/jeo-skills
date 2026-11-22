#!/usr/bin/env python3
"""Hermetic tests for scripts/setup-mcp-hosts.py across multi-host schemas and stdio probes."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/setup-mcp-hosts.py"


class SetupMcpHostsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="mcp-hosts-test-")
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name).resolve() / "home"
        self.home.mkdir()
        self.repo = Path(self.tmp.name).resolve() / "repo"
        (self.repo / "scripts").mkdir(parents=True)
        # Seed local Context7 entrypoint + installed mock binaries
        c7_dist = self.home / ".local/share/jeo-skill/context7-mcp/node_modules/@upstash/context7-mcp/dist"
        c7_dist.mkdir(parents=True)
        (c7_dist / "index.js").write_text("console.log('mock');\n", encoding="utf-8")
        (c7_dist.parent / "package.json").write_text(json.dumps({"name": "@upstash/context7-mcp", "bin": "dist/index.js"}), encoding="utf-8")

        bin_dir = self.home / ".local/bin"
        bin_dir.mkdir(parents=True)
        for name in ("uvx", "aside", "headroom", "semble", "spec-kit-mcp"):
            p = bin_dir / name
            p.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            p.chmod(0o755)
        os_bin = self.home / ".agents/venvs/openspace/bin/openspace-mcp"
        os_bin.parent.mkdir(parents=True)
        os_bin.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        os_bin.chmod(0o755)

        # Fixture jeo-code checkout + bun runner (hermetic across CI without ../jeo-code)
        self.jeo_code = Path(self.tmp.name).resolve() / "jeo-code"
        self.mem_cli = self.jeo_code / "packages/jeo-mem/src/cli.ts"
        self.mem_cli.parent.mkdir(parents=True)
        self.mem_cli.write_text(
            "import json, sys\n"
            "if len(sys.argv) > 1 and sys.argv[1] == 'mcp':\n"
            "    for raw in sys.stdin:\n"
            "        raw = raw.strip()\n"
            "        if not raw:\n"
            "            continue\n"
            "        req = json.loads(raw)\n"
            "        mid = req.get('id')\n"
            "        m = req.get('method')\n"
            "        if m == 'initialize':\n"
            "            print(json.dumps({'jsonrpc':'2.0','id':mid,'result':{'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'jeo-mem','version':'0.2.0'}}}), flush=True)\n"
            "        elif m == 'tools/list':\n"
            "            print(json.dumps({'jsonrpc':'2.0','id':mid,'result':{'tools':[{'name':'jeox_search'},{'name':'jeox_where_defined'}]}}), flush=True)\n"
            "        elif m and m.startswith('notifications/'):\n"
            "            pass\n",
            encoding="utf-8",
        )
        bun_bin = bin_dir / "bun"
        bun_bin.write_text(f"#!/bin/sh\nexec '{sys.executable}' \"$@\"\n", encoding="utf-8")
        bun_bin.chmod(0o755)
        self.bun_bin = bun_bin

        # Create host dirs & seed pre-existing quirky configs (including stale scripts/jeox.py)
        (self.home / ".claude").mkdir()
        (self.home / ".claude.json").write_text(json.dumps({"mcpServers": {"aside": {"command": "aside", "args": ["mcp"]}, "jeox": {"command": str(ROOT / "scripts/jeox.py"), "args": ["mcp"]}}}), encoding="utf-8")
        (self.home / ".codex").mkdir()
        (self.home / ".codex/config.toml").write_text('model = "gpt-5"\n', encoding="utf-8")
        (self.home / ".gemini").mkdir()
        (self.home / ".gemini/settings.json").write_text(json.dumps({
            "mcpServers": {
                "ouroboros": {"command": "/nonexistent/bin/ouroboros", "args": ["mcp", "serve"]},
                "openspace": {"command": str(os_bin), "toolTimeout": 600},
            }
        }), encoding="utf-8")
        (self.home / ".gemini/config").mkdir(parents=True)
        (self.home / ".gemini/config/mcp_config.json").write_text(json.dumps({
            "mcpServers": {"ouroboros": {"command": "/nonexistent/bin/ouroboros", "args": ["mcp", "serve"]}}
        }), encoding="utf-8")
        (self.home / ".gemini/antigravity").mkdir(parents=True)
        (self.home / ".gemini/antigravity/mcp_config.json").symlink_to(self.home / ".gemini/config/mcp_config.json")
        (self.home / ".cursor").mkdir()
        (self.home / ".config/opencode").mkdir(parents=True)
        (self.home / ".config/opencode/opencode.json").write_text(json.dumps({"mcp": {"servers": {}}}), encoding="utf-8")
        (self.home / ".pi/agent").mkdir(parents=True)
        (self.home / ".gjc/agent").mkdir(parents=True)
        (self.home / ".jeopi/agent").mkdir(parents=True)
        aside_cfg = self.home / ".aside/u/0/settings.json"
        aside_cfg.parent.mkdir(parents=True)
        aside_cfg.write_text(json.dumps({"mcp": {"servers": {"pencil": {}}}}), encoding="utf-8")
        self.aside_before = aside_cfg.read_text(encoding="utf-8")

    def test_applies_and_repairs_across_hosts_without_mutating_aside_or_symlinks(self) -> None:
        env = {**os.environ, "HOME": str(self.home), "XDG_CONFIG_HOME": str(self.home / ".config"),
               "JEO_CODE_ROOT": str(self.jeo_code), "PYTHONDONTWRITEBYTECODE": "1"}
        env.pop("CONTEXT7_API_KEY", None)
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--home", str(self.home), "--repair", "--apply", "--json"],
            env=env, capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        report = json.loads(proc.stdout)

        # Gemini omits toolTimeout & repairs broken ouroboros
        gem = json.loads((self.home / ".gemini/settings.json").read_text(encoding="utf-8"))
        self.assertIn("context7", gem["mcpServers"])
        for entry in gem["mcpServers"].values():
            self.assertNotIn("toolTimeout", entry)
        self.assertTrue(gem["mcpServers"]["ouroboros"]["command"].endswith("/uvx"))

        # Antigravity IDE symlink remains intact
        agy_ide = self.home / ".gemini/antigravity/mcp_config.json"
        self.assertTrue(agy_ide.is_symlink())
        agi = json.loads((self.home / ".gemini/config/mcp_config.json").read_text(encoding="utf-8"))
        self.assertIn("context7", agi["mcpServers"])

        # OpenCode v2 writes mcp.servers.context7
        oc = json.loads((self.home / ".config/opencode/opencode.json").read_text(encoding="utf-8"))
        self.assertIn("context7", oc["mcp"]["servers"])
        self.assertEqual(oc["mcp"]["servers"]["context7"]["type"], "local")

        # Pi sets exposure: direct for context7 and jeox, and claude migrates jeox onto jeo-code
        pi = json.loads((self.home / ".pi/agent/mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(pi["mcpServers"]["context7"]["exposure"], "direct")
        self.assertEqual(pi["mcpServers"]["jeox"]["exposure"], "direct")
        self.assertEqual(pi["mcpServers"]["jeox"]["args"], [str(self.mem_cli), "mcp"])
        claude = json.loads((self.home / ".claude.json").read_text(encoding="utf-8"))
        self.assertEqual(claude["mcpServers"]["jeox"]["args"], [str(self.mem_cli), "mcp"])

        # Codex config is valid TOML containing context7
        codex_data = tomllib.loads((self.home / ".codex/config.toml").read_text(encoding="utf-8"))
        self.assertIn("context7", codex_data["mcp_servers"])

        # Aside daemon config stays byte-identical (read-only audit only)
        self.assertEqual((self.home / ".aside/u/0/settings.json").read_text(encoding="utf-8"), self.aside_before)
        self.assertFalse(any(h["status"] == "error" for h in report["host_updates"]))

    def test_refuses_arbitrary_config_symlink_and_probes_real_jeox_stdio(self) -> None:
        secret_target = self.home / "outside.json"
        secret_target.write_text('{"keep": true}\n', encoding="utf-8")
        (self.home / ".cursor/mcp.json").symlink_to(secret_target)
        env = {**os.environ, "HOME": str(self.home), "JEO_CODE_ROOT": str(self.jeo_code), "PYTHONDONTWRITEBYTECODE": "1"}
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--home", str(self.home), "--apply", "--json"],
            env=env, capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(secret_target.read_text(encoding="utf-8"), '{"keep": true}\n')

        sys.path.insert(0, str(ROOT / "scripts"))
        import importlib.util
        spec = importlib.util.spec_from_file_location("setup_mcp_hosts", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(mod)
        prev = os.environ.get("JEO_CODE_ROOT")
        os.environ["JEO_CODE_ROOT"] = "none"
        try:
            self.assertIsNone(mod.resolve_jeox_cmd(self.home, self.repo))
        finally:
            if prev is None:
                os.environ.pop("JEO_CODE_ROOT", None)
            else:
                os.environ["JEO_CODE_ROOT"] = prev
        probe = mod.probe_stdio_mcp("jeox", str(self.bun_bin), [str(self.mem_cli), "mcp"])
        self.assertTrue(probe["ok"], probe)
        self.assertIn("jeox_search", probe["tools"])

    @unittest.skipUnless(
        (ROOT.parent / "jeo-code/packages/jeo-mem/src/cli.ts").is_file() and bool(shutil.which("bun")),
        "sibling ../jeo-code and bun required for live stdio MCP probe",
    )
    def test_probes_real_sibling_jeo_code_mcp_stdio(self) -> None:
        sys.path.insert(0, str(ROOT / "scripts"))
        import importlib.util
        spec = importlib.util.spec_from_file_location("setup_mcp_hosts", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(mod)
        real_cli = ROOT.parent / "jeo-code/packages/jeo-mem/src/cli.ts"
        probe = mod.probe_stdio_mcp("jeox", shutil.which("bun"), [str(real_cli), "mcp"])
        self.assertTrue(probe["ok"], probe)
        self.assertIn("jeox_search", probe["tools"])

    def test_registers_and_probes_second_brain_and_open_ontologies_mcp(self) -> None:
        import importlib.util

        vault_ops = ROOT / ".agent-skills/obsidian-second-brain/scripts/vault_ops.py"
        sb_bin = self.home / ".local/bin/second-brain"
        sb_bin.parent.mkdir(parents=True, exist_ok=True)
        sb_bin.write_text(f'#!/usr/bin/env bash\nexec "{sys.executable}" "{vault_ops}" "$@"\n', encoding="utf-8")
        sb_bin.chmod(0o755)

        fake_oo = self.home / ".local/bin/open-ontologies"
        fake_oo.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_oo.chmod(0o755)

        spec = importlib.util.spec_from_file_location("setup_mcp_hosts", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(mod)

        probe = mod.probe_stdio_mcp("second-brain", sys.executable, [str(vault_ops), "mcp"])
        self.assertTrue(probe["ok"], probe)
        self.assertEqual(set(probe["tools"]), {"sb_save", "sb_update", "sb_delete", "sb_search", "sb_status"})

        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--project", str(self.repo), "--apply"],
            env={**os.environ, "HOME": str(self.home), "OPEN_ONTOLOGIES_BIN": str(fake_oo)},
            capture_output=True,
            text=True,
            check=True,
        )
        claude_cfg = json.loads((self.home / ".claude.json").read_text(encoding="utf-8"))
        self.assertEqual(claude_cfg["mcpServers"]["second-brain"]["args"], ["mcp"])
        self.assertEqual(claude_cfg["mcpServers"]["open-ontologies"]["command"], str(fake_oo))
        self.assertEqual(claude_cfg["mcpServers"]["open-ontologies"]["args"], ["serve"])
        self.assertIn("open-ontologies", proc.stdout)
        self.assertIn("second-brain", proc.stdout)


if __name__ == "__main__":
    unittest.main()