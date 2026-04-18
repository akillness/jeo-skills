# Loop Charter

## Goal
Improve `ui-component-patterns` by shrinking it into a routing-first reusable-component front door that chooses one bounded component packet, moves verbose packet details into support docs, and sharpens route-outs to neighboring frontend skills.

## Current Baseline
- Current best version: `.agent-skills/ui-component-patterns/SKILL.md` at 274 lines with `references/component-api-checklist.md`, `references/handoff-boundaries.md`, `evals/evals.json`, and synced docs surfaces from the 2026-04-13 modernization pass.
- Current quality: good frontend boundary ownership, but the front door is still oversized and the compact discovery surfaces drift toward a generic “component best practices” framing instead of the routing-first shape already used by newer hardened skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/ui-component-patterns/SKILL.md`

Supporting artifacts allowed only if the primary change clearly requires them:
- `.agent-skills/ui-component-patterns/references/intake-packets-and-route-outs.md`
- `.agent-skills/ui-component-patterns/evals/evals.json`
- `.agent-skills/ui-component-patterns/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / graph / survey artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/ui-component-patterns`
- Catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for touched manifest/eval/graph artifacts
- Trigger quality check: the updated description and `SKILL.toon` must clearly trigger on reusable primitive / slot / alternate-root / controlled-ownership asks without overclaiming design-system, accessibility, responsive-layout, or React-performance work
- Dry-run usefulness check against at least 5 eval prompts covering primitive API design, controlled ownership, design-system route-out, accessibility route-out, and alternate-root / docs-verification cases

## Constraints
- Max scope: one coherent skill-hardening pass in this run
- Prefer patching the existing skill over adding any new skill
- Keep the front door compact; move packet tables/examples to support docs instead of expanding `SKILL.md`
- Keep README / README.ko / setup prompt discovery wording in sync if the trigger surface materially changes
- Do not modify the evaluation harness mid-run

## Tried Already
- Keep: 2026-04-13 modernization pass that turned `ui-component-patterns` into the reusable primitive / variant / slot API anchor with references and evals
- Revert: adding another overlapping frontend wrapper or letting this skill absorb design-system governance, accessibility remediation, or responsive strategy
- Why: graphify now says support coverage is complete; the next bounded gain is front-door tightening, not more neighboring skills
