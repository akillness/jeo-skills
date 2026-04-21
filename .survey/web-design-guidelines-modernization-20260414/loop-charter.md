# Loop Charter

## Goal
Improve `web-design-guidelines` into a modern broad UI review skill with sharper trigger boundaries, practical review workflow, and reusable support files.

## Current Baseline
The existing skill is a 140-line legacy adaptation centered on fetching Vercel Web Interface Guidelines on every run. It overlaps with `web-accessibility`, lacks support files, and does not clearly separate broad UI review from accessibility remediation, component API design, responsive layout work, or React performance work.

## Mutable Artifact
Primary file: `.agent-skills/web-design-guidelines/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `scripts/validate_skill.sh`
- Trigger/boundary comparison against adjacent frontend skills: `web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`, `react-best-practices`
- Support-file requirement: add at least one `references/` document and `evals/evals.json` if the rewrite is kept
- Discovery-surface sync check: README.md, README.ko.md, setup-all-skills-prompt.md, and `.agent-skills/skills.json` must match the new positioning

## Constraints
- One bounded modernization target this run; do not add a new skill
- Prefer durable review workflow guidance over vendor-specific keyword stuffing
- Keep route-outs explicit and avoid absorbing accessibility-only or layout-only work
- Changes must stay useful across frontend/product/web app review contexts, not just Vercel-specific sites

## Tried Already
- Keep: neighboring frontend anchors were modernized first (`web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`)
- Revert: do not create another adjacent frontend wrapper; upgrade the weak anchor instead
- Why: the repo keeps benefiting more from modernizing weak high-visibility anchors than from adding noisy duplicates