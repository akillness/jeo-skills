## Settings
- Search backend: GitHub native (`gh search repos`) for deterministic cron reliability.
- Quality settings: freshness<=24 months, signal floor stars>=3, explicit license required.

## Rules
- Execute 5 mandatory keyword families every run.
- Apply stage-1 recovery on sparse/noisy lanes (raw_count<8 OR kept_count=0 OR zero_star_raw/raw_count>=0.70).
- Apply one stage-2 recovery query where configured if lane remains empty/no-keep.
- Emit lane_status(pass|degraded), degraded_causes taxonomy, and lane metrics.

## Hooks
- Validator: `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-140150 --platform-topic --require-provenance`.
- Post-run gates: git diff --check, PR self-review checklist, merge only on green checks.

## Platform Gaps
- Web search API outages can force GitHub-native fallback; provenance remains bounded to indexed snippet/direct page retrieval labels.
- Graphify query schema drift may require save-result/fallback graph artifact path.

Provenance: direct page retrieval + indexed snippet.