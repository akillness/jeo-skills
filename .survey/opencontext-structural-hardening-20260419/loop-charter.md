# Loop Charter

## Goal
Improve the existing `opencontext` skill so it behaves like a routing-first active project-memory front door with clearer packet selection, honest route-outs, and cleaner derived discovery surfaces.

## Current Baseline
- Current best artifact: `.agent-skills/opencontext/SKILL.md`
- Current state: solid modernization pass exists, but the skill is still 270 lines, lacks a dedicated intake/route-out packet reference, and some derived catalog surfaces still carry older command-heavy wording or stale `utilities/opencontext` source paths.
- Good enough today: strong boundary against `llm-wiki` and `graphify`, support files and evals already exist.
- Gaps worth fixing now: oversized front door, weaker route-out packet, and discovery/manifest drift.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/opencontext/SKILL.md`

Supporting artifacts allowed only if they directly support the same hypothesis:
- `.agent-skills/opencontext/SKILL.toon`
- `.agent-skills/opencontext/references/*`
- `.agent-skills/opencontext/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `.survey/opencontext-structural-hardening-20260419/*`
- `.agent-skills-wiki/*`
- `graphify-out/*` if the structural snapshot materially changes

## Fixed Evaluation Harness
- Agent-skill structure and trigger quality via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/opencontext`
- JSON validity via `python3 -m json.tool .agent-skills/skills.json >/dev/null` and `python3 -m json.tool .agent-skills/opencontext/evals/evals.json >/dev/null`
- Compact/discovery sync via targeted repo search for `opencontext` in `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, and `.agent-skills/skills.toon`
- Dry-run usefulness rubric (frozen for this run):
  1. skill selects one primary mode / packet instead of dumping all commands
  2. skill clearly routes wiki / graph / vault / repo-packer requests away from `opencontext`
  3. skill explains load → search → store loop without bloating the front door
  4. derived discovery surfaces reflect the tightened wording truthfully

## Constraints
- Max time per iteration: one bounded maintenance pass this run
- Max scope: improve the existing `opencontext` lane only; do not broaden into `llm-wiki`, `graphify`, or orchestration skill rewrites
- Forbidden edits: no new overlapping memory wrapper skill; no evaluator drift mid-run; no direct edits to main branch
- Output requirements: keep the skill routing-first, source-backed, and synced across compact/discovery surfaces

## Tried Already
- Keep: the 2026-04-15 modernization that established `opencontext` as the active repo/project memory layer distinct from wiki, graph, and human-vault lanes.
- Revert: adding another memory wrapper or re-expanding `opencontext` into a giant command catalog.
- Why: the repo-wide graph and wiki already show the value is in tighter boundaries and more truthful route-outs, not new overlap.
