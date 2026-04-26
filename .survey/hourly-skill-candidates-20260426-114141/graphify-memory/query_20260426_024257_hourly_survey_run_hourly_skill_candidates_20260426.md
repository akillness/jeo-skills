---
type: "query"
date: "2026-04-26T02:42:57.674650+00:00"
question: "hourly survey run hourly-skill-candidates-20260426-114141: what low-risk survey hardening should be prioritized?"
contributor: "graphify"
source_nodes: ["survey", "hourly", "quality-gate"]
---

# Q: hourly survey run hourly-skill-candidates-20260426-114141: what low-risk survey hardening should be prioritized?

## Answer

[ok] Command: python3 - <<'PY'
import json
from pathlib import Path
p=P...
   9 lines of output

List (8 items):
   • run_slug=hourly-skill-candidates-20260426-114141
   • recommended_lane_count=5
   • single_lane_concentration=False
   • agentic_ai_skill: status=pass kept=5 raw=47 median_stars_raw=1 zero...
   • web_frontend_skill: status=pass kept=5 raw=14 median_stars_raw=1544...
   • web_backend_skill: status=pass kept=5 raw=8 median_stars_raw=1808 z...
   • cli_open_source_skill: status=degraded kept=1 raw=3 median_stars_ra...
   • game_development_skill: status=pass kept=1 raw=30 median_stars_raw=...

## Source Nodes

- survey
- hourly
- quality-gate