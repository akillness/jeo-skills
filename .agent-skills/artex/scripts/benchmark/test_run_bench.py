#!/usr/bin/env python3
"""Benchmark judge contract tests; no model, server or Docker calls.

Run: python3 -m unittest discover -s scripts/benchmark -p 'test_*.py' -v
"""
from __future__ import annotations

import copy
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock

import run_bench


def verdict(gt_id, detected=True, matched_id=1):
    return {
        "gt_id": gt_id,
        "detected": detected,
        "matched_finding_id": matched_id if detected else None,
        "gates": {key: detected for key in ("component", "class", "keywords", "proof")},
        "reason": "fixture",
    }


class JudgeTests(unittest.TestCase):
    def setUp(self):
        self.args = types.SimpleNamespace(
            judge_url="", judge_key="", judge_model="judge", judge_timeout=1,
            gt_version="fixture", subject_model="subject",
        )
        self.gt = [{
            "id": gt_id, "title": "fixture", "cwe": "CWE-0", "classes": [],
            "components": [], "mechanism_keywords": [], "proof_hint": "fixture",
        } for gt_id in ("GT-A", "GT-B")]
        self.findings = [{"id": 1, "name": "match"}, {"id": 2, "name": "candidate"}]
        self.verdicts = [verdict("GT-A"), verdict("GT-B", False)]
        llm_patch = mock.patch.object(run_bench, "llm")
        self.llm = llm_patch.start()
        self.addCleanup(llm_patch.stop)
        print_patch = mock.patch("builtins.print")
        print_patch.start()
        self.addCleanup(print_patch.stop)

    def assert_refused(self, response):
        self.llm.reset_mock()
        self.llm.return_value = json.dumps(response)
        with self.assertRaisesRegex(SystemExit, "after 3 attempts; grader not trusted"):
            run_bench.run_judge(self.args, self.gt, self.findings)
        self.assertEqual(self.llm.call_count, 3)

    def test_valid_verdicts_keep_order_and_scores(self):
        # Output order need not match ground truth, and a match may earn partial gates.
        response = list(reversed(self.verdicts))
        response[1]["gates"]["proof"] = False
        self.llm.return_value = json.dumps(response)
        result = run_bench.run_judge(self.args, self.gt, self.findings)
        self.assertEqual(result, response)
        self.assertEqual(self.llm.call_count, 1)
        scores = run_bench.tally(self.gt, result, self.findings, [])
        self.assertEqual(scores["detected"], 1)
        self.assertEqual(scores["detection_rate"], 0.5)
        self.assertEqual(scores["gate_totals_over_detected"], {
            "component": 1, "class": 1, "keywords": 1, "proof": 0,
        })
        self.assertEqual(scores["discovery_candidates"], [{"id": 2, "name": "candidate"}])

    def test_code_fenced_json_still_works(self):
        self.llm.return_value = "```json\n" + json.dumps(self.verdicts) + "\n```"
        self.assertEqual(run_bench.run_judge(self.args, self.gt, self.findings), self.verdicts)

    def test_string_finding_ids_still_work(self):
        self.verdicts[0]["matched_finding_id"] = "finding-1"
        self.llm.return_value = json.dumps(self.verdicts)
        result = run_bench.run_judge(self.args, self.gt, [{"id": "finding-1"}])
        self.assertEqual(result, self.verdicts)

    def test_duplicate_ground_truth_cannot_inflate_detection(self):
        self.assert_refused([verdict("GT-A"), verdict("GT-A")])

    def test_ground_truth_ids_must_be_complete_and_known(self):
        for response in (
            self.verdicts[:1], self.verdicts + [verdict("GT-C")],
            [verdict("GT-A"), verdict("GT-C")],
            [verdict("GT-A"), verdict(None)],
            [verdict("GT-A"), verdict(["GT-B"])],
        ):
            with self.subTest(response=response):
                self.assert_refused(response)

    def test_response_must_be_an_array_of_objects(self):
        for response in (None, {}, True, [1, 2], [self.verdicts[0], None], [[], {}]):
            with self.subTest(response=response):
                self.assert_refused(response)

    def test_detected_must_be_a_boolean(self):
        for value in ("false", "true", 0, 1, None, [], {}):
            with self.subTest(value=value):
                response = copy.deepcopy(self.verdicts)
                response[0]["detected"] = value
                self.assert_refused(response)
        response = copy.deepcopy(self.verdicts)
        del response[0]["detected"]
        self.assert_refused(response)

    def test_each_gate_must_be_a_boolean(self):
        for key in ("component", "class", "keywords", "proof"):
            for value in ("false", 0, 1, None):
                with self.subTest(key=key, value=value):
                    response = copy.deepcopy(self.verdicts)
                    response[0]["gates"][key] = value
                    self.assert_refused(response)
            with self.subTest(missing_gate=key):
                response = copy.deepcopy(self.verdicts)
                del response[0]["gates"][key]
                self.assert_refused(response)
        for value in (None, [], "false"):
            with self.subTest(gates=value):
                response = copy.deepcopy(self.verdicts)
                response[0]["gates"] = value
                self.assert_refused(response)

    def test_detected_match_must_reference_a_provided_finding(self):
        # bool and float compare equal to integer 1 in Python; neither is an ID.
        for value in (None, 99, "1", True, 1.0, [], {}):
            with self.subTest(matched_id=value):
                response = copy.deepcopy(self.verdicts)
                response[0]["matched_finding_id"] = value
                self.assert_refused(response)
        response = copy.deepcopy(self.verdicts)
        del response[0]["matched_finding_id"]
        self.assert_refused(response)

    def test_non_detection_has_no_match_or_true_gates(self):
        response = copy.deepcopy(self.verdicts)
        response[1]["matched_finding_id"] = 2
        self.assert_refused(response)
        response = copy.deepcopy(self.verdicts)
        del response[1]["matched_finding_id"]
        self.assert_refused(response)
        for key in ("component", "class", "keywords", "proof"):
            with self.subTest(key=key):
                response = copy.deepcopy(self.verdicts)
                response[1]["gates"][key] = True
                self.assert_refused(response)

    def test_non_text_reason_is_refused_before_report_rendering(self):
        for value in (123, True, [], {}):
            with self.subTest(reason=value):
                response = copy.deepcopy(self.verdicts)
                response[0]["reason"] = value
                self.assert_refused(response)

    def test_empty_or_missing_reason_still_renders(self):
        del self.verdicts[0]["reason"]
        for value in (None, ""):
            with self.subTest(reason=value), tempfile.TemporaryDirectory() as tmp:
                self.verdicts[1]["reason"] = value
                self.llm.return_value = json.dumps(self.verdicts)
                result = run_bench.run_judge(self.args, self.gt, self.findings)
                self.assertEqual(result, self.verdicts)
                scores = run_bench.tally(self.gt, result, self.findings, [])
                out = pathlib.Path(tmp)
                run_bench.write_report(out, "fixture", self.args, {"id": 1}, "done",
                                       self.findings, result, scores)
                self.assertEqual(json.loads((out / "results.json").read_text())["verdicts"], result)
                self.assertIn("| GT-A | True |", (out / "report.md").read_text())

    def test_invalid_responses_can_recover_within_existing_retry_budget(self):
        self.llm.side_effect = [
            "not JSON", json.dumps([verdict("GT-A"), verdict("GT-A")]),
            json.dumps(self.verdicts),
        ]
        self.assertEqual(run_bench.run_judge(self.args, self.gt, self.findings), self.verdicts)
        self.assertEqual(self.llm.call_count, 3)

    def test_malformed_json_exhausts_retry_budget(self):
        self.llm.return_value = '[{"gt_id":'
        with self.assertRaisesRegex(SystemExit, "after 3 attempts; grader not trusted"):
            run_bench.run_judge(self.args, self.gt, self.findings)
        self.assertEqual(self.llm.call_count, 3)

    def test_non_text_model_content_exhausts_retry_budget(self):
        for value in (None, [], {}):
            with self.subTest(content=value):
                self.llm.reset_mock()
                self.llm.return_value = value
                with self.assertRaisesRegex(SystemExit, "after 3 attempts; grader not trusted"):
                    run_bench.run_judge(self.args, self.gt, self.findings)
                self.assertEqual(self.llm.call_count, 3)

    def test_valid_battery_still_passes(self):
        self.llm.side_effect = [json.dumps([v]) for v in (
            verdict("GT-X"), verdict("GT-Y", False), verdict("GT-Z", False),
        )]
        run_bench.judge_battery(self.args)
        self.assertEqual(self.llm.call_count, 3)

    def test_battery_rejects_string_false_instead_of_treating_it_as_true(self):
        positive = verdict("GT-X")
        positive["detected"] = "false"
        self.llm.side_effect = [json.dumps([v]) for v in (
            positive, verdict("GT-Y", False), verdict("GT-Z", False),
        )]
        with self.assertRaisesRegex(SystemExit, "grader not trusted"):
            run_bench.judge_battery(self.args)
        self.assertEqual(self.llm.call_count, 1)

    def test_battery_checks_the_same_id_and_gate_contract(self):
        for invalid in (
            verdict("GT-WRONG"),
            {**verdict("GT-X"), "gates": {"component": True}},
            {**verdict("GT-X"), "matched_finding_id": 99},
        ):
            with self.subTest(invalid=invalid):
                self.llm.reset_mock()
                self.llm.side_effect = [json.dumps([v]) for v in (
                    invalid, verdict("GT-Y", False), verdict("GT-Z", False),
                )]
                with self.assertRaisesRegex(SystemExit, "grader not trusted"):
                    run_bench.judge_battery(self.args)
                self.assertEqual(self.llm.call_count, 1)

    def test_battery_refuses_non_text_content_without_crashing(self):
        self.llm.return_value = None
        with self.assertRaisesRegex(SystemExit, "grader not trusted"):
            run_bench.judge_battery(self.args)
        self.assertEqual(self.llm.call_count, 1)

    def test_battery_still_refuses_a_well_formed_wrong_answer(self):
        self.llm.return_value = json.dumps([verdict("GT-X", False)])
        with self.assertRaisesRegex(SystemExit, "battery FAILED on 'positive'"):
            run_bench.judge_battery(self.args)

    def test_exhausted_invalid_grading_never_writes_results(self):
        bad_reason = copy.deepcopy(self.verdicts)
        bad_reason[0]["reason"] = 123
        for response in ([verdict("GT-A"), verdict("GT-A")], bad_reason):
            with self.subTest(response=response):
                self.llm.reset_mock()
                self.llm.return_value = json.dumps(response)
                findings = [{**f, "summary": "fixture", "report": "fixture"} for f in self.findings]
                argv = ["run_bench.py", "--subject-model", "subject", "--corpus-url", "http://fixture.test"]
                env = {"ARTEX_TOKEN": "fixture", "JUDGE_BASE_URL": "http://judge.test",
                       "JUDGE_MODEL": "judge", "JUDGE_API_KEY": "fixture"}
                with mock.patch.object(run_bench.sys, "argv", argv), \
                        mock.patch.dict(run_bench.os.environ, env, clear=True), \
                        mock.patch.object(run_bench.pathlib.Path, "read_text", return_value=json.dumps({"findings": self.gt})), \
                        mock.patch.object(run_bench, "deploy_corpus", return_value={"url": "http://fixture.test"}), \
                        mock.patch.object(run_bench, "create_task", return_value={"id": 1}), \
                        mock.patch.object(run_bench, "wait_task", return_value="done"), \
                        mock.patch.object(run_bench, "fetch_findings", return_value=findings), \
                        mock.patch.object(run_bench, "judge_battery"), \
                        mock.patch.object(run_bench, "write_report") as write_report:
                    with self.assertRaisesRegex(SystemExit, "after 3 attempts; grader not trusted"):
                        run_bench.main()
                write_report.assert_not_called()
                self.assertEqual(self.llm.call_count, 3)


if __name__ == "__main__":
    unittest.main()
