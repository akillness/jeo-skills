# scenario-delete-restore: build notes

Maintainer notes, not runtime instructions. SKILL.md does not link this file.

## Why a skill of its own

- No skill mentions deleting or restoring assets, models, or collections.
- MCP server 0.40.0 (2026-11-13) added `asset_restore`, `model_restore`, `assets_list`
  `deleted: true`, and `models_list` `filters.status: "deleted"`.
- The `scenario` body sits at the 2500-word cap, and `scenario-team-admin` is an admin skill whose
  description is near its 500-character limit. Neither triggers on "bring back what I deleted". A
  dedicated description does.

## Where each fact comes from

- Tool pages at mcp.scenario.com/docs/tools: `asset-restore`, `model-restore`, `assets-list`,
  `asset-delete`, `model-delete`, `collection-delete`, and the live `scenario_tools_search` schemas.
  - The plan list (Max, Team, legacy Premium, Enterprise) and the `skipped` reasons are quoted from
    `asset_restore`.
  - `model_restore` documents the refusals without status codes, so the skill names none.
- The two refused pairs (`filters` with `deleted: true`, `privacy: "public"` with
  `status: "deleted"`) were confirmed with read-only calls on 2026-11-15; each error names the fix.
- The 100-id cap on `asset_delete` comes from the server's own error text. The schema carries no
  `maxItems`, so re-check it if the server changes.
- `collectionIds` and `tags` on `assets_list` rows: a read-only listing on 2026-11-15.
- Live application test on 2026-11-21, with upload fixtures in a test project:
  - Tags can survive a delete, even though the tool reference says a restore drops them. Two of four
    deleted assets kept their tags in the bin, and one came back from `asset_restore` with both. The
    two were members of a collection deleted right after them; the mechanism is unconfirmed. So the
    skill says to read the restored rows before re-tagging, which holds either way.
    `collection_add_assets` needs no read: its tool page says it skips ids already present.
  - `assets_list` rows, deleted ones included, carry `kind` and `description` (an automatic
    caption). The `assets-list` page documents neither as a row field; `kind` appears in the tool
    reference as an `upload_asset` parameter and a `search` filter.
  - A deleted upload's row has no `prompt` and no file name, so `description` is what matches it.
    Rows also carry `source`, which the skill leaves out: the reference does not name it, and
    `description` already identifies an upload.
  - `collections_list` returns member counts (`assetCount`, `modelCount`), not ids. `models_list`
    rows carry `collectionIds` like asset rows, so model members are recorded the same way.
  - A deleted asset's full record is unreadable: `asset_get` returns 404 and `assets_get_bulk`
    returns nothing. The cut `prompt` on its `assets_list` row is all there is, so a cut prompt that
    shows no match counts as ambiguous rather than a miss.
  - Images generated through MCP `model_run` on 2026-11-21 carried an asset id in `prompt`, not
    text. The id names a live `uploaded-text` asset whose record holds the whole prompt (its
    `metadata.preview`, complete when `hasFullPreview` is true), still readable after the image is
    deleted. The skill names no field inside that record: it is undocumented.
- No restore tool exists for collections: `scenario_tools_search` for "restore undelete" returns
  only `asset_restore` and `model_restore`.
