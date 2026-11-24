#!/usr/bin/env python3
"""Unit tests for the DrostBench corpus adapter (pure functions only; the
docker lifecycle is exercised by a real deploy, not here).

Run: python3 -m unittest test_drost -v
"""
from __future__ import annotations

import json
import pathlib
import tempfile
import unittest

import drost


class FlagTests(unittest.TestCase):
    def test_random_flag_shape(self):
        self.assertRegex(drost.random_flag(), r"^flag\{[0-9a-f-]{36}\}$")

    def test_validate_flag_accepts_both_suite_formats(self):
        drost.validate_flag("flag{2446f870-cd6d-4106-9864-4f227ce177d3}")
        drost.validate_flag("FLAG{" + "ab" * 32 + "}")

    def test_validate_flag_rejects_non_suite_formats(self):
        for bad in ("flag{short}", "FLAG{" + "zz" * 32 + "}", "nope", "flag{2446F870-cd6d-4106-9864-4f227ce177d3}"):
            with self.assertRaises(SystemExit):
                drost.validate_flag(bad)

    def test_flag_in_texts(self):
        f = drost.random_flag()
        self.assertTrue(drost.flag_in_texts(f, ["nothing", f"loot: {f}\n"]))
        self.assertFalse(drost.flag_in_texts(f, ["nothing here"]))


class ChallengeTests(unittest.TestCase):
    def test_challenge_validation(self):
        drost.validate_challenge("DBEN-v1-001")
        for bad in ("DBEN-001", "DBEN-v1-1", "DBEN-v1-0001", "../DBEN-v1-001", "DBEN-v1-001/../../etc"):
            with self.assertRaises(SystemExit):
                drost.validate_challenge(bad)

    def test_compose_project_sanitized(self):
        self.assertEqual(drost.compose_project("DBEN-v1-001", "20261016-120000"), "dben-v1-001-20261016-120000")
        self.assertEqual(drost.compose_project("DBEN-v1-001", "run:1!"), "dben-v1-001-run1")

    def test_host_port_parsing(self):
        self.assertEqual(drost.host_port("0.0.0.0:32768\n"), 32768)
        self.assertEqual(drost.host_port("[::]:49153"), 49153)
        with self.assertRaises(SystemExit):
            drost.host_port("no port here")


class GroundTruthTests(unittest.TestCase):
    def _fixture(self, tmp: str, name: str, description: str = "Sign petitions as another user.", tags=None) -> str:
        repo = pathlib.Path(tmp)
        cdir = repo / "benchmarks" / "DBEN-v1-001"
        cdir.mkdir(parents=True)
        (cdir / "benchmark.json").write_text(json.dumps({
            "name": name,
            "description": description,
            "level": 1,
            "win_condition": "flag",
            "tags": tags if tags is not None else ["csrf"],
        }))
        return str(repo)

    def test_derive_from_benchmark_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._fixture(tmp, "DBEN-v1-001 Petitions")
            gt = drost.derive_ground_truth(repo, "DBEN-v1-001")
            self.assertEqual(gt["corpus"], "drost-benchmarks/DBEN-v1-001")
            self.assertTrue(gt["version"].startswith("DBEN-v1-001@"))
            self.assertIn("Sign petitions", gt["task_goal_template"])
            self.assertIn("flag", gt["task_goal_template"].lower())
            # the URL placeholder must survive into the template: create_task
            # replaces it with the task target. Without it the task goal names
            # no target and agents wander to unrelated assets (seen live).
            self.assertIn("{url}", gt["task_goal_template"])
            entry = gt["findings"][0]
            self.assertEqual(entry["id"], "GT-FLAG")
            self.assertEqual(entry["classes"], ["csrf"])
            self.assertEqual(entry["components"], [])
            self.assertEqual(entry["proof_hint"], "Sign petitions as another user.")

    def test_derive_refuses_name_not_prefixed_by_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._fixture(tmp, "Petitions")
            with self.assertRaises(SystemExit):
                drost.derive_ground_truth(repo, "DBEN-v1-001")

    def test_derive_refuses_missing_description(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._fixture(tmp, "DBEN-v1-001 Petitions", description="")
            with self.assertRaises(SystemExit):
                drost.derive_ground_truth(repo, "DBEN-v1-001")

    def test_derive_refuses_missing_challenge(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit):
                drost.derive_ground_truth(tmp, "DBEN-v1-042")


class FindingTextTests(unittest.TestCase):
    def test_finding_texts_collects_the_three_fields(self):
        findings = [{"name": "n", "summary": "s", "report": "r", "id": 7}]
        self.assertEqual(drost.finding_texts(findings), ["n", "s", "r"])

    def test_finding_texts_tolerates_missing_fields(self):
        self.assertEqual(drost.finding_texts([{"id": 7}]), ["", "", ""])


if __name__ == "__main__":
    unittest.main()
