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
    sys.stderr.write(msg + '\n')
    return 1


def main():
    if len(sys.argv) != 2:
        return fail('usage: validate_hourly_evidence_contract.py <evidence.json>')
    path = sys.argv[1]
    if not os.path.exists(path):
        return fail('missing file: {0}'.format(path))
    with open(path, 'r') as f:
        try:
            data = json.load(f)
        except Exception as e:
            return fail('invalid json: {0}'.format(e))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('missing lanes object')

    missing = [k for k in REQUIRED_LANES if k not in lanes]
    if missing:
        return fail('missing required lane keys: {0}'.format(', '.join(missing)))

    for lane in REQUIRED_LANES:
        lane_obj = lanes.get(lane, {})
        raw = lane_obj.get('raw_count', 0)
        kept = lane_obj.get('kept_count', 0)
        if isinstance(raw, int) and isinstance(kept, int) and kept > raw:
            return fail('invalid counts for {0}: kept_count > raw_count'.format(lane))

        rq = lane_obj.get('recovery_queries')
        if not isinstance(rq, list):
            return fail('lane {0}: recovery_queries must be a list'.format(lane))
        stages = set()
        for item in rq:
            if isinstance(item, dict):
                stages.add(item.get('stage'))
        if 'stage-1' not in stages or 'stage-2' not in stages:
            return fail('lane {0}: missing required recovery stages stage-1/stage-2'.format(lane))

        if raw == 0:
            causes = lane_obj.get('degraded_causes', [])
            if 'no-results' not in causes:
                return fail('lane {0}: raw_count=0 requires degraded_causes to include no-results'.format(lane))

    print('OK: hourly evidence contract valid')
    return 0


if __name__ == '__main__':
    sys.exit(main())
