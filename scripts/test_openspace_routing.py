#!/usr/bin/env python3
"""OpenSpace prompt-time routing: router gate, host formats, hook installer, registrar, installer.

Offline. A fake ``openspace`` package reproduces the upstream SkillRanker.bm25_only contract
(BM25Okapi over name + description + body[:2000], all-zero scores pass candidates through), so
the gate is tested against real BM25 arithmetic. ``--real-openspace`` reruns the router cases
against an installed OpenSpace given as OPENSPACE_REAL_PYTHON.
"""

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import tomllib
import unittest


SKILL = Path(__file__).resolve().parents[1] / ".agent-skills/openspace"
ROUTER = SKILL / "scripts/route_prompt.py"
HOOKS = SKILL / "scripts/route-hooks.py"
INSTALLER = SKILL / "scripts/install-openspace.sh"
REGISTRAR = SKILL / "scripts/register-openspace-mcp.sh"

FAKE_RANKER = '''import math, re
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class SkillCandidate:
    skill_id: str
    name: str
    description: str
    body: str = ""
    source: str = "local"
    bm25_score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class SkillRanker:
    def __init__(self, *, cache_dir=None, enable_cache=True):
        assert enable_cache is False, "the router must not use the embedding cache"

    @staticmethod
    def _tokenize(text):
        return [t for t in re.split(r"[^\\w]+", text.lower()) if t]

    def bm25_only(self, query, candidates, top_k=30):
        corpus = [self._tokenize(f"{c.name} {c.description} {c.body[:2000]}") for c in candidates]
        n = len(corpus)
        avgdl = sum(map(len, corpus)) / n
        df = {}
        for doc in corpus:
            for term in set(doc):
                df[term] = df.get(term, 0) + 1
        idf = {t: math.log(n - f + 0.5) - math.log(f + 0.5) for t, f in df.items()}
        floor = 0.25 * sum(idf.values()) / len(idf)
        idf = {t: (v if v >= 0 else floor) for t, v in idf.items()}
        for c, doc in zip(candidates, corpus):
            score = 0.0
            for term in self._tokenize(query):
                tf = doc.count(term)
                score += idf.get(term, 0) * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * len(doc) / avgdl))
            c.bm25_score = score
        ranked = sorted(candidates, key=lambda c: c.bm25_score, reverse=True)
        if all(c.bm25_score == 0.0 for c in ranked):
            return candidates[:top_k]
        return ranked[:top_k]
'''

FAKE_UTILS = '''import re
import yaml

_FRONTMATTER = re.compile(r"^---\\n(.*?)\\n---\\n?", re.S)


def parse_frontmatter(content):
    match = _FRONTMATTER.match(content)
    if not match:
        return {}
    parsed = yaml.safe_load(match.group(1))
    return parsed if isinstance(parsed, dict) else {}


def strip_frontmatter(content):
    return _FRONTMATTER.sub("", content, count=1)
'''

FAKE_YAML = '''def safe_load(text):
    out = {}
    for line in text.splitlines():
        if ": " in line:
            key, value = line.split(": ", 1)
            out[key.strip()] = value.strip()
    return out
'''

FAKE_LOGGING = '''class Logger:
    @staticmethod
    def configure(**kwargs):
        assert kwargs == {"log_to_console": False, "log_to_file": None}
'''

NETWORK_GUARD = '''import socket
def denied(*args, **kwargs):
    raise RuntimeError("fixture blocked network")
socket.socket.connect = denied
socket.create_connection = denied
'''

