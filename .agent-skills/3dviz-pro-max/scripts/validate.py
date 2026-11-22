#!/usr/bin/env python3
"""Validate the repository's catalog and public evidence with Python stdlib."""
import argparse
from pathlib import Path
import sys

from catalog_validation import ContractError, load_catalog
from evidence_validation import load_evidence


def validate(root):
    recipes, sources, directions = load_catalog(root)
    records, _, _ = load_catalog(root, collection='all')
    events = load_evidence(root, records, sources)
    return len(recipes), len(sources), len(directions), len(events)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        counts = validate(args.root.resolve())
    except (ContractError, OSError, TypeError, KeyError) as error:
        print(f'Validation failed: {error}', file=sys.stderr)
        return 1
    print('Validated %d recipes, %d sources, %d directions, %d evidence events.' % counts)
    knowledge, _, _ = load_catalog(args.root.resolve(), collection='knowledge')
    print(f'Validated {len(knowledge)} knowledge records.')
    print('Structure and provenance linkage only: this does not verify source truth or runtime behavior.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
