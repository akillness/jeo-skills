# OpenStory — command & environment reference

Every command is a Bun script from `package.json` (66 scripts). Run them from
the repo root. Bun is the package manager and script *launcher*; Node is the
runtime (`bun script.ts` with no `--bun` flag runs under Node while autoloading
`.env*`). Engines: `bun >=1.3.0 <2`, `node >=24 <25`.

## The three commands people get wrong

| Wrong | Right | Why |
|---|---|---|
| `bun test` | `bun run test` | Bun's built-in runner ignores `vitest.config.ts` |
| `bun build` | `bun run build` | `bun build` is Bun's bundler, not the Vite build |
| `tsc --noEmit` | `bun typecheck` (`tsgo --noEmit`) | the repo type-checks with `tsgo` |

## Development

| Command | Does |
|---|---|
| `bun dev` | `ensure-env.ts` → `db:migrate:local` → `db:seed:local` → `vite dev` on :3000 |
| `bun dev:all` | `dev` + Stripe listener + video-export container service, sets `VIDEO_EXPORT_DEV_URL=http://localhost:8080` |
| `bun dev:app` | migrate + seed + vite, without the env bootstrap |
| `bun dev:vite` | build content collections, then `vite dev` |
| `bun dev:bunny` | run `containers/video-export` locally |
| `bun setup` | interactive AI-key setup |
| `bun setup:prd` | interactive production setup |
| `bun setup:deploy` / `bun setup:stg` | deploy / PR-preview setup variants |
| `bun storybook` | Storybook on :6006 |
| `bun explorer` | open the local Cloudflare Explorer UI (`/cdn-cgi/explorer/`) |

## Quality gates

| Command | Does |
|---|---|
| `bun lint` | `oxlint --type-aware` |
| `bun lint:fix` | oxlint with `--fix` |
| `bun format` / `bun format:check` | `oxfmt` write / check |
| `bun typecheck` | `tsgo --noEmit` |
| `bun dead-code` | `knip` unused-export scan |

Pre-push gate (documented in CONTRIBUTING):

```bash
bun lint && bun format:check && bun typecheck && bun run test
```

Lefthook pre-commit runs oxlint + oxfmt + tsgo on staged files, plus
`scripts/check-migrations.ts` on staged `drizzle/migrations/**/*.sql`.

## Testing

| Command | Does |
|---|---|
| `bun run test` | `vitest run` |
| `bun test:watch` | `vitest` |
| `bun test:coverage` | `vitest run --coverage` |
| `bun test:e2e` | `bun playwright test` |
| `bun test:e2e:ui` | Playwright interactive UI |
| `bun test:e2e:full` | full-pipeline spec (`PLAYWRIGHT_FULL_PIPELINE=true`) |
| `bun test:e2e:full:built` | full pipeline against a built worker |
| `bun test:e2e:record` | record new fixtures (`E2E_RECORD=1`) |
| `bun test:e2e:setup` | migrate + seed the test DB |

E2E runs `vite dev` on **:3001** with `E2E_TEST=true`; `aimock` on **:4010**
intercepts LLM/fal calls (fal via a handler mounted at `/fal`). R2 is *not*
mocked — real puts land in local Miniflare R2.

## Database & auth

| Command | Does |
|---|---|
| `bun db:generate` | drizzle-kit generate from schema changes |
| `bun db:check` | drizzle-kit consistency check |
| `bun db:migrate:local` | apply migrations locally |
| `bun db:migrate:test` | apply to the test DB |
| `bun db:migrate:prd` | flatten migrations, then `wrangler d1 migrations apply DB --env=production --remote` |
| `bun db:seed:local` | seed the local DB |
| `bun db:studio:local` / `bun db:studio:d1` | Drizzle Studio, local / D1 |
| `bun db:fork:local` / `bun db:promote:local` | local DB worktree fork / promote |
| `bun auth:generate` | Better Auth CLI → root `auth-schema.ts` (port verbatim into `src/lib/db/schema/auth.ts`) |

Escape hatch for an intentionally destructive migration:

```bash
bun scripts/check-migrations.ts --allow-destructive
```

## Models & content

| Command | Does |
|---|---|
| `bun models:check` | diff the model catalog against upstream |
| `bun motion:codegen` | regenerate motion endpoint schemas (`src/lib/motion/generated/endpoint-map.ts`) |
| `bun setup:previews` | generate + upload style previews to R2 |
| `bun setup:system-previews` | generate + upload system previews |
| `bun styles:sample-videos` | generate style sample videos |
| `bun styles:sample-videos:upload` | upload them to R2 |
| `bun styles:sample-videos:seed:local` / `:d1` / `:sql` | seed sample-video rows |
| `bun r2:cors` (`:dev` / `:stg` / `:prd`) | apply R2 CORS config |

