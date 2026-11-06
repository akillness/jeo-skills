#!/usr/bin/env python3
"""Offline contract tests for the five source-pinned GitHub program operators.

Covers fabric, moneyprinter-v2, agent-s, google-maps-scraper and gitingest: their offline helpers,
catalog entries, the github-five-programs bundle, and the read-only readiness report that the
router, install.sh and install-full-tools.sh print for them.

Run from the repository root:
    python3 -B scripts/test_five_github_programs.py -v

Each helper runs as a real subprocess. Fixture PATH directories hold only inert shims (and, for
git identity tests, the real git directory); no upstream project, package manager, browser or
container tool is ever executed, and nothing touches the network.
"""
import collections
import contextlib
import hashlib
import io
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = ROOT / ".agent-skills"
BUNDLE = "github-five-programs"
BUNDLE_MEMBERS = ["fabric", "moneyprinter-v2", "agent-s", "google-maps-scraper", "gitingest"]

SPECS = {
    "moneyprinter-v2": {
        "repository": "FujiwaraChoki/MoneyPrinterV2", "commit": "a734fa924adb9ffe5ab8472aa5526e469e42a8b5",
        "spdx": "AGPL-3.0", "category": "business", "subcategory": "marketing",
        "route_outs": ["moneyprinter-turbo", "google-maps-scraper"],
    },
    "agent-s": {
        "repository": "simular-ai/Agent-S", "commit": "0fff0e634869dab72027435b4586e62300185d41",
        "spdx": "Apache-2.0", "category": "ai-agents", "subcategory": "agent-frameworks",
        "route_outs": ["browser-harness", "stagehand"],
    },
    "google-maps-scraper": {
        "repository": "gosom/google-maps-scraper", "commit": "903b96d7aa8863188022c04db220e44f3218c860",
        "spdx": "MIT", "category": "cli-tools", "subcategory": "automation-cli",
        "route_outs": ["moneyprinter-v2"],
    },
    "gitingest": {
        "repository": "coderamp-labs/gitingest", "commit": "4e259a02fe72115bee538271622f1234a81c8e1a",
        "spdx": "MIT", "category": "cli-tools", "subcategory": "developer-cli",
        "route_outs": ["codebase-search", "semble", "research"],
    },
    "fabric": {
        "repository": "danielmiessler/fabric", "commit": "8e8511c770b2589a6066398a86343fbf8c2a56a3",
        "spdx": "MIT", "category": "cli-tools", "subcategory": "ai-cli", "route_outs": [],
        # This older skill keeps its CC-BY-4.0 text, a prose source string and no "Triggers on:" line.
        "skill_license": "CC-BY-4.0", "legacy_frontmatter": True,
    },
}


def load_module(name):
    path = SKILLS_DIR / name / "scripts" / "preflight.py"
    spec = importlib.util.spec_from_file_location("preflight_" + name.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULES = {name: load_module(name) for name in SPECS}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def frontmatter(name):
    text = (SKILLS_DIR / name / "SKILL.md").read_text(encoding="utf-8")
    return yaml.safe_load(text.split("---")[1])


class HelperCase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="five-programs-")
        self.addCleanup(temp.cleanup)
        self.tmp = Path(temp.name).resolve()
        self.home = self.tmp / "home"
        self.home.mkdir()
        self.shims = self.tmp / "shims"
        self.shims.mkdir()
        self.marker = self.tmp / "executed"

    def shim(self, *names):
        for name in names:
            path = self.shims / name
            path.write_text(f"#!/bin/sh\necho {name} >> '{self.marker}'\nexit 99\n", encoding="utf-8")
            path.chmod(0o755)

    def run_helper(self, script, *args, path=None, env=None):
        environment = {"PATH": path if path is not None else str(self.shims), "HOME": str(self.home),
                       "PYTHONDONTWRITEBYTECODE": "1"}
        environment.update(env or {})
        return subprocess.run([sys.executable, "-B", str(script), *args], capture_output=True, text=True,
                              env=environment, timeout=60, encoding="utf-8")

    def real(self, name, *args, **kwargs):
        return self.run_helper(SKILLS_DIR / name / "scripts" / "preflight.py", "--json", *args, **kwargs)

    @staticmethod
    def checks(proc):
        return {c["name"]: c for c in json.loads(proc.stdout)["checks"]}

    def fixture(self, name, files, commit=None):
        """Copy the real helper beside a source.json built from `files`; return (helper, checkout)."""
        skill = self.tmp / f"skill-{name}"
        (skill / "scripts").mkdir(parents=True)
        (skill / "references").mkdir()
        shutil.copy(SKILLS_DIR / name / "scripts" / "preflight.py", skill / "scripts" / "preflight.py")
        spec = SPECS[name]
        source = {"schema_version": 1, "skill": name, "repository": spec["repository"],
                  "commit": commit or spec["commit"], "license": {"spdx": spec["spdx"]},
                  "files": [{"path": rel, "sha256": sha256(data)} for rel, data in files.items()]}
        (skill / "references" / "source.json").write_text(json.dumps(source), encoding="utf-8")
        checkout = self.tmp / f"checkout-{name}"
        for rel, data in files.items():
            target = checkout / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        return skill / "scripts" / "preflight.py", checkout


