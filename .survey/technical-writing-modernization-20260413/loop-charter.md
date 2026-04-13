# Loop Charter

## Goal
Improve `technical-writing` so it activates as the internal technical-docs anchor for specs, architecture docs, ADRs, runbooks, migration notes, and decision-heavy developer documentation.

## Current Baseline
- `technical-writing` is 581 lines long and triggers too broadly.
- It lacks `references/` and `evals/`.
- Graphify flags duplicate pressure against `user-guide-writing`, `api-documentation`, and `changelog-maintenance`.
- Standardization baseline: 0 errors, 1 warning (file length > 500 lines).

## Mutable Artifact
Primary mutable artifact: `.agent-skills/technical-writing/SKILL.md`

Supporting context files that may change only if the new primary artifact requires it:
- `.agent-skills/technical-writing/SKILL.toon`
- `.agent-skills/technical-writing/references/*`
- `.agent-skills/technical-writing/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/technical-writing`
- File-length target: keep `SKILL.md` under 350 lines if practical
- Trigger quality target: description + body must clearly route out `api-documentation`, `user-guide-writing`, and `changelog-maintenance`
- Support coverage target: add at least one useful `references/` doc and an `evals/evals.json`
- Discovery target: update README / README.ko / setup surfaces if positioning changes materially
- JSON validity target: `.agent-skills/skills.json` and any new evals file must parse cleanly

## Constraints
- Max one bounded modernization target this run
- No new overlapping documentation wrapper skill
- Preserve docs-cluster separation instead of merging neighboring skills
- Keep claims in survey/wiki notes source-backed or repo-backed

## Tried Already
- Keep: previous modernizations that sharpened boundaries and added support bundles (`api-design`, `code-review`, `workflow-automation`, `plannotator`)
- Revert: adding new wrapper skills instead of upgrading the existing legacy anchor
- Why: transferable improvements come from clearer boundaries + support coverage, not more catalog sprawl
