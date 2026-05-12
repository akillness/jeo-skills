# Platform Map
## Settings
- Repo: akillness/oh-my-skills
- Run slug: hourly-skill-candidates-20260512-023028
## Rules
- Required lanes: agentic-ai-skill, web-frontend-skill, web-backend-skill, cli-open-source-skill, game-development-skill
- Require stage-1 and stage-2 recovery queries for every lane.
## Hooks
- validate_survey_artifacts.py --platform-topic --require-provenance
- validate_hourly_evidence_contract.py <evidence.json>
## Platform Gaps
- CI checks not configured/reported for PR #271 (merge blocked).
- Graphify CLI unavailable in this environment; fallback artifact emitted.
Provenance: indexed snippet / direct page retrieval
