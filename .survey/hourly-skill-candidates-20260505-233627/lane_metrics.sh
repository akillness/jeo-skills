#!/usr/bin/env bash
python3 - <<'PY2'
import json
d=json.load(open('.survey/hourly-skill-candidates-20260505-233627/evidence.json'))
for k,v in d['lanes'].items():
 print(f"{k}: raw={v['raw_count']} kept={v['kept_count']} status={v['lane_status']} causes={','.join(v['degraded_causes']) if v['degraded_causes'] else '-'}")
print('recommended_lane_count=',d['cross_lane']['recommended_lane_count'])
print('single_lane_concentration=',d['cross_lane']['single_lane_concentration'])
PY2
