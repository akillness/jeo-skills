# Loop Charter

## Goal
Improve `code-refactoring` so its front door is smaller, more trigger-precise, and aligned with the repository's compact/discovery surfaces without weakening the behavior-preserving refactor contract.

## Current Baseline
- `code-refactoring/SKILL.md` is 292 lines and still reads longer than neighboring routing-first hardening passes.
- `code-refactoring/SKILL.toon` and `.agent-skills/skills.toon` still advertise a legacy generic design-pattern / SOLID framing.
- README / README.ko / setup prompt already reflect the modernized role better than the compact discovery surfaces.

## Mutable Artifact
Primary file: `.agent-skills/code-refactoring/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing query/context from `.agent-skills-wiki/queries/code-refactoring-modernization-2026-04-14.md`
- Structural evidence from `graphify-out/GRAPH_REPORT.md`
- Representative prompts in `.agent-skills/code-refactoring/evals/evals.json`
- Sync checks for `SKILL.toon`, `skills.json`, `skills.toon`, README.md, README.ko.md, and `setup-all-skills-prompt.md`

## Constraints
- Max one bounded skill lane this run
- Prefer shrinking / tightening over adding adjacent wrappers
- Keep `code-refactoring` distinct from `debugging`, `code-review`, `testing-strategies`, `performance-optimization`, and `codebase-search`
- Add support material only if it improves routing clarity or eval usefulness
- Preserve repo conventions and route-out honesty

## Tried Already
- Keep: 2026-04-14 modernization that reframed the skill around local safe refactor, behavior freeze first, and repetitive migration / codemod modes.
- Revert: adding another generic cleanup wrapper; folding diagnosis/review/test policy/perf work into the same skill.
- Why: the durable gap now is structural hardening and discovery-surface sync, not another new skill.
