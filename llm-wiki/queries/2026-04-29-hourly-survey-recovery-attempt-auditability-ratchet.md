# 2026-04-29 hourly survey recovery-attempt auditability ratchet

## Summary
- Hourly sweep executed across 5 mandatory lanes.
- backend lane required stage-2 recovery to exit zero-result state.
- survey skill ratchet added: persist lane `recovery_attempts` (stage/query/raw_count) in evidence and mirror compact recovery notes in markdown artifacts.

## Why this matters
Reviewer auditability was weaker when recovery logic lived only in scripts/JSON. This ratchet makes degraded/pass decisions traceable directly from markdown artifacts and structured evidence.

## Artifacts
- `.survey/hourly-skill-candidates-20260429-063458/evidence.json`
- `.survey/hourly-skill-candidates-20260429-063458/solutions.md`
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/evals/evals.json`
