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
  version: "1.0"
  source: "https://github.com/HelixDB/helix-foundry"
  upstream_commit: "84899851d845d1db98f9e328634f14e0ed4ad7b7"
---

# Helix Foundry operator

## When to use this skill

Use this exact-project skill for the checkout and running installation of
[HelixDB/helix-foundry](https://github.com/HelixDB/helix-foundry/tree/84899851d845d1db98f9e328634f14e0ed4ad7b7).
It is a one-computer, one-owner application with no sign-in. The app stores
resource documents and relationship edges in HelixDB; isolated DuckDB executor
processes query immutable Parquet snapshots. `@helix-db/helix-db` is pinned to
3.2.0 and `@duckdb/node-api` to 1.5.5-r.1 in the pinned `package.json`.

Route generic schema/entity planning to `database-schema-design`; API contract
design to `api-design`; auth/session design to `authentication-setup`; app
`.env` policy to `environment-setup`; machine/container onboarding to
`system-environment-setup`; security hardening to `security-best-practices`;
release promotion/rollback policy to `deployment-automation`; and backend test
strategy to `backend-testing`.

## Instructions

1. **Inspect before changing anything.** Work from the repository root. Read the
   pinned `AGENTS.md` before setup. Confirm Docker and Compose v2 without
   installing anything:

   ```sh
   docker version --format 'Docker {{.Server.Version}}'
   docker compose version
   git --version && openssl version && bash --version | head -n 1
   ```

   Inspect-only status commands are safe: `test -f .env && echo ".env exists" ||
   echo "no .env yet"`, `docker volume ls --filter name=helix-foundry_`,
   `docker compose ls --all --filter name=helix-foundry`, and
   `docker ps --filter label=com.docker.compose.project=helix-foundry`.
   Never print, read or copy `.env` wholesale, or expose its secret values;
   exact extraction of documented non-secret keys such as `PUBLIC_PORT` is
   allowed. Never read, print, copy or edit backup key files or passphrases.
   If Helix Foundry volumes exist without their original `.env`, stop and ask the
   owner before creating keys or starting a different checkout.

2. **Choose a model path deliberately.** The pinned Compose file uses HelixDB
   `v0.0.6@sha256:94b29942658ebdca0a91bf15edffe921a46da3e26e1223ea333ccce58c6212dd`,
   an executor capped at 2 GB, and optional Ollama `0.17.7` with `qwen3:4b`.
   Path A is bundled Ollama: `docker compose --profile local up -d --build`.
   Path B is native Ollama on macOS with Docker Desktop and a running Ollama:
   set `MODEL_ENDPOINT=http://host.docker.internal:11434` using the runbook's
   non-secret line-edit command, then use `docker compose up -d --build`.
   Path C skips local AI: use `docker compose up -d --build` and let the user
   choose Claude/OpenAI/no-AI in the browser. Do not install or start Ollama,
   Docker, or any provider; hosted model/API charges are the user's decision.
   Local AI needs at least 8 GB Docker memory and has not been certified at all
   lower-memory configurations; imported data also consumes Docker disk.

3. **Create or start safely.** On a fresh install, run `./scripts/setup.sh`; it
   generates `ENCRYPTION_KEY` and `INTERNAL_KEY` without overwriting an existing
   `.env`. If the configured port is busy, choose a free port and update
   `PUBLIC_PORT` and matching `PUBLIC_ORIGIN` together using the runbook command.
   Never use `docker compose down -v`: it deletes workspaces, snapshots and
   stored credentials. Do not stop a process you did not start. Start with the
   chosen profile from step 2.

4. **Prove readiness, then hand off browser setup.** Read `PUBLIC_PORT` without
   exposing secrets and poll the exact health endpoint (default port is 3001):

   ```sh
   curl -fsS http://localhost:${PORT:-3001}/api/health
   # {"ok":true,"service":"helix-foundry"}
   ```

   For deeper diagnostics, run only after the stack is up:
   `docker compose --profile local exec app node --import tsx scripts/doctor.ts`
   (omit `--profile local` for paths B/C). Inspect containers with
   `docker compose --profile local ps -a` and recent logs with
   `docker compose --profile local logs --tail 100 app worker helix`.
   Browser guided setup is user-owned: AI → Data → Ontology. The user enters
   Claude/OpenAI keys, database passwords, OAuth/API tokens and approves the
   suggested ontology; the agent must not request or store those secrets.

5. **Use the local API only with explicit scope.** API routes are under
   `/api/v1/workspaces/:workspaceId`; loopback Host names are required and
   browser mutations must match `APP_ORIGIN`. No `Authorization` header acts as
   the local owner. Developer tokens are workspace-scoped and may be read-only;
   create them in Settings → Developer tools, not by guessing secrets. Read-only
   inspection includes `GET /api/v1/me`, `GET /overview`, `GET /home`,
   `GET /activity`, `GET /resources/:kind`, `GET /datasets/:id/export`,
   `POST /datasets/:id/preview`, `POST /query`, `GET /records/:logicalId`,
   `GET /objects/:id/neighbors`, and `GET /api/docs`.
   On a brand-new install, the first unauthenticated request lazily provisions
   the local owner and workspace; treat that one-time initialization as a
   mutation even though `GET /api/v1/me` is otherwise an inspection endpoint.

   Treat these as mutating or externally consequential and require explicit
   approval plus the correct workspace/token: `POST /ingest`, `/upload`,
   `/sources`, `/:id/sync`, `/pipelines/:id/run`, `/pipelines/draft`,
   proposal `PUT`/`validate`/`publish`/`reject`, `/rollback`, ontology action
   `execute` routes, assistant run/cancel/resume/save-analysis, provider updates,
   hosting token/OAuth/connect routes, and dataset version acceptance. `POST
   /sources/test` can contact external systems and may incur provider/network
   cost even when it does not persist a source. Review validation output and
   hash before any proposal publish or action execute; HTTP 409 means refresh and
   review rather than blind retry.

6. **Respect source and data boundaries.** Connectors include Neon, Supabase,
   PlanetScale, PostgreSQL, MySQL, Stripe, WorkOS, PostHog, REST, S3-compatible
   storage, CSV/JSON/JSONL/Parquet uploads and ingestion. PostgreSQL/MySQL may
   use native CDC; other sources use snapshots. Only selected hosted tables are
   imported. Provider credentials are encrypted with `ENCRYPTION_KEY`; losing or
   replacing that key makes stored credentials unrecoverable. Removing a source
   does not revoke provider access; the owner must revoke unused credentials at
   the provider. Do not alter source databases, reset passwords, change
   server-wide network settings, expose the app through LAN/reverse proxy/tunnel,
   or assume cloud provider scopes/costs are harmless.

7. **Back up, restore, and upgrade only with owner approval.**
   `./scripts/backup.sh PATH` briefly stops services and writes an external
   backup; backups omit the encryption key unless the owner deliberately uses
   the script's `--include-key` flow. `./scripts/restore.sh PATH --replace`
   replaces current data. `./scripts/upgrade.sh` backs up before rebuilding and
   may perform a one-way HelixDB storage upgrade. These are disruptive/destructive
   operations: ask first, preserve the matching checkout/backup, and never
   improvise `docker compose down -v` or manual volume deletion.

8. **For development/API clients, use pinned tooling.** Local development uses
   Node.js >=24 and pnpm 10.7. Package scripts include `pnpm dev`, `pnpm build`,
   `pnpm typecheck`, `pnpm doctor`, `pnpm migrate`, `pnpm benchmark`, and
   `pnpm build:sdk`; development runs the app/executor natively while HelixDB
   remains in Docker. The SDK client is `FoundryClient({ baseUrl, workspaceId,
   token })`; use `foundry.ingest`, `foundry.requestAssistance`, `foundry.ask`,
   or `foundry.build`, then review proposal validation before `publish()`.

## Examples

### Read-only health and inventory

```sh
PORT=$(sed -n 's/^PUBLIC_PORT=//p' .env | tail -n 1); PORT=${PORT:-3001}
curl -fsS "http://localhost:$PORT/api/health"
docker compose --profile local ps -a
docker compose --profile local logs --tail 100 app worker helix
```

### API identity after initialization

```sh
curl -fsS "http://localhost:3001/api/v1/me"
```

After the local identity/workspace already exists, this GET is read-only. On a
fresh install it performs the lazy owner/workspace provisioning described
above, so treat the first call as an initialization mutation and obtain the
owner's approval. The no-header request is the local owner. If using an
approved developer token, add `-H "Authorization: Bearer $FOUNDRY_TOKEN"`; never
substitute an unknown token or port. Use `/api/docs` on the running app for the full OpenAPI document.
## Best practices

- Keep the service loopback-only; Compose publishes only `127.0.0.1` by design.
- Keep `.env`, data volumes, backups and provider credentials private; never put
  secrets in logs, prompts, tickets or commits.
- Treat ontology proposals, generated SQL, assistant builds and source tests as
  reviewable outputs, not automatic authority.
- On Apple Silicon, native Ollama is the preferred local-model path only when
  the documented Docker Desktop/ollama prerequisites hold.
- Pin operational claims to the repository commit in this skill; re-check the
  upstream files before relying on a later release.

## References

- [Pinned README and setup](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/README.md)
- [Pinned agent runbook](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/AGENTS.md)
- [Pinned API contract](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/docs/API.md)
- [Pinned operations limits](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/docs/OPERATIONS.md)
- [Pinned hosting/provider scopes](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/docs/HOSTING.md)
- [Pinned Compose services](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/compose.yaml)
- [Pinned API app and loopback auth](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/apps/api/src/app.ts)
- [Pinned HelixDB store](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/apps/api/src/store.ts)
- [Pinned package/dependency source](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/package.json)
- [Apache-2.0 license](https://github.com/HelixDB/helix-foundry/blob/84899851d845d1db98f9e328634f14e0ed4ad7b7/LICENSE)
