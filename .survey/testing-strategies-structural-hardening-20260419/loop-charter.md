# Loop Charter

## Goal
Improve `testing-strategies` so it behaves like a routing-first, packet-based policy front door instead of a broad testing explainer.

## Current Baseline
`testing-strategies/SKILL.md` already has solid support coverage (`references/`, `evals/`, `SKILL.toon`) and good boundaries, but the front door is still oversized and not yet aligned with the repo’s newer packet-first structural-hardening pattern.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/testing-strategies/SKILL.md`

Supporting artifacts allowed only if they directly reinforce the same change:
- `.agent-skills/testing-strategies/references/intake-packets-and-route-outs.md`
- `.agent-skills/testing-strategies/evals/evals.json`
- `.agent-skills/testing-strategies/SKILL.toon`
- discovery/setup surfaces that must reflect the updated trigger surface (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)
- survey/wiki/graph artifacts for durable run memory

## Fixed Evaluation Harness
- Agent Skills spec / `validate_skill.sh`
- repo catalog sync validator: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- dry-run rubric:
  - does the skill start from the packet already in hand?
  - does it choose one primary mode instead of a giant manifesto?
  - are route-outs to `backend-testing`, `debugging`, `code-review`, `web-accessibility`, and `performance-optimization` explicit?
  - does the output contract stay concise and action-ready?
- regression expectation: no duplicate skill creation; no weakening of existing support files

## Constraints
- Max one coherent skill improvement set this run
- No new overlapping code-quality skill
- Keep the front door under the 500-line guideline and preferably smaller than baseline
- Sync compact/discovery surfaces only if the trigger surface materially changes
- Keep source-backed survey notes under `.survey/testing-strategies-structural-hardening-20260419/`

## Tried Already
- Keep: 2026-04-13 modernization pass that established risk tiers, validation layers, and route-outs
- Revert: adding another overlapping testing wrapper or collapsing implementation/debugging/review into the same skill
- Why: the cluster already wants denser front-door cleanup, not more catalog growth
