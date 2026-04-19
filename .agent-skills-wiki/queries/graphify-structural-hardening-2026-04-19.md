---
title: graphify structural hardening
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, consolidation, trigger-design, skill-quality, graphify, docs]
sources: [.survey/graphify-structural-hardening-20260419/context.md, .survey/graphify-structural-hardening-20260419/solutions.md, .survey/graphify-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Graphify structural hardening

## Decision
The best bounded improvement was **not** to add another graph, GraphRAG, repo-map, or memory wrapper. It was to promote the existing hidden `graphify` skill into the live top-level catalog and tighten it into a routing-first graph front door.

## Why this won
- The existing skill lived under `.agent-skills/utilities/graphify`, which meant the repo's top-level runtime discovery path could miss it even though the repo already treated `graphify` as part of the memory stack.
- The front door still read like a capability tour instead of the repo's newer packet-first style.
- The skill was the only remaining graph/memory-adjacent live candidate without a structural-hardening pass and compact discovery variant.

## Accepted
- Move `graphify` into top-level `.agent-skills/graphify`
- Rewrite the front door around packet choice and honest mode selection
- Add `references/mode-packets-and-route-outs.md`
- Add `references/build-and-fallback-recipes.md`
- Add `SKILL.toon`
- Refresh `evals/evals.json`
- Sync README / README.ko / setup / manifest surfaces
- Refresh `graphify-out/` after the live-skill count changed

## Rejected
- Adding another graph/GraphRAG wrapper
- Treating search-first repo navigation as part of `graphify`
- Leaving the skill nested and trying to remember the discovery gap later
- Pretending assistant-native `/graphify` UX and local fallback are the same thing

## Durable finding
In the persistent-memory lane, **artifact ownership matters as much as content**. A strong `graphify` description was not enough while the skill still sat outside the repo's normal top-level discovery path. Structural memory is only reusable when the graph skill is both truthful and actually discoverable.

## Related pages
- [[persistent-memory-cluster]]
- [[skill-support-coverage]]
- [[opencontext-modernization-2026-04-15]]
- [[survey-artifact-validator-hardening-2026-04-19]]
