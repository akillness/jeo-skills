---
title: Survey Artifact Validator Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/survey-artifact-validator-hardening-20260419/triage.md, .survey/survey-artifact-validator-hardening-20260419/context.md, .survey/survey-artifact-validator-hardening-20260419/solutions.md, .survey/survey-artifact-validator-hardening-20260419/platform-map.md, .agent-skills/survey/SKILL.md, .agent-skills/survey/references/output-templates-and-validator.md, .agent-skills/survey/scripts/validate_survey_artifacts.py, graphify-out/GRAPH_REPORT.md]
---

# Survey Artifact Validator Hardening 2026-04-19

## Question
What is the best bounded next improvement for `survey` after the 2026-04-18 structural hardening pass?

## Answer
Keep `survey` as the canonical research entry point, but finish the artifact-contract story. The best bounded move is to shrink the front door one more time by moving verbose output templates into a dedicated reference and adding a portable validator script that checks `.survey/{slug}/` folders before planning or implementation begins.

## Accepted changes
- Shrunk `survey/SKILL.md` from 309 to 245 lines while preserving the 4-lane contract and routing-first boundary.
- Added `references/output-templates-and-validator.md` so exact output templates and validator commands live outside the front door.
- Added `scripts/validate_survey_artifacts.py` to validate required files, headings, optional platform-map enforcement, and optional provenance labels.
- Expanded `survey/evals/evals.json` with validator-aware repo-maintenance and platform-topic cases.
- Refreshed `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces expose the validator-backed contract.
- Refreshed `graphify-out/` so structural memory records that `survey` is no longer on the top-10 oversized front-door watchlist.

## Rejected alternatives
- Adding another survey-adjacent wrapper would duplicate the canonical research role.
- Making hooks or runtime config the source of truth would reduce portability across Claude, Codex, and Gemini.
- Leaving artifact validation as prose-only would keep the contract weaker than the repo's newer truthful-validator pattern.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[survey-evidence-recovery-2026-04-12]]
- [[survey-structural-hardening-2026-04-18]]
