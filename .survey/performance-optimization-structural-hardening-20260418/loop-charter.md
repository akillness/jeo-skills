# Loop Charter

## Goal
Improve the existing `performance-optimization` skill so it stays a compact routing-first measurement-led tuning anchor and no longer leaks stale generic discovery wording through compact/manifest surfaces.

## Current Baseline
- `performance-optimization/SKILL.md` is already modernized, but still a relatively dense front door at 249 lines.
- `performance-optimization/SKILL.toon` is still a 14-line legacy compact summary with stale generic language.
- Graph findings still prioritize shrinking high-degree front doors and syncing discovery surfaces instead of adding new wrappers.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/performance-optimization/SKILL.md`

Supporting artifacts may be updated only if the SKILL.md change proves useful:
- `.agent-skills/performance-optimization/SKILL.toon`
- `.agent-skills/performance-optimization/references/*.md`
- `.agent-skills/performance-optimization/evals/evals.json`
- discovery/catalog surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey / wiki / graph outputs

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/performance-optimization`
- Catalog/runtime sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- Trigger/usefulness rubric:
  - keeps `performance-optimization` distinct from `monitoring-observability`, `debugging`, `code-refactoring`, `testing-strategies`, and `game-performance-profiler`
  - improves artifact-first intake clarity across CLI/dev, web/fullstack, product/ops, marketing/content, and game-adjacent cases
  - keeps recommendations bounded and routing-first
  - syncs compact/discovery wording with the canonical front door
- JSON validity checks for changed machine-readable files

## Constraints
- Max one bounded skill pass in this run; do not create a new overlapping performance skill.
- Prefer shrinking / clarifying / syncing over adding more prose.
- Preserve vendor-neutral measurement-led positioning.
- Keep README/setup updates limited to wording that materially changes discoverability.
- Refresh graph/wiki only insofar as they preserve durable structural memory for this pass.

## Tried Already
- Keep: 2026-04-14 modernization established the measurement-led tuning anchor with references and evals.
- Revert: adding another generic performance wrapper; merging observability, debugging, refactoring, or engine-specific profiling into this skill.
- Why: repo history and graph evidence show the durable win is a stronger canonical anchor with sharper boundaries, not more wrappers.
