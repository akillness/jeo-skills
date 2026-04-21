# Loop Charter

## Goal
Improve `obsidian-cli` so it behaves like a tighter routing-first front door for official Obsidian desktop automation, URI handoff, and explicit route-outs for headless or plugin/API-heavy note workflows.

## Current Baseline
- Primary file: `.agent-skills/obsidian-cli/SKILL.md`
- Baseline validator status: pass (`validate_skill.sh` reports 0 errors / 0 warnings)
- Baseline size: `SKILL.md` = 286 lines
- Current weakness: the skill still reads like a long command tour, mixes CLI / URI / headless boundary guidance, and contains stale installation/troubleshooting detail compared with current official docs.

## Mutable Artifact
Exactly one primary file: `.agent-skills/obsidian-cli/SKILL.md`

Supporting context that may be updated only to keep the primary change truthful and discoverable:
- `.agent-skills/obsidian-cli/references/*`
- `.agent-skills/obsidian-cli/scripts/*`
- `.agent-skills/obsidian-cli/evals/evals.json`
- `.agent-skills/obsidian-cli/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/obsidian-cli`
- Description/trigger quality check: must clearly say when to use the official desktop CLI and when to route to URI / headless / adjacent alternatives.
- Survey evidence from:
  - `.survey/obsidian-cli-structural-hardening-20260419/context.md`
  - `.survey/obsidian-cli-structural-hardening-20260419/solutions.md`
  - `.survey/obsidian-cli-structural-hardening-20260419/platform-map.md`
- Dry-run prompts to preserve:
  1. enable/verify CLI registration
  2. vault/path targeting question
  3. daily-note append with copy/output
  4. plugin reload / developer workflow
  5. URI callback workflow
  6. desktop-free sync/headless route-out

## Constraints
- Max one bounded maintenance pass this run; no new overlapping skill.
- Keep the skill truthfully scoped to official CLI + URI-adjacent routing, not generic note automation.
- Prefer moving detail into references rather than growing `SKILL.md`.
- Update discovery/setup surfaces if the positioning changes materially.
- Keep or revert based on whether the new version is clearer, shorter, and better routed under the same validator + prompt set.

## Tried Already
- Keep: survey first, using wiki + graph evidence to choose an oversized unchanged front-door skill.
- Pending hypothesis: shrinking `obsidian-cli` into packet-first routing, refreshing stale install guidance, and adding an explicit route-out reference will improve trigger precision without creating another note-automation wrapper.
