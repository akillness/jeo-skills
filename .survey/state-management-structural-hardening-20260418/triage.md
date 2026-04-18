# Triage
- Problem: The existing `state-management` skill is a high-degree, oversized frontend anchor (~290 lines) whose front door can be tightened so agents classify state ownership faster and route adjacent concerns out more reliably.
- Audience: Agents and maintainers working on React / Next.js / frontend-fullstack repos who need a bounded decision skill for local state, Context, URL/form state, client stores, and server-state caching.
- Why now: The graph watchlist still flags `state-management` as an oversized front door, support coverage is already complete, and recent repo guidance favors shrinking dense anchors rather than adding more overlapping wrapper skills.
