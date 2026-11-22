"""Preview or apply the record-file layout, preserving content and retrieval results."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/3dviz-pro-max/scripts'))
from catalog import catalog_hashes, load_catalog, record_content_hash
from catalog_validation import load_catalog as validate_catalog
from manifest_contract import validate_manifest
from record_layout import record_path
from search import search


def inventory(records):
    return {r['id']: [r['revision'], record_content_hash(r)] for r in sorted(records, key=lambda r: r['id'])}


def retrieval(manifest, records, cases):
    return [[(r['id'], r['score']) for r in search(
        case['query'], manifest, records, limit=case['within_top'],
        collection=case.get('collection', 'all'), kind=case.get('kind'))['results']]
        for case in cases]


def evidence_hashes(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((root / 'evidence').rglob('*')) if p.is_file()}


def migrate(root, report, apply=False):
    skill = root / 'skills/3dviz-pro-max'
    data = skill / 'data'
    manifest, records, _ = load_catalog(skill, 'all')
    validate_catalog(root, 'all')
    paths = validate_manifest(manifest, data)
    originals = {p: p.read_bytes() for name in ('recipes', 'knowledge')
                 for p in paths.get(name, [])}
    originals[data / 'manifest.json'] = (data / 'manifest.json').read_bytes()
    targets = {}
    for record in records:
        collection = 'recipes' if record['id'].startswith('recipe.') else 'knowledge'
        target = data / record_path(record, collection)
        if not target.resolve().is_relative_to(data.resolve()):
            raise ValueError(f'Destination escapes catalog: {target}')
        if target in targets:
            raise ValueError(f'Duplicate destination: {target}')
        if target.exists() and target not in originals:
            raise ValueError(f'Refusing to overwrite unrelated file: {target}')
        stored = {k: v for k, v in record.items() if k != '_path'}
        targets[target] = (json.dumps(stored, indent=2, ensure_ascii=False,
                                     allow_nan=False) + '\n').encode('utf-8')
    result = {'status': 'preview', 'records': len(records),
              'old_record_files': len(originals) - 1, 'new_record_files': len(targets),
              'before': catalog_hashes(records)}
    if not apply:
        return result
    if manifest.get('layout_version') == 2:
        return {**result, 'status': 'already-current'}
    report = report.resolve()
    if report.is_relative_to(skill) or report.is_relative_to(root / 'evidence'):
        raise ValueError('Migration reports/backups must be outside the skill and evidence')
    backup = report.with_suffix('.backup.zip')
    if report.exists() or backup.exists():
        raise ValueError('Choose a new report path; existing reports/backups are never overwritten')
    report.parent.mkdir(parents=True, exist_ok=True)
    cases = json.loads((root / 'evals/retrieval/pilot-cases.json').read_text())['cases']
    before = inventory(records)
    rankings = retrieval(manifest, records, cases)
    evidence = evidence_hashes(root)
    # Store original bytes before any mutation; no Git checkout is required to recover.
    with ZipFile(backup, 'x', compression=ZIP_DEFLATED) as archive:
        for path, raw in originals.items():
            archive.writestr(path.relative_to(root).as_posix(), raw)
    next_manifest = {**manifest, 'layout_version': 2,
                     'collections': {**manifest['collections'],
                                     'knowledge': 'knowledge/**/*.json'}}
    if 'knowledge' not in manifest['collections']:
        next_manifest['collections'].pop('knowledge')
    try:
        for path, raw in targets.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        for path in originals.keys() - targets.keys() - {data / 'manifest.json'}:
            path.unlink()
        (data / 'manifest.json').write_text(json.dumps(next_manifest, indent=2) + '\n', encoding='utf-8')
        new_manifest, after, _ = load_catalog(skill, 'all')
        validate_catalog(root, 'all')
        if inventory(after) != before:
            raise ValueError('Record content or identity changed')
        if retrieval(new_manifest, after, cases) != rankings:
            raise ValueError('Retrieval IDs or scores changed')
        if evidence_hashes(root) != evidence:
            raise ValueError('Evidence changed during migration')
        result.update(status='migrated', after=catalog_hashes(after),
                      identical_record_inventory=True, identical_retrieval=True,
                      retrieval_cases=len(cases), evidence_files_unchanged=len(evidence),
                      retrieval_baseline=[{'case': case, 'results': ranking}
                                          for case, ranking in zip(cases, rankings)],
                      inventory=before,
                      paths={r['id']: r['_path'] for r in after},
                      backup=backup.relative_to(root).as_posix() if backup.is_relative_to(root) else backup.name)
        report.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    except Exception:
        for path in targets.keys() - originals.keys():
            path.unlink(missing_ok=True)
        for path, raw in originals.items():
            path.write_bytes(raw)
        raise
    return {key: value for key, value in result.items()
            if key not in {'inventory', 'paths', 'retrieval_baseline'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', type=Path, default=ROOT / 'plans/reports/catalog-layout-migration.json')
    args = parser.parse_args()
    try:
        print(json.dumps(migrate(args.root.resolve(), args.report, args.apply), indent=2))
    except (ValueError, OSError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
