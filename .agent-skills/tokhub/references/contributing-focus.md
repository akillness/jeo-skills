# Contributing to TokHub

## Development setup (from `CONTRIBUTING.md`)

bash
npm ci
go mod download
cp -n .env.example .env
docker compose up -d --build


Local `.env.example` defaults are for development only — never reuse secrets,
passwords, or insecure cookie settings from it in production.

## Pre-PR checks (fast, always run)

bash
go test ./...
go vet ./...
npm run typecheck
npm run build
npm run test:security
bash deploy/scripts/open-source-preflight.sh


When Docker is available, also validate Compose config:

bash
docker compose config
docker compose -f docker-compose.yml -f deploy/compose/docker-compose.roles.yml config


## Full release-check gate (used before tagging a release, useful for larger PRs)

bash
deploy/scripts/release-check.sh


Runs Go/TypeScript/frontend build, security scan, Compose config validation,
and production-sample preflight; once commits exist, also checks whether
`sqlc generate` causes generated-file drift.

Optional deeper gates (require a running local Docker environment):

bash
RUN_DB_CHECK=1 RUN_RESTORE=1 RUN_E2E=1 RUN_VISUAL=1 RUN_SMOKE=1 deploy/scripts/release-check.sh
TOKHUB_ENV=production RUN_NO_DEMO=1 deploy/scripts/release-check.sh   # verify no demo/test data
RUN_FRESH_PROD=1 deploy/scripts/release-check.sh                       # verify seed+smoke from empty DB


## PR rules (from `CONTRIBUTING.md`)

- Keep pull requests focused.
- Include tests for behavior changes.
- Update `docs/API.md` and `docs/openapi.yaml` when public API contracts change.
- Do **not** commit `.env`, provider credentials, gateway keys, admin-agent
  tokens, database dumps, local screenshots with private data, or generated
  reports.
- Do not include files ignored by `.gitignore` using `git add -f` unless a
  maintainer explicitly approves the exception.
- License: contributions are under Apache License 2.0.

## Open-source release scope awareness (relevant if touching release/deploy tooling)

Per `docs/OPEN_SOURCE.md`, the following must never end up in a public
commit/PR: `.env`/`.env.production`, `backups/`, `tmp/`, DB dumps, restore
drill artifacts, `docs/reviews/`, `skills/` (unsanitized local skill
packages — public skill packages live under `agent-skills/` only),
admin-agent tokens, exported CSVs, generated channel-site packages, provider
keys, credential-bearing screenshots/logs, unreviewed `prototype/` snapshots,
unreviewed `web/static/` recommendation packages, `node_modules/`,
`web/dist/`, `test-results/`, `playwright-report/`, `coverage/`, or local
binaries. These are enforced by `.gitignore`/`.dockerignore`/
`deploy/scripts/open-source-preflight.sh` — do not weaken those checks in a PR.

## Where to look before proposing a change

- Touching probe logic (L1/L2/L3) or gateway routing → read
  `references/project-structure.md` first; these are core trust/health
  algorithms with documented classification rules — don't silently change
  status semantics (`healthy`/`degraded`/`connectivity_down`/
  `functional_down`/`auth_error`/`unknown`).
- Touching credential/key storage (AES-GCM, Gateway Key hashing, bcrypt,
  CSRF) → treat as security-sensitive; changes here should be small,
  reviewed carefully, and covered by `npm run test:security` and
  `deploy/scripts/security-scan.sh`.
- Touching public API contracts → update `docs/API.md` and
  `docs/openapi.yaml` in the same PR.
- Touching deploy/release scripts → re-read `docs/RELEASE.md` and
  `docs/OPEN_SOURCE.md`; these encode hard-won production-safety rules
  (demo-data purge confirmation flags, restore confirmation flags,
  production env var requirements) — don't relax a confirmation gate to
  make a script "simpler".
