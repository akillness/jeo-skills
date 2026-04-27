# Triage
- Problem: Hourly skill-candidate survey runs can degrade when web_search transport fails (401 INVALID_API_KEY), causing fragile or non-reproducible evidence capture.
- Audience: oh-my-skills maintainers running unattended cron-based skill maintenance and PR loops.
- Why now: This run reproduced web_search transport failure and required GitHub-native fallback; we need a stricter runbook rule in the survey skill to preserve lane-status truth and evidence continuity.
