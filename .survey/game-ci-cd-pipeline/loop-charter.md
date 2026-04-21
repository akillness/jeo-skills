# Loop Charter

## Goal
Add or improve a high-utility `.agent-skills` entry that closes the game-development CI/CD pipeline gap for Unity and Unreal teams without creating noisy overlap.

## Current Baseline
- Existing game skills cover build-log triage, performance profiling, demo feedback, and Steam launch ops.
- Existing generic `deployment-automation` is broad, web-app centric, and not game-engine specific.
- No dedicated skill currently handles Unity/Unreal CI/CD pipeline design, audit, or hardening.

## Mutable Artifact
Primary file: `.agent-skills/game-ci-cd-pipeline/SKILL.md`

Supporting context files allowed this run:
- `.agent-skills/game-ci-cd-pipeline/references/pipeline-patterns.md`
- `.agent-skills/game-ci-cd-pipeline/evals/evals.json`
- targeted cross-link patch to `.agent-skills/game-build-log-triage/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec / standard sections and frontmatter quality
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh <skill-dir>`
- Dry-run prompts in `evals/evals.json`
- Duplicate/consolidation check against `deployment-automation`, `game-build-log-triage`, and other game skills

## Constraints
- Max one coherent new skill this run
- Prefer reusable references/evals over extra scripts unless a script clearly adds leverage
- Avoid overlapping with existing game triage or Steam/marketing skills
- Keep changes bounded and PR-sized

## Tried Already
- Keep: survey confirms missing game-specific pipeline-hardening skill
- Keep: plan to cross-link from `game-build-log-triage` rather than creating duplicate triage logic
- Revert: none yet
