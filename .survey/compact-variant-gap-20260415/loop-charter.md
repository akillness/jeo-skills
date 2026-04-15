# Loop Charter

## Goal
Eliminate the remaining compact-discovery gap by adding `SKILL.toon` coverage for the last missing legacy skills, without changing the repo's problem boundaries or adding new skills.

## Current Baseline
- `graphify-out/GRAPH_REPORT.md` reports 8 skills still missing compact variants.
- README/setup guidance treats compact discovery as part of the shipped runtime surface.
- `skill-standardization` already says compact variants should be refreshed after material trigger-surface changes.

## Mutable Artifact
Primary mutable artifact: the remaining missing compact variants (`SKILL.toon` files) for the current 8-skill gap.

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh <skill-dir>` for each changed skill directory
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Repository scan: missing compact variants count must decrease to 0 for current filesystem skills
- Dry-run quality bar: each `SKILL.toon` must preserve the skill's actual trigger surface and route-outs instead of generic keyword stuffing

## Constraints
- Max scope: only the currently missing compact variants plus the survey/wiki/graph bookkeeping required to record the change
- No new skills
- No broad `SKILL.md` rewrites unless a compact variant reveals a factual mismatch
- Prefer truth-restoring support completion over docs downgrade

## Tried Already
- Keep: bounded support-file modernization after a survey-backed decision
- Revert: adding new overlapping skills when the gap is support coverage, not capability coverage
- Why: support completion transfers better across future repo maintenance than another one-off wrapper
