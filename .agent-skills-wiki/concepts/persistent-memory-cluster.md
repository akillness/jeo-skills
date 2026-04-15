---
title: Persistent Memory Cluster
created: 2026-04-15
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, graphify]
sources: [.survey/opencontext-modernization-20260415/context.md, .survey/opencontext-modernization-20260415/solutions.md, .survey/opencontext-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Persistent Memory Cluster

## Durable finding
The memory layer is cleaner when the repo treats `opencontext` as the **active project/repo memory and cross-agent handoff** skill, rather than letting it blur into wiki maintenance, graph mapping, or human-authored note-taking.

Current cluster shape:
- `opencontext` = active project/repo memory: searchable decisions, manifests, stable links, load → search → store workflow, cross-agent handoff
- `llm-wiki` = long-lived synthesized markdown knowledge base with index/log/schema discipline
- `graphify` = structural memory and relationship tracing through `GRAPH_REPORT.md`, `graph.json`, and HTML graph outputs
- note/vault skills = human-authored note organization and editing surfaces

## Why it matters
- Trigger precision improves when the first question is **"what kind of memory artifact do we need?"** instead of treating every persistence request as one bucket.
- Active delivery work usually needs smaller project-memory packets than a full wiki or graph pipeline.
- Discovery docs and support files are crucial here because all four layers can sound like "persistent memory" without explicit boundaries.

## Boundary rules
- If the question is **"what should the next agent load before touching this project?"** → `opencontext`
- If the question is **"build and maintain a compounding markdown knowledge base"** → `llm-wiki`
- If the question is **"map the repo/corpus structure and trace relationships"** → `graphify`
- If the question is **"organize my notes or vault"** → note/vault skills

## Structural note
The graph refresh after the `opencontext` modernization showed another repeatable maintenance pattern: upgrading a high-utility support-gap skill with references, evals, and sharper route-outs is more valuable than creating another overlapping memory wrapper.

## Related pages
- [[skill-support-coverage]]
- [[opencontext-modernization-2026-04-15]]
- [[developer-workflow-cluster]]
- [[search-analysis-cluster]]
