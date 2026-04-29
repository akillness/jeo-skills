# Triage
- Problem: Hourly repo-maintenance survey loops still produce sparse/noisy lanes where query recovery was attempted but not always logged as a deterministic per-lane transcript, making degraded decisions hard to audit.
- Audience: oh-my-skills maintainers and unattended cron agents that generate/merge hourly survey PRs.
- Why now: This run observed persistent zero-result retries in web-frontend/web-backend lanes and needs explicit evidence transcript structure plus one low-risk new-skill documentation addition.
