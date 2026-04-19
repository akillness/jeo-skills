# Loop Charter

## Goal
Improve the existing `standup-meeting` skill so it matches the repo's routing-first / packet-first PM-cluster pattern without expanding scope or creating another overlapping ceremony skill.

## Current Baseline
- `standup-meeting/SKILL.md` is valid and already modernized around daily coordination mode selection.
- The skill is still denser than the newer structural-hardening passes in the same cluster.
- `SKILL.toon` is stale and undersells the skill as a generic standup helper.
- The PM cluster has already structurally hardened `task-planning`, `task-estimation`, and `sprint-retrospective`, so `standup-meeting` is the obvious remaining anchor.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/standup-meeting/SKILL.md`

Supporting artifacts may change only if the revised `SKILL.md` requires them for correctness or discovery sync:
- `.agent-skills/standup-meeting/references/*`
- `.agent-skills/standup-meeting/evals/evals.json`
- `.agent-skills/standup-meeting/SKILL.toon`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph artifacts required by the maintenance loop

## Fixed Evaluation Harness
- Survey evidence in `.survey/standup-meeting-structural-hardening-20260419/`
- Agent Skills spec and repo conventions
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/standup-meeting`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Qualitative checks:
  - sharper trigger wording and route-outs than baseline
  - one clear daily-coordination packet shape
  - no overlap creep into planning / estimation / retrospective / incident work
  - compact surfaces (`SKILL.toon`, manifest/docs descriptions) reflect the new boundary

## Constraints
- Max one primary skill hardening this run
- No new skill unless the current skill fails the boundary test
- Prefer shrinking / clarifying over expanding examples
- Keep changes transferable across software, product/ops, and game-delivery teams
- Preserve existing support coverage or improve it; do not reduce eval/reference quality

## Tried Already
- Keep: 2026-04-12 modernization into a mode-selecting daily-sync skill
- Keep: existing `references/facilitation-modes.md` and baseline eval coverage
- Revert: any move that broadens daily coordination into backlog planning, estimation, retros, or generic management reporting
- Why: the PM cluster already has sharper owners for those adjacent jobs
