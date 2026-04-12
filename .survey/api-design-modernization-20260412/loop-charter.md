# Loop Charter

## Goal
Improve one high-utility backend skill in a bounded way so it becomes more reusable, less overlapping, and easier to trigger correctly.

## Current Baseline
- `api-design` is a legacy broad skill with no `references/` or `evals/`.
- It overlaps with `api-documentation` around OpenAPI/spec authoring.
- Discovery surfaces currently describe it too generically as “REST/GraphQL API design”.

## Mutable Artifact
Primary: `.agent-skills/api-design/SKILL.md`

Supporting context files allowed if the primary change requires them:
- `.agent-skills/api-design/references/*`
- `.agent-skills/api-design/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`

## Fixed Evaluation Harness
- Agent Skills spec / structure requirements
- Trigger quality: contract-first API design, not docs-publishing blur
- Boundary quality: clearer handoff to `api-documentation`, `authentication-setup`, `backend-testing`, and `database-schema-design`
- Support coverage: add practical references and evals if the change is kept
- Discovery surfaces: update repo docs if positioning materially changes
- Validation command: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/api-design`

## Constraints
- Keep this run focused on `api-design`; do not rewrite `api-documentation` in the same loop
- No new overlapping backend skill this run
- Keep the change transferable to other contract/governance skills
- Bounded budget: one skill modernization plus support/docs updates only if justified

## Tried Already
- Keep: survey the overlap first instead of adding a new backend skill
- Pending: contract-first rewrite of `api-design`
- Revert rule: if the rewrite weakens trigger clarity or does not improve boundaries/support coverage, revert and keep the baseline
