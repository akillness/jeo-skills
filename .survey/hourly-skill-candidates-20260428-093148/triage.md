# Triage

- Problem:
  - web_search transport degraded (`INVALID_API_KEY`) and carry-forward PR #208 was `DIRTY`, blocking direct merge.
- Audience:
  - hourly automation maintainers and reviewers of `akillness/oh-my-skills`.
- Why now:
  - unattended hourly loop must keep merge-safe progress and preserve outage diagnostics in artifacts.

Provenance: indexed snippet (`gh pr list`, `gh pr view`), browser-rendered retrieval (N/A), direct page retrieval (`gh api search/repositories`).
