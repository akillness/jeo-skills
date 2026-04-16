---
title: ralph support hardening
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, consolidation, trigger-design, skill-quality, graphify, survey]
sources: [.survey/ralph-support-hardening-20260416/triage.md, .survey/ralph-support-hardening-20260416/context.md, .survey/ralph-support-hardening-20260416/solutions.md, .survey/ralph-support-hardening-20260416/platform-map.md, .survey/ralph-support-hardening-20260416/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/ralph/SKILL.md, .agent-skills/ralph/references/platform-setup.md]
---

# ralph support hardening

## Question
What is the best bounded next improvement for the `ralph` skill after the remotion alias PR merged and the graph scan reduced the remaining support gap to one core-orchestration holdout?

## Answer
Harden `ralph` in place instead of creating another orchestration wrapper. The durable win is to finish eval coverage and remove stale repo-local self-path examples so the canonical spec-first skill is easier to activate and validate without relying on wiki memory or manual translation.

## Why this won
- `ralph` was the last live eval holdout called out by the previous graph refresh.
- The orchestration lane already has enough neighboring surfaces: `omc`, `omx`, `ohmg`, `jeo`, `plannotator`, and `ralphmode` cover runtime, approval, and permissions boundaries.
- Survey evidence from upstream Ouroboros and adjacent agent tooling shows that long-running autonomy still depends on explicit specs, hooks, checkpoints, repo instructions, and verification loops — so support/eval quality matters more than another wrapper.
- Repo-local residue scan found stale installation/setup examples using `.agent-skills/ralph-ooo/...` and `--skill ralph-ooo`, even though the live skill directory is `ralph`.

## Accepted changes
- Add `evals/evals.json` to `ralph`.
- Keep `ralph` focused on the specification-first method + persistent completion loop.
- Fix live self-install/self-path examples to point at `.agent-skills/ralph/...` and `--skill ralph` while preserving legacy runtime alias names where they are part of the actual loop internals.
- Refresh graph and wiki artifacts so the next run starts from the new support-complete baseline.

## Rejected changes
- Adding another orchestration wrapper for persistent completion.
- Letting `ralph` absorb runtime ownership from `omc`, `omx`, `ohmg`, `jeo`, `plannotator`, or `ralphmode`.
- Broad README / setup prompt churn when the discovery wording for `ralph` was already accurate enough.

## Durable boundary note
If the user needs **spec-first clarification, immutable seed generation, or persistent completion until verification passes**, use `ralph`.
If the user instead needs **runtime-native orchestration**, use `omc` / `omx` / `ohmg`; **approval gates** route to `plannotator`; **permission posture** routes to `ralphmode`; and **integrated multi-skill orchestration** routes to `jeo`.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[ralphmode-hardening-2026-04-16]]
- [[ohmg-modernization-2026-04-15]]
- [[skill-autoresearch-hardening-2026-04-16]]
