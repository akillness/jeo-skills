# Hourly survey no-results degraded-cause hardening

## Context
Hourly survey runs already report `lane_status` and `degraded_causes`, but empty-lane outcomes (`raw_count == 0` after stage-2 recovery) were not explicitly forced into taxonomy.

## Decision
- Extend degraded-cause taxonomy with `no-results`.
- Require `no-results` whenever a lane remains `raw_count == 0` after documented stage-2 recovery.
- Keep lane metrics/provenance unchanged.

## Repo changes
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
- `.agent-skills/survey/evals/evals.json` (new eval id: 20)

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260426-114141/`
- RTK summary: `.survey/hourly-skill-candidates-20260426-114141/rtk-summary.md`
- Graphify fallback: `.survey/hourly-skill-candidates-20260426-114141/graphify-refined.json`

## Why this is low-risk
This is a policy/documentation/eval consistency update only; no runtime code path or external interface changes.
