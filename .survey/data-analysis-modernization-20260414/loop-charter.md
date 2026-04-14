# Loop Charter

## Goal
Improve `data-analysis` into a reusable, high-signal analysis workflow skill that activates reliably for real dataset work across product, marketing, operations, developer workflow, and game analytics contexts.

## Current Baseline
The existing skill is a generic code-heavy cheat sheet. It lacks support files, has weak workflow structure, blurs boundaries with `pattern-detection` and dashboard-specific skills, and does not give agents a deterministic decision path from question framing to evidence-backed recommendations.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/data-analysis/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills structural expectations already enforced in this repo (frontmatter quality, standard sections, description clarity)
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/data-analysis`
- Dry-run prompts:
  1. "Analyze this CSV export and tell me what changed after the pricing experiment."
  2. "We have app event logs and marketing spend by channel; find the main retention and CAC patterns."
  3. "Review this gameplay telemetry extract and summarize balance issues and suspicious outliers."
- Boundary check against adjacent skills: `pattern-detection`, `looker-studio-bigquery`, and `data-analysis` should remain distinguishable.
- Support-file usefulness check: references/evals should materially improve reuse, not exist as filler.

## Constraints
- One bounded improvement set for this run; do not broaden into multiple analytics skills.
- Keep changes transferable across domains rather than tool/vendor-specific.
- Update README.md / README.ko.md / setup-all-skills-prompt.md if positioning/discoverability changes materially.
- Save survey, wiki, and graph artifacts for durable reuse.
- Keep or revert based on the fixed evaluation harness.

## Tried Already
- Keep: repeated pattern of modernizing weak high-utility legacy skills with stronger triggers + support bundles + doc updates.
- Revert: adding overlapping wrapper skills when a canonical existing skill can be upgraded instead.
- Why: the repo improves faster via stronger anchors and cleaner boundaries than via catalog growth.
