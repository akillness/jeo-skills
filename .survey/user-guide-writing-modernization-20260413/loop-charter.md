# Loop Charter

## Goal
Upgrade `user-guide-writing` into a high-signal user-documentation anchor with clearer triggers, stronger boundaries versus `technical-writing` / `api-documentation` / `changelog-maintenance`, and reusable support artifacts.

## Current Baseline
Current best version is the existing `user-guide-writing/SKILL.md`: long example-dump format, broad/generic trigger wording, no references, no evals, and weak route-outs inside the documentation cluster.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/user-guide-writing/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance: valid frontmatter, standard sections, strong trigger-oriented description, manageable length.
- Boundary clarity against adjacent documentation skills: `technical-writing`, `api-documentation`, and `changelog-maintenance` must stay distinct.
- Dry-run usefulness on representative prompts: onboarding guide, task-based help-center article, FAQ/tutorial update, and a non-trigger case that should route elsewhere.
- Supporting assets should be directly useful, not filler: at least references and evals if the rewrite justifies them.
- Discovery surfaces must stay aligned if positioning changes materially: README.md, README.ko.md, setup-all-skills-prompt.md, and skills.json.

## Constraints
- Max one bounded modernization target this run.
- Do not rewrite the evaluation harness mid-run.
- Prefer improving the existing anchor over adding new overlapping documentation skills.
- Keep changes transferable across product docs/help-center/tutorial workflows.

## Tried Already
- Keep: `technical-writing` modernization as the internal technical-docs anchor.
- Revert: adding more overlapping documentation wrappers.
- Why: the documentation cluster benefits more from sharper boundaries than from new skill sprawl.
