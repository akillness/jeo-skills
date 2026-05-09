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


def main(argv):
    if len(argv) != 2:
        sys.stderr.write('usage: validate_hourly_evidence_contract.py <evidence.json>\n')
        return 2
    path = argv[1]
    if not os.path.exists(path):
        return fail('missing evidence file: {0}'.format(path))
    try:
        data = json.load(open(path, 'r'))
    except Exception as exc:
        return fail('invalid json: {0}'.format(exc))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
        return fail('missing lanes object')

    rc = 0
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            sys.stderr.write('missing lane key: {0}\n'.format(lane))
            rc = 1
            continue
        item = lanes[lane]
        rq = item.get('recovery_queries')
        if not isinstance(rq, list):
            sys.stderr.write('lane {0}: missing recovery_queries list\n'.format(lane))
            rc = 1
            continue
        stages = set()
        for entry in rq:
            if isinstance(entry, dict) and entry.get('stage'):
                stages.add(entry.get('stage'))
        for needed in ('stage-1', 'stage-2'):
            if needed not in stages:
                sys.stderr.write('lane {0}: missing {1} recovery query\n'.format(lane, needed))
                rc = 1

        raw_count = item.get('raw_count', 0)
        kept_count = item.get('kept_count', 0)
        if isinstance(raw_count, int) and isinstance(kept_count, int) and kept_count > raw_count:
            sys.stderr.write('lane {0}: kept_count > raw_count\n'.format(lane))
            rc = 1

    if rc == 0:
        sys.stdout.write('ok: hourly evidence contract valid\n')
    return rc


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
