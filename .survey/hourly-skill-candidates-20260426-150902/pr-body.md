## Summary
This hourly run executed the mandatory five-keyword survey sweep and found a deterministic metadata failure mode: many repositories returned `licenseInfo: null` in first-pass metadata, causing all lanes to degrade on `license`.

This PR adds a **low-risk license fallback ratchet** to the `survey` skill:
- When first-pass license is null/unknown (e.g. GraphQL `licenseInfo`), retry once with:
  - `gh api repos/<owner>/<repo> --jq .license.spdx_id`
- Only after fallback remains unknown, treat as unknown-license drop/exception case.

## Evidence (survey-based)
Artifacts:
- `.survey/hourly-skill-candidates-20260426-150902/triage.md`
- `.survey/hourly-skill-candidates-20260426-150902/context.md`
- `.survey/hourly-skill-candidates-20260426-150902/solutions.md`
- `.survey/hourly-skill-candidates-20260426-150902/platform-map.md`
- `.survey/hourly-skill-candidates-20260426-150902/evidence.json`
- `.survey/hourly-skill-candidates-20260426-150902/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-150902/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260426-150902/license-fallback-proof.txt`

Spot-check contradiction proving fallback value:
- GraphQL path: `gh repo view guarinogabriel/Mac-CLI --json licenseInfo --jq '.licenseInfo.spdxId'` -> empty
- REST path: `gh api repos/guarinogabriel/Mac-CLI --jq '.license.spdx_id'` -> `MIT`

## Changes
- `.agent-skills/survey/SKILL.md`
  - Added explicit metadata fallback rule for null/unknown license.
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - Added fallback detail to metadata minimum checklist.
- `.agent-skills/survey/SKILL.toon`
  - Synced compact rule text with fallback behavior.
- `.agent-skills/survey/evals/evals.json`
  - Strengthened eval assertions for unknown-license handling after fallback.
- `llm-wiki/*`
  - Added run knowledge note and index/log references for iterative evolution.

## Risk
- Low: guidance/eval/documentation-only change; no destructive repo operations.
- Operational tradeoff: one additional GitHub API call for candidates with null/unknown license.

## Rollback plan
- Revert this PR commit to restore prior strict behavior.
- No data migration or irreversible format changes.

## Validation
- `python3 -m json.tool .agent-skills/survey/evals/evals.json`
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-150902 --platform-topic --require-provenance`
- Verified GraphQL-vs-REST license mismatch in `license-fallback-proof.txt`
