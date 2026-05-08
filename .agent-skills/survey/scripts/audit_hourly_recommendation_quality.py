#!/usr/bin/env python3
"""Audit hourly evidence for recommendation-quality policy compliance.

Checks:
- lane-intent token overlap in recommended candidates
- negation-aware intent guard
- generic personal/demo repo exclusion guard
- freshness floor (pushed_at <= 24 months)

Usage:
  python3 audit_hourly_recommendation_quality.py .survey/<slug>/evidence.json
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

TOKENS = {
    "agentic-ai-skill": ["agentic", "agent", "ai"],
    "web-frontend-skill": ["frontend", "react", "vue", "angular", "ui", "web"],
    "web-backend-skill": ["backend", "api", "server", "web"],
    "cli-open-source-skill": ["cli", "shell", "terminal", "command"],
    "game-development-skill": ["game", "gamedev", "unity", "unreal", "godot"],
}
NEGATION_PATTERNS = [r"no\s+cli", r"without\s+cli", r"not\s+a\s+cli", r"non-cli"]
PERSONAL_PATTERNS = [r"portfolio", r"protfolio", r"homework", r"assignment", r"\bdemo\b"]


def parse_dt(value):
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def age_months(ts):
    dt = parse_dt(ts)
    if not dt:
        return None
    now = datetime.now(timezone.utc)
    return (now.year - dt.year) * 12 + (now.month - dt.month)


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: audit_hourly_recommendation_quality.py .survey/<slug>/evidence.json\n")
        return 2
    p = Path(sys.argv[1])
    if not p.exists():
        sys.stderr.write("missing file: {}\n".format(p))
        return 2

    obj = json.loads(p.read_text())
    lanes = obj.get("lanes", {})

    violations = []
    print("lane,repo,token_overlap,negation_hit,personal_hit,age_months")

    for lane, lane_obj in lanes.items():
        for item in lane_obj.get("recommended", []):
            name = str(item.get("fullName", ""))
            desc = str(item.get("description", ""))
            text = (name + " " + desc).lower()
            token_overlap = any(t in text for t in TOKENS.get(lane, []))
            negation_hit = any(re.search(pat, text) for pat in NEGATION_PATTERNS)
            personal_hit = any(re.search(pat, text) for pat in PERSONAL_PATTERNS)
            months = age_months(item.get("pushed_at") or item.get("updatedAt") or item.get("updated_at"))
            print("{},{},{},{},{},{}".format(
                lane,
                name,
                "yes" if token_overlap else "no",
                "yes" if negation_hit else "no",
                "yes" if personal_hit else "no",
                "" if months is None else months,
            ))
            if not token_overlap:
                violations.append("{}:{} missing token overlap".format(lane, name))
            if negation_hit:
                violations.append("{}:{} negation-only intent".format(lane, name))
            if personal_hit:
                violations.append("{}:{} personal/demo pattern".format(lane, name))
            if months is not None and months > 24:
                violations.append("{}:{} stale {} months".format(lane, name, months))

    if violations:
        sys.stderr.write("QUALITY_VIOLATIONS\n")
        for v in violations:
            sys.stderr.write("- {}\n".format(v))
        return 1

    print("OK: no recommendation-quality violations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
