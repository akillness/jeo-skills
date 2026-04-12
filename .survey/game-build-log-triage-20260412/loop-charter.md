# Loop Charter

## Goal
Add one high-utility reusable skill that helps agents triage Unity and Unreal build/editor logs with concrete next-step guidance.

## Current Baseline
The `.agent-skills` catalog has broad software/product/marketing coverage but no dedicated Unity/Unreal log-triage skill. Existing generic skills like `log-analysis` are too broad to reliably trigger on engine-specific build/package/debugging prompts.

## Mutable Artifact
Primary: `.agent-skills/game-build-log-triage/SKILL.md`

Supporting context allowed if the primary artifact warrants it:
- `.agent-skills/game-build-log-triage/references/engine-patterns.md`
- `.agent-skills/game-build-log-triage/evals/evals.json`
- `.survey/game-build-log-triage-20260412/*`

## Fixed Evaluation Harness
- Agent Skills frontmatter/spec conventions from `skill-standardization`
- Validation script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger rubric:
  1. Description clearly targets Unity/Unreal build, package, cook, import, compile, and editor-log prompts
  2. Workflow is deterministic and bounded
  3. Output format is concrete enough to drive the next debugging step
  4. Skill is transferable across solo, studio, local, and CI workflows
- Dry-run prompts:
  1. "Summarize this Unity Editor.log and tell me the most likely root cause."
  2. "Our Unreal cook failed in CI; triage the log and tell me what to inspect next."
  3. "I renamed assets and now packaging fails — help me identify whether this is a redirector/reference issue."

## Constraints
- One primary skill addition only this run
- No product code or broad engine automation bundles
- Keep SKILL.md under 500 lines
- Add supporting files only if they materially improve reuse
- Commit only if validation passes and the result is coherent

## Tried Already
- Keep: survey and gap selection focused on game build/editor log triage because it is bounded and under-served
- Revert: no broader multi-skill game-dev bundle this run; too noisy for a single ratcheted iteration
