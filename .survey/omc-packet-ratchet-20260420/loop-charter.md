# Loop Charter

## Goal
Improve the existing `omc` skill so it resolves OMC install/runtime confusion faster, especially around marketplace plugin vs npm CLI vs local-checkout/plugin-dir usage, without expanding OMC ownership beyond Claude-first runtime routing.

## Current Baseline
`omc` is already packet-first, but its front door still starts at mode selection before enough install-topology truth. Survey evidence shows repeated operator pain comes from mixed plugin+CLI installs, local `--plugin-dir` usage, and setup/update drift.

## Mutable Artifact
Primary: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/omc/SKILL.md`

## Fixed Evaluation Harness
- `.agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/omc`
- `python3 -m json.tool .agent-skills/omc/evals/evals.json >/dev/null`
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Dry-run rubric: does the skill clearly identify install topology, distinguish in-session `/team` from `omc team`, and route long-loop / non-Claude work outward?

## Constraints
- Max one bounded skill ratchet this run.
- No new overlapping orchestration skill.
- Keep `omc` as Claude-first runtime router, not a generic multi-platform orchestrator.
- Supporting file and discovery-surface updates allowed only in service of the primary ratchet.

## Tried Already
- Keep: 2026-04-19 structural hardening into five packets and plugin-vs-CLI truth.
- Revert: adding another orchestration wrapper or flattening `/team` and `omc team`.
- Why: survey and graph data favor sharper front-door routing over new wrappers.
