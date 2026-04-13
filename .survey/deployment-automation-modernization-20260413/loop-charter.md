# Loop Charter

## Goal
Improve the reusable quality of `.agent-skills/deployment-automation` by modernizing it into a trigger-clear, route-out-heavy deployment and rollout automation anchor with durable support files and matching discovery docs.

## Current Baseline
Current best version is the existing `deployment-automation/SKILL.md`: 557 lines, broad tool dump, no `references/`, no `evals/`, weak separation from `workflow-automation`, `system-environment-setup`, `monitoring-observability`, `vercel-deploy`, and infrastructure-specific implementation skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/deployment-automation/SKILL.md`

Supporting artifacts allowed if the primary change is kept:
- `.agent-skills/deployment-automation/references/*`
- `.agent-skills/deployment-automation/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki and survey artifacts for this run

## Fixed Evaluation Harness
- Agent Skills structure and description quality requirements from `skill-standardization`
- Existing repo cluster boundary notes in `.agent-skills-wiki/concepts/developer-workflow-cluster.md`
- Survey artifacts in `.survey/deployment-automation-modernization-20260413/`
- Validation prompts: deploy preview/staging/prod pipeline design, release promotion/rollback, platform route-outs vs repo-local automation, hosted deploy troubleshooting boundaries
- Success rubric:
  1. Trigger precision is higher than baseline
  2. Route-outs prevent overlap with nearby skills
  3. Instructions are deterministic and practical
  4. Support files materially improve reuse
  5. Discovery docs reflect any changed positioning

## Constraints
- Max one primary skill modernization this run
- No new overlapping deployment wrapper unless research proves a structural gap
- Prefer transferable rollout/deploy heuristics over vendor-locked code dumps
- Keep changes bounded and comparable to baseline
- Validate before commit/PR

## Tried Already
- Keep: modernize adjacent developer-workflow anchors (`git-workflow`, `workflow-automation`) with references/evals and stronger route-outs
- Revert: adding overlapping wrappers when an indexed legacy anchor could be sharpened instead
- Why: support-backed modernization has improved reuse and graph clarity more reliably than creating more skills
