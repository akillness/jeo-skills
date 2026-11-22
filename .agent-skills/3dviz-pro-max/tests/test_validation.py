"""Focused tests for authored data boundaries, not JSON or SHA-256 themselves."""
import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from catalog_validation import ContractError, load_catalog, parse_json, validate_recipe
from evidence_validation import content_hash, load_evidence, safe_path, validate_event
from validate import validate


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        shutil.copytree(ROOT / 'skills/3dviz-pro-max/data',
                        self.root / 'skills/3dviz-pro-max/data')
        # Blueprint records name a module under templates/ and captures under evidence/kits/;
        # a fixture repository that omits either is not a repository the validator can read.
        shutil.copytree(ROOT / 'skills/3dviz-pro-max/templates',
                        self.root / 'skills/3dviz-pro-max/templates')
        shutil.copytree(ROOT / 'evidence', self.root / 'evidence')
        self.copy_evidence_artifacts()
        self.recipes, self.sources, self.directions = load_catalog(self.root)
        self.path = self.root / 'evidence/dataset-changes/pilot-seed/events.jsonl'
        self.events = [json.loads(line) for line in self.path.read_text().splitlines()]

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

    def write_events(self):
        self.path.write_text(''.join(json.dumps(e) + '\n' for e in self.events))

    def test_legacy_artifact_path_prefers_original_then_uses_public_archive(self):
        relative = 'examples/early-slice/validation-report.md'
        original = self.root / relative
        archive = self.root / 'evidence/artifacts/legacy-early-slice/validation-report.md'
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_text('original witness')
        archive.parent.mkdir(parents=True, exist_ok=True)
        archive.write_text('archived witness')
        self.assertEqual(safe_path(relative, self.root), original.resolve())
        original.unlink()
        self.assertEqual(safe_path(relative, self.root), archive.resolve())

    def test_archive_fallback_is_narrow_and_still_requires_a_real_file(self):
        archive = self.root / 'evidence/artifacts/legacy-early-slice/validation-report.md'
        archive.parent.mkdir(parents=True, exist_ok=True)
        archive.write_text('archived witness')
        with self.assertRaisesRegex(ContractError, 'artifact does not exist'):
            safe_path('examples/some-other-retired-app/validation-report.md', self.root)

    def test_manifest_paths_and_negative_search_fields(self):
        path = self.root/'skills/3dviz-pro-max/data/manifest.json'
        original = json.loads(path.read_text())
        changed = copy.deepcopy(original)
        changed['collections']['recipes'] = 'missing/*.json'
        path.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ContractError, 'Missing'):
            validate(self.root)
        changed = copy.deepcopy(original)
        changed['search']['fields']['negative_signals'] = 100
        path.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ContractError, 'positive search fields'):
            validate(self.root)

    def test_manifest_rejects_bad_alias_table(self):
        path = self.root/'skills/3dviz-pro-max/data/manifest.json'
        original = json.loads(path.read_text())
        for aliases in ({'golden hour': 'dusk'}, {'Golden Hour': ['dusk']},
                        {'golden hour': []}, {'golden hour': ['golden hour']}):
            changed = copy.deepcopy(original)
            changed['search']['query_aliases'] = aliases
            path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ContractError, 'query_aliases'):
                validate(self.root)
        path.write_text(json.dumps(original))

    def test_actual_catalog(self):
        self.assertEqual(validate(self.root)[:2], (len(self.recipes), len(self.sources)))

    def test_optional_object_and_physical_contracts(self):
        record = copy.deepcopy(self.recipes['recipe.fantasy-village-diorama'])
        record['object_craft'] = [{'family': 'Owl', 'structure': 'Wings at shoulders',
                                  'material': 'Layered feathers'}]
        record['physical_contract'] = {'model': 'controlled-locomotion',
                                      'scope': 'Hover controller, no aerodynamics',
                                      'checks': ['Swept body does not cross roofs']}
        validate_recipe(record, self.sources, self.directions)
        record['physical_contract']['model'] = 'magic-certified'
        with self.assertRaisesRegex(ContractError, 'invalid physical model'):
            validate_recipe(record, self.sources, self.directions)
        record['physical_contract']['model'] = 'controlled-locomotion'
        del record['object_craft'][0]['material']
        with self.assertRaisesRegex(ContractError, 'material'):
            validate_recipe(record, self.sources, self.directions)

    def test_creative_needs_no_claims(self):
        record = copy.deepcopy(self.recipes['recipe.fantasy-village-diorama'])
        self.assertNotIn('claims', record)
        validate_recipe(record, self.sources, self.directions)

    def test_factual_requires_grounded_claims(self):
        record = copy.deepcopy(self.recipes['recipe.linear-transformation-3d'])
        record.pop('claims')
        with self.assertRaisesRegex(ContractError, 'requires claims'):
            validate_recipe(record, self.sources, self.directions)
        record = copy.deepcopy(self.recipes['recipe.linear-transformation-3d'])
        record['claims'][0]['source_refs'][0]['source_id'] = 'source.unknown'
        with self.assertRaisesRegex(ContractError, 'unknown source'):
            validate_recipe(record, self.sources, self.directions)

    def test_defaults_block_rules(self):
        record = copy.deepcopy(self.recipes['recipe.fantasy-village-diorama'])
        record['defaults'] = {'provenance': 'authored', 'tunable': True,
                              'values': {'fog_density': 0.02}, 'rationale': 'Tuned for ACES.'}
        validate_recipe(record, self.sources, self.directions)
        record['defaults']['provenance'] = 'source-backed'
        with self.assertRaisesRegex(ContractError, 'claim_ids'):
            validate_recipe(record, self.sources, self.directions)
        grounded = copy.deepcopy(self.recipes['recipe.linear-transformation-3d'])
        grounded['defaults'] = {'provenance': 'source-backed', 'tunable': False,
                                'values': {'basis_columns': 3}, 'rationale': 'Restates the source.',
                                'claim_ids': ['claim.linear-basis-columns']}
        validate_recipe(grounded, self.sources, self.directions)
        grounded['defaults']['claim_ids'] = ['claim.nope']
        with self.assertRaisesRegex(ContractError, 'must name claims'):
            validate_recipe(grounded, self.sources, self.directions)
        record['defaults'] = {'provenance': 'authored', 'tunable': True,
                              'values': {}, 'rationale': 'Empty.'}
        with self.assertRaisesRegex(ContractError, 'defaults.values'):
            validate_recipe(record, self.sources, self.directions)
        record['defaults'] = {'provenance': 'authored', 'tunable': 'yes',
                              'values': {'fov': 50}, 'rationale': 'Not a boolean.'}
        with self.assertRaisesRegex(ContractError, 'defaults.tunable'):
            validate_recipe(record, self.sources, self.directions)

    def test_unrecorded_content_change_breaks_hash(self):
        self.recipes['recipe.fantasy-village-diorama']['summary'] = 'Changed without evidence.'
        with self.assertRaisesRegex(ContractError, 'content mismatch'):
            load_evidence(self.root, self.recipes, self.sources)

    def test_missing_event_record_ref_is_rejected(self):
        self.events[0]['record_refs'] = []
        self.write_events()
        with self.assertRaisesRegex(ContractError, 'must not be empty'):
            load_evidence(self.root, self.recipes, self.sources)

    def test_curation_requires_hash_evidence(self):
        self.events = [e for e in self.events if e['event_type'] != 'change-proposed']
        self.write_events()
        with self.assertRaisesRegex(ContractError, 'missing change-proposed'):
            load_evidence(self.root, self.recipes, self.sources)

    def test_source_read_must_reference_claims_it_supports(self):
        self.events[0]['payload']['supported_claim_ids'] = ['claim.cube-face-notation']
        with self.assertRaisesRegex(ContractError, 'unreferenced claim'):
            validate_event(self.events[0], self.recipes, self.sources, self.root, 'pilot-seed')

    def test_duplicate_event_ids(self):
        self.events.append(copy.deepcopy(self.events[0]))
        self.write_events()
        with self.assertRaisesRegex(ContractError, 'duplicate event_id'):
            load_evidence(self.root, self.recipes, self.sources)

    def test_every_jsonl_line_is_checked(self):
        with self.path.open('a') as stream:
            stream.write('\n')
        with self.assertRaises(ContractError):
            load_evidence(self.root, self.recipes, self.sources)

    def test_artifact_traversal_rejected(self):
        event = next(e for e in self.events if e['event_type'] == 'check-run')
        event['payload']['artifact_ref'] = '../outside.json'
        with self.assertRaisesRegex(ContractError, 'traversal'):
            validate_event(event, self.recipes, self.sources, self.root, 'pilot-seed')

    def test_pass_requires_observer(self):
        event = next(e for e in self.events if e['event_type'] == 'check-run')
        event['payload'].pop('observed_by')
        with self.assertRaisesRegex(ContractError, 'observed_by'):
            validate_event(event, self.recipes, self.sources, self.root, 'pilot-seed')

    def test_stale_revision_cannot_use_current_record(self):
        self.events[0]['record_refs'][0]['revision'] = 2
        with self.assertRaisesRegex(ContractError, 'historical reference requires'):
            validate_event(self.events[0], self.recipes, self.sources, self.root, 'pilot-seed')

    def test_non_utc_timestamp_rejected(self):
        self.events[0]['timestamp'] = '2026-09-07T12:00:00+07:00'
        with self.assertRaisesRegex(ContractError, 'UTC'):
            validate_event(self.events[0], self.recipes, self.sources, self.root, 'pilot-seed')

    def test_new_record_cannot_claim_previous_hash(self):
        event = next(e for e in self.events if e['event_type'] == 'change-proposed')
        event['payload']['before_hash'] = '0' * 64
        with self.assertRaisesRegex(ContractError, 'before_hash must be null'):
            validate_event(event, self.recipes, self.sources, self.root, 'pilot-seed')

    def test_nonfinite_authored_coordinates_rejected(self):
        with self.assertRaisesRegex(ContractError, 'non-finite'):
            parse_json('{"coordinate":1e999}', 'test-input')

    def write_correction(self, target, change_id='scene-retirement'):
        """Append a correction event for `target` in its own change directory."""
        correction = {'schema_version': 1,
                      'event_id': f"{change_id}.{target['event_id']}.retired",
                      'change_id': change_id, 'timestamp': '2026-09-08T00:00:00Z',
                      'event_type': 'correction',
                      'actor': {'kind': 'human', 'name': 'maintainer'},
                      'record_refs': target['record_refs'],
                      'summary': 'Retire an observation whose artifact was intentionally deleted.',
                      'payload': {'target_event_id': target['event_id'],
                                  'reason': 'Artifact deleted on purpose; observation kept as history.'}}
        directory = self.root / 'evidence/dataset-changes' / change_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'events.jsonl').write_text(json.dumps(correction) + '\n')

    def test_retired_check_run_tolerates_missing_artifact(self):
        baseline = len(load_evidence(self.root, self.recipes, self.sources))
        check = next(e for e in self.events if e['event_type'] == 'check-run')
        check['payload']['artifact_ref'] = 'examples/retired/gone.js'
        self.write_events()
        with self.assertRaisesRegex(ContractError, 'artifact does not exist'):
            load_evidence(self.root, self.recipes, self.sources)
        self.write_correction(check)
        events = load_evidence(self.root, self.recipes, self.sources)
        self.assertEqual(len(events), baseline + 1)
        self.assertIn(f"scene-retirement.{check['event_id']}.retired",
                      [event['event_id'] for event in events])

        # A correction cannot relax a record-curated event: only check-runs are retirable.
        curated = next(e for e in self.events if e['event_type'] == 'record-curated')
        curated['payload']['runtime_status'] = 'passed'
        curated['payload']['artifact_ref'] = 'examples/retired/gone.js'
        self.write_events()
        self.write_correction(curated, change_id='curation-retirement')
        with self.assertRaisesRegex(ContractError, 'artifact does not exist'):
            load_evidence(self.root, self.recipes, self.sources)

    def test_unknown_direction_rejected(self):
        record = copy.deepcopy(next(iter(self.recipes.values())))
        record['direction_ids'] = ['unknown-direction']
        with self.assertRaisesRegex(ContractError, 'unknown direction'):
            validate_recipe(record, self.sources, self.directions)


if __name__ == '__main__':
    unittest.main()
