## Summary
- Hourly 5-lane survey artifacts generated with provenance and strict validator pass.
- Survey skill hardening: added unattended internal triad consensus requirement across SKILL.md / SKILL.toon / evals.
- Added run artifacts (evidence, lane raw snapshots, fallback RTK/Graphify, Obsidian/LLM-Wiki notes).

## Evidence / Provenance
- Artifact folder: `.survey/hourly-skill-candidates-20260506-080945/`
- agentic-ai-skill: raw=30, kept=5, status=pass, causes=none
- web-frontend-skill: raw=5, kept=0, status=degraded, causes=low-signal
- web-backend-skill: raw=1, kept=0, status=degraded, causes=low-signal
- cli-open-source-skill: raw=1, kept=1, status=pass, causes=none
- game-development-skill: raw=30, kept=1, status=pass, causes=none

## Risk
- Low code-risk: docs/skill policy + survey artifacts only.
- Merge risk: if GitHub checks are absent/non-green, merge must be blocked.

## Rollback Plan
- Revert this PR commit to restore previous survey-skill guidance and remove this run artifacts.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --platform-topic --require-provenance` : PASS
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` : PASS
- `git diff --check` : PASS