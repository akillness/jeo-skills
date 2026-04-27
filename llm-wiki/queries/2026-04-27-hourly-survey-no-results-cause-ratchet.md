# Hourly survey no-results degraded-cause ratchet

## Question
How should hourly survey runs report sparse lanes when `raw_count == 0` even after staged recovery queries?

## Answer
Codify `no-results` as an explicit degraded cause whenever a lane remains empty after stage-2 recovery. This prevents silent empty arrays from being misread as successful coverage and keeps downstream PR review deterministic.

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260427-133116/`
- Raw evidence: `.survey/hourly-skill-candidates-20260427-133116/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260427-133116/rtk-summary.md`
- Graphify fallback graph: `.survey/hourly-skill-candidates-20260427-133116/graphify-refined.json`

## Applied repository updates
- `.agent-skills/survey/SKILL.md`
  - Added `no-results` to degraded-cause taxonomy and explicit rule for post-stage2 empty lanes.
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - Added stage-1/stage-2 structure for `agentic ai skill`, `cli open source skill`, and `game development skill` lanes.
  - Added explicit `no-results` degraded-cause requirement.

## Decision
Ship this ratchet as low risk (documentation-only behavior clarification) and continue using the same validator contract.
