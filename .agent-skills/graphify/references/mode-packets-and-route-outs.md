# Mode Packets and Route-outs

Start from the graph packet the user already has. Do not force every request through a full Graphify feature tour.

## `repo-structure-packet`
Use when the user wants architecture discovery or a durable repo map before editing.

Capture:
- target repo/subtree
- whether the user needs a full graph build or just a summary artifact
- whether the repo is large/noisy enough to require a smaller scope or `.graphifyignore`

Good outcomes:
- one chosen scope
- one primary mode (`assistant-native-install` or `local-python-build`)
- one explicit artifact contract (`GRAPH_REPORT.md`, `graph.json`, `graph.html`)

Route out when:
- the real work is finding files, symbols, or references quickly → `codebase-search`

## `relationship-trace-packet`
Use when a graph already exists or the only real question is a path/query/explain follow-up.

Capture:
- whether `graphify-out/` already exists
- the exact concept pair or relationship question
- whether rebuild is necessary or a focused query is enough

Good outcomes:
- `graph-query-followup`
- read `GRAPH_REPORT.md` first
- one focused `query`, `path`, or `explain` step instead of a blind rebuild

Route out when:
- the user only needs symbol/text ownership, not graph semantics → `codebase-search`

## `mixed-corpus-memory-packet`
Use when code, docs, PDFs, screenshots, notes, or raw sources should become one durable structure layer.

Capture:
- corpus types present
- whether the user wants structural graph outputs, wiki pages, or both
- whether the corpus is likely to be markdown-heavy or light on code semantics

Good outcomes:
- `local-python-build` if native Graphify is appropriate
- `structural-fallback` if native extraction is weak or misleading
- explicit route-out to `llm-wiki` when the user really wants narrative knowledge pages

Route out when:
- the main goal is persistent markdown filing, source summaries, query pages, or schema-driven note maintenance → `llm-wiki`

## `assistant-install-packet`
Use when the user wants Graphify available inside Claude, Codex, Gemini, OpenCode, or another supported assistant.

Capture:
- target assistant/runtime
- whether Graphify needs to be always-on or just used once locally
- whether Python/runtime prerequisites are already satisfied

Good outcomes:
- `assistant-native-install`
- one assistant-specific install path
- one verification step so the user knows the install actually worked

Route out when:
- the user really needs project-memory or handoff surfaces rather than a graph install → `opencontext`

## `refresh-or-fallback-packet`
Use when a graph already exists but is stale, empty, misleading, or too expensive to rebuild naively.

Capture:
- what artifacts already exist
- what changed since the last build
- whether the failure is runtime/install related, corpus-shape related, or size/noise related

Good outcomes:
- `incremental-refresh` for changed scope
- `structural-fallback` for 0-node / markdown-heavy / weak native results
- clear note when artifacts are machine-specific or path-leaky

Route out when:
- the next job is session memory / manifests / stable-link handoff rather than graph repair → `opencontext`

## Quick route-out table
| If the real question is... | Route to |
|---|---|
| Where is this symbol/file/config and who references it? | `codebase-search` |
| Build/query a durable repo or corpus graph | `graphify` |
| Turn sources into an interlinked markdown knowledge base | `llm-wiki` |
| Store project decisions, manifests, or stable links for cross-agent handoff | `opencontext` |
| Research tools/platforms before choosing a graph approach | `survey` |

## Rule of thumb
A good graph packet is the smallest artifact set that lets you choose one truthful graph mode. If the packet still cannot support that choice, ask for one missing artifact or route to the neighboring skill that owns the next step.
