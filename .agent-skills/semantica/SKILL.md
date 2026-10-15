---
name: "semantica"
description: "Operate semantica-agi/semantica, the Python graph-native knowledge engineering toolkit: choose ingestion, parsing, extraction, graph/triplet/vector stores, CLI, server or MCP entrypoints; diagnose optional integrations and backend configuration. Use when users name Semantica or ask for a modular Python pipeline spanning documents, knowledge graphs, provenance or reasoning. It is an application/library framework, not a single graph database; route a dedicated ontology workbench to OrionBelt or certified ontology change planning to Open Ontologies."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires Python 3.10–3.13 in the pinned pyproject; optional extras/providers/backends add their own dependencies and external services."
metadata:
  version: "1.0.0"
  source: "https://github.com/semantica-agi/semantica"
  upstream_commit: "815527ccca9a00b206dbf6f2cbf866e62d719ed6"
---

# Semantica

## Instructions

1. Select the task layer first: package API, `semantica` CLI, standalone server/worker/explorer, MCP, or a specific optional connector. Confirm the exact extra and backend from the pinned `pyproject.toml` before proposing installs.
2. Treat commands and data flow as scoped examples; inspect installed CLI help/source for exact syntax. Build a minimal environment and add only the extra required. Avoid `[all]` unless user explicitly requests the broad dependency set and accepts its footprint.
3. Before configuring a model/provider, database, cloud service, or MCP client, obtain explicit approval for credential use, external calls, uploads, cost, data access, and configuration changes. Never ask for or print secret values; prefer documented environment/config references and local endpoints where appropriate.
4. Distinguish package graph-store backends (e.g. Neo4j/FalkorDB/Neptune/AGE) from the overall toolkit. Explain connector prerequisites and distinguish offline code inspection from runtime, service, or provider verification.

## Examples

- “Which Semantica extras do I need to ingest documents and store triples in Oxigraph?”
- “Trace this Semantica CLI/MCP startup failure without using credentials.”
- “Plan a minimal local pipeline for parsing and entity extraction.”

## Best practices

- The pinned CLI is a Click-based command surface; use `semantica --help` or its own subcommand help rather than guessing flags.
- `python -m semantica.mcp_server` delegates to the MCP server entrypoint, but that alone does not establish a client configuration or active server.
- Read [`references/upstream.md`](references/upstream.md) before backend/provider advice; source metadata does not prove a dependency is installed or service is healthy.

## References

- [`references/upstream.md`](references/upstream.md) - supported setup/runtime entrypoints, extras, limits, licensing and safety.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
