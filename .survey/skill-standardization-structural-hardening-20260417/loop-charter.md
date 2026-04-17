# Loop Charter

## Goal
Improve `skill-standardization` so it is more reliable in real repo maintenance loops: fix repo-root path ambiguity, shrink the front door into a clearer routing-first skill, and keep derived discovery surfaces aligned.

## Current Baseline
- `skill-standardization/SKILL.md` is 315 lines and sits on the graph watchlist for oversized front doors.
- The skill's own examples still advertise `scripts/validate_skill.sh` / `scripts/validate_catalog_sync.py`, which fail from the repo root in `oh-my-skills`.
- `skills.json` still contains stale legacy `skill-standardization` commands and source paths that no longer exist.
- The repo already has support files (`references/`, `scripts/`, `evals/`, `SKILL.toon`), so the best bounded win is a structural hardening pass, not a new sibling skill.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/skill-standardization/SKILL.md`

Supporting artifacts allowed only if required to keep the primary improvement truthful and usable:
- `.agent-skills/skill-standardization/SKILL.toon`
- `.agent-skills/skill-standardization/evals/evals.json`
- `.agent-skills/skill-standardization/references/*`
- `.agent-skills/skills.json`
- graph/wiki/survey artifacts for this run

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-standardization`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- JSON parse check for `.agent-skills/skill-standardization/evals/evals.json` and `.agent-skills/skills.json`
- Targeted residue/path checks:
  - `scripts/validate_skill.sh` and `scripts/validate_catalog_sync.py` examples in the skill must be truthful about repo-root vs skill-local execution
  - stale legacy commands (`convert_skills.py`, `remove_duplicates.py`, `final_cleanup.py`, `utilities/skill-standardization/SKILL.md`) must not remain in the `skill-standardization` manifest entry
- Keep-or-revert judgment:
  - Keep if the skill becomes more deterministic for repo-root maintenance, preserves the standardization scope, and improves transferability across future maintenance runs.
  - Revert if the rewrite only shortens text without fixing practical execution clarity or leaves discovery/manifest drift behind.

## Constraints
- Max effort this run: one bounded structural-hardening pass.
- No new sibling/wrapper skill.
- No changes to the validation scripts themselves unless the primary skill improvement cannot be made truthful without it.
- Prefer moving slower-changing detail into references instead of bloating `SKILL.md`.
- Update discovery surfaces only where the trigger surface or shipped metadata materially changed.

## Tried Already
- Keep: earlier passes added catalog-sync guidance and compact-variant sync duties.
- Revert: creating another meta-skill for catalog or compact sync; relying on manual memory alone.
- Why: repo evidence shows the durable win comes from hardening the existing canonical skill instead of spawning more wrappers.
