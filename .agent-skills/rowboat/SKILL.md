---
name: "rowboat"
description: "Operate or explain rowboatlabs/rowboat, the open-source personal/team AI work app whose local knowledge graph is an Obsidian-style network of Markdown notes. Use for its setup, knowledge ingestion and graph construction, workspace behavior, configuration, or troubleshooting. Do not route generic graph-database or ontology design here."
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/rowboatlabs/rowboat
  upstream_commit: eb3122953a4bdb96ba43914bc12ed763202ea976
---

# Rowboat

## Instructions

1. **Confirm the target.** This skill is for the `rowboatlabs/rowboat` app, not an arbitrary knowledge graph. Pin repository facts to the commit in `references/source.json`; this does not establish current runtime behavior.
2. **Classify the work surface:** app install/config; source synchronization; graph build/curation; or a bug in a UI/core module. Inspect the relevant pinned files and current checkout before giving commands.
3. **Use the app's actual model.** Rowboat ingests work context (including connected email/meetings and assistant conversations) into a Markdown, backlinked knowledge base. The graph builder tracks source-file state and processes one source file per agent batch to reduce cross-file entity contamination; it is not evidence of an independent graph database.
4. **Diagnose before changing state.** For stale/missing notes, check source sync completion, changed-file detection, graph state, and the note destination before proposing rebuild or re-import. Preserve source files and state unless the user approves a destructive reset.
5. **Check source-grounded implementation details.** Follow `references/upstream.md` for exact pinned setup/configuration, graph lifecycle, operational checks, and limitations. Treat commands there as documentation, not permission to execute.
6. **Gate effects separately.** Ask for approval before downloading/installing the app or dependencies, changing configuration or login state, connecting accounts, importing/private-email or meeting data, accessing cloud resources, writing to a database, starting a public service, or paid uploads. Read-only local inspection needs no such effect approval.
7. **Verify claims honestly.** The offline preflight helper can compare listed public-file hashes only. Report `runtime_verified: false` as no runtime proof; never claim installation, account connection, synchronization, or graph correctness from source hashes alone.
8. Link `references/source.json`, `references/upstream.md`, and `evals/evals.json` when deeper provenance or edge cases matter. Authored eval scenarios are not executed test evidence.

## Examples

- "In rowboat, new meeting notes aren't appearing in the knowledge graph. Trace the sync/build path without changing my files." → Inspect state and sync/build boundaries read-only; do not re-import automatically.
- "Set up Rowboat and connect my Gmail." → Explain the pinned setup path, then gate download/install and account authorization/import separately.
- "Design a Neo4j ontology for a research archive." → Route to ontology/database design, not this application skill.

## Best practices

- Keep app workspace identity and owner identity explicit; do not infer the user's identity from email headers.
- Preserve source provenance and distinguish a Markdown note graph from catalog metadata, vector search, or relational storage.
- Use the current checkout's package scripts and configuration as truth when they differ from this pinned snapshot.
- For troubleshooting, state the last verified layer and the next read-only check before proposing a write.

## References

- [Pinned operational guide](references/upstream.md)
- [Pinned source inventory and hashes](references/source.json)
- [Evaluation scenarios](evals/evals.json)
- [Offline source preflight](scripts/preflight.py) (parent-provided; source hashes are not runtime verification)
