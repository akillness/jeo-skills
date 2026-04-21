# Loop Charter

## Goal
Improve the existing `genkit` skill so it triggers more precisely as the repo's server-owned AI workflow anchor, routes adjacent work out faster, and stays consistent across compact/discovery surfaces.

## Current Baseline
- Current best version: `.agent-skills/genkit/SKILL.md` at 285 lines plus existing references/evals.
- Current strengths: clear separation from `firebase-ai-logic`, good support coverage, usable operating modes.
- Current weaknesses: still broader than needed, repeats command/example/troubleshooting detail inline, and under-emphasizes fallback choices like plain SDK routes or framework-comparison asks.

## Mutable Artifact
Primary file: `.agent-skills/genkit/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec + existing repo conventions (`skill-standardization` expectations)
- Repo boundary must remain: `genkit` = backend/server-owned AI workflows; `firebase-ai-logic` = direct app/client integration; `firebase-cli` = Firebase platform ops
- Survey evidence captured in this folder (`triage.md`, `context.md`, `solutions.md`)
- Validation prompts: existing 4 eval prompts plus at least one route-out / fallback prompt added this run
- Catalog sync checks: `validate_skill.sh` and `validate_catalog_sync.py`

## Constraints
- Keep this run bounded to one skill-centered improvement set
- Prefer shrinking / clarifying over adding another overlapping skill
- Update compact/discovery surfaces only as needed to match the new boundary
- No new public skill unless the existing one clearly fails the boundary test
- Keep support additions transferable and small

## Tried Already
- Keep: 2026-04-15 modernization into backend AI workflow anchor
- Revert: adding or merging another Firebase AI wrapper (rejected previously)
- Why: the lane already has a stable three-way split; remaining work is structural hardening, not expansion
