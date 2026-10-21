#!/usr/bin/env python3
"""Black-box quarantine, Jev-gate, and relevance regressions.

Run: python3 scripts/test_skill_quarantine_regressions.py -v
"""

from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / ".agent-skills/jeo-skill/scripts"
ROUTER = SCRIPTS / "jeo-skill.py"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
import skill_jev  # type: ignore  # noqa: E402
import skill_quarantine  # type: ignore  # noqa: E402


FAKE_HARNESS = r'''import json
import os
import signal
import sys
import time

args = sys.argv[1:]
log = os.environ.get("JEO_CALL_LOG")
if log:
    with open(log, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(args) + "\n")

if "route-skills" in args:
    response = json.loads(os.environ.get("JEO_ROUTE_JSON", "{}"))
    print(json.dumps(response))
    raise SystemExit(0)

mode = os.environ.get("JEO_FAKE_MODE", "permit")
if mode == "timeout":
    time.sleep(5)
    raise SystemExit(0)
backend = {"kind": "fixture", "model": "fixture-model", "tier": "test"}
receipt = "a" * 64
responses = {
    "permit": {"verdict": "permit", "receiptVersion": 2, "receipt": receipt, "backend": backend, "reason": "fixture permit"},
    "proposal_only": {"verdict": "proposal_only", "receiptVersion": 2, "receipt": receipt, "backend": backend, "reason": "fixture proposal"},
    "deny": {"verdict": "deny", "receipt": None, "backend": backend, "reason": "fixture deny"},
    "unavailable": {"verdict": "unavailable", "receipt": None, "backend": backend, "reason": "fixture unavailable"},
    "malformed": {"not": "a verdict"},
    "no_receipt": {"verdict": "permit", "receiptVersion": 2, "receipt": None, "backend": backend, "reason": "missing receipt"},
}
if mode == "trailing":
    sys.stdout.write(json.dumps(responses["permit"]) + "\ntrailing output\n")
else:
    print(json.dumps(responses.get(mode, responses["permit"])))
'''


