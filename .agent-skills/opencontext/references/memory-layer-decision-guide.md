# OpenContext Memory-Layer Decision Guide

Use this when the user says some version of **"remember this project context and help future sessions pick it up quickly"**.

## Pick the right layer

### Choose `opencontext` when you need
- project or repo background loaded before work starts
- searchable decisions, lessons, and follow-up notes
- cross-session continuity for active delivery work
- cross-agent handoff between planning, coding, and testing tools
- stable links or manifests that tell the next agent what to read

### Route to `llm-wiki` when you need
- a long-lived, compounding markdown knowledge base
- narrative synthesis across many sources
- entity/concept/comparison pages
- periodic linting of contradictions, orphan pages, and stale content

### Route to `graphify` when you need
- a structural map of code or mixed files
- relationship tracing or graph queries
- `GRAPH_REPORT.md`, `graph.json`, or graph-backed architecture discovery

### Route to a human-authored vault / note system when you need
- manual note-taking as the primary workflow
- editorial control in Obsidian or a plain markdown vault
- a human-first notebook that an agent may read secondarily

## Decision packet

```yaml
memory_choice:
  primary_need: session-continuity | searchable-decisions | durable-wiki | structure-graph | human-note-vault | unknown
  horizon: current-project | multi-project | evergreen-domain | mixed
  artifact_shape: short-docs | wiki-pages | graph-artifacts | personal-notes | mixed
  consumers: one-agent | many-agents | human-only | mixed
```

## Fast heuristics
- If the question starts with **"what should the next agent load before touching this repo?"** → `opencontext`
- If the question starts with **"build a persistent knowledge base/wiki"** → `llm-wiki`
- If the question starts with **"map the codebase / build a graph / trace relationships"** → `graphify`
- If the question starts with **"organize my notes/vault"** → note/vault skills
