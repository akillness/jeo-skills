"""Check evidence linkage and observations without certifying their truth."""
import datetime
import hashlib
import json
from pathlib import PurePosixPath
import re
import subprocess

from catalog_validation import (ContractError, STATUSES, date, identifier, integer,
                                objects, parse_json, require, source_refs, strings, text)

TYPES = {'change-proposed', 'source-read', 'claim-checked', 'record-curated',
         'check-run', 'status-changed', 'correction'}
CANONICAL = 'UTF-8 JSON; sorted keys; compact separators; ensure_ascii=false'
LEGACY_ARTIFACT_PREFIX = PurePosixPath('examples/early-slice')
LEGACY_ARTIFACT_ARCHIVE = PurePosixPath('evidence/artifacts/legacy-early-slice')


def content_hash(record):
    raw = json.dumps(record, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                     allow_nan=False).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def safe_path(value, root, must_exist=True):
    text(value, 'artifact path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and '\\' not in value and '..' not in path.parts,
            'artifact path must be repository-relative without traversal')
    require(path.parts and ':' not in value, 'artifact path cannot be a URI')
    resolved = (root / value).resolve()
    repository = root.resolve()
    require(resolved.is_relative_to(repository), 'artifact path escapes repository')
    # Append-only evidence keeps its original artifact_ref. Once the retired demo is removed,
    # resolve only that exact historical prefix to its byte-preserving public archive. An original
    # path wins while both exist, which makes the migration reviewable before deletion.
    if not resolved.is_file() and path.is_relative_to(LEGACY_ARTIFACT_PREFIX):
        suffix = path.relative_to(LEGACY_ARTIFACT_PREFIX)
        archived = (root / LEGACY_ARTIFACT_ARCHIVE / suffix).resolve()
        require(archived.is_relative_to(repository), 'artifact archive path escapes repository')
        if archived.is_file():
            resolved = archived
    require(not must_exist or resolved.is_file(), f'artifact does not exist: {value}')
    return resolved


def snapshot_record(path, digest, ref, root):
    resolved = safe_path(path, root)
    parts = PurePosixPath(path).parts
    expected_tail = ('snapshots', ref['collection'], ref['record_id'],
                     str(ref['revision']), f'{digest}.json')
    require(len(parts) == 8 and parts[:2] == ('evidence', 'dataset-changes')
            and parts[3:] == expected_tail and str(PurePosixPath(path)) == path,
            'snapshot path must match collection, record ID, revision and digest')
    identifier(parts[2], 'snapshot change ID')
    record = parse_json(resolved.read_text(encoding='utf-8'), path)
    require(isinstance(record, dict), 'snapshot must contain one record object')
    require(record.get('id') == ref['record_id']
            and type(record.get('revision')) is int and record['revision'] == ref['revision'],
            'snapshot record identity or revision mismatch')
    require(content_hash(record) == digest, 'snapshot content hash mismatch')
    return record


def resolve_record(ref, recipes, root):
    require(isinstance(ref, dict), 'record_ref must be an object')
    collection = ref.get('collection')
    require(collection in {'recipes', 'knowledge'}, 'unsupported evidence collection')
    rid = ref.get('record_id')
    identifier(rid, 'record_ref.record_id')
    prefix = 'recipe.' if collection == 'recipes' else 'knowledge.'
    require(rid.startswith(prefix), 'record_ref collection does not match record ID')
    integer(ref.get('revision'), 'record_ref.revision')
    provenance = ref.get('provenance_ref')
    if 'provenance_ref' in ref:
        text(provenance, 'provenance_ref')
    if provenance is None:
        if rid in recipes and recipes[rid]['revision'] == ref['revision']:
            return recipes[rid]
        # Old append-only events lack provenance fields. Constrained discovery keeps
        # those events intact; ambiguous historical content fails closed.
        pattern = f'*/snapshots/{collection}/{rid}/{ref["revision"]}/*.json'
        candidates = sorted((root / 'evidence/dataset-changes').glob(pattern))
        require(candidates, f'{rid}: historical reference requires provenance_ref or snapshot')
        require(len(candidates) == 1, f'{rid}: ambiguous historical snapshots')
        path = candidates[0].relative_to(root).as_posix()
        digest = candidates[0].stem
        require(re.fullmatch('[0-9a-f]{64}', digest), 'snapshot filename requires SHA-256')
        return snapshot_record(path, digest, ref, root)
    text(provenance, 'provenance_ref')
    snapshot = re.fullmatch(r'snapshot:sha256:([0-9a-f]{64}):(.+)', provenance)
    if snapshot:
        digest, path = snapshot.groups()
        return match_current_content(snapshot_record(path, digest, ref, root), recipes)
    match = re.fullmatch(r'git:([0-9a-f]{40}):(.+)', provenance)
    require(match, 'provenance_ref must be git:<commit>:<JSON path> or snapshot:sha256:<digest>:<snapshot path>')
    commit, path = match.groups()
    safe_path(path, root, must_exist=False)
    try:
        raw = subprocess.check_output(['git', 'show', f'{commit}:{path}'], cwd=root,
                                      stderr=subprocess.PIPE, text=True, timeout=10)
    except (subprocess.SubprocessError, OSError) as error:
        raise ContractError(f'{rid}: historical record unavailable') from error
    records = objects(parse_json(raw, provenance), provenance)
    matches = [r for r in records if r.get('id') == rid and r.get('revision') == ref['revision']]
    require(len(matches) == 1, f'{rid}: historical revision not found uniquely')
    return match_current_content(matches[0], recipes)


