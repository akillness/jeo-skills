# Solution Landscape: opencontext modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OpenContext | Project/repo context store with CLI, GUI, search, manifests, and stable links | Lightweight load → search → store loop, multi-agent handoff, works with existing coding agents | Easy to present as a command dump if the skill does not teach selection, document shape, and route-outs | Best fit for searchable project memory and handoff notes |
| llm-wiki | Persistent markdown wiki maintained by the agent | Strong narrative synthesis, cross-links, queries, health checks, compounding knowledge base | Heavier structure and upkeep than a quick project-memory loop | Best fit for deeper topic/company/research wikis |
| graphify | Persistent structure graph over code or mixed corpora | Strong architecture discovery, relationship tracing, graph artifacts (`GRAPH_REPORT.md`, `graph.json`) | Not the primary home for human-readable project decisions or acceptance logs | Best fit for structural memory and graph-backed repo understanding |
| Obsidian / vault workflow | Human-readable markdown vault and note-taking surface | Excellent human browsing/editing, flexible folders, ecosystem familiarity | Agent workflow depends on conventions; weaker agent-native retrieval unless paired with another layer | Best fit for human-authored notes and personal knowledge organization |

## Categories
- **Project-memory / handoff store**: OpenContext
- **Narrative knowledge base / wiki**: llm-wiki
- **Structural graph memory**: graphify
- **Human-authored note vault**: Obsidian-style workflows

## What People Actually Use
In practice, teams mix layers:
- lightweight project memory for current repo/background/loading,
- a wiki or note vault for richer ongoing knowledge,
- graph or search tools for structural exploration,
- ad hoc markdown/chat logs when the primary memory layer is weak or unclear.

That means the `opencontext` skill works best when it teaches **when to choose it and when to route away**, not when it pretends to replace every memory surface.

## Frequency Ranking
1. **OpenContext as the direct target** — highest-value repo gap because the repo already ships the skill but not the modern decision/support scaffold.
2. **llm-wiki as the nearest adjacent memory layer** — most important route-out because both deal with persistence, but at different depth and structure.
3. **graphify as the structural-memory layer** — important adjacent route-out because repo operators increasingly use graph outputs for architecture understanding.
4. **Obsidian/vault workflows** — supporting human-authored surface rather than the default agent-memory path.

## Key Gaps
- No support files explaining memory-layer choice.
- No evals to verify trigger precision, route-outs, or durable workflow quality.
- Current discovery copy underplays project-memory / cross-agent handoff and overplays generic persistence.
- The skill does not clearly distinguish load/search/store routines from wiki building or graph building.

## Contradictions
- Marketed reality: upstream OpenContext says it gives agents persistent memory and reuses existing CLIs.
- Current repo reality: the local skill mostly lists commands, which makes the agent/operator boundary look like installation trivia instead of a repeatable work pattern.

## Key Insight
The right move is not to add another memory skill. It is to modernize `opencontext` into the **project/repo memory and cross-agent handoff anchor**, then route long-lived synthesized knowledge to `llm-wiki`, human-authored note-taking to Obsidian-style workflows, and structure discovery to `graphify`.
