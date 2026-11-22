"""Build contract-shaped evidence events and snapshot locations for scripts/evidence-log.py.

Hashing, canonicalization and validation stay in evidence_validation; this module only
assembles the JSON objects that module already knows how to check.
"""
import copy
import datetime
import re

from catalog_validation import identifier, require
from evidence_validation import CANONICAL, content_hash

CHANGES = 'evidence/dataset-changes'
RUNTIME_STATUSES = ('not-run', 'passed', 'failed', 'unavailable', 'skipped')
CLAIM_STATUSES = ('verified', 'uncertain', 'rejected')
CHECK_STATUSES = ('passed', 'failed', 'not-run', 'unavailable', 'skipped')


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def collection_of(record_id):
    require(record_id.startswith(('recipe.', 'knowledge.')), f'{record_id}: unsupported record prefix')
    return 'recipes' if record_id.startswith('recipe.') else 'knowledge'


def snapshot_path(change_id, record):
    """Repository-relative location the evidence contract expects for this exact revision."""
    return (f'{CHANGES}/{change_id}/snapshots/{collection_of(record["id"])}/{record["id"]}/'
            f'{record["revision"]}/{content_hash(record)}.json')


def find_snapshot(root, record_id, revision):
    """Locate the unique preserved snapshot of an earlier revision, in any change directory."""
    pattern = f'*/snapshots/{collection_of(record_id)}/{record_id}/{revision}/*.json'
    found = sorted((root / CHANGES).glob(pattern))
    require(found, f'{record_id}: no snapshot for revision {revision}; run the snapshot '
                   'subcommand before editing the record')
    require(len(found) == 1, f'{record_id}: ambiguous snapshots for revision {revision}')
    digest = found[0].stem
    require(re.fullmatch('[0-9a-f]{64}', digest), f'{found[0]}: snapshot filename requires SHA-256')
    return digest, found[0].relative_to(root).as_posix()


def record_ref(record):
    return {'collection': collection_of(record['id']), 'record_id': record['id'],
            'revision': record['revision']}


def event(change_id, record, actor, event_type, suffix, summary, payload):
    return {'schema_version': 1, 'change_id': change_id, 'timestamp': now(), 'actor': actor,
            'record_refs': [record_ref(record)],
            'event_id': f'{change_id}.{record["id"]}.{suffix}',
            'event_type': event_type, 'summary': summary, 'payload': payload}


def proposed_event(root, change_id, record, actor, summary):
    payload = {'before_hash': None, 'after_hash': content_hash(record)}
    if record['revision'] > 1:
        digest, path = find_snapshot(root, record['id'], record['revision'] - 1)
        payload['before_hash'] = digest
        payload['before_ref'] = {'collection': collection_of(record['id']),
                                 'record_id': record['id'], 'revision': record['revision'] - 1,
                                 'provenance_ref': f'snapshot:sha256:{digest}:{path}'}
    payload['hash_algorithm'] = 'sha256'
    payload['canonicalization'] = CANONICAL
    return event(change_id, record, actor, 'change-proposed',
                 f'revision-{record["revision"]}.proposed', summary, payload)


def curated_event(change_id, record, actor, status, rationale, runtime_status, summary,
                  artifact=None):
    """`artifact` is the repository-relative path the runtime observation was made on.

    The contract requires it whenever runtime_status is 'passed', and requires the same
    string to appear on a passing check-run of the same revision; callers must build both
    from one source (blueprint_validation.asset_ref for blueprints).
    """
    payload = {'status': status, 'rationale': rationale, 'runtime_status': runtime_status,
               'artifact_ref': artifact}
    return event(change_id, record, actor, 'record-curated',
                 f'revision-{record["revision"]}.curated', summary, payload)


def check_run_event(change_id, record, actor, check_id, method, status, artifact, output,
                    observed_by, observed_result, reason, summary):
    """One executed or unrun check. It records what was observed, never that it was right."""
    identifier(check_id, 'check-id')
    payload = {'check_id': check_id, 'method': method, 'status': status,
               'input_revision': record['revision'], 'artifact_ref': artifact,
               'output_ref': output}
    if status in {'passed', 'failed'}:
        payload.update({'observed_by': observed_by, 'observed_result': observed_result})
    else:
        payload['reason'] = reason
    return event(change_id, record, actor, 'check-run', f'{check_id}.check', summary, payload)


def source_read_event(change_id, record, actor, source_id, locator, source_version,
                      accessed_at, claim_ids, summary):
    require(claim_ids, f'{record["id"]}: at least one supported claim required')
    payload = {'source_id': source_id, 'locator': locator, 'source_version': source_version,
               'accessed_at': accessed_at, 'supported_claim_ids': list(claim_ids)}
    return event(change_id, record, actor, 'source-read', f'{claim_ids[0]}.{source_id}.read',
                 summary, payload)


def claim_of(record, claim_id):
    for claim in record.get('claims', []):
        if claim.get('id') == claim_id:
            return claim
    require(False, f'{record["id"]}: claim {claim_id} absent from the record')


def claim_checked_event(change_id, record, actor, claim_id, status, assumptions,
                        uncertainty, summary):
    claim = claim_of(record, claim_id)
    payload = {'claim_id': claim_id, 'status': status, 'assumptions': list(assumptions),
               'source_refs': copy.deepcopy(claim['source_refs']),
               'remaining_uncertainty': uncertainty}
    return event(change_id, record, actor, 'claim-checked', f'{claim_id}.checked', summary, payload)
