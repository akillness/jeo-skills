#!/usr/bin/env python3
"""Offline contract tests for the image-to-github-repo skill.

Run from the repository root:
    python3 -B scripts/test_image_to_github_repo.py -v

The resolver is exercised end to end as a subprocess against a loopback stub of the
GitHub REST API, so no test touches the network or a real token. The catalog tests
check that the skill, manifest, projections, setup guide, changelog and CI stay in sync.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".agent-skills" / "image-to-github-repo"
SCRIPT = SKILL / "scripts" / "resolve_repo.py"
NAME = "image-to-github-repo"

_spec = importlib.util.spec_from_file_location("resolve_repo", SCRIPT)
rr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rr)


def item(full_name, stars, description="", archived=False, fork=False, topics=()):
    return {
        "full_name": full_name,
        "html_url": f"https://github.com/{full_name}",
        "description": description,
        "stargazers_count": stars,
        "archived": archived,
        "fork": fork,
        "pushed_at": "2026-11-01T00:00:00Z",
        "license": {"spdx_id": "MIT"},
        "topics": list(topics),
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parts = urlsplit(self.path)
        params = {k: v[0] for k, v in parse_qs(parts.query).items()}
        self.server.requests.append({"path": parts.path, "params": params, "headers": dict(self.headers)})
        status, headers, body = self.server.respond(parts.path, params, self.server)
        payload = json.dumps(body).encode()
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class Stub(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, respond):
        super().__init__(("127.0.0.1", 0), Handler)
        self.respond = respond
        self.requests = []

    @property
    def base(self):
        return f"http://127.0.0.1:{self.server_address[1]}"


def search_table(table):
    """Respond to search requests from {query string: [items]}; everything else is a 404."""

    def respond(path, params, server):
        if path == "/search/repositories":
            items = table.get(params.get("q"), [])
            return 200, {"x-ratelimit-remaining": "9"}, {"total_count": len(items), "items": items}
        return 404, {}, {"message": "Not Found"}

    return respond


class CliCase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="image-to-github-repo-")
        self.addCleanup(temp.cleanup)
        self.home = temp.name

    def serve(self, respond):
        server = Stub(respond)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close()))
        return server

    def run_cli(self, *args, base, env=None, stdin=None):
        environment = {"PATH": os.environ.get("PATH", ""), "HOME": self.home,
                       "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
        environment.update(env or {})
        command = [sys.executable, "-B", str(SCRIPT)]
        if base is not None:
            command += ["--api-base", base, "--timeout", "5"]
        return subprocess.run(command + list(args), capture_output=True, text=True, env=environment,
                              input=stdin, timeout=60, encoding="utf-8")

    def resolve(self, respond, *args, env=None):
        server = self.serve(respond)
        proc = self.run_cli(*args, base=server.base, env=env)
        report = json.loads(proc.stdout) if proc.stdout.strip().startswith("{") else None
        return proc, report, server

    def only(self, report):
        self.assertEqual(len(report["results"]), 1)
        return report["results"][0]


class ParsingTests(unittest.TestCase):
    def test_parse_count_accepts_printed_forms(self):
        for text, expected in [("31600", 31600), ("12,886", 12886), ("1.2k", 1200), ("1.5M", 1_500_000),
                               ("3.16만", 31600), ("3.16만 개", 31600), ("3만 1천", 31000), ("2억", 200_000_000),
                               ("12.9k stars", 12900)]:
            with self.subTest(text=text):
                self.assertEqual(rr.parse_count(text), expected)

    def test_parse_count_rejects_ambiguous_or_hostile_text(self):
        for text in ["", "abc", "1 2", "stars", "9" * 60, "3.16만 forks", "k"]:
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    rr.parse_count(text)

    def test_parse_repo_ref_normalizes_github_references(self):
        cases = {
            "https://github.com/FujiwaraChoki/MoneyPrinterV2": ("FujiwaraChoki", "MoneyPrinterV2"),
            "github.com/a/b/tree/main/src": ("a", "b"),
            "https://www.github.com/o/r.git": ("o", "r"),
            "git@github.com:o/r.git": ("o", "r"),
            "https://gitingest.com/o/r": ("o", "r"),
            "o/r": ("o", "r"),
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(rr.parse_repo_ref(text), expected)
        for text in ["https://example.com/o/r", "https://github.com/orgs/foo", "https://github.com/onlyowner",
                     "Agent S", "a/b/c", "", "https://github.com/o/ r"]:
            with self.subTest(text=text):
                self.assertIsNone(rr.parse_repo_ref(text))

    def test_normalize_and_query_variants(self):
        self.assertEqual(rr.normalize("Agent S"), rr.normalize("agent-S"))
        self.assertEqual(rr.normalize("agent_s"), "agents")
        self.assertEqual(rr.query_variants("Agent S"), ["Agent-S", "AgentS", "Agent S"])
        self.assertEqual(rr.query_variants('Money"Printer'), ["Money-Printer", "MoneyPrinter", "Money Printer"])
        self.assertEqual(rr.query_variants("gitingest"), ["gitingest"])

    def test_hint_words_drop_stop_words(self):
        self.assertEqual(rr.hint_words(["Free open source tool for computer use"]), ["computer", "use"])

    def test_token_reaches_only_the_github_api_host(self):
        self.assertEqual(rr.Client("https://api.github.com", 1, "tok").token, "tok")
        for base in ["http://api.github.com", "https://api.github.com.evil.example", "http://127.0.0.1:1",
                     "https://example.com"]:
            with self.subTest(base=base):
                self.assertIsNone(rr.Client(base, 1, "tok").token)


class ResolveTests(CliCase):
    def test_explicit_link_is_verified_and_token_stays_local(self):
        def respond(path, params, server):
            self.assertEqual(path, "/repos/FujiwaraChoki/MoneyPrinterV2")
            return 200, {"x-ratelimit-remaining": "58", "x-ratelimit-limit": "60"}, item(
                "FujiwaraChoki/MoneyPrinterV2", 32305, "Automate the process of making money online.")

        proc, report, server = self.resolve(respond, "--url", "https://github.com/FujiwaraChoki/MoneyPrinterV2",
                                            "--stars", "3.16만", env={"GITHUB_TOKEN": "secret-token-value"})
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["confidence"]), (0, "verified", "verified"))
        self.assertEqual(result["match"]["html_url"], "https://github.com/FujiwaraChoki/MoneyPrinterV2")
        self.assertEqual(report["rate_limit"]["remaining"], 58)
        self.assertFalse(report["authenticated"])
        self.assertNotIn("Authorization", {k.title() for k in server.requests[0]["headers"]})
        self.assertNotIn("secret-token-value", proc.stdout + proc.stderr)

    def test_renamed_repository_reports_the_current_url(self):
        def respond(path, params, server):
            if path == "/repos/cyclotruc/gitingest":
                return 301, {"Location": f"{server.base}/repositories/895942941"}, {"message": "Moved Permanently"}
            return 200, {}, item("coderamp-labs/gitingest", 16085, "Replace 'hub' with 'ingest'")

        proc, report, _ = self.resolve(respond, "--url", "github.com/cyclotruc/gitingest")
        result = self.only(report)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["match"]["full_name"], "coderamp-labs/gitingest")
        self.assertEqual(result["match"]["renamed_from"], "cyclotruc/gitingest")
        self.assertTrue(any("redirects to coderamp-labs/gitingest" in n for n in result["notes"]))

    def test_redirect_to_another_host_is_refused(self):
        def respond(path, params, server):
            port = server.server_address[1]
            return 301, {"Location": f"http://localhost:{port}/stolen"}, {"message": "Moved"}

        proc, report, server = self.resolve(respond, "--url", "o/r")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["error"]["code"]), (1, "redirect_off_host"))
        self.assertFalse(any(r["headers"]["Host"].startswith("localhost") for r in server.requests))

    def test_missing_printed_link_is_not_repaired_by_search(self):
        proc, report, server = self.resolve(search_table({}), "--url", "ghost/missing", "--name", "missing")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["confidence"]), (1, "not_found", "none"))
        self.assertEqual([r["path"] for r in server.requests], ["/repos/ghost/missing"])

    def test_printed_stars_outside_the_window_are_flagged_on_a_verified_link(self):
        proc, report, _ = self.resolve(lambda p, q, s: (200, {}, item("o/r", 5000, "x")),
                                       "--url", "o/r", "--stars", "100")
        result = self.only(report)
        self.assertEqual(result["status"], "verified")
        self.assertTrue(any("outside the window" in n for n in result["notes"]))

    def test_unique_dominant_name_match_is_medium_without_hints(self):
        table = {'"MoneyPrinterV2" in:name': [item("FujiwaraChoki/MoneyPrinterV2", 32305, "money"),
                                              item("dylanpersonguy/MoneyPrinterV2", 15, "copy"),
                                              item("someone/MoneyPrinterV2-fork", 3, "partial")]}
        proc, report, server = self.resolve(search_table(table), "--name", "MoneyPrinterV2")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["confidence"]), (0, "resolved", "medium"))
        self.assertEqual(result["match"]["full_name"], "FujiwaraChoki/MoneyPrinterV2")
        self.assertTrue(any("name only" in n for n in result["notes"]))
        self.assertEqual(len(server.requests), 1)

    def test_same_named_repositories_without_hints_are_ambiguous(self):
        table = {'"fabric" in:name': [item("a/fabric", 100, "one"), item("b/fabric", 80, "two")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "fabric")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["match"]), (1, "ambiguous", None))
        self.assertEqual([a["full_name"] for a in result["alternatives"]], ["a/fabric", "b/fabric"])

    def test_keyword_selects_the_supported_repository_with_high_confidence(self):
        table = {'"Fabric" in:name': [
            item("danielmiessler/Fabric", 44558, "A framework using a crowdsourced set of AI prompts"),
            item("hyperledger/fabric", 16762, "enterprise-grade permissioned distributed ledger"),
            item("fabric/fabric", 15523, "Simple, Pythonic remote execution and deployment.")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "Fabric", "--hint", "prompts")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["confidence"]), (0, "high"))
        self.assertEqual(result["match"]["full_name"], "danielmiessler/Fabric")

    def test_a_missing_keyword_never_rules_out_a_more_popular_repository(self):
        table = {'"google-maps-scraper" in:name': [
            item("gosom/google-maps-scraper", 7381, "Extracts name, address, phone number and more"),
            item("omkarcloud/google-maps-scraper", 3880, "Lead generation tool for business emails")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "google-maps-scraper", "--hint", "business")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["match"]), (1, "ambiguous", None))
        self.assertEqual(result["alternatives"][0]["full_name"], "gosom/google-maps-scraper")

    def test_rivals_that_also_fit_downgrade_the_pick_to_medium(self):
        table = {'"google-maps-scraper" in:name': [
            item("gosom/google-maps-scraper", 7381, "Extracts name, address, phone number and email"),
            item("omkarcloud/google-maps-scraper", 3880, "Lead tool with phone numbers and emails")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "google-maps-scraper", "--hint", "phone")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["confidence"]), (0, "medium"))
        self.assertEqual(result["match"]["full_name"], "gosom/google-maps-scraper")
        self.assertTrue(any("verify" in n for n in result["notes"]))

    def test_printed_star_count_can_rule_out_the_popular_lookalike(self):
        table = {'"widget" in:name': [item("big/widget", 5000, "toolkit"), item("small/widget", 1100, "toolkit")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "widget", "--stars", "1천")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["confidence"]), (0, "high"))
        self.assertEqual(result["match"]["full_name"], "small/widget")

    def test_hint_words_already_in_the_name_corroborate_nothing(self):
        table = {'"foo-bar" in:name': [item("a/foo-bar", 100, "x"), item("b/foo-bar", 80, "y")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "foo-bar", "--hint", "foo bar")
        self.assertEqual(self.only(report)["status"], "ambiguous")

    def test_exact_names_that_miss_every_hint_are_low(self):
        table = {'"widget" in:name': [item("a/widget", 100, "toolkit")]}
        proc, report, _ = self.resolve(search_table(table), "--name", "widget", "--stars", "500000")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["confidence"], result["match"]),
                         (1, "candidates", "low", None))

    def test_partial_names_are_leads_not_answers(self):
        table = {'"Agent-S" in:name': [item("addyosmani/agent-skills", 113520, "skills")],
                 '"AgentS" in:name': [], '"Agent S" in:name': []}
        proc, report, _ = self.resolve(search_table(table), "--name", "Agent S")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["status"], result["match"]), (1, "candidates", None))
        self.assertEqual(result["alternatives"][0]["full_name"], "addyosmani/agent-skills")

    def test_search_without_results_is_not_found(self):
        proc, report, _ = self.resolve(search_table({}), "--name", "nothing-here")
        self.assertEqual((proc.returncode, self.only(report)["status"]), (1, "not_found"))

    def test_spellings_are_tried_in_order_and_stop_at_the_first_exact_name(self):
        table = {'"Agent-S" in:name': [item("addyosmani/agent-skills", 113520, "skills")],
                 '"AgentS" in:name': [item("simular-ai/Agent-S", 12887, "open source computer use agent")]}
        proc, report, server = self.resolve(search_table(table), "--name", "Agent S", "--hint", "computer use")
        result = self.only(report)
        self.assertEqual((proc.returncode, result["confidence"], result["match"]["full_name"]),
                         (0, "high", "simular-ai/Agent-S"))
        self.assertEqual([r["params"]["q"] for r in server.requests], ['"Agent-S" in:name', '"AgentS" in:name'])

    def test_archived_pick_is_flagged(self):
        table = {'"old" in:name': [item("a/old", 900, "legacy", archived=True)]}
        _, report, _ = self.resolve(search_table(table), "--name", "old")
        self.assertTrue(any("archived" in n for n in self.only(report)["notes"]))

    def test_rate_limit_stops_the_batch_without_further_requests(self):
        def respond(path, params, server):
            return 403, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000"}, {"message": "API rate limit exceeded"}

        batch = json.dumps([{"name": "one"}, {"name": "two"}, {"name": "three"}])
        server = self.serve(respond)
        proc = self.run_cli("--batch", "-", base=server.base, stdin=batch)
        report = json.loads(proc.stdout)
        self.assertEqual(proc.returncode, 1)
        self.assertEqual([r["error"]["code"] for r in report["results"]], ["rate_limited"] * 3)
        self.assertEqual(len(server.requests), 1)
        self.assertIn("GITHUB_TOKEN", report["results"][0]["error"]["message"])
        self.assertIn("2030-01-01", report["rate_limit"]["reset"])

    def test_secondary_rate_limit_message_is_recognised(self):
        respond = lambda p, q, s: (403, {}, {"message": "You have exceeded a secondary rate limit."})
        proc, report, _ = self.resolve(respond, "--name", "x")
        self.assertEqual(self.only(report)["error"]["code"], "rate_limited")

    def test_unreachable_api_is_a_network_error(self):
        proc = self.run_cli("--name", "x", base="http://127.0.0.1:1")
        report = json.loads(proc.stdout)
        self.assertEqual((proc.returncode, report["results"][0]["error"]["code"]), (1, "network"))

    def test_non_github_url_falls_back_to_the_name(self):
        table = {'"widget" in:name': [item("a/widget", 100, "toolkit")]}
        _, report, _ = self.resolve(search_table(table), "--url", "https://example.com/o/r", "--name", "widget")
        result = self.only(report)
        self.assertEqual(result["match"]["full_name"], "a/widget")
        self.assertIn("not a GitHub repository reference", result["notes"][0])

    def test_non_github_url_alone_is_an_error_result(self):
        proc, report, server = self.resolve(search_table({}), "--url", "https://example.com/o/r")
        self.assertEqual((proc.returncode, self.only(report)["error"]["code"], server.requests), (1, "unsupported_url", []))

    def test_batch_from_stdin_resolves_each_candidate(self):
        table = {'"alpha" in:name': [item("o/alpha", 500, "alpha tool")],
                 '"beta" in:name': [item("o/beta", 900, "beta tool")]}
        server = self.serve(search_table(table))
        batch = json.dumps({"candidates": [{"name": "alpha"}, {"name": "beta", "stars": 1000, "hints": "beta"}]})
        proc = self.run_cli("--batch", "-", base=server.base, stdin=batch)
        report = json.loads(proc.stdout)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual([r["match"]["full_name"] for r in report["results"]], ["o/alpha", "o/beta"])

    def test_markdown_lists_alternatives_for_unresolved_results(self):
        table = {'"fabric" in:name': [item("a/fabric", 100, "one"), item("b/fabric", 80, "two")]}
        server = self.serve(search_table(table))
        proc = self.run_cli("--name", "fabric", "--format", "markdown", base=server.base)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("| 1 | fabric | ambiguous | none |", proc.stdout)
        self.assertIn("Alternatives for fabric:", proc.stdout)
        self.assertIn("https://github.com/a/fabric (100 stars)", proc.stdout)

    def test_korean_text_survives_json_output(self):
        proc, report, _ = self.resolve(search_table({}), "--name", "x", "--stars", "3.16만")
        self.assertIn("3.16만", proc.stdout)
        self.assertEqual(self.only(report)["query"]["stars_hint"], 31600)


class InputTests(CliCase):
    def test_dry_run_prints_requests_and_never_connects(self):
        proc = self.run_cli("--name", "Agent S", "--dry-run", base="http://127.0.0.1:1")
        report = json.loads(proc.stdout)
        planned = report["results"][0]["planned_requests"]
        self.assertEqual(proc.returncode, 0)
        self.assertTrue(report["dry_run"])
        self.assertEqual(len(planned), 3)
        self.assertTrue(all(url.startswith("http://127.0.0.1:1/search/repositories?q=") for url in planned))
        proc = self.run_cli("--url", "github.com/simular-ai/Agent-S", "--dry-run", base="http://127.0.0.1:1")
        self.assertEqual(json.loads(proc.stdout)["results"][0]["planned_requests"],
                         ["http://127.0.0.1:1/repos/simular-ai/Agent-S"])

    def test_invalid_input_exits_2_with_a_message(self):
        big = json.dumps([{"name": f"n{i}"} for i in range(rr.MAX_BATCH + 1)])
        cases = [
            ([], None),
            (["--name", "x", "--stars", "abc"], None),
            (["--name", "x", "--limit", "0"], None),
            (["--batch", "-", "--name", "x"], "[]"),
            (["--batch", "-"], "not json"),
            (["--batch", "-"], "[]"),
            (["--batch", "-"], json.dumps([{"name": "x", "bogus": 1}])),
            (["--batch", "-"], json.dumps([{"owner": "only"}])),
            (["--batch", "-"], json.dumps([{"name": "x", "hints": [1]}])),
            (["--batch", "-"], json.dumps(["just a string"])),
            (["--batch", "-"], big),
            (["--batch", "/no/such/file.json"], None),
        ]
        for args, stdin in cases:
            with self.subTest(args=args, stdin=(stdin or "")[:30]):
                proc = self.run_cli(*args, base="http://127.0.0.1:1", stdin=stdin)
                self.assertEqual(proc.returncode, 2, proc.stdout)
                self.assertTrue(proc.stderr.strip())
                self.assertEqual(proc.stdout, "")
        proc = self.run_cli("--name", "x", "--api-base", "ftp://example.com", base=None)
        self.assertEqual(proc.returncode, 2)


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        cls.front = yaml.safe_load(text.split("---")[1])
        cls.manifest = json.loads((ROOT / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))

    def test_frontmatter_is_loadable_and_within_limits(self):
        front = self.front
        self.assertEqual(front["name"], NAME)
        description = " ".join(front["description"].split())
        self.assertLessEqual(len(description), 1024)
        self.assertIn("Use when", description)
        self.assertIn("Triggers on:", description)
        self.assertLessEqual(len(front["compatibility"]), 500)

    def test_manifest_entry_matches_the_skill(self):
        entry = next(s for s in self.manifest["skills"] if s["name"] == NAME)
        self.assertEqual(entry["description"], " ".join(self.front["description"].split()))
        self.assertEqual((entry["category"], entry["subcategory"], entry["interface"], entry["path"]),
                         ("research", "web-research", "workflow", f"{NAME}/SKILL.md"))
        self.assertEqual(entry["version"], self.front["metadata"]["version"])
        self.assertEqual(entry["allowed_tools"], self.front["allowed-tools"].split())
        self.assertIn(NAME, self.manifest["categories"]["research"])
        self.assertIn(NAME, self.manifest["subcategories"]["research"]["web-research"])
        self.assertEqual(self.manifest["skill_count"], len(self.manifest["skills"]))
        group = self.manifest["relationship_groups"]["github-repo-discovery"]
        self.assertEqual(group["members"], [NAME, "github-repo-candidate-quality-gate"])
        for member in group["members"]:
            self.assertTrue((ROOT / ".agent-skills" / member / "SKILL.md").is_file(), member)

    def test_route_outs_name_live_skills(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        live = {s["name"] for s in self.manifest["skills"]}
        for target in ["github-repo-candidate-quality-gate", "ghgrab", "research", "fabric", "moneyprinter-v2",
                       "agent-s", "google-maps-scraper", "gitingest"]:
            self.assertIn(f"`{target}`", text)
            self.assertIn(target, live)

    def test_relative_links_resolve(self):
        for document in sorted(SKILL.rglob("*.md")):
            for target in re.findall(r"\]\(([^)\s]+)\)", document.read_text(encoding="utf-8")):
                if target.startswith(("http://", "https://", "#")):
                    continue
                with self.subTest(document=document.name, target=target):
                    self.assertTrue((document.parent / target.split("#", 1)[0]).exists())

    def test_evals_cover_trigger_near_miss_and_catalog_sync(self):
        evals = json.loads((SKILL / "evals" / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(evals["skill_name"], NAME)
        ids = [e["id"] for e in evals["evals"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 3)
        for case in evals["evals"]:
            self.assertTrue(case["prompt"] and case["expected_output"] and len(case["assertions"]) >= 2, case["id"])
        prompts = " ".join(e["prompt"] + e["expected_output"] for e in evals["evals"])
        self.assertIn("github-repo-candidate-quality-gate", prompts)
        self.assertIn("generate-catalog-projections.py", prompts)

    def test_toon_summary_names_the_skill(self):
        toon = (SKILL / "SKILL.toon").read_text(encoding="utf-8")
        self.assertTrue(toon.startswith(f"N:{NAME}\n"))
        self.assertRegex(toon, r"(?m)^U\[\d+\]:$")

    def test_documented_script_flags_exist(self):
        help_text = subprocess.run([sys.executable, "-B", str(SCRIPT), "--help"], capture_output=True, text=True,
                                   encoding="utf-8", env={"PATH": os.environ.get("PATH", "")}).stdout
        skill = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for flag in re.findall(r"`(--[a-z-]+)", skill):
            with self.subTest(flag=flag):
                self.assertIn(flag, help_text)

    def test_readmes_list_the_skill_and_the_changelog_is_synced(self):
        for name in ["README.md", "README.ko.md", "README.es-ES.md"]:
            with self.subTest(readme=name):
                self.assertIn(f"| `{NAME}` |", (ROOT / name).read_text(encoding="utf-8"))
        for path in [ROOT / "changelog" / "en" / "2026-11.md", ROOT / "changelog" / "ko" / "2026-11.md",
                     ROOT / "CHANGELOG.md"]:
            with self.subTest(changelog=path.name):
                self.assertIn(NAME, path.read_text(encoding="utf-8"))

    def test_setup_guide_records_the_network_and_token_boundary(self):
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        start = guide.index("### Image-to-GitHub resolver")
        section = " ".join(guide[start:guide.index("\n---\n", start)].split())
        for needle in ["install image-to-github-repo --global --yes", "resolve_repo.py\" --help", "--dry-run",
                       "GITHUB_TOKEN", "api.github.com", "never printed", "25 candidates"]:
            with self.subTest(needle=needle):
                self.assertIn(needle, section)
        self.assertLess(start, guide.index("## Guard Boundaries"))
        self.assertGreater(start, guide.index("## Reference — on-demand skill runtimes"))

    def test_ci_runs_this_suite(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B scripts/test_image_to_github_repo.py -v", ci)


if __name__ == "__main__":
    unittest.main()
