---
type: "query"
date: "2026-04-25T04:27:51.604068+00:00"
question: "hourly survey run 2026-04-25: what low-risk survey ratchet is justified by current evidence?"
contributor: "graphify"
source_nodes: ["survey", "keyword-sweep", "lane_status", "degraded_causes", "web_search", "gh-fallback"]
---

# Q: hourly survey run 2026-04-25: what low-risk survey ratchet is justified by current evidence?

## Answer

Add transport/auth to degraded_causes taxonomy for hourly lane reports because this run hit web_search 401 INVALID_API_KEY while GitHub-native fallback still produced valid candidate evidence.

## Source Nodes

- survey
- keyword-sweep
- lane_status
- degraded_causes
- web_search
- gh-fallback