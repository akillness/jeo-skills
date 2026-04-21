---
title: OpenContext Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/opencontext-structural-hardening-20260419/context.md, .survey/opencontext-structural-hardening-20260419/solutions.md, .survey/opencontext-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# OpenContext Structural Hardening 2026-04-19

## Question
What is the best bounded follow-up for the persistent-memory lane after the earlier `opencontext` modernization and the recent `graphify` / `obsidian-cli` memory-layer work?

## Answer
Tighten `opencontext` into a packet-first active project-memory router instead of adding another memory wrapper or leaving the front door as a long command-heavy explainer.

Why:
1. The cross-domain survey still points to the same durable boundary: `opencontext` owns active project/repo memory, `llm-wiki` owns long-lived markdown synthesis, `graphify` owns structural memory, and vault tools own human-authored notes.
2. Real-world behavior still leans on stitched stacks of repo rules, handoff docs, Notion/Obsidian notes, and repo packers, so the valuable contract is a smaller **what should the next agent load/search/store now?** packet.
3. The solution scan shows OpenContext is unusually differentiated on manifests, stable links, and handoff packets, while neighboring tools cluster into generic agent memory, wiki/vault, graph, or one-shot repo packing.
4. The repo still had structural drift signals worth fixing: no dedicated intake/route-out packet reference and stale `utilities/opencontext` source paths in `skills.json`.

## Accepted changes
- Rewrote `opencontext/SKILL.md` into a routing-first packet selector with explicit `memory-layer-choice`, `load-context`, `search-context`, `store-conclusions`, `setup-integration`, and `route-out` modes
- Added `references/intake-packets-and-route-outs.md`
- Expanded `evals/evals.json` with a repo-packer route-out case and stronger packet assertions
- Refreshed `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`
- Corrected stale `utilities/opencontext/SKILL.md` source paths inside `skills.json`

## Rejected changes
- Adding another generic persistent-memory / agent-memory wrapper
- Pulling repo packers like Repomix or Gitingest into `opencontext` as if they were the same workflow
- Re-expanding `opencontext` into a giant CLI catalog that tries to cover wiki, graph, and vault jobs too

## Durable takeaway
The cleanest memory question is not “which memory tool is best?” but **which packet does the next agent actually need right now?** If the need is a small project-memory packet with manifests, stable links, searchable decisions, and a post-task handoff note, `opencontext` should own it. If not, route out early.

## Related pages
- [[persistent-memory-cluster]]
- [[opencontext-modernization-2026-04-15]]
- [[graphify-structural-hardening-2026-04-19]]
- [[obsidian-cli-structural-hardening-2026-04-19]]
