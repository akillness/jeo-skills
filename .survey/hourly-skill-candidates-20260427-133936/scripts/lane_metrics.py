import json
from pathlib import Path
slug='hourly-skill-candidates-20260427-133936'
data=json.loads(Path('.survey',slug,'evidence.json').read_text())
print('run_slug:', data['slug'])
print('recommended_lane_count:', data.get('recommended_lane_count'))
print('single_lane_concentration:', data.get('single_lane_concentration'))
for lane, obj in data['lanes'].items():
    print(f"{lane}: status={obj['lane_status']} kept={obj['kept_count']} raw={obj['raw_count']} median={obj['median_stars_raw']} zero_star={obj['zero_star_raw']} causes={','.join(obj.get('degraded_causes',[])) or 'none'}")
print('notable_contradiction: dp-archive/archive contains phrase No CLI while matching cli token')