def match_current_content(record, records):
    current = records.get(record['id'])
    if current is not None and current['revision'] == record['revision']:
        require(content_hash(record) == content_hash(current),
                f'{record["id"]}: provenance content differs from current canonical revision')
    return record


def timestamp(value):
    text(value, 'timestamp')
    require(value.endswith('Z') and 'T' in value, 'timestamp must be UTC with Z suffix')
    try:
        datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ContractError('invalid timestamp') from error


def hash_value(value, name, nullable=False):
    if value is None and nullable:
        return
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value), f'{name}: SHA-256 required')


def validate_event(event, recipes, sources, root, change_id, retired=frozenset()):
    require(isinstance(event, dict), 'event must be an object')
    require(type(event.get('schema_version')) is int and event['schema_version'] == 1,
            'event schema_version must be 1')
    for field in ('event_id', 'summary'):
        text(event.get(field), field)
    require(event.get('change_id') == change_id, 'change_id must match evidence directory')
    timestamp(event.get('timestamp'))
    actor = event.get('actor')
    require(isinstance(actor, dict), 'actor required')
    require(actor.get('kind') in {'agent', 'human', 'tool'}, 'invalid actor kind')
    text(actor.get('name'), 'actor.name')
    kind = event.get('event_type')
    require(kind in TYPES, f'unsupported event_type: {kind}')
    refs = objects(event.get('record_refs'), 'record_refs')
    require(refs, 'record_refs must not be empty')
    records = [resolve_record(ref, recipes, root) for ref in refs]
    keys = [(r['id'], r['revision']) for r in records]
    require(len(set(keys)) == len(keys), 'duplicate record_refs')
    claims = {c['id']: c for r in records for c in r.get('claims', [])}
    payload = event.get('payload')
    require(isinstance(payload, dict), 'payload object required')
    # A correction event retires a check-run: its observation stays as history, so the
    # artifact it cited no longer has to exist. Only check-runs can be relaxed this way.
    relaxed = kind == 'check-run' and event.get('event_id') in retired
    for key in ('artifact_ref', 'output_ref'):
        if payload.get(key) is not None:
            safe_path(payload[key], root, must_exist=not relaxed)
    if kind == 'source-read':
        sid = payload.get('source_id')
        require(sid in sources, 'source-read: unknown source')
        for field in ('locator', 'source_version'):
            text(payload.get(field), f'source-read.{field}')
        date(payload.get('accessed_at'), 'source-read.accessed_at')
        strings(payload.get('supported_claim_ids'), 'supported_claim_ids', True)
        for cid in payload['supported_claim_ids']:
            require(cid in claims, f'source-read: unreferenced claim {cid}')
            require(any(s['source_id'] == sid for s in claims[cid]['source_refs']),
                    f'source-read: source not linked to {cid}')
    elif kind == 'claim-checked':
        cid = payload.get('claim_id')
        require(cid in claims, 'claim-checked: claim absent from referenced records')
        require(payload.get('status') in {'verified', 'uncertain', 'rejected'}, 'invalid claim status')
        strings(payload.get('assumptions'), 'claim assumptions')
        source_refs(payload.get('source_refs'), sources, 'claim-checked')
        linked = {(s['source_id'], s['locator']) for s in claims[cid]['source_refs']}
        require(all((s['source_id'], s['locator']) in linked for s in payload['source_refs']),
                'claim-checked: source locator is not linked to claim')
        text(payload.get('remaining_uncertainty'), 'remaining_uncertainty')
    elif kind == 'change-proposed':
        require(len(records) == 1, 'change-proposed requires exactly one record')
        require('before_hash' in payload, 'before_hash required (null for a new record)')
        hash_value(payload['before_hash'], 'before_hash', nullable=True)
        hash_value(payload.get('after_hash'), 'after_hash')
        require(payload.get('hash_algorithm') == 'sha256', 'hash_algorithm must be sha256')
        require(payload.get('canonicalization') == CANONICAL, 'unsupported canonicalization')
        require(payload['after_hash'] == content_hash(records[0]), 'after_hash content mismatch')
        if records[0]['revision'] == 1:
            require(payload['before_hash'] is None, 'new record before_hash must be null')
        else:
            before_ref = payload.get('before_ref')
            require(isinstance(before_ref, dict), 'revised record needs before_ref')
            previous = resolve_record(before_ref, recipes, root)
            require(previous['id'] == records[0]['id'] and previous['revision'] < records[0]['revision'],
                    'before_ref must identify an earlier revision of the same record')
            require(payload['before_hash'] == content_hash(previous), 'before_hash content mismatch')
    elif kind == 'record-curated':
        require(payload.get('status') in STATUSES, 'invalid curation status')
        require(all(payload['status'] == r['status'] for r in records), 'curation status mismatch')
        text(payload.get('rationale'), 'curation rationale')
        require(payload.get('runtime_status') in {'not-run', 'passed', 'failed', 'unavailable', 'skipped'},
                'invalid runtime_status')
        require('artifact_ref' in payload, 'curation artifact_ref required, nullable when not run')
        if payload['runtime_status'] == 'passed':
            require(payload.get('artifact_ref') is not None, 'runtime pass requires artifact')
    elif kind == 'check-run':
        for field in ('check_id', 'method'):
            text(payload.get(field), f'check-run.{field}')
        state = payload.get('status')
        require(state in {'passed', 'failed', 'not-run', 'unavailable', 'skipped'}, 'invalid check status')
        integer(payload.get('input_revision'), 'check-run.input_revision')
        require(all(r['revision'] == payload['input_revision'] for r in records), 'check input revision mismatch')
        require('artifact_ref' in payload and 'output_ref' in payload, 'check output/artifact refs required, nullable')
        if state in {'passed', 'failed'}:
            for field in ('observed_by', 'observed_result'):
                text(payload.get(field), f'check-run.{field}')
            require(payload['observed_by'] != 'none', 'executed check requires observer')
        else:
            text(payload.get('reason'), 'unrun check reason')
        if 'tolerance' in payload or 'regime' in payload:
            text(payload.get('tolerance'), 'numerical tolerance')
            text(payload.get('regime'), 'numerical regime')
    elif kind == 'status-changed':
        require(payload.get('before_status') in STATUSES, 'invalid before_status')
        require(payload.get('after_status') in STATUSES, 'invalid after_status')
        text(payload.get('reason'), 'status change reason')
    elif kind == 'correction':
        text(payload.get('target_event_id'), 'correction target')
        text(payload.get('reason'), 'correction reason')
    return records


