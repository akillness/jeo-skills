# Triage
- Problem: Hourly survey loop for oh-my-skills still shows repeated degraded lanes (frontend/backend/game) with no recommendation-grade keeps after required keyword families, reducing PR-quality candidate diversity.
- Audience: Repository maintainers running unattended cron maintenance and reviewers validating lane-health evidence.
- Why now: This run reproduced three zero-result lanes, so a deterministic hardening update is needed before next hourly cycles accumulate low-coverage artifacts. (provenance: indexed snippet, direct page retrieval)
