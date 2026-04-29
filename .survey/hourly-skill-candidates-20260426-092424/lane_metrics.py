import json
from pathlib import Path
p=Path('.survey/hourly-skill-candidates-20260426-092424/evidence.json')
d=json.loads(p.read_text())
print(f"run_slug={d['run_slug']}")
for lane,ld in d['lanes'].items():
    causes=','.join(ld.get('degraded_causes',[])) or 'none'
    print(f"lane={lane} status={ld['lane_status']} kept={ld['kept_count']} raw={ld['raw_count']} median_stars={ld['median_stars_raw']} zero_star={ld['zero_star_raw']} causes={causes}")
print(f"recommended_lane_count={d['cross_lane']['recommended_lane_count']}")
print(f"single_lane_concentration={d['cross_lane']['single_lane_concentration']}")
