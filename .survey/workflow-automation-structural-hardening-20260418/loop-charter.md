# Loop Charter

## Goal
Improve `workflow-automation` so it triggers more precisely as a repo-scoped automation router, stays smaller than the current front door, and hands off cleanly to neighboring skills without creating a new overlapping automation wrapper.

## Current Baseline
- Primary file: `.agent-skills/workflow-automation/SKILL.md`
- Current length: 273 lines
- Existing support coverage: `references/`, `evals/`, and `SKILL.toon` already exist
- Current strengths: good modernization baseline, clear repo-local scope, existing mode taxonomy
- Current weaknesses: front door is still relatively long, route-outs are split across references, and the packet/routing contract can be made sharper and more compact

## Mutable Artifact
- Primary mutable artifact: `.agent-skills/workflow-automation/SKILL.md`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/workflow-automation`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Support-symmetry check: `SKILL.md`, `SKILL.toon`, README.md, README.ko.md, setup-all-skills-prompt.md, and manifest wording stay aligned if trigger surface changes
- Dry-run rubric:
  1. Trigger quality: clearly fires on repo-local recurring workflow asks
  2. Boundary quality: routes environment setup / deployment / Git / testing policy away cleanly
  3. Execution clarity: produces a packet-first outcome with explicit modes and surfaces
  4. Transferability: still works across CLI, frontend, backend, fullstack, and game repos

## Constraints
- Max time per iteration: one bounded maintenance pass in this cron run
- Max scope: one existing skill plus directly affected support/discovery/wiki/graph artifacts
- Forbidden edits: no new overlapping automation skill; no broad repo-wide refactors unrelated to this lane
- Output requirements: survey artifacts, validated skill changes, synced discovery surfaces, wiki update, PR lifecycle handled cleanly

## Tried Already
- Keep: 2026-04-13 modernization pass established the repo-scoped automation anchor with references and evals
- Revisit now: structural hardening if a smaller routing-first front door clearly improves activation and usability
- Revert condition: if the smaller front door weakens trigger clarity or creates discovery drift, keep the current baseline