class ContractTests(HelperCase):
    def test_every_helper_reports_the_shared_contract_without_executing_anything(self):
        self.shim("tesseract", "docker", "go", "git", "node", "ollama", "firefox", "magick", "convert",
                  "python3.9", "python3.11", "gitingest")
        for name, spec in SPECS.items():
            with self.subTest(skill=name):
                proc = self.real(name)
                data = json.loads(proc.stdout)
                self.assertEqual((data["skill"], data["scope"], data["runtime_verified"]),
                                 (name, "offline-preflight", False))
                self.assertIn(data["status"], {"ok", "blocked"})
                self.assertEqual(proc.returncode, 0 if data["status"] == "ok" else 1)
                pin = {c["name"]: c for c in data["checks"]}["source.pin"]
                self.assertEqual(pin["status"], "info")
                self.assertIn(spec["commit"], pin["detail"])
                self.assertFalse(self.marker.exists(), f"{name} executed a discovered tool")

    def test_info_checks_never_change_the_status(self):
        for name in SPECS:
            with self.subTest(skill=name):
                data = json.loads(self.real(name).stdout)
                states = {c["status"] for c in data["checks"] if c["status"] != "info"}
                expected = "blocked" if "blocked" in states else "ok"
                self.assertEqual(data["status"], expected)

    def test_invalid_input_exits_2(self):
        for name in SPECS:
            helper = SKILLS_DIR / name / "scripts" / "preflight.py"
            for args in (["--expect-commit", "a" * 40], ["--repo", str(self.tmp), "--expect-commit", "abc"],
                         ["--no-such-flag"]):
                with self.subTest(skill=name, args=args):
                    proc = self.run_helper(helper, "--json", *args)
                    self.assertEqual(proc.returncode, 2)
                    data = json.loads(proc.stdout)
                    self.assertEqual((data["status"], data["checks"][0]["name"]), ("error", "input"))

    def test_help_exits_zero(self):
        for name in SPECS:
            with self.subTest(skill=name):
                proc = self.run_helper(SKILLS_DIR / name / "scripts" / "preflight.py", "--help")
                self.assertEqual(proc.returncode, 0)
                self.assertIn("--repo", proc.stdout)

    def test_missing_source_manifest_is_an_error(self):
        helper, _ = self.fixture("gitingest", {"README.md": b"x"})
        (helper.parents[1] / "references" / "source.json").unlink()
        proc = self.run_helper(helper, "--json")
        self.assertEqual(json.loads(proc.stdout)["status"], "error")
        self.assertEqual(proc.returncode, 1)


class SourceVerificationTests(HelperCase):
    FILES = {"README.md": b"readme\n", "LICENSE": b"license\n", "src/app.py": b"print('x')\n"}

    def run_fixture(self, name="gitingest", files=None, *extra, mutate=None, path=None):
        helper, checkout = self.fixture(name, files or self.FILES)
        if mutate:
            mutate(checkout)
        return self.run_helper(helper, "--json", "--repo", str(checkout), *extra, path=path)

    def test_matching_checkout_passes_shape_and_hash_checks(self):
        proc = self.run_fixture()
        checks = self.checks(proc)
        self.assertEqual(checks["repo.shape"]["status"], "ok")
        self.assertEqual(checks["repo.files"]["status"], "ok")
        self.assertEqual(checks["repo.commit"]["status"], "info")
        self.assertIn("no .git directory", checks["repo.commit"]["detail"])

    def test_a_changed_file_blocks_and_names_the_file(self):
        proc = self.run_fixture(mutate=lambda checkout: (checkout / "README.md").write_bytes(b"changed\n"))
        checks = self.checks(proc)
        self.assertEqual((proc.returncode, checks["repo.files"]["status"]), (1, "blocked"))
        self.assertIn("README.md", checks["repo.files"]["detail"])
        self.assertIn("re-audit", checks["repo.files"]["detail"])

    def test_a_missing_file_blocks_shape(self):
        proc = self.run_fixture(mutate=lambda checkout: (checkout / "LICENSE").unlink())
        checks = self.checks(proc)
        self.assertEqual(checks["repo.shape"]["status"], "blocked")
        self.assertIn("LICENSE", checks["repo.shape"]["detail"])

    def test_a_symlink_to_a_file_outside_the_checkout_is_refused(self):
        def link(checkout):
            outside = self.tmp / "outside.txt"
            outside.write_bytes(self.FILES["README.md"])
            (checkout / "README.md").unlink()
            (checkout / "README.md").symlink_to(outside)

        proc = self.run_fixture(mutate=link)
        checks = self.checks(proc)
        self.assertEqual(checks["repo.shape"]["status"], "blocked")
        self.assertIn("README.md (resolves outside the checkout)", checks["repo.shape"]["detail"])

    def test_a_symlink_to_another_file_inside_the_checkout_is_not_followed(self):
        def link(checkout):
            (checkout / "README.md").unlink()
            (checkout / "README.md").symlink_to(checkout / "LICENSE")

        proc = self.run_fixture(mutate=link)
        checks = self.checks(proc)
        self.assertEqual(checks["repo.shape"]["status"], "blocked")
        self.assertIn("README.md (symlink)", checks["repo.shape"]["detail"])

    def test_a_symlinked_directory_cannot_escape_the_checkout(self):
        def link(checkout):
            outside = self.tmp / "outside-dir"
            (outside / "src").mkdir(parents=True)
            (outside / "src" / "app.py").write_bytes(self.FILES["src/app.py"])
            shutil.rmtree(checkout / "src")
            (checkout / "src").symlink_to(outside / "src", target_is_directory=True)

        proc = self.run_fixture(mutate=link)
        self.assertEqual(self.checks(proc)["repo.shape"]["status"], "blocked")
        self.assertIn("resolves outside the checkout", self.checks(proc)["repo.shape"]["detail"])

    def test_checkout_path_must_exist_and_be_a_directory(self):
        helper, checkout = self.fixture("gitingest", self.FILES)
        missing = self.run_helper(helper, "--json", "--repo", str(self.tmp / "nope"))
        self.assertEqual(self.checks(missing)["repo.path"]["status"], "blocked")
        a_file = self.run_helper(helper, "--json", "--repo", str(checkout / "README.md"))
        self.assertEqual(self.checks(a_file)["repo.path"]["status"], "blocked")

    def test_expect_commit_without_git_directory_blocks(self):
        proc = self.run_fixture("gitingest", None, "--expect-commit", "b" * 40)
        self.assertEqual(self.checks(proc)["repo.commit"]["status"], "blocked")

    def test_git_identity_is_read_without_other_tools(self):
        git = shutil.which("git")
        if not git:
            self.skipTest("git is not installed")
        helper, checkout = self.fixture("gitingest", self.FILES)
        env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
               "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        run = lambda *a: subprocess.run([git, *a], cwd=checkout, env={**os.environ, **env}, check=True, capture_output=True)
        run("init", "-q")
        run("add", "-A")
        run("commit", "-q", "-m", "fixture")
        head = subprocess.run([git, "rev-parse", "HEAD"], cwd=checkout, capture_output=True, text=True).stdout.strip()
        search = f"{self.shims}{os.pathsep}{Path(git).parent}"
        good = self.run_helper(helper, "--json", "--repo", str(checkout), "--expect-commit", head, path=search)
        checks = self.checks(good)
        self.assertEqual((checks["repo.git"]["status"], checks["repo.commit"]["status"]), ("ok", "ok"))
        self.assertIn("matches --expect-commit", checks["repo.commit"]["detail"])
        bad = self.run_helper(helper, "--json", "--repo", str(checkout), "--expect-commit", "c" * 40, path=search)
        self.assertEqual(self.checks(bad)["repo.commit"]["status"], "blocked")
        self.assertEqual(bad.returncode, 1)
        self.assertFalse(self.marker.exists())

    def test_probes_only_read_files_that_the_manifest_hashes(self):
        for name, module in MODULES.items():
            source = json.loads((SKILLS_DIR / name / "references" / "source.json").read_text(encoding="utf-8"))
            paths = {entry["path"] for entry in source["files"]}
            for probe in module.PROBES:
                with self.subTest(skill=name, probe=probe["name"]):
                    self.assertIn(probe["path"], paths)

    def test_probe_results_follow_the_checkout_contents(self):
        files = {"gui_agents/s3/cli_app.py": b"def show_permission_dialog():\n    pass\nexec(code[0])\n",
                 "README.md": b"x", "LICENSE": b"x"}
        helper, checkout = self.fixture("agent-s", files)
        checks = self.checks(self.run_helper(helper, "--json", "--repo", str(checkout)))
        self.assertIn("never called", checks["audit:permission-dialog"]["detail"])
        self.assertIn("exec()", checks["audit:direct-exec"]["detail"])
        self.assertIn("not assessed", checks["audit:python-timeout"]["detail"])
        (checkout / "gui_agents/s3/cli_app.py").write_bytes(
            b"def show_permission_dialog():\n    pass\nif show_permission_dialog():\n    exec(code[0])\n")
        checks = self.checks(self.run_helper(helper, "--json", "--repo", str(checkout)))
        self.assertEqual(checks["audit:permission-dialog"]["detail"], "show_permission_dialog is called in cli_app.py")


