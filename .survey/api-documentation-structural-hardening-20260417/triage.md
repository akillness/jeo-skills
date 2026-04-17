# Triage
- Problem: `api-documentation` is modernized but still oversized at 337 lines in `SKILL.md`, with too much multi-mode workflow detail sitting in the front door instead of focused support packets (`graphify-out/GRAPH_REPORT.md:36-56`).
- Audience: maintainers and agents using the repo’s developer-facing API docs skill across reference, quickstart, SDK, webhook, migration, and portal work.
- Why now: repo support coverage already exists, and both repo-local evidence and primary-source docs from Stripe, GitHub, Redocly, Speakeasy, and Postman point toward the same next bounded win: make the entry surface smaller and mode-aware rather than adding another overlapping docs wrapper.
