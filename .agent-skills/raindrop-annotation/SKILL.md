---
name: raindrop-annotation
description: Use when repeating Raindrop bookmark annotation, tagging, source-note cleanup, or bookmark-to-vault ingestion workflows.
compatibility: opencode
---

# Raindrop Annotation Workflow

Reusable workflow for turning saved Raindrop links into source-backed notes and tagged bookmarks without losing provenance or creating duplicates.

## When to Use

- "Annotate these Raindrop bookmarks"
- "Summarize and tag these saved links"
- "Move these bookmarks into the annotated collection"
- "Repeat the last Raindrop cleanup process"

## Required Skills

Use with:

1. `raindrop-cli` for bookmark reads and updates (refer to [[raindrop-cli]] skill for more detail)
2. `crawl4ai` for source extraction when available
3. `obsidian-cli` or `obsidian-markdown` for vault note updates when writing back to the vault

## Core Pattern

1. Define scope first: collection, tag, search query, or date window.
2. Build a manifest of candidate bookmarks with `_id`, `title`, `url`, `collection`, `tags`, and `created`.
3. Check for duplicates before writing anything.
4. Fetch the source URL and write a short summary to the bookmark.
5. Add vault-standard tags and move the bookmark to the annotated collection (these should include at least one `area/*` and `topic/*` tags).
6. Preserve provenance: URL and Raindrop ID always stay visible.
7. Verify the final set.

## Guardrails

- Never rely on memory for the item list.
- Never skip dedupe because the batch is small.
- Never write notes without the source URL and Raindrop ID.
- Never overwrite uncertain extraction without keeping a raw capture.
- Never mix routing rules across runs.
- **Always use `area/*` and `topic/*` lowercase tags.**
- **Always move annotated bookmarks to the `Annotated` collection (43456934).**
- **Tag format**: `area/*` maps to `02_Areas/` folders (e.g., `02_Areas/0201_AI.md` → `area/ai`, `02_Areas/0230_SoftwareDev.md` → `area/softwaredev`).
- **Topic format**: single-word lowercase summary (e.g., `llm`, `bitnet`, `vllm`, `rocm`).
- **Fix existing**: When encountering bookmarks with wrong tags (e.g., `AI`, `LLM`, `type/source`), re-annotate with correct `area/*` and `topic/*` tags.

## Vault Standard

- Tags **must** follow the format `area/*` and `topic/*` (all lowercase).
- `area/*` maps to the vault's `02_Areas/` folders (e.g., `02_Areas/0201_AI.md` → `area/ai`).
- `topic/*` is a concise one-word topic descriptor (e.g., `topic/llm`, `topic/fastcontext`).
- Every annotated bookmark must have **at least one `area/*` and one `topic/*` tag**.
- Existing non-standard tags (e.g., `type/source`, `source/raindrop`, `status/annotated`) should be replaced or supplemented with the standard tags.

## Quick Reference

| Step | Output |
|---|---|
| Scope | One selectable source set (collection, tag, search, or date) |
| Manifest | Stable list of bookmarks with `_id`, `title`, `url`, `tags`, `collection` |
| Dedupe | Existing vault notes checked via QMD + Obsidian search |
| Extract | `crawl4ai` fetch + summary (or fallback to excerpt) |
| Tag & Move | Apply `area/*` + `topic/*`, move to `Annotated` collection (ID: 43456934) |
| Verify | `raindrop list --tag="source/raindrop" --json` filter unannotated |

## Tag Format Reference

| Vault Area | Tag Format | Example |
|---|---|---|
| 0201_AI | area/ai | area/ai |
| 0230_SoftwareDev | area/softwaredev | area/softwaredev |
| 0229_CyberSec | area/cybersec | area/cybersec |
| 0215_Language | area/language | area/language |
| 0212_GameDev | area/gamedev | area/gamedev |
| 0216_Learning | area/learning | area/learning |
| 0204_Chores | area/chores | area/chores |
| 0218_Lifestyle | area/lifestyle | area/lifestyle |
| 0232_Travelling | area/travelling | area/travelling |

## CLI Commands Reference

```bash
# List unannotated bookmarks
raindrop list unsorted --json

# Update with proper tags and move to Annotated collection
raindrop update <id> -T "area/ai,topic/llm,topic/fastcontext" -n "Summary here" -c 43456934

# Verify remaining unannotated
raindrop list --tag="source/raindrop" --json | jq '.[] | select(.tags | index("status/annotated") | not)'
```ng note matches or reuse |
| Extract | Short source summary |
| Tag | Vault-standard tags applied |
| Move | Bookmark in annotated collection |
| Verify | Final list checked |

## Common Mistakes

- Skipping the manifest and losing track of items.
- Inferring structure from title alone.
- Forgetting to move the bookmark after annotating it.
- Tagging inconsistently across batches.

## Completion Check

- [ ] Scope captured
- [ ] Manifest built
- [ ] Duplicate check done
- [ ] Summary written
- [ ] Tags applied
- [ ] Bookmark moved
- [ ] Provenance preserved
- [ ] Results verified
