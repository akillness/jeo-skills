# Triage
- Problem: Hourly maintenance loop needs search-first, evidence-backed skill update candidates while preventing noisy/irrelevant recommendations.
- Audience: Maintainers of akillness/oh-my-skills running unattended cron updates.
- Why now: Repeated hourly runs require stable quality gates and explicit recovery logic to avoid drift and false-positive candidates.

Provenance: direct page retrieval via `gh search repos` metadata queries.
