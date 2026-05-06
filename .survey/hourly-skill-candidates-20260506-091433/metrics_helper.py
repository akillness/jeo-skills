import json
from pathlib import Path
import statistics
p=Path('.survey')/Path(open('.survey/LATEST_SLUG').read().strip())/'evidence.json'
d=json.loads(p.read_text())
print('lane\traw\tkept\tmedian_stars\tstatus\tcauses')
for k,v in d['lanes'].items():
    print(f"{k}\t{v['raw_count']}\t{v['kept_count']}\t{v['median_stars_raw']}\t{v['lane_status']}\t{','.join(v['degraded_causes'])}")
print(f"recommended_lane_count\t{d.get('recommended_lane_count')}")
print(f"single_lane_concentration\t{d.get('single_lane_concentration')}")
