# Loop Charter

## Goal
Improve frontend skill discoverability by reducing duplicate trigger ambiguity in the React/Next.js performance lane.

## Current Baseline
`react-best-practices` and `vercel-react-best-practices` present near-identical descriptions in the catalog while the variant already implies the generic skill is canonical. The canonical skill has deep guidance but no eval coverage, and both React skills still use non-standard section headings.

## Mutable Artifact
Primary artifact: the React-skill discoverability bundle centered on `.agent-skills/react-best-practices/SKILL.md`.

Supporting context/files allowed for the same bounded change:
- `.agent-skills/vercel-react-best-practices/SKILL.md`
- `.agent-skills/react-best-practices/evals/evals.json`
- `.agent-skills/vercel-react-best-practices/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`

## Fixed Evaluation Harness
- Agent Skills frontmatter/section validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger-quality rubric:
  - canonical skill should clearly own general React/Next performance work
  - variant skill should read as a compatibility alias, not a peer default
  - README/setup/manifest should reflect the new canonical/alias boundary
- Support-file gate:
  - add evals only if they materially improve repeatability and split/merge confidence

## Constraints
- Keep the run bounded to the React duplicate pair; do not broaden into the design-system pair in the same iteration.
- Do not create a new skill.
- Do not remove stable names abruptly; prefer compatibility aliasing over deletion.
- Keep the docs/setup changes minimal but explicit.

## Tried Already
- Keep: survey-first diagnosis of duplicate frontend surfaces.
- Keep: canonical-plus-alias direction for the React pair.
- Revert: none yet this run.
- Why: this is the smallest high-signal change set that improves discoverability without risky deletion.
