---
name: scenario-delete-restore
description: "Use when deleting Scenario assets, models, or collections through MCP, or undoing a deletion: restoring images, videos, or LoRAs deleted by mistake, finding something a user says they deleted, listing what was deleted recently, or cleaning up a project before a bulk delete. Keywords: delete, undelete, restore, recover, undo, trash, bin, recently deleted, 30 days, deleted model, deleted asset, cleanup."
license: MIT
---

# Scenario Delete and Restore

## Overview

A deleted asset or model stays recoverable for 30 days, on the Max plan and above (Max, Team, legacy
Premium, Enterprise). Below Max, the server refuses to list or restore deleted items, so a delete is
final from the agent's side.

- A restore brings the item back, not reliably its filing: tags and collection membership are
  documented as lost, yet some tags survive. Read the restored rows before re-tagging.
- Collections have no restore tool. A deleted collection is rebuilt by hand or not at all.
- Recovery is per project: the deleted listings cover the project in scope only.
- The tools below marked read, write, or delete are catalog-only. `teams_list`, `models_list`, and
  `asset_display` are direct: called as is, scope at top level, never through an executor.
  `scenario_tools_search` returns a catalog tool's schema and lane; the matching executor runs it
  with `{name, parameters}`, scope ids inside `parameters` (see the `scenario` skill).
- Deleting a whole project is irreversible and belongs to `scenario-team-admin`.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

## Quick reference

| Step                | Tool                                            | Lane   | Notes                                                    |
| ------------------- | ----------------------------------------------- | ------ | -------------------------------------------------------- |
| Find deleted assets | `assets_list` with `deleted: true`              | read   | Most recently deleted first, each with `deletedAt`       |
| Restore assets      | `asset_restore`                                 | write  | 1 to 100 `asset_ids`; returns `restored` and `skipped`   |
| Find deleted models | `models_list`, `filters: {"status": "deleted"}` | direct | Your own models only; never with `privacy: "public"`     |
| Restore a model     | `model_restore`                                 | write  | One `model_id` per call                                  |
| Delete assets       | `asset_delete`                                  | delete | Returns `deleted`; split sets past 100 ids               |
| Delete a model      | `model_delete`                                  | delete | One `model_id` per call                                  |
| Delete a collection | `collection_delete`                             | delete | No restore tool exists                                   |
| Re-file             | `asset_add_tags`, `collection_add_assets`       | write  | `model_add_tags`, `collection_add_models` for a model    |
| Check the plan      | `teams_list`                                    | direct | The team row's `plan` decides whether a delete is undone |

## Restoring

- **Find.** `assets_list` with `deleted: true` takes no `filters`: the server refuses the pair.
  Match the user's words client-side against `deletedAt`, `kind`, `prompt`, `description`, and
  `modelId`, paging with `page_token` (`limit` up to 100). The list is newest deletion first, so
  stop paging once `deletedAt` is older than the user's window. `prompt` comes in three forms:
  - An asset id (`asset_...`): the prompt is a live text asset. Read it on `assets_get_bulk`, whose
    record carries the full prompt text, and match that.
  - Text, cut at 120 characters. A deleted asset's own record is unreadable (`asset_get` returns
    404), so a row in the window whose cut text shows no match is ambiguous, not a miss.
  - Absent, on an upload, which keeps no file name either: match its `description`, an automatic
    caption.
- **Models.** `status: "deleted"` is a key inside `filters` on `models_list`. Combined with
  `privacy: "public"` the server refuses it: deleted models are always the team's own.
- **Confirm the set.** Show the candidates (id, `deletedAt`, prompt or name) when the match is not
  exact. Unattended, restore only items the task's description matches unambiguously, and list the
  rest as unresolved.
- **Read `skipped`.** Each entry carries `asset_id` and a reason:
  - `not-found`: a wrong id, or an asset of another project;
  - `not-deleted`: already live, nothing to do;
  - `expired`: past the retention window. Nothing recovers it: tell the user.
- **Models come back as they were.** `model_restore` returns the model to its prior status. An
  interrupted training returns as `training-canceled`, so it needs a new training run. The server
  refuses a model that is not deleted or was deleted over 30 days ago: report which.
- **Plan refusal.** A restore or deleted listing refused with a plan message is not retryable.
  Report that restoring needs Max or above; upgrading is the user's call (unattended: report and
  stop).
- **Re-file.** Re-apply the tags and collections the user still needs. Before re-tagging, read the
  restored rows on `assets_get_bulk` and send only the missing tags: a tag the asset kept is refused
  as a duplicate (see the `scenario` skill). `asset_add_tags` takes one asset per call.
  `collection_add_assets` takes any number of ids and skips those already present, so it needs no
  read. A collection deleted too is recreated with `collection_create` first.

