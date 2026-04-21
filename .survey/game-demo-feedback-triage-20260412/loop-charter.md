# Loop Charter

## Goal
Add one high-utility, transferable skill that turns mixed game demo/playtest feedback into a prioritized next-step brief, while improving adjacent existing skills only where the new routing materially helps.

## Current Baseline
The repo already has strong adjacent game skills for build-log triage, performance profiling, and Steam launch/store audits, but no dedicated playtest/demo feedback synthesis workflow.

## Mutable Artifact
Primary: `.agent-skills/game-demo-feedback-triage/SKILL.md`

Supporting context (only if required by the primary artifact):
- `.agent-skills/game-demo-feedback-triage/references/feedback-buckets.md`
- `.agent-skills/game-demo-feedback-triage/evals/evals.json`
- Small routing patches in adjacent game skills

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Description must be trigger-oriented and narrow enough to avoid generic bug triage activation
- Output must produce a deterministic "Game Demo Feedback Brief" structure
- 3 dry-run prompts must cover playtest notes, Next Fest/demo readiness, and creator/streamer feedback
- Validation script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`

## Constraints
- Keep this run bounded to one new primary skill plus minimal adjacent routing patches
- No product code or non-skill feature work
- Prefer reusable references/evals over oversized prose
- Avoid creating overlapping duplicates of `steam-store-launch-ops`, `game-performance-profiler`, or `task-planning`

## Tried Already
- Keep: game build log triage, Steam store launch ops, game performance profiler as adjacent narrow skills
- Revert: none in this run yet
- Why: they already cover neighboring workflows and define the boundary this new skill must respect
