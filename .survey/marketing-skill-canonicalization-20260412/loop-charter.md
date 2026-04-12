# Loop Charter

## Goal
Improve the repository's broad marketing entry point without adding duplication: sharpen one canonical general marketing router, narrow the legacy duplicate into a compatibility alias, and update discovery surfaces so the catalog points users to the right skill.

## Current Baseline
- `marketing-automation` and `marketing-skills-collection` both claim the same 23-sub-skill coverage.
- README / README.ko / setup prompt / `skills.json` currently list both with near-identical descriptions.
- Neither skill has `references/` or `evals/`.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/marketing-automation/SKILL.md`

Supporting artifacts allowed if needed:
- `.agent-skills/marketing-skills-collection/SKILL.md`
- `references/` and `evals/` under the two marketing skills
- README.md
- README.ko.md
- setup-all-skills-prompt.md
- `.agent-skills/skills.json`
- survey/wiki/graph outputs documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: canonical skill must clearly describe when to use it; alias must clearly defer to canonical use
- Discovery-surface consistency: README.md, README.ko.md, setup prompt, and `skills.json` must reflect canonical-vs-alias positioning if the meaning changes
- Support quality: add at least one durable reference file and one eval bundle where the upgrade materially benefits reuse
- Dry-run usefulness: eval prompts should distinguish broad marketing routing from narrow niche workflows such as Steam/game launch ops

## Constraints
- Max one coherent improvement set this run
- No new overlapping marketing skill unless the existing pair proves unfixable
- Prefer transferable routing scaffolding over channel-specific one-off hacks
- Keep the alias only if it clearly reduces migration friction instead of creating new noise

## Tried Already
- Keep: prior canonical-vs-alias passes for React and design-system lanes; those support making one skill canonical and one a compatibility alias.
- Revert: creating another overlapping general skill would repeat the same catalog problem.