class FakeVersion(collections.namedtuple("FakeVersion", "major minor micro releaselevel serial")):
    pass


class PythonRangeTests(unittest.TestCase):
    def python_check(self, version, interpreters):
        module = MODULES["agent-s"]
        checks = []
        fake = FakeVersion(*version, "final", 0)
        with mock.patch.object(sys, "version_info", fake), \
                mock.patch.object(module.shutil, "which", lambda name: f"/x/{name}" if name in interpreters else None), \
                mock.patch.object(module.platform, "system", lambda: "Darwin"):
            module.host_checks(checks, None)
        return next(c for c in checks if c["name"] == "python")

    def test_pip_range_for_gui_agents(self):
        cases = [((3, 11, 9), (), "ok"), ((3, 9, 0), (), "ok"), ((3, 12, 0), (), "ok"),
                 ((3, 12, 4), (), "blocked"), ((3, 12, 4), ("python3.11",), "ok"),
                 ((3, 13, 0), (), "blocked"), ((3, 14, 6), ("python3.10",), "ok"), ((3, 8, 18), (), "blocked")]
        for version, interpreters, expected in cases:
            with self.subTest(version=version, interpreters=interpreters):
                self.assertEqual(self.python_check(version, interpreters)["status"], expected)

    def test_specifier_semantics_match_the_documented_range(self):
        try:
            from packaging.specifiers import SpecifierSet
        except ImportError:
            self.skipTest("packaging is not installed")
        spec = SpecifierSet(">=3.9,<=3.12")
        self.assertEqual([spec.contains(v) for v in ("3.11.9", "3.12.0", "3.12.1", "3.12.4", "3.13.0")],
                         [True, True, False, False, False])

    def test_moneyprinter_python_312(self):
        module = MODULES["moneyprinter-v2"]

        def state(version, which):
            checks = []
            with mock.patch.object(sys, "version_info", FakeVersion(*version, "final", 0)), \
                    mock.patch.object(module.shutil, "which", which):
                module.host_checks(checks, None)
            return next(c for c in checks if c["name"] == "python")["status"]

        self.assertEqual(state((3, 12, 4), lambda n: None), "ok")
        self.assertEqual(state((3, 14, 0), lambda n: "/x/python3.12" if n == "python3.12" else None), "ok")
        self.assertEqual(state((3, 14, 0), lambda n: None), "blocked")


class MoneyPrinterConfigTests(HelperCase):
    def config(self, data, name="config.json"):
        path = self.tmp / name
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_config_reports_set_or_unset_but_never_values(self):
        secrets = ["hunter2-smtp-password", "AIza-fake-image-key", "pb_fake_bridge_key", "private-user@example.com"]
        path = self.config({
            "firefox_profile": str(self.tmp), "ollama_base_url": "http://10.0.0.5:11434", "ollama_model": "llama3.2:3b",
            "nanobanana2_api_key": secrets[1], "email": {"username": secrets[3], "password": secrets[0]},
            "post_bridge": {"enabled": True, "api_key": secrets[2], "auto_crosspost": False},
            "google_maps_scraper": "https://github.com/gosom/google-maps-scraper/archive/refs/tags/v0.9.7.zip",
            "imagemagick_path": "Path to magick.exe"})
        proc = self.real("moneyprinter-v2", "--config", str(path))
        checks = self.checks(proc)
        for secret in secrets:
            self.assertNotIn(secret, proc.stdout + proc.stderr)
        self.assertIn("password set", checks["config.smtp"]["detail"])
        self.assertIn("plaintext", checks["config.smtp"]["detail"])
        self.assertIn("non-loopback", checks["config.ollama"]["detail"])
        self.assertIn("api_key set", checks["config.post_bridge"]["detail"])
        self.assertIn("pinned to a release tag", checks["config.scraper_download"]["detail"])
        self.assertIn("directory exists", checks["config.firefox_profile"]["detail"])
        self.assertIn("placeholder", checks["config.imagemagick_path"]["detail"])

    def test_empty_config_reports_unset(self):
        checks = self.checks(self.real("moneyprinter-v2", "--config", str(self.config({}))))
        self.assertIn("password unset", checks["config.smtp"]["detail"])
        self.assertIn("loopback", checks["config.ollama"]["detail"])
        self.assertIn("unset", checks["config.firefox_profile"]["detail"])

    def test_bad_configs_block(self):
        bad = self.tmp / "bad.json"
        bad.write_text("{nope", encoding="utf-8")
        listy = self.config([1, 2], "list.json")
        link = self.tmp / "link.json"
        link.symlink_to(self.config({}, "real.json"))
        for path in (bad, listy, link, self.tmp / "absent.json"):
            with self.subTest(path=path.name):
                proc = self.real("moneyprinter-v2", "--config", str(path))
                self.assertEqual((proc.returncode, self.checks(proc)["config"]["status"]), (1, "blocked"))

    def test_environment_keys_are_reported_by_name_only(self):
        proc = self.real("moneyprinter-v2", env={"GEMINI_API_KEY": "AIza-env-secret-value"})
        self.assertIn("GEMINI_API_KEY=set", self.checks(proc)["env"]["detail"])
        self.assertNotIn("AIza-env-secret-value", proc.stdout)


