# Loop Charter

## Goal
Improve the creative-media lane by replacing the duplicate `video-production` / `remotion-video-production` pair with a canonical-plus-alias structure that is easier to trigger, easier to maintain, and better supported.

## Current Baseline
- `video-production` and `remotion-video-production` have near-identical content and identical catalog descriptions.
- Neither skill has `references/` or `evals/`.
- README / README.ko / setup prompt list both as equal peers.

## Mutable Artifact
Primary: `.agent-skills/video-production/SKILL.md`

Supporting context that may change if the primary ratchet wins:
- `.agent-skills/remotion-video-production/SKILL.md`
- support bundles under both skills
- discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)
- survey/wiki/graph artifacts

## Fixed Evaluation Harness
- Agent Skills structure + frontmatter requirements
- trigger quality: canonical skill must clearly own broad programmable-video requests; alias must clearly resolve to canonical behavior
- bounded dry-run usefulness via `evals/evals.json`
- docs surfaces must reveal the canonical-vs-alias relationship

## Constraints
- One bounded improvement set for this run; no new extra video skills
- Prefer consolidation over expansion
- Keep the canonical skill transferable across Remotion and nearby automation workflows
- Update docs and durable memory artifacts in the same branch if positioning changes

## Tried Already
- Keep: merge-ready PR #42 for `performance-optimization` was reviewed and merged before new work began
- Revert: none yet for this run
