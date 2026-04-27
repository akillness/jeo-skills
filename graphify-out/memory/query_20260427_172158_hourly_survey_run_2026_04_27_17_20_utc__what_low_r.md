---
type: "query"
date: "2026-04-27T17:21:58.441975+00:00"
question: "hourly survey run 2026-04-27 17:20 UTC: what low-risk hardening should we merge?"
contributor: "graphify"
source_nodes: ["survey", "transport-status", "portability"]
---

# Q: hourly survey run 2026-04-27 17:20 UTC: what low-risk hardening should we merge?

## Answer

Normalize transport_status.error_log to repository-relative .survey/<slug>/web-search-error.log and reject host-absolute paths in new artifacts.

## Source Nodes

- survey
- transport-status
- portability