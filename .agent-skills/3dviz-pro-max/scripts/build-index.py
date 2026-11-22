"""Generate the small human-readable catalog and coverage summary from source data."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills/3dviz-pro-max'
sys.path.insert(0, str(SKILL / 'scripts'))
from manifest_contract import KNOWLEDGE_KINDS
from catalog import catalog_hashes, fingerprint, load_catalog

GENERATED_NOTICE = 'Generated from canonical data. Read only the records relevant to the task.'

def record_page(title, records):
    lines = [f'# {title}', '', GENERATED_NOTICE, '',
             '[Back to catalog](../catalog-index.md)', '',
             'Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.', '']
    for record in sorted(records, key=lambda r: r['id']):
        lines.append(f"- [{record['title']['en']}](../../{record['_path']}) — `{record['id']}`: {record['summary']}")
    return '\n'.join(lines) + '\n'


def outputs():
    manifest, records, _ = load_catalog(SKILL, collection='all')
    directions = json.loads((SKILL / 'data/directions.json').read_text(encoding='utf-8'))
    lines = ['# Catalog index', '', 'Curated guidance, not a limit on creative capability.', '',
             'Start with one relevant direction or knowledge family. Do not read the whole catalog for a small task.',
             'The optional search and resolve helpers can retrieve individual records with their sources.', '']
    generated = {}
    recipes = [r for r in records if r['id'].startswith('recipe.')]
    knowledge = [r for r in records if r['id'].startswith('knowledge.')]
    lines += ['## Recipe directions', '']
    for direction in directions:
        did = direction['id']
        group = [r for r in recipes if did in r['direction_ids']]
        if group:
            path = f'catalog-directions/{did}.md'
            generated[SKILL/'references'/path] = record_page(did.replace('-', ' ').title(), group)
            lines.append(f"- [{did}]({path}) — {len(group)} recipes. {direction['summary']}")
        else:
            lines.append(f'- `{did}` — no authored recipes yet.')
    lines += ['', '## Reusable knowledge', '']
    for kind in sorted(KNOWLEDGE_KINDS):
        group = [r for r in knowledge if r['knowledge_kind'] == kind]
        if group:
            path = f'catalog-knowledge/{kind}.md'
            generated[SKILL/'references'/path] = record_page(kind.replace('-', ' ').title(), group)
            lines.append(f'- [{kind}]({path}) — {len(group)} records.')
    lines += ['', '## Coverage', '',
              f'{len(recipes)} authored recipes; {len(knowledge)} reusable knowledge records; {len(directions)} registered topic directions.',
              'A recipe can appear under multiple relevant directions; direction counts are not additive.',
              'Active means available for guidance, not runtime-tested. Source and artifact evidence are distinct.', '']
    counts = {d['id']: sum(d['id'] in r['direction_ids'] for r in recipes) for d in directions}
    summary = {'schema_version': 1, 'version': manifest['version'],
               'catalog_hash': fingerprint(manifest, records), **catalog_hashes(records),
               'hash_scope': 'all-records', 'recipes': len(recipes),
               'knowledge': len(knowledge),
               'knowledge_by_kind': {kind: sum(r['knowledge_kind'] == kind for r in knowledge)
                                     for kind in sorted(KNOWLEDGE_KINDS)},
               'planned_directions': len(directions), 'recipes_by_direction': counts,
               'status_counts': {s: sum(r['status'] == s for r in records)
                                 for s in ('draft', 'active', 'deprecated')}}
    generated.update({SKILL/'references/catalog-index.md': '\n'.join(lines),
                      SKILL/'data/catalog-summary.json': json.dumps(summary, indent=2)+'\n'})
    return generated


def reconcile_pages(expected, check=False):
    existing = set()
    for name in ('catalog-directions', 'catalog-knowledge'):
        directory = SKILL/'references'/name
        if directory.is_symlink():
            raise ValueError(f'Generated directory must not be a symlink: {directory}')
        existing.update(directory.glob('*.md'))
    obsolete = sorted(existing - set(expected))
    if check:
        return obsolete
    for path in obsolete:
        if path.is_symlink() or GENERATED_NOTICE not in path.read_text(encoding='utf-8').splitlines():
            raise ValueError(f'Refusing to remove an unrecognized catalog page: {path}')
    for path in obsolete:
        path.unlink()
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    generated = outputs()
    try:
        stale = [str(path.relative_to(ROOT)) + ' (obsolete)'
                 for path in reconcile_pages(generated, args.check)]
    except ValueError as error:
        parser.exit(1, f'{error}\n')
    for path, content in generated.items():
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8') != content:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8', newline='\n')
    if stale:
        parser.exit(1, 'Generated files out of date: '+', '.join(stale)+'\n')
    print('Catalog index and summary verified.' if args.check else 'Catalog index and summary generated.')


if __name__ == '__main__':
    main()
