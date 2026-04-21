# Loop Charter

## Goal
Modernize `ohmg` into a reliable Gemini CLI / Antigravity entry skill for `oh-my-agent`, with clear boundaries to `omc` and `omx` and support files that reduce future drift.

## Current Baseline
`ohmg` is a short legacy skill with outdated repo naming (`oh-my-ag`), outdated commands (`bunx oh-my-ag`, `/coordinate`), and no `references/` or `evals/`. It understates the modern `.agents` source-of-truth model and overstates Gemini/Antigravity symmetry.

## Mutable Artifact
Primary: `.agent-skills/ohmg/SKILL.md`

Supporting context allowed this run:
- `.agent-skills/ohmg/references/*`
- `.agent-skills/ohmg/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.survey/ohmg-modernization-20260415/*`
- `.agent-skills-wiki/*`
- `graphify-out/*` only if structural refresh materially helps this run

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/ohmg`
- `python3 -m json.tool .agent-skills/ohmg/evals/evals.json >/dev/null`
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- Trigger-quality check against representative prompts:
  1. "Set up oh-my-agent for Gemini CLI"
  2. "Use Antigravity with a portable multi-agent harness"
  3. "I need Gemini-native agents but may later route work to Claude or Codex"
  4. "Should I use ohmg, omc, or omx for this workflow?"
- Boundary check: the skill must route Claude-first runtime questions to `omc` and Codex-first runtime questions to `omx` instead of absorbing their full mode catalogs.

## Constraints
- One bounded improvement set for the `ohmg` lane only
- No new overlapping orchestration skill
- Keep claims source-backed to upstream docs/repo evidence gathered this run
- Prefer transferable positioning and support files over exhaustive command dumping
- Update discovery/setup docs because the skill positioning materially changes

## Tried Already
- Keep: modernize legacy high-visibility anchors instead of creating adjacent wrapper skills
- Keep: add references/evals when a skill lacks durable support material
- Revert: inventing a second overlapping skill instead of fixing the stale anchor
- Revert: leaving top-level discovery docs stale after changing a skill's role
