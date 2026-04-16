---
title: jeo structural hardening
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, consolidation, trigger-design, skill-quality, graphify, survey]
sources: [.survey/jeo-structural-hardening-20260416/triage.md, .survey/jeo-structural-hardening-20260416/context.md, .survey/jeo-structural-hardening-20260416/solutions.md, .survey/jeo-structural-hardening-20260416/platform-map.md, .survey/jeo-structural-hardening-20260416/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/jeo/SKILL.md, .agent-skills/jeo/references/PLATFORM_SETUP.md, .agent-skills/jeo/references/STATE_AND_TROUBLESHOOTING.md]
---

# jeo structural hardening

## Question
What is the best bounded next improvement for `jeo`, the repo's highest-visibility orchestration entrypoint, now that support-folder coverage is complete but the main skill file has become too dense?

## Answer
Harden `jeo` in place instead of creating another orchestration wrapper. The durable win is to keep the PLAN → EXECUTE → VERIFY → CLEANUP contract in `SKILL.md`, move slower-changing platform/state/troubleshooting detail into reference docs, and refresh discovery surfaces so `jeo` stays the integrated router rather than a giant mixed manual.

## Why this won
- The graph refresh showed that support coverage is complete across all 89 live skills, so the next structural gains come from high-degree boundary/trigger improvements rather than missing `references/` or `evals/`.
- `jeo` is indexed from README, README.ko, setup prompts, and compact discovery surfaces, so maintenance drag in this one file has outsized impact on activation and onboarding.
- `validate_skill.sh` had started warning because `jeo/SKILL.md` exceeded the recommended 500-line cap.
- The orchestration lane already has enough adjacent surfaces: `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode` cover the specialist layers that `jeo` should compose rather than absorb.

## Accepted changes
- Shrink `jeo/SKILL.md` under the 500-line guideline and keep it focused on trigger boundaries plus the orchestration contract.
- Add `references/PLATFORM_SETUP.md` and `references/STATE_AND_TROUBLESHOOTING.md` for slower-changing config/state detail.
- Refresh `SKILL.toon`, `skills.json`, README, README.ko, and `setup-all-skills-prompt.md` so the discovery surface matches the stronger resume/recovery framing.
- Refresh graph artifacts so the next run sees the new docs-first / high-degree-anchor baseline.

## Rejected changes
- Adding another orchestration wrapper for resume/state/setup.
- Letting `jeo` absorb runtime ownership from `omc`, `omx`, `ohmg`, `ralph`, `plannotator`, `agent-browser`, `agentation`, or `ralphmode`.
- Leaving platform/state/troubleshooting detail only in wiki memory instead of packaging it with the skill.

## Durable boundary note
If the user needs **one integrated delivery loop with resume/recovery and a `.jeo` ledger**, use `jeo`.
If the user instead needs **spec-first clarification or persistent completion**, use `ralph`; **visual plan approval** routes to `plannotator`; **browser verification** routes to `agent-browser`; **rendered UI annotation** routes to `agentation`; **platform-native runtime orchestration** routes to `omc` / `omx` / `ohmg`; and **approval-friction posture** routes to `ralphmode`.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[ralph-support-hardening-2026-04-16]]
- [[ralphmode-hardening-2026-04-16]]
- [[ohmg-modernization-2026-04-15]]
