# Triage
- Problem: Hourly runs already require transport fallback reporting, but eval coverage does not explicitly test repository-relative `transport_status.web_search.error_log` paths.
- Audience: Maintainers operating unattended hourly survey/PR loops.
- Why now: web_search is currently degraded (401), making portability-safe fallback logging an active quality requirement.
