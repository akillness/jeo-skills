---
name: helix-foundry
description: >
  Operate HelixDB/helix-foundry, the local-first company-data workspace that
  connects databases, hosted providers, APIs, files, Stripe, WorkOS and PostHog
  into an ontology backed by HelixDB and DuckDB. Use when the user names
  Helix Foundry, asks to install/start/diagnose its Docker Compose stack, inspect
  its local API or SDK, connect a source, run a sync/query/pipeline, review an
  ontology proposal, or back up/restore/upgrade an installation. Keep setup
  local and loopback-only; distinguish read-only inspection from data,
  credential, network, cloud-cost, and destructive operations.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Requires a filesystem-capable agent. Docker Desktop/Engine with Compose v2 is
  required for the container install; macOS Apple Silicon is the validated
  platform. Local development additionally requires Node.js 24 and pnpm 10.7.
metadata:
  version: "1.1.0"
  source: "https://github.com/HelixDB/helix-foundry"
  upstream_commit: "84899851d845d1db98f9e328634f14e0ed4ad7b7"
---

# Helix Foundry operator

## When to use this skill

Use this exact-project skill for the checkout and running installation of
[HelixDB/helix-foundry](https://github.com/HelixDB/helix-foundry/tree/84899851d845d1db98f9e328634f14e0ed4ad7b7).
It is a one-computer, one-owner application: resource documents and relationship
edges live in HelixDB, while isolated DuckDB executors query immutable Parquet
snapshots. Run the offline helper before any operator action:

```sh
python3 .agent-skills/helix-foundry/scripts/preflight.py --json
# installed root:
python3 "$SKILLS_ROOT/helix-foundry/scripts/preflight.py" --json
```

Route generic schema/entity planning to `database-schema-design`, API contracts
to `api-design`, auth/session design to `authentication-setup`, `.env` policy to
`environment-setup`, machine/container onboarding to `system-environment-setup`,
security hardening to `security-best-practices`, release promotion/rollback to
`deployment-automation`, and backend test strategy to `backend-testing`.

## Instructions

1. **Freeze scope before touching the stack.** Confirm the repository path and
   pinned commit. The helper only inventories host binaries and, when `--repo`
   is supplied, checks bounded public repository shape, Git `show-toplevel`, and
   `rev-parse HEAD`;
   it never starts Docker/Compose, calls health URLs, reads `.env`, reads keys,
   contacts providers, or claims a running Foundry. Its `runtime_verified` field
   is always `false`.
2. **Keep the service loopback-only.** Compose publishes to `127.0.0.1`; do not
   expose the app through LAN, reverse proxy, tunnel, or server-wide network
   changes. Keep `.env`, volumes, backups, provider credentials, and backup key
   files private. Never print, copy, or wholesale-read secrets.
3. **Classify reads honestly.** Health, Compose status/log inventory, API docs,
   and established-identity reads are read-only evidence. On a brand-new
   installation, the first unauthenticated `GET /api/v1/me` lazily provisions
   the local owner and workspace; treat that request as a mutation and obtain
   owner approval before using it. Never call it proof of a read-only fresh run.
4. **Gate all consequential work.** Require explicit approval and the correct
   workspace/token before source tests or sync, ingestion/uploads, pipeline
   runs, provider or hosting connections, assistant actions, dataset acceptance,
   ontology proposal validate/publish/reject/execute, or any external API call or
   cost. Review validation output and hashes before publishing; refresh on HTTP
   409 instead of blindly retrying.
5. **Protect data and recovery boundaries.** Never use `docker compose down -v`
   or manual volume deletion; it deletes workspaces, snapshots, and stored
   credentials. Backup, restore, and upgrade briefly stop or replace data and
   therefore require owner approval, matching checkout/backup, and a rollback
   decision. Removing a source does not revoke credentials at its provider.
6. **Use the pinned operational reference conditionally.** For exact Compose,
   model, API, identity, backup/restore/upgrade, connector, and SDK commands,
   read [`references/upstream.md`](references/upstream.md). Do not improvise a
   command when the reference gives the pinned form.

## Examples

### Offline source and host preflight

```sh
python3 .agent-skills/helix-foundry/scripts/preflight.py --json \
  --repo /path/to/helix-foundry \
  --expect-commit 84899851d845d1db98f9e328634f14e0ed4ad7b7
```

Interpret `status: ok` as passing offline checks only: a Docker path is not
Docker daemon health, and a Compose candidate is not proof that the Compose v2
plugin works. `runtime_verified: false` is authoritative.

### Existing local installation inspection

Read `references/upstream.md`, then obtain owner-approved, loopback-only health,
Compose `ps`/recent logs, and API docs. Do not read `.env` wholesale. If identity
already exists, read-only `GET /api/v1/me` is allowed; on a fresh install it is a
provisioning mutation and must be gated as above.

### New installation or recovery

Select a model path and inspect the exact pinned commands in the reference before
proposing `setup.sh`, Compose startup, backup, restore, or upgrade. Keep provider
keys, database passwords, OAuth/API tokens, and model/API spend user-owned.

## Best practices

- Pin operational claims to upstream commit `84899851d845d1db98f9e328634f14e0ed4ad7b7`.
- Treat source tests, generated SQL, ontology proposals, and assistant builds as reviewable outputs, never authority.
- Preserve the matching `.env`/encryption key for existing volumes; replacing it can make stored credentials unrecoverable.
- Prefer the smallest read-only evidence set before any stateful or destructive action.
- Report unknown daemon/plugin/model readiness as unknown, not ready.

## References

- [`references/upstream.md`](references/upstream.md) — pinned source shape plus Compose/model/API/identity/backup/SDK operations and provenance.
- [Pinned upstream tree](https://github.com/HelixDB/helix-foundry/tree/84899851d845d1db98f9e328634f14e0ed4ad7b7)
- [Pinned README and setup](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/README.md)
- [Pinned AGENTS runbook](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/AGENTS.md)
- [Pinned API contract](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/docs/API.md)
- [Pinned operations limits](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/docs/OPERATIONS.md)
