"""Validate this project's authored catalog contract, not arbitrary JSON Schema."""
import datetime
import json
import math
import re
import sys
from pathlib import Path, PurePosixPath
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/3dviz-pro-max/scripts"))
from manifest_contract import COLLECTIONS, KNOWLEDGE_KINDS, validate_manifest
from record_layout import record_file
from urllib.parse import urlsplit

ID = re.compile(r'^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$')
STATUSES = {'draft', 'active', 'deprecated'}


class ContractError(ValueError):
    """A catalog or evidence contract violation."""


def require(condition, message):
    if not condition:
        raise ContractError(message)


def text(value, context):
    require(isinstance(value, str) and bool(value.strip()), f'{context}: nonempty string required')


def identifier(value, context):
    text(value, context)
    require(ID.fullmatch(value), f'{context}: invalid ID')


def integer(value, context):
    require(type(value) is int and value > 0, f'{context}: positive integer required')


def strings(value, context, nonempty=False):
    require(isinstance(value, list), f'{context}: array required')
    require(not nonempty or value, f'{context}: nonempty array required')
    for item in value:
        text(item, context)


def date(value, context):
    text(value, context)
    require(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), f'{context}: YYYY-MM-DD required')
    try:
        datetime.date.fromisoformat(value)
    except ValueError as error:
        raise ContractError(f'{context}: invalid date') from error


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'duplicate JSON key: {key}')
        result[key] = value
    return result


def finite_float(raw):
    value = float(raw)
    require(math.isfinite(value), f'non-finite number: {raw}')
    return value


def parse_json(raw, context):
    try:
        return json.loads(raw, object_pairs_hook=unique_object, parse_float=finite_float,
                          parse_constant=lambda x: require(False, f'non-finite number: {x}'))
    except (ValueError, TypeError) as error:
        raise ContractError(f'{context}: {error}') from error


def read_json(path):
    try:
        return parse_json(path.read_text(encoding='utf-8'), str(path))
    except OSError as error:
        raise ContractError(f'{path}: {error.strerror}') from error


def objects(value, context):
    require(isinstance(value, list), f'{context}: JSON array required')
    require(all(isinstance(item, dict) for item in value), f'{context}: object entries required')
    return value


def keyed(records, context):
    result = {}
    for record in objects(records, context):
        rid = record.get('id')
        identifier(rid, context)
        require(rid not in result, f'{context}: duplicate ID {rid}')
        result[rid] = record
    return result


def source_refs(refs, sources, context):
    objects(refs, context)
    require(refs, f'{context}: source references required')
    for ref in refs:
        require(ref.get('source_id') in sources, f'{context}: unknown source {ref.get("source_id")}')
        text(ref.get('locator'), f'{context}.locator')


