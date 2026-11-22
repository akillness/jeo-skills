"""fetch_workflow_examples: auth, pagination, tag filtering, trimming. No network.

The suite depends on the official scenario-sdk (see requirements.txt): the
script's fixtures are real SDK response models, and the client is faked at
the workflows-API seam so no HTTP ever happens.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import httpx
import scenario_sdk
from scenario_sdk.types.workflow_list_response import WorkflowListResponse

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-workflow-authoring" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import fetch_workflow_examples as fwe

ENV = {"SCENARIO_SDK_API_KEY": "key", "SCENARIO_SDK_API_SECRET": "secret"}

GRAPH = {"nodes": [{"id": "n1", "type": "model", "data": {"modelId": "m"}}], "edges": []}


def listed_workflow(wid: str, tags: list[str] | None, **overrides) -> WorkflowListResponse:
    """A validated list-response item, built from the wire shape the API returns.

    Public listings carry no editor graph; pass editorInfo=... to model the
    private-listing shape.
    """
    payload = {
        "id": wid,
        "authorId": "author",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "description": "desc",
        "hasFlow": True,
        "inputs": [],
        "name": f"Workflow {wid}",
        "ownerId": "owner",
        "privacy": "public",
        "shortDescription": "short",
        "status": "ready",
        "tagSet": tags or [],
    }
    payload.update(overrides)
    return WorkflowListResponse.model_validate(payload)


def full_workflow(wid: str, *, editor_info, inputs=(), name: str | None = None) -> SimpleNamespace:
    """A retrieve-record stand-in exposing the SDK model's attribute names."""
    return SimpleNamespace(
        id=wid,
        name=name or f"Workflow {wid}",
        description="desc",
        tag_set=[],
        editor_info=editor_info,
        inputs=list(inputs),
    )


class FakePage:
    def __init__(self, workflows: list, next_page: "FakePage | None" = None) -> None:
        self.workflows = workflows
        self._next = next_page

    def has_next_page(self) -> bool:
        return self._next is not None

    def get_next_page(self) -> "FakePage":
        return self._next


def chain_pages(*workflow_lists: list) -> FakePage:
    page = None
    for workflows in reversed(workflow_lists):
        page = FakePage(list(workflows), next_page=page)
    return page


class FakeWorkflowsAPI:
    """Stands in for client.workflows: canned pages, per-id details, recorded calls."""

    def __init__(self, first_page: FakePage, details: dict | None = None, list_error: Exception | None = None) -> None:
        self.first_page = first_page
        self.details = details or {}
        self.list_error = list_error
        self.list_calls: list[dict] = []
        self.retrieve_calls: list[str] = []

    def list(self, **kwargs):
        self.list_calls.append(kwargs)
        if self.list_error is not None:
            raise self.list_error
        return self.first_page

    def retrieve(self, workflow_id: str, **kwargs):
        self.retrieve_calls.append(workflow_id)
        result = self.details[workflow_id]
        if isinstance(result, Exception):
            raise result
        return SimpleNamespace(workflow=result)


def run_main(api: FakeWorkflowsAPI, argv: list[str], env: dict | None = ENV):
    out, err = io.StringIO(), io.StringIO()
    client = SimpleNamespace(workflows=api)
    with mock.patch.object(fwe, "Scenario", mock.Mock(return_value=client)) as client_cls:
        with mock.patch.dict(os.environ, dict(env) if env else {}, clear=True):
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = fwe.main(argv)
    return code, out.getvalue(), err.getvalue(), client_cls


def status_error(cls, code: int) -> scenario_sdk.APIStatusError:
    request = httpx.Request("GET", "https://api.cloud.scenario.com/v1/workflows")
    return cls("boom", response=httpx.Response(code, request=request), body=None)


