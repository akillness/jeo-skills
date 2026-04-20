# Triage
- Problem: Tighten the existing `omc` skill into a smaller packet-first front door that tells operators which OMC surface they are actually using, routes mixed-runtime asks out earlier, and keeps fast-moving OMC setup/runtime details truthful.
- Audience: Agent operators using Claude Code / OMC, plus maintainers of the `oh-my-skills` catalog who need a reusable, non-duplicative Claude-first orchestration skill.
- Why now: `omc` is still on the oversized front-door watchlist in `graphify-out/GRAPH_REPORT.md`, the active OMC/BMAD PR has been merged, and the repo now benefits more from another bounded router ratchet than from adding a new orchestration wrapper.
