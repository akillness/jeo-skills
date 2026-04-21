# Loop Charter

## Goal
Modernize `.agent-skills/api-documentation/SKILL.md` into a workflow-first developer-docs anchor with sharper trigger boundaries, reusable support files, and validation coverage.

## Current Baseline
Current `api-documentation` is a long OpenAPI/Swagger-heavy example dump with weak route-outs, no `references/`, and no `evals/`. It does not clearly separate API contract design from developer-facing publication, and its discovery wording underspecifies auth/examples/portal maintenance workflows.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/api-documentation/SKILL.md`

Supporting artifacts allowed if the primary file improves:
- `.agent-skills/api-documentation/references/*`
- `.agent-skills/api-documentation/evals/evals.json`
- discovery/docs surfaces: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`
- durable memory layers: `.agent-skills-wiki/*`, `graphify-out/*`, `.survey/api-documentation-modernization-20260413/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/api-documentation`
- Description quality: must clearly trigger on API reference / SDK / portal / examples / auth docs and route contract design to `api-design`
- Boundary quality: must keep internal docs in `technical-writing`, user docs in `user-guide-writing`, release-note hygiene in `changelog-maintenance`, auth implementation in `authentication-setup`
- Dry-run usefulness: eval prompts should show correct activation for API docs and correct route-outs for neighboring tasks
- Repository hygiene: if positioning changes materially, update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json`

## Constraints
- Max one primary skill modernization this run
- Prefer references + evals over adding any new overlapping skill
- Keep changes bounded and transferable; no vendor-specific rabbit hole
- Do not rewrite the evaluator mid-run

## Tried Already
- Keep: modernized `technical-writing` and `user-guide-writing`; both sharpened the docs cluster and created a stable route-out pattern.
- Keep: `api-design` already owns contract-first interface design and should remain separate.
- Revert: adding new overlapping documentation wrappers; the cluster improves more from clear boundaries than from extra skills.
- Why: the documentation cluster benefits from finishing the remaining anchor rather than creating noise.
