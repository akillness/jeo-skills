# Loop Charter

## Goal
Improve `sprint-retrospective` so it activates reliably for modern retrospective/postmortem facilitation across software, product, and game teams, with clear boundaries to `task-planning`, `task-estimation`, and `standup-meeting`.

## Current Baseline
Current skill is a legacy template dump with weak trigger precision, no support files, and little guidance for async/hybrid retros or action follow-through.

## Mutable Artifact
Primary: `.agent-skills/sprint-retrospective/SKILL.md`

Supporting artifacts only if the primary change lands:
- `.agent-skills/sprint-retrospective/references/facilitation-modes.md`
- `.agent-skills/sprint-retrospective/evals/evals.json`
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/sprint-retrospective`
- `python3 -m json.tool .agent-skills/sprint-retrospective/evals/evals.json`
- `python3 -m json.tool .agent-skills/skills.json`
- Manual rubric:
  - clearer trigger wording
  - explicit non-goals / cluster boundaries
  - concrete live/async/hybrid facilitation steps
  - explicit previous-action review and action ownership rules
  - at least one durable reference file and one eval bundle

## Constraints
- Keep the change bounded to one existing PM-cluster skill.
- Do not create a new overlapping project-management skill.
- Prefer transferability over one-off templates.
- Update docs/discovery surfaces only where the stronger role materially changes discoverability.

## Tried Already
- Keep: `task-planning` modernization — strengthened decomposition lane without adding overlap.
- Keep: `standup-meeting` modernization — strengthened daily coordination lane with mode selection.
- Revert: adding more broad PM wrappers — reduced clarity instead of improving it.
