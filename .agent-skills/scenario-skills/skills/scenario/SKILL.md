---
name: scenario
description: Use when connecting an AI agent to Scenario (scenario.com) through MCP, or when a task involves generating images, video, 3D, audio, sprites, textures, or game assets. Also when picking a Scenario model, running a LoRA, refining a generation prompt, uploading reference images, waiting on generation jobs, checking credits or quota, hitting Scenario auth, scope, or Forbidden errors, or setting up mcp.scenario.com in Claude Code, Cursor, VSCode, or another agent.
license: MIT
---

# Scenario

## Overview

Scenario generates images, video, 3D, and audio across 500+ models, plus custom training.

## Setup

- Endpoint: `https://mcp.scenario.com/mcp` (Streamable HTTP). Prefer OAuth: no credentials pass
  through the conversation.
- Client config, headless API-key setup, and per-client re-authentication:
  [references/setup.md](references/setup.md).
- Never ask an agent to collect, encode, or echo a secret.
- A previously authenticated connection now failing: re-authenticate before debugging.
  `diagnostics_run` names the layer (`auth`, `tenant-scope`, `api-unreachable`, or `healthy`).

Two tool kinds:

- **Direct**: the loop below, plus `asset_get`, `job_get`, `jobs_list`, and `models_list`.
  `?toolsets=full` exposes everything.
- **Catalog**: the rest (collections, tagging, analysis, training, members, keys).
  - `scenario_tools_search` takes only `query` (tool name or keywords) and `limit`; returns schema
    and lane.
  - `scenario_tool_execute_read` / `write` / `delete` take a required `name` and `parameters`, which
    holds every input, scope ids and `dry_run` included:
    `{"name": "collection_add_assets", "parameters": {"team_id": "…", "project_id": "…", "collection_id": "…", "asset_ids": ["…"]}}`.
    `plan_generation` takes only `description`.
  - Direct tools take scope, and `model_run` its `dry_run`, at top level. Never route them through
    an executor.
  - The executor drops a misplaced key silently: `arguments` surfaces as a false scope error, and a
    top-level `dry_run` runs the job, billed.
  - The lane is the result's own `permission`, not the verb: `asset_analyze` is write-class, since
    it starts a billed job.

## Scope first

- Resolve scope first, then pass `team_id` and `project_id` on every call.
- A team is the organization (company or studio account) holding projects. "My organization" or "my
  studio" names it.
- `teams_list` returns the teams with their projects. `projects_list` needs a `team_id`.
- Confirm the pair with the user: a guess writes into someone else's project. Unattended, take the
  task's pair, else stop and list them.
- The server fills scope only for read-only tools with one candidate, so an omission fails once a
  second team or project appears. The error names the wrong half.

## Quick reference

| Step              | Tool                                     | Notes                                                                        |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| Resolve scope     | `teams_list`, then `projects_list`       | Once per session; pass the ids on every call                                 |
| Find a model      | `search` or `recommend`                  | Free; `recommend` for a capability, `search` for a name                      |
| Get the schema    | `model_schema_get`                       | Always before `model_run`; check `runs_as` and caps                          |
| Generate          | `model_run`                              | Schema-conformant `parameters`; `dry_run` for cost                           |
| Wait              | `jobs_wait`                              | Whenever `model_run` returns a `job_id` without assets; never loop `job_get` |
| View / save       | `asset_display` / `asset_download`       | Never paste raw asset URLs; `format` converts images, meshes                 |
| Inspect an asset  | `asset_get`                              | Free; dimensions, duration, `firstFrame` / `lastFrame` ids                   |
| Upload inputs     | `upload_asset` + `upload_asset_complete` | Local files become asset_ids                                                 |
| Refine a prompt   | `prompt_spark`                           | Advisory rewrite; needs `model_id`                                           |
| CU left           | `consumption_limit_get`                  | Catalog read: `effective_remaining`, `period.end`; plan CU can end first     |
| CU spent          | `usage`                                  | `project_id` required; `scope: "team"`: accessible projects; not a balance   |
| Saved preferences | `memory_recall`                          | OAuth only; before generating in a project, again after switching            |

- **Multi-step request** ("product video with voiceover", "concept to 3D"): catalog
  `plan_generation` (read lane). Plain words in `description`, ordered steps out, each naming a tool
  and an optional model hint. It runs nothing. A single step goes to `recommend`.
