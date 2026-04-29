---
type: "query"
date: "2026-04-26T21:27:24.015003+00:00"
question: "For this hourly survey run, what low-risk hardening should be prioritized to reduce off-topic keyword matches while keeping recall?"
contributor: "graphify"
source_nodes: ["survey", "keyword-sweep", "relevance-gate"]
---

# Q: For this hourly survey run, what low-risk hardening should be prioritized to reduce off-topic keyword matches while keeping recall?

## Answer

[ok] Command: python3 .survey/hourly-skill-candidates-20260427-062544/l...
   10 lines of output

List (9 items):
   • run_slug: hourly-skill-candidates-20260427-062544
   • recommended_total: 27
   • recommended_lane_count: 5
   • single_lane_concentration: False
   • lane=agentic-ai-skill raw_count=10 kept_count=6 median_stars_raw=65...
   • lane=web-frontend-skill raw_count=10 kept_count=6 median_stars_raw=...
   • lane=web-backend-skill raw_count=10 kept_count=8 median_stars_raw=3...
   • lane=cli-open-source-skill raw_count=10 kept_count=8 median_stars_r...
   • lane=game-development-skill raw_count=10 kept_count=8 median_stars_...

## Source Nodes

- survey
- keyword-sweep
- relevance-gate