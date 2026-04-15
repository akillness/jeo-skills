# Context: opencontext modernization

## Workflow Context
This run started with a broad repo scan across the required hourly domains:
- **CLI and developer workflow** — strongest bounded gap: `opencontext` still reads like an install/command catalog even though the repo now prefers decision-first utility anchors with support files.
- **Web development (frontend/backend/fullstack)** — adjacent skills are already sharper (`file-organization`, `api-design`, `workflow-automation`, `deployment-automation`), so there was no clearer bounded win than the memory layer they depend on.
- **Product / PM / UX / operations** — planning/reporting skills are healthier after recent modernization passes; the bigger reusable gap is storing decisions and handoff context between those workflows.
- **Marketing / GTM / content / automation** — the lane has a canonical router already, but durable campaign/positioning memory still benefits from a clearer OpenContext boundary.
- **Game development** — game-specific skills exist, but their long-lived build notes, playtest conclusions, and launch-operation handoffs also benefit from a stronger memory/citation layer.

The local graph snapshot before this run showed 89 skills, 73 with `references/`, and 72 with `evals/`, leaving `opencontext` as one of the remaining high-utility support gaps. The existing skill also produced validator warnings for missing `## Instructions`, `## Examples`, and `## Best practices` sections.

Upstream evidence reinforces the same opportunity:
- OpenContext describes itself as "Give your AI assistant a persistent memory" and says it "reuses your existing CLI (Codex/Claude/OpenCode) and adds a GUI + built-in Skills/tools" — useful, but the current repo skill does not clearly translate that into a choice-oriented workflow for operators. Source: GitHub raw primary-source retrieval from `https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md`.
- Karpathy's LLM Wiki pattern argues against rediscovering knowledge from scratch and instead recommends a "persistent, compounding artifact" that sits between raw sources and answers. Source: GitHub raw primary-source retrieval from `https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw`.
- Graphify positions itself as a persistent knowledge graph with `GRAPH_REPORT.md`, `graph.json`, and structure discovery rather than a project-memory notebook. Source: GitHub raw primary-source retrieval from `https://raw.githubusercontent.com/safishamsi/graphify/main/README.md`.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo builder using CLI agents | Keep repo context, decisions, and lessons from disappearing between sessions | Intermediate |
| Multi-agent operator | Hand off background and conclusions between Claude / Codex / Gemini style workflows | Advanced |
| Tech lead / PM hybrid | Preserve acceptance criteria, decision logs, and implementation context for future work | Intermediate |
| Game or product team maintainer | Keep playtest/build/release notes searchable without rebuilding context every hour | Intermediate |

## Current Workarounds
1. Keep re-explaining repo background in every new session.
   - Limitation: high repetition, inconsistent framing, and lost conclusions.
2. Dump notes into ad hoc markdown files or chat logs.
   - Limitation: weak search, weak citations, and no clear agent-facing retrieval ritual.
3. Use a wiki or vault for everything.
   - Limitation: good for narrative accumulation, weaker for lightweight per-project context load/search/store loops.
4. Use graph-style mapping tools for memory.
   - Limitation: great for structure and relationship tracing, but not the primary place for durable human-readable decision logs.

## Adjacent Problems
- Agents activate the wrong memory tool when the boundary between OpenContext, wiki, graph, and human-authored vaults is blurry.
- Skills without support files are harder to ratchet safely and easier to regress into keyword-heavy summaries.
- Discovery surfaces hide the route-outs, so users may choose `opencontext` when they really need `llm-wiki` or `graphify`, or vice versa.

## User Voices
- "Give your AI assistant a persistent memory." — OpenContext README, GitHub raw primary-source retrieval (`https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md`).
- "OpenContext reuses your existing CLI (Codex/Claude/OpenCode) and adds a GUI + built-in Skills/tools — no extra agent subscription." — OpenContext README, GitHub raw primary-source retrieval (`https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md`).
- "The wiki is a persistent, compounding artifact." — Karpathy LLM Wiki gist, GitHub raw primary-source retrieval (`https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw`).
- "graphify ... builds a knowledge graph" and returns `GRAPH_REPORT.md` / `graph.json`, which signals a structural-memory role rather than a lightweight decision-log role. — Graphify README, GitHub raw primary-source retrieval (`https://raw.githubusercontent.com/safishamsi/graphify/main/README.md`).
