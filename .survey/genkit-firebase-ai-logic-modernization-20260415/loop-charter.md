# Loop Charter

## Goal
Improve the Firebase AI application skill lane with one bounded, transferable modernization that clarifies boundaries, raises trigger quality, and adds durable support artifacts.

## Current Baseline
`genkit` is a long legacy skill with no support files or evals. `firebase-ai-logic` is shorter but stale, partially inaccurate, and weakly separated from Genkit. Discovery docs list both with minimal descriptions.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/genkit/SKILL.md`

Supporting context files may change only if needed for the chosen bounded improvement: `firebase-ai-logic/SKILL.md`, references/evals under changed skills, README.md, README.ko.md, setup-all-skills-prompt.md, manifests, survey artifacts, graph outputs, wiki files.

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Catalog sync via `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Trigger/boundary quality judged against the survey findings for Genkit vs Firebase AI Logic
- Dry-run usefulness via 2-5 realistic prompts in `evals/evals.json`
- JSON validity for manifests / eval files / graph outputs when refreshed

## Constraints
- Max one coherent improvement set this run
- Prefer modernization + clearer boundary over adding a new skill
- Keep changes transferable across Firebase/web/fullstack AI requests
- Do not rewrite unrelated Firebase or broader MLOps skills in the same loop
- Update discovery docs if the positioning/discoverability materially changes

## Tried Already
- Keep: modernize high-visibility anchors with route-outs and support files
- Keep: prefer canonical-vs-adjacent boundary clarification over adding duplicates
- Revert: broad overlapping additions that create noisy discovery surfaces
- Revert: command catalogs without explicit routing, evidence, or eval coverage
