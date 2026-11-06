#!/usr/bin/env python3
"""OpenSpace prompt-time routing: router gate, host formats, hook installer, registrar, installer.

Offline. A fake ``openspace`` package reproduces the upstream SkillRanker.bm25_only contract
(BM25Okapi over name + description + body[:2000], all-zero scores pass candidates through), so
the gate is tested against real BM25 arithmetic. ``--real-openspace`` reruns the router cases
against an installed OpenSpace given as OPENSPACE_REAL_PYTHON.
"""

from concurrent.futures import ThreadPoolExecutor
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
    "shopping-shorts": ("쇼핑 쇼츠 상품 광고: 승인 없는 유료 생성과 업로드에는 사용하지 않는다.", "쇼핑 쇼츠 상품 영상"),
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

    def test_approval_only_prompts_do_not_trigger_unrelated_skills(self):
        for prompt in ("응 모두 승인", "네 승인합니다", "모두 승인", "yes, approve all", "approved"):
            with self.subTest(prompt=prompt):
                result = self.route(prompt, host="text")
                self.assertEqual((result.returncode, result.stdout), (0, ""), result.stderr)

    def test_approval_with_a_skill_or_task_still_routes(self):
        for prompt, expected in (
            ("응 graphify 승인", "graphify"),
            ("네 승인합니다 한강 수위 알려줘", "han-river-water-level"),
            ("approved, use graphify", "graphify"),
        ):
            with self.subTest(prompt=prompt):
                self.assertIn(expected, self.suggested(prompt))

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
        for host, event in (("claude", "UserPromptSubmit"), ("codex", "UserPromptSubmit"), ("jeo", "UserPromptSubmit"), ("gemini", "BeforeAgent")):
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

    def test_agy_preinvocation_routes_documented_payload(self):
        payload = {"conversationId": "fixture", "workspacePaths": [str(self.work)],
                   "lastUserInput": "use graphify", "invocationNum": 1, "initialNumSteps": 0}
        result = self.route("", host="agy", raw=json.dumps(payload))
        self.assertEqual((result.returncode, result.stderr), (0, ""))
        response = json.loads(result.stdout)
        self.assertEqual(set(response), {"injectSteps"})
        self.assertEqual(len(response["injectSteps"]), 1)
        step = response["injectSteps"][0]
        self.assertEqual(set(step), {"ephemeralMessage"})
        self.assertIn(str(self.catalog / "graphify/SKILL.md"), step["ephemeralMessage"])

    def test_agy_invalid_or_disabled_input_fails_open(self):
        for payload in ("not json", "{}", json.dumps({"prompt": "use graphify"}),
                        json.dumps({"lastUserInput": {"text": "use graphify"}})):
            with self.subTest(payload=payload):
                result = self.route("", host="agy", raw=payload)
                self.assertEqual((result.returncode, result.stderr), (0, ""))
                self.assertEqual(json.loads(result.stdout), {})
        disabled = self.route("", host="agy", raw=json.dumps({"lastUserInput": "use graphify"}),
                              OPENSPACE_ROUTE="off")
        self.assertEqual((disabled.returncode, disabled.stderr), (0, ""))
        self.assertEqual(json.loads(disabled.stdout), {})

    def test_kimi_text_blocks_route_like_string_prompts(self):
        blocks = [{"type": "text", "text": "use graphify"}]
        actual = self.route(blocks, host="kimi")
        expected = self.route("use graphify", host="kimi")
        self.assertEqual((actual.returncode, actual.stdout, actual.stderr),
                         (expected.returncode, expected.stdout, expected.stderr))
        self.assertIn(str(self.catalog / "graphify/SKILL.md"), actual.stdout)

    def test_kimi_ignores_nontext_and_malformed_blocks(self):
        blocks = [
            {"type": "image", "text": "scrapling", "data": "private-image-payload"},
            {"type": "text", "text": "use"},
            {"type": "tool", "text": "scrapling private-tool-payload"},
            None, "scrapling", {}, {"text": "scrapling"},
            {"type": "text", "text": None}, {"type": "text", "text": ["scrapling"]},
            {"type": "text", "text": "graphify"},
        ]
        actual = self.route(blocks, host="kimi")
        expected = self.route("use\ngraphify", host="kimi")
        self.assertEqual((actual.returncode, actual.stdout, actual.stderr),
                         (expected.returncode, expected.stdout, expected.stderr))
        self.assertIn(str(self.catalog / "graphify/SKILL.md"), actual.stdout)
        self.assertNotIn("scrapling", actual.stdout + actual.stderr)
        self.assertNotIn("private-", actual.stdout + actual.stderr)

    def test_kimi_block_order_and_empty_inputs(self):
        # A leading slash command suppresses routing, so reversing these blocks
        # would incorrectly route graphify.
        ordered = [{"type": "text", "text": "/compact"}, {"type": "text", "text": "graphify"}]
        for prompt in (ordered, [], [None, {}, {"type": "image", "text": "graphify"}],
                       [{"type": "text", "text": None}], [{"type": "text", "text": "   "}]):
            with self.subTest(prompt=prompt):
                result = self.route(prompt, host="kimi")
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    def test_kimi_off_disables_string_and_block_prompts(self):
        for prompt in ("use graphify", [{"type": "text", "text": "use graphify"}]):
            with self.subTest(prompt=prompt):
                result = self.route(prompt, host="kimi", OPENSPACE_ROUTE="off")
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    def test_kimi_nontext_never_reaches_ranker(self):
        ranker = self.modules / "openspace/skill_engine/skill_ranker.py"
        ranker.write_text(FAKE_RANKER.replace(
            "        corpus = [self._tokenize",
            "        import os\n        from pathlib import Path\n"
            "        Path(os.environ['QUERY_CAPTURE']).write_text(query)\n"
            "        corpus = [self._tokenize",
        ), encoding="utf-8")
        capture = self.work / "query.txt"
        blocks = [{"type": "image", "text": "scrapling privateimage"},
                  {"type": "tool", "text": "privatetool"},
                  {"type": "text", "text": "use graphify"}]
        result = self.route(blocks, host="kimi", QUERY_CAPTURE=str(capture))
        self.assertEqual((result.returncode, result.stderr), (0, ""))
        self.assertIn("graphify", result.stdout)
        self.assertEqual(capture.read_text(encoding="utf-8"), "graphify")
        capture.unlink()
        result = self.route(blocks[:2], host="kimi", QUERY_CAPTURE=str(capture), OPENSPACE_ROUTE_DEBUG="1")
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
        self.assertFalse(capture.exists())

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

    def test_cached_full_corpus_scores_and_gates_match_original_ranker(self):
        # Identical descriptions exercise stable ties across the top-10 boundary.
        write_catalog(self.catalog, {
            f"tie-{n:02}": ("quasar telescope observation", "quasar telescope")
            for n in range(15)
        })
        program = '''import copy, importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("route_prompt", sys.argv[1])
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
from openspace.skill_engine.skill_ranker import SkillRanker
original_bm25 = SkillRanker.bm25_only
cache_sizes = []
def spy(self, *args, **kwargs):
    cells = getattr(self._tokenize, "__closure__", None) or ()
    cache_sizes.append(max((len(cell.cell_contents) for cell in cells
                            if isinstance(cell.cell_contents, dict)), default=0))
    return original_bm25(self, *args, **kwargs)
SkillRanker.bm25_only = spy
skills = router.load_index([Path(sys.argv[2])])
baseline = copy.deepcopy(skills)
for skill in baseline:
    skill.pop("bm25_tokens", None)
def project(result):
    suggestions, explained = result
    return ([item["skill"]["name"] for item in suggestions], [
        (item["skill"]["name"], item["score"], item["anchors"],
         item["coverage"], item["named"], item["qualified"])
        for item in explained
    ])
for prompt in ("quasar telescope", "graphify로 코드베이스 그래프 만들어줘",
               "한강 수위 알려줘", "scrape a JS-rendered page",
               "xylophone unmatched vocabulary", "approved"):
    old = project(router.rank(prompt, baseline, 3))
    new = project(router.rank(prompt, skills, 3))
    if sys.argv[3] == "real" and prompt != "approved":
        assert cache_sizes[-1] == len(skills), (prompt, cache_sizes[-1], len(skills))
    assert new == old, (prompt, old, new)
    if prompt == "quasar telescope":
        assert len(old[1]) == 10, old
'''
        result = subprocess.run([self.python, "-B", "-c", program, str(ROUTER), str(self.catalog),
                                 "real" if isinstance(self, RealOpenSpace) else "fake"],
                                text=True, capture_output=True, env=self.env, timeout=60)
        self.assertEqual((result.returncode, result.stderr), (0, ""))

    def test_cached_ranking_and_gates_match_fresh_processes(self):
        prompts = ("use graphify and scrapling", "scrape a JS-rendered page",
                   "한강 수위 알려줘", "make it better", "approved")
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                fresh_cache = str(self.work / ("fresh-" + str(prompts.index(prompt))))
                cold = self.route(prompt, host="text", OPENSPACE_ROUTE_CACHE=fresh_cache)
                warm = self.route(prompt, host="text", OPENSPACE_ROUTE_CACHE=fresh_cache)
                self.assertEqual((cold.returncode, cold.stderr), (0, ""))
                self.assertEqual((warm.returncode, warm.stdout, warm.stderr),
                                 (cold.returncode, cold.stdout, cold.stderr))

    def test_cache_tracks_removed_skills_and_distinct_roots(self):
        self.assertEqual(self.suggested("sourdough bread recipe"), [])
        other = self.work / "other-skills"
        write_catalog(other)
        write_catalog(other, {"baking": ("Bake sourdough bread at home.", "flour water salt")})
        self.assertEqual(self.suggested("sourdough bread recipe", OPENSPACE_HOST_SKILL_DIRS=str(other)), ["baking"])
        self.assertEqual(self.suggested("sourdough bread recipe"), [])
        self.assertEqual(self.suggested("sourdough bread recipe", OPENSPACE_HOST_SKILL_DIRS=str(other)), ["baking"])
        (other / "baking/SKILL.md").unlink()
        self.assertEqual(self.suggested("sourdough bread recipe", OPENSPACE_HOST_SKILL_DIRS=str(other)), [])

    def test_corrupt_index_is_rebuilt_without_affecting_results(self):
        expected = self.suggested("scrape a JS-rendered page")
        self.assertEqual(expected, ["scrapling"])
        (self.work / "cache/index.json").write_text("{broken", encoding="utf-8")
        self.assertEqual(self.suggested("scrape a JS-rendered page"), expected)
        self.assertIsInstance(json.loads((self.work / "cache/index.json").read_text()), dict)

    def test_nonobject_index_falls_back_for_routing_and_explain(self):
        prompt = "scrape a JS-rendered page"
        explain = lambda: subprocess.run([self.python, "-B", str(ROUTER), "--explain", prompt],
                                         text=True, capture_output=True, env=self.env, timeout=60)
        route_expected = self.route(prompt, host="text")
        explain_expected = explain()
        for result in (route_expected, explain_expected):
            self.assertEqual((result.returncode, result.stderr), (0, ""))
            self.assertIn("scrapling", result.stdout)
        cache_file = self.work / "cache/index.json"
        for invalid in ([], None, "invalid", 42):
            for run, expected in ((lambda: self.route(prompt, host="text"), route_expected),
                                  (explain, explain_expected)):
                with self.subTest(invalid=invalid, command="explain" if run is explain else "route"):
                    cache_file.write_text(json.dumps(invalid), encoding="utf-8")
                    actual = run()
                    self.assertEqual((actual.returncode, actual.stdout, actual.stderr),
                                     (expected.returncode, expected.stdout, expected.stderr))
                    self.assertIsInstance(json.loads(cache_file.read_text()), dict)

    def test_invalid_nested_index_entries_rebuild(self):
        prompt = "scrape a JS-rendered page"
        original = self.route(prompt, host="text")
        self.assertEqual((original.returncode, original.stderr), (0, ""))
        self.assertIn("scrapling", original.stdout)
        cache_file = self.work / "cache/index.json"
        valid_cache = json.loads(cache_file.read_text())
        path = str(self.catalog / "scrapling/SKILL.md")
        for invalid in (None, [], {}, {"mtime_ns": 1, "size": 2, "name": "scrapling"}):
            with self.subTest(entry=invalid):
                cache = json.loads(json.dumps(valid_cache))
                cache["skills"][path] = invalid
                cache_file.write_text(json.dumps(cache), encoding="utf-8")
                result = self.route(prompt, host="text")
                self.assertEqual((result.returncode, result.stdout, result.stderr),
                                 (original.returncode, original.stdout, original.stderr))
        valid_cache["skills"] = []
        cache_file.write_text(json.dumps(valid_cache), encoding="utf-8")
        result = self.route(prompt, host="text")
        self.assertEqual((result.returncode, result.stdout, result.stderr),
                         (original.returncode, original.stdout, original.stderr))

    def test_changed_upstream_tokenizer_retokenizes_cached_corpus(self):
        prompt = "scrape a JS-rendered page"
        self.assertIn("scrapling", self.route(prompt, host="text").stdout)
        guard = Path(self.env["PYTHONPATH"]) / "sitecustomize.py"
        with guard.open("a", encoding="utf-8") as out:
            out.write('''
import os
from pathlib import Path
from openspace.utils.logging import Logger
Logger.configure(log_to_console=False, log_to_file=None)
from openspace.skill_engine.skill_ranker import SkillRanker
original_tokenize = SkillRanker._tokenize
def changed_tokenize(text):
    with Path(os.environ["TOKEN_CAPTURE"]).open("a") as capture:
        capture.write(text + "\\n")
    return [token + "drift" for token in original_tokenize(text)]
SkillRanker._tokenize = staticmethod(changed_tokenize)
''')
        capture = self.work / "tokenizer-calls.txt"
        cached = self.route(prompt, host="text", TOKEN_CAPTURE=str(capture))
        self.assertEqual((cached.returncode, cached.stderr), (0, ""))
        self.assertIn("scrapling scrape js-rendered", capture.read_text())
        fresh = self.route(prompt, host="text", TOKEN_CAPTURE=str(capture),
                           OPENSPACE_ROUTE_CACHE=str(self.work / "fresh-tokenizer-cache"))
        self.assertEqual((cached.returncode, cached.stdout, cached.stderr),
                         (fresh.returncode, fresh.stdout, fresh.stderr))

    def test_malformed_cached_tokens_do_not_change_routing(self):
        expected = self.suggested("scrape a JS-rendered page")
        self.assertEqual(expected, ["scrapling"])
        cache_file = self.work / "cache/index.json"
        cache = json.loads(cache_file.read_text())
        cache["skills"][str(self.catalog / "scrapling/SKILL.md")]["bm25_tokens"] = None
        cache_file.write_text(json.dumps(cache), encoding="utf-8")
        self.assertEqual(self.suggested("scrape a JS-rendered page"), expected)

    def test_nul_joined_cached_tokens_cannot_bypass_digest(self):
        prompt = "scrape a JS-rendered page"
        original = self.route(prompt, host="text")
        self.assertEqual((original.returncode, original.stderr), (0, ""))
        self.assertIn("scrapling", original.stdout)
        cache_file = self.work / "cache/index.json"
        cache = json.loads(cache_file.read_text())
        entry = cache["skills"][str(self.catalog / "scrapling/SKILL.md")]
        tokens = entry["bm25_tokens"]
        self.assertGreater(len(tokens), 1)
        entry["bm25_tokens"] = [tokens[0] + "\0" + tokens[1], *tokens[2:]]
        cache_file.write_text(json.dumps(cache), encoding="utf-8")
        actual = self.route(prompt, host="text")
        self.assertEqual((actual.returncode, actual.stdout, actual.stderr),
                         (original.returncode, original.stdout, original.stderr))

    def test_concurrent_cold_routes_produce_consistent_results(self):
        prompt = "scrape a JS-rendered page"
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.route(prompt, host="text"), range(8)))
        for result in results:
            self.assertEqual((result.returncode, result.stderr), (0, ""))
            self.assertEqual(result.stdout, results[0].stdout)
        self.assertIn("scrapling", results[0].stdout)
        self.assertEqual(self.route(prompt, host="text").stdout, results[0].stdout)

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

    def test_kimi_nontext_never_reaches_ranker(self):
        guard = Path(self.env["PYTHONPATH"]) / "sitecustomize.py"
        with guard.open("a", encoding="utf-8") as out:
            out.write('''
import os
from pathlib import Path
from openspace.utils.logging import Logger
Logger.configure(log_to_console=False, log_to_file=None)
from openspace.skill_engine.skill_ranker import SkillRanker
original_bm25_only = SkillRanker.bm25_only
def capture_query(self, query, *args, **kwargs):
    Path(os.environ["QUERY_CAPTURE"]).write_text(query)
    return original_bm25_only(self, query, *args, **kwargs)
SkillRanker.bm25_only = capture_query
''')
        super().test_kimi_nontext_never_reaches_ranker()

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

    def test_status_flags_a_router_copy_that_lags_its_source(self):
        self.assertEqual(self.hooks("install", "--host", "jeopi").returncode, 0)
        self.assertNotIn("stale", self.hooks("status", "--host", "jeopi").stdout)
        router = self.home / ".agents/hooks/openspace-route.py"
        router.write_text(router.read_text(encoding="utf-8") + "\n# older build\n", encoding="utf-8")
        stale = self.hooks("status", "--host", "jeopi")
        self.assertEqual(stale.returncode, 0, stale.stdout + stale.stderr)
        self.assertIn("stale", stale.stdout)
        self.assertEqual(self.hooks("install", "--host", "jeopi").returncode, 0)
        self.assertNotIn("stale", self.hooks("status", "--host", "jeopi").stdout)

    def hooks(self, *args):
        return subprocess.run([sys.executable, "-B", str(HOOKS), *args], capture_output=True, text=True,
                              env=self.hook_env, timeout=60)

    def snapshot(self):
        return {str(p.relative_to(self.home)): p.read_bytes() for p in sorted(self.home.rglob("*")) if p.is_file()}

    def test_agy_install_and_remove_preserve_named_hooks_and_gemini_settings(self):
        path = self.home / ".gemini/config/hooks.json"
        original = {"user-hook": {"enabled": False, "PreInvocation": [
            {"type": "command", "command": "existing-command", "timeout": 7}]}}
        self.write(path, original)
        path.chmod(0o640)
        gemini_before = self.files["gemini"].read_bytes()
        result = self.hooks("install", "--host", "agy")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        installed = json.loads(path.read_text())
        self.assertEqual(installed["user-hook"], original["user-hook"])
        handlers = installed["openspace-route"]["PreInvocation"]
        self.assertEqual(len(handlers), 1)
        self.assertEqual(handlers[0]["type"], "command")
        self.assertIn("openspace-route.sh agy", handlers[0]["command"])
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
        self.assertEqual(self.files["gemini"].read_bytes(), gemini_before)
        payload = json.dumps({"lastUserInput": "use graphify", "invocationNum": 1})
        routed = subprocess.run(["/bin/sh", "-c", handlers[0]["command"]], input=payload,
                                text=True, capture_output=True, env=self.hook_env, timeout=60)
        self.assertEqual((routed.returncode, routed.stderr), (0, ""))
        self.assertIn("graphify", json.loads(routed.stdout)["injectSteps"][0]["ephemeralMessage"])
        (self.venv / "bin/python").unlink()
        missing = subprocess.run(["/bin/sh", "-c", handlers[0]["command"]], input=payload,
                                 text=True, capture_output=True, env=self.hook_env, timeout=60)
        self.assertEqual((missing.returncode, missing.stderr), (0, ""))
        self.assertEqual(json.loads(missing.stdout), {})
        (self.venv / "bin/python").symlink_to(sys.executable)
        again = self.hooks("install", "--host", "agy")
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertEqual(json.loads(path.read_text()), installed)
        removed = self.hooks("remove", "--host", "agy")
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(json.loads(path.read_text()), original)
        self.assertEqual(self.files["gemini"].read_bytes(), gemini_before)

    def test_agy_refuses_unmanaged_name_and_invalid_config(self):
        path = self.home / ".gemini/config/hooks.json"
        for content in ('{"openspace-route": {"PreInvocation": [{"command": "user-command"}]}}',
                        '{invalid json', '[]'):
            with self.subTest(content=content):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
                before = self.snapshot()
                result = self.hooks("install", "--host", "agy")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(path.read_text(), content)
                self.assertEqual(self.files["gemini"].read_text(), self.originals["gemini"])
                self.assertEqual(path.read_bytes(), before[str(path.relative_to(self.home))])

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
        for host in ("pi", "gjc", "jeo"):
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

    def test_wrapper_with_spaces_in_venv_and_skill_paths(self):
        spaced = self.work / "venv with spaces"
        (spaced / "bin").mkdir(parents=True)
        (spaced / "bin/python").symlink_to(sys.executable)
        catalog = self.work / "skills with spaces"
        write_catalog(catalog)
        self.hook_env.update(OPENSPACE_VENV=str(spaced), SKILLS_ROOT=str(catalog))
        self.assertEqual(self.hooks("install", "--host", "claude").returncode, 0)
        wrapper = self.home / ".agents/hooks/openspace-route.sh"
        result = subprocess.run(["/bin/sh", str(wrapper), "claude"],
                                input=json.dumps({"prompt": "use graphify"}), text=True,
                                capture_output=True, env={**self.env, "OPENSPACE_HOST_SKILL_DIRS": ""}, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
        self.assertIn(str(catalog / "graphify/SKILL.md"), context)

    def test_install_and_remove_preserve_existing_empty_hook_entries(self):
        original = {"hooks": {"UserPromptSubmit": [{"hooks": []}, {"matcher": "other", "hooks": []}]}}
        self.write(self.files["claude"], original)
        self.assertEqual(self.hooks("install", "--host", "claude").returncode, 0)
        installed = json.loads(self.files["claude"].read_text())
        self.assertEqual(installed["hooks"]["UserPromptSubmit"][:2], original["hooks"]["UserPromptSubmit"])
        self.assertEqual(self.hooks("remove", "--host", "claude").returncode, 0)
        self.assertEqual(json.loads(self.files["claude"].read_text()), original)

    def test_unmanaged_shared_runtime_files_are_not_overwritten(self):
        for filename in ("openspace-route.sh", "openspace-route.py"):
            with self.subTest(filename=filename):
                hook_dir = self.home / ".agents/hooks"
                hook_dir.mkdir(parents=True, exist_ok=True)
                foreign = hook_dir / filename
                foreign.write_text("user owned runtime\n")
                before = self.snapshot()
                result = self.hooks("install", "--host", "claude")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(foreign.read_text(), "user owned runtime\n")
                self.assertEqual(self.snapshot(), before)
                foreign.unlink()

    def test_failed_host_removal_preserves_shared_runtime(self):
        self.assertEqual(self.hooks("install").returncode, 0)
        wrapper = self.home / ".agents/hooks/openspace-route.sh"
        router = self.home / ".agents/hooks/openspace-route.py"
        before = (wrapper.read_bytes(), router.read_bytes())
        self.files["claude"].write_text("{invalid json")
        removed = self.hooks("remove")
        self.assertNotEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual((wrapper.read_bytes(), router.read_bytes()), before)

    def test_remove_restores_configs_and_deletes_generated_files(self):
        self.assertEqual(self.hooks("install").returncode, 0)
        result = self.hooks("remove")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in ("claude", "codex", "gemini"):
            self.assertEqual(json.loads(self.files[name].read_text()), json.loads(self.originals[name]))
        self.assertEqual(tomllib.loads(self.files["kimi"].read_text()), tomllib.loads(self.originals["kimi"]))
        leftovers = [p for p in self.home.rglob("openspace-route*")]
        self.assertEqual(leftovers, [])

    def test_kimi_remove_preserves_following_comments_and_section(self):
        self.assertEqual(self.hooks("install", "--host", "kimi").returncode, 0)
        with self.files["kimi"].open("a", encoding="utf-8") as config:
            config.write("\n# User note for custom settings\n[custom]\nvalue = 42\n")
        removed = self.hooks("remove", "--host", "kimi")
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        text = self.files["kimi"].read_text()
        self.assertIn("# User note for custom settings", text)
        parsed = tomllib.loads(text)
        self.assertEqual(parsed["custom"]["value"], 42)
        self.assertEqual([hook["command"] for hook in parsed["hooks"]], ["other-kimi"])

    def test_jeo_registers_a_pre_prompt_entry_in_its_own_hook_registry(self):
        jeo = self.home / ".jeo"
        registry = jeo / "hooks.json"
        config = jeo / "config.json"
        jeo.mkdir()
        config.write_text('{"defaultModel": "m", "oauth": {"anthropic": "secret"}}\n')
        original = {"enabled": True, "hooks": [{"event": "turn-end", "run": "other-turn-end", "timeoutMs": 5000}]}
        self.write(registry, original)
        registry.chmod(0o640)
        config_before = config.read_bytes()
        status = self.hooks("status", "--host", "jeo")
        self.assertIn("not installed", status.stdout)
        result = self.hooks("install", "--host", "jeo")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("jeo-code build with pre-prompt hooks", result.stdout)
        wrapper = self.home / ".agents/hooks/openspace-route.sh"
        installed = json.loads(registry.read_text())
        self.assertEqual(installed["enabled"], True)
        self.assertEqual(installed["hooks"][0], original["hooks"][0])
        self.assertEqual(installed["hooks"][1:], [{"event": "pre-prompt", "run": f"/bin/sh {wrapper} jeo", "timeoutMs": 10000}])
        self.assertEqual(stat.S_IMODE(registry.stat().st_mode), 0o640)
        self.assertEqual(config.read_bytes(), config_before, "credentials config is never touched")
        self.assertIn("installed", self.hooks("status", "--host", "jeo").stdout)
        # The registered command is the real thing: jeo's pre-prompt payload yields a Claude-style context object.
        routed = subprocess.run(["/bin/sh", "-c", installed["hooks"][1]["run"]], input=json.dumps({"prompt": "use graphify", "hook_event_name": "UserPromptSubmit"}),
                                text=True, capture_output=True, env=self.hook_env, timeout=60)
        self.assertEqual((routed.returncode, routed.stderr), (0, ""))
        self.assertIn("graphify", json.loads(routed.stdout)["hookSpecificOutput"]["additionalContext"])
        again = self.hooks("install", "--host", "jeo")
        self.assertIn("unchanged", again.stdout)
        self.assertEqual(json.loads(registry.read_text()), installed)
        removed = self.hooks("remove", "--host", "jeo")
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(json.loads(registry.read_text())["hooks"], original["hooks"])
        self.assertEqual(config.read_bytes(), config_before)

    def test_jeo_install_creates_the_registry_only_when_jeo_is_present(self):
        result = self.hooks("install", "--host", "jeo")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("skipped", result.stdout)
        self.assertFalse((self.home / ".jeo").exists())
        (self.home / ".jeo").mkdir()
        self.assertEqual(self.hooks("install", "--host", "jeo").returncode, 0)
        data = json.loads((self.home / ".jeo/hooks.json").read_text())
        self.assertEqual([h["event"] for h in data["hooks"]], ["pre-prompt"])
        self.assertNotIn("enabled", data, "the registry runs without an enabled flag")

    def test_jeo_honors_jeo_config_dir_and_flags_a_disabled_registry(self):
        custom = self.work / "jeo-config"
        custom.mkdir()
        self.hook_env["JEO_CONFIG_DIR"] = str(custom)
        self.assertEqual(self.hooks("install", "--host", "jeo").returncode, 0)
        self.assertTrue((custom / "hooks.json").is_file())
        self.assertFalse((self.home / ".jeo").exists())
        data = json.loads((custom / "hooks.json").read_text())
        data["enabled"] = False
        (custom / "hooks.json").write_text(json.dumps(data))
        self.assertIn("registry disabled", self.hooks("status", "--host", "jeo").stdout)

    def test_jeo_refuses_a_malformed_registry_without_touching_it(self):
        (self.home / ".jeo").mkdir()
        registry = self.home / ".jeo/hooks.json"
        for content in ("{invalid json", "[]", '{"hooks": {"not": "a list"}}'):
            with self.subTest(content=content):
                registry.write_text(content)
                result = self.hooks("install", "--host", "jeo")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(registry.read_text(), content)

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
        for host in ("jeopi", "omp", "pi", "gjc"):
            with self.subTest(host=host):
                (self.home / f".{host}/agent").mkdir(parents=True, exist_ok=True)
                self.assertEqual(self.hooks("install", "--host", host).returncode, 0)
                extension = self.home / f".{host}/agent/extensions/openspace-route.ts"
                driver = self.work / "drive.ts"
                driver.write_text(f'''import register from {json.dumps(str(extension))};
const handlers: Record<string, any> = {{}};
register({{ on: (name: string, fn: any) => (handlers[name] = fn) }});
console.log(JSON.stringify(await handlers.before_agent_start({{ prompt: "use graphify" }})));
console.log(JSON.stringify(await handlers.before_agent_start({{ prompt: "hi" }})));
''')
                env = {**self.env, "PATH": os.environ["PATH"], "OPENSPACE_HOST_SKILL_DIRS": str(self.catalog)}
                result = subprocess.run(["bun", str(driver)], capture_output=True, text=True, timeout=60, env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
                routed, quiet = (json.loads(line) for line in result.stdout.splitlines())
                self.assertEqual((routed["message"]["customType"], routed["message"]["display"]), ("openspace-route", False))
                self.assertIn("graphify", routed["message"]["content"])
                self.assertEqual(quiet, {})
                disabled = subprocess.run(["bun", str(driver)], capture_output=True, text=True, timeout=60,
                                          env={**env, "OPENSPACE_ROUTE": "off"})
                self.assertEqual(disabled.returncode, 0, disabled.stderr)
                self.assertEqual([json.loads(line) for line in disabled.stdout.splitlines()], [{}, {}])

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

    def test_redirected_orca_and_env_homes_receive_hooks(self):
        orca = self.work / "orca-data"
        claude_profile = orca / "claude-profiles/12345678-aaaa/home"
        codex_runtime = orca / "codex-runtime-home/home"
        codex_account = orca / "codex-accounts/87654321-bbbb/home"
        env_claude = self.work / "custom-claude"
        env_codex = self.work / "custom-codex"
        for home_dir, filename in (
            (claude_profile, "settings.json"),
            (codex_runtime, "hooks.json"),
            (codex_account, "hooks.json"),
            (env_claude, "settings.json"),
            (env_codex, "hooks.json"),
        ):
            home_dir.mkdir(parents=True)
            (home_dir / filename).write_text("{}\n", encoding="utf-8")
        # Credentials-only directory without settings/hooks file is ignored.
        (orca / "claude-profiles/99999999-empty/home").mkdir(parents=True)

        env = {
            **self.hook_env,
            "ORCA_USER_DATA_PATH": str(orca),
            "CLAUDE_CONFIG_DIR": str(env_claude),
            "CODEX_HOME": str(env_codex),
        }
        result = subprocess.run([sys.executable, "-B", str(HOOKS), "install"],
                                capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for key in (
            "claude@orca-12345678",
            "codex@orca-runtime",
            "codex@orca-87654321",
            "claude@claude_config_dir",
            "codex@codex_home",
        ):
            self.assertIn(key, result.stdout)
        for home_dir, filename in (
            (claude_profile, "settings.json"),
            (codex_runtime, "hooks.json"),
            (codex_account, "hooks.json"),
            (env_claude, "settings.json"),
            (env_codex, "hooks.json"),
        ):
            data = json.loads((home_dir / filename).read_text(encoding="utf-8"))
            self.assertIn("UserPromptSubmit", data["hooks"])


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


    def test_skip_mcp_flag_installs_runtime_and_leaves_host_configs_unchanged(self):
        claude = self.home / ".claude.json"
        claude_bytes = b'{"mcpServers": {"sentinel": "keep"}}\n'
        claude.write_bytes(claude_bytes)
        codex = self.home / ".codex/config.toml"
        codex.parent.mkdir(parents=True)
        codex_bytes = b'[mcp_servers.sentinel]\ncommand = "keep"\n'
        codex.write_bytes(codex_bytes)
        gemini = self.home / ".gemini/settings.json"
        gemini.parent.mkdir(parents=True)
        gemini_bytes = b'{"mcpServers": {"sentinel": {}}}\n'
        gemini.write_bytes(gemini_bytes)
        (self.venv / "bin").mkdir(parents=True)
        (self.venv / "bin/python").symlink_to(sys.executable)

        result = self.install("--skip-mcp")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(claude.read_bytes(), claude_bytes)
        self.assertEqual(codex.read_bytes(), codex_bytes)
        self.assertEqual(gemini.read_bytes(), gemini_bytes)
        self.assertFalse((self.home / ".agents/hooks").exists())

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
