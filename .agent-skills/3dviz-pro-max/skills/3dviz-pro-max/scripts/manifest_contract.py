"""Validate the supported retrieval manifest before reading any collection paths."""
import math
from pathlib import Path

KNOWLEDGE_KINDS = {'object-archetype', 'material-profile', 'physical-behavior',
                   'tool-adapter', 'inspection-pattern', 'validation-profile',
                   'style-profile', 'theme-profile', 'presentation-profile',
                   'composition-profile', 'motion-profile', 'interaction-profile',
                   'reasoning-rule', 'domain-validation',
                   'geometry-profile', 'lighting-profile', 'output-profile',
                   'blueprint'}
COLLECTIONS = {'recipes', 'knowledge', 'all'}

SEARCH_FIELDS = {'title.en', 'aliases.en', 'summary', 'objective', 'tags',
                 'subject_terms', 'intent_signals', 'example_prompts', 'applies_when',
                 'defaults.values.feeling'}
MAX_QUERY_ALIASES = 200


def validate_manifest(manifest, data):
    if not isinstance(manifest, dict) or manifest.get('schema_version') != 1:
        raise ValueError('Unsupported manifest schema')
    if type(manifest.get('layout_version', 1)) is not int or manifest.get('layout_version', 1) not in {1, 2}:
        raise ValueError('Unsupported catalog layout version')
    collections = manifest.get('collections', {})
    if (not isinstance(collections, dict) or
            not {'recipes', 'sources', 'directions'} <= set(collections) or
            set(collections) - {'recipes', 'sources', 'directions', 'knowledge'}):
        raise ValueError('Manifest requires recipes, sources and directions collections')
    paths = {}
    for name, pattern in collections.items():
        if (not isinstance(pattern, str) or '\\' in pattern or ':' in pattern
                or Path(pattern).is_absolute() or '..' in Path(pattern).parts):
            raise ValueError(f'Unsafe collection path: {name}')
        selected = sorted(data.glob(pattern))
        if not selected or (name not in {'recipes', 'knowledge'} and len(selected) != 1):
            raise ValueError(f'Missing or ambiguous collection: {name}')
        for path in selected:
            if not path.is_file() or path.suffix != '.json' or not path.resolve().is_relative_to(data.resolve()):
                raise ValueError(f'Invalid collection member: {name}')
        paths[name] = selected
    cfg = manifest.get('search', {})
    if cfg.get('algorithm') not in ('weighted-field-bm25', 'overlap'):
        raise ValueError('Unsupported search algorithm')
    if type(cfg.get('version')) is not int or cfg['version'] < 1:
        raise ValueError('Search version must be a positive integer')
    if cfg.get('tokenizer') != 'unicode-notation-v1':
        raise ValueError('Unsupported tokenizer')
    fields = cfg.get('fields', {})
    if not isinstance(fields, dict) or not fields or set(fields) - SEARCH_FIELDS:
        raise ValueError('Invalid positive search fields')
    for field, boost in fields.items():
        if type(boost) not in (float, int) or not math.isfinite(boost) or boost <= 0:
            raise ValueError(f'Invalid boost: {field}')
    for key in ('k1', 'b'):
        val = cfg.get(key)
        if type(val) not in (float, int) or not math.isfinite(val):
            raise ValueError(f'Invalid parameter: {key}')
    if cfg['k1'] <= 0 or not 0 <= cfg['b'] <= 1:
        raise ValueError('BM25 parameters out of range')
    validate_query_aliases(cfg.get('query_aliases', {}))
    return paths


def validate_query_aliases(aliases):
    """Alias expansion widens a lexical query; it never asserts that two phrases mean the same."""
    if not isinstance(aliases, dict):
        raise ValueError('query_aliases must be an object')
    if len(aliases) > MAX_QUERY_ALIASES:
        raise ValueError(f'query_aliases exceeds {MAX_QUERY_ALIASES} entries')
    for phrase, expansion in aliases.items():
        if not isinstance(phrase, str) or not phrase.strip() or phrase.casefold() != phrase:
            raise ValueError(f'query_aliases key must be a nonempty casefolded string: {phrase!r}')
        if not isinstance(expansion, list) or not expansion:
            raise ValueError(f'query_aliases value must be a nonempty list: {phrase}')
        for term in expansion:
            if not isinstance(term, str) or not term.strip():
                raise ValueError(f'query_aliases term must be a nonempty string: {phrase}')
        if phrase in expansion:
            raise ValueError(f'query_aliases key repeats itself in its expansion: {phrase}')
    return aliases
