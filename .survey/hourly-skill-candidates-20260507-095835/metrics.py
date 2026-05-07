import json
j=json.load(open('.survey/hourly-skill-candidates-20260507-095835/evidence.json'))
for lane,v in j['lanes'].items():
    print(f"{lane}: raw={v['raw_count']} kept={v['kept_count']} median_stars={v['median_stars_raw']} status={v['lane_status']} causes={','.join(v['degraded_causes'])}")
print('recommended_lane_count',j['cross_lane']['recommended_lane_count'])
print('single_lane_concentration',j['cross_lane']['single_lane_concentration'])
