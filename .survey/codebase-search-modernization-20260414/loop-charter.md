# Loop Charter

## Goal
Upgrade `codebase-search` into a reusable repo-navigation / impact-mapping anchor with clearer trigger boundaries, support bundles, and discovery wording.

## Current Baseline
- Primary artifact: `.agent-skills/codebase-search/SKILL.md`
- Current state: high-visibility legacy skill, 500+ lines, command-heavy, no `references/`, no `evals/`
- Adjacent cluster already expects a clean search-only handoff from `code-refactoring` and other code-quality skills.

## Mutable Artifact
Exactly one primary file: `.agent-skills/codebase-search/SKILL.md`

Supporting files allowed if the primary rewrite is kept:
- `.agent-skills/codebase-search/references/*.md`
- `.agent-skills/codebase-search/evals/evals.json`
- discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`) if the repositioning materially changes activation
- survey/wiki/graph artifacts required by the maintenance loop

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Trigger quality: should activate for repo navigation, call-site tracing, code archaeology, impact analysis, and pre-change discovery
- Boundary quality: should route diagnosis to `debugging` / `log-analysis`, structural cleanup to `code-refactoring`, graph-backed architecture mapping to `graphify`
- Dry-run checks:
  1. “Find where auth is implemented and what files I need to inspect before changing it.”
  2. “Trace all call sites of this function and summarize impact before refactoring.”
  3. “Search this monorepo for config ownership and entry points.”
  4. “I need syntax-aware matching, not plain text.”
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/codebase-search`
  - `python3 -m json.tool .agent-skills/codebase-search/evals/evals.json`

## Constraints
- Keep the run bounded to one coherent modernization target.
- Prefer transferable workflow guidance over tool-specific trivia.
- Add support files only if they sharpen reuse.
- Update discovery docs only where the new positioning materially changes wording.
- No new overlapping skill in this run.

## Keep / Revert Criteria
- **Keep** if the skill becomes shorter, clearer, more routeable, and gains durable support files plus validation coverage.
- **Revert** if the rewrite stays generic, duplicates adjacent skills, or fails validation.

## Tried Already
- Keep: modernize adjacent search-analysis and code-quality anchors (`log-analysis`, `debugging`, `code-review`, `code-refactoring`, `performance-optimization`)
- Revert: adding another overlapping wrapper instead of upgrading existing anchors
- Why: the catalog improves faster when high-traffic legacy anchors are modernized in place
