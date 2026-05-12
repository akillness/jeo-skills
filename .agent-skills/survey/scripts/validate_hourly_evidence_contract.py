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
    sys.stderr.write(msg + "\n")
    return 1


def main():
    if len(sys.argv) != 2:
        return fail('usage: validate_hourly_evidence_contract.py <evidence.json>')

    path = sys.argv[1]
    try:
        data = json.load(open(path, 'r'))
    except Exception as e:
        return fail('failed to read evidence json: {0}'.format(e))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('invalid contract: missing lanes map')

    missing = [k for k in REQUIRED_LANES if k not in lanes]
    extra = [k for k in lanes.keys() if k not in REQUIRED_LANES]
    if missing:
        return fail('missing required lane keys: {0}'.format(', '.join(missing)))
    if extra:
        return fail('unexpected lane keys: {0}'.format(', '.join(extra)))

    for lane_name in REQUIRED_LANES:
        lane = lanes.get(lane_name, {})
        rq = lane.get('recovery_queries')
        if not isinstance(rq, list):
            return fail('lane {0}: recovery_queries must be list'.format(lane_name))
        stages = {}
        for item in rq:
            if isinstance(item, dict) and 'stage' in item:
                stages[item.get('stage')] = True
        if 'stage-1' not in stages or 'stage-2' not in stages:
            return fail('lane {0}: recovery_queries must include stage-1 and stage-2'.format(lane_name))

        raw_count = lane.get('raw_count', 0)
        kept_count = lane.get('kept_count', 0)
        if kept_count > raw_count:
            return fail('lane {0}: kept_count > raw_count'.format(lane_name))
        if raw_count == 0:
            causes = lane.get('degraded_causes') or []
            if 'no-results' not in causes:
                return fail('lane {0}: raw_count=0 requires degraded_causes to include no-results'.format(lane_name))

    print(json.dumps({'status': 'pass', 'path': path, 'lanes': REQUIRED_LANES}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
