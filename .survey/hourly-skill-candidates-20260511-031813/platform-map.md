## Settings
- Repository: akillness/oh-my-skills
- Mode: open-PR carry-forward (no new PR while open PR exists)

## Rules
- Merge blocked when checks are missing or non-green.
- Each run must include at least one substantive development/procedural improvement.

## Hooks
- validate_survey_artifacts.py --platform-topic --require-provenance
- validate_hourly_evidence_contract.py <evidence.json>

## Platform Gaps
- Current active PR reports no checks; blocker reporting and CI bootstrap guidance remain required.

Provenance: indexed snippet
