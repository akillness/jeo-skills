# Shared asset lifecycle

Use this process for reusable templates and reference content. Uploading, tagging, and adding to a
collection make an asset available in its scope; none makes it public. Publication status and
creative validation are separate: an accessible template may still fail an alignment or
visual-quality test.

## Reuse before creating another copy

Read the owning skill's JSON manifest. Select the template version and required file role,
preserving the user's dimensions and purpose. A file entry's `asset_id`, when present, is a verified
public reference; confirm it is accessible before use.

Otherwise discover catalog `assets_list`, then call `scenario_tool_execute_read` with
`name: "assets_list"` and `parameters: {team_id, project_id, limit: 100}` in the user's chosen
scope. Follow `nextPaginationToken` via `page_token` until a match or exhaustion. Match the returned
tags locally against all three values: manifest `tag`, template `name`, and file role. Never pass
`tags` to `assets_list` in a team scope: the API accepts it only on public listings. `search` takes
`filters.tags` on team assets, but its index can trail a recent upload or tag write, so this check
lists.

If absent, `search` with `target: "assets"`, `public: true`, `query` equal to the template name, and
the chosen `team_id`/`project_id`, then check the same tags on returned assets. Search can miss an
existing upload, so do not use an empty search alone to decide that an upload failed. Use
`asset_get` for type and dimensions. For known uploads, reuse the local source and previous content
checks; publication does not require downloading or comparing the files again. Inspect unfamiliar
content with `asset_display`; for numerical masks, inspect pixels from a verified local copy or
download when none is available. A caption or thumbnail cannot verify alpha or mask polarity. On
retrieval failure, check scope and access before treating a recorded asset as absent; preserve the
receipt.

If nothing accessible matches, use the owning skill's local builder and MCP upload flow. Reuse
matching assets without uploading again. Source hashes identify the built file bytes, not a
guarantee that a downloaded platform copy uses identical encoding.

The same reuse rule applies to inputs you just prepared and uploaded. An older returned asset ID or
changed encoded file size alone establishes neither deduplication, conversion, nor corruption, and
does not justify downloading your known input again. Inspect generated outputs and investigate an
input only when there is evidence of a problem.

## Create and stage a version

1. Resolve the destination supplied by the user with `teams_list` and `projects_list`. Reuse a pair
   already chosen in this session. Never bake destination identifiers into a published skill or
   manifest.
2. Build or generate the content; inspect it and run its task-specific checks. For templates, record
   geometry, roles, version, filenames, and source hashes in a separate JSON manifest. A changed
   geometry or reference contract gets a new version; preserve earlier assets while skills reference
   them.
3. Upload local files with `upload_asset`: `file_name`, `content_type`, `kind`, and `file_size`,
   plus scope. PUT the bytes to the returned URLs verbatim, then `upload_asset_complete` with
   `upload_id` and scope. An `upload_id` in a receipt does not prove every part was transferred:
   complete only after every PUT succeeded, including when resuming. Assets already returned by
   generation need no upload.
4. Discover the catalog tools before executing them with `{name, parameters}`. Set descriptive names
   with `asset_update` (`asset_id`, `metadata: {name, description}`, scope); add the skill tag,
   template name, and role with `asset_add_tags` (`asset_id`, `tags: [...]`, scope). Reuse a
   matching collection from `collections_list`, following its pagination, or create one with
   `collection_create` (`name` and scope only); add missing members separately with
   `collection_add_assets` (`collection_id`, `asset_ids`, scope).
5. Read `assets_get_bulk` and verify tags, dimensions, and `collectionIds`. Keep a local publication
   receipt with the actual asset IDs, destination, collection, validation outcome, and next action.
   Save it before attempting publication so a retry resumes from existing assets. Do not copy
   private records or signed URLs into the public repository.

## Publish, Scenarians only for the shared skill-reference catalog

Publishing shared skill references requires staff access and an explicit publication request. Reuse
authorization already given; do not ask again. Ordinary private content creation and consumption of
existing public references do not require this staff workflow.

Discover a supported asset-publication operation through `scenario_tools_search` and read its
schema. At authoring time no such MCP operation exists: `asset_update` exposes name, description,
and tags, not visibility. Do not invent a `public` or `privacy` parameter, use `workflow_publish`
for an asset, or substitute an undocumented API or browser flow.

When publication is unavailable, complete staging and record `pending_publication` in the local
receipt. Report the exact missing capability and the ready collection. Leave public `asset_id`
fields absent from the shipped manifest; tag-based reuse and local building still work. This is a
capability gap, not a request for the user to approve staging again.

When a supported operation becomes available, publish the already-staged IDs through that operation.
If the user has already published them, proceed directly to verification. Confirm public visibility
and `asset_get` access using a user-authorized scope outside the owning team; no batch download is
needed. A scope merely appearing in `teams_list` is not authorization to use it for this check.
Failed retrieval leaves verification incomplete. For model-input templates, use the published IDs
directly in the next agreed validation run; do not add generations solely to recheck publication.
Successful reference use verifies that path, while creative quality is graded separately.

Only after public access is verified, add each `asset_id` to its file entry in the owning skill's
JSON manifest. Identical files can share an ID. Keep asset records in JSON and usage instructions in
Markdown. Report publication and validation separately, with the manifest path, verification
outcome, and any remaining gap. Never call an uploaded private collection published.
