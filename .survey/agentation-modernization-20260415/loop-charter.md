# Loop Charter

## Goal
Improve the usefulness and maintainability of `agentation` by converting it from a long mixed catalog into a decision-first UI annotation router with durable support docs, evals, and synced discovery surfaces.

## Current Baseline
- `agentation/SKILL.md` is ~788 lines and mixes routing, install variants, config blocks, API details, and workflow examples in one file.
- The skill has scripts, but no `references/` or `evals/`.
- README/setup surfaces still advertise stale 85-skill counts even though the repo currently has 89 installable skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/agentation/SKILL.md`

Supporting context that may be updated only if the primary change proves useful:
- `.agent-skills/agentation/SKILL.toon`
- `.agent-skills/agentation/references/*`
- `.agent-skills/agentation/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- wiki / graph / survey artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/agentation`
- JSON validity: `python3` parse check for `.agent-skills/agentation/evals/evals.json`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger / boundary checks must stay fixed for the run:
  - `agentation` owns exact rendered-UI feedback packets and watch-loop setup
  - `plannotator` remains the plan/diff approval gate
  - `agent-browser` remains the fresh-session verifier
  - `playwriter` remains the running-browser reuse lane
- Discovery surfaces must no longer drift on total skill count for the updated lines touched this run.

## Constraints
- One coherent improvement set only.
- No new overlapping browser/review skill.
- Keep the main SKILL focused; move durable detail into `references/`.
- Prefer transferable routing guidance over version-pinned trivia.

## Tried Already
- Keep: modernize weak high-traffic anchors instead of adding duplicates.
- Keep: support-file ratchets plus route-outs improve maintainability.
- Revert: broad monolithic skill bodies that blur boundaries across adjacent skills.
