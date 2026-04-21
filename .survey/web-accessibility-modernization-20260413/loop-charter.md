# Loop Charter

## Goal
Improve `web-accessibility` so it triggers more precisely, routes cleanly inside the frontend cluster, and becomes more reusable through support files and evals.

## Current Baseline
- Existing file: `.agent-skills/web-accessibility/SKILL.md`
- Current state: long legacy WCAG/examples document, no `references/`, no `evals/`, broad overlap with `web-design-guidelines`, `ui-component-patterns`, and `responsive-design`.

## Mutable Artifact
Primary file: `.agent-skills/web-accessibility/SKILL.md`

Supporting files allowed only if the primary skill direction clearly improves:
- `.agent-skills/web-accessibility/references/*`
- `.agent-skills/web-accessibility/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec / repo validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/web-accessibility`
- Trigger checks:
  1. "Audit this checkout flow for accessibility issues and tell me what to test manually after axe."
  2. "Fix keyboard trap and focus return problems in this React modal."
  3. "Our button primitive API is messy; should this be web-accessibility or ui-component-patterns?"
  4. "Review these UI files against broader design/polish guidelines, not just WCAG."
- Success rubric:
  - spec-compliant frontmatter and sections
  - clearer trigger boundary than baseline
  - explicit route-outs to neighboring frontend skills
  - support files improve reuse instead of duplicating the main skill
  - docs/discovery surfaces updated if positioning changes materially

## Constraints
- One coherent modernization only; no new overlapping skill this run.
- Keep `web-accessibility` focused on remediation + verification, not general UI polish review.
- Prefer transferable decision aids over long code dumps.
- Validate before commit; keep or revert based on the fixed harness.

## Tried Already
- Keep: survey evidence that automated-only guidance is insufficient.
- Keep: repo evidence that `web-design-guidelines` already owns broader UI review language.
- Revert: none yet this run.
