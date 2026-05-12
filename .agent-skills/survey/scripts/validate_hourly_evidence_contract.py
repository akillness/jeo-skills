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
    sys.stderr.write(msg + "\n")
    return 1


def main(argv):
    if len(argv) != 2:
        return fail('usage: validate_hourly_evidence_contract.py <evidence.json>')

    path = argv[1]
    if not os.path.exists(path):
        return fail('missing evidence file: {0}'.format(path))

    try:
        with open(path, 'r') as f:
            data = json.load(f)
    except Exception as exc:
        return fail('invalid json: {0}'.format(exc))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('contract violation: top-level "lanes" map is required')

    errors = []
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            errors.append('missing lane key: {0}'.format(lane))
            continue
        lane_obj = lanes.get(lane)
        if not isinstance(lane_obj, dict):
            errors.append('lane is not an object: {0}'.format(lane))
            continue

        raw_count = lane_obj.get('raw_count')
        kept_count = lane_obj.get('kept_count')
        if isinstance(raw_count, int) and isinstance(kept_count, int):
            if kept_count > raw_count:
                errors.append('impossible metrics in {0}: kept_count({1}) > raw_count({2})'.format(lane, kept_count, raw_count))

        recovery = lane_obj.get('recovery_queries')
        if not isinstance(recovery, dict):
            errors.append('missing recovery_queries object in {0}'.format(lane))
        else:
            for stage in ('stage-1', 'stage-2'):
                st = recovery.get(stage)
                if not isinstance(st, dict):
                    errors.append('missing recovery_queries[{0}] in {1}'.format(stage, lane))
                else:
                    if not st.get('query'):
                        errors.append('empty recovery query for {0} {1}'.format(lane, stage))

    if errors:
        for e in errors:
            sys.stderr.write('- ' + e + '\n')
        return 1

    print('ok: hourly evidence contract validated')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
