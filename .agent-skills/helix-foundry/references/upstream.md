# Helix Foundry pinned operational reference

This reference preserves the audited operational details for
`HelixDB/helix-foundry` at commit
`84899851d845d1db98f9e328634f14e0ed4ad7b7` (the commit tracked by the parent
skill). It is reference material, not proof that a checkout is running. Read it
only for the operation branch selected in `SKILL.md`.

## Source shape and pinned dependencies

The application is a one-computer, one-owner installation with no sign-in. It
stores resource documents and relationship edges in HelixDB; isolated DuckDB
executor processes query immutable Parquet snapshots. The pinned `package.json`
uses `@helix-db/helix-db` `3.2.0` and `@duckdb/node-api` `1.5.5-r.1`.

Public source anchors audited at this commit:

- `README.md`, `AGENTS.md`, `compose.yaml`, `package.json`, and `LICENSE`
- `docs/API.md`, `docs/OPERATIONS.md`, and `docs/HOSTING.md`
- `apps/api/src/app.ts` (API and loopback auth) and `apps/api/src/store.ts` (HelixDB store)
- `scripts/setup.sh`, `scripts/backup.sh`, `scripts/restore.sh`, and `scripts/upgrade.sh`

The pinned Compose file uses HelixDB image
`v0.0.6@sha256:94b29942658ebdca0a91bf15edffe921a46da3e26e1223ea333ccce58c6212dd`,
an executor capped at 2 GB, and optional Ollama `0.17.7` with model `qwen3:4b`.
Before setup, read the checkout's pinned `AGENTS.md` and confirm that the
working tree is the intended source; this reference does not authorize startup.

## Host and repository inspection

The following commands are the pinned operator's *inspection* commands. They are
not run by the offline helper and do not prove that a daemon, Compose plugin, or
application is healthy:

```sh
docker version --format 'Docker {{.Server.Version}}'
docker compose version
git --version && openssl version && bash --version | head -n 1
```

Safe inventory commands, only after the owner has selected a live local checkout,
are:

```sh
test -f .env && echo ".env exists" || echo "no .env yet"
docker volume ls --filter name=helix-foundry_
docker compose ls --all --filter name=helix-foundry
docker ps --filter label=com.docker.compose.project=helix-foundry
```

Do not print, read, or copy `.env` wholesale. Exact extraction of documented
non-secret keys such as `PUBLIC_PORT` is allowed. Never read, print, copy, or edit
backup key files or passphrases. If Helix Foundry volumes exist without their
original `.env`, stop and ask the owner before creating keys or starting another
checkout.

The offline helper intentionally replaces these live probes with `shutil.which`,
`platform`, `sys`, and bounded local Git checks when `--repo` is supplied. A
Docker binary is only a path candidate; it is not daemon health or Compose v2
plugin proof. `runtime_verified` remains `false`.
For local Git evidence, the helper removes inherited `GIT_*` repository selectors,
disables Git protocol and prompts, and confirms `show-toplevel` matches the
requested `--repo` before accepting `HEAD`; it never fetches or contacts a remote.

## Compose, model, and setup paths

Choose exactly one model path. Do not install or start Docker, Ollama, or any
provider from the operator skill; hosted model/API charges remain the owner's
decision.

- **Path A — bundled Ollama:** local profile, with at least 8 GB Docker memory
  (lower-memory configurations are not certified; imported data also consumes
  Docker disk):

  ```sh
  docker compose --profile local up -d --build
  ```

- **Path B — native Ollama on macOS:** Docker Desktop plus an already-running
  native Ollama. Set `MODEL_ENDPOINT=http://host.docker.internal:11434` using the
  documented non-secret line-edit command, then run:

  ```sh
  docker compose up -d --build
  ```

- **Path C — no local AI:** run the default Compose path and let the owner choose
  Claude/OpenAI/no-AI in the browser:

  ```sh
  docker compose up -d --build
  ```

On a fresh installation, the setup script generates `ENCRYPTION_KEY` and
`INTERNAL_KEY` without overwriting an existing `.env`:

```sh
./scripts/setup.sh
```

If the configured port is busy, choose a free port and update `PUBLIC_PORT` and
matching `PUBLIC_ORIGIN` together using the runbook's non-secret line-edit
command. Never alter a secret while doing this. Do not stop a process that was
not started by the owner.

`docker compose down -v` is prohibited as routine cleanup: it deletes workspaces,
snapshots, and stored credentials. Manual volume deletion is equally prohibited.

## Readiness and diagnostics after owner-approved startup

The default port is `3001`. Read `PUBLIC_PORT` without exposing secrets, then
poll the exact loopback health endpoint:

