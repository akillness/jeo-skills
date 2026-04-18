# Loop Charter

## Goal
Improve `looker-studio-bigquery` so it activates more like the repo's newer routing-first anchors: one primary packet, one thinner front door, and clearer route-outs for analysis, anomaly hunting, observability, and survey-first BI-platform choice.

## Current Baseline
Current best version is the 2026-04-15 modernization pass:
- strong lane boundary
- complete support coverage (`references/`, `evals/`, `SKILL.toon`)
- still 276 lines in `SKILL.md`
- still on the graphify oversized front-door watchlist

## Mutable Artifact
Primary mutable artifact: `.agent-skills/looker-studio-bigquery/SKILL.md`

Supporting surfaces may update only if the primary change is kept:
- `.agent-skills/looker-studio-bigquery/references/intake-packets-and-route-outs.md`
- `.agent-skills/looker-studio-bigquery/evals/evals.json`
- `.agent-skills/looker-studio-bigquery/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki + graphify artifacts

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/looker-studio-bigquery`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Dry-run prompts / acceptance targets:
  1. PM/ops KPI board build → pick a dashboard-spec packet and keep logic in BigQuery
  2. Slow/expensive marketing dashboard → pick a slow-dashboard or refresh-shape packet before cosmetic tweaks
  3. KPI drop explanation → route to `data-analysis`
  4. One giant mixed-audience board → pick an audience-split packet
  5. Exec wants commentary-friendly export / Sheets handoff → keep dashboard thin and name the handoff artifact
- Scoring rubric:
  - spec compliance passes
  - front-door lines shrink meaningfully
  - route-outs are clearer, not broader
  - packet names are more memorable than the old mode catalog
  - discovery surfaces stay truthful and synced

## Constraints
- Max one bounded structural-hardening pass this run
- No new overlapping BI/reporting skill
- No evaluator changes mid-loop
- Keep existing lane boundary with `data-analysis`, `pattern-detection`, `monitoring-observability`, and `survey`
- Preserve existing support docs unless the new packet reference materially improves reuse

## Tried Already
- Keep: 2026-04-15 modernization that established the lane boundary and added support/evals
- Revert: adding another generic BI/reporting wrapper
- Why: the gap is smaller routing and discovery, not missing concept coverage
