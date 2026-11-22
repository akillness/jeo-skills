"""Check authored known-intent retrieval cases; scores are not semantic confidence."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/3dviz-pro-max/scripts'))
from catalog import load_catalog
from search import search


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    cases = json.loads((ROOT / 'evals/retrieval/pilot-cases.json').read_text())
    manifest, records, _ = load_catalog(collection='all')
    failures = []
    for case in cases['cases']:
        found = search(case['query'], manifest, records, limit=case['within_top'],
                       collection=case.get('collection', 'all'), kind=case.get('kind'))
        if case['expected_id'] not in [r['id'] for r in found['results']]:
            failures.append({'query': case['query'], 'expected': case['expected_id'],
                             'actual': [r['id'] for r in found['results']]})
    print(f"Known-intent retrieval: {len(cases['cases']) - len(failures)}/{len(cases['cases'])} passed.")
    print(cases['scope'])
    if failures:
        print(json.dumps(failures, indent=2))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
