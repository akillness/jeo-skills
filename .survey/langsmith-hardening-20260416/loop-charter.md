# Loop Charter

## Goal
Improve the existing `langsmith` skill so it behaves like a bounded operator workflow rather than a long feature tour, and close its missing eval coverage without creating overlap with generic observability or deployment skills.

## Current Baseline
- `.agent-skills/langsmith/SKILL.md` is technically detailed and backed by references/scripts, but it lacks `evals/evals.json` and over-claims breadth around monitoring/deployment.
- Structural graph snapshot shows `langsmith` is one of the few remaining high-utility skills with references but no evals.

## Mutable Artifact
Primary file: `.agent-skills/langsmith/SKILL.md`
Supporting context may be updated only as needed to keep the skill coherent: `SKILL.toon`, `evals/evals.json`, discovery manifests, README surfaces, graph outputs, wiki notes.

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/langsmith`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- `python3 -m json.tool .agent-skills/langsmith/evals/evals.json`
- Compare the revised skill against this frozen rubric:
  1. clearer trigger boundary for tracing/evals/feedback/prompt-registry work
  2. explicit route-outs for generic observability, deployment, and runtime guardrails
  3. operator packets for common workflows
  4. no duplicate skill creation

## Constraints
- Max one bounded modernization pass this run.
- No new skill creation.
- Keep claims grounded in local references and stable source links.
- Prefer transferable improvements over tool-specific trivia.
- Update derived discovery surfaces if the positioning materially changes.

## Tried Already
- Keep: repo-wide support-coverage strategy that upgrades legacy anchors instead of adding duplicates.
- Keep: docs/runtime sync after material skill rewrites.
- Revert: creating overlapping wrappers when an existing anchor can be modernized in place.
