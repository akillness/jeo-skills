# Loop Charter

## Goal
Add one high-utility reusable skill that helps agents audit and structure indie Steam store-page, demo, festival, and launch-readiness work into a concrete operational brief.

## Current Baseline
The `.agent-skills` catalog has broad game-development planning (`bmad-gds`), broad marketing collections (`marketing-automation`, `marketing-skills-collection`), and a focused game debugging skill (`game-build-log-triage`), but it lacks a dedicated Steam go-to-market / launch-ops skill. Existing marketing skills are too general to reliably trigger on Steam-specific prompts involving wishlists, store assets, Next Fest, capsule/trailer readiness, and creator outreach sequencing.

## Mutable Artifact
Primary: `.agent-skills/steam-store-launch-ops/SKILL.md`

Supporting context allowed if the primary artifact warrants it:
- `.agent-skills/steam-store-launch-ops/references/checklists.md`
- `.agent-skills/steam-store-launch-ops/evals/evals.json`
- `.agent-skills/marketing-automation/SKILL.md` (only if a small boundary clarification materially reduces overlap)
- `.survey/steam-store-launch-ops-20260412/*`

## Fixed Evaluation Harness
- Agent Skills frontmatter/spec conventions from `skill-standardization`
- Validation script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger rubric:
  1. Description clearly targets Steam page optimization, wishlist funnel, demo / Next Fest readiness, and launch-adjacent ops prompts
  2. Workflow stays deterministic and audit-oriented, not vague inspiration or giant strategy dumping
  3. Output format yields a reusable operator brief with priorities and concrete next actions
  4. Advice transfers across solo-dev, small-studio, and contractor/publisher-helper contexts
- Dry-run prompts:
  1. "Audit my Steam page before Next Fest and tell me what to fix first."
  2. "I have a demo, trailer, and capsule art but weak wishlists — give me a Steam launch readiness checklist."
  3. "Help me review our coming-soon page, tags, and creator outreach prep for launch."

## Constraints
- One primary skill addition only this run
- No product code or giant game-marketing mega-bundle
- Keep `SKILL.md` under 500 lines
- Add supporting files only if they materially improve reuse
- Commit only if validation passes and the result is coherent

## Tried Already
- Keep: focus on Steam launch ops rather than a generic "game marketing" skill because the Steam workflow is concrete, high-frequency, and under-served in the catalog
- Revert: no broad multi-platform game-launch bundle this run; too diffuse for a ratcheted iteration
