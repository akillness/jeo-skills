# Loop Charter

## Goal
Improve `presentation-builder` into a reusable, decision-first presentation artifact skill with clearer trigger boundaries, supporting references, evals, and synced discovery/docs surfaces.

## Current Baseline
The current skill is a short slides-grab workflow guide. It lacks `references/`, `evals/`, and `SKILL.toon`, and its description under-specifies when to use it versus documentation, marketing, or research-writing skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/presentation-builder/SKILL.md`

Supporting artifacts allowed if the primary rewrite lands:
- `.agent-skills/presentation-builder/references/*`
- `.agent-skills/presentation-builder/evals/evals.json`
- `.agent-skills/presentation-builder/SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- wiki / survey / graph outputs for durable memory

## Fixed Evaluation Harness
- Agent Skills structural compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/presentation-builder`
- Catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for `evals/evals.json`, `.agent-skills/skills.json`, and `graphify-out/graph.json`
- Trigger / boundary quality on these representative prompts:
  1. "Turn this product brief into a 10-slide investor deck, show me the outline first, then export to PPTX and PDF."
  2. "Build a browser-review deck for an architecture demo with code screenshots and speaker notes."
  3. "Create a publisher pitch deck for our indie game with milestone, audience, and budget slides."
  4. "Write internal technical docs for our rollout plan." (should route away from `presentation-builder`)

## Constraints
- Keep this run bounded to one skill modernization, not a cluster rewrite.
- Prefer transferable workflow guidance over one-off slides-grab commands.
- Do not create a new overlapping documentation or marketing skill.
- Update discovery/setup/docs surfaces if the positioning changes materially.
- Refresh graph/wiki only as needed to preserve durable structural memory.

## Tried Already
- Keep: modernize one high-value legacy anchor per run instead of adding a new overlapping skill.
- Keep: add support files and evals when a skill becomes a stronger long-lived anchor.
- Revert: broad cluster rewrites in the same run.
- Revert: command-dump style skills with weak routing language.
