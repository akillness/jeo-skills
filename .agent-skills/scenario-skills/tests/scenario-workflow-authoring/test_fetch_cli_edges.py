"""fetch_workflow_examples: argument checks, a graph without edges, and the script entry point."""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-workflow-authoring" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import fetch_workflow_examples as fwe  # noqa: E402


class EdgeCaseTests(unittest.TestCase):
    def test_a_graph_whose_edges_are_not_a_list_keeps_its_nodes(self) -> None:
        workflow = SimpleNamespace(
            id="wf_1",
            name=None,
            description=None,
            inputs=[SimpleNamespace(name="prompt")],
            editor_info={"nodes": [{"id": "n1", "type": "model", "data": {"prompt": "drop me"}}], "edges": None},
        )
        self.assertEqual(
            fwe.trim_workflow(workflow),
            {
                "id": "wf_1",
                "name": "",
                "description": "",
                "nodes": [{"id": "n1", "type": "model"}],
                "edges": [],
                "inputKeys": ["prompt"],
            },
        )

    def test_max_pages_below_one_is_a_usage_error(self) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
            fwe.parse_args(["--max-pages", "0"])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn("--max-pages must be at least 1", stderr.getvalue())

    def test_script_entry_point_exits_one_without_credentials(self) -> None:
        env = {k: v for k, v in os.environ.items() if not k.startswith("SCENARIO_SDK_")}
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "fetch_workflow_examples.py"), "--output-dir", "unused"],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("SCENARIO_SDK_API_KEY and SCENARIO_SDK_API_SECRET must be set", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
