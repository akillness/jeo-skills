import json
from pathlib import Path
p=Path('.survey')/'hourly-skill-candidates-20260426-223114'/'evidence.json'
ev=json.loads(p.read_text())
print(f"run_slug: {ev['run_slug']}")
print(f"recommended_lane_count: {ev['recommended_lane_count']}")
print(f"single_lane_concentration: {ev['single_lane_concentration']}")
for name, lane in ev['lanes'].items():
    print(f"lane={name} raw={lane['raw_count']} kept={lane['kept_count']} median_stars={lane['median_stars_raw']} status={lane['lane_status']} causes={','.join(lane['degraded_causes']) if lane['degraded_causes'] else 'none'}")
