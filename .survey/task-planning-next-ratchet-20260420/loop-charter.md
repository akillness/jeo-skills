# Loop Charter

## Goal
Improve `task-planning` as a reusable skill by making the front door smaller, more packet-first, and more explicit about route-outs without changing its core ownership.

## Current Baseline
- Current best artifact: `.agent-skills/task-planning/SKILL.md` at 294 lines plus existing support docs.
- Current graph finding: `task-planning` remains on the oversized front-door watchlist in `graphify-out/GRAPH_REPORT.md`.
- Current cluster finding: the PM lane is already structurally complete, so the value is dense-router cleanup rather than adding wrappers.

## Mutable Artifact
Primary file: `.agent-skills/task-planning/SKILL.md`

Supporting sync surfaces allowed only if the main ratchet holds:
- `.agent-skills/task-planning/SKILL.toon`
- `.agent-skills/task-planning/evals/evals.json`
- `.agent-skills/task-planning/references/intake-packets-and-route-outs.md` (new support file if needed)
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / graph artifacts if the change is accepted

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/task-planning`
- JSON validity via `python3 -m json.tool .agent-skills/task-planning/evals/evals.json` and `python3 -m json.tool .agent-skills/skills.json`
- Catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- Survey validator via `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py /Users/jang_jennie/projects/oh-my-skills/.survey/task-planning-next-ratchet-20260420`
- Quality rubric:
  1. Front door is shorter and more packet-first.
  2. Route-outs to adjacent PM/orchestration skills are clearer, not blurrier.
  3. Discovery/setup surfaces stay truthful and synced.
  4. No new overlapping skill is introduced.

## Constraints
- One bounded improvement theme only: packet intake + route-outs.
- No new skill folders.
- Keep the same core ownership: decomposition/readiness, not estimation/board control/review/ceremonies.
- Prefer transferable changes over niche examples.

## Tried Already
- Keep: 2026-04-18 structural hardening moved `task-planning` to a routing-first planning anchor with support docs and synced discovery surfaces.
- Revert: adding another PM wrapper or folding board-control/sizing into `task-planning`.
- Why: the repo already has the right lane structure; remaining value is tighter packet-first wording, not more surface area.
