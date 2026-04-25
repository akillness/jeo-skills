# Triage
- Problem: Hourly repo-maintenance surveys for `oh-my-skills` still show noisy keyword hits and occasional search-tool outages, which makes lane-level degradation hard to classify consistently.
- Audience: Maintainers operating automated PR loops for skill hardening and candidate discovery.
- Why now: This run observed repeatable `web_search` 401 auth failures and sparse keyword lanes; the current degraded-cause taxonomy (`license|stale|low-fit|archived`) cannot express transport/auth failures cleanly.
