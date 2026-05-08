#!/usr/bin/env python3
"""Audit hourly lane evidence for intent-fit false positives.

Usage:
  python3 intent_fit_audit.py .survey/<slug>/evidence.json > .survey/<slug>/intent-fit-audit.md
"""

import json
import re
import sys

PERSONAL_RE = re.compile(r"portfolio|protfolio|homework|assignment|demo", re.I)
NEGATION_RE = re.compile(r"\b(no\s+cli|without\s+cli|not\s+a\s+cli|non-cli)\b", re.I)


def lane_tokens(lane):
    mapping = {
        "agentic-ai-skill": ["agent", "agentic", "ai", "llm", "autonomous"],
        "web-frontend-skill": ["frontend", "front-end", "react", "vue", "ui", "css", "web"],
        "web-backend-skill": ["backend", "back-end", "api", "server", "database", "web"],
        "cli-open-source-skill": ["cli", "command-line", "terminal", "tooling", "shell"],
        "game-development-skill": ["game", "gamedev", "unity", "unreal", "godot"],
    }
    return mapping.get(lane, [])


def overlap(text, tokens):
    text_l = (text or "").lower()
    for t in tokens:
        if t.lower() in text_l:
            return True
    return False


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: python3 intent_fit_audit.py .survey/<slug>/evidence.json\n")
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    print("# Intent-Fit Audit")
    print("- provenance: indexed snippet")
    for lane, payload in lanes.items():
        recs = payload.get("recommended", [])
        low = payload.get("low_fit_examples", [])
        flagged = []
        for item in recs + low:
            name = item.get("full_name") or item.get("fullName") or ""
            desc = item.get("description") or ""
            text = (name + " " + desc).strip()
            tokens = lane_tokens(lane)
            no_overlap = not overlap(text, tokens)
            personal = bool(PERSONAL_RE.search(text))
            neg = bool(NEGATION_RE.search(text))
            if no_overlap or personal or neg:
                flagged.append({
                    "repo": name,
                    "no_overlap": no_overlap,
                    "personal": personal,
                    "negation": neg,
                    "url": item.get("url", "")
                })

        print("\n## {}".format(lane))
        print("- kept_count: {}".format(payload.get("kept_count", 0)))
        print("- raw_count: {}".format(payload.get("raw_count", 0)))
        print("- flagged_count: {}".format(len(flagged)))
        for ex in flagged[:5]:
            print("  - {} | no_overlap={} personal={} negation={} | {}".format(
                ex["repo"], ex["no_overlap"], ex["personal"], ex["negation"], ex["url"]
            ))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
