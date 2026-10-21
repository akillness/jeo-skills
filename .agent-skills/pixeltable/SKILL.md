---
name: "pixeltable"
description: "Build or operate applications with pixeltable/pixeltable, the Python multimodal database and `pxt` catalog CLI. Use for tables/views, computed columns and indexes, media ingestion/query workflows, schema reconciliation, local daemon/configuration, or Pixeltable Cloud/service operations. Distinguish its multimodal data model from ontology catalogs and Markdown knowledge graphs."
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/pixeltable/pixeltable
  upstream_commit: ade3972b3ff88981bbac2e715638cccd1dee0205
---

# Pixeltable

## Instructions

1. **Confirm Pixeltable is the target.** This is a multimodal database with Python APIs and a `pxt` CLI, not a knowledge-graph/ontology catalog. Pin repository-level claims to `references/source.json`, then inspect the project's installed version and checkout.
2. **Classify the task:** local catalog/table/query, media or computed-column workflow, schema reconciliation, local daemon/config, or hosted Cloud/database/service operation. Read `references/upstream.md` for exact entry points and documented limits.
3. **Start with inspection.** Prefer `pxt --help`, per-command help, `pxt health`, `pxt status`, `pxt ls`, `pxt describe`, `pxt columns`, and `pxt config` when authorized and available. `pxt` starts a local daemon on first catalog command in the pinned docs; do not start one without user approval.
4. **Treat mutation and remote access as distinct.** Catalog operations include destructive `drop`, `drop-dir`, recompute, schema update/prune; cloud commands can manage databases, services, organizations, keys, and secrets. Use dry-run where supported, inspect target and impact, and get separate approval before apply.
5. **Handle credentials safely.** Pixeltable can resolve environment/config/login settings; provider keys belong in secrets/configuration, not chat. Never print secret values. Hosted Cloud login, credentials, database operations, media upload, and provider calls need separate approval.
6. **Respect project/config semantics.** `pxt init` writes project configuration and can amend `pyproject.toml`; it refuses some nested-root cases. Verify the selected working directory and existing project root before suggesting it.
7. **Verify outcomes at the right layer.** A local config or CLI success does not prove Cloud deployment, remote persistence, correct computation, or media availability. The source preflight checks only selected hashes and never runtime behavior.

## Examples

- "Inspect a Pixeltable table and find why a computed column failed." → Start with health/status, table schema, errors/history, and column definition; avoid recompute until its scope is approved.
- "Initialize Pixeltable in this repo." → Inspect cwd and existing root/pyproject first; explain that `pxt init` writes config and ask before the mutation.
- "Create an ontology for a data catalog." → Route to ontology/catalog design; Pixeltable is not the catalog-modeling substitute.

## Best practices

- Use read-only catalog inspection before schema or data mutation; prefer `--dry-run` on supported mutations.
- Keep local database, hosted database URI, project configuration, environment variables, and Cloud login precedence explicit.
- Avoid embedding secrets or private media in diagnostic output; scope media destinations and external provider usage.
- Separate daemon health, local catalog state, hosted service state, and application endpoint health in reports.

## References

- [Pinned operations and configuration](references/upstream.md)
- [Pinned evidence and license](references/source.json)
- [Evaluation scenarios](evals/evals.json)
- [Offline source preflight](scripts/preflight.py)
