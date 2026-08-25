---
name: openstory
description: >
  Work with OpenStory (github.com/openstory-so/openstory), the open-source
  AI script-to-video sequence platform built on Bun + TanStack Start +
  Cloudflare Workers (D1, R2, Workflows, Durable Objects) with Drizzle,
  Better Auth, and Fal.ai/OpenRouter models. Routes one request to one mode:
  run it locally (`bun install && bun dev` on Miniflare, `FAL_KEY` /
  `OPENROUTER_KEY`), trace the storyboard pipeline (scene split, casting,
  prompts, frame images, motion, music), author a Cloudflare Workflow under
  the three-place wiring and no-mid-run-read `scopedDb` contract, add or
  update an image/video/audio/LLM model, ship a safe D1 + Drizzle migration,
  or deploy. Use when the user mentions OpenStory or is operating this
  codebase. Triggers on: openstory, openstory.so, script to video, AI video
  sequence platform, storyboard workflow, triggerWorkflow,
  OpenStoryWorkflowEntrypoint, WorkflowScopedDb, IMAGE_MODELS, fal.ai model
  registry, D1 CASCADE data loss, flatten-migrations, deploy Cloudflare
  Workers video app.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Requires Bun >= 1.3.0 < 2 and Node >= 24 < 25. Local dev needs no Docker,
  no external database, and no Cloudflare account — the full stack (D1, R2,
  Workflows, Durable Objects, email) runs in Workerd via Miniflare. AI
  generation needs `FAL_KEY` and/or `OPENROUTER_KEY` and spends real money.
  Video export is production-only (container binding). MIT licensed.
metadata:
  tags: openstory, ai-video, script-to-video, cloudflare-workers, cloudflare-workflows, tanstack-start, bun, drizzle, d1, fal-ai, storyboard, video-generation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/openstory-so/openstory
---

# OpenStory — AI script-to-video sequence platform

OpenStory turns a written script into a styled video sequence: it splits the
script into scenes, casts characters and locations from reusable team
libraries, builds visual/motion/music prompts, renders frames through Fal.ai,
animates them into motion clips, scores them, and merges the result. The whole
app is a single Cloudflare Worker (`src/server.ts`) — D1 for data, R2 for
media, 33 named Cloudflare Workflows for durable generation, and a Durable
Object for SSE progress. Local dev runs that same Workerd runtime through
Miniflare, so there is no "works locally, breaks in prod" gap.

## When to use this skill

- Cloning, bootstrapping, or running OpenStory locally (`bun dev`), or wiring
  the `FAL_KEY` / `OPENROUTER_KEY` needed for generation
- Tracing or debugging the storyboard pipeline: why a sequence is stuck, which
  phase failed, what a workflow step actually produced
- Adding or changing a Cloudflare Workflow, or hitting the
  `WorkflowScopedDb` / mid-run-read / replay-idempotency rules
- Adding, hiding, or repricing an image / image-to-video / audio / LLM model
- Changing the Drizzle schema or shipping a D1 migration safely
- Deploying: deploy button, Workers Builds, PR previews, manual prod deploy
- Contributing a PR (branch naming, Lefthook gates, pre-push checks)
- Diagnosing one of the documented traps (`bun test` vs `bun run test`, remote
  D1 binding leak, nested migration files, silent cron drift, empty pricing)

## When not to use this skill

- Generic "make me an AI video" requests with no OpenStory repo involved →
  use `video-production`, `vox-director`, or `video-shotcraft`
- Local desktop/timeline video editing → `opencut`, `palmier-pro`
- Generic Cloudflare Workers/D1/Wrangler questions unrelated to this codebase →
  use the Cloudflare docs directly; this skill only encodes OpenStory's own
  contracts
- Generic TanStack Start / Drizzle / Better Auth tutorials → those belong to
  their own docs; here they only appear as OpenStory conventions

## Instructions

### Step 1: Pick exactly one mode before touching anything

| Mode | Use when | Go to |
|---|---|---|
| `run-local` | first run, env keys, "nothing generates" | Step 2 |
| `pipeline-trace` | a sequence is stuck/wrong, you need phase-level truth | Step 3 |
| `workflow-authoring` | adding or editing `src/lib/workflows/*-workflow.ts` | Step 4 |
| `model-catalog` | add/hide/reprice an image, video, audio, or LLM model | Step 5 |
| `schema-migration` | Drizzle schema change or a D1 migration | Step 6 |
| `deploy` | deploy button, Workers Builds, PR preview, manual prod | Step 7 |
| `contribute` | opening a PR against upstream | Step 8 |

Do not blend modes. If two apply, do the read-only one first.

### Step 2: `run-local` — get a working local stack

```bash
git clone https://github.com/openstory-so/openstory.git
cd openstory && bun install && bun dev     # http://localhost:3000
```

`bun dev` is self-bootstrapping: `scripts/ensure-env.ts` writes `.env.local`
with generated `BETTER_AUTH_SECRET` / `API_KEY_ENCRYPTION_KEY`, then
`db:migrate:local` → `db:seed:local` → `vite dev`. No Docker, no external DB,
no Cloudflare account.

