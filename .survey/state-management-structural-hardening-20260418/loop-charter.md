# Loop Charter

## Goal
Improve the existing `.agent-skills/state-management` skill so it triggers more precisely, routes adjacent concerns out faster, and stays aligned with current React/fullstack state-ownership practice without creating a duplicate skill.

## Current Baseline
- Existing `state-management` skill is ~290 lines with complete support coverage (`references/`, `evals/`, compact variant, manifest/docs presence).
- Graph report still flags it as an oversized front-door candidate.
- Repo already favors bounded structural hardening over creating new overlapping wrappers.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/state-management/SKILL.md`

Supporting artifacts may be updated only if the core skill change is justified:
- `.agent-skills/state-management/references/*`
- `.agent-skills/state-management/evals/evals.json`
- `.agent-skills/state-management/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki/graph survey artifacts documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec compliance (`name`, description quality, standard sections, compact discovery alignment)
- Trigger quality: should activate for React/fullstack state-boundary decisions, not generic debugging/perf/API/component tasks
- Boundary clarity: must clearly route perf work to `react-best-practices`, contract work to `api-design`, diagnosis to `debugging`, and component API work to `ui-component-patterns` / `design-system`
- Dry-run usefulness against representative prompts:
  1. Context vs Zustand vs URL state for dashboard filters and modal coordination
  2. TanStack Query vs client store for optimistic updates and remote entities
  3. Cross-page drafts / workflow state where Redux Toolkit vs Zustand is the question
  4. Near-miss prompt that should route to another skill (responsive/layout or debugging)
- Validation commands:
  - repo validator / relevant skill catalog checks if available
  - JSON validity for `evals.json` and catalog surfaces
  - git diff review for bounded scope

## Constraints
- One bounded improvement set only; no new skill unless the evidence unexpectedly demands it.
- Prefer shrinking or reorganizing the front door over adding more inline examples.
- Preserve canonical skill boundary; do not broaden into router-performance/debug/API-documentation territory.
- Keep the run within a single branch / PR update.

## Tried Already
- Keep: prior modernization of `state-management` into a decision-first ownership skill.
- Revert: any move toward another broad state-library wrapper or a universal-store framing.
- Why: survey and graph evidence show the problem is dense routing/front-door clarity, not missing catalog coverage.
