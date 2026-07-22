# Agent Pulse command and boundary matrix

Use this as a quick operational reference; the upstream repository and its current `AGENTS.md` remain the source of truth.

## Repository orientation

| Concern | Current location |
| --- | --- |
| Source adapters and network policy | `src/collectors/` |
| Pure URL, clustering, and scoring rules | `src/domain/` |
| Schema, migrations, repositories, seed catalog | `src/db/` |
| Collection, evaluation, Scout, export | `src/pipeline/` |
| Public/admin APIs | `src/server/` |
| Static public site / private control room | `web/public/` / `web/admin/` |
| Unit and SQLite integration tests | `tests/` |

## Command matrix

Run from the Agent Pulse repository root:

```bash
npm install
cp .env.example .env
npm run dev
npm run db:migrate
npm run db:seed
npm run collect -- --scope=eligible
npm run collect -- --source=<source-id>
npm run sources:audit
npm run evaluate:system
npm run ops:reconcile
npm run scout:generate -- 3
npm run export
npm run public:validate
npm run check
```

`collect` also accepts `--scope=all`, `--backfill`, and `--drain`; use them only when the packet
requires those broader or more expensive operations. `scout:generate` accepts an integer from 1 to 18.

## Evidence and lifecycle reminders

- Source tiers: Tier 1 primary fact, Tier 2 professional verification, Tier 3 expert interpretation,
  Tier 4 distribution heat, and aggregators for discovery only.
- Source lifecycle: `draft -> shadow -> active -> degraded -> quarantined -> retired`.
- Automatic Events start in `review`; public export is built from published rows only.
- SQLite is the local default. MySQL compatibility requires real integration coverage.
- Public output is an allowlist export. Never export raw payloads, database data, credentials, tokens,
  proxy settings, admin fields, local paths, or private notes.
- Respect robots, licenses, terms, rate limits, and authorization boundaries. Never bypass login, WAF,
  CAPTCHA, paywalls, or platform restrictions.

## Verification packet

For code changes, run a focused test first and then `npm run check`. For data or publication work,
record command output, before/after counts, source-run health, generated report/fingerprint paths, and
any remaining review or evidence gates. A zero exit code alone is not a publication decision.
