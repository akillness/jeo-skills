---
name: "leann"
description: "Operate StarTrail-org/LEANN for local document indexing and semantic retrieval: inspect a checkout, configure embeddings/backends, build or incrementally update an index, search it, or troubleshoot index behavior. Use when the task explicitly names LEANN or needs its graph-assisted vector-index workflow. Route code-architecture memory graphs to mex/Graphify, workspace text search to zvec-grep, and other RAG stacks to langchain-rag."
allowed-tools: Bash Read Grep Glob
compatibility: Works with compatible agent clients that can read files and run shell commands; upstream CLI requires its supported Python/native dependency environment.
metadata:
  version: "1.0.0"
  source: "https://github.com/StarTrail-org/LEANN"
  upstream_commit: "00710edff4aba84c41f4adfc75b79175b28132f2"
---

# LEANN operator

## Instructions

1. **Identify the exact checkout and pin.** From the jeo-skills repository root, run `python3 .agent-skills/leann/scripts/preflight.py --repo /absolute/upstream --json` (or invoke `scripts/preflight.py` from the installed skill root). An omitted `--repo` is inventory only. The helper compares selected pinned-file hashes; it does not prove Git HEAD, the whole checkout, installed dependencies, or runtime readiness. Read [the pinned source notes](references/upstream.md).
2. **Keep the system model straight.** LEANN is a vector index that uses graph-based selective recomputation to reduce stored embedding data. Its graph is an index/search optimization, not a semantic knowledge graph or durable code-architecture graph. Route the latter to `mex` or `graphify`.
3. **Plan local indexing before running it.** Confirm source paths, file types/exclusions, index directory, chosen backend, embedding mode/model, and whether incremental updates or a full rebuild are intended. Check storage, memory, native dependencies, and data sensitivity.
4. **Get approval before effects.** Ask before installing packages or downloading models; ingesting private, regulated, or third-party source material; calling paid or remote embedding APIs; starting a service or binding beyond loopback; creating/updating/rebuilding/deleting an index; or enabling integrations that read account/workspace data. Do not put keys in command history. A full rebuild (`--force`) is distinct from the default incremental build.
5. **Use the pinned CLI and verify the result.** After approval, check the checkout's own `leann --help` and `leann <command> --help`; command options can change. Run a small representative index/search first, then verify expected source coverage and retrieval. Do not claim runtime readiness from preflight alone.

## Examples

```bash
# Inspection only; use an absolute, non-symlink upstream checkout.
python3 .agent-skills/leann/scripts/preflight.py --repo /work/LEANN --json

# Only after approval, in the inspected LEANN environment:
uv venv
source .venv/bin/activate
uv pip install leann
leann build handbook --docs ./docs
leann search handbook "how does the sync path work?" --top-k 5
```

## Best practices

- Treat indexing as data processing, not a harmless lookup. Review destination and any embedding endpoint before build.
- Prefer the default incremental path for a verified existing index; reserve `--force` for an approved rebuild with a recovery plan.
- Recheck backend/platform prerequisites against the pinned notes. LEANN's optional backends have different native/GPU requirements; do not infer support from the general Python package.
- Benchmark claims are workload-specific. Do not repeat upstream storage or retrieval percentages as guarantees for a user's corpus.
- Describe failures as offline-check failures, source-pin mismatches, dependency/setup failures, or runtime/retrieval failures; these are different states.

## References

- [Pinned upstream behavior, commands, limits, and source map](references/upstream.md)
- [Pin and source file hashes](references/source.json)
- [Authored routing and behavior scenarios](evals/evals.json)
- Helper contract: `python3 .agent-skills/leann/scripts/preflight.py --help`; helper supports Python 3.10+ on POSIX Linux/macOS/WSL2 and fails closed when secure directory traversal is unavailable, including unsupported native Windows.