- **Stated preference** ("always 9:16"): catalog `memory_set` (delete lane), `scope`
  `project_user_memory` (`user_memory` across projects). It replaces the whole layer: `memory_get`
  and merge first.

## Worked example

Generating a stylized game prop image:

1. Discover the model:
   - `recommend` for a capability, the user's own words as `prompt` (never `query`). Unscoped, it
     ranks models the team cannot run.
   - `search` requires `target` (`models`, `assets`, `workflows`); for a known name:
     `target="models"`, `query="<model name>"`, `public=true`. It ranks by keyword and its `filters`
     hold no capability key, so a capability-worded query can rank the wrong output type first.
   - The user's own trained models: omit `public` on `search` (it has no private flag); pass
     `include_private_models: true` on `recommend`.
   - Re-discover ids each time: availability differs per team.
2. `model_schema_get` on the pick: exact field names, types, required flags, defaults, and caps.
   - Overrunning a cap such as the prompt's `max_length` is a 400, never a trim.
   - File fields take asset ids, even when named `...Url`.
   - `cost_impact: true` flags the fields that move the price.
3. If the schema carries `runs_as` (`"lora"` or `"composition"`), never send that model's id to
   `model_run`. Its `run_with.required_arguments` holds the real call: `model_id` there is the base
   model, and its `parameters` (the `loras` or `modelId` wiring) merge with your inputs from the
   same schema. `required_arguments` alone discards your prompt.
