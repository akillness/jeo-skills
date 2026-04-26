import json
from pathlib import Path
p=Path('.survey')/'hourly-skill-candidates-20260426-221631'/'evidence.json'
ev=json.loads(p.read_text())
print(f"run_slug={ev['run_slug']}")
print(f"recommended_lane_count={ev.get('recommended_lane_count',0)}")
print(f"single_lane_concentration={ev.get('single_lane_concentration')}")
for lane,v in ev['lanes'].items():
    causes=','.join(sorted(v.get('degraded_causes',{}).keys())) or 'none'
    print(f"{lane}|status={v['lane_status']}|kept={v['kept_count']}|raw={v['raw_count']}|median={v['median_stars_raw']}|zero={v['zero_star_raw']}|causes={causes}")
