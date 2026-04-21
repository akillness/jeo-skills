# Loop Charter

## Goal
Improve the existing `ralph` skill so it stays the canonical spec-first + persistent-completion anchor while reducing front-door size, correcting stale platform guidance, and preserving clean route-outs to runtime-specific siblings.

## Current Baseline
- `ralph/SKILL.md` is 499 lines and sits at the top of the graph watchlist.
- Repo-local docs still present Codex as compensation-only even though official Codex docs now expose native experimental hooks.
- Supporting files exist, but the front door still carries too much runtime/setup detail.

## Mutable Artifact
Primary: `.agent-skills/ralph/SKILL.md`

Supporting context files that may change only if the primary change requires them:
- `.agent-skills/ralph/references/platform-setup.md`
- `.agent-skills/ralph/references/runtime-boundaries.md` (new, if needed)
- `.agent-skills/ralph/SKILL.toon`
- `.agent-skills/ralph/evals/evals.json`
- `docs/ralph/README.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- graph/wiki/survey artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec / `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Catalog sync check: `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- JSON validity checks for eval and skills manifests
- Residue scan for stale Codex compensation-only claims and wrong self-paths
- Trigger-quality rubric: `ralph` must remain the method anchor, not collapse into `omc`, `omx`, `ohmg`, `jeo`, or `ralphmode`

## Constraints
- Max one bounded improvement theme this run: structural hardening of `ralph`
- Prefer shrinking / clarifying over expanding
- No new overlapping orchestration wrapper skill
- Keep changes transferable across Claude / Codex / Gemini / OpenCode
- Update derived discovery surfaces when the trigger surface changes materially

## Tried Already
- Keep: prior support hardening (eval coverage + self-path cleanup on 2026-04-16)
- Revert: adding another persistent-loop wrapper or blurring runtime ownership into `ralph`
- Why: the graph and wiki both show the better bounded move is to harden canonical anchors in place
