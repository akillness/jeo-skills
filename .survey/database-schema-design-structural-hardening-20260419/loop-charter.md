# Loop Charter

## Goal
Improve `database-schema-design` so it triggers more reliably as a routing-first storage-design skill and stays clearly separated from API, auth, testing, reporting, and observability neighbors.

## Current Baseline
Current best version is `.agent-skills/database-schema-design/SKILL.md` on `main` after the 2026-04-14 modernization pass. It is useful but still oversized (~282 lines) and its compact/manifest discovery surfaces are materially behind the live trigger boundary.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/database-schema-design/SKILL.md`

Supporting artifacts (only if the primary change proves worthwhile):
- `.agent-skills/database-schema-design/references/intake-packets-and-route-outs.md`
- `.agent-skills/database-schema-design/evals/evals.json`
- `.agent-skills/database-schema-design/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- survey / wiki / graph outputs

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/database-schema-design`
- JSON validity for `.agent-skills/skills.json` and `.agent-skills/database-schema-design/evals/evals.json`
- Dry-run usefulness rubric:
  1. clearly classifies one storage-design lane / packet
  2. preserves route-outs to `api-design`, `authentication-setup`, `backend-testing`, `looker-studio-bigquery`, and `monitoring-observability` when relevant
  3. broadens domain transfer across backend/fullstack, product/ops, marketing/customer-data, and game/live-ops without adding another wrapper
  4. improves compact/discovery-surface truthfulness

## Constraints
- Max one coherent improvement set in this run
- Prefer shrinking / clarifying over adding new top-level skills
- Do not change evaluator criteria mid-run
- Keep changes repo-native and reusable

## Tried Already
- Keep: 2026-04-14 modernization rewrite plus initial support files
- Revisit now: structural hardening + derived-surface sync
- Avoid: adding another schema wrapper or absorbing adjacent concerns
