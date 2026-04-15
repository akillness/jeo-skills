# Loop Charter

## Goal
Improve the practical usefulness and trigger precision of `firebase-ai-logic` without widening the Firebase AI lane or creating another overlapping skill.

## Current Baseline
- `genkit` is already being modernized in PR #66 into the backend/workflow anchor.
- `firebase-ai-logic` has better trigger wording on the PR branch, but the body is still a legacy install/example dump.
- The skill has no `references/` or `evals/`, so the client-side half of the lane still lacks a ratcheting harness.

## Mutable Artifact
Primary file: `.agent-skills/firebase-ai-logic/SKILL.md`

Supporting files allowed if the primary rewrite justifies them:
- `.agent-skills/firebase-ai-logic/SKILL.toon`
- `.agent-skills/firebase-ai-logic/references/*`
- `.agent-skills/firebase-ai-logic/evals/evals.json`
- discovery/docs files only if positioning/discoverability materially changes

## Fixed Evaluation Harness
- Agent Skills spec and repo-local validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/firebase-ai-logic`
- Catalog sync validator: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger-quality rubric for this run:
  1. clearly routes direct Firebase app/client SDK work to `firebase-ai-logic`
  2. clearly routes server-owned flows / tool calling / RAG / evals to `genkit`
  3. clearly routes project/deploy/CLI operations to `firebase-cli`
  4. adds at least one durable reference file and one eval bundle
  5. removes obviously stale setup guidance

## Constraints
- Keep the scope bounded to the Firebase AI lane follow-up; do not expand into another broad Firebase or provider skill.
- Prefer references/evals and route clarity over large code-snippet catalogs.
- Keep discovery surfaces in sync if wording materially changes.
- Do not modify the evaluation harness mid-run.

## Tried Already
- Keep: modernize `genkit` first and sharpen `firebase-ai-logic` description in the same PR.
- Pending this run: ratchet the client-side skill body/support coverage so the lane is balanced.
