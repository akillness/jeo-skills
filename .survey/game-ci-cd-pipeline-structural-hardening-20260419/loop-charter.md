# Loop Charter

## Goal
Improve `game-ci-cd-pipeline` so it triggers more reliably as a routing-first game build/release pipeline skill and produces a tighter next-artifact workflow.

## Current Baseline
`game-ci-cd-pipeline` already has support files and evals, but the front door is still a 260-line checklist-heavy skill. It covers the right problems, yet it can be tightened around packet choice, log-triage boundaries, and reusable route-outs.

## Mutable Artifact
Primary: `.agent-skills/game-ci-cd-pipeline/SKILL.md`

Supporting context that may be updated only if the primary change is kept:
- `.agent-skills/game-ci-cd-pipeline/SKILL.toon`
- `.agent-skills/game-ci-cd-pipeline/evals/evals.json`
- `.agent-skills/game-ci-cd-pipeline/references/*`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- wiki / graph artifacts tied to accepted changes

## Fixed Evaluation Harness
- Agent Skills spec / `validate_skill.sh`
- Repo catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Dry-run prompts from existing evals plus one added route-out / manual-release case
- Frozen rubric for this run:
  1. clearer trigger surface
  2. one primary packet/mode per run
  3. stronger separation from `game-build-log-triage`
  4. support/doc surfaces stay in sync

## Constraints
- Keep the change bounded to one existing skill lane.
- Prefer shrinking / clarifying over expanding scope.
- No new overlapping game DevOps wrapper.
- Preserve the repo's routing-first pattern and compact discovery surfaces.

## Tried Already
- Keep: modernization of `bmad-gds`, `steam-store-launch-ops`, and `game-performance-profiler` showed the game cluster benefits more from sharper boundaries than new wrappers.
- Revert: adding adjacent wrappers in mature clusters tends to increase noise instead of leverage.
- Why: graphify and wiki history keep pointing toward dense-anchor cleanup, not catalog expansion.
