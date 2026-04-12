# Loop Charter

## Goal
Improve the practical usefulness and trigger precision of `.agent-skills/backend-testing` without creating new overlap.

## Current Baseline
`backend-testing/SKILL.md` is a long legacy skill (~844 lines) with broad claims, dated structure, weak activation boundaries, and no `references/` or `evals/` support files.

## Mutable Artifact
Primary: `.agent-skills/backend-testing/SKILL.md`

Supporting files allowed only if they directly improve the skill's usability and validation:
- `.agent-skills/backend-testing/references/*`
- `.agent-skills/backend-testing/evals/evals.json`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`) if the skill positioning changes materially
- wiki/graph/survey artifacts documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Description/trigger quality: clear use-cases, explicit boundaries, minimal overlap with adjacent backend skills
- Dry-run usefulness against representative prompts for API regression tests, auth-flow coverage, service/database integration testing, and bugfix regression protection
- JSON validity for any `evals/evals.json`
- Discovery-surface consistency when positioning changes

## Constraints
- Max one primary skill modernization in this run
- Prefer improving the existing skill over creating a duplicate
- Keep the resulting SKILL concise enough to stay comfortably under 500 lines
- No product code; research + skill/docs/wiki/graph maintenance only
- Keep supporting files tightly scoped and reusable

## Tried Already
- Keep: modernize adjacent high-frequency skills by sharpening boundaries, adding `references/` + `evals/`, and updating discovery docs when positioning changes
- Revert: creating overlapping wrapper skills where a stronger canonical skill was enough
- Why: bounded upgrades with clearer handoffs have produced better catalog quality than adding another near-duplicate
