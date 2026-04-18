# Loop Charter

## Goal
Improve `marketing-automation` so it behaves as a clearer routing-first marketing front door with tighter trigger quality, one-mode packet selection, stronger route-outs, and better transfer across product/growth marketing asks.

## Current Baseline
Current best version: `.agent-skills/marketing-automation/SKILL.md` on `main`.
Strengths: canonical router, existing references/evals, alias support via `marketing-skills-collection`.
Weaknesses to test: broad lane inventory, limited operating-mode selection, weak route-outs to adjacent planning/content/game-launch lanes, and a packet contract that may still be too generic.

## Mutable Artifact
Primary file: `.agent-skills/marketing-automation/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing supporting surfaces that must stay synced if materially affected: `SKILL.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`
- Dry-run prompts: broad launch ask, pricing-page refresh ask, lifecycle/onboarding ask, and legacy alias ask
- Scoring rubric:
  1. Trigger precision improves without widening overlap with planning/game-launch/content specialists
  2. One primary mode + one packet contract is obvious
  3. Route-outs and measurement handoffs are explicit
  4. Supporting references/evals stay consistent

## Constraints
- Keep this a bounded structural-hardening pass, not a brand-new marketing suite
- Prefer one meaningful front-door change set over many unrelated edits
- Do not add a new overlapping general marketing skill
- Keep claims grounded in repo evidence plus source-backed survey notes

## Tried Already
- Keep: canonicalize `marketing-automation` and narrow `marketing-skills-collection` into an alias
- Keep: alias support hardening for `marketing-skills-collection`
- Revert: reviving the old broad multi-skill catalog shape
- Why: the repo already chose a canonical general marketing router; the remaining gap is front-door sharpness, not another layer of marketing wrappers
