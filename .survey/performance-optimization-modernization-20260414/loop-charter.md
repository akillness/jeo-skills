# Loop Charter

## Goal
Improve `performance-optimization` so it triggers reliably for measurement-led bottleneck analysis and tuning across frontend, backend, database, caching, and game/runtime-adjacent performance work without overlapping `code-refactoring`, `debugging`, `testing-strategies`, or `monitoring-observability`.

## Current Baseline
The current skill is a legacy command/example dump centered on React and database snippets. It lacks support files, evals, explicit route-outs, and a deterministic workflow for measure -> isolate -> tune -> verify.

## Mutable Artifact
Primary: `.agent-skills/performance-optimization/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: description must clearly route measurement-led performance work and exclude adjacent lanes
- Support usefulness: add reusable `references/` and `evals/evals.json`
- Dry-run prompts must cover frontend, backend/database, and route-out cases
- Docs/discovery surfaces updated if positioning changes materially

## Constraints
- One coherent modernization pass only; no second unrelated skill in this run
- Keep the skill under 500 lines
- Prefer transferable heuristics over tool-specific command dumps
- Do not rewrite evaluator/checklist mid-run
- Reuse the active PR slot cleanly: merge prior PR first, then create one new PR if this modernization clears the bar

## Tried Already
- Keep: upgrading legacy anchor skills with support bundles and sharper route-outs
- Revert: adding overlapping wrapper skills instead of fixing the canonical anchor
- Why: prior runs showed that support-backed anchor upgrades improve discoverability and reduce duplicate skills
