# Triage
- Problem: Hourly survey candidate discovery can drift toward noisy keyword matches (unknown license/stale repos), lowering signal for skill updates.
- Audience: Maintainers of akillness/oh-my-skills running recurring survey-first maintenance loops.
- Why now: Current run still surfaced noisy keep-candidates in frontend/backend lanes; quality gates need a stronger freshness + license floor.

Provenance: browser-rendered retrieval (GitHub search via gh CLI API surface), direct page retrieval (repository metadata fields).