def validate_core(record, sources, directions, prefix):
    rid = record.get('id')
    identifier(rid, f'{prefix}.id')
    require(rid.startswith(prefix + '.'), f'{rid}: {prefix} prefix required')
    require(re.fullmatch(prefix + r'\.[a-z0-9]+(?:-[a-z0-9]+)*', rid), f'{rid}: invalid record ID')
    require(type(record.get('schema_version')) is int and record['schema_version'] == 1,
            f'{rid}: schema_version must be 1')
    integer(record.get('revision'), f'{rid}.revision')
    require(record.get('status') in STATUSES, f'{rid}: invalid status')
    kind = record.get('record_kind')
    require(kind in {'creative', 'factual', 'mixed'}, f'{rid}: invalid record_kind')
    for field in ('title', 'aliases'):
        require(isinstance(record.get(field), dict), f'{rid}.{field}: language map required')
    text(record['title'].get('en'), f'{rid}.title.en')
    strings(record['aliases'].get('en'), f'{rid}.aliases.en')
    for field in ('summary', 'objective'):
        text(record.get(field), f'{rid}.{field}')
    strings(record.get('direction_ids'), f'{rid}.direction_ids', True)
    require(len(set(record['direction_ids'])) == len(record['direction_ids']), f'{rid}: duplicate direction')
    require(all(d in directions for d in record['direction_ids']), f'{rid}: unknown direction')
    claims = objects(record.get('claims', []), f'{rid}.claims')
    require(kind == 'creative' or claims, f'{rid}: factual or mixed record requires claims')
    seen = set()
    for claim in claims:
        cid = claim.get('id')
        identifier(cid, f'{rid}.claim.id')
        require(cid not in seen, f'{rid}: duplicate claim ID')
        seen.add(cid)
        for field in ('statement', 'scope'):
            text(claim.get(field), f'{rid}.{cid}.{field}')
        source_refs(claim.get('source_refs'), sources, f'{rid}.{cid}')
    if 'defaults' in record:
        # Authored starting values are a tuned creative proposal, not a factual claim;
        # source-backed values must name the claims of this record that support them.
        defaults = record['defaults']
        require(isinstance(defaults, dict), f'{rid}.defaults: object required')
        require(defaults.get('provenance') in {'authored', 'source-backed'},
                f'{rid}.defaults: invalid provenance')
        require(isinstance(defaults.get('tunable'), bool), f'{rid}.defaults.tunable: boolean required')
        require(isinstance(defaults.get('values'), dict) and defaults['values'],
                f'{rid}.defaults.values: nonempty object required')
        text(defaults.get('rationale'), f'{rid}.defaults.rationale')
        if defaults['provenance'] == 'source-backed':
            strings(defaults.get('claim_ids'), f'{rid}.defaults.claim_ids', True)
        elif 'claim_ids' in defaults:
            strings(defaults['claim_ids'], f'{rid}.defaults.claim_ids')
        require(set(defaults.get('claim_ids', [])) <= seen,
                f'{rid}.defaults: claim_ids must name claims of this record')
    for field in ('tags', 'subject_terms', 'intent_signals', 'example_prompts', 'negative_signals',
                  'not_for', 'invariants', 'motion_guidance', 'creative_affordances', 'known_limits'):
        if field in record:
            strings(record[field], f'{rid}.{field}')
    return record


def validate_recipe(record, sources, directions):
    validate_core(record, sources, directions, 'recipe')
    rid = record['id']
    for entity in objects(record.get('entities', []), f'{rid}.entities'):
        text(entity.get('name'), f'{rid}.entity.name')
        if 'guidance' in entity:
            text(entity['guidance'], f'{rid}.entity.guidance')
    if 'state_contract' in record:
        require(isinstance(record['state_contract'], dict), f'{rid}.state_contract: object required')
        for field in ('model', 'authority'):
            text(record['state_contract'].get(field), f'{rid}.state_contract.{field}')
        strings(record['state_contract'].get('actions'), f'{rid}.state_contract.actions', True)
    for craft in objects(record.get('object_craft', []), f'{rid}.object_craft'):
        for field in ('family', 'structure', 'material'):
            text(craft.get(field), f'{rid}.object_craft.{field}')
        if 'articulation' in craft:
            text(craft['articulation'], f'{rid}.object_craft.articulation')
    if 'physical_contract' in record:
        physical = record['physical_contract']
        require(isinstance(physical, dict), f'{rid}.physical_contract: object required')
        require(physical.get('model') in {'display-transform', 'controlled-locomotion',
                'rigid-body', 'numerical-dynamics', 'none'}, f'{rid}: invalid physical model')
        text(physical.get('scope'), f'{rid}.physical_contract.scope')
        for field in ('state', 'colliders', 'driving', 'contact', 'checks'):
            if field in physical:
                strings(physical[field], f'{rid}.physical_contract.{field}')
        if 'timestep' in physical:
            text(physical['timestep'], f'{rid}.physical_contract.timestep')
    return record


