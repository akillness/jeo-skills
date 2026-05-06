import json
p='.survey/%s/evidence.json'
import os
slug=os.environ.get('SLUG')
obj=json.load(open(p%slug))
print('recommended_lane_count',obj['recommended_lane_count'])
print('single_lane_concentration',obj['single_lane_concentration'])
for lane,v in obj['lanes'].items():
    print(f"{lane}: raw={v['raw_count']} kept={v['kept_count']} zero_star={v['zero_star_raw']} median={v['median_stars_raw']} status={v['lane_status']} causes={','.join(v['degraded_causes'])}")
