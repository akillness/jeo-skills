# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/technical-writing` without adding another overlapping documentation skill.

## Current Baseline
- Primary mutable artifact: `.agent-skills/technical-writing/SKILL.md`
- Baseline quality: the lane boundary is already correct, but the front door is 320 lines, contains duplicated mode/template detail, and has a malformed route-out section.
- Existing support: `references/document-modes-and-boundaries.md`, `references/quality-checklists.md`, `references/docs-as-code-and-maintenance.md`, `evals/evals.json`, `SKILL.toon`

## Mutable Artifact
Exactly one primary file: `.agent-skills/technical-writing/SKILL.md`

Supporting files may be updated only if needed to keep the main skill truthful and discoverable:
- `references/*`
- `evals/evals.json`
- `SKILL.toon`
- `.agent-skills/skills.json`
- wiki / survey / graph artifacts tied to this run

## Fixed Evaluation Harness
- Agent Skills structural validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/technical-writing`
- Catalog/runtime sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Diff sanity via `git diff --check`
- Frozen rubric for this run:
  1. `SKILL.md` stays under 500 lines and becomes materially shorter than the 320-line baseline.
  2. Trigger wording remains focused on internal technical docs rather than drifting into API portals, end-user docs, release notes, decks, or marketing copy.
  3. The front door keeps one-primary-mode discipline across spec, architecture, ADR, runbook, migration, and internal-guide work.
  4. Route-outs to `api-documentation`, `user-guide-writing`, `changelog-maintenance`, `presentation-builder`, `research-paper-writing`, and `marketing-automation` remain explicit.
  5. Compact and eval surfaces stay in sync with the shortened front door.
- Validation prompts: technical spec, ADR, operator runbook, end-user tutorial, API doc portal, release-notes request.

## Constraints
- Max one coherent skill-upgrade change set this run.
- No new overlapping documentation wrapper.
- Prefer structural cleanup and truthful routing over more examples or bigger templates.
- Keep claims grounded in repo-local evidence or primary-source docs.

## Tried Already
- Keep: repo-wide pattern of shrinking oversized `SKILL.md` files into routing-first front doors with focused references.
- Revert: adding nearby wrapper skills when a dense canonical anchor can be improved in place.
- Why: the graph and wiki both show that boundary cleanup beats catalog growth once support coverage is already complete.