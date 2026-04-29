# Triage
- Problem: Hourly survey needs recommendation-quality candidate promotion with explicit lane health reporting.
- Audience: Maintainers operating the oh-my-skills hourly PR loop.
- Why now: This run produced both promotion-grade candidates and degraded-lane evidence requiring guardrail tuning.

## Lane Health Snapshot
- agentic-ai-skill: status=pass, raw=60, kept=26, median_stars=268.5, degraded_causes=license,low-signal (direct page retrieval)
- web-frontend-skill: status=pass, raw=33, kept=7, median_stars=14, degraded_causes=license,low-signal,stale (direct page retrieval)
- web-backend-skill: status=pass, raw=17, kept=1, median_stars=12, degraded_causes=license,low-fit,stale (direct page retrieval)
- cli-open-source-skill: status=pass, raw=18, kept=11, median_stars=22.5, degraded_causes=license,low-fit,stale (direct page retrieval)
- game-development-skill: status=pass, raw=30, kept=1, median_stars=0.0, degraded_causes=archived,license,low-signal,stale (direct page retrieval)
