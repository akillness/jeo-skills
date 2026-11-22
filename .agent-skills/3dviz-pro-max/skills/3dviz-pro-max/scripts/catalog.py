"""Small read-only catalog interface shared by optional skill helpers."""
import hashlib
import json
from manifest_contract import COLLECTIONS, validate_manifest
from pathlib import Path
from record_layout import record_file

SKILL_ROOT = Path(__file__).resolve().parents[1]


def load_catalog(root=SKILL_ROOT, collection='recipes'):
    if collection not in COLLECTIONS:
        raise ValueError('Unknown collection')
    data = Path(root) / 'data'
    manifest = json.loads((data / 'manifest.json').read_text(encoding='utf-8'))
    paths = validate_manifest(manifest, data)
    records = []
    selected = ('recipes', 'knowledge') if collection == 'all' else (collection,)
    for name in selected:
        for path in paths.get(name, []):
            for record in record_file(json.loads(path.read_text(encoding='utf-8')),
                                      path.relative_to(data).as_posix(), name,
                                      manifest.get('layout_version', 1)):
                records.append({**record, '_path': path.relative_to(root).as_posix()})
    ids = [r['id'] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate catalog IDs; validate the dataset before searching.')
    if collection != 'knowledge' and not records:
        raise ValueError('Empty recipe catalog; validate the installed package.')
    sources = json.loads(paths['sources'][0].read_text(encoding='utf-8'))
    return manifest, records, sources


def fingerprint(manifest, records):
    payload = json.dumps([manifest, records], sort_keys=True, ensure_ascii=False,
                         separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def record_content_hash(record):
    """Same canonical bytes as evidence hashes, without loader-only metadata."""
    stored = {key: value for key, value in record.items() if key != '_path'}
    payload = json.dumps(stored, sort_keys=True, ensure_ascii=False,
                         separators=(',', ':'), allow_nan=False).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def catalog_hashes(records):
    """Hash a supplied catalog; callers use both collections for global summaries."""
    ordered = sorted(records, key=lambda row: row['id'])
    content = [[r['id'], r['revision'], record_content_hash(r)] for r in ordered]
    layout = [[r['id'], r['_path']] for r in ordered]
    def digest(value):
        return hashlib.sha256(json.dumps(value, ensure_ascii=False,
                                        separators=(',', ':')).encode('utf-8')).hexdigest()
    return {'content_catalog_hash': digest(content), 'layout_hash': digest(layout)}


def field_text(record, path):
    value = record
    for part in path.split('.'):
        if not isinstance(value, dict):
            return ''
        value = value.get(part, '')
    if isinstance(value, list):
        return ' '.join(v for v in value if isinstance(v, str))
    return value if isinstance(value, str) else ''
