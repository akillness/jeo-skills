---
title: Compact variant gap 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, skill-quality, consolidation, docs]
sources: [.survey/compact-variant-gap-20260415/triage.md, .survey/compact-variant-gap-20260415/context.md, .survey/compact-variant-gap-20260415/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/skill-standardization/SKILL.md]
---

# Compact variant gap 2026-04-15

## Question
What is the best bounded fix for the repo's remaining compact-discovery drift: weaken the docs claim, build a generator first, or finish the remaining `SKILL.toon` coverage now?

## Answer
The best bounded move is to **finish the remaining compact variants now**. The gap was already down to 8 skills, the repo's own docs still described every skill folder as shipping `SKILL.toon`, and `skill-standardization` already treats compact variants as derived runtime artifacts that should stay in sync with the full skill.

## Why this was the right ratchet
- The problem was support-layer incompleteness, not missing capability coverage, so adding another wrapper would not have fixed the real drift.
- A docs downgrade would have made the claim truthful but would still leave uneven compact discovery across important skills like the remaining game-cluster specialists.
- A generator-first project would be larger and less comparable than the current bounded sweep, which only had 8 files left.

## Accepted changes
- Added `SKILL.toon` coverage for `clawteam`, `game-build-log-triage`, `game-ci-cd-pipeline`, `game-demo-feedback-triage`, `lmstudio-cli`, `obsidian-plugin`, `research-paper-writing`, and `steam-store-launch-ops`.
- Refreshed graph outputs so the structural memory layer now records zero remaining compact-variant gaps.
- Updated the wiki so future runs do not have to rediscover the same residual list.

## Rejected changes
- Weakening the docs claim before attempting the bounded support completion pass
- Building a repo-wide compact-variant generator in the same loop
- Treating the gap as a justification for new overlapping skills

## Durable takeaway
When the repo has only a small residue of missing support artifacts and the runtime/docs already assume they exist, the right maintenance move is to finish the support layer first. Automation can come later if a larger class of drift reappears.

## Related pages
- [[skill-support-coverage]]
- [[game-development-cluster]]
- [[skill-standardization-variant-sync-2026-04-15]]
- [[game-performance-profiler-modernization-2026-04-15]]
