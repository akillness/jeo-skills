#!/usr/bin/env python3
"""Offline black-box regressions for the ECC planning helper.

Run: python3 scripts/test_ecc_regressions.py -v
The helper is exercised through its public shell CLI with an isolated HOME and
executable stubs that fail if a provider, installer, backend, or host command is
attempted.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills/ecc/scripts/ecc.sh"


class ECCProposalRegressions(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="ecc-proposal-regression-")
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name).resolve()
        self.home = self.work / "home"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.stub_log = self.work / "external-command.log"
        self.env = {
            "HOME": str(self.home),
            "PATH": str(self.bin),
            "TMPDIR": str(self.work),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "ECC_STUB_LOG": str(self.stub_log),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        # Any accidental provider/install/backend/host invocation is observable
        # and fails instead of reaching a real service or executable.
        stub = "#!/bin/sh\nprintf '%s %s\\n' \"$0\" \"$*\" >> \"$ECC_STUB_LOG\"\nexit 97\n"
        for name in (
            "claude",
            "codex",
            "curl",
            "git",
            "jev",
            "jev-harness",
            "node",
            "npm",
            "npx",
            "sed",
            "uname",
            "wget",
        ):
            path = self.bin / name
            path.write_text(stub, encoding="utf-8")
            path.chmod(0o700)

    def run_helper(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/bash", str(HELPER), *args],
            cwd=self.work,
            env=self.env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
            check=False,
        )

    @staticmethod
    def command_lines(output: str) -> list[str]:
        return [
            line.strip()
            for line in output.splitlines()
            if line.strip().startswith(("npx ", "codex "))
        ]

    def proposal(self, output: str) -> dict[str, object]:
        rows = [line.removeprefix("jevproposal=") for line in output.splitlines() if line.startswith("jevproposal=")]
        self.assertEqual(len(rows), 1, output)
        decoded = json.loads(rows[0])
        self.assertIsInstance(decoded, dict)
        return decoded

    def assert_success(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertEqual(result.returncode, 0, result.stdout)

    def assert_side_effect_free(self) -> None:
        self.assertFalse(self.stub_log.exists(), self.stub_log.read_text(encoding="utf-8") if self.stub_log.exists() else "")
        self.assertEqual(tuple(self.home.rglob("*")), ())

    def test_claude_proposal_normalizes_omitted_partial_and_explicit_values(self) -> None:
        cases = (
            ("omitted", ("plan", "claude", "--proposal"), "user", "standard"),
            ("partial-scope", ("plan", "claude", "project", "--proposal"), "project", "standard"),
            ("partial-hooks", ("plan", "claude", "--proposal", "user", "strict"), "user", "strict"),
            ("explicit", ("plan", "claude", "local", "strict", "--proposal"), "local", "strict"),
        )
        for name, args, expected_scope, expected_hooks in cases:
            with self.subTest(name=name):
                result = self.run_helper(*args)
                self.assert_success(result)
                proposal = self.proposal(result.stdout)
                plan = proposal["plan"]
                self.assertEqual(plan["scope"], expected_scope)
                self.assertEqual(plan["hooks"], expected_hooks)
                self.assertEqual(plan["mode"], "claude-plugin")
                self.assertEqual(proposal["harness"], "claude")
                commands = self.command_lines(result.stdout)
                self.assertEqual(len(commands), 1, result.stdout)
                self.assertEqual(plan["sequence"][0], commands[0])
                self.assertEqual(plan["sequence"][1], commands[0].replace(" --dry-run --json", " --yes --json"))
                self.assertIn(f"scope={expected_scope}", result.stdout)
                self.assertIn(f"hooks={expected_hooks}", result.stdout)
                self.assert_side_effect_free()

    def test_claude_proposal_flag_position_preserves_semantic_arguments(self) -> None:
        outputs = []
        for args in (
            ("plan", "claude", "--proposal", "local", "strict"),
            ("plan", "claude", "local", "--proposal", "strict"),
            ("plan", "claude", "local", "strict", "--proposal"),
        ):
            result = self.run_helper(*args)
            self.assert_success(result)
            plan = self.proposal(result.stdout)["plan"]
            outputs.append((plan["scope"], plan["hooks"], tuple(plan["sequence"]), tuple(self.command_lines(result.stdout))))
        self.assert_side_effect_free()
        self.assertEqual(outputs[0], outputs[1])
        self.assertEqual(outputs[1], outputs[2])
        self.assertEqual(outputs[0][0:2], ("local", "strict"))

    def test_no_proposal_retains_plain_plan_output_without_execution(self) -> None:
        result = self.run_helper("plan", "claude", "local", "strict")
        self.assert_success(result)
        self.assertNotIn("jevproposal=", result.stdout)
        self.assertIn("mode=plan", result.stdout)
        self.assertIn("target=claude", result.stdout)
        self.assertIn("scope=local", result.stdout)
        self.assertIn("hooks=strict", result.stdout)
        self.assertEqual(
            self.command_lines(result.stdout),
            ["npx --yes --package ecc-universal ecc setup --mode claude-plugin --scope local --hooks strict --dry-run --json"],
        )
        self.assert_side_effect_free()

    def test_codex_and_kimi_proposals_match_their_printed_fixed_sequences(self) -> None:
        cases = (("codex", ("plan", "codex", "--proposal")), ("kimi", ("plan", "kimi", "--proposal")))
        for target, args in cases:
            with self.subTest(target=target):
                result = self.run_helper(*args)
                self.assert_success(result)
                proposal = self.proposal(result.stdout)
                plan = proposal["plan"]
                commands = self.command_lines(result.stdout)
                if target == "codex":
                    self.assertEqual(plan["mode"], "native-marketplace")
                    self.assertEqual(plan["sequence"], commands[-2:])
                    self.assertEqual(plan["sequence"], [
                        "codex plugin marketplace add affaan-m/ECC",
                        "codex plugin add ecc@ecc --json",
                    ])
                else:
                    self.assertEqual(plan["mode"], "project-local-adapter")
                    self.assertEqual(plan["target"], "kimi")
                    self.assertEqual(plan["sequence"][0], commands[0])
                    self.assertEqual(plan["sequence"][1], commands[0].replace(" --dry-run", ""))
                self.assertEqual(proposal["harness"], target)
                self.assert_side_effect_free()

    def test_invalid_extra_or_control_arguments_are_rejected_before_proposal_or_execution(self) -> None:
        cases = (
            ("claude-extra", ("plan", "claude", "user", "standard", "extra", "--proposal")),
            ("claude-duplicate-flag", ("plan", "claude", "--proposal", "--proposal")),
            ("claude-newline", ("plan", "claude", "user\n", "standard", "--proposal")),
            ("claude-tab", ("plan", "claude", "user\t", "standard", "--proposal")),
            ("codex-extra", ("plan", "codex", "extra", "--proposal")),
            ("kimi-extra", ("plan", "kimi", "--proposal", "extra")),
        )
        for name, args in cases:
            with self.subTest(name=name):
                result = self.run_helper(*args)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn("jevproposal=", result.stdout)
                self.assertIn("BLOCK ", result.stdout)
                self.assert_side_effect_free()


if __name__ == "__main__":
    unittest.main()
