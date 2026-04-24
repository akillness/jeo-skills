---
type: "query"
date: "2026-04-24T19:09:52.753189+00:00"
question: "hourly survey run 2026-04-25: what quality ratchet was applied?"
contributor: "graphify"
source_nodes: ["survey", "keyword-sweep-and-relevance-rescue", "freshness-floor", "license-gate"]
---

# Q: hourly survey run 2026-04-25: what quality ratchet was applied?

## Answer

Added explicit recommendation-grade freshness floor (exclude stale pushed_at older than 24 months unless exception rationale), retained unknown-license default exclusion, and preserved mandatory 5-lane coverage with provenance.

## Source Nodes

- survey
- keyword-sweep-and-relevance-rescue
- freshness-floor
- license-gate