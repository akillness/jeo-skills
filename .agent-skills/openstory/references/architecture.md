# OpenStory — architecture reference

Source of truth is the repo's own `CLAUDE.md`. This file is the condensed map
an agent needs before editing.

## Shape

One Cloudflare Worker. Entry `src/server.ts`, `compatibility_date
2025-11-18`, `compatibility_flags: ["nodejs_compat"]`.

| Layer | Tech |
|---|---|
| Package manager / launcher | Bun (Node is the runtime) |
| App framework | TanStack Start + TanStack Router + Vite (`@cloudflare/vite-plugin`) |
| Data | Cloudflare D1 + Drizzle ORM |
| Durable execution | Cloudflare Workflows (33 bindings) |
| Realtime | Durable Object `REALTIME` (SSE progress) |
| Media | Cloudflare R2 (2 buckets) |
| Auth | Better Auth (passkey / Google / email OTP) |
| UI | Tailwind v4 + shadcn/ui |
| Tests | Vitest + Playwright |

Four rules stated verbatim in `CLAUDE.md`:

1. DB access **only** in server handlers, never in components
2. anonymous-first, upgrade to save work
3. team-based resources (sequences, styles, characters)
4. script-driven generation for consistency

## Server handlers

Business logic lives in `src/functions/` as `createServerFn` endpoints.
`src/routes/api/` is **webhooks only** (workflows + auth).

```ts
createFileRoute('/api/example/$id')({
  server: {
    middleware: [authWithTeamRequestMiddleware],
    handlers: { POST: async ({ params, request, context }) => { /* ... */ } },
  },
})
```

Order: validate with Zod (`schema.parse`) → auth middleware puts `user` /
`teamId` on `context` → DB writes (only here) → trigger workflow → standardized
response. Errors:

```ts
const handled = handleApiError(error)
return json({ success: false, error: handled.toJSON() }, { status: handled.statusCode })
```

### Conditional runtime resolution (`package.json` `imports`)

| Specifier | workerd | other |
|---|---|---|
| `#env` | `src/lib/env/cloudflare.ts` | `src/lib/env/default.ts` |
| `#db-client` | `src/lib/db/client-d1.ts` | `client-node.ts` (storybook → `client-stub.ts`) |
| `#storage` | `src/lib/storage/storage-cloudflare.ts` | `storage-stub.ts` |
| `#flush-scheduler` | `flush-scheduler.cloudflare.ts` | `flush-scheduler.ts` |
| `#actions/*` | — | `src/app/actions/*/index.ts` (storybook → `index.mock.ts`) |

Tests mock `#db-client` via `vi.doMock` — never real connections.

## Cloudflare Workflows

Core files: `src/lib/workflow/{client,trigger-bindings,base-workflow,await-child,auth,dedup-ids,errors,instance-id,labels,launchers,llm-auth-failure,reconcile,rpc-dispose,run-outcome,sanitize-fail-response,types}.ts`.

### The contract

- Trigger with `triggerWorkflow(path, body)` from `@/lib/workflow/client` —
  never a raw `fetch()`. It resolves the binding via `TRIGGER_TO_BINDING`,
  calls `binding.create({ id, params })`, and returns the instance id stored as
  `workflowRunId`. `options.deduplicationId` becomes the instance id, which is
  what makes a trigger idempotent.
- Each workflow: `src/lib/workflows/<name>-workflow.ts`, extends
  `OpenStoryWorkflowEntrypoint` (`src/lib/workflow/base-workflow.ts`),
  implements `runImpl(event, step, scopedDb)`, does work inside
  `step.do('step-name', async () => {...})`.
- **Three-place wiring**, enforced by `wiring-consistency.test.ts`:
  1. `wrangler.jsonc` `workflows[]` — repeated in default, `[env.production]`
     and `[env.test]` because workflow config is not inherited
  2. class re-export from `src/server.ts`
  3. `TRIGGER_TO_BINDING` in `src/lib/workflow/trigger-bindings.ts`
- Parent → child fan-out: `spawnAndAwaitChild`
  (`src/lib/workflow/await-child.ts`), fan-out via `Promise.allSettled`.