```sh
curl -fsS http://localhost:${PORT:-3001}/api/health
# {"ok":true,"service":"helix-foundry"}
```

For deeper diagnostics only after the stack is up:

```sh
docker compose --profile local exec app node --import tsx scripts/doctor.ts
# omit --profile local for Paths B/C
docker compose --profile local ps -a
docker compose --profile local logs --tail 100 app worker helix
```

Keep the endpoint and Compose publication loopback-only. Browser-guided setup is
owner-owned: **AI → Data → Ontology**. The owner enters Claude/OpenAI keys,
database passwords, OAuth/API tokens, and approves a suggested ontology. The
operator must not request or store those secrets.

## API scope, identity, and mutation gates

API routes are under `/api/v1/workspaces/:workspaceId`; loopback Host names are
required and browser mutations must match `APP_ORIGIN`. No `Authorization` header
acts as the local owner. Developer tokens are workspace-scoped and may be
read-only; create them in **Settings → Developer tools**, never by guessing
secrets.

Read-only inspection after the local identity already exists includes:

- `GET /api/v1/me`
- `GET /overview`, `GET /home`, `GET /activity`
- `GET /resources/:kind`
- `GET /datasets/:id/export`
- `POST /datasets/:id/preview`
- `POST /query`
- `GET /records/:logicalId`
- `GET /objects/:id/neighbors`
- `GET /api/docs`

A brand-new installation is the critical exception: the first unauthenticated
`GET /api/v1/me` lazily provisions the local owner and workspace. Treat that
one-time request as an initialization mutation, obtain owner approval, and never
record it as read-only proof. Once identity/workspace exists, this request is a
read-only inspection. The no-header request is the local owner; an approved
developer token may be sent as:

```sh
curl -fsS "http://localhost:3001/api/v1/me"
# approved token only:
curl -fsS "http://localhost:3001/api/v1/me" \
  -H "Authorization: Bearer $FOUNDRY_TOKEN"
```

Use the running app's `/api/docs` for the full OpenAPI document. Never substitute
an unknown token or port.

These operations are mutating or externally consequential and require explicit
approval plus the correct workspace/token: `POST /ingest`, `/upload`, `/sources`,
`/:id/sync`, `/pipelines/:id/run`, `/pipelines/draft`, proposal `PUT`,
`validate`, `publish`, `reject`, `/rollback`, ontology `execute` routes,
assistant run/cancel/resume/save-analysis, provider updates, hosting token/OAuth/
connect routes, and dataset-version acceptance. `POST /sources/test` can contact
external systems and may incur provider/network cost even when no source is
persisted. Review validation output and hash before proposal publish or action
execute; HTTP `409` means refresh and review rather than blind retry.

## Sources and data boundaries

Connectors include Neon, Supabase, PlanetScale, PostgreSQL, MySQL, Stripe,
WorkOS, PostHog, REST, S3-compatible storage, and CSV/JSON/JSONL/Parquet uploads
and ingestion. PostgreSQL/MySQL may use native CDC; other sources use snapshots.
Only selected hosted tables are imported. Provider credentials are encrypted with
`ENCRYPTION_KEY`; losing or replacing that key makes stored credentials
unrecoverable. Removing a source does not revoke provider access; the owner must
revoke unused credentials at the provider.

Do not alter source databases, reset passwords, change server-wide network
settings, expose the app through LAN/reverse proxy/tunnel, or assume cloud
provider scopes/costs are harmless.

## Backup, restore, and upgrade

These are disruptive/destructive operations. Obtain owner approval, preserve the
matching checkout and backup, and define rollback before running any command:

```sh
./scripts/backup.sh PATH
./scripts/restore.sh PATH --replace
./scripts/upgrade.sh
```

`backup.sh` briefly stops services and writes an external backup. Backups omit the
encryption key unless the owner deliberately uses the script's `--include-key`
flow. `restore.sh PATH --replace` replaces current data. `upgrade.sh` backs up
before rebuilding and may perform a one-way HelixDB storage upgrade. Never
improvise `docker compose down -v` or manual volume deletion during recovery.

## Local development and SDK

Local development uses Node.js `>=24` and pnpm `10.7`; development runs the
application/executor natively while HelixDB remains in Docker. Pinned package
scripts include:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm doctor
pnpm migrate
pnpm benchmark
pnpm build:sdk
```

The SDK client is `FoundryClient({ baseUrl, workspaceId, token })`. Its
`foundry.ingest`, `foundry.requestAssistance`, `foundry.ask`, and `foundry.build`
operations can produce state or external effects; review proposal validation
before `publish()`.

## Commit-pinned citations

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
