# Loop Charter

## Goal
Improve `testing-strategies` so it distinguishes merge-gate truth, release-only proof, scheduled breadth, and platform launch handoffs more explicitly without creating a new overlapping skill.

## Current Baseline
Baseline artifact: `.agent-skills/testing-strategies/SKILL.md` at version 2.1 with existing support files and 4 eval cases.
Current quality: good packet-first structure, but still somewhat broad around branch-blocking checks vs release/platform checklist ownership.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/testing-strategies/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec and repo validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing repo discovery surfaces must remain truthful if wording changes materially: `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`
- Dry-run prompts must still activate the right lane for:
  1. flaky PR suite policy
  2. API + DB migration merge gate
  3. release-readiness question
  4. accessibility-heavy validation boundary
  5. game/platform release checklist boundary

## Constraints
- Max one bounded improvement theme this run: sharpen gate-truth and release handoff boundaries.
- Keep the code-quality lane split intact: do not absorb `backend-testing`, `deployment-automation`, `steam-store-launch-ops`, `game-ci-cd-pipeline`, or `web-accessibility`.
- Prefer shrinking or clarifying the front door over adding more tutorial bulk.
- Keep support changes minimal and directly tied to the same theme.

## Tried Already
- Keep: packet-first structural hardening on 2026-04-19.
- Revert: adding adjacent QA/release wrappers instead of strengthening the existing front door.
- Why: graph + wiki history show the lane split is already correct; the remaining win is contract clarity, not catalog growth.
