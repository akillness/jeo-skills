# Triage
- Problem: Hourly five-lane survey runs can end with degraded lanes where `raw_count == 0`, but degraded-cause taxonomy does not explicitly encode this no-result state.
- Audience: Maintainers of `.agent-skills/survey` and cron reviewers who triage lane-health drift.
- Why now: In this run (`hourly-skill-candidates-20260425-194028`), backend remained `raw_count=0` after documented recovery, producing empty degraded causes and weaker remediation guidance. (indexed snippet)
