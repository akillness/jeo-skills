#!/usr/bin/env python3
"""Generate deterministic mandatory hourly survey lane queries.

Outputs JSON with lane keys required by validate_hourly_evidence_contract.py,
including stage-0 base query and stage-1/stage-2 recovery queries.
"""

import json
import sys

LANES = {
    "agentic-ai-skill": "agentic ai skill",
    "web-frontend-skill": "web frontend skill",
    "web-backend-skill": "web backend skill",
    "cli-open-source-skill": "cli open source skill",
    "game-development-skill": "game development skill",
}


def build_queries(base_query):
    return {
        "stage-0": base_query,
        "stage-1": base_query + " stars:>5000",
        "stage-2": base_query + " pushed:>2024-01-01 stars:>100",
    }


def main():
    payload = {"lanes": {k: build_queries(v) for k, v in LANES.items()}}
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
