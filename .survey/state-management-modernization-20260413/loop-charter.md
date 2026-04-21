# Loop Charter

## Goal
Improve the `state-management` skill so it routes frontend/fullstack React requests into the correct state lane and gives a modern, transferable decision workflow instead of a long example dump.

## Current Baseline
Current `state-management/SKILL.md` is a legacy library-tour skill (~550 lines) centered on Context / Redux / Zustand examples. It lacks `references/` and `evals/`, and its description is broad enough to over-trigger on generic frontend requests.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/state-management/SKILL.md`

Supporting artifacts allowed if the primary skill change is accepted:
- `.agent-skills/state-management/references/*`
- `.agent-skills/state-management/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph outputs tied to this run

## Fixed Evaluation Harness
- Agent Skills spec compliance (`name`, trigger-oriented description, standard sections, manageable length)
- Trigger quality: should activate on state-boundary / global-state / Context vs Zustand vs Redux Toolkit / server-state vs client-state requests without over-triggering on unrelated frontend work
- Execution clarity: deterministic decision tree, explicit route-outs, concrete library-selection criteria
- Dry-run prompts:
  1. "Should this React dashboard use Zustand or TanStack Query for API data and modal state?"
  2. "I keep prop drilling theme and auth through five layers; do I need Redux?"
  3. "We have a complex cross-page workflow, optimistic updates, and debugging needs; which state approach fits?"
- Validation artifacts required if kept: at least one reference file and `evals/evals.json`

## Constraints
- Keep the run bounded to one main skill modernization, not a broader frontend-cluster rewrite
- Prefer consolidation over adding a new overlapping skill
- Update discovery/setup docs because the change materially affects positioning and usage
- No speculative framework churn or trend-chasing beyond evidence gathered this run

## Tried Already
- Keep: prior frontend canonicalization work for React and design-system skills
- Revert: adding overlapping frontend wrappers when a legacy anchor could be upgraded instead
- Why: the repo has been improving more reliably through canonical-anchor upgrades than by adding neighbors
