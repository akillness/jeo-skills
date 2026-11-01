#!/usr/bin/env python3
"""Independent offline holdout for duplicate normalized targets and explicit exclusions."""
from __future__ import annotations
import importlib.util
import sys
import tempfile
from pathlib import Path
repo = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(repo / 'scripts'))
spec = importlib.util.spec_from_file_location('holdout_link_targets', repo / 'scripts/link_targets.py')
assert spec and spec.loader
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
with tempfile.TemporaryDirectory(prefix='link-holdout-') as raw:
    base = Path(raw); root = base / '.agent-skills'; art = base / '.frontmatter'
    (root / 'demo').mkdir(parents=True); art.mkdir()
    (root / 'demo/README.md').write_text('`../same.md#one` `../same.md#two`\n')
    (art / scanner.EXCLUSIONS).write_text('.agent-skills/demo/README.md:1\t7b\t../same.md\n')
    result = [(r['target'], r['status']) for r in scanner.scan(root, art)]
    expected = [('../same.md', 'broken'), ('../same.md', 'broken')]
    print('duplicate-normalized-target:', result)
    sys.exit(0 if result == expected else 1)
