# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/file-organization` without adding another overlapping project-structure or monorepo wrapper.

## Current Baseline
- Primary mutable artifact: `.agent-skills/file-organization/SKILL.md`
- Baseline quality: the boundary is already correct, but the front door is 357 lines and still carries large repo-type walkthroughs, output scaffolds, and examples that can be delegated to the existing support files.
- Existing support: `references/repo-shape-decision-guide.md`, `references/migration-playbook.md`, `references/repo-type-patterns.md`, `evals/evals.json`, `SKILL.toon`

## Mutable Artifact
Exactly one primary file: `.agent-skills/file-organization/SKILL.md`

Supporting files may be updated only if needed to keep the main skill truthful and discoverable:
- `references/*`
- `evals/evals.json`
- `SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph artifacts tied to this run

## Fixed Evaluation Harness
- Agent Skills structural validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/file-organization`
- Catalog/runtime sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Diff sanity via `git diff --check`
- Frozen rubric for this run:
  1. `SKILL.md` stays under 500 lines and becomes materially shorter than baseline.
  2. Trigger wording remains repository-shape / migration focused rather than drifting into search, automation, environment setup, or product-process planning.
  3. The front door clearly separates framework-default mode, feature/domain mode, workspace/monorepo mode, docs-taxonomy mode, and engine-aware hybrid mode.
  4. Route-outs to `codebase-search`, `workflow-automation`, `system-environment-setup`, `design-system`, `state-management`, and `bmad-gds` remain explicit.
  5. Compact and eval surfaces stay in sync with the shortened front door.
- Validation prompts: Next.js route/components sprawl, backend module sprawl, monorepo premature package extraction, docs taxonomy drift, Unity asset sprawl.

## Constraints
- Max one coherent skill-upgrade change set this run.
- No new overlapping repo-structure wrapper.
- Prefer structural cleanup and truthful routing over more examples or bigger folder trees.
- Keep claims grounded in repo-local evidence or primary-source docs.

## Tried Already
- Keep: repo-wide pattern of shrinking oversized `SKILL.md` files into routing-first front doors with focused references.
- Revert: adding nearby wrapper skills when a dense canonical anchor can be improved in place.
- Why: the graph and wiki both show that boundary cleanup beats catalog growth once support coverage is already complete.
