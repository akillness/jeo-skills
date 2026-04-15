# Loop Charter

## Goal
Upgrade `google-workspace` into a clearer, reusable Google Workspace operations skill with bounded routing guidance, durable support files, and a smaller spec-compliant `SKILL.md`.

## Current Baseline
- Existing `SKILL.md` is 745 lines, missing `## Instructions`, `## Examples`, and `## Best practices` per validator.
- The skill has `evals/` and `SKILL.toon`, but no `references/` support bundle.
- Discovery copy in README / README.ko / setup / skills manifests still presents the skill as broad REST API coverage rather than a decision-first Workspace operations router.

## Mutable Artifact
Primary: `.agent-skills/google-workspace/SKILL.md`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/google-workspace`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- `python3 -m json.tool .agent-skills/google-workspace/evals/evals.json`
- Manual checks: description trigger quality, route-outs between Apps Script / REST / Admin SDK, supporting references added, docs/manifests aligned if positioning changes materially.

## Constraints
- One bounded run; no new overlapping Google productivity skill.
- Prefer upgrading the existing skill over adding wrappers for Zapier / Make / n8n.
- Keep claims source-backed with official Google docs and clearly labeled indexed snippets where needed.
- Keep the rewritten `SKILL.md` below the prior 745-line sprawl and closer to spec-friendly size.

## Tried Already
- Keep: support-gap-first modernization loop for legacy anchors.
- Revert: adding noisy duplicate wrapper skills when an indexed legacy anchor can be upgraded instead.
- Why: support upgrades transfer better across future maintenance runs and reduce duplicate discovery surfaces.