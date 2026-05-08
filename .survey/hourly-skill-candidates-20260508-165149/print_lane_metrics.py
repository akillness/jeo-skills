import json
p='.survey/%s/hourly-run-report.json'
from pathlib import Path
slug=Path('.survey/LATEST_SLUG').read_text().strip()
obj=json.load(open(p%slug))
print('slug:',obj['slug'])
print('recommended_lane_count:',obj['recommended_lane_count'])
print('single_lane_concentration:',obj['single_lane_concentration'])
for row in obj['lane_rows']:
    print('{lane}: status={status}, raw={raw_count}, kept={kept_count}, median_stars={median_stars_raw}, causes={degraded_causes}'.format(**row))
