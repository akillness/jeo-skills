# Status Files, Scripts, and Review Gates

`bmad` works best when it acknowledges project state instead of restarting the workflow from memory every time.

## Local helper scripts
- `scripts/init-project.sh` — bootstrap BMAD config/templates for a project
- `scripts/check-status.sh` — inspect current workflow status
- `scripts/phase-gate-review.sh` — submit a phase artifact for review before advancement
- `scripts/validate-config.sh` — validate BMAD config/state files

## Local templates and state hints
- `templates/config.template.yaml`
- `templates/workflow-status.template.yaml`
- `REFERENCE.md` includes the historical `docs/bmm-workflow-status.yaml` structure and transition rules

## Review gate policy
Before advancing a phase, ask:
1. Does the required artifact already exist?
2. Has that artifact been reviewed/approved?
3. If the artifact exists but has not been reviewed, should the next move be `plannotator` rather than another new document?

## Recommended handoff to `plannotator`
Use `plannotator` when the core BMAD decision is already made and a human-approval surface is the real blocker:
- PRD review before architecture
- architecture review before sprint planning / implementation
- sprint-plan or plan-diff review before execution

## Practical rule
When state files or helper scripts are present:
- prefer inspecting/updating them first
- keep recommendations consistent with the visible state
- avoid phase jumps that ignore already-created artifacts
