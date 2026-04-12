# Loop Charter

## Goal
Improve the `survey` skill so evidence-recovery behavior is clearer, more reusable, and less dependent on ad hoc maintainer memory when normal web search/extract paths fail.

## Current Baseline
- `survey/SKILL.md` already has a strong 4-lane structure and a small amount of fallback guidance.
- It does **not** yet have dedicated support files (`references/`, `evals/`) for evidence recovery.
- Prior repo runs repeatedly improvised direct retrieval and indexed-snippet handling in survey artifacts instead of learning from one standardized support layer.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/survey/SKILL.md`

Supporting artifacts allowed for this loop:
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/survey/references/evidence-recovery-ladder.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/survey/evals/evals.json`
- survey/wiki/graph outputs documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Existing `survey` scope: research-only, 4-lane structure, platform-neutral `.survey/{slug}` outputs
- Validation prompts:
  1. Search APIs return 401 during a survey run.
  2. A cited blog URL 404s but an official product page still exists.
  3. A social/workflow page is only recoverable through indexed snippets.
- Success rubric:
  - SKILL remains clearly triggerable as a survey skill
  - Fallback steps are explicit, ordered, and evidence-labeled
  - Support files improve reuse without bloating the main SKILL
  - Validation script passes

## Constraints
- One bounded improvement set only; do not redesign the whole skill catalog.
- No new skill creation in this loop.
- Keep the main skill concise enough to remain readable; move detailed fallback guidance to `references/`.
- Do not touch README/README.ko/setup surfaces unless the skill's positioning changes materially.

## Tried Already
- Keep: direct page retrieval, stable vendor-page substitution, and evidence-confidence notes proved useful in prior survey artifacts.
- Revert/avoid: adding another overlapping research skill instead of upgrading `survey`.
- Why: the cross-cutting leverage is in hardening the existing survey entry point, not multiplying nearby abstractions.
