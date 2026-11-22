#!/usr/bin/env python3
"""Pack a blind A/B set: each pair's old and new sheet copied as <name>-X.png / <name>-Y.png in a
random order, with the key written beside the folder (never inside it, so the judge cannot read it).

    python3 ab-pack.py <out-dir> "<name>|<old sheet>|<new sheet>" ...

Build both versions' sheets with the SAME titles first (msheet.py / psheet.py): a judge noticed
"round 6" in old sheet headers once and the comparison was no longer blind. Unblind with
<out-dir>-key.json after the judge reports.
"""
import json, pathlib, random, shutil, sys, time

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for old in out.glob('*-[XY].png'): old.unlink()
rng = random.Random(time.time_ns()); key = {}
for spec in sys.argv[2:]:
    name, old, new = spec.split('|')
    flip = rng.random() < .5
    x, y = (new, old) if flip else (old, new)
    shutil.copy(x, out / f'{name}-X.png'); shutil.copy(y, out / f'{name}-Y.png')
    key[name] = {'X': 'new' if flip else 'old', 'Y': 'old' if flip else 'new'}
pathlib.Path(str(out) + '-key.json').write_text(json.dumps(key, indent=1))
print(f'{len(key)} pairs in {out}; key in {out}-key.json')
