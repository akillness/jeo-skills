---
title: Ralphmode Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify]
sources: [.survey/ralphmode-hardening-20260416/triage.md, .survey/ralphmode-hardening-20260416/context.md, .survey/ralphmode-hardening-20260416/solutions.md, .survey/ralphmode-hardening-20260416/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Ralphmode Hardening 2026-04-16

## Question
What is the best bounded next improvement for the `ralphmode` skill after the LangSmith pass and the latest support-coverage graph refresh?

## Answer
Harden `ralphmode` in place instead of adding another permissions wrapper. The durable improvement is to make the portable **settings / rules / hooks** abstraction explicit, add eval coverage, and keep `ralphmode` anchored as the permission/profile layer rather than drifting into runtime-orchestration ownership.

## Why this beat alternatives
- The graph refresh still showed support-gap leverage as the highest-value maintenance direction.
- `ralphmode` was one of the remaining high-visibility orchestration-platform skills without `evals/evals.json`.
- The survey showed a stable cross-platform pattern: operators want repo-local trusted automation with explicit boundaries, not blanket global bypass.
- Creating another trusted-folder, bypass, or checkpoint wrapper would fragment a lane the wiki already treats as one boundary: `ralphmode` owns permission posture; `ralph`, `omc`, `omx`, `ohmg`, and `jeo` own runtime behavior.

## Accepted changes
- Tighten `ralphmode` description around repo-local settings, explicit rules, and hook-backed checkpoints.
- Add a portable mental-model section: settings / rules / hooks.
- Add `evals/evals.json` for trigger quality, route boundaries, and Codex-vs-Claude/Gemini hook differences.
- Refresh `SKILL.toon`, `skills.json`, and docs/setup copy so discovery surfaces match the sharper boundary.

## Rejected changes
- Adding a separate trusted-folder or checkpoint helper skill.
- Broadening compatibility to OpenCode in this run; comparative OpenCode evidence was useful for boundary language, but not strong enough to expand the shipping compatibility surface.
- Letting `ralphmode` absorb orchestration-runtime questions that belong to `ralph`, `omc`, `omx`, `ohmg`, or `jeo`.

## Durable boundary
If the question is about **permission posture, approval reduction, trusted repos, sandbox-only YOLO, or secret/destructive-command checkpoints**, use `ralphmode`.
If the question is about **runtime orchestration behavior**, route outward to the appropriate orchestration skill.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[langsmith-hardening-2026-04-16]]
