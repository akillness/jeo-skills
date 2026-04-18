---
title: Fabric structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/fabric-structural-hardening-20260418/context.md, .survey/fabric-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/fabric/SKILL.md]
---

# Fabric structural hardening 2026-04-18

## Decision
The best bounded utilities / developer-workflow follow-up was to shrink `fabric` into a **routing-first operator front door** instead of adding another Fabric-adjacent helper skill or leaving the long feature-tour shape untouched.

## Why this cleared the bar
- `fabric` already had the right durable boundary after the 2026-04-15 modernization pass, so adding surface area would mostly create duplicate triggers.
- Graph-backed repo structure still flagged `fabric` as an oversized front-door skill, which made in-place hardening more valuable than another new skill.
- Source-backed upstream evidence still centers Fabric on patterns, custom patterns, stdin/file flows, and REST/server mode, so the remaining maintenance problem was structure, not scope.

## Accepted changes
- Shrunk `fabric/SKILL.md` from 308 to 265 lines while keeping one primary lane chooser and a short operator-packet contract.
- Added `references/operator-packets-and-route-outs.md` so route-outs and packet structure live in support docs instead of bloating the front door.
- Expanded `evals/evals.json` with a dedicated `serve-api` dry-run case.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces match the tighter routing-first positioning.
- Refreshed `graphify-out/` so the structural memory layer now records `fabric` off the oversized watchlist.

## Rejected alternatives
- Adding a Fabric server-mode helper skill or another prompt/pattern wrapper.
- Re-broadening `fabric` into a generic AI CLI or pseudo coding assistant.
- Keeping all packet/route-out detail inline once support coverage was already complete.

## Durable boundary
- `fabric` owns **repeatable named transforms over external text/content**.
- General LLM CLIs own **ad hoc prompting** where there is no stable pattern workflow.
- Coding assistants own **repo-aware editing and implementation**.
- Workflow automation owns **deterministic multi-step orchestration** where Fabric is only one stage.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
