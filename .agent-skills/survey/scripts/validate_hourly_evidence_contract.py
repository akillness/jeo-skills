#!/usr/bin/env python3
"""Validate hourly evidence contract for survey runs.

Usage:
  python3 validate_hourly_evidence_contract.py .survey/<slug>/evidence.json
"""
import json
import os
import sys

REQUIRED_LANES = [
    'agentic-ai-skill',
    'web-frontend-skill',
    'web-backend-skill',
    'cli-open-source-skill',
    'game-development-skill',
]


def fail(msg):
    sys.stderr.write('ERROR: {0}\n'.format(msg))
    return 1


def main(argv):
    if len(argv) != 2:
        sys.stderr.write('Usage: python3 validate_hourly_evidence_contract.py .survey/<slug>/evidence.json\n')
        return 2
    path = argv[1]
    if not os.path.exists(path):
        return fail('file not found: {0}'.format(path))

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('missing top-level lanes object')

    rc = 0
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            sys.stderr.write('MISSING_LANE: {0}\n'.format(lane))
            rc = 1
            continue
        row = lanes[lane]
        raw_count = int(row.get('raw_count', 0))
        kept_count = int(row.get('kept_count', 0))
        if kept_count > raw_count:
            sys.stderr.write('IMPOSSIBLE_COUNTS {0}: kept_count({1}) > raw_count({2})\n'.format(lane, kept_count, raw_count))
            rc = 1

        rq = row.get('recovery_queries')
        if not isinstance(rq, list):
            sys.stderr.write('MISSING_RECOVERY_QUERIES: {0}\n'.format(lane))
            rc = 1
        else:
            stages = set()
            for q in rq:
                if isinstance(q, dict) and q.get('stage'):
                    stages.add(q.get('stage'))
            if 'stage-1' not in stages or 'stage-2' not in stages:
                sys.stderr.write('INCOMPLETE_RECOVERY_STAGES {0}: need stage-1 and stage-2\n'.format(lane))
                rc = 1

        if raw_count == 0:
            causes = row.get('degraded_causes') or []
            if 'no-results' not in causes:
                sys.stderr.write('MISSING_NO_RESULTS_CAUSE: {0}\n'.format(lane))
                rc = 1

    if rc == 0:
        print('OK: hourly evidence contract passed for {0}'.format(path))
    return rc


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
