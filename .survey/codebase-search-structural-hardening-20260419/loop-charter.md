# Loop Charter

## Goal
Improve `codebase-search` so it activates more precisely on real repo-navigation prompts, chooses one search packet faster, and routes cleanly to adjacent skills instead of behaving like a long generic search explainer.

## Current Baseline
- Current best version: `.agent-skills/codebase-search/SKILL.md` on `main`
- Baseline shape: 275 lines, already standardized and support-backed
- Current weakness: front door is still oversized and too tutorial-heavy relative to neighboring packet-first skills

## Mutable Artifact
Primary mutable artifact: `.agent-skills/codebase-search/SKILL.md`

## Fixed Evaluation Harness
- Spec / standard:
  - `.agent-skills/skill-standardization/SKILL.md`
  - existing repo conventions for `SKILL.toon`, `skills.json`, `skills.toon`, README surfaces, and wiki logging
- Validation prompts / acceptance tests:
  - existing evals in `.agent-skills/codebase-search/evals/evals.json`
  - add dry-run coverage for content/config and game-style repo navigation if the structural rewrite justifies it
- Scoring rubric:
  1. Trigger precision improves for "where is this defined/used/configured?" prompts
  2. The front door chooses one packet faster
  3. Boundary with `debugging`, `code-refactoring`, `code-review`, and `graphify` is clearer
  4. Compact/discovery surfaces stay in sync
  5. Validation script passes with 0 errors

## Constraints
- Max one bounded structural hardening pass in this run
- Do not create a new overlapping search skill
- Keep changes transferable across CLI/dev, web/fullstack, ops/config, marketing/content, and game repo search
- Update docs/setup surfaces only if the positioning materially changes

## Tried Already
- Keep: the 2026-04-14 modernization established `codebase-search` as the repo-navigation anchor
- Revert: adding another search-adjacent wrapper instead of improving the existing anchor
- Why: adjacent search-analysis and code-quality skills already own the downstream work; the durable gap is front-door packet routing
