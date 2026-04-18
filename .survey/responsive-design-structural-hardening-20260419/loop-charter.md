# Loop Charter

## Goal
Improve `responsive-design` so it matches the repo's hardened frontend pattern: one primary responsive packet, one concise strategy artifact, explicit route-outs, and synced discovery surfaces.

## Current Baseline
Baseline files:
- `.agent-skills/responsive-design/SKILL.md`
- `.agent-skills/responsive-design/SKILL.toon`
- `.agent-skills/responsive-design/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

Baseline quality:
- `responsive-design/SKILL.md` is useful but still oversized (~277 lines) compared with newer routing-first frontend anchors.
- The live skill still mixes packet selection, syntax examples, and route-outs in one front door.
- `SKILL.toon` and `.agent-skills/skills.toon` still undersell the modern routing boundary.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/responsive-design/SKILL.md`

Supporting artifacts allowed in the same run:
- `.agent-skills/responsive-design/SKILL.toon`
- `.agent-skills/responsive-design/references/`
- `.agent-skills/responsive-design/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`
- `.survey/responsive-design-structural-hardening-20260419/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: must clearly own responsive layout strategy while routing accessibility remediation to `web-accessibility`, component API design to `ui-component-patterns`, system governance to `design-system`, and broad UI critique to `web-design-guidelines`
- Structural goal: reduce front-door sprawl, keep one primary responsive packet per run, and emphasize verification/reflow honestly
- Dry-run prompts: existing evals plus at least one broad-UI-review or launch-readiness boundary check
- Docs/discovery sync: `skills.json`, `skills.toon`, README surfaces, and `SKILL.toon` must reflect the new trigger surface

## Constraints
- Max one coherent improvement set this run
- No new overlapping frontend skill
- Prefer shrinking/routing over adding more syntax examples
- Keep support-file additions bounded and directly useful
- Preserve truthful route-outs for accessibility, component API, design-system, and broad UI review

## Tried Already
- Keep: 2026-04-13 modernization that turned `responsive-design` into the mobile-first, container-aware layout adaptation anchor with references and evals
- Revert: adding another overlapping frontend wrapper or letting `responsive-design` absorb broad UI audit, component API design, or accessibility remediation
- Why: the repo benefits more from a smaller routing-first front door and synced discovery surfaces than from more catalog growth
