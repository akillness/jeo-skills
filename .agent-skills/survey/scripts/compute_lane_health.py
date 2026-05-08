#!/usr/bin/env python3
import json, sys, statistics
from pathlib import Path

if len(sys.argv)!=2:
    print("Usage: compute_lane_health.py .survey/<slug>/evidence.json")
    sys.exit(2)

p=Path(sys.argv[1])
obj=json.loads(p.read_text())
lanes=obj.get('lanes',{})
print("lane,raw_count,kept_count,zero_star_raw,median_stars_raw,lane_status,degraded_causes")
for lane,d in lanes.items():
    causes='|'.join(d.get('degraded_causes',[]))
    print(f"{lane},{d.get('raw_count',0)},{d.get('kept_count',0)},{d.get('zero_star_raw',0)},{d.get('median_stars_raw',0)},{d.get('lane_status','')},{causes}")
