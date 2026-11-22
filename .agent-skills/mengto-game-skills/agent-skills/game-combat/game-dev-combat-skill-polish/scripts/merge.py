# Merge blind judges' JSON: per skill, both totals and the lower one (the score we keep).
# usage: python3 merge.py <phase: before|after>   reads judges/<phase>-*.json
import json, glob, sys
phase = sys.argv[1]
scores = {}
for f in sorted(glob.glob(f'judges/{phase}-*.json')):
    for r in json.load(open(f)):
        scores.setdefault(r['id'], []).append(r)
rows = []
for sid, rs in scores.items():
    totals = [r['total'] for r in rs]
    low = min(rs, key=lambda r: r['total'])
    rows.append((min(totals), sid, totals, low['fault']))
for low, sid, totals, fault in sorted(rows):
    print(f"{low:4.1f}  {sid:22s} {totals}  {fault}")
json.dump({sid: {'low': low, 'totals': totals, 'fault': fault} for low, sid, totals, fault in rows}, open(f'judges/{phase}-merged.json', 'w'), indent=1)
