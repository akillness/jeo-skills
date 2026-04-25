import json
from pathlib import Path
p = Path(__file__).with_name('evidence.json')
d = json.loads(p.read_text())
print(f"run_slug: {d['run_slug']}")
print(f"candidate_count_total: {d.get('candidate_count_total',0)}")
print("lane_metrics:")
for lane, info in d['lanes'].items():
    m = info['metrics']
    print(f"- {lane}: status={info['status']}, kept={m['kept_count']}, retrieved={m['retrieved_count']}, median_stars={m['median_stars']}, degraded_causes={','.join(info.get('degraded_causes',[])) or 'none'}")
print("recommended:")
for c in d.get('recommended_candidates',[])[:10]:
    print(f"- {c['full_name']} | stars={c['stars']} | license={c['license']} | lane={c['lane']} | url={c['url']}")