Before touching a fal endpoint, read
`https://fal.ai/models/{model-path}/llms.txt` — the machine-readable param spec
is authoritative and fresher than the HTML docs.

## Build & deploy

| Command | Does |
|---|---|
| `bun run build` | `vite build` |
| `bun build:e2e` | test-env build for `test:e2e:full:built` |
| `bun cf:typegen` | `wrangler types` |
| `bun cf:dev` | `wrangler dev` |
| `bun cf:deploy:prd` | typegen → prod build → prod migrate → `wrangler deploy --env=production` |
| `bun deploy` | flatten migrations → apply remote → `wrangler deploy` (used by button clones) |
| `bun deploy:production` | same, against `--env=production` |
| `bun secrets:push:prd` / `bun secrets:check:prd` | push / dry-run Doppler secrets |
| `bun secrets:pull` | pull dev secrets from Doppler into `.env.local` |

## Environment variables

### Required (auto-generated into `.env.local` by `bun dev`)

| Name | Note |
|---|---|
| `VITE_APP_URL` | `http://localhost:3000`; marketing contact/privacy emails derive from its domain |
| `VITE_APP_NAME` | `OpenStory` |
| `BETTER_AUTH_SECRET` | auto-generated |
| `API_KEY_ENCRYPTION_KEY` | required once users bring their own AI keys; auto-generated |

### AI services (optional, but generation is dark without them)

| Name | Note |
|---|---|
| `FAL_KEY` | image, video, audio — and LLM via fal's OpenRouter endpoint |
| `OPENROUTER_KEY` | LLM script analysis |
| `XAI_API_KEY` | first-party Grok chat/image/video; without it Grok routes via OpenRouter/fal |
| `FAL_BILLING_KEY` | **ADMIN-scoped**; required by the nightly pricing overlay and hourly billing reconcile |
| `FAL_PRICING_KEY` | fal admin key for usage comparison |
| `MODELSCHEMAS_API_KEY` | lifts model-catalog rate limit (60/h → 5k/h) |
| `VITE_MODELS_ENABLED` | build-time flag for the `/models` catalog; on in dev, off in prod unless `true` |

### Storage (local dev needs none)

`R2_PUBLIC_STORAGE_DOMAIN`, `R2_PUBLIC_ASSETS_BUCKET`,
`VITE_R2_PUBLIC_ASSETS_DOMAIN`. S3-API creds used **only** by upload scripts,
never by the app: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`.

With `R2_PUBLIC_STORAGE_DOMAIN` unset, stored media resolves to origin-relative
`/r2/<key>` served by `src/routes/r2.$.ts`.

### Optional services

| Name | Note |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | social sign-in; falls back to email OTP |
| `EMAIL_FROM` | **unset in dev = fixed-OTP zero-friction sign-in**; setting it switches dev to real random email OTP |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | credits always work; Stripe only adds checkout + auto-top-up |
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` / `VITE_PUBLIC_POSTHOG_HOST` | analytics + LLM observability |
| `ADMIN_EMAILS` | comma-separated; gift-code management |
| `ABUSE_REPORT_NOTIFY_EMAIL` | unset ⇒ reports queue in `/admin/moderation` |
| `VIDEO_EXPORT_DEV_URL` | set automatically by `bun dev:all` |

### Not in `.env.example` but referenced

`CLOUDFLARE_ENV`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `FAL_BILLING_KEY_DEV`, `E2E_TEST`, `E2E_RECORD`,
`E2E_BUILT`, `PLAYWRIGHT_FULL_PIPELINE`, `VITE_DISABLE_DEVTOOLS`.

### `.dev.vars.example` (deploy-button dialog only)

Exactly two prompts, both `openssl rand -hex 32`: `BETTER_AUTH_SECRET` and
`API_KEY_ENCRYPTION_KEY`. AI keys are deliberately **not** prompted — add them
later via app Settings → API Keys or
`wrangler secret put FAL_KEY` / `wrangler secret put OPENROUTER_KEY`.

## Skill helper (read-only)

```bash
bash .agent-skills/openstory/scripts/openstory.sh doctor [repo_path]
bash .agent-skills/openstory/scripts/openstory.sh env-check [repo_path]
bash .agent-skills/openstory/scripts/openstory.sh phases
```

`doctor` checks Bun/Node against the engine range and inspects repo state.
`env-check` reports which env var **names** are present in `.env.local` — it
never prints values. Neither command installs, migrates, or mutates anything.