class SkillQuarantineRegressions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-quarantine-test-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.home = self.work / "home"
        self.project = self.work / "project"
        self.state = self.work / "state"
        self.catalog_root = self.work / "catalog"
        self.call_log = self.work / "jev-calls.jsonl"
        self.fake = self.work / "jev-harness.py"
        self.home.mkdir()
        self.project.mkdir()
        self.catalog_root.mkdir()
        self.fake.write_text("#!" + sys.executable + "\n" + FAKE_HARNESS, encoding="utf-8")
        self.fake.chmod(0o700)
        self.agents_root = self.home / ".agents" / "skills"
        self.agents_root.mkdir(parents=True)
        self.real_config = self.work / "real-claude-config"
        (self.real_config / "skills").mkdir(parents=True)
        self.claude_link = self.home / "claude-config-link"
        self.claude_link.symlink_to(self.real_config, target_is_directory=True)
        self.names = ["alpha", "mismatch", "linked", "ancestor", "fit", "low", "keepme", "jeo-skill"]
        skills = []
        for name in self.names:
            self._write_catalog_skill(name, f"# {name.title()}")
            skills.append({"name": name, "category": "testing", "description": f"fixture {name}"})
        self.catalog = self.catalog_root / "skills.json"
        self.catalog.write_text(json.dumps({
            "version": "fixture",
            "categories": {"testing": {}},
            "subcategories": {},
            "bundles": {},
            "skills": skills,
        }), encoding="utf-8")
        self.fixed_now = "2026-10-21T00:00:00Z"
        self.old = "2020-01-01T00:00:00Z"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "XDG_STATE_HOME": str(self.work / "xdg-state"),
            "JEO_SKILL_STATE_DIR": str(self.state),
            "JEO_SKILLS_CATALOG": str(self.catalog),
            "JEO_SKILL_JEV_HARNESS": str(self.fake),
            "JEO_CALL_LOG": str(self.call_log),
            "JEO_SKILL_NOW": self.fixed_now,
            "CLAUDE_CONFIG_DIR": str(self.claude_link),
            "PYTHONDONTWRITEBYTECODE": "1",
        }

    def _write_catalog_skill(self, name: str, heading: str):
        directory = self.catalog_root / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "SKILL.md").write_text(
            f"---\nname: {name}\n---\n\n{heading}\nCatalog fixture.\n", encoding="utf-8"
        )

    def _skill(self, root: Path, name: str, heading: str | None = None, *, artifacts: bool = False):
        directory = root / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "SKILL.md").write_text(
            f"---\nname: {name}\n---\n\n{heading or f'# {name.title()}'}\nInstalled fixture.\n", encoding="utf-8"
        )
        if artifacts:
            (directory / ".DS_Store").write_bytes(b"runtime bytes\x00\xff")
            cache = directory / "__pycache__"
            cache.mkdir()
            (cache / "x.pyc").write_bytes(b"compiled runtime bytes")
            (directory / "empty-dir").mkdir()
        return directory

    def install_standard(self):
        self._skill(self.agents_root, "alpha", artifacts=True)
        self._skill(self.agents_root, "mismatch", heading="# Not The Catalog Skill")
        linked_target = self.work / "linked-target"
        self._skill(linked_target.parent, linked_target.name)
        (self.agents_root / "linked").symlink_to(linked_target, target_is_directory=True)
        self._skill(self.real_config / "skills", "ancestor")

    def install_alpha_only(self):
        self.agents_root.mkdir(parents=True, exist_ok=True)
        self._skill(self.agents_root, "alpha", artifacts=True)

    def _write_json(self, path: Path, value: object):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        path.chmod(0o600)

    def write_usage(self, *, names: list[str] | None = None):
        selected = names or self.names
        self._write_json(self.state / "usage.json", {
            "version": 1,
            "tracking_started_at": self.old,
            "scanned_at": self.fixed_now,
            "sources": {},
            "skills": {
                name: {
                    "count": 0,
                    "first_used_at": None,
                    "last_used_at": None,
                    "by_source": {},
                    "first_seen_installed_at": self.old,
                }
                for name in selected
            },
        })
        self._write_json(self.state / "policy.json", {"version": 1, "keep": ["keepme"], "grace_days": 30})

    def cli(self, *args, extra_env=None, timeout=15):
        return subprocess.run(
            [sys.executable, str(ROUTER), *args], cwd=self.project,
            env={**self.env, **(extra_env or {})}, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
        )

    def snapshot(self, root: Path | None = None):
        root = root or self.work
        result = {}
        for path in sorted(root.rglob("*"), key=str):
            relative = str(path.relative_to(root))
            if path.is_symlink():
                result[relative] = ("symlink", os.readlink(path))
            elif path.is_dir():
                result[relative] = ("dir",)
            elif path.is_file():
                result[relative] = ("file", path.read_bytes())
        return result

    def runtime_snapshot(self):
        return {
            "agents": self.snapshot(self.home / ".agents"),
            "real_config": self.snapshot(self.real_config),
            "quarantine": self.snapshot(self.state / "quarantine") if (self.state / "quarantine").exists() else {},
        }

    def calls(self):
        if not self.call_log.exists():
            return []
        return [json.loads(line) for line in self.call_log.read_text(encoding="utf-8").splitlines()]

    def successful(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_prune_preview_is_byte_inert_and_reports_only_provable_copies(self):
        self.install_standard()
        self.write_usage()
        before = self.snapshot()
        result = self.cli("prune-unused", "--global", "--json")
        self.successful(result)
        payload = json.loads(result.stdout)
        self.assertEqual([item["skill"] for item in payload["items"]], ["alpha"])
        kept_reasons = {item["reason"] for item in payload["kept"]}
        self.assertIn("fingerprint differs from the retired catalog skill", kept_reasons)
        self.assertTrue(any("symlink" in reason.lower() for reason in kept_reasons))
        self.assertIsNone(payload["batch"])
        self.assertFalse(payload["apply"])
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.calls(), [])

    def test_apply_quarantines_provable_tree_and_manifest_preserves_review_schema(self):
        self.install_standard()
        self.write_usage()
        preview = self.cli("prune-unused", "--global", "--json")
        self.successful(preview)
        self.assertEqual([item["skill"] for item in json.loads(preview.stdout)["items"]], ["alpha"])
        result = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(result)
        manifest = json.loads(result.stdout)
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(manifest["review"]["status"], "skipped")
        self.assertIsNone(manifest["review"]["receipt"])
        self.assertIsNone(manifest["review"]["backend"])
        self.assertEqual(len(manifest["items"]), 1)
        item = manifest["items"][0]
        self.assertEqual(item["skill"], "alpha")
        self.assertEqual(item["state"], "quarantined")
        self.assertRegex(item["sha256"], r"^[0-9a-f]{64}$")
        self.assertFalse((self.agents_root / "alpha").exists())
        self.assertTrue((self.agents_root / "mismatch").exists())
        self.assertTrue((self.agents_root / "linked").is_symlink())
        self.assertTrue((self.claude_link / "skills" / "ancestor" / "SKILL.md").exists())
        stored = self.state / "quarantine" / manifest["batch"] / item["stored"]
        self.assertEqual((stored / ".DS_Store").read_bytes(), b"runtime bytes\x00\xff")
        self.assertEqual((stored / "__pycache__" / "x.pyc").read_bytes(), b"compiled runtime bytes")
        self.assertTrue((stored / "empty-dir").is_dir())
        listed = self.cli("restore", "--list", "--json")
        self.successful(listed)
        self.assertEqual(json.loads(listed.stdout)[0]["batch"], manifest["batch"])

    def test_restore_round_trip_is_byte_identical_and_refuses_existing_destination(self):
        self.install_alpha_only()
        self.write_usage()
        original_snapshot = self.snapshot(self.agents_root / "alpha")
        result = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(result)
        batch = json.loads(result.stdout)["batch"]
        preview = self.cli("restore", "--batch", batch, "--json")
        self.successful(preview)
        self.assertEqual(json.loads(preview.stdout)[0]["action"], "would-restore")
        self.assertFalse((self.agents_root / "alpha").exists())
        self._skill(self.agents_root, "alpha")
        preexisting = (self.agents_root / "alpha" / "SKILL.md").read_bytes()
        refused = self.cli("restore", "--batch", batch, "--apply", "--json")
        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
        self.assertEqual(json.loads(refused.stdout)[0]["action"], "kept")
        self.assertIn("original path exists", json.loads(refused.stdout)[0]["reason"])
        self.assertEqual((self.agents_root / "alpha" / "SKILL.md").read_bytes(), preexisting)
        shutil.rmtree(self.agents_root / "alpha")
        restored = self.cli("restore", "--batch", batch, "--apply", "--json")
        self.successful(restored)
        self.assertEqual(json.loads(restored.stdout)[0]["action"], "restored")
        self.assertEqual(self.snapshot(self.agents_root / "alpha"), original_snapshot)

    def test_cross_device_move_copies_full_fidelity(self):
        # Distinct parents so the patched device ids differ and the copy branch is taken.
        source = self.work / "source-device" / "cross-source"
        destination = self.work / "destination-device" / "cross-destination"
        source.parent.mkdir()
        destination.parent.mkdir()
        self._skill(source.parent, source.name, artifacts=True)
        source_snapshot = self.snapshot(source)
        expected = skill_quarantine._tree_hash(source)
        real_stat = os.stat

        class StatProxy:
            def __init__(self, original, device):
                self.original = original
                self.st_dev = device
            def __getattr__(self, name):
                return getattr(self.original, name)

        def fake_stat(path, *args, **kwargs):
            value = real_stat(path, *args, **kwargs)
            try:
                current = Path(path)
            except TypeError:
                return value
            if current == source.parent:
                return StatProxy(value, 11)
            if current == destination.parent:
                return StatProxy(value, 22)
            return value

        copy_calls = []
        real_copy = skill_quarantine._copy_tree_exact

        def spy_copy(src, dst):
            copy_calls.append((Path(src), Path(dst)))
            return real_copy(src, dst)

        with patch.dict(os.environ, self.env, clear=True):
            with patch.object(skill_quarantine.os, "stat", side_effect=fake_stat), \
                    patch.object(skill_quarantine, "_copy_tree_exact", side_effect=spy_copy):
                skill_quarantine._move_tree_exclusive(source, destination, expected)
        self.assertEqual(len(copy_calls), 1, "cross-device move must use the exact-copy path")
        self.assertEqual(copy_calls[0][0], source)
        self.assertFalse(source.exists())
        self.assertEqual(self.snapshot(destination), source_snapshot)
        self.assertEqual(skill_quarantine._tree_hash(destination), expected)
        self.assertTrue((destination / "empty-dir").is_dir())
        self.assertEqual((destination / "__pycache__" / "x.pyc").read_bytes(), b"compiled runtime bytes")

    def test_list_batches_discovers_batch_after_mid_batch_manifest_failure_and_restore_succeeds(self):
        source = self._skill(self.agents_root, "alpha", artifacts=True)
        self.write_usage()
        with patch.dict(os.environ, self.env, clear=True):
            plan = skill_quarantine.plan_quarantine(["alpha"], [self.agents_root], {"alpha": "# Alpha"})
        self.assertEqual(plan[0]["action"], "would-quarantine")
        real_atomic = skill_quarantine._atomic_json
        calls = {"count": 0}

        def fail_after_initial(path, data):
            calls["count"] += 1
            if calls["count"] == 1:
                return real_atomic(path, data)
            raise OSError("injected manifest write failure")

        with patch.dict(os.environ, self.env, clear=True):
            with patch.object(skill_quarantine, "_atomic_json", side_effect=fail_after_initial):
                manifest = skill_quarantine.quarantine(
                    plan, review={"status": "skipped", "receipt": None, "backend": None},
                    apply=True, reason="fixture failure",
                )
        self.assertIn("errors", manifest)
        self.assertFalse(source.exists())
        with patch.dict(os.environ, self.env, clear=True):
            batches = skill_quarantine.list_batches()
            self.assertEqual([batch["batch"] for batch in batches], [manifest["batch"]])
            restored = skill_quarantine.restore(batch=manifest["batch"], apply=True)
        self.assertEqual(restored[0]["action"], "restored")
        self.assertTrue(source.is_dir())
        self.assertEqual((source / ".DS_Store").read_bytes(), b"runtime bytes\x00\xff")


    def test_purge_preview_respects_age_and_apply_removes_old_batch(self):
        self.install_alpha_only()
        self.write_usage()
        result = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(result)
        manifest = json.loads(result.stdout)
        manifest_path = self.state / "quarantine" / manifest["batch"] / "manifest.json"
        manifest["created_at"] = "2020-01-01T00:00:00Z"
        self._write_json(manifest_path, manifest)
        preview = self.cli("purge-quarantine", "--older-than", "30", "--json")
        self.successful(preview)
        self.assertEqual(json.loads(preview.stdout)[0]["action"], "would-purge")
        self.assertTrue(manifest_path.exists())
        applied = self.cli("purge-quarantine", "--older-than", "30", "--apply", "--json")
        self.successful(applied)
        self.assertEqual(json.loads(applied.stdout)[0]["action"], "purged")
        self.assertFalse(manifest_path.parent.exists())
    def test_unreadable_usage_store_refuses_apply_and_control_succeeds(self):
        self.install_alpha_only()
        self.write_usage()
        broken_store = self.home / ".claude.json"
        broken_store.write_text("{not valid json\n", encoding="utf-8")

        scanned = self.cli("usage", "scan", "--json")
        self.successful(scanned)
        scan = json.loads(scanned.stdout)
        self.assertIn("Expecting property name", scan["sources"]["claude_skillusage"]["error"])

        before = self.runtime_snapshot()
        preview = self.cli("prune-unused", "--global")
        self.successful(preview)
        self.assertIn("usage source claude_skillusage failed:", preview.stderr)
        self.assertIn("would-quarantine alpha", preview.stdout)

        refused = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review")
        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
        self.assertIn("refusing to quarantine", refused.stderr)
        self.assertIn("claude_skillusage", refused.stderr)
        self.assertEqual(self.runtime_snapshot(), before)
        self.assertTrue((self.agents_root / "alpha").exists())

        broken_store.unlink()
        applied = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(applied)
        manifest = json.loads(applied.stdout)
        self.assertEqual(manifest["items"][0]["state"], "quarantined")
        self.assertFalse((self.agents_root / "alpha").exists())
    def test_prune_apply_propagates_injected_move_failure(self):
        self.install_alpha_only()
        self.write_usage()
        import argparse
        import skill_usage_cli  # type: ignore

        args = argparse.Namespace(
            command="prune-unused", apply=True, global_install=True,
            jev_profile=None, allow_remote=False, skip_jev_review=True, json=True,
        )
        roots = lambda global_install: [self.agents_root] if global_install else []
        with patch.dict(os.environ, self.env, clear=True):
            with contextlib.redirect_stdout(io.StringIO()):
                with patch.object(skill_quarantine, "_move_tree_exclusive",
                                  side_effect=OSError("injected move failure")):
                    status = skill_usage_cli.command_prune_unused(
                        args, json.loads(self.catalog.read_text(encoding="utf-8")),
                        str(self.catalog), roots,
                    )
            batches = skill_quarantine.list_batches()
        self.assertEqual(status, 1)
        self.assertTrue((self.agents_root / "alpha").exists())
        self.assertEqual(len(batches), 1)
        self.assertIn("errors", batches[0])
        self.assertIn("injected move failure", batches[0]["errors"][0]["error"])

    def test_restore_apply_with_no_matching_item_is_an_error(self):
        self.install_alpha_only()
        self.write_usage()
        applied = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(applied)
        missing = self.cli("restore", "--skill", "does-not-exist", "--apply", "--json")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("no quarantined item matches", missing.stderr)


    def _reset_for_gate(self):
        shutil.rmtree(self.home / ".agents", ignore_errors=True)
        self.agents_root.mkdir(parents=True)
        shutil.rmtree(self.state, ignore_errors=True)
        if self.call_log.exists():
            self.call_log.unlink()
        self.install_alpha_only()
        self.write_usage()

    def test_missing_allow_remote_never_invokes_harness_or_changes_runtime_tree(self):
        self._reset_for_gate()
        before = self.runtime_snapshot()
        result = self.cli("prune-unused", "--global", "--apply", "--jev-profile", "fixture")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--allow-remote", result.stderr)
        self.assertEqual(self.calls(), [])
        self.assertEqual(self.runtime_snapshot(), before)
        self.assertTrue((self.agents_root / "alpha").exists())

    def test_review_backend_failures_refuse_apply_without_quarantine(self):
        for mode in ("deny", "unavailable", "malformed", "trailing", "no_receipt"):
            with self.subTest(mode=mode):
                self._reset_for_gate()
                result = self.cli("prune-unused", "--global", "--apply", "--jev-profile", "fixture",
                                  "--allow-remote", extra_env={"JEO_FAKE_MODE": mode})
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("Jev", result.stderr)
                self.assertTrue((self.agents_root / "alpha").exists())
                self.assertFalse((self.state / "quarantine").exists())
                self.assertEqual(len(self.calls()), 1)

    def test_review_timeout_is_unavailable_and_fail_closed(self):
        self._reset_for_gate()
        proposal = {"skills": ["alpha"], "scope": "local-install"}
        with patch.dict(os.environ, {**self.env, "JEO_FAKE_MODE": "timeout"}, clear=True):
            # Long enough for the fake harness to start and log its call, far below its 5 s sleep.
            result = skill_jev.review_removal(proposal, profile="fixture", allow_remote=True, timeout=1.5)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "timeout")
        self.assertEqual(len(self.calls()), 1)
        self.assertTrue((self.agents_root / "alpha").exists())

    def test_profile_is_required_and_skip_records_review_status(self):
        self._reset_for_gate()
        missing = self.cli("prune-unused", "--global", "--apply")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("--jev-profile or --skip-jev-review", missing.stderr)
        self.assertTrue((self.agents_root / "alpha").exists())
        applied = self.cli("prune-unused", "--global", "--apply", "--skip-jev-review", "--json")
        self.successful(applied)
        self.assertEqual(json.loads(applied.stdout)["review"]["status"], "skipped")

    def test_proposal_only_receipt_is_stored_and_permit_without_receipt_is_refused(self):
        self._reset_for_gate()
        proposal = self.cli("prune-unused", "--global", "--apply", "--jev-profile", "fixture",
                            "--allow-remote", "--json", extra_env={"JEO_FAKE_MODE": "proposal_only"})
        self.successful(proposal)
        manifest = json.loads(proposal.stdout)
        self.assertEqual(manifest["review"]["status"], "proposal_only")
        self.assertEqual(manifest["review"]["receipt"], "a" * 64)
        self.assertEqual(manifest["review"]["backend"]["kind"], "fixture")
        self.assertFalse((self.agents_root / "alpha").exists())
        self._reset_for_gate()
        refused = self.cli("prune-unused", "--global", "--apply", "--jev-profile", "fixture",
                           "--allow-remote", extra_env={"JEO_FAKE_MODE": "no_receipt"})
        self.assertNotEqual(refused.returncode, 0)
        self.assertTrue((self.agents_root / "alpha").exists())
        self.assertFalse((self.state / "quarantine").exists())

    def _make_repo(self):
        repo = self.project / "relevance-repo"
        repo.mkdir(exist_ok=True)
        (repo / "README.md").write_text("Use fit and low skills for this fixture.\n", encoding="utf-8")
        return repo

    def test_relevance_requires_allow_remote_before_harness_and_dry_run_is_inert(self):
        self.write_usage()
        repo = self._make_repo()
        missing = self.cli("usage", "relevance", "--repos", str(repo), "--jev-profile", "fixture", "--json")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("--allow-remote", missing.stderr)
        self.assertEqual(self.calls(), [])
        self.assertFalse((self.state / "relevance.json").exists())
        dry = self.cli("usage", "relevance", "--repos", str(repo), "--jev-profile", "fixture",
                       "--allow-remote", "--dry-run", "--json")
        self.successful(dry)
        self.assertTrue(json.loads(dry.stdout)["dry_run"])
        self.assertEqual(self.calls(), [])
        self.assertFalse((self.state / "relevance.json").exists())

    def test_relevance_threshold_and_repeat_runs_have_stable_protected_set(self):
        self.write_usage()
        repo = self._make_repo()
        route = {
            "topK": [
                {"name": "fit", "fits": 0.30},
                {"name": "low", "fits": 0.29},
            ],
            "backend": {"kind": "fixture", "model": "route-model", "tier": "test"},
        }
        first = self.cli("usage", "relevance", "--repos", str(repo), "--jev-profile", "fixture",
                         "--allow-remote", "--json", extra_env={"JEO_ROUTE_JSON": json.dumps(route)})
        self.successful(first)
        first_data = json.loads(first.stdout)
        self.assertEqual(sorted(first_data["protect"]), ["fit"])
        self.assertEqual(first_data["protect"]["fit"]["score"], 0.30)
        self.assertNotIn("low", first_data["protect"])
        self.assertTrue(any("route-skills" in call for call in self.calls()))
        second = self.cli("usage", "relevance", "--repos", str(repo), "--jev-profile", "fixture",
                          "--allow-remote", "--json", extra_env={"JEO_ROUTE_JSON": json.dumps(route)})
        self.successful(second)
        second_data = json.loads(second.stdout)
        self.assertEqual(second_data["protect"], first_data["protect"])
        persisted = json.loads((self.state / "relevance.json").read_text(encoding="utf-8"))
        self.assertEqual(persisted["protect"], first_data["protect"])
        self.assertEqual(len(self.calls()), 2)


if __name__ == "__main__":
    unittest.main()
