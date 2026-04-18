# Triage
- Problem: `monitoring-observability` is still a 290-line front door, and its compact discovery surface (`SKILL.toon` / `skills.toon`) is stale enough to advertise the pre-modernization "set up monitoring/logging" behavior instead of the current routing-first observability brief.
- Audience: maintainers of `oh-my-skills/.agent-skills`, plus downstream agents that need crisp triggering for service reliability, telemetry rollout, data/pipeline monitoring, review audits, and game live-ops visibility.
- Why now: graph and wiki evidence show support coverage is already complete repo-wide, so the highest-value bounded win is shrinking another dense anchor and syncing compact discovery surfaces rather than adding a new observability wrapper.
