---
title: Survey Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/survey-structural-hardening-20260418/triage.md, .survey/survey-structural-hardening-20260418/context.md, .survey/survey-structural-hardening-20260418/solutions.md, .survey/survey-structural-hardening-20260418/platform-map.md, .agent-skills/survey/SKILL.md, .agent-skills/survey/references/platform-adapter-and-artifact-contract.md, graphify-out/GRAPH_REPORT.md]
---

# Survey Structural Hardening 2026-04-18

## Question
What is the best bounded next improvement for the `survey` skill now that support coverage is already complete?

## Answer
Keep `survey` as the canonical research entry point, but shrink it into a routing-first, artifact-contract-first front door. Preserve the 4-lane `.survey/{slug}/` contract, move slower-changing portability detail into focused references, and update discovery surfaces instead of creating another research wrapper.

## Accepted changes
- Shrunk `survey/SKILL.md` from 392 to 309 lines while keeping the 4-lane survey workflow and explicit artifact schema.
- Added `survey/references/platform-adapter-and-artifact-contract.md` so `settings / rules / hooks` portability guidance lives outside the front door.
- Expanded `survey/evals/evals.json` with repo-maintenance, platform-comparison, and non-trigger cases.
- Refreshed `survey/SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so the narrower role is visible in discovery surfaces.
- Refreshed `graphify-out/` so structural memory records the survey hardening pass.

## Rejected alternatives
- Adding another research-hardening or platform-comparison wrapper would duplicate the canonical survey role.
- Leaving platform portability detail only inside the main skill would keep the front door heavier than the repo's newer routing-first pattern.
- Using platform-native config or hooks as the source of truth would weaken portability across Claude, Codex, and Gemini.

## Related pages
- [[skill-support-coverage]]
- [[core-orchestration-platform-cluster]]
- [[survey-evidence-recovery-2026-04-12]]
