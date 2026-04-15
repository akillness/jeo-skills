# Loop Charter Template

Use this template before mutating a skill. The point is to freeze the benchmark for the run so you can compare edits honestly.

```markdown
# Loop Charter

## Goal
What outcome should improve?

## Current Baseline
What is the current best version and how good is it now?

## Mutable Artifact
Exactly one primary file or object to change in this loop.

## Fixed Evaluation Harness
- Validation script or checklist
- Representative prompts
- Binary pass/fail rubric
- Pass threshold or ratchet rule

## Constraints
- Max time / iterations / tool budget
- Supporting files allowed in scope
- Forbidden edits
- Output artifact requirements

## Tried Already
- Keep
- Revert
- Why
```

## What to freeze

Freeze these before the first mutation:
- prompt set
- eval wording
- scoring method
- budget cap
- what counts as “in scope” edits

If any of those change, start a new comparison track instead of mixing results.

## Suggested dry-run rubric for skills

Use 3-6 binary checks. Common categories:
1. Trigger precision
2. Trigger recall on core prompts
3. Route-out clarity
4. Step determinism
5. Artifact usefulness
6. Discovery-surface sync (only if the run changed positioning)

## Keep-or-revert rule

Keep only if the new version beats the current baseline under the same harness.
Revert ties unless the run explicitly prioritizes a secondary metric such as lower ambiguity or smaller artifact surface.

## Common failure modes

- Changing the skill and the evaluator at the same time
- Turning the run into a broad rewrite with no attribution
- Using vague taste-based evals
- Benchmarking only best-case prompts
- Logging wins but not discarded experiments
