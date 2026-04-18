# Loop Charter

## Goal
Improve `monitoring-observability` trigger precision and structural usability without expanding the skill footprint or creating a duplicate neighboring skill.

## Current Baseline
- Primary artifact: `.agent-skills/monitoring-observability/SKILL.md`
- Baseline state:
  - `SKILL.md` is 290 lines and still carries a lot of inline mode detail.
  - `SKILL.toon` and `.agent-skills/skills.toon` are stale and still advertise the pre-modernization generic monitoring/setup behavior.
  - Support coverage already exists (`references/` + `evals/`), so the next win is structural hardening, not adding missing support files.

## Mutable Artifact
Exactly one primary mutable file: `.agent-skills/monitoring-observability/SKILL.md`

Supporting files may change only to keep the catalog/discovery surfaces truthful:
- `.agent-skills/monitoring-observability/references/*`
- `.agent-skills/monitoring-observability/evals/evals.json`
- `.agent-skills/monitoring-observability/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality checks:
  1. service/API observability brief should still trigger
  2. stale dashboard / alert-audit request should trigger
  3. outage-log root-cause request should route out
  4. deployment/post-release telemetry request should route to `deployment-automation` when rollout execution is primary
- Structural constraints:
  - Front door should be meaningfully smaller than 290 lines
  - Compact discovery surfaces must match the new boundary
  - No new overlapping skill may be created

## Constraints
- Max one bounded skill lane this run
- Preserve existing boundaries with `log-analysis`, `debugging`, `performance-optimization`, `deployment-automation`, `langsmith`, and `game-performance-profiler`
- Prefer moving detail into references over expanding the main front door
- Update wiki and graph artifacts after a meaningful accepted change

## Tried Already
- Keep: 2026-04-14 modernization that established the five-mode observability anchor and added support files.
- Revert: adding a new observability wrapper or broad vendor catalog; this repo already benefits more from sharpening the existing anchor.
- Why: support coverage is complete, and graph evidence points to dense-anchor cleanup plus discovery-surface sync as the current leverage point.
