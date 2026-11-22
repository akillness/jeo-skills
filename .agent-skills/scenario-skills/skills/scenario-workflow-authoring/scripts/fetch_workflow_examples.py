#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["scenario-sdk"]
# ///
"""Fetch public featured Scenario workflows as structural wiring examples.

Built on the official Scenario Python SDK (scenario-sdk on PyPI): run it
with `uv run scripts/fetch_workflow_examples.py` (uv reads the inline
dependency block above) or `pip install scenario-sdk` first. Credentials
come from the SDK's standard environment variables, SCENARIO_SDK_API_KEY
and SCENARIO_SDK_API_SECRET.

Lists public workflows, keeps the ones tagged featured (or sc:featured),
and writes one trimmed JSON file per workflow. Public listings never
include flow or editorInfo (per the API reference, the full parameter is
ignored there), so each tagged hit's editor graph comes from a per-id
retrieve. The trim keeps node types, edge wiring, and input keys, and
drops content values (prompts, asset ids, parameter values): each file is
a structural reference for wiring a similar workflow, never content to
reuse.

    SCENARIO_SDK_API_KEY=... SCENARIO_SDK_API_SECRET=... \\
        uv run scripts/fetch_workflow_examples.py --output-dir workflow-examples
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import scenario_sdk
from scenario_sdk import Scenario

# Documented maximum page size (default is 50).
PAGE_SIZE = 100

DEFAULT_TAGS = ("featured", "sc:featured")

# Structural node data worth keeping: pin flags, model binding, and the
# forEachEnd loop pairing. Everything else in a node's data is content
# (prompt text, asset references, parameter values) and is dropped.
NODE_DATA_KEYS = ("type", "modelId", "title", "isInput", "isOutput", "parentNodeId")

EDGE_KEYS = ("source", "sourceHandle", "target", "targetHandle")


def iter_public_workflows(client: Scenario, max_pages: int, page_size: int = PAGE_SIZE):
    page = client.workflows.list(privacy="public", page_size=page_size)
    pages_walked = 1
    while True:
        yield from page.workflows
        if pages_walked >= max_pages or not page.has_next_page():
            break
        page = page.get_next_page()
        pages_walked += 1


def _pick(source: dict, keys: tuple[str, ...]) -> dict:
    return {key: source[key] for key in keys if source.get(key) is not None}


def trim_node(node: dict) -> dict:
    trimmed = _pick(node, ("id", "type"))
    data = node.get("data")
    if isinstance(data, dict):
        kept = _pick(data, NODE_DATA_KEYS)
        if kept:
            trimmed["data"] = kept
    return trimmed


def trim_edge(edge: dict) -> dict:
    return _pick(edge, EDGE_KEYS)


def input_keys(workflow, editor_info: dict) -> list[str]:
    # The authoring grammar keeps the ordered pin list at editorInfo.inputKeys
    # (verified against live records); check there before any fallback.
    keys = editor_info.get("inputKeys")
    if isinstance(keys, list) and keys and all(isinstance(k, str) for k in keys):
        return keys
    # Fall back to the typed inputs carried by the workflow record.
    names = []
    for item in getattr(workflow, "inputs", None) or []:
        name = getattr(item, "name", None)
        if isinstance(name, str):
            names.append(name)
    return names


def trim_workflow(workflow) -> dict | None:
    """Trim a workflow record to its structural wiring, or None without an editor graph."""
    editor_info = getattr(workflow, "editor_info", None)
    if not isinstance(editor_info, dict):
        return None
    nodes = editor_info.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return None
    edges = editor_info.get("edges")
    if not isinstance(edges, list):
        edges = []
    return {
        "id": workflow.id,
        "name": workflow.name or "",
        "description": workflow.description or "",
        "nodes": [trim_node(node) for node in nodes if isinstance(node, dict)],
        "edges": [trim_edge(edge) for edge in edges if isinstance(edge, dict)],
        "inputKeys": input_keys(workflow, editor_info),
    }


def write_example(output_dir: str, trimmed: dict) -> str:
    os.makedirs(output_dir, exist_ok=True)
    # Defensive: an id must never escape the output directory.
    safe_id = str(trimmed["id"]).replace("/", "_").replace("\\", "_")
    path = os.path.join(output_dir, f"{safe_id}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(trimmed, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output-dir", default="./workflow-examples", help="where the trimmed JSON files go")
    parser.add_argument("--max-pages", type=int, default=5, help="page cap for the listing (default 5)")
    parser.add_argument(
        "--tag",
        action="append",
        help="tag to keep, repeatable (default: featured and sc:featured)",
    )
    args = parser.parse_args(argv)
    if args.max_pages < 1:
        parser.error("--max-pages must be at least 1")
    return args


def describe_error(err: Exception) -> str:
    if isinstance(err, (scenario_sdk.AuthenticationError, scenario_sdk.PermissionDeniedError)):
        return (
            f"Scenario API refused the credentials (HTTP {err.status_code}):"
            " check SCENARIO_SDK_API_KEY / SCENARIO_SDK_API_SECRET"
        )
    if isinstance(err, scenario_sdk.APIStatusError):
        return f"Scenario API request failed with HTTP {err.status_code}"
    return f"Scenario API request failed: {err}"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    key = os.environ.get("SCENARIO_SDK_API_KEY", "").strip()
    secret = os.environ.get("SCENARIO_SDK_API_SECRET", "").strip()
    if not key or not secret:
        print(
            "SCENARIO_SDK_API_KEY and SCENARIO_SDK_API_SECRET must be set: the"
            " official scenario-sdk reads your Scenario API key and secret from"
            " these environment variables.",
            file=sys.stderr,
        )
        return 1

    client = Scenario()
    wanted = set(args.tag) if args.tag else set(DEFAULT_TAGS)
    kept = 0
    try:
        for workflow in iter_public_workflows(client, args.max_pages):
            # Tag filtering happens client side: the documented tags query
            # parameter does not state how multiple tags combine, and this
            # needs any-of semantics.
            if not set(workflow.tag_set or []) & wanted:
                continue
            trimmed = trim_workflow(workflow)
            if trimmed is None:
                # Public listings never include the editor graph (the API
                # reference: full is ignored there), so the full record is
                # the only place to read it from.
                try:
                    trimmed = trim_workflow(client.workflows.retrieve(workflow.id).workflow)
                except scenario_sdk.APIError as err:
                    # APIError also covers connection and timeout errors, which
                    # are siblings of APIStatusError: one flaky retrieve must
                    # skip that workflow, never abort the whole export.
                    print(f"skipping {workflow.id}: {describe_error(err)}", file=sys.stderr)
                    continue
            if trimmed is None:
                print(f"skipping {workflow.id}: tagged but has no editor graph", file=sys.stderr)
                continue
            path = write_example(args.output_dir, trimmed)
            kept += 1
            print(
                f"{trimmed['id']}: {trimmed['name']}"
                f" ({len(trimmed['nodes'])} nodes, {len(trimmed['edges'])} edges,"
                f" {len(trimmed['inputKeys'])} inputs) -> {path}"
            )
    except scenario_sdk.ScenarioError as err:
        print(describe_error(err), file=sys.stderr)
        return 1

    if kept == 0:
        print(f"No public workflows tagged {sorted(wanted)} with an editor graph were found.")
    print(f"Wrote {kept} workflow example(s) to {args.output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
