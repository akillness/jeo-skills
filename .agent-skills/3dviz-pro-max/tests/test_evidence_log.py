"""Behavior of the shared evidence helper: it appends valid evidence or nothing at all."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from catalog_validation import load_catalog
from evidence_validation import content_hash, load_evidence

HELPER = ROOT / 'scripts/evidence-log.py'
RECORD = 'recipe.fantasy-village-diorama'
CHANGE = 'defaults-helper-check'


class EvidenceLogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        shutil.copytree(ROOT / 'skills/3dviz-pro-max/data',
                        self.root / 'skills/3dviz-pro-max/data')
        # Blueprint records name a module under templates/, so the fixture repository needs it.
        shutil.copytree(ROOT / 'skills/3dviz-pro-max/templates',
                        self.root / 'skills/3dviz-pro-max/templates')
        shutil.copytree(ROOT / 'evidence', self.root / 'evidence')
        self.copy_evidence_artifacts()
        self.events = self.root / 'evidence/dataset-changes' / CHANGE / 'events.jsonl'

    def copy_evidence_artifacts(self):
        for events in sorted((self.root / 'evidence/dataset-changes').glob('*/events.jsonl')):
            for line in events.read_text(encoding='utf-8').splitlines():
                payload = json.loads(line).get('payload') or {}
                for key in ('artifact_ref', 'output_ref'):
                    relative = payload.get(key)
                    source = ROOT / relative if isinstance(relative, str) else None
                    if source is not None and source.is_file():
                        target = self.root / relative
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, target)

    def run_helper(self, *arguments):
        return subprocess.run([sys.executable, str(HELPER), *arguments, '--root', str(self.root)],
                              capture_output=True, text=True, cwd=ROOT)

    def catalog(self):
        return load_catalog(self.root, collection='all')

    def evidence_count(self):
        records, sources, _ = self.catalog()
        return len(load_evidence(self.root, records, sources))

    def record_file(self, record_id):
        for path in sorted((self.root / 'skills/3dviz-pro-max/data/recipes').glob('*.json')):
            rows = json.loads(path.read_text(encoding='utf-8'))
            rows = [rows] if isinstance(rows, dict) else rows
            if any(row['id'] == record_id for row in rows):
                return path, rows
        raise AssertionError(f'{record_id} not found')

    def revise(self, record_id):
        """Edit the record the way a contributor would, then bump its revision."""
        path, rows = self.record_file(record_id)
        for row in rows:
            if row['id'] == record_id:
                row['summary'] = row['summary'] + ' Revised for the helper test.'
                row['revision'] += 1
        path.write_text(json.dumps(rows[0], indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    def test_snapshot_then_propose_appends_valid_evidence(self):
        baseline = self.evidence_count()
        records, _, _ = self.catalog()
        digest = content_hash(records[RECORD])
        snapshot = self.run_helper('snapshot', '--change-id', CHANGE, '--record', RECORD)
        self.assertEqual(snapshot.returncode, 0, snapshot.stderr)
        self.assertIn(digest, snapshot.stdout)
        expected = (self.root / 'evidence/dataset-changes' / CHANGE / 'snapshots/recipes'
                    / RECORD / '1' / f'{digest}.json')
        self.assertTrue(expected.is_file())
        repeated = self.run_helper('snapshot', '--change-id', CHANGE, '--record', RECORD)
        self.assertEqual(repeated.stdout, snapshot.stdout)

        self.revise(RECORD)
        propose = self.run_helper('propose', '--change-id', CHANGE, '--record', RECORD,
                                  '--actor', 'tester', '--summary', 'Revise the authored summary.',
                                  '--rationale', 'Authored wording change with no new claim.')
        self.assertEqual(propose.returncode, 0, propose.stderr)
        self.assertIn(f'OK {CHANGE}.{RECORD}.revision-2.proposed', propose.stdout)
        self.assertIn(f'OK {CHANGE}.{RECORD}.revision-2.curated', propose.stdout)
        self.assertEqual(self.evidence_count(), baseline + 2)

        again = self.run_helper('propose', '--change-id', CHANGE, '--record', RECORD,
                                '--actor', 'tester', '--summary', 'Duplicate attempt.',
                                '--rationale', 'Should not append twice.')
        self.assertEqual(again.returncode, 1)
        self.assertIn('duplicate event_id', again.stderr)
        self.assertEqual(len(self.events.read_text().splitlines()), 2)

    def test_propose_without_snapshot_names_the_snapshot_step(self):
        self.revise(RECORD)
        result = self.run_helper('propose', '--change-id', CHANGE, '--record', RECORD,
                                 '--actor', 'tester', '--summary', 'Revise without preserving.',
                                 '--rationale', 'Missing history.')
        self.assertEqual(result.returncode, 1)
        self.assertIn('snapshot', result.stderr)
        self.assertFalse(self.events.exists())

    def test_rejected_source_read_leaves_the_log_unchanged(self):
        records, _, _ = self.catalog()
        claim = records['recipe.linear-transformation-3d']['claims'][0]
        reference = claim['source_refs'][0]
        existing = self.root / 'evidence/dataset-changes/pilot-seed/events.jsonl'
        before = existing.read_bytes()
        result = self.run_helper('source-read', '--change-id', 'pilot-seed',
                                 '--record', 'recipe.linear-transformation-3d',
                                 '--actor', 'tester', '--source', reference['source_id'],
                                 '--locator', reference['locator'],
                                 '--source-version', 'accessed copy',
                                 '--accessed-at', '2026-09-08', '--claim', 'claim.nope')
        self.assertEqual(result.returncode, 1)
        self.assertIn('unreferenced claim', result.stderr)
        self.assertEqual(existing.read_bytes(), before)

    def test_claim_checked_copies_the_linked_source_references(self):
        records, _, _ = self.catalog()
        claim = records['recipe.linear-transformation-3d']['claims'][0]
        result = self.run_helper('claim-checked', '--change-id', CHANGE,
                                 '--record', 'recipe.linear-transformation-3d',
                                 '--actor', 'tester', '--claim', claim['id'],
                                 '--status', 'uncertain',
                                 '--assumption', 'Column convention as authored.',
                                 '--uncertainty', 'Only the cited passage was read.')
        self.assertEqual(result.returncode, 0, result.stderr)
        event = json.loads(self.events.read_text().splitlines()[0])
        self.assertEqual(event['event_type'], 'claim-checked')
        self.assertEqual(event['payload']['source_refs'], claim['source_refs'])
        self.assertEqual(event['event_id'], f'{CHANGE}.recipe.linear-transformation-3d.'
                                            f'{claim["id"]}.checked')


if __name__ == '__main__':
    unittest.main()