class AuthTestCase(unittest.TestCase):
    def test_missing_env_vars_fail_before_any_client(self) -> None:
        api = FakeWorkflowsAPI(chain_pages([]))
        code, _, err, client_cls = run_main(api, [], env=None)
        self.assertEqual(code, 1)
        self.assertIn("SCENARIO_SDK_API_KEY", err)
        self.assertIn("SCENARIO_SDK_API_SECRET", err)
        client_cls.assert_not_called()
        self.assertEqual(api.list_calls, [])

    def test_authentication_error_is_readable(self) -> None:
        api = FakeWorkflowsAPI(
            chain_pages([]), list_error=status_error(scenario_sdk.AuthenticationError, 401)
        )
        code, _, err, _ = run_main(api, [])
        self.assertEqual(code, 1)
        self.assertIn("HTTP 401", err)
        self.assertIn("SCENARIO_SDK_API_KEY", err)


class PaginationTestCase(unittest.TestCase):
    def test_first_list_call_asks_for_public_workflows(self) -> None:
        api = FakeWorkflowsAPI(chain_pages([]))
        code, _, _, _ = run_main(api, [])
        self.assertEqual(code, 0)
        self.assertEqual(api.list_calls, [{"privacy": "public", "page_size": fwe.PAGE_SIZE}])

    def test_walks_every_page(self) -> None:
        details = {w: full_workflow(w, editor_info=GRAPH) for w in ("a", "b", "c")}
        api = FakeWorkflowsAPI(
            chain_pages(
                [listed_workflow("a", ["featured"])],
                [listed_workflow("b", ["featured"])],
                [listed_workflow("c", ["featured"])],
            ),
            details=details,
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, _, _, _ = run_main(api, ["--output-dir", tmp])
            written = sorted(p.stem for p in Path(tmp).glob("*.json"))
        self.assertEqual(code, 0)
        self.assertEqual(written, ["a", "b", "c"])

    def test_max_pages_caps_the_walk(self) -> None:
        details = {w: full_workflow(w, editor_info=GRAPH) for w in ("a", "b", "c")}
        api = FakeWorkflowsAPI(
            chain_pages(
                [listed_workflow("a", ["featured"])],
                [listed_workflow("b", ["featured"])],
                [listed_workflow("c", ["featured"])],
            ),
            details=details,
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, _, _, _ = run_main(api, ["--output-dir", tmp, "--max-pages", "2"])
            written = sorted(p.stem for p in Path(tmp).glob("*.json"))
        self.assertEqual(code, 0)
        self.assertEqual(written, ["a", "b"])


class TagFilterTestCase(unittest.TestCase):
    def run_filter(self, workflows: list, argv: list[str] | None = None, details: dict | None = None):
        api = FakeWorkflowsAPI(chain_pages(workflows), details=details or {})
        with tempfile.TemporaryDirectory() as tmp:
            code, out, err, _ = run_main(api, ["--output-dir", tmp, *(argv or [])])
            written = sorted(p.stem for p in Path(tmp).glob("*.json"))
        return code, written, out, err, api

    def test_keeps_featured_and_sc_featured_only(self) -> None:
        details = {w: full_workflow(w, editor_info=GRAPH) for w in ("a", "b")}
        code, written, _, _, api = self.run_filter(
            [
                listed_workflow("a", ["featured"]),
                listed_workflow("b", ["sc:featured", "tool"]),
                listed_workflow("c", ["upscale"]),
                listed_workflow("d", None),
            ],
            details=details,
        )
        self.assertEqual(code, 0)
        self.assertEqual(written, ["a", "b"])
        self.assertEqual(api.retrieve_calls, ["a", "b"])

    def test_tag_flag_overrides_the_default_set(self) -> None:
        details = {"b": full_workflow("b", editor_info=GRAPH)}
        code, written, _, _, _ = self.run_filter(
            [listed_workflow("a", ["featured"]), listed_workflow("b", ["mine"])],
            ["--tag", "mine"],
            details=details,
        )
        self.assertEqual(code, 0)
        self.assertEqual(written, ["b"])

    def test_tagged_workflow_without_editor_graph_is_skipped(self) -> None:
        code, written, _, err, api = self.run_filter(
            [
                listed_workflow("a", ["featured"]),
                listed_workflow("b", ["featured"]),
            ],
            details={
                "a": full_workflow("a", editor_info={"nodes": [], "edges": []}),
                "b": full_workflow("b", editor_info=None),
            },
        )
        self.assertEqual(code, 0)
        self.assertEqual(written, [])
        self.assertIn("no editor graph", err)
        # The full record was consulted before each skip.
        self.assertEqual(api.retrieve_calls, ["a", "b"])

    def test_zero_matches_still_exits_zero_with_a_notice(self) -> None:
        code, written, out, _, _ = self.run_filter([listed_workflow("c", ["upscale"])])
        self.assertEqual(code, 0)
        self.assertEqual(written, [])
        self.assertIn("No public workflows", out)
        self.assertIn("Wrote 0", out)


class FullRecordTestCase(unittest.TestCase):
    def test_public_listing_hits_fetch_the_full_record(self) -> None:
        api = FakeWorkflowsAPI(
            chain_pages([listed_workflow("a", ["featured"])]),
            details={"a": full_workflow("a", editor_info=GRAPH)},
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, out, _, _ = run_main(api, ["--output-dir", tmp])
            payload = json.loads((Path(tmp) / "a.json").read_text())
        self.assertEqual(code, 0)
        self.assertEqual(api.retrieve_calls, ["a"])
        self.assertEqual(payload["nodes"], [{"id": "n1", "type": "model", "data": {"modelId": "m"}}])
        self.assertIn("Wrote 1", out)

    def test_listing_that_already_carries_the_graph_skips_retrieve(self) -> None:
        api = FakeWorkflowsAPI(
            chain_pages([listed_workflow("a", ["featured"], editorInfo=GRAPH)])
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, _, _, _ = run_main(api, ["--output-dir", tmp])
            payload = json.loads((Path(tmp) / "a.json").read_text())
        self.assertEqual(code, 0)
        self.assertEqual(api.retrieve_calls, [])
        self.assertEqual(payload["nodes"], [{"id": "n1", "type": "model", "data": {"modelId": "m"}}])

    def test_failed_retrieve_skips_that_workflow_and_continues(self) -> None:
        api = FakeWorkflowsAPI(
            chain_pages(
                [listed_workflow("a", ["featured"]), listed_workflow("b", ["featured"])]
            ),
            details={
                "a": status_error(scenario_sdk.NotFoundError, 404),
                "b": full_workflow("b", editor_info=GRAPH),
            },
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, out, err, _ = run_main(api, ["--output-dir", tmp])
            written = sorted(p.stem for p in Path(tmp).glob("*.json"))
        self.assertEqual(code, 0)
        self.assertEqual(written, ["b"])
        self.assertIn("HTTP 404", err)
        self.assertIn("Wrote 1", out)

    def test_connection_error_on_retrieve_also_skips_not_aborts(self) -> None:
        # APIConnectionError is not an APIStatusError: a transient network
        # blip on one retrieve must not abort the whole export.
        request = httpx.Request("GET", "https://api.cloud.scenario.com/v1/workflows/a")
        api = FakeWorkflowsAPI(
            chain_pages(
                [listed_workflow("a", ["featured"]), listed_workflow("b", ["featured"])]
            ),
            details={
                "a": scenario_sdk.APIConnectionError(request=request),
                "b": full_workflow("b", editor_info=GRAPH),
            },
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, out, err, _ = run_main(api, ["--output-dir", tmp])
            written = sorted(p.stem for p in Path(tmp).glob("*.json"))
        self.assertEqual(code, 0)
        self.assertEqual(written, ["b"])
        self.assertIn("skipping a", err)
        self.assertIn("Wrote 1", out)


class TrimTestCase(unittest.TestCase):
    def test_node_data_keeps_the_allowlist_and_drops_content(self) -> None:
        workflow = full_workflow(
            "w",
            editor_info={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "model",
                        "position": {"x": 1, "y": 2},
                        "width": 300,
                        "height": 200,
                        "data": {
                            "type": "image-generation",
                            "modelId": "model-123",
                            "title": "Generate",
                            "isInput": True,
                            "isOutput": False,
                            "prompt": "a castle at dawn",
                            "assetId": "asset-999",
                            "imageUrl": "https://example.com/x.png",
                        },
                    },
                    {"id": "n2", "type": "output", "data": {"assetId": "asset-1"}},
                ],
                "edges": [
                    {
                        "id": "e1",
                        "type": "smooth",
                        "source": "n1",
                        "sourceHandle": "image",
                        "target": "n2",
                        "targetHandle": "input",
                        "data": {"color": "red"},
                    }
                ],
            },
        )
        trimmed = fwe.trim_workflow(workflow)
        self.assertEqual(
            trimmed["nodes"][0],
            {
                "id": "n1",
                "type": "model",
                "data": {
                    "type": "image-generation",
                    "modelId": "model-123",
                    "title": "Generate",
                    "isInput": True,
                    "isOutput": False,
                },
            },
        )
        self.assertNotIn("position", trimmed["nodes"][0])
        # A node whose data is all content ends up with no data key at all.
        self.assertEqual(trimmed["nodes"][1], {"id": "n2", "type": "output"})
        self.assertEqual(
            trimmed["edges"],
            [{"source": "n1", "sourceHandle": "image", "target": "n2", "targetHandle": "input"}],
        )

    def test_false_is_kept_but_none_is_dropped(self) -> None:
        node = fwe.trim_node({"id": "n", "type": "t", "data": {"isOutput": False, "modelId": None}})
        self.assertEqual(node["data"], {"isOutput": False})

    def test_for_each_end_keeps_its_parent_node_id(self) -> None:
        node = fwe.trim_node(
            {"id": "fe1_end", "type": "forEachEnd", "data": {"parentNodeId": "fe1"}}
        )
        self.assertEqual(node, {"id": "fe1_end", "type": "forEachEnd", "data": {"parentNodeId": "fe1"}})

    def test_output_file_has_only_the_contract_keys(self) -> None:
        api = FakeWorkflowsAPI(
            chain_pages([listed_workflow("w1", ["featured"])]),
            details={
                "w1": full_workflow(
                    "w1",
                    editor_info=dict(GRAPH, inputKeys=["prompt"]),
                )
            },
        )
        with tempfile.TemporaryDirectory() as tmp:
            code, _, _, _ = run_main(api, ["--output-dir", tmp])
            self.assertEqual(code, 0)
            payload = json.loads((Path(tmp) / "w1.json").read_text())
        self.assertEqual(
            set(payload), {"id", "name", "description", "nodes", "edges", "inputKeys"}
        )
        self.assertEqual(payload["id"], "w1")
        self.assertEqual(payload["inputKeys"], ["prompt"])

    def test_editor_info_input_keys_win_over_typed_inputs(self) -> None:
        workflow = full_workflow(
            "w",
            editor_info={"inputKeys": ["text1", "image5"]},
            inputs=[SimpleNamespace(name="other")],
        )
        self.assertEqual(fwe.input_keys(workflow, workflow.editor_info), ["text1", "image5"])
        # An empty editorInfo list still defers to the typed inputs.
        empty = full_workflow("w", editor_info={"inputKeys": []}, inputs=[SimpleNamespace(name="a")])
        self.assertEqual(fwe.input_keys(empty, empty.editor_info), ["a"])

    def test_workflow_without_nodes_is_not_an_example(self) -> None:
        self.assertIsNone(fwe.trim_workflow(full_workflow("w", editor_info={"edges": []})))
        self.assertIsNone(fwe.trim_workflow(full_workflow("w", editor_info=None)))


if __name__ == "__main__":
    unittest.main()
