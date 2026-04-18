# Loop Charter

## Goal
Improve the practical usability of `.agent-skills/git-submodule` by shrinking the front door into a cleaner routing-first contract without weakening its boundary-decision, pointer-update, detached-HEAD, or CI/auth guidance.

## Current Baseline
- `.agent-skills/git-submodule/SKILL.md` is 293 lines and appears on `graphify-out/GRAPH_REPORT.md` as an oversized front-door candidate.
- Support coverage already exists: `references/`, `evals/evals.json`, and `SKILL.toon` are present.
- Discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`) already mention the skill and must stay truthful if the trigger surface changes.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/git-submodule/SKILL.md`

Supporting artifacts allowed only if needed to preserve clarity after shrinking the front door:
- `.agent-skills/git-submodule/references/*`
- `.agent-skills/git-submodule/evals/evals.json`
- `.agent-skills/git-submodule/SKILL.toon`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph outputs documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Trigger quality: the skill should activate for `.gitmodules` / recursive clone / pointer update / detached-HEAD / private-submodule CI questions without drifting into generic Git cleanup or package-manager delivery
- Structural target: front door should become materially smaller while preserving explicit route-outs and one clear operator brief
- Support symmetry: if `SKILL.md` meaning changes, sync `SKILL.toon`, evals, and discovery surfaces
- Validation prompts: existing 4 eval prompts plus one hosted-platform or branch-tracking misconception case if the boundary wording changes

## Constraints
- One bounded structural change set this run; do not create a new adjacent Git dependency skill
- Keep the skill deterministic and routing-first rather than turning it back into a giant command catalog
- Max one new support reference unless required
- Preserve repo conventions and existing cluster boundaries with `git-workflow`, `npm-git-install`, `workflow-automation`, and `system-environment-setup`
- Validate changed skill files and JSON before PR work

## Tried Already
- Keep: the 2026-04-15 modernization pass that established boundary decision, bootstrap, pointer update, edit-inside-submodule, removal, and CI checkout modes
- Keep: existing support references for decision matrix, detached-HEAD behavior, and CI automation
- Revert: adding another Git dependency wrapper or letting this skill absorb generic Git history repair
- Why: the durable gap is front-door density and discovery truthfulness, not missing catalog coverage
