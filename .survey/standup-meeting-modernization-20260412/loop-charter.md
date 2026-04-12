# Loop Charter

## Goal
Improve the practical usefulness and trigger precision of `standup-meeting` without adding another overlapping PM skill.

## Current Baseline
`standup-meeting/SKILL.md` is a legacy generic ceremony template. It lacks support files, does not reflect board-walking / async / blocker-first practice, and its description is too broad to guide routing cleanly.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/standup-meeting/SKILL.md`

Supporting artifacts allowed if the primary skill materially improves:
- `.agent-skills/standup-meeting/references/*.md`
- `.agent-skills/standup-meeting/evals/evals.json`
- discovery surfaces only if positioning/discoverability changes materially (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)

## Fixed Evaluation Harness
- Agent Skills structure and frontmatter requirements from `skill-standardization`
- Trigger-quality rubric: should activate for daily standup / daily scrum / async check-in / walk-the-board / blocker triage requests
- Boundary rubric: should route planning to `task-planning`, sizing to `task-estimation`, and learning-review work to `sprint-retrospective`
- Dry-run prompts:
  1. "Run tomorrow’s standup as a walk-the-board sync for a sprint team with two blockers."
  2. "We’re remote across three time zones; should this standup be async and what format should we use?"
  3. "Turn our verbose daily scrum into a short blocker-focused update ritual."
- Validation tool: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/standup-meeting`

## Constraints
- One bounded improvement set for this run
- Prefer reusable facilitation heuristics over keyword stuffing
- Do not create a new PM skill in this loop
- Keep claims grounded in the survey files and cited sources

## Tried Already
- Keep: modernize `task-planning` instead of adding another PM skill
- Keep: upgrade cluster anchors with references/evals before expanding the catalog
- Revert: adding overlapping PM skills when boundary clarification is the real need
- Why: previous runs showed the repo benefits more from stronger anchors and clearer routing than from more catalog sprawl
