# Loop Charter

## Goal
Improve `user-guide-writing` so it more reliably routes user-doc requests into one primary mode, emits the smallest useful artifact packet, and keeps help-center / FAQ / release-help work distinct from adjacent documentation skills.

## Current Baseline
The current skill already has good scope and references, but the front door is still 314 lines long, repeats several structure templates inline, and under-specifies when the right output is a single page versus a guide set or refresh packet. Graphify still flags it on the oversized watchlist.

## Mutable Artifact
Primary: `.agent-skills/user-guide-writing/SKILL.md`

Supporting context that may change only if the primary rewrite holds:
- `.agent-skills/user-guide-writing/references/*.md`
- `.agent-skills/user-guide-writing/evals/evals.json`
- `.agent-skills/user-guide-writing/SKILL.toon`
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Catalog/discovery sync via `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Trigger quality check: description must clearly cover onboarding, tutorials, task how-tos, FAQs, help-center updates, and route-outs to `technical-writing`, `api-documentation`, and `changelog-maintenance`
- Boundary check: must not absorb docs-program governance, internal docs, API docs, or release-note ownership
- Support-symmetry check: if positioning changes materially, sync `SKILL.toon`, manifest/discovery wording, and README/setup surfaces

## Constraints
- One bounded improvement set this run; no new overlapping skill
- Keep the front door routing-first and move structural detail into references
- Prefer transferable page-set / packet rules over one-off product examples
- Validate before commit

## Tried Already
- Keep: the existing documentation-cluster boundary that separates `technical-writing`, `api-documentation`, `changelog-maintenance`, and `user-guide-writing`
- Revert: adding a separate help-center wrapper or collapsing user docs into internal technical docs
- Why: prior modernization already solved the overlap problem structurally; the remaining gap is front-door density and packaging clarity, not missing category coverage