def collect_retired(base):
    """Collect check-run IDs named by a correction event, before the validating pass."""
    retired = set()
    for path in sorted(base.glob('*/events.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            try:
                event = parse_json(line, str(path))
            except ContractError:
                continue  # The validating pass reports malformed lines with their number.
            payload = event.get('payload') if isinstance(event, dict) else None
            if (isinstance(event, dict) and event.get('event_type') == 'correction'
                    and isinstance(payload, dict) and isinstance(payload.get('target_event_id'), str)):
                retired.add(payload['target_event_id'])
    return retired


def load_evidence(root, recipes, sources):
    # Existing recipe-only callers still resolve newly added knowledge evidence.
    from catalog_validation import load_catalog
    knowledge, _, _ = load_catalog(root, collection='knowledge')
    recipes = {**knowledge, **recipes}
    events, seen, changed, curated, runtime_passes, check_passes = [], set(), set(), set(), [], set()
    base = root / 'evidence/dataset-changes'
    retired = collect_retired(base)
    for path in sorted(base.glob('*/events.jsonl')):
        for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            try:
                event = parse_json(line, str(path))
                records = validate_event(event, recipes, sources, root, path.parent.name,
                                         retired)
                eid = event['event_id']
                require(eid not in seen, 'duplicate event_id')
                seen.add(eid)
                events.append(event)
                keys = {(r['id'], r['revision']) for r in records}
                if event['event_type'] == 'change-proposed':
                    changed.update(keys)
                if event['event_type'] == 'record-curated':
                    curated.update(keys)
                    if event['payload']['runtime_status'] == 'passed':
                        runtime_passes.extend((key, event['payload']['artifact_ref']) for key in keys)
                if (event['event_type'] == 'check-run' and event['payload']['status'] == 'passed'
                        and eid not in retired):
                    check_passes.update((key, event['payload']['artifact_ref']) for key in keys)
            except (ContractError, TypeError, KeyError) as error:
                raise ContractError(f'{path}:{number}: {error}') from error
    for record in recipes.values():
        key = (record['id'], record['revision'])
        require(key in changed, f'{key}: missing change-proposed hash evidence')
        if record['status'] == 'active':
            require(key in curated, f'{key}: missing record-curated evidence')
    for key in runtime_passes:
        require(key in check_passes, f'{key}: runtime curation pass lacks matching check-run')
    for event in events:
        if event['event_type'] == 'correction':
            target = event['payload']['target_event_id']
            require(target in seen and target != event['event_id'], 'invalid correction target')
    return events
