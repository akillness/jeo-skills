# Loop Charter

## Goal
Improve `task-estimation` so it becomes a clear, reusable sizing-and-forecasting skill with modern trigger boundaries, practical estimation workflows, and durable support files.

## Current Baseline
`task-estimation` is a legacy generic agile skill with a shallow description, outdated examples, no support files, no evals, and weak separation from `task-planning`, `standup-meeting`, and roadmap/commitment work.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/task-estimation/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing neighboring PM cluster boundaries in `task-planning`, `standup-meeting`, and `sprint-retrospective`
- Support-file usefulness check: at least one reusable reference and one eval bundle if the rewrite materially changes behavior
- Discovery surfaces consistency check when positioning/discoverability changes: `README.md`, `README.ko.md`, `.agent-skills/skills.json`, and `setup-all-skills-prompt.md`

## Constraints
- Max one coherent modernization target this run
- Prefer improving the existing skill over adding a new overlapping PM skill
- Keep evaluation criteria fixed for the whole run
- Do not broaden the skill into backlog decomposition, daily status, or retrospectives
- Preserve transferability across software, product, and game estimation contexts

## Tried Already
- Keep: modernize adjacent PM skills first to clarify cluster boundaries
- Revert: adding another PM wrapper instead of upgrading the weakest existing estimation lane
- Why: cluster coherence improves more through bounded modernization than by creating another overlapping skill
