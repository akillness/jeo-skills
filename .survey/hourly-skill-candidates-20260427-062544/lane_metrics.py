import json
from pathlib import Path
p=Path('.survey')/'hourly-skill-candidates-20260427-062544'/'evidence.json'
obj=json.loads(p.read_text())
print(f"run_slug: {obj['run_slug']}")
print(f"recommended_total: {len(obj['recommended'])}")
print(f"recommended_lane_count: {obj['recommended_lane_count']}")
print(f"single_lane_concentration: {obj['single_lane_concentration']}")
for lane,m in obj['lanes'].items():
    print(f"lane={lane} raw_count={m['raw_count']} kept_count={m['kept_count']} median_stars_raw={m['median_stars_raw']} zero_star_raw={m['zero_star_raw']} lane_status={m['lane_status']} degraded_causes={','.join(m['degraded_causes']) or 'none'}")
