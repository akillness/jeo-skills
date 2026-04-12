# Loop Charter

## Goal
Upgrade `code-review` into a workflow-aware review judgment skill that matches modern PR/MR practice, clearer boundary routing, and recent repo modernization quality.

## Current Baseline
`code-review` is a long generic checklist with vague discovery wording, no `references/`, no `evals/`, and weak routing to neighboring skills.

## Mutable Artifact
Primary: `.agent-skills/code-review/SKILL.md`

Supporting context that may change only if the primary artifact improves:
- `.agent-skills/code-review/references/*`
- `.agent-skills/code-review/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.survey/code-review-modernization-20260413/*`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec and `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Survey evidence in `.survey/code-review-modernization-20260413/`
- Boundary fit against neighboring repo skills: `git-workflow`, `debugging`, `testing-strategies`, `web-design-guidelines`
- Dry-run usefulness on three prompts:
  1. review a backend PR for risk / tests / migrations
  2. review a frontend diff that also needs screenshots/previews
  3. decide whether a request should route to `git-workflow`, `debugging`, or `code-review`

## Constraints
- Max one main skill modernization this run
- Prefer upgrade over creating a new overlapping skill
- Add support files only when they sharpen transferability
- Update discovery docs if positioning changes materially
- Keep claims grounded in repo state or cited survey sources

## Tried Already
- Keep: modernize neighboring anchors (`git-workflow`, `debugging`, `log-analysis`) with references/evals and sharper boundaries
- Revert: adding overlapping wrapper skills instead of upgrading the legacy anchor
- Why: recent runs showed stronger reuse and cleaner discovery from canonical anchor upgrades than from new broad wrappers
