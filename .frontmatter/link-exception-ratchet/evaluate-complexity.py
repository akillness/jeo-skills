#!/usr/bin/env python3
"""Paired scanner benchmark with and without many exact exclusion keys."""
from __future__ import annotations
import importlib.util, json, statistics, sys, tempfile, time
from pathlib import Path
repo=Path(sys.argv[1]).resolve();sys.path.insert(0,str(repo/'scripts'))
def load(name,p):
 spec=importlib.util.spec_from_file_location(name,p);assert spec and spec.loader
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
versions={'baseline':load('complexity_baseline',sys.argv[2]),'candidate':load('complexity_candidate',sys.argv[3])}
with tempfile.TemporaryDirectory(prefix='link-complexity-') as d:
 base=Path(d);root=base/'.agent-skills';(root/'demo').mkdir(parents=True)
 (root/'demo/README.md').write_text(' '.join(f'[x](missing-{i}.md)' for i in range(2000))+'\n',encoding='utf-8')
 dirs={}
 for mode in ('no_exclusions','many_exclusions'):
  art=base/mode;art.mkdir();dirs[mode]=art
  rules=''.join(f'.agent-skills/demo/README.md:1\t7a\tmissing-{i}.md\n' for i in range(2000)) if mode=='many_exclusions' else ''
  (art/'link-check-exclusions.txt').write_text(rules,encoding='utf-8')
  (art/'deferred-batch.txt').write_text('',encoding='utf-8');(art/'vendored-mirrors.txt').write_text('',encoding='utf-8')
 cases={'no_exclusions':(root,dirs['no_exclusions']),'many_exclusions':(root,dirs['many_exclusions']),'catalog':(repo/'.agent-skills',repo/'.frontmatter')};summary={}
 for case,(r,a) in cases.items():
  rows={name:mod.scan(r,a) for name,mod in versions.items()};assert rows['baseline']==rows['candidate'],f'mismatch: {case}'
  times={name:[] for name in versions}
  for i in range(5):
   order=('baseline','candidate') if i%2==0 else ('candidate','baseline')
   for name in order:
    start=time.perf_counter();result=versions[name].scan(r,a);elapsed=time.perf_counter()-start
    assert result==rows[name];times[name].append(elapsed)
  med={name:statistics.median(values) for name,values in times.items()}
  summary[case]={'seconds':times,'median_seconds':med,'candidate_vs_baseline':med['candidate']/med['baseline'],'rows':len(rows['baseline'])}
 print(json.dumps(summary,sort_keys=True))
