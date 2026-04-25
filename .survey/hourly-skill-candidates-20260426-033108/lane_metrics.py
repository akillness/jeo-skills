import json, pathlib
p=pathlib.Path('.survey/hourly-skill-candidates-20260426-033108/evidence.json')
d=json.loads(p.read_text())
print(f"run_slug={d['run_slug']}")
for lane,v in d['lanes'].items():
    dc=','.join(v.get('degraded_causes',{}).keys()) or 'none'
    print(f"lane={lane}|status={v['lane_status']}|kept={v['kept_count']}|raw={v['raw_count']}|median_stars_raw={v['median_stars_raw']}|zero_star_raw={v['zero_star_raw']}|degraded_causes={dc}")
print(f"recommended_lane_count={d['cross_lane']['recommended_lane_count']}")
print(f"single_lane_concentration={d['cross_lane']['single_lane_concentration']}")
for i,x in enumerate(d.get('recommendations',{}).get('new_top3',[]),1):
    print(f"new_top{i}={x['name']}|stars={x['stars']}|lane={x['lane']}|license={x['license']}")
