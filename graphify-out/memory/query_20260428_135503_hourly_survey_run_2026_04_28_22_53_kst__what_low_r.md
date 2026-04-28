---
type: "query"
date: "2026-04-28T13:55:03.415173+00:00"
question: "hourly survey run 2026-04-28 22:53 KST: what low-risk hardening should we apply to carry-forward PR selection?"
contributor: "graphify"
source_nodes: ["survey", "carry-forward", "mergeability", "unknown", "backlog"]
---

# Q: hourly survey run 2026-04-28 22:53 KST: what low-risk hardening should we apply to carry-forward PR selection?

## Answer

Use bounded mergeability re-checks when mergeStateStatus is UNKNOWN, then deterministic fallback to next PR candidate.

## Source Nodes

- survey
- carry-forward
- mergeability
- unknown
- backlog