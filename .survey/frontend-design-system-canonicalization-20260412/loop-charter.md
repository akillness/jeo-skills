# Loop Charter

## Goal
Improve frontend skill discoverability by removing duplicate trigger ambiguity in the design-system lane while preserving backward compatibility.

## Current Baseline
`design-system` and `frontend-design-system` currently present near-identical descriptions and almost identical guidance in the catalog. `frontend-design-system` already hints that `design-system` is preferred, but README/setup/manifest still expose both as peer frontend skills and neither skill has eval coverage proving the intended boundary.

## Mutable Artifact
Primary artifact: the design-system discoverability bundle centered on `.agent-skills/design-system/SKILL.md`.

Supporting files allowed for this bounded change:
- `.agent-skills/frontend-design-system/SKILL.md`
- `.agent-skills/design-system/evals/evals.json`
- `.agent-skills/frontend-design-system/evals/evals.json`
- `.agent-skills/design-system/references/scope-boundaries.md`
- `.agent-skills/skill-standardization/SKILL.md`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/design-system`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/frontend-design-system`
- Trigger-quality rubric:
  - `design-system` should clearly own general UI system / design-token / frontend UI architecture work
  - `frontend-design-system` should read as a compatibility alias, not a peer default
  - README/setup/manifest should reflect canonical-vs-alias status
- Support-file gate:
  - add evals only if they improve repeatability and make duplicate handling easier next run
  - add references only if they sharpen routing boundaries instead of repeating the full skill body

## Constraints
- Keep the run bounded to the design-system pair plus the reusable standardization guidance needed to support the same duplicate-handling pattern.
- Do not create a brand-new frontend skill.
- Do not hard-delete the alias this run.
- Prefer transferable improvements over one-off wording hacks.

## Tried Already
- Keep: survey-first diagnosis using repo memory, graph report, and inventory surfaces.
- Keep: canonical-skill plus compatibility-alias strategy.
- Revert: none yet this run.
- Why: this is the smallest high-signal change set that improves discoverability and future duplicate handling without risky deletion.
