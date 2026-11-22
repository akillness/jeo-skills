"""Resolve explicitly selected records and their sources without guessing intent."""
import argparse
import difflib
import hashlib
import json
import re
from catalog import fingerprint, load_catalog


def blueprint_usage(record):
    """Copy-paste starting point for one blueprint; the params are tunable, not a required call."""
    asset = record['asset']
    args = ', '.join(f'{p["name"]}: {json.dumps(p["default"])}' for p in record['params'])
    factory = asset.get('factory', 'create')
    # A gltf-asset record points at the .glb; the callable is its sibling loader wrapper, whose
    # create() returns a Promise because the geometry lives in a file.
    gltf = asset['kind'] == 'gltf-asset'
    module = re.sub(r'\.glb$', '.js', asset['path']) if gltf else asset['path']
    call = f"{'await ' if gltf else ''}{factory}({{ {args} }})"
    return {'asset': asset['path'], 'kind': asset['kind'], 'factory': factory,
            'module': module, 'awaits': gltf,
            'params': {p['name']: p['default'] for p in record['params']},
            'sockets': [s['name'] for s in record.get('sockets', [])],
            'detail_ladder': record.get('detail_ladder'),
            'proof': record.get('proof'),
            'snippet': (f"import {{ {factory} }} "
                        f"from './{module.split('/', 2)[-1]}';\n"
                        f"const {{ group, sockets }} = {call};\n"
                        f"scene.add(group);")}


def resolve(ids, manifest, records, sources, related=False):
    by_id = {record['id']: record for record in records}
    unknown = sorted(set(ids) - by_id.keys())
    if unknown:
        # A lexical near-name, not a claim that the suggestion is what the caller meant.
        named = []
        for rid in unknown:
            close = difflib.get_close_matches(rid, by_id.keys(), n=1, cutoff=0.8)
            named.append(f'{rid} (did you mean {close[0]}?)' if close else rid)
        raise ValueError('Unknown record IDs: ' + ', '.join(named))
    chosen = list(dict.fromkeys(ids))
    if related:
        # One hop only: avoid loading an entire connected catalog for one subject.
        for rid in tuple(chosen):
            for neighbor in by_id[rid].get('related_ids', []):
                if neighbor not in by_id:
                    raise ValueError(f'Dangling relationship: {rid} -> {neighbor}')
                if neighbor not in chosen:
                    chosen.append(neighbor)
    selected = [by_id[rid] for rid in chosen]
    source_ids = {ref['source_id'] for record in selected
                  for claim in record.get('claims', [])
                  for ref in claim.get('source_refs', [])}
    by_source = {source['id']: source for source in sources}
    missing = source_ids - by_source.keys()
    if missing:
        raise ValueError('Unknown source IDs: ' + ', '.join(sorted(missing)))
    selected_sources = [by_source[sid] for sid in sorted(source_ids)]
    bundle = json.dumps([selected, selected_sources], sort_keys=True,
                        ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    blueprints = {r['id']: blueprint_usage(r) for r in selected if 'asset' in r}
    result = {'catalog_hash': fingerprint(manifest, records),
              'bundle_hash': hashlib.sha256(bundle).hexdigest(),
              'selected_ids': list(dict.fromkeys(ids)),
              'records': selected,
              'sources': selected_sources,
              'notice': 'These are authored records and source metadata, not new source reads '
                        'or runtime verification. Apply only the guidance relevant to the task.'}
    if blueprints:
        # A blueprint carries a module and a proof; the snippet is where to start, not a contract.
        result['blueprints'] = blueprints
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='+')
    parser.add_argument('--related', action='store_true', help='Include one hop of related records')
    args = parser.parse_args()
    try:
        manifest, records, sources = load_catalog(collection='all')
        print(json.dumps(resolve(args.ids, manifest, records, sources, args.related), indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
