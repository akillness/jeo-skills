# Loop Charter

## Goal
Improve the existing `agent-browser` skill so it becomes the repo's clear fresh-session deterministic browser verification anchor.

## Current Baseline
- `agent-browser` already has references and templates but still reads like a command-centric browser CLI guide.
- It lacks eval coverage.
- Its routing boundary versus `playwriter` and `agentation` is implied, not strongly enforced in the main skill contract or top-level discovery wording.

## Mutable Artifact
Primary: `.agent-skills/agent-browser/SKILL.md`

Supporting context files (only if the primary rewrite justifies them):
- `.agent-skills/agent-browser/SKILL.toon`
- `.agent-skills/agent-browser/evals/evals.json`
- existing `references/` docs if boundary or workflow wording must be aligned
- discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- durable learning artifacts (`.agent-skills-wiki/*`, `graphify-out/*`)

## Fixed Evaluation Harness
- Agent Skills structure and trigger-quality expectations from `skill-standardization`
- Browser-review cluster boundary from `.agent-skills-wiki/concepts/browser-review-cluster.md`
- Survey findings captured in `.survey/agent-browser-modernization-20260415/`
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/agent-browser`
  - `python3 -c 'import json,sys; json.load(open(".agent-skills/agent-browser/evals/evals.json"))'`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`

## Constraints
- Keep the run bounded to one existing skill modernization.
- Do not add a new overlapping browser skill.
- Prefer transferable boundary clarity, support files, and evals over feature creep.
- Update discovery/docs surfaces only where the changed positioning materially affects findability.

## Tried Already
- Keep: modernize adjacent skills first (`playwriter`, `agentation`) so the browser-review boundary is now explicit.
- Revert: none yet in this run.
- Why: the cluster context is now strong enough to modernize `agent-browser` without inventing a duplicate lane.
