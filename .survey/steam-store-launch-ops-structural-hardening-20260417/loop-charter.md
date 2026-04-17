# Loop Charter

## Goal
Improve `steam-store-launch-ops` so it more reliably diagnoses the real Steam launch bottleneck and routes users toward one concrete next artifact.

## Current Baseline
Current skill is strong on store-page / Next Fest / launch checklist coverage, but it is still too page-centric and under-emphasizes the difference between visibility, promise clarity, proof/demo readiness, timing, and launch-ops readiness.

## Mutable Artifact
Primary: `.agent-skills/steam-store-launch-ops/SKILL.md`

Supporting context that may change only if the primary rewrite holds:
- `.agent-skills/steam-store-launch-ops/references/*.md`
- `.agent-skills/steam-store-launch-ops/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `skill-standardization/scripts/validate_skill.sh`
- Catalog/discovery sync via `skill-standardization/scripts/validate_catalog_sync.py`
- Trigger quality check: description must clearly cover store-page review, wishlist diagnosis, demo/Next Fest readiness, and launch-ops requests
- Boundary check: must not collapse into generic marketing or game-feedback skills
- Support-symmetry check: if route-outs or positioning change materially, sync `SKILL.toon`, evals, and discovery surfaces

## Constraints
- One bounded improvement set in this run; no new overlapping skill
- Keep the skill practical and routing-first
- Prefer moving nuanced models/checklists into `references/` rather than bloating the front door
- Update docs/setup surfaces if positioning/discoverability shifts materially
- Validate before committing

## Tried Already
- Keep: the existing single-skill boundary for Steam-specific launch/store operations
- Revert: creating a second adjacent game-marketing wrapper
- Why: cluster notes already place `steam-store-launch-ops` as the game-specific exception that should stay distinct from broad marketing automation