class GoogleMapsInputTests(HelperCase):
    def test_queries_are_counted_without_network(self):
        queries = self.tmp / "q.txt"
        queries.write_text("# comment\ndentists in Berlin\n\nhttps://www.google.com/maps/search/pizza\n"
                           "maps.app.goo.gl/abc123\nDentists in Berlin\n", encoding="utf-8")
        proc = self.real("google-maps-scraper", "--queries", str(queries))
        checks = self.checks(proc)
        self.assertEqual(checks["queries"]["status"], "ok")
        self.assertIn("4 query line(s); 2 direct Maps URL(s); 1 duplicate(s)", checks["queries"]["detail"])
        self.assertIn("unverified", checks["queries.estimate"]["detail"])

    def test_empty_or_missing_queries_block(self):
        empty = self.tmp / "empty.txt"
        empty.write_text("# only a comment\n\n", encoding="utf-8")
        for path in (empty, self.tmp / "absent.txt"):
            with self.subTest(path=path.name):
                proc = self.real("google-maps-scraper", "--queries", str(path))
                self.assertEqual(self.checks(proc)["queries"]["status"], "blocked")

    def test_installed_skill_collision_is_classified(self):
        folder = self.home / ".agents" / "skills" / "google-maps-scraper"
        folder.mkdir(parents=True)
        (folder / "SKILL.md").write_text("---\nname: google-maps-scraper\nmetadata:\n  author: gosom\n---\n", encoding="utf-8")
        detail = self.checks(self.real("google-maps-scraper"))["installed-skill"]["detail"]
        self.assertIn("likely upstream gosom's", detail)
        (folder / "SKILL.md").write_text("---\nname: google-maps-scraper\nmetadata:\n  upstream_commit: abc\n---\n", encoding="utf-8")
        detail = self.checks(self.real("google-maps-scraper"))["installed-skill"]["detail"]
        self.assertIn("this catalog's operator", detail)

    def test_telemetry_and_leadsdb_are_reported_without_values(self):
        proc = self.real("google-maps-scraper", env={"LEADSDB_API_KEY": "ldb-fake-secret", "DISABLE_TELEMETRY": "1"})
        detail = self.checks(proc)["env"]["detail"]
        self.assertIn("anonymous telemetry off", detail)
        self.assertIn("LEADSDB_API_KEY=set", detail)
        self.assertNotIn("ldb-fake-secret", proc.stdout)

    def test_runtime_requires_docker_or_go(self):
        self.assertEqual(self.checks(self.real("google-maps-scraper"))["runtime"]["status"], "blocked")
        self.shim("docker")
        self.assertEqual(self.checks(self.real("google-maps-scraper"))["runtime"]["status"], "ok")


class GitingestTargetTests(HelperCase):
    def test_sensitive_names_are_flagged_and_contents_are_never_read(self):
        target = self.tmp / "project"
        (target / "src").mkdir(parents=True)
        marker = "CONTENT-MARKER-SHOULD-NEVER-APPEAR"
        for rel in (".env", ".env.local", "server.pem", "src/id_rsa", "src/app.py", "credentials.json", "notes.txt"):
            (target / rel).write_text(marker, encoding="utf-8")
        (target / "node_modules").mkdir()
        (target / "node_modules" / "ignored.pem").write_text(marker, encoding="utf-8")
        (target / "linked.pem").symlink_to(target / "src" / "app.py")
        proc = self.real("gitingest", "--target", str(target))
        checks = self.checks(proc)
        self.assertNotIn(marker, proc.stdout + proc.stderr)
        self.assertEqual(checks["target"]["status"], "ok")
        self.assertIn("7 file(s)", checks["target"]["detail"])
        detail = checks["target.sensitive-names"]["detail"]
        for flagged in (".env.local", "server.pem", "id_rsa", "credentials.json"):
            self.assertIn(flagged, detail)
        self.assertNotRegex(detail.split(";")[0], r"(^|[ ,:])\.env([,;]| |$)")
        self.assertNotIn("ignored.pem", detail)
        self.assertNotIn("linked.pem", detail)
        self.assertNotIn("app.py", detail)

    def test_clean_directory_reports_no_sensitive_names_and_limits(self):
        target = self.tmp / "clean"
        target.mkdir()
        (target / "main.py").write_text("print(1)\n", encoding="utf-8")
        checks = self.checks(self.real("gitingest", "--target", str(target)))
        self.assertIn("no sensitive-looking file names", checks["target.sensitive-names"]["detail"])
        self.assertIn("within upstream's 10,000-file cap", checks["target.limits"]["detail"])

    def test_target_must_be_a_directory(self):
        proc = self.real("gitingest", "--target", str(self.tmp / "absent"))
        self.assertEqual((proc.returncode, self.checks(proc)["target"]["status"]), (1, "blocked"))

    def test_github_token_is_reported_by_name_only(self):
        proc = self.real("gitingest", env={"GITHUB_TOKEN": "github_pat_FAKE_TOKEN_VALUE"})
        self.assertIn("GITHUB_TOKEN=set", self.checks(proc)["env"]["detail"])
        self.assertNotIn("github_pat_FAKE_TOKEN_VALUE", proc.stdout + proc.stderr)


class AgentSEnvironmentTests(HelperCase):
    def test_provider_keys_are_reported_by_name_only(self):
        proc = self.real("agent-s", env={"OPENAI_API_KEY": "sk-fake-openai-value", "HF_TOKEN": "hf_fake_value"})
        detail = self.checks(proc)["env"]["detail"]
        self.assertIn("OPENAI_API_KEY=set", detail)
        self.assertIn("ANTHROPIC_API_KEY=unset", detail)
        self.assertNotIn("sk-fake-openai-value", proc.stdout)
        self.assertNotIn("hf_fake_value", proc.stdout)

    def test_tesseract_is_required(self):
        self.assertEqual(self.checks(self.real("agent-s"))["tool:tesseract"]["status"], "blocked")
        self.shim("tesseract")
        self.assertEqual(self.checks(self.real("agent-s"))["tool:tesseract"]["status"], "ok")


