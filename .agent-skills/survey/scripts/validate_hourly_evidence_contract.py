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


def main(argv):
    if len(argv) != 2:
        return fail('usage: validate_hourly_evidence_contract.py <evidence.json>')

    path = argv[1]
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return fail('failed to read evidence: {0}'.format(e))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail("missing 'lanes' map")

    rc = 0
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            sys.stderr.write('missing lane: {0}\n'.format(lane))
            rc = 1
            continue
        node = lanes[lane]
        for key in ['raw_count', 'kept_count', 'recovery_queries', 'lane_status', 'degraded_causes']:
            if key not in node:
                sys.stderr.write('lane {0} missing key: {1}\n'.format(lane, key))
                rc = 1
        rq = node.get('recovery_queries')
        if not isinstance(rq, list):
            sys.stderr.write('lane {0} recovery_queries must be list\n'.format(lane))
            rc = 1
        else:
            stages = {}
            i = 0
            while i < len(rq):
                st = rq[i].get('stage') if isinstance(rq[i], dict) else None
                if st:
                    stages[st] = True
                i += 1
            if not stages.get('stage-1'):
                sys.stderr.write('lane {0} missing recovery stage-1\n'.format(lane))
                rc = 1
            if not stages.get('stage-2'):
                sys.stderr.write('lane {0} missing recovery stage-2\n'.format(lane))
                rc = 1

        raw_count = node.get('raw_count')
        kept_count = node.get('kept_count')
        if isinstance(raw_count, int) and isinstance(kept_count, int):
            if kept_count > raw_count:
                sys.stderr.write('lane {0} has kept_count > raw_count\n'.format(lane))
                rc = 1
            if raw_count == 0:
                causes = node.get('degraded_causes') or []
                if 'no-results' not in causes:
                    sys.stderr.write("lane {0} raw_count=0 requires degraded_causes include 'no-results'\n".format(lane))
                    rc = 1

    if rc == 0:
        sys.stdout.write('hourly evidence contract: OK\n')
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv))
