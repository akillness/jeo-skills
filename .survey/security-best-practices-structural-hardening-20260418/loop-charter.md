# Loop Charter

## Goal
Improve the existing `security-best-practices` skill so it acts as a smaller routing-first web/app/API hardening anchor with clearer mode selection, verification handoffs, and adjacent-skill boundaries.

## Current Baseline
- Current best version: `.agent-skills/security-best-practices/SKILL.md` on `main` at the start of this run.
- Current quality: valid and support-complete, but still a dense 284-line front door on the graph watchlist.
- Known issue: it still spends too many front-door lines on inline mode detail that can live in references.

## Mutable Artifact
Primary: `.agent-skills/security-best-practices/SKILL.md`

Supporting artifacts that may change only if the primary rewrite requires sync:
- `.agent-skills/security-best-practices/SKILL.toon`
- `.agent-skills/security-best-practices/evals/evals.json`
- `.agent-skills/security-best-practices/references/`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/security-best-practices`
- Catalog sync validation: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger/usefulness rubric:
  - description stays trigger-oriented and narrow enough to avoid swallowing auth/schema/debugging work
  - front door gets shorter/simpler while preserving the six security lanes
  - output contract stays as a concise hardening brief
  - discovery surfaces remain in sync when wording materially changes
- Evidence sources for the run: `.survey/security-best-practices-structural-hardening-20260418/*`, current repo graph/wiki state, and cited primary docs used in the survey

## Constraints
- Max time per iteration: one bounded maintenance run
- Max tool count/cost: keep changes focused to one skill lane
- Forbidden edits: no new overlapping security wrapper skill; no changes to evaluation harness mid-run
- Output requirements: preserve references/evals support coverage and update docs/setup surfaces if positioning/discoverability changes materially

## Tried Already
- Keep: survey and evidence gathering for a structural-hardening pass on `security-best-practices`
- Pending hypothesis: move packet-level mode detail into one focused reference and tighten the front door around intake, primary-mode selection, invariants, and route-outs
