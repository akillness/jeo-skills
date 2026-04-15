# Loop Charter

## Goal
Improve `prompt-repetition` so it becomes a narrow, evidence-backed, reusable skill for deciding when to apply prompt repetition and when to route to broader context-structure alternatives.

## Current Baseline
Baseline artifact: `.agent-skills/prompt-repetition/SKILL.md`.
Current issues:
- overscoped description and auto-apply framing
- no `allowed-tools`
- no `references/` or `evals/`
- long research dump instead of operator workflow
- weak trigger precision for when repetition should *not* be used

## Mutable Artifact
Primary mutable artifact: `.agent-skills/prompt-repetition/SKILL.md`

Supporting artifacts allowed only if they directly improve the primary skill's usefulness:
- `.agent-skills/prompt-repetition/references/*`
- `.agent-skills/prompt-repetition/evals/evals.json`
- compact discovery variant if needed
- repo discovery docs if positioning materially changes

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Description must clearly state what the skill does *and* when to trigger
- Skill body must include standard sections: When to use this skill, Instructions, Examples, Best practices, References
- Dry-run usefulness against these prompts:
  1. "I have a long options-first MCQ prompt on a lightweight model. Should I duplicate the prompt or restructure it?"
  2. "Our RAG answer quality is poor. Should we add prompt repetition everywhere?"
  3. "A reasoning model is available but expensive. Does prompt repetition replace it?"
- Keep only changes that sharpen trigger precision, route-outs, and practical operator steps

## Constraints
- Bounded run: one skill modernization only
- No new overlapping skill
- No unsupported universal claims
- Keep the main SKILL.md under 500 lines
- Add support files only if they materially reduce ambiguity
- Update discovery docs only if the skill's positioning materially changes

## Tried Already
- Keep: survey-first modernization pattern with references + evals + wiki logging
- Revert: broad auto-apply / universal-optimization framing
- Why: the strongest evidence supports a narrow, non-reasoning, task-shape-specific operator workflow
