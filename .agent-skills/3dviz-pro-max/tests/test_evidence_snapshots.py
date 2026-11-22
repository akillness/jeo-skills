"""Historical evidence must remain portable without weakening content/path binding."""
import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from catalog_validation import ContractError
from evidence_validation import CANONICAL, content_hash, resolve_record, validate_event


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old = {'id': 'knowledge.example', 'revision': 1, 'status': 'active', 'claims': []}
        self.current = {**self.old, 'revision': 2, 'summary': 'Revised guidance'}
        self.records = {self.current['id']: self.current}
        self.ref = {'collection': 'knowledge', 'record_id': self.old['id'], 'revision': 1}
        self.path = self.snapshot(self.old)
        self.explicit = {**self.ref, 'provenance_ref':
                         f'snapshot:sha256:{content_hash(self.old)}:{self.path}'}

    def snapshot(self, record, change='example'):
        path = (f'evidence/dataset-changes/{change}/snapshots/knowledge/'
                f'{record["id"]}/{record["revision"]}/{content_hash(record)}.json')
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(record))
        return path

    def test_immutable_old_event_and_explicit_before_ref_resolve_without_git(self):
        event = {'schema_version': 1, 'event_id': 'old-proposal', 'change_id': 'example',
                 'timestamp': '2026-09-07T00:00:00Z', 'event_type': 'change-proposed',
                 'actor': {'kind': 'agent', 'name': 'test'}, 'summary': 'Original record',
                 'record_refs': [self.ref], 'payload': {'before_hash': None,
                 'after_hash': content_hash(self.old), 'hash_algorithm': 'sha256',
                 'canonicalization': CANONICAL}}
        before = copy.deepcopy(event)
        self.assertFalse((self.root / '.git').exists())
        self.assertEqual(validate_event(event, self.records, {}, self.root, 'example'), [self.old])
        self.assertEqual(event, before)
        self.assertEqual(resolve_record(self.explicit, self.records, self.root), self.old)
        event['record_refs'] = [{**self.ref, 'revision': 2}]
        event['payload'].update(before_hash=content_hash(self.old),
                                before_ref=self.explicit, after_hash=content_hash(self.current))
        self.assertEqual(validate_event(event, self.records, {}, self.root, 'example'), [self.current])

    def test_schema_accepts_snapshot_and_legacy_git_reference_forms(self):
        schema = json.loads((ROOT / 'schemas/evidence-event.schema.json').read_text())
        refs = [schema['properties']['record_refs']['items'],
                schema['$defs']['change-proposed']['properties']['before_ref']]
        for reference in refs:
            pattern = reference['properties']['provenance_ref']['pattern']
            self.assertRegex(self.explicit['provenance_ref'], pattern)
            # Syntax fixture only; actual Git resolution uses a real temporary commit below.
            self.assertTrue(re.fullmatch(pattern, 'git:' + 'a' * 40 + ':records.json'))
            self.assertFalse(re.fullmatch(pattern, self.explicit['provenance_ref'] + '.txt'))

    def test_tampered_content_and_duplicate_history_fail(self):
        (self.root / self.path).write_text(json.dumps({**self.old, 'summary': 'Changed'}))
        with self.assertRaisesRegex(ContractError, 'hash mismatch'):
            resolve_record(self.ref, self.records, self.root)
        (self.root / self.path).write_text(json.dumps(self.old))
        self.snapshot(self.old, change='other')
        with self.assertRaisesRegex(ContractError, 'ambiguous'):
            resolve_record(self.ref, self.records, self.root)
        # An explicit digest/path remains unambiguous even when discovery cannot decide.
        self.assertEqual(resolve_record(self.explicit, self.records, self.root), self.old)

    def test_ref_path_and_content_identity_are_bound(self):
        for changes in [{'collection': 'recipes'}, {'record_id': 'knowledge.other'}, {'revision': 3}]:
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                resolve_record({**self.explicit, **changes}, self.records, self.root)
        for changes in [{'id': 'knowledge.other'}, {'revision': 3}]:
            (self.root / self.path).write_text(json.dumps({**self.old, **changes}))
            with self.subTest(content=changes), self.assertRaisesRegex(ContractError, 'identity or revision'):
                resolve_record(self.explicit, self.records, self.root)

    def test_path_traversal_and_external_symlink_rejected(self):
        digest = content_hash(self.old)
        for path in ['../outside.json', '/tmp/outside.json', self.path.replace('/snapshots/', '/artifacts/../snapshots/')]:
            ref = {**self.ref, 'provenance_ref': f'snapshot:sha256:{digest}:{path}'}
            with self.subTest(path=path), self.assertRaisesRegex(ContractError, 'traversal'):
                resolve_record(ref, self.records, self.root)
        with tempfile.TemporaryDirectory() as outside:
            external = Path(outside) / 'record.json'
            external.write_text(json.dumps(self.old))
            target = self.root / self.path
            target.unlink()
            target.symlink_to(external)
            with self.assertRaisesRegex(ContractError, 'escapes repository'):
                resolve_record(self.ref, self.records, self.root)

    def test_missing_history_cannot_fall_back_to_current_revision(self):
        (self.root / self.path).unlink()
        with self.assertRaisesRegex(ContractError, 'historical reference requires'):
            resolve_record(self.ref, self.records, self.root)

    def assert_current_provenance_binding(self, ref):
        matching = {self.old['id']: self.old}
        self.assertEqual(resolve_record(ref, matching, self.root), self.old)
        different = {self.old['id']: {**self.old, 'summary': 'Different canonical content'}}
        with self.assertRaisesRegex(ContractError, 'differs from current canonical revision'):
            resolve_record(ref, different, self.root)
        event = {'schema_version': 1, 'event_id': 'alternate-proposal', 'change_id': 'example',
                 'timestamp': '2026-09-07T00:00:00Z', 'event_type': 'change-proposed',
                 'actor': {'kind': 'agent', 'name': 'test'}, 'summary': 'Alternate content',
                 'record_refs': [ref], 'payload': {'before_hash': None,
                 'after_hash': content_hash(self.old), 'hash_algorithm': 'sha256',
                 'canonicalization': CANONICAL}}
        with self.assertRaisesRegex(ContractError, 'differs from current canonical revision'):
            validate_event(event, different, {}, self.root, 'example')

    def test_explicit_snapshot_current_revision_matches_canonical_content(self):
        self.assert_current_provenance_binding(self.explicit)
        # Matching canonical content must not bypass validation of the explicit snapshot.
        (self.root / self.path).write_text(json.dumps({**self.old, 'summary': 'Tampered'}))
        with self.assertRaisesRegex(ContractError, 'hash mismatch'):
            resolve_record(self.explicit, {self.old['id']: self.old}, self.root)

    @unittest.skipUnless(shutil.which('git'), 'Git provenance requires the Git executable')
    def test_real_git_reference_remains_supported(self):
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=self.root,
                                           stderr=subprocess.PIPE, text=True).strip()
        git('init', '--quiet')
        (self.root / 'records.json').write_text(json.dumps([self.old]))
        git('add', 'records.json')
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
            'commit', '--quiet', '-m', 'test: historical evidence fixture')
        commit = git('rev-parse', 'HEAD')
        ref = {**self.ref, 'provenance_ref': f'git:{commit}:records.json'}
        self.assertEqual(resolve_record(ref, self.records, self.root), self.old)
        self.assert_current_provenance_binding(ref)
        with self.assertRaisesRegex(ContractError, 'traversal'):
            resolve_record({**ref, 'provenance_ref': f'git:{commit}:../records.json'}, self.records, self.root)


if __name__ == '__main__':
    unittest.main()
