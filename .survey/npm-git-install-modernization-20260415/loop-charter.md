# Loop Charter

## Goal
Modernize `npm-git-install` into a practical, current, cross-package-manager skill for Git-based package installation and safer alternatives.

## Current Baseline
Existing skill is a long npm-only command catalog with outdated assumptions, no references, no evals, weak trigger wording, and limited guidance about package-manager differences, auth, prepare/build behavior, monorepo/subdir packaging, or reproducibility.

## Mutable Artifact
Primary: `.agent-skills/npm-git-install/SKILL.md`

## Fixed Evaluation Harness
- Survey artifacts under `.survey/npm-git-install-modernization-20260415/`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/npm-git-install`
- `python3 -m json.tool .agent-skills/npm-git-install/evals/evals.json >/dev/null`
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- Dry-run check: skill should clearly route 3 scenarios — unpublished GitHub package install, private repo auth/install, and safer alternative selection when direct git install is the wrong tool

## Constraints
- One bounded modernization only; do not touch the evaluator mid-run
- Prefer transferable workflow guidance over one-off package examples
- Add support files only when they materially increase reuse
- Update repo discovery docs if positioning/discoverability changes materially

## Tried Already
- Keep: broad CLI/developer-workflow gap scan identified `npm-git-install` as a high-utility support-gap target
- Revert: none yet this run
- Why: starting from survey + fixed rubric before editing