CATALOG = {
    "graphify": ("Drive Graphify to build and query a code knowledge graph.", "graphify build graph query"),
    "scrapling": ("Scrape JS-rendered pages with Scrapling and extract structured data.", "scrape fetch page selectors"),
    "web-fetch": ("Fetch static HTML documents over HTTP for reading.", "fetch url html"),
    "better-design": ("Improve visual hierarchy and spacing of interfaces.", "design better layout"),
    "han-river-water-level": ("한강홍수통제소 기반 현재 수위/유량을 관측소명으로 조회한다.", "수위 관측소 조회"),
    "korean-notes": ("Organize meeting notes for Korean teams.", "회의록 정리 템플릿 사용 방법"),
    "calendar-sync": ("Sync calendar events between providers.", "calendar events sync"),
    "invoice-export": ("Export invoices to spreadsheets.", "invoice export spreadsheet"),
    "image-resize": ("Resize and compress images for the web.", "image resize compress"),
    "email-drafts": ("Draft email replies in the user's voice.", "email draft reply"),
    "slide-deck": ("Build slide decks from outlines.", "slide deck outline"),
    "pricing-strategy": ("Price products with value-based pricing.", "pricing value strategy"),
    "git-workflow": ("Branching, rebasing, and merge strategy for git.", "git branch rebase merge"),
    "docker-compose": ("Write and debug docker compose stacks.", "docker compose stack"),
    "sql-tuning": ("Tune slow SQL queries with indexes and plans.", "sql index explain plan"),
    "release-notes": ("Write release notes from merged changes.", "release notes changelog"),
}


def write_catalog(root, catalog=CATALOG):
    for name, (description, body) in catalog.items():
        path = root / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\ndescription: {description}\n---\n{body}\n", encoding="utf-8")


class Fixture(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="openspace-routing-test-")
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name).resolve()
        self.home = self.work / "home"
        self.home.mkdir()
        self.modules = self.work / "modules"
        self.catalog = self.work / "skills"
        for name, text in {
            "sitecustomize.py": NETWORK_GUARD,
            "yaml.py": FAKE_YAML,
            "openspace/__init__.py": "",
            "openspace/utils/__init__.py": "",
            "openspace/utils/logging.py": FAKE_LOGGING,
            "openspace/skill_engine/__init__.py": "",
            "openspace/skill_engine/skill_ranker.py": FAKE_RANKER,
            "openspace/skill_engine/skill_utils.py": FAKE_UTILS,
        }.items():
            path = self.modules / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        write_catalog(self.catalog)
        self.python = sys.executable
        self.env = {
            "HOME": str(self.home), "PATH": "/usr/bin:/bin", "PYTHONPATH": str(self.modules),
            "PYTHONDONTWRITEBYTECODE": "1", "OPENSPACE_HOST_SKILL_DIRS": str(self.catalog),
            "OPENSPACE_ROUTE_CACHE": str(self.work / "cache"), "XDG_CONFIG_HOME": str(self.home / ".config"),
        }

    def route(self, prompt, host="claude", raw=None, **env):
        payload = raw if raw is not None else json.dumps({"hook_event_name": "UserPromptSubmit", "prompt": prompt})
        return subprocess.run([self.python, "-B", str(ROUTER), "--host", host], input=payload, text=True,
                              capture_output=True, env={**self.env, **env}, timeout=60)

    def suggested(self, prompt, **env):
        result = self.route(prompt, host="text", **env)
        self.assertEqual(result.returncode, 0, result.stderr)
        return [line.split(" - ")[0].split(". ", 1)[1] for line in result.stdout.splitlines() if line[:1].isdigit()]


