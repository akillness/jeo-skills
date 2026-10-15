---
name: "utopia"
description: "Operate deeplethe/utopia, the Rust/Postgres bitemporal knowledge application with ontology-driven ingest, review, search/chat, derivation and per-base MCP. Use when users name Utopia/utopia.bi or ask to deploy, configure, inspect, back up or integrate this exact knowledge platform. This is a full application with a database, not a generic ontology library or a local-only graph engine; route standalone RDF/OWL analysis to Open Ontologies or Python pipelines to Semantica."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires Docker Compose for the documented app deployment, PostgreSQL with pgvector, and configured chat/embedding endpoints; local source development also requires Rust and frontend tooling."
metadata:
  version: "1.0.0"
  source: "https://github.com/deeplethe/utopia"
  upstream_commit: "cda374771577b2d42ed257312864ecf8e067bfbd"
---

# Utopia

## Instructions

1. Determine whether the user wants an app deployment, local development, data-backup operation, or read-only architecture guidance. Inspect the pinned release/source and deployed config path before acting.
2. The README documents `docker compose --profile app up -d`; it exposes the app on localhost:1516 and initializes a public knowledge base on first account registration. This is an example only. Do not deploy, start services, register accounts, or change database/config state without explicit approval.
3. Treat ingestion, extraction, model calls, database mounts, MCP writes, migrations, backup/restore, and public deployment as separate approval gates. Confirm data classification, target base/database, provider, cost, and destination before any external transfer or mutation.
4. Preserve the app's review boundary: uncertain facts and agent write proposals require human adjudication. Do not claim an MCP connection can write directly unless source/docs for the exact operation support it.

## Examples

- “Explain Utopia's bitemporal model and what its audit ledger retains.”
- “Plan a local Docker deployment, but do not start it.”
- “Configure a read-only MCP client for one knowledge base.”

## Best practices

- The first registered account becomes system administrator, and the initial knowledge base is public in the documented quick start; flag this before signup and verify current deployment settings.
- Keep secrets out of chat and reports. Utopia reads `UTOPIA_` environment configuration; `secret.key` protects stored credentials and must not be bundled casually with data backups.
- Read [`references/upstream.md`](references/upstream.md) for backup/restore caveats, exact commands and deployment scope. Example `down -v` is destructive and must never be run without explicit approval.

## References

- [`references/upstream.md`](references/upstream.md) - app setup, config, CLI/backups, limits, license and approval gates.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
