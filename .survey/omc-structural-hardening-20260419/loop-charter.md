# Loop Charter

## Goal
Improve the existing `.agent-skills/omc` skill so it becomes a smaller, more truthful routing-first front door for Claude-first orchestration instead of a long, partly stale operator manual.

## Current Baseline
- Baseline branch state: `main` after merging PR #138 (`opencontext` structural hardening).
- Current best artifact: `.agent-skills/omc/SKILL.md` at 272 lines with existing references, scripts, evals, and compact variant.
- Known weakness: the front door mixes install/setup detail, mode catalog, CLI syntax, stale command forms, and adjacent ownership that should live in references or route-outs.

## Mutable Artifact
Primary file: `.agent-skills/omc/SKILL.md`

Supporting files may change only as needed to keep discovery, references, evals, and docs truthful:
- `.agent-skills/omc/SKILL.toon`
- `.agent-skills/omc/evals/evals.json`
- `.agent-skills/omc/references/`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `docs/omc/README.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/omc`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity: `python3 -m json.tool .agent-skills/omc/evals/evals.json >/dev/null` and `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- Survey evidence package exists under `.survey/omc-structural-hardening-20260419/`
- Trigger-quality check: the skill must clearly distinguish plugin slash skills, `omc` CLI runtime, and route-outs to adjacent skills.

## Constraints
- Keep the change bounded to one coherent `omc` hardening pass.
- Prefer route-outs and support references over adding any new wrapper skill.
- Preserve truthful upstream command forms; do not keep stale `/omc:team` examples if upstream now uses `/team` and `omc team`.
- Update discovery surfaces only where the positioning materially changed.

## Tried Already
- Keep: merge the existing `opencontext` PR before starting new work so the run begins from a clean `main`.
- Keep: use a source-backed survey first, with GitHub raw/API fallbacks because `web_search` / `web_extract` are unreliable here.
- Revert: none yet for this run.
