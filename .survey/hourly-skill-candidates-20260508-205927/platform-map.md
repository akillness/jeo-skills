# Platform Map

## Settings
- Source: GitHub repository search via gh CLI
- Time gate: pushed within last 24 months for recommendation-grade keep

## Rules
- mandatory lanes: agentic-ai-skill, web-frontend-skill, web-backend-skill, cli-open-source-skill, game-development-skill
- degrade with `no-results` when raw_count==0 after staged recovery queries

## Hooks
- validate_hourly_evidence_contract.py before commit
- validate_survey_artifacts.py --platform-topic --require-provenance

## Platform Gaps
- some branches still report no checks configured, blocking merge automation

Provenance: indexed snippet, direct page retrieval
