# OpenStory — documented failure modes

These are traps the upstream repo documents from real incidents. Check this
list before inventing a hypothesis.

## 1. D1 table-rebuild fires every CASCADE (data loss)

**Symptom** — a migration lands and unrelated rows vanish (`team_members`,
`session`, `account`, `passkey` were destroyed in prod on 2026-04-29, #612,
migration `20260428013041_productive_kabuki`).

**Cause** — D1 wraps a multi-statement migration body in an implicit
transaction, and SQLite silently ignores `PRAGMA foreign_keys = OFF` inside a
transaction. So drizzle-kit's table-rebuild pattern (`CREATE __new_X` →
`INSERT SELECT` → `DROP X` → `RENAME`) triggers every inbound
`ON DELETE CASCADE`. `PRAGMA defer_foreign_keys = ON` does **not** help.

**Fix, in order of preference**

1. Avoid the rebuild — use `ALTER TABLE … RENAME COLUMN / ADD COLUMN /
   DROP COLUMN`
2. If a rebuild is unavoidable: `wrangler d1 export` first, apply manually,
   then mark it applied in `d1_migrations`
3. Avoid `ON DELETE CASCADE` on FKs pointing at `user`, `teams`, `sequences`

**Guardrail** — `scripts/check-migrations.ts` (Lefthook pre-commit) flags
`DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE … DROP COLUMN`. Bypass
only deliberately: `bun scripts/check-migrations.ts --allow-destructive`.

## 2. Schema-drift trap (#898)

drizzle-kit only diffs **exported** top-level tables. Remove a table's named
export from `src/lib/db/schema/index.ts` and the next `bun db:generate` emits
`DROP TABLE`.

Also: never change a column's SQL `.default()` without generating the migration
in the same PR — it forces a full table rebuild (see #1). Prefer
`$defaultFn()`.

## 3. Remote D1 binding leak

`@cloudflare/vite-plugin` historically defaulted remote bindings **on**, which
leaked Better Auth verification rows straight into prod D1 (mid-#755).

**Mitigation in the repo** — the default block's `database_id` is the
deliberately invalid placeholder `dev-local-d1`, so a misrouted remote call
404s instead of writing.

**What you must do** — never add `"remote": true` to a D1 binding. `bun dev`
prints a wrangler-bindings banner at startup: **if `DB` shows REMOTE, kill the
server immediately.** To reproduce a prod bug, temporarily point the default
D1 at prod and revert; never commit that.

## 4. Prod build made without `CLOUDFLARE_ENV=production`

The build bakes the default block (placeholder D1) and fails loudly. Related:
`[env.production].name` is pinned to `openstory` on purpose — `legacy_env`
would otherwise derive `openstory-production`, a *different* worker that
deploys successfully while the live site never updates.

## 5. Nested migration files are silently ignored

drizzle-kit emits `<timestamp>_<name>/migration.sql`. Wrangler reads **zero**
of those. `scripts/flatten-migrations.ts` renders the flat, gitignored
`drizzle/migrations-wrangler/` that `migrations_dir` points at — which is why
`db:migrate:prd` / `deploy` / `deploy:production` all run it first.

## 6. Cron drift fails by succeeding

A cron expression has to match in three places: the default `wrangler.jsonc`
block, `[env.production]` (crons are not inherited), and the constant the
`scheduled()` handler string-matches on (e.g. `FAL_PRICING_CRON`). If it does
not match, the invocation falls through to the 5-minute reconcile sweep, which
**succeeds** — so the job simply never runs and nothing looks broken.
Enforced by `src/lib/cron/refresh-fal-pricing.test.ts`.

## 7. Empty `model_pricing` locally

`model_pricing` in D1 is the only pricing record; nothing is baked in.
`bun dev` never fires `scheduled()`, so until you run
`bun scripts/refresh-fal-pricing.ts` (needs `FAL_KEY`), estimates gate on a
$0.10 floor and billing records $0 via `reportMissingBillingCost`.

## 8. fal's pricing API can be wrong

`/v1/models/pricing` reported Grok Imagine at compute-seconds × $0.00017 while
fal actually billed units × $0.01 — a ~59× under-charge; six more mispriced
endpoints were found, one over-charging by 33%.

Three defenses, **all requiring an ADMIN-scoped `FAL_BILLING_KEY`**: a nightly
overlay from `/v1/models/usage` (30d), `model_pricing.rateVerifiedAt`
write-protection, and the hourly reconcile
(`src/lib/cron/reconcile-fal-billing.ts`) against `/v1/models/billing-events`
— report-only, emitting a `billing_drift` PostHog event. Without the key both
crons error-log and prices run unverified.

## 9. E2E env-var shadowing

Hardcoding `E2E_FULL_PIPELINE` / `E2E_RECORD` as `"false"` in
`[env.test].vars` shadows the `process.env` values, so `triggerWorkflow()`
skips every workflow and the record branch never fires (fixture miss → 500).
They are intentionally absent from `vars`; Playwright's `webServer` envPrefix
supplies them plus `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`.

## 10. Workflow error noise

`sanitizeFailResponse()` unwraps nested error wrappers, maps CF error codes
(e.g. `1102` → "Worker exceeded memory limit"), and truncates anything over 500
chars. The base class deliberately **skips `onFailure`** when the engine aborts
mid-run — that is transient and the run resumes, so an aborted step is not a
failure.

## 11. The three command mix-ups

| You typed | It did | You wanted |
|---|---|---|
| `bun test` | Bun's runner, ignoring `vitest.config.ts` | `bun run test` |
| `bun build` | Bun's bundler | `bun run build` |
| `tsc` | wrong type checker | `bun typecheck` (`tsgo`) |

Also: `bun script.ts` intentionally runs under **Node** while autoloading
`.env*`. No `--bun` flag should ever appear in `package.json` scripts.

## 12. Video export "production only"

The container binding (`VIDEO_EXPORT_CONTAINER`) exists only in the production
wrangler block, so a plain `bun dev` export reports "production only" and e2e
marks the row `failed` instead of rendering. This is intentional — it keeps
local dev and e2e Docker-free.

## Quick triage order

1. Did the server start with a REMOTE `DB` binding? (→ #3)
2. Is the failure in a specific storyboard phase, or before the workflow
   triggered at all? (→ `references/architecture.md`)
3. Are `FAL_KEY` / `OPENROUTER_KEY` actually present? (→
   `openstory.sh env-check`)
4. Did a migration run recently? (→ #1, #2, #5)
5. Is a cron/pricing/billing symptom involved? (→ #6, #7, #8)
6. Is it just a command mix-up? (→ #11)
