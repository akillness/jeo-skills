# Loop Charter

## Goal
Improve the practical usefulness of the existing `research-paper-writing` skill without broadening it into generic academic tooling.

## Current Baseline
- `research-paper-writing/SKILL.md` has decent core instructions for abstract, intro, method, experiments, and rebuttals.
- It currently lacks `references/` and `evals/`, so support coverage and regression protection are weaker than nearby documentation-cluster skills.

## Mutable Artifact
Primary: `.agent-skills/research-paper-writing/SKILL.md`

Supporting context only if the primary change is kept:
- `.agent-skills/research-paper-writing/references/*`
- `.agent-skills/research-paper-writing/evals/evals.json`
- `.agent-skills/research-paper-writing/SKILL.toon`
- wiki / graph / survey artifacts documenting the decision

## Fixed Evaluation Harness
- Agent Skills structure and description quality expectations from `skill-standardization`
- Existing documentation-cluster boundary in `.agent-skills-wiki/concepts/documentation-cluster.md`
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/research-paper-writing`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- Dry-run prompts should verify: abstract rewrite, experiment-plan/rebuttal workflow, and route-out behavior to adjacent non-paper skills.

## Constraints
- One bounded improvement set only; no new skill creation.
- Prefer support hardening and trigger clarity over large rewrites.
- Keep the skill specialized for manuscript / rebuttal / evidence packaging.
- Do not rewrite README/setup surfaces unless positioning changes materially.

## Tried Already
- Keep: documentation-cluster modernizations that sharpen route-outs instead of adding wrappers.
- Keep: support-file ratchets (`references/`, `evals/`, compact variant refresh) on existing skills.
- Revert: broadening a specialized skill into a generic umbrella when adjacent cluster anchors already exist.
- Why: transferable maintenance wins come from clearer boundaries and support coverage, not noisy catalog growth.
