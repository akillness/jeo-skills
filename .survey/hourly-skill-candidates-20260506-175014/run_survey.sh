#!/usr/bin/env bash
set -euo pipefail
slug="$1"
mkdir -p ".survey/$slug/raw"
run_lane () {
  lane="$1"
  q="$2"
  gh search repos "$q" --limit 50 --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount > ".survey/$slug/raw/${lane}-stage1.json" || echo '[]' > ".survey/$slug/raw/${lane}-stage1.json"
  c=$(python3 - <<'PY' ".survey/$slug/raw/${lane}-stage1.json"
import json,sys
try:
 d=json.load(open(sys.argv[1]))
 print(len(d))
except:
 print(0)
PY
)
  if [ "$c" -eq 0 ]; then
    rq="$q stars:>5000 pushed:>=2025-11-01"
    gh search repos "$rq" --limit 50 --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount > ".survey/$slug/raw/${lane}-stage2.json" || echo '[]' > ".survey/$slug/raw/${lane}-stage2.json"
  fi
}
run_lane "agentic-ai-skill" "agentic ai skill pushed:>=2026-04-29"
run_lane "web-frontend-skill" "web frontend skill pushed:>=2026-04-29"
run_lane "web-backend-skill" "web backend skill pushed:>=2026-04-29"
run_lane "cli-open-source-skill" "cli open source skill pushed:>=2026-04-29"
run_lane "game-development-skill" "game development skill pushed:>=2026-04-29"
