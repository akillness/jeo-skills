#!/usr/bin/env python3
"""Append contract-valid dataset-change evidence and record snapshots.

The helper writes what a contributor observed or decided; it never judges source truth,
runtime behavior or aesthetic quality. Events are appended and then validated with the
repository contract: a rejected batch is removed again and the command exits 1.
"""
import argparse
import json
from pathlib import Path
import sys

from catalog_validation import ContractError, STATUSES, identifier, load_catalog, require
from evidence_log_events import (CHECK_STATUSES, CLAIM_STATUSES, RUNTIME_STATUSES,
                                 check_run_event, claim_checked_event, curated_event,
                                 proposed_event, snapshot_path, source_read_event)
from evidence_validation import content_hash, validate_event

ROOT = Path(__file__).resolve().parents[1]


def catalog(root, change_id):
    identifier(change_id, 'change-id')
    records, sources, _ = load_catalog(root, collection='all')
    return records, sources


def pick(records, record_id):
    identifier(record_id, 'record')
    require(record_id in records, f'{record_id}: unknown record')
    return records[record_id]


def known_event_ids(root):
    ids = set()
    for path in sorted((root / 'evidence/dataset-changes').glob('*/events.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue  # validate.py reports malformed lines with their line number.
            if isinstance(event, dict) and isinstance(event.get('event_id'), str):
                ids.add(event['event_id'])
    return ids


def append(root, change_id, events, records, sources):
    """Append events, then validate them; failure restores exactly the previous file bytes."""
    known = known_event_ids(root)
    for event in events:
        require(event['event_id'] not in known, f'duplicate event_id: {event["event_id"]}')
        known.add(event['event_id'])
    path = root / 'evidence/dataset-changes' / change_id / 'events.jsonl'
    path.parent.mkdir(parents=True, exist_ok=True)
    original = path.read_bytes() if path.exists() else b''
    separator = b'' if not original or original.endswith(b'\n') else b'\n'
    lines = ''.join(json.dumps(event, ensure_ascii=False) + '\n' for event in events)
    path.write_bytes(original + separator + lines.encode('utf-8'))
    try:
        for event in events:
            validate_event(event, records, sources, root, change_id)
            print(f'OK {event["event_id"]}')
    except BaseException:
        if original:
            path.write_bytes(original)
        else:
            path.unlink()
        raise


def actor_of(args):
    return {'kind': args.actor_kind, 'name': args.actor}


def run_snapshot(args, root):
    records, _ = catalog(root, args.change_id)
    record = pick(records, args.record)
    path = root / snapshot_path(args.change_id, record)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{content_hash(record)} {path.relative_to(root).as_posix()}')


def run_propose(args, root):
    records, sources = catalog(root, args.change_id)
    record = pick(records, args.record)
    actor = actor_of(args)
    append(root, args.change_id,
           [proposed_event(root, args.change_id, record, actor, args.summary),
            curated_event(args.change_id, record, actor, args.status or record['status'],
                          args.rationale, args.runtime_status, args.summary,
                          args.artifact)],
           records, sources)


def run_check_run(args, root):
    records, sources = catalog(root, args.change_id)
    record = pick(records, args.record)
    append(root, args.change_id,
           [check_run_event(args.change_id, record, actor_of(args), args.check_id, args.method,
                            args.status, args.artifact, args.output, args.observed_by,
                            args.observed_result, args.reason, args.summary)],
           records, sources)


def run_source_read(args, root):
    records, sources = catalog(root, args.change_id)
    record = pick(records, args.record)
    summary = args.summary or (f'Read {args.source} at {args.locator} for '
                               f'{len(args.claims)} claim(s) of {record["id"]}.')
    append(root, args.change_id,
           [source_read_event(args.change_id, record, actor_of(args), args.source, args.locator,
                              args.source_version, args.accessed_at, args.claims, summary)],
           records, sources)


def run_claim_checked(args, root):
    records, sources = catalog(root, args.change_id)
    record = pick(records, args.record)
    summary = args.summary or f'Checked {args.claim} of {record["id"]}: {args.status}.'
    append(root, args.change_id,
           [claim_checked_event(args.change_id, record, actor_of(args), args.claim, args.status,
                                args.assumptions, args.uncertainty, summary)],
           records, sources)


HANDLERS = {'snapshot': run_snapshot, 'propose': run_propose, 'check-run': run_check_run,
            'source-read': run_source_read, 'claim-checked': run_claim_checked}


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--root', type=Path, default=ROOT, help='repository root')
    common.add_argument('--change-id', required=True, help='evidence/dataset-changes/<change-id>')
    common.add_argument('--record', required=True, help='recipe.* or knowledge.* record ID')
    logged = argparse.ArgumentParser(add_help=False)
    logged.add_argument('--actor', required=True, help='actor name recorded in the event')
    logged.add_argument('--actor-kind', choices=('agent', 'human', 'tool'), default='agent')
    subs = parser.add_subparsers(dest='command', required=True)
    subs.add_parser('snapshot', parents=[common],
                    help='preserve the current record revision before editing it')
    propose = subs.add_parser('propose', parents=[common, logged],
                              help='log change-proposed and record-curated for the edited record')
    propose.add_argument('--summary', required=True)
    propose.add_argument('--rationale', required=True, help='why the curated content is acceptable')
    propose.add_argument('--status', choices=sorted(STATUSES), help='defaults to the record status')
    propose.add_argument('--runtime-status', choices=RUNTIME_STATUSES, default='not-run')
    propose.add_argument('--artifact', help='repository-relative artifact the runtime status '
                                            'was observed on; required by --runtime-status passed')
    check = subs.add_parser('check-run', parents=[common, logged],
                            help='log one executed or unrun check against this record revision')
    check.add_argument('--check-id', required=True, help='stable ID of this check')
    check.add_argument('--method', required=True, help='how the check was made, e.g. visual')
    check.add_argument('--status', choices=CHECK_STATUSES, required=True)
    check.add_argument('--artifact', help='repository-relative artifact the check ran against')
    check.add_argument('--output', help='repository-relative output of the check')
    check.add_argument('--observed-by', help='observer; required for passed or failed')
    check.add_argument('--observed-result', help='what was observed; required for passed or failed')
    check.add_argument('--reason', help='why an unrun check was not run')
    check.add_argument('--summary', required=True)
    read = subs.add_parser('source-read', parents=[common, logged],
                           help='log one source read supporting claims of the record')
    read.add_argument('--source', required=True)
    read.add_argument('--locator', required=True)
    read.add_argument('--source-version', required=True)
    read.add_argument('--accessed-at', required=True, help='YYYY-MM-DD')
    read.add_argument('--claim', action='append', dest='claims', default=[], required=True)
    read.add_argument('--summary')
    checked = subs.add_parser('claim-checked', parents=[common, logged],
                              help='log one claim check with its assumptions and uncertainty')
    checked.add_argument('--claim', required=True)
    checked.add_argument('--status', choices=CLAIM_STATUSES, required=True)
    checked.add_argument('--assumption', action='append', dest='assumptions', default=[])
    checked.add_argument('--uncertainty', required=True)
    checked.add_argument('--summary')
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        HANDLERS[args.command](args, args.root.resolve())
    except (ContractError, OSError, TypeError, KeyError) as error:
        print(f'Evidence log failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