class FabricHostTests(HelperCase):
    def test_binary_may_be_fabric_or_fabric_ai(self):
        self.assertEqual(self.checks(self.real("fabric"))["tool:fabric"]["status"], "blocked")
        self.shim("fabric-ai")
        checks = self.checks(self.real("fabric"))
        self.assertEqual(checks["tool:fabric"]["status"], "ok")
        self.assertIn("fabric-ai", checks["tool:fabric"]["detail"])
        self.assertFalse(self.marker.exists(), "the helper must not execute the binary it finds")

    def test_config_env_file_is_inspected_without_being_read(self):
        config = self.home / ".config" / "fabric"
        (config / "patterns").mkdir(parents=True)
        (config / "patterns" / "summarize").mkdir()
        env_file = config / ".env"
        env_file.write_text("OPENAI_API_KEY=sk-fixture-secret-must-not-print\n", encoding="utf-8")
        env_file.chmod(0o644)
        proc = self.real("fabric", env={"FABRIC_API_KEY": "fabric-fixture-secret-key"})
        checks = self.checks(proc)
        self.assertIn("readable by group or others", checks["config.env"]["detail"])
        self.assertIn("1 entries", checks["config.patterns"]["detail"])
        self.assertIn("FABRIC_API_KEY=set", checks["env"]["detail"])
        for secret in ("sk-fixture-secret-must-not-print", "fabric-fixture-secret-key"):
            self.assertNotIn(secret, proc.stdout + proc.stderr)
        env_file.chmod(0o600)
        self.assertIn("owner-only", self.checks(self.real("fabric"))["config.env"]["detail"])

    def test_env_symlink_is_reported_and_not_followed(self):
        config = self.home / ".config" / "fabric"
        config.mkdir(parents=True)
        target = self.tmp / "elsewhere.env"
        target.write_text("TOKEN=sk-fixture-symlink-secret\n", encoding="utf-8")
        (config / ".env").symlink_to(target)
        proc = self.real("fabric")
        self.assertIn("symlink", self.checks(proc)["config.env"]["detail"])
        self.assertNotIn("sk-fixture-symlink-secret", proc.stdout)

    def test_missing_config_directory_is_advisory_not_blocking(self):
        checks = self.checks(self.real("fabric"))
        self.assertEqual(checks["config.dir"]["status"], "info")
        self.assertEqual(checks["config.env"]["status"], "info")
        self.assertIn("downloads patterns over the network", checks["config.dir"]["detail"])


