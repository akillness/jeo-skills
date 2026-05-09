#!/usr/bin/env python3
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
    sys.stderr.write('ERROR: %s\n' % msg)
    return 1


def main(argv):
    if len(argv) != 2:
        sys.stderr.write('Usage: validate_hourly_evidence_contract.py <evidence.json>\n')
        return 2
    path = argv[1]
    if not os.path.isfile(path):
        return fail('file not found: %s' % path)
    try:
        data = json.load(open(path, 'r', encoding='utf-8'))
    except Exception as e:
        return fail('invalid json: %s' % e)

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('missing lanes object')

    missing = [k for k in REQUIRED_LANES if k not in lanes]
    if missing:
        return fail('missing lane keys: %s' % ', '.join(missing))

    for lane_key in REQUIRED_LANES:
        lane = lanes.get(lane_key) or {}
        rq = lane.get('recovery_queries')
        if not isinstance(rq, list):
            return fail('%s: recovery_queries must be a list' % lane_key)
        stages = set()
        for item in rq:
            if isinstance(item, dict) and 'stage' in item:
                stages.add(item.get('stage'))
        if 'stage-1' not in stages or 'stage-2' not in stages:
            return fail('%s: recovery_queries must include stage-1 and stage-2' % lane_key)

        raw_count = lane.get('raw_count', 0)
        kept_count = lane.get('kept_count', 0)
        if isinstance(raw_count, int) and isinstance(kept_count, int) and kept_count > raw_count:
            return fail('%s: kept_count > raw_count' % lane_key)

        if raw_count == 0:
            causes = lane.get('degraded_causes') or []
            if 'no-results' not in causes:
                return fail('%s: raw_count==0 requires degraded_cause no-results' % lane_key)

    print('OK: hourly evidence contract valid')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
