# Loop Charter

## Goal
Improve `task-estimation` so it matches the repo's routing-first hardening pattern: one primary estimation mode, one compact estimate packet, explicit route-outs, and synced discovery surfaces.

## Current Baseline
Baseline files:
- `.agent-skills/task-estimation/SKILL.md`
- `.agent-skills/task-estimation/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

Baseline quality:
- `task-estimation/SKILL.md` is useful but still oversized (~278 lines) compared with the newer PM-cluster hardening pattern.
- `task-estimation/SKILL.toon` and `.agent-skills/skills.toon` are stale legacy summaries and no longer match the live skill.
- README/setup wording is current but still flatter than the intended packet-first boundary.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/task-estimation/SKILL.md`

Supporting artifacts allowed in the same run:
- `.agent-skills/task-estimation/SKILL.toon`
- `.agent-skills/task-estimation/references/`
- `.agent-skills/task-estimation/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: must clearly route planning to `task-planning`, daily coordination to `standup-meeting`, and reflection to `sprint-retrospective`
- Structural goal: reduce front-door sprawl, keep one primary estimation mode per run, and preserve forecast-safe language
- Dry-run prompts: existing evals plus at least one cross-functional/product or game-oriented packet check
- Docs/discovery sync: `skills.json`, `skills.toon`, README surfaces, and `SKILL.toon` must all reflect the new trigger surface

## Constraints
- Max one coherent improvement set this run
- No new overlapping PM skill
- Prefer shrinking/routing over adding broad new content
- Keep support-file additions bounded and directly useful
- Preserve truthful route-outs and anti-misuse language

## Tried Already
- Keep: 2026-04-12 modernization that turned `task-estimation` into the PM cluster sizing anchor with references and evals
- Revert: adding another forecasting/planning wrapper or folding estimation into `task-planning`
- Why: the repo benefits more from tighter boundaries and synced discovery surfaces than from catalog growth
