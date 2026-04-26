---
type: "query"
date: "2026-04-26T16:52:00.371028+00:00"
question: "hourly survey run 2026-04-27: what low-risk hardening should be merged?"
contributor: "graphify"
source_nodes: ["survey", "keyword-sweep", "freshness", "gate"]
---

# Q: hourly survey run 2026-04-27: what low-risk hardening should be merged?

## Answer

Use rolling 24-month pushed cutoff variables in survey recovery templates instead of fixed 2024-01-01 date literals; this keeps freshness gating aligned without changing merge-critical logic.

## Source Nodes

- survey
- keyword-sweep
- freshness
- gate