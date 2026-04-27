---
type: "query"
date: "2026-04-27T18:47:43.114854+00:00"
question: "hourly survey run 2026-04-27 18:28 UTC: what low-risk change improves candidate discovery reliability?"
contributor: "graphify"
source_nodes: ["survey", "graphify", "github-repo-candidate-quality-gate"]
---

# Q: hourly survey run 2026-04-27 18:28 UTC: what low-risk change improves candidate discovery reliability?

## Answer

Add gh search repos empty-payload guard and fallback to gh api search/repositories endpoint; preserve transport_status and relative error-log path.

## Source Nodes

- survey
- graphify
- github-repo-candidate-quality-gate