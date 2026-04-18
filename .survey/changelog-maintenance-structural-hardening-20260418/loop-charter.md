# Loop Charter

## Goal
Improve `changelog-maintenance` as a smaller, routing-first documentation-cluster anchor that still covers changelog, release-note, migration-update, and lightweight game patch-note work.

## Current Baseline
- Primary artifact: `.agent-skills/changelog-maintenance/SKILL.md` at 292 lines with good boundaries but still a dense front door.
- Existing support coverage is complete (`references/`, `evals/`, `SKILL.toon`, manifest/docs surfaces already exist).
- Documentation-cluster precedent from `technical-writing`, `user-guide-writing`, and `api-documentation` favors shrinking the front door, moving packet structures into references, and tightening route-out/eval pressure.

## Mutable Artifact
Exactly one primary file: `.agent-skills/changelog-maintenance/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills structural expectations from `skill-standardization`
- Existing documentation-cluster boundary rules in `.agent-skills-wiki/concepts/documentation-cluster.md`
- Validation prompts / acceptance checks:
  1. Trigger clearly fits changelog / release notes / migration update / game patch notes
  2. Route-outs to `technical-writing`, `api-documentation`, `user-guide-writing`, `deployment-automation`, and `marketing-automation` stay explicit
  3. Front door becomes materially smaller without losing truthful evidence-gathering rules
  4. Supporting surfaces stay in sync: `references/`, `evals/evals.json`, `SKILL.toon`, `skills.json`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/changelog-maintenance`
  - JSON validation for `.agent-skills/changelog-maintenance/evals/evals.json` and `.agent-skills/skills.json`

## Constraints
- Max one coherent skill-improvement set for this run
- Prefer one meaningful structural change over broad rewrites across multiple skills
- Do not add a new overlapping skill
- Keep survey/wiki/graph updates scoped to this decision
- Preserve English repo conventions and current file layout

## Tried Already
- Keep: 2026-04-14 modernization established the canonical release-history / release-notes boundary and added support files
- Revert: adding another release-note wrapper, merging deployment execution into the same skill, or leaving the skill as a template-heavy semver dump
- Why: the documentation cluster improves more from denser anchor cleanup than from more wrappers
