# Loop Charter

## Goal
Improve the existing `survey` skill in one bounded pass so it is smaller, easier to trigger correctly, and more mechanically reliable for unattended repo-maintenance loops.

## Current Baseline
- Current best version: `.agent-skills/survey/SKILL.md` on `main` after the 2026-04-18 structural hardening pass.
- Current state: clear routing/evidence rules, complete support coverage, and working evals, but still 309 lines and still relying on prose rather than a survey-local validator for the `.survey/{slug}/` artifact contract.

## Mutable Artifact
Primary file: `.agent-skills/survey/SKILL.md`

Supporting files allowed if the single change hypothesis requires them:
- `.agent-skills/survey/references/*`
- `.agent-skills/survey/scripts/*`
- `.agent-skills/survey/evals/evals.json`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills structure/description check via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey`
- JSON parse checks for any changed JSON artifacts
- Repo-level catalog sync check via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --root .agent-skills`
- Targeted residue scan for stale survey wording or missing script/reference sync
- Usefulness rubric:
  1. `survey` front door gets smaller or clearer without losing the artifact contract
  2. artifact validation becomes more truthful/mechanical across platforms
  3. no new overlapping wrapper skill is introduced
  4. discovery/setup/wiki/graph surfaces stay in sync

## Constraints
- Max one coherent improvement set this run
- Keep the skill canonical; do not add an adjacent survey wrapper
- Do not change the `.survey/{slug}/` filenames or core headings
- Prefer portable validator commands over platform-specific hook magic
- Keep the change bounded enough for one PR

## Tried Already
- Keep: 2026-04-12 evidence-recovery hardening
- Keep: 2026-04-18 structural hardening that shrank `survey` from 392 to 309 lines and moved portability detail into references
- Revert/avoid: adding another research wrapper, making platform hooks the source of truth, or broadening `survey` back into a giant all-in-one explainer
- Hypothesis for this run: one more front-door compaction pass plus a survey-local artifact validator script will improve transferability more than any new wrapper or pure wording tweak