def validate_knowledge(record, sources, directions):
    validate_core(record, sources, directions, 'knowledge')
    rid = record['id']
    require(record.get('knowledge_kind') in KNOWLEDGE_KINDS, f'{rid}: invalid knowledge_kind')
    content = record.get('content')
    require(isinstance(content, dict), f'{rid}.content: object required')
    for field in ('principles', 'implementation', 'observable_checks'):
        strings(content.get(field), f'{rid}.content.{field}', True)
    if 'applies_when' in record:
        strings(record['applies_when'], f'{rid}.applies_when', True)
    if 'constraint_level' in record:
        require(record['constraint_level'] in {'advisory', 'correctness'},
                f'{rid}: invalid constraint_level')
    if 'check_method' in record:
        require(record['check_method'] in {'analytic', 'state', 'geometry', 'source',
                                          'interaction', 'visual'}, f'{rid}: invalid check_method')
    if record['knowledge_kind'] in {'reasoning-rule', 'domain-validation'}:
        strings(record.get('applies_when'), f'{rid}.applies_when', True)
        required = 'constraint_level' if record['knowledge_kind'] == 'reasoning-rule' else 'check_method'
        require(required in record, f'{rid}: {required} required')
    return record


def load_catalog(root, collection='recipes'):
    require(collection in COLLECTIONS, 'Unknown collection')
    data = root / 'skills/3dviz-pro-max/data'
    try:
        manifest = read_json(data / 'manifest.json')
        paths = validate_manifest(manifest, data)
    except ValueError as error:
        raise ContractError(str(error)) from error
    sources = keyed(read_json(paths['sources'][0]), 'sources')
    directions = keyed(read_json(paths['directions'][0]), 'directions')
    require(directions, 'directions: empty catalog')
    for did, direction in directions.items():
        text(direction.get('summary'), f'{did}.summary')
    for sid, source in sources.items():
        require(sid.startswith('source.'), f'{sid}: source prefix required')
        for field in ('url', 'title', 'locator', 'scope'):
            text(source.get(field), f'{sid}.{field}')
        url = urlsplit(source['url'])
        require(url.scheme in {'http', 'https'} and url.hostname and not url.username,
                f'{sid}: public HTTP(S) URL required')
        date(source.get('accessed_at'), f'{sid}.accessed_at')
    rows = []
    for path in paths['recipes']:
        rows.extend(read_record_file(path, data, 'recipes', manifest))
    recipes = keyed(rows, 'recipes')
    require(recipes, 'recipes: empty catalog')
    knowledge_rows = []
    for path in paths.get('knowledge', []):
        knowledge_rows.extend(read_record_file(path, data, 'knowledge', manifest))
    knowledge = keyed(knowledge_rows, 'knowledge')
    if 'knowledge' in paths:
        require(knowledge, 'knowledge: empty catalog')
    all_records = {**recipes, **knowledge}
    require(len(all_records) == len(recipes) + len(knowledge), 'duplicate catalog ID')
    claim_ids = set()
    # Imported here, not at module scope: blueprint_validation reuses this module's helpers.
    from blueprint_validation import validate_blueprint
    for records, validator in ((recipes, validate_recipe), (knowledge, validate_knowledge)):
        for record in records.values():
            validator(record, sources, directions)
            if record.get('knowledge_kind') == 'blueprint':
                # Cross-record checks (fits_looks) need the whole catalog, so they run here
                # rather than inside validate_knowledge, which only sees one record.
                validate_blueprint(record, all_records, root)
            if 'related_ids' in record:
                strings(record['related_ids'], f'{record["id"]}.related_ids')
                require(all(target in all_records for target in record['related_ids']),
                        f'{record["id"]}: unknown related record')
            for claim in record.get('claims', []):
                require(claim['id'] not in claim_ids, f'duplicate global claim ID: {claim["id"]}')
                claim_ids.add(claim['id'])
    selected = {'recipes': recipes, 'knowledge': knowledge, 'all': all_records}[collection]
    return selected, sources, directions


def read_record_file(path, data, collection, manifest):
    try:
        return record_file(read_json(path), path.relative_to(data).as_posix(), collection,
                           manifest.get('layout_version', 1))
    except ValueError as error:
        raise ContractError(str(error)) from error


def portable_path(value, label, root=None):
    """Validate serialized POSIX paths and, when available, their resolved base."""
    text(value, label)
    path = PurePosixPath(value)
    require(path.parts and not path.is_absolute() and '\\' not in value and ':' not in value
            and '..' not in path.parts and path.as_posix() == value,
            f'{label}: relative POSIX path without traversal required')
    if root is not None:
        resolved = (root / value).resolve()
        require(resolved.is_relative_to(root.resolve()), f'{label}: path escapes base')
        return resolved
    return path
