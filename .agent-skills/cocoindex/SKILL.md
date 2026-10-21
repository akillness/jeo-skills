---
name: "cocoindex"
description: "Operate cocoindex-io/cocoindex when building or troubleshooting incremental Python data flows: declare sources, transformations, targets, app state, CLI updates, live processing, or connectors for RAG/indexing. Use when the request names CocoIndex or needs its change-aware ETL pipeline. CocoIndex is not itself a database or vector store; route database schema design to database-schema-design and ordinary framework RAG work to langchain-rag."
allowed-tools: Bash Read Grep Glob
compatibility: Requires a compatible Python 3.11+ environment for the pinned project; individual connectors and transforms have additional dependencies and external-service requirements.
metadata:
  version: "1.0.0"
  source: "https://github.com/cocoindex-io/cocoindex"
  upstream_commit: "1639793b3602408a9cb220728fb30e306d433473"
---

# CocoIndex operator

## Instructions

1. **Resolve source and pin.** From the jeo-skills repo root, run `python3 .agent-skills/cocoindex/scripts/preflight.py --repo /absolute/upstream --json`; from an installed skill root call its `scripts/preflight.py`. Omitting `--repo` is inventory only. Hash checks cover selected pinned files, not Git HEAD, the whole tree, dependency state, or runtime. Read [pinned behavior and effects](references/upstream.md).
2. **Model the pipeline, not a database.** CocoIndex declares source state, transformations/processing components, and target state, then incrementally propagates changes. It maintains its own internal state database, but the chosen target (for example a relational DB, vector store, file tree, or graph store) remains a separate system. A knowledge-graph example is a pipeline to a graph target, not evidence that CocoIndex is an ontology/database.
3. **Map the flow before running it.** Inspect the app target, source connector, transforms and memoization, target connector, environment variables/secrets, internal state path, and side effects. Identify deletes/updates and whether the app runs catch-up or live mode.
4. **Request approval for effects.** Ask before installing packages/extras; ingesting private or third-party source data; contacting external connectors or paid embedding/model APIs; creating/updating target state; running `update`, `--full-reprocess`, `--reset`, `drop`, or live processing; starting services or opening non-loopback ports; or deleting/rebuilding target data. `--preview` can plan target actions, but confirm the exact pinned implementation before treating it as effect-free.
5. **Use the actual CLI contract and verify.** Check `cocoindex --help` and `cocoindex update --help` in the inspected checkout. Start with a small authorized fixture, compare target rows/files and internal state, and confirm incremental changes/deletions. Do not report pipeline execution based on source preflight or a green build.

## Examples

```bash
# Read-only provenance check; absolute, non-symlink checkout.
python3 .agent-skills/cocoindex/scripts/preflight.py --repo /work/cocoindex --json

# After install, connector, data, and target-write approval:
pip install -U cocoindex
cocoindex update --preview main.py
# Review planned actions before an approved run:
cocoindex update main.py
```

## Best practices

- Use the documented app target forms (`path/to/app.py`, module, or app-qualified target); do not guess at connector-specific options.
- Treat `--full-reprocess` as potentially expensive: the pinned CLI says it bypasses memoization and re-runs external calls such as embeddings. `--reset` delegates to a drop first.
- A drop can reverse target state (for example deleting rows/tables) and clear CocoIndex's internal database. Never use it as generic troubleshooting.
- Set up a disposable local fixture first; verify source additions, edits, deletions, target changes, and state location independently.
- Keep upstream latency, freshness, token, and cache claims tied to an identified benchmark/environment; do not repeat promotional percentages as universal guarantees.

## References

- [Pinned upstream behavior, CLI, and effects](references/upstream.md)
- [Pin, license and source hashes](references/source.json)
- [Authored routing scenarios](evals/evals.json)
- Helper contract: `python3 .agent-skills/cocoindex/scripts/preflight.py --help`; helper supports Python 3.10+ on POSIX Linux/macOS/WSL2 and fails closed when secure directory traversal is unavailable, including unsupported native Windows.
