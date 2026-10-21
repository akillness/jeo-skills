---
name: "hyper-extract"
description: "Operate yifanfeng97/Hyper-Extract, the Python `he` CLI for extracting structured knowledge from documents with templates, provider configuration, indexing, search and an MCP server. Use when users name Hyper-Extract, `he`, or ask about this document-to-knowledge CLI. It is a configurable extraction workflow, not a general-purpose ontology editor or database; route graph pipeline questions to Semantica and visual OWL/SKOS editing to OrionBelt."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires Python 3.11+ and the package's selected provider/configuration; remote providers may incur cost and receive document content."
metadata:
  version: "1.0.0"
  source: "https://github.com/yifanfeng97/Hyper-Extract"
  upstream_commit: "190dbf561df2c6e72af3f05b59b6abaf54b8a130"
---

# Hyper-Extract

## Instructions

1. Classify the task as document parsing/extraction, index/search, configuration, template management, or MCP. Check the pin and installed CLI help before using exact flags.
2. `he parse <input> -t <template> -o <output>` is a documented command shape; preview the source files and output directory first. Extraction may send document data to a configured model provider. Obtain explicit approval for uploads, provider calls, cost, and output writes.
3. Inspect provider/config location and permissions before recommending changes. The pinned implementation stores config under `~/.he/config.toml` and restricts access where supported. Never print or request API key values; use provider environment settings or secure local entry only after approval.
4. Do not infer MCP safety from CLI use. Review transport, tool scope, credentials and client config; obtain approval before server start or registration.

## Examples

- “Extract this local Markdown file using a template, but do not call a provider yet.”
- “Explain the difference between `he parse` and `he search`.”
- “Troubleshoot an `he config` issue without exposing API keys.”

## Best practices

- Start with `he --help`, `he config --help`, and `he list template`; use a small non-sensitive fixture before production documents.
- Keep raw inputs, generated knowledge artifacts, and indexes in distinct destinations with explicit retention and access rules.
- Read [`references/upstream.md`](references/upstream.md) for current provider and MCP boundaries. The offline helper verifies only selected file hashes and PATH tool presence, never provider/runtime readiness.

## References

- [`references/upstream.md`](references/upstream.md) - install/CLI, provider config, MCP scope, limits, license and approvals.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
