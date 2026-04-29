---
type: "query"
date: "2026-04-25T19:44:53.831778+00:00"
question: "hourly survey run 2026-04-25: what low-risk survey-contract hardening best explains degraded lanes with raw_count zero?"
contributor: "graphify"
source_nodes: ["survey", "hourly", "degraded-causes", "lane-status", "raw_count"]
---

# Q: hourly survey run 2026-04-25: what low-risk survey-contract hardening best explains degraded lanes with raw_count zero?

## Answer

Low-risk hardening candidate: add explicit no-results degraded cause when a lane remains raw_count==0 after documented recovery; this improves reviewer actionability without changing keep filters.

## Source Nodes

- survey
- hourly
- degraded-causes
- lane-status
- raw_count