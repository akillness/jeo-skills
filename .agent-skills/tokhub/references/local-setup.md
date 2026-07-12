# TokHub local setup

## Default: single-container Docker Compose

bash
git clone https://github.com/yaojingang/TokHub.git
cd TokHub
cp -n .env.example .env || true
docker compose up -d --build
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
curl http://localhost:8080/openapi.yaml
TOKHUB_BASE_URL=http://localhost:8080 npm run test:smoke


Default entrypoints (all under `TOKHUB_ROLE=all`, one process):
- Web / Admin / Console / Public API: `http://localhost:8080`
- Gateway (OpenAI-compatible): `http://localhost:8080/gateway/v1/*`
- Metrics: `http://localhost:8080/metrics`
- OpenAPI: `http://localhost:8080/openapi.yaml`
- Dev admin login: `admin` / `admin@tokhub.local` (dev-only — never production)

`.env.example` defaults to `TOKHUB_SEED_MODE=prod`, which only creates the
admin user, default org, site config, and model catalog — no demo channels or
recommendations. Demo/test data is only seeded when `TOKHUB_SEED_MODE=demo`
or `test` is explicitly set. Production must keep `TOKHUB_SEED_MODE=prod` and
`TOKHUB_UPSTREAM_MODE=real`.

## Native dev (without Docker for app code)

bash
npm ci
go mod download
cp -n .env.example .env
docker compose up -d --build   # still needed for Postgres/TimescaleDB/Redis/NATS


## Role-split Compose (scale-out)

Split the single `all` process into `api` / `gateway` / `prober` / `worker`
containers when traffic ingress, enterprise gateway, and probing need to
scale independently:

bash
docker compose -f docker-compose.yml -f deploy/compose/docker-compose.roles.yml up -d --build
curl http://localhost:8081/readyz   # api
curl http://localhost:8082/readyz   # gateway


Default ports: `api` → `8081`, `gateway` → `8082`. `prober`/`worker` only
expose health checks inside the Compose network.

## Production self-hosting checklist

Never reuse `.env.example` dev defaults in production. Replace at minimum:

- `TOKHUB_PUBLIC_URL`
- `TOKHUB_ADMIN_EMAIL`
- `TOKHUB_ADMIN_PASSWORD`
- `TOKHUB_SECRET_KEY` (≥32 chars — derives the AES-GCM master key)
- `DATABASE_URL`
- `REDIS_URL`
- `NATS_URL`
- `SMTP_URL` (if real email notifications are needed)

Recommended production settings:

- `TOKHUB_ENV=production`
- `TOKHUB_SEED_MODE=prod`
- `TOKHUB_UPSTREAM_MODE=real`
- `TOKHUB_SESSION_SECURE=true`
- `TOKHUB_EXPOSE_DEV_TOKENS=false`

Run before going live:

bash
deploy/scripts/preflight.sh --env-file .env.production
deploy/scripts/release-check.sh


## Pulling updates on an already-running server

bash
git pull origin main
docker compose run --rm --build migrate
docker compose up -d --build --no-deps app
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz


Run `migrate` explicitly before restarting the app container, so the app
process never starts ahead of the DB schema/seed data. First-time deploys can
still use plain `docker compose up -d --build`.

The three featured recommendation fallback entries (AIGoCode, Pipellm,
PackyCode) stay as in-app fallback content on the home/featured pages, but a
fresh production deploy does **not** auto-insert them as real "platform
channels" — the public channel list starts empty. Add real platform channels
and recommendation config from the admin backend after deploy.

## Backup and restore

bash
deploy/scripts/backup.sh
# writes backups/tokhub-*.dump plus a .sha256 file

TOKHUB_RESTORE_CONFIRM=restore deploy/scripts/restore.sh backups/tokhub-20260101T000000Z.dump


Restore rebuilds/clears target DB objects — it requires the explicit
`TOKHUB_RESTORE_CONFIRM=restore` env var. A non-destructive restore-drill
mode restores into a temp DB, verifies core table counts, then drops the temp
DB automatically (see `docs/RECOVERY-DRILL.md`).

## Demo data purge (before going live with real data)

bash
deploy/scripts/purge-demo-data.sh --dry-run   # inspect first

deploy/scripts/backup.sh backups/pre-demo-purge.dump
TOKHUB_DEMO_PURGE_BACKUP=backups/pre-demo-purge.dump deploy/scripts/purge-demo-data.sh --confirm purge-demo
deploy/scripts/no-demo-data-check.sh


Production additionally requires `TOKHUB_ALLOW_DEMO_PURGE=true`, to prevent
accidental deletion of real business data.

## Helm (early)

bash
helm template tokhub deploy/helm/tokhub \
  --set image.repository=your-registry/tokhub \
  --set image.tag=0.1.0 \
  --set publicUrl=https://tokhub.example.com \
  --set secretKey='replace-with-32-byte-min-secret'


Assumes PostgreSQL/TimescaleDB, Redis, and NATS are provided externally or by
separate charts — `deploy/helm/tokhub` does not bundle them.

## Admin-agent bootstrap (owner/admin automation, not for repo-dev work)

This is for connecting an agent to a **running** instance's admin API — it is
covered by TokHub's own bundled `agent-skills/tokhub` skill, not this
codebase-setup skill. Mentioned here only so it isn't confused with local
dev setup:

bash
TOKHUB_BASE_URL=http://localhost:8080 \
TOKHUB_ADMIN_EMAIL=admin@tokhub.local \
TOKHUB_ADMIN_PASSWORD='admin@tokhub.local' \
TOKHUB_ADMIN_AGENT_TOKEN_NAME=codex-admin \
TOKHUB_ADMIN_AGENT_TOKEN_SCOPES='admin:*' \
TOKHUB_ADMIN_AGENT_TOKEN_TTL_HOURS=24 \
deploy/scripts/create-admin-agent-token.sh


The token is printed once in plaintext only — never commit it. Full contract
is in `docs/admin-agent-api.md`.
