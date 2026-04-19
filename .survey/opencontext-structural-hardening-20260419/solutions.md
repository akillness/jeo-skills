# Solution Landscape: opencontext structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OpenContext | Active repo/project memory with folders, docs, manifests, stable links, search, and MCP-aware surfaces | Repo-first, human-readable, explicit handoff primitives, good fit for load→search→store loops | Younger ecosystem; depends on disciplined doc/folder hygiene | Strongest direct fit for `opencontext` |
| Mem0 | Generic long-term agent memory engine | Strong retrieval/entity memory across users/agents | Not repo-first; weaker on manifests/stable links and human-readable handoff packets | Adjacent, not a direct replacement |
| Letta | Stateful agent platform with memory blocks / archival memory | Runtime-integrated memory model | More platform/runtime than repo-memory layer | Better comparator for agent memory runtime |
| Graphiti | Temporal graph memory | Strong structural and relationship memory with provenance | More graph/modeling overhead; weaker on simple handoff packets | Route structural memory here, not to `opencontext` |
| Repomix | Repo-to-context packer | Fast bootstrap, prompt-friendly snapshot of a codebase | Snapshot only; weak on post-task storage and evolving decisions | Route one-shot repo packing here |
| Gitingest | Repo ingest / digest | Low-friction repo summary for model context | Ingest-only; not durable project memory | Same route-out pattern as Repomix |
| Code2Prompt | Codebase-to-prompt conversion | Filtered prompt generation for LLM use | One-shot prompt artifact, not searchable memory | Useful fallback, not the main memory layer |
| Dendron / Wiki.js / Outline | Narrative wiki / knowledge base | Better for long-lived synthesized docs and human browsing | Not optimized for active agent handoff loops | `llm-wiki`-style adjacent lane |
| Obsidian / Logseq / Notion | Human-authored vault / workspace memory | Flexible, durable, familiar for notes and docs | Weak default agent contract; repo-context handoff is manual unless extended | Human-first note layer, not repo-memory router |

## Categories
- **Active project/repo memory:** OpenContext, Mem0, Letta, Graphiti
- **Repo context loading / prompt packing:** Repomix, Gitingest, Code2Prompt
- **Wiki / narrative KB:** Dendron, Wiki.js, Outline
- **Human-authored vault / PKM:** Obsidian, Logseq, Notion
- **Graph / structural memory:** Graphiti

## What People Actually Use
In practice people still rely on repo memory files (`CLAUDE.md`, `.clinerules`), markdown handoff docs, Notion/Obsidian workspaces, and repo packers like Code2Prompt/Gitingest. The real-world pattern is a stitched stack: static rules + ad hoc summaries + external docs + occasional repo digests. That makes `opencontext` most useful when it clearly owns the active project-memory / handoff-packet layer instead of pretending to replace wiki, graph, or note-vault systems.

Sources:
- HN item 43922759 / comments — https://hn.algolia.com/api/v1/items/43922759
- `claude-code-toolkit` handoff workflow — https://github.com/robertguss/claude-code-toolkit/tree/main/skills/handoff
- Agentic Copilot for Obsidian — https://github.com/spencermarx/obsidian-ai
- Code2Prompt — https://github.com/mufeedvh/code2prompt
- Gitingest — https://github.com/coderamp-labs/gitingest
- Notion agency workflow writeup — https://dev.to/johnfawole/how-i-built-an-ai-powered-content-workflow-for-my-agency-using-notion-mcp-23e
- Notion for indie game devs — https://www.landmarklabs.co/blog/notion-for-indie-game-developers-ultimate-guide-2024

## Frequency Ranking
1. OpenContext — strongest direct fit because it combines search, manifests, stable links, and repo-aware handoff primitives.
2. Mem0 / Letta — strong memory-adjacent options, but much more generic-agent-memory than repo-memory routing.
3. Repomix / Gitingest / Code2Prompt — common practical drop-backs for context loading, but snapshot-oriented.
4. Obsidian / Notion / Logseq / Dendron / Wiki.js / Outline — strong human-authored memory layers, but not the active repo-memory contract.
5. Graphiti — strongest graph-memory adjacent tool, but it belongs in structural-memory routing, not project-memory routing.

## Key Gaps
- Very few tools own **manifest + stable-link + handoff-packet** workflows explicitly.
- Many solutions are either too generic (agent memory), too human-first (wiki/vault), or too one-shot (repo packers).
- Real workflows still need a bounded rule for **when to update existing project memory vs create a new note**.
- The market still lacks a small, deterministic **“read these 3–10 docs first”** contract that survives across agent platforms.

## Contradictions
- Marketed claim: memory tools eliminate repeated context loading.  
  User reality: teams still keep repo rules, manual summaries, and external docs because memory fidelity and precedence remain messy.
- Marketed claim: one memory layer can own everything.  
  User reality: active project memory, wiki synthesis, structural mapping, and human notes keep separating in practice.

## Key Insight
`opencontext` is most defensible when it stays narrow: the active project/repo memory router that decides which small packet the next agent should load, how to search for prior decisions, and what conclusion to store after meaningful work. The bounded win is not another memory wrapper; it is a clearer packet-first front door plus honest route-outs to `llm-wiki`, `graphify`, vault tools, and repo packers.