## Deleting

Deletion stays a confirmed action.

1. **Read the plan** off the team's `teams_list` row. On Max and above, tell the user deleted assets
   and models stay recoverable for 30 days, possibly without their tags and collections. Below it,
   say the delete is permanent. A collection is permanent on every plan. An unfamiliar `plan` value:
   `assets_list` with `deleted: true` is a free read gated to the same plans, so a plan refusal
   there settles it.
2. **List the exact items** (ids plus a name or prompt) and get an explicit yes. A set found by tag
   comes from `search` with `filters.tags` (see `scenario-asset-analysis`), whose index can trail a
   tag change: confirm each hit's `tags` on `assets_get_bulk` before deleting it. When every match
   must go, also page `assets_list` and match `tags` locally, since a fresh tag can miss the index.
   Unattended, delete only the ids the task names, or the set its stated criterion matches exactly,
   and report every id deleted. Never widen a pattern ("old drafts") past what the task states.
3. **Record the filing** before the call: each asset row from `assets_list` or `assets_get_bulk`,
   and each model row from `models_list`, carries `tags` and `collectionIds`. Keep them in your
   reply or a local file, since a restore may not bring them back. For a collection, record its name
   and member ids. `collections_list` gives only `assetCount` and `modelCount`, so the members are
   the `assets_list` rows, and the `models_list` rows when `modelCount` is above 0, whose
   `collectionIds` hold its id. Page both with `page_token` (`limit` up to 100) until the members
   found reach those counts.
4. **Delete** through `scenario_tool_execute_delete`. `asset_delete` refuses more than 100 ids in
   one call (`You can not delete more than 100 assets at once.`): send batches of 100.

## Worked example: undo yesterday's cleanup

"Bring back the dragon renders I deleted yesterday and put them back in Key Art."

1. Scope per the `scenario` skill. The team's `teams_list` row carries `plan`: below Max, tell the
   user restoring is not on their plan and stop. Here it reads `enterprise`, so continue.
2. `scenario_tools_search` with `query="restore deleted assets"`: `asset_restore` (write) and
   `assets_list` (read), with schemas.
3. `scenario_tool_execute_read` with `name: "assets_list"`,
   `parameters: {"team_id", "project_id", "deleted": true, "limit": 100}`. Follow
   `nextPaginationToken` until `deletedAt` falls before yesterday.
4. Keep the rows whose `deletedAt` falls on yesterday, in the user's time zone, and whose `prompt`
   makes a dragon the subject. A negated or incidental mention is ambiguous, and so is a cut
   `prompt` that shows no dragon. A cut prompt that names one counts only when the row's
   `description` shows a dragon too, since the omitted text could negate it. Fourteen mention a
   dragon: thirteen clearly depict one, their `description` agreeing, and one reads "a castle
   without a dragon". Two more are cut before naming a subject. Show all sixteen with `deletedAt`
   and confirm. Unattended: keep the thirteen, and list the castle and the two cut prompts as
   unresolved, neither restored nor filed.
5. `scenario_tool_execute_write` with `name: "asset_restore"`,
   `parameters: {"team_id", "project_id", "asset_ids": [<13 ids>]}`. `restored` holds 12; `skipped`
   holds one `not-deleted`, already restored by a teammate.
6. `scenario_tool_execute_read` with `name: "collections_list"`: Key Art still exists. Then
   `scenario_tool_execute_write` with `name: "collection_add_assets"`,
   `parameters: {"team_id", "project_id", "collection_id", "asset_ids": [<all 13 ids>]}`, since it
   skips any already present.
7. `asset_display` on one restored asset to confirm. Report 12 restored, one already live, all 13
   back in Key Art, and three unresolved: the castle and the two cut prompts.

## Common mistakes

- Sending `filters` with `deleted: true`: refused. List unfiltered and match client-side.
- Re-applying every recorded tag after a restore: some survive, and a duplicate is refused. Read the
  restored rows, then send only the missing tags.
- Promising recovery below Max: the server refuses restores there, so the delete was final.
- Running `asset_restore` or `model_restore` through `scenario_tool_execute_delete`: both are
  write-lane, and the delete executor rejects them.
- Retrying a plan refusal, or an `expired` skip: neither clears.
- Deleting a collection to tidy up and expecting to undo it: no restore tool exists.
- Sending more than 100 ids to `asset_delete` or `asset_restore` in one call: split the set.
