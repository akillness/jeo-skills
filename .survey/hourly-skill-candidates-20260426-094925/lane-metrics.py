import json
p='.survey/hourly-skill-candidates-20260426-094925/evidence.json'
obj=json.load(open(p))
for lane,v in obj['lanes'].items():
    causes=', '.join(f"{k}:{n}" for k,n in sorted(v.get('degraded_causes',{}).items())) or 'none'
    print(f"{lane}\tstatus={v['lane_status']}\traw={v['raw_count']}\tkept={v['kept_count']}\tmedian_stars_raw={v['median_stars_raw']}\tzero_star_raw={v['zero_star_raw']}\tcauses={causes}")
print(f"recommended_lane_count={obj['cross_lane']['recommended_lane_count']}")
print(f"single_lane_concentration={obj['cross_lane']['single_lane_concentration']}")
