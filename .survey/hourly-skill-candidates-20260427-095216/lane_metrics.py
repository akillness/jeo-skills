import json
with open('.survey/hourly-skill-candidates-20260427-095216/evidence.json','r',encoding='utf-8') as f:
    data=json.load(f)
print(f"run_slug={data['run_slug']}")
print(f"recommended_lane_count={data['recommended_lane_count']}")
print(f"single_lane_concentration={data['single_lane_concentration']}")
for lane, d in data['lanes'].items():
    print(f"lane={lane} raw={d['raw_count']} kept={d['kept_count']} status={d['lane_status']} causes={','.join(d.get('degraded_causes',[])) or 'none'} provenance={d['provenance']}")
print('top_recommendations:')
for r in data['recommended'][:8]:
    print(f"- {r['repo']} stars={r['stars']} forks={r['forks']} lane={r['lane']} url={r['url']}")
