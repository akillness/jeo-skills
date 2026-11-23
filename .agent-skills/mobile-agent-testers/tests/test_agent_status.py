"""scripts/agent_status.py: how an agent's run ended, without leaking what it wrote."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import agent_status  # noqa: E402

SECRET_TEXT = "Settings: the device name is cut to 'Secret C...'"


class Classify(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.out, self.err = self.dir / "agent-output.json", self.dir / "agent-errors.txt"

    def status(self, output=None, errors=""):
        if output is not None:
            self.out.write_text(output if isinstance(output, str) else json.dumps(output), encoding="utf-8")
        self.err.write_text(errors, encoding="utf-8")
        return agent_status.classify(self.out, self.err)

    def test_finished_with_turns_and_cost(self):
        status, details = self.status({"type": "result", "subtype": "success", "is_error": False,
                                       "num_turns": 37, "total_cost_usd": 0.312, "result": SECRET_TEXT})
        self.assertEqual(status, "finished")
        self.assertEqual(details, {"num_turns": 37, "total_cost_usd": 0.312})
        self.assertEqual(agent_status.describe(status, details), "finished (37 turns, $0.31)")

    def test_out_of_turns(self):
        self.assertEqual(self.status({"subtype": "error_max_turns", "num_turns": 400})[0], "max_turns")

    def test_usage_limits(self):
        for text in ("You've hit your 5-hour limit", "You've hit your limit · resets 3pm (UTC)",
                     "Claude AI usage limit reached|1763900000", "You've hit your weekly limit"):
            with self.subTest(text=text):
                self.assertEqual(self.status({"subtype": "success", "is_error": True, "result": text})[0],
                                 "usage_limit")

    def test_refused_token_from_stderr_only(self):
        self.assertEqual(self.status("", "Invalid API key · Please run /login\n")[0], "auth")
        self.assertEqual(self.status("", 'API Error: 401 {"type":"error","error":{"type":"authentication_error"}}')[0],
                         "auth")

    def test_credit_rate_limit_overloaded(self):
        def result(text):
            return {"subtype": "success", "is_error": True, "result": text}
        self.assertEqual(self.status(result("Credit balance is too low"))[0], "credit")
        self.assertEqual(self.status(result('API Error: 429 {"type":"rate_limit_error"}'))[0], "rate_limit")
        self.assertEqual(self.status(result('API Error: 529 {"type":"overloaded_error"}'))[0], "overloaded")

    def test_no_output(self):
        self.assertEqual(self.status(None)[0], "no_output")
        self.assertEqual(self.status("", "")[0], "no_output")
        self.assertEqual(self.status("not json", "")[0], "no_output")

    def test_other_error(self):
        self.assertEqual(self.status({"subtype": "error_during_execution", "is_error": True})[0], "error")

    def test_message_list_output(self):
        msgs = [{"type": "system"}, {"type": "assistant"},
                {"type": "result", "subtype": "success", "is_error": False, "num_turns": 3}]
        self.assertEqual(self.status(msgs)[0], "finished")

    def test_text_inside_a_finished_report_is_ignored(self):
        # an app screen that says "usage limit" must not turn a finished run into a failure
        self.assertEqual(self.status({"subtype": "success", "is_error": False,
                                      "result": "The quota screen says usage limit reached"})[0], "finished")


class Output(unittest.TestCase):
    def run_script(self, output, errors="", env=None):
        d = Path(tempfile.mkdtemp())
        (d / "o.json").write_text(json.dumps(output), encoding="utf-8")
        (d / "e.txt").write_text(errors, encoding="utf-8")
        summary = d / "summary.md"
        full_env = {k: v for k, v in os.environ.items()
                    if k not in ("GITHUB_ACTIONS", "LLM_BASE_URL", "ANTHROPIC_API_KEY")}
        full_env.update(env or {})
        if full_env.get("GITHUB_ACTIONS") == "true":
            full_env["GITHUB_STEP_SUMMARY"] = str(summary)
        proc = subprocess.run([sys.executable, str(ROOT / "scripts" / "agent_status.py"),
                               str(d / "o.json"), str(d / "e.txt"), "anna"],
                              capture_output=True, text=True, env=full_env, check=True)
        return proc.stdout, summary.read_text(encoding="utf-8") if summary.exists() else ""

    def test_actions_annotation_and_summary_without_the_report(self):
        out, summary = self.run_script({"subtype": "success", "is_error": True,
                                        "result": "You've hit your 5-hour limit. " + SECRET_TEXT},
                                       env={"GITHUB_ACTIONS": "true"})
        self.assertTrue(out.startswith("::warning title=anna stopped on a Claude usage limit::"), out)
        self.assertIn("anna: stopped on a Claude usage limit", summary)
        self.assertNotIn("Secret", out + summary)

    def test_finished_run_prints_no_report_text(self):
        out, summary = self.run_script({"subtype": "success", "is_error": False, "num_turns": 12,
                                        "result": SECRET_TEXT}, env={"GITHUB_ACTIONS": "true"})
        self.assertEqual(out.strip(), "anna: finished (12 turns)")
        self.assertNotIn("Secret", out + summary)

    def test_auth_hint_names_the_secret_in_use(self):
        out, _ = self.run_script({"subtype": "success", "is_error": True, "result": "Invalid API key"},
                                 env={"GITHUB_ACTIONS": "true", "LLM_BASE_URL": "https://openrouter.ai/api"})
        self.assertIn("::error title=anna could not sign in to the model API::", out)
        self.assertIn("gh secret set LLM_API_KEY", out)

    def test_plain_line_on_your_machine(self):
        out, _ = self.run_script({"subtype": "success", "is_error": True, "result": "Credit balance is too low"})
        self.assertEqual(out.strip(), "WARNING: anna: found no API credit")

    def test_annotation_titles_have_no_reserved_characters(self):
        for level, title, _ in agent_status.PROBLEMS.values():
            self.assertIn(level, ("warning", "error"))
            self.assertNotRegex(title, "[:,%\n]")


class Wiring(unittest.TestCase):
    def test_both_platforms_and_collect_call_it(self):
        for f in ("scripts/ios/run_agent.sh", "scripts/android/run_agent.sh", "scripts/collect.sh"):
            with self.subTest(f=f):
                self.assertIn("agent_status.py", (ROOT / f).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
