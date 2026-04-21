# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/deployment-automation` without adding another overlapping deployment or CI/CD wrapper.

## Current Baseline
- Primary mutable artifact: `.agent-skills/deployment-automation/SKILL.md`
- Baseline quality: the boundary is already correct, but the front door is 408 lines and still carries large packet templates and strategy detail that should live in support docs.
- Existing support: `references/deployment-modes-and-boundaries.md`, `references/rollout-and-rollback-checklist.md`, `references/platform-routing-notes.md`, `evals/evals.json`, `SKILL.toon`

## Mutable Artifact
Exactly one primary file: `.agent-skills/deployment-automation/SKILL.md`

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
- Agent Skills structural validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/deployment-automation`
- Catalog/runtime sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Diff sanity via `git diff --check`
- Frozen rubric for this run:
  1. `SKILL.md` stays under 500 lines and becomes materially shorter than baseline.
  2. Trigger wording remains release-execution focused rather than broad CI/CD setup language.
  3. The front door clearly separates preview release, environment promotion, container/PaaS rollout, Kubernetes rollout, rollback response, and release hardening.
  4. Route-outs to `workflow-automation`, `system-environment-setup`, `monitoring-observability`, and `vercel-deploy` remain explicit.
  5. Compact and support surfaces stay in sync with the shortened front door.
- Validation prompts: preview deploy confusion, staging-to-production promotion, Kubernetes rollout strategy choice, rollback after failed release, provider-specific Vercel route-out.

## Constraints
- Max one coherent skill-upgrade change set this run.
- No new overlapping deployment wrapper.
- Prefer structural cleanup and truthful routing over expanding command catalogs.
- Keep claims grounded in repo-local evidence or primary-source docs.

## Tried Already
- Keep: repo-wide pattern of shrinking oversized `SKILL.md` files into routing-first front doors with focused references.
- Revert: adding nearby wrapper skills when a dense canonical anchor can be improved in place.
- Why: the graph and wiki both show that boundary cleanup beats catalog growth when support coverage is already complete.