class RouterGate(Fixture):
    def test_named_skill_and_mixed_script_prompts_route(self):
        self.assertEqual(self.suggested("use graphify on this repo")[0], "graphify")
        # "graphify로" is one \\w+ token unless Latin and Hangul are split.
        self.assertEqual(self.suggested("graphify로 코드베이스 그래프 만들어줘")[0], "graphify")

    def test_rare_description_terms_route_with_coverage(self):
        self.assertEqual(self.suggested("scrape a JS-rendered page"), ["scrapling"])

    def test_generic_and_conversational_prompts_get_no_note(self):
        for prompt in ("make it better", "hi", "ok do it", "고마워", "현재 작업중인 내용 확인해줘", "what time is it"):
            with self.subTest(prompt=prompt):
                self.assertEqual(self.suggested(prompt), [])

    def test_korean_particles_are_stripped_and_rarity_is_per_script(self):
        self.assertEqual(self.suggested("한강 수위 알려줘"), ["han-river-water-level"])

    def test_body_only_korean_anchor_needs_every_term(self):
        self.assertEqual(self.suggested("회의록"), ["korean-notes"])
        self.assertEqual(self.suggested("회의록 요약 자동 번역"), [])

    def test_slash_commands_empty_prompts_and_off_switch_print_nothing(self):
        for prompt in ("/compact", "   "):
            self.assertEqual(self.route(prompt).stdout, "")
        self.assertEqual(self.route("use graphify", OPENSPACE_ROUTE="off").stdout, "")
        self.assertEqual(self.route("", raw=json.dumps({"hook_event_name": "Stop"})).stdout, "")

    def test_each_host_gets_its_own_envelope(self):
        for host, event in (("claude", "UserPromptSubmit"), ("codex", "UserPromptSubmit"), ("gemini", "BeforeAgent")):
            with self.subTest(host=host):
                output = json.loads(self.route("use graphify", host=host).stdout)["hookSpecificOutput"]
                self.assertEqual(output["hookEventName"], event)
                self.assertIn("graphify", output["additionalContext"])
                self.assertNotIn("<", output["additionalContext"])
        for host in ("pi", "opencode"):
            self.assertIn("graphify", json.loads(self.route("use graphify", host=host).stdout)["context"])
        kimi = self.route("use graphify", host="kimi").stdout
        self.assertTrue(kimi.startswith("OpenSpace skill routing"), kimi)
        self.assertIn(str(self.catalog / "graphify/SKILL.md"), kimi)
        # Kimi passes raw text when stdin is not JSON.
        self.assertIn("graphify", self.route("", host="kimi", raw="graphify please").stdout)

    def test_missing_openspace_fails_open_silently(self):
        result = self.route("use graphify", PYTHONPATH=str(self.work / "absent"))
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
        debug = self.route("use graphify", PYTHONPATH=str(self.work / "absent"), OPENSPACE_ROUTE_DEBUG="1")
        self.assertEqual(debug.returncode, 0)
        self.assertIn("ModuleNotFoundError", debug.stderr)

    def test_index_cache_tracks_new_and_edited_skills(self):
        self.assertEqual(self.suggested("sourdough bread recipe"), [])
        write_catalog(self.catalog, {"baking": ("Bake sourdough bread at home.", "flour water salt")})
        self.assertEqual(self.suggested("sourdough bread recipe"), ["baking"])
        write_catalog(self.catalog, {"baking": ("Repair bicycle gears and chains.", "derailleur cable")})
        self.assertEqual(self.suggested("sourdough bread recipe"), [])
        self.assertEqual(self.suggested("bicycle gears slipping"), ["baking"])
        self.assertTrue((self.work / "cache/index.json").is_file())

    def test_check_verifies_the_ranker_contract(self):
        ok = subprocess.run([self.python, "-B", str(ROUTER), "--check"], capture_output=True, text=True, env=self.env, timeout=60)
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertIn("no network", ok.stdout)
        missing = subprocess.run([self.python, "-B", str(ROUTER), "--check"], capture_output=True, text=True,
                                 env={**self.env, "PYTHONPATH": str(self.work / "absent")}, timeout=60)
        self.assertEqual(missing.returncode, 1)
        self.assertIn("not ready", missing.stderr)


class RealOpenSpace(RouterGate):
    """The gate cases again, ranked by an installed OpenSpace instead of the fake."""

    def setUp(self):
        super().setUp()
        interpreter = os.environ.get("OPENSPACE_REAL_PYTHON")
        if not interpreter or not Path(interpreter).is_file():
            self.skipTest("OPENSPACE_REAL_PYTHON must name an installed OpenSpace interpreter")
        guard = self.work / "network-guard"
        guard.mkdir()
        (guard / "sitecustomize.py").write_text(NETWORK_GUARD, encoding="utf-8")
        self.python = interpreter
        self.env["PYTHONPATH"] = str(guard)

    def test_missing_openspace_fails_open_silently(self):
        self.skipTest("an installed OpenSpace is importable without PYTHONPATH")

    def test_check_verifies_the_ranker_contract(self):
        ok = subprocess.run([self.python, "-B", str(ROUTER), "--check"], capture_output=True, text=True, env=self.env, timeout=60)
        self.assertEqual(ok.returncode, 0, ok.stderr)