Generation stays dark until you add keys — `bun setup` (interactive) or paste
into `.env.local`:

- `FAL_KEY` — image, video, audio (and LLM via fal's OpenRouter endpoint)
- `OPENROUTER_KEY` — LLM script analysis

**Read the startup banner.** `bun dev` prints its wrangler bindings. If `DB`
shows `REMOTE`, kill the server immediately — that is the prod-D1 leak
described in `references/troubleshooting.md`.

Full script/env tables: `references/commands.md`.
Read-only host check: `bash .agent-skills/openstory/scripts/openstory.sh doctor [repo_path]`.

### Step 3: `pipeline-trace` — name the phase before guessing

Generation starts at `src/functions/sequences.ts`
(`createSequenceFn` / `updateSequenceFn` / `retryStoryboardFn`) →
`triggerWorkflow('/storyboard', input)` → `STORYBOARD_WORKFLOW`.

Phases, in order: Verify+Prepare → Poster (non-critical) → Scene Splitting →
Casting (talent ∥ location) → References & Prompts (character sheets ∥
location sheets ∥ visual prompts) → Frame Images **then** Motion/Music prompts
(sequential since #929) → Motion + Music → Complete.

Identify the failing phase from `workflowRunId` / `sequence_events` before
changing code. Phase details and per-phase inputs/outputs are in
`references/architecture.md`.

### Step 4: `workflow-authoring` — obey the three-place wiring and scopedDb

A new workflow is not "added" until it exists in **all three** places, which
`src/lib/workflow/wiring-consistency.test.ts` enforces:

1. `wrangler.jsonc` → `workflows[]` (and the `[env.production]` / `[env.test]`
   blocks — workflow config is **not** inherited)
2. a re-export of the class from `src/server.ts`
3. an entry in `TRIGGER_TO_BINDING` (`src/lib/workflow/trigger-bindings.ts`)

Then: extend `OpenStoryWorkflowEntrypoint`, implement
`runImpl(event, step, scopedDb)`, and wrap every unit of work in
`step.do('step-name', ...)`. Trigger only through `triggerWorkflow()` — never
a raw `fetch()`.

Three hard rules that cost the most time when broken:

- **No mid-run D1 reads.** `scopedDb` is write-only by type. The only hatches
  are `scopedDb.credentials.*`, `scopedDb.claims.*`, `scopedDb.liveRead.*`.
- **The body replays from the top on every step callback.** Steps must be
  idempotent; do not pass large blobs across step boundaries.
- **`retries`/`retryDelay` on `triggerWorkflow()` are no-ops.** Retries belong
  on `step.do()` or the class.

### Step 5: `model-catalog` — check `llms.txt` first, never hand-write schemas

- LLM registry → `src/lib/ai/models.config.ts` (`SCRIPT_ANALYSIS_MODELS`)
- Image / image-to-video / audio → `src/lib/ai/models.ts`
- Motion per-model params → `src/lib/motion/generated/endpoint-map.ts`
  (**generated** — run `bun motion:codegen`, do not edit by hand)

Before changing any fal endpoint, read
`https://fal.ai/models/{model-path}/llms.txt` — the machine-readable param
spec is authoritative and more current than the HTML docs. Then
`bun models:check` to diff the catalog. Retiring a model means marking it
hidden (not selectable), not deleting it — existing rows still reference it.

Current registry snapshot and defaults: `references/architecture.md`.

### Step 6: `schema-migration` — assume the CASCADE trap is live

```bash
bun db:generate      # drizzle-kit, from schema changes only
bun db:migrate:local # apply locally
```

Never hand-write migration SQL. Never hand-write Better Auth tables — run
`bun auth:generate`, port the output verbatim into
`src/lib/db/schema/auth.ts`, then `bun db:generate`.

The dangerous part: D1 runs multi-statement migrations inside an implicit
transaction where `PRAGMA foreign_keys = OFF` is silently ignored, so the
SQLite table-rebuild pattern fires every inbound `ON DELETE CASCADE`. This
already destroyed prod auth tables once (#612). Prefer
`ALTER TABLE … RENAME/ADD/DROP COLUMN` over rebuilds, and avoid
`ON DELETE CASCADE` on FKs to `user`, `teams`, `sequences`. The Lefthook
guard is `scripts/check-migrations.ts`.

Also: drizzle-kit only diffs **exported** tables — dropping a named export
from `src/lib/db/schema/index.ts` makes the next `db:generate` emit
`DROP TABLE` (#898).

### Step 7: `deploy` — pick the path, then respect `CLOUDFLARE_ENV`

- **Zero-config**: the Deploy-to-Cloudflare button clones the repo (a clone,
  not a fork), provisions everything in the default `wrangler.jsonc` block,
  and prompts only for `BETTER_AUTH_SECRET` + `API_KEY_ENCRYPTION_KEY`. AI
  keys go in afterwards via Settings → API Keys or `wrangler secret put`.
- **Upstream repo**: Workers Builds auto-deploys `main`
  (`bun run build` with `CLOUDFLARE_ENV=production`, then
  `bun run deploy:production`).
- **Manual**: `bun cf:typegen && bun cf:deploy:prd`.
- **PRs**: GitHub Actions creates a per-PR Worker, D1, namespaced workflows,
  and container app; closing the PR tears them down.

A build without `CLOUDFLARE_ENV=production` bakes the default block (with the
deliberately-invalid placeholder D1 id) and fails loudly. That placeholder is
a safety feature — do not "fix" it.

### Step 8: `contribute` — the branch name is a hard gate

Branches must be `<issue-number>-feature-name` (e.g. `393-improve-readme`);
Lefthook extracts the issue number and tags commits `#<issue>`, and the PR
body must contain `Closes #<issue>`.

Before pushing:

```bash
bun lint && bun format:check && bun typecheck && bun run test
```

`bun run test` (not `bun test`), `bun run build` (not `bun build`), `tsgo`
(not `tsc`). These three are the most repeated mistakes in the repo's own
docs.

## Best practices

1. **Trust the runtime parity, not your memory** — local dev is real Workerd
   via Miniflare, so reproduce in `bun dev` before theorizing about a
   Cloudflare-only bug.
2. **Name the pipeline phase before editing code** — the storyboard workflow
   has 7 phases with different owners; a "generation failed" report without a
   phase is not yet actionable.
3. **Treat `scopedDb` as a type-level contract, not a suggestion** — if you
   need a read mid-run, you almost certainly need a snapshot from an earlier
   `step.do()` instead.
4. **Three-place workflow wiring or it does not exist** — `wrangler.jsonc`,
   `src/server.ts`, `TRIGGER_TO_BINDING`. Run the wiring test.
5. **Never add `"remote": true` to a D1 binding** and never commit a real
   prod `database_id` into the default block.
6. **Assume every migration might rebuild a table** — check for CASCADE
   fan-out before applying anything to prod, and export first.
7. **Generation costs real money** — `FAL_KEY` spends per call. Use the
   cheapest preview model when iterating, and never loop retries on a failing
   generation.
8. **Cron changes must land in three places too** — default block,
   `[env.production]`, and the constant the `scheduled()` handler string-
   matches. A mismatch fails silently by succeeding.
9. **Regenerate, don't hand-write** — motion schemas (`bun motion:codegen`),
   Better Auth tables (`bun auth:generate`), migrations (`bun db:generate`),
   CF types (`bun cf:typegen`).

## References

- [references/commands.md](references/commands.md) — every `bun` script grouped by job, plus the full env-var table (required vs optional)
- [references/architecture.md](references/architecture.md) — worker layout, server-handler pattern, the 33 workflow bindings, Durable Objects, D1/R2 bindings, data model, storyboard phases, model registry, code conventions
- [references/troubleshooting.md](references/troubleshooting.md) — the 12 documented failure modes with symptoms and fixes
- [scripts/openstory.sh](scripts/openstory.sh) — read-only `doctor` / `env-check` / `phases` helper (never installs or mutates)
- [OpenStory repository](https://github.com/openstory-so/openstory) · [openstory.so](https://openstory.so)
- Upstream architecture doc: [CLAUDE.md](https://github.com/openstory-so/openstory/blob/main/CLAUDE.md) · [CONTRIBUTING.md](https://github.com/openstory-so/openstory/blob/main/CONTRIBUTING.md)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: First run, then verify the host is actually ready

```bash
git clone https://github.com/openstory-so/openstory.git
cd openstory && bun install && bun dev
# in another shell:
bash .agent-skills/openstory/scripts/openstory.sh doctor ./openstory
```

`doctor` reports Bun/Node versions against the engine range, whether
`.env.local` exists, and which AI keys are set — without writing anything.

### Example 2: Add a new image model

1. Read `https://fal.ai/models/fal-ai/<new-model>/llms.txt`
2. Add the entry to `IMAGE_MODELS` in `src/lib/ai/models.ts` (plus an
   `EDIT_ENDPOINTS` entry if it supports editing)
3. `bun models:check` to diff against the live catalog
4. `bun run test && bun typecheck`

### Example 3: Add a workflow without breaking the wiring test

```bash
# 1. src/lib/workflows/my-thing-workflow.ts  (extends OpenStoryWorkflowEntrypoint)
# 2. wrangler.jsonc  -> workflows[] in default, [env.production], [env.test]
# 3. src/server.ts   -> export { MyThingWorkflow }
# 4. src/lib/workflow/trigger-bindings.ts -> TRIGGER_TO_BINDING['/my-thing']
bun run test src/lib/workflow/wiring-consistency.test.ts
```

### Example 4: Check a repo's env wiring before blaming the model

```bash
bash .agent-skills/openstory/scripts/openstory.sh env-check ./openstory
```

Prints which of `FAL_KEY`, `OPENROUTER_KEY`, `XAI_API_KEY`,
`BETTER_AUTH_SECRET`, `API_KEY_ENCRYPTION_KEY` are present in `.env.local`
(names only — never values).

### Example 5: Recall the pipeline phases mid-debug

```bash
bash .agent-skills/openstory/scripts/openstory.sh phases
```
