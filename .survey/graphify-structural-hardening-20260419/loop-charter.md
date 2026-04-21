# Loop Charter

## Goal
Improve the existing `graphify` skill so it is a truthful, reusable, routing-first live skill in `oh-my-skills` rather than a partially hidden capability sitting outside normal top-level discovery.

## Current Baseline
- Current best version lives at `.agent-skills/utilities/graphify/`.
- It has `SKILL.md`, `references/overview.md`, and `evals/evals.json` but no compact discovery variant.
- It reads more like a capability catalog than the repo's newer routing-first front doors.
- The repo's query-handler filesystem catalog only scans top-level `*/SKILL.md`, so the nested placement risks making `graphify` invisible to runtime discovery.

## Mutable Artifact
Primary file: `.agent-skills/graphify/SKILL.md`

Supporting files allowed if the primary rewrite needs them:
- `.agent-skills/graphify/SKILL.toon`
- `.agent-skills/graphify/references/*`
- `.agent-skills/graphify/evals/evals.json`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- removal of the stale nested copy once the top-level skill is live

## Fixed Evaluation Harness
- Agent Skills spec / repo conventions from `skill-standardization`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/graphify`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Runtime-discovery check: confirm `graphify` appears in `.agent-skills/skills.json` and top-level discovery surfaces
- Dry-run rubric:
  1. trigger description clearly claims durable graph / path-trace / mixed-corpus graphing
  2. front door routes search-first work to `codebase-search`, narrative synthesis to `llm-wiki`, and project memory to `opencontext`
  3. local assistant-native vs Python/fallback paths are explicit
  4. support files and compact surface stay in sync

## Constraints
- Max one bounded improvement set this run
- Prefer patch/upgrade/consolidation over creating a new overlapping skill
- Do not change the evaluation harness mid-run
- Keep the result within the repo's routing-first skill style
- Update README / README.ko / setup / manifest surfaces if the live skill boundary changes materially

## Tried Already
- Keep: survey-first evidence gathering on upstream Graphify + adjacent alternatives
- Keep: identify nested-path discovery gap and missing compact variant as the main leverage point
- Revert: none yet in this run
