#!/usr/bin/env python3
import json
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
    try:
        data = json.load(open(path, 'r'))
    except Exception as e:
        return fail('failed to read json: {0}'.format(e))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('missing lanes map')

    missing = [k for k in REQUIRED_LANES if k not in lanes]
    if missing:
        return fail('missing lane keys: {0}'.format(', '.join(missing)))

    for lane in REQUIRED_LANES:
        row = lanes.get(lane, {})
        for k in ['raw_count', 'zero_star_raw', 'median_stars_raw', 'kept_count', 'lane_status', 'degraded_causes', 'recovery_queries']:
            if k not in row:
                return fail('lane {0} missing key {1}'.format(lane, k))
        raw_count = row.get('raw_count', 0)
        kept_count = row.get('kept_count', 0)
        if kept_count > raw_count:
            return fail('lane {0} invalid metrics: kept_count > raw_count'.format(lane))

        rec = row.get('recovery_queries')
        if not isinstance(rec, list) or len(rec) < 2:
            return fail('lane {0} recovery_queries must include stage-1 and stage-2'.format(lane))
        stages = set()
        for item in rec:
            if isinstance(item, dict):
                st = item.get('stage')
                if st:
                    stages.add(st)
        if 'stage-1' not in stages or 'stage-2' not in stages:
            return fail('lane {0} recovery stages incomplete'.format(lane))

        if raw_count == 0:
            causes = row.get('degraded_causes') or []
            if 'no-results' not in causes:
                return fail('lane {0} raw_count==0 requires degraded_causes include no-results'.format(lane))

    sys.stdout.write('ok\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
