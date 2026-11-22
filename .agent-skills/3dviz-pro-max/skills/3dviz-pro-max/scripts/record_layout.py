"""Storage placement is independent of topic routing and creative guidance."""
import re
from manifest_contract import KNOWLEDGE_KINDS


def record_path(record, collection):
    prefix = {'recipes': 'recipe', 'knowledge': 'knowledge'}[collection]
    rid = record.get('id', '')
    if not isinstance(rid, str) or not re.fullmatch(prefix + r'\.[a-z0-9]+(?:-[a-z0-9]+)*', rid):
        raise ValueError(f'Invalid {prefix} ID: {rid}')
    slug = rid.split('.', 1)[1]
    if collection == 'knowledge':
        kind = record.get('knowledge_kind')
        if kind not in KNOWLEDGE_KINDS:
            raise ValueError(f'{rid}: invalid knowledge_kind')
        return f'knowledge/{kind}/{slug}.json'
    return f'recipes/{slug}.json'


def record_file(value, relative_path, collection, layout_version=1):
    if layout_version == 2:
        if not isinstance(value, dict):
            raise ValueError(f'{relative_path}: layout 2 requires one record object per file')
        expected = record_path(value, collection)
        if relative_path != expected:
            raise ValueError(f'{relative_path}: expected record path {expected}')
        return [value]
    rows = [value] if isinstance(value, dict) else value
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError(f'{relative_path}: record object or array of objects required')
    return rows