- **No mid-run D1 reads.** `runImpl` receives a `WorkflowScopedDb`
  (`src/lib/db/scoped-workflow.ts`): full write surface, every read method
  removed, so a mid-run read is a *type error*. Three named hatches:
  `scopedDb.credentials.resolveKey('fal')` / `.resolveLlmKey()`,
  `scopedDb.claims.<domain>.getById…(id)`,
  `scopedDb.liveRead.<domain>.<method>()`. Pinned by
  `no-mid-run-reads.test.ts`; rationale in
  `docs/architecture/workflow-snapshots-and-content-hash-staleness.md`.
- **Replay semantics**: the body replays from the top on every step callback
  and completed steps return persisted results. Steps must be idempotent, and
  large blobs must not cross step boundaries.
- Retries live on `step.do()` or the class. `retries` / `retryDelay` passed to
  `triggerWorkflow()` are accepted but **no-ops**. There is no app-level
  concurrency gate (fal queues server-side; a `flowControl` attempt leaked
  ghost slots, #725).
- Failures go through `sanitizeFailResponse()` — unwraps nested errors, maps CF
  codes (e.g. `1102` → "Worker exceeded memory limit"), truncates >500 chars.
  The base class deliberately skips `onFailure` when the engine aborts mid-run
  (transient; it will resume).

### The 33 workflow bindings

`name` / `binding` / `class_name`, identical across default, `[env.production]`,
`[env.test]`:

| name | binding | class |
|---|---|---|
| `storyboard-workflow` | `STORYBOARD_WORKFLOW` | `StoryboardWorkflow` |
| `analyze-script-workflow` | `ANALYZE_SCRIPT_WORKFLOW` | `AnalyzeScriptWorkflow` |
| `scene-split-workflow` | `SCENE_SPLIT_WORKFLOW` | `SceneSplitWorkflow` |
| `talent-matching-workflow` | `TALENT_MATCHING_WORKFLOW` | `TalentMatchingWorkflow` |
| `location-matching-workflow` | `LOCATION_MATCHING_WORKFLOW` | `LocationMatchingWorkflow` |
| `character-bible-workflow` | `CHARACTER_BIBLE_WORKFLOW` | `CharacterBibleWorkflow` |
| `location-bible-workflow` | `LOCATION_BIBLE_WORKFLOW` | `LocationBibleWorkflow` |
| `character-sheet-workflow` | `CHARACTER_SHEET_WORKFLOW` | `CharacterSheetWorkflow` |
| `location-sheet-workflow` | `LOCATION_SHEET_WORKFLOW` | `LocationSheetWorkflow` |
| `library-talent-sheet-workflow` | `LIBRARY_TALENT_SHEET_WORKFLOW` | `LibraryTalentSheetWorkflow` |
| `library-location-sheet-workflow` | `LIBRARY_LOCATION_SHEET_WORKFLOW` | `LibraryLocationSheetWorkflow` |
| `element-vision-workflow` | `ELEMENT_VISION_WORKFLOW` | `ElementVisionWorkflow` |
| `element-sheet-workflow` | `ELEMENT_SHEET_WORKFLOW` | `ElementSheetWorkflow` |
| `frame-prompt-workflow` | `FRAME_PROMPT_WORKFLOW` | `FramePromptWorkflow` |
| `frame-prompt-batch-workflow` | `FRAME_PROMPT_BATCH_WORKFLOW` | `FramePromptBatchWorkflow` |
| `motion-prompt-workflow` | `MOTION_PROMPT_WORKFLOW` | `MotionPromptWorkflow` |
| `motion-prompt-batch-workflow` | `MOTION_PROMPT_BATCH_WORKFLOW` | `MotionPromptBatchWorkflow` |
| `music-prompt-workflow` | `MUSIC_PROMPT_WORKFLOW` | `MusicPromptWorkflow` |
| `motion-music-prompts-workflow` | `MOTION_MUSIC_PROMPTS_WORKFLOW` | `MotionMusicPromptsWorkflow` |
| `image-workflow` | `IMAGE_WORKFLOW` | `ImageWorkflow` |
| `shot-images-workflow` | `SHOT_IMAGES_WORKFLOW` | `ShotImagesWorkflow` |
| `shot-variant-workflow` | `SHOT_VARIANT_WORKFLOW` | `ShotVariantWorkflow` |
| `upscale-shot-variant-workflow` | `UPSCALE_SHOT_VARIANT_WORKFLOW` | `UpscaleShotVariantWorkflow` |
| `motion-workflow` | `MOTION_WORKFLOW` | `MotionWorkflow` |
| `motion-batch-workflow` | `MOTION_BATCH_WORKFLOW` | `MotionBatchWorkflow` |
| `music-workflow` | `MUSIC_WORKFLOW` | `MusicWorkflow` |
| `recast-character-workflow` | `RECAST_CHARACTER_WORKFLOW` | `RecastCharacterWorkflow` |
| `recast-location-workflow` | `RECAST_LOCATION_WORKFLOW` | `RecastLocationWorkflow` |
| `replace-element-workflow` | `REPLACE_ELEMENT_WORKFLOW` | `ReplaceElementWorkflow` |
| `regenerate-shots-workflow` | `REGENERATE_SHOTS_WORKFLOW` | `RegenerateShotsWorkflow` |
| `update-stale-shots-workflow` | `UPDATE_STALE_SHOTS_WORKFLOW` | `UpdateStaleShotsWorkflow` |
| `sequence-export-workflow` | `SEQUENCE_EXPORT_WORKFLOW` | `SequenceExportWorkflow` |
| `asset-generation-workflow` | `ASSET_WORKFLOW` | `AssetGenerationWorkflow` |

## Durable Objects, D1, R2, crons

- `REALTIME` → `RealtimeChannel`, SSE progress broker. Migration tag `v1`,
  `new_sqlite_classes: ["RealtimeChannel"]`. Declared in all three blocks (DO
  config is not inherited).
- `VIDEO_EXPORT_CONTAINER` → `VideoExportContainer`, **production block only**
  (tag `v2`). Fronts `containers[]` built from
  `containers/video-export/Dockerfile`, `instance_type: standard`,
  `max_instances: 3`. Kept prod-only so `bun dev` and e2e stay Docker-free;
  `SequenceExportWorkflow` tolerates the missing binding.
- D1 `DB`, `migrations_dir: drizzle/migrations-wrangler`:
  default `openstory-dev` / `dev-local-d1` (**deliberate invalid placeholder** so
  a misrouted remote call 404s instead of writing prod), production
  `openstory-prd`, test `openstory-test`.
- R2: `R2_PUBLIC_ASSETS_BUCKET` (`openstory-public-assets`) and
  `R2_STORAGE_BUCKET` (`openstory-dev` / `openstory-storage` / `openstory-test`).
  Only production sets `"remote": true`.
- `SEND_EMAIL` → Cloudflare Email Service; local dev simulates and logs to
  console.
- `DEVICE_LOGIN_RATE_LIMITER` → namespace `1219`, 30 requests / 60s for
  `/api/v1/device/*`.
- Crons `["*/5 * * * *", "17 3 * * *", "37 * * * *"]`, declared in **both** the
  default and `[env.production]` blocks: 5-min stuck-`generating` sweep, daily
  `model_pricing` refresh, hourly fal billing reconcile.
- Observability on, `head_sampling_rate: 1`, `invocation_logs: false` (the
  LogTape `loggerMiddleware` in `src/functions/middleware.ts` covers it).
  Production tails to `openstory-log-forwarder-prd`
  (`workers/posthog-log-forwarder/`).

## Data model

```
teams
  ├── users (members)
  ├── sequences (videos)
  │   └── frames (scenes with metadata)
  └── libraries (styles, characters, vfx, audio)
```

ULID primary keys, not UUID. 36 schema files under `src/lib/db/schema/`
(`sequences.ts`, `scenes.ts`, `shots.ts`, `frames.ts`, `talent.ts`,
`characters.ts`, `location-*.ts`, `credits.ts`, `model-pricing.ts`,
`sequence-exports.ts`, `compliance.ts`, `auth.ts`, …). The scene/shot/frame
split is a deliberate redesign — see
`docs/architecture/scene-shot-frame-redesign.md`.

`frame.metadata` **is** the `Scene` object (no wrapper). Access it through
`frameService.getSceneData(frame)`, `getVisualPrompt(frame)`,
`getMotionPrompt(frame)` rather than reaching into JSON. Its shape:
`sceneId`, `sceneNumber`, `originalScript{extract,lineNumber,dialogue}`,
`metadata{title,durationSeconds,location,timeOfDay,storyBeat}`,
`variants{cameraAngles,movementStyles,moodTreatments}`,
`selectedVariant{cameraAngle,movementStyle,moodTreatment,rationale}`,
`prompts{visual{...},motion{...}}`,
`continuity{characterTags,environmentTag,colorPalette,lightingSetup}`,
`musicDesign{presence,style,mood,atmosphere}`.

Seeding: no CI seed step — the worker self-seeds system templates on first
request (`src/lib/db/seed-system-templates.ts`), hash tracked in
`app_metadata`.

## Storyboard generation pipeline

Entry `src/functions/sequences.ts` → `createSequenceFn` / `updateSequenceFn` /
`retryStoryboardFn` → `triggerWorkflow('/storyboard', input)`.

`StoryboardWorkflowInput`: `userId`, `teamId`, `sequenceId`, `options`
(`framesPerScene`, `generateThumbnails`, …), `autoGenerateMotion`,
`autoGenerateMusic`, `musicModel?`, `imageModels?`, `suggestedTalentIds?`,
`suggestedLocationIds?`.

| Phase | ~time (9 scenes, local) | Produces |
|---|---|---|
| Verify + Prepare | <1s | script, aspectRatio, styleConfig, analysisModelId, imageModel, videoModel |
| Generate Poster (non-critical) | — | `posterUrl` |
| 1. Scene Splitting | ~3min | `scenes[]`, `title`, `shotMapping[]`, `bibles[]`; two parallel streaming LLM calls; shots + preview images appear progressively |
| 2. Casting (`Promise.all`) | ~2.5min | talent matching ∥ location matching (talent skipped without `suggestedTalentIds`) |
| 3. References & Prompts (parallel) | ~1min | character sheets ∥ location sheets ∥ visual prompts (LLM × scenes) |
| 4. Frame Images **then** Motion/Music prompts | ~3min | fal image gen × scenes in parallel, then motion+music prompt LLM conditioned on the rendered start frame as vision input (sequential since #929) |
| 5. Motion + Music (conditional) | ~1–5min | motion batch → merge video; music gen → merge audio+video → `finalVideoUrl` |
| Complete | <1s | emits `generation.complete` + `completeScenes[]` |

## Model registry

| Concern | File |
|---|---|
| LLM / script analysis | `src/lib/ai/models.config.ts` (`SCRIPT_ANALYSIS_MODELS`) |
| Image / image-to-video / audio | `src/lib/ai/models.ts` (`IMAGE_MODELS`, `IMAGE_TO_VIDEO_MODELS`, `AUDIO_MODELS`, `EDIT_ENDPOINTS`, `MOTION_REFERENCE_ENDPOINTS`) |
| Motion per-model params | `src/lib/motion/generated/endpoint-map.ts` (**generated** — `bun motion:codegen`) |
| fal cost/pricing | `fal-config.ts`, `fal-endpoints.ts`, `fal-cost.ts`, `fal-pricing-fetch.ts`, `fal-pricing-live.ts`, `fal-error.ts` |
| Native Grok | `src/lib/ai/grok-native.ts` |
| Adapters/resolvers | `llm-client.ts`, `create-adapter.ts`, `resolve-{image,video,audio,asset}-models.ts` |

Defaults (as of this snapshot — the registry files are the source of truth):

- `DEFAULT_ANALYSIS_MODEL = 'anthropic/claude-opus-5'`,
  `DEFAULT_VISION_MODEL = 'anthropic/claude-sonnet-5'`,
  `SCENE_SPLIT_MODEL = 'anthropic/claude-opus-5-fast'`
- `DEFAULT_IMAGE_MODEL = 'gpt_image_2'`, `PREVIEW_IMAGE_MODEL = 'krea_2_turbo'`
- `DEFAULT_VIDEO_MODEL = 'seedance_v2'`
- `DEFAULT_MUSIC_MODEL = 'elevenlabs_music'`

Image keys include `nano_banana_2`, `nano_banana_pro`, `gpt_image_2`,
`grok_imagine_image`, `flux_2_max`, `phota`, `hunyuan_image_v3`, `flux_2_dev`,
`qwen_image`, `hidream_i1`, `seedream_v5`, plus hidden `flux_2_turbo` /
`krea_2_turbo`. Image-to-video keys: `grok_imagine_video_1_5`, `ltx_2_3_pro`,
`veo3_1`, `kling_v3_pro`, `minimax_hailuo_02`, `seedance_v2`. Audio:
`elevenlabs_music`, `ace_step_1_5`, `ace_step`.

Hidden models are retired, not deleted — `isSelectableAnalysisModelId()` keeps
them out of pickers while existing rows still resolve.

Native Grok: when an xAI key resolves (team key → `XAI_API_KEY` → else
OpenRouter/fal), chat/image/video go to `api.x.ai`. That spend bypasses
`model_pricing` and the hourly reconcile, so it is **unaudited**.

## Code conventions

- Files `kebab-case`, **named exports only**, `@/` alias, vanilla TS for logic
- `type` not `interface`; no `any`/`unknown`; throw instead of returning
  success booleans
- TanStack Query with `suspense: true` — no `isLoading` branches; wrap in
  `<Suspense fallback={<Skeleton />} />` inline
- shadcn/ui owns theming; Tailwind for **layout only** (`flex`, `grid`, `gap`);
  no hard-coded colors; no `margin` on components (parent uses flex + gap)
- Visibility via CSS `hidden`/`block`, not conditional mounting
- Forms: uncontrolled + `FormData` + Zod `safeParse` + TanStack Query mutation
- Complex state: `useReducer` with a vanilla TS reducer
- Routing: `createFileRoute`, `Route.useParams()`, URL reflects filters/tabs/
  pagination via search params
- A11y/UX floor: WAI-ARIA APG keyboard support, `:focus-visible`, hit targets
  ≥24px (mobile ≥44px), `font-size` ≥16px, never block paste, Enter submits
  inputs / Ctrl+Enter textareas, optimistic UI with rollback, `aria-live`
  toasts, honor `prefers-reduced-motion`, animate transform/opacity, virtualize
  long lists (`virtua`), mutations <500ms
- Tests: handlers in `__tests__/` next to routes, services co-located
  `*.test.ts`, e2e in `e2e/tests/`; mock with `vi.doMock` **then**
  `await import(...)` (not hoisted), `vi.resetModules()` before re-mocking.
  `vitest.config.ts` is self-contained on purpose — extending `vite.config.ts`
  breaks on the Cloudflare plugin's SSR-externals shape.
- Branches `<issue-number>-feature-name`; PR body must contain
  `Closes #<issue>`

## Deployment paths

- **Deploy button**
  `https://deploy.workers.cloudflare.com/?url=https://github.com/openstory-so/openstory`
  — creates an independent clone (not a fork, so no "Sync fork"); track
  upstream manually with
  `git remote add upstream … && git pull upstream main`.
- **Production**: Cloudflare Workers Builds on `main`. Build `bun run build`
  with `CLOUDFLARE_ENV=production`; deploy `bun run deploy:production`.
  Manual fallback `bun cf:typegen && bun cf:deploy:prd`.
- **PR previews**: `.github/workflows/deploy-cloudflare.yml` patches the
  **default** wrangler block at runtime and deploys without `--env` — per-PR
  Worker `pr-<n>`, D1 `openstory-pr-<n>`, namespaced workflows `*-pr-<n>`,
  container app, `-stg` R2 and tail consumer. Closing the PR deletes them.
- **Cloudflare resources needed**: D1, 2× R2, 33 Workflows, DO `REALTIME`,
  prod-only container + `VIDEO_EXPORT_CONTAINER`, Email Service (domain
  onboarded for SPF/DKIM/DMARC), rate-limit namespace, 3 crons.
