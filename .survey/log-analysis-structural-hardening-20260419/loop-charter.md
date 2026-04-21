# Loop Charter

## Goal
Improve `log-analysis` so it activates more precisely on real log-triage prompts, chooses one evidence packet faster, and routes cleanly to `debugging`, `monitoring-observability`, `pattern-detection`, or `game-build-log-triage` instead of behaving like a long generic log tutorial.

## Current Baseline
- Current best version: `.agent-skills/log-analysis/SKILL.md` on `main`
- Baseline shape: 261 lines, already standardized and support-backed
- Current weakness: front door is still oversized and tutorial-heavy relative to neighboring routing-first skills

## Mutable Artifact
Primary mutable artifact: `.agent-skills/log-analysis/SKILL.md`

## Fixed Evaluation Harness
- Spec / standard:
  - `.agent-skills/skill-standardization/SKILL.md`
  - existing repo conventions for `SKILL.toon`, `skills.json`, `skills.toon`, README surfaces, and wiki logging
- Validation prompts / acceptance tests:
  - existing evals in `.agent-skills/log-analysis/evals/evals.json`
  - add dry-run coverage for mixed browser/API, CI cascade, and non-engine automation logs if the structural rewrite justifies it
- Scoring rubric:
  1. Trigger precision improves for “check the logs / which line matters / what is the first blocker?” prompts
  2. The front door chooses one log packet faster
  3. Boundary with `debugging`, `monitoring-observability`, `pattern-detection`, and `game-build-log-triage` is clearer
  4. Compact/discovery surfaces stay in sync
  5. Validation script passes with 0 errors

## Constraints
- Max one bounded structural hardening pass in this run
- Do not create a new overlapping log or incident skill
- Keep changes transferable across CLI/dev, web/fullstack, product/ops, marketing automation, and game-adjacent triage
- Update docs/setup surfaces only if the positioning materially changes

## Tried Already
- Keep: the 2026-04-13 modernization established `log-analysis` as the root-cause-first log triage anchor
- Revert: broadening the skill into debugging, observability setup, or engine-specific build-log analysis
- Why: adjacent skills already own those downstream jobs; the durable gap is faster packet routing at the front door
