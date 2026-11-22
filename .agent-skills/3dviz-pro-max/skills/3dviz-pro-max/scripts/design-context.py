"""Gather optional lexical context for the agent to synthesize a 3D design."""
import argparse
import json

from catalog import load_catalog
from manifest_contract import KNOWLEDGE_KINDS
from quality_brief import (DEFAULT_DELIVERY, DELIVERY, PROBE, build_brief, check_heroes,
                           load_host)
from resolve import resolve
from search import search

# The kinds a blueprint's fits_looks may name; mirrors scripts/blueprint_validation.LOOK_KINDS.
LOOK_KINDS = frozenset({'style-profile', 'lighting-profile', 'theme-profile'})

ASSEMBLY_STEP = ('Assess each blueprint against the intended silhouette, structure, behavior and finish. '
                 'Reuse, adapt, reject or combine it with custom or sourced geometry by actual fit. '
                 'A matching noun does not require using its kit; document choices when useful.')


def blueprints_for(records, looks):
    """Every blueprint compatible with the chosen looks. A filter, not a ranking."""
    chosen = set(looks)
    rows = []
    for record in records:
        if record.get('knowledge_kind') != 'blueprint' or record.get('status') != 'active':
            continue
        if chosen and not chosen.intersection(record.get('fits_looks', [])):
            continue
        rows.append({'id': record['id'], 'title': record['title']['en'],
                     'asset': record['asset']['path'], 'kind': record['asset']['kind'],
                     'footprint_m': record['footprint_m'], 'poly_budget': record['poly_budget'],
                     'sockets': [s['name'] for s in record['sockets']],
                     'detail_ladder': record['detail_ladder'],
                     'params': {p['name']: p['default'] for p in record['params']}})
    return sorted(rows, key=lambda row: row['id'])


def check_looks(records, looks):
    """Same refusal shape as resolve(): name what is unknown rather than silently dropping it."""
    by_id = {record['id']: record for record in records}
    unknown = sorted(set(looks) - by_id.keys())
    if unknown:
        raise ValueError('Unknown record IDs: ' + ', '.join(unknown))
    wrong = sorted(look for look in set(looks)
                   if by_id[look].get('knowledge_kind') not in LOOK_KINDS)
    if wrong:
        raise ValueError('Not a style, theme or lighting profile: ' + ', '.join(wrong))


def gather(query, manifest, records, sources, direction=None, kinds=(), exclude_ids=(),
           blueprints=False, looks=(), host=None, delivery=DEFAULT_DELIVERY, heroes=()):
    if not query.strip():
        raise ValueError('A nonempty objective is required')
    if set(kinds) - KNOWLEDGE_KINDS:
        raise ValueError('Unknown knowledge kind')
    if looks and not blueprints:
        raise ValueError('--look only applies with --blueprints')
    if (host or heroes) and not blueprints:
        raise ValueError('--host and --hero only apply with --blueprints')
    if heroes and not host:
        raise ValueError(f'--hero needs the host ceiling. Write one with: {PROBE}')
    if delivery not in DELIVERY:
        raise ValueError(f'Unknown delivery target {delivery}: one of {sorted(DELIVERY)}')
    check_looks(records, looks)
    groups = {'recipes': search(query, manifest, records, limit=3, direction=direction,
                               exclude_ids=exclude_ids, collection='recipes')}
    for kind in kinds:
        groups[kind] = search(query, manifest, records, limit=2, direction=direction,
                              exclude_ids=exclude_ids, collection='knowledge', kind=kind)
    ids = list(dict.fromkeys(result['id'] for group in groups.values()
                            for result in group['results']))
    context = resolve(ids, manifest, records, sources)
    next_step = ('Interpret the user constraints and negation yourself. Select useful '
                 'records, research factual claims, then synthesize a coherent design '
                 'with custom choices. Do not present this retrieval output as a '
                 'completed design system or treat absent matches as a capability limit.')
    result = {'objective': query, 'status': 'candidates' if ids else 'no-match',
              'candidate_groups': groups, 'context': context, 'next_step': next_step}
    if blueprints:
        # A filter over fits_looks, not a ranking: with 22 blueprints the compatible set is small
        # enough to hand over whole, and a BM25 score over authored geometry names would be noise.
        result['blueprints'] = blueprints_for(records, looks)
        result['next_step'] = f'{next_step} {ASSEMBLY_STEP}'
        if host:
            check_heroes(result['blueprints'], heroes)
            result['quality_brief'] = build_brief(result['blueprints'], records, host,
                                                  delivery, heroes)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query')
    parser.add_argument('--direction')
    parser.add_argument('--kind', action='append', choices=sorted(KNOWLEDGE_KINDS), default=[])
    parser.add_argument('--exclude-id', action='append', default=[])
    parser.add_argument('--blueprints', action='store_true',
                        help='List kit blueprints compatible with the chosen looks')
    parser.add_argument('--look', action='append', default=[],
                        help='A style, theme or lighting record ID; repeatable')
    parser.add_argument('--host', help=f'host.json from the probe ({PROBE}); adds quality_brief')
    parser.add_argument('--delivery', choices=sorted(DELIVERY), default=DEFAULT_DELIVERY,
                        help='delivery target the brief caps every tier against')
    parser.add_argument('--hero', action='append', default=[],
                        help='blueprint ID to build at the host ceiling; repeatable')
    args = parser.parse_args()
    try:
        manifest, records, sources = load_catalog(collection='all')
        host = load_host(args.host) if args.host else None
        print(json.dumps(gather(args.query, manifest, records, sources, args.direction,
                                args.kind, args.exclude_id, args.blueprints, args.look,
                                host, args.delivery, args.hero), indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
