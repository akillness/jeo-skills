## Settings
- Repo: akillness/oh-my-skills
- Mode: open-pr carry-forward

## Rules
- Merge only when checks are present and green.
- Keep staged recovery query entries for every lane.

## Hooks
- validate_survey_artifacts.py --platform-topic --require-provenance
- check_recommended_lane_concentration.py

## Platform Gaps
- Active PR has no checks reported; merge remains blocked.

Provenance: indexed snippet.