def load_readiness():
    path = SKILLS_DIR / "jeo-skill" / "scripts" / "skill_readiness.py"
    spec = importlib.util.spec_from_file_location("skill_readiness_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReadinessModuleTests(HelperCase):
    """The report layer: it must tell blocked, missing and error apart and never raise."""

    def setUp(self):
        super().setUp()
        self.readiness = load_readiness()
        self.root = self.tmp / "skills"
        for name in BUNDLE_MEMBERS:
            shutil.copytree(SKILLS_DIR / name / "scripts", self.root / name / "scripts",
                            ignore=shutil.ignore_patterns("__pycache__"))
            shutil.copytree(SKILLS_DIR / name / "references", self.root / name / "references",
                            ignore=shutil.ignore_patterns("__pycache__"))

    def fake_helper(self, name, body):
        script = self.root / name / "scripts" / "preflight.py"
        script.write_text(body, encoding="utf-8")

    def test_readiness_skills_are_exactly_the_bundle(self):
        self.assertEqual(list(self.readiness.READINESS_SKILLS), BUNDLE_MEMBERS)
        for name in BUNDLE_MEMBERS:
            self.assertTrue((SKILLS_DIR / name / "scripts" / "preflight.py").is_file(), name)

    def test_plan_runs_each_helper_isolated_with_json(self):
        plans = dict(self.readiness.plan(self.root, ["gitingest"]))
        command = plans["gitingest"]
        self.assertEqual(command[1:3], ["-I", "-B"])
        self.assertEqual(command[-1], "--json")
        self.assertTrue(command[3].endswith("gitingest/scripts/preflight.py"))
        self.assertEqual(self.readiness.plan(None, ["gitingest"]), [])

    def test_real_helpers_report_ready_or_blocked_and_never_execute_tools(self):
        self.shim("docker", "go", "tesseract", "fabric", "python3.11", "python3.12", "git", "ollama", "firefox")
        with mock.patch.dict(os.environ, {"PATH": str(self.shims), "HOME": str(self.home), "DISPLAY": ":0"}):
            results = self.readiness.collect(self.root, BUNDLE_MEMBERS)
        self.assertEqual([r["skill"] for r in results], BUNDLE_MEMBERS)
        self.assertTrue(all(r["state"] in ("ready", "blocked") for r in results), results)
        self.assertEqual(self.readiness.exit_code(results), 0 if all(r["state"] == "ready" for r in results) else 1)
        self.assertFalse(self.marker.exists())
        self.assertTrue(all(r["checks"] for r in results))

    def test_blocked_is_not_error_and_missing_is_distinct(self):
        with mock.patch.dict(os.environ, {"PATH": str(self.shims), "HOME": str(self.home)}):
            blocked = self.readiness.probe(self.root, "fabric")
        self.assertEqual(blocked["state"], "blocked")
        self.assertEqual(blocked["blocked"][0][0], "tool:fabric")
        shutil.rmtree(self.root / "agent-s")
        missing = self.readiness.probe(self.root, "agent-s")
        self.assertEqual(missing["state"], "missing")
        self.assertEqual(self.readiness.exit_code([blocked, missing]), 1)
        self.assertEqual(self.readiness.exit_code([blocked, {"state": "error"}]), 2)

    def test_helper_failures_become_error_results_not_exceptions(self):
        cases = {
            "crash": "import sys\nprint('not json')\nsys.exit(0)\n",
            "wrong-skill": "import json\nprint(json.dumps({'skill':'other','scope':'offline-preflight','status':'ok','checks':[]}))\n",
            "wrong-scope": "import json\nprint(json.dumps({'skill':'gitingest','scope':'runtime','status':'ok','checks':[]}))\n",
            "bad-status": "import json\nprint(json.dumps({'skill':'gitingest','scope':'offline-preflight','status':'maybe','checks':[]}))\n",
            "invalid-input": "import json,sys\nprint(json.dumps({'skill':'gitingest','scope':'offline-preflight','status':'error','checks':[]}))\nsys.exit(2)\n",
            "huge": "print('x' * (2 << 20))\n",
        }
        for label, body in cases.items():
            with self.subTest(case=label):
                self.fake_helper("gitingest", body)
                result = self.readiness.probe(self.root, "gitingest")
                self.assertEqual(result["state"], "error")
                self.assertTrue(result["detail"])

    def test_slow_helper_times_out(self):
        self.fake_helper("gitingest", "import time\ntime.sleep(10)\n")
        result = self.readiness.probe(self.root, "gitingest", timeout=0.5)
        self.assertEqual(result["state"], "error")
        self.assertIn("did not finish within 0.5 s", result["detail"])

    def test_helper_error_status_is_reported_as_error_with_its_checks(self):
        self.fake_helper("gitingest", (
            "import json\nprint(json.dumps({'skill':'gitingest','scope':'offline-preflight','status':'error',"
            "'checks':[{'name':'source.pin','status':'error','detail':'references/source.json is missing'}]}))\n"))
        result = self.readiness.probe(self.root, "gitingest")
        self.assertEqual(result["state"], "error")
        self.assertEqual(result["blocked"], [("source.pin", "references/source.json is missing")])
        self.assertNotIn("\n    - \n", self.readiness.render([result]))

    def test_render_summarizes_and_shortens_long_details(self):
        long_detail = "needs " + "x" * 400
        results = [
            {"skill": "agent-s", "state": "blocked", "blocked": [("python", long_detail)], "info": 3, "detail": "", "checks": []},
            {"skill": "gitingest", "state": "ready", "blocked": [], "info": 0, "detail": "", "checks": []},
            {"skill": "fabric", "state": "missing", "blocked": [], "info": 0, "detail": "no helper", "checks": []},
        ]
        text = self.readiness.render(results)
        self.assertIn("- agent-s: blocked (1 blocking), 3 advisory finding(s)", text)
        self.assertIn("- gitingest: ready", text)
        self.assertIn("- fabric: not installed", text)
        self.assertIn("1/3 ready.", text)
        self.assertIn("separate approval", text)
        self.assertTrue(all(len(line) < 230 for line in text.splitlines()), text)
        self.assertIn("…", text)

    def test_json_report_carries_every_check(self):
        proc = subprocess.run([sys.executable, "-B", str(SKILLS_DIR / "jeo-skill" / "scripts" / "jeo-skill.py"),
                               "readiness", "--global", "gitingest", "--json"],
                              capture_output=True, text=True, encoding="utf-8", timeout=60,
                              env={"PATH": str(self.shims), "HOME": str(self.tmp / "home-json"), "PYTHONDONTWRITEBYTECODE": "1"})
        # No skills are installed under this HOME, so the result is "missing", with a stable shape.
        payload = json.loads(proc.stdout)
        self.assertEqual((proc.returncode, payload["scope"], payload["ready"], payload["total"]), (1, "readiness", 0, 1))
        self.assertEqual(payload["results"][0]["state"], "missing")


def load_router():
    scripts = SKILLS_DIR / "jeo-skill" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        spec = importlib.util.spec_from_file_location("jeo_skill_router_under_test", scripts / "jeo-skill.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(scripts))
    return module


class SetupFlowTests(HelperCase):
    """run_skill_setup: the readiness report follows the real setup plans and never fails an install."""

    def setUp(self):
        super().setUp()
        self.router = load_router()
        self.root = self.tmp / "skills"
        for name in ("fabric", "gitingest"):
            shutil.copytree(SKILLS_DIR / name / "scripts", self.root / name / "scripts",
                            ignore=shutil.ignore_patterns("__pycache__"))
            shutil.copytree(SKILLS_DIR / name / "references", self.root / name / "references")

    def run_setup(self, plans, selected, **kwargs):
        out = io.StringIO()
        patched = mock.patch.object(self.router, "skill_setup_commands", return_value=(plans, []))
        with patched, mock.patch.dict(os.environ, {"PATH": str(self.shims), "HOME": str(self.home)}), \
                contextlib.redirect_stdout(out):
            self.router.run_skill_setup(self.root, selected, global_install=True, with_hooks=False,
                                        dry_run=kwargs.get("dry_run", False))
        return out.getvalue()

    def test_report_follows_a_successful_plan_and_blocked_programs_do_not_raise(self):
        ran = self.tmp / "plan-ran"
        plans = [("alpha", [sys.executable, "-c", f"open({str(ran)!r}, 'w').write('x')"])]
        output = self.run_setup(plans, ["alpha", "fabric", "gitingest"])
        self.assertTrue(ran.exists())
        self.assertEqual(output.count("nothing was installed, started or contacted"), 1, output)
        self.assertIn("- fabric: blocked", output)
        self.assertIn("- gitingest: ready", output)

    def test_a_failing_plan_raises_before_any_report(self):
        plans = [("alpha", [sys.executable, "-c", "raise SystemExit(3)"])]
        out = io.StringIO()
        with mock.patch.object(self.router, "skill_setup_commands", return_value=(plans, [])), \
                mock.patch.dict(os.environ, {"PATH": str(self.shims), "HOME": str(self.home)}), \
                contextlib.redirect_stdout(out):
            with self.assertRaises(self.router.JeoSkillError):
                self.router.run_skill_setup(self.root, ["alpha", "gitingest"], global_install=True,
                                            with_hooks=False, dry_run=False)
        self.assertNotIn("nothing was installed", out.getvalue())

    def test_dry_run_lists_readiness_plans_and_runs_nothing(self):
        output = self.run_setup([], ["fabric", "gitingest", "alpha"], dry_run=True)
        self.assertEqual(output.count("Readiness plan ("), 2, output)
        self.assertNotIn("nothing was installed", output)
        self.assertFalse(self.marker.exists())

    def test_readiness_only_selection_reports_when_there_are_no_plans(self):
        output = self.run_setup([], ["gitingest"])
        self.assertEqual(output.count("nothing was installed, started or contacted"), 1, output)

    def test_programs_are_never_reported_as_unsupported_setup(self):
        plans, unsupported = self.router.skill_setup_commands(self.root, BUNDLE_MEMBERS, global_install=True, with_hooks=True)
        self.assertEqual((plans, unsupported), ([], []))


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((SKILLS_DIR / "skills.json").read_text(encoding="utf-8"))
        cls.live = {s["name"] for s in cls.manifest["skills"]}

    def test_skill_files_exist(self):
        for name in SPECS:
            for rel in ("SKILL.md", "SKILL.toon", "evals/evals.json", "references/upstream.md",
                        "references/source.json", "scripts/preflight.py"):
                with self.subTest(skill=name, file=rel):
                    self.assertTrue((SKILLS_DIR / name / rel).is_file())
            self.assertTrue(os.access(SKILLS_DIR / name / "scripts" / "preflight.py", os.X_OK))

    def test_frontmatter_and_pin_agree_everywhere(self):
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        attribution = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        for name, spec in SPECS.items():
            with self.subTest(skill=name):
                front = frontmatter(name)
                self.assertEqual(front["name"], name)
                self.assertEqual(front["metadata"]["upstream_commit"], spec["commit"])
                self.assertEqual(front["license"], spec.get("skill_license", spec["spdx"]))
                if not spec.get("legacy_frontmatter"):
                    self.assertEqual(front["metadata"]["source"], f"https://github.com/{spec['repository']}")
                description = " ".join(front["description"].split())
                self.assertLessEqual(len(description), 1024)
                self.assertIn("Use when", description)
                if not spec.get("legacy_frontmatter"):
                    self.assertIn("Triggers on:", description)
                source = json.loads((SKILLS_DIR / name / "references" / "source.json").read_text(encoding="utf-8"))
                self.assertEqual((source["skill"], source["repository"], source["commit"], source["license"]["spdx"]),
                                 (name, spec["repository"], spec["commit"], spec["spdx"]))
                self.assertIn(spec["commit"], source["license"]["url"])
                upstream = (SKILLS_DIR / name / "references" / "upstream.md").read_text(encoding="utf-8")
                self.assertIn(spec["commit"], upstream)
                self.assertIn(spec["commit"], (SKILLS_DIR / name / "SKILL.md").read_text(encoding="utf-8"))
                self.assertIn(spec["commit"], guide)
                self.assertIn(spec["commit"][:7], attribution)

    def test_source_manifest_shape(self):
        for name in SPECS:
            with self.subTest(skill=name):
                source = json.loads((SKILLS_DIR / name / "references" / "source.json").read_text(encoding="utf-8"))
                paths = [e["path"] for e in source["files"]]
                self.assertEqual(len(paths), len(set(paths)))
                self.assertIn("LICENSE", paths)
                self.assertIn("README.md", paths)
                for entry in source["files"]:
                    self.assertFalse(entry["path"].startswith("/") or ".." in Path(entry["path"]).parts)
                    self.assertRegex(entry["sha256"], r"^[0-9a-f]{64}$")
                    self.assertGreater(entry["bytes"], 0)
                self.assertRegex(source["commit"], r"^[0-9a-f]{40}$")

    def test_manifest_entries_match_the_skills(self):
        for name, spec in SPECS.items():
            with self.subTest(skill=name):
                entry = next(s for s in self.manifest["skills"] if s["name"] == name)
                front = frontmatter(name)
                self.assertEqual(entry["description"], " ".join(front["description"].split()))
                self.assertEqual((entry["category"], entry["subcategory"], entry["interface"], entry["path"]),
                                 (spec["category"], spec["subcategory"], "cli", f"{name}/SKILL.md"))
                self.assertEqual((entry["version"], entry["allowed_tools"]),
                                 (front["metadata"]["version"], front["allowed-tools"].split()))
                if not spec.get("legacy_frontmatter"):
                    self.assertEqual(entry["source"], front["metadata"]["source"])
                self.assertIn(name, self.manifest["categories"][spec["category"]])
                self.assertIn(name, self.manifest["subcategories"][spec["category"]][spec["subcategory"]])
        self.assertEqual(self.manifest["skill_count"], len(self.manifest["skills"]))

    def test_bundle_holds_exactly_the_five_programs(self):
        self.assertEqual(self.manifest["bundles"][BUNDLE], BUNDLE_MEMBERS)
        self.assertTrue(set(BUNDLE_MEMBERS) <= self.live)

    def test_starter_bundle_carries_the_image_resolver_without_the_programs(self):
        starter = self.manifest["bundles"]["starter"]
        self.assertIn("image-to-github-repo", starter)
        self.assertEqual(starter[0], "jeo-skill")
        self.assertFalse(set(starter) & (set(BUNDLE_MEMBERS) - {"fabric"}), starter)
        row = "| `starter` | " + ", ".join(starter) + " |"
        for readme in ("README.md", "README.ko.md", "README.es-ES.md"):
            with self.subTest(readme=readme):
                self.assertIn(row, (ROOT / readme).read_text(encoding="utf-8"))

    def test_readiness_is_documented_where_users_look(self):
        for readme in ("README.md", "README.ko.md", "README.es-ES.md"):
            text = (ROOT / readme).read_text(encoding="utf-8")
            with self.subTest(readme=readme):
                self.assertIn("`jeo-skill readiness [--global] [--json]`", text)
                self.assertIn("jeo-skill install --bundle github-five-programs --global --yes --setup", text)
        guide = " ".join((ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8").split())
        for needle in ["jeo-skill.py\" readiness --global", "JEO_SKILLS_READINESS=skip", "install-full-tools.sh --programs",
                       "without counting it in the tool total", "no per-program approval", "when every program is ready, 1 when one is blocked"]:
            with self.subTest(needle=needle):
                self.assertIn(needle, guide)
        skill = (SKILLS_DIR / "jeo-skill" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("jeo-skill readiness --global", skill)
        for changelog in (ROOT / "changelog" / "en" / "2026-11.md", ROOT / "changelog" / "ko" / "2026-11.md", ROOT / "CHANGELOG.md"):
            with self.subTest(changelog=changelog.name):
                self.assertIn("JEO_SKILLS_READINESS=skip", changelog.read_text(encoding="utf-8"))

    def test_relationship_groups_name_live_skills(self):
        groups = self.manifest["relationship_groups"]
        expected = {"moneyprinter-projects": ["moneyprinter-v2", "moneyprinter-turbo"],
                    "maps-outreach-chain": ["google-maps-scraper", "moneyprinter-v2"],
                    "computer-use-agents": ["agent-s", "typesafe-computer-use"]}
        for key, members in expected.items():
            with self.subTest(group=key):
                self.assertEqual(groups[key]["members"], members)
                self.assertTrue(set(members) <= self.live)

    def test_route_outs_name_live_skills(self):
        for name, spec in SPECS.items():
            text = (SKILLS_DIR / name / "SKILL.md").read_text(encoding="utf-8")
            for target in spec["route_outs"]:
                with self.subTest(skill=name, target=target):
                    self.assertIn(f"`{target}`", text)
                    self.assertIn(target, self.live)

    def test_documented_helper_flags_exist(self):
        for name in SPECS:
            helper = SKILLS_DIR / name / "scripts" / "preflight.py"
            help_text = subprocess.run([sys.executable, "-B", str(helper), "--help"], capture_output=True, text=True,
                                       encoding="utf-8", env={"PATH": os.environ.get("PATH", "")}).stdout
            text = (SKILLS_DIR / name / "SKILL.md").read_text(encoding="utf-8")
            blocks = re.findall(r"```[a-z]*\n(.*?)```", text, re.S)
            commands = [" ".join(block.replace("\\\n", " ").split()) for block in blocks]
            lines = [line for block in commands for line in re.findall(r"[^\n]*preflight\.py[^\n]*", block)]
            self.assertTrue(lines, f"{name} documents no preflight command in a code block")
            for flag in sorted({flag for line in lines for flag in re.findall(r"--[a-z][a-z-]*", line)}):
                with self.subTest(skill=name, flag=flag):
                    self.assertIn(flag, help_text)

    def test_relative_links_resolve(self):
        for name in SPECS:
            for document in sorted((SKILLS_DIR / name).rglob("*.md")):
                for target in re.findall(r"\]\(([^)\s]+)\)", document.read_text(encoding="utf-8")):
                    if target.startswith(("http://", "https://", "#")):
                        continue
                    with self.subTest(skill=name, document=document.name, target=target):
                        self.assertTrue((document.parent / target.split("#", 1)[0]).exists())

    def test_evals_and_toon(self):
        for name in SPECS:
            with self.subTest(skill=name):
                evals = json.loads((SKILLS_DIR / name / "evals" / "evals.json").read_text(encoding="utf-8"))
                self.assertEqual(evals["skill_name"], name)
                ids = [e["id"] for e in evals["evals"]]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertGreaterEqual(len(ids), 5)
                for case in evals["evals"]:
                    self.assertTrue(case["prompt"] and case["expected_output"] and len(case["assertions"]) >= 2, case["id"])
                toon = (SKILLS_DIR / name / "SKILL.toon").read_text(encoding="utf-8")
                self.assertTrue(toon.startswith(f"N:{name}\n"))
                for section in (r"U\[\d+\]:", r"S\[\d+\]\{n,action,details\}:", r"R\[\d+\]:", r"E\[\d+\]\{desc,in,out\}:"):
                    self.assertRegex(toon, rf"(?m)^{section}$")

    def test_documents_record_the_audited_hazards(self):
        needles = {
            "moneyprinter-v2": ["run_pending", "pkill firefox", "no confirmation prompt", ".python-version"],
            "agent-s": ["show_permission_dialog", "3.12.1", "exec(", "run_python_script"],
            "google-maps-scraper": ["no authorization handling", "DISABLE_TELEMETRY", "ensure-latest.sh", "1.27.1"],
            "gitingest": [".env.local", "x-oauth-basic", "git_form.jinja", "prompt injection"],
            "fabric": ["127.0.0.1:8080", "FABRIC_API_KEY", "Jina AI", "0600", "fabric-ai"],
        }
        for name, words in needles.items():
            text = (SKILLS_DIR / name / "references" / "upstream.md").read_text(encoding="utf-8")
            for word in words:
                with self.subTest(skill=name, needle=word):
                    self.assertIn(word.lower(), text.lower())

    def test_readmes_changelog_attribution_and_setup_guide(self):
        for readme in ("README.md", "README.ko.md", "README.es-ES.md"):
            text = (ROOT / readme).read_text(encoding="utf-8")
            for name in SPECS:
                with self.subTest(readme=readme, skill=name):
                    self.assertIn(f"| `{name}` |", text)
            with self.subTest(readme=readme, bundle=BUNDLE):
                self.assertIn(f"| `{BUNDLE}` |", text)
        for path in (ROOT / "changelog" / "en" / "2026-11.md", ROOT / "changelog" / "ko" / "2026-11.md", ROOT / "CHANGELOG.md"):
            with self.subTest(changelog=path.name):
                self.assertIn(BUNDLE, path.read_text(encoding="utf-8"))
        attribution = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        start = guide.index("### Five GitHub program operators")
        section = " ".join(guide[start:guide.index("\n---\n", start)].split())
        for name in SPECS:
            self.assertIn(f"| `{name}` |", attribution)
            self.assertIn(f"[{name}](.agent-skills/{name}/SKILL.md)", section)
        for needle in ["fabric-ai", BUNDLE, "--dry-run", "never run the upstream project", "runtime_verified: false",
                       "3.12.1", "`PROVISION`", ".env.local"]:
            with self.subTest(needle=needle):
                self.assertIn(needle, section)
        self.assertGreater(start, guide.index("## Reference — on-demand skill runtimes"))
        self.assertLess(start, guide.index("## Guard Boundaries"))

    def test_ci_runs_this_suite(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B scripts/test_five_github_programs.py -v", ci)

    def test_router_previews_the_bundle_without_installing(self):
        with tempfile.TemporaryDirectory(prefix="five-programs-home-") as home:
            proc = subprocess.run(
                [sys.executable, "-B", str(SKILLS_DIR / "jeo-skill" / "scripts" / "jeo-skill.py"), "install",
                 "--bundle", BUNDLE, "--global", "--dry-run"],
                capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=ROOT,
                env={"PATH": os.environ.get("PATH", ""), "HOME": home, "PYTHONDONTWRITEBYTECODE": "1"})
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertIn("Selected 5 skill(s)", proc.stdout)
            for name in BUNDLE_MEMBERS:
                self.assertIn(name, proc.stdout)
            self.assertEqual(os.listdir(home), [])


if __name__ == "__main__":
    unittest.main()
