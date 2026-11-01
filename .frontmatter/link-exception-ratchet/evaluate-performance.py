#!/usr/bin/env python3
"""Paired interleaved wall-time benchmark; compares two scanner source files."""
from __future__ import annotations
import importlib.util, json, statistics, sys, tempfile, time
from pathlib import Path
repo = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(repo / 'scripts'))
def load(name, p):
    spec=importlib.util.spec_from_file_location(name, p); assert spec and spec.loader
    mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod
versions = {'baseline':load('baseline_scanner',sys.argv[2]),'candidate':load('candidate_scanner',sys.argv[3])}
with tempfile.TemporaryDirectory(prefix='link-perf-') as d:
    base=Path(d); root=base/'.agent-skills'; art=base/'.frontmatter'; (root/'demo').mkdir(parents=True); art.mkdir()
    text=' '.join(f'[x](missing-{i}.md)' for i in range(2000))+'\n'
    (root/'demo/README.md').write_text(text,encoding='utf-8')
    for filename in ['link-check-exclusions.txt','deferred-batch.txt','vendored-mirrors.txt']:
        (art/filename).write_text('',encoding='utf-8')
    cases={'long_line':(root,art),'catalog':(repo/'.agent-skills',repo/'.frontmatter')}
    measurements={}
    for case,(r,a) in cases.items():
        rows={name:mod.scan(r,a) for name,mod in versions.items()}
        assert rows['baseline']==rows['candidate'],f'output mismatch: {case}'
        times={name:[] for name in versions}
        for i in range(5):
            order=('baseline','candidate') if i%2==0 else ('candidate','baseline')
            for name in order:
                start=time.perf_counter(); result=versions[name].scan(r,a); elapsed=time.perf_counter()-start
                assert result==rows[name]
                times[name].append(elapsed)
        med={name:statistics.median(values) for name,values in times.items()}
        measurements[case]={'seconds':times,'median_seconds':med,'candidate_vs_baseline':med['candidate']/med['baseline'],'rows':len(rows['baseline'])}
    print(json.dumps(measurements,sort_keys=True))