4. Optional: `prompt_spark` rewrites a thin prompt into an on-model one. Pass the discovered id (a
   LoRA's own, not its base) and the draft `prompt`. Skip deliberate prompts.
5. `model_run` with `model_id` and schema-conformant `parameters`.
   - Unless the user says cost does not matter, price first with `dry_run: true`, top level beside
     `model_id`. No job is created; `creativeUnitsCost` prices this exact payload.
   - A `recommend` quote assumes defaults; `cost_impact` fields move the real number.
   - Run: inline assets (`status: success`) need no wait; otherwise pass `job_id` to `jobs_wait`.
   - Unfinished status: `in_progress` after a timed-out wait; with `wait=false`, `queued`,
     `in-progress`, or `warming-up`. All need `jobs_wait`.
   - A 429: stop launching and find its class under Errors and recovery before the next call.
     Re-sending the same payload at once never clears it.
6. `jobs_wait` with `job_ids=[...]` (up to 32).
   - Each completed row carries `assetIds` and `cuCost`: no `job_get` follow-up.
   - On timeout (`in_progress`), re-call with `pending_job_ids` as `job_ids`; never re-run or
     cancel. No timeout argument exists.
   - Failed jobs are reimbursed, except xAI generations stopped by moderation.
7. `asset_display` shows the asset inline. Its `format` picks the rendering:
   - `display` (default): inline image, links, viewer data; does not disable the host widget.
   - `viewer`: lighter payload for hosts rendering the interactive widget.
   - `json`, `markdown`: metadata and links.
8. `asset_download` returns a file URL, one call per asset; save it with `curl -L` (it may
   redirect).
   - `format` converts images (`png`, `webp`, `jpg`; `gif` keeps an animated GIF animated, while the
     `png` default flattens it to one frame) and meshes (`glb`, `fbx`, `obj`). Omit it for video and
     audio, or it fails with 400 `Invalid target format`.
   - `curl` failing with `host_not_allowed` or `CONNECT tunnel failed, response 403` while MCP calls
     work points at the host's egress policy. A CDN 403 alone does not: fetch a fresh URL first.
   - [Sandbox network access](https://mcp.scenario.com/docs/troubleshooting#sandbox-network-access)
     names the setting. On some hosts it is an organization allowlist the user may not control.
   - Meanwhile hand over `asset_display`'s `app_url`. The user downloads there and, for a mesh,
     picks an export format `asset_download` does not offer.
   - The signed URL expires: a last resort, never the deliverable.

Local inputs go up with `upload_asset`:

- Always `file_name`, `content_type`, and `kind` (`image`, `audio`, `video`, `3d`), plus exactly one
  of `file_size` or `data`. Without either it fails with
  `Either 'file_size' … or 'data' is required`.
- Prefer `file_size` (exact bytes on disk) and omit `data`; the reply carries presigned part URLs
  and `instructions`.
- PUT each part's raw bytes to its URL with no added headers: a checksum header makes the store
  answer 403. Check every PUT returned 200, then `upload_asset_complete` with the `upload_id`.
- Inline base64 `data` only under 100KB, and only when no shell can PUT parts. It returns the asset
  directly, with no complete step; a larger file is rejected, naming the cap.
- Both calls take scope and nothing else: no parts list, no etags.
- Inline `data` is decoded inside `upload_asset`: a decode error there (`libpng read error`,
  `Corrupt JPEG data`, `unable to read pixels`) means the base64 string broke, not the file.
  - The agent retypes every `data` character; a 57K-character string broke.
  - Re-sending it repeats the error. With a shell, switch to the `file_size` path, even when the
    user asked for inline, and say why.
- On the `file_size` path the server decodes at completion: `Upload upl_… failed:` with
  `Corrupt JPEG data`, `premature end of data segment`, `bad Huffman code`, or `libpng read error`
  means it could not.
  - Check for a corrupt source, a truncated or re-encoded body, a missing part, or a wrong
    `file_size`.
  - Confirm the local file opens under its declared content type, then start over with a fresh
    `upload_asset` and raw PUTs. Never re-complete the same `upload_id`.
- A phone's HEIC photo uploads as is (`content_type: "image/heic"`): do not convert it.
  `Unhandled image format` lists what `kind: "image"` accepts; convert any other type locally.
- Without a shell, the user uploads at app.scenario.com; continue from the asset id.

Filing is part of delivering, not a tidy-up:

- `collection_create` takes a name and the scope pair only. `asset_ids` sent there is silently
  ignored, so adding is always a second call: `collection_add_assets`.
- It accepts any number of ids, batches by 49, and skips duplicates. Results separate
  `already_present_asset_ids` from `added_asset_ids`.
- After a failure, resend the whole list.
- Confirm from that reply: `search` `filters={"collection_ids": [...]}` lags on a fresh write.
- `asset_add_tags` is additive, one `asset_id` per call. A tag the asset already carries returns 400
  `Duplicated tag`: read `tags` via `assets_get_bulk` first and send only the missing ones.

Reusable templates and reference content follow the
[shared asset lifecycle](references/shared-assets.md): resolve existing assets, stage new versions,
publish only through a supported operation, and verify public access before recording public ids.
Uploading and filing alone are not publication.

## Errors and recovery

- **`context_missing`**: nothing resolved. `teams_list`, `projects_list` if necessary.
- **`context_ambiguous`**: scope omitted. Write-class tools (`search`, `model_run`, uploads) never
  fill it. Unattended, use the task's pair, else stop and list.
  - The reply names one pair ("Resolved for you"): confirm, retry with both ids; no lookup.
  - It lists several: the user picks.
- **403 Forbidden**: usually wrong scope, not missing; re-check the id pair. A private asset input
  reads only from its own project:
  - ask which project holds it (unattended: the task names it, else stop);
  - run catalog `asset_copy` (write lane) with that project as `project_id`, plus `asset_id` and
    `target_project_id`;
  - use the returned id. `asset_copy` copies only between projects of one team.
- **403 naming a plan**: never retry; relay its upgrade step; switch models or tools only if the
  user (unattended: the task) agrees. `recommend` flags these `requires_plan_upgrade` (never run
  one) unless its response says gating is `_degraded`.
- **429 with `details.actionName` = `parallel-custom-jobs`**: the per-team generation concurrency
  ceiling. Keep at most `actionLimit` jobs in flight: launch with `wait=false`, and retire jobs with
  `jobs_wait` before launching more. An immediate retry repeats the error.
- **429 `custom-generation`, or naming a quota, plan limit, balance, or seat limit**:
  - `actionLimit` is the period's CU allowance (Free: 50 a day), `actionValue` what is already
    consumed. A run priced above the gap is refused, so a low `actionValue` means this payload costs
    too much, not that credits ran out.
  - Stop the batch, `dry_run` the payload, offer a cheaper member or fewer outputs, or report the
    reset or upgrade (unattended: report and stop).
  - A per-user cap goes to the team admin; a seat-cap error can also block uploads. Never change
    billing or membership yourself.
- **429 `Too Many Requests. Please, wait N seconds` (`remainingSeconds`)**: Relax mode: the plan's
  CU are spent, so every job brings a wait.
  - The wait scales with the payload's cost: a heavy job (high effort tier, long video) can stay
    locked while a cheaper one runs. Never re-submit the same payload inside `remainingSeconds`.
  - Any team member's job restarts the team's wait, and waits lengthen as the team keeps generating,
    so a batch slows down. A refused attempt is free.
  - Only this refusal reveals Relax mode. If no tool documents the wait, call it unknown.
  - Stop the batch. Offer a CU top-up (it ends Relax mode at once) or an upgrade; else a cheaper
    payload (`dry_run` it first), fewer outputs, or a later run (unattended: report and stop, never
    relaunch).
  - Rules and plan caps:
    [Relax Mode](https://help.scenario.com/articles/2332232342-relax-mode-keep-generating-after-your-compute-units-run-out).
- **Other 429, including an unfamiliar `actionName`**: never infer its behavior from the name.
  Report it and run `diagnostics_run` in the same scope before choosing a recovery.
- **Transport error on `model_run` (no HTTP status)**: the request may still have landed. Run
  `jobs_list` before any re-run, or a lost response becomes a double charge. A `dry_run` retries
  safely.
- **400 `Cannot cancel this type of job`**: `job_cancel` rejects most generation jobs, so plan
  batches with no abort path.
- **404 on `asset_get`**: a guessed or mistyped id; no retry fixes it. Re-read `assetIds` off the
  `jobs_wait` or `job_get` row.
- **400 `At least one of query, filter, image, or images must be provided`**: `search` never lists
  bare. A newest-first asset listing is `target="assets"`, `filter="createdAt EXISTS"`,
  `sort_by=["createdAt:desc"]`.
- **`recommend` client-side timeout**: it commonly runs 30 seconds to over a minute. Wait or re-call
  it; never fall back to `search` for a capability.
- **`recommend`: `Provide a prompt describing the task…`**: re-send the need as `prompt`, not
  `query` or another key (silently dropped), plus `capability` when known.

## Common mistakes

- Pricing a later step with a placeholder id (`asset_placeholder`): file ids resolve before pricing,
  so the `dry_run` returns 404 and quotes nothing. Quote it from `recommend`, then `dry_run` once
  the real asset exists.
- A bare value where the schema says `array: true`: silently dropped, so the run ignores your
  reference or LoRA. `asset_get` on the output echoes what the run consumed
  (`metadata.referenceImages`, `parentId`): the cheapest proof.
- Taking `recommend`'s `ranked[0]` blindly. Read `next_step.type` first:
  - `no_match`: stop generation, even with ranked partial options. Explain `unmet_requirements` and
    `suggested_action`; never silently relax requirements. Schema checks or a successful dry run do
    not override `no_match`.
  - `ask_user`: present the options; the user's pick wins (unattended: the task, else `proceed`).
  - `proceed`: prefer `specialty.model_id`, else the first `ranked` entry not marked deprecated in
    its `caveats`, `tradeoff`, or `explanation`. The ranking measures performance, not lifecycle.
- Debugging blind: the `diagnose` MCP prompt returns trace ids, as does `diagnostics_run` with the
  failing call's scope pair and any `mcpt_` ids seen as `observed_trace_ids`.
- Guessing a file field's name: 400 `Input image is required` (or `referenceImages`, `startImage`,
  `frontImage`, `video`: each model names its own) means the payload lacks the schema's `required`
  field. Copy its name verbatim. A URL there reads as missing.
- Feeding an image field a video, audio, or 3D asset: 400 `Unhandled image format` lists the
  accepted types. `asset_get` reports the asset's `mimeType`; pull a still with the clip's
  `firstFrame` when the model wants an image.
- `filters.kind` on `search` with `target="models"`: a 400 `"kind" is not a filterable field`, since
  `kind` describes assets. Narrow models by `filters.type` (architecture) or `tags`, or `recommend`
  a capability.
- Filtering `models_list` by `type` without `privacy: "public"`: a 400 says so. A private listing
  narrows by `status` or `modality`, or goes through `search` (private by default).
