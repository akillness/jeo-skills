# Loop Charter

## Goal
Improve the existing `bmad-idea` skill so it works as a high-utility pre-planning creative router instead of a loose command catalog.

## Current Baseline
`bmad-idea/SKILL.md` is a persona-and-command inventory with weak routing logic, limited trigger precision, no `references/` or `evals/`, and weak boundary guidance relative to `bmad`, `task-planning`, `marketing-automation`, and `bmad-gds`.

## Mutable Artifact
Primary: `.agent-skills/bmad-idea/SKILL.md`
Supporting: `SKILL.toon`, `references/*`, `evals/evals.json`, README / README.ko / setup-all-skills-prompt / skills.json, wiki pages, graph outputs.

## Fixed Evaluation Harness
- Agent Skills structure and trigger-quality expectations from `skill-standardization`
- Repo maintenance goal: improve an existing high-visibility skill instead of adding a noisy duplicate
- Survey findings saved under `.survey/bmad-idea-modernization-20260415/`
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/bmad-idea`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Dry-run prompts:
  1. "Use bmad-idea to turn this rough SaaS concept into the right next artifact before planning."
  2. "We need positioning and a story for our new workflow product, but the audience is fuzzy."
  3. "Help us turn this game idea into pillars and a first concept brief."

## Constraints
- Keep one bounded improvement set centered on `bmad-idea`
- Prefer transferable routing structure over persona-lore or keyword stuffing
- Add support files only when they materially improve reuse
- Update discovery/setup docs because positioning will materially change
- Do not add a new overlapping skill in this run

## Tried Already
- Keep: rewrite weak anchors into decision-first routers with references/evals and synced docs
- Revert: adding overlapping broad wrapper skills when the catalog already has a visible but weak anchor
- Why: repo history shows higher leverage from modernizing weak anchors than from catalog expansion
