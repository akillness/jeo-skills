---
type: "query"
date: "2026-04-27T07:33:54.410627+00:00"
question: "hourly survey run 2026-04-27 07:32:00: what low-risk hardening should be merged next?"
contributor: "graphify"
source_nodes: [".agent-skills/survey/SKILL.md", ".agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md", ".survey/hourly-skill-candidates-20260427-073200/solutions.md", ".survey/hourly-skill-candidates-20260427-073200/evidence.json"]
---

# Q: hourly survey run 2026-04-27 07:32:00: what low-risk hardening should be merged next?

## Answer

Codify explicit web_search auth-failure logging: when transport degrades (e.g., INVALID_API_KEY), require writing .survey/<slug>/web-search-error.log and include it in transport_status (cause + fallback family + error-log path).

## Source Nodes

- .agent-skills/survey/SKILL.md
- .agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md
- .survey/hourly-skill-candidates-20260427-073200/solutions.md
- .survey/hourly-skill-candidates-20260427-073200/evidence.json