# Loop Charter

## Goal
Improve `api-documentation` by shrinking its front door into a clearer routing-first skill while preserving trigger quality, boundary clarity, and useful output guidance.

## Current Baseline
- `api-documentation/SKILL.md` is 336 lines and remains on the graph watchlist for oversized front doors.
- Support coverage already exists: `references/` and `evals/` are present.
- The likely win is structural hardening, not adding a new overlapping API-doc skill.

## Mutable Artifact
Primary: `.agent-skills/api-documentation/SKILL.md`

Supporting sync only if the primary artifact changes materially:
- `.agent-skills/api-documentation/evals/evals.json`
- `.agent-skills/api-documentation/SKILL.toon`
- related survey/wiki/graph artifacts needed to record the run

## Fixed Evaluation Harness
- Agent Skills spec / `skill-standardization` expectations
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/api-documentation`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- `git diff --check`
- Compare against baseline for:
  - smaller `SKILL.md`
  - preserved route-outs to `api-design`, `technical-writing`, `user-guide-writing`, `authentication-setup`, `changelog-maintenance`
  - preserved trigger coverage for reference, quickstart, SDK, webhook, migration work
  - no new duplicate wrapper introduced

## Constraints
- Max one coherent structural change to the skill front door this run.
- Prefer moving detail to existing or focused support files instead of adding another skill.
- Keep output language English to match repo convention.
- Do not change the evaluation harness mid-run.

## Tried Already
- Keep: 2026-04-13 modernization that established `api-documentation` as the developer-facing API-doc anchor.
- Revisit now: structural hardening after support coverage reached 100% and graphify still flagged the front door as dense.
