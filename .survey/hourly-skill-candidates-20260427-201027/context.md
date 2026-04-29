# Context: oh-my-skills hourly survey maintenance

## Workflow Context
The workflow runs hourly survey-first discovery, then emits artifacts for PR decisions. Retrieval in this run used GitHub search plus metadata enrichment (direct page retrieval).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Approve and merge low-risk upkeep PRs | Advanced |
| Automation operator | Keep cron runs auditable and deterministic | Advanced |
| Skill contributors | Reuse verified candidate evidence | Intermediate |

## Current Workarounds
1. Manual filtering when broad keyword results are noisy.
2. Manual cross-lane checks for concentration risk.
3. Manual fallback handling for headless tooling failures.

## Adjacent Problems
- Sparse license metadata in search payloads can hide valid candidates.
- Some lanes return high-noise, low-signal results.
- Query transport/tooling drift can break unattended runs.

## User Voices
- "github/awesome-copilot is active and recommendation-grade for agentic-ai-skill" — https://github.com/github/awesome-copilot (direct page retrieval)
- "coreyhaines31/marketingskills is active and recommendation-grade for agentic-ai-skill" — https://github.com/coreyhaines31/marketingskills (direct page retrieval)
- "zarazhangrui/frontend-slides is active and recommendation-grade for web-frontend-skill" — https://github.com/zarazhangrui/frontend-slides (direct page retrieval)
- "ceilf6/FrontAgent is active and recommendation-grade for web-frontend-skill" — https://github.com/ceilf6/FrontAgent (direct page retrieval)
- "mukeshlilawat1/Hotel-Mountain-Mirage is active and recommendation-grade for web-backend-skill" — https://github.com/mukeshlilawat1/Hotel-Mountain-Mirage (direct page retrieval)
