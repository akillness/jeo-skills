#!/usr/bin/env python3
import json
import sys

REQ_KEYS = [
    'agentic-ai-skill',
    'web-frontend-skill',
    'web-backend-skill',
    'cli-open-source-skill',
    'game-development-skill'
]


def fail(msg):
    sys.stderr.write(msg + "\n")
    return 1


def main():
    if len(sys.argv) != 2:
        return fail('usage: validate_hourly_evidence_contract.py <evidence.json>')
    path = sys.argv[1]
    try:
      with open(path, 'r') as f:
        data = json.load(f)
    except Exception as e:
      return fail('failed to load {}: {}'.format(path, e))

    lanes = data.get('lanes')
    if not isinstance(lanes, dict):
      return fail('missing lanes map')

    rc = 0
    for k in REQ_KEYS:
      if k not in lanes:
        sys.stderr.write('missing lane key: {}\n'.format(k))
        rc = 1
        continue
      lane = lanes[k]
      rq = lane.get('recovery_queries')
      if not isinstance(rq, list):
        sys.stderr.write('lane {} missing recovery_queries\n'.format(k)); rc = 1
      else:
        stages = set([x.get('stage') for x in rq if isinstance(x, dict)])
        if 'stage-1' not in stages or 'stage-2' not in stages:
          sys.stderr.write('lane {} must include both stage-1 and stage-2 recovery entries\n'.format(k)); rc = 1

      raw_count = int(lane.get('raw_count') or 0)
      kept_count = int(lane.get('kept_count') or 0)
      zero_star = int(lane.get('zero_star_raw') or 0)
      median = int(lane.get('median_stars_raw') or 0)
      if kept_count > raw_count:
        sys.stderr.write('lane {} integrity error: kept_count > raw_count\n'.format(k)); rc = 1
      if raw_count == 0:
        causes = lane.get('degraded_causes') or []
        if 'no-results' not in causes:
          sys.stderr.write('lane {} raw_count==0 requires degraded_causes include no-results\n'.format(k)); rc = 1
        if zero_star != 0 or median != 0:
          sys.stderr.write('lane {} raw_count==0 requires zero_star_raw=0 and median_stars_raw=0\n'.format(k)); rc = 1
    if rc == 0:
      sys.stdout.write('hourly evidence contract: PASS\n')
    return rc


if __name__ == '__main__':
    sys.exit(main())