class HookInstaller(Fixture):
    def setUp(self):
        super().setUp()
        h = self.home
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.venv = self.work / "venv"
        (self.venv / "bin").mkdir(parents=True)
        (self.venv / "bin/python").symlink_to(sys.executable)
        self.opencode("2.0.32")
        self.files = {
            "claude": h / ".claude/settings.json",
            "codex": h / ".codex/hooks.json",
            "gemini": h / ".gemini/settings.json",
            "kimi": h / ".kimi-code/config.toml",
        }
        self.write(self.files["claude"], {"model": "x", "hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "other-claude"}]}], "Stop": [{"hooks": [{"type": "command", "command": "stop"}]}]}})
        self.write(self.files["codex"], {"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "other-codex", "timeout": 10}]}]}})
        self.write(self.files["gemini"], {"mcpServers": {}, "hooks": {"BeforeAgent": [{"matcher": "", "hooks": [{"name": "wiki", "type": "command", "command": "other-gemini"}]}]}})
        self.files["kimi"].parent.mkdir(parents=True)
        self.files["kimi"].write_text('default_model = "k2"\n\n[[hooks]]\nevent = "UserPromptSubmit"\ncommand = "other-kimi"\ntimeout = 10\n', encoding="utf-8")
        for path in self.files.values():
            path.chmod(0o640)
        for host in ("jeopi", "omp"):
            (h / f".{host}/agent").mkdir(parents=True)
        (h / ".config/opencode").mkdir(parents=True)
        self.originals = {name: path.read_text(encoding="utf-8") for name, path in self.files.items()}
        self.hook_env = {**self.env, "PATH": f"{self.bin}:/usr/bin:/bin", "OPENSPACE_VENV": str(self.venv),
                         "SKILLS_ROOT": str(self.catalog), "KIMI_CODE_HOME": str(h / ".kimi-code")}

    def opencode(self, version):
        stub = self.bin / "opencode"
        stub.write_text(f"#!/bin/sh\necho 'opencode v{version}'\n")
        stub.chmod(0o755)

    @staticmethod
    def write(path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    def hooks(self, *args):
        return subprocess.run([sys.executable, "-B", str(HOOKS), *args], capture_output=True, text=True,
                              env=self.hook_env, timeout=60)

    def snapshot(self):
        return {str(p.relative_to(self.home)): p.read_bytes() for p in sorted(self.home.rglob("*")) if p.is_file()}

    def test_install_adds_one_entry_per_host_and_preserves_everything_else(self):
        result = self.hooks("install")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        wrapper = self.home / ".agents/hooks/openspace-route.sh"
        for name, event in (("claude", "UserPromptSubmit"), ("codex", "UserPromptSubmit"), ("gemini", "BeforeAgent")):
            data = json.loads(self.files[name].read_text())
            commands = [h["command"] for e in data["hooks"][event] for h in e["hooks"]]
            self.assertEqual(commands[0], f"other-{name}")
            self.assertEqual(commands[1:], [f"/bin/sh {wrapper} {name}"])
            self.assertEqual(stat.S_IMODE(self.files[name].stat().st_mode), 0o640)
        claude = json.loads(self.files["claude"].read_text())
        self.assertEqual((claude["model"], claude["hooks"]["Stop"][0]["hooks"][0]["command"]), ("x", "stop"))
        gemini = json.loads(self.files["gemini"].read_text())["hooks"]["BeforeAgent"][1]
        self.assertEqual((gemini["matcher"], gemini["hooks"][0]["timeout"]), ("", 10000))
        kimi = tomllib.loads(self.files["kimi"].read_text())
        self.assertEqual(kimi["default_model"], "k2")
        self.assertEqual([h["command"] for h in kimi["hooks"]], ["other-kimi", f"/bin/sh {wrapper} kimi"])
        for host in ("jeopi", "omp"):
            extension = (self.home / f".{host}/agent/extensions/openspace-route.ts").read_text()
            self.assertIn('pi.on("before_agent_start"', extension)
            self.assertIn('customType: "openspace-route"', extension)
        for host in ("pi", "gjc"):
            self.assertFalse((self.home / f".{host}").exists(), "undetected hosts are never created")
        self.assertIn("skipped", result.stdout)
        plugin = (self.home / ".config/opencode/plugins/openspace-route.js").read_text()
        self.assertIn('ctx.session.hook("prompt"', plugin)
        self.assertIn("export default {", plugin)
        self.assertIn("trust", result.stdout)
        again = self.hooks("install")
        self.assertEqual(again.stdout.count("unchanged"), 2 + 7, again.stdout)

    def test_wrapper_runs_the_router_and_fails_open_without_the_venv(self):
        self.assertEqual(self.hooks("install").returncode, 0)
        wrapper = self.home / ".agents/hooks/openspace-route.sh"
        event = json.dumps({"hook_event_name": "UserPromptSubmit", "prompt": "use graphify"})
        routed = subprocess.run(["/bin/sh", str(wrapper), "claude"], input=event, text=True, capture_output=True,
                                env={**self.env, "OPENSPACE_HOST_SKILL_DIRS": ""}, timeout=60)
        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertIn("graphify", json.loads(routed.stdout)["hookSpecificOutput"]["additionalContext"])
        (self.venv / "bin/python").unlink()
        silent = subprocess.run(["/bin/sh", str(wrapper), "claude"], input=event, text=True, capture_output=True,
                                env=self.env, timeout=60)
        self.assertEqual((silent.returncode, silent.stdout), (0, ""))

    def test_remove_restores_configs_and_deletes_generated_files(self):
        self.assertEqual(self.hooks("install").returncode, 0)
        result = self.hooks("remove")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in ("claude", "codex", "gemini"):
            self.assertEqual(json.loads(self.files[name].read_text()), json.loads(self.originals[name]))
        self.assertEqual(tomllib.loads(self.files["kimi"].read_text()), tomllib.loads(self.originals["kimi"]))
        leftovers = [p for p in self.home.rglob("openspace-route*")]
        self.assertEqual(leftovers, [])

    def test_dry_run_writes_nothing(self):
        before = self.snapshot()
        result = self.hooks("install", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("would install", result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_foreign_files_and_symlinked_configs_are_refused_per_host(self):
        foreign = self.home / ".omp/agent/extensions/openspace-route.ts"
        foreign.parent.mkdir(parents=True)
        foreign.write_text("// someone else's extension\n")
        real = self.work / "real-settings.json"
        real.write_text(self.originals["claude"])
        self.files["claude"].unlink()
        self.files["claude"].symlink_to(real)
        result = self.hooks("install")
        self.assertEqual(result.returncode, 1)
        self.assertIn("omp       FAILED", result.stdout)
        self.assertIn("claude    FAILED", result.stdout)
        self.assertEqual(foreign.read_text(), "// someone else's extension\n")
        self.assertEqual(real.read_text(), self.originals["claude"])
        self.assertIn("openspace-route.sh", self.files["codex"].read_text(), "other hosts still install")

    def test_opencode_1_gets_the_chat_message_plugin(self):
        self.opencode("1.18.18")
        self.assertEqual(self.hooks("install", "--host", "opencode").returncode, 0)
        plugin = (self.home / ".config/opencode/plugins/openspace-route.js").read_text()
        self.assertIn('"chat.message"', plugin)
        self.assertIn("synthetic: true", plugin)

    @unittest.skipUnless(shutil.which("bun"), "bun runs the generated TypeScript extension")
    def test_generated_pi_extension_injects_a_hidden_message(self):
        self.assertEqual(self.hooks("install", "--host", "jeopi").returncode, 0)
        extension = self.home / ".jeopi/agent/extensions/openspace-route.ts"
        driver = self.work / "drive.ts"
        driver.write_text(f'''import register from {json.dumps(str(extension))};
const handlers: Record<string, any> = {{}};
register({{ on: (name: string, fn: any) => (handlers[name] = fn) }});
console.log(JSON.stringify(await handlers.before_agent_start({{ prompt: "use graphify" }})));
console.log(JSON.stringify(await handlers.before_agent_start({{ prompt: "hi" }})));
''')
        result = subprocess.run(["bun", str(driver)], capture_output=True, text=True, timeout=60,
                                env={**self.env, "PATH": os.environ["PATH"], "OPENSPACE_HOST_SKILL_DIRS": str(self.catalog)})
        self.assertEqual(result.returncode, 0, result.stderr)
        routed, quiet = (json.loads(line) for line in result.stdout.splitlines())
        self.assertEqual((routed["message"]["customType"], routed["message"]["display"]), ("openspace-route", False))
        self.assertIn("graphify", routed["message"]["content"])
        self.assertEqual(quiet, {})

    @unittest.skipUnless(shutil.which("bun"), "bun runs the generated OpenCode plugin")
    def test_generated_opencode_2_plugin_appends_the_note_to_the_prompt(self):
        self.assertEqual(self.hooks("install", "--host", "opencode").returncode, 0)
        plugin = self.home / ".config/opencode/plugins/openspace-route.js"
        driver = self.work / "drive-opencode.ts"
        driver.write_text(f'''import plugin from {json.dumps(str(plugin))};
let hook: any;
await plugin.setup({{ session: {{ hook: async (name: string, fn: any) => {{ if (name === "prompt") hook = fn; }} }} }});
const input = {{ prompt: {{ text: "use graphify" }} }};
await hook(input);
console.log(JSON.stringify(input));
''')
        result = subprocess.run(["bun", str(driver)], capture_output=True, text=True, timeout=60,
                                env={**self.env, "PATH": os.environ["PATH"], "OPENSPACE_HOST_SKILL_DIRS": str(self.catalog)})
        self.assertEqual(result.returncode, 0, result.stderr)
        text = json.loads(result.stdout)["prompt"]["text"]
        self.assertTrue(text.startswith("use graphify\n\nOpenSpace skill routing"), text)


class Registrar(Fixture):
    def setUp(self):
        super().setUp()
        self.mcp = self.work / "openspace-mcp"
        self.mcp.write_text("#!/bin/sh\nexit 0\n")
        self.mcp.chmod(0o755)
        self.gemini = self.home / ".gemini/settings.json"
        self.gemini.parent.mkdir()
        self.gemini.write_text(json.dumps({"mcpServers": {"openspace": {"command": "old", "toolTimeout": 600}}, "keep": 1}))
        (self.home / ".qwen").mkdir()
        self.claude = self.home / ".claude.json"
        self.claude.write_text(json.dumps({"mcpServers": {"openspace": {"command": "mine"}}}))

    def register(self, *args):
        return subprocess.run(["/bin/bash", str(REGISTRAR), *args], capture_output=True, text=True, timeout=60,
                              env={**self.env, "OPENSPACE_BIN": str(self.mcp), "SKILLS_ROOT": str(self.catalog)})

    def test_gemini_family_entries_omit_tool_timeout_and_old_ones_are_repaired(self):
        result = self.register()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        gemini = json.loads(self.gemini.read_text())
        self.assertEqual(gemini["keep"], 1)
        self.assertEqual(set(gemini["mcpServers"]["openspace"]), {"command", "env"})
        self.assertEqual(gemini["mcpServers"]["openspace"]["command"], str(self.mcp))
        qwen = json.loads((self.home / ".qwen/settings.json").read_text())["mcpServers"]["openspace"]
        self.assertNotIn("toolTimeout", qwen)
        self.assertEqual(json.loads(self.claude.read_text())["mcpServers"]["openspace"], {"command": "mine"})
        self.assertIn("repaired", result.stdout)
        self.assertIn("already registered", self.register().stdout.split("gemini-cli", 1)[1].splitlines()[0])


class Installer(Fixture):
    def setUp(self):
        super().setUp()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.log = self.work / "actions.jsonl"
        stub = f"#!{sys.executable}\nimport json, os, sys\nfrom pathlib import Path\nargs = sys.argv[1:]\nwith open(os.environ['ACTION_LOG'], 'a') as f:\n    f.write(json.dumps([Path(sys.argv[0]).name, *args]) + '\\n')\n"
        (self.bin / "git").write_text(stub + """if args[0] == "clone":
    target = Path(args[-1])
    for skill in ("skill-discovery", "delegate-task"):
        (target / "openspace/host_skills" / skill).mkdir(parents=True)
        (target / "openspace/host_skills" / skill / "SKILL.md").write_text(f"---\\nname: {skill}\\ndescription: d\\n---\\n")
    (target / ".git").mkdir()
if args[-2:] == ["rev-parse", "--short", "HEAD"] or args[-3:] == ["rev-parse", "--short", "HEAD"]:
    print("618c846")
""")
        (self.bin / "uv").write_text(stub + f"""if args[0] == "venv":
    venv = Path(args[-1])
    (venv / "bin").mkdir(parents=True, exist_ok=True)
    python = venv / "bin/python"
    if python.is_symlink() or python.exists():
        python.unlink()
    python.symlink_to({sys.executable!r})
if args[:2] == ["pip", "install"]:
    venv = Path(args[args.index("--python") + 1]).parent.parent
    mcp = venv / "bin/openspace-mcp"
    mcp.write_text("#!/bin/sh\\nexit 0\\n")
    mcp.chmod(0o755)
""")
        for name in ("git", "uv"):
            (self.bin / name).chmod(0o755)
        self.venv = self.home / ".agents/venvs/openspace"
        self.install_env = {**self.env, "PATH": f"{self.bin}:/usr/bin:/bin", "ACTION_LOG": str(self.log),
                            "SKILLS_ROOT": str(self.catalog)}

    def install(self, *args, **env):
        return subprocess.run(["/bin/bash", str(INSTALLER), *args], capture_output=True, text=True, timeout=120,
                              env={**self.install_env, **env})

    def actions(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_dry_run_prints_the_pinned_plan_and_changes_nothing(self):
        result = self.install("--dry-run", "--hooks")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("618c8461dab9a075a7e7c4330b40a18e9f5514d9", result.stdout)
        self.assertIn("would write", result.stdout)
        self.assertEqual(self.actions(), [])
        self.assertFalse((self.home / ".agents").exists())

    def test_dead_venv_is_rebuilt_and_router_contract_is_checked(self):
        (self.venv / "bin").mkdir(parents=True)
        (self.venv / "bin/python").symlink_to(self.work / "removed-uv-python")
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        actions = self.actions()
        self.assertIn(["git", "-C", str(self.home / ".openspace/OpenSpace"), "checkout", "--detach", "618c8461dab9a075a7e7c4330b40a18e9f5514d9"], actions)
        self.assertIn(["uv", "venv", "--clear", "--python", "3.12", str(self.venv)], actions)
        pip = next(a for a in actions if a[1:3] == ["pip", "install"])
        self.assertIn("rank-bm25", pip)
        self.assertIn("PyYAML", pip)
        self.assertIn("mcp>=1,<2", pip)
        self.assertIn("OpenSpace router ready", result.stdout)
        self.assertTrue((self.catalog / "skill-discovery/SKILL.md").is_file())
        self.assertFalse((self.home / ".agents/hooks").exists(), "hooks need --hooks")

    def test_healthy_venv_is_reused_and_a_broken_router_contract_stops_install(self):
        (self.venv / "bin").mkdir(parents=True)
        (self.venv / "bin/python").symlink_to(sys.executable)
        result = self.install(PYTHONPATH=str(self.work / "absent"))
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("router check failed", result.stderr)
        self.assertFalse(any(a[:2] == ["uv", "venv"] for a in self.actions()))
        self.assertFalse((self.catalog / "skill-discovery").exists())

    def test_hooks_flag_installs_routing_hooks(self):
        (self.home / ".claude").mkdir()
        result = self.install("--hooks")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        settings = json.loads((self.home / ".claude/settings.json").read_text())
        self.assertIn("openspace-route.sh claude", settings["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"])


class Documentation(unittest.TestCase):
    def test_skill_documents_the_hook_and_not_the_ooo_coupling(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("route-hooks.py", text)
        self.assertIn("route_prompt.py", text)
        self.assertNotIn("ooo/scripts/install.sh", text)
        self.assertNotIn("--search", text)


if __name__ == "__main__":
    if "--real-openspace" in sys.argv:
        sys.argv.remove("--real-openspace")
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(RealOpenSpace)
    else:
        loader = unittest.defaultTestLoader
        suite = unittest.TestSuite(
            loader.loadTestsFromTestCase(case) for case in (RouterGate, HookInstaller, Registrar, Installer, Documentation)
        )
    sys.exit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
